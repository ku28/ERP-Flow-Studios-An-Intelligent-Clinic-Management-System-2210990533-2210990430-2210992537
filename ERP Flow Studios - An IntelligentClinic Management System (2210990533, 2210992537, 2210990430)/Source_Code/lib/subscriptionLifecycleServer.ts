import prisma from './prisma'
import { getTrialEndDate, shouldForceUpgrade } from './subscriptionLifecycle'

type MutableClinic = {
    id: string
    status: string
    subscriptionStatus: string | null
    subscriptionPlan: string | null
    subscriptionStart: Date | null
    subscriptionEnd: Date | null
    trialEndsAt: Date | null
    createdAt: Date
    updatedAt: Date
}

export async function enforceClinicLifecycle(clinic: MutableClinic): Promise<MutableClinic> {
    const now = new Date()
    const patch: Record<string, any> = {}

    const trialEnd = getTrialEndDate(clinic, now)
    if (!clinic.trialEndsAt) {
        patch.trialEndsAt = trialEnd
    }

    const currentStatus = clinic.subscriptionStatus || 'active'
    if (currentStatus === 'trial' && trialEnd <= now) {
        patch.subscriptionStatus = 'expired'
        patch.subscriptionEnd = clinic.subscriptionEnd || trialEnd
        patch.status = 'inactive'
    } else if ((currentStatus === 'expired' || currentStatus === 'cancelled') && clinic.status !== 'inactive') {
        patch.status = 'inactive'
    } else if (shouldForceUpgrade(clinic, now) && clinic.status !== 'inactive') {
        patch.status = 'inactive'
    }

    if (!Object.keys(patch).length) {
        return clinic
    }

    const updated = await prisma.clinic.update({
        where: { id: clinic.id },
        data: patch,
        select: {
            id: true,
            status: true,
            subscriptionStatus: true,
            subscriptionPlan: true,
            subscriptionStart: true,
            subscriptionEnd: true,
            trialEndsAt: true,
            createdAt: true,
            updatedAt: true,
        },
    })

    return updated as MutableClinic
}
