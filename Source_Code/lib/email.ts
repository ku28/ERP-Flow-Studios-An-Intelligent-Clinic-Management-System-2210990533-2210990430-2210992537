import nodemailer from 'nodemailer'

export interface EmailOptions {
    to: string
    subject: string
    html: string
    /** Display name + address shown in the From field, e.g. "Clinic Name <clinic@example.com>" */
    from?: string
    /** Reply-To address — useful when sending via shared SMTP but replies should go to the clinic */
    replyTo?: string
    /** Clinic ID — when provided, uses the clinic's own email configuration */
    clinicId?: string
}

/** Build a nodemailer transporter from clinic-level email settings.
 *  Returns null when the clinic has no custom config (caller should fall back to system SMTP). */
async function buildClinicTransporter(clinicId: string): Promise<{ transporter: nodemailer.Transporter; fromAddress: string; provider: string } | null> {
    // Dynamic import to avoid circular deps at module-load time
    const prisma = (await import('./prisma')).default
    const clinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { name: true, emailProvider: true, smtpHost: true, smtpPort: true, smtpEmail: true, smtpPassword: true, smtpSecure: true, gmailAccessToken: true, gmailRefreshToken: true, gmailEmail: true, gmailTokenExpiry: true }
    })
    if (!clinic) return null

    if (clinic.emailProvider === 'smtp' && clinic.smtpHost && clinic.smtpEmail && clinic.smtpPassword) {
        const transporter = nodemailer.createTransport({
            host: clinic.smtpHost,
            port: clinic.smtpPort || 587,
            secure: clinic.smtpSecure,
            auth: { user: clinic.smtpEmail, pass: clinic.smtpPassword },
        })
        const from = clinic.name ? `${clinic.name} <${clinic.smtpEmail}>` : clinic.smtpEmail
        return { transporter, fromAddress: from, provider: 'smtp' }
    }

    if (clinic.emailProvider === 'gmail' && clinic.gmailRefreshToken) {
        const { refreshGmailToken } = await import('./gmailAuth')
        const tokens = await refreshGmailToken(clinic.gmailRefreshToken)
        // Persist refreshed token
        await prisma.clinic.update({
            where: { id: clinicId },
            data: { gmailAccessToken: tokens.access_token, gmailTokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null }
        })
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                type: 'OAuth2',
                user: clinic.gmailEmail || '',
                clientId: process.env.GOOGLE_GMAIL_CLIENT_ID,
                clientSecret: process.env.GOOGLE_GMAIL_CLIENT_SECRET,
                refreshToken: clinic.gmailRefreshToken,
                accessToken: tokens.access_token,
            },
        } as any)
        const from = clinic.name ? `${clinic.name} <${clinic.gmailEmail}>` : (clinic.gmailEmail || '')
        return { transporter, fromAddress: from, provider: 'gmail' }
    }

    return null
}

export async function sendEmail({ to, subject, html, from, replyTo, clinicId }: EmailOptions) {
    let transporter: nodemailer.Transporter
    let fromAddress: string
    let provider = 'system'

    // 1. Try clinic-specific configuration
    if (clinicId) {
        const clinicResult = await buildClinicTransporter(clinicId)
        if (clinicResult) {
            transporter = clinicResult.transporter
            fromAddress = from || clinicResult.fromAddress
            provider = clinicResult.provider
        } else {
            // Fall back to system SMTP
            if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
                throw new Error('Email configuration missing')
            }
            transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: false,
                auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
            })
            fromAddress = from || process.env.SMTP_FROM || process.env.SMTP_USER
        }
    } else {
        // 2. System SMTP
        if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
            throw new Error('Email configuration missing')
        }
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: false,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
        })
        fromAddress = from || process.env.SMTP_FROM || process.env.SMTP_USER
    }

    // Send
    const info = await transporter!.sendMail({
        from: fromAddress!,
        to,
        subject,
        html,
        ...(replyTo ? { replyTo } : {}),
    })

    // Log the email
    try {
        const prisma = (await import('./prisma')).default
        await prisma.emailLog.create({
            data: { clinicId: clinicId || null, recipient: to, subject, status: 'sent', provider }
        })
    } catch { /* logging failure should not break send */ }

    return info
}

