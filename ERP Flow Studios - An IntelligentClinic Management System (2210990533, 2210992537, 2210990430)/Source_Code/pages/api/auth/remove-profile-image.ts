import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireAuth } from '../../../lib/auth'
import cloudinary from 'cloudinary'

// Configure Cloudinary
cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'DELETE') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const user = await requireAuth(req, res)
    if (!user) return

    try {
        // Delete from Cloudinary if exists
        if (user.profileImage) {
            try {
                const publicId = user.profileImage.split('/').slice(-2).join('/').split('.')[0]
                await cloudinary.v2.uploader.destroy(publicId)
            } catch (err) {
            }
        }

        // Remove profile image from database
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: { profileImage: null },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                profileImage: true
            }
        })

        return res.status(200).json({
            message: 'Profile image removed successfully',
            user: updatedUser
        })
    } catch (error) {
        return res.status(500).json({ error: 'Failed to remove profile image' })
    }
}
