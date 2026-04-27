import type { NextApiRequest, NextApiResponse } from 'next'
import { requireAuth } from '../../../lib/auth'
import { sendPushToUser } from '../../../lib/pushNotifications'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await requireAuth(req, res)
  if (!user) return

  const role = user.role?.toLowerCase()
  if (role !== 'admin' && role !== 'doctor') {
    return res.status(403).json({ error: 'Only admin/doctor can send push notifications' })
  }

  const recipientUserId = Number(req.body?.recipientUserId)
  const title = String(req.body?.title || '')
  const body = String(req.body?.body || '')
  const data = req.body?.data && typeof req.body.data === 'object' ? req.body.data : {}

  if (!recipientUserId || !title || !body) {
    return res.status(400).json({ error: 'recipientUserId, title and body are required' })
  }

  const result = await sendPushToUser(recipientUserId, {
    title,
    body,
    data: Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, String(value ?? '')])
    )
  })

  return res.status(200).json({ success: true, result })
}
