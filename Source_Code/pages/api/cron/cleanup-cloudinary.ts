import type { NextApiRequest, NextApiResponse } from 'next'
import cloudinary from 'cloudinary'

// Configure Cloudinary
cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
})

/**
 * Cron job to delete PDFs older than 12 hours from Cloudinary
 * Set up in your hosting platform (Vercel, etc.) to run hourly
 * Or call manually: GET /api/cron/cleanup-cloudinary
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Optional: Add authorization check
    const authHeader = req.headers.authorization
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' })
    }

    try {
        
        // Get all resources with auto-delete tag
        const result = await cloudinary.v2.api.resources_by_tag('auto-delete', {
            resource_type: 'raw',
            type: 'upload',
            max_results: 500,
            context: true
        })

        const now = Date.now()
        const toDelete: string[] = []

        for (const resource of result.resources) {
            // Check if resource has expired
            const context = resource.context as { custom?: { expires_at?: string } } | undefined
            if (context?.custom?.expires_at) {
                const expiresAt = new Date(context.custom.expires_at).getTime()
                if (now >= expiresAt) {
                    toDelete.push(resource.public_id)
                }
            }
        }


        // Delete expired resources
        if (toDelete.length > 0) {
            await cloudinary.v2.api.delete_resources(toDelete, {
                resource_type: 'raw',
                type: 'upload'
            })
        }

        return res.status(200).json({
            success: true,
            deletedCount: toDelete.length,
            message: `Cleaned up ${toDelete.length} expired PDFs`
        })
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: 'Cleanup failed',
            details: error instanceof Error ? error.message : 'Unknown error'
        })
    }
}
