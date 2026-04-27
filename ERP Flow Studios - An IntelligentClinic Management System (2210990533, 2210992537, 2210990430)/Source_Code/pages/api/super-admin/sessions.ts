import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../../lib/auth'
import prisma from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const authUser = await getSessionUser(req)
    if (!authUser || authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Super admin access required' })
    }

    // ── GET: return all active sessions grouped by clinic ──────────────────
    if (req.method === 'GET') {
        try {
            const sessions = await prisma.sessionRecord.findMany({
                where: { isActive: true },
                orderBy: { lastActive: 'desc' },
                include: {
                    clinic: { select: { id: true, clinicId: true, name: true, _count: { select: { users: true } } } }
                }
            })

            // Enrich with user name/email
            const userIds = [...new Set(sessions.map((s : any) => s.userId))]
            const users = await prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, name: true, email: true, role: true }
            })
            const userMap = Object.fromEntries(users.map((u : any) => [u.id, u]))

            // Group by clinic
            const byClinic: Record<string, any> = {}
            const noClinic: any[] = []

            for (const s of sessions) {
                const enriched = {
                    id: s.id,
                    sessionToken: s.sessionToken.slice(0, 20) + '…',
                    userId: s.userId,
                    userName: userMap[s.userId]?.name || userMap[s.userId]?.email || `User #${s.userId}`,
                    userRole: userMap[s.userId]?.role || 'unknown',
                    ipAddress: s.ipAddress,
                    location: s.location,
                    userAgent: s.userAgent,
                    createdAt: s.createdAt,
                    lastActive: s.lastActive,
                    expiresAt: s.expiresAt,
                }

                if (s.clinic) {
                    const key = s.clinic.id
                    if (!byClinic[key]) {
                        byClinic[key] = {
                            clinicInternalId: s.clinic.id,
                            clinicId: s.clinic.clinicId,
                            clinicName: s.clinic.name,
                            maxSessions: s.clinic._count.users * 2,
                            userCount: s.clinic._count.users,
                            sessions: [],
                        }
                    }
                    byClinic[key].sessions.push(enriched)
                } else {
                    noClinic.push(enriched)
                }
            }

            const grouped = Object.values(byClinic)
            if (noClinic.length > 0) {
                grouped.push({
                    clinicInternalId: null,
                    clinicId: null,
                    clinicName: 'No Clinic (Super Admin)',
                    maxSessions: 99,
                    userCount: 0,
                    sessions: noClinic,
                })
            }

            return res.status(200).json({
                grouped,
                totalActive: sessions.length,
            })
        } catch (err: any) {
            return res.status(500).json({ error: err.message || 'Failed to fetch sessions' })
        }
    }

    // ── DELETE: clear sessions ──────────────────────────────────────────────
    if (req.method === 'DELETE') {
        const { scope, clinicInternalId, sessionId } = req.body as {
            scope: 'all' | 'clinic' | 'session'
            clinicInternalId?: string
            sessionId?: number
        }

        try {
            let count = 0

            if (scope === 'all') {
                const result = await prisma.sessionRecord.deleteMany({
                    where: { isActive: true },
                })
                count = result.count
            } else if (scope === 'clinic' && clinicInternalId) {
                const result = await prisma.sessionRecord.deleteMany({
                    where: { clinicId: clinicInternalId, isActive: true },
                })
                count = result.count
            } else if (scope === 'session' && sessionId) {
                const result = await prisma.sessionRecord.deleteMany({
                    where: { id: sessionId },
                })
                count = result.count
            } else {
                return res.status(400).json({ error: 'Invalid scope or missing parameters' })
            }

            return res.status(200).json({ ok: true, cleared: count })
        } catch (err: any) {
            return res.status(500).json({ error: err.message || 'Failed to clear sessions' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
