import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { verifySessionToken } from '../../../lib/auth'
import { sendEmail } from '../../../lib/email'
import { applyAssetsToTemplate, createDefaultTemplate } from '../../../lib/prescriptionTemplate'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'PUT') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const {
            clinicId,
            name,
            email,
            address,
            city,
            state,
            iconUrl,
            prescriptionHeaderUrl,
            prescriptionFooterUrl,
            prescriptionSignatureUrl,
            prescriptionWatermarkUrl,
            newAccessCodeSuffix
        } = req.body

        if (!clinicId) {
            return res.status(400).json({ error: 'Clinic ID is required' })
        }

        // Verify clinic exists
        const existingClinic = await prisma.clinic.findUnique({
            where: { clinicId }
        })

        if (!existingClinic) {
            return res.status(404).json({ error: 'Clinic not found' })
        }

        // Check if email is being changed and if it's already in use
        if (email !== existingClinic.email) {
            const emailExists = await prisma.clinic.findUnique({
                where: { email }
            })

            if (emailExists) {
                return res.status(400).json({ error: 'Email already in use by another clinic' })
            }
        }

        // Handle access code suffix change (pro only)
        let newClinicId = clinicId
        if (newAccessCodeSuffix !== undefined && newAccessCodeSuffix !== null) {
            // Verify user is pro via session
            const token = req.cookies.session
            if (!token) {
                return res.status(401).json({ error: 'Unauthorized' })
            }
            const { verifySessionToken } = await import('../../../lib/auth')
            const decoded = verifySessionToken(token)
            const sessionUser = await prisma.user.findUnique({
                where: { id: decoded.sub },
                include: { clinic: true }
            })

            if (!sessionUser?.clinic || sessionUser.clinic.subscriptionPlan !== 'pro') {
                return res.status(403).json({ error: 'Editing the access code is a Pro feature.' })
            }

            // Validate: exactly 3 alphanumeric digits
            if (!/^[A-Z0-9]{3}$/i.test(newAccessCodeSuffix)) {
                return res.status(400).json({ error: 'Access code suffix must be exactly 3 alphanumeric characters.' })
            }

            // Build new clinicId: keep first 3 chars, replace last 3
            const prefix = clinicId.slice(0, 3).toUpperCase()
            newClinicId = prefix + newAccessCodeSuffix.toUpperCase()

            if (newClinicId !== clinicId) {
                const conflict = await prisma.clinic.findUnique({ where: { clinicId: newClinicId } })
                if (conflict) {
                    return res.status(400).json({ error: 'That access code combination is already taken. Please choose different digits.' })
                }
            }
        }

        // Update clinic
        const updatedClinic = await prisma.clinic.update({
            where: { clinicId },
            data: {
                clinicId: newClinicId,
                name,
                email,
                address: address || null,
                city: city || null,
                state: state || null,
                iconUrl: iconUrl || null,
                prescriptionHeaderUrl: prescriptionHeaderUrl || null,
                prescriptionFooterUrl: prescriptionFooterUrl || null,
                prescriptionSignatureUrl: prescriptionSignatureUrl || null,
                prescriptionWatermarkUrl: prescriptionWatermarkUrl || null
            }
        })

        // Keep the new template system in sync with legacy upload-based branding.
        try {
            const page = 'prescriptionTemplate'
            const existingTemplate = await prisma.defaultValue.findUnique({
                where: { clinicId_page: { clinicId: updatedClinic.id, page } },
            })

            const mergedTemplate = applyAssetsToTemplate(
                (existingTemplate?.values as any) || createDefaultTemplate(),
                {
                    headerUrl: updatedClinic.prescriptionHeaderUrl || undefined,
                    footerUrl: updatedClinic.prescriptionFooterUrl || undefined,
                    signatureUrl: updatedClinic.prescriptionSignatureUrl || undefined,
                    watermarkUrl: updatedClinic.prescriptionWatermarkUrl || undefined,
                }
            )

            await prisma.defaultValue.upsert({
                where: { clinicId_page: { clinicId: updatedClinic.id, page } },
                create: {
                    clinicId: updatedClinic.id,
                    page,
                    label: 'Prescription Template',
                    values: mergedTemplate as any,
                },
                update: {
                    values: mergedTemplate as any,
                },
            })
        } catch {
            // Non-fatal: clinic update should still succeed if template sync fails.
        }

        // If access code was changed, notify all super admins by email
        if (newClinicId !== clinicId) {
            try {
                const superAdmins = await prisma.user.findMany({
                    where: { role: 'super_admin' },
                    select: { email: true, name: true }
                })
                const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
                for (const admin of superAdmins) {
                    if (!admin.email) continue
                    await sendEmail({
                        to: admin.email,
                        subject: `[ERP Flow] Clinic Access Code Changed — ${updatedClinic.name}`,
                        html: generateAccessCodeChangedEmail({
                            adminName: admin.name || 'Super Admin',
                            clinicName: updatedClinic.name,
                            clinicEmail: updatedClinic.email,
                            oldCode: clinicId,
                            newCode: newClinicId,
                            appUrl,
                        })
                    }).catch(() => { /* non-fatal */ })
                }
            } catch { /* non-fatal */ }
        }

        return res.status(200).json({ clinic: updatedClinic })
    } catch (error) {
        return res.status(500).json({ error: 'Failed to update clinic' })
    }
}

