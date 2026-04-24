import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { verifySessionToken } from '../../../lib/auth'

const VALID_GRADIENTS = ['blue', 'purple', 'emerald', 'rose', 'teal']

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'PUT') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        // Verify user is super admin
        const token = req.cookies.session
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' })
        }

        const decoded = verifySessionToken(token)
        const user = await prisma.user.findUnique({
            where: { id: decoded.sub }
        })

        if (!user || user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' })
        }

        const { clinicId, themeGradient } = req.body

        if (!clinicId || !themeGradient) {
            return res.status(400).json({ error: 'clinicId and themeGradient are required' })
        }

        if (!VALID_GRADIENTS.includes(themeGradient)) {
            return res.status(400).json({ error: `Invalid gradient. Must be one of: ${VALID_GRADIENTS.join(', ')}` })
        }

        const clinic = await prisma.clinic.update({
            where: { id: clinicId },
            data: { themeGradient }
        })

        return res.status(200).json({ 
            message: 'Theme updated successfully',
            themeGradient: clinic.themeGradient 
        })
    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to update theme' })
    }
}
