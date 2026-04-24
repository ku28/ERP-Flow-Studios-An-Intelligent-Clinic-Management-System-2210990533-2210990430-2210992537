import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireAuth } from '../../../lib/auth'
import bcrypt from 'bcryptjs'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'PUT') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const user = await requireAuth(req, res)
    if (!user) return

    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current and new passwords are required' })
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters' })
    }

    try {
        // Verify current password
        const userWithPassword = await prisma.user.findUnique({
            where: { id: user.id }
        })

        if (!userWithPassword || !userWithPassword.passwordHash) {
            return res.status(400).json({ error: 'User not found or no password set' })
        }

        const isValid = await bcrypt.compare(currentPassword, userWithPassword.passwordHash)
        if (!isValid) {
            return res.status(400).json({ error: 'Current password is incorrect' })
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10)

        // Update password
        await prisma.user.update({
            where: { id: user.id },
            data: { passwordHash: hashedPassword }
        })

        return res.status(200).json({ message: 'Password changed successfully' })
    } catch (error) {
        return res.status(500).json({ error: 'Failed to change password' })
    }
}
