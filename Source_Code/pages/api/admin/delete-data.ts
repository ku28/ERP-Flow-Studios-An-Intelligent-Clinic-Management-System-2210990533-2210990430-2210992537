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

    if (req.method === 'DELETE') {
        try {
            const { tables } = req.body

            if (!tables || !Array.isArray(tables) || tables.length === 0) {
                return res.status(400).json({ error: 'Tables array is required' })
            }

            // Get clinic filter - CRITICAL for data isolation
            const clinicId = getClinicIdFromUser(authUser)
            const doctorIds = await prisma.user.findMany({
                where: { clinicId, role: { in: ['doctor', 'admin'] } },
                select: { id: true }
            }).then((docs: { id: number }[]) => docs.map(d => d.id))

            const deletedCounts: Record<string, number> = {}
            
            // Define proper deletion order to respect foreign key constraints
            // Child tables must be deleted before parent tables
            const deletionOrder = [
                'tasks',
                'payments',
                'customerInvoices', // Includes customerInvoiceItem
                'invoices',
                'prescriptions',
                'visits',
                'treatments', // Includes treatmentProduct
                'appointments',
                'tokens',
                'demandForecasts',
                'stockTransactions',
                'purchaseOrders', // Includes purchaseOrderItem
                'productOrders',
                'sales',
                'purchases',
                'productBatches',
                'products',
                'categories',
                'suppliers',
                'patients'
            ]

            // Filter to only include tables that were requested and exist in our order
            const tablesToDelete = deletionOrder.filter(table => tables.includes(table))
            
            // Also add any requested tables that aren't in our predefined order (fallback)
            const extraTables = tables.filter(table => !deletionOrder.includes(table))
            const allTablesToDelete = [...tablesToDelete, ...extraTables]

            // Reset data in correct order to respect foreign key constraints
            for (const table of allTablesToDelete) {
                let count = 0
                
                try {
                    switch (table) {
                        case 'tasks':
                            const tasksResult = await prisma.task.deleteMany({ 
                                where: { 
                                    OR: [
                                        { doctor: { clinicId } },
                                        { assignedToUser: { clinicId } },
                                        { assignedByUser: { clinicId } },
                                        { visit: { patient: { clinicId } } }
                                    ]
                                } 
                            })
                            count = tasksResult.count
                            break
                        case 'payments':
                            const paymentsResult = await prisma.payment.deleteMany({ where: { customerInvoice: { doctor: { clinicId } } } })
                            count = paymentsResult.count
                            break
                        case 'customerInvoices':
                            await prisma.customerInvoiceItem.deleteMany({ where: { customerInvoice: { doctor: { clinicId } } } })
                            const invoicesResult = await prisma.customerInvoice.deleteMany({ where: { doctor: { clinicId } } })
                            count = invoicesResult.count
                            break
                        case 'prescriptions':
                            const prescriptionsResult = await prisma.prescription.deleteMany({ 
                                where: { 
                                    OR: [
                                        { doctor: { clinicId } },
                                        { visit: { patient: { clinicId } } }
                                    ]
                                } 
                            })
                            count = prescriptionsResult.count
                            break
                        case 'visits':
                            const visitsResult = await prisma.visit.deleteMany({ where: { patient: { clinicId } } })
                            count = visitsResult.count
                            break
                        case 'treatments':
                            await prisma.treatmentProduct.deleteMany({ where: { treatment: { doctor: { clinicId } } } })
                            const treatmentsResult = await prisma.treatment.deleteMany({ where: { doctor: { clinicId } } })
                            count = treatmentsResult.count
                            break
                        case 'demandForecasts':
                            const forecastsResult = await prisma.demandForecast.deleteMany({ where: { product: { doctorId: { in: doctorIds } } } })
                            count = forecastsResult.count
                            break
                        case 'stockTransactions':
                            const transactionsResult = await prisma.stockTransaction.deleteMany({ where: { product: { doctorId: { in: doctorIds } } } })
                            count = transactionsResult.count
                            break
                        case 'purchaseOrders':
                            await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { doctorId: { in: doctorIds } } } })
                            const poResult = await prisma.purchaseOrder.deleteMany({ where: { doctorId: { in: doctorIds } } })
                            count = poResult.count
                            break
                        case 'productOrders':
                            const productOrdersResult = await prisma.productOrder.deleteMany({ where: { product: { doctorId: { in: doctorIds } } } })
                            count = productOrdersResult.count
                            break
                        case 'sales':
                            const salesResult = await prisma.sale.deleteMany({ where: { productBatch: { product: { doctorId: { in: doctorIds } } } } })
                            count = salesResult.count
                            break
                        case 'purchases':
                            const purchasesResult = await prisma.purchase.deleteMany({ where: { productBatch: { product: { doctorId: { in: doctorIds } } } } })
                            count = purchasesResult.count
                            break
                        case 'productBatches':
                            const batchesResult = await prisma.productBatch.deleteMany({ where: { product: { doctorId: { in: doctorIds } } } })
                            count = batchesResult.count
                            break
                        case 'products':
                            const productsResult = await prisma.product.deleteMany({ where: { doctorId: { in: doctorIds } } })
                            count = productsResult.count
                            break
                        case 'categories':
                            const categoriesResult = await prisma.category.deleteMany({ where: { doctorId: { in: doctorIds } } })
                            count = categoriesResult.count
                            break
                        case 'suppliers':
                            const suppliersResult = await prisma.supplier.deleteMany({ where: { doctorId: { in: doctorIds } } })
                            count = suppliersResult.count
                            break
                        case 'tokens':
                            const tokensResult = await prisma.token.deleteMany({ where: { patient: { clinicId } } })
                            count = tokensResult.count
                            break
                        case 'appointments':
                            const appointmentsResult = await prisma.appointment.deleteMany({ where: { patient: { clinicId } } })
                            count = appointmentsResult.count
                            break
                        case 'invoices':
                            const invoicesOldResult = await prisma.invoice.deleteMany({ where: { patient: { clinicId } } })
                            count = invoicesOldResult.count
                            break
                        case 'patients':
                            const patientsResult = await prisma.patient.deleteMany({ where: { clinicId } })
                            count = patientsResult.count
                            break
                        default:
                            console.warn(`Unknown table: ${table}`)
                            continue
                    }
                    
                    deletedCounts[table] = count
                } catch (error: any) {
                    throw new Error(`Failed to reset ${table}: ${error.message}`)
                }
            }

            return res.status(200).json({ 
                message: `Successfully reset data from ${tables.length} table(s)`,
                deletedCounts 
            })
        } catch (error: any) {
            return res.status(500).json({ error: error.message || 'Failed to reset data' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
