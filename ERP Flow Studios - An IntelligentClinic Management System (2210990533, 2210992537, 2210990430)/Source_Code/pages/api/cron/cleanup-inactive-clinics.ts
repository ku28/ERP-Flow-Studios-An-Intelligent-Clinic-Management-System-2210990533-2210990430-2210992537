import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { getDeletionEligibleDate } from '../../../lib/subscriptionLifecycle'

async function deleteClinicData(clinicId: string) {
    const doctorIds = await prisma.user.findMany({
        where: { clinicId, role: { in: ['doctor', 'admin'] } },
        select: { id: true },
    }).then((rows: Array<{ id: number }>) => rows.map((r) => r.id))

    await prisma.task.deleteMany({
        where: {
            OR: [
                { doctor: { clinicId } },
                { assignedToUser: { clinicId } },
                { assignedByUser: { clinicId } },
                { visit: { patient: { clinicId } } },
            ],
        },
    })
    await prisma.payment.deleteMany({ where: { customerInvoice: { doctor: { clinicId } } } })
    await prisma.customerInvoiceItem.deleteMany({ where: { customerInvoice: { doctor: { clinicId } } } })
    await prisma.customerInvoice.deleteMany({ where: { doctor: { clinicId } } })
    await prisma.prescription.deleteMany({
        where: {
            OR: [
                { doctor: { clinicId } },
                { visit: { patient: { clinicId } } },
            ],
        },
    })
    await prisma.visit.deleteMany({ where: { patient: { clinicId } } })
    await prisma.treatmentProduct.deleteMany({ where: { treatment: { doctor: { clinicId } } } })
    await prisma.treatment.deleteMany({ where: { doctor: { clinicId } } })
    await prisma.demandForecast.deleteMany({ where: { product: { doctorId: { in: doctorIds } } } })
    await prisma.stockTransaction.deleteMany({ where: { product: { doctorId: { in: doctorIds } } } })
    await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrder: { doctorId: { in: doctorIds } } } })
    await prisma.purchaseOrder.deleteMany({ where: { doctorId: { in: doctorIds } } })
    await prisma.productOrder.deleteMany({ where: { product: { doctorId: { in: doctorIds } } } })
    await prisma.sale.deleteMany({ where: { productBatch: { product: { doctorId: { in: doctorIds } } } } })
    await prisma.purchase.deleteMany({ where: { productBatch: { product: { doctorId: { in: doctorIds } } } } })
    await prisma.productBatch.deleteMany({ where: { product: { doctorId: { in: doctorIds } } } })
    await prisma.product.deleteMany({ where: { doctorId: { in: doctorIds } } })
    await prisma.category.deleteMany({ where: { doctorId: { in: doctorIds } } })
    await prisma.supplier.deleteMany({ where: { doctorId: { in: doctorIds } } })
    await prisma.token.deleteMany({ where: { patient: { clinicId } } })
    await prisma.appointment.deleteMany({ where: { patient: { clinicId } } })
    await prisma.invoice.deleteMany({ where: { patient: { clinicId } } })
    await prisma.patient.deleteMany({ where: { clinicId } })
    await prisma.sessionRecord.deleteMany({ where: { clinicId } })
    await prisma.deviceToken.deleteMany({ where: { user: { clinicId } } })
    await prisma.geoAccessRequest.deleteMany({ where: { clinicId } })
    await prisma.clinicLocation.deleteMany({ where: { clinicId } })
    await prisma.user.deleteMany({ where: { clinicId } })
    await prisma.clinic.delete({ where: { id: clinicId } })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const authHeader = req.headers.authorization
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' })
    }

    const now = new Date()
    const candidates = await prisma.clinic.findMany({
        where: {
            status: 'inactive',
            subscriptionStatus: { in: ['expired', 'cancelled'] },
        },
        select: {
            id: true,
            name: true,
            status: true,
            subscriptionStatus: true,
            subscriptionStart: true,
            subscriptionEnd: true,
            trialEndsAt: true,
            subscriptionPlan: true,
            createdAt: true,
            updatedAt: true,
        },
    })

    const deleted: Array<{ id: string; name: string }> = []
    const skipped: Array<{ id: string; name: string; reason: string }> = []
    const errors: Array<{ id: string; name: string; error: string }> = []

    for (const clinic of candidates) {
        const eligibleAt = getDeletionEligibleDate(clinic, now)
        if (eligibleAt > now) {
            skipped.push({ id: clinic.id, name: clinic.name, reason: `Retention until ${eligibleAt.toISOString()}` })
            continue
        }

        try {
            await deleteClinicData(clinic.id)
            deleted.push({ id: clinic.id, name: clinic.name })
        } catch (error: any) {
            errors.push({ id: clinic.id, name: clinic.name, error: error?.message || 'Unknown cleanup error' })
        }
    }

    return res.status(200).json({
        scanned: candidates.length,
        deletedCount: deleted.length,
        skippedCount: skipped.length,
        errorCount: errors.length,
        deleted,
        skipped,
        errors,
    })
}
