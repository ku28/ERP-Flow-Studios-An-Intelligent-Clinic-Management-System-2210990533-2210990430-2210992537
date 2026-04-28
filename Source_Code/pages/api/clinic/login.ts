import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { createSessionTokenWithOptions, setSessionCookie } from '../../../lib/auth'
import bcrypt from 'bcryptjs'
import { writeAuditLog, extractIP, getLocationFromIP } from '../../../lib/auditLog'
import { registerSession } from '../../../lib/sessionManager'
import { getSessionTtlSeconds } from '../../../lib/subscription'
import { getDeletionEligibleDate, getTrialSummary, shouldForceUpgrade } from '../../../lib/subscriptionLifecycle'
import { enforceClinicLifecycle } from '../../../lib/subscriptionLifecycleServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { clinicId, email, password, locationLat, locationLng } = req.body

    if (!clinicId || !email || !password) {
        return res.status(400).json({ error: 'Clinic ID, email, and password are required' })
    }

    const ip = extractIP(req)
    const userAgent = req.headers['user-agent'] || null

    try {
        // Find clinic by clinic ID
        const clinic = await prisma.clinic.findUnique({
            where: { clinicId },
            include: { _count: { select: { users: true } } }
        })

        if (!clinic) {
            return res.status(404).json({ error: 'Invalid clinic access code' })
        }

        const normalizedClinic = await enforceClinicLifecycle(clinic as any)
        if (shouldForceUpgrade(normalizedClinic)) {
            const trial = getTrialSummary(normalizedClinic)
            const deletionDate = getDeletionEligibleDate(normalizedClinic)
            return res.status(402).json({
                error: trial.trialDaysLeft > 0
                    ? `Free trial ends in ${trial.trialDaysLeft} day(s). Upgrade to continue access.`
                    : 'Free trial is over. Upgrade is required to continue using the clinic.',
                upgradeRequired: true,
                upgradeUrl: '/upgrade',
                trialEndsAt: trial.trialEnd,
                trialDaysLeft: trial.trialDaysLeft,
                dataDeletionDate: deletionDate,
            })
        }

        if (normalizedClinic.status !== 'active') {
            return res.status(403).json({ error: 'This clinic is not active' })
        }

        // Find user by email and clinicId
        const user = await prisma.user.findFirst({
            where: {
                email,
                clinicId: clinic.id
            }
        })

        if (!user) {
            await writeAuditLog({
                action: 'Failed Login - User not found in clinic',
                category: 'authentication',
                severity: 'warning',
                userId: 0,
                userName: email,
                userRole: 'unknown',
                clinicId: clinic.clinicId,
                clinicName: clinic.name,
                details: { reason: 'User not found', email },
                req,
            })
            return res.status(401).json({ error: 'Invalid credentials' })
        }

        if (!user.passwordHash) {
            return res.status(401).json({ error: 'User has no password set' })
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.passwordHash)
        if (!isValidPassword) {
            await writeAuditLog({
                action: 'Failed Login - Invalid password',
                category: 'authentication',
                severity: 'warning',
                userId: user.id,
                userName: user.name || email,
                userRole: user.role,
                clinicId: clinic.clinicId,
                clinicName: clinic.name,
                details: { reason: 'Invalid password', email },
                req,
                locationLat: locationLat ? parseFloat(locationLat) : null,
                locationLng: locationLng ? parseFloat(locationLng) : null,
            })
            return res.status(401).json({ error: 'Invalid credentials' })
        }

        // Create session token
        const sessionTtlSeconds = getSessionTtlSeconds(normalizedClinic.subscriptionPlan)
        const token = createSessionTokenWithOptions({ sub: user.id }, { expiresInSeconds: sessionTtlSeconds })
        setSessionCookie(res, token, sessionTtlSeconds)

        // Get location from IP
        const location = await getLocationFromIP(ip).catch(() => null)

        // Register session & enforce concurrent session limit
        const { evicted, evictedCount } = await registerSession({
            userId: user.id,
            clinicInternalId: clinic.id,
            sessionToken: token,
            ipAddress: ip,
            userAgent: userAgent as string,
            location,
        })

        // Log successful login
        await writeAuditLog({
            action: `Clinic Login${evicted ? ` (${evictedCount} stale session${evictedCount > 1 ? 's' : ''} evicted)` : ''}`,
            category: 'authentication',
            severity: evicted ? 'warning' : 'ok',
            userId: user.id,
            userName: user.name || email,
            userRole: user.role,
            clinicId: clinic.clinicId,
            clinicName: clinic.name,
            details: {
                email,
                ...(evicted ? { sessionEvicted: true } : {}),
                ...(locationLat ? { browserLat: locationLat, browserLng: locationLng } : {})
            },
            ipAddress: ip,
            userAgent: userAgent as string,
            locationLat: locationLat ? parseFloat(locationLat) : null,
            locationLng: locationLng ? parseFloat(locationLng) : null,
        })

        return res.status(200).json({ 
            success: true,
            evicted,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                clinicId: clinic.clinicId,
                clinicName: clinic.name
            }
        })

    } catch (error: any) {
        return res.status(500).json({ 
            error: 'Login failed. Please try again later.',
            details: error.message 
        })
    }
}
