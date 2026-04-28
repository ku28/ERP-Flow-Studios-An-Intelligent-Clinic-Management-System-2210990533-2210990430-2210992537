import type { NextApiRequest, NextApiResponse } from 'next'

type GoogleStartState = {
    clinicId?: string
    from?: 'login' | 'signup'
}

function getBaseUrl(req: NextApiRequest): string {
    if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
    const host = req.headers.host || 'localhost:3000'
    const proto = (req.headers['x-forwarded-proto'] as string) || 'http'
    return `${proto}://${host}`
}

function encodeState(state: GoogleStartState): string {
    return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url')
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    const { clientId, clientSecret } = getGoogleOAuthCredentials()
    if (!clientId || !clientSecret) {
        return res.status(400).json({ error: 'Google OAuth is not configured' })
    }

    const clinicId = typeof req.query.clinicId === 'string' ? req.query.clinicId : undefined
    const from = req.query.from === 'signup' ? 'signup' : 'login'

    const redirectUri = process.env.GOOGLE_AUTH_REDIRECT_URI?.trim() || `${getBaseUrl(req)}/api/auth/google-callback`
    const state = encodeState({ clinicId, from })

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        state,
        prompt: 'select_account',
        access_type: 'offline',
    })

    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
}
