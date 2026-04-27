import { GoogleGenAI, Type } from "@google/genai"

/**
 * billParserAI.ts
 * AI-powered bill parser using Google Gemini.
 * Uses non-Pro Gemini Flash models only, preprocesses OCR text to reduce tokens,
 * caches results in-process, and logs token usage + response time.
 */

export interface AIParsedItem {
    productName: string | null
    quantity: number | null
    unitPrice: number | null
    bottleQuantity: number | null
    unitsPerBottle: number | null
    productId?: string | null
    matched?: boolean
    matchedProductName?: string | null
    matchScore?: number
    requiresUserAction?: boolean
    usedMapping?: boolean
}

export interface AIBillParseResult {
    items: AIParsedItem[]
    aiParsed: true
    model: string
    cached?: boolean
}

const MODEL_CANDIDATES = [
    "gemini-2.5-flash",
]
const MAX_OUTPUT_TOKENS = 8192
const MAX_INPUT_CHARS = 2000
const CACHE_SCHEMA_VERSION = "v6"

const SYSTEM_PROMPT = `Extract ALL clinic bill line items from this OCR text. Return ONLY a JSON array, no markdown.

Each item: {"productName":"string","quantity":number,"unitPrice":number,"bottleQuantity":number,"unitsPerBottle":number}

Rules: 
1. Extract EVERY SINGLE product listed. If there are 20 products, the JSON array MUST have 20 objects.
2. OCR text might be disjointed (column-wise). You might see a long list of product names first, followed by a separate list of quantities, then prices. Align them sequentially.
3. Skip headers/totals/addresses/tax. Null for unknown fields. unitsPerBottle from size (100ML→100). Return [] if none.

OCR:
`

const RECOVERY_PROMPT = `You are parsing noisy invoice OCR where table columns are broken across lines.

Return ONLY a valid JSON array, no markdown fences.
Each item: {"productName":"string","quantity":number,"unitPrice":number,"bottleQuantity":number,"unitsPerBottle":number}

Important parsing rules:
1) Product names are lines with medicine names (ML/MG/TAB/CAP/SYRUP/DROPS). Extract ALL of them.
2) Read the "--- ALIGNMENT HINT ---" at the bottom of the text! It contains the numeric columns (Qty and Price) exactly paired. Match the 1st Qty/Price to your 1st product name, the 2nd to the 2nd product, etc.
3) Ignore headers/addresses/bank/totals/tax/terms/signature.
4) Do NOT stop at 1 item. You must output the full array covering every product row you can find. Use null for missing numeric fields rather than discarding the product.

OCR:
`

// ── In-process LRU-style cache (survive between hot-reloads via global) ──────
const CACHE_MAX = 50
const globalCache: Map<string, AIBillParseResult> = (
    (globalThis as any).__billParserCache ||
    ((globalThis as any).__billParserCache = new Map<string, AIBillParseResult>())
)

/** Normalise OCR output to a stable cache key (lowercase, collapse whitespace) */
function cacheKey(text: string): string {
    const normalized = text.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 500)
    return `${CACHE_SCHEMA_VERSION}|${normalized}`
}

/** Heuristic to detect OCR text that likely contains many invoice line items. */
function likelyMultiItemBill(text: string): boolean {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const serialOnlyCount = lines.filter(l => /^\d{1,2}$/.test(l)).length
    const productLikeCount = lines.filter(l => /\b(ml|mg|gm|tab|tabs|cap|caps|syrup|drops?)\b/i.test(l)).length
    return serialOnlyCount >= 8 || productLikeCount >= 8
}

// ── OCR preprocessing ────────────────────────────────────────────────────────

/**
 * Clean and truncate raw OCR text before sending to Gemini.
 * 1. Collapse runs of whitespace / blank lines
 * 2. Remove duplicate lines
 * 3. Drop lines that are clearly administrative noise
 * 4. Hard-truncate to MAX_INPUT_CHARS
 */
