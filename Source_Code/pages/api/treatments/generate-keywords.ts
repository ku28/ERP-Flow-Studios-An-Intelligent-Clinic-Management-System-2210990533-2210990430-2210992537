import type { NextApiRequest, NextApiResponse } from 'next'
import { requireDoctorOrAdmin } from '../../../lib/auth'

type KeywordRequestBody = {
    diagnosis?: string
    speciality?: string
    imbalance?: string
    systems?: string
    organ?: string
    diseaseAction?: string
    pulseDiagnosis?: string
    treatmentPlan?: string
    notes?: string
    medicineNames?: string[]
    includeCommonComplaints?: boolean
}

function cleanGeminiText(raw: string): string {
    return String(raw || '')
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/g, '')
        .trim()
}

function getCommonComplaintKeywords(payload: KeywordRequestBody): Array<{ word: string; weight: number }> {
    const diagnosisText = [
        payload.diagnosis,
        payload.speciality,
        payload.imbalance,
        payload.systems,
        payload.organ,
        payload.diseaseAction,
    ].join(' ').toLowerCase()

    const base: Array<{ word: string; weight: number }> = [
        { word: 'pain', weight: 3 },
        { word: 'burning sensation', weight: 3 },
        { word: 'inflammation', weight: 3 },
        { word: 'fatigue', weight: 2 },
        { word: 'weakness', weight: 2 },
        { word: 'loss of appetite', weight: 2 },
        { word: 'indigestion', weight: 2 },
        { word: 'bloating', weight: 2 },
    ]

    if (/liver|hepatic|gall|biliary|stomach|gastric|digest/i.test(diagnosisText)) {
        base.push(
            { word: 'acidity', weight: 3 },
            { word: 'nausea', weight: 3 },
            { word: 'flatulence', weight: 2 },
            { word: 'constipation', weight: 2 }
        )
    }

    if (/resp|lung|bronch|asthma|allerg/i.test(diagnosisText)) {
        base.push(
            { word: 'cough', weight: 3 },
            { word: 'breathlessness', weight: 3 },
            { word: 'chest congestion', weight: 3 },
            { word: 'wheezing', weight: 2 }
        )
    }

    if (/urine|renal|kidney|uro|bladder/i.test(diagnosisText)) {
        base.push(
            { word: 'burning urination', weight: 3 },
            { word: 'frequency of urination', weight: 2 },
            { word: 'lower abdominal pain', weight: 2 }
        )
    }

    if (/joint|arthritis|rheumat|bone|musculo|spondyl/i.test(diagnosisText)) {
        base.push(
            { word: 'joint stiffness', weight: 3 },
            { word: 'morning stiffness', weight: 2 },
            { word: 'swelling', weight: 3 },
            { word: 'limited mobility', weight: 2 }
        )
    }

    if (/skin|eczema|psoriasis|dermat/i.test(diagnosisText)) {
        base.push(
            { word: 'itching', weight: 3 },
            { word: 'skin rash', weight: 3 },
            { word: 'dry skin', weight: 2 },
            { word: 'redness', weight: 2 }
        )
    }

    return base
}

function normalizeWeightedKeywordList(raw: string, payload: KeywordRequestBody): string {
    const desiredCount = 14
    const minCount = 10
    const maxCount = 18

    const tokens = String(raw || '')
        .split(/[\n,;]+/)
        .map((t) => t.replace(/^[\-\d.\s]+/, '').trim())
        .filter(Boolean)

    const map = new Map<string, number>()
    for (const token of tokens) {
        const parts = token.split(':')
        const rawWord = String(parts[0] || '').trim().toLowerCase()
        if (!rawWord || rawWord.length < 2) continue
        const rawWeight = Number(parts[1] || 1)
        const safeWeight = Number.isFinite(rawWeight) ? Math.max(1, Math.min(5, Math.round(rawWeight))) : 1
        const prev = map.get(rawWord) || 0
        map.set(rawWord, Math.max(prev, safeWeight))
        if (map.size >= 30) break
    }

    if (payload.includeCommonComplaints !== false) {
        for (const common of getCommonComplaintKeywords(payload)) {
            const word = common.word.toLowerCase().trim()
            if (!word) continue
            const prev = map.get(word) || 0
            map.set(word, Math.max(prev, common.weight))
        }
    }

    let entries = Array.from(map.entries())
        .map(([word, weight]) => ({ word, weight }))
        .sort((a, b) => b.weight - a.weight || a.word.localeCompare(b.word))

    // If model returned very few entries, fill with low-weight fallback tokens from raw text.
    if (entries.length < minCount) {
        const fallbackWords = String(raw || '')
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .map((w) => w.trim())
            .filter((w) => w.length >= 3)

        for (const word of fallbackWords) {
            if (map.has(word)) continue
            map.set(word, 1)
            if (map.size >= minCount) break
        }

        entries = Array.from(map.entries())
            .map(([word, weight]) => ({ word, weight }))
            .sort((a, b) => b.weight - a.weight || a.word.localeCompare(b.word))
    }

    const targetCount = Math.max(minCount, Math.min(maxCount, Math.min(desiredCount, entries.length)))
    return entries.slice(0, targetCount).map((e) => `${e.word}:${e.weight}`).join(', ')
}

