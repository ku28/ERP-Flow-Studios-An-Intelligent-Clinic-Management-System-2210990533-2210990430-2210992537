import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { enforceClinicLifecycle } from '../../../lib/subscriptionLifecycleServer'
import { getDeletionEligibleDate, getTrialSummary, shouldForceUpgrade } from '../../../lib/subscriptionLifecycle'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { clinicId } = req.body

    if (!clinicId) {
        return res.status(400).json({ error: 'Clinic ID is required' })
    }

    try {
        // Check if clinic exists and is active
        const clinic = await prisma.clinic.findUnique({
            where: { clinicId },
            select: {
                id: true,
                clinicId: true,
                name: true,
                status: true,
                iconUrl: true,
                subscriptionStatus: true,
                subscriptionPlan: true,
                subscriptionStart: true,
                subscriptionEnd: true,
                trialEndsAt: true,
                createdAt: true,
                updatedAt: true,
                locations: {
                    select: { id: true, name: true, lat: true, lng: true, radius: true }
                }
            }
        })

        if (!clinic) {
            return res.status(404).json({ error: 'Invalid access code. Clinic not found.' })
        }

        const normalizedClinic = await enforceClinicLifecycle(clinic as any)
        const needsUpgrade = shouldForceUpgrade(normalizedClinic)
        if (needsUpgrade) {
            const trial = getTrialSummary(normalizedClinic)
            const deletionDate = getDeletionEligibleDate(normalizedClinic)
            return res.status(200).json({
                success: true,
                clinic: {
                    id: clinic.id,
                    clinicId: clinic.clinicId,
                    name: clinic.name,
                    iconUrl: clinic.iconUrl,
                    locations: clinic.locations
                },
                upgradeRequired: true,
                warning: trial.trialDaysLeft > 0
                    ? `This clinic is near expiry. Please log in with admin email to continue upgrade process.`
                    : 'This clinic trial is expired. Please log in with admin email only to continue upgrade process.',
                trialEndsAt: trial.trialEnd,
                trialDaysLeft: trial.trialDaysLeft,
                dataDeletionDate: deletionDate,
            })
        }

        if (normalizedClinic.status !== 'active' && !needsUpgrade) {
            return res.status(403).json({ error: 'This clinic is not active. Please contact support.' })
        }

        return res.status(200).json({
            success: true,
            clinic: {
                id: clinic.id,
                clinicId: clinic.clinicId,
                name: clinic.name,
                iconUrl: clinic.iconUrl,
                locations: clinic.locations
            }
        })
    } catch (error) {
        return res.status(500).json({ error: 'Failed to verify clinic' })
    }
}
