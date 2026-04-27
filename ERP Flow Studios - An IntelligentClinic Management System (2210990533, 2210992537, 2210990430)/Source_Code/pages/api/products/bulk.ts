import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireAuth } from '../../../lib/auth'
import { getDoctorIdForCreate, getClinicAwareDoctorFilter } from '../../../lib/doctorUtils'

async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'POST') {
        const user = await requireAuth(req, res)
        if (!user) return
        
        const { products, doctorId: requestDoctorId, mode = 'upsert' } = req.body

        if (!Array.isArray(products) || products.length === 0) {
            return res.status(400).json({ error: 'Invalid products array' })
        }

        // Get the effective doctorId (doctor's own ID, or admin's selected doctor)
        const doctorId = getDoctorIdForCreate(user, requestDoctorId)


        try {
            // Step 1: Collect all unique category names
            const uniqueCategoryNames = new Set<string>()
            products.forEach((p: any) => {
                if (p.category && String(p.category).trim()) {
                    uniqueCategoryNames.add(String(p.category).trim())
                }
            })

            // Step 2: Bulk upsert all categories first
            const categoryMap = new Map<string, number>()
            if (uniqueCategoryNames.size > 0) {
                
                for (const categoryName of uniqueCategoryNames) {
                    const existingCategory = await prisma.category.upsert({
                        where: { 
                            name_doctorId: {
                                name: categoryName,
                                doctorId: doctorId
                            }
                        },
                        create: { 
                            name: categoryName,
                            doctorId: doctorId
                        },
                        update: {}
                    })
                    categoryMap.set(categoryName, existingCategory.id)
                }
            }

            // Step 3: Preload all existing products by name within the clinic
            const allProductNames = products.map((p: any) => (p.name || '').trim()).filter((n: string) => n)
            const whereClause = await getClinicAwareDoctorFilter(user, prisma)
            const existingProducts = await prisma.product.findMany({
                where: {
                    ...whereClause,
                    name: {
                        in: allProductNames,
                        mode: 'insensitive'
                    }
                }
            })

            const existingByName: Record<string, any> = {}
            existingProducts.forEach((ep: any) => {
                if (ep && ep.name) existingByName[String(ep.name).toLowerCase()] = ep
            })


            // Step 4: Process products with controlled concurrency
            const BATCH_SIZE = 50
            const CONCURRENCY_LIMIT = 8 // Optimized for performance with pgbouncer
            const results: any[] = []
            const errors: any[] = []
            
            const chunks = []
            for (let i = 0; i < products.length; i += BATCH_SIZE) {
                chunks.push(products.slice(i, i + BATCH_SIZE))
            }

            for (const chunk of chunks) {
                // Process chunk in smaller concurrent batches
                for (let i = 0; i < chunk.length; i += CONCURRENCY_LIMIT) {
                    const concurrentBatch = chunk.slice(i, i + CONCURRENCY_LIMIT)
                    
                    const chunkPromises = concurrentBatch.map(async (productData: any) => {
                    try {
                                const { name, priceRupees, quantity, purchasePriceRupees, unit, category,
                                    minStockLevel, actualInventory, inventoryValue, latestUpdate,
                                    purchaseValue, salesValue, totalPurchased, totalSales, latestBatchNumber } = productData

                                // Ensure unit is a string or null (Prisma expects String | Null)
                                const unitValue = unit === undefined || unit === null || unit === '' ? null : String(unit)
                                
                                // Extract number of units from unit field (e.g., "10 TABLETS" -> 10)
                                let unitsCount = 1
                                if (unitValue) {
                                    const unitParts = String(unitValue).trim().split(/\s+/)
                                    if (unitParts.length >= 1) {
                                        const parsed = Number(unitParts[0])
                                        if (!isNaN(parsed) && parsed > 0) {
                                            unitsCount = parsed
                                        }
                                    }
                                }

                                // Get categoryId from preloaded map, or preserve existing if not in import
                                let categoryId: number | null | undefined = undefined
                                if (category && String(category).trim()) {
                                    categoryId = categoryMap.get(String(category).trim()) || null
                                }

                                // Parse/normalize numeric fields
                                const priceRupeesValue = Number(priceRupees) || 0
                                const quantityValue = Number(quantity) || 0
                                const purchasePriceRupeesValue = Number(purchasePriceRupees) || 0
                                
                                // Calculate purchasePricePerUnit (purchase price per pack divided by no. of units)
                                const purchasePricePerUnitValue = unitsCount > 0 ? purchasePriceRupeesValue / unitsCount : 0
                                
                                const actualInventoryValue = actualInventory !== undefined && actualInventory !== null ? Number(actualInventory) : undefined
                                const inventoryValueFloat = inventoryValue !== undefined && inventoryValue !== null ? Number(inventoryValue) : undefined
                                const purchaseValueFloat = purchaseValue !== undefined && purchaseValue !== null ? Number(purchaseValue) : undefined
                                const salesValueFloat = salesValue !== undefined && salesValue !== null ? Number(salesValue) : undefined
                                const totalPurchasedValue = totalPurchased !== undefined && totalPurchased !== null ? Number(totalPurchased) : undefined
                                const totalSalesValue = totalSales !== undefined && totalSales !== null ? Number(totalSales) : undefined
                                const latestBatchNumberValue = latestBatchNumber !== undefined && latestBatchNumber !== null && String(latestBatchNumber).trim() !== ''
                                    ? String(latestBatchNumber).trim()
                                    : null

                                // Parse latestUpdate to Date if provided
                                let latestUpdateValue: Date | undefined = undefined
                                if (latestUpdate !== undefined && latestUpdate !== null && String(latestUpdate).trim() !== '') {
                                    const d = new Date(String(latestUpdate))
                                    if (!isNaN(d.getTime())) latestUpdateValue = d
                                }

                                const lowerName = String(name || '').trim().toLowerCase()
                                const existing = existingByName[lowerName]

                                if (existing) {
                                    if (mode === 'create') {
                                        return null
                                    }

                                    // Update existing product - preserve categoryId if not provided in import
                                    const updateData: any = {
                                        name,
                                        priceRupees: priceRupeesValue,
                                        quantity: quantityValue,
                                        purchasePriceRupees: purchasePriceRupeesValue,
                                        purchasePricePerUnit: purchasePricePerUnitValue,
                                        unit: unitValue,
                                        minStockLevel: minStockLevel !== undefined && minStockLevel !== null ? Number(minStockLevel) : undefined,
                                        actualInventory: actualInventoryValue,
                                        inventoryValue: inventoryValueFloat,
                                        latestUpdate: latestUpdateValue,
                                        purchaseValue: purchaseValueFloat,
                                        salesValue: salesValueFloat,
                                        totalPurchased: totalPurchasedValue,
                                        totalSales: totalSalesValue,
                                        latestBatchNumber: latestBatchNumberValue
                                    }
                                    
                                    // Only update categoryId if it was provided in the import
                                    if (categoryId !== undefined) {
                                        updateData.categoryId = categoryId
                                    }
                                    
                                    return await prisma.product.update({
                                        where: { id: existing.id },
                                        data: updateData
                                    })
                                } else {
                                    // Create new product
                                    const createData = {
                                        name,
                                        priceRupees: priceRupeesValue,
                                        quantity: quantityValue,
                                        purchasePriceRupees: purchasePriceRupeesValue,
                                        purchasePricePerUnit: purchasePricePerUnitValue,
                                        unit: unitValue,
                                        categoryId: categoryId === undefined ? null : categoryId,
                                        minStockLevel: minStockLevel !== undefined && minStockLevel !== null ? Number(minStockLevel) : undefined,
                                        actualInventory: actualInventoryValue,
                                        inventoryValue: inventoryValueFloat,
                                        latestUpdate: latestUpdateValue,
                                        purchaseValue: purchaseValueFloat,
                                        salesValue: salesValueFloat,
                                        totalPurchased: totalPurchasedValue,
                                        totalSales: totalSalesValue,
                                        latestBatchNumber: latestBatchNumberValue,
                                        doctorId: doctorId
                                    }
                                    
                                    return await prisma.product.create({ data: createData })
                                }
                    } catch (err: any) {
                        errors.push({
                            product: productData.name,
                            error: err.message
                        })
                        return null
                    }
                })

                const chunkResults = await Promise.all(chunkPromises)
                results.push(...chunkResults.filter(r => r !== null))
                
                // Small delay to allow connection pool to recover
                await new Promise(resolve => setTimeout(resolve, 50))
                }
            }


            return res.status(201).json({ 
                success: true, 
                count: results.length,
                errors: errors.length > 0 ? errors : undefined,
                message: errors.length > 0 
                    ? `Imported ${results.length} products with ${errors.length} errors` 
                    : `Successfully imported ${results.length} products`
            })
        } catch (error: any) {
            return res.status(500).json({ error: error.message || 'Failed to import products' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}

export default handler
