import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { getSessionUser } from '../../../lib/auth'
import { getDoctorFilter } from '../../../lib/doctorUtils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await getSessionUser(req)
    if (!user) {
        return res.status(401).json({ error: 'Not authenticated' })
    }
    const clinicId = user.clinicId || user.clinic?.id
    
    // Super admin must be logged into a specific clinic to access suggested tasks
    if (user.role === 'super_admin' && !clinicId) {
        return res.status(403).json({ error: 'Super admin must log into a clinic to access suggested tasks' })
    }
    
    if (!clinicId) {
        return res.status(403).json({ error: 'No clinic association' })
    }

    const clinicScope = {
        OR: [
            { doctor: { clinicId } },
            { assignedByUser: { clinicId } },
            { assignedToUser: { clinicId } },
            { visit: { patient: { clinicId } } }
        ]
    }

    if (req.method === 'GET') {
        try {
            // Fetch suggested tasks that haven't expired yet, filtered by doctor
            const now = new Date()
            const doctorFilter = getDoctorFilter(user, null)
            const tasks = await prisma.task.findMany({
                where: {
                    AND: [
                        clinicScope,
                        doctorFilter,
                        { isSuggested: true },
                        {
                            OR: [
                                { expiresAt: null },
                                { expiresAt: { gte: now } }
                            ]
                        },
                        { assignedTo: null } // Not yet assigned
                    ]
                },
                include: {
                    visit: {
                        include: {
                            patient: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true,
                                    phone: true
                                }
                            }
                        }
                    }
                },
                orderBy: { createdAt: 'desc' }
            })

            return res.status(200).json({ tasks })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch suggested tasks' })
        }
    }

    if (req.method === 'PATCH') {
        try {
            const { id, expiresAt } = req.body

            if (!id) {
                return res.status(400).json({ error: 'Task ID is required' })
            }

            const existingTask = await prisma.task.findFirst({
                where: {
                    id: Number(id),
                    ...clinicScope
                },
                select: { id: true }
            })

            if (!existingTask) {
                return res.status(404).json({ error: 'Task not found or access denied' })
            }

            // Update expiry time
            const task = await prisma.task.update({
                where: { id: Number(id) },
                data: {
                    expiresAt: expiresAt ? new Date(expiresAt) : null
                }
            })

            return res.status(200).json({ task })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to update task expiry' })
        }
    }

    if (req.method === 'DELETE') {
        try {
            const { id } = req.body

            if (!id) {
                return res.status(400).json({ error: 'Task ID is required' })
            }

            // Delete suggested task
            const deletedTask = await prisma.task.deleteMany({
                where: { 
                    id: Number(id),
                    isSuggested: true, // Only allow deleting suggested tasks
                    ...clinicScope
                }
            })

            if (deletedTask.count === 0) {
                return res.status(404).json({ error: 'Task not found or already deleted' })
            }

            return res.status(200).json({ success: true })
        } catch (error: any) {
            if (error.code === 'P2025') {
                return res.status(404).json({ error: 'Task not found' })
            }
            return res.status(500).json({ error: 'Failed to delete suggested task' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
