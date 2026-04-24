import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { verifySessionToken } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        // Verify user is super admin
        const token = req.cookies.session
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' })
        }

        const decoded = verifySessionToken(token)
        const user = await prisma.user.findUnique({
            where: { id: decoded.sub }
        })

        if (!user || user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' })
        }

        // Auto-delete audit logs older than 48 hours
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000)
        await prisma.auditLog.deleteMany({
            where: { timestamp: { lt: cutoff } }
        })

        const { category, search, dateFrom, dateTo, severity } = req.query

        // Build where clause
        const where: any = {}

        if (category && category !== 'all') {
            where.category = category as string
        }

        if (severity && severity !== 'all') {
            where.severity = severity as string
        }

        if (search) {
            where.OR = [
                { userName: { contains: search as string, mode: 'insensitive' } },
                { action: { contains: search as string, mode: 'insensitive' } },
                { clinicName: { contains: search as string, mode: 'insensitive' } },
                { location: { contains: search as string, mode: 'insensitive' } }
            ]
        }

        if (dateFrom || dateTo) {
            where.timestamp = {}
            if (dateFrom) {
                where.timestamp.gte = new Date(dateFrom as string)
            }
            if (dateTo) {
                // Add one day to include the entire end date
                const endDate = new Date(dateTo as string)
                endDate.setDate(endDate.getDate() + 1)
                where.timestamp.lt = endDate
            }
        }

        // Fetch audit logs
        const logs = await prisma.auditLog.findMany({
            where,
            orderBy: {
                timestamp: 'desc'
            },
            take: 500 // Limit to most recent 500 logs
        })

        return res.status(200).json({ logs })

    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to fetch audit logs' })
    }
}
