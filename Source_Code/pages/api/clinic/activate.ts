import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { normalizeBillingCycleWithMinimum } from '../../../lib/subscriptionBilling'
import { getTrialEndsAtFromNow } from '../../../lib/subscription'
import { markTrialAvailed } from '../../../lib/trialRegistry'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { token } = req.query

    if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Verification token is required' })
    }

    try {
        const tokenParts = token.split('__')
        const tokenPlan = tokenParts.length >= 3 ? tokenParts[tokenParts.length - 2] : undefined
        const tokenCycle = tokenParts.length >= 3 ? tokenParts[tokenParts.length - 1] : undefined
        const requestedPlan = tokenPlan === 'pro' || tokenPlan === 'standard' || tokenPlan === 'basic' || tokenPlan === 'basic_ai_ocr' || tokenPlan === 'standard_ai_ocr'
            ? tokenPlan
            : 'basic'
        const requestedCycle = normalizeBillingCycleWithMinimum(tokenCycle)

        // Find pending clinic by token
        const pendingClinic = await prisma.pendingClinic.findUnique({
            where: { verificationToken: token }
        })

        if (!pendingClinic) {
            return res.status(404).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Activation Error</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .error { color: #dc2626; font-size: 24px; font-weight: bold; }
                        .message { color: #6b7280; margin-top: 20px; }
                    </style>
                </head>
                <body>
                    <div class="error">❌ Invalid Verification Link</div>
                    <div class="message">This activation link is invalid or has already been used.</div>
                </body>
                </html>
            `)
        }

        // Check if token has expired
        if (new Date() > pendingClinic.expiresAt) {
            await prisma.pendingClinic.update({
                where: { id: pendingClinic.id },
                data: { status: 'expired' }
            })

            return res.status(400).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Link Expired</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .error { color: #dc2626; font-size: 24px; font-weight: bold; }
                        .message { color: #6b7280; margin-top: 20px; }
                    </style>
                </head>
                <body>
                    <div class="error">⏰ Verification Link Expired</div>
                    <div class="message">This activation link has expired. Please contact support or submit a new registration.</div>
                </body>
                </html>
            `)
        }

        // Check if already approved
        if (pendingClinic.status === 'approved') {
            return res.status(200).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Already Activated</title>
                    <style>
                        body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                        .success { color: #10b981; font-size: 24px; font-weight: bold; }
                        .message { color: #6b7280; margin-top: 20px; }
                    </style>
                </head>
                <body>
                    <div class="success">✅ Already Activated</div>
                    <div class="message">This clinic has already been activated successfully.</div>
                </body>
                </html>
            `)
        }

        // Create clinic and admin user in a transaction
        const result = await prisma.$transaction(async (tx: any) => {
            // Create clinic
            const now = new Date()
            const clinic = await tx.clinic.create({
                data: {
                    clinicId: pendingClinic.clinicId,
                    name: pendingClinic.clinicName,
                    email: pendingClinic.adminEmail,
                    address: pendingClinic.address,
                    city: pendingClinic.city,
                    state: pendingClinic.state,
                    iconUrl: pendingClinic.iconUrl,
                    prescriptionHeaderUrl: pendingClinic.prescriptionHeaderUrl,
                    prescriptionFooterUrl: pendingClinic.prescriptionFooterUrl,
                    prescriptionSignatureUrl: pendingClinic.prescriptionSignatureUrl,
                    prescriptionWatermarkUrl: pendingClinic.prescriptionWatermarkUrl,
                    status: 'active',
                    subscriptionPlan: requestedPlan,
                    subscriptionCycle: requestedCycle,
                    subscriptionStatus: 'trial',
                    subscriptionStart: now,
                    subscriptionEnd: null,
                    trialEndsAt: getTrialEndsAtFromNow(requestedPlan),
                }
            })

            // Create initial ClinicLocation if location was set during registration
            if (pendingClinic.locationLat && pendingClinic.locationLng) {
                await tx.clinicLocation.create({
                    data: {
                        clinicId: clinic.id,
                        lat: pendingClinic.locationLat,
                        lng: pendingClinic.locationLng,
                        name: pendingClinic.locationName || null,
                        radius: pendingClinic.locationRadius ?? 500
                    }
                })
            }

            // Create admin user for this clinic
            const adminUser = await tx.user.create({
                data: {
                    email: pendingClinic.adminEmail,
                    name: pendingClinic.adminName,
                    passwordHash: pendingClinic.adminPasswordHash,
                    role: 'admin',
                    verified: true,
                    clinicId: clinic.id
                }
            })

            // Update pending clinic status
            await tx.pendingClinic.update({
                where: { id: pendingClinic.id },
                data: { status: 'approved' }
            })

            return { clinic, adminUser }
        })


        // Return success page
        return res.status(200).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Clinic Activated</title>
                <style>
                    body { 
                        font-family: Arial, sans-serif; 
                        text-align: center; 
                        padding: 50px; 
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0;
                    }
                    .container {
                        background: white;
                        padding: 40px;
                        border-radius: 10px;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                        max-width: 500px;
                    }
                    .success { color: #10b981; font-size: 48px; margin-bottom: 20px; }
                    .title { color: #1f2937; font-size: 28px; font-weight: bold; margin-bottom: 20px; }
                    .message { color: #6b7280; margin: 20px 0; line-height: 1.6; }
                    .code-box {
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        color: white;
                        padding: 20px;
                        border-radius: 8px;
                        margin: 20px 0;
                        font-size: 36px;
                        font-weight: bold;
                        letter-spacing: 3px;
                    }
                    .info { 
                        background: #eff6ff; 
                        padding: 15px; 
                        border-radius: 8px; 
                        margin-top: 20px;
                        color: #1f2937;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="success">✅</div>
                    <div class="title">Clinic Activated Successfully!</div>
                    <div class="message">
                        <strong>${pendingClinic.clinicName}</strong> has been activated and is now ready to use.
                    </div>
                    <div class="code-box">${pendingClinic.clinicId}</div>
                    <div class="info">
                        <strong>Access Code:</strong> ${pendingClinic.clinicId}<br>
                        <strong>Admin Email:</strong> ${pendingClinic.adminEmail}<br><br>
                        The clinic admin can now log in using this access code.
                    </div>
                </div>
            </body>
            </html>
        `)

    } catch (error: any) {
        return res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Activation Error</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
                    .error { color: #dc2626; font-size: 24px; font-weight: bold; }
                    .message { color: #6b7280; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="error">❌ Activation Failed</div>
                <div class="message">An error occurred while activating the clinic. Please try again or contact support.</div>
            </body>
            </html>
        `)
    }
}
