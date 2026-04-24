import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import crypto from 'crypto'
import { sendEmail } from '../../../lib/email'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { token } = req.query

    if (req.method === 'GET') {
        // Show approval page
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
                        <h1>Invalid Approval Link</h1>
                        <p>The approval link is invalid or malformed.</p>
                    </div>
                </body>
                </html>
            `)
        }

        try {
            const request = await prisma.clinicAccessRequest.findUnique({
                where: { approvalToken: token }
            })

            if (!request) {
                return res.status(404).send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Request Not Found</title>
                        <style>
                            body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f3f4f6; }
                            .container { text-align: center; padding: 40px; background: white; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); max-width: 500px; }
                            .error { color: #dc2626; font-size: 48px; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="error">❌</div>
                            <h1>Request Not Found</h1>
                            <p>This approval request is invalid or has already been processed.</p>
                        </div>
                    </body>
                    </html>
                `)
            }

            // Check if expired
            if (new Date() > request.expiresAt) {
                await prisma.clinicAccessRequest.update({
                    where: { id: request.id },
                    data: { status: 'rejected' }
                })

                return res.status(410).send(`
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>Request Expired</title>
                        <style>
                            body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f3f4f6; }
                            .container { text-align: center; padding: 40px; background: white; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                            .error { color: #f59e0b; font-size: 48px; }
                        </style>
                    </head>
                    <body>
                        <div class="container">
                            <div class="error">⏰</div>
                            <h1>Request Expired</h1>
                            <p>This approval request has expired (24 hours limit).</p>
                        </div>
                    </body>
                    </html>
                `)
            }

            // Return approval page
            return res.status(200).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Approve Access Request</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
                        .container { max-width: 700px; width: 100%; }
                        .card { background: white; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden; }
                        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 50px 30px; text-align: center; position: relative; }
                        .header::before { content: ''; position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: url('data:image/svg+xml,<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40" fill="rgba(255,255,255,0.05)"/></svg>'); opacity: 0.1; }
                        .header h1 { font-size: 32px; margin-bottom: 10px; position: relative; z-index: 1; }
                        .header p { opacity: 0.95; font-size: 16px; position: relative; z-index: 1; }
                        .content { padding: 50px 40px; }
                        .request-type { display: inline-block; padding: 8px 16px; background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%); color: white; border-radius: 25px; font-size: 14px; font-weight: 700; margin-bottom: 30px; box-shadow: 0 4px 10px rgba(59,130,246,0.3); }
                        .section-title { color: #111827; font-size: 20px; margin-bottom: 20px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
                        .info-grid { background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%); border-radius: 15px; padding: 25px; margin: 20px 0; border: 1px solid #e5e7eb; }
                        .info-row { display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #e5e7eb; }
                        .info-row:last-child { border-bottom: none; }
                        .info-label { font-weight: 700; color: #6b7280; font-size: 14px; }
                        .info-value { color: #111827; font-weight: 600; font-size: 14px; text-align: right; }
                        .actions { display: flex; gap: 20px; margin-top: 40px; }
                        .btn { flex: 1; padding: 18px; border: none; border-radius: 12px; font-size: 16px; font-weight: 700; cursor: pointer; transition: all 0.3s; display: inline-flex; align-items: center; justify-content: center; gap: 10px; }
                        .btn-approve { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; box-shadow: 0 5px 20px rgba(16,185,129,0.4); }
                        .btn-approve:hover { transform: translateY(-3px); box-shadow: 0 8px 30px rgba(16,185,129,0.5); }
                        .btn-reject { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; box-shadow: 0 5px 20px rgba(239,68,68,0.4); }
                        .btn-reject:hover { transform: translateY(-3px); box-shadow: 0 8px 30px rgba(239,68,68,0.5); }
                        .btn:disabled { opacity: 0.6; cursor: not-allowed; transform: none !important; }
                        .alert { background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-left: 5px solid #f59e0b; padding: 20px; border-radius: 10px; margin-top: 30px; color: #92400e; font-size: 14px; font-weight: 600; }
                        .spinner { border: 3px solid rgba(255,255,255,0.3); border-top: 3px solid white; border-radius: 50%; width: 24px; height: 24px; animation: spin 0.8s linear infinite; }
                        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                        .loading-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); align-items: center; justify-content: center; z-index: 1000; }
                        .loading-content { background: white; padding: 50px; border-radius: 20px; text-align: center; animation: fadeIn 0.3s; }
                        .success-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); align-items: center; justify-content: center; z-index: 1000; }
                        .success-content { background: white; padding: 50px; border-radius: 20px; text-align: center; animation: fadeIn 0.3s; max-width: 500px; }
                        .success-icon { width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, #10b981 0%, #059669 100%); display: flex; align-items: center; justify-center; margin: 0 auto 20px; animation: scaleIn 0.5s; }
                        .error-icon { width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); display: flex; align-items: center; justify-center; margin: 0 auto 20px; animation: scaleIn 0.5s; }
                        @keyframes fadeIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
                        @keyframes scaleIn { from { transform: scale(0); } to { transform: scale(1); } }
                        .big-spinner { border: 5px solid rgba(102,126,234,0.3); border-top: 5px solid #667eea; border-radius: 50%; width: 60px; height: 60px; animation: spin 1s linear infinite; margin: 0 auto 20px; }
                        @media (max-width: 640px) { .actions { flex-direction: column; } .content { padding: 30px 20px; } }
                    </style>
                </head>
                <body>
                    <div class="loading-overlay" id="loadingOverlay">
                        <div class="loading-content">
                            <div class="big-spinner"></div>
                            <h2 style="font-size: 24px; color: #111827; margin-bottom: 10px;">Processing...</h2>
                            <p style="color: #6b7280; font-size: 14px;">Please wait while we process your request</p>
                        </div>
                    </div>

                    <div class="success-overlay" id="successOverlay">
                        <div class="success-content">
                            <div class="success-icon" id="resultIcon">
                                <svg style="width: 48px; height: 48px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                                </svg>
                            </div>
                            <h2 style="font-size: 28px; color: #111827; margin-bottom: 15px;" id="resultTitle">Success!</h2>
                            <p style="color: #6b7280; font-size: 16px; margin-bottom: 30px;" id="resultMessage">The request has been processed successfully.</p>
                            <button onclick="window.close()" style="padding: 15px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 10px; font-size: 16px; font-weight: 700; cursor: pointer;">Close Window</button>
                        </div>
                    </div>

                    <div class="container">
                        <div class="card" id="approvalCard">
                            <div class="header">
                                <h1>🏥 Access Request Approval</h1>
                                <p>Review the request details carefully before making a decision</p>
                            </div>
                            <div class="content">
                                <div class="request-type">${request.requestType === 'login_request' ? '🔑 Login Request' : request.requestType === 'access_code' ? '🔐 Access Code Request' : '📋 System Access'}</div>

                                <h2 class="section-title">
                                    <span>🏢</span>
                                    <span>Clinic Information</span>
                                </h2>
                                <div class="info-grid">
                                    <div class="info-row">
                                        <span class="info-label">Clinic Name</span>
                                        <span class="info-value">${request.clinicName}</span>
                                    </div>
                                    <div class="info-row">
                                        <span class="info-label">Clinic Code</span>
                                        <span class="info-value" style="font-family: monospace; letter-spacing: 2px;">${request.clinicId}</span>
                                    </div>
                                    <div class="info-row">
                                        <span class="info-label">Admin Email</span>
                                        <span class="info-value">${request.clinicAdminEmail}</span>
                                    </div>
                                </div>

                                <h2 class="section-title">
                                    <span>👤</span>
                                    <span>Requestor Information</span>
                                </h2>
                                <div class="info-grid">
                                    <div class="info-row">
                                        <span class="info-label">Name</span>
                                        <span class="info-value">${request.userName || request.clinicAdminEmail.split('@')[0]}</span>
                                    </div>
                                    <div class="info-row">
                                        <span class="info-label">Email</span>
                                        <span class="info-value">${request.userEmail || request.clinicAdminEmail}</span>
                                    </div>
                                    <div class="info-row">
                                        <span class="info-label">Request Date</span>
                                        <span class="info-value">${new Date(request.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                                    </div>
                                </div>

                                <div class="actions">
                                    <button id="approveBtn" class="btn btn-approve">
                                        <svg style="width: 24px; height: 24px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                        </svg>
                                        <span>Approve Request</span>
                                    </button>
                                    <button id="rejectBtn" class="btn btn-reject">
                                        <svg style="width: 24px; height: 24px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                        </svg>
                                        <span>Reject Request</span>
                                    </button>
                                </div>

                                <div class="alert">
                                    ⚠️ <strong>Important:</strong> This request expires in 24 hours. Click Approve to grant access or Reject to deny the request.
                                </div>
                            </div>
                        </div>
                    </div>

                    <script>
                        async function handleAction(action) {
                            document.getElementById('loadingOverlay').style.display = 'flex';
                            document.getElementById('approveBtn').disabled = true;
                            document.getElementById('rejectBtn').disabled = true;

                            try {
                                const response = await fetch('/api/clinic/approve-access?token=${token}', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action, token: '${token}' })
                                });

                                const data = await response.json();

                                if (!response.ok) {
                                    throw new Error(data.error || 'Failed to process request');
                                }

                                document.getElementById('loadingOverlay').style.display = 'none';

                                if (action === 'approve') {
                                    document.getElementById('resultIcon').innerHTML = '<svg style="width: 48px; height: 48px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path></svg>';
                                    document.getElementById('resultTitle').textContent = 'Request Approved!';
                                    document.getElementById('resultMessage').textContent = data.message || 'The access request has been approved successfully.';
                                    
                                    // If login request and we have a redirect URL, redirect the user
                                    if (data.redirectUrl) {
                                        document.getElementById('resultMessage').textContent = 'Logging you in...';
                                        setTimeout(() => {
                                            window.location.href = data.redirectUrl;
                                        }, 2000);
                                    }
                                } else {
                                    document.getElementById('resultIcon').innerHTML = '<svg style="width: 48px; height: 48px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"></path></svg>';
                                    document.getElementById('resultIcon').classList.remove('success-icon');
                                    document.getElementById('resultIcon').classList.add('error-icon');
                                    document.getElementById('resultTitle').textContent = 'Request Rejected';
                                    document.getElementById('resultMessage').textContent = 'The access request has been rejected.';
                                }

                                document.getElementById('successOverlay').style.display = 'flex';
                            } catch (error) {
                                document.getElementById('loadingOverlay').style.display = 'none';
                                document.getElementById('resultIcon').innerHTML = '<svg style="width: 48px; height: 48px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12"></path></svg>';
                                document.getElementById('resultIcon').classList.add('error-icon');
                                document.getElementById('resultTitle').textContent = 'Error';
                                document.getElementById('resultMessage').textContent = error.message || 'An error occurred while processing your request.';
                                document.getElementById('successOverlay').style.display = 'flex';
                            }
                        }

                        document.getElementById('approveBtn').addEventListener('click', () => handleAction('approve'));
                        document.getElementById('rejectBtn').addEventListener('click', () => handleAction('reject'));
                    </script>
                </body>
                </html>
            `)
        } catch (err: any) {
            return res.status(500).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Error</title>
                    <style>
                        body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f3f4f6; }
                        .container { text-align: center; padding: 40px; background: white; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                        .error { color: #dc2626; font-size: 48px; }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="error">❌</div>
                        <h1>Error Processing Request</h1>
                        <p>An error occurred while processing your request.</p>
                    </div>
                </body>
                </html>
            `)
        }
    } else if (req.method === 'POST') {
        // Process approval/rejection
        const { action, token: bodyToken, requestId } = req.body
        
        // Support both token-based and ID-based approval
        let request
        
        if (requestId) {
            // Direct ID lookup (from super admin dashboard)
            request = await prisma.clinicAccessRequest.findUnique({
                where: { id: requestId }
            })
        } else {
            // Token-based lookup (from email approval link)
            const approvalToken = (bodyToken || token) as string

            if (!approvalToken) {
                return res.status(400).json({ error: 'Missing approval token or request ID' })
            }

            request = await prisma.clinicAccessRequest.findUnique({
                where: { approvalToken }
            })
        }

        if (!request) {
            return res.status(404).json({ error: 'Request not found' })
        }

        try {

            if (action === 'approve') {
                //Update request status
                await prisma.clinicAccessRequest.update({
                    where: { id: request.id },
                    data: {
                        status: 'approved',
                        approvedAt: new Date()
                    }
                })

                // Handle different request types
                if (request.requestType === 'login_request') {
                    // For login requests, create a temporary login token
                    const user = await prisma.user.findUnique({
                        where: { email: request.clinicAdminEmail }
                    })

                    if (!user) {
                        return res.status(404).json({ error: 'User not found' })
                    }

                    // Generate a one-time login token
                    const loginToken = crypto.randomBytes(32).toString('hex')
                    const tokenExpiry = new Date()
                    tokenExpiry.setMinutes(tokenExpiry.getMinutes() + 10) // 10 minute expiry

                    // Store login token in the access request for retrieval
                    await prisma.clinicAccessRequest.update({
                        where: { id: request.id },
                        data: {
                            userEmail: loginToken, // Temporarily store in userEmail field
                            approvedAt: tokenExpiry // Store expiry in approvedAt
                        }
                    })

                    const redirectUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard`
                    
                    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background-color: #f9fafb; padding: 40px; border: 1px solid #e5e7eb; border-radius: 0 0 10px 10px; }
        .success { width: 80px; height: 80px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
        .btn { display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: bold; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="success">
                <svg style="width: 48px; height: 48px; color: #10b981;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                </svg>
            </div>
            <h1 style="font-size: 28px; margin: 0;">🎉 Login Approved!</h1>
        </div>
        <div class="content">
            <h2 style="color: #111827; margin-bottom: 15px;">Welcome to ${request.clinicName}!</h2>
            <p style="font-size: 16px; color: #6b7280; margin-bottom: 25px;">Your login request has been approved by the super admin. You should be automatically logged in now.</p>
            <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin-top: 25px; border-radius: 5px;">
                <p style="margin: 0; color: #1e40af; font-weight: 600;">
                    💡 <strong>Note:</strong> If you weren't automatically logged in, please close your browser tab and try the login process again.
                </p>
            </div>
        </div>
    </div>
</body>
</html>
                    `

                    await sendEmail({
                        to: request.clinicAdminEmail,
                        subject: '🎉 Login Approved - Access Your Clinic',
                        html: emailHtml
                    })

                    return res.status(200).json({
                        success: true,
                        message: 'Login approved! User will be automatically logged in.',
                        autoLogin: true
                    })
                } else if (request.requestType === 'access_code') {
                    // Send access code email to clinic admin
                    const accessCode = request.clinicId
                    
                    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
        .content { background-color: #f9fafb; padding: 40px; border: 1px solid #e5e7eb; border-radius: 0 0 10px 10px; }
        .success { width: 80px; height: 80px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
        .code-box { background: linear-gradient(135deg, #111827 0%, #1f2937 100%); color: #10b981; padding: 25px; border-radius: 15px; text-align: center; font-size: 36px; font-weight: bold; font-family: monospace; letter-spacing: 10px; margin: 25px 0; box-shadow: 0 10px 30px rgba(0,0,0,0.3); }
        .btn { display: inline-block; padding: 15px 40px; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; text-decoration: none; border-radius: 10px; font-weight: bold; margin: 20px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="success">
                <svg style="width: 48px; height: 48px; color: #10b981;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                </svg>
            </div>
            <h1 style="font-size: 28px; margin: 0;">🔑 Your Access Code</h1>
        </div>
        <div class="content">
            <h2 style="color: #111827; margin-bottom: 15px;">Access Code Approved!</h2>
            <p style="font-size: 16px; color: #6b7280;">Your request for the clinic access code has been approved by the super admin.</p>
            <p style="font-weight: 600; color: #111827; margin-top: 20px;">Clinic: ${request.clinicName}</p>
            <p style="color: #6b7280; margin-bottom: 10px;">Your 6-digit access code is:</p>
            <div class="code-box">${accessCode}</div>
            <div style="text-align: center;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/clinic-login" class="btn">Access Your Clinic</a>
            </div>
            <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin-top: 25px; border-radius: 5px;">
                <p style="margin: 0; color: #92400e;">
                    💡 <strong>Important:</strong> Save this code securely. You'll need it to access your clinic's ERP system.
                </p>
            </div>
        </div>
    </div>
</body>
</html>
                    `

                    await sendEmail({
                        to: request.clinicAdminEmail,
                        subject: '🔑 Your Clinic Access Code - Approved',
                        html: emailHtml
                    })

                    return res.status(200).json({
                        success: true,
                        message: 'Access code sent to the clinic admin.'
                    })
                }
                return res.status(200).json({
                    success: true,
                    message: 'Request approved successfully'
                })
            } else if (action === 'reject') {
                await prisma.clinicAccessRequest.update({
                    where: { id: request.id },
                    data: { status: 'rejected' }
                })

                return res.status(200).json({
                    success: true,
                    message: 'Request rejected successfully'
                })
            } else {
                return res.status(400).json({ error: 'Invalid action' })
            }
        } catch (err: any) {
            return res.status(500).json({ error: String(err?.message || err) })
        }
    } else {
        return res.status(405).json({ error: 'Method not allowed' })
    }
}
