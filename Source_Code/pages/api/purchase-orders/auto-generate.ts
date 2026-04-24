import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireStaffOrAbove } from '../../../lib/auth'
import { getClinicAwareDoctorFilter, getDoctorIdForCreate } from '../../../lib/doctorUtils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireStaffOrAbove(req, res)
    if (!user) return
    
    if (req.method === 'POST') {
        try {
            const whereClause = await getClinicAwareDoctorFilter(user, prisma)

            // Get the default supplier (first active supplier)
            const defaultSupplier = await prisma.supplier.findFirst({
                where: { status: 'active', ...whereClause },
                orderBy: { id: 'asc' }
            })

            if (!defaultSupplier) {
                return res.status(400).json({ error: 'No active supplier found. Please add a supplier first.' })
            }

            // Find all products with low stock (quantity below reorder point in their category)
            const lowStockProducts = await prisma.product.findMany({
                where: {
                    ...whereClause
                },
                include: {
                    category: true
                }
            })

            // Filter products that are actually below reorder level
            const productsToOrder = lowStockProducts.filter((product: any) => {
                const reorderLevel = product.category?.reorderLevel || 10 // Default to 10 if no reorder level
                return (product.quantity || 0) < reorderLevel
            })

            if (productsToOrder.length === 0) {
                return res.status(200).json({ 
                    message: 'No low stock products found',
                    productsChecked: lowStockProducts.length,
                    purchaseOrder: null
                })
            }

            // Generate PO Number - query globally to avoid uniqueness conflicts across clinics
            const lastPO = await prisma.purchaseOrder.findFirst({
                orderBy: { poNumber: 'desc' }
            })
            let nextPONumber = 1
            if (lastPO?.poNumber) {
                const match = lastPO.poNumber.match(/PO-(\d+)/)
                if (match) nextPONumber = parseInt(match[1], 10) + 1
            }
            const poNumber = `PO-${String(nextPONumber).padStart(6, '0')}`

            // Create purchase order items
            let subtotal = 0
            const orderItems = productsToOrder.map((product: any) => {
                const reorderLevel = product.category?.reorderLevel || 10
                const currentQty = product.quantity || 0
                
                // Order enough to reach 2x the reorder level
                const quantityToOrder = Math.max(reorderLevel * 2 - currentQty, reorderLevel)
                
                const unitPrice = product.purchasePriceRupees || product.priceRupees || 0
                const itemTotal = quantityToOrder * unitPrice
                
                subtotal += itemTotal

                return {
                    productId: product.id,
                    quantity: quantityToOrder,
                    unitPrice: unitPrice,
                    taxRate: 0,
                    discount: 0,
                    totalAmount: Math.round(itemTotal)
                }
            })

            const totalAmount = Math.round(subtotal)

            // Create the purchase order
            const purchaseOrder = await prisma.purchaseOrder.create({
                data: {
                    poNumber,
                    supplierId: defaultSupplier.id,
                    orderDate: new Date(),
                    expectedDate: null,
                    subtotal: Math.round(subtotal),
                    taxAmount: 0,
                    discount: 0,
                    shippingCost: 0,
                    totalAmount,
                    status: 'pending',
                    notes: `Auto-generated purchase order for ${productsToOrder.length} low stock item(s)`,
                    doctorId: getDoctorIdForCreate(user, null),
                    items: {
                        create: orderItems
                    }
                },
                include: {
                    supplier: true,
                    items: {
                        include: {
                            product: true
                        }
                    }
                }
            })

            return res.status(201).json({
                message: `Purchase order created successfully for ${productsToOrder.length} low stock items`,
                purchaseOrder,
                lowStockProducts: productsToOrder.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    currentStock: p.quantity,
                    reorderLevel: p.category?.reorderLevel || 10
                }))
            })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to generate purchase order' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