function generateAccessCodeChangedEmail(params: {
    adminName: string
    clinicName: string
    clinicEmail: string
    oldCode: string
    newCode: string
    appUrl: string
}) {
    const { adminName, clinicName, clinicEmail, oldCode, newCode, appUrl } = params
    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #6d28d9, #4f46e5); color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
        .info-box { background-color: #ede9fe; border-left: 4px solid #6d28d9; padding: 15px; margin: 20px 0; border-radius: 0 6px 6px 0; }
        .code-change { display: flex; align-items: center; justify-content: center; gap: 16px; margin: 20px 0; }
        .code { font-size: 28px; font-weight: bold; letter-spacing: 0.3em; padding: 10px 20px; border-radius: 8px; }
        .code-old { background: #fee2e2; color: #991b1b; text-decoration: line-through; }
        .code-new { background: #d1fae5; color: #065f46; }
        .arrow { font-size: 24px; color: #6b7280; }
        .warning { background-color: #fef3c7; border: 1px solid #fcd34d; padding: 12px; border-radius: 6px; margin-top: 20px; color: #92400e; font-size: 13px; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔑 Clinic Access Code Changed</h1>
        </div>
        <div class="content">
            <h2>Hello ${adminName},</h2>
            <p>This is an automated security notification. A <strong>Pro</strong> clinic has changed their access code.</p>

            <div class="info-box">
                <strong>Clinic Details:</strong><br>
                🏥 <strong>Name:</strong> ${clinicName}<br>
                📧 <strong>Email:</strong> ${clinicEmail}
            </div>

            <p style="text-align:center;"><strong>Access Code Change:</strong></p>
            <div class="code-change">
                <span class="code code-old">${oldCode}</span>
                <span class="arrow">→</span>
                <span class="code code-new">${newCode}</span>
            </div>

            <div class="warning">
                ⚠️ <strong>Note:</strong> Staff members using the old code will no longer be able to log in. The clinic admin is responsible for communicating the new access code to their team.
            </div>

            <p style="margin-top:24px;font-size:13px;color:#6b7280;">
                Changed on: ${new Date().toUTCString()}<br>
                If this change looks suspicious, you can review the clinic from the Super Admin panel at <a href="${appUrl}/admin-settings">${appUrl}/admin-settings</a>.
            </p>
        </div>
        <div class="footer">
            <p>ERP Flow Studios — Automated Security Alert</p>
        </div>
    </div>
</body>
</html>
    `
}
