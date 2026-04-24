import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireStaffOrAbove } from '../../../lib/auth'
import { getClinicAwareDoctorFilter } from '../../../lib/doctorUtils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireStaffOrAbove(req, res)
    if (!user) return

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const idsRaw = Array.isArray(req.body?.ids) ? req.body.ids : []
        const productIds = Array.from(new Set(idsRaw.map((id: any) => Number(id)).filter((id: number) => Number.isInteger(id) && id > 0)))

        if (!productIds.length) {
            return res.status(400).json({ error: 'ids[] is required' })
        }

        const whereClause = await getClinicAwareDoctorFilter(user, prisma)
        const products = await prisma.product.findMany({
            where: {
                id: { in: productIds },
                ...whereClause,
            },
            select: { id: true },
        })

        if (products.length !== productIds.length) {
            return res.status(403).json({ error: 'Some selected products were not found or access denied' })
        }

        const result = await prisma.product.updateMany({
            where: {
                id: { in: productIds },
            },
            data: {
                priceRupees: 0,
                purchasePriceRupees: 0,
                purchasePricePerUnit: 0,
                quantity: 0,
                actualInventory: 0,
                inventoryValue: 0,
                purchaseValue: 0,
                salesValue: 0,
                totalPurchased: 0,
                totalSales: 0,
                latestBatchNumber: null,
            },
        })

        return res.status(200).json({ success: true, count: result.count })
    } catch (err: any) {
        return res.status(500).json({ error: String(err?.message || err) })
    }
}
