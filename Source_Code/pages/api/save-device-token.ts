import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuth } from '../../lib/auth'
import prisma from '../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const user = await requireAuth(req, res)
    if (!user) return

    const token = (req.body?.token || '').toString().trim()
    const platform = (req.body?.platform || 'android').toString().trim().toLowerCase()

    if (!token) {
      return res.status(400).json({ error: 'Device token is required' })
    }

    await prisma.deviceToken.upsert({
      where: { token },
      update: {
        userId: user.id,
        platform,
        isActive: true,
        lastSeenAt: new Date(),
      },
      create: {
        token,
        userId: user.id,
        platform,
        isActive: true,
        lastSeenAt: new Date(),
      }
    })

    return res.status(200).json({ success: true })
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || 'Failed to save device token' })
  }
}
