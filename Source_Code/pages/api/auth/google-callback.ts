import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { createSessionTokenWithOptions, setSessionCookie } from '../../../lib/auth'
import { registerSession } from '../../../lib/sessionManager'
import { getSessionTtlSeconds } from '../../../lib/subscription'

type GoogleStartState = {
    clinicId?: string
    from?: 'login' | 'signup'
}

type GoogleTokenResponse = {
    access_token: string
    expires_in: number
    id_token?: string
}

type GoogleProfileResponse = {
    email?: string
    email_verified?: boolean
    name?: string
    picture?: string
    sub?: string
}

function getBaseUrl(req: NextApiRequest): string {
    if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
    const host = req.headers.host || 'localhost:3000'
    const proto = (req.headers['x-forwarded-proto'] as string) || 'http'
    return `${proto}://${host}`
}

function decodeState(rawState: string | undefined): GoogleStartState {
    if (!rawState) return {}
    try {
        const parsed = JSON.parse(Buffer.from(rawState, 'base64url').toString('utf8'))
        return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
        return {}
    }
}

function getGoogleOAuthCredentials() {
    const clientId =
        process.env.GOOGLE_AUTH_CLIENT_ID?.trim() ||
        process.env.GOOGLE_GMAIL_CLIENT_ID?.trim() ||
        process.env.GOOGLE_CLIENT_ID?.trim() ||
        ''

    const clientSecret =
        process.env.GOOGLE_AUTH_CLIENT_SECRET?.trim() ||
        process.env.GOOGLE_GMAIL_CLIENT_SECRET?.trim() ||
        process.env.GOOGLE_CLIENT_SECRET?.trim() ||
        ''

    return { clientId, clientSecret }
}

function buildAuthErrorRedirect(req: NextApiRequest, from: 'login' | 'signup', clinicId?: string, reason?: string) {
    const params = new URLSearchParams()
    if (clinicId) params.set('clinicId', clinicId)
    if (reason) params.set('google', reason)
    const query = params.toString()
    const path = from === 'signup' ? '/signup' : '/login'
    return `${getBaseUrl(req)}${path}${query ? `?${query}` : ''}`
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    const code = typeof req.query.code === 'string' ? req.query.code : undefined
    const error = typeof req.query.error === 'string' ? req.query.error : undefined
    const errorDescription = typeof req.query.error_description === 'string' ? req.query.error_description : ''
    const rawState = typeof req.query.state === 'string' ? req.query.state : undefined
    const state = decodeState(rawState)
    const from = state.from === 'signup' ? 'signup' : 'login'
    const clinicPublicId = state.clinicId

    if (error || !code) {
        const normalized = `${error} ${errorDescription}`.toLowerCase()
        const reason = normalized.includes('deleted_client') ? 'deleted_client' : 'failed'
        return res.redirect(buildAuthErrorRedirect(req, from, clinicPublicId, reason))
    }

    try {
        const { clientId, clientSecret } = getGoogleOAuthCredentials()
        if (!clientId || !clientSecret) {
            return res.redirect(buildAuthErrorRedirect(req, from, clinicPublicId, 'not_configured'))
        }

        const redirectUri = process.env.GOOGLE_AUTH_REDIRECT_URI?.trim() || `${getBaseUrl(req)}/api/auth/google-callback`

        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
            }),
        })

        const tokenData = await tokenRes.json() as GoogleTokenResponse
        if (!tokenRes.ok || !tokenData.access_token) {
            return res.redirect(buildAuthErrorRedirect(req, from, clinicPublicId, 'token_failed'))
        }

        const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
            headers: {
                Authorization: `Bearer ${tokenData.access_token}`,
            },
        })
        const profile = await profileRes.json() as GoogleProfileResponse

        const email = String(profile.email || '').trim().toLowerCase()
        if (!profileRes.ok || !email || profile.email_verified === false) {
            return res.redirect(buildAuthErrorRedirect(req, from, clinicPublicId, 'email_unverified'))
        }

        let clinicRecord: { id: string; clinicId: string; name: string } | null = null
        if (clinicPublicId) {
            clinicRecord = await prisma.clinic.findUnique({
                where: { clinicId: clinicPublicId },
                select: { id: true, clinicId: true, name: true },
            })

            if (!clinicRecord) {
                return res.redirect(buildAuthErrorRedirect(req, from, clinicPublicId, 'invalid_clinic'))
            }
        }

        const matchingUsers = await prisma.user.findMany({
            where: { email },
            include: { clinic: true },
            orderBy: { id: 'asc' },
        })

        if (matchingUsers.length === 0) {
            return res.redirect(buildAuthErrorRedirect(req, from, clinicPublicId, 'no_account'))
        }

        let selectedUser = matchingUsers[0]

        if (clinicRecord) {
            const exactClinicUser = matchingUsers.find((u : { clinicId: string | null }) => u.clinicId === clinicRecord?.id)
            const noClinicUser = matchingUsers.find((u : { clinicId: string | null }) => !u.clinicId)

            if (exactClinicUser) {
                selectedUser = exactClinicUser
            } else if (noClinicUser) {
                selectedUser = noClinicUser
            } else {
                return res.redirect(buildAuthErrorRedirect(req, from, clinicPublicId, 'clinic_mismatch'))
            }
        }

        if (!selectedUser.clinicId && clinicRecord) {
            selectedUser = await prisma.user.update({
                where: { id: selectedUser.id },
                data: { clinicId: clinicRecord.id },
                include: { clinic: true },
            })
        }

        selectedUser = await prisma.user.update({
            where: { id: selectedUser.id },
            data: {
                verified: true,
                name: selectedUser.name || profile.name || undefined,
                profileImage: selectedUser.profileImage || profile.picture || undefined,
            },
            include: { clinic: true },
        })

        const sessionTtlSeconds = getSessionTtlSeconds(selectedUser.clinic?.subscriptionPlan)
        const token = createSessionTokenWithOptions({ sub: selectedUser.id }, { expiresInSeconds: sessionTtlSeconds })
        setSessionCookie(res, token, sessionTtlSeconds)

        await registerSession({
            userId: selectedUser.id,
            clinicInternalId: selectedUser.clinicId || null,
            sessionToken: token,
            ipAddress: req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || null,
            userAgent: req.headers['user-agent'] || null,
            location: null,
        })

        const redirectPath = selectedUser.role?.toLowerCase() === 'receptionist' ? '/patients' : '/dashboard'
        return res.redirect(`${getBaseUrl(req)}${redirectPath}`)
    } catch {
        return res.redirect(buildAuthErrorRedirect(req, from, clinicPublicId, 'server_error'))
    }
}
