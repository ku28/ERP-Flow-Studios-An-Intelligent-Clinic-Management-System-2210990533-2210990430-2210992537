import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import PrescriptionTemplateRenderer from './prescription-builder/PrescriptionTemplateRenderer'
import type { PrescriptionTemplateConfig } from '../lib/prescriptionTemplate'
import { applyAssetsToTemplate, getActiveTemplateFromCollection, normalizeTemplateCollection } from '../lib/prescriptionTemplate'
import { useAuth } from '../contexts/AuthContext'

interface PatientCopyPreviewProps {
    form: any
    prescriptions: any[]
    products: any[]
    patients: any[]
    bottlePricing: any[]
    isExpanded: boolean
    onToggle: () => void
    copyTypeOverride?: 'PATIENT' | 'OFFICE'
    onCopyTypeChange?: (next: 'PATIENT' | 'OFFICE') => void
    renderOnlySheet?: boolean
    sheetRootRef?: React.Ref<HTMLDivElement>
    assetScaleOverride?: {
        header: number
        footer: number
        signature: number
        watermark: number
    }
    usePrintHeaderTitleOffset?: boolean
    forceTemplateWatermark?: boolean
    clinicImagesOverride?: { header: string; footer: string; watermark: string; signature: string }
    clinicIconUrlOverride?: string
    prescriptionTemplateOverride?: PrescriptionTemplateConfig | null
    isProOverride?: boolean
    patientPreviewPageOverride?: 1 | 2
    onPatientPreviewPageChange?: (page: 1 | 2) => void
}

