import type { NextApiRequest, NextApiResponse } from 'next'
import cloudinary from 'cloudinary'
import formidable from 'formidable'
import fs from 'fs'

// Configure Cloudinary
cloudinary.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
})

export const config = {
    api: {
        bodyParser: false // Disable body parser to handle file uploads
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const form = formidable({
            maxFileSize: 10 * 1024 * 1024, // 10MB
            keepExtensions: true
        })

        form.parse(req, async (err, fields, files) => {
            if (err) {
                return res.status(500).json({ error: 'Failed to parse upload' })
            }

            const file = Array.isArray(files.file) ? files.file[0] : files.file

            if (!file) {
                return res.status(400).json({ error: 'No file uploaded' })
            }

            try {
                // Upload to Cloudinary
                const result = await cloudinary.v2.uploader.upload(file.filepath, {
                    folder: 'erp-flow-studios/attachments',
                    resource_type: 'auto', // Auto-detect file type
                    overwrite: false
                })

                // Clean up temp file
                fs.unlinkSync(file.filepath)

                return res.status(200).json({
                    url: result.secure_url,
                    publicId: result.public_id,
                    format: result.format
                })
            } catch (uploadError) {
                
                // Clean up temp file on error
                if (fs.existsSync(file.filepath)) {
                    fs.unlinkSync(file.filepath)
                }
                
                return res.status(500).json({ error: 'Failed to upload to Cloudinary' })
            }
        })
    } catch (error) {
        return res.status(500).json({ error: 'Upload failed' })
    }
}

