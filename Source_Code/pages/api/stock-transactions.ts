import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { requireStaffOrAbove } from '../../lib/auth'
import { getClinicAwareDoctorFilter } from '../../lib/doctorUtils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Stock transactions restricted to staff and above
    const user = await requireStaffOrAbove(req, res)
    if (!user) return
    
    if (req.method === 'GET') {
        try {
            const { productId, type, limit: queryLimit } = req.query

            const where: any = {}
            if (productId) where.productId = Number(productId)
            if (type) where.transactionType = type
            
            // Filter stock transactions by clinic through product ownership
            const doctorFilter = await getClinicAwareDoctorFilter(user, prisma)
            where.product = doctorFilter

            // Pagination support (optional)
            const page = req.query.page ? Math.max(1, Number(req.query.page)) : null
            const pageLimit = req.query.page && req.query.limit ? Math.min(500, Math.max(1, Number(req.query.limit))) : null
            const skip = page && pageLimit ? (page - 1) * pageLimit : undefined
            // Prefer pagination limit, otherwise legacy limit param
            const take = pageLimit || (queryLimit ? Number(queryLimit) : undefined)

            const includeCategory = req.query.includeCategory === 'true'

            const [transactions, total] = await Promise.all([
                prisma.stockTransaction.findMany({
                    where,
                    orderBy: { transactionDate: 'desc' },
                    skip,
                    take,
                    include: {
                        product: includeCategory ? {
                            include: { category: true }
                        } : {
                            select: { id: true, name: true, unit: true }
                        }
                    }
                }),
                page ? prisma.stockTransaction.count({ where }) : Promise.resolve(0),
            ])

            if (page && pageLimit) {
                return res.status(200).json({
                    data: transactions,
                    total,
                    page,
                    limit: pageLimit,
                    totalPages: Math.ceil(total / pageLimit),
                })
            }
            
            return res.status(200).json(transactions)
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch stock transactions' })
        }
    }

    if (req.method === 'POST') {
        try {
            const {
                productId,
                transactionType,
                quantity,
                unitPrice,
                notes,
                performedBy
            } = req.body

            // Verify product exists and belongs to clinic
            const doctorFilter = await getClinicAwareDoctorFilter(user, prisma)
            const product = await prisma.product.findFirst({
                where: { 
                    id: Number(productId),
                    ...doctorFilter
                }
            })

            if (!product) {
                return res.status(404).json({ error: 'Product not found or access denied' })
            }

            // Calculate new quantity based on transaction type
            let newQuantity = product.quantity
            if (transactionType === 'IN' || transactionType === 'RETURN') {
                newQuantity += Number(quantity)
            } else if (transactionType === 'OUT' || transactionType === 'ADJUSTMENT') {
                newQuantity -= Number(quantity)
            }

            // Ensure quantity doesn't go negative
            newQuantity = Math.max(0, newQuantity)

            // Create stock transaction
            const transaction = await prisma.stockTransaction.create({
                data: {
                    productId: Number(productId),
                    transactionType,
                    quantity: Number(quantity),
                    unitPrice: Number(unitPrice || 0),
                    totalValue: Number(quantity) * Number(unitPrice || 0),
                    balanceQuantity: newQuantity,
                    notes,
                    performedBy
                },
                include: {
                    product: true
                }
            })

            // Update product quantity
            await prisma.product.update({
                where: { id: Number(productId) },
                data: {
                    quantity: newQuantity,
                    latestUpdate: new Date()
                }
            })

            return res.status(201).json(transaction)
        } catch (error) {
            return res.status(500).json({ error: 'Failed to create stock transaction' })
        }
    }

    if (req.method === 'DELETE') {
        try {
            const { id, ids } = req.body
            const doctorFilter = await getClinicAwareDoctorFilter(user, prisma)
            
            if (ids && Array.isArray(ids)) {
                // Bulk delete - verify all transactions belong to user's clinic
                const transactionIds = ids.map((i: any) => Number(i))
                const transactions = await prisma.stockTransaction.findMany({
                    where: {
                        id: { in: transactionIds },
                        product: doctorFilter
                    }
                })
                
                if (transactions.length !== transactionIds.length) {
                    return res.status(404).json({ error: 'Some transactions not found or access denied' })
                }
                
                await prisma.stockTransaction.deleteMany({
                    where: {
                        id: { in: transactionIds }
                    }
                })
                return res.status(200).json({ message: `Deleted ${ids.length} transactions` })
            } else if (id) {
                // Single delete - verify transaction belongs to user's clinic
                const transaction = await prisma.stockTransaction.findFirst({
                    where: {
                        id: Number(id),
                        product: doctorFilter
                    }
                })
                
                if (!transaction) {
                    return res.status(404).json({ error: 'Transaction not found or access denied' })
                }
                
                await prisma.stockTransaction.delete({
                    where: { id: Number(id) }
                })
                return res.status(200).json({ message: 'Transaction deleted successfully' })
            } else {
                return res.status(400).json({ error: 'Missing id or ids parameter' })
            }
        } catch (error) {
            return res.status(500).json({ error: 'Failed to delete stock transaction' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
