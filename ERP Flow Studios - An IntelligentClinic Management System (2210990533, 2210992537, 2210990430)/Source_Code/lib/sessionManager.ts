/**
 * Session Record Management
 * Tracks active sessions per clinic to enforce concurrent login limits.
 * Rule: max (numUsers × 2) simultaneous active sessions for Basic clinics,
 *       max (numUsers × 4) simultaneous active sessions for Pro clinics.
 * If limit is exceeded, ALL excess sessions are evicted (oldest first).
 *
 * Stale session auto-cleanup: sessions with no activity for >24 h are
 * automatically marked inactive during every login, preventing zombie
 * sessions from blocking real users.
 */
import prisma from './prisma'
import { writeAuditLog } from './auditLog'

/** 24 hours in milliseconds — sessions idle longer than this are auto-reaped. */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000

export async function registerSession(params: {
    userId: number
    clinicInternalId: string | null  // Clinic.id (cuid)
    sessionToken: string
    ipAddress?: string | null
    userAgent?: string | null
    location?: string | null
}): Promise<{ evicted: boolean; evictedCount: number }> {
    const { userId, clinicInternalId, sessionToken, ipAddress, userAgent, location } = params

    // ── Step 1: Close ALL previous sessions for this user ──────────────────
    // DELETE the records so that stale cookies trigger a normal "please log in"
    // redirect, NOT the "Session Limit Reached" message. Only concurrent-limit
    // evictions (Step 4 below) keep a record with isActive=false — that is the
    // only case that should ever show the eviction warning.
    try {
        await prisma.sessionRecord.deleteMany({
            where: { userId, isActive: true },
        })
    } catch {
        // Best-effort — don't block login if cleanup query fails
    }

    // Also hard-delete any clinic-wide stale sessions (>24h idle from OTHER users)
    const staleDate = new Date(Date.now() - STALE_THRESHOLD_MS)
    if (clinicInternalId) {
        try {
            await prisma.sessionRecord.deleteMany({
                where: { clinicId: clinicInternalId, isActive: true, lastActive: { lt: staleDate } },
            })
        } catch { /* best-effort */ }
    }

    // ── Step 2: Create the new session record ───────────────────────────────
    await prisma.sessionRecord.create({
        data: {
            userId,
            clinicId: clinicInternalId,
            sessionToken,
            ipAddress: ipAddress || null,
            userAgent: userAgent || null,
            location: location || null,
            isActive: true,
            lastActive: new Date(),
        },
    })

    // If no clinic, no limit to enforce
    if (!clinicInternalId) {
        return { evicted: false, evictedCount: 0 }
    }

    // ── Step 3: Enforce concurrent session limit ────────────────────────────
    const [activeSessions, clinicWithUsers] = await Promise.all([
        prisma.sessionRecord.findMany({
            where: { clinicId: clinicInternalId, isActive: true },
            orderBy: { createdAt: 'asc' }, // oldest first
        }),
        prisma.clinic.findUnique({
            where: { id: clinicInternalId },
            include: { _count: { select: { users: true } } },
        }),
    ])

    if (!clinicWithUsers) return { evicted: false, evictedCount: 0 }

    const sessionMultiplier = clinicWithUsers.subscriptionPlan === 'pro' ? 4 : 2
    const maxSessions = clinicWithUsers._count.users * sessionMultiplier

    if (activeSessions.length > maxSessions) {
        // Evict ALL excess sessions (oldest first), never the one we just created
        const excess = activeSessions.length - maxSessions
        const toEvict = activeSessions
            .filter((s : any) => s.sessionToken !== sessionToken)
            .slice(0, excess)

        if (toEvict.length > 0) {
            await prisma.sessionRecord.updateMany({
                where: { id: { in: toEvict.map((s : any) => s.id) } },
                data: { isActive: false },
            })
        }

        return { evicted: toEvict.length > 0, evictedCount: toEvict.length }
    }

    return { evicted: false, evictedCount: 0 }
}

export async function invalidateSession(sessionToken: string) {
    try {
        // DELETE the record so the stale cookie causes a normal login redirect,
        // not the misleading "Session Limit Reached" message.
        await prisma.sessionRecord.deleteMany({
            where: { sessionToken }
        })
    } catch {
        // Ignore errors - session record may not exist
    }
}

/**
 * Invalidate ALL active sessions for a given user.
 * Useful as a nuclear "log me out everywhere" and for admin force-logout.
 * Records are DELETED (not deactivated) so stale cookies don't trigger the
 * session-eviction warning.
 */
export async function invalidateUserSessions(userId: number, clinicId?: string | null) {
    try {
        const where: any = { userId }
        if (clinicId) where.clinicId = clinicId
        await prisma.sessionRecord.deleteMany({ where })
    } catch {
        // Best-effort
    }
}

export async function isSessionActive(sessionToken: string): Promise<boolean> {
    const record = await prisma.sessionRecord.findUnique({
        where: { sessionToken },
        select: { isActive: true, expiresAt: true }
    })
    // If no record exists, the session is considered valid (backward compat)
    if (!record) return true
    if (!record.isActive) return false
    // Check temporary session expiry (geo-bypass 30-min sessions)
    if (record.expiresAt && record.expiresAt < new Date()) {
        // Mark as inactive
        await prisma.sessionRecord.updateMany({ where: { sessionToken }, data: { isActive: false } }).catch(() => {})
        return false
    }
    return true
}

export async function touchSession(sessionToken: string) {
    try {
        await prisma.sessionRecord.updateMany({
            where: { sessionToken, isActive: true },
            data: { lastActive: new Date() }
        })
    } catch {
        // Best-effort
    }
}

export async function getClinicSessionCount(clinicInternalId: string): Promise<number> {
    return prisma.sessionRecord.count({
        where: { clinicId: clinicInternalId, isActive: true }
    })
}

export async function clearAllClinicSessions(clinicInternalId: string): Promise<number> {
    try {
        const result = await prisma.sessionRecord.deleteMany({
            where: { clinicId: clinicInternalId }
        })
        return result.count
    } catch {
        return 0
    }
}
