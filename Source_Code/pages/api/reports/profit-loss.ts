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
        const { startDate, endDate } = req.query

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Start date and end date are required' })
        }

        // Get clinic-aware filter for multi-tenant isolation
        const whereClause = await getClinicAwareDoctorFilter(user, prisma)

        // Fetch all received purchase orders in the date range
        const purchaseOrders = await prisma.purchaseOrder.findMany({
            where: {
                ...whereClause,
                status: 'received',
                receivedDate: {
                    gte: new Date(startDate as string),
                    lte: new Date(endDate as string)
                }
            },
            include: {
                items: {
                    include: {
                        product: true
                    }
                }
            },
            orderBy: {
                receivedDate: 'asc'
            }
        })

        // Calculate profit for each purchase order based on the date
        const profitData: { date: string; profit: number; totalPurchase: number; estimatedSales: number }[] = []
        const dateMap = new Map<string, { profit: number; totalPurchase: number; estimatedSales: number }>()

        for (const po of purchaseOrders) {
            const date = po.receivedDate?.toISOString().split('T')[0] || ''
            
            let poProfit = 0
            let poPurchase = 0
            let poEstimatedSales = 0

            for (const item of po.items) {
                if (item.product) {
                    // Purchase price per unit from the bill (what we paid)
                    const purchasePricePerUnit = Number(item.unitPrice) || 0
                    
                    // Sale price per unit (what we charge customers)
                    const salePricePerUnit = Number(item.product.priceRupees) || 0
                    
                    // Profit per unit = sale price per unit - purchase price per unit
                    const profitPerUnit = salePricePerUnit - purchasePricePerUnit
                    
                    // Total quantities received
                    const receivedQty = Number(item.receivedQuantity) || 0
                    
                    // Calculate totals
                    const totalPurchase = purchasePricePerUnit * receivedQty
                    const totalEstimatedSales = salePricePerUnit * receivedQty
                    const totalProfit = profitPerUnit * receivedQty
                    
                    poProfit += totalProfit
                    poPurchase += totalPurchase
                    poEstimatedSales += totalEstimatedSales
                }
            }

            // Aggregate by date
            const existing = dateMap.get(date)
            if (existing) {
                existing.profit += poProfit
                existing.totalPurchase += poPurchase
                existing.estimatedSales += poEstimatedSales
            } else {
                dateMap.set(date, {
                    profit: poProfit,
                    totalPurchase: poPurchase,
                    estimatedSales: poEstimatedSales
                })
            }
        }

        // Convert map to array
        for (const [date, data] of dateMap.entries()) {
            profitData.push({
                date,
                profit: Math.round(data.profit * 100) / 100,
                totalPurchase: Math.round(data.totalPurchase * 100) / 100,
                estimatedSales: Math.round(data.estimatedSales * 100) / 100
            })
        }

        // Sort by date
        profitData.sort((a, b) => a.date.localeCompare(b.date))

        // Calculate summary
        const totalProfit = profitData.reduce((sum, d) => sum + d.profit, 0)
        const totalPurchase = profitData.reduce((sum, d) => sum + d.totalPurchase, 0)
        const totalEstimatedSales = profitData.reduce((sum, d) => sum + d.estimatedSales, 0)
        const profitMargin = totalPurchase > 0 ? (totalProfit / totalPurchase) * 100 : 0

        return res.status(200).json({
            profitData,
            summary: {
                totalProfit: Math.round(totalProfit * 100) / 100,
                totalPurchase: Math.round(totalPurchase * 100) / 100,
                totalEstimatedSales: Math.round(totalEstimatedSales * 100) / 100,
                profitMargin: Math.round(profitMargin * 100) / 100,
                totalOrders: purchaseOrders.length,
                startDate: startDate as string,
                endDate: endDate as string
            }
        })
    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to generate report', details: error.message })
    }
}
