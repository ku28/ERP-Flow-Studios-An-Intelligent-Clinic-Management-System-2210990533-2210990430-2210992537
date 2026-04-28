import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { clinicId } = req.query

    if (!clinicId || typeof clinicId !== 'string') {
        return res.status(400).json({ error: 'Clinic ID is required' })
    }

    try {
        // Check pending clinic
        const pendingClinic = await prisma.pendingClinic.findUnique({
            where: { clinicId }
        })

        if (pendingClinic) {
            // Check if expired
            if (new Date() > pendingClinic.expiresAt && pendingClinic.status === 'pending') {
                await prisma.pendingClinic.update({
                    where: { id: pendingClinic.id },
                    data: { status: 'expired' }
                })
                return res.status(200).json({
                    status: 'expired',
                    message: 'Registration request has expired'
                })
            }

            return res.status(200).json({
                status: pendingClinic.status,
                clinicName: pendingClinic.clinicName,
                adminName: pendingClinic.adminName,
                adminEmail: pendingClinic.adminEmail,
                message: pendingClinic.status === 'pending' 
                    ? 'Waiting for admin approval' 
                    : pendingClinic.status === 'approved'
                    ? 'Clinic has been approved and activated'
                    : 'Registration request has expired'
            })
        }

        // Check if clinic already exists (activated)
        const clinic = await prisma.clinic.findUnique({
            where: { clinicId }
        })

        if (clinic) {
            return res.status(200).json({
                status: 'activated',
                clinicName: clinic.name,
                message: 'Clinic is active and ready to use'
            })
        }

        return res.status(404).json({
            status: 'not_found',
            message: 'No registration found with this clinic ID'
        })

    } catch (error: any) {
        return res.status(500).json({ 
            error: 'Failed to check status',
            details: error.message 
        })
    }
}
