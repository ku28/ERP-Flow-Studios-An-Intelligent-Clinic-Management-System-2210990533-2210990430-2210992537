import type { NextApiRequest, NextApiResponse } from 'next'
import { v2 as cloudinary } from 'cloudinary'
import { requireAuth, getClinicIdFromUser } from '../../lib/auth'
import { getClinicCloudinaryFolder } from '../../lib/utils'
import prisma from '../../lib/prisma'

// Increase body size limit for image uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { image, folder = 'patients' } = req.body

    if (!image) {
      return res.status(400).json({ error: 'No image data provided' })
    }

    // Validate that it's a base64 image
    if (!image.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid image format' })
    }

    // Get clinic-specific folder (except for clinic registration)
    let uploadFolder: string
    if (folder === 'clinics') {
      // Clinic registration - no auth required, use root clinics folder
      uploadFolder = 'erp-flow-studios/clinics'
    } else {
      // Regular uploads - require auth and use clinic-specific folder
      const user = await requireAuth(req, res)
      if (!user) return

      const clinicId = getClinicIdFromUser(user)
      if (!clinicId) {
        return res.status(400).json({ error: 'Clinic not found' })
      }

      const clinic = await prisma.clinic.findUnique({
        where: { id: clinicId },
        select: { name: true }
      })

      if (!clinic) {
        return res.status(404).json({ error: 'Clinic not found' })
      }

      uploadFolder = getClinicCloudinaryFolder(clinic.name, folder)
    }

    // Upload to Cloudinary - it will automatically handle format conversion
    const uploadResponse = await cloudinary.uploader.upload(image, {
      folder: uploadFolder,
      resource_type: 'image',
      allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'ico'],
      transformation: [
        { width: 2000, height: 2000, crop: 'limit' },
        { quality: 95 },
        { fetch_format: 'auto' }
      ]
    })

    return res.status(200).json({
      url: uploadResponse.secure_url,
      publicId: uploadResponse.public_id
    })
  } catch (error: any) {
    return res.status(500).json({ error: error.message || 'Failed to upload image' })
  }
}

