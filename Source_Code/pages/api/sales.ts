import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { requireStaffOrAbove } from '../../lib/auth'
import { getClinicAwareDoctorFilter } from '../../lib/doctorUtils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireStaffOrAbove(req, res)
    if (!user) return
    
    if (req.method === 'GET') {
        try {
            // Filter sales by clinic through product relationship
            const doctorFilter = await getClinicAwareDoctorFilter(user, prisma)
            const items = await prisma.sale.findMany({ 
                where: {
                    productBatch: {
                        product: doctorFilter
                    }
                },
                orderBy: { date: 'desc' },
                include: {
                    productBatch: {
                        include: {
                            product: true
                        }
                    }
                }
            })
            return res.status(200).json(items)
        } catch (err: any) {
            if (err?.code === 'P2021' || err?.code === 'P2022') return res.status(200).json([])
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    if (req.method === 'POST') {
        const { productBatchId, quantity, totalCents, customer } = req.body
        try {
            const doctorFilter = await getClinicAwareDoctorFilter(user, prisma)
            const batch = await prisma.productBatch.findFirst({
                where: {
                    id: Number(productBatchId),
                    product: doctorFilter
                },
                select: { id: true }
            })
            if (!batch) {
                return res.status(404).json({ error: 'Product batch not found or access denied' })
            }
            const s = await prisma.sale.create({ data: { productBatchId: Number(productBatchId), quantity: Number(quantity), totalCents: Number(totalCents), customer } })
            return res.status(201).json(s)
        } catch (err: any) {
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
