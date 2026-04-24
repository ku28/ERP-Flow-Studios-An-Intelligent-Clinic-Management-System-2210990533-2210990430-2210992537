import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireAuth } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        return handleGet(req, res)
    } else if (req.method === 'POST') {
        return handlePost(req, res)
    } else if (req.method === 'PUT') {
        return handlePut(req, res)
    } else if (req.method === 'DELETE') {
        return handleDelete(req, res)
    }
    return res.status(405).json({ error: 'Method not allowed' })
}

// GET /api/releases - Fetch releases (supports ?latest=true, ?all=true)
async function handleGet(req: NextApiRequest, res: NextApiResponse) {
    try {
        const { latest, all } = req.query

        if (latest === 'true') {
            // Return the latest active release
            const release = await prisma.release.findFirst({
                where: { isActive: true },
                orderBy: { createdAt: 'desc' }
            })
            return res.status(200).json(release)
        }

        if (all === 'true') {
            // Super admin view: return all releases
            const user = await requireAuth(req, res)
            if (!user) return
            if (user.role !== 'super_admin') {
                return res.status(403).json({ error: 'Access denied' })
            }
            const releases = await prisma.release.findMany({
                orderBy: { createdAt: 'desc' }
            })
            return res.status(200).json(releases)
        }

        // Public: return all active releases for changelog
        const releases = await prisma.release.findMany({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' }
        })
        return res.status(200).json(releases)
    } catch (error) {
        return res.status(500).json({ error: 'Failed to fetch releases' })
    }
}

// POST /api/releases - Create a new release (admin only)
async function handlePost(req: NextApiRequest, res: NextApiResponse) {
    try {
        const user = await requireAuth(req, res)
        if (!user) return
        if (user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Only super admins can create releases' })
        }

        const { version, title, description, features, releaseType, platforms } = req.body

        if (!version || !title) {
            return res.status(400).json({ error: 'Version and title are required' })
        }

        // Validate version format
        const versionRegex = /^\d+\.\d+\.\d+$/
        if (!versionRegex.test(version)) {
            return res.status(400).json({ error: 'Version must follow SemVer format (e.g., 1.2.3)' })
        }

        // Check for duplicate version
        const existing = await prisma.release.findUnique({ where: { version } })
        if (existing) {
            return res.status(409).json({ error: `Release version ${version} already exists` })
        }

        const validTypes = ['major', 'feature', 'improvement', 'bugfix', 'security']
        if (releaseType && !validTypes.includes(releaseType)) {
            return res.status(400).json({ error: `Invalid release type. Must be one of: ${validTypes.join(', ')}` })
        }

        // Default to all platforms if not specified
        const targetPlatforms = platforms && Array.isArray(platforms) && platforms.length > 0 ? platforms : ['all']

        const release = await prisma.release.create({
            data: {
                version,
                title,
                description: description || null,
                features: features || [],
                releaseType: releaseType || 'improvement',
                platforms: targetPlatforms,
                isActive: true,
                createdBy: user.id
            }
        })

        return res.status(201).json(release)
    } catch (error) {
        return res.status(500).json({ error: 'Failed to create release' })
    }
}

// PUT /api/releases - Update a release (admin only)
async function handlePut(req: NextApiRequest, res: NextApiResponse) {
    try {
        const user = await requireAuth(req, res)
        if (!user) return
        if (user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Only super admins can update releases' })
        }

        const { id, version, title, description, features, releaseType, platforms, isActive } = req.body

        if (!id) {
            return res.status(400).json({ error: 'Release ID is required' })
        }

        if (version) {
            const versionRegex = /^\d+\.\d+\.\d+$/
            if (!versionRegex.test(version)) {
                return res.status(400).json({ error: 'Version must follow SemVer format (e.g., 1.2.3)' })
            }
            // Check for duplicate version (excluding the current release)
            const existing = await prisma.release.findFirst({ 
                where: { version, id: { not: id } } 
            })
            if (existing) {
                return res.status(409).json({ error: `Release version ${version} already exists` })
            }
        }

        const updateData: any = {}
        if (version !== undefined) updateData.version = version
        if (title !== undefined) updateData.title = title
        if (description !== undefined) updateData.description = description
        if (features !== undefined) updateData.features = features
        if (releaseType !== undefined) updateData.releaseType = releaseType
        if (platforms !== undefined) updateData.platforms = platforms
        if (isActive !== undefined) updateData.isActive = isActive

        const release = await prisma.release.update({
            where: { id },
            data: updateData
        })

        return res.status(200).json(release)
    } catch (error) {
        return res.status(500).json({ error: 'Failed to update release' })
    }
}

// DELETE /api/releases - Delete a release (admin only)
async function handleDelete(req: NextApiRequest, res: NextApiResponse) {
    try {
        const user = await requireAuth(req, res)
        if (!user) return
        if (user.role !== 'super_admin') {
            return res.status(403).json({ error: 'Only super admins can delete releases' })
        }

        const { id } = req.body
        if (!id) {
            return res.status(400).json({ error: 'Release ID is required' })
        }

        await prisma.release.delete({ where: { id } })
        return res.status(200).json({ success: true })
    } catch (error) {
        return res.status(500).json({ error: 'Failed to delete release' })
    }
}
