/**
 * GET /api/verify-ai-ocr?token=TOKEN&clinicId=CLINIC_DB_ID&action=approve|deny
 * Super admin clicks this link from email to approve/deny AI OCR add-on purchase.
 * On approve: upgrades clinic.subscriptionPlan to AI OCR variant based on current plan.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { sendEmail } from '../../lib/email'

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

function htmlPage(emoji: string, title: string, message: string, color: string) {
    return `<!DOCTYPE html>
<html>
<head>
    <title>${title}</title>
    <style>
        body { font-family: Arial, sans-serif; text-align: center; padding: 60px 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
        .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 20px 60px rgba(0,0,0,0.2); max-width: 480px; width: 100%; }
        .emoji { font-size: 52px; margin-bottom: 16px; }
        .title { color: ${color}; font-size: 26px; font-weight: bold; margin-bottom: 12px; }
        .message { color: #6b7280; font-size: 15px; line-height: 1.6; }
        .link { display: inline-block; margin-top: 24px; padding: 10px 24px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-size: 14px; }
    </style>
</head>
<body>
    <div class="card">
        <div class="emoji">${emoji}</div>
        <div class="title">${title}</div>
        <div class="message">${message}</div>
        <a href="${appUrl}/super-admin" class="link">Go to Super Admin</a>
    </div>
</body>
</html>`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    const { token, clinicId, action } = req.query

    if (!token || !clinicId || !action) {
        return res.status(400).send(htmlPage('❌', 'Invalid Link', 'This verification link is missing required parameters.', '#dc2626'))
    }

    if (action !== 'approve' && action !== 'deny') {
        return res.status(400).send(htmlPage('❌', 'Invalid Action', 'The action must be approve or deny.', '#dc2626'))
    }

    try {
        const clinic = await prisma.clinic.findUnique({
            where: { id: String(clinicId) },
            include: { users: { where: { role: 'admin' }, take: 1 } }
        })

        if (!clinic) {
            return res.status(404).send(htmlPage('❌', 'Clinic Not Found', 'No clinic found with this ID.', '#dc2626'))
        }

        if (clinic.subscriptionPlan === 'basic_ai_ocr' || clinic.subscriptionPlan === 'standard_ai_ocr' || clinic.subscriptionPlan === 'pro') {
            return res.status(200).send(htmlPage('✅', 'Already Activated', `${clinic.name} already has AI OCR access (plan: ${clinic.subscriptionPlan}).`, '#10b981'))
        }

        if (action === 'deny') {
            // Notify admin user
            const adminUser = clinic.users[0]
            if (adminUser?.email) {
                await sendEmail({
                    to: adminUser.email,
                    subject: 'AI OCR Add-on Request — Not Approved',
                    html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
                        <h2 style="color:#ef4444">AI OCR Request Not Approved</h2>
                        <p>Dear ${adminUser.name || 'Admin'},</p>
                        <p>Your request for the <strong>AI Image OCR</strong> add-on for <strong>${clinic.name}</strong> has not been approved at this time.</p>
                        <p>Please contact support if you have questions.</p>
                        <p>Best regards,<br>ERP Flow Studios Team</p>
                    </div>`
                }).catch(() => {})
            }
            return res.status(200).send(htmlPage('🚫', 'Request Denied', `AI OCR purchase request for ${clinic.name} has been denied. The admin has been notified.`, '#ef4444'))
        }

        // action === 'approve'
        const currentPlan = clinic.subscriptionPlan || 'standard'
        const nextPlan = currentPlan === 'basic' ? 'basic_ai_ocr' : 'standard_ai_ocr'
        const nextPlanLabel = nextPlan === 'basic_ai_ocr' ? 'Basic + AI OCR' : 'Standard + AI OCR'

        await prisma.clinic.update({
            where: { id: String(clinicId) },
            data: {
                subscriptionPlan: nextPlan,
                subscriptionStatus: 'active',
            }
        })

        // Notify admin user
        const adminUser = clinic.users[0]
        if (adminUser?.email) {
            await sendEmail({
                to: adminUser.email,
                subject: `🎉 AI Image OCR Activated — ${nextPlanLabel} Plan`,
                html: `<div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;padding:20px">
                    <h2 style="color:#10b981">AI Image OCR Activated!</h2>
                    <p>Dear ${adminUser.name || 'Admin'},</p>
                    <p>Great news! Your <strong>AI Image OCR</strong> add-on for <strong>${clinic.name}</strong> has been activated.</p>
                    <p>Your plan has been upgraded to <strong>${nextPlanLabel}</strong>. You can now use Vision OCR for Aadhaar scanning and bill processing.</p>
                    <p><a href="${appUrl}/dashboard" style="display:inline-block;padding:10px 20px;background:#6366f1;color:white;text-decoration:none;border-radius:6px">Go to Dashboard</a></p>
                    <p>Best regards,<br>ERP Flow Studios Team</p>
                </div>`
            }).catch(() => {})
        }

        return res.status(200).send(htmlPage('🎉', 'AI OCR Activated!', `${clinic.name} has been upgraded to ${nextPlanLabel}. The clinic admin has been notified by email.`, '#10b981'))

    } catch (error: any) {
        console.error('[verify-ai-ocr]', error)
        return res.status(500).send(htmlPage('❌', 'Activation Failed', `An error occurred: ${error.message || 'Unknown error'}. Please try again or manually update the clinic in the super admin panel.`, '#dc2626'))
    }
}
