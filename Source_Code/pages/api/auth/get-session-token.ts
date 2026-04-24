import { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Get the current user from the session cookie
    const user = await getSessionUser(req)
    
    if (!user) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    // Extract the session token from the cookie
    const raw = req.headers.cookie || ''
    const match = raw.split(';').map(s => s.trim()).find(s => s.startsWith('session='))
    
    if (!match) {
      return res.status(401).json({ error: 'No session cookie found' })
    }

    const sessionToken = match.split('=')[1]

    return res.status(200).json({ 
      sessionToken,
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
