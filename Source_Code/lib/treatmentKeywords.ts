export type TreatmentKeyword = {
  word: string
  weight: number
}

function normalizeText(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, ' ')
}

function toSafeWeight(raw: string | number | null | undefined): number {
  const n = Number(raw)
  if (!Number.isFinite(n)) return 1
  if (n <= 0) return 1
  return Math.round(n)
}

export function parseTreatmentKeywordsFromNotes(notes: string | null | undefined): TreatmentKeyword[] {
  if (!notes || typeof notes !== 'string') return []

  const map = new Map<string, number>()
  const chunks = notes.split(',')

  for (const chunk of chunks) {
    const piece = chunk.trim()
    if (!piece) continue

    const colonIndex = piece.lastIndexOf(':')
    let rawWord = piece
    let rawWeight: string | number = 1

    if (colonIndex > -1) {
      rawWord = piece.slice(0, colonIndex)
      rawWeight = piece.slice(colonIndex + 1)
    }

    const word = normalizeText(rawWord)
    if (!word) continue

    const weight = toSafeWeight(rawWeight)
    map.set(word, (map.get(word) || 0) + weight)
  }

  return Array.from(map.entries())
    .map(([word, weight]) => ({ word, weight }))
    .sort((a, b) => b.weight - a.weight || a.word.localeCompare(b.word))
}

export function normalizeTreatmentKeywords(input: unknown): TreatmentKeyword[] {
  if (!Array.isArray(input)) return []

  const map = new Map<string, number>()

  for (const item of input) {
    if (!item || typeof item !== 'object') continue
    const rawWord = (item as any).word
    if (typeof rawWord !== 'string') continue
    const word = normalizeText(rawWord)
    if (!word) continue
    const weight = toSafeWeight((item as any).weight)
    map.set(word, (map.get(word) || 0) + weight)
  }

  return Array.from(map.entries())
    .map(([word, weight]) => ({ word, weight }))
    .sort((a, b) => b.weight - a.weight || a.word.localeCompare(b.word))
}

export function parseComplaintTags(input: string): string[] {
  if (!input) return []
  const seen = new Set<string>()

  for (const chunk of input.split(',')) {
    const normalized = normalizeText(chunk)
    if (normalized) seen.add(normalized)
  }

  return Array.from(seen)
}

function tokenSet(text: string): Set<string> {
  return new Set(normalizeText(text).split(/\s+/).filter(Boolean))
}

export function scoreKeywordAgainstComplaint(keyword: string, complaint: string, weight: number): number {
  const k = normalizeText(keyword)
  const c = normalizeText(complaint)
  if (!k || !c) return 0

  if (k === c) return weight * 3
  if (k.includes(c) || c.includes(k)) return weight * 2

  const keywordTokens = tokenSet(k)
  const complaintTokens = tokenSet(c)
  let overlap = 0
  keywordTokens.forEach((t) => {
    if (complaintTokens.has(t)) overlap += 1
  })

  if (overlap > 0) return weight
  return 0
}

export function scoreTreatmentFromComplaints(
  complaints: string[],
  keywordsInput: unknown,
  notesFallback?: string | null
): number {
  const normalizedComplaints = complaints.map(normalizeText).filter(Boolean)
  if (normalizedComplaints.length === 0) return 0

  const keywords = normalizeTreatmentKeywords(keywordsInput)
  const sourceKeywords = keywords.length > 0 ? keywords : parseTreatmentKeywordsFromNotes(notesFallback || '')
  if (sourceKeywords.length === 0) return 0

  let score = 0
  for (const keyword of sourceKeywords) {
    for (const complaint of normalizedComplaints) {
      score += scoreKeywordAgainstComplaint(keyword.word, complaint, keyword.weight)
    }
  }

  return score
}
