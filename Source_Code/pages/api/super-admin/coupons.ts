import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { verifySessionToken } from '../../../lib/auth'
import {
    getCoupons,
    normalizeCouponCode,
    saveCoupons,
    type CouponContext,
    type CouponDiscountType,
    type CouponPolicy,
} from '../../../lib/coupons'

const ALLOWED_CONTEXTS: CouponContext[] = ['register_plan', 'upgrade_plan', 'ai_ocr_basic', 'ai_ocr_standard']

function sanitizeContexts(input: any): CouponContext[] {
    if (!Array.isArray(input)) return []
    return input
        .map((x) => String(x || '').trim())
        .filter((x): x is CouponContext => ALLOWED_CONTEXTS.includes(x as CouponContext))
}

async function requireSuperAdmin(req: NextApiRequest) {
    const token = req.cookies.session
    if (!token) return null
    const decoded = verifySessionToken(token)
    const user = await prisma.user.findUnique({ where: { id: decoded.sub } })
    if (!user || user.role !== 'super_admin') return null
    return user
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const superAdmin = await requireSuperAdmin(req)
    if (!superAdmin) {
        return res.status(403).json({ error: 'Access denied' })
    }

    if (req.method === 'GET') {
        const coupons = await getCoupons()
        return res.status(200).json({ coupons })
    }

    if (req.method === 'POST') {
        const {
            code,
            description,
            discountType,
            discountValue,
            minAmount,
            maxDiscount,
            appliesTo,
            active,
            expiresAt,
            usageLimit,
            oneTimePerClinic,
        } = req.body || {}

        const normalizedCode = normalizeCouponCode(code)
        if (!normalizedCode) return res.status(400).json({ error: 'Coupon code is required' })
        if (!['percent', 'flat'].includes(discountType)) return res.status(400).json({ error: 'discountType must be percent or flat' })

        const numericDiscountValue = Number(discountValue)
        if (!Number.isFinite(numericDiscountValue) || numericDiscountValue <= 0) {
            return res.status(400).json({ error: 'discountValue must be a positive number' })
        }

        const contexts = sanitizeContexts(appliesTo)
        if (!contexts.length) {
            return res.status(400).json({ error: 'At least one applicable context is required' })
        }

        const coupons = await getCoupons()
        if (coupons.some((c) => normalizeCouponCode(c.code) === normalizedCode)) {
            return res.status(400).json({ error: 'Coupon code already exists' })
        }

        const nowIso = new Date().toISOString()
        const nextCoupon: CouponPolicy = {
            code: normalizedCode,
            description: description || '',
            discountType: discountType as CouponDiscountType,
            discountValue: numericDiscountValue,
            minAmount: Number.isFinite(Number(minAmount)) ? Number(minAmount) : 0,
            maxDiscount: Number.isFinite(Number(maxDiscount)) ? Number(maxDiscount) : undefined,
            appliesTo: contexts,
            active: typeof active === 'boolean' ? active : true,
            expiresAt: expiresAt || null,
            usageLimit: Number.isFinite(Number(usageLimit)) ? Number(usageLimit) : null,
            usedCount: 0,
            oneTimePerClinic: Boolean(oneTimePerClinic),
            createdAt: nowIso,
            updatedAt: nowIso,
        }

        const updated = [nextCoupon, ...coupons]
        await saveCoupons(updated)
        return res.status(201).json({ coupon: nextCoupon })
    }

    if (req.method === 'PUT') {
        const {
            code,
            description,
            discountType,
            discountValue,
            minAmount,
            maxDiscount,
            appliesTo,
            active,
            expiresAt,
            usageLimit,
            oneTimePerClinic,
        } = req.body || {}

        const normalizedCode = normalizeCouponCode(code)
        if (!normalizedCode) return res.status(400).json({ error: 'Coupon code is required' })

        const coupons = await getCoupons()
        const index = coupons.findIndex((c) => normalizeCouponCode(c.code) === normalizedCode)
        if (index === -1) return res.status(404).json({ error: 'Coupon not found' })

        const existing = coupons[index]
        const contexts = appliesTo ? sanitizeContexts(appliesTo) : existing.appliesTo

        coupons[index] = {
            ...existing,
            description: description ?? existing.description,
            discountType: discountType ?? existing.discountType,
            discountValue: discountValue !== undefined ? Number(discountValue) : existing.discountValue,
            minAmount: minAmount !== undefined ? Number(minAmount) : existing.minAmount,
            maxDiscount: maxDiscount !== undefined ? Number(maxDiscount) : existing.maxDiscount,
            appliesTo: contexts,
            active: active !== undefined ? Boolean(active) : existing.active,
            expiresAt: expiresAt !== undefined ? expiresAt : existing.expiresAt,
            usageLimit: usageLimit !== undefined ? Number(usageLimit) : existing.usageLimit,
            oneTimePerClinic: oneTimePerClinic !== undefined ? Boolean(oneTimePerClinic) : existing.oneTimePerClinic,
            updatedAt: new Date().toISOString(),
        }

        await saveCoupons(coupons)
        return res.status(200).json({ coupon: coupons[index] })
    }

    if (req.method === 'DELETE') {
        const { code } = req.query
        const normalizedCode = normalizeCouponCode(String(code || ''))
        if (!normalizedCode) return res.status(400).json({ error: 'Coupon code is required' })

        const coupons = await getCoupons()
        const filtered = coupons.filter((c) => normalizeCouponCode(c.code) !== normalizedCode)
        await saveCoupons(filtered)
        return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
