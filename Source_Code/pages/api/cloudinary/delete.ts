import type { NextApiRequest, NextApiResponse } from 'next'
import cloudinary from 'cloudinary'
import { requireAuth } from '../../../lib/auth'

// Configure Cloudinary
cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const user = await requireAuth(req, res)
    if (!user) return

    try {
        const { publicId } = req.body

        if (!publicId) {
            return res.status(400).json({ error: 'Missing publicId' })
        }


        // Delete from Cloudinary
        const result = await cloudinary.v2.uploader.destroy(publicId, {
            resource_type: 'raw',
            invalidate: true
        })


        if (result.result === 'ok' || result.result === 'not found') {
            return res.status(200).json({
                success: true,
                message: 'File deleted successfully'
            })
        } else {
            return res.status(500).json({
                error: 'Failed to delete file',
                details: result
            })
        }
    } catch (error) {
        return res.status(500).json({
            error: 'Failed to delete file',
            details: error instanceof Error ? error.message : 'Unknown error'
        })
    }
}
