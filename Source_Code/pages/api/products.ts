import type { NextApiRequest, NextApiResponse } from 'next'
import type { Prisma } from '@prisma/client'
import prisma from '../../lib/prisma'
import { requireStaffOrAbove } from '../../lib/auth'
import { getDoctorIdForCreate, getClinicAwareDoctorFilter } from '../../lib/doctorUtils'

async function deleteProductsByIds(productIds: number[]) {
    return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        // Preserve historical invoice and prescription records while removing
        // inventory-specific data that blocks product deletion.
        await tx.customerInvoiceItem.updateMany({
            where: {
                productId: { in: productIds }
            },
            data: {
                productId: null
            }
        })

        await tx.prescription.updateMany({
            where: {
                productId: { in: productIds }
            },
            data: {
                productId: null
            }
        })

        await tx.stockTransaction.deleteMany({
            where: {
                productId: { in: productIds }
            }
        })

        await tx.demandForecast.deleteMany({
            where: {
                productId: { in: productIds }
            }
        })

        await tx.productOrder.deleteMany({
            where: {
                productId: { in: productIds }
            }
        })

        await tx.purchaseOrderItem.deleteMany({
            where: {
                productId: { in: productIds }
            }
        })

        await tx.treatmentProduct.deleteMany({
            where: {
                productId: { in: productIds }
            }
        })

        await tx.billProductMapping.deleteMany({
            where: {
                mappedProductId: { in: productIds }
            }
        })

        await tx.sale.deleteMany({
            where: {
                productBatch: {
                    productId: { in: productIds }
                }
            }
        })

        await tx.purchase.deleteMany({
            where: {
                productBatch: {
                    productId: { in: productIds }
                }
            }
        })

        await tx.productBatch.deleteMany({
            where: {
                productId: { in: productIds }
            }
        })

        return tx.product.deleteMany({
            where: {
                id: { in: productIds }
            }
        })
    })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Products restricted to staff and above (not reception)
    const user = await requireStaffOrAbove(req, res)
    if (!user) return
    
    if (req.method === 'GET') {
        try {
            // Filter by clinic (all doctors in clinic + null doctorId)
            const whereClause = await getClinicAwareDoctorFilter(user, prisma)
            
            // Pagination support (optional)
            const page = req.query.page ? Math.max(1, Number(req.query.page)) : null
            const limit = req.query.limit ? Math.min(500, Math.max(1, Number(req.query.limit))) : null
            const skip = page && limit ? (page - 1) * limit : undefined
            const take = limit || undefined
            
            // Minimal mode: return only essential fields (for dashboard/selectors)
            const isMinimal = req.query.fields === 'minimal'
            
            const [items, total] = await Promise.all([
                prisma.product.findMany({
                    where: whereClause,
                    skip,
                    take,
                    ...(isMinimal
                        ? {
                              select: {
                                  id: true,
                                  name: true,
                                  quantity: true,
                                  minStockLevel: true,
                                  totalPurchased: true,
                                  totalSales: true,
                                  priceRupees: true,
                                  unit: true,
                              },
                          }
                        : {
                              include: { category: true },
                          }),
                }),
                page ? prisma.product.count({ where: whereClause }) : Promise.resolve(0),
            ])

            if (page && limit) {
                return res.status(200).json({
                    data: items,
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                })
            }

            return res.status(200).json(items)
        } catch (err: any) {
            if (err?.code === 'P2021' || err?.code === 'P2022') return res.status(200).json([])
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    if (req.method === 'POST') {
        const { name, categoryId, unit, priceRupees, purchasePriceRupees, purchasePricePerUnit, totalPurchased, totalSales, quantity, actualInventory, inventoryValue, purchaseValue, salesValue, minStockLevel, latestBatchNumber, doctorId: providedDoctorId } = req.body
        
        const doctorId = getDoctorIdForCreate(user, providedDoctorId)
        
        try {
            // Auto-categorize medicines with "drp" in the name as "DROPS"
            let finalCategoryId = categoryId ? Number(categoryId) : null
            if (!finalCategoryId && name && name.toLowerCase().includes('drp')) {
                // Try to find the "DROPS" category for this clinic
                const whereClause = await getClinicAwareDoctorFilter(user, prisma)
                const dropsCategory = await prisma.category.findFirst({
                    where: {
                        ...whereClause,
                        name: { equals: 'DROPS', mode: 'insensitive' }
                    }
                })
                
                if (dropsCategory) {
                    finalCategoryId = dropsCategory.id
                }
            }
            
            const p = await prisma.product.create({ 
                data: { 
                    name,
                    categoryId: finalCategoryId,
                    unit,
                    priceRupees: Number(priceRupees || 0),
                    purchasePriceRupees: Number(purchasePriceRupees || 0),
                    purchasePricePerUnit: Number(purchasePricePerUnit || 0),
                    quantity: Number(quantity || 0),
                    actualInventory: actualInventory ? Number(actualInventory) : null,
                    inventoryValue: inventoryValue ? Number(inventoryValue) : null,
                    totalPurchased: Number(totalPurchased || 0),
                    purchaseValue: purchaseValue ? Number(purchaseValue) : null,
                    totalSales: Number(totalSales || 0),
                    salesValue: salesValue ? Number(salesValue) : null,
                    minStockLevel: Number(minStockLevel) || 200,
                    latestBatchNumber: latestBatchNumber ? String(latestBatchNumber).trim() : null,
                    doctorId
                },
                include: {
                    category: true
                }
            })
            return res.status(201).json(p)
        } catch (err: any) {
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    if (req.method === 'PUT') {
        const { id, name, categoryId, unit, priceRupees, purchasePriceRupees, purchasePricePerUnit, totalPurchased, totalSales, quantity, actualInventory, inventoryValue, purchaseValue, salesValue, minStockLevel, latestBatchNumber, batchOnly } = req.body
        try {
            // Verify product belongs to user's clinic before updating
            const whereClause = await getClinicAwareDoctorFilter(user, prisma)
            const existingProduct = await prisma.product.findFirst({
                where: { id: Number(id), ...whereClause }
            })
            if (!existingProduct) {
                return res.status(404).json({ error: 'Product not found or access denied' })
            }

            if (batchOnly) {
                const updated = await prisma.product.update({
                    where: { id: Number(id) },
                    data: {
                        latestBatchNumber: latestBatchNumber ? String(latestBatchNumber).trim() : null
                    },
                    include: {
                        category: true
                    }
                })
                return res.status(200).json(updated)
            }
            
            const p = await prisma.product.update({
                where: { id: Number(id) },
                data: {
                    name,
                    categoryId: categoryId ? Number(categoryId) : null,
                    unit,
                    priceRupees: Number(priceRupees || 0),
                    purchasePriceRupees: Number(purchasePriceRupees || 0),
                    purchasePricePerUnit: purchasePricePerUnit !== undefined ? Number(purchasePricePerUnit) : undefined,
                    totalPurchased: Number(totalPurchased || 0),
                    totalSales: Number(totalSales || 0),
                    quantity: Number(quantity || 0),
                    actualInventory: actualInventory ? Number(actualInventory) : null,
                    inventoryValue: inventoryValue ? Number(inventoryValue) : null,
                    purchaseValue: purchaseValue ? Number(purchaseValue) : null,
                    salesValue: salesValue ? Number(salesValue) : null,
                    minStockLevel: minStockLevel !== undefined ? Number(minStockLevel) : undefined,
                    latestBatchNumber: latestBatchNumber !== undefined ? (latestBatchNumber ? String(latestBatchNumber).trim() : null) : undefined
                },
                include: {
                    category: true
                }
            })
            return res.status(200).json(p)
        } catch (err: any) {
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    if (req.method === 'DELETE') {
        const { id, ids } = req.body
        try {
            // Get clinic filter
            const whereClause = await getClinicAwareDoctorFilter(user, prisma)
            
            if (ids && Array.isArray(ids)) {
                // Bulk delete
                const productIds = ids.map((id: any) => Number(id))
                
                // Verify all products belong to user's clinic
                const productsToDelete = await prisma.product.findMany({
                    where: { id: { in: productIds }, ...whereClause }
                })
                if (productsToDelete.length !== productIds.length) {
                    return res.status(403).json({ error: 'Some products not found or access denied' })
                }

                const result = await deleteProductsByIds(productIds)
                return res.status(200).json({ success: true, count: result.count })
            } else if (id) {
                // Single delete
                const productId = Number(id)
                
                // Verify product belongs to user's clinic
                const product = await prisma.product.findFirst({
                    where: { id: productId, ...whereClause }
                })
                if (!product) {
                    return res.status(404).json({ error: 'Product not found or access denied' })
                }

                const result = await deleteProductsByIds([productId])
                if (result.count === 0) {
                    return res.status(404).json({ error: 'Product not found or access denied' })
                }

                return res.status(200).json({ success: true })
            } else {
                return res.status(400).json({ error: 'Missing id or ids' })
            }
        } catch (err: any) {
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}

