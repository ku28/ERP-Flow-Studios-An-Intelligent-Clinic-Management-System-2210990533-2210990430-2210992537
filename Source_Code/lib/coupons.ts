import fs from 'fs/promises'
import path from 'path'

export type CouponContext =
    | 'register_plan'
    | 'upgrade_plan'
    | 'ai_ocr_basic'
    | 'ai_ocr_standard'

export type CouponDiscountType = 'percent' | 'flat'

export interface CouponPolicy {
    code: string
    description?: string
    discountType: CouponDiscountType
    discountValue: number
    minAmount?: number
    maxDiscount?: number
    appliesTo: CouponContext[]
    active: boolean
    expiresAt?: string | null
    usageLimit?: number | null
    usedCount?: number
    oneTimePerClinic?: boolean
    createdAt?: string
    updatedAt?: string
}

const COUPONS_FILE = path.join(process.cwd(), 'data', 'coupons.json')

async function ensureCouponsFile() {
    try {
        await fs.access(COUPONS_FILE)
    } catch {
        await fs.mkdir(path.dirname(COUPONS_FILE), { recursive: true })
        await fs.writeFile(COUPONS_FILE, '[]', 'utf-8')
    }
}

export async function getCoupons(): Promise<CouponPolicy[]> {
    await ensureCouponsFile()
    const raw = await fs.readFile(COUPONS_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed as CouponPolicy[]
}

export async function saveCoupons(coupons: CouponPolicy[]) {
    await ensureCouponsFile()
    await fs.writeFile(COUPONS_FILE, JSON.stringify(coupons, null, 2), 'utf-8')
}

export function normalizeCouponCode(code: string): string {
    return String(code || '').trim().toUpperCase()
}

export function validateCouponForAmount(
    coupon: CouponPolicy,
    context: CouponContext,
    amount: number,
    now: Date = new Date()
) {
    if (!coupon.active) return { valid: false, reason: 'Coupon is inactive' as const }
    if (!coupon.appliesTo?.includes(context)) return { valid: false, reason: 'Coupon is not applicable for this payment type' as const }

    if (coupon.expiresAt) {
        const exp = new Date(coupon.expiresAt)
        if (!Number.isNaN(exp.getTime()) && exp < now) {
            return { valid: false, reason: 'Coupon has expired' as const }
        }
    }

    if (typeof coupon.usageLimit === 'number' && coupon.usageLimit >= 0) {
        const used = coupon.usedCount || 0
        if (used >= coupon.usageLimit) {
            return { valid: false, reason: 'Coupon usage limit reached' as const }
        }
    }

    const minAmount = coupon.minAmount || 0
    if (amount < minAmount) {
        return {
            valid: false,
            reason: `Minimum order amount for this coupon is Rs ${minAmount}` as const,
        }
    }

    const rawDiscount = coupon.discountType === 'percent'
        ? Math.round((amount * coupon.discountValue) / 100)
        : Math.round(coupon.discountValue)

    const cappedDiscount = typeof coupon.maxDiscount === 'number' && coupon.maxDiscount > 0
        ? Math.min(rawDiscount, Math.round(coupon.maxDiscount))
        : rawDiscount

    const discountAmount = Math.max(0, Math.min(amount, cappedDiscount))
    const finalAmount = Math.max(0, amount - discountAmount)

    return {
        valid: true,
        discountAmount,
        finalAmount,
    }
}

export async function incrementCouponUsage(code: string) {
    const normalized = normalizeCouponCode(code)
    const coupons = await getCoupons()
    const updated = coupons.map((c) => {
        if (normalizeCouponCode(c.code) !== normalized) return c
        return {
            ...c,
            usedCount: (c.usedCount || 0) + 1,
            updatedAt: new Date().toISOString(),
        }
    })
    await saveCoupons(updated)
}
