export type SharePdfResult = 'native-share' | 'link-copied'

const sanitizePublicId = (fileName: string): string => {
    const base = fileName
        .replace(/\.pdf$/i, '')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/[\u0000-\u001f\u007f]+/g, '')
        .replace(/\s+/g, '-')
        .trim()

    return base || `pdf-${Date.now()}`
}

const blobToDataUri = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : ''
            if (!result) {
                reject(new Error('Unable to convert PDF to shareable data'))
                return
            }
            resolve(result)
        }
        reader.onerror = () => reject(reader.error || new Error('Failed to read PDF blob'))
        reader.readAsDataURL(blob)
    })
}

/**
 * Convert a Blob to a pure base64 string (no data-URI prefix).
 */
const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : ''
            if (!result) {
                reject(new Error('Unable to convert blob to base64'))
                return
            }
            // Strip the "data:...;base64," prefix
            const base64 = result.split(',')[1] || ''
            resolve(base64)
        }
        reader.onerror = () => reject(reader.error || new Error('Failed to read blob'))
        reader.readAsDataURL(blob)
    })
}

/**
 * Detect if running inside a Capacitor native Android shell.
 */
function isCapacitorAndroid(): boolean {
    if (typeof window === 'undefined') return false
    const cap: any = (window as any).Capacitor
    if (!cap) return false
    const platform = String(cap.getPlatform?.() || '').toLowerCase()
    return platform === 'android'
}

/**
 * Write a PDF blob to the device Downloads folder via Capacitor Filesystem.
 * Returns true if the file was saved, false if Filesystem is unavailable.
 */
async function saveToDeviceDownloads(pdfBlob: Blob, fileName: string): Promise<boolean> {
    try {
        const { Filesystem, Directory } = await import('@capacitor/filesystem')

        const base64Data = await blobToBase64(pdfBlob)

        // Sanitise the filename for the filesystem
        const safeName = fileName.replace(/[\\/:*?"<>|]+/g, '-').trim() || `download-${Date.now()}.pdf`

        await Filesystem.writeFile({
            path: safeName,
            data: base64Data,
            directory: Directory.Documents,
            recursive: true,
        })

        return true
    } catch {
        // Filesystem plugin not available or write failed — fall through.
        return false
    }
}

export const copyTextToClipboard = async (text: string): Promise<void> => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        return
    }

    const input = document.createElement('input')
    input.value = text
    document.body.appendChild(input)
    input.select()
    document.execCommand('copy')
    document.body.removeChild(input)
}

export const uploadPdfBlobForShare = async (
    pdfBlob: Blob,
    fileName: string,
    folder: string = 'prescriptions'
): Promise<string> => {
    const pdfData = await blobToDataUri(pdfBlob)

    const response = await fetch('/api/pdf/upload-cloudinary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            pdfData,
            filename: sanitizePublicId(fileName),
            folder,
        }),
    })

    if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        const message = body?.error || 'Failed to create shareable PDF link'
        throw new Error(message)
    }

    const data = await response.json()
    if (!data?.url) {
        throw new Error('Share link was not returned by the server')
    }

    return data.url as string
}

export const sharePdfWithFallback = async (
    pdfBlob: Blob,
    options: {
        fileName: string
        title?: string
        text?: string
        folder?: string
    }
): Promise<SharePdfResult> => {
    const { fileName, title, text, folder } = options
    const nav: any = typeof navigator !== 'undefined' ? navigator : null

    if (nav?.share) {
        const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' })

        try {
            if (!nav.canShare || nav.canShare({ files: [pdfFile] })) {
                await nav.share({
                    title: title || fileName,
                    text: text || 'Sharing PDF',
                    files: [pdfFile],
                })
                return 'native-share'
            }
        } catch (error: any) {
            const name = String(error?.name || '')
            if (name === 'AbortError') {
                throw error
            }
            // Fall through to link-copy fallback for unsupported/failed native sharing.
        }
    }

    const shareUrl = await uploadPdfBlobForShare(pdfBlob, fileName, folder)
    await copyTextToClipboard(shareUrl)
    return 'link-copied'
}

export const downloadPdfBlob = async (
    pdfBlob: Blob,
    fileName: string,
    options?: {
        preferNativeShareOnAndroid?: boolean
        shareTitle?: string
        shareText?: string
    }
): Promise<'downloaded' | 'shared'> => {
    const isAndroid = isCapacitorAndroid()

    // ── Android Capacitor: try saving to device storage directly ──
    if (isAndroid) {
        // 1) Try Filesystem plugin (writes to Documents/Downloads)
        const saved = await saveToDeviceDownloads(pdfBlob, fileName)
        if (saved) {
            return 'downloaded'
        }

        // 2) Fallback: native share sheet so user can pick "Save to Files"
        if (typeof navigator !== 'undefined') {
            const nav: any = navigator
            if (nav?.share) {
                const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' })
                try {
                    if (!nav.canShare || nav.canShare({ files: [pdfFile] })) {
                        await nav.share({
                            title: options?.shareTitle || fileName,
                            text: options?.shareText || 'Save or share this PDF',
                            files: [pdfFile],
                        })
                        return 'shared'
                    }
                } catch {
                    // Fall through to browser-style download.
                }
            }
        }
    }

    // ── Desktop / iOS / non-Capacitor: standard anchor download ──
    const objectUrl = URL.createObjectURL(pdfBlob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = fileName
    anchor.rel = 'noopener noreferrer'
    anchor.style.display = 'none'
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)

    setTimeout(() => {
        URL.revokeObjectURL(objectUrl)
    }, 1500)

    return 'downloaded'
}
