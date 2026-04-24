import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { accountIds } = req.body

        if (!Array.isArray(accountIds)) {
            return res.status(400).json({ error: 'accountIds must be an array' })
        }

        // Query database to find which user IDs still exist
        const existingUsers = await prisma.user.findMany({
            where: {
                id: {
                    in: accountIds
                }
            },
            select: {
                id: true
            }
        })

        const validAccountIds = existingUsers.map((user: any) => user.id)

        return res.status(200).json({ validAccountIds })
    } catch (error) {
        return res.status(500).json({ error: 'Failed to verify accounts' })
    }
}
