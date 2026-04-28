import { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { requireAuth, getClinicIdFromUser } from '../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // CRITICAL: Add authentication for multi-tenant isolation
    const user = await requireAuth(req, res)
    if (!user) return
    
    const { method } = req

    try {
        if (method === 'GET') {
            const { date } = req.query
            
            // Get clinic filter
            const clinicId = getClinicIdFromUser(user)
            
            // Super admin must be logged into a specific clinic to access tokens
            if (user.role === 'super_admin' && !clinicId) {
                return res.status(403).json({ error: 'Super admin must log into a clinic to access tokens' })
            }
            
            let where: any = {}
            
            // Filter tokens by clinic through patient relationship
            if (clinicId) {
                where.patient = { clinicId }
            } else {
                // No clinic context - return empty array
                return res.status(200).json([])
            }
            
            // Filter by date if provided
            if (date && typeof date === 'string') {
                const startOfDay = new Date(date)
                startOfDay.setHours(0, 0, 0, 0)
                
                const endOfDay = new Date(date)
                endOfDay.setHours(23, 59, 59, 999)
                
                where.date = {
                    gte: startOfDay,
                    lte: endOfDay
                }
            }

            const tokens = await prisma.token.findMany({
                where,
                include: {
                    patient: true
                },
                orderBy: {
                    tokenNumber: 'asc'
                }
            })

            return res.status(200).json(tokens)
        }

        if (method === 'POST') {
            const { patientId, tokenNumber, status, date } = req.body

            // Validate required fields
            if (!patientId || !tokenNumber || !date) {
                return res.status(400).json({ error: 'Patient ID, token number, and date are required' })
            }

            // Verify patient belongs to user's clinic
            const clinicId = getClinicIdFromUser(user)
            
            // Super admin must be logged into a specific clinic to create tokens
            if (user.role === 'super_admin' && !clinicId) {
                return res.status(403).json({ error: 'Super admin must log into a clinic to create tokens' })
            }
            
            if (!clinicId) {
                return res.status(403).json({ error: 'No clinic association' })
            }
            const patient = await prisma.patient.findFirst({
                where: { 
                    id: Number(patientId),
                    ...(clinicId ? { clinicId } : {})
                }
            })

            if (!patient) {
                return res.status(404).json({ error: 'Patient not found or access denied' })
            }

            // Parse date
            const tokenDate = new Date(date)
            tokenDate.setHours(0, 0, 0, 0)

            // Check if token number already exists for this date in this clinic
            const whereClause: any = {
                tokenNumber: Number(tokenNumber),
                date: {
                    gte: tokenDate,
                    lt: new Date(tokenDate.getTime() + 24 * 60 * 60 * 1000)
                }
            }
            
            if (clinicId) {
                whereClause.patient = { clinicId }
            }
            
            const duplicateToken = await prisma.token.findFirst({
                where: whereClause
            })

            if (duplicateToken) {
                return res.status(400).json({ error: 'This token number is already assigned for today' })
            }

            // Create token
            const token = await prisma.token.create({
                data: {
                    patientId: Number(patientId),
                    tokenNumber: Number(tokenNumber),
                    status: status || 'waiting',
                    date: tokenDate
                },
                include: {
                    patient: true
                }
            })

            return res.status(201).json(token)
        }

        if (method === 'PUT') {
            const { id, patientId, tokenNumber, status, date } = req.body

            if (!id) {
                return res.status(400).json({ error: 'Token ID is required' })
            }

            // Verify token belongs to user's clinic before updating
            const clinicId = getClinicIdFromUser(user)
            
            // Super admin must be logged into a specific clinic to update tokens
            if (user.role === 'super_admin' && !clinicId) {
                return res.status(403).json({ error: 'Super admin must log into a clinic to update tokens' })
            }
            
            if (!clinicId) {
                return res.status(403).json({ error: 'No clinic association' })
            }
            const tokenToUpdate = await prisma.token.findFirst({
                where: {
                    id: Number(id),
                    patient: clinicId ? { clinicId } : undefined
                },
                include: {
                    patient: true
                }
            })

            if (!tokenToUpdate) {
                return res.status(404).json({ error: 'Token not found or access denied' })
            }

            // If updating token number, check for duplicates
            if (tokenNumber && Number(tokenNumber) !== tokenToUpdate.tokenNumber) {
                const tokenDate = date ? new Date(date) : tokenToUpdate.date
                tokenDate.setHours(0, 0, 0, 0)

                const duplicate = await prisma.token.findFirst({
                    where: {
                        tokenNumber: Number(tokenNumber),
                        date: {
                            gte: tokenDate,
                            lt: new Date(tokenDate.getTime() + 24 * 60 * 60 * 1000)
                        },
                        id: {
                            not: Number(id)
                        },
                        patient: clinicId ? { clinicId } : undefined
                    }
                })

                if (duplicate) {
                    return res.status(400).json({ error: 'This token number is already assigned for this date' })
                }
            }

            // Update token
            const updateData: any = {}
            if (patientId) updateData.patientId = Number(patientId)
            if (tokenNumber) updateData.tokenNumber = Number(tokenNumber)
            if (status) updateData.status = status
            if (date) {
                const tokenDate = new Date(date)
                tokenDate.setHours(0, 0, 0, 0)
                updateData.date = tokenDate
            }

            const token = await prisma.token.update({
                where: { id: Number(id) },
                data: updateData,
                include: {
                    patient: true
                }
            })

            return res.status(200).json(token)
        }

        if (method === 'DELETE') {
            const { id } = req.body

            if (!id) {
                return res.status(400).json({ error: 'Token ID is required' })
            }

            // Verify token belongs to user's clinic before deleting
            const clinicId = getClinicIdFromUser(user)
            
            // Super admin must be logged into a specific clinic to delete tokens
            if (user.role === 'super_admin' && !clinicId) {
                return res.status(403).json({ error: 'Super admin must log into a clinic to delete tokens' })
            }
            
            if (!clinicId) {
                return res.status(403).json({ error: 'No clinic association' })
            }
            
            const tokenToDelete = await prisma.token.findFirst({
                where: {
                    id: Number(id),
                    patient: { clinicId }
                }
            })

            if (!tokenToDelete) {
                return res.status(404).json({ error: 'Token not found or access denied' })
            }

            await prisma.token.delete({
                where: { id: Number(id) }
            })

            return res.status(200).json({ message: 'Token deleted successfully' })
        }

        return res.status(405).json({ error: 'Method not allowed' })
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Internal server error' })
    }
}
