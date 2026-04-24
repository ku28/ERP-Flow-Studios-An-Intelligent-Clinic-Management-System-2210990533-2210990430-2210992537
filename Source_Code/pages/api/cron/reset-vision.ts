import { NextApiRequest, NextApiResponse } from 'next'
import { resetVisionUsage, getVisionUsage } from '../../../lib/visionService'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    // Verify cron secret for security
    const authHeader = req.headers.authorization
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' })
    }

    try {
        const before = await getVisionUsage()
        await resetVisionUsage()
        console.log(`[cron] Vision OCR usage reset: was ${before.used}, now 0`)
        return res.status(200).json({
            message: 'Vision OCR usage reset successfully',
            previousUsage: before.used,
            resetAt: new Date().toISOString(),
        })
    } catch (error: any) {
        console.error('[cron] Failed to reset Vision OCR usage:', error)
        return res.status(500).json({ error: 'Failed to reset Vision OCR usage' })
    }
}
