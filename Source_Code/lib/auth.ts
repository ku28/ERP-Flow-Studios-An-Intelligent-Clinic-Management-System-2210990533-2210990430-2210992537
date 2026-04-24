import crypto from 'crypto'
import { NextApiRequest, NextApiResponse } from 'next'
import prisma from './prisma'

const SECRET = process.env.SESSION_SECRET || 'dev_secret_change_me'

function base64url(input: Buffer) {
    return input.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function sign(payload: string) {
    return crypto.createHmac('sha256', SECRET).update(payload).digest('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

export function createSessionToken(data: Record<string, any>) {
    return createSessionTokenWithOptions(data)
}

export function createSessionTokenWithOptions(data: Record<string, any>, options?: { expiresInSeconds?: number }) {
    const nowSeconds = Math.floor(Date.now() / 1000)
    const header = base64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })))
    const payloadData: Record<string, any> = { ...data, iat: nowSeconds }
    if (options?.expiresInSeconds) {
        payloadData.exp = nowSeconds + options.expiresInSeconds
    }
    const payload = base64url(Buffer.from(JSON.stringify(payloadData)))
    const signature = sign(`${header}.${payload}`)
    return `${header}.${payload}.${signature}`
}

export function verifySessionToken(token: string) {
    try {
        const parts = token.split('.')
        if (parts.length !== 3) return null
        const [header, payload, signature] = parts
        const expected = sign(`${header}.${payload}`)
            // timing-safe string compare
            if (expected.length !== signature.length) return null
            let diff = 0
            for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i)
            if (diff !== 0) return null
        const data = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
        if (data?.exp && Number(data.exp) < Math.floor(Date.now() / 1000)) {
            return null
        }
        return data
    } catch (e) { return null }
}

export function setSessionCookie(res: NextApiResponse, token: string, maxAgeSeconds?: number) {
    // Default to 30 days for non-Basic plans
    const maxAge = maxAgeSeconds || 30 * 24 * 60 * 60
    const cookie = `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}` + (process.env.NODE_ENV === 'production' ? '; Secure' : '')
    res.setHeader('Set-Cookie', cookie)
}

export function clearSessionCookie(res: NextApiResponse) {
    res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0')
}

export async function requireAuth(req: NextApiRequest, res: NextApiResponse) {
    const raw = req.headers.cookie || ''
    const match = raw.split(';').map(s => s.trim()).find(s => s.startsWith('session='))
    if (!match) { res.status(401).json({ error: 'Not authenticated' }); return null }
    const token = match.split('=')[1]
    const data = verifySessionToken(token)
    if (!data) { res.status(401).json({ error: 'Invalid session' }); return null }
    // Fetch only the fields needed for auth & tenancy checks.
    // The full Clinic object (58 cols incl. SMTP creds, OAuth tokens) is NOT
    // needed on every API call — only /api/auth/me uses getSessionUser for that.
    const user = await prisma.user.findUnique({ 
        where: { id: Number(data.sub) },
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            lastSeenVersion: true,
            clinicId: true,
            clinic: {
                select: {
                    id: true,
                    clinicId: true,
                    name: true,
                    subscriptionPlan: true,
                }
            }
        }
    }).catch(() => null)
    if (!user) { res.status(401).json({ error: 'User not found' }); return null }
    
    // Verify clinic association (except for super_admin)
    if (user.role !== 'super_admin' && !user.clinicId) {
        res.status(403).json({ error: 'Access denied. You must be associated with a clinic to access this resource.' })
        return null
    }
    
    return user
}

export async function getSessionUser(req: NextApiRequest) {
    const raw = req.headers.cookie || ''
    const match = raw.split(';').map(s => s.trim()).find(s => s.startsWith('session='))
    if (!match) return null
    const token = match.split('=')[1]
    const data = verifySessionToken(token)
    if (!data) return null
    const user = await prisma.user.findUnique({ 
        where: { id: Number(data.sub) },
        include: {
            clinic: true
        }
    }).catch(() => null)
    return user
}

// Role-based authorization helpers
export function isAdmin(user: any): boolean {
    return user?.role === 'admin'
}

export function isDoctor(user: any): boolean {
    return user?.role === 'doctor' || user?.role === 'admin'
}

export function isStaff(user: any): boolean {
    return user?.role === 'staff' || user?.role === 'admin' || user?.role === 'doctor'
}

export function isReception(user: any): boolean {
    return user?.role === 'reception'
}

export async function requireRole(req: NextApiRequest, res: NextApiResponse, allowedRoles: string[]) {
    const user = await requireAuth(req, res)
    if (!user) return null
    
    if (!allowedRoles.includes(user.role)) {
        res.status(403).json({ error: 'Access denied. Insufficient permissions.' })
        return null
    }
    
    return user
}

// Specific role requirements
export async function requireAdmin(req: NextApiRequest, res: NextApiResponse) {
    return requireRole(req, res, ['admin'])
}

export async function requireDoctorOrAdmin(req: NextApiRequest, res: NextApiResponse) {
    return requireRole(req, res, ['admin', 'doctor'])
}

export async function requireStaffOrAbove(req: NextApiRequest, res: NextApiResponse) {
    return requireRole(req, res, ['admin', 'doctor', 'staff'])
}

// Get clinicId from user object
export function getClinicIdFromUser(user: any): string {
    if (!user) {
        throw new Error('User is required')
    }
    
    // Super admin can bypass clinic filtering
    if (user.role === 'super_admin') {
        return '' // Empty string indicates no filtering needed
    }
    
    // Get clinicId from user
    const clinicId = user.clinicId || user.clinic?.id
    
    if (!clinicId) {
        throw new Error('User must be associated with a clinic')
    }
    
    return clinicId
}

// Get clinic filter for Prisma queries (for models with clinicId field)
export function getClinicFilter(user: any): { clinicId: string } | {} {
    if (user?.role === 'super_admin') {
        return {} // No filter for super admin
    }
    
    const clinicId = user?.clinicId || user?.clinic?.id
    if (!clinicId) {
        throw new Error('User must be associated with a clinic')
    }
    
    return { clinicId }
}
