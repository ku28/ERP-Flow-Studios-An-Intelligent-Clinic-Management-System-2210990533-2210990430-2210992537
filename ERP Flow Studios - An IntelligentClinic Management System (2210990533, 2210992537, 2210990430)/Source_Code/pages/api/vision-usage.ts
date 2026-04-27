import type { NextApiRequest, NextApiResponse } from 'next'
import { getVisionUsage } from '../../lib/visionService'
import { initCronJobs } from '../../lib/cronInit'

// Initialize local cron jobs on first server-side invocation
initCronJobs()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }
    try {
        const usage = await getVisionUsage()
        return res.status(200).json(usage)
    } catch {
        return res.status(500).json({ error: 'Failed to fetch vision usage' })
    }
}
