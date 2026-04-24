import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireStaffOrAbove, getClinicIdFromUser } from '../../../lib/auth'
import { getDoctorIdForCreate } from '../../../lib/doctorUtils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    
    // Require authentication
    const user = await requireStaffOrAbove(req, res)
    if (!user) return
    
    const { firstName, lastName, phone } = req.body
    if (!firstName || !lastName) return res.status(400).json({ error: 'Missing fields' })
    
    try {
        const clinicId = getClinicIdFromUser(user)
        const doctorId = getDoctorIdForCreate(user)
        
        const p = await prisma.patient.create({ 
            data: { 
                firstName, 
                lastName, 
                phone,
                clinicId,
                doctorId
            } 
        })
        return res.status(201).json(p)
    } catch (err: any) { 
        return res.status(500).json({ error: String(err?.message || err) }) 
    }
}
