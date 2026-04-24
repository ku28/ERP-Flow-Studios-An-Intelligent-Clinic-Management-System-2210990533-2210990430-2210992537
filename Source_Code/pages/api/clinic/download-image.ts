import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuth } from '../../../lib/auth'

const CONTENT_TYPE_EXTENSIONS: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/jpg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
    'image/tiff': '.tiff',
}

function sanitizeFileName(name: string): string {
    const cleaned = name.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/_+/g, '_')
    return cleaned || 'image'
}

function getFileExtensionFromPath(pathname: string): string {
    const fileName = pathname.split('/').pop() || ''
    const lastDotIndex = fileName.lastIndexOf('.')
    if (lastDotIndex <= 0) return ''
    return fileName.slice(lastDotIndex)
}

function buildDownloadName(baseName: string, targetUrl: URL, contentType: string): string {
    const safeBase = sanitizeFileName(baseName)
    const extFromPath = getFileExtensionFromPath(targetUrl.pathname)

    if (extFromPath) {
        return `${safeBase}${extFromPath}`
    }

    const extFromContentType = CONTENT_TYPE_EXTENSIONS[contentType.toLowerCase()] || ''
    return `${safeBase}${extFromContentType}`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const user = await requireAuth(req, res)
    if (!user) return

    const urlParam = typeof req.query.url === 'string' ? req.query.url : ''
    const fileNameParam = typeof req.query.filename === 'string' ? req.query.filename : 'clinic-image'

    if (!urlParam) {
        return res.status(400).json({ error: 'Image URL is required' })
    }

    let targetUrl: URL
    try {
        targetUrl = new URL(urlParam)
    } catch {
        return res.status(400).json({ error: 'Invalid image URL' })
    }

    if (!['http:', 'https:'].includes(targetUrl.protocol)) {
        return res.status(400).json({ error: 'Only HTTP(S) image URLs are allowed' })
    }

    const blockedHosts = new Set(['localhost', '127.0.0.1', '::1'])
    if (blockedHosts.has(targetUrl.hostname.toLowerCase())) {
        return res.status(400).json({ error: 'Invalid image host' })
    }

    try {
        const upstream = await fetch(targetUrl.toString())
        if (!upstream.ok) {
            return res.status(502).json({ error: 'Failed to fetch image from source' })
        }

        const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
        const fileBuffer = Buffer.from(await upstream.arrayBuffer())
        const downloadName = buildDownloadName(fileNameParam, targetUrl, contentType)

        res.setHeader('Content-Type', contentType)
        res.setHeader('Content-Length', String(fileBuffer.length))
        res.setHeader('Cache-Control', 'private, no-store, max-age=0')
        res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`)

        return res.status(200).send(fileBuffer)
    } catch {
        return res.status(500).json({ error: 'Failed to download image' })
    }
}