export default function PatientCopyPreview({
    form,
    prescriptions,
    products,
    patients,
    bottlePricing,
    isExpanded,
    onToggle,
    copyTypeOverride,
    onCopyTypeChange,
    renderOnlySheet = false,
    sheetRootRef,
    assetScaleOverride,
    usePrintHeaderTitleOffset = false,
    forceTemplateWatermark = false,
    clinicImagesOverride,
    clinicIconUrlOverride,
    prescriptionTemplateOverride,
    isProOverride,
    patientPreviewPageOverride,
    onPatientPreviewPageChange,
}: PatientCopyPreviewProps) {
    const router = useRouter()
    const { user: authUser } = useAuth()
    const isPrescriptionsPage = router.pathname === '/prescriptions'
    const isVisitDetailPage = router.pathname === '/visits/[id]'
    const [clinicImages, setClinicImages] = useState<{ header: string; footer: string; watermark: string; signature: string }>({
        header: '',
        footer: '',
        watermark: '',
        signature: ''
    })
    const [subscriptionPlan, setSubscriptionPlan] = useState<string>('')
    const [clinicIconUrl, setClinicIconUrl] = useState<string>('')
    const [isPro, setIsPro] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('clinicIsPro') === '1' : false)
    const [themeColor, setThemeColor] = useState(() => {
        if (typeof window === 'undefined') return '#3B82F6'
        const m: Record<string, string> = { blue: '#3B82F6', purple: '#8B5CF6', emerald: '#10B981', rose: '#F43F5E', teal: '#22C55E', green: '#22C55E' }
        return m[localStorage.getItem('clinicTheme') || 'blue'] || '#3B82F6'
    })
    const [internalCopyType, setInternalCopyType] = useState<'PATIENT' | 'OFFICE'>(() => {
        if (typeof window === 'undefined') return 'PATIENT'
        const saved = window.sessionStorage.getItem('patientCopyPreviewCopyType')
        return saved === 'OFFICE' ? 'OFFICE' : 'PATIENT'
    })
    const [isMobile, setIsMobile] = useState(false)
    const [prescriptionTemplate, setPrescriptionTemplate] = useState<PrescriptionTemplateConfig | null>(null)
    const [copyFlipPhase, setCopyFlipPhase] = useState<'idle' | 'out' | 'in'>('idle')
    const [copyFlipDir, setCopyFlipDir] = useState<'left' | 'right'>('right')
    const [patientPreviewPage, setPatientPreviewPage] = useState<1 | 2>(1)
    const [isClosingSidebar, setIsClosingSidebar] = useState(false)
    const closeSidebarTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const prescriptionsPreviewHostRef = useRef<HTMLDivElement | null>(null)
    const [prescriptionsPatientZoom, setPrescriptionsPatientZoom] = useState(1)
    const effectiveAssetScales = assetScaleOverride || { header: 100, footer: 100, signature: 100, watermark: 100 }
    const sidebarAnimMs = 320
    const hasDeterministicBrandingOverride = !!clinicImagesOverride && prescriptionTemplateOverride !== undefined

    const normalizeClinicAssetUrl = (value: unknown): string => {
        if (typeof value !== 'string') return ''
        const trimmed = value.trim()
        if (!trimmed) return ''

        const lowered = trimmed.toLowerCase()
        if (lowered === 'null' || lowered === 'undefined' || lowered === 'n/a') {
            return ''
        }

        return trimmed
    }

    const copyType: 'PATIENT' | 'OFFICE' = copyTypeOverride || internalCopyType
    const setCopyType = (next: 'PATIENT' | 'OFFICE') => {
        if (!copyTypeOverride) {
            setInternalCopyType(next)
        }
        if (onCopyTypeChange) {
            onCopyTypeChange(next)
        }
    }

    const resolvedPatientPreviewPage: 1 | 2 = patientPreviewPageOverride ?? patientPreviewPage
    const updatePatientPreviewPage = useCallback((page: 1 | 2) => {
        if (onPatientPreviewPageChange) {
            onPatientPreviewPageChange(page)
        }
        if (patientPreviewPageOverride === undefined) {
            setPatientPreviewPage(page)
        }
    }, [onPatientPreviewPageChange, patientPreviewPageOverride])

    // Detect mobile viewport
    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768)
        checkMobile()
        window.addEventListener('resize', checkMobile)
        return () => window.removeEventListener('resize', checkMobile)
    }, [])

    useEffect(() => {
        if (hasDeterministicBrandingOverride) {
            return
        }

        // Use AuthContext user instead of fetching /api/auth/me
        if (authUser?.clinic) {
            const clinicWatermark = normalizeClinicAssetUrl(authUser.clinic.prescriptionWatermarkUrl)
            const clinicIcon = normalizeClinicAssetUrl(authUser.clinic.iconUrl)
            const resolvedWatermark = clinicWatermark || clinicIcon || ''
            setClinicImages({
                header: normalizeClinicAssetUrl(authUser.clinic.prescriptionHeaderUrl),
                footer: normalizeClinicAssetUrl(authUser.clinic.prescriptionFooterUrl),
                watermark: resolvedWatermark,
                signature: normalizeClinicAssetUrl(authUser.clinic.prescriptionSignatureUrl),
            })
            const subPlan = authUser.clinic.subscriptionPlan || 'basic'
            const subEnd = authUser.clinic.subscriptionEnd
            const proCalc = subPlan === 'pro' && (!subEnd || new Date(subEnd) > new Date())
            setSubscriptionPlan(subPlan)
            setIsPro(proCalc)
            setClinicIconUrl(clinicIcon)
            const gMap: Record<string, string> = { blue: '#3B82F6', purple: '#8B5CF6', emerald: '#10B981', rose: '#F43F5E', teal: '#22C55E', green: '#22C55E' }
            setThemeColor(gMap[authUser.clinic.themeGradient || 'blue'] || '#3B82F6')

            fetch('/api/clinic/prescription-template', { cache: 'no-store' })
                .then((r) => (r.ok ? r.json() : null))
                .then((templateData) => {
                    const collection = normalizeTemplateCollection(templateData?.collection || templateData)
                    const activeTemplate = collection.activeTemplateId
                        ? getActiveTemplateFromCollection(collection)
                        : null
                    if (activeTemplate?.template) {
                        setPrescriptionTemplate(applyAssetsToTemplate(activeTemplate.template, {
                            headerUrl: normalizeClinicAssetUrl(authUser.clinic.prescriptionHeaderUrl) || undefined,
                            footerUrl: normalizeClinicAssetUrl(authUser.clinic.prescriptionFooterUrl) || undefined,
                            signatureUrl: normalizeClinicAssetUrl(authUser.clinic.prescriptionSignatureUrl) || undefined,
                            watermarkUrl: resolvedWatermark || undefined,
                        }))
                    } else {
                        setPrescriptionTemplate(null)
                    }
                })
                .catch(() => {})
        }
    }, [hasDeterministicBrandingOverride, authUser])

    useEffect(() => {
        if (typeof window === 'undefined') return
        window.sessionStorage.setItem('patientCopyPreviewCopyType', copyType)
    }, [copyType])

    useEffect(() => {
        if (copyType !== 'PATIENT' && resolvedPatientPreviewPage !== 1) {
            updatePatientPreviewPage(1)
        }
    }, [copyType, resolvedPatientPreviewPage, updatePatientPreviewPage])

    useEffect(() => {
        if ((prescriptions?.length || 0) <= 12 && resolvedPatientPreviewPage !== 1) {
            updatePatientPreviewPage(1)
        }
    }, [resolvedPatientPreviewPage, prescriptions, updatePatientPreviewPage])

    useEffect(() => {
        if (!isExpanded) {
            setIsClosingSidebar(false)
        }
    }, [isExpanded])

    useEffect(() => {
        return () => {
            if (closeSidebarTimerRef.current) {
                clearTimeout(closeSidebarTimerRef.current)
            }
        }
    }, [])

    useEffect(() => {
        if (!isPrescriptionsPage || !isExpanded || isMobile || copyType !== 'PATIENT') {
            setPrescriptionsPatientZoom(1)
            return
        }
        const host = prescriptionsPreviewHostRef.current
        if (!host || typeof window === 'undefined') return

        const PAGE_WIDTH_PX = 794
        const HORIZONTAL_SPACE_RESERVED_PX = 44
        const recalcZoom = () => {
            const available = Math.max(0, host.clientWidth - HORIZONTAL_SPACE_RESERVED_PX)
            const next = Math.max(0.6, Math.min(1, available / PAGE_WIDTH_PX))
            setPrescriptionsPatientZoom(Number(next.toFixed(3)))
        }

        recalcZoom()
        const resizeObserver = new ResizeObserver(recalcZoom)
        resizeObserver.observe(host)
        window.addEventListener('resize', recalcZoom)

        return () => {
            resizeObserver.disconnect()
            window.removeEventListener('resize', recalcZoom)
        }
    }, [isPrescriptionsPage, isExpanded, isMobile, copyType])

    const closePrescriptionsSidebar = useCallback(() => {
        if (isClosingSidebar) return
        setIsClosingSidebar(true)
        if (closeSidebarTimerRef.current) {
            clearTimeout(closeSidebarTimerRef.current)
        }
        closeSidebarTimerRef.current = setTimeout(() => {
            setIsClosingSidebar(false)
            onToggle()
        }, sidebarAnimMs)
    }, [isClosingSidebar, onToggle, sidebarAnimMs])

    const toggleCopyTypeWithFlip = (targetType?: 'PATIENT' | 'OFFICE') => {
        if (copyFlipPhase !== 'idle') return
        const nextType: 'PATIENT' | 'OFFICE' = targetType || (copyType === 'PATIENT' ? 'OFFICE' : 'PATIENT')
        if (nextType === copyType) return

        const direction: 'left' | 'right' = nextType === 'OFFICE' ? 'right' : 'left'
        setCopyFlipDir(direction)
        setCopyFlipPhase('out')

        setTimeout(() => {
            setCopyType(nextType)
            setCopyFlipPhase('in')
            setTimeout(() => setCopyFlipPhase('idle'), 240)
        }, 180)
    }

    const copyFlipAnimClass = copyFlipPhase === 'out'
        ? (copyFlipDir === 'right' ? 'med-flip-out-left' : 'med-flip-out-right')
        : copyFlipPhase === 'in'
            ? (copyFlipDir === 'right' ? 'med-flip-in-right' : 'med-flip-in-left')
            : ''

    // Lock body scroll on mobile when expanded
    useEffect(() => {
        if (isMobile && isExpanded) {
            document.body.style.overflow = 'hidden'
            return () => { document.body.style.overflow = '' }
        }
    }, [isMobile, isExpanded])

    const selectedPatient = useMemo(() => {
        if (!form.patientId) return null
        return patients.find((p: any) => String(p.id) === String(form.patientId))
    }, [form.patientId, patients])

    const resolvedClinicImages = clinicImagesOverride || clinicImages
    const resolvedClinicIconUrl = clinicIconUrlOverride ?? clinicIconUrl
    const resolvedPrescriptionTemplate = prescriptionTemplateOverride !== undefined
        ? prescriptionTemplateOverride
        : prescriptionTemplate
    const resolvedIsPro = typeof isProOverride === 'boolean' ? isProOverride : isPro

    const patientName = selectedPatient ? `${selectedPatient.firstName || ''} ${selectedPatient.lastName || ''}`.trim() : ''
    const watermarkSrc = resolvedClinicImages.watermark || resolvedClinicIconUrl || ''
    const effectiveTemplate = resolvedPrescriptionTemplate
        ? {
            ...resolvedPrescriptionTemplate,
            showWatermark: forceTemplateWatermark ? true : resolvedPrescriptionTemplate.showWatermark,
            sections: forceTemplateWatermark
                ? (() => {
                    const hasWatermark = resolvedPrescriptionTemplate.sections?.some((s: any) => s.id === 'watermark')
                    const nextSections = (resolvedPrescriptionTemplate.sections || []).map((s: any) =>
                        s.id === 'watermark' ? { ...s, enabled: true } : s
                    )
                    if (!hasWatermark) {
                        nextSections.push({ id: 'watermark', enabled: true } as any)
                    }
                    return nextSections
                })()
                : resolvedPrescriptionTemplate.sections,
        }
        : null

    const visitData = useMemo(() => ({
        gender: form.gender || selectedPatient?.gender || '',
        dob: form.dob || selectedPatient?.dob || '',
        height: form.height || '',
        weight: form.weight || '',
        visitNumber: form.visitNumber || '1',
        age: form.age || selectedPatient?.age || '',
        followUpCount: form.followUpCount || '',
        nextVisit: form.nextVisitDate || '',
        opdNo: form.opdNo || '',
        temperament: form.temperament || '',
        pulseDiagnosis: form.pulseDiagnosis || '',
        pulseDiagnosis2: form.pulseDiagnosis2 || '',
        historyReports: form.historyReports || '',
        majorComplaints: form.majorComplaints || '',
        investigations: form.investigations || '',
        provisionalDiagnosis: form.provisionalDiagnosis || '',
        improvements: form.improvements || '',
        discussion: form.discussion || '',
        specialNote: form.specialNote || '',
        date: form.date || new Date().toISOString().split('T')[0],
        balance: form.balance || '',
        payment: form.payment || '',
        patient: selectedPatient ? {
            firstName: selectedPatient.firstName || '',
            lastName: selectedPatient.lastName || '',
            gender: selectedPatient.gender || '',
            dob: selectedPatient.dob || '',
            age: selectedPatient.age || '',
            phone: selectedPatient.phone || form.phone || '',
            address: selectedPatient.address || form.address || '',
            occupation: selectedPatient.occupation || form.occupation || '',
            fatherHusbandGuardianName: selectedPatient.fatherHusbandGuardianName || form.fatherHusbandGuardianName || '',
            imageUrl: selectedPatient.imageUrl || form.imageUrl || '',
            opdNo: selectedPatient.opdNo || ''
        } : null,
        prescriptions: prescriptions.map((p: any) => ({
            ...p,
            product: products.find((prod: any) => String(prod.id) === String(p.productId))
        }))
    }), [form, selectedPatient, prescriptions, products])

    const NA = <span style={{ color: '#FF0000' }}>N/A</span>

    // For expanded mode: use true sizes. For thumbnail: use tiny sizes. For mobile expanded: slightly smaller than desktop expanded.
    const sz = useCallback((expanded: string, thumb: string, mobileExpanded?: string) => {
        if (isExpanded) return isMobile && mobileExpanded ? mobileExpanded : expanded
        return thumb
    }, [isExpanded, isMobile])

    // ==================== SHARED HELPERS ====================

    const darkenColor = (hex: string, percent: number = 0.25): string => {
        const num = parseInt(hex.replace('#', ''), 16)
        const r = Math.max(0, Math.floor((num >> 16) * (1 - percent)))
        const g = Math.max(0, Math.floor(((num >> 8) & 0x00FF) * (1 - percent)))
        const b = Math.max(0, Math.floor((num & 0x0000FF) * (1 - percent)))
        return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
    }

    const renderFloatingPreviewLabel = (title: string) => (
        <div style={{ position: 'absolute', top: '0', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', inset: '0', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff', borderRadius: '2px', transform: 'scale(1.275)', transformOrigin: 'center' }}></div>
            <span data-margin-header-title="true" style={{ position: 'relative', display: 'block', padding: '0 4px 1px 4px', color: '#000', fontWeight: 'bold', fontSize: '11px', lineHeight: '1', transform: usePrintHeaderTitleOffset ? 'translateY(-50%)' : 'none' }}>{title}</span>
        </div>
    )

    const renderAbsoluteSectionHeader = (title: string) => (
        <div style={{ position: 'absolute', top: '0', left: '0', right: '0' }}>
            <div style={{ borderBottom: `1px solid ${isPro ? '#FF8C00' : '#000000'}`, marginBottom: '2px', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}></div>
            {renderFloatingPreviewLabel(title)}
        </div>
    )

    const renderSectionHeader = (title: string) => (
        <div style={{ position: 'relative', margin: '5px 0 2px 0' }}>
            <div style={{ borderBottom: `1px solid ${isPro ? '#FF8C00' : '#000000'}`, background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}></div>
            {renderFloatingPreviewLabel(title)}
        </div>
    )

    const renderPatientImageExact = () => (
        <div style={{ width: '90px', height: '110px', border: '1px solid #ddd', overflow: 'hidden', flexShrink: 0, marginTop: '5px' }}>
            {visitData.patient?.imageUrl ? (
                <img
                    src={visitData.patient.imageUrl}
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
    )

    const renderPatientImage = () => (
        <div style={{ width: sz('90px', '25px', '60px'), height: sz('110px', '30px', '75px'), border: '1px solid #ddd', overflow: 'hidden', flexShrink: 0, marginTop: sz('5px', '2px') }}>
            {visitData.patient?.imageUrl ? (
                <img src={visitData.patient.imageUrl} alt="Patient"
                                                                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
                    onError={(e) => { e.currentTarget.src = process.env.NEXT_PUBLIC_DEFAULT_PATIENT_IMAGE || '/default-patient.png' }} />
            ) : (
                <img src={process.env.NEXT_PUBLIC_DEFAULT_PATIENT_IMAGE || '/default-patient.png'} alt="Patient"
                                                                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
                    onError={(e) => {
                        const target = e.currentTarget as HTMLImageElement
                        target.style.display = 'none'
                        const parent = target.parentElement
                        if (parent) { parent.style.backgroundColor = '#f0f0f0'; parent.style.display = 'flex'; parent.style.alignItems = 'center'; parent.style.justifyContent = 'center'; parent.innerHTML = '<div style="font-size: 0.4rem; color: #999;">No Image</div>' }
                    }} />
            )}
        </div>
    )

    // ==================== PATIENT COPY ====================
    const renderPatientPrescriptionTableContent = (items: any[], startIndex: number = 0) => {
        const hasSpy4 = visitData.prescriptions?.some((p: any) => p.spy4) || false
        const hasSpy6 = visitData.prescriptions?.some((p: any) => p.spy6) || false

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
                            const product = p.product || products.find((prod: any) => String(prod.id) === String(p.productId))
                            const medicineName = (product?.name || p.treatment?.treatmentPlan || '').toUpperCase()
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

    const renderPatientCopy = () => {
        const patientPrescriptions = (visitData.prescriptions || []) as any[]
        const firstPagePatientPrescriptions = patientPrescriptions.slice(0, 12)
        const overflowPatientPrescriptions = patientPrescriptions.slice(12)
        const hasPatientOverflowPage = overflowPatientPrescriptions.length > 0
        const enableSinglePageSlider = isVisitDetailPage && hasPatientOverflowPage

        return (
            <div style={{ background: 'white', color: 'black', padding: '0', position: 'relative', width: '210mm', minHeight: '297mm', boxSizing: 'border-box', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div className="patient-pages-viewport" style={{ width: '100%', overflow: enableSinglePageSlider ? 'hidden' : 'visible' }}>
                    <div
                        className="patient-pages-track"
                        style={enableSinglePageSlider
                            ? {
                                display: 'flex',
                                transform: resolvedPatientPreviewPage === 2 ? 'translate3d(-100%, 0, 0)' : 'translate3d(0, 0, 0)',
                                transition: 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)',
                            }
                            : undefined}
                    >
                        <div className="patient-primary-page" style={{ position: 'relative', minHeight: '297mm', display: 'flex', flexDirection: 'column', background: 'white', flex: enableSinglePageSlider ? '0 0 100%' : undefined }}>
                <div className="watermark-container" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.175, zIndex: 0, pointerEvents: 'none', width: '65%', height: 'auto' }}>
                    <img src={watermarkSrc} alt="Watermark" style={{ width: '100%', height: 'auto', objectFit: 'contain', display: 'block' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                </div>

                <div className="header-container" style={{ width: '100%', overflow: 'hidden', marginBottom: '1rem', position: 'relative', zIndex: 1 }}>
                    <img src={resolvedClinicImages.header} alt="Header" style={{ width: '100%', height: '90%', display: 'block' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                </div>

                <div style={{ padding: '0 1.5rem', position: 'relative', zIndex: 1, flex: '1 0 auto' }}>
                    <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
                        <div style={{ flex: 1, padding: '4px', position: 'relative', paddingTop: '16px', borderSpacing: '1px' }}>
                            {renderAbsoluteSectionHeader('Particulars')}
                            <div style={{ width: '30px', height: '15px', background: visitData.improvements ? darkenColor(themeColor, 0.25) : 'red', marginBottom: '2px', border: '1px solid #000' }}></div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', fontSize: '10px', gap: '1px', lineHeight: '1.1', marginTop: '7px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>DATE:</span> <span style={{ marginLeft: '4px', color: '#0000FF', fontWeight: 'bold' }}>{visitData.date ? new Date(visitData.date).toLocaleDateString('en-GB') : NA}</span></div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>SEX:</span> <span style={{ marginLeft: '4px' }}>{visitData.gender || NA}</span></div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>DOB:</span> <span style={{ marginLeft: '4px' }}>{visitData.dob ? new Date(visitData.dob).toLocaleDateString('en-GB') : NA}</span></div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>HT:</span> <span style={{ marginLeft: '4px' }}>{visitData.height || NA}</span></div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>WT:</span> <span style={{ marginLeft: '4px' }}>{visitData.weight || NA}</span></div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>VISIT:</span> <span style={{ marginLeft: '4px' }}>{visitData.visitNumber || '1'}</span></div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>AGE:</span> <span style={{ marginLeft: '4px' }}>{visitData.age || NA}</span></div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start' }}><a href="#nextVisit" style={{ fontWeight: 'bold', color: '#000', cursor: 'pointer' }}>FOLLOW UP:</a> <span style={{ marginLeft: '4px', color: '#C80000', fontWeight: 'bold' }}>{visitData.followUpCount ? `#${visitData.followUpCount}` : NA}</span></div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>NEXT V:</span> <span style={{ marginLeft: '4px', color: '#C80000', fontWeight: 'bold' }}>{visitData.nextVisit ? new Date(visitData.nextVisit).toLocaleDateString('en-GB') : NA}</span></div>
                                </div>
                            </div>
                        </div>

                        <div style={{ flex: 1, padding: '4px', position: 'relative', paddingTop: '16px', display: 'flex', gap: '5px', borderSpacing: '1px' }}>
                            {renderAbsoluteSectionHeader('Patient Info')}

                            <div style={{ flex: 1, marginTop: '5px' }}>
                                <div style={{ fontSize: '10px', lineHeight: '1.1', marginTop: '0px' }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>OPDN:</span> <span style={{ fontWeight: 'bold', color: '#0000FF', marginLeft: '4px' }}>{visitData.opdNo || NA}</span></div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>NAME:</span> <span style={{ fontWeight: 'bold', color: '#0000FF', marginLeft: '4px' }}>{patientName || NA}</span></div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>F/H/G NAME:</span> <span style={{ color: '#000', marginLeft: '4px' }}>{visitData.patient?.fatherHusbandGuardianName || NA}</span></div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>ADDRESS:</span> <span style={{ color: '#000', marginLeft: '4px' }}>{visitData.patient?.address || NA}</span></div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>PHONE NO:</span> <span style={{ color: '#000', marginLeft: '4px' }}>{visitData.patient?.phone || NA}</span></div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>OCCUPATION:</span> <span style={{ color: '#000', marginLeft: '4px' }}>{visitData.patient?.occupation || NA}</span></div>
                                </div>
                            </div>
                            {renderPatientImageExact()}
                        </div>
                    </div>

                    {renderSectionHeader('EH Parameters')}
                    <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
                        <div style={{ flex: 1, padding: '4px', position: 'relative', paddingTop: '10px', borderSpacing: '1px' }}>
                            <div style={{ fontSize: '10px', display: 'flex', alignItems: 'flex-start', lineHeight: '1.1' }}><span style={{ fontWeight: 'bold' }}>TEMP:</span> <span style={{ marginLeft: '4px' }}>{visitData.temperament || NA}</span></div>
                        </div>
                        <div style={{ flex: 1, padding: '4px', position: 'relative', paddingTop: '10px', borderSpacing: '1px' }}>
                            <div style={{ fontSize: '10px', display: 'flex', alignItems: 'flex-start', lineHeight: '1.1' }}><span style={{ fontWeight: 'bold' }}>PULSE-1:</span> <span style={{ marginLeft: '4px' }}>{visitData.pulseDiagnosis || NA}</span></div>
                        </div>
                        <div style={{ flex: 1, padding: '4px', position: 'relative', paddingTop: '10px', borderSpacing: '1px' }}>
                            <div style={{ fontSize: '10px', display: 'flex', alignItems: 'flex-start', lineHeight: '1.1' }}><span style={{ fontWeight: 'bold' }}>PULSE-2:</span> <span style={{ marginLeft: '4px' }}>{visitData.pulseDiagnosis2 || NA}</span></div>
                        </div>
                    </div>

                    {renderSectionHeader('Prev Info')}
                    <div style={{ padding: '4px', position: 'relative', paddingTop: '16px', marginBottom: '15px', borderSpacing: '1px' }}>
                        <div style={{ fontSize: '9px', display: 'flex', alignItems: 'flex-start', lineHeight: '1.1', marginTop: '0px' }}><span style={{ fontWeight: 'bold' }}>HISTORY & REPORTS:</span> <span style={{ fontFamily: 'Brush Script MT, cursive', fontStyle: 'italic', color: visitData.historyReports ? '#0000FF' : '#FF0000', fontSize: '12px', marginLeft: '4px' }}>{visitData.historyReports || 'N/A'}</span></div>
                    </div>

                    {renderSectionHeader('Sign & Symptoms')}
                    <div style={{ padding: '4px', position: 'relative', paddingTop: '16px', marginBottom: '15px', borderSpacing: '1px' }}>
                        <div style={{ fontSize: '9px', display: 'flex', alignItems: 'flex-start', lineHeight: '1.1', marginTop: '0px' }}><span style={{ fontWeight: 'bold' }}>CHIEF COMPLAINTS:</span> <span style={{ fontFamily: 'Brush Script MT, cursive', fontStyle: 'italic', color: visitData.majorComplaints ? '#0000FF' : '#FF0000', fontSize: '12px', marginLeft: '4px' }}>{visitData.majorComplaints || 'N/A'}</span></div>
                    </div>

                    <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
                        <div style={{ flex: 1, padding: '4px', position: 'relative', paddingTop: '16px', borderSpacing: '1px' }}>
                            {renderAbsoluteSectionHeader('Investigations')}
                            <div style={{ fontFamily: 'Brush Script MT, cursive', fontStyle: 'italic', color: visitData.investigations ? '#0000FF' : '#FF0000', fontSize: '12px', lineHeight: '1.1', marginTop: '0px', wordWrap: 'break-word' }}>{visitData.investigations || 'N/A'}</div>
                        </div>
                        <div style={{ flex: 1, padding: '4px', position: 'relative', paddingTop: '16px', borderSpacing: '1px' }}>
                            {renderAbsoluteSectionHeader('Provisional Diagnosis')}
                            <div style={{ fontFamily: 'Brush Script MT, cursive', fontStyle: 'italic', color: (visitData.provisionalDiagnosis || (visitData as any).diagnoses) ? '#0000FF' : '#FF0000', fontSize: '12px', lineHeight: '1.1', marginTop: '0px', wordWrap: 'break-word' }}>{visitData.provisionalDiagnosis || (visitData as any).diagnoses || 'N/A'}</div>
                        </div>
                    </div>

                    {renderSectionHeader('Cure')}
                    <div style={{ padding: '4px', position: 'relative', paddingTop: '16px', marginBottom: '15px', borderSpacing: '1px' }}>
                        <div style={{ fontSize: '9px', display: 'flex', alignItems: 'flex-start', lineHeight: '1.1', marginTop: '0px' }}><span style={{ fontWeight: 'bold' }}>IMPROVEMENTS:</span> <span style={{ fontFamily: 'Brush Script MT, cursive', fontStyle: 'italic', color: visitData.improvements ? '#0000FF' : '#FF0000', fontSize: '12px', marginLeft: '4px' }}>{visitData.improvements || 'N/A'}</span></div>
                    </div>

                    {renderSectionHeader('Discuss')}
                    <div style={{ padding: '4px', position: 'relative', paddingTop: '16px', marginBottom: '15px', borderSpacing: '1px' }}>
                        <div style={{ fontSize: '9px', display: 'flex', alignItems: 'flex-start', marginTop: '0px' }}><span style={{ fontWeight: 'bold' }}>DISCUSS:</span> <span style={{ fontFamily: 'Brush Script MT, cursive', fontStyle: 'italic', color: visitData.discussion ? '#0000FF' : '#FF0000', fontSize: '12px', marginLeft: '4px' }}>{visitData.discussion || 'N/A'}</span></div>
                    </div>

                    {visitData.specialNote && (
                        <div style={{ fontSize: '9px', display: 'flex', alignItems: 'flex-start', marginBottom: '6px', paddingLeft: '4px' }}>
                            <span style={{ fontWeight: 'bold' }}>Special Note:</span>
                            <span style={{ marginLeft: '4px' }}>{visitData.specialNote}</span>
                        </div>
                    )}

                    <div style={{ borderBottom: `0.5px solid ${isPro ? '#FF8C00' : '#000000'}`, marginBottom: '0.5rem', marginLeft: '0.5rem', marginRight: '0.5rem' }}></div>

                    <div className="mb-2" style={{ marginTop: '0.25rem' }}>
                        {renderPatientPrescriptionTableContent(firstPagePatientPrescriptions, 0)}
                    </div>
                </div>

                <div className="signature-container" style={{ padding: '0 1.5rem', marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                    <div style={{ textAlign: 'center', position: 'relative', minWidth: '120px' }}>
                        {resolvedClinicImages.signature && (
                            <img src={resolvedClinicImages.signature} alt="Signature" style={{ height: '81.25px', objectFit: 'contain', display: 'block', marginLeft: 'auto', marginRight: 'auto', marginBottom: '-8px' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                        )}
                        <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#000', borderTop: '1px solid #000', paddingTop: '2px' }}>Doctor's Signature</div>
                    </div>
                </div>

                <div className="footer-container" style={{ marginTop: 'auto', width: '100%', flexShrink: 0, marginBottom: '1.5rem' }}>
                    <img src={resolvedClinicImages.footer} alt="Footer" style={{ width: '100%', height: 'auto', display: 'block' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                    {!resolvedIsPro && (
                        <div style={{ textAlign: 'center', fontSize: '0.5rem', color: '#666', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
                            <span>Sponsored by</span>
                            <img src="/favicon.ico" alt="Logo" style={{ width: '20px', height: '12px', display: 'inline-block' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                        </div>
                    )}
                </div>
                </div>

                {hasPatientOverflowPage && (
                    <div className="patient-overflow-page" style={{ position: 'relative', minHeight: '297mm', display: 'flex', flexDirection: 'column', background: 'white', breakBefore: 'page', pageBreakBefore: 'always', flex: enableSinglePageSlider ? '0 0 100%' : undefined }}>
                        <div className="watermark-container" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.175, zIndex: 0, pointerEvents: 'none', width: '65%', height: 'auto' }}>
                            <img src={watermarkSrc} alt="Watermark" style={{ width: '100%', height: 'auto', objectFit: 'contain', display: 'block' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                        </div>

                        <div className="header-container" style={{ width: '100%', overflow: 'hidden', marginBottom: '1rem', position: 'relative', zIndex: 1 }}>
                            <img src={resolvedClinicImages.header} alt="Header" style={{ width: '100%', height: '90%', display: 'block' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                        </div>

                        <div style={{ padding: '0 1.5rem', position: 'relative', zIndex: 1, flex: '1 0 auto' }}>
                            <div style={{ borderBottom: `0.5px solid ${isPro ? '#FF8C00' : '#000000'}`, marginBottom: '0.5rem', marginLeft: '0.5rem', marginRight: '0.5rem', marginTop: '0.75rem' }}></div>
                            <div className="mb-2" style={{ marginTop: '0.25rem' }}>
                                {renderPatientPrescriptionTableContent(overflowPatientPrescriptions, 12)}
                            </div>
                        </div>

                        <div className="signature-container" style={{ padding: '0 1.5rem', marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                            <div style={{ textAlign: 'center', position: 'relative', minWidth: '120px' }}>
                                {resolvedClinicImages.signature && (
                                    <img src={resolvedClinicImages.signature} alt="Signature" style={{ height: '81.25px', objectFit: 'contain', display: 'block', marginLeft: 'auto', marginRight: 'auto', marginBottom: '-8px' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                                )}
                                <div style={{ fontSize: '0.7rem', fontWeight: 'bold', color: '#000', borderTop: '1px solid #000', paddingTop: '2px' }}>Doctor's Signature</div>
                            </div>
                        </div>

                        <div className="footer-container" style={{ marginTop: 'auto', width: '100%', flexShrink: 0, marginBottom: '1.5rem' }}>
                            <img src={resolvedClinicImages.footer} alt="Footer" style={{ width: '100%', height: 'auto', display: 'block' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
                        </div>
                    </div>
                )}
                    </div>
                </div>
            </div>
        )
    }

    const renderPatientPrescriptionTable = () => {
        const hasSpy4 = visitData.prescriptions?.some((p: any) => p.spy4) || false
        const hasSpy6 = visitData.prescriptions?.some((p: any) => p.spy6) || false
        const fs = sz('0.65rem', '3px', '0.55rem')
        const fsIdx = sz('0.6rem', '3px', '0.5rem')
        const pad = sz('0.1rem 0.2rem', '0.05rem', '0.1rem')

        // Mobile expanded: card-based layout instead of table
        if (isMobile && isExpanded) {
            return (
                <div style={{ marginTop: '0.25rem' }}>
                    {!visitData.prescriptions || visitData.prescriptions.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '1rem', color: '#999', fontSize: '0.75rem' }}>No medications prescribed</div>
                    ) : visitData.prescriptions.map((p: any, index: number) => {
                        const medicineName = (p.product?.name || '').toUpperCase()
                        const textColor = p.patientHasMedicine ? '#FF0000' : '#000'
                        const dosageStr = (() => { const dosage = (p.dosage || '').replace(/\|/g, '/'); const parts = dosage.split('/'); if (p.presentation && parts.length > 1) parts.splice(1, 0, p.presentation); return parts.join('/'); })()
                        return (
                            <div key={index} style={{ borderBottom: '1px solid #eee', padding: '6px 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 'bold', fontSize: '0.7rem', color: textColor, minWidth: '18px' }}>{index + 1}.</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 'bold', fontSize: '0.7rem', color: textColor }}>{medicineName}</div>
                                    <div style={{ fontSize: '0.6rem', color: '#555', marginTop: '1px' }}>
                                        {[
                                            (p.timing || '').replace(/\|/g, '/'),
                                            dosageStr,
                                            p.additions || '',
                                            p.droppersToday ? `D: ${p.droppersToday}` : ''
                                        ].filter(Boolean).join(' \u2022 ')}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )
        }

        return (
            <div style={{ marginTop: sz('0.25rem', '0.1rem') }}>
                <table style={{ width: '100%', fontSize: fs, borderCollapse: 'collapse' }}>
                    <tbody>
                        {!visitData.prescriptions || visitData.prescriptions.length === 0 ? (
                            <tr><td colSpan={11} style={{ textAlign: 'center', padding: sz('1rem', '0.2rem'), color: '#999' }}>No medications prescribed</td></tr>
                        ) : (
                            visitData.prescriptions.map((p: any, index: number) => {
                                const medicineName = (p.product?.name || '').toUpperCase()
                                const textColor = p.patientHasMedicine ? '#FF0000' : '#000'
                                return (
                                    <tr key={index}>
                                        <td style={{ padding: pad, textAlign: 'center', width: '3%', fontWeight: 'bold', fontSize: fsIdx, color: textColor, whiteSpace: 'nowrap' }}>{index + 1}</td>
                                        <td style={{ padding: pad, textAlign: 'left', color: textColor, width: '15%', fontWeight: 'bold', fontSize: fs, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{medicineName}</td>
                                        <td style={{ padding: pad, textAlign: 'center', width: '6%', color: textColor, fontWeight: 'bold', fontSize: fsIdx }}></td>
                                        <td style={{ padding: pad, textAlign: 'center', width: '6%', color: textColor, fontWeight: 'bold', fontSize: fsIdx }}></td>
                                        <td style={{ padding: pad, textAlign: 'center', width: '6%', color: textColor, fontWeight: 'bold', fontSize: fsIdx }}></td>
                                        {hasSpy4 && <td style={{ padding: pad, textAlign: 'center', width: '6%' }}></td>}
                                        {hasSpy6 && <td style={{ padding: pad, textAlign: 'center', width: '6%' }}></td>}
                                        <td style={{ padding: pad, textAlign: 'center', color: textColor, textTransform: 'uppercase', width: '8%', fontWeight: 'bold', fontSize: fsIdx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(p.timing || '').replace(/\|/g, '/')}</td>
                                        <td style={{ padding: pad, textAlign: 'center', width: '6%', color: textColor, fontWeight: 'bold', textTransform: 'uppercase', fontSize: fsIdx, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(() => { const dosage = (p.dosage || '').replace(/\|/g, '/'); const parts = dosage.split('/'); if (p.presentation && parts.length > 1) { parts.splice(1, 0, p.presentation); } return parts.join('/'); })()}</td>
                                        <td style={{ padding: pad, textAlign: 'center', width: '6%', fontWeight: 'bold', textTransform: 'uppercase', fontSize: fsIdx, color: textColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.additions || ''}</td>
                                        <td style={{ padding: pad, textAlign: 'center', width: '8%', fontWeight: 'bold', textTransform: 'uppercase', fontSize: fsIdx, color: textColor }}></td>
                                        <td style={{ padding: pad, textAlign: 'center', width: '6%', color: textColor, fontWeight: 'bold', fontSize: fsIdx }}>{(p.droppersToday?.toString() || '').toUpperCase()}</td>
                                    </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>
        )
    }

    // ==================== OFFICE COPY ====================

    const renderOfficeCopy = () => (
        <div style={{ background: 'white', color: 'black', padding: '0', position: 'relative', width: '100%', minHeight: isExpanded ? (isMobile ? 'auto' : '297mm') : 'auto', boxSizing: 'border-box', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontSize: isExpanded ? (isMobile ? '0.8em' : '1em') : '0.35em' }}>
            {/* Watermark */}
            <div className="watermark-container" style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', opacity: 0.175, zIndex: 0, pointerEvents: 'none', width: '65%', height: 'auto' }}>
                <img src={watermarkSrc} alt="" style={{ width: '100%', height: 'auto', objectFit: 'contain', display: 'block' }} onError={(e) => { e.currentTarget.style.display = 'none' }} />
            </div>
            <div style={{ padding: sz('0 1.5rem', '0 0.4rem', '0 0.75rem') }}>
                {/* Blue Separator */}
                <div style={{ borderBottom: sz('2px solid #0000FF', '1px solid #0000FF'), marginBottom: sz('0.5rem', '0.15rem'), marginLeft: sz('-1.5rem', '-0.4rem', '-0.75rem'), marginRight: sz('-1.5rem', '-0.4rem', '-0.75rem') }}></div>

                {/* Particulars + Patient Info */}
                <div style={{ display: 'flex', flexDirection: isMobile && isExpanded ? 'column' : 'row', gap: sz('10px', '3px', '6px'), marginBottom: sz('12px', '3px', '8px'), marginTop: sz('15px', '4px', '10px') }}>
                    {/* Particulars */}
                    <div style={{ flex: 1, padding: sz('4px', '1px'), position: 'relative', paddingTop: sz('16px', '6px') }}>
                        <div style={{ position: 'absolute', top: '0', left: '0', right: '0', borderBottom: `1px solid ${isPro ? '#FF8C00' : '#000000'}`, marginBottom: '2px', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}>
                            {renderFloatingPreviewLabel('Particulars')}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', fontSize: sz('10px', '3.5px', '9px'), lineHeight: '1.1', marginTop: sz('7px', '2px') }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>OPDN:</span> <span style={{ fontWeight: 'bold', color: '#0000FF', marginLeft: '3px' }}>{visitData.patient?.opdNo || visitData.opdNo || ''}</span></div>
                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>VISIT:</span> <span style={{ fontWeight: 'bold', color: '#000', marginLeft: '3px' }}>{visitData.visitNumber || visitData.followUpCount || '1'}</span></div>
                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>PHONE:</span> <span style={{ fontWeight: 'bold', color: '#000', marginLeft: '3px' }}>{visitData.patient?.phone || ''}</span></div>
                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>DOB:</span> <span style={{ fontWeight: 'bold', color: '#000', marginLeft: '3px' }}>{visitData.dob ? new Date(visitData.dob).toLocaleDateString() : ''}</span></div>
                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>GENDER:</span> <span style={{ fontWeight: 'bold', color: '#000', marginLeft: '3px' }}>{visitData.gender || ''}</span></div>
                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>AGE:</span> <span style={{ fontWeight: 'bold', color: '#000', marginLeft: '3px' }}>{visitData.age || 'N/A'}</span></div>
                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>DATE:</span> <span style={{ fontWeight: 'bold', color: '#000', marginLeft: '3px' }}>{visitData.date ? new Date(visitData.date).toLocaleDateString() : ''}</span></div>
                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>F UP:</span> <span style={{ fontWeight: 'bold', color: '#C80000', marginLeft: '3px' }}>{visitData.followUpCount ? `#${visitData.followUpCount}` : ''}</span></div>
                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>NEXT V:</span> <span style={{ marginLeft: '4px', color: '#C80000', fontWeight: 'bold' }}>{visitData.nextVisit ? new Date(visitData.nextVisit).toLocaleDateString('en-GB') : <span style={{ color: '#FF0000' }}>N/A</span>}</span></div>
                        </div>
                    </div>

                    {/* Patient Info */}
                    <div style={{ flex: 1, padding: sz('4px', '1px'), position: 'relative', paddingTop: sz('16px', '6px'), display: 'flex', gap: '5px' }}>
                        <div style={{ position: 'absolute', top: '0', left: '0', right: '0', borderBottom: `1px solid ${isPro ? '#FF8C00' : '#000000'}`, marginBottom: '2px', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}>
                            {renderFloatingPreviewLabel('Patient Info')}</div>
                        <div style={{ flex: 1, marginTop: sz('5px', '2px') }}>
                            <div style={{ fontSize: sz('10px', '3.5px', '9px'), lineHeight: '1.1' }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>NAME:</span> <span style={{ color: '#0000FF', marginLeft: '3px' }}>{patientName}</span></div>
                                <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>F/H/G NAME:</span> <span style={{ color: '#000', marginLeft: '3px' }}>{visitData.patient?.fatherHusbandGuardianName || ''}</span></div>
                                <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>ADDRESS:</span> <span style={{ color: '#000', marginLeft: '3px' }}>{visitData.patient?.address || ''}</span></div>
                            </div>
                        </div>
                        {renderPatientImage()}
                    </div>
                </div>

                {/* Parameters + History & Complaints */}
                <div style={{ display: 'flex', flexDirection: isMobile && isExpanded ? 'column' : 'row', gap: sz('10px', '3px', '6px'), marginBottom: sz('12px', '3px', '8px') }}>
                    <div style={{ flex: 1, padding: sz('4px', '1px'), position: 'relative', paddingTop: sz('16px', '6px') }}>
                        <div style={{ position: 'absolute', top: '0', left: '0', right: '0', borderBottom: `1px solid ${isPro ? '#FF8C00' : '#000000'}`, marginBottom: '2px', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}>
                            {renderFloatingPreviewLabel('Parameters')}</div>
                        <div style={{ fontSize: sz('10px', '3.5px', '9px'), lineHeight: '1.1' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>TEMP:</span> <span style={{ fontWeight: 'bold', color: '#000', marginLeft: '4px' }}>{visitData.temperament || ''}</span></div>
                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>PULSE:</span> <span style={{ fontWeight: 'bold', color: '#000', marginLeft: '4px' }}>{visitData.pulseDiagnosis || ''}</span></div>
                        </div>
                    </div>
                    <div style={{ flex: 2, padding: sz('4px', '1px'), position: 'relative', paddingTop: sz('16px', '6px') }}>
                        <div style={{ position: 'absolute', top: '0', left: '0', right: '0', borderBottom: `1px solid ${isPro ? '#FF8C00' : '#000000'}`, marginBottom: '2px', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}>
                            {renderFloatingPreviewLabel('History & Complaints')}</div>
                        <div style={{ fontSize: sz('10px', '3.5px', '9px'), lineHeight: '1.1' }}>
                            <div style={{ marginBottom: '2px', display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>HISTORY:</span> <span style={{ fontWeight: 'bold', color: '#000', marginLeft: '4px' }}>{visitData.historyReports || ''}</span></div>
                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>COMPLAINTS:</span> <span style={{ fontWeight: 'bold', color: '#0000FF', marginLeft: '4px' }}>{visitData.majorComplaints || ''}</span></div>
                        </div>
                    </div>
                </div>

                {/* Diagnosis & Cure */}
                <div style={{ display: 'flex', gap: sz('10px', '3px', '6px'), marginBottom: sz('12px', '3px', '8px') }}>
                    <div style={{ flex: 1, padding: sz('4px', '1px'), position: 'relative', paddingTop: sz('16px', '6px') }}>
                        <div style={{ position: 'absolute', top: '0', left: '0', right: '0', borderBottom: `1px solid ${isPro ? '#FF8C00' : '#000000'}`, marginBottom: '2px', background: isPro ? 'linear-gradient(to right, #ffffff, #e1c699)' : '#ffffff' }}>
                            {renderFloatingPreviewLabel('Provisional Diagnosis & Cure')}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile && isExpanded ? '1fr' : '1fr 1fr', gap: sz('10px', '3px', '6px'), fontSize: sz('10px', '3.5px', '9px'), lineHeight: '1.1', marginTop: sz('7px', '2px') }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>IMPROVEMENTS:</span> <span style={{ fontWeight: 'bold', color: '#000', marginLeft: '4px' }}>{visitData.improvements || ''}</span></div>
                            <div style={{ display: 'flex', alignItems: 'flex-start' }}><span style={{ fontWeight: 'bold' }}>PROVISIONAL DIAGNOSIS:</span> <span style={{ fontWeight: 'bold', color: '#0000FF', marginLeft: '4px' }}>{visitData.provisionalDiagnosis || ''}</span></div>
                        </div>
                    </div>
                </div>

                {/* Separator */}
                <div style={{ borderBottom: sz('2px solid #000000', '1px solid #000000'), marginBottom: sz('0.5rem', '0.15rem') }}></div>

                {/* Office Prescription Table */}
                {renderOfficePrescriptionTable()}

                {/* MISC Items */}
                <div style={{ marginTop: sz('1rem', '0.3rem', '0.5rem'), marginBottom: sz('0.5rem', '0.15rem'), padding: sz('0.5rem', '0.15rem', '0.4rem'), backgroundColor: '#f8f9fa', borderRadius: '4px', border: '1px solid #dee2e6' }}>
                    <div style={{ fontSize: sz('0.75rem', '3.5px', '0.65rem'), fontWeight: 'bold', color: '#00008B', marginBottom: sz('0.25rem', '0.05rem') }}>MISC ITEMS:</div>
                    <div style={{ fontSize: sz('0.65rem', '3px', '0.55rem'), color: '#000', marginLeft: sz('0.5rem', '0.15rem') }}>
                        {['RX PAD', 'FILE COVER', 'ENVELOPS'].map((name, idx) => (
                            <span key={idx}>{'\u2022'} {name} x 1{idx < 2 ? '  ' : ''}</span>
                        ))}
                    </div>
                </div>

                {/* Summary Row */}
                {renderOfficeSummaryRow()}
            </div>
        </div>
    )

    const renderOfficePrescriptionTable = () => {
        const padE = sz('0.4rem 0.5rem', '0.1rem', '0.25rem 0.3rem')
        const fsE = sz('0.6655rem', '3px', '0.55rem')

        // Mobile expanded: card-based layout
        if (isMobile && isExpanded) {
            return (
                <div style={{ marginBottom: '0.5rem' }}>
                    {visitData.prescriptions?.map((p: any, index: number) => {
                        const product = p.product
                        const textColor = p.patientHasMedicine ? '#FF0000' : '#000'
                        const totalPrice = (product?.priceRupees || 0) * (p.quantity || 0)
                        const dosageStr = (() => { const dosage = (p.dosage || '').replace(/\|/g, '/'); const parts = dosage.split('/'); if (p.presentation && parts.length > 1) parts.splice(1, 0, p.presentation); return parts.join('/'); })()

                        return (
                            <div key={index} style={{ borderBottom: '1px solid #eee', padding: '8px 4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '3px' }}>
                                    <div style={{ display: 'flex', gap: '6px', flex: 1 }}>
                                        <span style={{ fontWeight: 'bold', fontSize: '0.7rem', color: textColor, minWidth: '18px' }}>{index + 1}.</span>
                                        <span style={{ fontWeight: 'bold', fontSize: '0.7rem', color: textColor }}>{product?.name?.toUpperCase() || ''}</span>
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px', fontSize: '0.65rem', fontWeight: 'bold', flexShrink: 0 }}>
                                        <span style={{ color: textColor }}>{'\u20B9'}{totalPrice.toFixed(2)}</span>
                                        <span style={{ color: '#555' }}>Qty: {p.quantity || 0}</span>
                                    </div>
                                </div>
                                <div style={{ fontSize: '0.6rem', color: '#555', paddingLeft: '24px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                    {[
                                        (p.spy1 || '').replace(/\|/g, '/'),
                                        (p.spy2 || '').replace(/\|/g, '/'),
                                        (p.spy3 || '').replace(/\|/g, '/'),
                                        (p.timing || '').replace(/\|/g, '/'),
                                        dosageStr,
                                        (p.procedure || '').replace(/\|/g, '/'),
                                        p.droppersToday ? `D: ${p.droppersToday}` : ''
                                    ].filter(Boolean).map((item, i) => (
                                        <span key={i} style={{ background: '#f0f0f0', padding: '1px 4px', borderRadius: '3px', textTransform: 'uppercase' }}>{item}</span>
                                    ))}
                                </div>
                                {(p.spy4 || p.spy5 || p.spy6 || p.addition1 || p.addition2 || p.addition3) && (
                                    <div style={{ fontSize: '0.55rem', color: '#777', paddingLeft: '24px', marginTop: '3px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {[
                                            p.spy4 ? `SPY4: ${(p.spy4 || '').replace(/\|/g, '/')}` : '',
                                            p.spy5 ? `SPY5: ${(p.spy5 || '').replace(/\|/g, '/')}` : '',
                                            p.spy6 ? `SPY6: ${(p.spy6 || '').replace(/\|/g, '/')}` : '',
                                            p.addition1 ? `ADD1: ${(p.addition1 || '').replace(/\|/g, '/')}` : '',
                                            p.addition2 ? `ADD2: ${(p.addition2 || '').replace(/\|/g, '/')}` : '',
                                            p.addition3 ? `ADD3: ${(p.addition3 || '').replace(/\|/g, '/')}` : '',
                                        ].filter(Boolean).map((item, i) => (
                                            <span key={i} style={{ background: '#e8e8ff', padding: '1px 4px', borderRadius: '3px', textTransform: 'uppercase' }}>{item}</span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )
        }

        return (
            <div style={{ marginBottom: sz('1rem', '0.3rem') }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: sz('0.7315rem', '3px') }}>
                    <tbody>
                        {visitData.prescriptions?.map((p: any, index: number) => {
                            const product = p.product
                            const textColor = p.patientHasMedicine ? '#FF0000' : '#000'
                            const totalPrice = (product?.priceRupees || 0) * (p.quantity || 0)
                            const hasSecondRow = p.spy4 || p.spy5 || p.spy6 || p.addition1 || p.addition2 || p.addition3

                            const dropperLabelItems: string[] = []
                            if (p.selectedDropper) {
                                const dropperProduct = products.find((pr: any) => String(pr.id) === String(p.selectedDropper))
                                if (dropperProduct) dropperLabelItems.push(`+ ${dropperProduct.name}`)
                            }
                            if (p.includeLabelProduct !== false && p.selectedLabel) {
                                dropperLabelItems.push(`+ ${p.selectedLabel}`)
                            }
                            if (p.includeVrsProduct !== false && p.vrsQuantity > 0) {
                                const productCategory = product?.category?.name || product?.category || ''
                                if (productCategory.toLowerCase() === 'dilutions') dropperLabelItems.push(`+ VRS ${p.vrsQuantity}`)
                            }

                            return (
                                <React.Fragment key={index}>
                                    <tr>
                                        <td style={{ padding: padE, textAlign: 'center', width: '60px', fontWeight: 'bold', color: textColor, fontSize: fsE, borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>{totalPrice.toFixed(2)}</td>
                                        <td style={{ padding: padE, textAlign: 'center', width: '30px', fontWeight: 'bold', fontSize: fsE, color: textColor, borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>{index + 1}</td>
                                        <td style={{ padding: padE, textAlign: 'left', width: '120px', color: textColor, fontWeight: 'bold', fontSize: sz('0.7315rem', '3px'), borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>
                                            <div>{product?.name?.toUpperCase() || ''}</div>
                                            {!hasSecondRow && dropperLabelItems.length > 0 && (
                                                <div style={{ fontSize: sz('0.48rem', '2px'), color: '#666', lineHeight: '1', marginTop: '0.05rem' }}>
                                                    {dropperLabelItems.map((item, idx) => (<div key={idx}>{item}</div>))}
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: padE, textAlign: 'center', width: '40px', color: textColor, fontWeight: 'bold', textTransform: 'uppercase', fontSize: fsE, borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>{(p.spy1 || '').replace(/\|/g, '/')}</td>
                                        <td style={{ padding: padE, textAlign: 'center', width: '40px', color: textColor, fontWeight: 'bold', textTransform: 'uppercase', fontSize: fsE, borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>{(p.spy2 || '').replace(/\|/g, '/')}</td>
                                        <td style={{ padding: padE, textAlign: 'center', width: '40px', color: textColor, fontWeight: 'bold', textTransform: 'uppercase', fontSize: fsE, borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>{(p.spy3 || '').replace(/\|/g, '/')}</td>
                                        <td style={{ padding: padE, textAlign: 'center', width: '60px', color: textColor, textTransform: 'uppercase', fontWeight: 'bold', fontSize: fsE, borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>{(p.timing || '').replace(/\|/g, '/')}</td>
                                        <td style={{ padding: padE, textAlign: 'center', width: '60px', color: textColor, fontWeight: 'bold', textTransform: 'uppercase', fontSize: fsE, borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>{(() => { const dosage = (p.dosage || '').replace(/\|/g, '/'); const parts = dosage.split('/'); if (p.presentation && parts.length > 1) { parts.splice(1, 0, p.presentation); } return parts.join('/'); })()}</td>
                                        <td style={{ padding: padE, textAlign: 'center', width: '60px', fontWeight: 'bold', textTransform: 'uppercase', fontSize: fsE, color: textColor, borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>{(p.procedure || '').replace(/\|/g, '/')}</td>
                                        <td style={{ padding: padE, textAlign: 'center', width: '60px', color: textColor, fontWeight: 'bold', fontSize: fsE, borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>{(p.droppersToday?.toString() || '').replace(/\|/g, '/').toUpperCase()}</td>
                                        <td style={{ padding: padE, textAlign: 'center', width: '60px', fontWeight: 'bold', fontSize: fsE, color: textColor, borderBottom: hasSecondRow ? 'none' : '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>{p.quantity || ''}</td>
                                    </tr>
                                    {hasSecondRow && (
                                        <tr>
                                            <td style={{ width: '60px', borderBottom: '1px solid #ddd' }}></td>
                                            <td style={{ width: '30px', borderBottom: '1px solid #ddd' }}></td>
                                            <td style={{ width: '120px', padding: sz('0.3rem 0.5rem', '0.05rem'), textAlign: 'left', borderBottom: '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>
                                                {dropperLabelItems.length > 0 && (
                                                    <div style={{ fontSize: sz('0.48rem', '2px'), color: '#666', lineHeight: '1' }}>
                                                        {dropperLabelItems.map((item, idx) => (<div key={idx}>{item}</div>))}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: sz('0.3rem 0.5rem', '0.05rem'), textAlign: 'center', fontSize: fsE, fontWeight: 'bold', color: textColor, textTransform: 'uppercase', borderBottom: '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>
                                                {p.spy4 && <><div style={{ fontSize: sz('0.6rem', '2px'), color: '#666', marginBottom: '0.1rem' }}>SPY4:</div><div>{(p.spy4 || '').replace(/\|/g, '/')}</div></>}
                                            </td>
                                            <td style={{ padding: sz('0.3rem 0.5rem', '0.05rem'), textAlign: 'center', fontSize: fsE, fontWeight: 'bold', color: textColor, textTransform: 'uppercase', borderBottom: '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>
                                                {p.spy5 && <><div style={{ fontSize: sz('0.6rem', '2px'), color: '#666', marginBottom: '0.1rem' }}>SPY5:</div><div>{(p.spy5 || '').replace(/\|/g, '/')}</div></>}
                                            </td>
                                            <td style={{ padding: sz('0.3rem 0.5rem', '0.05rem'), textAlign: 'center', fontSize: fsE, fontWeight: 'bold', color: textColor, textTransform: 'uppercase', borderBottom: '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>
                                                {p.spy6 && <><div style={{ fontSize: sz('0.6rem', '2px'), color: '#666', marginBottom: '0.1rem' }}>SPY6:</div><div>{(p.spy6 || '').replace(/\|/g, '/')}</div></>}
                                            </td>
                                            <td style={{ padding: sz('0.3rem 0.5rem', '0.05rem'), textAlign: 'center', fontSize: fsE, fontWeight: 'bold', color: textColor, textTransform: 'uppercase', borderBottom: '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>
                                                {p.addition1 && <><div style={{ fontSize: sz('0.6rem', '2px'), color: '#666', marginBottom: '0.1rem' }}>ADD1:</div><div>{(p.addition1 || '').replace(/\|/g, '/')}</div></>}
                                            </td>
                                            <td style={{ padding: sz('0.3rem 0.5rem', '0.05rem'), textAlign: 'center', fontSize: fsE, fontWeight: 'bold', color: textColor, textTransform: 'uppercase', borderBottom: '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>
                                                {p.addition2 && <><div style={{ fontSize: sz('0.6rem', '2px'), color: '#666', marginBottom: '0.1rem' }}>ADD2:</div><div>{(p.addition2 || '').replace(/\|/g, '/')}</div></>}
                                            </td>
                                            <td style={{ padding: sz('0.3rem 0.5rem', '0.05rem'), textAlign: 'center', fontSize: fsE, fontWeight: 'bold', color: textColor, textTransform: 'uppercase', borderBottom: '1px solid #ddd', verticalAlign: 'top', lineHeight: '1.2' }}>
                                                {p.addition3 && <><div style={{ fontSize: sz('0.6rem', '2px'), color: '#666', marginBottom: '0.1rem' }}>ADD3:</div><div>{(p.addition3 || '').replace(/\|/g, '/')}</div></>}
                                            </td>
                                            <td colSpan={2} style={{ borderBottom: '1px solid #ddd' }}></td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        )
    }

    const renderOfficeSummaryRow = () => {
        const totalPrice = visitData.prescriptions?.reduce((sum: number, p: any) => {
            if (p.patientHasMedicine) return sum
            const product = p.product
            return sum + ((product?.priceRupees || 0) * (p.quantity || 0))
        }, 0) || 0

        let spy456Price = 0
        let add123Price = 0
        let spyBottleAdded = false
        let additionsBottleAdded = false
        visitData.prescriptions?.forEach((pr: any) => {
            if (pr.bottleSize && bottlePricing.length > 0) {
                const bottlePriceData = bottlePricing.find((b: any) => b.value === pr.bottleSize)
                const bottlePrice = bottlePriceData ? bottlePriceData.price : 0
                if (!spyBottleAdded && (pr.spy4 || pr.spy5 || pr.spy6) && bottlePrice > 0) { spy456Price = bottlePrice; spyBottleAdded = true }
                if (!additionsBottleAdded && (pr.addition1 || pr.addition2 || pr.addition3) && bottlePrice > 0) { add123Price = bottlePrice; additionsBottleAdded = true }
            }
        })

        const balanceDue = parseFloat(visitData.balance) || 0
        const paymentReceived = parseFloat(visitData.payment) || 0
        const amount = balanceDue + paymentReceived
        const totalMedicines = visitData.prescriptions?.length || 0
        const daysDiff = visitData.nextVisit && visitData.date
            ? Math.ceil((new Date(visitData.nextVisit).getTime() - new Date(visitData.date).getTime()) / (1000 * 60 * 60 * 24))
            : 0
        const totalWithCharges = totalPrice + spy456Price + add123Price

        // Mobile: stacked summary
        if (isMobile && isExpanded) {
            return (
                <div style={{ marginBottom: '0.5rem', marginTop: '0.5rem', fontSize: '0.7rem', fontWeight: 'bold', backgroundColor: '#90EE90', padding: '8px 10px', borderRadius: '6px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                    <div>{'\u20B9'}{totalWithCharges.toFixed(2)} total</div>
                    <div style={{ textAlign: 'right' }}>{totalMedicines} medicines</div>
                    <div>{daysDiff} days</div>
                    <div style={{ textAlign: 'right' }}>Amt: {'\u20B9'}{amount.toFixed(2)}</div>
                </div>
            )
        }

        return (
            <div style={{ display: 'flex', marginBottom: sz('1rem', '0.3rem'), marginTop: sz('1rem', '0.3rem'), fontSize: sz('0.75rem', '3.5px'), fontWeight: 'bold', backgroundColor: '#90EE90', padding: sz('0.5rem', '0.1rem'), borderRadius: '4px' }}>
                <div style={{ width: '60px', textAlign: 'center' }}>{'\u20B9'}{totalWithCharges.toFixed(2)}</div>
                <div style={{ width: '30px', textAlign: 'center' }}>{totalMedicines}</div>
                <div style={{ width: '120px', paddingLeft: sz('0.5rem', '0.1rem') }}>{daysDiff} DAYS</div>
                <div style={{ flex: 1 }}></div>
                <div style={{ width: '60px', textAlign: 'right' }}>{'\u20B9'}{amount.toFixed(2)}</div>
            </div>
        )
    }

    // ==================== RENDER ====================

    const renderContent = () => {
        if (effectiveTemplate && copyType === 'PATIENT') {
            return (
                <div style={{ transform: isExpanded ? 'scale(1)' : 'scale(0.18)', transformOrigin: 'top left', width: isExpanded ? '100%' : '794px' }}>
                    <PrescriptionTemplateRenderer
                        template={effectiveTemplate}
                        clinicImages={resolvedClinicImages}
                        visitData={visitData}
                        prescriptions={visitData.prescriptions || []}
                        isPro={resolvedIsPro}
                        forceWatermark={forceTemplateWatermark}
                    />
                </div>
            )
        }

        return copyType === 'PATIENT' ? renderPatientCopy() : renderOfficeCopy()
    }

    if (renderOnlySheet) {
        return (
            <div
                ref={sheetRootRef}
                data-copy-type={copyType}
                className={`med-card-wrap pcp-sheet-root ${copyFlipAnimClass}`}
                style={{
                    width: '210mm',
                    margin: '0 auto',
                    position: 'relative',
                    ['--pcp-header-scale' as any]: (effectiveAssetScales.header / 100).toFixed(3),
                    ['--pcp-footer-scale' as any]: (effectiveAssetScales.footer / 100).toFixed(3),
                    ['--pcp-signature-scale' as any]: (effectiveAssetScales.signature / 100).toFixed(3),
                    ['--pcp-watermark-scale' as any]: (effectiveAssetScales.watermark / 100).toFixed(3),
                }}
            >
                <style dangerouslySetInnerHTML={{
                    __html: `
                    .pcp-sheet-root .header-container img {
                        transform: scale(var(--pcp-header-scale, 1));
                        transform-origin: top center;
                    }
                    .pcp-sheet-root .footer-container img {
                        transform: scale(var(--pcp-footer-scale, 1));
                        transform-origin: bottom center;
                    }
                    .pcp-sheet-root .watermark-container img {
                        transform: scale(var(--pcp-watermark-scale, 1));
                        transform-origin: center center;
                    }
                    .pcp-sheet-root .signature-container img {
                        transform: scale(var(--pcp-signature-scale, 1));
                        transform-origin: bottom center;
                    }
                    `
                }} />
                {renderContent()}
            </div>
        )
    }

    const renderCopyToggle = (size: 'small' | 'normal') => {
        const isSmall = size === 'small'
        if (isPrescriptionsPage) {
            return (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation()
                        toggleCopyTypeWithFlip(copyType === 'PATIENT' ? 'OFFICE' : 'PATIENT')
                    }}
                    className={`relative inline-flex ${isSmall ? 'h-6 w-28' : 'h-8 w-40'} items-center rounded-full border border-slate-300 dark:border-slate-600 bg-slate-100/90 dark:bg-slate-800/90 p-0.5 overflow-hidden transition-colors`}
                    aria-label="Toggle patient office copy"
                >
                    <span className={`absolute left-0.5 top-0.5 ${isSmall ? 'h-5 w-[54px]' : 'h-7 w-[78px]'} rounded-full bg-white dark:bg-slate-700 shadow-sm border border-slate-200 dark:border-slate-600 transition-transform duration-300 ${copyType === 'OFFICE' ? (isSmall ? 'translate-x-[53px]' : 'translate-x-[77px]') : 'translate-x-0'}`}></span>
                    <span className={`relative z-10 grid w-full grid-cols-2 ${isSmall ? 'text-[9px]' : 'text-[11px]'} font-semibold tracking-wide`}>
                        <span className={`text-center transition-colors ${copyType === 'PATIENT' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>Patient</span>
                        <span className={`text-center transition-colors ${copyType === 'OFFICE' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}>Office</span>
                    </span>
                </button>
            )
        }

        return (
            <div className="flex items-center rounded-full border border-blue-200 dark:border-blue-700 bg-white dark:bg-gray-800 p-1 shadow-sm">
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation()
                        toggleCopyTypeWithFlip(copyType === 'PATIENT' ? 'OFFICE' : 'PATIENT')
                    }}
                    className={`relative inline-flex ${isSmall ? 'h-6 w-28' : 'h-8 w-40'} items-center rounded-full bg-gradient-to-r from-sky-500 to-blue-600 p-1 overflow-hidden shadow-inner transition-all duration-300`}
                    aria-label="Toggle patient office copy"
                >
                    <span className={`absolute left-1 top-1 ${isSmall ? 'h-4 w-[52px]' : 'h-6 w-[78px]'} rounded-full bg-white shadow transition-transform duration-300 ${copyType === 'OFFICE' ? (isSmall ? 'translate-x-[50px]' : 'translate-x-[76px]') : 'translate-x-0'}`}></span>
                    <span className={`relative z-10 grid w-full grid-cols-2 ${isSmall ? 'text-[9px]' : 'text-[11px]'} font-semibold tracking-wide`}>
                        <span className={`text-center ${copyType === 'PATIENT' ? 'text-blue-700' : 'text-white/90'}`}>Patient</span>
                        <span className={`text-center ${copyType === 'OFFICE' ? 'text-blue-700' : 'text-white/90'}`}>Office</span>
                    </span>
                </button>
            </div>
        )
    }

    // ==================== THUMBNAIL MODE ====================

    if (!isExpanded) {
        // Mobile: compact FAB button
        if (isMobile) {
            return (
                <button
                    onClick={onToggle}
                    className="fixed bottom-20 right-4 z-50 w-12 h-12 bg-gradient-to-br from-blue-600 to-sky-500 rounded-full shadow-xl flex items-center justify-center active:scale-95 transition-transform mobile-safe-fab mobile-safe-fab-tertiary"
                    title="Preview copy"
                >
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    {/* Live dot */}
                    <div className="absolute -top-0.5 -right-0.5 w-3 h-3">
                        <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-75"></div>
                        <div className="absolute inset-0 bg-green-500 rounded-full"></div>
                    </div>
                </button>
            )
        }

        if (isPrescriptionsPage) {
            return (
                <div className="fixed right-0 top-1/2 -translate-y-1/2 z-40">
                    <button
                        onClick={onToggle}
                        className="group flex flex-col items-center gap-2 rounded-l-2xl border border-blue-300 bg-gradient-to-b from-blue-600 to-sky-600 px-2 py-4 text-white shadow-xl shadow-blue-900/30 transition-all duration-200 hover:pr-3 hover:shadow-2xl"
                        title="View preview"
                    >
                        <svg className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        <span className="[writing-mode:vertical-rl] text-[11px] font-bold tracking-[0.08em] uppercase">View Preview</span>
                    </button>
                </div>
            )
        }

        // Desktop: mini preview card
        return (
            <div className="fixed top-28 right-0 z-30 cursor-pointer group transition-transform duration-300 translate-x-[42%] hover:translate-x-0" title="Click to expand preview">
                <div className="relative" onClick={onToggle}>
                    <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-sky-600 rounded-xl blur opacity-30 group-hover:opacity-60 transition-opacity duration-300"></div>
                    <div className="relative w-[160px] bg-white rounded-xl shadow-2xl border-2 border-blue-300 dark:border-blue-600 overflow-hidden transition-all duration-300 group-hover:scale-105 group-hover:shadow-blue-500/40">
                        <div className="bg-gradient-to-r from-blue-600 to-sky-600 px-2 py-1 flex items-center justify-between gap-1">
                            {renderCopyToggle('small')}
                            <div>
                                <svg className="w-3 h-3 text-white/80 hover:text-white cursor-pointer" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                </svg>
                            </div>
                        </div>
                        <div
                            className={`p-1 h-[208px] overflow-hidden pointer-events-none med-card-wrap ${copyFlipAnimClass}`}
                            style={{
                                zoom: copyType === 'PATIENT' && prescriptionTemplate ? 1 : 0.18,
                                width: copyType === 'PATIENT' && prescriptionTemplate ? '100%' : '794px'
                            }}
                        >
                            {renderContent()}
                        </div>
                        <div className="absolute inset-0 top-6 flex items-end justify-center pb-2 bg-gradient-to-t from-white/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                            <span className="text-[9px] font-semibold text-blue-700 bg-white/90 px-2 py-0.5 rounded-full shadow-sm">Click to expand</span>
                        </div>
                    </div>
                    <div className="absolute -top-1 -right-1 w-3 h-3">
                        <div className="absolute inset-0 bg-green-500 rounded-full animate-ping opacity-75"></div>
                        <div className="absolute inset-0 bg-green-500 rounded-full"></div>
                    </div>
                </div>
            </div>
        )
    }

    // ==================== EXPANDED MODE ====================

    // Mobile: full-screen overlay
    if (isMobile) {
        return (
            <div className="fixed inset-0 z-[9999] bg-gray-50 dark:bg-gray-900 flex flex-col" style={{ touchAction: 'pan-y' }}>
                {/* Header bar */}
                <div className="flex items-center justify-between px-3 py-2.5 bg-gradient-to-r from-blue-600 to-sky-600 shadow-lg flex-shrink-0 safe-area-top">
                    <div className="flex items-center gap-2">
                        <button onClick={onToggle} className="p-1 rounded-lg bg-white/20 hover:bg-white/30 transition-colors" title="Back">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <span className="text-sm font-bold text-white tracking-wide">{copyType} COPY</span>
                        <span className="text-[10px] text-white/70 font-medium">(Live)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {renderCopyToggle('normal')}
                        {!isPro && (
                            <button
                                onClick={() => router.push('/upgrade')}
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-amber-400 hover:bg-amber-300 text-amber-900 rounded-full transition-colors shadow-sm"
                                title="Remove watermark with PRO plan"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                                Remove Watermark <span className="ml-0.5 px-1 py-0.5 bg-amber-600 text-white rounded text-[8px]">PRO</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Scrollable content */}
                <div className="flex-1 overflow-y-auto overscroll-contain">
                    <div className="p-3 pb-6">
                        <div className={`bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden med-card-wrap ${copyFlipAnimClass}`}>
                            {renderContent()}
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    if (isPrescriptionsPage) {
        return (
            <div
                className="fixed right-0 top-[88px] z-40 h-[calc(100vh-88px)] w-full max-w-[min(95vw,640px)] bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col"
                style={{ animation: `${isClosingSidebar ? 'pcp-slide-out-right' : 'pcp-slide-in-right'} ${sidebarAnimMs}ms cubic-bezier(0.22, 1, 0.36, 1)` }}
            >
                <style dangerouslySetInnerHTML={{ __html: `
                    @keyframes pcp-slide-in-right {
                        from { transform: translateX(100%); opacity: 0.7; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                    @keyframes pcp-slide-out-right {
                        from { transform: translateX(0); opacity: 1; }
                        to { transform: translateX(100%); opacity: 0.7; }
                    }
                ` }} />
                <button
                    onClick={closePrescriptionsSidebar}
                    className="absolute left-0 top-1/2 z-10 -translate-x-full -translate-y-1/2 group flex flex-col items-center gap-2 rounded-l-2xl border border-blue-300 bg-gradient-to-b from-blue-600 to-sky-600 px-2 py-4 text-white shadow-xl shadow-blue-900/30 transition-all duration-200 hover:pr-3 hover:shadow-2xl"
                    title="Close preview"
                >
                    <svg className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    <span className="[writing-mode:vertical-rl] text-[11px] font-bold tracking-[0.08em] uppercase">Close Preview</span>
                </button>
                <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-blue-600 to-sky-600 shadow-lg flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <button onClick={closePrescriptionsSidebar} className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors" title="Collapse preview">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                        <span className="text-sm font-bold text-white tracking-wide">{copyType === 'PATIENT' ? 'PATIENT' : 'OFFICE'} COPY</span>
                        <span className="text-[10px] text-white/70 font-medium">(Live)</span>
                    </div>
                    <div className="flex items-center gap-3">
                        {renderCopyToggle('normal')}
                        {!isPro && (
                            <button
                                onClick={() => router.push('/upgrade')}
                                className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-amber-400 hover:bg-amber-300 text-amber-900 rounded-full transition-colors shadow-sm"
                                title="Remove watermark with PRO plan"
                            >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                                Remove Watermark <span className="ml-0.5 px-1 py-0.5 bg-amber-600 text-white rounded text-[8px]">PRO</span>
                            </button>
                        )}
                    </div>
                </div>
                <div ref={prescriptionsPreviewHostRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4">
                    {copyType === 'PATIENT' ? (
                        <div className={`mx-auto w-fit bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden med-card-wrap ${copyFlipAnimClass}`}>
                            <div style={{ zoom: prescriptionsPatientZoom, width: '794px' }}>
                                {renderContent()}
                            </div>
                        </div>
                    ) : (
                        <div className={`w-full bg-white rounded-xl shadow-lg border border-gray-200 overflow-x-auto overflow-y-hidden med-card-wrap ${copyFlipAnimClass}`}>
                            {renderContent()}
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // Desktop: side panel (used inside split view wrapper from parent)
    return (
        <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gradient-to-r from-blue-600 to-sky-600 shadow-lg flex-shrink-0">
                <div className="flex items-center gap-3">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span className="text-sm font-bold text-white tracking-wide">{copyType === 'PATIENT' ? 'PATIENT' : 'OFFICE'} COPY</span>
                    <span className="text-[10px] text-white/70 font-medium">(Live)</span>
                </div>
                <div className="flex items-center gap-3">
                    {renderCopyToggle('normal')}
                    {!isPro && (
                        <button
                            onClick={() => router.push('/upgrade')}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] font-semibold bg-amber-400 hover:bg-amber-300 text-amber-900 rounded-full transition-colors shadow-sm"
                            title="Remove watermark with PRO plan"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                            Remove Watermark <span className="ml-0.5 px-1 py-0.5 bg-amber-600 text-white rounded text-[8px]">PRO</span>
                        </button>
                    )}
                    <button onClick={onToggle} className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors" title="Collapse preview">
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
                <div className={`bg-white rounded-xl shadow-lg border border-gray-200 ${isPrescriptionsPage ? 'overflow-x-auto overflow-y-hidden' : 'overflow-hidden'} med-card-wrap ${copyFlipAnimClass}`} style={{ maxWidth: isPrescriptionsPage ? '100%' : '210mm' }}>
                    {renderContent()}
                </div>
            </div>
        </div>
    )
}

