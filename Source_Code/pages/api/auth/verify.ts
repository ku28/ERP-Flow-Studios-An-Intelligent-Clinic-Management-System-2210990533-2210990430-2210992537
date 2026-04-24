import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { sendEmail, generateWelcomeEmail } from '../../../lib/email'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    let token = req.query.token as string

    if (!token || typeof token !== 'string') {
        return res.status(400).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Invalid Token</title>
                <style>
                    body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f3f4f6; }
                    .container { text-align: center; padding: 40px; background: white; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                    .error { color: #dc2626; font-size: 48px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="error">❌</div>
                    <h1>Invalid Verification Token</h1>
                    <p>The verification link is invalid or malformed.</p>
                </div>
            </body>
            </html>
        `)
    }

    try {
        // Debug log
        
        // Find pending user by exact token match
        const pendingUser = await prisma.pendingUser.findUnique({
            where: { verificationToken: token }
        })


        if (!pendingUser) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Token Not Found</title>
                    <style>
                        body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f3f4f6; }
                        .container { text-align: center; padding: 40px; background: white; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 500px; }
                        .error { color: #dc2626; font-size: 48px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="error">❌</div>
                        <h1>Verification Request Not Found</h1>
                        <p>This verification link is invalid or has already been used.</p>
                        <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
                            Possible reasons:
                            <ul style="text-align: left; display: inline-block;">
                                <li>The link has expired (24 hours limit)</li>
                                <li>The account has already been verified</li>
                                <li>The link was modified or corrupted</li>
                            </ul>
                        </p>
                        <p style="margin-top: 20px;">
                            <a href="/clinic-login" style="color: #2563eb; text-decoration: none; font-weight: bold;">← Back to Login</a>
                        </p>
                    </div>
                </body>
                </html>
            `)
        }

        // Check if token is expired
        if (new Date() > pendingUser.expiresAt) {
            // Delete expired pending user
            await prisma.pendingUser.delete({ where: { id: pendingUser.id } })

            return res.status(410).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Token Expired</title>
                    <style>
                        body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f3f4f6; }
                        .container { text-align: center; padding: 40px; background: white; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                        .error { color: #f59e0b; font-size: 48px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="error">⏰</div>
                        <h1>Verification Link Expired</h1>
                        <p>This verification link has expired (24 hours limit).</p>
                        <p>The user will need to sign up again.</p>
                    </div>
                </body>
                </html>
            `)
        }

        // Create the actual user with clinic association
        let actualClinicId: string | undefined = undefined
        
        // If clinicId (6-digit code) exists in pending user, look up the actual clinic ID
        if (pendingUser.clinicId) {
            try {
                const clinic = await prisma.clinic.findUnique({
                    where: { clinicId: pendingUser.clinicId },
                    select: { id: true }
                })
                if (clinic) {
                    actualClinicId = clinic.id
                }
            } catch (clinicError) {
            }
        }
        
        const user = await prisma.user.create({
            data: {
                email: pendingUser.email,
                name: pendingUser.name,
                passwordHash: pendingUser.passwordHash,
                role: pendingUser.role,
                clinicId: actualClinicId || undefined
            }
        })

        // Send welcome email to the new user
        try {
            const welcomeHtml = generateWelcomeEmail(user.name || 'User')
            await sendEmail({
                to: user.email,
                subject: '🎉 Your ERP Flow Studios Account Has Been Approved!',
                html: welcomeHtml
            })
        } catch (emailError) {
            // Continue anyway - user is created
        }

        // Delete pending user
        await prisma.pendingUser.delete({ where: { id: pendingUser.id } })

        // Return success page
        return res.status(200).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Account Verified</title>
                <style>
                    body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); }
                    .container { text-align: center; padding: 50px; background: white; border-radius: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); max-width: 500px; }
                    .success { color: #16a34a; font-size: 64px; animation: bounce 1s ease; }
                    @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-20px); } }
                    .button { display: inline-block; margin-top: 20px; padding: 12px 30px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; }
                    .info { background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0; text-align: left; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="success">Verfied!</div>
                    <h1>Account Verified Successfully!</h1>
                    <p>The user account has been created and activated.</p>
                    
                    <div class="info">
                        <strong>Name:</strong> ${user.name}<br>
                        <strong>Email:</strong> ${user.email}<br>
                        <strong>Role:</strong> ${user.role.toUpperCase()}
                    </div>

                    <p>A welcome email has been sent to the user.</p>
                    <p>They can now log in to the system!</p>
                    
                    <a href="/" class="button">Go to Dashboard</a>
                </div>
            </body>
            </html>
        `)

    } catch (err: any) {
        return res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Verification Error</title>
                <style>
                    body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f3f4f6; }
                    .container { text-align: center; padding: 40px; background: white; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                    .error { color: #dc2626; font-size: 48px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="error">❌</div>
                    <h1>Verification Failed</h1>
                    <p>An error occurred while verifying the account.</p>
                    <p style="color: #6b7280; font-size: 14px;">${err.message}</p>
                </div>
            </body>
            </html>
        `)
    }
}
