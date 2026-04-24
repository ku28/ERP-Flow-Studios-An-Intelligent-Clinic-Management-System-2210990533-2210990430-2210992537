import { NextApiRequest, NextApiResponse } from 'next'
import { verifySessionToken, setSessionCookie } from '../../../lib/auth'
import prisma from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { sessionToken, clinicId } = req.body

        if (!sessionToken) {
            return res.status(400).json({ error: 'Session token required' })
        }

        if (clinicId && (typeof clinicId !== 'string' || !/^\d{6}$/.test(clinicId))) {
            return res.status(400).json({ error: 'Invalid clinic access code format' })
        }

        // Verify the token
        const data = verifySessionToken(sessionToken)

        if (!data) {
            return res.status(401).json({ error: 'Invalid session token' })
        }

        // Check if user still exists and include clinic info
        const user = await prisma.user.findUnique({
            where: { id: Number(data.sub) },
            include: {
                clinic: true
            }
        })

        if (!user) {
            return res.status(401).json({ error: 'User not found' })
        }

        // Critical safety check: when a clinic code is provided by the caller,
        // only allow switching into a session that belongs to that exact clinic.
        if (clinicId) {
            const userClinicCode = user.clinic?.clinicId || null
            if (!userClinicCode || userClinicCode !== clinicId) {
                return res.status(403).json({ error: 'Session does not belong to selected clinic' })
            }
        }

        // Set the session cookie with the provided token
        setSessionCookie(res, sessionToken)

        return res.status(200).json({
            success: true,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                profileImage: user.profileImage,
                clinicId: user.clinicId,
                clinic: user.clinic
            }
        })
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' })
    }
}
