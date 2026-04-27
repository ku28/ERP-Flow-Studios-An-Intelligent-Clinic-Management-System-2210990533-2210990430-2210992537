import { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'

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
        // Calculate 24 hours ago
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

        // Find completed tasks older than 24 hours
        const tasksToDelete = await prisma.task.findMany({
            where: {
                status: 'completed',
                completedAt: {
                    lt: twentyFourHoursAgo
                }
            },
            select: {
                id: true,
                completedAt: true
            }
        })

        // Delete the tasks
        const deleteResult = await prisma.task.deleteMany({
            where: {
                status: 'completed',
                completedAt: {
                    lt: twentyFourHoursAgo
                }
            }
        })


        return res.status(200).json({
            success: true,
            deletedCount: deleteResult.count,
            deletedIds: tasksToDelete.map((t: { id: number }) => t.id),
            cutoffTime: twentyFourHoursAgo.toISOString()
        })
    } catch (error) {
        return res.status(500).json({ 
            error: 'Failed to cleanup completed tasks',
            details: error instanceof Error ? error.message : 'Unknown error'
        })
    }
}
