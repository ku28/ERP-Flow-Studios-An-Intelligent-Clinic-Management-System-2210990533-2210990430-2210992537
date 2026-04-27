import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import PrescriptionTemplateRenderer from './PrescriptionTemplateRenderer'
import CustomSelect from '../CustomSelect'
import { TEMPLATE_PRESETS, type PrescriptionTemplateConfig, type SectionDensity, type TemplatePreset, type TemplateSectionId } from '../../lib/prescriptionTemplate'
import { usePrescriptionTemplateStore } from '../../stores/prescriptionTemplateStore'
import { isBasicPlan } from '../../lib/subscription'

type Props = {
    clinicImages: { header: string; footer: string; watermark: string; signature: string }
    plan: string
    initialTemplate?: PrescriptionTemplateConfig | null
    initialTitle?: string
    editingTemplateId?: string | null
    onSaveTemplate: (template: PrescriptionTemplateConfig, title: string, templateId?: string | null) => Promise<void>
}

type AssetKey = 'header' | 'footer' | 'signature' | 'watermark'
type MobilePane = 'canvas' | 'assets' | 'layouts'
type InspectorSection = 'assets' | 'order' | 'placed' | 'custom'
type ResizeDirection = 'nw' | 'ne' | 'sw' | 'se'

const A4_WIDTH = 794
const A4_HEIGHT = 1123
const GRID_SIZE = 16
const MIN_SCALE = 0.25
const MAX_SCALE = 1.5
const MIN_BLOCK_WIDTH = 60
const MIN_BLOCK_HEIGHT = 40

const sectionLabels: Record<string, string> = {
    header: 'Header',
    patientInfo: 'Patient Info',
    vitals: 'Vitals',
    notes: 'Notes',
    diagnosis: 'Diagnosis',
    prescriptionTable: 'Prescription Table',
    footer: 'Footer',
    signature: 'Signature',
    watermark: 'Watermark',
    customText: 'Custom Text',
    customImage: 'Custom Image',
}

const assetsMeta: Array<{ key: AssetKey; label: string; hint: string }> = [
    { key: 'header', label: 'Header', hint: 'Drag to top region of prescription.' },
    { key: 'footer', label: 'Footer', hint: 'Drag to lower region of prescription.' },
    { key: 'signature', label: 'Signature', hint: 'Drag near signature section.' },
    { key: 'watermark', label: 'Watermark', hint: 'Drag to center for brand mark.' },
]

const fontOptions = [
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' },
]

const signatureOptions = [
    { value: 'left', label: 'Left' },
    { value: 'center', label: 'Center' },
    { value: 'right', label: 'Right' },
]

const densityOptions = [
    { value: 'compact', label: 'Compact' },
    { value: 'normal', label: 'Normal' },
    { value: 'spacious', label: 'Spacious' },
]

const fitModeOptions = [
    { value: 'contain', label: 'Contain' },
    { value: 'cover', label: 'Cover' },
]

function AssetInputCard({
    label,
    hint,
    value,
    onDropStart,
    onFile,
    onUrl,
}: {
    label: string
    hint: string
    value: string
    onDropStart: (event: React.DragEvent<HTMLDivElement>) => void
    onFile: (file?: File | null) => void
    onUrl: (url: string) => void
}) {
    const fileInputId = useId()
    const [selectedFileName, setSelectedFileName] = useState('')

    return (
        <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</div>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${value ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
                    {value ? 'READY' : 'EMPTY'}
                </span>
            </div>

            <div
                draggable={!!value}
                onDragStart={onDropStart}
                className={`mt-3 h-20 rounded-lg border border-dashed flex items-center justify-center overflow-hidden ${value ? 'cursor-grab border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/20' : 'border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-500'}`}
            >
                {value ? <img src={value} alt={label} className="h-full w-full object-contain" /> : <span className="text-xs">Upload or paste URL</span>}
            </div>

            <div className="mt-3 space-y-2">
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2.5 py-2 flex items-center gap-2">
                    <input
                        id={fileInputId}
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                            const file = e.target.files?.[0]
                            setSelectedFileName(file?.name || '')
                            onFile(file)
                        }}
                        className="hidden"
                    />
                    <label
                        htmlFor={fileInputId}
                        className="inline-flex items-center rounded-md bg-gradient-to-r from-sky-600 to-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white cursor-pointer hover:from-sky-700 hover:to-blue-700 transition-colors"
                    >
                        Choose File
                    </label>
                    <span className="min-w-0 truncate text-[11px] text-gray-600 dark:text-gray-300">
                        {selectedFileName || 'No file selected'}
                    </span>
                </div>
                <input
                    type="url"
                    value={value || ''}
                    onChange={(e) => onUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-2 text-xs text-gray-700 outline-none focus:border-sky-400 focus:bg-white dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                />
            </div>
        </div>
    )
}

