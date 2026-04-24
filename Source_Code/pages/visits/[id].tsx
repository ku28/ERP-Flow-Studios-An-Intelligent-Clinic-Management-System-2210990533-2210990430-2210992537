import { useRouter } from 'next/router'
import { Fragment, useEffect, useState, useRef, type CSSProperties } from 'react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import PatientCopyPreview from '../../components/PatientCopyPreview'
import PrescriptionTemplateRenderer from '../../components/prescription-builder/PrescriptionTemplateRenderer'
import type { PrescriptionTemplateConfig } from '../../lib/prescriptionTemplate'
import { notifyAndroidDownloadProgress } from '../../lib/mobileNotifications'
import { downloadPdfBlob, sharePdfWithFallback } from '../../lib/pdfShare'
import { applyAssetsToTemplate, getActiveTemplateFromCollection, normalizeTemplateCollection } from '../../lib/prescriptionTemplate'
import { useAuth } from '../../contexts/AuthContext'

type ExportActionMode = 'DOWNLOAD' | 'PRINT' | 'SHARE'
type ExportScope = 'PATIENT' | 'OFFICE' | 'BOTH'
type PaperMode = 'letterhead' | 'plain'
type AssetScaleKey = 'header' | 'footer' | 'signature' | 'watermark'
type AssetScaleSettings = Record<AssetScaleKey, number>

const ASSET_SCALE_STORAGE_KEY = 'visits-prescription-asset-scales-v1'
const DEFAULT_ASSET_SCALES: AssetScaleSettings = {
    header: 100,
    footer: 100,
    signature: 100,
    watermark: 100,
}

const normalizeClinicAssetUrl = (value: unknown, fallback: string): string => {
    if (typeof value !== 'string') return fallback
    const trimmed = value.trim()
    if (!trimmed) return fallback

    const lowered = trimmed.toLowerCase()
    if (lowered === 'null' || lowered === 'undefined' || lowered === 'n/a') {
        return fallback
    }

    return trimmed
}

