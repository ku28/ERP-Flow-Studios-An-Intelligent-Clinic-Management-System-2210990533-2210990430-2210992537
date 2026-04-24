import type { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../../lib/prisma';
import { sendEmail, generateClinicActivationEmail } from '../../../lib/email';
import crypto from 'crypto';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    // Find pending clinic registration by admin email
    const pendingClinic = await prisma.pendingClinic.findUnique({
        where: { adminEmail: email }
    });

    if (!pendingClinic) {
        return res.status(404).json({ error: 'No pending registration found for this email' });
    }

    // Generate new verification token and expiration
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    await prisma.pendingClinic.update({
        where: { adminEmail: email },
        data: { verificationToken, expiresAt }
    });

    // Send activation email to super admin
    // Query database for super admin users
    const superAdmins = await prisma.user.findMany({
        where: { role: 'super_admin' },
        select: { email: true }
    });
    
    if (superAdmins.length === 0 || !superAdmins[0].email) {
        return res.status(500).json({ error: 'No super admin found in database.' });
    }
    
    try {
        await sendEmail({
            to: superAdmins[0].email,
            subject: `Resent Clinic Registration Verification`,
            html: generateClinicActivationEmail({
                clinicName: pendingClinic.clinicName,
                adminName: pendingClinic.adminName,
                adminEmail: email,
                clinicId: pendingClinic.clinicId,
                verificationToken
            })
        });
        return res.status(200).json({ message: 'Verification email resent to super admin.' });
    } catch (error) {
        return res.status(500).json({ error: 'Failed to resend verification email.' });
    }
}
