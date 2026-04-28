import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { requireAuth } from '../../lib/auth'
import { getClinicAwareDoctorFilter } from '../../lib/doctorUtils'

/**
 * Lightweight dashboard summary endpoint.
 * Returns only aggregate counts/sums needed for the dashboard cards,
 * instead of fetching 5 full API endpoints with all records.
 *
 * This dramatically reduces egress — the old approach fetched ALL products,
 * ALL invoices, ALL POs, ALL stock transactions, and 500 visits just to
 * compute a few summary numbers.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const user = await requireAuth(req, res)
    if (!user) return

    try {
        const whereClause = await getClinicAwareDoctorFilter(user, prisma)

        // Run all queries in parallel for speed
        const [
            lowStockProducts,
            pendingPOCount,
            invoiceAggregates,
            topSellingProducts,
            recentStockTx,
            recentVisits,
        ] = await Promise.all([
            // 1. Low stock products (only id, name, quantity, minStockLevel, totalPurchased, totalSales)
            prisma.product.findMany({
                where: whereClause,
                select: {
                    id: true,
                    name: true,
                    quantity: true,
                    minStockLevel: true,
                    totalPurchased: true,
                    totalSales: true,
                },
            }),

            // 2. Pending purchase orders — just a count
            prisma.purchaseOrder.count({
                where: { ...whereClause, status: 'pending' },
            }),

            // 3. Invoice aggregates — single DB aggregate instead of fetching all invoices
            prisma.customerInvoice.groupBy({
                by: ['status'],
                where: {
                    ...(user.role === 'super_admin'
                        ? {}
                        : { clinicId: user.clinicId || user.clinic?.id }),
                },
                _sum: { paidAmount: true },
                _count: { id: true },
            }),

            // 4. Top selling products — aggregated stock OUT transactions
            prisma.stockTransaction.groupBy({
                by: ['productId'],
                where: {
                    transactionType: 'OUT',
                    product: whereClause,
                },
                _sum: { quantity: true },
                orderBy: { _sum: { quantity: 'desc' } },
                take: 5,
            }),

            // 5. Recent stock transactions (5 only, minimal fields)
            prisma.stockTransaction.findMany({
                where: { product: whereClause },
                orderBy: { transactionDate: 'desc' },
                take: 5,
                select: {
                    transactionType: true,
                    quantity: true,
                    transactionDate: true,
                    product: { select: { name: true } },
                },
            }),

            // 6. Recent visits (5 only, minimal fields) — Visit has no clinicId, filter through patient
            prisma.visit.findMany({
                where: {
                    ...(user.role === 'super_admin'
                        ? {}
                        : { patient: { clinicId: user.clinicId || user.clinic?.id } }),
                },
                orderBy: { date: 'desc' },
                take: 5,
                select: {
                    opdNo: true,
                    date: true,
                },
            }),
        ])

        // Compute low stock
        const lowStock = lowStockProducts
            .filter((p : any) => {
                const flowInventory = (Number(p.totalPurchased) || 0) - (Number(p.totalSales) || 0)
                const minStock = Number(p.minStockLevel) || 0
                return flowInventory <= 0 || (minStock > 0 && flowInventory < minStock)
            })
            .map((p : any) => ({
                id: p.id,
                name: p.name,
                quantity: p.quantity,
            }))
            .sort((a : any, b  : any) => a.quantity - b.quantity)

        // Calculate revenue from paid/partial invoices
        let totalRevenue = 0
        let unpaidCount = 0
        let totalSalesCount = 0
        for (const group of invoiceAggregates) {
            if (group.status === 'paid' || group.status === 'partial') {
                totalRevenue += group._sum.paidAmount || 0
            }
            if (group.status === 'unpaid' || group.status === 'partial') {
                unpaidCount += group._count.id
            }
            totalSalesCount += group._count.id
        }

        // Resolve product names for top selling
        const topProductIds = topSellingProducts.map((t : any) => t.productId)
        const productNames =
            topProductIds.length > 0
                ? await prisma.product.findMany({
                      where: { id: { in: topProductIds } },
                      select: { id: true, name: true },
                  })
                : []
        const nameMap = new Map(productNames.map((p : any) => [p.id, p.name]))

        const topSelling = topSellingProducts.map((t : any) => ({
            product: { name: nameMap.get(t.productId) || 'Unknown' },
            quantity: t._sum.quantity || 0,
        }))

        // Build recent activities
        const activities = [
            ...recentStockTx.map((tx : any) => ({
                type: 'stock',
                icon: tx.transactionType === 'IN' ? '📦' : '📤',
                message: `${tx.transactionType} - ${tx.product?.name || 'Product'} (${tx.quantity} units)`,
                date: tx.transactionDate,
            })),
            ...recentVisits.map((v : any) => ({
                type: 'visit',
                icon: '🏥',
                message: `Patient visit - OPD ${v.opdNo}`,
                date: v.date,
            })),
        ]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .slice(0, 10)

        const stockOutCount = recentStockTx.filter(
            (tx : any) => tx.transactionType === 'OUT'
        ).length

        return res.status(200).json({
            lowStockProducts: lowStock,
            recentSales: stockOutCount,
            pendingPurchaseOrders: pendingPOCount,
            totalRevenue,
            unpaidInvoices: unpaidCount,
            expiringProducts: [],
            topSellingProducts: topSelling,
            recentActivities: activities,
        })
    } catch (error: any) {
        return res.status(500).json({ error: String(error?.message || error) })
    }
}
