import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { sendEmail, generateClinicActivationEmail } from '../../../lib/email'
import { isBillingCycleLocked, normalizeBillingCycleWithMinimum } from '../../../lib/subscriptionBilling'
import { getCoupons, normalizeCouponCode, validateCouponForAmount } from '../../../lib/coupons'
import { hasAvailedTrial } from '../../../lib/trialRegistry'

const REGISTER_PLAN_PRICES: Record<string, Record<string, number>> = {
    basic: { annual: 3999, fiveYear: 19999 },
    standard: { annual: 7999, fiveYear: 29999 },
    pro: { annual: 19999, fiveYear: 74999 },
}

// Function to generate unique 6-digit clinic ID in format "900XXX"
async function generateClinicId(): Promise<string> {
    let clinicId: string
    let exists = true
    
    while (exists) {
        // Generate random 3-digit number and prepend "900"
        const randomThreeDigits = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
        clinicId = `900${randomThreeDigits}`
        
        // Check if already exists in both Clinic and PendingClinic tables
        const [existingClinic, existingPending] = await Promise.all([
            prisma.clinic.findUnique({ where: { clinicId } }),
            prisma.pendingClinic.findUnique({ where: { clinicId } })
        ])
        
        exists = !!existingClinic || !!existingPending
    }
    
    return clinicId!
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const {
        clinicName,
        adminName,
        email,
        phone,
        password,
        confirmPassword,
        address,
        city,
        state,
        iconUrl,
        prescriptionHeaderUrl,
        prescriptionFooterUrl,
        prescriptionSignatureUrl,
        prescriptionWatermarkUrl,
        locationLat,
        locationLng,
        locationName,
        locationRadius,
        selectedPlan,
        billingCycle,
        couponCode,
    } = req.body

    // Validation
    if (!clinicName || !adminName || !email || !phone || !password || !confirmPassword) {
        return res.status(400).json({ error: 'All required fields must be filled' })
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match' })
    }

    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long' })
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' })
    }

    try {
        const trialAlreadyUsed = await hasAvailedTrial(email)
        if (trialAlreadyUsed) {
            return res.status(400).json({ error: 'Free trial already availed for this email. Please continue with a paid subscription.' })
        }

        const requestedPlan = selectedPlan === 'pro' || selectedPlan === 'standard' || selectedPlan === 'basic'
            ? selectedPlan
            : 'basic'

        if (isBillingCycleLocked(billingCycle)) {
            return res.status(400).json({ error: 'Monthly and 3-month plans are shown for reference. A minimum 1-year subscription is required.' })
        }

        const requestedCycle = normalizeBillingCycleWithMinimum(billingCycle)
        const baseAmount = REGISTER_PLAN_PRICES[requestedPlan]?.[requestedCycle]
        if (!baseAmount) {
            return res.status(400).json({ error: 'Invalid plan amount configuration' })
        }

        let normalizedCouponCode: string | null = null
        let discountAmount = 0
        if (couponCode) {
            normalizedCouponCode = normalizeCouponCode(couponCode)
            const coupons = await getCoupons()
            const coupon = coupons.find((c) => normalizeCouponCode(c.code) === normalizedCouponCode)
            if (!coupon) return res.status(400).json({ error: 'Invalid coupon code' })
            const validated = validateCouponForAmount(coupon, 'register_plan', baseAmount)
            if (!validated.valid) return res.status(400).json({ error: validated.reason })
            discountAmount = Number(validated.discountAmount || 0)
        }

        // Check if clinic with this email already exists (in both Clinic and PendingClinic)
        const [existingClinic, existingPending] = await Promise.all([
            prisma.clinic.findUnique({ where: { email } }),
            prisma.pendingClinic.findUnique({ where: { adminEmail: email } })
        ])

        if (existingClinic) {
            return res.status(400).json({ error: 'A clinic with this email already exists' })
        }

        if (existingPending) {
            return res.status(400).json({ error: 'A registration request with this email is already pending approval' })
        }

        // Check if user with this email already exists
        const existingUser = await prisma.user.findUnique({
            where: { email }
        })

        if (existingUser) {
            return res.status(400).json({ error: 'This email is already registered' })
        }

        // Generate unique 6-digit clinic ID
        const clinicId = await generateClinicId()

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10)

        // Generate verification token
        const verificationToken = `${crypto.randomBytes(24).toString('hex')}__${requestedPlan}__${requestedCycle}`

        // Calculate expiration (24 hours from now)
        const expiresAt = new Date()
        expiresAt.setHours(expiresAt.getHours() + 24)

        // Create pending clinic registration
        const pendingClinic = await prisma.pendingClinic.create({
            data: {
                clinicId,
                clinicName,
                adminName,
                adminEmail: email,
                adminPhone: phone,
                adminPasswordHash: passwordHash,
                address,
                city,
                state,
                iconUrl,
                prescriptionHeaderUrl,
                prescriptionFooterUrl,
                prescriptionSignatureUrl,
                prescriptionWatermarkUrl,
                locationLat: locationLat ? parseFloat(locationLat) : null,
                locationLng: locationLng ? parseFloat(locationLng) : null,
                locationName: locationName || null,
                locationRadius: locationRadius ? parseFloat(locationRadius) : 500,
                verificationToken,
                expiresAt,
                status: 'pending'
            }
        })

        // Send activation email to super admin
        // Query database for super admin users
        const superAdmins = await prisma.user.findMany({
            where: { role: 'super_admin' },
            select: { email: true }
        })
        
        const superAdminEmails = superAdmins.map((admin : any) => admin.email).filter(Boolean)
        
        if (superAdminEmails.length > 0) {
            try {
                const emailHtml = generateClinicActivationEmail({
                    clinicName,
                    adminName,
                    adminEmail: email,
                    clinicId,
                    verificationToken
                })
                const couponLine = normalizedCouponCode
                    ? `<p><strong>Coupon:</strong> ${normalizedCouponCode} (Discount: Rs ${discountAmount})</p>`
                    : '<p><strong>Coupon:</strong> None</p>'
                
                // Send to all super admins
                await Promise.all(
                    superAdminEmails.map((adminEmail : any) =>
                        sendEmail({
                            to: adminEmail,
                            subject: `🏥 New Clinic Registration: ${clinicName}`,
                            html: `${emailHtml}${couponLine}`
                        })
                    )
                )
            } catch (emailError) {
                // Don't fail the registration if email fails
            }
        } else {
            console.warn('⚠️ No super admin found in database. Skipping activation email.')
        }

        return res.status(201).json({
            success: true,
            message: 'Clinic registration submitted successfully. Waiting for admin approval.',
            clinicId: pendingClinic.clinicId,
            clinicName: pendingClinic.clinicName,
            status: 'pending'
        })

    } catch (error: any) {
        return res.status(500).json({ 
            error: 'Failed to register clinic. Please try again later.',
            details: error.message 
        })
    }
}
