import { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../../lib/auth'
import { getDoctorFilter, getDoctorIdForCreate } from '../../../lib/doctorUtils'
import { sendPushToUser } from '../../../lib/pushNotifications'
import prisma from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        // Verify user is authenticated
        const user = await getSessionUser(req)

        if (!user) {
            return res.status(401).json({ error: 'User not found' })
        }

        const clinicId = user.clinicId || user.clinic?.id
        
        // Super admin must be logged into a specific clinic to access tasks
        if (user.role === 'super_admin' && !clinicId) {
            return res.status(403).json({ error: 'Super admin must log into a clinic to access tasks' })
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
            // Fetch tasks for the logged-in user (if receptionist) or filtered by doctor account
            const isReceptionist = user.role?.toLowerCase() === 'receptionist'
            const doctorFilter = getDoctorFilter(user, null)
            
            const tasks = await prisma.task.findMany({
                where: {
                    AND: [
                        clinicScope,
                        ...(isReceptionist ? [{ assignedTo: user.id }] : []),
                        doctorFilter
                    ]
                },
                include: {
                    assignedByUser: {
                        select: { name: true, email: true }
                    },
                    assignedToUser: {
                        select: { name: true, email: true }
                    }
                },
                orderBy: [
                    { status: 'asc' },
                    { createdAt: 'desc' }
                ]
            })

            const formattedTasks = tasks.map((task: any) => ({
                id: task.id,
                title: task.title,
                description: task.description,
                type: task.type,
                status: task.status,
                assignedTo: task.assignedTo,
                assignedBy: task.assignedBy,
                assignedByName: task.assignedByUser?.name || task.assignedByUser?.email || 'Unknown',
                assignedToName: task.assignedToUser?.name || task.assignedToUser?.email || 'Unknown',
                attachmentUrl: task.attachmentUrl,
                isSuggested: task.isSuggested,
                expiresAt: task.expiresAt?.toISOString(),
                visitId: task.visitId,
                createdAt: task.createdAt.toISOString(),
                completedAt: task.completedAt?.toISOString()
            }))

            return res.status(200).json({ tasks: formattedTasks })
        }

        if (req.method === 'POST') {
            // Only admin/doctor can create tasks
            if (user.role?.toLowerCase() !== 'admin' && user.role?.toLowerCase() !== 'doctor') {
                return res.status(403).json({ error: 'Only admin or doctor can assign tasks' })
            }

            const { title, description, assignedTo, type, attachmentUrl } = req.body

            if (!title || !assignedTo) {
                return res.status(400).json({ error: 'Title and assignedTo are required' })
            }

            // Verify the assignedTo user exists and is a receptionist
            const receptionist = await prisma.user.findUnique({
                where: { id: assignedTo },
                select: {
                    id: true,
                    role: true,
                    clinicId: true
                }
            })

            if (!receptionist || receptionist.role?.toLowerCase() !== 'receptionist' || receptionist.clinicId !== clinicId) {
                return res.status(400).json({ error: 'Invalid receptionist' })
            }

            // Get doctor ID for the task
            const doctorId = getDoctorIdForCreate(user, null)

            const task = await prisma.task.create({
                data: {
                    title,
                    description: description || null,
                    type: type || 'task',
                    assignedTo,
                    assignedBy: user.id,
                    doctorId,
                    attachmentUrl: attachmentUrl || null,
                    status: 'pending'
                },
                include: {
                    assignedByUser: {
                        select: { name: true, email: true }
                    }
                }
            })

            const doctorName = user.name || user.email || 'Doctor'
            const isMessage = (task.type || '').toLowerCase() === 'message'

            const notificationTitle = isMessage
                ? `New Message from Dr. ${doctorName}`
                : 'New Task Assigned'

            const descriptionText = task.description || ''
            const notificationBody = isMessage
                ? (descriptionText || task.title)
                : `${task.title}${descriptionText ? `\n${descriptionText}` : ''}\nAssigned by Dr. ${doctorName}`

            try {
                await sendPushToUser(Number(assignedTo), {
                    title: notificationTitle,
                    body: notificationBody,
                    data: {
                        taskTitle: task.title,
                        description: descriptionText,
                        doctorName,
                        taskId: String(task.id),
                        type: task.type || 'task'
                    }
                })
            } catch (pushError) {
                console.warn('[tasks] Failed to send assignment push:', pushError)
            }

            return res.status(201).json({ 
                task: {
                    ...task,
                    assignedByName: task.assignedByUser?.name || task.assignedByUser?.email || 'Unknown'
                }
            })
        }

        return res.status(405).json({ error: 'Method not allowed' })
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' })
    }
}
