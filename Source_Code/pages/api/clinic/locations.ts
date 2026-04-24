/**
 * Clinic Locations API
 * GET  /api/clinic/locations?clinicId=<clinicPublicId>  - list locations
 * POST /api/clinic/locations                             - add a location (admin/super_admin)
 * DELETE /api/clinic/locations?id=<locationId>          - remove a location (admin/super_admin)
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireAuth } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // ---- GET: list locations ----
    if (req.method === 'GET') {
        const { clinicId } = req.query
        if (!clinicId || typeof clinicId !== 'string') {
            return res.status(400).json({ error: 'clinicId is required' })
        }
        const clinic = await prisma.clinic.findUnique({
            where: { clinicId },
            select: { id: true }
        })
        if (!clinic) return res.status(404).json({ error: 'Clinic not found' })

        const locations = await prisma.clinicLocation.findMany({
            where: { clinicId: clinic.id },
            orderBy: { createdAt: 'asc' }
        })
        return res.status(200).json({ locations })
    }

    // Remaining methods require auth
    const user = await requireAuth(req, res)
    if (!user) return

    const isAuthorized = user.role === 'super_admin' || user.role === 'admin'
    if (!isAuthorized) {
        return res.status(403).json({ error: 'Insufficient permissions' })
    }

    // ---- POST: add location ----
    if (req.method === 'POST') {
        const { clinicId, lat, lng, name, radius } = req.body

        if (!clinicId || lat === undefined || lng === undefined) {
            return res.status(400).json({ error: 'clinicId, lat, and lng are required' })
        }

        // Resolve clinic internal ID
        let clinicInternalId: string
        if (user.role === 'super_admin') {
            const clinic = await prisma.clinic.findUnique({
                where: { clinicId },
                select: { id: true }
            })
            if (!clinic) return res.status(404).json({ error: 'Clinic not found' })
            clinicInternalId = clinic.id
        } else {
            // Admin can only update their own clinic
            if (!user.clinicId) return res.status(403).json({ error: 'No clinic association' })
            const clinic = await prisma.clinic.findUnique({
                where: { id: user.clinicId },
                select: { id: true, clinicId: true }
            })
            if (!clinic || clinic.clinicId !== clinicId) {
                return res.status(403).json({ error: 'Not authorized to modify this clinic' })
            }
            clinicInternalId = clinic.id
        }

        const location = await prisma.clinicLocation.create({
            data: {
                clinicId: clinicInternalId,
                lat: parseFloat(lat),
                lng: parseFloat(lng),
                name: name || null,
                radius: radius ? parseFloat(radius) : 500
            }
        })
        return res.status(201).json({ location })
    }

    // ---- DELETE: remove location ----
    if (req.method === 'DELETE') {
        const { id } = req.query
        if (!id || typeof id !== 'string') {
            return res.status(400).json({ error: 'Location id is required' })
        }

        const location = await prisma.clinicLocation.findUnique({
            where: { id },
            include: { clinic: { select: { clinicId: true } } }
        })
        if (!location) return res.status(404).json({ error: 'Location not found' })

        // Admin can only delete from their own clinic
        if (user.role !== 'super_admin') {
            const userClinic = await prisma.clinic.findUnique({
                where: { id: user.clinicId || '' },
                select: { clinicId: true }
            })
            if (!userClinic || userClinic.clinicId !== location.clinic.clinicId) {
                return res.status(403).json({ error: 'Not authorized to modify this clinic' })
            }
        }

        await prisma.clinicLocation.delete({ where: { id } })
        return res.status(200).json({ success: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
