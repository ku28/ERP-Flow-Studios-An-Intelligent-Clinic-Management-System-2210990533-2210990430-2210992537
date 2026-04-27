export type TemplateSectionId =
    | 'header'
    | 'patientInfo'
    | 'vitals'
    | 'notes'
    | 'diagnosis'
    | 'prescriptionTable'
    | 'footer'
    | 'signature'
    | 'watermark'
    | 'customText'
    | 'customImage'

export type SectionDensity = 'compact' | 'normal' | 'spacious'

export interface TemplateSection {
    id: TemplateSectionId
    enabled: boolean
}

export interface TemplateAssets {
    headerUrl?: string
    footerUrl?: string
    signatureUrl?: string
    watermarkUrl?: string
}

export interface CustomTextBlock {
    id: string
    text: string
}

export interface CustomImageBlock {
    id: string
    url: string
    alt?: string
    x?: number
    y?: number
    width?: number
    height?: number
    fitMode?: 'contain' | 'cover'
    cropX?: number
    cropY?: number
    zoom?: number
    sourceAsset?: 'header' | 'footer' | 'signature' | 'watermark' | 'custom'
}

export interface PrescriptionTemplateConfig {
    layoutId: string
    sections: TemplateSection[]
    showVitals: boolean
    showWatermark: boolean
    signaturePosition: 'left' | 'center' | 'right'
    fontSize: 'small' | 'medium' | 'large'
    marginColor: string
    sectionHeights: Partial<Record<TemplateSectionId, SectionDensity>>
    customTextBlocks: CustomTextBlock[]
    customImageBlocks: CustomImageBlock[]
    assets: TemplateAssets
}

export type SavedTemplateVariant = 'pro' | 'non-pro'

export interface SavedPrescriptionTemplate {
    id: string
    title: string
    template: PrescriptionTemplateConfig
    createdAt: string
    updatedAt: string
    variant: SavedTemplateVariant
}

export interface PrescriptionTemplateCollection {
    activeTemplateId: string | null
    templates: SavedPrescriptionTemplate[]
}

export interface TemplatePreset {
    id: string
    name: string
    description: string
    requiresPro?: boolean
    config: PrescriptionTemplateConfig
}

const NON_PRO_LAYOUT_IDS = new Set(['patient-copy-current'])
const PRO_LAYOUT_IDS = new Set(['patient-copy-pro-color', 'pro-brand-modern', 'pro-executive-clean'])

export const getTemplateVariant = (layoutId?: string): SavedTemplateVariant => {
    if (!layoutId) return 'non-pro'
    if (PRO_LAYOUT_IDS.has(layoutId) || layoutId.startsWith('pro-')) return 'pro'
    if (NON_PRO_LAYOUT_IDS.has(layoutId)) return 'non-pro'
    return 'non-pro'
}

export const createDefaultTemplateCollection = (): PrescriptionTemplateCollection => ({
    activeTemplateId: null,
    templates: [],
})

export const normalizeTemplateCollection = (raw: any): PrescriptionTemplateCollection => {
    if (
        raw &&
        typeof raw === 'object' &&
        Array.isArray(raw.templates)
    ) {
        return {
            activeTemplateId: typeof raw.activeTemplateId === 'string' ? raw.activeTemplateId : null,
            templates: raw.templates
                .filter((item: any) => item && typeof item === 'object' && item.template && item.id)
                .map((item: any) => ({
                    id: String(item.id),
                    title: typeof item.title === 'string' && item.title.trim() ? item.title : 'Untitled Template',
                    template: item.template as PrescriptionTemplateConfig,
                    createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
                    updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
                    variant: item.variant === 'pro' ? 'pro' : getTemplateVariant(item.template?.layoutId),
                })),
        }
    }

    if (raw && typeof raw === 'object' && Array.isArray(raw.sections)) {
        const now = new Date().toISOString()
        return {
            activeTemplateId: 'template_1',
            templates: [
                {
                    id: 'template_1',
                    title: 'Template 1',
                    template: raw as PrescriptionTemplateConfig,
                    createdAt: now,
                    updatedAt: now,
                    variant: getTemplateVariant((raw as PrescriptionTemplateConfig).layoutId),
                },
            ],
        }
    }

    return createDefaultTemplateCollection()
}