function buildPrompt(payload: KeywordRequestBody): string {
    const medicineNames = Array.isArray(payload.medicineNames)
        ? payload.medicineNames.filter(Boolean).join(', ')
        : ''

    return `You are an expert Electrohomeopathy physician assistant.
Generate highly relevant COMMA-SEPARATED keywords for treatment planning and symptom mapping.

Return format rules:
1) Return only one plain text line.
2) Output must be comma-separated keyword:weight pairs.
3) No numbering, no bullets, no markdown, no explanation.
4) Focus specifically on Electrohomeopathy context (constitutional imbalance, organ/system focus, drainage/supportive approach, symptom clusters).
5) Include practical clinical terms useful for deterministic keyword matching.
6) Use integer weights from 1 to 5 where 5 = highest relevance.
7) Generate a moderate average list size: around 12 to 16 keyword pairs.
8) Include some common patient complaint keywords relevant to this diagnosis context.

Output example:
hepatic congestion:5, portal stasis:4, liver detox support:4, bilious headache:3

Diagnosis context:
- Provisional Diagnosis: ${String(payload.diagnosis || '').trim() || 'N/A'}
- Speciality: ${String(payload.speciality || '').trim() || 'N/A'}
- Imbalance: ${String(payload.imbalance || '').trim() || 'N/A'}
- Systems: ${String(payload.systems || '').trim() || 'N/A'}
- Organ: ${String(payload.organ || '').trim() || 'N/A'}
- Disease Action: ${String(payload.diseaseAction || '').trim() || 'N/A'}
- Pulse Diagnosis: ${String(payload.pulseDiagnosis || '').trim() || 'N/A'}
- Treatment Plan: ${String(payload.treatmentPlan || '').trim() || 'N/A'}
- Existing Additional Notes: ${String(payload.notes || '').trim() || 'N/A'}
- Selected Medicines: ${medicineNames || 'N/A'}

Now generate concise, high-signal Electrohomeopathy keywords.`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const user = await requireDoctorOrAdmin(req, res)
    if (!user) return

    try {
        const body = (req.body || {}) as KeywordRequestBody
        const diagnosis = String(body.diagnosis || '').trim()

        if (!diagnosis) {
            return res.status(400).json({ error: 'Diagnosis is required' })
        }

        const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
        if (!geminiKey) {
            return res.status(400).json({ error: 'Gemini API key not configured' })
        }

        const model = 'gemini-2.5-flash'
        const prompt = buildPrompt(body)

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(geminiKey)}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.3,
                        maxOutputTokens: 220,
                    },
                }),
                signal: AbortSignal.timeout(20000),
            }
        )

        if (!response.ok) {
            const errorText = await response.text().catch(() => '')
            return res.status(502).json({
                error: `Gemini request failed: ${response.status} ${response.statusText}`,
                details: errorText.slice(0, 300),
            })
        }

        const data: any = await response.json()
        const rawText = cleanGeminiText(
            (data?.candidates || [])
                .flatMap((c: any) => c?.content?.parts || [])
                .map((p: any) => String(p?.text || ''))
                .join(' ')
        )

        const keywords = normalizeWeightedKeywordList(rawText, body)
        if (!keywords) {
            return res.status(502).json({ error: 'Gemini returned empty keywords' })
        }

        return res.status(200).json({
            keywords,
            model,
        })
    } catch (error: any) {
        return res.status(500).json({ error: String(error?.message || error) })
    }
}
