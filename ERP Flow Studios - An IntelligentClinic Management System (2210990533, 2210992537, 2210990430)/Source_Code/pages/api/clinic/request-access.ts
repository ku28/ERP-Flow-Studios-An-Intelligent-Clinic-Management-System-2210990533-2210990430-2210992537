import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import crypto from 'crypto'
import { sendEmail } from '../../../lib/email'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    
    const { clinicAdminEmail, requestType } = req.body
    
    if (!clinicAdminEmail || !requestType) {
        return res.status(400).json({ error: 'Missing required fields' })
    }

    try {
        // Look up clinic admin user to get their clinic
        const adminUser = await prisma.user.findUnique({
            where: { email: clinicAdminEmail },
            select: { clinicId: true, name: true }
        })

        if (!adminUser || !adminUser.clinicId) {
            return res.status(404).json({ error: 'Clinic admin not found. Please ensure you are using a registered clinic admin email.' })
        }

        // Get clinic details
        const clinic = await prisma.clinic.findUnique({
            where: { id: adminUser.clinicId }
        })

        if (!clinic) {
            return res.status(404).json({ error: 'Clinic not found' })
        }
        
        const clinicId = clinic.clinicId

        // Generate approval token
        const approvalToken = crypto.randomBytes(32).toString('hex')

        // Calculate expiration (24 hours from now)
        const expiresAt = new Date()
        expiresAt.setHours(expiresAt.getHours() + 24)

        // Create access request
        const accessRequest = await prisma.clinicAccessRequest.create({
            data: {
                clinicAdminEmail,
                clinicId,
                clinicName: clinic.name,
                requestType,
                approvalToken,
                expiresAt,
                userEmail: adminUser.name ? clinicAdminEmail : clinicAdminEmail,
                userName: adminUser.name || clinicAdminEmail.split('@')[0]
            }
        })

        // Get super admin emails
        const superAdmins = await prisma.user.findMany({
            where: { role: 'super_admin' },
            select: { email: true }
        })

        const superAdminEmails = superAdmins.map((admin: any) => admin.email).filter(Boolean)
        
        if (superAdminEmails.length === 0) {
            return res.status(500).json({ error: 'No super admin email configured' })
        }

        // Generate approval link
        const approvalUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/clinic/approve-access?token=${approvalToken}`

        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
        .button { display: inline-block; padding: 12px 30px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
        .info-box { background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏥 Clinic Access Request</h1>
        </div>
        <div class="content">
            <h2>New Access Request</h2>
            <p>A clinic administrator has requested access to the ERP system.</p>
            
            <div class="info-box">
                <strong>Request Details:</strong><br>
                🏢 <strong>Clinic:</strong> ${clinic.name}<br>
                🏥 <strong>Clinic Code:</strong> ${clinicId}<br>
                📧 <strong>Admin Email:</strong> ${clinicAdminEmail}<br>
                <strong>Request Type:</strong> ${requestType === 'access_code' ? 'Access Code Request' : 'Full System Access'}
            </div>

            <p>Click the button below to review and approve this request:</p>
            
            <div style="text-align: center;">
                <a href="${approvalUrl}" class="button">✅ Review & Approve</a>
            </div>

            <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <code style="background-color: #e5e7eb; padding: 5px; display: block; margin-top: 5px; word-break: break-all;">${approvalUrl}</code>
            </p>

            <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280;">
                ⚠️ <strong>Note:</strong> This request will expire in 24 hours.
            </p>
        </div>
        <div class="footer">
            <p>ERP Flow Studios System - Automated Email</p>
        </div>
    </div>
</body>
</html>
        `

        // Send emails to all super admins
        await Promise.all(
            superAdminEmails.map((adminEmail: any) =>
                sendEmail({
                    to: adminEmail,
                    subject: `📋 New Clinic Access Request: ${clinic.name}`,
                    html: emailHtml
                })
            )
        )

        return res.status(201).json({
            message: 'Request sent to super admin for approval',
            requestId: accessRequest.id,
            approvalToken: approvalToken // Return token for polling
        })
    } catch (err: any) {
        return res.status(500).json({ error: String(err?.message || err) })
    }
}
