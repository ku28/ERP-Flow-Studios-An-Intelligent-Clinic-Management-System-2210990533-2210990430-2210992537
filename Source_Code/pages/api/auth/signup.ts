import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { sendEmail, generateVerificationEmail } from '../../../lib/email'
import { canAssignRoleForBasicPlan, isBasicPlan } from '../../../lib/subscription'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    const { email, name, password, role, clinicId } = req.body
    if (!email || !password || !role) return res.status(400).json({ error: 'Email, password, and role are required' })
    
    try {
        if (clinicId) {
            const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { subscriptionPlan: true } })
            if (isBasicPlan(clinic?.subscriptionPlan)) {
                const clinicUsers = await prisma.user.findMany({ where: { clinicId }, select: { id: true, role: true } })
                const limitCheck = canAssignRoleForBasicPlan(role, clinicUsers)
                if (!limitCheck.allowed) {
                    return res.status(400).json({ error: limitCheck.reason || 'Basic plan user limit exceeded' })
                }
            }
        }

        // Check if user already exists
        const existingUser = await prisma.user.findUnique({ where: { email } })
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' })
        }

        // Check if there's already a pending registration
        const existingPending = await prisma.pendingUser.findUnique({ where: { email } })
        if (existingPending) {
            return res.status(400).json({ error: 'A verification request is already pending for this email' })
        }

        // Hash password
        const hash = await bcrypt.hash(password, 10)
        
        // Generate verification token
        const verificationToken = crypto.randomBytes(32).toString('hex')
        
        // Calculate expiration (24 hours from now)
        const expiresAt = new Date()
        expiresAt.setHours(expiresAt.getHours() + 24)

        // Create pending user
        const pendingUserRecord = await prisma.pendingUser.create({
            data: {
                email,
                name,
                passwordHash: hash,
                role,
                verificationToken,
                expiresAt,
                clinicId: clinicId || undefined
            }
        })


        // Get super admin emails from database
        const superAdmins = await prisma.user.findMany({
            where: { role: 'super_admin' },
            select: { email: true }
        })
        
        // Get clinic admin emails if clinicId is provided
        let clinicAdmins: any[] = []
        if (clinicId) {
            clinicAdmins = await prisma.user.findMany({
                where: { 
                    role: 'admin',
                    clinicId: clinicId
                },
                select: { email: true }
            })
        }
        
        // Combine all admin emails
        const allAdminEmails = [
            ...superAdmins.map((admin: any) => admin.email).filter(Boolean),
            ...clinicAdmins.map((admin: any) => admin.email).filter(Boolean)
        ]
        
        // Fallback to SMTP sender if no admins found
        if (allAdminEmails.length === 0 && process.env.SMTP_USER) {
            allAdminEmails.push(process.env.SMTP_USER)
        }
        
        const emailHtml = generateVerificationEmail(name || 'Unknown', email, role, verificationToken)
        
        try {
            // Send email to all admins
            const emailPromises = allAdminEmails.map(adminEmail => 
                sendEmail({
                    to: adminEmail,
                    subject: `🔔 New User Registration: ${name} (${role})`,
                    html: emailHtml
                })
            )
            
            await Promise.all(emailPromises)
        } catch (emailError) {
            // Delete the pending user if email fails
            await prisma.pendingUser.delete({ where: { email } })
            return res.status(500).json({ error: 'Failed to send verification email. Please try again later.' })
        }

        return res.status(201).json({ 
            message: 'Signup request submitted successfully. Your account will be activated once the administrator approves it.',
            pendingVerification: true
        })
    } catch (err: any) {
        return res.status(500).json({ error: String(err?.message || err) })
    }
}