/** Convenience wrapper that catches send errors and logs them. */
export async function sendEmailSafe(opts: EmailOptions): Promise<{ success: boolean; error?: string }> {
    try {
        await sendEmail(opts)
        return { success: true }
    } catch (err: any) {
        try {
            const prisma = (await import('./prisma')).default
            await prisma.emailLog.create({
                data: { clinicId: opts.clinicId || null, recipient: opts.to, subject: opts.subject, status: 'failed', error: err.message?.substring(0, 500), provider: 'unknown' }
            })
        } catch { /* ignore logging failure */ }
        return { success: false, error: err.message }
    }
}

export function generateVerificationEmail(name: string, email: string, role: string, verificationToken: string) {
    const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/verify?token=${verificationToken}`
    
    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
        .button { display: inline-block; padding: 12px 30px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
        .info-box { background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏥 ERP Flow Studios - New User Registration</h1>
        </div>
        <div class="content">
            <h2>New User Signup Request</h2>
            <p>A new user has requested to sign up for ERP Flow Studios system.</p>
            
            <div class="info-box">
                <strong>User Details:</strong><br>
                👤 <strong>Name:</strong> ${name}<br>
                📧 <strong>Email:</strong> ${email}<br>
                🎭 <strong>Role:</strong> ${role.toUpperCase()}
            </div>

            <p>Click the button below to <strong>approve and create</strong> this user account:</p>
            
            <div style="text-align: center;">
                <a href="${verificationUrl}" class="button">✅ Verify & Create Account</a>
            </div>

            <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <code style="background-color: #e5e7eb; padding: 5px; display: block; margin-top: 5px; word-break: break-all;">${verificationUrl}</code>
            </p>

            <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280;">
                ⚠️ <strong>Note:</strong> This verification link will expire in 24 hours. If you did not expect this request, you can safely ignore this email.
            </p>
        </div>
        <div class="footer">
            <p>ERP Flow Studios System - Automated Email</p>
            <p>This is an automated notification for admin approval.</p>
        </div>
    </div>
</body>
</html>
    `
}

