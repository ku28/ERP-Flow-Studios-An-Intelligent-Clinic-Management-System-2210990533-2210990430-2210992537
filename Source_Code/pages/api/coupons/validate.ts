import type { NextApiRequest, NextApiResponse } from 'next'
import { getCoupons, normalizeCouponCode, validateCouponForAmount, type CouponContext } from '../../../lib/coupons'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { code, amount, context } = req.body || {}
    const normalizedCode = normalizeCouponCode(code)
    const numericAmount = Number(amount || 0)

    if (!normalizedCode) return res.status(400).json({ error: 'Coupon code is required' })
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return res.status(400).json({ error: 'Valid amount is required' })
    if (!context) return res.status(400).json({ error: 'Coupon context is required' })

    const coupons = await getCoupons()
    const coupon = coupons.find((c) => normalizeCouponCode(c.code) === normalizedCode)

    if (!coupon) {
        return res.status(404).json({ error: 'Invalid coupon code' })
    }

    const result = validateCouponForAmount(coupon, context as CouponContext, numericAmount)
    if (!result.valid) {
        return res.status(400).json({ error: result.reason })
    }

    return res.status(200).json({
        valid: true,
        coupon: {
            code: normalizedCode,
            description: coupon.description || '',
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            maxDiscount: coupon.maxDiscount || null,
        },
        discountAmount: result.discountAmount,
        finalAmount: result.finalAmount,
    })
}
