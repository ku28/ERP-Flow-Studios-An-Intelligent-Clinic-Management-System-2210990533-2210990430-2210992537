import type { NextApiRequest, NextApiResponse } from 'next'
import cloudinary from 'cloudinary'
import formidable from 'formidable'
import fs from 'fs'
import { requireAuth, getClinicIdFromUser } from '../../lib/auth'
import { getClinicCloudinaryFolder } from '../../lib/utils'
import prisma from '../../lib/prisma'
import { isFeatureAllowed } from '../../lib/subscription'

// Configure Cloudinary
cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
})

export const config = {
    api: {
        bodyParser: false,
    },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    // Require authentication for multi-tenant isolation
    const user = await requireAuth(req, res)
    if (!user) return

    if (!isFeatureAllowed((user as any).clinic?.subscriptionPlan, 'upload_bill')) {
        return res.status(403).json({
            error: 'Upload Bill is available in Standard plan.',
            code: 'FEATURE_RESTRICTED',
            upgradeUrl: '/upgrade',
        })
    }

    try {
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

        const clinicFolder = getClinicCloudinaryFolder(clinic.name, 'bills')

        const form = formidable({
            maxFileSize: 10 * 1024 * 1024, // 10MB
            keepExtensions: true,
        })

        const [fields, files] = await form.parse(req)
        const file = Array.isArray(files.file) ? files.file[0] : files.file

        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' })
        }

        try {
            // Upload to Cloudinary with clinic-specific folder
            const result = await cloudinary.v2.uploader.upload(file.filepath, {
                folder: clinicFolder,
                resource_type: 'raw', // Use 'raw' for PDFs instead of 'auto'
                type: 'upload',
                access_mode: 'public',
                overwrite: false
            })

            // Clean up temporary file
            if (file.filepath && fs.existsSync(file.filepath)) {
                fs.unlinkSync(file.filepath)
            }

            res.status(200).json({
                success: true,
                billUrl: result.secure_url,
                publicId: result.public_id,
                message: 'Bill uploaded successfully to Cloudinary'
            })
        } catch (uploadError: any) {
            
            // Clean up temp file on error
            if (file.filepath && fs.existsSync(file.filepath)) {
                fs.unlinkSync(file.filepath)
            }
            
            return res.status(500).json({ 
                error: 'Failed to upload bill to Cloudinary',
                details: uploadError.message 
            })
        }

    } catch (error: any) {
        res.status(500).json({ 
            error: 'Failed to upload bill',
            details: error.message 
        })
    }
}

