import { NextApiRequest, NextApiResponse } from 'next'
import { verifySessionToken } from '../../../lib/auth'
import prisma from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { sessionToken } = req.body

    if (!sessionToken) {
      return res.status(400).json({ error: 'Session token required' })
    }

    // Verify the token
    const data = verifySessionToken(sessionToken)
    if (!data) {
      return res.status(401).json({ error: 'Invalid session token' })
    }

    // Check if user still exists
    const user = await prisma.user.findUnique({
      where: { id: Number(data.sub) }
    })

    if (!user) {
      return res.status(401).json({ error: 'User not found' })
    }

    return res.status(200).json({ 
      valid: true, 
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        profileImage: user.profileImage
      }
    })
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error' })
  }
}
