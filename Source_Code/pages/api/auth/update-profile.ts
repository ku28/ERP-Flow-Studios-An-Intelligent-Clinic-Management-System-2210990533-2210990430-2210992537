import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireAuth } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'PUT') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const user = await requireAuth(req, res)
    if (!user) return

    const { name, email, phone } = req.body

    if (!name?.trim()) {
        return res.status(400).json({ error: 'Name is required' })
    }

    if (!email?.trim()) {
        return res.status(400).json({ error: 'Email is required' })
    }

    // Check if email is being changed and if it's already taken
    if (email !== user.email) {
        const existingUser = await prisma.user.findUnique({
            where: { email }
        })

        if (existingUser && existingUser.id !== user.id) {
            return res.status(400).json({ error: 'Email is already in use' })
        }
    }

    // Check if phone is being changed and if it's already taken
    if (phone && phone !== user.phone) {
        const existingUserWithPhone = await prisma.user.findUnique({
            where: { phone }
        })

        if (existingUserWithPhone && existingUserWithPhone.id !== user.id) {
            return res.status(400).json({ error: 'Phone number is already in use' })
        }
    }

    try {
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: {
                name: name.trim(),
                email: email.trim(),
                phone: phone?.trim() || null
            },
            select: {
                id: true,
                email: true,
                phone: true,
                name: true,
                role: true,
                profileImage: true
            }
        })

        return res.status(200).json({ user: updatedUser })
    } catch (error) {
        return res.status(500).json({ error: 'Failed to update profile' })
    }
}
