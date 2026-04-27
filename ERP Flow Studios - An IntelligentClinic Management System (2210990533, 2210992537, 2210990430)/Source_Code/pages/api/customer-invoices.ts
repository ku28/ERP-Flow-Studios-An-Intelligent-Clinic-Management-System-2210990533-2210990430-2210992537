import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { getClinicAwareDoctorFilter, getDoctorIdForCreate } from '../../lib/doctorUtils'
import { requireStaffOrAbove, getClinicIdFromUser } from '../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireStaffOrAbove(req, res)
    if (!user) return
    
    if (req.method === 'GET') {
        try {
            // Filter by clinic for multi-tenant isolation
            const clinicId = user.role === 'super_admin' ? null : (user.clinicId || user.clinic?.id)
            
            if (!clinicId && user.role !== 'super_admin') {
                return res.status(403).json({ error: 'No clinic association' })
            }
            
            const whereClause: any = clinicId ? { clinicId } : {}

            // Pagination support (optional)
            const page = req.query.page ? Math.max(1, Number(req.query.page)) : null
            const limit = req.query.limit ? Math.min(200, Math.max(1, Number(req.query.limit))) : null
            const skip = page && limit ? (page - 1) * limit : undefined
            const take = limit || undefined

            // Optional: include visit prescriptions only when requested
            const includePrescriptions = req.query.include === 'prescriptions'
            
            const [invoices, total] = await Promise.all([
                prisma.customerInvoice.findMany({
                    where: whereClause,
                    orderBy: { invoiceDate: 'desc' },
                    skip,
                    take,
                    include: {
                        patient: {
                            select: {
                                id: true,
                                fullName: true,
                                firstName: true,
                                lastName: true,
                                phone: true,
                                doctor: {
                                    select: { id: true, name: true }
                                }
                            }
                        },
                        visit: includePrescriptions ? {
                            include: { prescriptions: true }
                        } : {
                            select: { id: true, opdNo: true, date: true }
                        },
                        items: {
                            include: {
                                product: { select: { id: true, name: true, priceRupees: true } }
                            }
                        },
                        payments: true
                    }
                }),
                page ? prisma.customerInvoice.count({ where: whereClause }) : Promise.resolve(0),
            ])

            if (page && limit) {
                return res.status(200).json({
                    data: invoices,
                    total,
                    page,
                    limit,
                    totalPages: Math.ceil(total / limit),
                })
            }

            return res.status(200).json(invoices)
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch invoices' })
        }
    }

    if (req.method === 'POST') {
        try {
            const {
                patientId,
                customerName,
                customerEmail,
                customerPhone,
                customerAddress,
                customerGSTIN,
                invoiceDate,
                dueDate,
                items,
                discount,
                processingFees,
                paymentMethod,
                notes,
                termsAndConditions
            } = req.body

            // Get doctorId and clinicId for invoice association
            const doctorId = getDoctorIdForCreate(user, null)
            const clinicId = user.role === 'super_admin' ? null : (user.clinicId || user.clinic?.id)
            
            if (!clinicId && user.role !== 'super_admin') {
                return res.status(403).json({ error: 'No clinic association' })
            }
            
            const whereClause = await getClinicAwareDoctorFilter(user, prisma)

            if (patientId) {
                const clinicPatient = await prisma.patient.findFirst({
                    where: { id: Number(patientId), clinicId },
                    select: { id: true }
                })
                if (!clinicPatient) {
                    return res.status(404).json({ error: 'Patient not found or access denied' })
                }
            }

            const requestedProductIds = [
                ...new Set(
                    (items || [])
                        .map((item: any) => item?.productId ? Number(item.productId) : null)
                        .filter((v: number | null): v is number => v !== null && Number.isInteger(v) && v > 0)
                )
            ]

            if (requestedProductIds.length > 0) {
                const allowedProducts = await prisma.product.findMany({
                    where: { id: { in: requestedProductIds }, ...whereClause },
                    select: { id: true }
                })
                if (allowedProducts.length !== requestedProductIds.length) {
                    return res.status(403).json({ error: 'One or more products are outside your clinic scope' })
                }
            }

            // Calculate totals
            let subtotal = 0
            let taxAmount = 0

            const invoiceItems = items.map((item: any) => {
                const itemTotal = item.quantity * item.unitPrice
                const itemTax = itemTotal * (item.taxRate || 0) / 100
                const itemDiscount = item.discount || 0
                
                subtotal += itemTotal
                taxAmount += itemTax

                return {
                    productId: item.productId ? Number(item.productId) : null,
                    description: item.description,
                    quantity: Number(item.quantity),
                    unitPrice: Number(item.unitPrice),
                    taxRate: Number(item.taxRate || 0),
                    discount: Number(itemDiscount),
                    totalAmount: Math.round(itemTotal + itemTax - itemDiscount)
                }
            })

            const totalAmount = Math.round(subtotal + taxAmount - (discount || 0))
            const balanceAmount = 0  // Set to 0 for paid invoices

            let invoice: any = null
            let createError: any = null
            for (let attempt = 0; attempt < 8; attempt++) {
                const lastInvoice = await prisma.customerInvoice.findFirst({
                    select: { id: true },
                    orderBy: { id: 'desc' }
                })
                const invoiceNumber = `INV-${String((lastInvoice?.id || 0) + 1 + attempt).padStart(6, '0')}`

                try {
                    invoice = await prisma.customerInvoice.create({
                        data: {
                            invoiceNumber,
                            patientId: patientId ? Number(patientId) : null,
                            doctorId,
                            clinicId,
                            customerName,
                            customerEmail,
                            customerPhone,
                            customerAddress,
                            customerGSTIN,
                            invoiceDate: invoiceDate ? new Date(invoiceDate) : new Date(),
                            dueDate: dueDate ? new Date(dueDate) : null,
                            subtotal: Math.round(subtotal),
                            taxAmount: Math.round(taxAmount),
                            discount: Math.round(discount || 0),
                            totalAmount,
                            balanceAmount,
                            paidAmount: totalAmount,  // Set paidAmount to totalAmount for paid status
                            status: 'paid',  // Set status to paid
                            paymentMethod: paymentMethod || 'CASH',
                            processingFees: processingFees ? Number(processingFees) : 0,
                            notes,
                            termsAndConditions,
                            items: {
                                create: invoiceItems
                            }
                        },
                        include: {
                            patient: true,
                            items: {
                                include: {
                                    product: true
                                }
                            }
                        }
                    })
                    createError = null
                    break
                } catch (err: any) {
                    if (err?.code === 'P2002') {
                        createError = err
                        continue
                    }
                    throw err
                }
            }

            if (!invoice) {
                throw createError || new Error('Could not generate unique invoice number')
            }

            // Update product stock for items sold
            for (const item of items) {
                if (item.productId) {
                    const product = await prisma.product.findFirst({
                        where: {
                            id: Number(item.productId),
                            ...whereClause
                        }
                    })

                    if (product) {
                        const newQuantity = product.quantity - item.quantity
                        await prisma.product.update({
                            where: { id: Number(item.productId) },
                            data: {
                                quantity: Math.max(0, newQuantity),
                                totalSales: product.totalSales + item.quantity
                            }
                        })

                        // Create stock transaction
                        await prisma.stockTransaction.create({
                            data: {
                                productId: Number(item.productId),
                                transactionType: 'OUT',
                                quantity: item.quantity,
                                unitPrice: item.unitPrice,
                                totalValue: item.quantity * item.unitPrice,
                                balanceQuantity: Math.max(0, newQuantity),
                                referenceType: 'CustomerInvoice',
                                referenceId: invoice.id,
                                notes: `Sold via Invoice ${invoice.invoiceNumber}`
                            }
                        })
                    }
                }
            }

            return res.status(201).json(invoice)
        } catch (error) {
            return res.status(500).json({ error: 'Failed to create invoice' })
        }
    }

    if (req.method === 'PUT') {
        try {
            const { id, status, paidAmount, paymentMethod } = req.body

            // Verify invoice belongs to user's clinic before updating
            const clinicId = user.role === 'super_admin' ? null : (user.clinicId || user.clinic?.id)
            
            if (!clinicId && user.role !== 'super_admin') {
                return res.status(403).json({ error: 'No clinic association' })
            }
            
            const whereClause: any = clinicId ? { clinicId } : {}
            const invoice = await prisma.customerInvoice.findFirst({
                where: { id: Number(id), ...whereClause }
            })

            if (!invoice) {
                return res.status(404).json({ error: 'Invoice not found or access denied' })
            }

            const newPaidAmount = invoice.paidAmount + (paidAmount || 0)
            const newBalanceAmount = invoice.totalAmount - newPaidAmount
            const newStatus = newBalanceAmount === 0 ? 'paid' : newBalanceAmount < invoice.totalAmount ? 'partial' : 'unpaid'

            const updatedInvoice = await prisma.customerInvoice.update({
                where: { id: Number(id) },
                data: {
                    status: status || newStatus,
                    paidAmount: newPaidAmount,
                    balanceAmount: newBalanceAmount,
                    paymentMethod
                },
                include: {
                    patient: true,
                    items: {
                        include: {
                            product: true
                        }
                    },
                    payments: true
                }
            })

            // Create payment record if payment was made
            if (paidAmount > 0) {
                const paymentNumber = `PAY-${Date.now()}`
                await prisma.payment.create({
                    data: {
                        paymentNumber,
                        paymentType: 'RECEIVED',
                        referenceType: 'CustomerInvoice',
                        referenceId: Number(id),
                        amount: paidAmount,
                        paymentMethod: paymentMethod || 'CASH',
                        notes: `Payment for Invoice ${invoice.invoiceNumber}`
                    }
                })
            }

            return res.status(200).json(updatedInvoice)
        } catch (error) {
            return res.status(500).json({ error: 'Failed to update invoice' })
        }
    }

    if (req.method === 'DELETE') {
        try {
            const { id } = req.query

            // Verify invoice belongs to user's clinic before deleting
            const clinicId = user.role === 'super_admin' ? null : (user.clinicId || user.clinic?.id)
            
            if (!clinicId && user.role !== 'super_admin') {
                return res.status(403).json({ error: 'No clinic association' })
            }
            
            const whereClause: any = clinicId ? { clinicId } : {}
            const invoice = await prisma.customerInvoice.findFirst({
                where: { id: Number(id), ...whereClause }
            })

            if (!invoice) {
                return res.status(404).json({ error: 'Invoice not found or access denied' })
            }

            await prisma.customerInvoice.delete({
                where: { id: Number(id) }
            })

            return res.status(200).json({ message: 'Invoice deleted successfully' })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to delete invoice' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
