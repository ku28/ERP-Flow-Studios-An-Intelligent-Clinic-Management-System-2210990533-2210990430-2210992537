import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import bcrypt from 'bcryptjs'
import { createSessionToken, setSessionCookie } from '../../../lib/auth'
import { registerSession } from '../../../lib/sessionManager'
import { sendEmail } from '../../../lib/email'
import otpStore from '../../../lib/otpStore'

function generate6DigitOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString()
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const { step, email, password, otp } = req.body

    // ── Step 1: verify credentials, send OTP ──────────────────────────────────
    if (step === 'credentials') {
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

        const user = await prisma.user.findFirst({ where: { email } })
        if (!user || !user.passwordHash) return res.status(401).json({ error: 'Invalid credentials' })

        const ok = await bcrypt.compare(password, user.passwordHash)
        if (!ok) return res.status(401).json({ error: 'Invalid credentials' })

        if (user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied. Super admin role required.' })
        }

        // Generate and store OTP (10-min expiry)
        const otpCode = generate6DigitOTP()
        const key = `super_admin_otp:${email}`
        otpStore.set(key, {
            otp: otpCode,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000),
            name: user.name || 'Super Admin',
        })

        // Send OTP email
        await sendEmail({
            to: email,
            subject: 'Super Admin Login — Verification Code',
            html: `
                <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px;">
                    <div style="text-align:center;margin-bottom:20px;">
                        <div style="display:inline-block;background:#ede9fe;border-radius:50%;padding:16px;margin-bottom:8px;">
                            <svg width="32" height="32" fill="none" stroke="#7c3aed" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
                        </div>
                        <h2 style="color:#7c3aed;margin:0;font-size:22px;">Super Admin Login</h2>
                        <p style="color:#6b7280;margin:4px 0 0;">ERP Flow Studios</p>
                    </div>
                    <p style="color:#374151;">Hello <strong>${user.name || 'Super Admin'}</strong>,</p>
                    <p style="color:#374151;">Your one-time verification code is:</p>
                    <div style="background:#fff;border:2px solid #ddd6fe;border-radius:12px;text-align:center;padding:20px;margin:16px 0;">
                        <span style="font-size:36px;font-weight:bold;letter-spacing:10px;color:#7c3aed;">${otpCode}</span>
                    </div>
                    <p style="color:#6b7280;font-size:13px;">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
                    <p style="color:#9ca3af;font-size:12px;margin-top:16px;border-top:1px solid #e5e7eb;padding-top:12px;">
                        If you did not attempt to log in, please secure your account immediately.
                    </p>
                </div>
            `,
        })

        return res.status(200).json({ next: 'otp', message: `Verification code sent to ${email}` })
    }

    // ── Step 2: verify OTP, create session ────────────────────────────────────
    if (step === 'otp') {
        if (!email || !otp) return res.status(400).json({ error: 'Email and OTP required' })

        const key = `super_admin_otp:${email}`
        const stored = otpStore.get(key)

        if (!stored) {
            return res.status(401).json({ error: 'OTP expired or not found. Please restart login.' })
        }
        if (new Date() > stored.expiresAt) {
            otpStore.delete(key)
            return res.status(401).json({ error: 'OTP has expired. Please restart login.' })
        }
        if (stored.otp !== String(otp).trim()) {
            return res.status(401).json({ error: 'Invalid OTP. Please check and try again.' })
        }

        // OTP correct — delete it and create session
        otpStore.delete(key)

        const user = await prisma.user.findFirst({ where: { email } })
        if (!user) return res.status(401).json({ error: 'User not found' })

        const token = createSessionToken({ sub: user.id })
        setSessionCookie(res, token)

        const ip =
            (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
            req.socket?.remoteAddress ||
            '127.0.0.1'

        await registerSession({
            userId: user.id,
            clinicInternalId: null,
            sessionToken: token,
            ipAddress: ip,
            userAgent: (req.headers['user-agent'] as string) || null,
            location: null,
        })

        return res.status(200).json({ success: true })
    }

    return res.status(400).json({ error: 'Invalid step' })
}
