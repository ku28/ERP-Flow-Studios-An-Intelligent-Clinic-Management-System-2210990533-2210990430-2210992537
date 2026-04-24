import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { verifySessionToken } from '../../../lib/auth'

// Define available pages for each role
const AVAILABLE_PAGES = [
    'dashboard',
    'patients',
    'prescriptions',
    'products',
    'invoices',
    'purchase-orders',
    'analytics',
    'admin-settings',
    'profile',
    'visits',
    'stock-transactions',
    'product-analytics'
]

// Default permissions for each role with read/write control
const DEFAULT_PERMISSIONS: Record<string, Array<{ page: string, canAccess: boolean, canWrite: boolean }>> = {
    admin: AVAILABLE_PAGES.map(page => ({ page, canAccess: true, canWrite: true })),
    doctor: [
        { page: 'dashboard', canAccess: true, canWrite: false },
        { page: 'patients', canAccess: true, canWrite: true },
        { page: 'prescriptions', canAccess: true, canWrite: true },
        { page: 'visits', canAccess: true, canWrite: true },
        { page: 'profile', canAccess: true, canWrite: true }
    ],
    receptionist: [
        { page: 'dashboard', canAccess: true, canWrite: false },
        { page: 'patients', canAccess: true, canWrite: true },
        { page: 'invoices', canAccess: true, canWrite: true },
        { page: 'profile', canAccess: true, canWrite: true }
    ],
    staff: [
        { page: 'dashboard', canAccess: true, canWrite: false },
        { page: 'patients', canAccess: true, canWrite: false },
        { page: 'profile', canAccess: true, canWrite: true }
    ]
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        // Verify user is super admin
        const token = req.cookies.session
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' })
        }

        const decoded = verifySessionToken(token)
        const user = await prisma.user.findUnique({
            where: { id: decoded.sub }
        })

        if (!user || user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Access denied' })
        }

        if (req.method === 'GET') {
            // Fetch role permissions from database
            const dbPermissions = await prisma.pagePermission.findMany()

            // Build permissions object by role
            const permissions: Record<string, Array<{ page: string, canAccess: boolean, canWrite: boolean }>> = {}
            
            // Initialize with defaults
            for (const role of ['admin', 'doctor', 'receptionist', 'staff']) {
                permissions[role] = []
                
                // For each available page
                for (const page of AVAILABLE_PAGES) {
                    // Check if there's a database entry
                    const dbPerm = dbPermissions.find((p : any) => p.role === role && p.page === page)
                    
                    if (dbPerm) {
                        // Use database values
                        permissions[role].push({
                            page,
                            canAccess: dbPerm.canAccess,
                            canWrite: dbPerm.canWrite
                        })
                    } else {
                        // Use default values
                        const defaultPerm = DEFAULT_PERMISSIONS[role]?.find(p => p.page === page)
                        if (defaultPerm) {
                            permissions[role].push(defaultPerm)
                        } else {
                            // No default, so no access
                            permissions[role].push({
                                page,
                                canAccess: false,
                                canWrite: false
                            })
                        }
                    }
                }
            }

            return res.status(200).json({ 
                permissions,
                availablePages: AVAILABLE_PAGES
            })
        }

        return res.status(405).json({ error: 'Method not allowed' })

    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to handle role permissions' })
    }
}
