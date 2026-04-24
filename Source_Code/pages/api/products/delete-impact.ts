import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireStaffOrAbove } from '../../../lib/auth'
import { getClinicAwareDoctorFilter } from '../../../lib/doctorUtils'

interface ProductImpact {
    id: number
    name: string
    categoryName: string
    flowInventory: number
    minStockLevel: number
    totalPurchased: number
    totalSales: number
    usage: {
        prescriptions: number
        invoiceItems: number
        treatmentPlans: number
        purchaseOrderItems: number
        stockTransactions: number
        batches: number
        productOrders: number
        forecasts: number
        billMappings: number
    }
    totalUsageCount: number
    isUsed: boolean
    isRecoverable: boolean
}

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

        if (productIds.length > 1000) {
            return res.status(400).json({ error: 'Too many products selected for impact analysis' })
        }

        const whereClause = await getClinicAwareDoctorFilter(user, prisma)
        const products = await prisma.product.findMany({
            where: {
                id: { in: productIds },
                ...whereClause,
            },
            include: {
                category: true,
                _count: {
                    select: {
                        prescriptions: true,
                        customerInvoiceItems: true,
                        treatmentProducts: true,
                        purchaseOrderItems: true,
                        stockTransactions: true,
                        batches: true,
                        productOrders: true,
                        demandForecasts: true,
                        billMappings: true,
                    },
                },
            },
        })

        if (products.length !== productIds.length) {
            return res.status(403).json({ error: 'Some selected products were not found or access denied' })
        }

        const impactRows: ProductImpact[] = products.map((product: any) => {
            const usage = {
                prescriptions: product._count?.prescriptions || 0,
                invoiceItems: product._count?.customerInvoiceItems || 0,
                treatmentPlans: product._count?.treatmentProducts || 0,
                purchaseOrderItems: product._count?.purchaseOrderItems || 0,
                stockTransactions: product._count?.stockTransactions || 0,
                batches: product._count?.batches || 0,
                productOrders: product._count?.productOrders || 0,
                forecasts: product._count?.demandForecasts || 0,
                billMappings: product._count?.billMappings || 0,
            }

            const totalUsageCount = Object.values(usage).reduce((sum, count) => sum + Number(count || 0), 0)
            const historicalUsage = (Number(product.totalPurchased) || 0) > 0 || (Number(product.totalSales) || 0) > 0
            const isUsed = totalUsageCount > 0 || historicalUsage

            return {
                id: product.id,
                name: product.name,
                categoryName: product.category?.name || 'Uncategorized',
                flowInventory: Number(product.quantity) || 0,
                minStockLevel: Number(product.minStockLevel) || 0,
                totalPurchased: Number(product.totalPurchased) || 0,
                totalSales: Number(product.totalSales) || 0,
                usage,
                totalUsageCount,
                isUsed,
                // If used in records, deleting this product is destructive and cannot be fully restored.
                isRecoverable: !isUsed,
            }
        })

        const usedProducts = impactRows.filter((row) => row.isUsed)

        return res.status(200).json({
            summary: {
                total: impactRows.length,
                used: usedProducts.length,
                notUsed: impactRows.length - usedProducts.length,
                hasIrreversibleImpact: usedProducts.length > 0,
            },
            products: impactRows,
        })
    } catch (err: any) {
        return res.status(500).json({ error: String(err?.message || err) })
    }
}
