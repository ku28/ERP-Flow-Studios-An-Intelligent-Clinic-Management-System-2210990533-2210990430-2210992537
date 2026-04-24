/**
 * POST /api/aadhaar-ocr
 * Server-side Aadhaar card OCR using Google Vision API + Gemini for structured extraction.
 * Available to plans that allow Aadhaar scanning (including AI OCR variants and Pro).
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../lib/auth'
import { isFeatureAllowed } from '../../lib/subscription'

interface ExtractedData {
    fullName?: string
    fatherHusbandGuardianName?: string
    dob?: string
    age?: number
    gender?: string
    address?: string
}

// Google Vision API for image OCR
async function extractTextVision(base64Image: string, apiKey: string): Promise<string> {
    const trimmed = apiKey.trim()
    if (trimmed.startsWith('{')) {
        // Service account JSON
        let sa: any
        try { sa = JSON.parse(trimmed) } catch { throw new Error('Invalid service-account JSON') }
        const vision = require('@google-cloud/vision')
        const client = new vision.ImageAnnotatorClient({
            credentials: { client_email: sa.client_email, private_key: sa.private_key },
            projectId: sa.project_id,
        })
        const imageBuffer = Buffer.from(base64Image, 'base64')
        const [result] = await client.documentTextDetection({ image: { content: imageBuffer } })
        return (result as any).fullTextAnnotation?.text || ''
    }
    // REST API key
    const resp = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(trimmed)}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requests: [{
                    image: { content: base64Image },
                    features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
                    imageContext: { languageHints: ['en', 'hi'] }
                }]
            })
        }
    )
    if (!resp.ok) {
        const e: any = await resp.json().catch(() => ({}))
        throw new Error(`Vision API error: ${e.error?.message || resp.statusText}`)
    }
    const data: any = await resp.json()
    if (data.responses?.[0]?.error) throw new Error(`Vision error: ${data.responses[0].error.message}`)
    return data.responses?.[0]?.fullTextAnnotation?.text || ''
}

const AADHAAR_MODEL = 'gemini-1.5-flash'
const AADHAAR_MAX_OUTPUT_TOKENS = 200
const AADHAAR_MAX_INPUT_CHARS = 2000

/** Remove noise lines and deduplicate before sending Aadhaar OCR text to Gemini */
function preprocessAadhaarText(raw: string): string {
    const noisePatterns = [
        /^(government of india|unique identification|aadhaar|help.*1947|uidai|enrolment)/i,
        /^[\-=*_\s]+$/,
    ]
    const seen = new Set<string>()
    const lines = raw
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => {
            if (!l) return false
            const lower = l.toLowerCase()
            if (noisePatterns.some(p => p.test(lower))) return false
            if (seen.has(lower)) return false
            seen.add(lower)
            return true
        })
    const joined = lines.join('\n')
    return joined.length > AADHAAR_MAX_INPUT_CHARS ? joined.slice(0, AADHAAR_MAX_INPUT_CHARS) : joined
}

// Gemini to parse structured fields from OCR text
async function parseWithGemini(ocrText: string, side: 'front' | 'back', geminiKey: string): Promise<ExtractedData> {
    const cleanedText = preprocessAadhaarText(ocrText)

    const prompt = side === 'front'
        ? `Extract Aadhaar front data. Return ONLY valid JSON, no markdown.

OCR:
${cleanedText}

Return: {"fullName":"string or null","dob":"YYYY-MM-DD or null","age":number or null,"gender":"Male"/"Female"/"Transgender"/null}
Rules: fullName=actual person name only (not Government/India/UIDAI); dob=YYYY-MM-DD; gender=exact string.`
        : `Extract Aadhaar back data. Return ONLY valid JSON, no markdown.

OCR:
${cleanedText}

Return: {"fatherHusbandGuardianName":"string or null","address":"string or null"}
Rules: guardian=name after S/O,D/O,C/O,W/O; address=complete address in UPPERCASE without Aadhaar number.`

    const t0 = Date.now()
    const genResp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${AADHAAR_MODEL}:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { maxOutputTokens: AADHAAR_MAX_OUTPUT_TOKENS },
            }),
            signal: AbortSignal.timeout(15000),
        }
    )
    if (!genResp.ok) throw new Error(`Gemini error: ${genResp.status} ${genResp.statusText}`)
    const genData: any = await genResp.json()

    const usage = genData.usageMetadata
    if (usage) {
        console.log(`[aadhaar-ocr] model=${AADHAAR_MODEL} side=${side} promptTokens=${usage.promptTokenCount} outputTokens=${usage.candidatesTokenCount} time=${Date.now()-t0}ms`)
    }

    let rawText: string = genData.candidates?.[0]?.content?.parts?.[0]?.text || '{}'
    rawText = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim()

    try {
        const parsed = JSON.parse(rawText)
        const result: ExtractedData = {}
        if (side === 'front') {
            if (parsed.fullName) result.fullName = String(parsed.fullName).toUpperCase()
            if (parsed.dob) result.dob = String(parsed.dob)
            if (parsed.gender) result.gender = String(parsed.gender)
            if (parsed.age != null) result.age = Number(parsed.age)
            else if (parsed.dob) {
                const birthDate = new Date(parsed.dob)
                const today = new Date()
                let age = today.getFullYear() - birthDate.getFullYear()
                const m = today.getMonth() - birthDate.getMonth()
                if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--
                if (age > 0 && age < 150) result.age = age
            }
        } else {
            if (parsed.fatherHusbandGuardianName) result.fatherHusbandGuardianName = String(parsed.fatherHusbandGuardianName).toUpperCase()
            if (parsed.address) result.address = String(parsed.address).toUpperCase().replace(/\d{4}\s*\d{4}\s*\d{4}/g, 'XXXX XXXX XXXX')
        }
        return result
    } catch {
        return {}
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    try {
        const user = await getSessionUser(req)
        if (!user) return res.status(401).json({ error: 'Unauthorized' })

        if (!isFeatureAllowed((user as any).clinic?.subscriptionPlan, 'aadhaar_scanning')) {
            return res.status(403).json({
                error: 'Aadhaar scanning is available in Standard plan.',
                code: 'FEATURE_RESTRICTED',
                upgradeUrl: '/upgrade',
            })
        }

        const { imageData, side } = req.body
        if (!imageData || !side) return res.status(400).json({ error: 'imageData and side are required' })
        if (side !== 'front' && side !== 'back') return res.status(400).json({ error: 'side must be front or back' })

        // Extract base64 data (strip data URL prefix if present)
        const base64 = imageData.includes(',') ? imageData.split(',')[1] : imageData

        // Get API keys
        const googleVisionKey: string = (user as any).clinic?.apiGoogleVisionKey || process.env.GOOGLE_API_KEY || ''
        const geminiKey: string = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''

        if (!googleVisionKey) return res.status(400).json({ error: 'Google Vision API key not configured for this clinic' })
        if (!geminiKey) return res.status(400).json({ error: 'Gemini API key not configured' })

        // Step 1: Extract raw text from image using Google Vision
        const rawText = await extractTextVision(base64, googleVisionKey)
        if (!rawText.trim()) return res.status(200).json({ data: {}, rawText: '' })

        // Step 2: Parse structured fields using Gemini
        const extractedData = await parseWithGemini(rawText, side, geminiKey)

        return res.status(200).json({ data: extractedData, rawText })

    } catch (error: any) {
        console.error('[aadhaar-ocr]', error)
        return res.status(500).json({ error: error.message || 'OCR processing failed' })
    }
}
