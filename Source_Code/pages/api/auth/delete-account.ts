import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireAuth } from '../../../lib/auth'
import { clearSessionCookie } from '../../../lib/auth'
import nodemailer from 'nodemailer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const user = await requireAuth(req, res)
    if (!user) return

    try {
        // Store user info before deletion for email
        const userEmail = user.email
        const userName = user.name || user.email
        const userRole = user.role

        // Delete the user account
        await prisma.user.delete({
            where: { id: user.id }
        })

        // Send email notification to admin
        try {
            const transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: Number(process.env.SMTP_PORT),
                secure: false,
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASSWORD
                }
            })

            const adminEmail = process.env.SMTP_USER || process.env.ADMIN_EMAIL

            await transporter.sendMail({
                from: process.env.SMTP_FROM,
                to: adminEmail,
                subject: 'Account Deletion Notification - ERP Flow Studios',
                html: `
          <!DOCTYPE html>
          <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
              .container { max-width: 600px; margin: 0 auto; padding: 20px; }
              .header { background-color: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
              .content { background-color: #f9fafb; padding: 30px; border-radius: 0 0 5px 5px; }
              .info-box { background-color: white; padding: 15px; border-left: 4px solid #dc2626; margin: 20px 0; }
              .info-row { margin: 10px 0; }
              .label { font-weight: bold; color: #4b5563; }
              .value { color: #1f2937; }
              .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1 style="margin: 0;">Account Deletion Notice</h1>
              </div>
              <div class="content">
                <p>A user has deleted their account from the ERP Flow Studios system.</p>
                
                <div class="info-box">
                  <h3 style="margin-top: 0; color: #dc2626;">Deleted Account Details</h3>
                  <div class="info-row">
                    <span class="label">Name:</span>
                    <span class="value">${userName}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">Email:</span>
                    <span class="value">${userEmail}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">Role:</span>
                    <span class="value">${userRole}</span>
                  </div>
                  <div class="info-row">
                    <span class="label">Deletion Date:</span>
                    <span class="value">${new Date().toLocaleString()}</span>
                  </div>
                </div>

                <p style="color: #dc2626; font-weight: bold;">
                  ⚠️ This account and all associated data have been permanently removed from the system.
                </p>
              </div>
              <div class="footer">
                <p>This is an automated notification from ERP Flow Studios System</p>
              </div>
            </div>
          </body>
          </html>
        `
            })
        } catch (emailError) {
            // Continue even if email fails - account is already deleted
        }

        // Clear the session
        clearSessionCookie(res)

        return res.status(200).json({ message: 'Account deleted successfully' })
    } catch (error) {
        return res.status(500).json({ error: 'Failed to delete account' })
    }
}

