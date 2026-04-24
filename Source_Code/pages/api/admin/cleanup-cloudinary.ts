import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser, getClinicIdFromUser } from '../../../lib/auth'
import { isFeatureAllowed } from '../../../lib/subscription'
import { v2 as cloudinary } from 'cloudinary'
import { getClinicCloudinaryFolder } from '../../../lib/utils'
import prisma from '../../../lib/prisma'

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
})

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Verify authentication
    const authUser = await getSessionUser(req)

    if (!authUser) {
        return res.status(401).json({ error: 'Not authenticated' })
    }

    // Check if user is admin
    if (authUser.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' })
    }

    if (!isFeatureAllowed(authUser?.clinic?.subscriptionPlan, 'admin_settings')) {
        return res.status(403).json({ error: 'Admin Settings is available in Standard plan.' })
    }

    if (req.method === 'POST') {
        try {
            let deletedCount = 0
            const errors: string[] = []

            // Get clinic-specific folders
            const clinicId = getClinicIdFromUser(authUser)
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

            // Define clinic-specific folders to clean up (excluding landing page assets)
            const foldersToCleanup = [
                getClinicCloudinaryFolder(clinic.name, 'attachments'),
                getClinicCloudinaryFolder(clinic.name, 'bills'),
                getClinicCloudinaryFolder(clinic.name, 'prescriptions'),
                getClinicCloudinaryFolder(clinic.name, 'reports'),
                getClinicCloudinaryFolder(clinic.name, 'images'),
                getClinicCloudinaryFolder(clinic.name, 'patients')
            ]



            // Helper function to delete all resources in a folder with pagination
            async function deleteAllResourcesInFolder(folder: string, resourceType: 'image' | 'video' | 'raw' = 'image') {
                let hasMore = true
                let nextCursor: string | undefined = undefined
                let folderDeletedCount = 0

                while (hasMore) {
                    try {
                        const options: any = {
                            type: 'upload',
                            prefix: folder,
                            max_results: 500,
                            resource_type: resourceType
                        }

                        if (nextCursor) {
                            options.next_cursor = nextCursor
                        }

                        const result = await cloudinary.api.resources(options)

                        if (result.resources && result.resources.length > 0) {
                            // Delete resources in batches
                            const publicIds = result.resources.map((r: any) => r.public_id)
                            
                            // Cloudinary allows bulk deletion
                            try {
                                await cloudinary.api.delete_resources(publicIds, {
                                    resource_type: resourceType
                                })
                                folderDeletedCount += publicIds.length
                            } catch (batchError) {
                                // If batch fails, try one by one
                                for (const publicId of publicIds) {
                                    try {
                                        await cloudinary.uploader.destroy(publicId, {
                                            resource_type: resourceType
                                        })
                                        folderDeletedCount++
                                    } catch (deleteError: any) {
                                        errors.push(`Failed to delete ${publicId}`)
                                    }
                                }
                            }
                        }

                        // Check if there are more results
                        hasMore = !!result.next_cursor
                        nextCursor = result.next_cursor

                    } catch (fetchError: any) {
                        // If folder doesn't exist or is empty, that's fine
                        if (fetchError.error?.http_code === 404) {
                        } else {
                        }
                        hasMore = false
                    }
                }

                return folderDeletedCount
            }

            for (const folder of foldersToCleanup) {
                try {
                    
                    // Try to delete all resource types
                    const imageCount = await deleteAllResourcesInFolder(folder, 'image')
                    const videoCount = await deleteAllResourcesInFolder(folder, 'video')
                    const rawCount = await deleteAllResourcesInFolder(folder, 'raw')
                    
                    const totalFolderCount = imageCount + videoCount + rawCount
                    deletedCount += totalFolderCount
                    

                    // Try to delete the folder itself (only if we deleted files)
                    if (totalFolderCount > 0) {
                        try {
                            await cloudinary.api.delete_folder(folder)
                        } catch (folderError: any) {
                            // Folder might still have nested folders or not be empty, that's okay
                            if (folderError.error?.http_code !== 404) {
                            }
                        }
                    }

                } catch (folderError: any) {
                    errors.push(`Failed to process folder ${folder}: ${folderError.message}`)
                }
            }


            if (errors.length > 0) {
                return res.status(200).json({ 
                    message: `Cleaned up ${deletedCount} files with ${errors.length} errors`,
                    deletedCount,
                    errors
                })
            }

            return res.status(200).json({ 
                message: deletedCount > 0 
                    ? `Successfully cleaned up ${deletedCount} files from Cloudinary`
                    : 'No files found to clean up',
                deletedCount
            })
        } catch (error: any) {
            return res.status(500).json({ 
                error: 'Failed to cleanup Cloudinary files',
                details: error.message 
            })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}

