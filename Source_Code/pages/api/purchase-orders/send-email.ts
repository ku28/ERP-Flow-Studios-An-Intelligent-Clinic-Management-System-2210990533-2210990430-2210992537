import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireStaffOrAbove } from '../../../lib/auth'
import { getClinicAwareDoctorFilter } from '../../../lib/doctorUtils'
import { sendEmail } from '../../../lib/email'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireStaffOrAbove(req, res)
    if (!user) return
    
    if (req.method === 'POST') {
        try {
            const { purchaseOrderId, productNotes = {} } = req.body

            if (!purchaseOrderId) {
                return res.status(400).json({ error: 'Purchase order ID is required' })
            }

            // Fetch the purchase order with all details
            const whereClause = await getClinicAwareDoctorFilter(user, prisma)
            const purchaseOrder = await prisma.purchaseOrder.findFirst({
                where: { id: Number(purchaseOrderId), ...whereClause },
                include: {
                    supplier: true,
                    items: {
                        include: {
                            product: true
                        }
                    },
                    doctor: {
                        select: { clinicId: true, email: true, name: true, clinic: { select: { email: true, name: true } } }
                    }
                }
            })


            if (!purchaseOrder) {
                return res.status(404).json({ error: 'Purchase order not found' })
            }

            if (!purchaseOrder.supplier.email) {
                return res.status(400).json({ error: 'Supplier does not have an email address' })
            }


            const clinicId = (purchaseOrder as any).doctor?.clinicId || null
            const clinicName = (purchaseOrder as any).doctor?.clinic?.name || 'Your Clinic'
            const adminUser = clinicId
                ? await prisma.user.findFirst({
                    where: {
                        clinicId,
                        role: 'admin'
                    },
                    select: {
                        name: true,
                        email: true
                    }
                })
                : null
            const adminName = adminUser?.name || (purchaseOrder as any).doctor?.name || 'Clinic Admin'

            const normalizedNotes: Record<string, string> = Object.entries(productNotes || {}).reduce((acc, [key, value]) => {
                const note = String(value || '').trim()
                if (note) acc[String(key)] = note
                return acc
            }, {} as Record<string, string>)

            const escapeHtml = (value: string) => value
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/\"/g, '&quot;')
                .replace(/'/g, '&#39;')

            const itemsTable = purchaseOrder.items.map((item: any, index: number) => {
                const unitParts = item.product.unit ? String(item.product.unit).trim().split(/\s+/) : []
                const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                
                // Calculate ordered quantity as actual (flow)
                const flowOrdered = item.quantity
                const actualOrdered = unitQuantity > 0 ? Math.floor(flowOrdered / unitQuantity) : 0
                const note = normalizedNotes[String(item.productId)] || ''
                
                return `
                <tr>
                    <td style="padding: 8px; border: 1px solid #ddd;">${index + 1}</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${item.product.name}</td>
                    <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${actualOrdered.toFixed(1)} (${flowOrdered.toFixed(1)})</td>
                    <td style="padding: 8px; border: 1px solid #ddd;">${note ? escapeHtml(note) : '-'}</td>
                </tr>
            `}).join('')

            const emailHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 800px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
                        .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
                        table { width: 100%; border-collapse: collapse; margin: 20px 0; background: white; }
                        th { background: #667eea; color: white; padding: 12px; text-align: left; }
                        .info-row { display: flex; justify-content: space-between; margin: 10px 0; padding: 10px; background: white; border-radius: 4px; }
                        .total { font-size: 1.2em; font-weight: bold; color: #667eea; text-align: right; margin-top: 20px; padding: 15px; background: white; border-radius: 4px; }
                        .footer { margin-top: 30px; padding: 20px; background: white; border-radius: 4px; text-align: center; color: #666; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>Demand Request</h1>
                            <p style="margin: 0; font-size: 1.2em;">${purchaseOrder.poNumber}</p>
                        </div>
                        <div class="content">
                            <div style="background: white; padding: 20px; border-radius: 4px; margin-bottom: 20px;">
                                <h2 style="color: #667eea; margin-top: 0;">Order Details</h2>
                                <div class="info-row">
                                    <span><strong>Order Date:</strong></span>
                                    <span>${new Date(purchaseOrder.orderDate).toLocaleDateString('en-GB')}</span>
                                </div>
                                ${purchaseOrder.expectedDate ? `
                                <div class="info-row">
                                    <span><strong>Expected Delivery:</strong></span>
                                    <span>${new Date(purchaseOrder.expectedDate).toLocaleDateString('en-GB')}</span>
                                </div>
                                ` : ''}
                                <div class="info-row">
                                    <span><strong>Supplier:</strong></span>
                                    <span>${purchaseOrder.supplier.name}</span>
                                </div>
                                <div class="info-row">
                                    <span><strong>Clinic:</strong></span>
                                    <span>${clinicName}</span>
                                </div>
                                <div class="info-row">
                                    <span><strong>Clinic Admin:</strong></span>
                                    <span>${adminName}</span>
                                </div>
                                <div class="info-row">
                                    <span><strong>Status:</strong></span>
                                    <span style="color: #f59e0b; font-weight: bold;">${purchaseOrder.status.toUpperCase()}</span>
                                </div>
                            </div>

                            <h2 style="color: #667eea;">Demand List</h2>
                            <table>
                                <thead>
                                    <tr>
                                        <th style="width: 10%;">S.No</th>
                                        <th style="width: 45%;">Product Name</th>
                                        <th style="width: 15%; text-align: center;">Quantity</th>
                                        <th style="width: 30%;">Notes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsTable}
                                </tbody>
                            </table>

                            ${purchaseOrder.notes ? `
                            <div style="background: #fef3c7; padding: 15px; border-radius: 4px; margin-top: 20px; border-left: 4px solid #f59e0b;">
                                <strong>Note:</strong> ${purchaseOrder.notes}
                            </div>
                            ` : ''}

                            <div class="footer">
                                <p style="margin: 0;"><strong>Please confirm receipt of this demand request.</strong></p>
                                <p style="margin: 5px 0 0 0; font-size: 0.9em;">
                                    For any queries, please contact us.
                                </p>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
            `

            // Determine the clinic's sender email (clinic email > doctor email > SMTP default)
            const clinicEmail = (purchaseOrder as any).doctor?.clinic?.email || (purchaseOrder as any).doctor?.email || null
            const fromAddress = clinicEmail
                ? (clinicName ? `${clinicName} <${clinicEmail}>` : clinicEmail)
                : undefined

            // Send email
            await sendEmail({
                to: purchaseOrder.supplier.email,
                subject: `Purchase Order ${purchaseOrder.poNumber} - Order Confirmation`,
                html: emailHtml,
                from: fromAddress,
                replyTo: clinicEmail || undefined,
                clinicId: clinicId || undefined
            })


            return res.status(200).json({ 
                success: true, 
                message: `Purchase order sent to ${purchaseOrder.supplier.name} (${purchaseOrder.supplier.email})`
            })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to send email: ' + (error instanceof Error ? error.message : 'Unknown error') })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
