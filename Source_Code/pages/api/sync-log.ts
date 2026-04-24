import type { NextApiRequest, NextApiResponse } from 'next'
import { writeAuditLog } from '../../lib/auditLog'

/**
 * /api/sync-log
 *
 * Endpoint for Electron/Android devices to push local sync logs
 * to the server-side audit trail.
 *
 * POST body:
 *   - action: string (push, pull, conflict, error, initial_sync, image_download)
 *   - tableName: string (optional)
 *   - recordId: string (optional)
 *   - details: object (optional, with device_id, sync_action, etc.)
 *   - userId: number
 *   - userName: string
 *   - userRole: string
 *   - clinicId: string
 *   - clinicName: string
 *   - deviceId: string
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const {
            action,
            tableName,
            recordId,
            details,
            userId,
            userName,
            userRole,
            clinicId,
            clinicName,
            deviceId,
        } = req.body

        if (!action || !userId) {
            return res.status(400).json({ error: 'Missing required fields: action, userId' })
        }

        const syncDetails = {
            ...details,
            sync_action: action,
            table_name: tableName || null,
            record_id: recordId || null,
            device_id: deviceId || 'unknown',
            source: 'offline_sync',
        }

        // Write to the central audit log system
        await writeAuditLog({
            action: `Offline sync: ${action}${tableName ? ` (${tableName})` : ''}`,
            category: 'offline_sync',
            userId: Number(userId),
            userName: userName || 'Unknown',
            userRole: userRole || 'unknown',
            clinicId: clinicId || null,
            clinicName: clinicName || null,
            details: syncDetails,
            req, // For IP extraction
            severity: action === 'error' ? 'warning' : action === 'conflict' ? 'warning' : 'ok',
        })

        return res.status(200).json({ ok: true })
    } catch (err: any) {
        console.error('[SyncLog API] Error:', err)
        return res.status(500).json({ error: err.message || 'Internal error' })
    }
}
