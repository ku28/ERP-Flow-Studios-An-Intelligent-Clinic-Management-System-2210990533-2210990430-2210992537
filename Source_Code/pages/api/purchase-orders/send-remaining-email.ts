import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireStaffOrAbove } from '../../../lib/auth'
import { getClinicAwareDoctorFilter } from '../../../lib/doctorUtils'
import { sendEmail } from '../../../lib/email'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }
    const user = await requireStaffOrAbove(req, res)
    if (!user) return

    try {
        const { purchaseOrderId, remainingItems } = req.body

        if (!purchaseOrderId || !remainingItems) {
            return res.status(400).json({ error: 'Missing required fields' })
        }

        // Get the purchase order with supplier details
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
                    select: { clinicId: true, email: true, clinic: { select: { email: true, name: true } } }
                }
            }
        })

        if (!purchaseOrder) {
            return res.status(404).json({ error: 'Purchase order not found' })
        }

        if (!purchaseOrder.supplier?.email) {
            return res.status(400).json({ error: 'Supplier has no email address' })
        }

        // Prepare email content
        const itemsList = remainingItems.map((item: any) => 
            `<tr>
                <td style="padding: 8px; border: 1px solid #ddd;">${item.productName}</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.ordered}</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.received}</td>
                <td style="padding: 8px; border: 1px solid #ddd; text-align: center; font-weight: bold; color: #dc2626;">${item.remaining}</td>
            </tr>`
        ).join('')

        const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
                    .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; background: white; }
                    th { background: #3b82f6; color: white; padding: 12px; text-align: left; }
                    .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h2>Partial Delivery Notice - Remaining Items</h2>
                    </div>
                    <div class="content">
                        <p>Dear ${purchaseOrder.supplier.name},</p>
                        
                        <p>We have received a partial delivery for Purchase Order <strong>${purchaseOrder.poNumber}</strong>.</p>
                        
                        <p>The following items are still pending delivery:</p>
                        
                        <table>
                            <thead>
                                <tr>
                                    <th>Product Name</th>
                                    <th style="text-align: center;">Ordered</th>
                                    <th style="text-align: center;">Received</th>
                                    <th style="text-align: center;">Remaining</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${itemsList}
                            </tbody>
                        </table>
                        
                        <p><strong>Please arrange delivery of the remaining items at your earliest convenience.</strong></p>
                        
                        <p>If you have any questions or concerns, please contact us immediately.</p>
                        
                        <div class="footer">
                            <p>This is an automated message from the Purchase Order Management System.</p>
                            <p>Purchase Order: ${purchaseOrder.poNumber} | Date: ${new Date(purchaseOrder.orderDate).toLocaleDateString()}</p>
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `

        // Determine the clinic's sender email
        const clinicEmail = (purchaseOrder as any).doctor?.clinic?.email || (purchaseOrder as any).doctor?.email || null
        const clinicName = (purchaseOrder as any).doctor?.clinic?.name || null
        const clinicId = (purchaseOrder as any).doctor?.clinicId || null
        const fromAddress = clinicEmail
            ? (clinicName ? `${clinicName} <${clinicEmail}>` : clinicEmail)
            : undefined

        // Send email
        await sendEmail({
            to: purchaseOrder.supplier.email,
            subject: `Remaining Items Notice - PO ${purchaseOrder.poNumber}`,
            html: emailHtml,
            from: fromAddress,
            replyTo: clinicEmail || undefined,
            clinicId: clinicId || undefined
        })

        res.status(200).json({ 
            success: true, 
            message: 'Remaining items email sent successfully' 
        })

    } catch (error: any) {
        res.status(500).json({ 
            error: 'Failed to send email',
            details: error.message 
        })
    }
}