export function generateWelcomeEmail(name: string) {
    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 Welcome to ERP Flow Studios!</h1>
        </div>
        <div class="content">
            <h2>Hello ${name},</h2>
            <p>Great news! Your account has been <strong>approved</strong> by the administrator.</p>
            <p>You can now log in to the ERP Flow Studios system and start using all the features available to your role.</p>
            
            <div style="background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0;">
                <strong>Next Steps:</strong><br>
                1. Visit the login page<br>
                2. Use your registered email and password<br>
                3. Start managing your work efficiently!
            </div>

            <p>If you have any questions or need assistance, please contact your system administrator.</p>
        </div>
        <div class="footer">
            <p>ERP Flow Studios System</p>
        </div>
    </div>
</body>
</html>
    `
}

export function generateClinicActivationEmail(clinicDetails: {
    clinicName: string
    adminName: string
    adminEmail: string
    clinicId: string
    verificationToken: string
}) {
    const { clinicName, adminName, adminEmail, clinicId, verificationToken } = clinicDetails
    const activationUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/clinic/activate?token=${verificationToken}`
    
    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
        .content { background-color: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
        .button { display: inline-block; padding: 12px 30px; background-color: #10b981; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; margin: 20px 0; }
        .info-box { background-color: #eff6ff; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0; }
        .code-box { background-color: #fef3c7; border: 2px solid #f59e0b; padding: 15px; margin: 20px 0; text-align: center; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🏥 New Clinic Registration Request</h1>
        </div>
        <div class="content">
            <h2>Clinic Activation Required</h2>
            <p>A new clinic has requested to join ERP Flow Studios system and requires your approval.</p>
            
            <div class="info-box">
                <strong>Clinic Details:</strong><br>
                🏥 <strong>Clinic Name:</strong> ${clinicName}<br>
                👤 <strong>Admin Name:</strong> ${adminName}<br>
                📧 <strong>Admin Email:</strong> ${adminEmail}
            </div>

            <div class="code-box">
                <p style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280;"><strong>Generated Access Code:</strong></p>
                <p style="margin: 0; font-size: 36px; font-weight: bold; color: #2563eb; letter-spacing: 5px;">${clinicId}</p>
            </div>

            <p><strong>To activate this clinic and grant access, click the button below:</strong></p>
            
            <div style="text-align: center;">
                <a href="${activationUrl}" class="button">✅ Activate Clinic</a>
            </div>

            <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <code style="background-color: #e5e7eb; padding: 5px; display: block; margin-top: 5px; word-break: break-all;">${activationUrl}</code>
            </p>

            <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280;">
                ⚠️ <strong>Note:</strong> This activation link will expire in 24 hours. If you did not expect this request or want to decline it, you can safely ignore this email.
            </p>
        </div>
        <div class="footer">
            <p>ERP Flow Studios System - Super Admin</p>
            <p>This is an automated notification for admin approval.</p>
        </div>
    </div>
</body>
</html>
    `
}

export function generateGeoAccessRequestEmail(
    receptionistName: string,
    receptionistEmail: string,
    clinicName: string,
    approvalUrl: string,
    denyUrl: string
) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    return `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 24px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background-color: #fffbeb; padding: 30px; border: 1px solid #fcd34d; }
        .info-box { background-color: #fff3cd; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 0 6px 6px 0; }
        .btn-approve { display: inline-block; padding: 14px 36px; background-color: #10b981; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 10px 6px; }
        .btn-deny { display: inline-block; padding: 14px 36px; background-color: #ef4444; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 10px 6px; }
        .warning { background-color: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 6px; margin-top: 20px; color: #991b1b; font-size: 13px; }
        .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔐 Location Access Request</h1>
            <p style="margin:0;opacity:0.9">${clinicName} ERP</p>
        </div>
        <div class="content">
            <h2 style="color:#92400e;">30-Minute Access Request</h2>
            <p>A staff member is requesting temporary location-bypassed access to <strong>${clinicName} ERP</strong>. They were geo-blocked because they are outside the clinic's allowed location zone.</p>
            
            <div class="info-box">
                <strong>Request Details:</strong><br>
                👤 <strong>Name:</strong> ${receptionistName || 'Not provided'}<br>
                📧 <strong>Email:</strong> ${receptionistEmail}<br>
                🏥 <strong>Clinic:</strong> ${clinicName}<br>
                ⏱️ <strong>Access Duration:</strong> 30 minutes upon approval
            </div>

            <p>If you recognize this person and approve their access, click the <strong>Approve</strong> button. They will be automatically logged in for 30 minutes.</p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${approvalUrl}" class="btn-approve">✅ Approve 30-Min Access</a>
                <a href="${denyUrl}" class="btn-deny">❌ Deny Request</a>
            </div>

            <div class="warning">
                ⚠️ <strong>Security Notice:</strong> Only approve this request if you know this person and trust them to access the clinic system. This link grants temporary access and expires after 30 minutes of use.
            </div>

            <p style="font-size: 12px; color: #6b7280; margin-top: 20px;">
                If the buttons don't work, copy and paste this approval link:<br>
                <code style="background-color:#e5e7eb;padding:4px 8px;display:block;margin-top:5px;word-break:break-all;border-radius:4px;">${approvalUrl}</code>
            </p>
        </div>
        <div class="footer">
            <p>ERP Flow Studios System — Automated Security Alert</p>
        </div>
    </div>
</body>
</html>
    `
}
