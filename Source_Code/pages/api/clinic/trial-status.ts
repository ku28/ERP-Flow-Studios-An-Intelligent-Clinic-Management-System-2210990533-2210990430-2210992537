import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { hasAvailedTrial } from '../../../lib/trialRegistry'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    const email = String(req.query.email || '').trim().toLowerCase()
    if (!email) return res.status(400).json({ error: 'Email is required' })

    try {
        const availedInRegistry = await hasAvailedTrial(email)
        const [clinic, pendingClinic, user] = await Promise.all([
            prisma.clinic.findUnique({ where: { email }, select: { id: true, subscriptionStart: true } }),
            prisma.pendingClinic.findUnique({ where: { adminEmail: email }, select: { id: true, status: true } }),
            prisma.user.findUnique({ where: { email }, select: { id: true } }),
        ])

        const trialAvailed = Boolean(availedInRegistry || clinic || pendingClinic || user)
        return res.status(200).json({
            trialAvailed,
            message: trialAvailed
                ? 'This email has already been used for a clinic account or trial.'
                : 'This email is eligible for trial registration.',
        })
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Failed to check trial status' })
    }
}
