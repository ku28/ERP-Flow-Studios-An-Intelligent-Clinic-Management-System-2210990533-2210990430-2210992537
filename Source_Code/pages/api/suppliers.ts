import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { requireStaffOrAbove } from '../../lib/auth'
import { getDoctorIdForCreate, getClinicAwareDoctorFilter } from '../../lib/doctorUtils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Suppliers restricted to staff and above
    const user = await requireStaffOrAbove(req, res)
    if (!user) return
    
    if (req.method === 'GET') {
        try {
            // Filter suppliers by clinic
            const whereClause = await getClinicAwareDoctorFilter(user, prisma)
            
            const suppliers = await prisma.supplier.findMany({
                where: whereClause,
                orderBy: { name: 'asc' },
                include: {
                    _count: {
                        select: { purchaseOrders: true }
                    }
                }
            })
            
            return res.status(200).json(suppliers)
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch suppliers' })
        }
    }

    if (req.method === 'POST') {
        try {
            const {
                name,
                contactPerson,
                email,
                phone,
                address,
                city,
                state,
                pincode,
                gstin,
                pendingBalance,
                notes
            } = req.body
            
            // Get doctorId for clinic association
            const doctorId = getDoctorIdForCreate(user, null)

            const supplier = await prisma.supplier.create({
                data: {
                    name,
                    contactPerson,
                    email,
                    phone,
                    address,
                    city,
                    state,
                    pincode,
                    gstin,
                    pendingBalance: pendingBalance ? Number(pendingBalance) : 0,
                    notes,
                    doctorId
                }
            })

            return res.status(201).json(supplier)
        } catch (error) {
            return res.status(500).json({ error: 'Failed to create supplier' })
        }
    }

    if (req.method === 'PUT') {
        try {
            const { id, ...data } = req.body

            // Verify supplier belongs to user's clinic before updating
            const whereClause = await getClinicAwareDoctorFilter(user, prisma)
            const supplier = await prisma.supplier.findFirst({
                where: { id: Number(id), ...whereClause }
            })

            if (!supplier) {
                return res.status(404).json({ error: 'Supplier not found or access denied' })
            }

            const updatedSupplier = await prisma.supplier.update({
                where: { id: Number(id) },
                data: {
                    ...data,
                    pendingBalance: data.pendingBalance !== undefined ? Number(data.pendingBalance) : undefined
                }
            })

            return res.status(200).json(updatedSupplier)
        } catch (error) {
            return res.status(500).json({ error: 'Failed to update supplier' })
        }
    }

    if (req.method === 'DELETE') {
        try {
            const { id } = req.query

            // Verify supplier belongs to user's clinic before deleting
            const whereClause = await getClinicAwareDoctorFilter(user, prisma)
            const supplier = await prisma.supplier.findFirst({
                where: { id: Number(id), ...whereClause }
            })

            if (!supplier) {
                return res.status(404).json({ error: 'Supplier not found or access denied' })
            }

            await prisma.supplier.delete({
                where: { id: Number(id) }
            })

            return res.status(200).json({ message: 'Supplier deleted successfully' })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to delete supplier' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
