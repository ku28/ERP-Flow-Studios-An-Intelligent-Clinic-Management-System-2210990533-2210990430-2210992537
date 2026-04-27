import { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireStaffOrAbove, getClinicIdFromUser } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const user = await requireStaffOrAbove(req, res)
  if (!user) return

  try {
  // Legacy format: OPD-XXX (e.g. OPD-001). Generate next sequential turn.
  const clinicId = getClinicIdFromUser(user)
  const prefix = 'OPD-'
  const existingCount = await prisma.patient.count({ where: { clinicId, opdNo: { startsWith: prefix } } })
  const nextTurn = existingCount + 1
  const opdNo = `${prefix}${String(nextTurn).padStart(3, '0')}` // e.g. OPD-001

    return res.status(200).json({ opdNo })
  } catch (err) {
    return res.status(500).json({ error: 'Failed to generate OPD number' })
  }
}
