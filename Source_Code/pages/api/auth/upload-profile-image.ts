import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireAuth } from '../../../lib/auth'
import formidable from 'formidable'
import cloudinary from 'cloudinary'
import fs from 'fs'

// Configure Cloudinary
cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
})

export const config = {
    api: {
        bodyParser: false
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const user = await requireAuth(req, res)
    if (!user) return

    try {
        const form = formidable({})
        const [fields, files] = await form.parse(req)


        const imageFile = files.image?.[0]
        if (!imageFile) {
            return res.status(400).json({ error: 'No image file provided' })
        }


        // Upload to Cloudinary
        const result = await cloudinary.v2.uploader.upload(imageFile.filepath, {
            folder: 'erp-flow-studios/profile-images',
            transformation: [
                { width: 400, height: 400, crop: 'fill', gravity: 'face' }
            ]
        })


        // Delete old profile image from Cloudinary if exists
        if (user.profileImage) {
            try {
                const publicId = user.profileImage.split('/').slice(-2).join('/').split('.')[0]
                await cloudinary.v2.uploader.destroy(publicId)
            } catch (err) {
            }
        }


        // Update user profile image in database
        const updatedUser = await prisma.user.update({
            where: { id: user.id },
            data: { profileImage: result.secure_url },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                profileImage: true
            }
        })


        // Clean up temporary file
        try {
            fs.unlinkSync(imageFile.filepath)
        } catch (err) {
        }

        return res.status(200).json({
            imageUrl: result.secure_url,
            user: updatedUser
        })
    } catch (error) {
        // Return more detailed error message
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return res.status(500).json({
            error: 'Failed to upload profile image',
            details: errorMessage
        })
    }
}

