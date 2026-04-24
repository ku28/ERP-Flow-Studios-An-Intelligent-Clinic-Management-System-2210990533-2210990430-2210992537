import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireAuth } from '../../../lib/auth'

/**
 * GET /api/releases/check - Check if user has unseen releases
 * POST /api/releases/check - Mark a version as seen by the user
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireAuth(req, res)
    if (!user) return

    if (req.method === 'GET') {
        try {
            const lastSeenVersion = user.lastSeenVersion || '0.0.0'

            // Get the latest active release
            const latestRelease = await prisma.release.findFirst({
                where: { isActive: true },
                orderBy: { createdAt: 'desc' }
            })

            if (!latestRelease) {
                return res.status(200).json({ hasUpdate: false, lastSeenVersion })
            }

            // Use proper SemVer comparison on the server
            const { isNewerVersion, getReleaseDisplayType } = await import('../../../lib/semver')
            const hasUpdate = isNewerVersion(latestRelease.version, lastSeenVersion)
            const displayType = getReleaseDisplayType(latestRelease.releaseType)

            return res.status(200).json({
                hasUpdate,
                lastSeenVersion,
                latestRelease: hasUpdate ? latestRelease : null,
                displayType: hasUpdate ? displayType : 'silent'
            })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to check releases' })
        }
    }

    if (req.method === 'POST') {
        try {
            const { version } = req.body
            if (!version) {
                return res.status(400).json({ error: 'Version is required' })
            }

            await prisma.user.update({
                where: { id: user.id },
                data: { lastSeenVersion: version }
            })

            return res.status(200).json({ success: true, lastSeenVersion: version })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to update last seen version' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
