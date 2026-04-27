import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireStaffOrAbove } from '../../../lib/auth'

type TemplateType = 'product' | 'treatment'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireStaffOrAbove(req, res)
    if (!user) return

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { templateType, version } = req.body || {}

        if (templateType !== 'product' && templateType !== 'treatment') {
            return res.status(400).json({ error: 'templateType must be product or treatment' })
        }

        const clinicId = user.clinicId || user.clinic?.id
        if (!clinicId) {
            return res.status(400).json({ error: 'User must be associated with a clinic' })
        }

        let targetVersion: number | null = Number.isFinite(Number(version)) ? Number(version) : null

        if (!targetVersion || targetVersion <= 0) {
            if (templateType === 'product') {
                const latest = await prisma.defaultProduct.aggregate({ _max: { version: true } })
                targetVersion = latest._max.version || null
            } else {
                const latest = await prisma.defaultTreatment.aggregate({ _max: { version: true } })
                targetVersion = latest._max.version || null
            }
        }

        if (!targetVersion) {
            return res.status(404).json({ error: 'No default template version found' })
        }

        await prisma.clinicDefaultTemplateSync.upsert({
            where: {
                clinicId_templateType_version: {
                    clinicId,
                    templateType: templateType as TemplateType,
                    version: targetVersion
                }
            },
            create: {
                clinicId,
                templateType: templateType as TemplateType,
                version: targetVersion
            },
            update: {
                populatedAt: new Date()
            }
        })

        return res.status(200).json({
            success: true,
            templateType,
            version: targetVersion
        })
    } catch (err: any) {
        return res.status(500).json({ error: String(err?.message || err) })
    }
}
