import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { requireStaffOrAbove } from '../../lib/auth'
import { getClinicAwareDoctorFilter } from '../../lib/doctorUtils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Product batches restricted to staff and above
    const user = await requireStaffOrAbove(req, res)
    if (!user) return
    
    if (req.method === 'GET') {
        try {
            // Filter batches by clinic through product relationship
            const doctorFilter = await getClinicAwareDoctorFilter(user, prisma)
            const items = await prisma.productBatch.findMany({ 
                where: {
                    product: doctorFilter
                },
                orderBy: { createdAt: 'desc' },
                include: {
                    product: true
                }
            })
            return res.status(200).json(items)
        } catch (err: any) {
            if (err?.code === 'P2021' || err?.code === 'P2022') return res.status(200).json([])
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    if (req.method === 'POST') {
        const { productId, sku, quantity, purchasePriceRupees, salePriceRupees, expiry } = req.body
        try {
            const doctorFilter = await getClinicAwareDoctorFilter(user, prisma)
            const product = await prisma.product.findFirst({
                where: { id: Number(productId), ...doctorFilter },
                select: { id: true }
            })
            if (!product) {
                return res.status(404).json({ error: 'Product not found or access denied' })
            }
            const b = await prisma.productBatch.create({ data: { productId: Number(productId), sku, quantity: Number(quantity), purchasePriceRupees: Number(purchasePriceRupees), salePriceRupees: Number(salePriceRupees), expiry: expiry ? new Date(expiry) : null } })
            return res.status(201).json(b)
        } catch (err: any) {
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
