import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireAuth } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const user = await requireAuth(req, res)
        if (!user) {
            return
        }

        // Admin and receptionist can get the list of all doctors in their clinic
        // Doctors can only see themselves
        let doctors

        if (user.role === 'admin' || user.role === 'receptionist') {
            // Filter doctors by clinic ID if user belongs to a clinic
            const whereClause: any = {
                role: 'doctor'
            }
            
            if (user.clinicId) {
                whereClause.clinicId = user.clinicId
            }
            
            doctors = await prisma.user.findMany({
                where: whereClause,
                select: {
                    id: true,
                    name: true,
                    email: true,
                    profileImage: true
                },
                orderBy: { name: 'asc' }
            })
        } else if (user.role === 'doctor') {
            doctors = [{
                id: user.id,
                name: user.name,
                email: null,
                profileImage: null
            }]
        } else {
            return res.status(403).json({ error: 'Access denied' })
        }

        return res.status(200).json({ doctors })
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' })
    }
}