export const getActiveTemplateFromCollection = (collection: PrescriptionTemplateCollection): SavedPrescriptionTemplate | null => {
    if (collection.activeTemplateId) {
        const active = collection.templates.find((item) => item.id === collection.activeTemplateId)
        if (active) return active
    }
    return collection.templates[0] || null
}

const baseSections: TemplateSection[] = [
    { id: 'header', enabled: true },
    { id: 'patientInfo', enabled: true },
    { id: 'vitals', enabled: true },
    { id: 'notes', enabled: true },
    { id: 'diagnosis', enabled: true },
    { id: 'prescriptionTable', enabled: true },
    { id: 'signature', enabled: true },
    { id: 'footer', enabled: true },
    { id: 'watermark', enabled: true },
]

export const createDefaultTemplate = (layoutId = 'patient-copy-current'): PrescriptionTemplateConfig => ({
    layoutId,
    sections: [...baseSections],
    showVitals: true,
    showWatermark: true,
    signaturePosition: 'right',
    fontSize: 'small',
    marginColor: '#111111',
    sectionHeights: {
        header: 'normal',
        patientInfo: 'normal',
        prescriptionTable: 'spacious',
        footer: 'normal',
    },
    customTextBlocks: [],
    customImageBlocks: [],
    assets: {},
})

export const applyAssetsToTemplate = (
    template: PrescriptionTemplateConfig | null | undefined,
    assets: TemplateAssets
): PrescriptionTemplateConfig => {
    const next = template ? { ...template } : createDefaultTemplate()
    next.assets = {
        ...(next.assets || {}),
        ...assets,
    }
    next.showWatermark = !!next.assets.watermarkUrl
    return next
}

