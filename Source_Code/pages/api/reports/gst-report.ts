import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { getClinicAwareDoctorFilter, getDoctorFilter } from '../../../lib/doctorUtils'
import { requireStaffOrAbove } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireStaffOrAbove(req, res)
    if (!user) return

    if (req.method === 'GET') {
        try {
            const { doctorId, startDate, endDate, gstRate } = req.query
            const selectedDoctorId = doctorId ? Number(doctorId) : null
            const doctorFilter = getDoctorFilter(user, selectedDoctorId)
            const clinicFilter = await getClinicAwareDoctorFilter(user, prisma)
            const gstPercentage = gstRate ? Number(gstRate) : 5 // Default 5% if not provided

            const dateFilter: any = {}
            if (startDate && endDate) {
                dateFilter.invoiceDate = {
                    gte: new Date(startDate as string),
                    lte: new Date(endDate as string)
                }
            }

            // Get all invoices for the period
            const invoices = await prisma.customerInvoice.findMany({
                where: {
                    AND: [
                        clinicFilter,
                        doctorFilter,
                        dateFilter
                    ]
                },
                include: {
                    items: {
                        include: {
                            product: true
                        }
                    }
                }
            })

            // Function to extract GST from inclusive price
            const extractGST = (inclusivePrice: number) => {
                // Formula: GST Amount = (Inclusive Price × GST Rate) / (100 + GST Rate)
                const gstAmount = (inclusivePrice * gstPercentage) / (100 + gstPercentage)
                const basePrice = inclusivePrice - gstAmount
                return { basePrice, gstAmount }
            }

            // Calculate totals with GST extraction
            let totalBaseAmount = 0
            let totalGSTAmount = 0
            let totalDiscount = 0

            invoices.forEach((inv: any) => {
                const { basePrice, gstAmount } = extractGST(inv.totalAmount)
                totalBaseAmount += basePrice
                totalGSTAmount += gstAmount
                totalDiscount += inv.discount || 0
            })

            // Group by tax rate (using the configured GST rate)
            const taxBreakdown: any = {}
            invoices.forEach((inv: any) => {
                inv.items.forEach((item: any) => {
                    const rate = gstPercentage // Use the configured GST rate
                    if (!taxBreakdown[rate]) {
                        taxBreakdown[rate] = {
                            taxRate: rate,
                            taxableAmount: 0,
                            cgst: 0,
                            sgst: 0,
                            igst: 0,
                            totalTax: 0
                        }
                    }
                    
                    // Extract GST from the item's total (inclusive price)
                    const itemInclusiveTotal = item.quantity * item.unitPrice - (item.discount || 0)
                    const { basePrice, gstAmount } = extractGST(itemInclusiveTotal)
                    
                    taxBreakdown[rate].taxableAmount += basePrice
                    taxBreakdown[rate].cgst += gstAmount / 2
                    taxBreakdown[rate].sgst += gstAmount / 2
                    taxBreakdown[rate].totalTax += gstAmount
                })
            })

            // HSN Summary with GST extraction
            const hsnSummary: any = {}
            invoices.forEach((inv: any) => {
                inv.items.forEach((item: any) => {
                    const hsn = item.product?.hsnCode || 'N/A'
                    if (!hsnSummary[hsn]) {
                        hsnSummary[hsn] = {
                            hsnCode: hsn,
                            description: item.description,
                            quantity: 0,
                            value: 0,
                            taxAmount: 0
                        }
                    }
                    
                    const itemInclusiveTotal = item.quantity * item.unitPrice - (item.discount || 0)
                    const { basePrice, gstAmount } = extractGST(itemInclusiveTotal)
                    
                    hsnSummary[hsn].quantity += item.quantity
                    hsnSummary[hsn].value += basePrice
                    hsnSummary[hsn].taxAmount += gstAmount
                })
            })

            return res.status(200).json({
                summary: {
                    totalInvoices: invoices.length,
                    totalSales: totalBaseAmount + totalGSTAmount, // Total inclusive amount
                    totalTax: totalGSTAmount,
                    totalDiscount,
                    netSales: totalBaseAmount, // Base amount without GST
                    gstRate: gstPercentage
                },
                taxBreakdown: Object.values(taxBreakdown),
                hsnSummary: Object.values(hsnSummary),
                invoices
            })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch GST report' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