export function preprocessOcrText(raw: string): string {
    const noisePatterns = [
        /^(gstin|gst no|pan|cin|dl no|fssai|tel|phone|mob|email|website|www\.|http)/i,
        /^(thank you|please|visit again|terms|conditions|e\.?\s*&\.?\s*o\.?e)/i,
        /^[\-=*_\s]+$/,
    ]

    const seenTextLines = new Set<string>()
    const lines = raw
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(l => {
            if (!l) return false
            const lower = l.toLowerCase()
            if (noisePatterns.some(p => p.test(lower))) return false

            // Keep repeated numeric/table rows (qty/price/amount often repeat across items).
            const isNumericLine = /^[\d.,\-\/()\s]+$/.test(lower)
            const hasManyDigits = (lower.match(/\d/g) || []).length >= 3
            if (!isNumericLine && !hasManyDigits) {
                if (seenTextLines.has(lower)) return false
                seenTextLines.add(lower)
            }

            return true
        })

    let numbers: number[] = []
    for (const l of lines) {
        const cleaned = l.replace(/,/g, '')
        if (/^\d+\.?\d*$/.test(cleaned)) {
            numbers.push(parseFloat(cleaned))
        }
    }

    const triplets: number[][] = []
    let i = 0
    while (i < numbers.length - 2) {
        const q = numbers[i], p = numbers[i+1], a = numbers[i+2]
        if (q > 0 && p > 0 && Math.abs((q * p) - a) <= Math.max(2.0, a * 0.05)) {
            triplets.push([q, p, a])
            i += 3
        } else {
            i++
        }
    }

    let joined = lines.join("\n")
    if (joined.length > MAX_INPUT_CHARS) {
        joined = joined.slice(0, MAX_INPUT_CHARS)
    }

    if (triplets.length >= 3) {
        let hint = "\n\n--- ALIGNMENT HINT ---\n"
        hint += "The OCR columns got separated. Here are the exact quantities and prices extracted sequentially. Pair these IN ORDER with the medication names listed above:\n"
        triplets.forEach((t, idx) => {
            hint += `${idx + 1}. Qty: ${t[0]}, Price: ${t[1]}\n`
        })
        joined += hint
    }

    return joined
}

/** Combine all Gemini text parts and remove optional markdown fences. */
function getResponseText(data: any): string {
    const fromText = typeof data?.text === "string" ? data.text : ""
    if (fromText.trim()) {
        return fromText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
    }

    const parts = data?.candidates?.[0]?.content?.parts
    if (!Array.isArray(parts)) return ""

    const joined = parts
        .map((p: any) => (typeof p?.text === "string" ? p.text : ""))
        .filter(Boolean)
        .join("")

    return joined.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
}

/**
 * Parse a JSON array from Gemini output.
 * Handles normal JSON, fenced JSON, and mildly truncated arrays where objects are complete.
 */
function parseItemsArray(responseText: string): unknown[] | null {
    if (!responseText) return null

    try {
        const direct = JSON.parse(responseText)
        if (Array.isArray(direct)) return direct
    } catch {
        // fall through
    }

    const firstBracket = responseText.indexOf("[")
    const lastBracket = responseText.lastIndexOf("]")
    if (firstBracket >= 0 && lastBracket > firstBracket) {
        const candidate = responseText.slice(firstBracket, lastBracket + 1)
        try {
            const parsed = JSON.parse(candidate)
            if (Array.isArray(parsed)) return parsed
        } catch {
            // fall through
        }
    }

    // Salvage incomplete arrays: keep complete objects up to the last closing brace.
    if (firstBracket >= 0) {
        const fromArrayStart = responseText.slice(firstBracket)
        const lastObjectBrace = fromArrayStart.lastIndexOf("}")
        if (lastObjectBrace > 0) {
            const partial = fromArrayStart.slice(0, lastObjectBrace + 1)
            const repaired = `${partial.replace(/,\s*$/, "")} ]`
            try {
                const parsed = JSON.parse(repaired)
                if (Array.isArray(parsed)) return parsed
            } catch {
                // fall through
            }
        }
    }

    return null
}

function normalizeParsedItems(parsedArray: unknown[] | null): AIParsedItem[] {
    if (!parsedArray) return []

    return (parsedArray as any[])
        .filter(item => item && typeof item === "object")
        .map(item => ({
            productName: typeof item.productName === "string" ? item.productName.trim() : null,
            quantity: typeof item.quantity === "number" ? item.quantity : null,
            unitPrice: typeof item.unitPrice === "number" ? item.unitPrice : null,
            bottleQuantity: typeof item.bottleQuantity === "number" ? item.bottleQuantity : null,
            unitsPerBottle:
                typeof item.unitsPerBottle === "number" && item.unitsPerBottle > 0
                    ? item.unitsPerBottle : 1,
        }))
        .filter(item => item.productName && item.productName.length > 1)
}

