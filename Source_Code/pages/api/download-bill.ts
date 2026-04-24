import type { NextApiRequest, NextApiResponse } from 'next'
import { requireStaffOrAbove } from '../../lib/auth'
import { v2 as cloudinary } from 'cloudinary'

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireStaffOrAbove(req, res)
    if (!user) return

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { url } = req.query

        if (!url || typeof url !== 'string') {
            return res.status(400).json({ error: 'URL parameter is required' })
        }


        // Check if it's a Cloudinary URL
        if (url.includes('cloudinary.com')) {
            try {
                // Extract public_id from URL
                const urlParts = url.split('/upload/')
                if (urlParts.length > 1) {
                    const afterUpload = urlParts[1]
                    // Remove version (v1234567890/) if present
                    const publicIdWithExt = afterUpload.replace(/^v\d+\//, '')
                    // Remove file extension to get the public_id
                    const publicId = publicIdWithExt.replace(/\.[^/.]+$/, '')
                    
                    
                    // Generate a signed URL for private resources
                    // This creates a temporary authenticated URL that bypasses access restrictions
                    const signedUrl = cloudinary.utils.private_download_url(publicId, 'pdf', {
                        resource_type: 'raw',
                        attachment: true,
                        expires_at: Math.floor(Date.now() / 1000) + 3600 // Expires in 1 hour
                    })
                    
                    
                    // Fetch using the signed URL
                    const response = await fetch(signedUrl, {
                        method: 'GET',
                        redirect: 'follow',
                    })
                    
                    
                    if (response.ok) {
                        const buffer = await response.arrayBuffer()
                        const contentType = response.headers.get('content-type') || 'application/pdf'
                        
                        
                        const filename = publicId.split('/').pop() + '.pdf'
                        
                        res.setHeader('Content-Type', contentType)
                        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
                        res.setHeader('Content-Length', buffer.byteLength.toString())
                        
                        return res.send(Buffer.from(buffer))
                    }
                }
            } catch (cloudinaryError: any) {
            }
        }

        // Fallback: Try direct fetch for non-Cloudinary URLs or if Cloudinary method fails
        let downloadUrl = url
        if (url.includes('cloudinary.com')) {
            downloadUrl = url.replace('/image/upload/', '/raw/upload/')
        }

        const response = await fetch(downloadUrl, {
            method: 'GET',
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        })


        if (!response.ok) {
            // If raw doesn't work, try the original URL
            if (downloadUrl !== url) {
                const originalResponse = await fetch(url, {
                    method: 'GET',
                    redirect: 'follow'
                })
                
                
                if (!originalResponse.ok) {
                    throw new Error(`Failed to fetch file: ${originalResponse.status} ${originalResponse.statusText}`)
                }
                
                const buffer = await originalResponse.arrayBuffer()
                const contentType = originalResponse.headers.get('content-type') || 'application/pdf'
                
                
                const urlParts = url.split('/')
                const filename = urlParts[urlParts.length - 1] || 'bill.pdf'
                
                res.setHeader('Content-Type', contentType)
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
                res.setHeader('Content-Length', buffer.byteLength.toString())
                
                return res.send(Buffer.from(buffer))
            }
            
            const errorText = await response.text()
            throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`)
        }

        const buffer = await response.arrayBuffer()
        const contentType = response.headers.get('content-type') || 'application/pdf'


        // Extract filename from URL
        const urlParts = url.split('/')
        const filename = urlParts[urlParts.length - 1] || 'bill.pdf'

        // Set headers for download
        res.setHeader('Content-Type', contentType)
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
        res.setHeader('Content-Length', buffer.byteLength.toString())

        return res.send(Buffer.from(buffer))
    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to download bill', details: error.message })
    }
}
