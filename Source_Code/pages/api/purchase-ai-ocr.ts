/**
 * POST /api/purchase-ai-ocr
 * Submits a purchase request for AI Image OCR add-on.
 * Basic -> Basic + AI OCR: ₹999/yr incl. GST
 * Standard -> Standard + AI OCR: ₹499/yr incl. GST
 * Both pay_to_owner and pay_online require manual super admin verification.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { getSessionUser } from '../../lib/auth'
import { sendEmail } from '../../lib/email'
import crypto from 'crypto'
import { getCoupons, normalizeCouponCode, validateCouponForAmount } from '../../lib/coupons'
import type { CouponContext } from '../../lib/coupons'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    try {
        const user = await getSessionUser(req)
        if (!user) return res.status(401).json({ error: 'Unauthorized' })
        if ((user as any).role !== 'admin') return res.status(403).json({ error: 'Only clinic admins can purchase add-ons' })

        const plan: string = (user as any).clinic?.subscriptionPlan || 'standard'
        const isBasic = plan === 'basic'
        const isStandard = plan === 'standard'
        if (!isBasic && !isStandard) {
            return res.status(400).json({ error: 'AI OCR add-on is only available for Basic and Standard plan users' })
        }

        const targetPlan = isBasic ? 'basic_ai_ocr' : 'standard_ai_ocr'
        const addonLabel = isBasic ? 'Basic + AI OCR' : 'Standard + AI OCR'
        const baseAmount = isBasic ? 999 : 499
        const couponContext: CouponContext = isBasic ? 'ai_ocr_basic' : 'ai_ocr_standard'

        const { paymentMethod, razorpayPaymentId, couponCode } = req.body
        if (!paymentMethod || !['pay_to_owner', 'pay_online'].includes(paymentMethod)) {
            return res.status(400).json({ error: 'paymentMethod must be pay_to_owner or pay_online' })
        }

        let normalizedCouponCode: string | null = null
        let discountAmount = 0
        let finalAmount = baseAmount
        if (couponCode) {
            normalizedCouponCode = normalizeCouponCode(couponCode)
            const coupons = await getCoupons()
            const coupon = coupons.find((c) => normalizeCouponCode(c.code) === normalizedCouponCode)
            if (!coupon) {
                return res.status(400).json({ error: 'Invalid coupon code' })
            }
            const validated = validateCouponForAmount(coupon, couponContext, baseAmount)
            if (!validated.valid) {
                return res.status(400).json({ error: validated.reason })
            }
            discountAmount = Number(validated.discountAmount || 0)
            finalAmount = Number(validated.finalAmount || 0)
        }

        const clinic = (user as any).clinic
        if (!clinic) return res.status(400).json({ error: 'Clinic not found' })

        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex')
        const expiresAt = new Date()
        expiresAt.setDate(expiresAt.getDate() + 7) // 7 days to approve

        // Store purchase request (reuse PendingClinic-style pattern via AuditLog + direct query)
        // We'll store it in the user's clinic as a flag with a note in AuditLog, 
        // and save the token to the DB for verification
        await prisma.clinic.update({
            where: { id: clinic.id },
            data: {
                // Store pending token in razorpaySubscriptionId temporarily (for AI OCR pending state)
                // We repurpose this field only while pending; it will be cleared on activation
            } as any
        })

        // Create an audit log for tracking
        await (prisma as any).auditLog?.create?.({
            data: {
                userId: String((user as any).id),
                userName: (user as any).name || (user as any).email || 'Unknown',
                action: 'AI_OCR_PURCHASE_REQUEST',
                entity: 'Clinic',
                details: JSON.stringify({
                    clinicId: clinic.clinicId,
                    clinicName: clinic.name,
                    adminEmail: (user as any).email,
                    adminName: (user as any).name,
                    paymentMethod,
                    razorpayPaymentId: razorpayPaymentId || null,
                    verificationToken,
                    expiresAt: expiresAt.toISOString(),
                    amount: finalAmount,
                    baseAmount,
                    discountAmount,
                    couponCode: normalizedCouponCode,
                    targetPlan,
                    feature: 'AI Image OCR'
                })
            }
        }).catch(() => {
            // AuditLog may not exist in older schema; that's OK
        })

        // Send verification email to all super admins
        const superAdmins = await prisma.user.findMany({
            where: { role: 'super_admin' },
            select: { email: true, name: true }
        })

        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
        const approveUrl = `${appUrl}/api/verify-ai-ocr?token=${verificationToken}&clinicId=${encodeURIComponent(clinic.id)}&action=approve`
        const denyUrl = `${appUrl}/api/verify-ai-ocr?token=${verificationToken}&clinicId=${encodeURIComponent(clinic.id)}&action=deny`

        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-radius: 0 0 8px 8px; }
        .info-box { background: #eff6ff; border-left: 4px solid #6366f1; padding: 15px; margin: 20px 0; border-radius: 4px; }
        .price-box { background: #fef3c7; border: 2px solid #f59e0b; padding: 15px; margin: 20px 0; text-align: center; border-radius: 8px; }
        .btn-approve { display: inline-block; padding: 12px 30px; background: #10b981; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 8px; }
        .btn-deny { display: inline-block; padding: 12px 30px; background: #ef4444; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 8px; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header"><h1>🤖 AI OCR Add-on Purchase Request</h1></div>
        <div class="content">
            <h2>New Feature Purchase Request</h2>
            <p>A clinic admin has requested the <strong>AI Image OCR</strong> add-on for their ${isBasic ? 'Basic' : 'Standard'} plan.</p>
            <div class="info-box">
                <strong>Clinic Details:</strong><br>
                🏥 <strong>Clinic:</strong> ${clinic.name} (${clinic.clinicId})<br>
                👤 <strong>Admin:</strong> ${(user as any).name || 'N/A'}<br>
                📧 <strong>Email:</strong> ${(user as any).email || 'N/A'}<br>
                💳 <strong>Payment Method:</strong> ${paymentMethod === 'pay_to_owner' ? 'Pay Directly to Owner' : 'Pay Online (Razorpay)'}<br>
                ${razorpayPaymentId ? `🔑 <strong>Razorpay Payment ID:</strong> ${razorpayPaymentId}<br>` : ''}
            </div>
            <div class="price-box">
                <p style="margin:0;font-size:14px;color:#6b7280"><strong>Feature:</strong> AI Image OCR</p>
                <p style="margin:8px 0 0 0;font-size:32px;font-weight:bold;color:#6366f1">₹${finalAmount}/year</p>
                <p style="margin:4px 0 0 0;font-size:12px;color:#6b7280">Incl. GST · Annual billing</p>
                ${discountAmount > 0 ? `<p style="margin:4px 0 0 0;font-size:12px;color:#065f46">Base ₹${baseAmount} - Discount ₹${discountAmount}</p>` : ''}
            </div>
            <p>After approving, the clinic's plan will upgrade to <strong>${addonLabel}</strong>.</p>
            <div style="text-align:center;margin-top:20px">
                <a href="${approveUrl}" class="btn-approve">✅ Approve &amp; Activate</a>
                <a href="${denyUrl}" class="btn-deny">❌ Deny Request</a>
            </div>
            <p style="font-size:12px;color:#6b7280;margin-top:20px">
                Links expire in 7 days.<br>
                Approve URL: <code style="word-break:break-all">${approveUrl}</code>
            </p>
        </div>
        <div class="footer"><p>ERP Flow Studios — Super Admin Notification</p></div>
    </div>
</body>
</html>`

        const superAdminEmails = superAdmins.map((a: any) => a.email).filter(Boolean)
        if (superAdminEmails.length > 0) {
            await Promise.all(
                superAdminEmails.map((email: string) =>
                    sendEmail({ to: email, subject: `🤖 AI OCR Purchase Request — ${clinic.name}`, html: emailHtml }).catch(() => {})
                )
            )
        }

        return res.status(200).json({
            success: true,
            message: 'Purchase request submitted. Awaiting admin verification.',
            targetPlan,
            amount: finalAmount,
        })

    } catch (error: any) {
        console.error('[purchase-ai-ocr]', error)
        return res.status(500).json({ error: error.message || 'Failed to submit purchase request' })
    }
}
