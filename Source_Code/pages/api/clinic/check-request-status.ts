import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { token } = req.query

        if (!token || typeof token !== 'string') {
            return res.status(400).json({ error: 'Invalid token' })
        }

        // Find the request by approval token
        const request = await prisma.clinicAccessRequest.findUnique({
            where: { approvalToken: token }
        })

        if (!request) {
            return res.status(404).json({ error: 'Request not found' })
        }

        // Check if token has expired
        if (request.expiresAt && request.expiresAt < new Date()) {
            return res.status(410).json({ 
                status: 'expired',
                message: 'This request has expired. Please submit a new request.' 
            })
        }

        // For approved login requests, return the login token
        if (request.status === 'approved' && request.requestType === 'login_request') {
            const loginToken = request.userEmail // We stored the login token here temporarily
            const tokenExpiry = request.approvedAt // Token expiry stored here

            // Check if login token has expired
            if (tokenExpiry && tokenExpiry < new Date()) {
                return res.status(410).json({
                    status: 'expired',
                    message: 'Login token has expired. Please contact your administrator.'
                })
            }

            return res.status(200).json({
                status: 'approved',
                requestType: 'login_request',
                loginToken: loginToken,
                clinicId: request.clinicId
            })
        }

        // For access code requests, just return status
        if (request.status === 'approved' && request.requestType === 'access_code') {
            return res.status(200).json({
                status: 'approved',
                requestType: 'access_code',
                message: 'Access code has been sent to your email.'
            })
        }

        // For rejected requests
        if (request.status === 'rejected') {
            return res.status(200).json({
                status: 'rejected',
                message: 'Your request has been rejected. Please contact the clinic administrator.'
            })
        }

        // Still pending
        return res.status(200).json({
            status: 'pending',
            requestType: request.requestType,
            message: 'Your request is still pending approval.'
        })

    } catch (error) {
        return res.status(500).json({ error: 'Failed to check request status' })
    }
}
