import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { useAuth } from '../../contexts/AuthContext'
import { PrescriptionBuilderEditor } from '../../components/prescription-builder'
import {
    applyAssetsToTemplate,
    createDefaultTemplate,
    getActiveTemplateFromCollection,
    normalizeTemplateCollection,
    type PrescriptionTemplateConfig,
} from '../../lib/prescriptionTemplate'

type ClinicImages = {
    header: string
    footer: string
    signature: string
    watermark: string
}

export default function BrandingBuilderPage() {
    const router = useRouter()
    const { user: authUser, loading: authLoading } = useAuth()
    const [loading, setLoading] = useState(true)
    const [templateLoading, setTemplateLoading] = useState(true)
    const [clinic, setClinic] = useState<any>(null)
    const [images, setImages] = useState<ClinicImages>({
        header: '',
        footer: '',
        signature: '',
        watermark: '',
    })
    const [template, setTemplate] = useState<PrescriptionTemplateConfig | null>(null)
    const [templateTitle, setTemplateTitle] = useState('')
    const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null)

    useEffect(() => {
        if (!router.isReady || authLoading) return

        const load = async () => {
            setLoading(true)
            try {
                // Use AuthContext user instead of fetching /api/auth/me
                if (!authUser) {
                    router.replace('/clinic-login')
                    return
                }

                const clinicData = authUser?.clinic
                if (!clinicData) {
                    router.replace('/clinic-login')
                    return
                }

                setClinic(clinicData)
                const clinicImages = {
                    header: clinicData.prescriptionHeaderUrl || '',
                    footer: clinicData.prescriptionFooterUrl || '',
                    signature: clinicData.prescriptionSignatureUrl || '',
                    watermark: clinicData.prescriptionWatermarkUrl || '',
                }
                setImages(clinicImages)

                setTemplateLoading(true)
                try {
                    const templateResponse = await fetch('/api/clinic/prescription-template', { cache: 'no-store' })
                    if (templateResponse.ok) {
                        const templateData = await templateResponse.json()
                        const collection = normalizeTemplateCollection(templateData.collection || templateData)
                        const requestedId = typeof router.query.templateId === 'string' ? router.query.templateId : ''
                        const selectedTemplate = requestedId && requestedId !== 'new'
                            ? (collection.templates.find((item) => item.id === requestedId) || null)
                            : getActiveTemplateFromCollection(collection)

                        setTemplateTitle(selectedTemplate?.title || '')
                        setEditingTemplateId(selectedTemplate?.id || null)
                        setTemplate(applyAssetsToTemplate(selectedTemplate?.template || createDefaultTemplate(), {
                            headerUrl: clinicImages.header,
                            footerUrl: clinicImages.footer,
                            signatureUrl: clinicImages.signature,
                            watermarkUrl: clinicImages.watermark,
                        }))
                    } else {
                        setTemplate(applyAssetsToTemplate(createDefaultTemplate(), {
                            headerUrl: clinicImages.header,
                            footerUrl: clinicImages.footer,
                            signatureUrl: clinicImages.signature,
                            watermarkUrl: clinicImages.watermark,
                        }))
                    }
                } finally {
                    setTemplateLoading(false)
                }
            } finally {
                setLoading(false)
            }
        }

        load()
    }, [router.isReady, router.query.templateId, authUser, authLoading])

    const handleSaveTemplate = async (nextTemplate: PrescriptionTemplateConfig, title: string, templateId?: string | null) => {
        const mergedTemplate = applyAssetsToTemplate(nextTemplate, {
            headerUrl: nextTemplate.assets?.headerUrl || images.header,
            footerUrl: nextTemplate.assets?.footerUrl || images.footer,
            signatureUrl: nextTemplate.assets?.signatureUrl || images.signature,
            watermarkUrl: nextTemplate.assets?.watermarkUrl || images.watermark,
        })

        const response = await fetch('/api/clinic/prescription-template', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'saveTemplate',
                template: mergedTemplate,
                title,
                templateId,
            }),
        })

        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
            throw new Error(data?.error || 'Failed to save prescription layout')
        }

        const savedTemplateId = data.savedTemplateId as string | null
        const savedEntry = Array.isArray(data.templates)
            ? data.templates.find((item: any) => item.id === savedTemplateId)
            : null
        const savedTemplate = (savedEntry?.template || mergedTemplate) as PrescriptionTemplateConfig

        setTemplateTitle(savedEntry?.title || title || templateTitle)
        setEditingTemplateId(savedTemplateId)
        if (savedTemplateId && router.query.templateId !== savedTemplateId) {
            router.replace(`/clinic/branding-builder?templateId=${savedTemplateId}`, undefined, { shallow: true })
        }

        setTemplate(savedTemplate)
        setImages({
            header: savedTemplate.assets?.headerUrl || images.header,
            footer: savedTemplate.assets?.footerUrl || images.footer,
            signature: savedTemplate.assets?.signatureUrl || images.signature,
            watermark: savedTemplate.assets?.watermarkUrl || images.watermark,
        })
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-slate-950" style={{ backgroundColor: 'var(--bg)' }}>
                <div className="flex min-h-screen items-center justify-center px-4">
                    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm text-gray-600 shadow-sm dark:border-gray-700 dark:bg-slate-900 dark:text-gray-300">
                        Loading branding builder...
                    </div>
                </div>
            </div>
        )
    }

    return (
        <>
            <Head>
                <title>Prescription Builder | ERP Flow Studios</title>
            </Head>
            <div className="min-h-screen bg-gray-50 dark:bg-slate-950" style={{ backgroundColor: 'var(--bg)' }}>
                <header className="border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-gray-700 dark:bg-slate-900/95 md:px-6">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500 dark:text-gray-400">Branding Studio</p>
                            <h1 className="mt-1 text-xl font-semibold text-gray-900 dark:text-gray-100 md:text-2xl">Prescription Template Builder</h1>
                            <p className="text-xs text-gray-600 dark:text-gray-300">Full workspace mode with live A4 canvas editing.</p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300">
                                Clinic: {clinic?.name || 'Unknown'}
                            </span>
                            <span className="rounded-full border border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-medium uppercase text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                Plan: {clinic?.subscriptionPlan || 'basic'}
                            </span>
                            <button
                                type="button"
                                onClick={() => router.push('/clinic-edit?tab=branding')}
                                className="rounded-lg border border-gray-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700"
                            >
                                Back To Branding
                            </button>
                        </div>
                    </div>
                </header>

                <main className="px-2 py-2 md:px-3 md:py-3" style={{ height: 'calc(100vh - 88px)' }}>
                    {templateLoading ? (
                        <div className="h-full rounded-xl border border-gray-200 bg-white p-8 text-sm text-gray-600 shadow-sm dark:border-gray-700 dark:bg-slate-900 dark:text-gray-300">
                            Loading saved template...
                        </div>
                    ) : (
                        <div className="h-full">
                            <PrescriptionBuilderEditor
                                key={editingTemplateId || 'new-template'}
                                clinicImages={images}
                                plan={clinic?.subscriptionPlan || 'basic'}
                                initialTemplate={template}
                                initialTitle={templateTitle}
                                editingTemplateId={editingTemplateId}
                                onSaveTemplate={handleSaveTemplate}
                            />
                        </div>
                    )}
                </main>
            </div>
        </>
    )
}
