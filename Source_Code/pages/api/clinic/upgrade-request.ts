import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { getSessionUser } from '../../../lib/auth'
import { sendEmail } from '../../../lib/email'
import { getCoupons, normalizeCouponCode, validateCouponForAmount } from '../../../lib/coupons'
import { createUpgradeRequest } from '../../../lib/upgradeRequests'

const ALLOWED_PLANS = new Set(['standard', 'pro'])
const ALLOWED_CYCLES = new Set(['annual', 'fiveYear'])
const ALLOWED_PAYMENT_METHODS = new Set(['pay_online', 'pay_to_owner'])

const PLAN_PRICE: Record<string, Record<string, number>> = {
    standard: { annual: 7999, fiveYear: 29999 },
    pro: { annual: 19999, fiveYear: 74999 },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const authUser = await getSessionUser(req)
    if (!authUser || authUser.role !== 'admin' || !authUser.clinicId) {
        return res.status(401).json({ error: 'Unauthorized' })
    }

    const { selectedPlan, billingCycle, paymentMethod, razorpayPaymentId, couponCode } = req.body || {}

    if (!ALLOWED_PLANS.has(selectedPlan)) {
        return res.status(400).json({ error: 'Invalid plan selection' })
    }
    if (!ALLOWED_CYCLES.has(billingCycle)) {
        return res.status(400).json({ error: 'Invalid billing cycle' })
    }
    if (!ALLOWED_PAYMENT_METHODS.has(paymentMethod)) {
        return res.status(400).json({ error: 'Invalid payment method' })
    }

    const baseAmount = PLAN_PRICE[selectedPlan]?.[billingCycle]
    if (!baseAmount) {
        return res.status(400).json({ error: 'Invalid amount configuration for selected plan/cycle' })
    }

    let normalizedCouponCode: string | null = null
    let discountAmount = 0
    let finalAmount = baseAmount
    if (couponCode) {
        normalizedCouponCode = normalizeCouponCode(couponCode)
        const coupons = await getCoupons()
        const coupon = coupons.find((c) => normalizeCouponCode(c.code) === normalizedCouponCode)
        if (!coupon) return res.status(400).json({ error: 'Invalid coupon code' })
        const validated = validateCouponForAmount(coupon, 'upgrade_plan', baseAmount)
        if (!validated.valid) return res.status(400).json({ error: validated.reason })
        discountAmount = Number(validated.discountAmount || 0)
        finalAmount = Number(validated.finalAmount || 0)
    }

    const clinic = await prisma.clinic.findUnique({
        where: { id: authUser.clinicId },
        select: { id: true, clinicId: true, name: true, email: true },
    })
    if (!clinic) {
        return res.status(404).json({ error: 'Clinic not found' })
    }

    const superAdmins = await prisma.user.findMany({
        where: { role: 'super_admin' },
        select: { email: true },
    })

    const to = superAdmins.map((u: any) => u.email).filter(Boolean)
    if (!to.length) {
        return res.status(500).json({ error: 'No super admin is configured to verify upgrades' })
    }

    const paymentLabel = paymentMethod === 'pay_online' ? 'Pay Online (Razorpay)' : 'Pay Directly to Owner'
    const reviewBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const createdRequest = await createUpgradeRequest({
        clinicId: clinic.id,
        clinicCode: clinic.clinicId,
        clinicName: clinic.name,
        adminEmail: authUser.email || clinic.email,
        adminName: authUser.name || null,
        requestedPlan: selectedPlan,
        requestedCycle: billingCycle,
        paymentMethod,
        amount: finalAmount,
        couponCode: normalizedCouponCode,
        razorpayPaymentId: razorpayPaymentId || null,
    })
    const reviewUrl = `${reviewBaseUrl}/review-upgrade-request?token=${encodeURIComponent(createdRequest.token)}`

    await Promise.all(
        to.map((email: string) =>
            sendEmail({
                to: email,
                subject: `Upgrade Request: ${clinic.name} (${selectedPlan.toUpperCase()})`,
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
                        <h2 style="margin-bottom: 8px;">Clinic Upgrade Verification Required</h2>
                        <p style="color: #4b5563;">A clinic has requested a paid subscription upgrade.</p>
                        <div style="background:#f3f4f6; border-radius:12px; padding:16px; margin-top:16px;">
                            <p><strong>Clinic:</strong> ${clinic.name}</p>
                            <p><strong>Clinic Code:</strong> ${clinic.clinicId}</p>
                            <p><strong>Admin:</strong> ${authUser.name || authUser.email || 'Clinic Admin'} (${authUser.email || 'n/a'})</p>
                            <p><strong>Plan Requested:</strong> ${selectedPlan}</p>
                            <p><strong>Billing Cycle:</strong> ${billingCycle}</p>
                            <p><strong>Payment Method:</strong> ${paymentLabel}</p>
                            <p><strong>Base Amount:</strong> Rs ${baseAmount}</p>
                            <p><strong>Coupon:</strong> ${normalizedCouponCode || 'None'}</p>
                            <p><strong>Discount:</strong> Rs ${discountAmount}</p>
                            <p><strong>Final Amount:</strong> Rs ${finalAmount}</p>
                            <p><strong>Razorpay Payment ID:</strong> ${razorpayPaymentId || 'Not provided'}</p>
                            <p><strong>Requested At:</strong> ${new Date().toLocaleString()}</p>
                        </div>
                        <p style="margin-top: 16px; color:#374151;">Use the review page below to approve or decline this request.</p>
                        <div style="margin-top:12px;">
                            <a href="${reviewUrl}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Review Upgrade Request</a>
                        </div>
                        <p style="font-size:12px;color:#6b7280;margin-top:10px;word-break:break-all;">${reviewUrl}</p>
                    </div>
                `,
            })
        )
    )

    return res.status(200).json({
        success: true,
        message: 'Upgrade request submitted. Super admin will verify payment and activate your subscription.',
        amount: finalAmount,
        requestToken: createdRequest.token,
    })
}
