import prisma from '../../../lib/prisma';
import nodemailer from 'nodemailer';
import { randomBytes } from 'crypto';

import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).end();
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Generate token
    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    // Save token to user
    await prisma.user.update({
        where: { email },
        data: { resetToken: token, resetTokenExpiry: expires },
    });

    // Send email
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    const resetUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/reset-password?token=${token}`;
    const mailOptions = {
        from: process.env.SMTP_USER,
        to: [email, process.env.SMTP_USER],
        subject: 'Password Reset Request',
        html: `<p>You requested a password reset. <a href='${resetUrl}'>Click here to reset your password</a>. This link expires in 1 hour.</p>`
    };
    await transporter.sendMail(mailOptions);

    return res.status(200).json({ message: 'Password reset email sent' });
}
