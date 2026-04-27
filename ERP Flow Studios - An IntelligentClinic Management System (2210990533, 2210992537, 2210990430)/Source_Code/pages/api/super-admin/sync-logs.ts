import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { verifySessionToken } from '../../../lib/auth'

/**
 * /api/super-admin/sync-logs
 *
 * Returns offline sync logs for the super-admin audit trail.
 * Sync logs are stored as auditLog entries with category = 'offline_sync'.
 *
 * Query params:
 *   - limit (number, default 100, max 500)
 *   - action (string, optional: push, pull, conflict, error, initial_sync)
 *   - clinicId (string, optional)
 *   - deviceId (string, optional — filters within details JSON)
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        // Verify super admin
        const token = req.cookies.session
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' })
        }

        const decoded = verifySessionToken(token)
        const user = await prisma.user.findUnique({
            where: { id: decoded.sub }
        })

        if (!user || user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' })
        }

        const {
            limit: limitParam,
            action,
            clinicId,
        } = req.query

        const limit = Math.min(Number(limitParam) || 100, 500)

        // Build filter
        const where: any = {
            category: 'offline_sync',
        }

        if (clinicId) {
            where.clinicId = String(clinicId)
        }

        if (action && action !== 'all') {
            where.action = { contains: String(action), mode: 'insensitive' }
        }

        const logs = await prisma.auditLog.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            take: limit,
        })

        // Enrich with parsed sync details
        const enrichedLogs = logs.map((log: any) => {
            let deviceId = null
            let syncAction = null
            let tableName = null
            let recordId = null

            if (log.details && typeof log.details === 'object') {
                deviceId = log.details.device_id || null
                syncAction = log.details.sync_action || null
                tableName = log.details.table_name || null
                recordId = log.details.record_id || null
            }

            return {
                ...log,
                deviceId,
                syncAction,
                tableName,
                recordId,
            }
        })

        return res.status(200).json({
            logs: enrichedLogs,
            count: enrichedLogs.length,
        })
    } catch (err: any) {
        console.error('[SyncLogs API] Error:', err)
        return res.status(500).json({ error: 'Failed to fetch sync logs' })
    }
}
