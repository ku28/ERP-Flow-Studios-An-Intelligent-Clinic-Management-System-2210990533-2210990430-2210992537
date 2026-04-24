import { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../../lib/auth'
import prisma from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        // Verify user is authenticated
        const user = await getSessionUser(req)

        if (!user || (user.role?.toLowerCase() !== 'admin' && user.role?.toLowerCase() !== 'doctor')) {
            return res.status(403).json({ error: 'Forbidden' })
        }

        const clinicId = user.clinicId || user.clinic?.id
        
        // Super admin must be logged into a specific clinic to access receptionists
        if (user.role === 'super_admin' && !clinicId) {
            return res.status(403).json({ error: 'Super admin must log into a clinic to access receptionists' })
        }
        
        if (!clinicId) {
            return res.status(403).json({ error: 'No clinic association' })
        }

        // Fetch all receptionists
        const receptionists = await prisma.user.findMany({
            where: {
                clinicId,
                OR: [
                    { role: 'receptionist' },
                    { role: 'Receptionist' }
                ]
            },
            select: {
                id: true,
                name: true,
                email: true,
                profileImage: true
            },
            orderBy: {
                name: 'asc'
            }
        })

        return res.status(200).json({ receptionists })
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' })
    }
}
