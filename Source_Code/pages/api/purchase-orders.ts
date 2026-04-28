import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { requireStaffOrAbove } from '../../lib/auth'
import { getDoctorIdForCreate, getClinicAwareDoctorFilter } from '../../lib/doctorUtils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Purchase orders restricted to staff and above
    const user = await requireStaffOrAbove(req, res)
    if (!user) return
    
    if (req.method === 'GET') {
        try {
            // Filter by clinic
            const whereClause = await getClinicAwareDoctorFilter(user, prisma)

            // Pagination support (optional)
            const page = req.query.page ? Math.max(1, Number(req.query.page)) : null
            const limit = req.query.limit ? Math.min(200, Math.max(1, Number(req.query.limit))) : null
            const skip = page && limit ? (page - 1) * limit : undefined
            const take = limit || undefined

            // Optional: exclude items for lighter list views
            const includeItems = req.query.includeItems !== 'false'
            
            const [purchaseOrders, total] = await Promise.all([
                prisma.purchaseOrder.findMany({
                    where: whereClause,
                    orderBy: { orderDate: 'desc' },
                    skip,
                    take,
                    include: {
                        supplier: { select: { id: true, name: true, phone: true } },
                        ...(includeItems ? {
                            items: {
                                include: {
                                    product: { select: { id: true, name: true, priceRupees: true, unit: true } }
                                }
                            }
                        } : {})
                    }
                }),
                page ? prisma.purchaseOrder.count({ where: whereClause }) : Promise.resolve(0),
            ])

            if (page && limit) {
                return res.status(200).json({
                    data: purchaseOrders,
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                })
            }

            return res.status(200).json(purchaseOrders)
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch purchase orders' })
        }
    }

    if (req.method === 'POST') {
        try {
            const {
                supplierId,
                orderDate,
                expectedDate,
                items,
                notes,
                shippingCost,
                discount,
                status,
                receivedDate,
                billUrl
            } = req.body
            const whereClause = await getClinicAwareDoctorFilter(user, prisma)

            const supplier = await prisma.supplier.findFirst({
                where: { id: Number(supplierId), ...whereClause },
                select: { id: true, name: true, pendingBalance: true }
            })

            if (!supplier) {
                return res.status(404).json({ error: 'Supplier not found or access denied' })
            }

            const productIds = [...new Set((items || []).map((item: any) => Number(item.productId)).filter((v: number) => Number.isInteger(v) && v > 0))]
            if (productIds.length === 0) {
                return res.status(400).json({ error: 'At least one valid product is required' })
            }

            const clinicProducts = await prisma.product.findMany({
                where: { id: { in: productIds }, ...whereClause },
                select: { id: true }
            })
            if (clinicProducts.length !== productIds.length) {
                return res.status(403).json({ error: 'One or more products are outside your clinic scope' })
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

            // Calculate totals
            let subtotal = 0
            let taxAmount = 0

            const orderItems = items.map((item: any) => {
                const itemTotal = item.quantity * item.unitPrice
                const itemTax = itemTotal * (item.taxRate || 0) / 100
                const itemDiscount = item.discount || 0
                
                subtotal += itemTotal
                taxAmount += itemTax

                return {
                    productId: Number(item.productId),
                    quantity: Number(item.quantity),
                    receivedQuantity: Number(item.receivedQuantity || 0),
                    unitPrice: Number(item.unitPrice),
                    taxRate: Number(item.taxRate || 0),
                    discount: Number(itemDiscount),
                    totalAmount: Math.round(itemTotal + itemTax - itemDiscount)
                }
            })

            const totalAmount = Math.round(subtotal + taxAmount + (shippingCost || 0) - (discount || 0))

            const purchaseOrder = await prisma.purchaseOrder.create({
                data: {
                    poNumber,
                    supplierId: supplier.id,
                    orderDate: orderDate ? new Date(orderDate) : new Date(),
                    expectedDate: expectedDate ? new Date(expectedDate) : null,
                    receivedDate: receivedDate ? new Date(receivedDate) : null,
                    status: status || 'pending',
                    billUrl: billUrl || null,
                    subtotal: Math.round(subtotal),
                    taxAmount: Math.round(taxAmount),
                    discount: Math.round(discount || 0),
                    shippingCost: Math.round(shippingCost || 0),
                    totalAmount,
                    notes,
                    doctorId: getDoctorIdForCreate(user, req.body.doctorId),
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

            // If status is received, update inventory immediately
            if (status === 'received' && items && items.length > 0) {
                for (const item of items) {
                    const receivedQty = Number(item.receivedQuantity)
                    if (receivedQty > 0 && item.productId) {
                        const product = await prisma.product.findUnique({
                            where: { id: Number(item.productId) }
                        })

                        if (product && productIds.includes(product.id)) {
                            // Get unit information
                            const unitParts = product.unit ? String(product.unit).trim().split(/\s+/) : []
                            const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                            
                            // Update purchase price from bill
                            const purchaseUnitPrice = Number(item.unitPrice) || 0
                            
                            // Calculate sale price (rate per unit * no. of units)
                            const saleUnitPrice = Number(product.priceRupees) || 0
                            const salePrice = saleUnitPrice * unitQuantity
                            
                            // Calculate profit per unit
                            const profit = salePrice - purchaseUnitPrice
                            
                            // Update flow inventory (totalPurchased - totalSales)
                            const newTotalPurchased = product.totalPurchased + receivedQty
                            const flowInventory = newTotalPurchased - product.totalSales
                            
                            // Calculate actual inventory (flow inventory / no. of units)
                            const actualInventory = unitQuantity > 0 ? Math.floor(flowInventory / unitQuantity) : 0
                            
                            // Update quantity field to match flow inventory
                            const newQuantity = flowInventory
                            
                            const inventoryValue = saleUnitPrice * flowInventory
                            const purchaseValue = saleUnitPrice * newTotalPurchased
                            
                            await prisma.product.update({
                                where: { id: Number(item.productId) },
                                data: {
                                    quantity: newQuantity,
                                    actualInventory: actualInventory,
                                    totalPurchased: newTotalPurchased,
                                    purchasePriceRupees: purchaseUnitPrice,
                                    inventoryValue: inventoryValue || null,
                                    purchaseValue: purchaseValue || null
                                }
                            })

                            // Create stock transaction
                            await prisma.stockTransaction.create({
                                data: {
                                    productId: Number(item.productId),
                                    transactionType: 'IN',
                                    quantity: receivedQty,
                                    unitPrice: Number(item.unitPrice),
                                    totalValue: receivedQty * Number(item.unitPrice),
                                    balanceQuantity: newQuantity,
                                    referenceType: 'PURCHASE_ORDER',
                                    referenceId: purchaseOrder.id,
                                    notes: `Received from ${purchaseOrder.supplier?.name || 'supplier'} - ${poNumber}`,
                                    transactionDate: receivedDate ? new Date(receivedDate) : new Date()
                                }
                            })
                        }
                    }
                }
                // Update supplier pending balance when goods are received
                if (supplier) {
                    await prisma.supplier.update({
                        where: { id: supplier.id },
                        data: {
                            pendingBalance: (supplier.pendingBalance || 0) + totalAmount
                        }
                    })
                }            }

            return res.status(201).json(purchaseOrder)
        } catch (error) {
            return res.status(500).json({ error: 'Failed to create purchase order' })
        }
    }

    if (req.method === 'PUT') {
        try {
            const { id, status, receivedDate, items, billUrl } = req.body
            const whereClause = await getClinicAwareDoctorFilter(user, prisma)

            // Verify purchase order belongs to user's clinic before updating
            const existingPO = await prisma.purchaseOrder.findFirst({
                where: { id: Number(id), ...whereClause }
            })

            if (!existingPO) {
                return res.status(404).json({ error: 'Purchase order not found or access denied' })
            }

            // If receiving goods, update stock
            if (status === 'received' && items) {
                const productIds = [...new Set(items.map((item: any) => Number(item.productId)).filter((v: number) => Number.isInteger(v) && v > 0))]
                const clinicProducts = await prisma.product.findMany({
                    where: { id: { in: productIds }, ...whereClause },
                    select: { id: true }
                })
                if (clinicProducts.length !== productIds.length) {
                    return res.status(403).json({ error: 'One or more products are outside your clinic scope' })
                }

                for (const item of items) {
                    if (item.receivedQuantity > 0 && item.productId) {
                        // Update product quantity
                        const product = await prisma.product.findFirst({
                            where: { id: Number(item.productId), ...whereClause }
                        })

                        if (product) {
                            // Get unit information
                            const unitParts = product.unit ? String(product.unit).trim().split(/\s+/) : []
                            const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                            
                            // Update purchase price from bill
                            const purchaseUnitPrice = Number(item.unitPrice) || 0
                            
                            // Calculate sale price (rate per unit * no. of units)
                            const saleUnitPrice = Number(product.priceRupees) || 0
                            const salePrice = saleUnitPrice * unitQuantity
                            
                            // Calculate profit per unit
                            const profit = salePrice - purchaseUnitPrice
                            
                            // Update flow inventory (totalPurchased - totalSales)
                            const newTotalPurchased = product.totalPurchased + item.receivedQuantity
                            const flowInventory = newTotalPurchased - product.totalSales
                            
                            // Calculate actual inventory (flow inventory / no. of units)
                            const actualInventory = unitQuantity > 0 ? Math.floor(flowInventory / unitQuantity) : 0
                            
                            // Update quantity field to match flow inventory
                            const newQuantity = flowInventory
                            
                            const inventoryValue = saleUnitPrice * flowInventory
                            const purchaseValue = saleUnitPrice * newTotalPurchased
                            
                            await prisma.product.update({
                                where: { id: Number(item.productId) },
                                data: {
                                    quantity: newQuantity,
                                    actualInventory: actualInventory,
                                    totalPurchased: newTotalPurchased,
                                    purchasePriceRupees: purchaseUnitPrice,
                                    inventoryValue: inventoryValue || null,
                                    purchaseValue: purchaseValue || null
                                }
                            })

                            // Create stock transaction
                            await prisma.stockTransaction.create({
                                data: {
                                    productId: Number(item.productId),
                                    transactionType: 'IN',
                                    quantity: item.receivedQuantity,
                                    unitPrice: item.unitPrice,
                                    totalValue: item.receivedQuantity * item.unitPrice,
                                    balanceQuantity: newQuantity,
                                    referenceType: 'PurchaseOrder',
                                    referenceId: Number(id),
                                    notes: `Received from PO #${id}`
                                }
                            })
                        }

                        // Update purchase order item
                        await prisma.purchaseOrderItem.updateMany({
                            where: { id: item.id, purchaseOrderId: Number(id) },
                            data: { receivedQuantity: item.receivedQuantity }
                        })
                    }
                }

                // Update supplier pending balance when goods are received
                // Only update balance if status is changing to received
                if (existingPO.status !== 'received') {
                    const supplier = await prisma.supplier.findUnique({
                        where: { id: existingPO.supplierId }
                    })
                    if (supplier) {
                        await prisma.supplier.update({
                            where: { id: existingPO.supplierId },
                            data: {
                                pendingBalance: (supplier.pendingBalance || 0) + existingPO.totalAmount
                            }
                        })
                    }
                }
            }

            const updateData: any = {}
            if (status !== undefined) updateData.status = status
            if (receivedDate !== undefined) updateData.receivedDate = receivedDate ? new Date(receivedDate) : null
            if (billUrl !== undefined) updateData.billUrl = billUrl

            const purchaseOrder = await prisma.purchaseOrder.update({
                where: { id: Number(id) },
                data: updateData,
                include: {
                    supplier: true,
                    items: {
                        include: {
                            product: true
                        }
                    }
                }
            })

            return res.status(200).json(purchaseOrder)
        } catch (error) {
            return res.status(500).json({ error: 'Failed to update purchase order' })
        }
    }

    if (req.method === 'DELETE') {
        try {
            const { id } = req.query

            // Verify purchase order belongs to user's clinic before deleting
            const whereClause = await getClinicAwareDoctorFilter(user, prisma)
            const purchaseOrder = await prisma.purchaseOrder.findFirst({
                where: { id: Number(id), ...whereClause }
            })

            if (!purchaseOrder) {
                return res.status(404).json({ error: 'Purchase order not found or access denied' })
            }

            await prisma.purchaseOrder.delete({
                where: { id: Number(id) }
            })

            return res.status(200).json({ message: 'Purchase order deleted successfully' })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to delete purchase order' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
