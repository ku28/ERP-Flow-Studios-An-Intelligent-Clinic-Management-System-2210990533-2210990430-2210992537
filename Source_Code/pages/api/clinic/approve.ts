import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { verifySessionToken } from '../../../lib/auth'
import { sendEmail } from '../../../lib/email'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        // Verify user is super admin
        const token = req.cookies.session
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' })
        }

        const decoded = verifySessionToken(token)
        const user = await prisma.user.findUnique({
            where: { id: decoded.sub }
        })

        if (!user || user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' })
        }

        const { clinicId } = req.body

        if (!clinicId) {
            return res.status(400).json({ error: 'Clinic ID is required' })
        }

        // Find the clinic
        const clinic = await prisma.clinic.findUnique({
            where: { id: clinicId },
            include: {
                users: {
                    where: { role: 'admin' },
                    take: 1
                }
            }
        })

        if (!clinic) {
            return res.status(404).json({ error: 'Clinic not found' })
        }

        if (clinic.status !== 'pending') {
            return res.status(400).json({ error: 'Clinic is not in pending status' })
        }

        // Approve the clinic
        const updatedClinic = await prisma.clinic.update({
            where: { id: clinicId },
            data: { status: 'active' }
        })

        // Send approval email to clinic admin
        if (clinic.users.length > 0) {
            const adminUser = clinic.users[0]
            try {
                await sendEmail({
                    to: adminUser.email,
                    subject: 'Your Clinic Registration has been Approved!',
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #10b981;">Clinic Registration Approved!</h2>
                            <p>Dear ${adminUser.name},</p>
                            <p>Congratulations! Your clinic <strong>${clinic.name}</strong> (ID: ${clinic.clinicId}) has been approved.</p>
                            <p>You can now access all features of the ERP system.</p>
                            <p><a href="${process.env.NEXT_PUBLIC_APP_URL}/clinic-login" style="display: inline-block; padding: 10px 20px; background-color: #10b981; color: white; text-decoration: none; border-radius: 5px;">Login to Your Clinic</a></p>
                            <p>Best regards,<br>ERP Flow Studios Team</p>
                        </div>
                    `
                })
            } catch (emailError) {
            }
        }

        return res.status(200).json({ 
            success: true,
            clinic: updatedClinic,
            message: 'Clinic approved successfully'
        })

    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to approve clinic' })
    }
}
