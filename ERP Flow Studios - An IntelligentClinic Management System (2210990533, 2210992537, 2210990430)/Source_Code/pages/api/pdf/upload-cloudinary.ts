import type { NextApiRequest, NextApiResponse } from 'next'
import cloudinary from 'cloudinary'
import { requireAuth, getClinicIdFromUser } from '../../../lib/auth'
import { getClinicCloudinaryFolder } from '../../../lib/utils'
import prisma from '../../../lib/prisma'

// Configure Cloudinary
cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
})

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '50mb'
        },
        responseLimit: '50mb'
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    // Require authentication for multi-tenant isolation
    const user = await requireAuth(req, res)
    if (!user) return

    try {
        const { pdfData, filename, folder = 'prescriptions' } = req.body

        if (!pdfData || !filename) {
            return res.status(400).json({ error: 'Missing pdfData or filename' })
        }

        // Get clinic-specific folder
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

        const clinicFolder = getClinicCloudinaryFolder(clinic.name, folder)


        // Extract base64 data from data URI
        // Format: data:application/pdf;filename=generated.pdf;base64,ACTUALBASE64DATA
        const base64Data = pdfData.includes('base64,') 
            ? pdfData.split('base64,')[1] 
            : pdfData


        // Upload to Cloudinary with clinic-specific folder
        const result = await cloudinary.v2.uploader.upload(`data:application/pdf;base64,${base64Data}`, {
            folder: clinicFolder,
            public_id: filename,
            resource_type: 'raw',
            overwrite: true,
            invalidate: true, // Invalidate CDN cache
            tags: ['auto-delete', 'prescription'],
            context: {
                alt: 'Prescription PDF',
                expires_at: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString() // 12 hours from now
            }
        })


        return res.status(200).json({
            url: result.secure_url,
            publicId: result.public_id
        })
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return res.status(500).json({
            error: 'Failed to upload PDF',
            details: errorMessage
        })
    }
}

