/**
 * Audit Log Utilities
 * Handles writing audit log entries with IP geolocation and anomaly detection
 */
import prisma from './prisma'

// ----- IP Geolocation via ip-api.com (free, no key needed) -----
export async function getLocationFromIP(ip: string): Promise<string | null> {
    // Skip for local/private IPs
    if (
        !ip ||
        ip === '127.0.0.1' ||
        ip === '::1' ||
        ip.startsWith('192.168.') ||
        ip.startsWith('10.') ||
        ip.startsWith('172.16.') ||
        ip === 'unknown'
    ) {
        return 'Local Network'
    }

    try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 2000)
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,regionName,country,lat,lon`, {
            signal: controller.signal
        })
        clearTimeout(timeout)
        if (!res.ok) return null
        const data = await res.json()
        if (data.status === 'success') {
            return `${data.city}, ${data.regionName}, ${data.country}`
        }
        return null
    } catch {
        return null
    }
}

// Extract real IP from request headers (handles proxies/load-balancers)
export function extractIP(req: any): string {
    const forwarded = req.headers['x-forwarded-for']
    if (forwarded) {
        const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded
        return ips.split(',')[0].trim()
    }
    return (
        req.headers['x-real-ip'] ||
        req.socket?.remoteAddress ||
        req.connection?.remoteAddress ||
        'unknown'
    )
}

// ----- Severity / Anomaly Detection -----
/**
 * Computes severity based on the context of the action.
 */
export function computeSeverity(params: {
    action: string
    category: string
    userRole: string
    details?: any
    ipAddress?: string | null
}): 'ok' | 'warning' | 'critical' {
    const { action, category, details, userRole } = params
    const lowerAction = action.toLowerCase()

    // Critical severity conditions
    if (
        lowerAction.includes('failed login') ||
        lowerAction.includes('multiple failed') ||
        lowerAction.includes('brute force') ||
        lowerAction.includes('session limit exceeded') ||
        lowerAction.includes('geo-blocked') ||
        lowerAction.includes('unauthorized') ||
        lowerAction.includes('suspicious') ||
        (lowerAction.includes('delete') && (userRole === 'staff' || userRole === 'receptionist')) ||
        lowerAction.includes('account deleted') ||
        details?.failedAttempts >= 5 ||
        details?.sessionLimitExceeded === true ||
        details?.geoBlocked === true ||
        details?.outsideHours === true && details?.failedAttempts >= 2
    ) {
        return 'critical'
    }

    // Warning / could be anomaly conditions
    if (
        lowerAction.includes('logout') && details?.forced === true ||
        lowerAction.includes('new ip') ||
        lowerAction.includes('different location') ||
        lowerAction.includes('outside hours') ||
        lowerAction.includes('session evicted') ||
        lowerAction.includes('first login') && category === 'authentication' ||
        lowerAction.includes('password changed') ||
        lowerAction.includes('role changed') ||
        lowerAction.includes('access code changed') ||
        lowerAction.includes('outside business hours') ||
        details?.newIp === true ||
        details?.forcedLogout === true ||
        details?.outsideHours === true ||
        details?.firstLoginFromIP === true ||
        details?.sessionEvicted === true ||
        details?.failedAttempts >= 1
    ) {
        return 'warning'
    }

    return 'ok'
}

interface WriteAuditLogParams {
    action: string
    category: string
    userId: number
    userName: string
    userRole: string
    clinicId?: string | null
    clinicName?: string | null
    details?: any
    req?: any // NextApiRequest for IP extraction
    ipAddress?: string
    userAgent?: string
    severity?: 'ok' | 'warning' | 'critical'
    locationLat?: number | null
    locationLng?: number | null
}

export async function writeAuditLog(params: WriteAuditLogParams) {
    try {
        const ip = params.ipAddress || (params.req ? extractIP(params.req) : null)
        const userAgent =
            params.userAgent || params.req?.headers?.['user-agent'] || null

        // Get location from IP (non-blocking, best-effort)
        let location: string | null = null
        if (ip) {
            location = await getLocationFromIP(ip).catch(() => null)
        }

        const severity =
            params.severity ||
            computeSeverity({
                action: params.action,
                category: params.category,
                userRole: params.userRole,
                details: params.details,
                ipAddress: ip,
            })

        await prisma.auditLog.create({
            data: {
                action: params.action,
                category: params.category,
                severity,
                userId: params.userId,
                userName: params.userName,
                userRole: params.userRole,
                clinicId: params.clinicId || null,
                clinicName: params.clinicName || null,
                details: params.details || null,
                ipAddress: ip || null,
                userAgent: userAgent || null,
                location,
                locationLat: params.locationLat || null,
                locationLng: params.locationLng || null,
            }
        })
    } catch (err) {
        // Audit log write should never crash the main flow
        console.error('[AuditLog] Failed to write audit log:', err)
    }
}