export default function VisitDetail() {
    const router = useRouter()
    const { id } = router.query
    const [visit, setVisit] = useState<any>(null)
    const [products, setProducts] = useState<any[]>([])
    const [bottlePricing, setBottlePricing] = useState<any[]>([])
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false)
    const [copyType, setCopyType] = useState<'PATIENT' | 'OFFICE'>('PATIENT')
    const [showExportDropdown, setShowExportDropdown] = useState(false)
    const [expandedExportAction, setExpandedExportAction] = useState<ExportActionMode | null>(null)
    const [hoveredExportAction, setHoveredExportAction] = useState<ExportActionMode | null>(null)
    const [enableWebHoverSubmenus, setEnableWebHoverSubmenus] = useState(false)
    const [paperChoiceModal, setPaperChoiceModal] = useState<{ open: boolean; action: ExportActionMode; scope: ExportScope }>({
        open: false,
        action: 'DOWNLOAD',
        scope: 'PATIENT'
    })
    const [selectedPaperType, setSelectedPaperType] = useState<PaperMode>('plain')
    const [paperPreviewThumbs, setPaperPreviewThumbs] = useState<{
        plain: string | null
        letterhead: string | null
        loading: boolean
        plainPreviewCopyType: 'PATIENT' | 'OFFICE' | null
        letterheadPreviewCopyType: 'PATIENT' | 'OFFICE' | null
    }>({
        plain: null,
        letterhead: null,
        loading: false,
        plainPreviewCopyType: null,
        letterheadPreviewCopyType: null,
    })
    const [showReportsDropdown, setShowReportsDropdown] = useState(false)
    const [reportsAttachments, setReportsAttachments] = useState<Array<{ url: string, name: string, type: string }>>([])
    const [selectedReportUrl, setSelectedReportUrl] = useState<string | null>(null)
    const [selectedReportName, setSelectedReportName] = useState<string>('')
    const [isPdfReady, setIsPdfReady] = useState(false)
    const [clinicImages, setClinicImages] = useState<{
        header: string
        footer: string
        watermark: string
        signature: string
    }>({ header: '', footer: '', watermark: '', signature: '' })
    const [userData, setUserData] = useState<any>(null)
    const [isPro, setIsPro] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('clinicIsPro') === '1' : false)
    const [themeColor, setThemeColor] = useState('#0000FF')
    const [isClinicAssetsReady, setIsClinicAssetsReady] = useState(false)
    const [isVisitLoaded, setIsVisitLoaded] = useState(false)
    const [prescriptionTemplate, setPrescriptionTemplate] = useState<PrescriptionTemplateConfig | null>(null)
    const [patientPreviewPage, setPatientPreviewPage] = useState<1 | 2>(1)
    const [copyFlipPhase, setCopyFlipPhase] = useState<'idle' | 'out' | 'in'>('idle')
    const [copyFlipDir, setCopyFlipDir] = useState<'left' | 'right'>('right')
    const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
    const [assetScaleSettings, setAssetScaleSettings] = useState<AssetScaleSettings>(DEFAULT_ASSET_SCALES)
    const [assetScaleDraft, setAssetScaleDraft] = useState<AssetScaleSettings>(DEFAULT_ASSET_SCALES)
    const prescriptionRef = useRef<HTMLDivElement>(null)
    const patientPageOneRef = useRef<HTMLDivElement>(null)
    const patientPageTwoRef = useRef<HTMLDivElement>(null)

    // Helper function to darken a hex color (makes it 30% darker for better visibility)
    const darkenColor = (hex: string, percent: number = 0.3): string => {
        const num = parseInt(hex.replace('#', ''), 16)
        const r = Math.max(0, Math.floor((num >> 16) * (1 - percent)))
        const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) * (1 - percent)))
        const b = Math.max(0, Math.floor((num & 0x0000FF) * (1 - percent)))
        return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
    }

    const renderFloatingVisitSectionLabel = (title: string) => (
        <div style={{ position: 'absolute', top: '0', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', inset: '0', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff', borderRadius: '2px' }}></div>
            <span style={{ position: 'relative', display: 'block', padding: '0 4px 1px 4px', color: '#000', fontWeight: 'bold', fontSize: '11px', lineHeight: '1' }}>{title}</span>
        </div>
    )

    const clampScalePercent = (value: number): number => Math.max(50, Math.min(220, Math.round(value)))

    const normalizeAssetScaleSettings = (input?: Partial<AssetScaleSettings> | null): AssetScaleSettings => ({
        header: clampScalePercent(input?.header ?? DEFAULT_ASSET_SCALES.header),
        footer: clampScalePercent(input?.footer ?? DEFAULT_ASSET_SCALES.footer),
        signature: clampScalePercent(input?.signature ?? DEFAULT_ASSET_SCALES.signature),
        watermark: clampScalePercent(input?.watermark ?? DEFAULT_ASSET_SCALES.watermark),
    })

    const persistAssetScaleSettings = (settings: AssetScaleSettings) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem(ASSET_SCALE_STORAGE_KEY, JSON.stringify(settings))
        }
    }

    const updateDraftScale = (key: AssetScaleKey, value: number) => {
        setAssetScaleDraft(prev => {
            const next = normalizeAssetScaleSettings({ ...prev, [key]: value })
            setAssetScaleSettings(next)
            return next
        })
    }

    const nudgeDraftScale = (key: AssetScaleKey, delta: number) => {
        setAssetScaleDraft(prev => {
            const next = normalizeAssetScaleSettings({ ...prev, [key]: (prev[key] || 100) + delta })
            setAssetScaleSettings(next)
            return next
        })
    }

    const applyAssetScaleChanges = () => {
        const normalized = normalizeAssetScaleSettings(assetScaleDraft)
        setAssetScaleDraft(normalized)
        setAssetScaleSettings(normalized)
        persistAssetScaleSettings(normalized)
    }

    const resetAssetScaleChanges = () => {
        setAssetScaleDraft(DEFAULT_ASSET_SCALES)
        setAssetScaleSettings(DEFAULT_ASSET_SCALES)
        persistAssetScaleSettings(DEFAULT_ASSET_SCALES)
    }

    const getScaledImageStyle = (
        baseStyle: CSSProperties,
        scalePercent: number,
        origin: string = 'center center'
    ): CSSProperties => ({
        ...baseStyle,
        transform: `scale(${(scalePercent / 100).toFixed(3)})`,
        transformOrigin: origin,
    })

    const goToPatientPreviewPage = (page: 1 | 2) => {
        setPatientPreviewPage(page)
    }

    const waitForPreviewToSettle = async (delayMs: number = 160) => {
        await new Promise(resolve => setTimeout(resolve, delayMs))
        await new Promise<void>(resolve => {
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
    }

    const waitForCopyTypeRender = async (targetCopyType: 'PATIENT' | 'OFFICE', timeoutMs: number = 1800) => {
        const startedAt = Date.now()
        while (Date.now() - startedAt < timeoutMs) {
            await waitForPreviewToSettle(90)
            const renderedType = prescriptionRef.current?.getAttribute('data-copy-type') as 'PATIENT' | 'OFFICE' | null
            if (!renderedType || renderedType === targetCopyType) {
                return
            }
        }
    }

    useEffect(() => {
        if (typeof window === 'undefined') return

        const cap = (window as any).Capacitor
        const isNativeCapacitor = !!cap && (
            (typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) ||
            cap.getPlatform?.() === 'android' ||
            cap.getPlatform?.() === 'ios'
        )
        const isElectron = !!(window as any).electronAPI
        const media = window.matchMedia('(hover: hover) and (pointer: fine)')

        const update = () => {
            setEnableWebHoverSubmenus(!isElectron && !isNativeCapacitor && media.matches)
        }

        update()

        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', update)
            return () => media.removeEventListener('change', update)
        }

        media.addListener(update)
        return () => media.removeListener(update)
    }, [])

    const closeExportMenu = () => {
        setShowExportDropdown(false)
        setExpandedExportAction(null)
        setHoveredExportAction(null)
    }

    const openPaperChoiceModal = (action: ExportActionMode, scope: ExportScope) => {
        closeExportMenu()
        setSelectedPaperType('plain')
        setPaperPreviewThumbs({ plain: null, letterhead: null, loading: true, plainPreviewCopyType: null, letterheadPreviewCopyType: null })
        setPaperChoiceModal({ open: true, action, scope })
    }

    const closePaperChoiceModal = () => {
        setPaperChoiceModal(prev => ({ ...prev, open: false }))
    }

    const toggleCopyTypeWithFlip = () => {
        if (copyFlipPhase !== 'idle') return

        const nextType: 'PATIENT' | 'OFFICE' = copyType === 'PATIENT' ? 'OFFICE' : 'PATIENT'
        const direction: 'left' | 'right' = nextType === 'OFFICE' ? 'right' : 'left'

        setCopyFlipDir(direction)
        setCopyFlipPhase('out')

        setTimeout(() => {
            setCopyType(nextType)
            setCopyFlipPhase('in')
            setTimeout(() => setCopyFlipPhase('idle'), 240)
        }, 180)
    }

    const renderPatientPrescriptionTableContent = (items: any[], startIndex: number = 0) => {
        const hasSpy4 = visit?.prescriptions?.some((p: any) => p.spy4) || false
        const hasSpy6 = visit?.prescriptions?.some((p: any) => p.spy6) || false

        return (
            <table className="w-full" style={{ fontSize: '0.70rem', borderCollapse: 'collapse' }}>
                <tbody>
                    {items.length === 0 ? (
                        <tr>
                            <td colSpan={11} style={{ textAlign: 'center', padding: '1rem', color: '#999' }}>No medications prescribed</td>
                        </tr>
                    ) : (
                        items.map((p: any, index: number) => {
                            const serialNumber = startIndex + index + 1
                            const product = products.find((prod: any) => String(prod.id) === String(p.productId))
                            const medicineName = (product?.name || p.product?.name || p.treatment?.treatmentPlan || '').toUpperCase()
                            const textColor = p.patientHasMedicine ? '#FF0000' : '#000'

                            return (
                                <tr key={`${p.id || 'rx'}-${serialNumber}`}>
                                    <td style={{ padding: '0.1rem 0.2rem', textAlign: 'center', width: '3%', fontWeight: 'bold', fontSize: '0.65rem', color: textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{serialNumber}</td>
                                    <td style={{ padding: '0.1rem 0.2rem', textAlign: 'left', color: textColor, width: '15%', fontWeight: 'bold', fontSize: '0.70rem', whiteSpace: 'normal', lineHeight: '1.2', minHeight: '1.5rem' }}>{medicineName}</td>
                                    <td style={{ padding: '0.1rem 0.2rem', textAlign: 'center', width: '6%', color: textColor, fontWeight: 'bold', fontSize: '0.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}></td>
                                    <td style={{ padding: '0.1rem 0.2rem', textAlign: 'center', width: '6%', color: textColor, fontWeight: 'bold', fontSize: '0.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}></td>
                                    <td style={{ padding: '0.1rem 0.2rem', textAlign: 'center', width: '6%', color: textColor, fontWeight: 'bold', fontSize: '0.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}></td>
                                    {hasSpy4 && <td style={{ padding: '0.1rem 0.2rem', textAlign: 'center', width: '6%', color: textColor, fontWeight: 'bold', fontSize: '0.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}></td>}
                                    {hasSpy6 && <td style={{ padding: '0.1rem 0.2rem', textAlign: 'center', width: '6%', color: textColor, fontWeight: 'bold', fontSize: '0.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}></td>}
                                    <td style={{ padding: '0.1rem 0.2rem', textAlign: 'center', color: textColor, textTransform: 'uppercase', width: '8%', fontWeight: 'bold', fontSize: '0.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(p.timing || '').replace(/\|/g, '/')}</td>
                                    <td style={{ padding: '0.1rem 0.2rem', textAlign: 'center', width: '6%', color: textColor, fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(() => { const dosage = (p.dosage || '').replace(/\|/g, '/'); const parts = dosage.split('/'); if (p.presentation && parts.length > 1) { parts.splice(1, 0, p.presentation); } return parts.join('/'); })()}</td>
                                    <td style={{ padding: '0.1rem 0.2rem', textAlign: 'center', width: '6%', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.6rem', color: textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.additions || ''}</td>
                                    <td style={{ padding: '0.1rem 0.2rem', textAlign: 'center', width: '8%', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.6rem', color: textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}></td>
                                    <td style={{ padding: '0.1rem 0.2rem', textAlign: 'center', width: '6%', color: textColor, fontWeight: 'bold', fontSize: '0.6rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(p.droppersToday?.toString() || '').toUpperCase()}</td>
                                </tr>
                            )
                        })
                    )}
                </tbody>
            </table>
        )
    }

    // Helper function to reconstruct MISC products from prescriptions
    const reconstructMiscProducts = (visitData: any, allProducts: any[]) => {
        const miscItems: { name: string; quantity: number }[] = []

        // Add default MISC products (RX PAD, FILE COVER, ENVELOPS) - 1 of each
        const defaultMiscNames = ['RX PAD', 'FILE COVER', 'ENVELOPS']
        defaultMiscNames.forEach(name => {
            miscItems.push({ name, quantity: 1 })
        })

        // Add droppers from prescriptions
        if (visitData.prescriptions) {
            visitData.prescriptions.forEach((pr: any) => {
                if (pr.selectedDropper) {
                    const dropperProduct = allProducts.find((p: any) => String(p.id) === String(pr.selectedDropper))
                    if (dropperProduct) {
                        miscItems.push({ name: dropperProduct.name, quantity: 1 })
                    }
                }

                // Add labels if included
                if (pr.includeLabelProduct !== false && pr.selectedLabel) {
                    miscItems.push({ name: pr.selectedLabel, quantity: 1 })
                }
            })
        }

        return miscItems
    }

    const isCrossOriginImageSrc = (src: string): boolean => {
        if (!src || src.startsWith('data:') || src.startsWith('blob:')) {
            return false
        }

        try {
            const url = new URL(src, window.location.origin)
            return url.origin !== window.location.origin
        } catch {
            return false
        }
    }

    const preloadImage = (src?: string): Promise<boolean> => {
        if (!src) return Promise.resolve(false)

        return new Promise((resolve) => {
            const img = new Image()
            img.onload = () => resolve(true)
            img.onerror = () => resolve(false)
            img.src = src
        })
    }

    const capturePrescriptionCanvas = async (element: HTMLElement, forceA4Width: boolean = true) => {
        const uniqueId = 'print-target-' + Math.random().toString(36).slice(2, 11)
        element.setAttribute('data-print-target', uniqueId)

        const bounds = element.getBoundingClientRect()
        const captureWidth = Math.max(1, Math.ceil(bounds.width || element.clientWidth || element.offsetWidth || 0))
        const captureHeight = Math.max(1, Math.ceil(bounds.height || element.clientHeight || element.offsetHeight || 0))

        const attempts = [
            { scale: 2, hideCrossOrigin: false },
            { scale: 1.5, hideCrossOrigin: false },
            { scale: 1.25, hideCrossOrigin: true },
        ]

        let lastError: unknown = null

        const isCanvasMostlyBlank = (canvas: HTMLCanvasElement): boolean => {
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            if (!ctx) return true

            const width = canvas.width
            const height = canvas.height
            if (width === 0 || height === 0) return true

            const step = Math.max(8, Math.floor(Math.min(width, height) / 180))
            const data = ctx.getImageData(0, 0, width, height).data

            let sampled = 0
            let nonWhite = 0

            for (let y = 0; y < height; y += step) {
                for (let x = 0; x < width; x += step) {
                    const i = (y * width + x) * 4
                    const r = data[i]
                    const g = data[i + 1]
                    const b = data[i + 2]
                    const a = data[i + 3]

                    sampled += 1
                    if (a > 8 && (r < 245 || g < 245 || b < 245)) {
                        nonWhite += 1
                    }
                }
            }

            if (sampled === 0) return true
            return (nonWhite / sampled) < 0.003
        }

        for (const attempt of attempts) {
            const hiddenCanvases: Array<{ el: HTMLCanvasElement; display: string }> = []
            const createPatternProto = typeof window !== 'undefined' ? window.CanvasRenderingContext2D?.prototype : undefined
            const originalCreatePattern = createPatternProto?.createPattern

            element.querySelectorAll('canvas').forEach((node) => {
                const canvas = node as HTMLCanvasElement
                hiddenCanvases.push({ el: canvas, display: canvas.style.display })
                canvas.style.display = 'none'
            })

            try {
                if (createPatternProto && originalCreatePattern) {
                    createPatternProto.createPattern = function (image: CanvasImageSource, repetition: string | null) {
                        try {
                            if (image instanceof HTMLCanvasElement && (image.width === 0 || image.height === 0)) {
                                const fallback = document.createElement('canvas')
                                fallback.width = 1
                                fallback.height = 1
                                const ctx = fallback.getContext('2d')
                                if (ctx) {
                                    ctx.clearRect(0, 0, 1, 1)
                                }
                                return originalCreatePattern.call(this, fallback, repetition)
                            }
                            return originalCreatePattern.call(this, image, repetition)
                        } catch {
                            const fallback = document.createElement('canvas')
                            fallback.width = 1
                            fallback.height = 1
                            return originalCreatePattern.call(this, fallback, repetition)
                        }
                    }
                }

                const captured = await html2canvas(element, {
                    x: 0,
                    y: 0,
                    scale: attempt.scale,
                    useCORS: true,
                    allowTaint: false,
                    foreignObjectRendering: false,
                    logging: false,
                    backgroundColor: '#ffffff',
                    imageTimeout: 20000,
                    windowWidth: captureWidth,
                    windowHeight: captureHeight,
                    scrollX: 0,
                    scrollY: 0,
                    width: captureWidth,
                    height: captureHeight,
                    ignoreElements: (node) => {
                        if (node.nodeName === 'CANVAS') {
                            return true
                        }
                        return false
                    },
                    onclone: (clonedDoc) => {
                        const clonedElement = clonedDoc.querySelector('[data-print-target="' + uniqueId + '"]') as HTMLElement
                        if (clonedElement) {
                            clonedElement.scrollTop = 0
                            clonedElement.scrollLeft = 0
                        }

                        // Always drop canvases from clone to avoid createPattern zero-size crashes.
                        clonedDoc.querySelectorAll('canvas').forEach((node) => {
                            node.remove()
                        })

                        // Remove zero-sized nodes that can produce invalid background paints.
                        clonedDoc.querySelectorAll('*').forEach((node) => {
                            const el = node as HTMLElement
                            const w = el.offsetWidth || 0
                            const h = el.offsetHeight || 0
                            if ((w === 0 || h === 0) && el.style.backgroundImage && el.style.backgroundImage !== 'none') {
                                el.style.backgroundImage = 'none'
                            }
                        })

                        // Hide broken images in clone that have no intrinsic size.
                        clonedDoc.querySelectorAll('img').forEach((img) => {
                            const i = img as HTMLImageElement
                            if ((i.naturalWidth || 0) === 0 || (i.naturalHeight || 0) === 0) {
                                i.style.visibility = 'hidden'
                            }
                        })

                        if (attempt.hideCrossOrigin) {
                            clonedDoc.querySelectorAll('img').forEach((img) => {
                                const src = img.getAttribute('src') || ''
                                if (isCrossOriginImageSrc(src)) {
                                    (img as HTMLImageElement).style.visibility = 'hidden'
                                }
                            })
                        }
                    }
                })

                if (isCanvasMostlyBlank(captured)) {
                    throw new Error('Captured preview appears blank')
                }

                return captured
            } catch (error) {
                lastError = error
            } finally {
                element.removeAttribute('data-print-target')
                if (createPatternProto && originalCreatePattern) {
                    createPatternProto.createPattern = originalCreatePattern
                }
                hiddenCanvases.forEach(({ el, display }) => {
                    el.style.display = display
                })
            }
        }

        throw lastError || new Error('Canvas capture failed')
    }

    const sanitizePdfFileName = (name: string): string => {
        const cleaned = name
            .replace(/[\\/:*?"<>|]+/g, '-')
            .replace(/[\u0000-\u001f\u007f]+/g, '')
            .replace(/\s+/g, ' ')
            .trim()

        if (!cleaned) {
            return 'prescription.pdf'
        }

        return cleaned.toLowerCase().endsWith('.pdf') ? cleaned : `${cleaned}.pdf`
    }

    const appendCanvasToPdf = (pdf: jsPDF, canvas: HTMLCanvasElement, startOnNewPage: boolean = false) => {
        const pdfWidth = 210
        const pdfHeight = 297

        if (startOnNewPage) {
            pdf.addPage()
        }

        // Keep lossless image data so exported PDF matches preview capture as closely as possible.
        const imgData = canvas.toDataURL('image/png')
        const imgHeight = (canvas.height * pdfWidth) / canvas.width

        let remainingHeight = imgHeight
        let position = 0

        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight, undefined, 'FAST')
        remainingHeight -= pdfHeight

        while (remainingHeight > 0.5) {
            position = remainingHeight - imgHeight
            pdf.addPage()
            pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, imgHeight, undefined, 'FAST')
            remainingHeight -= pdfHeight
        }
    }

    const getActivePrescriptionElement = (targetCopyType: 'PATIENT' | 'OFFICE' = copyType) => {
        // Always prefer the visible preview surface so print/download matches exactly what user sees.
        if (prescriptionRef.current) {
            return prescriptionRef.current
        }
        return null
    }

    const normalizeElementForA4Output = (element: HTMLElement) => {
        const originalScrollTop = element.scrollTop
        const originalScrollLeft = element.scrollLeft
        element.scrollTop = 0
        element.scrollLeft = 0

        return () => {
            element.scrollTop = originalScrollTop
            element.scrollLeft = originalScrollLeft
        }
    }

    const getCaptureElementsForCopy = (targetCopyType: 'PATIENT' | 'OFFICE'): HTMLElement[] => {
        const element = getActivePrescriptionElement(targetCopyType)
        return element ? [element] : []
    }

    const captureCanvasFromClonedPreview = async (
        sourceElement: HTMLElement,
        paperType: PaperMode,
        options?: { removeOverflowPage?: boolean }
    ): Promise<HTMLCanvasElement> => {
        const sandbox = document.createElement('div')
        sandbox.style.position = 'fixed'
        sandbox.style.left = '-99999px'
        sandbox.style.top = '0'
        sandbox.style.pointerEvents = 'none'
        sandbox.style.opacity = '0'
        sandbox.style.width = '210mm'
        sandbox.style.background = '#ffffff'

        const clone = sourceElement.cloneNode(true) as HTMLElement
        clone.querySelectorAll('.patient-page-nav').forEach(node => node.remove())
        clone.querySelectorAll('.patient-pages-track').forEach((node) => {
            const track = node as HTMLElement
            track.style.transform = 'translate3d(0, 0, 0)'
            track.style.transition = 'none'
        })
        if (options?.removeOverflowPage) {
            clone.querySelectorAll('.patient-overflow-page').forEach(node => node.remove())
        }

        if (paperType === 'letterhead') {
            clone.classList.add('print-letterhead')
            const clonedRoot = clone.classList.contains('prescription-container')
                ? clone
                : (clone.querySelector('.prescription-container') as HTMLElement | null)
            if (clonedRoot) {
                clonedRoot.classList.add('print-letterhead')
            }
        }

        sandbox.appendChild(clone)
        document.body.appendChild(sandbox)

        try {
            await waitForPreviewToSettle(80)
            const captureTarget = clone.classList.contains('prescription-container')
                ? clone
                : ((clone.querySelector('.prescription-container') as HTMLElement | null) || clone)
            return await capturePrescriptionCanvas(captureTarget)
        } finally {
            if (sandbox.parentNode) {
                sandbox.parentNode.removeChild(sandbox)
            }
        }
    }

    const captureCanvasesForCopy = async (
        targetCopyType: 'PATIENT' | 'OFFICE',
        paperType: 'letterhead' | 'plain'
    ): Promise<HTMLCanvasElement[]> => {
        const activeRoot = getActivePrescriptionElement(targetCopyType)
        const overflowElement = ((activeRoot?.querySelector('.patient-overflow-page') as HTMLElement | null) || patientPageTwoRef.current)
        const isPatientOverflowMode = targetCopyType === 'PATIENT' && !prescriptionTemplate && hasPatientOverflowPage
        if (isPatientOverflowMode && activeRoot && overflowElement) {
            const firstCanvas = await captureCanvasFromClonedPreview(activeRoot, paperType, { removeOverflowPage: true })
            const secondCanvas = await captureCanvasFromClonedPreview(overflowElement, paperType)
            return [firstCanvas, secondCanvas]
        }

        const elements = getCaptureElementsForCopy(targetCopyType)
        if (elements.length === 0) {
            throw new Error('Prescription preview is not ready for capture')
        }

        const canvases: HTMLCanvasElement[] = []
        for (const el of elements) {
            const canvas = await captureCanvasFromClonedPreview(el, paperType)
            canvases.push(canvas)
        }

        return canvases
    }

    const buildPaperPreviewMarkup = (
        targetCopyType: 'PATIENT' | 'OFFICE',
        paperType: PaperMode
    ): string | null => {
        const sourceElement = getActivePrescriptionElement(targetCopyType)
        if (!sourceElement) {
            return null
        }

        const clone = sourceElement.cloneNode(true) as HTMLElement
        clone.querySelectorAll('.patient-page-nav').forEach(node => node.remove())
        clone.querySelectorAll('.patient-pages-track').forEach((node) => {
            const track = node as HTMLElement
            track.style.transform = 'translate3d(0, 0, 0)'
            track.style.transition = 'none'
        })
        clone.querySelectorAll('.patient-overflow-page').forEach(node => node.remove())
        clone.querySelectorAll('[data-margin-header-title="true"]').forEach((node) => {
            ;(node as HTMLElement).style.transform = 'none'
        })

        if (paperType === 'letterhead') {
            clone.classList.add('print-letterhead')
            const clonedRoot = clone.classList.contains('prescription-container')
                ? clone
                : (clone.querySelector('.prescription-container') as HTMLElement | null)
            if (clonedRoot) {
                clonedRoot.classList.add('print-letterhead')
            }
        }

        return clone.outerHTML
    }

    useEffect(() => {
        if (typeof window === 'undefined') return

        try {
            const raw = localStorage.getItem(ASSET_SCALE_STORAGE_KEY)
            if (!raw) return
            const parsed = JSON.parse(raw) as Partial<AssetScaleSettings>
            const normalized = normalizeAssetScaleSettings(parsed)
            setAssetScaleSettings(normalized)
            setAssetScaleDraft(normalized)
        } catch {
        }
    }, [])

    useEffect(() => {
        if (!paperChoiceModal.open || !visit || isGeneratingPDF) {
            return
        }

        let cancelled = false
        const plainPreviewCopyType: 'PATIENT' | 'OFFICE' = paperChoiceModal.scope === 'BOTH' ? 'PATIENT' : copyType
        const letterheadPreviewCopyType: 'PATIENT' | 'OFFICE' = paperChoiceModal.scope === 'BOTH' ? 'OFFICE' : copyType

        const buildPaperPreviews = async () => {
            setPaperPreviewThumbs({
                plain: null,
                letterhead: null,
                loading: true,
                plainPreviewCopyType,
                letterheadPreviewCopyType,
            })

            try {
                await waitForPreviewToSettle(220)

                const plainMarkup = buildPaperPreviewMarkup(plainPreviewCopyType, 'plain')
                if (cancelled) return

                const letterheadMarkup = buildPaperPreviewMarkup(letterheadPreviewCopyType, 'letterhead')
                if (cancelled) return

                setPaperPreviewThumbs({
                    plain: plainMarkup,
                    letterhead: letterheadMarkup,
                    loading: false,
                    plainPreviewCopyType,
                    letterheadPreviewCopyType,
                })
            } catch {
                if (!cancelled) {
                    setPaperPreviewThumbs(prev => ({
                        ...prev,
                        loading: false,
                        plainPreviewCopyType,
                        letterheadPreviewCopyType,
                    }))
                }
            }
        }

        buildPaperPreviews()

        return () => {
            cancelled = true
        }
    }, [paperChoiceModal.open, paperChoiceModal.scope, visit?.id, assetScaleSettings, copyType])

    const printCanvasInIsolatedFrame = async (canvasesInput: HTMLCanvasElement | HTMLCanvasElement[]) => {
        const canvases = Array.isArray(canvasesInput) ? canvasesInput : [canvasesInput]
        const iframe = document.createElement('iframe')
        iframe.style.position = 'fixed'
        iframe.style.width = '0'
        iframe.style.height = '0'
        iframe.style.border = '0'
        iframe.style.right = '0'
        iframe.style.bottom = '0'
        document.body.appendChild(iframe)

        const frameDoc = iframe.contentDocument || iframe.contentWindow?.document
        if (!frameDoc) {
            document.body.removeChild(iframe)
            throw new Error('Unable to initialize print frame')
        }

        const pagesMarkup = canvases.map((canvas, index) => {
            const imgData = canvas.toDataURL('image/png')
            const isLast = index === canvases.length - 1
            return `<div class="page${isLast ? ' last' : ''}"><img src="${imgData}" alt="Prescription Page ${index + 1}" /></div>`
        }).join('')

        frameDoc.open()
        frameDoc.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Prescription Print</title>
  <style>
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
        .page { width: 210mm; min-height: 297mm; margin: 0; page-break-after: always; break-after: page; }
        .page.last { page-break-after: auto; break-after: auto; }
    img { width: 210mm; height: auto; display: block; }
  </style>
</head>
<body>
    ${pagesMarkup}
</body>
</html>`)
        frameDoc.close()

        await new Promise(resolve => setTimeout(resolve, 180))
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()

        setTimeout(() => {
            if (iframe.parentNode) {
                iframe.parentNode.removeChild(iframe)
            }
        }, 1200)
    }

    const printPrescriptionCopy = async (
        targetCopyType: 'PATIENT' | 'OFFICE',
        paperType: 'letterhead' | 'plain'
    ) => {
        const canvases = await captureCanvasesForCopy(targetCopyType, paperType)
        await printCanvasInIsolatedFrame(canvases)
    }

    const { user: authUser } = useAuth()

    useEffect(() => {
        let active = true

        const loadClinicAssets = async () => {
            setIsClinicAssetsReady(false)
            try {
                // Use AuthContext user instead of fetching /api/auth/me
                const userData = authUser
                if (!userData) return

                const fallbackImages = {
                    header: '/header.png',
                    footer: '/footer.png',
                    watermark: '',
                    signature: ''
                }

                const rawImages = userData.clinic ? {
                    header: normalizeClinicAssetUrl(userData.clinic.prescriptionHeaderUrl, fallbackImages.header),
                    footer: normalizeClinicAssetUrl(userData.clinic.prescriptionFooterUrl, fallbackImages.footer),
                    watermark: normalizeClinicAssetUrl(userData.clinic.prescriptionWatermarkUrl, fallbackImages.watermark)
                        || normalizeClinicAssetUrl(userData.clinic.iconUrl, fallbackImages.watermark),
                    signature: normalizeClinicAssetUrl(userData.clinic.prescriptionSignatureUrl, fallbackImages.signature),
                } : fallbackImages

                const nextImages = {
                    ...rawImages,
                }

                if (!active) return
                setClinicImages(nextImages)

                try {
                    const templateResponse = await fetch('/api/clinic/prescription-template', { cache: 'no-store' })
                    if (templateResponse.ok) {
                        const templateData = await templateResponse.json()
                        const collection = normalizeTemplateCollection(templateData.collection || templateData)
                        const activeTemplate = collection.activeTemplateId
                            ? getActiveTemplateFromCollection(collection)
                            : null
                        if (activeTemplate?.template) {
                            setPrescriptionTemplate(applyAssetsToTemplate(activeTemplate.template, {
                                headerUrl: nextImages.header,
                                footerUrl: nextImages.footer,
                                signatureUrl: nextImages.signature,
                                watermarkUrl: nextImages.watermark,
                            }))
                        } else {
                            setPrescriptionTemplate(null)
                        }
                    }
                } catch { }

                if (userData.clinic) {
                    // Check subscription status — plan is required to be 'pro';
                    // if a subscriptionEnd is set it must not yet have expired
                    const subPlan = userData.clinic.subscriptionPlan
                    const subEnd = userData.clinic.subscriptionEnd
                    const isSubscribed = subPlan === 'pro' && (!subEnd || new Date(subEnd) > new Date())
                    setIsPro(isSubscribed)

                    // Map gradient name → hex so darkenColor() gets a real hex value
                    const gradientHexMap: Record<string, string> = {
                        blue: '#3B82F6',
                        purple: '#8B5CF6',
                        emerald: '#10B981',
                        rose: '#F43F5E',
                        teal: '#22C55E',
                        green: '#22C55E',
                    }
                    const gradientName = userData.clinic.themeGradient || 'blue'
                    setThemeColor(gradientHexMap[gradientName] || '#3B82F6')
                }

                setUserData(userData)

                await Promise.all([
                    preloadImage(nextImages.header),
                    preloadImage(nextImages.footer),
                    preloadImage(nextImages.watermark),
                    preloadImage(nextImages.signature)
                ])
            } catch {
            } finally {
                if (active) {
                    setIsClinicAssetsReady(true)
                }
            }
        }

        loadClinicAssets()

        return () => {
            active = false
        }
    }, [authUser])

    useEffect(() => {
        if (!id) return
        setIsVisitLoaded(false)

        // Fetch the specific visit by ID instead of all visits
        fetch(`/api/visits?id=${id}`).then(r => r.json()).then(visitData => {
            setVisit(visitData)
            // Parse reportsAttachments if it exists (stored as JSON string)
            if (visitData.reportsAttachments) {
                try {
                    const parsed = JSON.parse(visitData.reportsAttachments)
                    if (Array.isArray(parsed)) {
                        setReportsAttachments(parsed)
                    }
                } catch (e) {
                    setReportsAttachments([])
                }
            }
        }).finally(() => {
            setIsVisitLoaded(true)
        })

        // Fetch products for medicine names
        fetch('/api/products').then(r => r.json()).then(data => {
            setProducts(data)
        }).catch(() => { })

        // Fetch bottle pricing
        fetch('/api/options/bottle-pricing').then(r => r.json()).then(data => {
            setBottlePricing(data)
        }).catch(() => { })
    }, [id])

    // Effect to check when DOM is ready for PDF generation
    useEffect(() => {
        if (visit && isClinicAssetsReady && getActivePrescriptionElement()) {
            setIsPdfReady(true)
        }
    }, [visit, isClinicAssetsReady, prescriptionTemplate])

    useEffect(() => {
        prescriptionRef.current?.classList.remove('print-letterhead')
    }, [copyType, visit?.id, isClinicAssetsReady])

    useEffect(() => {
        setPatientPreviewPage(1)
    }, [copyType, visit?.id])

    useEffect(() => {
        if (visit && isVisitLoaded && isClinicAssetsReady && typeof window !== 'undefined') {
            window.dispatchEvent(new Event('page-data-loaded'))
        }
    }, [visit, isVisitLoaded, isClinicAssetsReady])

    // Separate effect to handle PDF generation after DOM is ready
    useEffect(() => {
        if (!visit || !isPdfReady) {
            return
        }

        // Auto-generate and upload office PDF if not already done (skip imported visits)
        if (visit.prescriptions && visit.prescriptions.length > 0 && !visit.isImported && !visit.officeCopyPdfUrl) {

            // Wait for DOM to be fully ready and rendered
            const timer = setTimeout(() => {
                if (getActivePrescriptionElement()) {
                    generateAndUploadPdfs(visit)
                } else {
                }
            }, 2000)

            return () => clearTimeout(timer)
        } else {
        }
    }, [visit, isPdfReady])

    const generateAndUploadPdfs = async (visitData: any) => {
        if (!visitData || !getActivePrescriptionElement()) {
            return
        }

        try {

            // Wait for the component to render
            await new Promise(resolve => setTimeout(resolve, 1000))

            // Store ref to avoid losing it during state changes
            const refElement = getActivePrescriptionElement('OFFICE')

            // Generate only office copy PDF
            const originalCopyType = copyType
            setCopyType('OFFICE')
            await new Promise(resolve => setTimeout(resolve, 800))

            const officeCopyUrl = await uploadPdfToCloudinary('OFFICE', visitData, refElement)

            // Reset to original copy type
            setCopyType(originalCopyType)

            // Update visit with office PDF URL only
            if (officeCopyUrl) {
                const updateResponse = await fetch('/api/visits', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        id: visitData.id,
                        officeCopyPdfUrl: officeCopyUrl,
                        patientId: visitData.patientId,
                        opdNo: visitData.opdNo
                    })
                })

                if (updateResponse.ok) {
                    // Refresh visit data
                    const updatedVisit = await fetch(`/api/visits?id=${id}`).then(r => r.json())
                    setVisit(updatedVisit)
                } else {
                    const errorText = await updateResponse.text()
                }
            } else {
            }
        } catch (error) {
        }
    }
    const uploadPdfToCloudinary = async (type: 'PATIENT' | 'OFFICE', visitData?: any, refElement?: HTMLDivElement | null) => {
        const currentVisit = visitData || visit
        const elementToCapture = refElement || getActivePrescriptionElement(type)

        if (!currentVisit || !elementToCapture) {
            return null
        }

        try {

            // Force A4 width
            const originalWidth = elementToCapture.style.width
            elementToCapture.style.width = '794px'
            await new Promise(resolve => setTimeout(resolve, 100))

            // Capture as canvas
            const canvas = await capturePrescriptionCanvas(elementToCapture)

            // Restore width
            elementToCapture.style.width = originalWidth


            // Convert canvas to PDF
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
                compress: true
            })

            const pdfWidth = 210
            const imgData = canvas.toDataURL('image/png')
            const imgProps = pdf.getImageProperties(imgData)
            const imgHeight = (imgProps.height * pdfWidth) / imgProps.width

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, imgHeight)

            // Get PDF as base64 data URI
            const pdfDataUri = pdf.output('datauristring')

            // Upload to Cloudinary with timeout

            const controller = new AbortController()
            const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout

            try {
                const response = await fetch('/api/pdf/upload-cloudinary', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        pdfData: pdfDataUri,
                        filename: `${String(currentVisit.opdNo || currentVisit.id || 'visit').replace(/\s+/g, '-')}-${type.toLowerCase()}`
                    }),
                    signal: controller.signal
                })

                clearTimeout(timeoutId)

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
                    return null
                }

                const result = await response.json()

                return result.url
            } catch (fetchError: any) {
                clearTimeout(timeoutId)
                if (fetchError.name === 'AbortError') {
                } else {
                }
                return null
            }
        } catch (error) {
            return null
        }
    }

    const buildSingleCopyPdfBlob = async (
        targetCopyType: 'PATIENT' | 'OFFICE',
        paperType: PaperMode,
        customFileName?: string
    ): Promise<{ pdfBlob: Blob; fileName: string }> => {
        if (!visit) {
            throw new Error('Visit is not loaded')
        }

        const canvases = await captureCanvasesForCopy(targetCopyType, paperType)

        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
            compress: true
        })

        canvases.forEach((canvas, index) => {
            appendCanvasToPdf(pdf, canvas, index > 0)
        })

        const patientName = `${visit.patient?.firstName || ''} ${visit.patient?.lastName || ''}`.trim() || 'Patient'
        const opdNo = visit.opdNo || visit.id || 'Unknown'
        const fileName = sanitizePdfFileName(customFileName || `${patientName} ${opdNo}.pdf`)

        return {
            pdfBlob: pdf.output('blob'),
            fileName,
        }
    }

    const buildBothCopiesPdfBlob = async (paperType: PaperMode): Promise<{ pdfBlob: Blob; fileName: string }> => {
        if (!visit) {
            throw new Error('Visit is not loaded')
        }

        const originalCopyType = copyType

        try {
            setCopyType('PATIENT')
            await waitForCopyTypeRender('PATIENT')
            const patientCanvases = await captureCanvasesForCopy('PATIENT', paperType)

            setCopyType('OFFICE')
            await waitForCopyTypeRender('OFFICE')
            const officeCanvases = await captureCanvasesForCopy('OFFICE', paperType)

            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4',
                compress: true
            })

            let pageIndex = 0
            patientCanvases.forEach((canvas) => {
                appendCanvasToPdf(pdf, canvas, pageIndex > 0)
                pageIndex += 1
            })
            officeCanvases.forEach((canvas) => {
                appendCanvasToPdf(pdf, canvas, pageIndex > 0)
                pageIndex += 1
            })

            const patientName = `${visit.patient?.firstName || ''} ${visit.patient?.lastName || ''}`.trim() || 'Patient'
            const opdNo = visit.opdNo || visit.id || 'Unknown'
            const fileName = sanitizePdfFileName(`${patientName} ${opdNo} - Both Copies.pdf`)

            return {
                pdfBlob: pdf.output('blob'),
                fileName,
            }
        } finally {
            setCopyType(originalCopyType)
        }
    }

    const downloadPreviewAsPDF = async (
        customFileName?: string,
        skipLoadingState?: boolean,
        paperType: 'letterhead' | 'plain' = 'plain',
        targetCopyType: 'PATIENT' | 'OFFICE' = copyType
    ) => {
        if (!getActivePrescriptionElement(targetCopyType) || !visit) return

        if (!skipLoadingState) setIsGeneratingPDF(true)

        try {
            await notifyAndroidDownloadProgress('Prescription Download', 'Preparing prescription PDF...')
            const { pdfBlob, fileName } = await buildSingleCopyPdfBlob(targetCopyType, paperType, customFileName)
            const mode = await downloadPdfBlob(pdfBlob, fileName, {
                preferNativeShareOnAndroid: true,
                shareTitle: 'Prescription PDF',
                shareText: 'Save or share this prescription PDF',
            })

            if (mode === 'shared') {
                await notifyAndroidDownloadProgress('Prescription Download Ready', 'Opened share sheet to save or share the prescription PDF.')
            } else {
                await notifyAndroidDownloadProgress('Prescription Download Ready', 'Prescription PDF has been generated.')
            }
        } catch (error) {
            await notifyAndroidDownloadProgress('Prescription Download Failed', 'Unable to generate prescription PDF.')
            const msg = error instanceof Error ? error.message : 'Unknown error'
            alert(`Failed to generate PDF from preview. ${msg}`)
        } finally {
            if (!skipLoadingState) setIsGeneratingPDF(false)
        }
    }

    const downloadPatientCopy = async (paperType: PaperMode) => {
        const originalCopyType = copyType
        setCopyType('PATIENT')
        await waitForCopyTypeRender('PATIENT')
        await downloadPreviewAsPDF(undefined, undefined, paperType, 'PATIENT')
        setCopyType(originalCopyType)
    }

    const downloadOfficeCopy = async (paperType: PaperMode) => {
        const originalCopyType = copyType
        setCopyType('OFFICE')
        await waitForCopyTypeRender('OFFICE')
        await downloadPreviewAsPDF(undefined, undefined, paperType, 'OFFICE')
        setCopyType(originalCopyType)
    }

    const downloadBothCopies = async (paperType: PaperMode) => {
        if (!visit) return

        setIsGeneratingPDF(true)

        try {
            await notifyAndroidDownloadProgress('Prescription Download', 'Preparing both prescription copies...')
            const { pdfBlob, fileName } = await buildBothCopiesPdfBlob(paperType)
            const mode = await downloadPdfBlob(pdfBlob, fileName, {
                preferNativeShareOnAndroid: true,
                shareTitle: 'Prescription PDF',
                shareText: 'Save or share these prescription PDFs',
            })

            if (mode === 'shared') {
                await notifyAndroidDownloadProgress('Prescription Download Ready', 'Opened share sheet to save or share both prescription copies.')
            } else {
                await notifyAndroidDownloadProgress('Prescription Download Ready', 'Both prescription copies have been generated.')
            }
        } catch (error) {
            await notifyAndroidDownloadProgress('Prescription Download Failed', 'Unable to generate both prescription copies.')
            const msg = error instanceof Error ? error.message : 'Unknown error'
            alert(`Failed to generate both PDFs from preview. ${msg}`)
        } finally {
            setIsGeneratingPDF(false)
        }
    }

    const shareSingleCopy = async (copyTypeParam: 'PATIENT' | 'OFFICE', paperType: PaperMode) => {
        if (!visit) return

        const originalCopyType = copyType

        try {
            setIsGeneratingPDF(true)
            setCopyType(copyTypeParam)
            await waitForCopyTypeRender(copyTypeParam)
            await notifyAndroidDownloadProgress('Prescription Share', 'Preparing prescription PDF...')

            const { pdfBlob, fileName } = await buildSingleCopyPdfBlob(copyTypeParam, paperType)
            const result = await sharePdfWithFallback(pdfBlob, {
                fileName,
                title: 'Prescription PDF',
                text: `Prescription copy (${copyTypeParam.toLowerCase()})`,
                folder: 'prescriptions',
            })

            if (result === 'native-share') {
                alert('Share sheet opened.')
            } else {
                alert('Share link copied to clipboard.')
            }
        } catch (error: any) {
            const message = error?.name === 'AbortError'
                ? 'Share was cancelled.'
                : (error instanceof Error ? error.message : 'Unable to share prescription PDF.')
            alert(message)
        } finally {
            setIsGeneratingPDF(false)
            setCopyType(originalCopyType)
        }
    }

    const shareBothCopies = async (paperType: PaperMode) => {
        if (!visit) return

        try {
            setIsGeneratingPDF(true)
            await notifyAndroidDownloadProgress('Prescription Share', 'Preparing both prescription copies...')

            const { pdfBlob, fileName } = await buildBothCopiesPdfBlob(paperType)
            const result = await sharePdfWithFallback(pdfBlob, {
                fileName,
                title: 'Prescription PDF',
                text: 'Both prescription copies',
                folder: 'prescriptions',
            })

            if (result === 'native-share') {
                alert('Share sheet opened.')
            } else {
                alert('Share link copied to clipboard.')
            }
        } catch (error: any) {
            const message = error?.name === 'AbortError'
                ? 'Share was cancelled.'
                : (error instanceof Error ? error.message : 'Unable to share prescription PDFs.')
            alert(message)
        } finally {
            setIsGeneratingPDF(false)
        }
    }

    const printSingleCopy = async (copyTypeParam: 'PATIENT' | 'OFFICE', paperType: PaperMode) => {
        const originalCopyType = copyType
        const targetCopyType = copyTypeParam

        try {
            setIsGeneratingPDF(true)
            setCopyType(targetCopyType)
            await waitForCopyTypeRender(targetCopyType)
            await printPrescriptionCopy(targetCopyType, paperType)
        } catch (error) {
            alert('Failed to print. Please try again.')
        } finally {
            setIsGeneratingPDF(false)
            setCopyType(originalCopyType)
        }
    }

    const printBothCopies = async (paperType: PaperMode) => {
        if (!visit) return

        const originalCopyType = copyType

        try {
            setIsGeneratingPDF(true)

            setCopyType('PATIENT')
            await waitForCopyTypeRender('PATIENT')
            const patientCanvases = await captureCanvasesForCopy('PATIENT', paperType)

            setCopyType('OFFICE')
            await waitForCopyTypeRender('OFFICE')
            const officeCanvases = await captureCanvasesForCopy('OFFICE', paperType)

            await printCanvasInIsolatedFrame([...patientCanvases, ...officeCanvases])
        } catch (error) {
            alert('Failed to print. Please try again.')
        } finally {
            setIsGeneratingPDF(false)
            setCopyType(originalCopyType)
        }
    }

    const runExportAction = async (action: ExportActionMode, scope: ExportScope, paperType: PaperMode) => {
        closePaperChoiceModal()

        if (action === 'DOWNLOAD') {
            if (scope === 'PATIENT') {
                await downloadPatientCopy(paperType)
                return
            }
            if (scope === 'OFFICE') {
                await downloadOfficeCopy(paperType)
                return
            }
            await downloadBothCopies(paperType)
            return
        }

        if (action === 'SHARE') {
            if (scope === 'PATIENT') {
                await shareSingleCopy('PATIENT', paperType)
                return
            }
            if (scope === 'OFFICE') {
                await shareSingleCopy('OFFICE', paperType)
                return
            }
            await shareBothCopies(paperType)
            return
        }

        if (scope === 'PATIENT') {
            await printSingleCopy('PATIENT', paperType)
            return
        }
        if (scope === 'OFFICE') {
            await printSingleCopy('OFFICE', paperType)
            return
        }
        await printBothCopies(paperType)
    }

    const patientPrescriptions = (visit?.prescriptions || []) as any[]
    const firstPagePatientPrescriptions = patientPrescriptions.slice(0, 12)
    const overflowPatientPrescriptions = patientPrescriptions.slice(12)
    const hasPatientOverflowPage = overflowPatientPrescriptions.length > 0
    const showPatientPageNavigation = copyType === 'PATIENT' && !prescriptionTemplate && hasPatientOverflowPage
    const copyFlipAnimClass = copyFlipPhase === 'out'
        ? (copyFlipDir === 'right' ? 'med-flip-out-left' : 'med-flip-out-right')
        : copyFlipPhase === 'in'
            ? (copyFlipDir === 'right' ? 'med-flip-in-right' : 'med-flip-in-left')
            : ''

    const exportScopeLabels: Record<ExportScope, string> = {
        PATIENT: 'Patient Copy',
        OFFICE: 'Office Copy',
        BOTH: 'Both Copies',
    }

    const advancedScaleControls: Array<{ key: AssetScaleKey; label: string }> = [
        { key: 'header', label: 'Header Image' },
        { key: 'footer', label: 'Footer Image' },
        { key: 'signature', label: 'Signature Image' },
        { key: 'watermark', label: 'Watermark Image' },
    ]

    const visitPreviewForm = {
        patientId: visit?.patient?.id || visit?.patientId || '',
        gender: visit?.gender || visit?.patient?.gender || '',
        dob: visit?.dob || visit?.patient?.dob || '',
        height: visit?.height || '',
        weight: visit?.weight || '',
        visitNumber: visit?.visitNumber || visit?.visit_number || '1',
        age: visit?.age || visit?.patient?.age || '',
        followUpCount: visit?.followUpCount || '',
        nextVisitDate: visit?.nextVisit || '',
        opdNo: visit?.opdNo || '',
        temperament: visit?.temperament || '',
        pulseDiagnosis: visit?.pulseDiagnosis || '',
        pulseDiagnosis2: visit?.pulseDiagnosis2 || '',
        historyReports: visit?.historyReports || '',
        majorComplaints: visit?.majorComplaints || '',
        investigations: visit?.investigations || '',
        provisionalDiagnosis: visit?.provisionalDiagnosis || visit?.diagnoses || '',
        improvements: visit?.improvements || '',
        discussion: visit?.discussion || '',
        specialNote: visit?.specialNote || '',
        date: visit?.date || '',
        balance: visit?.balance || '',
        payment: visit?.payment || '',
        address: visit?.address || visit?.patient?.address || '',
        phone: visit?.phone || visit?.patient?.phone || '',
        occupation: visit?.occupation || visit?.patient?.occupation || '',
        fatherHusbandGuardianName: visit?.fatherHusbandGuardianName || visit?.patient?.fatherHusbandGuardianName || '',
        imageUrl: visit?.imageUrl || visit?.patient?.imageUrl || '',
    }

    const visitPreviewPatients = visit?.patient ? [visit.patient] : []

    if (!visit || !isVisitLoaded || !isClinicAssetsReady) return <div className="flex items-center justify-center h-64"><div className="text-muted">Loading...</div></div>

    return (
        <div className="bg-gray-50 min-h-screen py-6">
            <style dangerouslySetInnerHTML={{
                __html: `
                .prescription-container-wrapper {
                    width: 100%;
                    overflow-x: auto;
                    overflow-y: auto;
                    -webkit-overflow-scrolling: touch;
                }
                
                .prescription-container {
                    width: 210mm;
                    min-height: 297mm;
                    margin: 0 auto;
                }
            `}} />
            <div className="max-w-7xl mx-auto px-4">
                <div className="no-print mb-3">
                    <button
                        onClick={() => router.push('/visits')}
                        className="px-3 py-1.5 bg-gray-700/95 dark:bg-gray-700 text-white text-xs rounded-xl hover:bg-gray-800 dark:hover:bg-gray-600 transition-all duration-200 shadow-sm flex items-center gap-1.5"
                        title="Back to visits"
                        aria-label="Back to visits"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.3} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        <span>Back</span>
                    </button>
                </div>

                {/* Info Bar */}
                <div className="no-print mb-4 relative z-[40] overflow-visible rounded-2xl border border-blue-200/60 dark:border-blue-700/60 bg-white/80 dark:bg-gray-900/70 backdrop-blur-md shadow-sm px-3 sm:px-4 py-3">
                    <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
                        <div className="flex flex-col gap-2">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-600 dark:text-gray-400">OPD No:</span>
                                    <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{visit?.opdNo || visit?.id || 'N/A'}</span>
                                </div>
                                <div className="hidden sm:block text-gray-300 dark:text-gray-600">•</div>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-600 dark:text-gray-400">Patient:</span>
                                    <span className="text-base font-bold text-gray-800 dark:text-gray-200">
                                        {visit?.patient?.firstName || ''} {visit?.patient?.lastName || ''}
                                    </span>
                                </div>
                                <div className="hidden sm:block text-gray-300 dark:text-gray-600">•</div>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium text-gray-600 dark:text-gray-400">Date:</span>
                                    <span className="text-base font-semibold text-gray-700 dark:text-gray-300">
                                        {visit?.date ? new Date(visit.date).toLocaleDateString('en-GB') : 'N/A'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => router.push(`/prescriptions?visitId=${visit.id}&edit=true`)}
                                className="px-3 py-1.5 bg-orange-500 dark:bg-orange-600 text-white text-sm rounded-xl hover:bg-orange-600 dark:hover:bg-orange-500 transition-all duration-200 shadow-sm flex items-center gap-1.5"
                                title="Edit visit"
                                aria-label="Edit visit"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                <span>Edit</span>
                            </button>

                            {showPatientPageNavigation && (
                                <div className="no-print flex h-8 items-center rounded-full border border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-800 p-1 shadow-sm">
                                    <button
                                        type="button"
                                        onClick={() => goToPatientPreviewPage(1)}
                                        disabled={patientPreviewPage === 1}
                                        className={`flex h-6 w-6 items-center justify-center rounded-full border transition-all ${
                                            patientPreviewPage === 1
                                                ? 'cursor-not-allowed border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                                                : 'border-blue-200 dark:border-blue-700 bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm hover:from-sky-600 hover:to-blue-700'
                                        }`}
                                        aria-label="Go to first patient page"
                                        title="Previous page"
                                    >
                                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                                        </svg>
                                    </button>

                                    <div className="mx-1 flex w-8 items-center justify-center gap-1" aria-label="Patient page indicators">
                                        {[1, 2].map((page) => (
                                            <button
                                                key={page}
                                                type="button"
                                                onClick={() => goToPatientPreviewPage(page as 1 | 2)}
                                                aria-label={`Go to page ${page}`}
                                                className={`rounded-full transition-all ${
                                                    page === patientPreviewPage
                                                        ? 'h-2.5 w-2.5 border border-blue-500 bg-gradient-to-r from-sky-500 to-blue-600'
                                                        : 'h-2 w-2 border border-blue-300 dark:border-blue-600 bg-blue-100 dark:bg-blue-900/45'
                                                }`}
                                                title={`Page ${page}`}
                                            />
                                        ))}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => goToPatientPreviewPage(2)}
                                        disabled={patientPreviewPage === 2}
                                        className={`flex h-6 w-6 items-center justify-center rounded-full border transition-all ${
                                            patientPreviewPage === 2
                                                ? 'cursor-not-allowed border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                                                : 'border-blue-200 dark:border-blue-700 bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-sm hover:from-sky-600 hover:to-blue-700'
                                        }`}
                                        aria-label="Go to second patient page"
                                        title="Next page"
                                    >
                                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                                        </svg>
                                    </button>
                                </div>
                            )}

                            <div className="flex items-center rounded-full border border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-800 p-1 shadow-sm">
                                <button
                                    type="button"
                                    onClick={toggleCopyTypeWithFlip}
                                    className="relative inline-flex h-8 w-40 items-center rounded-full bg-gradient-to-r from-sky-500 to-blue-600 p-1 shadow-inner transition-all duration-300"
                                    aria-label="Toggle patient office copy"
                                >
                                    <span
                                        className="absolute top-1 h-6 w-[78px] rounded-full bg-white shadow transition-all duration-300"
                                        style={{ left: copyType === 'OFFICE' ? 'calc(100% - 82px)' : '4px' }}
                                    ></span>
                                    <span className="relative z-10 grid w-full grid-cols-2 text-[11px] font-semibold tracking-wide">
                                        <span className={`text-center ${copyType === 'PATIENT' ? 'text-blue-700' : 'text-white/90'}`}>Patient</span>
                                        <span className={`text-center ${copyType === 'OFFICE' ? 'text-blue-700' : 'text-white/90'}`}>Office</span>
                                    </span>
                                </button>
                            </div>

                            <div className="relative z-[520] w-full sm:w-auto">
                                <button
                                    onClick={() => {
                                        if (isGeneratingPDF) return
                                        setShowExportDropdown(prev => {
                                            const next = !prev
                                            setExpandedExportAction(null)
                                            setHoveredExportAction(null)
                                            return next
                                        })
                                    }}
                                    disabled={isGeneratingPDF || !isClinicAssetsReady}
                                    className="w-full sm:w-auto px-3 py-1.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 transition-all duration-200 shadow-md shadow-sky-700/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center sm:justify-start gap-2"
                                    title="Export, print, or share prescription copies"
                                    aria-label="Export, print, or share prescription copies"
                                >
                                    {isGeneratingPDF ? (
                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : (
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10m-3 5l-2 2m0 0l-2-2m2 2v-6M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                    )}
                                    <span>Export/Print/Share</span>
                                    <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${showExportDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                {showExportDropdown && (
                                    <>
                                        <div className="fixed inset-0 z-[560]" onClick={closeExportMenu}></div>
                                        <div
                                            className="export-menu-panel absolute left-0 right-0 sm:left-auto sm:right-0 mt-2 bg-white/95 dark:bg-gray-800/95 backdrop-blur-lg border border-blue-200 dark:border-blue-700 rounded-2xl shadow-2xl z-[570] overflow-hidden sm:w-[240px]"
                                            onMouseLeave={() => {
                                                if (enableWebHoverSubmenus && !expandedExportAction) {
                                                    setHoveredExportAction(null)
                                                }
                                            }}
                                        >
                                            {(['DOWNLOAD', 'PRINT', 'SHARE'] as ExportActionMode[]).map((action) => {
                                                const isPinned = expandedExportAction === action
                                                const isHoverExpanded = enableWebHoverSubmenus && !expandedExportAction && hoveredExportAction === action
                                                const isExpanded = isPinned || isHoverExpanded
                                                return (
                                                    <div
                                                        key={action}
                                                        className="border-b last:border-b-0 border-blue-100 dark:border-blue-800/60"
                                                        onMouseEnter={() => {
                                                            if (enableWebHoverSubmenus && !expandedExportAction) {
                                                                setHoveredExportAction(action)
                                                            }
                                                        }}
                                                        onMouseLeave={() => {
                                                            if (enableWebHoverSubmenus && !expandedExportAction) {
                                                                setHoveredExportAction(null)
                                                            }
                                                        }}
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setExpandedExportAction(prev => prev === action ? null : action)
                                                                if (enableWebHoverSubmenus) {
                                                                    setHoveredExportAction(null)
                                                                }
                                                            }}
                                                            className="w-full px-4 py-3 flex items-center justify-between text-left text-sm font-semibold text-blue-800 dark:text-blue-200 hover:bg-blue-50 dark:hover:bg-blue-900/25 transition-colors"
                                                        >
                                                            <span className="flex items-center gap-2">
                                                                {action === 'DOWNLOAD' ? (
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m6 5H3" />
                                                                    </svg>
                                                                ) : action === 'PRINT' ? (
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9V2h12v7M6 18h12a2 2 0 002-2v-5a2 2 0 00-2-2H6a2 2 0 00-2 2v5a2 2 0 002 2zm2 4h8v-4H8v4z" />
                                                                    </svg>
                                                                ) : (
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C9.886 14.036 11.278 14.5 12 14.5c.722 0 2.114-.464 3.316-1.158M8.684 10.658C9.886 9.964 11.278 9.5 12 9.5c.722 0 2.114.464 3.316 1.158M4 6a3 3 0 116 0 3 3 0 01-6 0zm10 12a3 3 0 116 0 3 3 0 01-6 0z" />
                                                                    </svg>
                                                                )}
                                                                <span>{action === 'DOWNLOAD' ? 'Download' : action === 'PRINT' ? 'Print' : 'Share'}</span>
                                                            </span>
                                                            <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                        </button>

                                                        <div className={`overflow-hidden transition-all duration-300 ease-out ${isExpanded ? 'max-h-52 opacity-100' : 'max-h-0 opacity-0'}`}>
                                                            <div className="px-3 pb-3 grid gap-1.5">
                                                                {(['PATIENT', 'OFFICE', 'BOTH'] as ExportScope[]).map((scope) => (
                                                                    <button
                                                                        key={`${action}-${scope}`}
                                                                        onClick={() => openPaperChoiceModal(action, scope)}
                                                                        className="group w-full px-3 py-2 rounded-xl text-left border border-blue-100 dark:border-blue-800/80 bg-white/70 dark:bg-gray-900/30 hover:bg-gradient-to-r hover:from-sky-50 hover:to-blue-50 dark:hover:from-blue-900/30 dark:hover:to-sky-900/20 transition-all duration-200"
                                                                    >
                                                                        <div className="flex items-center justify-between gap-2">
                                                                            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{exportScopeLabels[scope]}</span>
                                                                            <span className="text-[11px] uppercase tracking-wide font-bold text-sky-600 dark:text-sky-400">{action}</span>
                                                                        </div>
                                                                        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">Choose paper style with live preview</div>
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Main Content Area with PDF Preview and Reports Sidebar */}
                <div className="relative z-0 flex flex-col lg:flex-row gap-6">
                    {/* Prescription Sheet - Left Side */}
                    <div className="flex-1 w-full lg:w-auto" style={{ marginBottom: '3rem' }}>
                        <div className={`prescription-container-wrapper ${copyFlipAnimClass} rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm bg-white dark:bg-slate-900 overflow-hidden`} style={{ position: 'relative' }}>
                            <PatientCopyPreview
                                form={visitPreviewForm}
                                prescriptions={visit?.prescriptions || []}
                                products={products}
                                patients={visitPreviewPatients}
                                bottlePricing={bottlePricing}
                                isExpanded={true}
                                onToggle={() => { }}
                                copyTypeOverride={copyType}
                                renderOnlySheet={true}
                                sheetRootRef={prescriptionRef}
                                assetScaleOverride={assetScaleSettings}
                                forceTemplateWatermark={true}
                                clinicImagesOverride={clinicImages}
                                clinicIconUrlOverride={userData?.clinic?.iconUrl || ''}
                                prescriptionTemplateOverride={prescriptionTemplate}
                                isProOverride={isPro}
                                patientPreviewPageOverride={patientPreviewPage}
                                onPatientPreviewPageChange={setPatientPreviewPage}
                            />
                            {false && (
                            <>
                            {copyType === 'PATIENT' && !prescriptionTemplate && hasPatientOverflowPage && (
                                <>
                                    <button
                                        type="button"
                                        onClick={() => goToPatientPreviewPage(1)}
                                        disabled={patientPreviewPage === 1}
                                        className="no-print"
                                        style={{
                                            position: 'absolute',
                                            left: '-2.25rem',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            width: '2rem',
                                            height: '2rem',
                                            borderRadius: '9999px',
                                            border: '1px solid #d1d5db',
                                            background: patientPreviewPage === 1 ? '#f3f4f6' : '#ffffff',
                                            color: '#374151',
                                            fontWeight: 'bold',
                                            cursor: patientPreviewPage === 1 ? 'not-allowed' : 'pointer',
                                            zIndex: 5
                                        }}
                                        aria-label="Go to first patient page"
                                    >
                                        {'<'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => goToPatientPreviewPage(2)}
                                        disabled={patientPreviewPage === 2}
                                        className="no-print"
                                        style={{
                                            position: 'absolute',
                                            right: '-2.25rem',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            width: '2rem',
                                            height: '2rem',
                                            borderRadius: '9999px',
                                            border: '1px solid #d1d5db',
                                            background: patientPreviewPage === 2 ? '#f3f4f6' : '#ffffff',
                                            color: '#374151',
                                            fontWeight: 'bold',
                                            cursor: patientPreviewPage === 2 ? 'not-allowed' : 'pointer',
                                            zIndex: 5
                                        }}
                                        aria-label="Go to second patient page"
                                    >
                                        {'>'}
                                    </button>
                                </>
                            )}
                            <div ref={prescriptionRef} data-copy-type={copyType} className="prescription-container" style={{ background: 'white', color: 'black', padding: '0', position: 'relative', width: '210mm', minHeight: '297mm', boxSizing: 'border-box', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                                {/* Watermark - Show for all users (basic and pro) */}
                                {!prescriptionTemplate || copyType === 'OFFICE' ? (
                                    <div className="watermark-container" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.175, zIndex: 0, pointerEvents: 'none', width: '65%', height: 'auto' }}>
                                        <img src={clinicImages.watermark} alt="Watermark" style={getScaledImageStyle({ width: '100%', height: 'auto', objectFit: 'contain' }, assetScaleSettings.watermark)} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                                    </div>
                                ) : null}

                                {/* Header Image - Full width, no margin - Only show in PATIENT copy */}
                                {copyType === 'PATIENT' && !prescriptionTemplate && (
                                    <div className="header-container" style={{ width: '100%', overflow: 'hidden', marginBottom: '1rem', position: 'relative', zIndex: 1 }}>
                                        <img src={clinicImages.header} alt="Header" style={getScaledImageStyle({ width: '100%', height: '90%', display: 'block' }, assetScaleSettings.header, 'top center')} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                                    </div>
                                )}

                                {copyType === 'PATIENT' && prescriptionTemplate && (
                                    <PrescriptionTemplateRenderer
                                        template={prescriptionTemplate!}
                                        clinicImages={clinicImages}
                                        visitData={visit}
                                        prescriptions={(visit?.prescriptions || []).map((p: any) => ({
                                            ...p,
                                            product: p.product || products.find((prod: any) => String(prod.id) === String(p.productId)),
                                        }))}
                                        isPro={isPro}
                                        forceWatermark={true}
                                    />
                                )}

                                {/* Patient Info and Prescription Section - Only show in PATIENT copy */}
                                {copyType === 'PATIENT' && !prescriptionTemplate && (
                                    <>
                                        <div ref={patientPageOneRef} style={{ padding: '0 1.5rem', position: 'relative', zIndex: 1, flex: '1 0 auto' }}>

                                            {/* Top Section: Particulars and Basic Info */}
                                            <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>

                                                {/* Particulars Box (Left) */}
                                                <div style={{ flex: 1, padding: '4px', position: 'relative', paddingTop: '16px', borderSpacing: '1px' }}>
                                                    <div style={{ position: 'absolute', top: '0', left: '0', right: '0', borderBottom: `1px solid ${isPro ? '#FF8C00' : '#000000'}`, marginBottom: '2px', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}>
                                                        {renderFloatingVisitSectionLabel('Particulars')}
                                                    </div>

                                                    {/* Indicator Box - Moved to Particulars - Use -600/-700 shade of theme color */}
                                                    <div style={{ width: '30px', height: '15px', background: visit.improvements ? darkenColor(themeColor, 0.25) : 'red', marginBottom: '2px', border: '1px solid #000' }}></div>


                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: '10px', gap: '1px', lineHeight: '1.1', marginTop: '7px' }}>
                                                        {/* Column 1 */}
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>DATE:</span> <span style={{ marginLeft: '4px', color: '#0000FF', fontWeight: 'bold' }}>{visit.date ? new Date(visit.date).toLocaleDateString('en-GB') : <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>SEX:</span> <span style={{ marginLeft: '4px' }}>{visit.gender || visit.patient?.gender || <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>DOB:</span> <span style={{ marginLeft: '4px' }}>{visit.dob || visit.patient?.dob ? new Date(visit.dob || visit.patient?.dob).toLocaleDateString('en-GB') : <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>HT:</span> <span style={{ marginLeft: '4px' }}>{visit.height || <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>WT:</span> <span style={{ marginLeft: '4px' }}>{visit.weight || <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                                        </div>
                                                        {/* Column 2 */}
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>VISIT:</span> <span style={{ marginLeft: '4px' }}>{visit.visitNumber || '1'}</span></div>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>AGE:</span> <span style={{ marginLeft: '4px' }}>{visit.age || visit.patient?.age || <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><a href={`#nextVisit`} style={{ fontWeight: 'bold', color: '#000', cursor: 'pointer' }}>FOLLOW UP:</a> <span style={{ marginLeft: '4px', color: '#C80000', fontWeight: 'bold' }}>{visit.followUpCount ? `#${visit.followUpCount}` : <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>NEXT V:</span> <span style={{ marginLeft: '4px', color: '#C80000', fontWeight: 'bold' }}>{visit.nextVisit ? new Date(visit.nextVisit).toLocaleDateString('en-GB') : <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Right Box: Patient Info */}
                                                <div style={{ flex: 1, padding: '4px', position: 'relative', paddingTop: '16px', display: 'flex', gap: '5px', borderSpacing: '1px' }}>
                                                    <div style={{ position: 'absolute', top: '0', left: '0', right: '0', borderBottom: `1px solid ${isPro ? '#FF8C00' : '#000000'}`, marginBottom: '2px', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}>
                                                        {renderFloatingVisitSectionLabel('Patient Info')}
                                                    </div>

                                                    <div style={{ flex: 1, marginTop: '5px' }}>
                                                        <div style={{ fontSize: '10px', lineHeight: '1.1', marginTop: '0px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>OPDN:</span> <span style={{ fontWeight: 'bold', color: '#0000FF', marginLeft: '4px' }}>{visit.opdNo || <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>NAME:</span> <span style={{ fontWeight: 'bold', color: '#0000FF', marginLeft: '4px' }}>{(visit.patient?.firstName || visit.patient?.lastName) ? `${visit.patient?.firstName || ''} ${visit.patient?.lastName || ''}` : <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>F/H/G NAME:</span> <span style={{ color: '#000', marginLeft: '4px' }}>{visit.patient?.fatherHusbandGuardianName || <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>ADDRESS:</span> <span style={{ color: '#000', marginLeft: '4px' }}>{visit.patient?.address || visit.address || <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>PHONE NO:</span> <span style={{ color: '#000', marginLeft: '4px' }}>{visit.patient?.phone || <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>OCCUPATION:</span> <span style={{ color: '#000', marginLeft: '4px' }}>{visit.patient?.occupation || <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                                        </div>
                                                    </div>

                                                    {/* Patient Image */}
                                                    <div style={{ width: '90px', height: '110px', border: '1px solid #ddd', overflow: 'hidden', flexShrink: 0, marginTop: '5px' }}>
                                                        {visit.patient?.imageUrl ? (
                                                            <img
                                                                src={visit.patient.imageUrl}
                                                                alt="Patient"
                                                                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
                                                                onError={(e) => {
                                                                    e.currentTarget.src = process.env.NEXT_PUBLIC_DEFAULT_PATIENT_IMAGE || '/default-patient.png'
                                                                }}
                                                            />
                                                        ) : (
                                                            <img
                                                                src={process.env.NEXT_PUBLIC_DEFAULT_PATIENT_IMAGE || '/default-patient.png'}
                                                                alt="Patient"
                                                                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
                                                                onError={(e) => {
                                                                    const target = e.currentTarget as HTMLImageElement
                                                                    target.style.display = 'none'
                                                                    const parent = target.parentElement
                                                                    if (parent) {
                                                                        parent.style.backgroundColor = '#f0f0f0'
                                                                        parent.style.display = 'flex'
                                                                        parent.style.alignItems = 'center'
                                                                        parent.style.justifyContent = 'center'
                                                                        parent.innerHTML = '<div style="font-size: 0.6rem; color: #999;">No Image</div>'
                                                                    }
                                                                }}
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* EH Parameters Row */}
                                            <div style={{ position: 'relative', borderBottom: `1px solid ${isPro ? '#FF8C00' : '#000000'}`, margin: '5px 0 2px 0', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}>
                                                {renderFloatingVisitSectionLabel('EH Parameters')}
                                            </div>
                                            <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
                                                <div style={{ flex: 1, padding: '4px', position: 'relative', paddingTop: '10px', borderSpacing: '1px' }}>
                                                    <div style={{ fontSize: '10px', display: 'flex', alignItems: 'flex-start', lineHeight: '1.1' }}><span style={{ fontWeight: 'bold' }}>TEMP:</span> <span style={{ marginLeft: '4px' }}>{visit.temperament || <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                                </div>
                                                <div style={{ flex: 1, padding: '4px', position: 'relative', paddingTop: '10px', borderSpacing: '1px' }}>
                                                    <div style={{ fontSize: '10px', display: 'flex', alignItems: 'flex-start', lineHeight: '1.1' }}><span style={{ fontWeight: 'bold' }}>PULSE-1:</span> <span style={{ marginLeft: '4px' }}>{visit.pulseDiagnosis || <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                                </div>
                                                <div style={{ flex: 1, padding: '4px', position: 'relative', paddingTop: '10px', borderSpacing: '1px' }}>
                                                    <div style={{ fontSize: '10px', display: 'flex', alignItems: 'flex-start', lineHeight: '1.1' }}><span style={{ fontWeight: 'bold' }}>PULSE-2:</span> <span style={{ marginLeft: '4px' }}>{visit.pulseDiagnosis2 || <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                                </div>
                                            </div>

                                            {/* History & Reports */}
                                            <div style={{ position: 'relative', borderBottom: `1px solid ${isPro ? '#FF8C00' : '#000000'}`, margin: '5px 0 2px 0', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}>
                                                {renderFloatingVisitSectionLabel('Prev Info')}
                                            </div>
                                            <div style={{ padding: '4px', position: 'relative', paddingTop: '16px', marginBottom: '15px', borderSpacing: '1px' }}>
                                                <div style={{ fontSize: '9px', display: 'flex', alignItems: 'flex-start', lineHeight: '1.1', marginTop: '0px' }}><span style={{ fontWeight: 'bold' }}>HISTORY & REPORTS:</span> <span style={{ fontFamily: 'Brush Script MT, cursive', fontStyle: 'italic', color: visit.historyReports ? '#0000FF' : '#FF0000', fontSize: '12px', marginLeft: '4px' }}>{visit.historyReports || 'N/A'}</span></div>
                                            </div>

                                            {/* Chief Complaints */}
                                            <div style={{ position: 'relative', borderBottom: `1px solid ${isPro ? '#FF8C00' : '#000000'}`, margin: '5px 0 2px 0', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}>
                                                {renderFloatingVisitSectionLabel('Sign & Symptoms')}
                                            </div>
                                            <div style={{ padding: '4px', position: 'relative', paddingTop: '16px', marginBottom: '15px', borderSpacing: '1px' }}>
                                                <div style={{ fontSize: '9px', display: 'flex', alignItems: 'flex-start', lineHeight: '1.1', marginTop: '0px' }}><span style={{ fontWeight: 'bold' }}>CHIEF COMPLAINTS:</span> <span style={{ fontFamily: 'Brush Script MT, cursive', fontStyle: 'italic', color: visit.majorComplaints ? '#0000FF' : '#FF0000', fontSize: '12px', marginLeft: '4px' }}>{visit.majorComplaints || 'N/A'}</span></div>
                                            </div>

                                            {/* Investigations & Prov Diagnosis - Split into two boxes */}
                                            <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
                                                {/* Investigations */}
                                                <div style={{ flex: 1, padding: '4px', position: 'relative', paddingTop: '16px', borderSpacing: '1px' }}>
                                                    <div style={{ position: 'absolute', top: '0', left: '0', right: '0', borderBottom: `1px solid ${isPro ? '#FF8C00' : '#000000'}`, marginBottom: '2px', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}>
                                                        {renderFloatingVisitSectionLabel('Investigations')}
                                                    </div>
                                                    <div style={{ fontFamily: 'Brush Script MT, cursive', fontStyle: 'italic', color: visit.investigations ? '#0000FF' : '#FF0000', fontSize: '12px', lineHeight: '1.1', marginTop: '0px', wordWrap: 'break-word' }}>{visit.investigations || 'N/A'}</div>
                                                </div>
                                                {/* Diagnosis */}
                                                <div style={{ flex: 1, padding: '4px', position: 'relative', paddingTop: '16px', borderSpacing: '1px' }}>
                                                    <div style={{ position: 'absolute', top: '0', left: '0', right: '0', borderBottom: `1px solid ${isPro ? '#FF8C00' : '#000000'}`, marginBottom: '2px', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}>
                                                        {renderFloatingVisitSectionLabel('Diagnosis')}
                                                    </div>
                                                    <div style={{ fontFamily: 'Brush Script MT, cursive', fontStyle: 'italic', color: (visit.provisionalDiagnosis || visit.diagnoses) ? '#0000FF' : '#FF0000', fontSize: '12px', lineHeight: '1.1', marginTop: '0px', wordWrap: 'break-word' }}>{visit.provisionalDiagnosis || visit.diagnoses || 'N/A'}</div>
                                                </div>
                                            </div>

                                            {/* Improvements */}
                                            <div style={{ position: 'relative', borderBottom: `1px solid ${isPro ? '#FF8C00' : '#000000'}`, margin: '5px 0 2px 0', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}>
                                                {renderFloatingVisitSectionLabel('Cure')}
                                            </div>
                                            <div style={{ padding: '4px', position: 'relative', paddingTop: '16px', marginBottom: '15px', borderSpacing: '1px' }}>
                                                <div style={{ fontSize: '9px', display: 'flex', alignItems: 'flex-start', lineHeight: '1.1', marginTop: '0px' }}><span style={{ fontWeight: 'bold' }}>IMPROVEMENTS:</span> <span style={{ fontFamily: 'Brush Script MT, cursive', fontStyle: 'italic', color: visit.improvements ? '#0000FF' : '#FF0000', fontSize: '12px', marginLeft: '4px' }}>{visit.improvements || 'N/A'}</span></div>
                                            </div>

                                            {/* Discuss */}
                                            <div style={{ position: 'relative', borderBottom: `1px solid ${isPro ? '#FF8C00' : '#000000'}`, margin: '5px 0 2px 0', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}>
                                                {renderFloatingVisitSectionLabel('Discuss')}
                                            </div>
                                            <div style={{ padding: '4px', position: 'relative', paddingTop: '16px', marginBottom: '15px', borderSpacing: '1px' }}>
                                                <div style={{ fontSize: '9px', display: 'flex', alignItems: 'flex-start', marginTop: '0px' }}><span style={{ fontWeight: 'bold' }}>DISCUSS:</span> <span style={{ fontFamily: 'Brush Script MT, cursive', fontStyle: 'italic', color: visit.discussion ? '#0000FF' : '#FF0000', fontSize: '12px', marginLeft: '4px' }}>{visit.discussion || 'N/A'}</span></div>
                                            </div>

                                            {/* Special Note – single line above separator */}
                                            {visit.specialNote && (
                                                <div style={{ fontSize: '9px', display: 'flex', alignItems: 'flex-start', marginBottom: '6px', paddingLeft: '4px' }}>
                                                    <span style={{ fontWeight: 'bold' }}>Special Note:</span>
                                                    <span style={{ marginLeft: '4px' }}>{visit.specialNote}</span>
                                                </div>
                                            )}

                                            {/* Orange Separator */}
                                            <div style={{ borderBottom: `0.5px solid ${isPro ? '#FF8C00' : '#000000'}`, marginBottom: '0.5rem', marginLeft: '0.5rem', marginRight: '0.5rem' }}></div>

                                            {/* Prescription Table */}
                                            <div className="mb-2" style={{ marginTop: '0.25rem' }}>
                                                {renderPatientPrescriptionTableContent(firstPagePatientPrescriptions, 0)}
                                            </div>
                                        </div>

                                        {/* Doctor's Signature - right aligned, above footer */}
                                        <div className="signature-container" style={{ padding: '0 1.5rem', marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                                            <div style={{ textAlign: 'center', position: 'relative', minWidth: '120px', overflow: 'visible' }}>
                                                {clinicImages.signature && (
                                                    <img src={clinicImages.signature} alt="Signature" style={getScaledImageStyle({ height: '81.25px', objectFit: 'contain', display: 'block', marginLeft: 'auto', marginRight: 'auto', marginBottom: '-8px' }, assetScaleSettings.signature, 'bottom center')} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                                                )}
                                                <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#000', borderTop: '1px solid #000', paddingTop: '2px' }}>Doctor's Signature</div>
                                            </div>
                                        </div>

                                        {/* Footer Image */}
                                        <div className="footer-container" style={{ marginTop: 'auto', width: '100%', flexShrink: 0, marginBottom: '1.5rem' }}>
                                            <img src={clinicImages.footer} alt="Footer" style={getScaledImageStyle({ width: '100%', height: 'auto', display: 'block' }, assetScaleSettings.footer, 'bottom center')} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                                            {/* Sponsored By Footer - Only show for basic users */}
                                            {!isPro && (
                                                <div style={{ textAlign: 'center', fontSize: '0.5rem', color: '#666', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                                                    <span>Sponsored by</span>
                                                    <img src="/favicon.ico" alt="Logo" style={{ width: '20px', height: '12px', display: 'inline-block' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                                                </div>
                                            )}
                                        </div>

                                        {hasPatientOverflowPage && (
                                            <div ref={patientPageTwoRef} className="patient-overflow-page" style={{ position: 'relative', minHeight: '297mm', display: 'flex', flexDirection: 'column', background: 'white', breakBefore: 'page', pageBreakBefore: 'always' }}>
                                                <div className="watermark-container" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.175, zIndex: 0, pointerEvents: 'none', width: '65%', height: 'auto' }}>
                                                    <img src={clinicImages.watermark} alt="Watermark" style={getScaledImageStyle({ width: '100%', height: 'auto', objectFit: 'contain' }, assetScaleSettings.watermark)} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                                                </div>

                                                <div className="header-container" style={{ width: '100%', overflow: 'hidden', marginBottom: '1rem', position: 'relative', zIndex: 1 }}>
                                                    <img src={clinicImages.header} alt="Header" style={getScaledImageStyle({ width: '100%', height: '90%', display: 'block' }, assetScaleSettings.header, 'top center')} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                                                </div>

                                                <div style={{ padding: '0 1.5rem', position: 'relative', zIndex: 1, flex: '1 0 auto' }}>
                                                    <div style={{ borderBottom: `0.5px solid ${isPro ? '#FF8C00' : '#000000'}`, marginBottom: '0.5rem', marginLeft: '0.5rem', marginRight: '0.5rem', marginTop: '0.75rem' }}></div>
                                                    <div className="mb-2" style={{ marginTop: '0.25rem' }}>
                                                        {renderPatientPrescriptionTableContent(overflowPatientPrescriptions, 12)}
                                                    </div>
                                                </div>

                                                <div className="signature-container" style={{ padding: '0 1.5rem', marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                                                    <div style={{ textAlign: 'center', position: 'relative', minWidth: '120px', overflow: 'visible' }}>
                                                        {clinicImages.signature && (
                                                            <img src={clinicImages.signature} alt="Signature" style={getScaledImageStyle({ height: '81.25px', objectFit: 'contain', display: 'block', marginLeft: 'auto', marginRight: 'auto', marginBottom: '-8px' }, assetScaleSettings.signature, 'bottom center')} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                                                        )}
                                                        <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#000', borderTop: '1px solid #000', paddingTop: '2px' }}>Doctor's Signature</div>
                                                    </div>
                                                </div>

                                                <div className="footer-container" style={{ marginTop: 'auto', width: '100%', flexShrink: 0, marginBottom: '1.5rem' }}>
                                                    <img src={clinicImages.footer} alt="Footer" style={getScaledImageStyle({ width: '100%', height: 'auto', display: 'block' }, assetScaleSettings.footer, 'bottom center')} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Blue Separator Line and everything after it - Only show in OFFICE copy */}
                                {copyType === 'OFFICE' && (
                                    <>
                                        <div style={{ padding: '0 1.5rem' }}>
                                            {/* Blue Separator Line - Full Width */}
                                            <div style={{ borderBottom: '2px solid #0000FF', marginBottom: '0.5rem', marginLeft: '-1.5rem', marginRight: '-1.5rem' }}></div>

                                            {/* Top Row: Particulars and Patient Info */}
                                            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', marginTop: '15px' }}>

                                                {/* Left Box: Particulars */}
                                                <div style={{ flex: 1, padding: '4px', position: 'relative', paddingTop: '16px', borderSpacing: '1px' }}>
                                                    <div style={{ position: 'absolute', top: '0', left: '0', right: '0', borderBottom: `1px solid ${isPro ? '#FF8C00' : '#000000'}`, marginBottom: '2px', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}>
                                                        {renderFloatingVisitSectionLabel('Particulars')}
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', fontSize: '10px', lineHeight: '1.1', marginTop: '7px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>OPDN:</span> <span style={{ fontWeight: 'bold', color: '#0000FF', marginLeft: '3px' }}>{visit.patient?.opdNo || visit.opdNo || ''}</span></div>
                                                        <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>VISIT:</span> <span style={{ fontWeight: 'bold', color: '#000', marginLeft: '3px' }}>{visit.visitNumber || visit.visit_number || visit.followUpCount || '1'}</span></div>
                                                        <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>PHONE:</span> <span style={{ fontWeight: 'bold', color: '#000', marginLeft: '3px' }}>{visit.patient?.phone || visit.phone || ''}</span></div>
                                                        <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>DOB:</span> <span style={{ fontWeight: 'bold', color: '#000', marginLeft: '3px' }}>{visit.patient?.dob || visit.dob ? new Date(visit.patient?.dob || visit.dob).toLocaleDateString() : ''}</span></div>
                                                        <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>GENDER:</span> <span style={{ fontWeight: 'bold', color: '#000', marginLeft: '3px' }}>{visit.patient?.gender || visit.gender || ''}</span></div>
                                                        <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>AGE:</span> <span style={{ fontWeight: 'bold', color: '#000', marginLeft: '3px' }}>{visit.age || visit.patient?.age || 'N/A'}</span></div>
                                                        <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>DATE:</span> <span style={{ fontWeight: 'bold', color: '#000', marginLeft: '3px' }}>{new Date(visit.date).toLocaleDateString()}</span></div>
                                                        <div style={{ display: 'flex', alignItems: 'flex-start' }}><a href={`#nextVisit`} style={{ fontWeight: 'bold', textDecoration: 'none', color: '#000', cursor: 'pointer' }}>F UP:</a> <span style={{ fontWeight: 'bold', color: '#C80000', marginLeft: '3px' }}>{visit.followUpCount ? `#${visit.followUpCount}` : ''}</span></div>
                                                        <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>NEXT V:</span> <span style={{ marginLeft: '4px', color: '#C80000', fontWeight: 'bold' }}>{visit.nextVisit ? new Date(visit.nextVisit).toLocaleDateString('en-GB') : <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                                                    </div>
                                                </div>

                                                {/* Right Box: Patient Info */}
                                                <div style={{ flex: 1, padding: '4px', position: 'relative', paddingTop: '16px', display: 'flex', gap: '5px', borderSpacing: '1px' }}>
                                                    <div style={{ position: 'absolute', top: '0', left: '0', right: '0', borderBottom: `1px solid ${isPro ? '#FF8C00' : '#000000'}`, marginBottom: '2px', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}>
                                                        {renderFloatingVisitSectionLabel('Patient Info')}
                                                    </div>

                                                    <div style={{ flex: 1, marginTop: '5px' }}>
                                                        {/* Indicator Box Removed from Office Copy */}

                                                        <div style={{ fontSize: '10px', lineHeight: '1.1', marginTop: '0px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>NAME:</span> <span style={{ color: '#0000FF', marginLeft: '3px' }}>{visit.patient?.firstName || ''} {visit.patient?.lastName || ''}</span></div>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>F/H/G NAME:</span> <span style={{ color: '#000', marginLeft: '3px' }}>{visit.patient?.fatherHusbandGuardianName || ''}</span></div>
                                                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>ADDRESS:</span> <span style={{ color: '#000', marginLeft: '3px' }}>{visit.patient?.address || visit.address || ''}</span></div>
                                                        </div>
                                                    </div>

                                                    {/* Patient Image */}
                                                    <div style={{ width: '90px', height: '110px', border: '1px solid #ddd', overflow: 'hidden', flexShrink: 0, marginTop: '10px' }}>
                                                        {visit.patient?.imageUrl ? (
                                                            <img
                                                                src={visit.patient.imageUrl}
                                                                alt="Patient"
                                                                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
                                                                onError={(e) => {
                                                                    e.currentTarget.src = process.env.NEXT_PUBLIC_DEFAULT_PATIENT_IMAGE || '/default-patient.png'
                                                                }}
                                                            />
                                                        ) : (
                                                            <img
                                                                src={process.env.NEXT_PUBLIC_DEFAULT_PATIENT_IMAGE || '/default-patient.png'}
                                                                alt="Patient"
                                                                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
                                                                onError={(e) => {
                                                                    const target = e.currentTarget as HTMLImageElement
                                                                    target.style.display = 'none'
                                                                    const parent = target.parentElement
                                                                    if (parent) {
                                                                        parent.style.backgroundColor = '#f0f0f0'
                                                                        parent.style.display = 'flex'
                                                                        parent.style.alignItems = 'center'
                                                                        parent.style.justifyContent = 'center'
                                                                        parent.innerHTML = '<div style="font-size: 0.6rem; color: #999;">No Image</div>'
                                                                    }
                                                                }}
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Middle Row: Medical Info */}
                                            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                                                {/* Box 1: Parameters */}
                                                <div style={{ flex: 1, padding: '4px', position: 'relative', paddingTop: '16px', borderSpacing: '1px' }}>
                                                    <div style={{ position: 'absolute', top: '0', left: '0', right: '0', borderBottom: `1px solid ${isPro ? '#FF8C00' : '#000000'}`, marginBottom: '2px', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}>
                                                        {renderFloatingVisitSectionLabel('Parameters')}
                                                    </div>
                                                    <div style={{ fontSize: '10px', lineHeight: '1.1' }}>
                                                        <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>TEMP:</span> <span style={{ fontWeight: 'bold', color: '#000', marginLeft: '4px' }}>{visit.temperament || ''}</span></div>
                                                        <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>PULSE:</span> <span style={{ fontWeight: 'bold', color: '#000', marginLeft: '4px' }}>{visit.pulseDiagnosis || ''}</span></div>
                                                    </div>
                                                </div>

                                                {/* Box 2: History & Complaints */}
                                                <div style={{ flex: 2, padding: '4px', position: 'relative', paddingTop: '16px', borderSpacing: '1px' }}>
                                                    <div style={{ position: 'absolute', top: '0', left: '0', right: '0', borderBottom: `1px solid ${isPro ? '#FF8C00' : '#000000'}`, marginBottom: '2px', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}>
                                                        {renderFloatingVisitSectionLabel('History & Complaints')}
                                                    </div>
                                                    <div style={{ fontSize: '10px', lineHeight: '1.1' }}>
                                                        <div style={{ marginBottom: '2px', display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>HISTORY:</span> <span style={{ fontWeight: 'bold', color: '#000', marginLeft: '4px' }}>{visit.historyReports || ''}</span></div>
                                                        <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>COMPLAINTS:</span> <span style={{ fontWeight: 'bold', color: '#0000FF', marginLeft: '4px' }}>{visit.majorComplaints || ''}</span></div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Bottom Row: Diagnosis & Cure */}
                                            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                                                <div style={{ flex: 1, padding: '4px', position: 'relative', paddingTop: '16px', borderSpacing: '1px' }}>
                                                    <div style={{ position: 'absolute', top: '0', left: '0', right: '0', borderBottom: `1px solid ${isPro ? '#FF8C00' : '#000000'}`, marginBottom: '2px', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}>
                                                        {renderFloatingVisitSectionLabel('Diagnosis & Cure')}
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '10px', lineHeight: '1.1', marginTop: '7px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>IMPROVEMENTS:</span> <span style={{ fontWeight: 'bold', color: '#000', marginLeft: '4px' }}>{visit.improvements || ''}</span></div>
                                                        <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>PROV. DIAGNOSIS:</span> <span style={{ fontWeight: 'bold', color: '#0000FF', marginLeft: '4px' }}>{visit.provisionalDiagnosis || ''}</span></div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Orange Separator with margins */}
                                            <div style={{ borderBottom: '2px solid #000000', marginBottom: '0.5rem' }}></div>

                                            {/* Second Medicine Table with UNITS column */}
                                            <div style={{ marginBottom: '1rem' }}>
                                                {(() => {
                                                    const hasSpy4 = visit.prescriptions?.some((p: any) => p.spy4)
                                                    const hasSpy5 = visit.prescriptions?.some((p: any) => p.spy5)
                                                    const hasSpy6 = visit.prescriptions?.some((p: any) => p.spy6)
                                                    const hasAdd2 = visit.prescriptions?.some((p: any) => p.addition2)
                                                    const hasAdd3 = visit.prescriptions?.some((p: any) => p.addition3)

                                                    return (
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.7315rem' }}>
                                                            <tbody>
                                                                {visit.prescriptions?.map((prescription: any, index: number) => {
                                                                    const product = products.find((p: any) => p.id === prescription.productId)
                                                                    const availableUnits = product?.units || 0
                                                                    const isLowStock = availableUnits <= 0
                                                                    const totalPrice = (product?.priceRupees || 0) * (prescription.quantity || 0)
                                                                    const textColor = prescription.patientHasMedicine ? '#FF0000' : '#000'
                                                                    const hasSecondRow = prescription.spy4 || prescription.spy5 || prescription.spy6 || prescription.addition1 || prescription.addition2 || prescription.addition3

                                                                    // Check if this prescription has droppers or labels for spacing
                                                                    const hasDropperOrLabel = prescription.selectedDropper || (prescription.includeLabelProduct !== false && prescription.selectedLabel)

                                                                    // If we have a second row, we'll put the details there, so no extra height needed for the first row
                                                                    const extraRowHeight = (hasDropperOrLabel && !hasSecondRow) ? '1.8rem' : '1.2rem'

                                                                    // Prepare dropper and label items
                                                                    const dropperLabelItems: string[] = []
                                                                    if (prescription.selectedDropper) {
                                                                        const dropperProduct = products.find((p: any) => String(p.id) === String(prescription.selectedDropper))
                                                                        if (dropperProduct) {
                                                                            dropperLabelItems.push(`+ ${dropperProduct.name}`)
                                                                        }
                                                                    }
                                                                    if (prescription.includeLabelProduct !== false && prescription.selectedLabel) {
                                                                        dropperLabelItems.push(`+ ${prescription.selectedLabel}`)
                                                                    }
                                                                    // Add VRS if included and product is dilution
                                                                    if (prescription.includeVrsProduct !== false && prescription.vrsQuantity > 0) {
                                                                        const productCategory = product?.category?.name || product?.category || ''
                                                                        if (productCategory.toLowerCase() === 'dilutions') {
                                                                            dropperLabelItems.push(`+ VRS ${prescription.vrsQuantity}`)
                                                                        }
                                                                    }

                                                                    return (
                                                                        <Fragment key={prescription.id || `${index}-rows`}>
                                                                            {/* First Row - Main prescription info */}
                                                                            <tr key={`${index}-main`}>
                                                                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center', width: '60px', fontWeight: 'bold', color: textColor, fontSize: '0.6655rem', borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', position: 'relative', verticalAlign: 'top', lineHeight: '1.2' }}>
                                                                                    <span>{totalPrice.toFixed(2)}</span>
                                                                                    {(() => {
                                                                                        // Calculate additional charges for SPY4-6 and ADD1-3
                                                                                        const hasSpy456 = prescription.spy4 || prescription.spy5 || prescription.spy6
                                                                                        const hasAdd123 = prescription.addition1 || prescription.addition2 || prescription.addition3
                                                                                        const bottleSize = prescription.bottleSize

                                                                                        if (bottleSize && (hasSpy456 || hasAdd123)) {
                                                                                            const bottlePriceData = bottlePricing.find((b: any) => b.value === bottleSize)
                                                                                            const bottlePrice = bottlePriceData ? bottlePriceData.price : 0

                                                                                            if (bottlePrice > 0) {
                                                                                                const spy456Price = hasSpy456 ? bottlePrice : 0
                                                                                                const add123Price = hasAdd123 ? bottlePrice : 0

                                                                                                return (
                                                                                                    <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', fontSize: '0.6rem', color: '#000', lineHeight: '1.5', whiteSpace: 'nowrap', marginTop: '-0.1rem' }}>
                                                                                                        {spy456Price > 0 && <div>{spy456Price.toFixed(2)}</div>}
                                                                                                        {add123Price > 0 && <div>{add123Price.toFixed(2)}</div>}
                                                                                                    </div>
                                                                                                )
                                                                                            }
                                                                                        }
                                                                                        return null
                                                                                    })()}
                                                                                </td>
                                                                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center', width: '30px', fontWeight: 'bold', fontSize: '0.6655rem', color: textColor, borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>{index + 1}</td>
                                                                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'left', width: '120px', color: textColor, fontWeight: 'bold', fontSize: '0.7315rem', borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>
                                                                                    <div>{product?.name?.toUpperCase() || ''}</div>
                                                                                    {!hasSecondRow && dropperLabelItems.length > 0 && (
                                                                                        <div style={{ fontSize: '0.48rem', color: '#666', lineHeight: '1', marginTop: '0.05rem' }}>
                                                                                            {dropperLabelItems.map((item, idx) => (
                                                                                                <div key={idx}>{item}</div>
                                                                                            ))}
                                                                                        </div>
                                                                                    )}
                                                                                </td>
                                                                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center', width: '40px', color: textColor, fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.6655rem', borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>{(prescription.spy1 || '').replace(/\|/g, '/')}</td>
                                                                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center', width: '40px', color: textColor, fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.6655rem', borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>{(prescription.spy2 || '').replace(/\|/g, '/')}</td>
                                                                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center', width: '40px', color: textColor, fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.6655rem', borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>{(prescription.spy3 || '').replace(/\|/g, '/')}</td>
                                                                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center', width: '60px', color: textColor, textTransform: 'uppercase', fontWeight: 'bold', fontSize: '0.6655rem', borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>{(prescription.timing || '').replace(/\|/g, '/')}</td>
                                                                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center', width: '60px', color: textColor, fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.6655rem', borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>{(() => { const dosage = (prescription.dosage || '').replace(/\|/g, '/'); const parts = dosage.split('/'); if (prescription.presentation && parts.length > 1) { parts.splice(1, 0, prescription.presentation); } return parts.join('/'); })()}</td>
                                                                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center', width: '60px', fontWeight: 'bold', textTransform: 'uppercase', fontSize: '0.6655rem', color: textColor, borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>{(prescription.procedure || '').replace(/\|/g, '/')}</td>
                                                                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center', width: '60px', color: textColor, fontWeight: 'bold', fontSize: '0.6655rem', borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>{(prescription.droppersToday?.toString() || '').replace(/\|/g, '/').toUpperCase()}</td>
                                                                                <td style={{ padding: '0.4rem 0.5rem', textAlign: 'center', width: '60px', fontWeight: 'bold', fontSize: '0.6655rem', color: textColor, borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>{prescription.quantity || ''}</td>
                                                                            </tr>

                                                                            {/* Second Row - Additional components with labels */}
                                                                            {hasSecondRow && (
                                                                                <tr key={`${index}-extra`}>
                                                                                    {/* Split colSpan=3 into 3 cells to align dropper info under product name */}
                                                                                    <td style={{ width: '60px', borderBottom: '1px solid #ddd' }}></td>
                                                                                    <td style={{ width: '30px', borderBottom: '1px solid #ddd' }}></td>
                                                                                    <td style={{ width: '120px', padding: '0.3rem 0.5rem', textAlign: 'left', borderBottom: '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>
                                                                                        {dropperLabelItems.length > 0 && (
                                                                                            <div style={{ fontSize: '0.48rem', color: '#666', lineHeight: '1' }}>
                                                                                                {dropperLabelItems.map((item, idx) => (
                                                                                                    <div key={idx}>{item}</div>
                                                                                                ))}
                                                                                            </div>
                                                                                        )}
                                                                                    </td>

                                                                                    <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center', fontSize: '0.6655rem', fontWeight: 'bold', color: textColor, textTransform: 'uppercase', borderBottom: '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>
                                                                                        {prescription.spy4 && <><div style={{ fontSize: '0.6rem', color: '#666', marginBottom: '0.1rem' }}>SPY4:</div><div>{prescription.spy4.replace(/\|/g, '/')}</div></>}
                                                                                    </td>
                                                                                    <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center', fontSize: '0.6655rem', fontWeight: 'bold', color: textColor, textTransform: 'uppercase', borderBottom: '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>
                                                                                        {prescription.spy5 && <><div style={{ fontSize: '0.6rem', color: '#666', marginBottom: '0.1rem' }}>SPY5:</div><div>{prescription.spy5.replace(/\|/g, '/')}</div></>}
                                                                                    </td>
                                                                                    <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center', fontSize: '0.6655rem', fontWeight: 'bold', color: textColor, textTransform: 'uppercase', borderBottom: '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>
                                                                                        {prescription.spy6 && <><div style={{ fontSize: '0.6rem', color: '#666', marginBottom: '0.1rem' }}>SPY6:</div><div>{prescription.spy6.replace(/\|/g, '/')}</div></>}
                                                                                    </td>
                                                                                    <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center', fontSize: '0.6655rem', fontWeight: 'bold', color: textColor, textTransform: 'uppercase', borderBottom: '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>
                                                                                        {prescription.addition1 && <><div style={{ fontSize: '0.6rem', color: '#666', marginBottom: '0.1rem' }}>ADD1:</div><div>{(prescription.addition1 || '').replace(/\|/g, '/')}</div></>}
                                                                                    </td>
                                                                                    <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center', fontSize: '0.6655rem', fontWeight: 'bold', color: textColor, textTransform: 'uppercase', borderBottom: '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>
                                                                                        {prescription.addition2 && <><div style={{ fontSize: '0.6rem', color: '#666', marginBottom: '0.1rem' }}>ADD2:</div><div>{(prescription.addition2 || '').replace(/\|/g, '/')}</div></>}
                                                                                    </td>
                                                                                    <td style={{ padding: '0.3rem 0.5rem', textAlign: 'center', fontSize: '0.6655rem', fontWeight: 'bold', color: textColor, textTransform: 'uppercase', borderBottom: '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>
                                                                                        {prescription.addition3 && <><div style={{ fontSize: '0.6rem', color: '#666', marginBottom: '0.1rem' }}>ADD3:</div><div>{(prescription.addition3 || '').replace(/\|/g, '/')}</div></>}
                                                                                    </td>
                                                                                    <td colSpan={3} style={{ borderBottom: '1px solid #ddd' }}></td>
                                                                                </tr>
                                                                            )}
                                                                        </Fragment>
                                                                    )
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    )
                                                })()}
                                            </div>

                                            {/* MISC Products Section */}
                                            <div style={{ marginTop: '1rem', marginBottom: '0.5rem', padding: '0.5rem', backgroundColor: '#f8f9fa', borderRadius: '4px', border: '1px solid #dee2e6' }}>
                                                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#00008B', marginBottom: '0.25rem' }}>
                                                    MISC ITEMS:
                                                </div>
                                                <div style={{ fontSize: '0.65rem', color: '#000' }}>
                                                    {(() => {
                                                        // Only show default MISC products (RX PAD, FILE COVER, ENVELOPS)
                                                        // Droppers and labels are now shown under each product in the table
                                                        const defaultMiscNames = ['RX PAD', 'FILE COVER', 'ENVELOPS']
                                                        return (
                                                            <div style={{ marginLeft: '0.5rem' }}>
                                                                {defaultMiscNames.map((name, index) => (
                                                                    <span key={index}>
                                                                        • {name} x 1{index < defaultMiscNames.length - 1 ? '  ' : ''}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )
                                                    })()}
                                                </div>
                                            </div>

                                            {/* Summary Row matching table columns */}
                                            <div style={{ display: 'flex', marginBottom: '1rem', marginTop: '1rem', fontSize: '0.75rem', fontWeight: 'bold', backgroundColor: '#90EE90', padding: '0.5rem', borderRadius: '4px' }}>
                                                {(() => {
                                                    // Calculate total price excluding items where patientHasMedicine is true
                                                    const totalPrice = visit.prescriptions?.reduce((sum: number, p: any) => {
                                                        if (p.patientHasMedicine) return sum
                                                        const product = products.find((prod: any) => prod.id === p.productId)
                                                        const itemPrice = (product?.priceRupees || 0) * (p.quantity || 0)
                                                        return sum + itemPrice
                                                    }, 0) || 0

                                                    // Calculate additional bottle pricing for SPY4-6 and ADD1-3 (for display only)
                                                    let spy456Price = 0
                                                    let add123Price = 0
                                                    let spyBottleAdded = false
                                                    let additionsBottleAdded = false

                                                    visit.prescriptions?.forEach((pr: any) => {
                                                        if (pr.bottleSize && bottlePricing.length > 0) {
                                                            const bottlePriceData = bottlePricing.find((b: any) => b.value === pr.bottleSize)
                                                            const bottlePrice = bottlePriceData ? bottlePriceData.price : 0

                                                            // Add for SPY components (spy4-spy6)
                                                            if (!spyBottleAdded && (pr.spy4 || pr.spy5 || pr.spy6) && bottlePrice > 0) {
                                                                spy456Price = bottlePrice
                                                                spyBottleAdded = true
                                                            }

                                                            // Add for Additions (addition1-addition3)
                                                            if (!additionsBottleAdded && (pr.addition1 || pr.addition2 || pr.addition3) && bottlePrice > 0) {
                                                                add123Price = bottlePrice
                                                                additionsBottleAdded = true
                                                            }
                                                        }
                                                    })

                                                    // Calculate amount as balance + payment (without additional charges)
                                                    const balanceDue = parseFloat(visit.balance) || 0
                                                    const paymentReceived = parseFloat(visit.payment) || 0
                                                    const amount = balanceDue + paymentReceived

                                                    const totalMedicines = visit.prescriptions?.length || 0
                                                    const daysDiff = visit.nextVisit && visit.date
                                                        ? Math.ceil((new Date(visit.nextVisit).getTime() - new Date(visit.date).getTime()) / (1000 * 60 * 60 * 24))
                                                        : 0

                                                    const totalAdditionalCharges = spy456Price + add123Price
                                                    const totalWithCharges = totalPrice + totalAdditionalCharges

                                                    return (
                                                        <>
                                                            <div style={{ width: '60px', textAlign: 'center' }}>
                                                                ₹{totalWithCharges.toFixed(2)}
                                                            </div>
                                                            <div style={{ width: '30px', textAlign: 'center' }}>{totalMedicines}</div>
                                                            <div style={{ width: '120px', paddingLeft: '0.5rem' }}>{daysDiff} DAYS</div>
                                                            <div style={{ flex: 1 }}></div>
                                                            <div style={{ width: '60px', textAlign: 'right' }}>₹{amount.toFixed(2)}</div>
                                                        </>
                                                    )
                                                })()}
                                            </div>
                                        </div>
                                    </>
                                )}

                            </div>
                            </>
                            )}
                        </div>

                    </div>

                    {/* Reports Sidebar - Right Side */}
                    <div className="w-full lg:w-80 flex-shrink-0">
                        <div className="sticky z-10 top-4 space-y-4">
                            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-md rounded-lg shadow-md p-4 border border-blue-200 dark:border-blue-700">
                            <h2 className="text-lg font-bold text-blue-700 dark:text-blue-400 mb-3 flex items-center gap-2">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Reports
                            </h2>

                            {/* Reports Description */}
                            {visit.reports && (
                                <div className="mb-4 p-3 bg-blue-50/50 dark:bg-blue-900/20 backdrop-blur-sm rounded-md border border-blue-200 dark:border-blue-700">
                                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                        {visit.reports}
                                    </p>
                                </div>
                            )}

                            {/* Reports List */}
                            {reportsAttachments.length > 0 ? (
                                <div className="space-y-3">
                                    {reportsAttachments.map((attachment, index) => (
                                        <div
                                            key={index}
                                            onClick={() => {
                                                setSelectedReportUrl(attachment.url)
                                                setSelectedReportName(attachment.name)
                                            }}
                                            className="p-3 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-gray-700 dark:to-gray-600 border border-blue-200 dark:border-blue-600 rounded-lg cursor-pointer hover:shadow-lg hover:scale-105 transition-all duration-200"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="flex-shrink-0">
                                                    <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                    </svg>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                                                        {attachment.name}
                                                    </p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                        {attachment.type || 'PDF Document'}
                                                    </p>
                                                </div>
                                                <div className="flex-shrink-0">
                                                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                    </svg>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8">
                                    <svg className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <p className="text-gray-500 dark:text-gray-400 text-sm">No reports found</p>
                                </div>
                            )}
                            </div>

                            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-md rounded-lg shadow-md border border-blue-200 dark:border-blue-700 overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => setShowAdvancedOptions(prev => !prev)}
                                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-blue-50/70 dark:hover:bg-blue-900/20 transition-colors"
                                >
                                    <div>
                                        <h3 className="text-sm font-bold text-blue-800 dark:text-blue-300">Advanced Options</h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Image resize controls for all prescriptions</p>
                                    </div>
                                    <svg className={`w-4 h-4 text-blue-700 dark:text-blue-300 transition-transform duration-250 ${showAdvancedOptions ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>

                                <div className={`grid transition-all duration-300 ease-out ${showAdvancedOptions ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                                    <div className="overflow-hidden">
                                        <div className="px-4 pb-4 pt-3 border-t border-blue-100 dark:border-blue-800/80 space-y-3 bg-white/70 dark:bg-gray-900/20">
                                            <p className="text-xs text-gray-600 dark:text-gray-300">
                                                Resizes only the image layers. Layout boxes stay fixed. Signature can overlap its column when enlarged.
                                            </p>

                                            {advancedScaleControls.map((control) => (
                                                <div key={control.key} className="rounded-xl border border-blue-100 dark:border-blue-800/80 bg-white/80 dark:bg-gray-900/30 p-3">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{control.label}</span>
                                                        <span className="text-xs font-bold text-sky-600 dark:text-sky-400">{assetScaleDraft[control.key]}%</span>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => nudgeDraftScale(control.key, -5)}
                                                            className="h-7 w-7 rounded-lg border border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300 font-bold hover:bg-blue-50 dark:hover:bg-blue-900/40"
                                                            aria-label={`Decrease ${control.label}`}
                                                        >
                                                            -
                                                        </button>
                                                        <input
                                                            type="range"
                                                            min={50}
                                                            max={220}
                                                            step={5}
                                                            value={assetScaleDraft[control.key]}
                                                            onChange={(e) => updateDraftScale(control.key, Number(e.target.value))}
                                                            className="flex-1 accent-sky-600"
                                                            aria-label={`${control.label} scale`}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => nudgeDraftScale(control.key, 5)}
                                                            className="h-7 w-7 rounded-lg border border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300 font-bold hover:bg-blue-50 dark:hover:bg-blue-900/40"
                                                            aria-label={`Increase ${control.label}`}
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}

                                            <div className="flex items-center gap-2 pt-1">
                                                <button
                                                    type="button"
                                                    onClick={applyAssetScaleChanges}
                                                    className="flex-1 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 transition-all duration-200 shadow-sm"
                                                >
                                                    Apply
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={resetAssetScaleChanges}
                                                    className="px-3 py-2 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                                >
                                                    Set to Default
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {paperChoiceModal.open && (
                    <div
                        className="fixed inset-0 z-[9998] bg-blue-950/40 dark:bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
                        onClick={closePaperChoiceModal}
                    >
                        <div
                            className="w-full max-w-3xl rounded-2xl border border-blue-200 dark:border-blue-700 bg-white/95 dark:bg-gray-900/95 shadow-2xl overflow-hidden animate-slideUp"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="px-5 py-4 border-b border-blue-100 dark:border-blue-800 bg-gradient-to-r from-sky-50 to-blue-100 dark:from-blue-900/40 dark:to-sky-900/30">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <h3 className="text-lg font-bold text-blue-900 dark:text-blue-100">
                                            {paperChoiceModal.action === 'PRINT' ? 'Print Setup' : paperChoiceModal.action === 'DOWNLOAD' ? 'Download Setup' : 'Share Setup'}
                                        </h3>
                                        <p className="text-sm text-blue-700 dark:text-blue-300">
                                            {exportScopeLabels[paperChoiceModal.scope]} • Select paper style with preview
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={closePaperChoiceModal}
                                        className="p-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                                        aria-label="Close paper selection"
                                    >
                                        <svg className="w-5 h-5 text-blue-700 dark:text-blue-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
                                {(['letterhead', 'plain'] as PaperMode[]).map((paper) => {
                                    const isActive = selectedPaperType === paper
                                    const thumbSrc = paper === 'letterhead' ? paperPreviewThumbs.letterhead : paperPreviewThumbs.plain
                                    const previewCopyLabel = paper === 'letterhead'
                                        ? paperPreviewThumbs.letterheadPreviewCopyType
                                        : paperPreviewThumbs.plainPreviewCopyType

                                    return (
                                        <button
                                            key={paper}
                                            type="button"
                                            onClick={() => setSelectedPaperType(paper)}
                                            className={`group text-left rounded-2xl border transition-all duration-250 overflow-hidden ${isActive
                                                ? 'border-sky-500 ring-2 ring-sky-300/60 dark:ring-sky-700/60 shadow-lg shadow-sky-600/10'
                                                : 'border-blue-100 dark:border-blue-800 hover:border-sky-400 dark:hover:border-sky-600'
                                                }`}
                                        >
                                            <div className="relative bg-slate-100 dark:bg-gray-900/70 p-3">
                                                <div className="mx-auto w-full max-w-[220px]">
                                                    <div
                                                        className="relative w-full rounded-md border border-slate-300/80 shadow-md overflow-hidden"
                                                        style={{ aspectRatio: '210 / 297', background: '#fff' }}
                                                    >
                                                        {thumbSrc ? (
                                                            <div className="absolute inset-0 overflow-hidden bg-white">
                                                                <div className="modal-paper-thumb-dom" dangerouslySetInnerHTML={{ __html: thumbSrc }} />
                                                            </div>
                                                        ) : paperPreviewThumbs.loading ? (
                                                            <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-gray-800 text-slate-500 text-xs font-semibold">
                                                                Generating exact preview...
                                                            </div>
                                                        ) : (
                                                            <div className="absolute inset-0 flex items-center justify-center bg-slate-100 dark:bg-gray-800 text-slate-500 text-xs font-semibold">
                                                                Preview unavailable
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="absolute top-5 right-5 text-[10px] font-bold px-2 py-1 rounded-full bg-white/90 text-blue-700 border border-blue-100 shadow-sm">
                                                    {previewCopyLabel ? `${previewCopyLabel} preview` : (paper === 'letterhead' ? 'Pre-printed sheet' : 'Template images visible')}
                                                </div>
                                            </div>

                                            <div className="px-3 py-2 bg-white dark:bg-gray-900">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                                                        {paper === 'letterhead' ? 'Letterhead Paper' : 'Plain Paper'}
                                                    </span>
                                                    {isActive && (
                                                        <span className="text-xs font-bold text-sky-600 dark:text-sky-400 uppercase">Selected</span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                                    {paper === 'letterhead'
                                                        ? 'Header, footer and watermark graphics are hidden for pre-printed paper.'
                                                        : 'Header, footer and watermark graphics are printed from this layout.'}
                                                </p>
                                            </div>
                                        </button>
                                    )
                                })}
                            </div>

                            <div className="px-5 py-4 border-t border-blue-100 dark:border-blue-800 flex items-center justify-end gap-2 bg-blue-50/50 dark:bg-blue-900/20">
                                <button
                                    type="button"
                                    onClick={closePaperChoiceModal}
                                    className="px-4 py-2 rounded-xl text-sm font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={() => runExportAction(paperChoiceModal.action, paperChoiceModal.scope, selectedPaperType)}
                                    disabled={isGeneratingPDF}
                                    className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 transition-all duration-200 shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
                                >
                                    {isGeneratingPDF
                                        ? (paperChoiceModal.action === 'PRINT' ? 'Preparing Print...' : paperChoiceModal.action === 'DOWNLOAD' ? 'Preparing Download...' : 'Preparing Share...')
                                        : (paperChoiceModal.action === 'PRINT' ? 'Print' : paperChoiceModal.action === 'DOWNLOAD' ? 'Download' : 'Share')}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* PDF Viewer Modal */}
                {selectedReportUrl && (
                    <div
                        className="fixed inset-0 bg-blue-900/40 backdrop-blur-sm flex items-center justify-center z-[9999] p-4"
                        onClick={() => {
                            setSelectedReportUrl(null)
                            setSelectedReportName('')
                        }}
                    >
                        <div
                            className="bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-lg shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col border border-blue-200 dark:border-blue-700"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className="flex items-center justify-between p-4 border-b border-blue-200 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/20">
                                <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200 truncate">
                                    {selectedReportName}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <a
                                        href={selectedReportUrl}
                                        download={selectedReportName}
                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all flex items-center gap-2 text-sm font-medium"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                        </svg>
                                        Download
                                    </a>
                                    <button
                                        onClick={() => window.open(selectedReportUrl, '_blank')}
                                        className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-all flex items-center gap-2 text-sm font-medium"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                        </svg>
                                        Open in New Tab
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSelectedReportUrl(null)
                                            setSelectedReportName('')
                                        }}
                                        className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-all"
                                    >
                                        <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* PDF Viewer */}
                            <div className="flex-1 overflow-hidden">
                                <iframe
                                    src={selectedReportUrl}
                                    className="w-full h-full"
                                    title={selectedReportName}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Print and Animation Styles */}
            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes fadeIn {
                    from {
                        opacity: 0;
                    }
                    to {
                        opacity: 1;
                    }
                }
                
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                .animate-fadeIn {
                    animation: fadeIn 0.2s ease-out;
                }
                
                .animate-slideUp {
                    animation: slideUp 0.3s ease-out;
                }

                @keyframes menuPop {
                    from {
                        opacity: 0;
                        transform: translateY(-8px) scale(0.98);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0) scale(1);
                    }
                }

                .export-menu-panel {
                    animation: menuPop 0.2s ease-out;
                    transform-origin: top right;
                }
                
                @media print {
                    @page {
                        size: A4;
                        margin: 0;
                    }

                    html,
                    body {
                        width: 210mm !important;
                        height: 297mm !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        overflow: hidden !important;
                        background: white !important;
                    }

                    .prescription-container-wrapper {
                        overflow: visible !important;
                    }
                    
                    body * {
                        visibility: hidden;
                    }
                    
                    .prescription-container,
                    .prescription-container * {
                        visibility: visible;
                    }
                    
                    /* Hide the red boundary line in print */
                    .prescription-container::after {
                        display: none !important;
                    }
                    
                    .prescription-container {
                        position: fixed;
                        left: 0;
                        top: 0;
                        width: 210mm;
                        height: 297mm;
                        min-height: 297mm;
                        margin: 0;
                        padding: 0;
                        box-shadow: none;
                        border-radius: 0;
                        transform: none;
                    }
                    
                    .no-print {
                        display: none !important;
                    }
                    
                    .no-print {
                        display: none !important;
                        visibility: hidden !important;
                    }
                    
                    body {
                        margin: 0 !important;
                        padding: 0 !important;
                        background: white !important;
                    }
                    
                    /* Preserve ALL inline color styles */
                    [style*="color: #0000FF"],
                    [style*="color: #2563eb"],
                    .text-blue-600 {
                        color: #0000FF !important;
                    }
                    [style*="color: #2563eb"],
                    .text-sky-600 {
                        color: #2563eb !important;
                    }
                    [style*="color: #C80000"],
                    [style*="color: #dc2626"],
                    .text-red-600 {
                        color: #C80000 !important;
                    }
                    [style*="color: #FF8C00"],
                    .text-orange-600 {
                        color: #FF8C00 !important;
                    }
                    [style*="color: #800080"],
                    .text-purple-600 {
                        color: #800080 !important;
                    }
                    [style*="color: #1f2937"],
                    .text-gray-800 {
                        color: #1f2937 !important;
                    }
                    [style*="color: #374151"],
                    .text-gray-700 {
                        color: #374151 !important;
                    }
                    [style*="color: #4b5563"],
                    .text-gray-600 {
                        color: #4b5563 !important;
                    }
                    [style*="background: #fef3c7"],
                    .bg-yellow-100 {
                        background-color: #fef3c7 !important;
                    }
                    
                    * {
                        background-color: transparent !important;
                    }
                    
                    .prescription-container {
                        background-color: white !important;
                    }
                    
                    /* Print on Letterhead - Hide images but keep their space */
                    .print-letterhead .header-container img,
                    .print-letterhead .footer-container img,
                    .print-letterhead .separator-container img,
                    .print-letterhead .watermark-container img {
                        visibility: hidden !important;
                    }

                    .print-letterhead .watermark-container {
                        background-image: none !important;
                    }
                }
                /* Screen view - exact A4 dimensions to match PDF output */
                .prescription-container {
                    width: 210mm;
                    min-height: 297mm;
                    margin: 0 auto;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                    border-radius: 8px;
                    background: white !important;
                    color: black !important;
                    position: relative;
                }
                
                /* Letterhead mode - Hide images but keep space (for html2canvas capture) */
                .print-letterhead .header-container img,
                .print-letterhead .footer-container img,
                .print-letterhead .separator-container img,
                .print-letterhead .watermark-container img {
                    opacity: 0 !important;
                    visibility: hidden !important;
                }

                .print-letterhead .watermark-container {
                    background-image: none !important;
                }

                .modal-paper-thumb-dom {
                    width: 794px;
                    height: 1123px;
                    transform: scale(0.277);
                    transform-origin: top left;
                }

                .modal-paper-thumb-dom .prescription-container {
                    width: 794px !important;
                    min-height: 1123px !important;
                    margin: 0 !important;
                    box-shadow: none !important;
                    border-radius: 0 !important;
                }

                .prescription-container-wrapper .pcp-sheet-root .watermark-container img {
                    visibility: visible !important;
                    opacity: 1 !important;
                    backface-visibility: visible !important;
                }
            `}} />
        </div>
    )
}