export const TEMPLATE_PRESETS: TemplatePreset[] = [
    {
        id: 'patient-copy-current',
        name: 'Patient Copy (Non-Pro)',
        description: 'Exact patient copy style in black and white.',
        config: {
            ...createDefaultTemplate('patient-copy-current'),
            fontSize: 'small',
            signaturePosition: 'right',
            marginColor: '#111111',
            sections: [
                { id: 'header', enabled: true },
                { id: 'patientInfo', enabled: true },
                { id: 'vitals', enabled: true },
                { id: 'notes', enabled: true },
                { id: 'diagnosis', enabled: true },
                { id: 'prescriptionTable', enabled: true },
                { id: 'signature', enabled: true },
                { id: 'footer', enabled: true },
                { id: 'watermark', enabled: true },
            ],
            sectionHeights: {
                header: 'normal',
                patientInfo: 'compact',
                vitals: 'compact',
                notes: 'normal',
                diagnosis: 'normal',
                prescriptionTable: 'spacious',
                signature: 'compact',
                footer: 'normal',
            },
        },
    },
    {
        id: 'patient-copy-pro-color',
        name: 'Patient Copy (Pro Color)',
        description: 'Exact patient copy style with pro color accents.',
        requiresPro: true,
        config: {
            ...createDefaultTemplate('patient-copy-pro-color'),
            fontSize: 'small',
            signaturePosition: 'right',
            marginColor: '#111111',
            sections: [
                { id: 'header', enabled: true },
                { id: 'patientInfo', enabled: true },
                { id: 'vitals', enabled: true },
                { id: 'notes', enabled: true },
                { id: 'diagnosis', enabled: true },
                { id: 'prescriptionTable', enabled: true },
                { id: 'signature', enabled: true },
                { id: 'footer', enabled: true },
                { id: 'watermark', enabled: true },
            ],
            sectionHeights: {
                header: 'normal',
                patientInfo: 'compact',
                vitals: 'compact',
                notes: 'normal',
                diagnosis: 'normal',
                prescriptionTable: 'spacious',
                signature: 'compact',
                footer: 'normal',
            },
        },
    },
    {
        id: 'minimal-wide',
        name: 'Minimal Wide',
        description: 'Minimal style with large readable sections and no watermark.',
        config: {
            ...createDefaultTemplate('minimal-wide'),
            showVitals: false,
            showWatermark: false,
            fontSize: 'large',
            signaturePosition: 'left',
            sections: [
                { id: 'header', enabled: true },
                { id: 'prescriptionTable', enabled: true },
                { id: 'diagnosis', enabled: true },
                { id: 'notes', enabled: true },
                { id: 'patientInfo', enabled: true },
                { id: 'signature', enabled: true },
                { id: 'footer', enabled: true },
                { id: 'vitals', enabled: false },
                { id: 'watermark', enabled: false },
            ],
            sectionHeights: {
                header: 'spacious',
                patientInfo: 'spacious',
                prescriptionTable: 'spacious',
                diagnosis: 'spacious',
                notes: 'spacious',
                signature: 'spacious',
                footer: 'compact',
            },
            marginColor: '#475569',
        },
    },
    {
        id: 'compact-no-header',
        name: 'Compact No Header',
        description: 'Compact working copy layout focused on medicine table first.',
        config: {
            ...createDefaultTemplate('compact-no-header'),
            showVitals: true,
            showWatermark: false,
            fontSize: 'small',
            signaturePosition: 'center',
            marginColor: '#1f2937',
            sections: [
                { id: 'header', enabled: false },
                { id: 'prescriptionTable', enabled: true },
                { id: 'patientInfo', enabled: true },
                { id: 'vitals', enabled: true },
                { id: 'diagnosis', enabled: true },
                { id: 'notes', enabled: true },
                { id: 'signature', enabled: true },
                { id: 'footer', enabled: true },
                { id: 'watermark', enabled: false },
            ],
            sectionHeights: {
                header: 'compact',
                patientInfo: 'compact',
                vitals: 'compact',
                diagnosis: 'compact',
                notes: 'compact',
                prescriptionTable: 'spacious',
                signature: 'compact',
                footer: 'compact',
            },
        },
    },
    {
        id: 'pro-brand-modern',
        name: 'Pro Brand Modern',
        description: 'Premium branded layout with spacious sections and watermark focus.',
        requiresPro: true,
        config: {
            ...createDefaultTemplate('pro-brand-modern'),
            showVitals: true,
            showWatermark: true,
            fontSize: 'medium',
            signaturePosition: 'center',
            marginColor: '#0b3a5b',
            sections: [
                { id: 'watermark', enabled: true },
                { id: 'header', enabled: true },
                { id: 'patientInfo', enabled: true },
                { id: 'notes', enabled: true },
                { id: 'diagnosis', enabled: true },
                { id: 'prescriptionTable', enabled: true },
                { id: 'vitals', enabled: true },
                { id: 'signature', enabled: true },
                { id: 'footer', enabled: true },
            ],
            sectionHeights: {
                header: 'spacious',
                patientInfo: 'normal',
                notes: 'spacious',
                diagnosis: 'spacious',
                prescriptionTable: 'normal',
                vitals: 'normal',
                signature: 'normal',
                footer: 'normal',
            },
        },
    },
    {
        id: 'pro-executive-clean',
        name: 'Pro Executive Clean',
        description: 'Executive prescription style with minimal blocks and premium spacing.',
        requiresPro: true,
        config: {
            ...createDefaultTemplate('pro-executive-clean'),
            showVitals: false,
            showWatermark: false,
            fontSize: 'large',
            signaturePosition: 'right',
            marginColor: '#334155',
            sections: [
                { id: 'header', enabled: true },
                { id: 'patientInfo', enabled: true },
                { id: 'prescriptionTable', enabled: true },
                { id: 'notes', enabled: true },
                { id: 'diagnosis', enabled: true },
                { id: 'signature', enabled: true },
                { id: 'footer', enabled: true },
                { id: 'vitals', enabled: false },
                { id: 'watermark', enabled: false },
            ],
            sectionHeights: {
                header: 'spacious',
                patientInfo: 'spacious',
                prescriptionTable: 'spacious',
                notes: 'spacious',
                diagnosis: 'normal',
                signature: 'normal',
                footer: 'compact',
            },
        },
    },
]

export const getTemplatePresetById = (id: string): TemplatePreset | undefined =>
    TEMPLATE_PRESETS.find((p) => p.id === id)
