import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { exchangeGmailCode } from '../../../lib/gmailAuth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    const { code, state: clinicId, error } = req.query

    if (error) {
        return res.redirect('/clinic-edit?tab=integrations&gmail=error&reason=denied')
    }

    if (!code || !clinicId || typeof code !== 'string' || typeof clinicId !== 'string') {
        return res.redirect('/clinic-edit?tab=integrations&gmail=error&reason=invalid')
    }

    try {
        const tokens = await exchangeGmailCode(code)
        const existingClinic = await prisma.clinic.findUnique({
            where: { id: clinicId },
            select: { email: true }
        })

        await prisma.clinic.update({
            where: { id: clinicId },
            data: {
                emailProvider: 'gmail',
                gmailAccessToken: tokens.access_token,
                gmailRefreshToken: tokens.refresh_token,
                gmailEmail: tokens.email || existingClinic?.email || '',
                gmailTokenExpiry: new Date(tokens.expiry_date),
            },
        })

        const finalEmail = tokens.email || existingClinic?.email || ''
        return res.redirect(`/clinic-edit?tab=integrations&gmail=success&gmailEmail=${encodeURIComponent(finalEmail)}`)
    } catch (err: any) {
        console.error('[gmail-callback]', err.message)
        return res.redirect('/clinic-edit?tab=integrations&gmail=error&reason=exchange')
    }
}
