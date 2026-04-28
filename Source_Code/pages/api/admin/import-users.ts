import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser, getClinicIdFromUser } from '../../../lib/auth'
import formidable from 'formidable'
import fs from 'fs'
import prisma from '../../../lib/prisma'
import bcrypt from 'bcryptjs'
import { canAssignRoleForBasicPlan, isBasicPlan, isFeatureAllowed } from '../../../lib/subscription'

export const config = {
    api: {
        bodyParser: false
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const authUser = await getSessionUser(req)

    if (!authUser) {
        return res.status(401).json({ error: 'Not authenticated' })
    }

    if (authUser.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' })
    }

    if (!isFeatureAllowed(authUser?.clinic?.subscriptionPlan, 'admin_settings')) {
        return res.status(403).json({ error: 'Admin Settings is available in Standard plan.' })
    }

    if (req.method === 'POST') {
        try {
            const clinicId = getClinicIdFromUser(authUser)
            const clinic = await prisma.clinic.findUnique({ where: { id: clinicId }, select: { subscriptionPlan: true } })
            const form = formidable({})
            const [fields, files] = await form.parse(req)

            const file = files.file?.[0]
            if (!file) {
                return res.status(400).json({ error: 'No file uploaded' })
            }

            const content = fs.readFileSync(file.filepath, 'utf-8')
            const lines = content.split('\n').filter(line => line.trim())
            
            // Skip header
            const dataLines = lines.slice(1)
            let imported = 0
            let clinicUsers = await prisma.user.findMany({ where: { clinicId }, select: { id: true, role: true } })
            const enforceBasicLimits = isBasicPlan(clinic?.subscriptionPlan)

            for (const line of dataLines) {
                const [name, email, role, phone] = line.split(',').map(s => s.trim().replace(/"/g, ''))
                
                if (!email) continue
                const requestedRole = role || 'staff'

                const defaultPassword = await bcrypt.hash('Welcome123!', 10)

                try {
                    const existing = await prisma.user.findUnique({
                        where: { email },
                        select: { id: true, clinicId: true }
                    })

                    if (existing) {
                        if (existing.clinicId !== clinicId) {
                            console.warn(`Skipping cross-clinic import for ${email}`)
                            continue
                        }

                        if (enforceBasicLimits) {
                            const limitCheck = canAssignRoleForBasicPlan(requestedRole, clinicUsers, existing.id)
                            if (!limitCheck.allowed) {
                                continue
                            }
                        }

                        await prisma.user.update({
                            where: { id: existing.id },
                            data: { name, role: requestedRole, phone }
                        })
                    } else {
                        if (enforceBasicLimits) {
                            const limitCheck = canAssignRoleForBasicPlan(requestedRole, clinicUsers)
                            if (!limitCheck.allowed) {
                                continue
                            }
                        }

                        await prisma.user.create({
                            data: {
                                email,
                                name,
                                role: requestedRole,
                                phone,
                                passwordHash: defaultPassword,
                                clinicId
                            }
                        })
                    }
                    clinicUsers = await prisma.user.findMany({ where: { clinicId }, select: { id: true, role: true } })
                    imported++
                } catch (err) {
                }
            }

            return res.status(200).json({ 
                message: `Successfully imported ${imported} users`,
                count: imported
            })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to import users' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
