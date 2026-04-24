import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { createSessionTokenWithOptions, setSessionCookie } from '../../../lib/auth'
import { getSessionTtlSeconds } from '../../../lib/subscription'

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { loginToken, clinicId } = req.body

        if (!loginToken || !clinicId) {
            return res.status(400).json({ error: 'Missing required fields' })
        }

        // Find the access request with this login token
        const request = await prisma.clinicAccessRequest.findFirst({
            where: {
                userEmail: loginToken, // We stored loginToken in userEmail field
                clinicId: clinicId, // This is the 6-digit clinic code
                status: 'approved',
                requestType: 'login_request'
            }
        })

        if (!request) {
            return res.status(404).json({ error: 'Invalid or expired login token' })
        }

        // Check if token has expired (stored in approvedAt field)
        if (request.approvedAt && request.approvedAt < new Date()) {
            return res.status(410).json({ error: 'Login token has expired' })
        }

        // Find the clinic by its 6-digit code
        const clinic = await prisma.clinic.findUnique({
            where: { clinicId: clinicId }
        })

        if (!clinic) {
            return res.status(404).json({ error: 'Clinic not found' })
        }

        // Find the user
        const user = await prisma.user.findUnique({
            where: { email: request.clinicAdminEmail },
            include: {
                clinic: true
            }
        })

        if (!user) {
            return res.status(404).json({ error: 'User not found' })
        }

        // Verify user belongs to the clinic (compare internal IDs)
        if (user.clinicId !== clinic.id) {
            return res.status(403).json({ error: 'User does not belong to this clinic' })
        }

        // Create JWT session token
        const sessionTtlSeconds = getSessionTtlSeconds(user.clinic?.subscriptionPlan)
        const sessionToken = createSessionTokenWithOptions({
            sub: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            clinicId: user.clinicId
        }, { expiresInSeconds: sessionTtlSeconds })

        // Invalidate the login token by clearing it from the request
        await prisma.clinicAccessRequest.update({
            where: { id: request.id },
            data: {
                userEmail: null,
                approvedAt: null
            }
        })

        // Set session cookie
        setSessionCookie(res, sessionToken, sessionTtlSeconds)

        // Also set clinicId cookie for frontend
        const maxAge = sessionTtlSeconds
        res.setHeader('Set-Cookie', [
            `session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}` + (process.env.NODE_ENV === 'production' ? '; Secure' : ''),
            `clinicId=${clinicId}; Path=/; Max-Age=${maxAge}`
        ])

        // Determine redirect URL based on role
        const redirectUrl = user.role === 'receptionist' ? '/patients' : '/dashboard'

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            redirectUrl,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        })

    } catch (error) {
        return res.status(500).json({ error: 'Failed to auto-login' })
    }
}
