export interface ParsedClinicalSpeech {
    rawText: string
    symptoms: string[]
    medicines: string[]
    dosage: string[]
}

const SYMPTOM_HINTS = [
    'fever',
    'cough',
    'cold',
    'pain',
    'headache',
    'nausea',
    'vomiting',
    'dizziness',
    'fatigue',
    'sore throat',
]

const DOSAGE_HINTS = ['mg', 'ml', 'tablet', 'tab', 'capsule', 'cap', 'drop', 'times', 'daily', 'od']

function sentenceList(text: string): string[] {
    return text
        .split(/[.!?\n]/)
        .map((part) => part.trim())
        .filter(Boolean)
}

export function parseClinicalSpeech(text: string): ParsedClinicalSpeech {
    const normalized = String(text || '').trim()
    if (!normalized) {
        return {
            rawText: '',
            symptoms: [],
            medicines: [],
            dosage: [],
        }
    }

    const lines = sentenceList(normalized)
    const lowerText = normalized.toLowerCase()

    const symptoms = SYMPTOM_HINTS.filter((hint) => lowerText.includes(hint))

    const medicines = lines
        .filter((line) => /\b(tab|tablet|capsule|cap|syrup|injection|ointment|drops?)\b/i.test(line))
        .map((line) => line.replace(/\s+/g, ' ').trim())

    const dosage = lines
        .filter((line) => DOSAGE_HINTS.some((hint) => line.toLowerCase().includes(hint)))
        .map((line) => line.replace(/\s+/g, ' ').trim())

    return {
        rawText: normalized,
        symptoms,
        medicines,
        dosage,
    }
}
