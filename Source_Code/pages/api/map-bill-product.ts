import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { requireStaffOrAbove, getClinicIdFromUser } from '../../lib/auth'
import { getClinicAwareDoctorFilter, getDoctorIdForCreate } from '../../lib/doctorUtils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    // Require authentication
    const user = await requireStaffOrAbove(req, res)
    if (!user) return

    try {
        const { billProductName, selectedProductId, createNew, productData } = req.body

        if (!billProductName) {
            return res.status(400).json({ error: 'Bill product name is required' })
        }
        const clinicId = getClinicIdFromUser(user)
        const doctorFilter = await getClinicAwareDoctorFilter(user, prisma)
        const scopedBillProductName = `${clinicId}::${String(billProductName).trim()}`

        // If user wants to create a new product
        if (createNew && productData) {
            const doctorId = getDoctorIdForCreate(user)
            const newProduct = await prisma.product.create({
                data: {
                    name: productData.productName,
                    quantity: 0, // Will be updated when bill is finalized
                    priceRupees: productData.unitPrice || 0,
                    purchasePriceRupees: productData.unitPrice || 0,
                    doctorId
                }
            })

            // Create mapping
            await prisma.billProductMapping.create({
                data: {
                    billProductName: scopedBillProductName,
                    mappedProductId: newProduct.id
                }
            })

            return res.status(200).json({
                success: true,
                product: newProduct,
                mapping: String(billProductName).trim()
            })
        }

        // If user wants to map to existing product
        if (selectedProductId) {
            const productIdInt = parseInt(selectedProductId.toString())
            
            // Get the existing product
            const existingProduct = await prisma.product.findUnique({
                where: { id: productIdInt },
                select: { tags: true }
            })

            if (!existingProduct) {
                return res.status(404).json({ error: 'Product not found' })
            }
            const clinicProduct = await prisma.product.findFirst({
                where: { id: productIdInt, ...doctorFilter },
                select: { id: true }
            })
            if (!clinicProduct) {
                return res.status(403).json({ error: 'Product is outside your clinic scope' })
            }

            // Add bill product name as a tag if not already present
            const currentTags = existingProduct.tags || []
            const newTags = currentTags.includes(billProductName) 
                ? currentTags 
                : [...currentTags, billProductName]

            // Update product with new tag
            const updatedProduct = await prisma.product.update({
                where: { id: productIdInt },
                data: { tags: newTags }
            })
            
            // Check if mapping already exists
            const existingMapping = await prisma.billProductMapping.findUnique({
                where: { billProductName: scopedBillProductName }
            })

            if (existingMapping) {
                // Update existing mapping
                await prisma.billProductMapping.update({
                    where: { billProductName: scopedBillProductName },
                    data: { mappedProductId: productIdInt }
                })
            } else {
                // Create new mapping
                await prisma.billProductMapping.create({
                    data: {
                        billProductName: scopedBillProductName,
                        mappedProductId: productIdInt
                    }
                })
            }

            return res.status(200).json({
                success: true,
                product: updatedProduct,
                mapping: String(billProductName).trim(),
                tagsAdded: !currentTags.includes(billProductName)
            })
        }

        return res.status(400).json({ error: 'Either selectedProductId or createNew must be provided' })

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        
        // Handle specific Prisma errors
        if (error && typeof error === 'object' && 'code' in error) {
            if ((error as any).code === 'P2002') {
                return res.status(409).json({ 
                    error: 'Product mapping already exists', 
                    details: 'This bill product is already mapped to another product' 
                })
            }
        }
        
        return res.status(500).json({ error: 'Failed to map product', details: errorMessage })
    }
}
