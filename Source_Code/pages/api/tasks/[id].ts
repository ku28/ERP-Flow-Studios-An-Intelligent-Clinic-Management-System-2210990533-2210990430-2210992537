import { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser, getClinicIdFromUser } from '../../../lib/auth'
import { sendPushToUser } from '../../../lib/pushNotifications'
import prisma from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'PATCH') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { id } = req.query
        const taskId = parseInt(id as string)

        if (isNaN(taskId)) {
            return res.status(400).json({ error: 'Invalid task ID' })
        }

        // Verify user is authenticated
        const user = await getSessionUser(req)

        if (!user) {
            return res.status(401).json({ error: 'User not found' })
        }

        const userClinicId = getClinicIdFromUser(user)
        
        // Super admin must be logged into a specific clinic to update tasks
        if (user.role === 'super_admin' && !userClinicId) {
            return res.status(403).json({ error: 'Super admin must log into a clinic to update tasks' })
        }
        
        if (!userClinicId) {
            return res.status(403).json({ error: 'No clinic association' })
        }

        // Fetch the task with related users to verify clinic isolation
        const task = await prisma.task.findUnique({
            where: { id: taskId },
            include: {
                doctor: { select: { id: true, clinicId: true } },
                assignedByUser: { select: { id: true, clinicId: true } },
                assignedToUser: { select: { id: true, clinicId: true } },
                visit: {
                    select: {
                        patient: { select: { clinicId: true } }
                    }
                }
            }
        })

        if (!task) {
            return res.status(404).json({ error: 'Task not found' })
        }

        // Verify task belongs to user's clinic through any of its relationships
        const taskClinicId = task.doctor?.clinicId 
            || task.assignedByUser?.clinicId 
            || task.assignedToUser?.clinicId
            || task.visit?.patient?.clinicId

        if (!taskClinicId || taskClinicId !== userClinicId) {
            return res.status(404).json({ error: 'Task not found or access denied' })
        }

        // Only the assigned receptionist or the admin/doctor who assigned it can update
        const isAssignedTo = task.assignedTo === user.id
        const isAssignedBy = task.assignedBy === user.id
        const isAdmin = user.role?.toLowerCase() === 'admin'
        const isDoctor = user.role?.toLowerCase() === 'doctor'

        if (!isAssignedTo && !isAssignedBy && !isAdmin && !isDoctor) {
            return res.status(403).json({ error: 'Forbidden' })
        }

        const { status } = req.body

        if (status && !['pending', 'completed'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' })
        }

        const updatedTask = await prisma.task.update({
            where: { id: taskId },
            data: {
                status,
                completedAt: status === 'completed' ? new Date() : null
            },
            include: {
                assignedByUser: {
                    select: { name: true, email: true }
                },
                assignedToUser: {
                    select: { name: true, email: true }
                }
            }
        })

        const movedToCompleted = task.status !== 'completed' && updatedTask.status === 'completed'
        if (movedToCompleted && updatedTask.assignedBy) {
            const completionDate = updatedTask.completedAt || new Date()
            const completionTime = completionDate.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit'
            })

            const doctorName = updatedTask.assignedByUser?.name || updatedTask.assignedByUser?.email || 'Doctor'

            try {
                await sendPushToUser(updatedTask.assignedBy, {
                    title: 'Task Completed',
                    body: `"${updatedTask.title}" completed at ${completionTime}`,
                    data: {
                        taskTitle: updatedTask.title,
                        description: updatedTask.description || '',
                        doctorName,
                        completionTime,
                        taskId: String(updatedTask.id)
                    }
                })
            } catch (pushError) {
                console.warn('[tasks] Failed to send completion push:', pushError)
            }
        }

        return res.status(200).json({ 
            task: {
                ...updatedTask,
                assignedByName: updatedTask.assignedByUser?.name || updatedTask.assignedByUser?.email || 'Unknown',
                assignedToName: updatedTask.assignedToUser?.name || updatedTask.assignedToUser?.email || 'Unknown'
            }
        })
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' })
    }
}
