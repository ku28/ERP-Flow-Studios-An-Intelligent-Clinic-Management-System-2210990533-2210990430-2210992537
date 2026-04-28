import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser, getClinicIdFromUser } from '../../../lib/auth'
import { isFeatureAllowed } from '../../../lib/subscription'
import { getClinicAwareDoctorFilter } from '../../../lib/doctorUtils'
import prisma from '../../../lib/prisma'
import fs from 'fs'
import path from 'path'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const authUser = await getSessionUser(req)

    if (!authUser) {
        return res.status(401).json({ error: 'Not authenticated' })
    }

    if (authUser.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' })
    }

    if (!isFeatureAllowed(authUser?.clinic?.subscriptionPlan, 'admin_settings')) {
        return res.status(403).json({ error: 'Admin Settings is available in Standard plan.' })
    }

    if (req.method === 'GET') {
        try {
            // Get all JSON files from data directory
            const dataDir = path.join(process.cwd(), 'data')
            const allFiles = fs.readdirSync(dataDir)
            const jsonFiles = allFiles.filter(file => file.endsWith('.json'))
            
            // Get counts from database
            const categories = await prisma.dropdownOption.groupBy({
                by: ['category'],
                _count: {
                    id: true
                }
            }) as Array<{ category: string; _count: { id: number } }>

            // Create a map of category counts
            const countMap = new Map<string, number>(
                categories.map(cat => [cat.category, cat._count.id])
            )

            // Return all JSON files with their counts (from database or JSON file)
            const files = jsonFiles.map(fileName => {
                const categoryName = fileName.replace('.json', '')
                let itemCount = 0
                
                // Special handling for categories.json - get count from Category table
                if (categoryName === 'categories') {
                    // We'll count this separately below
                } else {
                    itemCount = countMap.get(categoryName) ?? 0
                }
                
                // If no items in database, try to read from JSON file
                if (itemCount === 0 && categoryName !== 'categories') {
                    try {
                        const filePath = path.join(dataDir, fileName)
                        const fileContent = fs.readFileSync(filePath, 'utf-8')
                        const jsonData = JSON.parse(fileContent)
                        itemCount = Array.isArray(jsonData) ? jsonData.length : 0
                    } catch (err) {
                        // If error reading file, keep count as 0
                    }
                }
                
                return {
                    name: fileName,
                    path: fileName,
                    itemCount: categoryName === 'categories' ? 0 : itemCount,  // We'll update this below
                    label: categoryName.replace(/([A-Z])/g, ' $1').trim()
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(' ')
                }
            })

            // Get count for categories.json separately from Category table
            const categoriesFile = files.find(f => f.name === 'categories.json')
            if (categoriesFile) {
                const doctorFilter = await getClinicAwareDoctorFilter(authUser, prisma)
                const categoryCount = await prisma.category.count({ where: doctorFilter })
                categoriesFile.itemCount = categoryCount
            }

            return res.status(200).json({ files })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch dropdown files' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
