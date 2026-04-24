import { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../../../lib/auth'
import prisma from '../../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { receptionistId } = req.query
        const recepId = parseInt(receptionistId as string)

        if (isNaN(recepId)) {
            return res.status(400).json({ error: 'Invalid receptionist ID' })
        }

        // Verify user is authenticated
        const user = await getSessionUser(req)

        if (!user) {
            return res.status(401).json({ error: 'User not found' })
        }
        const clinicId = user.clinicId || user.clinic?.id
        
        // Super admin must be logged into a specific clinic to view receptionist tasks
        if (user.role === 'super_admin' && !clinicId) {
            return res.status(403).json({ error: 'Super admin must log into a clinic to access receptionist tasks' })
        }
        
        if (!clinicId) {
            return res.status(403).json({ error: 'No clinic association' })
        }

        // Only admin/doctor can view other receptionist's tasks
        if (user.role?.toLowerCase() !== 'admin' && user.role?.toLowerCase() !== 'doctor') {
            return res.status(403).json({ error: 'Forbidden' })
        }

        // Verify receptionist belongs to same clinic
        const receptionist = await prisma.user.findFirst({
            where: {
                id: recepId,
                clinicId,
                OR: [{ role: 'receptionist' }, { role: 'Receptionist' }]
            },
            select: { id: true }
        })

        if (!receptionist) {
            return res.status(404).json({ error: 'Receptionist not found or access denied' })
        }

        // Fetch tasks for the specified receptionist
        const tasks = await prisma.task.findMany({
            where: {
                assignedTo: recepId,
                OR: [
                    { doctor: { clinicId } },
                    { assignedByUser: { clinicId } },
                    { assignedToUser: { clinicId } },
                    { visit: { patient: { clinicId } } }
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
    } catch (error) {
        return res.status(500).json({ error: 'Internal server error' })
    }
}
