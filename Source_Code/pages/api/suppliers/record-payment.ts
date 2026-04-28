import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireStaffOrAbove } from '../../../lib/auth'
import { getClinicAwareDoctorFilter } from '../../../lib/doctorUtils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireStaffOrAbove(req, res)
    if (!user) return

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { supplierId, paymentAmount } = req.body

        if (!supplierId || !paymentAmount) {
            return res.status(400).json({ error: 'Supplier ID and payment amount are required' })
        }

        const payment = Number(paymentAmount)
        if (isNaN(payment) || payment <= 0) {
            return res.status(400).json({ error: 'Invalid payment amount' })
        }

        const whereClause = await getClinicAwareDoctorFilter(user, prisma)

        // Get current supplier
        const supplier = await prisma.supplier.findFirst({
            where: { id: Number(supplierId), ...whereClause }
        })

        if (!supplier) {
            return res.status(404).json({ error: 'Supplier not found or access denied' })
        }

        // Calculate new balance
        const currentBalance = supplier.pendingBalance || 0
        const newBalance = currentBalance - payment

        // Update supplier's pending balance
        const updatedSupplier = await prisma.supplier.update({
            where: { id: Number(supplierId) },
            data: {
                pendingBalance: newBalance
            }
        })

        return res.status(200).json({
            success: true,
            supplier: updatedSupplier,
            oldBalance: currentBalance,
            newBalance: newBalance,
            paymentAmount: payment
        })
    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to record payment', details: error.message })
    }
}
