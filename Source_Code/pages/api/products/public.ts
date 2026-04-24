import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireAuth } from '../../../lib/auth'
import { getClinicAwareDoctorFilter } from '../../../lib/doctorUtils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        const user = await requireAuth(req, res)
        if (!user) return
        
        try {
            // Get products filtered by clinic
            const doctorFilter = await getClinicAwareDoctorFilter(user, prisma)
            const products = await prisma.product.findMany({
                where: doctorFilter,
                select: {
                    id: true,
                    name: true,
                    quantity: true,
                    priceRupees: true,
                    totalSales: true,
                    unit: true,
                    latestBatchNumber: true,
                    category: {
                        select: {
                            id: true,
                            name: true
                        }
                    }
                },
                orderBy: {
                    id: 'desc'
                }
            })

            // Calculate total sales from invoice items (approximate sales metric)
            const invoiceItems = await prisma.customerInvoiceItem.groupBy({
                by: ['productId'],
                where: {
                    customerInvoice: doctorFilter
                },
                _sum: {
                    quantity: true
                }
            })

            // Create a map of productId to total sales quantity
            const salesMap = new Map()
            invoiceItems.forEach((item: any) => {
                if (item.productId) {
                    salesMap.set(item.productId, item._sum.quantity || 0)
                }
            })

            // Add totalSales to products
            const productsWithSales = products.map((product: any) => ({
                ...product,
                totalSales: salesMap.get(product.id) || 0
            }))

            return res.status(200).json(productsWithSales)
        } catch (err: any) {
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
