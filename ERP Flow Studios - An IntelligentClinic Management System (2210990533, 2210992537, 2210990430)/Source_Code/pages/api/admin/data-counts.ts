import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser, getClinicIdFromUser } from '../../../lib/auth'
import { isFeatureAllowed } from '../../../lib/subscription'
import prisma from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Verify authentication
    const authUser = await getSessionUser(req)

    if (!authUser) {
        return res.status(401).json({ error: 'Not authenticated' })
    }

    // Check if user is admin
    if (authUser.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' })
    }

    if (!isFeatureAllowed(authUser?.clinic?.subscriptionPlan, 'admin_settings')) {
        return res.status(403).json({ error: 'Admin Settings is available in Standard plan.' })
    }

    if (req.method === 'GET') {
        try {
            // Reconnect Prisma in case connection was lost
            await prisma.$connect()
            
            // Get clinic filter
            const clinicId = getClinicIdFromUser(authUser)
            const doctorIds = await prisma.user.findMany({
                where: { clinicId, role: { in: ['doctor', 'admin'] } },
                select: { id: true }
            }).then((docs : { id: number }[]) => docs.map(d => d.id))
            
            const counts: Record<string, number> = {}

            // Get counts for each table with individual error handling
            try {
                counts.tasks = await prisma.task.count({ 
                    where: { 
                        OR: [
                            { doctor: { clinicId } },
                            { assignedToUser: { clinicId } },
                            { assignedByUser: { clinicId } },
                            { visit: { patient: { clinicId } } }
                        ]
                    } 
                })
            } catch (e) {
                counts.tasks = 0
            }
            
            try {
                counts.payments = await prisma.payment.count({ where: { customerInvoice: { doctor: { clinicId } } } })
            } catch (e) {
                counts.payments = 0
            }
            
            try {
                counts.customerInvoices = await prisma.customerInvoice.count({ where: { doctor: { clinicId } } })
            } catch (e) {
                counts.customerInvoices = 0
            }
            
            try {
                counts.prescriptions = await prisma.prescription.count({ 
                    where: { 
                        OR: [
                            { doctor: { clinicId } },
                            { visit: { patient: { clinicId } } }
                        ]
                    } 
                })
            } catch (e) {
                counts.prescriptions = 0
            }
            
            try {
                counts.visits = await prisma.visit.count({ where: { patient: { clinicId } } })
            } catch (e) {
                counts.visits = 0
            }
            
            try {
                counts.treatments = await prisma.treatment.count({ where: { doctor: { clinicId } } })
            } catch (e) {
                counts.treatments = 0
            }
            
            try {
                counts.demandForecasts = await prisma.demandForecast.count({ where: { product: { doctorId: { in: doctorIds } } } })
            } catch (e) {
                counts.demandForecasts = 0
            }
            
            try {
                counts.stockTransactions = await prisma.stockTransaction.count({ where: { product: { doctorId: { in: doctorIds } } } })
            } catch (e) {
                counts.stockTransactions = 0
            }
            
            try {
                counts.purchaseOrders = await prisma.purchaseOrder.count({ where: { doctorId: { in: doctorIds } } })
            } catch (e) {
                counts.purchaseOrders = 0
            }
            
            try {
                counts.productOrders = await prisma.productOrder.count({ where: { product: { doctorId: { in: doctorIds } } } })
            } catch (e) {
                counts.productOrders = 0
            }
            
            try {
                counts.sales = await prisma.sale.count({ where: { productBatch: { product: { doctorId: { in: doctorIds } } } } })
            } catch (e) {
                counts.sales = 0
            }
            
            try {
                counts.purchases = await prisma.purchase.count({ where: { productBatch: { product: { doctorId: { in: doctorIds } } } } })
            } catch (e) {
                counts.purchases = 0
            }
            
            try {
                counts.productBatches = await prisma.productBatch.count({ where: { product: { doctorId: { in: doctorIds } } } })
            } catch (e) {
                counts.productBatches = 0
            }
            
            try {
                counts.products = await prisma.product.count({ where: { doctorId: { in: doctorIds } } })
            } catch (e) {
                counts.products = 0
            }
            
            try {
                counts.categories = await prisma.category.count({ where: { doctorId: { in: doctorIds } } })
            } catch (e) {
                counts.categories = 0
            }
            
            try {
                counts.suppliers = await prisma.supplier.count({ where: { doctorId: { in: doctorIds } } })
            } catch (e) {
                counts.suppliers = 0
            }
            
            try {
                counts.tokens = await prisma.token.count({ where: { patient: { clinicId } } })
            } catch (e) {
                counts.tokens = 0
            }
            
            try {
                counts.appointments = await prisma.appointment.count({ where: { patient: { clinicId } } })
            } catch (e) {
                counts.appointments = 0
            }
            
            try {
                counts.invoices = await prisma.invoice.count({ where: { patient: { clinicId } } })
            } catch (e) {
                counts.invoices = 0
            }
            
            try {
                counts.patients = await prisma.patient.count({ where: { clinicId } })
            } catch (e) {
                counts.patients = 0
            }

            return res.status(200).json({ counts })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch data counts', details: error instanceof Error ? error.message : 'Unknown error' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
