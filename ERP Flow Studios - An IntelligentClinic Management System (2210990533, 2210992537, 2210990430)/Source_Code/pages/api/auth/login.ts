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
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const { emailOrPhone, password, email: legacyEmail, clinicId, locationLat, locationLng } = req.body
    
    // Support both old 'email' and new 'emailOrPhone' parameter for backwards compatibility
    const identifier = emailOrPhone || legacyEmail
    
    if (!identifier || !password) return res.status(400).json({ error: 'Email/phone and password required' })

    const ip = extractIP(req)
    const userAgent = req.headers['user-agent'] || null
    
    // Determine if input is email or phone
    const isEmail = identifier.includes('@')
    const isPhone = /^\d{10}$/.test(identifier)
    
    // Build where clause
    const whereClause: any = isEmail 
        ? { email: identifier }
        : isPhone 
            ? { phone: identifier }
            : { email: identifier } // Fallback to email for backwards compatibility
    
    // If clinicId is provided, filter by clinicId
    let clinicRecord: { id: string; name: string; clinicId: string } | null = null
    if (clinicId) {
        clinicRecord = await prisma.clinic.findUnique({
            where: { clinicId },
            select: { id: true, name: true, clinicId: true }
        })
        
        if (!clinicRecord) {
            return res.status(401).json({ error: 'Invalid clinic access code' })
        }
        
        whereClause.clinicId = clinicRecord.id
    }
    
    // Find user by email/phone and optionally clinicId
    const user = await prisma.user.findFirst({
        where: whereClause,
        include: { clinic: true }
    })
    
    if (!user) {
        // Log failed login attempt
        await writeAuditLog({
            action: 'Failed Login - User not found',
            category: 'authentication',
            severity: 'warning',
            userId: 0,
            userName: identifier,
            userRole: 'unknown',
            clinicId: clinicRecord?.clinicId || null,
            clinicName: clinicRecord?.name || null,
            details: { reason: 'User not found', identifier },
            req,
        })
        return res.status(401).json({ 
            error: clinicId 
                ? 'User not found in this clinic. Please check your credentials.' 
                : 'User not found' 
        })
    }

    let upgradeRequired = false
    let trialEndsAt: Date | null = null
    let trialDaysLeft = 0
    let dataDeletionDate: Date | null = null

    if (user.clinic) {
        const normalizedClinic = await enforceClinicLifecycle(user.clinic as any)
        if (shouldForceUpgrade(normalizedClinic)) {
            const trial = getTrialSummary(normalizedClinic)
            const deletionDate = getDeletionEligibleDate(normalizedClinic)
            upgradeRequired = true
            trialEndsAt = trial.trialEnd
            trialDaysLeft = trial.trialDaysLeft
            dataDeletionDate = deletionDate

            if (user.role !== 'admin') {
                return res.status(403).json({
                    error: 'This clinic trial is expired. Please login with admin email only to continue upgrade process.',
                    upgradeRequired: true,
                    adminOnly: true,
                    upgradeUrl: '/upgrade',
                    trialEndsAt,
                    trialDaysLeft,
                    dataDeletionDate,
                })
            }
        }
    }

    if (!user.passwordHash) return res.status(401).json({ error: 'User has no password set' })

    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) {
        // Log failed login - wrong password
        await writeAuditLog({
            action: 'Failed Login - Invalid password',
            category: 'authentication',
            severity: 'warning',
            userId: user.id,
            userName: user.name || identifier,
            userRole: user.role,
            clinicId: clinicRecord?.clinicId || user.clinic?.clinicId || null,
            clinicName: clinicRecord?.name || user.clinic?.name || null,
            details: { reason: 'Invalid password', identifier },
            req,
            locationLat: locationLat ? parseFloat(locationLat) : null,
            locationLng: locationLng ? parseFloat(locationLng) : null,
        })
        return res.status(401).json({ error: 'Invalid credentials' })
    }

    // If clinicId was provided but user doesn't have one, assign it to them
    if (clinicId && !user.clinicId && clinicRecord) {
        await prisma.user.update({
            where: { id: user.id },
            data: { clinicId: clinicRecord.id }
        })
    }

    const sessionTtlSeconds = getSessionTtlSeconds(user.clinic?.subscriptionPlan)
    const token = createSessionTokenWithOptions({ sub: user.id }, { expiresInSeconds: sessionTtlSeconds })
    setSessionCookie(res, token, sessionTtlSeconds)

    // Resolve final clinicInternalId and location
    const clinicInternalId = user.clinicId || clinicRecord?.id || null
    const location = await getLocationFromIP(ip).catch(() => null)

    // Register session & enforce concurrent session limit
    const { evicted, evictedCount } = await registerSession({
        userId: user.id,
        clinicInternalId,
        sessionToken: token,
        ipAddress: ip,
        userAgent: userAgent as string,
        location,
    })

    // Resolve clinic details for audit log
    const finalClinic = clinicRecord || user.clinic
    const clinicCodeForLog = finalClinic?.clinicId || null
    const clinicNameForLog = finalClinic?.name || null

    // Log successful login
    await writeAuditLog({
        action: `Login${evicted ? ` (${evictedCount} stale session${evictedCount > 1 ? 's' : ''} evicted)` : ''}`,
        category: 'authentication',
        severity: evicted ? 'warning' : 'ok',
        userId: user.id,
        userName: user.name || identifier,
        userRole: user.role,
        clinicId: clinicCodeForLog,
        clinicName: clinicNameForLog,
        details: {
            method: isEmail ? 'email' : 'phone',
            ...(evicted ? { sessionEvicted: true, evictedCount } : {})
        },
        ipAddress: ip,
        userAgent: userAgent as string,
        locationLat: locationLat ? parseFloat(locationLat) : null,
        locationLng: locationLng ? parseFloat(locationLng) : null,
    })

    return res.status(200).json({
        ok: true,
        sessionToken: token,
        evicted,
        upgradeRequired,
        trialEndsAt,
        trialDaysLeft,
        dataDeletionDate,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            profileImage: user.profileImage,
            clinicId: user.clinicId
        }
    })
}
