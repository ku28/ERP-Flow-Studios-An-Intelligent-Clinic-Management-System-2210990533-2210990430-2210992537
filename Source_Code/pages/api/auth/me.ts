import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser, verifySessionToken } from '../../../lib/auth'
import { isSessionActive, touchSession } from '../../../lib/sessionManager'
import { enforceClinicLifecycle } from '../../../lib/subscriptionLifecycleServer'
import { getDeletionEligibleDate, getTrialSummary, shouldForceUpgrade } from '../../../lib/subscriptionLifecycle'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Extract session token to check if it was evicted
    const raw = req.headers.cookie || ''
    const match = raw.split(';').map((s: string) => s.trim()).find((s: string) => s.startsWith('session='))
    // Use substring (not split) to safely handle tokens that may contain '='
    const token = match ? match.substring(match.indexOf('=') + 1) : null

    if (token) {
        const active = await isSessionActive(token)
        if (!active) {
            // Session was evicted — silently treat as logged-out so the user gets
            // redirected to the normal login page with no alarming error message.
            // Clear the stale cookie to prevent repeated 'inactive' checks.
            res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0')
            return res.status(200).json({ user: null })
        }
        // Keep lastActive fresh so idle-cleanup doesn't evict active users
        touchSession(token).catch(() => {})
    }

    const user = await getSessionUser(req)
    if (!user) return res.status(200).json({ user: null })
    // Strip sensitive clinic fields before sending to client
    if (user.clinic) {
        const normalizedClinic = await enforceClinicLifecycle(user.clinic as any)
        const trial = getTrialSummary(normalizedClinic)
        const upgradeRequired = shouldForceUpgrade(normalizedClinic)
        const deletionDate = getDeletionEligibleDate(normalizedClinic)
        const { smtpPassword, gmailAccessToken, gmailRefreshToken, ...safeClinic } = user.clinic as any
        ;(safeClinic as any).gmailConnected = Boolean(gmailRefreshToken && String(gmailRefreshToken).trim())
        ;(safeClinic as any).status = normalizedClinic.status
        ;(safeClinic as any).subscriptionStatus = normalizedClinic.subscriptionStatus
        ;(safeClinic as any).subscriptionEnd = normalizedClinic.subscriptionEnd
        ;(safeClinic as any).trialEndsAt = normalizedClinic.trialEndsAt || trial.trialEnd
        ;(safeClinic as any).trialDaysLeft = trial.trialDaysLeft
        ;(safeClinic as any).trialDaysTotal = trial.trialDays
        ;(safeClinic as any).upgradeRequired = upgradeRequired
        ;(safeClinic as any).dataDeletionDate = deletionDate
        return res.status(200).json({ user: { ...user, clinic: safeClinic } })
    }
    return res.status(200).json({ user })
}
