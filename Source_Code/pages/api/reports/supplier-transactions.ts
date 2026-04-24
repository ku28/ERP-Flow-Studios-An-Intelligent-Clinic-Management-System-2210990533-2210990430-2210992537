import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireStaffOrAbove } from '../../../lib/auth'
import { getClinicAwareDoctorFilter } from '../../../lib/doctorUtils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireStaffOrAbove(req, res)
    if (!user) return

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { supplierId, paymentAmount, startDate, endDate } = req.query

        if (!supplierId || !paymentAmount || !startDate || !endDate) {
            return res.status(400).json({ error: 'Supplier, payment amount, start date, and end date are required' })
        }

        // Get clinic-aware filter for multi-tenant isolation
        const whereClause = await getClinicAwareDoctorFilter(user, prisma)
        const supplierIdNum = Number(supplierId)
        const payment = Number(paymentAmount)

        // Fetch supplier details and verify clinic access
        const supplier = await prisma.supplier.findFirst({
            where: { id: supplierIdNum, ...whereClause }
        })

        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found or access denied' })
        }

        // Fetch all received purchase orders for this supplier up to end date to calculate accurate opening balance
        const allPOsBeforeStart = await prisma.purchaseOrder.findMany({
            where: {
                ...whereClause,
                supplierId: supplierIdNum,
                status: 'received',
                receivedDate: {
                    lt: new Date(startDate as string)
                }
            }
        })

        // Calculate opening balance (all POs before start date)
        const totalPOsBeforeStart = allPOsBeforeStart.reduce((sum: number, po: any) => sum + (po.totalAmount || 0), 0)

        // Fetch all purchase orders for this supplier in the date range
        const purchaseOrders = await prisma.purchaseOrder.findMany({
            where: {
                ...whereClause,
                supplierId: supplierIdNum,
                status: 'received',
                receivedDate: {
                    gte: new Date(startDate as string),
                    lte: new Date(endDate as string)
                }
            },
            orderBy: {
                receivedDate: 'asc'
            }
        })

        // Build transaction timeline
        const transactions: { date: string; type: string; amount: number; balance: number; description: string }[] = []
        
        // Opening balance is the current pending balance (before this report's payment)
        const currentActualBalance = supplier.pendingBalance || 0
        
        // Calculate total purchases in the range
        const totalPurchasesInRange = purchaseOrders.reduce((sum: number, po: any) => sum + (po.totalAmount || 0), 0)
        
        // Opening balance = current balance - purchases in this range
        // This gives us the balance at the start of the period
        const openingBalance = currentActualBalance - totalPurchasesInRange
        
        let runningBalance = openingBalance

        // Add opening balance
        transactions.push({
            date: new Date(startDate as string).toISOString().split('T')[0],
            type: 'opening',
            amount: 0,
            balance: Math.round(runningBalance * 100) / 100,
            description: 'Opening Balance'
        })

        // Add all purchases in the date range
        for (const po of purchaseOrders) {
            const date = po.receivedDate?.toISOString().split('T')[0] || ''
            const amount = po.totalAmount || 0
            
            runningBalance += amount
            
            transactions.push({
                date,
                type: 'purchase',
                amount: Math.round(amount * 100) / 100,
                balance: Math.round(runningBalance * 100) / 100,
                description: `Purchase Order ${po.poNumber}`
            })
        }

        // Add the payment
        const paymentDate = new Date().toISOString().split('T')[0]
        runningBalance -= payment
        
        transactions.push({
            date: paymentDate,
            type: 'payment',
            amount: Math.round(payment * 100) / 100,
            balance: Math.round(runningBalance * 100) / 100,
            description: 'Payment'
        })

        // Calculate summary
        const totalPurchases = totalPurchasesInRange
        const closingBalance = runningBalance

        return res.status(200).json({
            supplier: {
                id: supplier.id,
                name: supplier.name,
                currentBalance: currentActualBalance
            },
            transactions,
            summary: {
                supplierName: supplier.name,
                openingBalance: Math.round(openingBalance * 100) / 100,
                totalPurchases: Math.round(totalPurchases * 100) / 100,
                payment: Math.round(payment * 100) / 100,
                closingBalance: Math.round(closingBalance * 100) / 100,
                totalOrders: purchaseOrders.length,
                startDate: startDate as string,
                endDate: endDate as string
            }
        })
    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to generate report', details: error.message })
    }
}
