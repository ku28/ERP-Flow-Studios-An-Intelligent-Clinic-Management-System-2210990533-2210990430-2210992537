import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { requireStaffOrAbove, getClinicIdFromUser } from '../../lib/auth'
import { getClinicAwareDoctorFilter } from '../../lib/doctorUtils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireStaffOrAbove(req, res)
    if (!user) return
    
    if (req.method === 'GET') {
        try {
            // Filter mappings by clinic through product relationship
            const doctorFilter = await getClinicAwareDoctorFilter(user, prisma)
            const mappings = await prisma.billProductMapping.findMany({
                where: {
                    product: doctorFilter
                },
                include: {
                    product: {
                        select: {
                            id: true,
                            name: true,
                            tags: true,
                            quantity: true
                        }
                    }
                },
                orderBy: {
                    createdAt: 'desc'
                }
            })

            const normalizedMappings = mappings.map((m: any) => ({
                ...m,
                billProductName: String(m.billProductName || '').includes('::')
                    ? String(m.billProductName).split('::').slice(1).join('::')
                    : m.billProductName
            }))

            return res.status(200).json({ success: true, mappings: normalizedMappings })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch product mappings' })
        }
    }

    if (req.method === 'DELETE') {
        try {
            const { id, billProductName } = req.body
            const doctorFilter = await getClinicAwareDoctorFilter(user, prisma)
            const clinicId = getClinicIdFromUser(user)

            if (billProductName) {
                const scopedName = `${clinicId}::${String(billProductName).trim()}`
                const mapping = await prisma.billProductMapping.findFirst({
                    where: {
                        billProductName: scopedName,
                        product: doctorFilter
                    },
                    select: { id: true }
                })
                if (!mapping) {
                    return res.status(404).json({ error: 'Mapping not found or access denied' })
                }
                // Delete by bill product name
                await prisma.billProductMapping.delete({
                    where: { billProductName: scopedName }
                })
            } else if (id) {
                const mapping = await prisma.billProductMapping.findFirst({
                    where: {
                        id: parseInt(id),
                        product: doctorFilter
                    },
                    select: { id: true }
                })
                if (!mapping) {
                    return res.status(404).json({ error: 'Mapping not found or access denied' })
                }
                // Delete by id
                await prisma.billProductMapping.delete({
                    where: { id: parseInt(id) }
                })
            } else {
                return res.status(400).json({ error: 'Either id or billProductName is required' })
            }

            return res.status(200).json({ success: true, message: 'Mapping deleted successfully' })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to delete product mapping' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
