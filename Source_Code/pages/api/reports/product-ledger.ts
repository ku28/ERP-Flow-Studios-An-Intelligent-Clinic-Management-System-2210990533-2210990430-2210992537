import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuth } from '../../../lib/auth'
import { getClinicAwareDoctorFilter } from '../../../lib/doctorUtils'
import prisma from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Add authentication for multi-tenant isolation
    const user = await requireAuth(req, res)
    if (!user) return
    
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { productId, startDate, endDate } = req.query

        if (!productId) {
            return res.status(400).json({ error: 'Product ID is required' })
        }

        const productIdNum = parseInt(productId as string)
        if (isNaN(productIdNum)) {
            return res.status(400).json({ error: 'Invalid product ID' })
        }

        // Get clinic-aware filter
        const whereClause = await getClinicAwareDoctorFilter(user, prisma)

        // Get product details and verify clinic access
        const product = await prisma.product.findFirst({
            where: { id: productIdNum, ...whereClause }
        })

        if (!product) {
            return res.status(404).json({ error: 'Product not found or access denied' })
        }

        // Get all purchase orders containing this product
        const purchaseOrders = await prisma.purchaseOrder.findMany({
            where: {
                ...whereClause,
                orderDate: {
                    gte: startDate ? new Date(startDate as string) : undefined,
                    lte: endDate ? new Date(endDate as string) : undefined
                },
                items: {
                    some: {
                        productId: productIdNum
                    }
                }
            },
            include: {
                items: {
                    where: {
                        productId: productIdNum
                    }
                },
                supplier: true
            }
        })

        // Get all invoices containing this product
        const invoices = await prisma.customerInvoice.findMany({
            where: {
                ...whereClause,
                createdAt: {
                    gte: startDate ? new Date(startDate as string) : undefined,
                    lte: endDate ? new Date(endDate as string) : undefined
                },
                items: {
                    some: {
                        productId: productIdNum
                    }
                }
            },
            include: {
                items: {
                    where: {
                        productId: productIdNum
                    }
                },
                patient: true
            }
        })

        // Calculate opening stock (simplified - would need historical data for accuracy)
        const totalPurchases = purchaseOrders.reduce((sum: number, po: any) => {
            const items = po.items || []
            return sum + items.reduce((itemSum: number, item: any) => itemSum + (item.quantity || 0), 0)
        }, 0)

        const totalSales = invoices.reduce((sum: number, inv: any) => {
            const items = inv.items || []
            return sum + items.reduce((itemSum: number, item: any) => itemSum + (item.quantity || 0), 0)
        }, 0)

        const closingStock = product.quantity || 0
        const openingStock = closingStock - totalPurchases + totalSales

        // Create ledger entries
        const entries: any[] = []

        // Add purchase entries
        purchaseOrders.forEach((po: any) => {
            po.items.forEach((item: any) => {
                entries.push({
                    date: po.orderDate,
                    type: 'Purchase',
                    reference: po.poNumber,
                    party: po.supplier?.name || 'Unknown',
                    inward: item.quantity,
                    outward: 0,
                    rate: item.unitPrice || 0,
                    amount: (item.quantity || 0) * (item.unitPrice || 0)
                })
            })
        })

        // Add sale entries
        invoices.forEach((inv: any) => {
            inv.items.forEach((item: any) => {
                entries.push({
                    date: inv.createdAt,
                    type: 'Sale',
                    reference: inv.invoiceNumber,
                    party: inv.patient ? `${inv.patient.firstName} ${inv.patient.lastName || ''}`.trim() : inv.customerName || 'Unknown',
                    inward: 0,
                    outward: item.quantity,
                    rate: item.unitPrice || 0,
                    amount: (item.quantity || 0) * (item.unitPrice || 0)
                })
            })
        })

        // Sort entries by date
        entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

        // Calculate running balance
        let balance = openingStock
        entries.forEach(entry => {
            balance = balance + entry.inward - entry.outward
            entry.balance = balance
        })

        const responseData = {
            productInfo: {
                name: product.name,
                category: product.categoryId,
                currentStock: product.quantity,
                pricePerUnit: product.priceRupees
            },
            openingStock,
            closingStock,
            totalPurchases,
            totalSales,
            stockValue: closingStock * (product.priceRupees || 0),
            entries
        }

        res.status(200).json(responseData)
    } catch (error) {
        res.status(500).json({ error: 'Failed to generate product ledger' })
    }
}
