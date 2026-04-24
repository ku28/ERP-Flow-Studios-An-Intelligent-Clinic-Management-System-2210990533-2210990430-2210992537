import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireAuth } from '../../../lib/auth'
import { getClinicAwareDoctorFilter } from '../../../lib/doctorUtils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireAuth(req, res)
    if (!user) return

    if (req.method === 'GET') {
        try {
            const doctorFilter = await getClinicAwareDoctorFilter(user, prisma)

            // Get all products with their IDs and names
            const products = await prisma.product.findMany({
                where: doctorFilter,
                select: {
                    id: true,
                    name: true
                },
                orderBy: {
                    id: 'asc'
                }
            })

            // Format as CSV if requested
            if (req.query.format === 'csv') {
                const csv = [
                    'productId,productName',
                    ...products.map((p: any) => `${p.id},"${p.name}"`)
                ].join('\n')

                res.setHeader('Content-Type', 'text/csv')
                res.setHeader('Content-Disposition', 'attachment; filename=valid_product_ids.csv')
                return res.status(200).send(csv)
            }

            // Return as JSON
            return res.status(200).json({
                count: products.length,
                products: products
            })
        } catch (err: any) {
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
