/**
 * Gmail OAuth2 helpers.
 * Uses GOOGLE_GMAIL_CLIENT_ID and GOOGLE_GMAIL_CLIENT_SECRET from env.
 */

const SCOPES = ['https://mail.google.com/', 'email', 'profile']

function getGmailRedirectUri(): string {
    const explicitRedirect = process.env.GOOGLE_GMAIL_REDIRECT_URI?.trim()
    if (explicitRedirect) return explicitRedirect

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').trim()
    const baseUrl = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl
    return `${baseUrl}/api/clinic/gmail-callback`
}

export function getGmailAuthUrl(clinicId: string): string {
    const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID
    if (!clientId) throw new Error('GOOGLE_GMAIL_CLIENT_ID is not configured')

    const redirectUri = getGmailRedirectUri()

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        state: clinicId,
    })

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export async function exchangeGmailCode(code: string): Promise<{
    access_token: string
    refresh_token: string
    expiry_date: number
    email: string
}> {
    const redirectUri = getGmailRedirectUri()

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_GMAIL_CLIENT_ID || '',
            client_secret: process.env.GOOGLE_GMAIL_CLIENT_SECRET || '',
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        }),
    })

    if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({}))
        throw new Error(err.error_description || err.error || 'Token exchange failed')
    }

    const tokens: any = await tokenRes.json()

    // Fetch the user's email address
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    const profile: any = profileRes.ok ? await profileRes.json() : {}

    return {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: Date.now() + (tokens.expires_in || 3600) * 1000,
        email: profile.email || '',
    }
}

export async function refreshGmailToken(refreshToken: string): Promise<{
    access_token: string
    expiry_date: number
}> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            client_id: process.env.GOOGLE_GMAIL_CLIENT_ID || '',
            client_secret: process.env.GOOGLE_GMAIL_CLIENT_SECRET || '',
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
        }),
    })

    if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error_description || err.error || 'Token refresh failed')
    }

    const data: any = await res.json()
    return {
        access_token: data.access_token,
        expiry_date: Date.now() + (data.expires_in || 3600) * 1000,
    }
}
