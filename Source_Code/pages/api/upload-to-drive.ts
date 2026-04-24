import type { NextApiRequest, NextApiResponse } from 'next'
import { v2 as cloudinary } from 'cloudinary'

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
})

// Increase body size limit for file uploads
export const config = {
    api: {
        bodyParser: {
            sizeLimit: '50mb', // Allow up to 50MB for file uploads
        },
    },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { file, fileName, patientName, mimeType } = req.body

        if (!file || !fileName || !patientName) {
            return res.status(400).json({ error: 'Missing required fields: file, fileName, or patientName' })
        }

        // Validate file size (check base64 string length as proxy)
        const estimatedSizeInMB = (file.length * 0.75) / (1024 * 1024) // Base64 is ~33% larger
        if (estimatedSizeInMB > 40) {
            return res.status(413).json({ error: `File too large: ${estimatedSizeInMB.toFixed(2)}MB. Maximum allowed is 40MB.` })
        }

        // Determine resource type based on mime type
        let resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto'
        if (mimeType?.startsWith('image/')) {
            resourceType = 'image'
        } else if (mimeType?.startsWith('video/')) {
            resourceType = 'video'
        } else {
            resourceType = 'raw' // For PDFs, documents, etc.
        }

        // Create folder path (sanitize patient name)
        const folderPath = `erp-flow-studios/${patientName.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '_')}`

        // Upload to Cloudinary
        const uploadResult = await cloudinary.uploader.upload(file, {
            folder: folderPath,
            public_id: fileName.replace(/\.[^/.]+$/, ''), // Remove extension from public_id
            resource_type: resourceType,
            type: 'upload',
            access_mode: 'public', // Make the file publicly accessible
            invalidate: true, // Clear CDN cache
            overwrite: false,
            use_filename: true,
            unique_filename: true,
        })

        return res.status(200).json({
            success: true,
            url: uploadResult.secure_url,
            publicId: uploadResult.public_id,
            webViewLink: uploadResult.secure_url, // For compatibility with existing code
            fileName: fileName,
            format: uploadResult.format,
            resourceType: uploadResult.resource_type,
            size: uploadResult.bytes,
        })
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Failed to upload to Cloudinary' })
    }
}

