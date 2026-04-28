import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireAuth } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await requireAuth(req, res)
  if (!user) return

  if (user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Access denied. Super admin role required.' })
  }

  if (req.method === 'DELETE') {
    try {
      const result = await prisma.treatment.updateMany({
        data: {
          keywords: [] as any,
        },
      })

      return res.status(200).json({
        success: true,
        updated: result.count,
        message: `Reset keywords for ${result.count} treatment plan(s).`,
      })
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || 'Failed to reset treatment keywords' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
