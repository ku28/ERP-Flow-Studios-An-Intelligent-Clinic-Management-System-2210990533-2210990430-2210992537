import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAdmin } from '../../../lib/auth'
import prisma from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const user = await requireAdmin(req, res)
        if (!user) return // requireAdmin already sent error response

        const { clinicId } = req.body

        if (!clinicId) {
            return res.status(400).json({ error: 'Clinic ID is required' })
        }

        // Verify the user belongs to the clinic they're trying to delete
        if (user.clinicId !== clinicId) {
            return res.status(403).json({ error: 'You can only delete your own clinic' })
        }

        // Delete the clinic (this will cascade delete all related records due to Prisma schema)
        await prisma.clinic.delete({
            where: { clinicId }
        })

        // Clear the session cookie
        res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0')

        return res.status(200).json({ 
            success: true,
            message: 'Clinic deleted successfully'
        })
    } catch (error: any) {
        return res.status(500).json({ 
            error: error.message || 'Failed to delete clinic' 
        })
    }
}
