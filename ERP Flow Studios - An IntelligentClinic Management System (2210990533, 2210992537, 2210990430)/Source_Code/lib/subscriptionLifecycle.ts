import { normalizeSubscriptionPlan } from './subscription'

const DAY_MS = 24 * 60 * 60 * 1000
const DATA_RETENTION_DAYS = 30

type ClinicLike = {
    status?: string | null
    subscriptionPlan?: string | null
    subscriptionCycle?: string | null
    subscriptionStatus?: string | null
    subscriptionStart?: Date | string | null
    subscriptionEnd?: Date | string | null
    trialEndsAt?: Date | string | null
    createdAt?: Date | string | null
    updatedAt?: Date | string | null
}

export function getPlanTrialDays(plan?: string | null): number {
    const normalized = normalizeSubscriptionPlan(plan)
    return normalized === 'pro' ? 7 : 14
}

function asDate(value?: Date | string | null): Date | null {
    if (!value) return null
    const d = value instanceof Date ? value : new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
}

export function getTrialEndDate(clinic: ClinicLike, now: Date = new Date()): Date {
    const explicit = asDate(clinic.trialEndsAt)
    if (explicit) return explicit

    const base = asDate(clinic.subscriptionStart) || asDate(clinic.createdAt) || now
    return new Date(base.getTime() + getPlanTrialDays(clinic.subscriptionPlan) * DAY_MS)
}

export function getTrialDaysLeft(clinic: ClinicLike, now: Date = new Date()): number {
    const trialEnd = getTrialEndDate(clinic, now)
    const msLeft = trialEnd.getTime() - now.getTime()
    return Math.max(0, Math.ceil(msLeft / DAY_MS))
}

export function shouldForceUpgrade(clinic: ClinicLike, now: Date = new Date()): boolean {
    const status = clinic.subscriptionStatus || 'active'
    const trialEnd = getTrialEndDate(clinic, now)
    const subEnd = asDate(clinic.subscriptionEnd)

    if (clinic.status && clinic.status !== 'active') return true

    if (status === 'trial') return trialEnd <= now
    if (status === 'expired' || status === 'cancelled') return true

    if (status === 'active' && subEnd) {
        const cycle = clinic.subscriptionCycle || 'annual'
        const hasNoExpiry = cycle === 'fiveYear' || cycle === 'lifetime'
        if (!hasNoExpiry && subEnd <= now) return true
    }

    return false
}

export function getDeletionEligibleDate(clinic: ClinicLike, now: Date = new Date()): Date {
    const trialEnd = getTrialEndDate(clinic, now)
    const fallbackBase = asDate(clinic.updatedAt) || asDate(clinic.createdAt) || now
    const base = asDate(clinic.subscriptionEnd) || trialEnd || fallbackBase
    return new Date(base.getTime() + DATA_RETENTION_DAYS * DAY_MS)
}

export function getTrialSummary(clinic: ClinicLike, now: Date = new Date()) {
    const trialEnd = getTrialEndDate(clinic, now)
    const trialDaysLeft = getTrialDaysLeft(clinic, now)
    const trialActive = (clinic.subscriptionStatus || 'active') === 'trial' && trialDaysLeft > 0

    return {
        trialEnd,
        trialDaysLeft,
        trialActive,
        trialDays: getPlanTrialDays(clinic.subscriptionPlan),
    }
}
