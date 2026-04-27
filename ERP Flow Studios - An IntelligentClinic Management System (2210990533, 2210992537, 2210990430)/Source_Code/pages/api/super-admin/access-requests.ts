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

        const { status } = req.query

        // Fetch access requests with optional status filter
        const where = status && status !== 'all' ? { status: status as string } : {}
        
        const accessRequests = await prisma.clinicAccessRequest.findMany({
            where,
            orderBy: {
                createdAt: 'desc'
            }
        })

        // Manually fetch clinic details for each request
        const requestsWithClinic = await Promise.all(
            accessRequests.map(async (request : any) => {
                const clinic = await prisma.clinic.findUnique({
                    where: { clinicId: request.clinicId },
                    select: { name: true, clinicId: true }
                })
                
                return {
                    ...request,
                    clinic: clinic || { name: request.clinicName || 'Unknown', clinicId: request.clinicId }
                }
            })
        )

        return res.status(200).json({ requests: requestsWithClinic })

    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to fetch access requests' })
    }
}