async function generateWithCandidateModels(ai: GoogleGenAI, prompt: string): Promise<{
    data: any
    selectedModel: string
    elapsed: number
    usage: any
}> {
    let data: any = null
    let selectedModel = ""
    let elapsed = 0
    const modelErrors: string[] = []

    for (const model of MODEL_CANDIDATES) {
        const t0 = Date.now()
        try {
            data = await ai.models.generateContent({
                model,
                contents: prompt,
                config: {
                    responseMimeType: "application/json",
                },
            })
            selectedModel = model
            elapsed = Date.now() - t0
            break
        } catch (err: any) {
            elapsed = Date.now() - t0
            const message = err?.message || String(err)
            const status = err?.status || err?.code || "ERR"
            const isModelUnsupported = /404|not found|not supported/i.test(message)
            modelErrors.push(`${model}: ${status} ${message}`)
            if (isModelUnsupported) continue
            throw new Error(`Gemini ${status} (${model}): ${message}`)
        }
    }

    if (!data || !selectedModel) {
        throw new Error(`Gemini model unavailable. Tried non-Pro models only: ${modelErrors.join(" | ")}`)
    }

    return {
        data,
        selectedModel,
        elapsed,
        usage: data.usageMetadata
    }
}

// ── Gemini call ───────────────────────────────────────────────────────────────

export async function parseBillWithAI(ocrText: string): Promise<AIBillParseResult> {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error("GEMINI_API_KEY environment variable is not configured")
    const ai = new GoogleGenAI({ apiKey })

    if (!ocrText || ocrText.trim().length < 10) {
        return { items: [], aiParsed: true, model: "none" }
    }

    const processed = preprocessOcrText(ocrText)
    const key = cacheKey(processed)

    // Cache hit
    const cached = globalCache.get(key)
    if (cached) {
        const suspiciousTinyCache = cached.items.length <= 2 && likelyMultiItemBill(ocrText)
        if (suspiciousTinyCache) {
            console.warn(`[billParserAI] Ignoring stale tiny cache (${cached.items.length} items) for multi-item bill`)
            globalCache.delete(key)
        } else {
        console.log(`[billParserAI] Cache hit (${cached.model})`)
        return { ...cached, cached: true }
        }
    }

    const primary = await generateWithCandidateModels(ai, SYSTEM_PROMPT + processed)
    let data: any = primary.data
    let selectedModel = primary.selectedModel

    // Log token usage
    if (primary.usage) {
        console.log(
            `[billParserAI] model=${selectedModel} promptTokens=${primary.usage.promptTokenCount} outputTokens=${primary.usage.candidatesTokenCount} totalTokens=${primary.usage.totalTokenCount} time=${primary.elapsed}ms`
        )
    } else {
        console.log(`[billParserAI] model=${selectedModel} time=${primary.elapsed}ms`)
    }

    const responseText = getResponseText(data)
    const parsedArray = parseItemsArray(responseText)
    if (!parsedArray) {
        console.warn("[billParserAI] No JSON array in response:", responseText.slice(0, 200))
        return { items: [], aiParsed: true, model: selectedModel }
    }

    let items: AIParsedItem[] = normalizeParsedItems(parsedArray)

    // If first pass under-extracts on clearly multi-item OCR, retry with a layout-specific prompt.
    const shouldRetryRecovery = items.length <= 2 && likelyMultiItemBill(ocrText)
    if (shouldRetryRecovery) {
        try {
            const recovery = await generateWithCandidateModels(ai, RECOVERY_PROMPT + processed)
            if (recovery.usage) {
                console.log(
                    `[billParserAI] recovery model=${recovery.selectedModel} promptTokens=${recovery.usage.promptTokenCount} outputTokens=${recovery.usage.candidatesTokenCount} totalTokens=${recovery.usage.totalTokenCount} time=${recovery.elapsed}ms`
                )
            } else {
                console.log(`[billParserAI] recovery model=${recovery.selectedModel} time=${recovery.elapsed}ms`)
            }

            const recoveryParsed = parseItemsArray(getResponseText(recovery.data))
            const recoveryItems = normalizeParsedItems(recoveryParsed)
            if (recoveryItems.length > items.length) {
                items = recoveryItems
                selectedModel = recovery.selectedModel
                data = recovery.data
                console.log(`[billParserAI] Recovery pass improved items: ${items.length}`)
            }
        } catch (recoveryErr: any) {
            console.warn("[billParserAI] Recovery pass failed:", recoveryErr?.message || String(recoveryErr))
        }
    }

    const result: AIBillParseResult = { items, aiParsed: true, model: selectedModel }

    // Populate cache, evict oldest entry if at capacity
    if (globalCache.size >= CACHE_MAX) {
        globalCache.delete(globalCache.keys().next().value as string)
    }
    globalCache.set(key, result)

    return result
}
