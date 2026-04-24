import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { requireAuth, getClinicIdFromUser } from '../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const authUser = await requireAuth(req, res)
    if (!authUser) return

    // Only admin, reception, doctor, staff can access user profiles
    const userRole = authUser.role?.toLowerCase()
    if (!['admin', 'doctor', 'staff', 'reception'].includes(userRole)) {
        return res.status(403).json({ error: 'Unauthorized' })
    }

    if (req.method === 'GET') {
        const { userId } = req.query

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' })
        }

        try {
            // Fetch user data
            const user = await prisma.user.findUnique({
                where: { id: Number(userId) }
            })

            if (!user) {
                return res.status(404).json({ error: 'User not found' })
            }

            // Get clinic ID for filtering
            const clinicId = getClinicIdFromUser(authUser)

            // Fetch patient data if exists (ONLY from same clinic)
            const patient = await prisma.patient.findFirst({
                where: {
                    clinicId,
                    OR: [
                        { email: user.email },
                        { phone: user.phone }
                    ]
                }
            })

            // Combine user and patient data
            const profile = {
                id: user.id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                profileImage: user.profileImage,
                role: user.role,
                // Patient data if available
                dob: patient?.dob,
                age: patient?.age,
                address: patient?.address,
                gender: patient?.gender,
                occupation: patient?.occupation,
                height: patient?.height,
                weight: patient?.weight,
                fatherHusbandGuardianName: patient?.fatherHusbandGuardianName,
                imageUrl: patient?.imageUrl
            }

            return res.status(200).json(profile)
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch user profile' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
