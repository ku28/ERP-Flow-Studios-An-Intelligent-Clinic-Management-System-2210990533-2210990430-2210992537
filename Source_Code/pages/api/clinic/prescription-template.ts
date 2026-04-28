import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireAuth, getClinicIdFromUser } from '../../../lib/auth'
import {
    createDefaultTemplate,
    createDefaultTemplateCollection,
    getActiveTemplateFromCollection,
    getTemplateVariant,
    normalizeTemplateCollection,
    type PrescriptionTemplateConfig,
} from '../../../lib/prescriptionTemplate'

const PAGE_KEY = 'prescriptionTemplate'

const createTemplateId = () => `template_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

const makeResponsePayload = (values: any) => {
    const collection = normalizeTemplateCollection(values)
    const active = getActiveTemplateFromCollection(collection)
    return {
        collection,
        activeTemplateId: collection.activeTemplateId,
        templates: collection.templates,
        template: active?.template || createDefaultTemplate(),
        activeTemplate: active || null,
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireAuth(req, res)
    if (!user) return

    let clinicId: string
    try {
        clinicId = getClinicIdFromUser(user)
    } catch {
        return res.status(403).json({ error: 'Clinic context required' })
    }

    if (req.method === 'GET') {
        try {
            const row = await prisma.defaultValue.findUnique({
                where: { clinicId_page: { clinicId, page: PAGE_KEY } },
            })

            const payload = makeResponsePayload((row?.values as any) || createDefaultTemplateCollection())
            return res.status(200).json(payload)
        } catch {
            return res.status(500).json({ error: 'Failed to load template' })
        }
    }

    if (req.method === 'PUT') {
        try {
            const body = req.body || {}
            const action = body.action as string | undefined

            const row = await prisma.defaultValue.findUnique({
                where: { clinicId_page: { clinicId, page: PAGE_KEY } },
            })
            const collection = normalizeTemplateCollection((row?.values as any) || createDefaultTemplateCollection())

            let savedTemplateId: string | null = null

            if (action === 'saveTemplate') {
                const template = body.template as PrescriptionTemplateConfig | undefined
                const templateId = typeof body.templateId === 'string' ? body.templateId : undefined
                const titleRaw = typeof body.title === 'string' ? body.title.trim() : ''
                if (!template || typeof template !== 'object') {
                    return res.status(400).json({ error: 'Template payload is required' })
                }

                const now = new Date().toISOString()
                if (templateId) {
                    collection.templates = collection.templates.map((item) =>
                        item.id === templateId
                            ? {
                                ...item,
                                title: titleRaw || item.title,
                                template,
                                updatedAt: now,
                                variant: getTemplateVariant(template.layoutId),
                            }
                            : item
                    )
                    savedTemplateId = templateId
                } else {
                    const nextId = createTemplateId()
                    const nextTitle = titleRaw || `Template ${collection.templates.length + 1}`
                    collection.templates.push({
                        id: nextId,
                        title: nextTitle,
                        template,
                        createdAt: now,
                        updatedAt: now,
                        variant: getTemplateVariant(template.layoutId),
                    })
                    savedTemplateId = nextId
                }
            } else if (action === 'setActiveTemplate') {
                const templateId = typeof body.templateId === 'string' ? body.templateId : null
                if (templateId && !collection.templates.some((item) => item.id === templateId)) {
                    return res.status(400).json({ error: 'Template not found' })
                }
                collection.activeTemplateId = templateId
            } else if (action === 'deleteTemplate') {
                const templateId = typeof body.templateId === 'string' ? body.templateId : ''
                if (!templateId) {
                    return res.status(400).json({ error: 'Template id is required' })
                }

                collection.templates = collection.templates.filter((item) => item.id !== templateId)
                if (collection.activeTemplateId === templateId) {
                    collection.activeTemplateId = collection.templates[0]?.id || null
                }
            } else {
                const template = body.template
                if (!template || typeof template !== 'object') {
                    return res.status(400).json({ error: 'Template payload is required' })
                }

                const now = new Date().toISOString()
                collection.templates = [
                    {
                        id: 'template_1',
                        title: 'Template 1',
                        template,
                        createdAt: now,
                        updatedAt: now,
                        variant: getTemplateVariant(template.layoutId),
                    },
                ]
                collection.activeTemplateId = 'template_1'
                savedTemplateId = 'template_1'
            }

            const saved = await prisma.defaultValue.upsert({
                where: { clinicId_page: { clinicId, page: PAGE_KEY } },
                create: {
                    clinicId,
                    page: PAGE_KEY,
                    label: 'Prescription Template',
                    values: collection,
                },
                update: {
                    values: collection,
                },
            })

            const payload = makeResponsePayload(saved.values)
            return res.status(200).json({ success: true, savedTemplateId, ...payload })
        } catch {
            return res.status(500).json({ error: 'Failed to save template' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
