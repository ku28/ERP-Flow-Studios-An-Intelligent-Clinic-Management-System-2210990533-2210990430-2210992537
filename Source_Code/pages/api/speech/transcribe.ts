import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../../lib/auth'
import { normalizeSubscriptionPlan } from '../../../lib/subscription'

type SpeechTranscribeRequestBody = {
    audioBase64?: string
    mimeType?: string
}

type SpeechTranscribeResponse = {
    text?: string
    error?: string
}

function extractGeminiText(payload: any): string {
    const parts = payload?.candidates?.[0]?.content?.parts
    if (!Array.isArray(parts)) return ''
    const joined = parts
        .map((part: any) => String(part?.text || ''))
        .join(' ')
        .trim()

    return joined
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim()
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<SpeechTranscribeResponse>) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const user = await getSessionUser(req)
    if (!user) {
        return res.status(401).json({ error: 'Not authenticated' })
    }

    const plan = normalizeSubscriptionPlan(user?.clinic?.subscriptionPlan)
    if (plan !== 'pro') {
        return res.status(403).json({
            error: 'AI transcription is available only on Pro plan. Use native/browser speech input for this plan.'
        })
    }

    const body = (req.body || {}) as SpeechTranscribeRequestBody
    const audioBase64 = String(body.audioBase64 || '').trim()
    const mimeType = String(body.mimeType || 'audio/webm').trim()

    if (!audioBase64) {
        return res.status(400).json({ error: 'Audio payload is required' })
    }

    const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
    if (!geminiKey) {
        return res.status(400).json({ error: 'Gemini API key not configured' })
    }

    try {
        const model = 'gemini-2.5-flash'
        const prompt = [
            'Transcribe this audio accurately.',
            'Return plain text only.',
            'Do not include markdown, explanations, or timestamps.'
        ].join(' ')

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [
                        {
                            parts: [
                                { text: prompt },
                                {
                                    inlineData: {
                                        mimeType,
                                        data: audioBase64,
                                    },
                                },
                            ],
                        },
                    ],
                    generationConfig: {
                        maxOutputTokens: 512,
                        temperature: 0,
                    },
                }),
                signal: AbortSignal.timeout(30000),
            }
        )

        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
            const message = payload?.error?.message || `Gemini request failed: ${response.status} ${response.statusText}`
            return res.status(502).json({ error: message })
        }

        const text = extractGeminiText(payload)
        if (!text) {
            return res.status(502).json({ error: 'No transcription returned by Gemini' })
        }

        return res.status(200).json({ text })
    } catch (error: any) {
        const message = error?.message || 'Transcription failed'
        return res.status(500).json({ error: message })
    }
}
