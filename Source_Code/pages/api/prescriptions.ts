import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { requireAuth, getClinicIdFromUser } from '../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // CRITICAL: Add authentication to prevent unauthorized access
    const user = await requireAuth(req, res)
    if (!user) return
    
    if (req.method === 'GET') {
        try {
            // Filter by clinicId through visit->patient relationship
            const clinicId = getClinicIdFromUser(user)
            const whereClause: any = {}
            
            if (clinicId) {
                whereClause.visit = {
                    patient: {
                        clinicId
                    }
                }
            }
            
            const items = await prisma.prescription.findMany({ 
                where: whereClause,
                orderBy: { createdAt: 'desc' } 
            })
            return res.status(200).json(items)
        } catch (err: any) {
            if (err?.code === 'P2021' || err?.code === 'P2022') return res.status(200).json([])
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    if (req.method === 'POST') {
        const { visitId, treatmentId, dosage, administration, quantity } = req.body
        try {
            // Verify visit belongs to user's clinic
            const clinicId = getClinicIdFromUser(user)
            if (clinicId) {
                const visit = await prisma.visit.findFirst({
                    where: { 
                        id: Number(visitId),
                        patient: { clinicId }
                    }
                })
                if (!visit) {
                    return res.status(404).json({ error: 'Visit not found or access denied' })
                }
            }
            
            const p = await prisma.prescription.create({ 
                data: { 
                    visitId: Number(visitId), 
                    treatmentId: Number(treatmentId), 
                    dosage, 
                    administration, 
                    quantity: Number(quantity || 1),
                    doctorId: user.id
                } 
            })
            return res.status(201).json(p)
        } catch (err: any) {
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
