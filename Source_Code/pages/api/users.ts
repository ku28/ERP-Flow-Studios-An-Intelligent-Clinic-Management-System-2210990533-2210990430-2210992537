import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { requireAdmin, requireAuth, getClinicIdFromUser } from '../../lib/auth'
import { canAssignRoleForBasicPlan, isBasicPlan } from '../../lib/subscription'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        const user = await requireAuth(req, res)
        if (!user) return
        
        try {
            // Filter users by clinic for multi-tenant isolation
            const clinicId = getClinicIdFromUser(user)
            const whereClause: any = {}
            
            if (clinicId) {
                whereClause.clinicId = clinicId
            }
            
            const items = await prisma.user.findMany({ 
                where: whereClause,
                orderBy: { createdAt: 'desc' } 
            })
            return res.status(200).json(items)
        } catch (err: any) {
            if (err?.code === 'P2021' || err?.code === 'P2022') return res.status(200).json([])
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    // User management restricted to admins only for POST/PUT
    const user = await requireAdmin(req, res)
    if (!user) return

    if (req.method === 'POST') {
        const { email, name, role } = req.body
        try {
            // Get admin's clinicId to assign to new user
            const adminClinicId = user.clinicId
            const clinic = await prisma.clinic.findUnique({ where: { id: adminClinicId || '' }, select: { subscriptionPlan: true } })

            if (isBasicPlan(clinic?.subscriptionPlan)) {
                const clinicUsers = await prisma.user.findMany({ where: { clinicId: adminClinicId }, select: { id: true, role: true } })
                const limitCheck = canAssignRoleForBasicPlan(role, clinicUsers)
                if (!limitCheck.allowed) {
                    return res.status(400).json({ error: limitCheck.reason || 'Basic plan user limit exceeded' })
                }
            }
            
            const u = await prisma.user.upsert({ 
                where: { email }, 
                update: { name, role, clinicId: adminClinicId }, 
                create: { email, name, role, clinicId: adminClinicId } 
            })
            return res.status(201).json(u)
        } catch (err: any) {
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    if (req.method === 'PUT') {
        const authUser = await requireAuth(req, res)
        if (!authUser) return
        if (authUser.role !== 'admin') return res.status(403).json({ error: 'Admin required' })
        const { id, role } = req.body
        try {
            // CRITICAL: Verify user belongs to admin's clinic before updating
            const clinicId = getClinicIdFromUser(authUser)
            const targetUser = await prisma.user.findFirst({
                where: { id: Number(id), clinicId }
            })
            if (!targetUser) {
                return res.status(404).json({ error: 'User not found or access denied' })
            }

            const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { subscriptionPlan: true } })
            if (isBasicPlan(clinic?.subscriptionPlan)) {
                const clinicUsers = await prisma.user.findMany({ where: { clinicId }, select: { id: true, role: true } })
                const limitCheck = canAssignRoleForBasicPlan(role, clinicUsers, Number(id))
                if (!limitCheck.allowed) {
                    return res.status(400).json({ error: limitCheck.reason || 'Basic plan user limit exceeded' })
                }
            }
            
            const u = await prisma.user.update({ where: { id: Number(id) }, data: { role } })
            return res.status(200).json(u)
        } catch (err: any) {
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
