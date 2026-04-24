import { NextApiRequest, NextApiResponse } from 'next'
import { requireAuth } from '../../../lib/auth'
import prisma from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    // Authenticate user
    const user = await requireAuth(req, res)
    if (!user) return
    const clinicId = user.clinicId || user.clinic?.id
    
    // Super admin must be logged into a specific clinic to receive task notifications
    if (user.role === 'super_admin' && !clinicId) {
        return res.status(403).json({ error: 'Super admin must log into a clinic to access task notifications' })
    }
    
    if (!clinicId) {
        return res.status(403).json({ error: 'No clinic association' })
    }

    // Only for receptionists
    const isReceptionist = user.role === 'receptionist'
    if (!isReceptionist) {
        return res.status(403).json({ error: 'Access denied' })
    }

    try {
        if (req.method === 'GET') {
            // Get unacknowledged tasks assigned to this receptionist
            const unacknowledgedTasks = await prisma.task.findMany({
                where: {
                    assignedTo: user.id,
                    status: 'pending',
                    acknowledged: false, // We'll add this field
                    OR: [
                        { doctor: { clinicId } },
                        { assignedByUser: { clinicId } },
                        { assignedToUser: { clinicId } },
                        { visit: { patient: { clinicId } } }
                    ]
                },
                include: {
                    assignedByUser: {
                        select: {
                            id: true,
                            name: true,
                            email: true
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                },
                take: 1 // Get only the latest unacknowledged task
            })

            if (unacknowledgedTasks.length > 0) {
                const task = unacknowledgedTasks[0]
                return res.status(200).json({
                    hasNew: true,
                    task: {
                        id: task.id,
                        title: task.title,
                        description: task.description,
                        assignedBy: task.assignedByUser?.name || task.assignedByUser?.email || 'Unknown',
                        createdAt: task.createdAt
                    }
                })
            }

            return res.status(200).json({ hasNew: false })
        }

        if (req.method === 'POST') {
            // Acknowledge a task
            const { taskId } = req.body

            if (!taskId) {
                return res.status(400).json({ error: 'Task ID required' })
            }

            // Verify task belongs to this user
            const task = await prisma.task.findUnique({
                where: { id: taskId },
                include: {
                    doctor: { select: { clinicId: true } },
                    assignedByUser: { select: { clinicId: true } },
                    assignedToUser: { select: { clinicId: true } },
                    visit: { select: { patient: { select: { clinicId: true } } } }
                }
            })

            const taskClinicId = task?.doctor?.clinicId
                || task?.assignedByUser?.clinicId
                || task?.assignedToUser?.clinicId
                || task?.visit?.patient?.clinicId

            if (!task || task.assignedTo !== user.id || taskClinicId !== clinicId) {
                return res.status(404).json({ error: 'Task not found' })
            }

            // Mark as acknowledged
            await prisma.task.update({
                where: { id: taskId },
                data: { acknowledged: true }
            })

            return res.status(200).json({ success: true, acknowledged: true })
        }
    } catch (error) {
        return res.status(500).json({ error: 'Failed to process task notifications' })
    }
}
