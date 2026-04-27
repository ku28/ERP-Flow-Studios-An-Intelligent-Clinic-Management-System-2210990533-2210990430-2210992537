import type { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import fs from 'fs'
import path from 'path'
import cloudinary from 'cloudinary'
import prisma from '../../lib/prisma'
import { requireAuth, getClinicIdFromUser } from '../../lib/auth'
import { getClinicAwareDoctorFilter } from '../../lib/doctorUtils'
import { checkVisionLimit, incrementVisionUsage } from '../../lib/visionService'
import { parseBillWithAI } from '../../services/billParserAI'
import { isFeatureAllowed } from '../../lib/subscription'

// ─── Canvas shim ─────────────────────────────────────────────────────────────
// pdfjs-dist v3 CJS legacy build calls require('canvas') internally for
// DOMMatrix / Path2D polyfills and some render paths.  The `canvas` (node-canvas)
// package is not installed, but @napi-rs/canvas has a compatible API and is.
// Patch Module._resolveFilename once at module-load time so every subsequent
// require('canvas') — including those deep inside pdfjs — resolves correctly.
;(() => {
    try {
        require.resolve('canvas') // already installed — nothing to do
    } catch {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const Module = require('module') as any
            const napiPath = require.resolve('@napi-rs/canvas')
            const orig: (...a: any[]) => any = Module._resolveFilename.bind(Module)
            Module._resolveFilename = (request: string, ...rest: any[]) =>
                request === 'canvas' ? napiPath : orig(request, ...rest)
        } catch { /* @napi-rs/canvas also unavailable — pdfjs will fall back gracefully */ }
    }
})()

// ─── OCR Helpers ────────────────────────────────────────────────────────────

/**
 * Google Cloud Vision – send an IMAGE buffer for DOCUMENT_TEXT_DETECTION.
 * Accepts service-account JSON string or plain API key.
 */