export default function PrescriptionBuilderEditor({
    clinicImages,
    plan,
    initialTemplate,
    initialTitle,
    editingTemplateId,
    onSaveTemplate,
}: Props) {
    const {
        template,
        setTemplate,
        setLayout,
        toggleSection,
        moveSection,
        setFontSize,
        setSignaturePosition,
        setMarginColor,
        setShowVitals,
        setShowWatermark,
        addCustomTextBlock,
        addCustomImageBlock,
        removeCustomTextBlock,
        removeCustomImageBlock,
    } = usePrescriptionTemplateStore()

    const [saving, setSaving] = useState(false)
    const [templateTitle, setTemplateTitle] = useState(initialTitle || '')
    const [mobilePane, setMobilePane] = useState<MobilePane>('canvas')
    const [layoutsExpanded, setLayoutsExpanded] = useState(false)
    const [showProTemplates, setShowProTemplates] = useState(false)
    const [textInput, setTextInput] = useState('')
    const [imageInput, setImageInput] = useState('')
    const [canvasScale, setCanvasScale] = useState(1)
    const [autoFit, setAutoFit] = useState(true)
    const [showGrid, setShowGrid] = useState(false)
    const [showRulers, setShowRulers] = useState(false)
    const [snapToGrid, setSnapToGrid] = useState(true)
    const [localAssets, setLocalAssets] = useState(clinicImages)
    const [draggingId, setDraggingId] = useState<string | null>(null)
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null)
    const [draggingSectionId, setDraggingSectionId] = useState<TemplateSectionId | null>(null)
    const [resizeState, setResizeState] = useState<{
        id: string
        direction: ResizeDirection
        startMouseX: number
        startMouseY: number
        startWidth: number
        startHeight: number
        startX: number
        startY: number
    } | null>(null)
    const [inspectorCollapsed, setInspectorCollapsed] = useState<Record<InspectorSection, boolean>>({
        assets: false,
        order: false,
        placed: false,
        custom: false,
    })

    const isPro = !isBasicPlan(plan)

    const stageRef = useRef<HTMLDivElement | null>(null)
    const dragDropRef = useRef<HTMLDivElement | null>(null)
    const hasInitialized = useRef(false)

    const desktopGridCols = layoutsExpanded
        ? 'xl:grid-cols-[370px_minmax(0,1fr)_360px]'
        : 'xl:grid-cols-[370px_minmax(0,1fr)_60px]'

    const defaultAssetSize = (asset: AssetKey) => {
        if (asset === 'signature') return { width: 180, height: 90 }
        if (asset === 'watermark') return { width: 320, height: 320 }
        return { width: 680, height: 120 }
    }

    const autoPlaceDefaultAssets = (seed: PrescriptionTemplateConfig, assets: { header: string; footer: string; signature: string; watermark: string }) => {
        const blocks = [...seed.customImageBlocks]

        const ensureAssetBlock = (asset: AssetKey, x: number, y: number) => {
            const url = assets[asset]
            if (!url) return

            const id = `asset_${asset}`
            const existingIndex = blocks.findIndex((block) => block.id === id || block.sourceAsset === asset)
            const size = defaultAssetSize(asset)

            if (existingIndex >= 0) {
                const existing = blocks[existingIndex]
                blocks[existingIndex] = {
                    ...existing,
                    id,
                    url,
                    sourceAsset: asset,
                    width: existing.width || size.width,
                    height: existing.height || size.height,
                    fitMode: existing.fitMode || 'contain',
                    cropX: existing.cropX || 0,
                    cropY: existing.cropY || 0,
                    zoom: existing.zoom || 1,
                }
                return
            }

            blocks.push({
                id,
                url,
                alt: asset,
                x,
                y,
                width: size.width,
                height: size.height,
                fitMode: 'contain',
                cropX: 0,
                cropY: 0,
                zoom: 1,
                sourceAsset: asset,
            })
        }

        ensureAssetBlock('header', 56, 24)
        ensureAssetBlock('footer', 56, A4_HEIGHT - 128)
        ensureAssetBlock('signature', A4_WIDTH - 236, A4_HEIGHT - 238)
        ensureAssetBlock('watermark', 240, 350)

        return {
            ...seed,
            customImageBlocks: blocks,
        }
    }

    const clampPosition = (x: number, y: number, width: number, height: number) => ({
        x: Math.max(0, Math.min(A4_WIDTH - width, x)),
        y: Math.max(0, Math.min(A4_HEIGHT - height, y)),
    })

    const fitCanvas = useCallback(() => {
        if (!stageRef.current) return
        const nextScale = Math.max(MIN_SCALE, Math.min(1, (stageRef.current.clientWidth - 56) / A4_WIDTH))
        setCanvasScale(nextScale)
    }, [])

    useEffect(() => {
        if (hasInitialized.current) return

        const seedTemplateBase = initialTemplate || {
            ...template,
            assets: {
                ...template.assets,
                headerUrl: clinicImages.header,
                footerUrl: clinicImages.footer,
                signatureUrl: clinicImages.signature,
                watermarkUrl: clinicImages.watermark,
            },
        }

        const seedTemplate = autoPlaceDefaultAssets(seedTemplateBase, {
            header: seedTemplateBase.assets?.headerUrl || clinicImages.header,
            footer: seedTemplateBase.assets?.footerUrl || clinicImages.footer,
            signature: seedTemplateBase.assets?.signatureUrl || clinicImages.signature,
            watermark: seedTemplateBase.assets?.watermarkUrl || clinicImages.watermark,
        })

        setTemplate(seedTemplate)
        setLocalAssets({
            header: seedTemplate.assets?.headerUrl || clinicImages.header,
            footer: seedTemplate.assets?.footerUrl || clinicImages.footer,
            signature: seedTemplate.assets?.signatureUrl || clinicImages.signature,
            watermark: seedTemplate.assets?.watermarkUrl || clinicImages.watermark,
        })
        hasInitialized.current = true
    }, [clinicImages.footer, clinicImages.header, clinicImages.signature, clinicImages.watermark, initialTemplate, setTemplate, template])

    useEffect(() => {
        if (!stageRef.current) return

        const updateScale = () => {
            if (autoFit) fitCanvas()
        }

        updateScale()
        const observer = new ResizeObserver(updateScale)
        observer.observe(stageRef.current)
        return () => observer.disconnect()
    }, [autoFit, fitCanvas])

    useEffect(() => {
        setTemplateTitle(initialTitle || '')
    }, [initialTitle])

    useEffect(() => {
        if (!hasInitialized.current) return

        const nextAssets = {
            headerUrl: localAssets.header,
            footerUrl: localAssets.footer,
            signatureUrl: localAssets.signature,
            watermarkUrl: localAssets.watermark,
        }

        if (
            template.assets?.headerUrl === nextAssets.headerUrl &&
            template.assets?.footerUrl === nextAssets.footerUrl &&
            template.assets?.signatureUrl === nextAssets.signatureUrl &&
            template.assets?.watermarkUrl === nextAssets.watermarkUrl
        ) {
            return
        }

        setTemplate({
            ...template,
            assets: {
                ...template.assets,
                ...nextAssets,
            },
            customImageBlocks: template.customImageBlocks.map((block) => {
                if (block.sourceAsset === 'header') return { ...block, url: nextAssets.headerUrl || block.url }
                if (block.sourceAsset === 'footer') return { ...block, url: nextAssets.footerUrl || block.url }
                if (block.sourceAsset === 'signature') return { ...block, url: nextAssets.signatureUrl || block.url }
                if (block.sourceAsset === 'watermark') return { ...block, url: nextAssets.watermarkUrl || block.url }
                return block
            }),
        })
    }, [localAssets.footer, localAssets.header, localAssets.signature, localAssets.watermark, setTemplate, template])

    const previewVisitData = useMemo(() => ({
        opdNo: '260326 01 01',
        date: new Date().toISOString(),
        gender: 'Female',
        age: '32',
        weight: '62',
        temperament: 'Warm',
        pulseDiagnosis: 'Balanced',
        pulseDiagnosis2: 'Steady',
        majorComplaints: 'Headache with mild acidity for 2 days.',
        provisionalDiagnosis: 'Migraine / Gastric irritation',
        patient: {
            firstName: 'Jane',
            lastName: 'Doe',
            phone: '9876543210',
            address: 'City Center Road, Mumbai',
        },
    }), [])

    const previewPrescriptions = useMemo(() => ([
        { id: 1, product: { name: 'Nux Vomica' }, dosage: '10 | TDS', timing: 'AM', procedure: 'Oral' },
        { id: 2, product: { name: 'Belladonna' }, dosage: '5 | BD', timing: 'PM', procedure: 'Oral' },
    ]), [])

    const placedAssets = useMemo(
        () => template.customImageBlocks.filter((b) => b.sourceAsset && typeof b.x === 'number' && typeof b.y === 'number'),
        [template.customImageBlocks]
    )

    const selectedPlacedAsset = useMemo(
        () => placedAssets.find((block) => block.id === selectedBlockId) || null,
        [placedAssets, selectedBlockId]
    )

    const visibleTemplates = useMemo(() => {
        if (showProTemplates) {
            return TEMPLATE_PRESETS.filter((preset) => preset.requiresPro)
        }
        return TEMPLATE_PRESETS.filter((preset) => !preset.requiresPro)
    }, [showProTemplates])

    const snapCoord = (value: number) => (snapToGrid ? Math.round(value / GRID_SIZE) * GRID_SIZE : value)

    const upsertPlacedAsset = (asset: AssetKey, x: number, y: number) => {
        const id = `asset_${asset}`
        const url = localAssets[asset]
        if (!url) return

        const size = defaultAssetSize(asset)
        const position = clampPosition(snapCoord(x), snapCoord(y), size.width, size.height)

        const nextBlock = {
            id,
            url,
            alt: asset,
            x: position.x,
            y: position.y,
            width: size.width,
            height: size.height,
            fitMode: 'contain' as const,
            cropX: 0,
            cropY: 0,
            zoom: 1,
            sourceAsset: asset,
        }

        const remaining = template.customImageBlocks.filter((b) => b.id !== id)
        setTemplate({
            ...template,
            customImageBlocks: [...remaining, nextBlock],
        })
        setSelectedBlockId(id)
    }

    const updateImageBlock = (id: string, updater: (block: any) => any) => {
        setTemplate({
            ...template,
            customImageBlocks: template.customImageBlocks.map((block) =>
                block.id === id ? updater(block) : block
            ),
        })
    }

    const replacePlacedAssetWithFile = (id: string, file?: File | null) => {
        if (!file || !file.type.startsWith('image/')) return
        const reader = new FileReader()
        reader.onloadend = () => {
            const nextUrl = String(reader.result || '')
            updateImageBlock(id, (block) => ({ ...block, url: nextUrl }))
        }
        reader.readAsDataURL(file)
    }

    const setSectionEnabled = (id: TemplateSectionId, enabled: boolean) => {
        setTemplate({
            ...template,
            sections: template.sections.map((section) =>
                section.id === id ? { ...section, enabled } : section
            ),
        })
    }

    const setSectionDensity = (id: TemplateSectionId, density: SectionDensity) => {
        setTemplate({
            ...template,
            sectionHeights: {
                ...template.sectionHeights,
                [id]: density,
            },
        })
    }

    const handleSectionDrop = (targetId: TemplateSectionId) => {
        if (!draggingSectionId || draggingSectionId === targetId) return

        const sections = [...template.sections]
        const from = sections.findIndex((section) => section.id === draggingSectionId)
        const to = sections.findIndex((section) => section.id === targetId)
        if (from < 0 || to < 0) return

        const [moved] = sections.splice(from, 1)
        sections.splice(to, 0, moved)
        setTemplate({ ...template, sections })
        setDraggingSectionId(null)
    }

    const applyLayoutPreset = (preset: TemplatePreset) => {
        const baseConfig = {
            ...preset.config,
            sections: preset.config.sections.map((section) => ({ ...section })),
            sectionHeights: { ...preset.config.sectionHeights },
            customTextBlocks: [...template.customTextBlocks],
            customImageBlocks: [...template.customImageBlocks],
            assets: {
                ...preset.config.assets,
                headerUrl: localAssets.header,
                footerUrl: localAssets.footer,
                signatureUrl: localAssets.signature,
                watermarkUrl: localAssets.watermark,
            },
        }

        let nextTemplate = baseConfig

        if (preset.id === 'patient-copy-current') {
            nextTemplate = {
                ...baseConfig,
                showVitals: true,
                showWatermark: true,
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
            }
        }

        if (preset.id === 'patient-copy-pro-color') {
            nextTemplate = {
                ...baseConfig,
                showVitals: true,
                showWatermark: true,
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
            }
        }

        if (preset.id === 'minimal-wide') {
            nextTemplate = {
                ...baseConfig,
                showVitals: false,
                showWatermark: false,
                fontSize: 'large',
                signaturePosition: 'left',
                marginColor: '#475569',
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
            }
        }

        if (preset.id === 'compact-no-header') {
            nextTemplate = {
                ...baseConfig,
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
                    notes: 'compact',
                    diagnosis: 'compact',
                    vitals: 'compact',
                    prescriptionTable: 'spacious',
                    signature: 'compact',
                    footer: 'compact',
                },
            }
        }

        if (preset.id === 'pro-brand-modern') {
            nextTemplate = {
                ...baseConfig,
                showVitals: true,
                showWatermark: true,
                fontSize: 'medium',
                signaturePosition: 'center',
                marginColor: '#0b3a5b',
                sections: [
                    { id: 'watermark', enabled: true },
                    { id: 'header', enabled: true },
                    { id: 'patientInfo', enabled: true },
                    { id: 'vitals', enabled: true },
                    { id: 'notes', enabled: true },
                    { id: 'diagnosis', enabled: true },
                    { id: 'prescriptionTable', enabled: true },
                    { id: 'signature', enabled: true },
                    { id: 'footer', enabled: true },
                ],
                sectionHeights: {
                    header: 'spacious',
                    patientInfo: 'normal',
                    vitals: 'normal',
                    notes: 'spacious',
                    diagnosis: 'spacious',
                    prescriptionTable: 'normal',
                    signature: 'normal',
                    footer: 'normal',
                },
            }
        }

        if (preset.id === 'pro-executive-clean') {
            nextTemplate = {
                ...baseConfig,
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
            }
        }

        setLayout(preset.id, nextTemplate)
    }

    const handleAssetFile = (asset: AssetKey, file?: File | null) => {
        if (!file || !file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) return

        const reader = new FileReader()
        reader.onloadend = () => setLocalAssets((prev) => ({ ...prev, [asset]: String(reader.result || '') }))
        reader.readAsDataURL(file)
    }

    const handleDropOnCanvas = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault()

        const asset = event.dataTransfer.getData('asset-key') as AssetKey
        if (!asset || !dragDropRef.current) return

        const rect = dragDropRef.current.getBoundingClientRect()
        upsertPlacedAsset(asset, (event.clientX - rect.left) / canvasScale, (event.clientY - rect.top) / canvasScale)
    }

    const handleCanvasMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
        if (resizeState && dragDropRef.current) {
            const block = template.customImageBlocks.find((b) => b.id === resizeState.id)
            if (!block) return

            const dx = (event.clientX - resizeState.startMouseX) / canvasScale
            const dy = (event.clientY - resizeState.startMouseY) / canvasScale

            let width = resizeState.startWidth
            let height = resizeState.startHeight
            let x = resizeState.startX
            let y = resizeState.startY

            if (resizeState.direction.includes('e')) {
                width = resizeState.startWidth + dx
            }
            if (resizeState.direction.includes('s')) {
                height = resizeState.startHeight + dy
            }
            if (resizeState.direction.includes('w')) {
                width = resizeState.startWidth - dx
                x = resizeState.startX + dx
            }
            if (resizeState.direction.includes('n')) {
                height = resizeState.startHeight - dy
                y = resizeState.startY + dy
            }

            width = Math.max(MIN_BLOCK_WIDTH, width)
            height = Math.max(MIN_BLOCK_HEIGHT, height)
            const position = clampPosition(x, y, width, height)

            updateImageBlock(resizeState.id, (currentBlock) => ({
                ...currentBlock,
                x: position.x,
                y: position.y,
                width,
                height,
            }))
            return
        }

        if (!draggingId || !dragDropRef.current) return

        const block = template.customImageBlocks.find((b) => b.id === draggingId)
        if (!block) return

        const rect = dragDropRef.current.getBoundingClientRect()
        const width = block.width || 180
        const height = block.height || 90

        const x = snapCoord((event.clientX - rect.left) / canvasScale - dragOffset.x)
        const y = snapCoord((event.clientY - rect.top) / canvasScale - dragOffset.y)
        const position = clampPosition(x, y, width, height)

        setTemplate({
            ...template,
            customImageBlocks: template.customImageBlocks.map((b) =>
                b.id === draggingId ? { ...b, x: position.x, y: position.y } : b
            ),
        })
    }

    const handleSave = async () => {
        setSaving(true)
        try {
            await onSaveTemplate({
                ...template,
                assets: {
                    ...template.assets,
                    headerUrl: localAssets.header,
                    footerUrl: localAssets.footer,
                    signatureUrl: localAssets.signature,
                    watermarkUrl: localAssets.watermark,
                },
            }, templateTitle, editingTemplateId)
        } finally {
            setSaving(false)
        }
    }

    const zoomIn = () => {
        setAutoFit(false)
        setCanvasScale((prev) => Math.min(MAX_SCALE, Number((prev + 0.1).toFixed(2))))
    }

    const zoomOut = () => {
        setAutoFit(false)
        setCanvasScale((prev) => Math.max(MIN_SCALE, Number((prev - 0.1).toFixed(2))))
    }

    const handleFit = () => {
        setAutoFit(true)
        requestAnimationFrame(() => fitCanvas())
    }

    const toggleInspectorSection = (section: InspectorSection) => {
        setInspectorCollapsed((prev) => ({ ...prev, [section]: !prev[section] }))
    }

    return (
        <div className="h-full rounded-2xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-slate-950 md:p-4">
            <div className="sticky top-0 z-10 rounded-xl border border-gray-200 bg-white/95 p-3 backdrop-blur dark:border-gray-700 dark:bg-slate-900/95">
                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                    <div className="mr-2">
                        <div className="text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Editing Toolbar</div>
                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Professional Prescription Designer</div>
                    </div>

                    <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                        <span>Title</span>
                        <input
                            type="text"
                            value={templateTitle}
                            onChange={(e) => setTemplateTitle(e.target.value)}
                            placeholder="Template name"
                            className="w-44 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-sky-400 dark:border-gray-600 dark:bg-slate-900 dark:text-gray-100"
                        />
                    </label>

                    <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                        <span>Font</span>
                        <div className="w-32">
                            <CustomSelect
                                value={template.fontSize}
                                onChange={(value) => setFontSize(value as PrescriptionTemplateConfig['fontSize'])}
                                options={fontOptions}
                                usePortal={false}
                                className="text-xs"
                            />
                        </div>
                    </label>

                    <label className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                        <span>Signature</span>
                        <div className="w-32">
                            <CustomSelect
                                value={template.signaturePosition}
                                onChange={(value) => setSignaturePosition(value as PrescriptionTemplateConfig['signaturePosition'])}
                                options={signatureOptions}
                                usePortal={false}
                                className="text-xs"
                            />
                        </div>
                    </label>

                    <label className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                        <input type="checkbox" checked={template.showVitals} onChange={(e) => setShowVitals(e.target.checked)} />
                        Vitals
                    </label>

                    <label className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200">
                        <input type="checkbox" checked={template.showWatermark} onChange={(e) => setShowWatermark(e.target.checked)} />
                        Watermark
                    </label>

                    <label className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 md:ml-auto">
                        <span>Margin</span>
                        <input
                            type="color"
                            value={isPro ? template.marginColor : '#111111'}
                            disabled={!isPro}
                            onChange={(e) => setMarginColor(e.target.value)}
                            className="h-7 w-7 rounded border border-gray-300 bg-transparent p-0 disabled:opacity-50 dark:border-gray-600"
                        />
                    </label>

                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="rounded-lg bg-sky-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:opacity-60"
                    >
                        {saving ? 'Saving...' : 'Save Template'}
                    </button>
                </div>

                {!isPro ? <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">Basic plan margin color is locked to black.</div> : null}

                <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800 xl:hidden">
                    <div className="grid grid-cols-3 gap-1">
                        <button type="button" onClick={() => setMobilePane('canvas')} className={`rounded-md px-2 py-1.5 text-xs font-semibold ${mobilePane === 'canvas' ? 'bg-white text-sky-700 shadow dark:bg-slate-900 dark:text-sky-300' : 'text-gray-600 dark:text-gray-300'}`}>Canvas</button>
                        <button type="button" onClick={() => setMobilePane('assets')} className={`rounded-md px-2 py-1.5 text-xs font-semibold ${mobilePane === 'assets' ? 'bg-white text-sky-700 shadow dark:bg-slate-900 dark:text-sky-300' : 'text-gray-600 dark:text-gray-300'}`}>Assets</button>
                        <button type="button" onClick={() => setMobilePane('layouts')} className={`rounded-md px-2 py-1.5 text-xs font-semibold ${mobilePane === 'layouts' ? 'bg-white text-sky-700 shadow dark:bg-slate-900 dark:text-sky-300' : 'text-gray-600 dark:text-gray-300'}`}>Layouts</button>
                    </div>
                </div>
            </div>

            <div className={`mt-3 grid grid-cols-1 gap-3 ${desktopGridCols}`}>
                <aside className={`${mobilePane === 'assets' ? 'block' : 'hidden'} xl:block`}>
                    <div className="grid grid-cols-[46px_minmax(0,1fr)] gap-2">
                        <div className="rounded-xl border border-gray-200 bg-white p-1.5 dark:border-gray-700 dark:bg-slate-900">
                            <button type="button" title="Assets panel" onClick={() => toggleInspectorSection('assets')} className={`mb-1 w-full rounded-md px-0 py-2 text-xs font-bold ${inspectorCollapsed.assets ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'}`}>A</button>
                            <button type="button" title="Section order panel" onClick={() => toggleInspectorSection('order')} className={`mb-1 w-full rounded-md px-0 py-2 text-xs font-bold ${inspectorCollapsed.order ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'}`}>S</button>
                            <button type="button" title="Placed assets panel" onClick={() => toggleInspectorSection('placed')} className={`mb-1 w-full rounded-md px-0 py-2 text-xs font-bold ${inspectorCollapsed.placed ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'}`}>P</button>
                            <button type="button" title="Custom blocks panel" onClick={() => toggleInspectorSection('custom')} className={`w-full rounded-md px-0 py-2 text-xs font-bold ${inspectorCollapsed.custom ? 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' : 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300'}`}>C</button>
                        </div>

                        <div className="space-y-3">
                            {!inspectorCollapsed.assets ? (
                                <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-slate-900">
                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Assets</h3>
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Upload and drag assets onto the page canvas.</p>
                                    <div className="mt-3 space-y-3">
                                        {assetsMeta.map((asset) => (
                                            <AssetInputCard
                                                key={asset.key}
                                                label={asset.label}
                                                hint={asset.hint}
                                                value={localAssets[asset.key]}
                                                onDropStart={(event) => event.dataTransfer.setData('asset-key', asset.key)}
                                                onFile={(file) => handleAssetFile(asset.key, file)}
                                                onUrl={(url) => setLocalAssets((prev) => ({ ...prev, [asset.key]: url }))}
                                            />
                                        ))}
                                        <div className="grid grid-cols-2 gap-2">
                                            {assetsMeta.map((asset) => (
                                                <button
                                                    key={`place_${asset.key}`}
                                                    type="button"
                                                    disabled={!localAssets[asset.key]}
                                                    onClick={() => upsertPlacedAsset(asset.key, 56, asset.key === 'footer' ? A4_HEIGHT - 140 : asset.key === 'signature' ? A4_HEIGHT - 250 : asset.key === 'watermark' ? 240 : 24)}
                                                    className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-xs font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-slate-900 dark:text-gray-200"
                                                >
                                                    Place {asset.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : null}

                            {!inspectorCollapsed.order ? (
                                <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-slate-900">
                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Section Order</h3>
                                    <div className="mt-2 space-y-2">
                                        {template.sections.map((section, index) => (
                                            <div
                                                key={`${section.id}_${index}`}
                                                draggable
                                                onDragStart={() => setDraggingSectionId(section.id)}
                                                onDragOver={(event) => event.preventDefault()}
                                                onDrop={() => handleSectionDrop(section.id)}
                                                onDragEnd={() => setDraggingSectionId(null)}
                                                className={`rounded-lg border px-2 py-2 ${draggingSectionId === section.id ? 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-900/20' : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800'}`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <input type="checkbox" checked={section.enabled} onChange={() => setSectionEnabled(section.id, !section.enabled)} />
                                                    <div className="min-w-0 flex-1 text-xs font-medium text-gray-700 dark:text-gray-200">{sectionLabels[section.id] || section.id}</div>
                                                    <div className="w-24">
                                                        <CustomSelect
                                                            value={template.sectionHeights[section.id] || 'normal'}
                                                            onChange={(value) => setSectionDensity(section.id, value as SectionDensity)}
                                                            options={densityOptions}
                                                            usePortal={false}
                                                            className="text-xs"
                                                        />
                                                    </div>
                                                    <button type="button" onClick={() => setSectionEnabled(section.id, false)} className="rounded border border-rose-300 px-1.5 py-0.5 text-[11px] text-rose-700 dark:border-rose-800 dark:text-rose-300">Remove</button>
                                                    <button type="button" onClick={() => moveSection(section.id, 'up')} className="rounded border border-gray-300 px-1.5 py-0.5 text-[11px] dark:border-gray-600">Up</button>
                                                    <button type="button" onClick={() => moveSection(section.id, 'down')} className="rounded border border-gray-300 px-1.5 py-0.5 text-[11px] dark:border-gray-600">Down</button>
                                                </div>
                                                <div className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">Drag to reorder this section in canvas output.</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {!inspectorCollapsed.placed ? (
                                <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-slate-900">
                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Placed Assets</h3>
                                    <div className="mt-2 space-y-1.5">
                                        {placedAssets.length === 0 ? (
                                            <div className="rounded-lg border border-dashed border-gray-200 px-2 py-3 text-center text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500">No placed assets yet.</div>
                                        ) : null}
                                        {placedAssets.map((block) => (
                                            <div key={block.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800">
                                                <button type="button" onClick={() => setSelectedBlockId(block.id)} className={`capitalize text-left ${selectedBlockId === block.id ? 'font-bold text-sky-700 dark:text-sky-300' : 'text-gray-700 dark:text-gray-200'}`}>{block.sourceAsset}</button>
                                                <button type="button" onClick={() => { removeCustomImageBlock(block.id); if (selectedBlockId === block.id) setSelectedBlockId(null) }} className="text-rose-600">Remove</button>
                                            </div>
                                        ))}

                                        {selectedPlacedAsset ? (
                                            <div className="mt-2 rounded-lg border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-slate-900">
                                                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Edit Selected</div>
                                                <div className="space-y-2 text-xs">
                                                    <div>
                                                        <div className="mb-1 text-[11px] text-gray-500">Fit mode</div>
                                                        <CustomSelect
                                                            value={selectedPlacedAsset.fitMode || 'contain'}
                                                            onChange={(value) => updateImageBlock(selectedPlacedAsset.id, (block) => ({ ...block, fitMode: value as 'contain' | 'cover' }))}
                                                            options={fitModeOptions}
                                                            usePortal={false}
                                                        />
                                                    </div>
                                                    <label className="block">
                                                        <span className="mb-1 block text-[11px] text-gray-500">Zoom</span>
                                                        <input
                                                            type="range"
                                                            min={0.8}
                                                            max={2}
                                                            step={0.05}
                                                            value={selectedPlacedAsset.zoom || 1}
                                                            onChange={(e) => updateImageBlock(selectedPlacedAsset.id, (block) => ({ ...block, zoom: Number(e.target.value) }))}
                                                            className="w-full"
                                                        />
                                                    </label>
                                                    <label className="block">
                                                        <span className="mb-1 block text-[11px] text-gray-500">Crop X</span>
                                                        <input
                                                            type="range"
                                                            min={-50}
                                                            max={50}
                                                            step={1}
                                                            value={selectedPlacedAsset.cropX || 0}
                                                            onChange={(e) => updateImageBlock(selectedPlacedAsset.id, (block) => ({ ...block, cropX: Number(e.target.value) }))}
                                                            className="w-full"
                                                        />
                                                    </label>
                                                    <label className="block">
                                                        <span className="mb-1 block text-[11px] text-gray-500">Crop Y</span>
                                                        <input
                                                            type="range"
                                                            min={-50}
                                                            max={50}
                                                            step={1}
                                                            value={selectedPlacedAsset.cropY || 0}
                                                            onChange={(e) => updateImageBlock(selectedPlacedAsset.id, (block) => ({ ...block, cropY: Number(e.target.value) }))}
                                                            className="w-full"
                                                        />
                                                    </label>
                                                    <label className="block">
                                                        <span className="mb-1 block text-[11px] text-gray-500">Replace from URL</span>
                                                        <input
                                                            type="url"
                                                            placeholder="https://..."
                                                            defaultValue={selectedPlacedAsset.url}
                                                            onBlur={(e) => {
                                                                const nextUrl = e.target.value.trim()
                                                                if (nextUrl) updateImageBlock(selectedPlacedAsset.id, (block) => ({ ...block, url: nextUrl }))
                                                            }}
                                                            className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-800"
                                                        />
                                                    </label>
                                                    <label className="block text-[11px] text-gray-500">
                                                        <span className="mb-1 block">Replace from file</span>
                                                        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-1.5">
                                                            <input
                                                                id={`replace-asset-file-${selectedPlacedAsset.id}`}
                                                                type="file"
                                                                accept="image/*"
                                                                onChange={(e) => replacePlacedAssetWithFile(selectedPlacedAsset.id, e.target.files?.[0])}
                                                                className="hidden"
                                                            />
                                                            <label
                                                                htmlFor={`replace-asset-file-${selectedPlacedAsset.id}`}
                                                                className="inline-flex items-center rounded-md bg-gradient-to-r from-sky-600 to-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white cursor-pointer hover:from-sky-700 hover:to-blue-700 transition-colors"
                                                            >
                                                                Choose File
                                                            </label>
                                                        </div>
                                                    </label>
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>
                            ) : null}

                            {!inspectorCollapsed.custom ? (
                                <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-slate-900">
                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Custom Blocks</h3>
                                    <div className="mt-2 space-y-2">
                                        <textarea
                                            value={textInput}
                                            onChange={(e) => setTextInput(e.target.value)}
                                            placeholder="Add custom text"
                                            className="min-h-[72px] w-full rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-2 text-xs outline-none focus:border-sky-400 focus:bg-white dark:border-gray-600 dark:bg-gray-800"
                                        />
                                        <button type="button" onClick={() => { if (!textInput.trim()) return; addCustomTextBlock(textInput.trim()); setTextInput('') }} className="w-full rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white dark:bg-gray-100 dark:text-gray-900">Add Text Block</button>
                                        <input
                                            value={imageInput}
                                            onChange={(e) => setImageInput(e.target.value)}
                                            placeholder="Custom image URL"
                                            className="w-full rounded-lg border border-gray-300 bg-gray-50 px-2.5 py-2 text-xs outline-none focus:border-sky-400 focus:bg-white dark:border-gray-600 dark:bg-gray-800"
                                        />
                                        <button type="button" onClick={() => { if (!imageInput.trim()) return; addCustomImageBlock(imageInput.trim()); setImageInput('') }} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-700 dark:border-gray-600 dark:bg-slate-900 dark:text-gray-200">Add Image Block</button>
                                    </div>

                                    <div className="mt-3 space-y-1.5">
                                        {template.customTextBlocks.map((block) => (
                                            <div key={block.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800">
                                                <span className="truncate text-gray-700 dark:text-gray-200">{block.text}</span>
                                                <button type="button" onClick={() => removeCustomTextBlock(block.id)} className="text-rose-600">Remove</button>
                                            </div>
                                        ))}
                                        {template.customImageBlocks.filter((b) => !b.sourceAsset).map((block) => (
                                            <div key={block.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800">
                                                <span className="truncate text-gray-700 dark:text-gray-200">{block.url}</span>
                                                <button type="button" onClick={() => removeCustomImageBlock(block.id)} className="text-rose-600">Remove</button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </aside>

                <main className={`${mobilePane === 'canvas' ? 'block' : 'hidden'} xl:block`}>
                    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-slate-900">
                        <div className="border-b border-gray-200 px-3 py-2 dark:border-gray-700">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">Live A4 Canvas</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400">Grid, rulers and zoom controls are available for precision placement.</div>
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <button type="button" onClick={zoomOut} className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold dark:border-gray-600 dark:bg-slate-800">-</button>
                                    <button type="button" onClick={zoomIn} className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold dark:border-gray-600 dark:bg-slate-800">+</button>
                                    <button type="button" onClick={handleFit} className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-semibold dark:border-gray-600 dark:bg-slate-800">Fit</button>
                                    <input type="range" min={25} max={150} value={Math.round(canvasScale * 100)} onChange={(e) => { setAutoFit(false); setCanvasScale(Number(e.target.value) / 100) }} className="w-24" />
                                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300">{Math.round(canvasScale * 100)}%</span>
                                </div>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                                <label className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 dark:border-gray-700 dark:bg-gray-800">
                                    <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
                                    Grid
                                </label>
                                <label className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 dark:border-gray-700 dark:bg-gray-800">
                                    <input type="checkbox" checked={showRulers} onChange={(e) => setShowRulers(e.target.checked)} />
                                    Rulers
                                </label>
                                <label className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1 dark:border-gray-700 dark:bg-gray-800">
                                    <input type="checkbox" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} />
                                    Snap To Grid
                                </label>
                            </div>
                        </div>

                        <div ref={stageRef} className="min-h-[65vh] overflow-auto p-4" style={{ backgroundColor: '#ffffff' }}>
                            <div className="mx-auto" style={{ width: `${A4_WIDTH * canvasScale}px`, height: `${A4_HEIGHT * canvasScale}px` }}>
                                <div
                                    ref={dragDropRef}
                                    className="relative origin-top-left"
                                    style={{
                                        width: `${A4_WIDTH}px`,
                                        height: `${A4_HEIGHT}px`,
                                        transform: `scale(${canvasScale})`,
                                        transformOrigin: 'top left',
                                        backgroundColor: '#ffffff',
                                        backgroundImage: showGrid
                                            ? 'linear-gradient(to right, rgba(51, 65, 85, 0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(51, 65, 85, 0.12) 1px, transparent 1px)'
                                            : 'none',
                                        backgroundSize: showGrid ? `${GRID_SIZE}px ${GRID_SIZE}px` : 'auto',
                                    }}
                                    onDragOver={(event) => event.preventDefault()}
                                    onDrop={handleDropOnCanvas}
                                    onMouseMove={handleCanvasMouseMove}
                                    onMouseUp={() => { setDraggingId(null); setResizeState(null) }}
                                    onMouseLeave={() => { setDraggingId(null); setResizeState(null) }}
                                >
                                    <PrescriptionTemplateRenderer
                                        template={template}
                                        clinicImages={localAssets}
                                        visitData={previewVisitData}
                                        prescriptions={previewPrescriptions}
                                        isPro={isPro}
                                    />

                                    {showRulers ? (
                                        <>
                                            <div
                                                className="pointer-events-none absolute left-0 top-0 h-4 w-full border-b border-sky-300/40"
                                                style={{
                                                    zIndex: 2,
                                                    backgroundImage: 'repeating-linear-gradient(to right, rgba(51,65,85,0.25) 0, rgba(51,65,85,0.25) 1px, transparent 1px, transparent 16px)',
                                                }}
                                            />
                                            <div
                                                className="pointer-events-none absolute left-0 top-0 h-full w-4 border-r border-sky-300/40"
                                                style={{
                                                    zIndex: 2,
                                                    backgroundImage: 'repeating-linear-gradient(to bottom, rgba(51,65,85,0.25) 0, rgba(51,65,85,0.25) 1px, transparent 1px, transparent 16px)',
                                                }}
                                            />
                                        </>
                                    ) : null}

                                    {placedAssets.map((block) => (
                                        <div
                                            key={`drag_${block.id}`}
                                            className={`absolute cursor-move rounded border-2 bg-sky-100/20 ${selectedBlockId === block.id ? 'border-sky-600/95' : 'border-sky-500/90'}`}
                                            style={{ left: `${block.x || 0}px`, top: `${block.y || 0}px`, width: `${block.width || 180}px`, height: `${block.height || 90}px`, zIndex: 20 }}
                                            onMouseDown={(event) => {
                                                event.preventDefault()
                                                setSelectedBlockId(block.id)
                                                setDraggingId(block.id)
                                                setDragOffset({
                                                    x: (event.clientX - event.currentTarget.getBoundingClientRect().left) / canvasScale,
                                                    y: (event.clientY - event.currentTarget.getBoundingClientRect().top) / canvasScale,
                                                })
                                            }}
                                        >
                                            <div className="absolute -top-5 left-0 rounded bg-sky-600 px-1.5 py-0.5 text-[10px] font-semibold text-white capitalize">{block.sourceAsset}</div>
                                            <button
                                                type="button"
                                                onMouseDown={(event) => event.stopPropagation()}
                                                onClick={() => removeCustomImageBlock(block.id)}
                                                className="absolute -right-2 -top-2 z-30 h-5 w-5 rounded-full bg-rose-600 text-[10px] font-bold text-white shadow"
                                                title="Delete element"
                                            >
                                                x
                                            </button>
                                            <div className="h-full w-full overflow-hidden rounded">
                                                {block.sourceAsset === 'custom' ? (
                                                    <img
                                                        src={block.url}
                                                        alt={block.alt || 'asset'}
                                                        className="pointer-events-none h-full w-full"
                                                        style={{
                                                            objectFit: block.fitMode || 'contain',
                                                            objectPosition: `${50 + (block.cropX || 0)}% ${50 + (block.cropY || 0)}%`,
                                                            transform: `scale(${block.zoom || 1})`,
                                                            transformOrigin: 'center center',
                                                        }}
                                                    />
                                                ) : (
                                                    <div className="flex h-full w-full items-center justify-center bg-transparent text-[10px] font-semibold text-sky-700/80">
                                                        {String(block.sourceAsset || 'asset').toUpperCase()}
                                                    </div>
                                                )}
                                            </div>

                                            {(['nw', 'ne', 'sw', 'se'] as ResizeDirection[]).map((direction) => (
                                                <button
                                                    key={`${block.id}_${direction}`}
                                                    type="button"
                                                    onMouseDown={(event) => {
                                                        event.preventDefault()
                                                        event.stopPropagation()
                                                        setSelectedBlockId(block.id)
                                                        setResizeState({
                                                            id: block.id,
                                                            direction,
                                                            startMouseX: event.clientX,
                                                            startMouseY: event.clientY,
                                                            startWidth: block.width || 180,
                                                            startHeight: block.height || 90,
                                                            startX: block.x || 0,
                                                            startY: block.y || 0,
                                                        })
                                                    }}
                                                    className={`absolute h-3 w-3 rounded-full border border-white bg-sky-600 ${direction === 'nw' ? '-left-1.5 -top-1.5 cursor-nwse-resize' : ''}${direction === 'ne' ? '-right-1.5 -top-1.5 cursor-nesw-resize' : ''}${direction === 'sw' ? '-left-1.5 -bottom-1.5 cursor-nesw-resize' : ''}${direction === 'se' ? '-bottom-1.5 -right-1.5 cursor-nwse-resize' : ''}`}
                                                    title="Resize"
                                                />
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </main>

                <aside className={`${mobilePane === 'layouts' ? 'block' : 'hidden'} xl:block`}>
                    <div className={`rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-slate-900 transition-all duration-200 ${layoutsExpanded ? 'w-full' : 'xl:w-[60px]'}`}>
                        <button
                            type="button"
                            onClick={() => setLayoutsExpanded((v) => !v)}
                            className="flex w-full items-center justify-between border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-800 dark:border-gray-700 dark:text-gray-100"
                        >
                            <span className="inline-flex items-center gap-1.5">
                                {layoutsExpanded ? (
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                ) : (
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                )}
                                {layoutsExpanded ? 'Layout Templates' : 'Templates'}
                            </span>
                        </button>

                        {layoutsExpanded ? (
                            <div className="max-h-[68vh] space-y-2 overflow-auto p-3">
                                <div className="mb-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800">
                                    <label className="flex items-center justify-between gap-3 text-xs font-semibold text-gray-700 dark:text-gray-200">
                                        <span>Show Pro Templates</span>
                                        <button
                                            type="button"
                                            onClick={() => setShowProTemplates((prev) => !prev)}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${showProTemplates ? 'bg-sky-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                                            aria-pressed={showProTemplates}
                                        >
                                            <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${showProTemplates ? 'translate-x-5' : 'translate-x-1'}`} />
                                        </button>
                                    </label>
                                </div>

                                {visibleTemplates.map((preset) => {
                                    const locked = !!preset.requiresPro && !isPro
                                    const active = preset.id === template.layoutId
                                    return (
                                        <button
                                            key={preset.id}
                                            type="button"
                                            disabled={locked}
                                            onClick={() => applyLayoutPreset(preset)}
                                            className={`w-full rounded-lg border p-3 text-left transition ${locked ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60 dark:border-gray-700 dark:bg-gray-800' : active ? 'border-sky-300 bg-sky-50 dark:border-sky-700 dark:bg-sky-950/20' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-slate-900 dark:hover:bg-slate-800'}`}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div>
                                                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{preset.name}</div>
                                                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{preset.description}</div>
                                                </div>
                                                <div className="space-y-1 text-right">
                                                    {locked ? <span className="block rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">PRO</span> : null}
                                                    {active ? <span className="block rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">ACTIVE</span> : null}
                                                </div>
                                            </div>
                                            <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800">
                                                <div className="rounded border bg-white p-2 dark:bg-slate-900" style={{ borderColor: preset.config.marginColor }}>
                                                    <div className="h-2 rounded bg-gray-200 dark:bg-gray-700" />
                                                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                                                        <div className="h-1.5 rounded bg-gray-200 dark:bg-gray-700" />
                                                        <div className="h-1.5 rounded bg-gray-200 dark:bg-gray-700" />
                                                    </div>
                                                    <div className="mt-2 h-8 rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-slate-950" />
                                                </div>
                                            </div>
                                        </button>
                                    )
                                })}

                                {visibleTemplates.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-gray-300 px-3 py-6 text-center text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                                        No templates in this view.
                                    </div>
                                ) : null}
                            </div>
                        ) : (
                            <div className="hidden xl:flex xl:h-[62vh] xl:items-center xl:justify-center">
                                <span className="-rotate-90 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-400 dark:text-gray-500">Layouts</span>
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    )
}
