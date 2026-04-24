/**
 * GET /api/clinic/geo-access-redeem?token=SESSION_TOKEN&clinicId=PUBLIC_ID
 * Redeems an approved geo access request:
 * - Validates the session token exists and is still active/not expired
 * - Sets the session cookie
 * - Redirects to /dashboard
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { token, clinicId } = req.query

    if (!token || typeof token !== 'string') {
        return res.redirect(`/clinic-login?error=invalid_token`)
    }

    try {
        const record = await prisma.sessionRecord.findUnique({
            where: { sessionToken: token },
            select: { isActive: true, expiresAt: true }
        })

        if (!record || !record.isActive) {
            return res.redirect(`/clinic-login?error=session_invalid`)
        }

        if (record.expiresAt && record.expiresAt < new Date()) {
            return res.redirect(`/clinic-login?error=session_expired`)
        }

        // Set the session cookie (30 min)
        const maxAge = 30 * 60
        const cookie = `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}` +
            (process.env.NODE_ENV === 'production' ? '; Secure' : '')
        res.setHeader('Set-Cookie', cookie)

        // Store clinicId in a client-readable cookie for the UI
        if (clinicId) {
            const clinicCookie = `clinicId=${clinicId}; Path=/; SameSite=Lax; Max-Age=${maxAge}` +
                (process.env.NODE_ENV === 'production' ? '; Secure' : '')
            res.setHeader('Set-Cookie', [cookie, clinicCookie])
        }

        return res.redirect('/dashboard')
    } catch (error) {
        console.error('Redeem error:', error)
        return res.redirect(`/clinic-login?error=redeem_failed`)
    }
}