async function extractTextGoogleVisionImage(imageBuffer: Buffer, credential: string): Promise<string> {
    const trimmed = credential.trim()
    if (trimmed.startsWith('{')) {
        let sa: any
        try { sa = JSON.parse(trimmed) } catch { throw new Error('Invalid service-account JSON') }
        const vision = require('@google-cloud/vision')
        const client = new vision.ImageAnnotatorClient({
            credentials: { client_email: sa.client_email, private_key: sa.private_key },
            projectId: sa.project_id,
        })
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
                    image: { content: imageBuffer.toString('base64') },
                    features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
                    imageContext: { languageHints: ['en'] }
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

/**
 * Get the actual page count of a PDF without rendering it.
 * Uses pdf-parse which is already a dependency.  Returns 1 on any error.
 */
async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
    try {
        const pdfParse = require('pdf-parse')
        const data = await pdfParse(pdfBuffer, { max: 0 }) // max:0 = metadata only, no text render
        return Math.max(1, data.numpages || 1)
    } catch {
        return 1
    }
}

/**
 * Google Cloud Vision – send a raw PDF buffer directly to the files:annotate endpoint.
 * Google Vision charges 1 unit per page requested, so we query only the actual pages
 * (max 5 which is Vision's hard limit for files:annotate).
 */
async function extractTextGoogleVisionPdf(pdfBuffer: Buffer, credential: string): Promise<string> {
    const trimmed = credential.trim()

    // Only request the pages that actually exist — each page = 1 Vision API unit
    const totalPages = await getPdfPageCount(pdfBuffer)
    const pageCount = Math.min(totalPages, 5) // Vision hard-limits to 5 pages per request
    const pageNumbers = Array.from({ length: pageCount }, (_, i) => i + 1)

    console.log(`[process-bill] Vision PDF: ${totalPages} pages detected, requesting ${pageCount} page(s)`)

    if (trimmed.startsWith('{')) {
        let sa: any
        try { sa = JSON.parse(trimmed) } catch { throw new Error('Invalid service-account JSON') }
        const vision = require('@google-cloud/vision')
        const client = new vision.ImageAnnotatorClient({
            credentials: { client_email: sa.client_email, private_key: sa.private_key },
            projectId: sa.project_id,
        })
        const [result] = await client.batchAnnotateFiles({
            requests: [{
                inputConfig: { content: pdfBuffer, mimeType: 'application/pdf' },
                features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
                pages: pageNumbers,
            }]
        })
        const pages: any[] = (result as any).responses?.[0]?.responses || []
        return pages.map((p: any) => p.fullTextAnnotation?.text || '').join('\n')
    }

    // REST: files:annotate endpoint
    const resp = await fetch(
        `https://vision.googleapis.com/v1/files:annotate?key=${encodeURIComponent(trimmed)}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                requests: [{
                    inputConfig: {
                        content: pdfBuffer.toString('base64'),
                        mimeType: 'application/pdf'
                    },
                    features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
                    pages: pageNumbers
                }]
            })
        }
    )
    if (!resp.ok) {
        const e: any = await resp.json().catch(() => ({}))
        throw new Error(`Vision files:annotate error: ${e.error?.message || resp.statusText}`)
    }
    const data: any = await resp.json()
    if (data.responses?.[0]?.error) throw new Error(`Vision error: ${data.responses[0].error.message}`)
    const pages: any[] = data.responses?.[0]?.responses || []
    return pages.map((p: any) => p.fullTextAnnotation?.text || '').join('\n')
}

/**
 * Convert the first page of a PDF to a PNG buffer using sharp (requires libvips with poppler).
 * Returns null if the environment does not support PDF rendering.
 */
async function pdfToImageBufferViaSharp(pdfPath: string): Promise<Buffer | null> {
    try {
        const sharp = require('sharp')
        const buffer: Buffer = await sharp(pdfPath, { density: 300, page: 0 })
            .png()
            .toBuffer()
        // Validate it's actually a PNG (magic bytes: 89 50 4E 47).
        // Without poppler, sharp on Windows silently returns raw PDF bytes instead of throwing.
        if (!buffer || buffer.length < 4 ||
            buffer[0] !== 0x89 || buffer[1] !== 0x50 ||
            buffer[2] !== 0x4E || buffer[3] !== 0x47) {
            return null
        }
        return buffer
    } catch {
        return null
    }
}

/**
 * Convert the first page of a PDF to a PNG buffer using pdfjs-dist + @napi-rs/canvas.
 * Pure-JS renderer — no poppler or other system binaries required.
 * Renders at 2.5x scale (≈ 200 DPI equivalent) for good OCR accuracy.
 */
async function pdfToImageBufferViaPdfJs(pdfPath: string): Promise<Buffer | null> {
    try {
        // Dynamic imports so the main bundle is not affected when these packages aren't present.
        const { createCanvas } = require('@napi-rs/canvas') as typeof import('@napi-rs/canvas')
        // pdfjs-dist v4 ships both ESM and CJS; use the legacy CJS build for Node.js compatibility.
        const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js')

        // Disable the web worker — we're running in Node.js.
        pdfjsLib.GlobalWorkerOptions.workerSrc = ''

        const pdfData = new Uint8Array(fs.readFileSync(pdfPath))
        const loadingTask = pdfjsLib.getDocument({
            data: pdfData,
            verbosity: 0,
            // Prevent pdfjs from trying to load built-in CMap files from a URL.
            cMapPacked: true,
        })
        const pdfDoc = await loadingTask.promise
        const page = await pdfDoc.getPage(1)

        // 2.5 scale ≈ 200 DPI — good balance between OCR accuracy and memory.
        const viewport = page.getViewport({ scale: 2.5 })
        const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height))
        const ctx = canvas.getContext('2d') as any

        // pdfjs needs a canvas factory to create helper canvases for patterns/masks.
        const canvasFactory = {
            create(width: number, height: number) {
                const c = createCanvas(width, height)
                return { canvas: c, context: c.getContext('2d') as any }
            },
            reset(obj: any, width: number, height: number) {
                obj.canvas.width = width
                obj.canvas.height = height
            },
            destroy(obj: any) {
                obj.canvas = null
                obj.context = null
            },
        }

        await page.render({ canvasContext: ctx, viewport, canvasFactory }).promise
        ;(pdfDoc as any).destroy?.()

        // @napi-rs/canvas returns a Buffer directly from toBuffer()
        const png = await (canvas as any).toBuffer('image/png')
        if (!png || png.length < 4) return null
        return png as Buffer
    } catch (err: any) {
        console.warn('[process-bill] pdfjs render failed:', err.message)
        return null
    }
}

/**
 * Try converting the first page of a PDF to an image buffer.
 * 1. Attempts sharp + poppler (fast, highest quality when available).
 * 2. Falls back to pdfjs-dist + @napi-rs/canvas (pure JS, no system deps).
 * Returns null only if both approaches fail.
 */
async function pdfToImageBuffer(pdfPath: string): Promise<Buffer | null> {
    const sharpResult = await pdfToImageBufferViaSharp(pdfPath)
    if (sharpResult) return sharpResult
    return pdfToImageBufferViaPdfJs(pdfPath)
}

/**
 * Run OCR on an image buffer using the clinic's configured provider.
 * Priority:
 *   1. Clinic's apiGoogleVisionKey (JSON or API key) when ocrProvider = 'google_vision'
 *   2. Global environment variables (GOOGLE_CLIENT_EMAIL, etc.) when ocrProvider = 'google_vision'
 *   3. Tesseract fallback
 */
async function performOCR(
    imageBuffer: Buffer,
    ocrProvider: string,
    googleVisionKey: string | null
): Promise<string> {
    if (ocrProvider === 'google_vision') {
        if (googleVisionKey) return await extractTextGoogleVisionImage(imageBuffer, googleVisionKey)
        if (process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
            const vision = require('@google-cloud/vision')
            const client = new vision.ImageAnnotatorClient({
                credentials: {
                    client_email: process.env.GOOGLE_CLIENT_EMAIL,
                    private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
                },
                projectId: process.env.GOOGLE_PROJECT_ID
            })
            const [result] = await client.documentTextDetection({ image: { content: imageBuffer } })
            return (result as any).fullTextAnnotation?.text || ''
        }
        console.warn('[process-bill] ocrProvider=google_vision but no credential found; falling back to Tesseract')
    }
    // Tesseract fallback — only works on actual image buffers (PNG/JPEG), NOT PDF bytes
    const Tesseract = require('tesseract.js')
    const { data: { text } } = await Tesseract.recognize(imageBuffer, 'eng', { logger: () => {} })
    return text || ''
}

// Function to parse bill text and extract items
interface BillItem {
    name: string
    qty: number
    price: number
    bottleQuantity: number
    unitsPerBottle: number
}

interface TaxInfo {
    subtotal: number
    cgst: number
    sgst: number
    igst: number
    cgstPercent: number
    sgstPercent: number
    igstPercent: number
    grandTotal: number
    taxLocked: boolean
}

// ─── Shared helpers ──────────────────────────────────────────────────────────

const NON_ITEM_LINE = /^(s\.?no?\.?|sr\.?\s*no|description|product\s*name|item\s*name|particulars|qty|quantity|pack|unit|rate|price|mrp|amount|total|sub\s*total|grand\s*total|bill|bank|ifsc|terms|goods|subject|cgst|sgst|igst|gr\s*no|date|invoice|batch|expiry|exp\s*date|mfg|manufactured|hsn|sac|discount|disc|vat|tax|paid|balance|due|narration|e[.-]?w[.-]?b|vehicle|transport|dl\s*no|mob|email|phone|fax|gst|pan|cin|address|city|state|pin|ack|irn|ref|po\s*no|order|cheque|utr|rtgs|neft|signature|authoris|received|note|terms)/i

function isHeaderRow(line: string): boolean {
    // A line is a header row if it has 3+ known column-header words
    const headerWords = /(s\.?no?|sr\.?|item|product|description|qty|quantity|pack|unit|rate|price|mrp|amount|batch|exp|hsn|sac|disc|tax|cgst|sgst|igst)/gi
    const matches = line.match(headerWords) || []
    return matches.length >= 2
}

function parseNum(s: string): number {
    return parseFloat(s.replace(/,/g, '')) || 0
}

function extractUnits(name: string): { clean: string; unitsPerBottle: number } {
    const m = name.match(/(\d+)\s*(ML|MG|GM|G\b|L\b|KG|TAB|TABS|CAP|CAPS)/i)
    if (m) return { clean: name.trim(), unitsPerBottle: parseInt(m[1]) }
    return { clean: name.trim(), unitsPerBottle: 1 }
}

function makeBillItem(name: string, bottleQty: number, pricePerBottle: number): BillItem {
    const { clean, unitsPerBottle } = extractUnits(name)
    return {
        name: clean,
        qty: bottleQty * unitsPerBottle,
        price: unitsPerBottle > 1 ? pricePerBottle / unitsPerBottle : pricePerBottle,
        bottleQuantity: bottleQty,
        unitsPerBottle,
    }
}

/**
 * Deduplicate an item list, keeping the first occurrence of each product name.
 */
function dedupeItems(items: BillItem[]): BillItem[] {
    const seen = new Set<string>()
    return items.filter(it => {
        const key = it.name.toLowerCase().replace(/\s+/g, ' ')
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

// ─── Column-order detector ────────────────────────────────────────────────────
// Many Indian pharma invoices have extra columns (HSN, Batch, Expiry, MRP, Disc%)
// between the product name and the final amount we care about.  We detect the
// column layout from the header row so we know which column index means "qty",
// "rate/price" and "amount".

interface ColLayout {
    nameIdx: number    // which split-col holds the product name (always 0 after strip)
    qtyIdx: number
    rateIdx: number
    amtIdx: number
    totalCols: number
}

function detectColLayout(headerLine: string): ColLayout | null {
    const parts = headerLine.split(/\s{2,}|\t+/).map(p => p.trim().toLowerCase()).filter(Boolean)
    if (parts.length < 3) return null

    let qtyIdx = -1, rateIdx = -1, amtIdx = -1

    parts.forEach((p, i) => {
        if (qtyIdx === -1 && /\bqty\b|\bquantity\b|\bpack\b/.test(p)) qtyIdx = i
        if (rateIdx === -1 && /\brate\b|\bprice\b|\bmrp\b|\bunit\s*rate\b|\bpur.*rate\b/.test(p)) rateIdx = i
        // "amount" / "net amount" / "value" → rightmost match wins (it's the final column)
        if (/\bamount\b|\bvalue\b|\bnet\b/.test(p)) amtIdx = i
    })

    if (qtyIdx !== -1 && rateIdx !== -1 && amtIdx !== -1) {
        return { nameIdx: 0, qtyIdx, rateIdx, amtIdx, totalCols: parts.length }
    }
    return null
}

function parseBillText(text: string): { items: Array<BillItem>, taxInfo: TaxInfo } {
    const items: Array<BillItem> = []

    const taxInfo: TaxInfo = {
        subtotal: 0, cgst: 0, sgst: 0, igst: 0,
        cgstPercent: 0, sgstPercent: 0, igstPercent: 0,
        grandTotal: 0, taxLocked: false,
    }

    // Normalise text
    const normalised = text
        .replace(/\u00A0/g, ' ')
        .replace(/[\u200B-\u200F\uFEFF]/g, '')
        .replace(/\r\n|\r/g, '\n')

    const lines = normalised.split('\n').map(l => l.trim()).filter(l => l.length > 0)

    // ── Pass 0: detect column layout from first header row ────────────────────
    let colLayout: ColLayout | null = null
    for (const line of lines) {
        if (isHeaderRow(line)) {
            colLayout = detectColLayout(line)
            if (colLayout) break
        }
    }

    // ── Pass 1: collect tax summary lines ────────────────────────────────────
    for (const line of lines) {
        const cgstM = line.match(/CGST\s*[@]?\s*([\d.]+)%?\s*[:\-]?\s*([\d,]+\.?\d*)/i)
        if (cgstM) { taxInfo.cgstPercent = parseNum(cgstM[1]); taxInfo.cgst = parseNum(cgstM[2]); continue }

        const sgstM = line.match(/SGST\s*[@]?\s*([\d.]+)%?\s*[:\-]?\s*([\d,]+\.?\d*)/i)
        if (sgstM) { taxInfo.sgstPercent = parseNum(sgstM[1]); taxInfo.sgst = parseNum(sgstM[2]); continue }

        const igstM = line.match(/IGST\s*[@]?\s*([\d.]+)%?\s*[:\-]?\s*([\d,]+\.?\d*)/i)
        if (igstM) { taxInfo.igstPercent = parseNum(igstM[1]); taxInfo.igst = parseNum(igstM[2]); continue }

        const subM = line.match(/(?:Total\s*Amount\s*Before\s*Tax|Subtotal|Taxable\s*Amount)[:\s]*([\d,]+\.?\d*)/i)
        if (subM) { taxInfo.subtotal = parseNum(subM[1]); continue }

        const gtM = line.match(/(?:GRAND\s*TOTAL|Net\s*Amount|Net\s*Payable|Final\s*Amount)[:\s]*([\d,]+\.?\d*)/i)
        if (gtM && parseNum(gtM[1]) > taxInfo.grandTotal) { taxInfo.grandTotal = parseNum(gtM[1]); continue }
    }

    // ── Pass 2: item extraction ───────────────────────────────────────────────
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]

        // Skip obvious non-item lines
        if (NON_ITEM_LINE.test(line) || isHeaderRow(line)) continue

        // ── Strategy A: column-layout guided parsing ─────────────────────────
        if (colLayout) {
            const cols = line.split(/\s{2,}|\t+/).map(c => c.trim()).filter(Boolean)
            if (cols.length >= colLayout.totalCols - 1 && cols.length <= colLayout.totalCols + 2) {
                // Shift indices if a leading serial-number column is present
                const hasSerial = /^\d{1,3}$/.test(cols[0])
                const shift = hasSerial ? 1 : 0
                const name = cols.slice(shift, shift + 1).join(' ')
                const qty = parseNum(cols[colLayout.qtyIdx + shift] || '0')
                const rate = parseNum(cols[colLayout.rateIdx + shift] || '0')
                const amt = parseNum(cols[colLayout.amtIdx + shift] || '0')

                if (qty > 0 && qty <= 10000 && rate > 0 && name.length > 2 &&
                    !NON_ITEM_LINE.test(name)) {
                    // Accept if qty×rate ≈ amt OR amt is 0 (column missing) OR discount present
                    const computed = qty * rate
                    const reasonable = amt === 0 || computed <= amt * 1.6 // allow up to 60% discount
                    if (reasonable) {
                        const finalAmt = amt > 0 ? amt : computed
                        items.push(makeBillItem(name, qty, finalAmt / qty))
                        continue
                    }
                }
            }
        }

        // ── Strategy B: tab-separated ────────────────────────────────────────
        if (line.includes('\t')) {
            const parts = line.split('\t').map(p => p.trim()).filter(Boolean)
            // Expect: [serial?] name  qty  rate  [batch] [exp] [mrp] [disc] amount
            const nums = parts.map(p => ({ raw: p, n: parseNum(p), isNum: /^[\d,]+\.?\d*$/.test(p) }))
            const numParts = nums.filter(n => n.isNum)
            const textParts = nums.filter(n => !n.isNum)

            if (textParts.length >= 1 && numParts.length >= 2) {
                const namePart = textParts.find(p => p.raw.length > 2 && !NON_ITEM_LINE.test(p.raw))
                if (namePart) {
                    // qty = first small number (<= 10000), rate = second, amount = last
                    const qtyC = numParts.find(n => n.n > 0 && n.n <= 10000)
                    const amtC = numParts[numParts.length - 1]
                    const rateC = numParts.find(n => n !== qtyC && n !== amtC && n.n > 0)
                    if (qtyC && amtC && qtyC.n > 0) {
                        const rate = rateC ? rateC.n : amtC.n / qtyC.n
                        items.push(makeBillItem(namePart.raw, qtyC.n, rate))
                        continue
                    }
                }
            }
        }

        // ── Strategy C: multi-line product block ──────────────────────────────
        // Line i:   "MEDICINE NAME 100ML"
        // Line i+1: "1"  (serial/line number)
        // Line i+2: "93.001860.0020"  (concatenated price+amount+qty)
        if (i + 2 < lines.length) {
            const nextLine = lines[i + 1]
            const numLine = lines[i + 2]

            if (nextLine.match(/^\d{1,3}$/) && /^[\d.]+$/.test(numLine)) {
                // Try to split concatenated number: PRICE.00AMOUNT.00QTY
                const m = numLine.match(/^([\d]+\.[\d]{2})([\d]+\.[\d]{2})(\d{1,4})$/)
                if (m) {
                    const rate = parseNum(m[1]), amount = parseNum(m[2]), qty = parseInt(m[3])
                    if (qty > 0 && rate > 0) {
                        items.push(makeBillItem(line, qty, rate))
                        i += 2
                        continue
                    }
                }
            }
        }

        // ── Strategy D: space-separated flexible line ─────────────────────────
        // Handles any row that ends with 2–6 numbers after a product name.
        // Tolerates: serial, HSN, batch, expiry, MRP, discount columns.
        const normLine = line.replace(/\s+/g, ' ').trim()
        // Extract all tokens; find trailing numeric tokens
        const tokens = normLine.split(' ')
        const trailingNums: string[] = []
        for (let j = tokens.length - 1; j >= 0; j--) {
            if (/^[\d,]+\.?\d*$/.test(tokens[j])) {
                trailingNums.unshift(tokens[j])
            } else break
        }

        if (trailingNums.length >= 2) {
            const nameTokens = tokens.slice(0, tokens.length - trailingNums.length)
            // Strip leading serial number from name
            if (/^\d{1,3}$/.test(nameTokens[0])) nameTokens.shift()
            const name = nameTokens.join(' ').trim()

            if (name.length > 2 && !NON_ITEM_LINE.test(name)) {
                const nums = trailingNums.map(parseNum)
                // Last number is usually the total amount; the smallest integer-ish number is qty
                const amount = nums[nums.length - 1]
                // Find qty: a whole number > 0 and <= 10000 that's not the last column
                let qty = 0, rate = 0
                for (let j = 0; j < nums.length - 1; j++) {
                    const n = nums[j]
                    if (Number.isInteger(n) && n > 0 && n <= 10000) { qty = n; break }
                }
                // If no clean integer found, try first number as qty
                if (qty === 0 && nums.length >= 3) qty = Math.round(nums[0])
                // Rate: column just after qty, or derive from amount/qty
                if (qty > 0) {
                    const qtyIdx = nums.findIndex(n => Math.round(n) === qty)
                    rate = nums[qtyIdx + 1] || 0
                    if (rate === 0 || rate === amount) rate = amount / qty
                    if (rate > 0 && qty * rate <= amount * 1.6) {
                        items.push(makeBillItem(name, qty, rate))
                        continue
                    }
                }
            }
        }

        // ── Strategy E: product-name-only line (qty on next line or unknown) ──
        // Last resort: if line looks like a medicine name and has no numbers,
        // peek at next 3 lines for quantity + price data.
        if (/^[A-Z][A-Z0-9 \-\/\.]+$/.test(line) && line.length > 4 && line.length < 60 && i + 1 < lines.length) {
            const peek = lines[i + 1]
            // Next line all-numbers → multi-line format with concatenated prices
            if (/^\d+$/.test(peek) && i + 2 < lines.length) {
                const dateLine = lines[i + 2]
                const m2 = dateLine.match(/^([\d]+\.[\d]{2})([\d]+\.[\d]{2})(\d{1,4})$/)
                if (m2) {
                    const rate = parseNum(m2[1]), qty = parseInt(m2[3])
                    if (qty > 0 && rate > 0) {
                        items.push(makeBillItem(line, qty, rate))
                        i += 2
                        continue
                    }
                }
            }
        }
    }

    // ── Deduplicate (Vision sometimes produces repeated page text) ────────────
    const uniqueItems = dedupeItems(items)

    // ── Tax info completion ───────────────────────────────────────────────────
    if (taxInfo.subtotal === 0 && uniqueItems.length > 0) {
        taxInfo.subtotal = uniqueItems.reduce((s, it) => s + it.price * it.qty, 0)
    }
    if (taxInfo.grandTotal === 0) {
        taxInfo.grandTotal = taxInfo.subtotal + taxInfo.cgst + taxInfo.sgst + taxInfo.igst
    }
    if (taxInfo.cgst > 0 && taxInfo.cgstPercent === 0 && taxInfo.subtotal > 0)
        taxInfo.cgstPercent = (taxInfo.cgst / taxInfo.subtotal) * 100
    if (taxInfo.sgst > 0 && taxInfo.sgstPercent === 0 && taxInfo.subtotal > 0)
        taxInfo.sgstPercent = (taxInfo.sgst / taxInfo.subtotal) * 100
    if (taxInfo.igst > 0 && taxInfo.igstPercent === 0 && taxInfo.subtotal > 0)
        taxInfo.igstPercent = (taxInfo.igst / taxInfo.subtotal) * 100
    if (taxInfo.cgst === 0 && taxInfo.sgst === 0 && taxInfo.igst === 0 &&
        taxInfo.grandTotal > taxInfo.subtotal && taxInfo.subtotal > 0) {
        const totalTax = taxInfo.grandTotal - taxInfo.subtotal
        taxInfo.cgst = totalTax / 2; taxInfo.sgst = totalTax / 2
        taxInfo.cgstPercent = (taxInfo.cgst / taxInfo.subtotal) * 100
        taxInfo.sgstPercent = (taxInfo.sgst / taxInfo.subtotal) * 100
    }

    return { items: uniqueItems, taxInfo }
}

// Configure Cloudinary
cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
})

export const config = {
    api: {
        bodyParser: false,
        externalResolver: true,
    },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Log for debugging on Vercel
    
    // CRITICAL: Add authentication for multi-tenant isolation
    const user = await requireAuth(req, res)
    if (!user) return

    if (!isFeatureAllowed((user as any).clinic?.subscriptionPlan, 'upload_bill')) {
        return res.status(403).json({
            error: 'Upload Bill is available in Standard plan.',
            code: 'FEATURE_RESTRICTED',
            upgradeUrl: '/upgrade',
        })
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    let file: any = null

    try {
        const form = formidable({
            maxFileSize: 10 * 1024 * 1024, // 10MB
            keepExtensions: true,
        })

        let fields: any, files: any
        try {
            [fields, files] = await form.parse(req)
        } catch (parseError: any) {
            return res.status(400).json({ 
                error: 'Failed to parse upload',
                details: parseError.message 
            })
        }
        
        file = Array.isArray(files.file) ? files.file[0] : files.file

        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' })
        }
        

        // Upload to Cloudinary as raw file (not image) for proper PDF handling
        let billUrl = ''
        try {
            const result = await cloudinary.v2.uploader.upload(file.filepath, {
                folder: 'erp-flow-studios/bills',
                resource_type: 'raw', // Use 'raw' for PDFs instead of 'auto'
                type: 'upload',
                access_mode: 'public',
                overwrite: false
            })
            billUrl = result.secure_url
        } catch (uploadError: any) {
            throw new Error('Failed to upload bill to Cloudinary: ' + uploadError.message)
        }

        // Fetch all products from user's clinic to match with bill items (including tags for better matching)
        const whereClause = await getClinicAwareDoctorFilter(user, prisma)
        const clinicId = getClinicIdFromUser(user)
        const allProducts = await prisma.product.findMany({
            where: whereClause,
            select: {
                id: true,
                name: true,
                purchasePriceRupees: true,
                purchasePricePerUnit: true,
                unit: true,
                tags: true
            }
        })

        // Fetch existing product mappings for automatic matching
        const existingMappings = await prisma.billProductMapping.findMany({
            where: {
                product: whereClause,
                billProductName: {
                    startsWith: `${clinicId}::`
                }
            },
            select: {
                billProductName: true,
                mappedProductId: true
            }
        })
        const mappingDict = new Map(existingMappings.map((m: any) => {
            const scopedName = m.billProductName || ''
            const unscopedName = scopedName.includes('::') ? scopedName.split('::').slice(1).join('::') : scopedName
            return [unscopedName, m.mappedProductId]
        }))

        // ─── Determine OCR + AI pipeline based on subscription plan ──────────
        //
        //  PRO/BASIC+AI_OCR : Vision OCR  -> Gemini AI parsing
        //  BASIC            : Tesseract   -> Gemini AI parsing
        //
        const clinicPlan: string = (user as any).clinic?.subscriptionPlan || 'basic'
        const hasVisionAccess = clinicPlan === 'pro' || clinicPlan === 'basic_ai_ocr' || clinicPlan === 'standard_ai_ocr'

        // Resolve requested provider from frontend field, then clinic setting, then default
        const requestedProvider = Array.isArray(fields.ocrProvider) ? fields.ocrProvider[0] : fields.ocrProvider
        const rawProvider: string = requestedProvider || (user as any).clinic?.ocrProvider || 'tesseract'

        // Enforce plan gate for Vision OCR access.
        // Applies to BOTH the frontend-requested value AND the stored clinic value.
        const ocrProvider: string = (rawProvider === 'google_vision' && !hasVisionAccess) ? 'tesseract' : rawProvider

        const googleVisionKey: string | null = (user as any).clinic?.apiGoogleVisionKey || null
        const usingGoogleVision = ocrProvider === 'google_vision' && (!!googleVisionKey || (!!process.env.GOOGLE_CLIENT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY))
        const parsePipeline = usingGoogleVision ? 'vision+gemini' : 'tesseract+gemini'

        // Gemini AI parser runs for ALL plans — it just receives whatever text OCR produced.
        // Pro: Gemini gets high-quality Vision text.
        // Basic: Gemini gets Tesseract text (lower quality but still useful).
        const useGeminiAI = true

        console.log(`[process-bill] plan=${clinicPlan} ocr=${ocrProvider} gemini=${useGeminiAI} pipeline=${parsePipeline}`)

        // ─── Check Vision usage limit before calling the API ─────────────────
        if (usingGoogleVision) {
            try {
                await checkVisionLimit()
            } catch (limitError: any) {
                if (limitError.code === 'VISION_LIMIT_EXCEEDED') {
                    return res.status(429).json({ error: limitError.message, code: 'VISION_LIMIT_EXCEEDED' })
                }
                throw limitError
            }
        }

        // ─── Extract text from the uploaded file ─────────────────────────────
        let billItems: Array<{ name: string; qty: number; price: number; bottleQuantity: number; unitsPerBottle: number }> = []
        let taxInfo: TaxInfo = {
            subtotal: 0, cgst: 0, sgst: 0, igst: 0,
            cgstPercent: 0, sgstPercent: 0, igstPercent: 0,
            grandTotal: 0, taxLocked: false
        }
        let rawExtractedText = ''

        if (file.mimetype === 'application/pdf') {
            // ── Step 1: try text extraction via pdf-parse ─────────────────────
            try {
                const pdfParse = require('pdf-parse')
                const dataBuffer = fs.readFileSync(file.filepath)
                const pdfData = await pdfParse(dataBuffer)
                rawExtractedText = pdfData.text || ''

                if (rawExtractedText.trim().length > 20) {
                    const parseResult = parseBillText(rawExtractedText)
                    billItems = parseResult.items
                    taxInfo = parseResult.taxInfo
                    console.log(`[process-bill] pdf-parse extracted ${rawExtractedText.length} chars, found ${billItems.length} items`)
                }
            } catch (pdfError: any) {
                console.warn('[process-bill] pdf-parse failed:', pdfError.message)
            }

            // ── Step 2: OCR fallback when pdf-parse yields no items ───────────
            // (scanned/image-based PDFs have no embedded text)
            if (billItems.length === 0) {
                console.warn('[process-bill] No items from pdf-parse; attempting OCR on PDF...')

                if (ocrProvider === 'google_vision') {
                    // ── Google Vision: send PDF bytes directly (no image conversion needed) ──
                    const credential = googleVisionKey || null
                    const hasEnvCreds = !!process.env.GOOGLE_CLIENT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY

                    if (credential || hasEnvCreds) {
                        try {
                            const pdfBuffer = fs.readFileSync(file.filepath)

                            let ocrText = ''
                            if (credential) {
                                ocrText = await extractTextGoogleVisionPdf(pdfBuffer, credential)
                            } else {
                                // Use environment variables for Vercel serverless compatibility
                                const vision = require('@google-cloud/vision')
                                const client = new vision.ImageAnnotatorClient({
                                    credentials: {
                                        client_email: process.env.GOOGLE_CLIENT_EMAIL,
                                        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')
                                    },
                                    projectId: process.env.GOOGLE_PROJECT_ID
                                })
                                const [result] = await client.batchAnnotateFiles({
                                    requests: [{
                                        inputConfig: { content: pdfBuffer, mimeType: 'application/pdf' },
                                        features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
                                        pages: [1, 2, 3, 4, 5],
                                    }]
                                })
                                const pages: any[] = (result as any).responses?.[0]?.responses || []
                                ocrText = pages.map((p: any) => p.fullTextAnnotation?.text || '').join('\n')
                            }

                            rawExtractedText = ocrText
                            console.log(`[process-bill] Google Vision PDF OCR extracted ${ocrText.length} chars`)
                            await incrementVisionUsage()

                            if (ocrText.trim().length > 20) {
                                const ocrResult = parseBillText(ocrText)
                                billItems = ocrResult.items
                                taxInfo = ocrResult.taxInfo
                            }
                        } catch (ocrError: any) {
                            console.warn('[process-bill] Google Vision PDF OCR failed:', ocrError.message)
                        }
                    } else {
                        console.warn('[process-bill] google_vision selected but no credentials configured')
                    }
                } else {
                    // ── Tesseract path: try sharp (needs poppler), otherwise inform user ──
                    const imgBuffer = await pdfToImageBuffer(file.filepath)
                    if (imgBuffer) {
                        try {
                            const ocrText = await performOCR(imgBuffer, ocrProvider, googleVisionKey)
                            rawExtractedText = ocrText
                            console.log(`[process-bill] Tesseract PDF OCR extracted ${ocrText.length} chars`)
                            if (ocrText.trim().length > 20) {
                                const ocrResult = parseBillText(ocrText)
                                billItems = ocrResult.items
                                taxInfo = ocrResult.taxInfo
                            }
                        } catch (ocrError: any) {
                            console.warn('[process-bill] Tesseract OCR failed:', ocrError.message)
                        }
                    } else {
                        // Both sharp+poppler and pdfjs-dist rendering failed
                        rawExtractedText = '__IMAGE_PDF_NO_POPPLER__'
                        console.warn('[process-bill] Scanned PDF detected but all PDF-to-image renderers failed')
                    }
                }
            }
        } else {
            // ── Image file: OCR directly ──────────────────────────────────────
            try {
                const imageBuffer = fs.readFileSync(file.filepath)
                const ocrText = await performOCR(imageBuffer, ocrProvider, googleVisionKey)
                rawExtractedText = ocrText
                console.log(`[process-bill] Image OCR (${ocrProvider}) extracted ${ocrText.length} chars`)
                if (usingGoogleVision) await incrementVisionUsage()

                if (!ocrText || ocrText.trim().length === 0) {
                    throw new Error('No text could be extracted from the image. Please ensure the image is clear and well-lit.')
                }

                const parseResult = parseBillText(ocrText)
                billItems = parseResult.items
                taxInfo = parseResult.taxInfo
            } catch (ocrError: any) {
                if (ocrError.message?.includes('No text could be extracted')) throw ocrError
                throw new Error(`Failed to process image (${ocrProvider}): ${ocrError.message}`)
            }
        }

        // ─── AI Bill Parsing (Gemini) ─────────────────────────────────────────
        // Runs for ALL plans after OCR text is available.
        //   Pro   → Vision text  → Gemini (high accuracy)
        //   Basic → Tesseract text → Gemini (improved vs regex alone)
        // Falls back to regex-parsed billItems if AI fails or returns nothing.
        let aiParseUsed = false
        let aiParseModel = ''
        let aiParseCached = false
        const regexItemCountBeforeAI = billItems.length
        if (useGeminiAI && rawExtractedText && rawExtractedText.trim().length > 20 &&
            rawExtractedText !== '__IMAGE_PDF_NO_POPPLER__') {
            try {
                const aiResult = await parseBillWithAI(rawExtractedText)
                if (aiResult.items.length > 0) {
                    const aiCount = aiResult.items.length
                    const regexCount = regexItemCountBeforeAI
                    const aiLooksTooSmall = regexCount >= 5 && aiCount <= Math.max(2, Math.floor(regexCount * 0.35))

                    if (aiLooksTooSmall) {
                        console.warn(
                            `[process-bill] AI parsed ${aiCount} items, but regex already had ${regexCount}; keeping regex results`
                        )
                    } else {
                    // Convert AI items to the BillItem format used by the rest of the pipeline.
                    // unitsPerBottle defaults to 1 when not specified.
                    billItems = aiResult.items
                        .filter(ai => ai.productName)
                        .map(ai => {
                            const upb = ai.unitsPerBottle ?? 1
                            const bottleQty = ai.bottleQuantity ?? (ai.quantity ? ai.quantity / upb : 1)
                            const totalQty = ai.quantity ?? (bottleQty * upb)
                            const unitPriceVal = ai.unitPrice ?? 0
                            return {
                                name: ai.productName as string,
                                qty: totalQty,
                                price: unitPriceVal,
                                bottleQuantity: bottleQty,
                                unitsPerBottle: upb,
                            }
                        })
                    aiParseUsed = true
                    aiParseModel = aiResult.model
                    aiParseCached = aiResult.cached === true
                    console.log(`[process-bill] AI parsed ${billItems.length} items via ${aiResult.model}${aiParseCached ? ' (cache hit)' : ''}`)
                    }
                } else {
                    console.log('[process-bill] AI returned 0 items; using regex-parsed billItems')
                }
            } catch (aiErr: any) {
                console.warn('[process-bill] AI parsing failed (using regex fallback):', aiErr.message)
            }
        }

        // Match bill items with database products using keyword-based fuzzy matching
        const extractedData = billItems.map((billItem: { name: string; qty: number; price: number; bottleQuantity: number; unitsPerBottle: number }) => {
            // First check if there's an existing mapping for this exact bill product name
            if (mappingDict.has(billItem.name)) {
                const mappedProductId = mappingDict.get(billItem.name)
                const mappedProduct = allProducts.find((p: any) => p.id === mappedProductId)
                
                if (mappedProduct) {
                    return {
                        productId: mappedProduct.id,
                        productName: billItem.name,
                        quantity: billItem.qty,
                        unitPrice: billItem.price,
                        bottleQuantity: billItem.bottleQuantity,
                        unitsPerBottle: billItem.unitsPerBottle,
                        matched: true,
                        matchedProductName: mappedProduct.name,
                        matchScore: 999, // High score for previously mapped items
                        requiresUserAction: false,
                        usedMapping: true
                    }
                }
            }

            // Extract significant keywords from bill item name (ignore common words, numbers at end)
            const extractKeywords = (name: string): string[] => {
                return name.toLowerCase()
                    .replace(/\d+ml|\d+mg|\s+\d+$/gi, '') // Remove measurements and trailing numbers
                    .replace(/[()]/g, ' ') // Remove parentheses
                    .split(/\s+/)
                    .filter(word => word.length > 2 && !['the', 'and', 'pet', 'bottal', 'pcs'].includes(word))
            }

            const billKeywords = extractKeywords(billItem.name)
            
            // Try to find matching product with keyword scoring
            let bestMatch = null
            let bestScore = 0

            for (const product of allProducts) {
                // First check if bill name matches any product tags (exact match)
                if (product.tags && product.tags.includes(billItem.name)) {
                    bestMatch = product
                    bestScore = 1000 // Highest score for tag match
                    break
                }
                
                const productKeywords = extractKeywords(product.name)
                
                // Calculate match score based on common keywords
                let score = 0
                for (const billWord of billKeywords) {
                    for (const prodWord of productKeywords) {
                        if (prodWord.includes(billWord) || billWord.includes(prodWord)) {
                            score += 1
                        }
                    }
                }
                
                // Bonus for exact substring match
                const productNameLower = product.name.toLowerCase()
                const billNameLower = billItem.name.toLowerCase()
                if (productNameLower.includes(billNameLower) || billNameLower.includes(productNameLower)) {
                    score += 2
                }
                
                if (score > bestScore) {
                    bestScore = score
                    bestMatch = product
                }
            }

            // Only accept matches with score >= 2 (more strict to reduce false positives)
            const matchedProduct = bestScore >= 2 ? bestMatch : null

            return {
                productId: matchedProduct?.id || null,
                productName: billItem.name,
                quantity: billItem.qty, // Total units to add to inventory (bottles × units per bottle)
                unitPrice: billItem.price, // Price per unit (per ML/MG/etc)
                bottleQuantity: billItem.bottleQuantity, // Number of bottles purchased
                unitsPerBottle: billItem.unitsPerBottle, // Units per bottle (e.g., 100ML)
                matched: !!matchedProduct,
                matchedProductName: matchedProduct?.name || null,
                matchScore: bestScore,
                requiresUserAction: !matchedProduct // Flag for items needing user input
            }
        })

        // Separate matched and unmatched items
        const validItems = extractedData.filter(item => item.productId !== null)
        const unmatchedItems = extractedData.filter(item => item.productId === null)

        // Compare bill prices with existing product prices and update if different
        const priceUpdates: Array<{
            productId: number
            productName: string
            oldPricePerPack: number | null
            newPricePerPack: number
            oldPricePerUnit: number | null
            newPricePerUnit: number
            billProductName: string
        }> = []

        for (const item of validItems) {
            if (!item.productId) continue

            // Find the product in allProducts to get current prices
            const product = allProducts.find((p: any) => p.id === item.productId)
            if (!product) continue

            // Calculate new prices from bill
            const billPricePerUnit = item.unitPrice
            const billPricePerPack = item.unitPrice * item.unitsPerBottle

            // Check if prices differ (allowing small floating point differences)
            const pricePerPackDiffers = !product.purchasePriceRupees || 
                Math.abs((product.purchasePriceRupees || 0) - billPricePerPack) > 0.01
            const pricePerUnitDiffers = !product.purchasePricePerUnit || 
                Math.abs((product.purchasePricePerUnit || 0) - billPricePerUnit) > 0.01

            if (pricePerPackDiffers || pricePerUnitDiffers) {
                // Update the product prices in database
                await prisma.product.update({
                    where: { id: item.productId },
                    data: {
                        purchasePriceRupees: billPricePerPack,
                        purchasePricePerUnit: billPricePerUnit
                    }
                })

                // Track the update
                priceUpdates.push({
                    productId: item.productId,
                    productName: product.name,
                    oldPricePerPack: product.purchasePriceRupees,
                    newPricePerPack: billPricePerPack,
                    oldPricePerUnit: product.purchasePricePerUnit,
                    newPricePerUnit: billPricePerUnit,
                    billProductName: item.productName
                })

            }
        }

        // Clean up the temporary file
        if (file.filepath && fs.existsSync(file.filepath)) {
            fs.unlinkSync(file.filepath)
        }

        res.status(200).json({
            success: true,
            items: validItems,
            unmatchedItems: unmatchedItems,
            allExtractedItems: extractedData,
            billUrl: billUrl,
            matchedCount: validItems.length,
            unmatchedCount: unmatchedItems.length,
            totalCount: extractedData.length,
            priceUpdates: priceUpdates,
            priceUpdatesCount: priceUpdates.length,
            ocrProvider: usingGoogleVision ? 'google_vision' : 'tesseract',
            parsePipeline,
            aiParsed: aiParseUsed,
            aiModel: aiParseUsed ? aiParseModel : null,
            aiParseCached: aiParseUsed ? aiParseCached : false,
            ocr_text: rawExtractedText.substring(0, 2000), // alias for AI-layer consumers
            rawExtractedText: rawExtractedText.substring(0, 2000), // first 2000 chars for debugging
            message: `Bill processed successfully. Matched ${validItems.length} of ${extractedData.length} items. ${unmatchedItems.length} items need your attention.${priceUpdates.length > 0 ? ` Updated prices for ${priceUpdates.length} product(s).` : ''}`,
            explanation: `Each item shows: quantity = total units to add to inventory (bottles × units per bottle), unitPrice = price per unit (per ML/MG/etc), bottleQuantity = number of bottles, unitsPerBottle = size of each bottle`,
            taxInfo: {
                subtotal: taxInfo.subtotal,
                cgst: taxInfo.cgst,
                sgst: taxInfo.sgst,
                igst: taxInfo.igst,
                cgstPercent: taxInfo.cgstPercent,
                sgstPercent: taxInfo.sgstPercent,
                igstPercent: taxInfo.igstPercent,
                grandTotal: taxInfo.grandTotal,
                taxLocked: taxInfo.taxLocked,
                totalTax: taxInfo.cgst + taxInfo.sgst + taxInfo.igst
            },
            availableProducts: allProducts.map((p: any) => ({ id: p.id, name: p.name }))
        })

    } catch (error: any) {
        
        // Clean up temp file on error
        try {
            if (file?.filepath && fs.existsSync(file.filepath)) {
                fs.unlinkSync(file.filepath)
            }
        } catch (cleanupError) {
        }
        
        res.status(500).json({ 
            error: 'Failed to process bill',
            details: error.message 
        })
    }
}


