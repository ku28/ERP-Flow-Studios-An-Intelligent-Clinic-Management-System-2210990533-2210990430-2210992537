import type { NextApiRequest, NextApiResponse } from 'next'
import { clearSessionCookie, verifySessionToken } from '../../../lib/auth'
import { invalidateSession, invalidateUserSessions } from '../../../lib/sessionManager'
import { writeAuditLog, extractIP } from '../../../lib/auditLog'
import prisma from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Extract session token before clearing
    const raw = req.headers.cookie || ''
    const match = raw.split(';').map((s: string) => s.trim()).find((s: string) => s.startsWith('session='))
    // Use substring (not split) to handle tokens that may contain '=' characters
    const token = match ? match.substring(match.indexOf('=') + 1) : null

    if (token) {
        // Invalidate the specific session record for this token
        await invalidateSession(token)

        // Also invalidate ALL sessions for this user so zombie sessions
        // from closed tabs / expired cookies don't keep counting against the
        // clinic's concurrent session limit.
        try {
            const decoded = verifySessionToken(token)
            if (decoded?.sub) {
                const userId = Number(decoded.sub)
                await invalidateUserSessions(userId)

                // Write audit log for logout
                const user = await prisma.user.findUnique({
                    where: { id: userId },
                    include: { clinic: true }
                })
                if (user) {
                    await writeAuditLog({
                        action: 'Logout',
                        category: 'authentication',
                        severity: 'ok',
                        userId: user.id,
                        userName: user.name || user.email || 'Unknown',
                        userRole: user.role,
                        clinicId: user.clinic?.clinicId || null,
                        clinicName: user.clinic?.name || null,
                        details: { voluntary: true },
                        req,
                    })
                }
            }
        } catch { /* best effort */ }
    }

    clearSessionCookie(res)
    res.status(200).json({ ok: true })
}
