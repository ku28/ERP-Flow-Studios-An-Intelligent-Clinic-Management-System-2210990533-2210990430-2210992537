import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { verifySessionToken } from '../../../lib/auth'
import { getPlanDisplayName, getPlanPolicy, getPlanUserLimits, normalizeSubscriptionPlan } from '../../../lib/subscription'
import { isBillingCycleLocked } from '../../../lib/subscriptionBilling'
import { getPlanTrialDays, getTrialEndDate, getTrialSummary } from '../../../lib/subscriptionLifecycle'
import { enforceClinicLifecycle } from '../../../lib/subscriptionLifecycleServer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        // Verify super admin
        const token = req.cookies.session
        if (!token) return res.status(401).json({ error: 'Unauthorized' })

        const decoded = verifySessionToken(token)
        const user = await prisma.user.findUnique({ where: { id: decoded.sub } })
        if (!user || user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' })
        }

        if (req.method === 'GET') {
            const clinics = await prisma.clinic.findMany({
                select: {
                    id: true,
                    clinicId: true,
                    name: true,
                    email: true,
                    status: true,
                    subscriptionPlan: true,
                    subscriptionCycle: true,
                    subscriptionStatus: true,
                    subscriptionStart: true,
                    subscriptionEnd: true,
                    trialEndsAt: true,
                    razorpaySubscriptionId: true,
                    createdAt: true,
                },
                orderBy: { createdAt: 'desc' },
            })

            const normalizedClinics = await Promise.all(clinics.map((clinic: any) => enforceClinicLifecycle(clinic)))

            const enrichedClinics = normalizedClinics.map((clinic: any) => {
                const normalizedPlan = normalizeSubscriptionPlan(clinic.subscriptionPlan)
                const policy = getPlanPolicy(normalizedPlan)
                const limits = getPlanUserLimits(normalizedPlan)
                const now = new Date()
                const trialSummary = getTrialSummary(clinic, now)
                return {
                    ...clinic,
                    subscriptionPlan: normalizedPlan,
                    planDisplayName: getPlanDisplayName(normalizedPlan),
                    trialActive: trialSummary.trialActive,
                    trialEndsAt: clinic.trialEndsAt || trialSummary.trialEnd,
                    trialDaysLeft: trialSummary.trialDaysLeft,
                    trialDaysTotal: trialSummary.trialDays,
                    planLimits: {
                        totalUsers: limits.total || null,
                        roleLimits: limits.roleLimits,
                    },
                    tokenPolicy: {
                        ttlSeconds: policy.tokenTtlSeconds,
                        label: policy.tokenTtlSeconds === 6 * 60 * 60 ? '6 hours' : 'Default duration',
                    },
                }
            })

            return res.status(200).json({ clinics: enrichedClinics })
        }

        if (req.method === 'PUT') {
            const { clinicId, subscriptionPlan, subscriptionCycle, subscriptionStatus, trialActive, trialEndsAt } = req.body

            if (!clinicId) return res.status(400).json({ error: 'clinicId is required' })
            if (subscriptionCycle && isBillingCycleLocked(subscriptionCycle)) {
                return res.status(400).json({ error: 'Minimum subscription duration is 1 year. Monthly and 3-month cycles are not allowed.' })
            }

            const existingClinic = await prisma.clinic.findUnique({
                where: { id: clinicId },
                select: {
                    id: true,
                    createdAt: true,
                    subscriptionPlan: true,
                    subscriptionCycle: true,
                    subscriptionStatus: true,
                    subscriptionStart: true,
                    subscriptionEnd: true,
                    trialEndsAt: true,
                    status: true,
                },
            })

            if (!existingClinic) {
                return res.status(404).json({ error: 'Clinic not found' })
            }

            const data: any = {}
            if (subscriptionPlan) data.subscriptionPlan = subscriptionPlan
            if (subscriptionCycle) data.subscriptionCycle = subscriptionCycle
            if (subscriptionStatus) data.subscriptionStatus = subscriptionStatus

            // If activating manually, set start date
            if (subscriptionStatus === 'active' && !data.subscriptionStart) {
                data.subscriptionStart = new Date()
                data.status = 'active'
                // Calculate end date based on cycle
                const endDate = new Date()
                switch (subscriptionCycle || 'annual') {
                    case 'monthly':
                    case 'quarterly':
                    case 'annual': endDate.setFullYear(endDate.getFullYear() + 1); break
                    case 'fiveYear': endDate.setFullYear(endDate.getFullYear() + 5); break
                    case 'lifetime': data.subscriptionEnd = null; break
                    default: endDate.setFullYear(endDate.getFullYear() + 1)
                }
                if (subscriptionCycle !== 'lifetime') {
                    data.subscriptionEnd = endDate
                }
                data.trialEndsAt = null
            }

            if (typeof trialActive === 'boolean') {
                if (trialActive) {
                    const effectivePlan = subscriptionPlan || existingClinic.subscriptionPlan
                    const effectiveTrialDays = getPlanTrialDays(effectivePlan)
                    const trialBase = existingClinic.subscriptionStart || existingClinic.createdAt || new Date()

                    data.subscriptionStatus = 'trial'
                    data.subscriptionStart = existingClinic.subscriptionStart || trialBase
                    data.subscriptionEnd = null
                    data.status = 'active'
                    data.trialEndsAt = new Date(new Date(trialBase).getTime() + effectiveTrialDays * 24 * 60 * 60 * 1000)
                } else {
                    const now = new Date()
                    data.subscriptionStatus = 'expired'
                    data.subscriptionEnd = existingClinic.trialEndsAt || getTrialEndDate(existingClinic, now)
                    data.status = 'inactive'
                }
            }

            if (typeof trialEndsAt === 'string' && trialEndsAt.trim()) {
                const parsedTrialEnd = new Date(trialEndsAt)
                if (Number.isNaN(parsedTrialEnd.getTime())) {
                    return res.status(400).json({ error: 'Invalid trialEndsAt value' })
                }
                data.trialEndsAt = parsedTrialEnd
                data.subscriptionStatus = 'trial'
                data.subscriptionEnd = null
                data.status = 'active'
                if (!data.subscriptionStart) data.subscriptionStart = existingClinic.subscriptionStart || new Date()
            }

            if (subscriptionStatus === 'expired' || subscriptionStatus === 'cancelled') {
                data.status = 'inactive'
                if (!data.subscriptionEnd) data.subscriptionEnd = existingClinic.subscriptionEnd || new Date()
            }

            const updated = await prisma.clinic.update({
                where: { id: clinicId },
                data,
                select: {
                    id: true,
                    clinicId: true,
                    name: true,
                    subscriptionPlan: true,
                    subscriptionCycle: true,
                    subscriptionStatus: true,
                    subscriptionStart: true,
                    subscriptionEnd: true,
                },
            })

            return res.status(200).json({ clinic: updated })
        }

        return res.status(405).json({ error: 'Method not allowed' })

    } catch (error: any) {
        console.error('Subscriptions API error:', error)
        return res.status(500).json({ error: 'Internal server error' })
    }
}
