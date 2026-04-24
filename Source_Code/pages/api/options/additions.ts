import { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const options = await prisma.dropdownOption.findMany({
            where: { category: 'additions' },
            orderBy: { order: 'asc' }
        })
        res.status(200).json(options)
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch additions' })
    }
}
