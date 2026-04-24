import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireAuth, getClinicIdFromUser } from '../../../lib/auth'

async function handler(req: NextApiRequest, res: NextApiResponse) {
    
    // Require authentication for multi-tenant isolation
    const user = await requireAuth(req, res)
    if (!user) return
    
    if (req.method === 'POST') {
        const { opdNos } = req.body


        if (!Array.isArray(opdNos) || opdNos.length === 0) {
            return res.status(400).json({ error: 'Invalid opdNos array' })
        }

        try {
            // Get clinic filter
            const clinicId = getClinicIdFromUser(user)
            const whereClause: any = {}
            if (clinicId) {
                whereClause.patient = { clinicId }
            }
            
            // Extract just the opdNo values for the query
            const opdNoValues = opdNos.map((item: any) => item.opdNo).filter(Boolean)
            
            
            // If no valid opdNos, all are unique
            if (opdNoValues.length === 0) {
                return res.status(200).json({
                    total: opdNos.length,
                    duplicates: 0,
                    unique: opdNos.length,
                    duplicateIndices: [],
                    uniqueIndices: opdNos.map((item: any) => item.index)
                })
            }
            
            // Batch query - get all existing visits with these opdNos within the clinic
            const existingVisits = await prisma.visit.findMany({
                where: {
                    ...whereClause,
                    opdNo: {
                        in: opdNoValues
                    }
                },
                select: {
                    opdNo: true
                }
            })


            // Create a Set for faster lookup
            const existingOpdNos = new Set(existingVisits.map((v: any) => v.opdNo))

            const duplicates: any[] = []
            const unique: any[] = []

            // Check each opdNo against the Set
            for (let i = 0; i < opdNos.length; i++) {
                const item = opdNos[i]
                
                if (item.opdNo && existingOpdNos.has(item.opdNo)) {
                    duplicates.push(item.index)
                } else {
                    unique.push(item.index)
                }
            }


            // Return minimal data to avoid large payloads
            return res.status(200).json({
                total: opdNos.length,
                duplicates: duplicates.length,
                unique: unique.length,
                // Only return the indices, not the full data
                duplicateIndices: duplicates,
                uniqueIndices: unique
            })
        } catch (error: any) {
            return res.status(500).json({ error: error.message || 'Failed to check duplicates' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}

export default handler
