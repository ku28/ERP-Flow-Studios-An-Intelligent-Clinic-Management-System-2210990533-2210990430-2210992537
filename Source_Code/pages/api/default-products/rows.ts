import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireStaffOrAbove } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireStaffOrAbove(req, res)
    if (!user) return

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const latestVersionResult = await prisma.defaultProduct.aggregate({
            _max: { version: true }
        })
        const latestVersion = latestVersionResult._max.version

        if (!latestVersion) {
            return res.status(404).json({ error: 'No default product templates found' })
        }

        const defaults = await prisma.defaultProduct.findMany({
            where: { version: latestVersion },
            orderBy: { id: 'asc' }
        })

        const seen = new Set<string>()
        const products = defaults
            .filter((row: any) => {
                const name = String(row?.name || '').trim()
                if (!name) return false
                const key = name.toLowerCase()
                if (seen.has(key)) return false
                seen.add(key)
                return true
            })
            .map((row: any) => ({
                name: String(row.name || '').trim(),
                priceRupees: Number(row.priceRupees) || 0,
                quantity: Number(row.quantity) || 0,
                latestBatchNumber: row.latestBatchNumber || undefined,
                purchasePriceRupees: row.purchasePriceRupees !== null && row.purchasePriceRupees !== undefined
                    ? Number(row.purchasePriceRupees)
                    : undefined,
                unit: row.unit || undefined,
                category: row.category || undefined,
                minStockLevel: row.minStockLevel !== null && row.minStockLevel !== undefined
                    ? Number(row.minStockLevel)
                    : undefined,
                actualInventory: row.actualInventory !== null && row.actualInventory !== undefined
                    ? Number(row.actualInventory)
                    : undefined,
                inventoryValue: row.inventoryValue !== null && row.inventoryValue !== undefined
                    ? Number(row.inventoryValue)
                    : undefined,
                latestUpdate: row.latestUpdate ? new Date(row.latestUpdate).toISOString() : undefined,
                purchaseValue: row.purchaseValue !== null && row.purchaseValue !== undefined
                    ? Number(row.purchaseValue)
                    : undefined,
                salesValue: row.salesValue !== null && row.salesValue !== undefined
                    ? Number(row.salesValue)
                    : undefined,
                totalPurchased: row.totalPurchased !== null && row.totalPurchased !== undefined
                    ? Number(row.totalPurchased)
                    : undefined,
                totalSales: row.totalSales !== null && row.totalSales !== undefined
                    ? Number(row.totalSales)
                    : undefined
            }))

        return res.status(200).json({
            success: true,
            latestVersion,
            count: products.length,
            products
        })
    } catch (err: any) {
        return res.status(500).json({ error: String(err?.message || err) })
    }
}
