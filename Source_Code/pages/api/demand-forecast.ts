import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { requireStaffOrAbove } from '../../lib/auth'
import { getClinicAwareDoctorFilter } from '../../lib/doctorUtils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireStaffOrAbove(req, res)
    if (!user) return
    const doctorFilter = await getClinicAwareDoctorFilter(user, prisma)

    if (req.method === 'POST') {
        try {
            // This endpoint calculates demand forecasts for all products based on historical usage
            
            // Get all products in the user's clinic
            const products = await prisma.product.findMany({
                where: doctorFilter,
                include: {
                    category: true
                }
            })

            // Get all OUT transactions from the last 90 days
            const ninetyDaysAgo = new Date()
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

            const forecasts = []

            for (const product of products) {
                // Get historical OUT transactions for this product
                const transactions = await prisma.stockTransaction.findMany({
                    where: {
                        productId: product.id,
                        transactionType: 'OUT',
                        transactionDate: {
                            gte: ninetyDaysAgo
                        }
                    },
                    orderBy: {
                        transactionDate: 'desc'
                    }
                })

                // Calculate monthly average
                const totalQuantity = transactions.reduce((sum: number, tx: any) => sum + tx.quantity, 0)
                const monthlyAverage = totalQuantity / 3 // 90 days = ~3 months

                // Calculate reorder point: average monthly usage + safety stock (30%)
                const safetyStock = monthlyAverage * 0.3
                const reorderPoint = Math.ceil(monthlyAverage + safetyStock)

                // Suggested order quantity: 2 months of usage
                const suggestedOrderQuantity = Math.ceil(monthlyAverage * 2)

                // Predict next month's demand based on trend
                const predictedDemand = Math.ceil(monthlyAverage)

                // Create or update forecast
                const forecastMonth = new Date()
                forecastMonth.setMonth(forecastMonth.getMonth() + 1)
                forecastMonth.setDate(1) // First of next month

                const forecast = await prisma.demandForecast.upsert({
                    where: {
                        productId_forecastMonth: {
                            productId: product.id,
                            forecastMonth: forecastMonth
                        }
                    },
                    update: {
                        predictedDemand,
                        averageMonthlySales: monthlyAverage,
                        reorderPoint,
                        suggestedOrderQuantity,
                        notes: `Based on ${transactions.length} transactions over last 90 days`
                    },
                    create: {
                        productId: product.id,
                        forecastMonth,
                        predictedDemand,
                        averageMonthlySales: monthlyAverage,
                        reorderPoint,
                        suggestedOrderQuantity,
                        notes: `Based on ${transactions.length} transactions over last 90 days`
                    }
                })

                forecasts.push({
                    product: product.name,
                    currentStock: product.quantity,
                    reorderPoint,
                    predictedDemand,
                    suggestedOrderQuantity,
                    needsReorder: product.quantity <= reorderPoint,
                    forecast
                })
            }

            return res.status(200).json({
                message: 'Demand forecasts calculated successfully',
                forecasts,
                timestamp: new Date().toISOString()
            })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to calculate demand forecast' })
        }
    }

    if (req.method === 'GET') {
        try {
            // Get forecasts for products in the user's clinic
            const forecasts = await prisma.demandForecast.findMany({
                where: {
                    product: doctorFilter
                },
                include: {
                    product: {
                        include: {
                            category: true
                        }
                    }
                },
                orderBy: {
                    forecastMonth: 'desc'
                }
            })

            return res.status(200).json(forecasts)
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch demand forecasts' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
