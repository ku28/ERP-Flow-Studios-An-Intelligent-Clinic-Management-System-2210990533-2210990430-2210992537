import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'
import Link from 'next/link'
import CustomSelect from '../components/CustomSelect'
import TagInput from '../components/TagInput'
import DateInput from '../components/DateInput'
import LoadingModal from '../components/LoadingModal'
import CameraModal from '../components/CameraModal'
import ConfirmModal from '../components/ConfirmModal'
import ToastNotification from '../components/ToastNotification'
import PatientCopyPreview from '../components/PatientCopyPreview'
import ThemedScrollArea from '../components/ThemedScrollArea'
import VoiceInput from '../components/VoiceInput'
import { useToast } from '../hooks/useToast'
import { formatPrice, formatQuantity, formatCurrency, formatPatientId } from '../lib/utils'
import { useDefaultValues } from '../hooks/useDefaultValues'
import { normalizeTreatmentKeywords, parseComplaintTags, parseTreatmentKeywordsFromNotes, scoreTreatmentFromComplaints } from '../lib/treatmentKeywords'
import {
    getCategoryFieldVisibility,
    hasCategoryFieldRule,
    normalizeCategoryFieldRules,
    normalizeCategoryRuleKey,
} from '../lib/categoryFieldRules'

// Prescriptions Page - Create and manage patient visits with prescriptions
export default function PrescriptionsPage() {
    const router = useRouter()
    const { defaults: prescriptionDefaults } = useDefaultValues('prescriptions')
    const { defaults: invoiceDefaults } = useDefaultValues('invoices')
    
    // Dropdown options state
    const [genderOptions, setGenderOptions] = useState<any[]>([])
    const [temperamentOptions, setTemperamentOptions] = useState<any[]>([])
    const [pulseDiagnosisOptions, setPulseDiagnosisOptions] = useState<any[]>([])
    const [pulseDiagnosis2Options, setPulseDiagnosis2Options] = useState<any[]>([])
    const [components, setComponents] = useState<any[]>([])
    const [timing, setTiming] = useState<any[]>([])
    const [doseQuantity, setDoseQuantity] = useState<any[]>([])
    const [doseTiming, setDoseTiming] = useState<any[]>([])
    const [dilution, setDilution] = useState<any[]>([])
    const [additions, setAdditions] = useState<any[]>([])
    const [procedure, setProcedure] = useState<any[]>([])
    const [presentation, setPresentation] = useState<any[]>([])
    const [administration, setAdministration] = useState<any[]>([])
    const [bottlePricing, setBottlePricing] = useState<any[]>([])
    const [loadingOptions, setLoadingOptions] = useState(true)
    const { visitId, edit } = router.query
    const isEditMode = edit === 'true' && visitId
    const { toasts, removeToast, showSuccess, showError, showInfo, showWarning } = useToast()
    
    // Enhanced options with placeholder "Select..." option at the top
    const genderOptionsWithPlaceholder = [{ value: '', label: 'Select Gender' }, ...genderOptions]
    const temperamentOptionsWithPlaceholder = [{ value: '', label: 'Select Temperament' }, ...temperamentOptions]
    const pulseDiagnosisOptionsWithPlaceholder = [{ value: '', label: 'Select Pulse Diagnosis' }, ...pulseDiagnosisOptions]
    const pulseDiagnosis2OptionsWithPlaceholder = [{ value: '', label: 'Select Pulse Diagnosis 2' }, ...pulseDiagnosis2Options]
    const componentsWithPlaceholder = [{ value: '', label: 'Select Component' }, ...components]
    const timingWithPlaceholder = [{ value: '', label: 'Select Timing' }, ...timing]
    const doseQuantityWithPlaceholder = [{ value: '', label: 'Select Dose Quantity' }, ...doseQuantity]
    const doseTimingWithPlaceholder = [{ value: '', label: 'Select Dose Timing' }, ...doseTiming]
    const dilutionWithPlaceholder = [{ value: '', label: 'Select Dilution' }, ...dilution]
    const additionsWithPlaceholder = [{ value: '', label: 'Select Addition' }, ...additions]
    const procedureWithPlaceholder = [{ value: '', label: 'Select Procedure' }, ...procedure]
    const presentationWithPlaceholder = [{ value: '', label: 'Select Presentation' }, ...presentation]
    const administrationWithPlaceholder = [{ value: '', label: 'Select Administration' }, ...administration]
    const bottlePricingWithPlaceholder = [{ value: '', label: 'Select Bottle Size' }, ...bottlePricing]
    const minimalFieldClass = 'w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all text-sm'
    const minimalReadOnlyClass = 'w-full px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200'

    const { user } = useAuth()
    const [patients, setPatients] = useState<any[]>([])
    const [treatments, setTreatments] = useState<any[]>([])
    const [products, setProducts] = useState<any[]>([])
    const [purchaseOrders, setPurchaseOrders] = useState<any[]>([])
    const [dataLoading, setDataLoading] = useState(false)
    const [selectedProductId, setSelectedProductId] = useState<string>('')
    const [selectedMedicines, setSelectedMedicines] = useState<string[]>([])
    const [attachments, setAttachments] = useState<Array<{ url: string, name: string, type: string }>>([])
    const [reportsAttachments, setReportsAttachments] = useState<Array<{ url: string, name: string, type: string }>>([])
    const [uploadingAttachment, setUploadingAttachment] = useState(false)
    const [uploadingReports, setUploadingReports] = useState(false)
    const [showCamera, setShowCamera] = useState(false)
    const [cameraFacingMode, setCameraFacingMode] = useState<'user' | 'environment'>('environment')
    const videoRef = useRef<HTMLVideoElement>(null)
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
    const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({})
    const [draggedItemIndex, setDraggedItemIndex] = useState<number | null>(null)
    const [quantityErrors, setQuantityErrors] = useState<{ [key: number]: string }>({})

    // Refs to track which field user is editing (prevent circular updates)
    const isUpdatingHeightFromFeet = useRef(false)
    const isUpdatingFeetFromHeight = useRef(false)
    const isUpdatingDateFromCount = useRef(false)
    const isUpdatingCountFromDate = useRef(false)

    const [form, setForm] = useState<any>({
        patientId: '', opdNo: '', date: new Date().toISOString().split('T')[0], temperament: '', pulseDiagnosis: '', pulseDiagnosis2: '',
        majorComplaints: '', historyReports: '', investigations: '', reports: '', provisionalDiagnosis: '',
        improvements: '', specialNote: '', discussion: '', dob: '', age: '', address: '', gender: '', phone: '',
        nextVisitDate: '', nextVisitTime: '', occupation: '', pendingPaymentCents: '',
        height: '', heightFeet: '', heightInches: '', weight: '', fatherHusbandGuardianName: '', imageUrl: '',
        // New financial fields - ensure they're strings not undefined
        amount: '', discount: '', payment: '', balance: '',
        // New tracking fields - ensure they're strings not undefined
        visitNumber: '', followUpCount: '10'
    })
    const [gstRate, setGstRate] = useState<number>(prescriptionDefaults.gstRate ?? invoiceDefaults.gstRate ?? 5)
    const [isGstLocked, setIsGstLocked] = useState<boolean>(true)
    const [consultationFees, setConsultationFees] = useState<number>(prescriptionDefaults.consultationFees ?? invoiceDefaults.consultationFees ?? 200)
    const [isConsultationFeesLocked, setIsConsultationFeesLocked] = useState<boolean>(true)
    const [prescriptions, setPrescriptions] = useState<any[]>([])
    const [collapsedSections, setCollapsedSections] = useState<{[key: number]: {spy46: boolean, additions: boolean}}>({})
    const [defaultMiscProducts, setDefaultMiscProducts] = useState<{[key: string]: boolean}>({
        'RX PAD': true,
        'FILE COVER': true,
        'ENVELOPS': true,
        'MEDICINE BOX': false
    })
    const [medicineBoxQuantity, setMedicineBoxQuantity] = useState<number>(0)
    const [loading, setLoading] = useState(false)
    const [lastCreatedVisitId, setLastCreatedVisitId] = useState<number | null>(null)
    const [lastCreatedVisit, setLastCreatedVisit] = useState<any | null>(null)
    const [shakingPrescriptionIndices, setShakingPrescriptionIndices] = useState<Set<number>>(new Set())
    const [previousWeight, setPreviousWeight] = useState<string>('')
    const [previousPrescriptionCount, setPreviousPrescriptionCount] = useState<number>(0)
    const previewRef = useRef<HTMLDivElement | null>(null)
    const medicineDropdownRef = useRef<HTMLDivElement | null>(null)
    const originalPrescriptionsRef = useRef<any[]>([])
    function openMedicineDropdown() {
        const input = medicineDropdownRef.current?.querySelector('input') as HTMLInputElement | null
        if (input) {
            input.scrollIntoView({ behavior: 'smooth', block: 'center' })
            setTimeout(() => { input.focus(); input.click() }, 200)
        }
    }
    const isPatient = user?.role?.toLowerCase() === 'user'

    // Generate OPD number preview
    async function generateOpdNoPreview(patientId: string) {
        try {
            // Get visit count for patient
            const visitsRes = await fetch(`/api/visits?patientId=${patientId}`)
            const visits = await visitsRes.json()
            const visitCount = visits.length + 1 // Next visit number
            const selectedPatient = patients.find((p: any) => String(p.id) === String(patientId))
            const patientCode = selectedPatient?.generatedPatientId || formatPatientId(selectedPatient?.date || selectedPatient?.createdAt)
            if (!patientCode) return ''
            const visit = visitCount.toString().padStart(2, '0')

            return `${patientCode} ${visit}`
        } catch (error) {
            return ''
        }
    }

    // Track treatment plan modifications
    const [selectedTreatmentId, setSelectedTreatmentId] = useState<string | null>(null)
    const [selectedTreatmentPlan, setSelectedTreatmentPlan] = useState<any>(null)
    const [originalTreatmentData, setOriginalTreatmentData] = useState<any[]>([])
    const [showSaveModal, setShowSaveModal] = useState(false)
    const [pendingSubmit, setPendingSubmit] = useState<any>(null)
    const [showNavigationModal, setShowNavigationModal] = useState(false)
    const [createdTreatmentId, setCreatedTreatmentId] = useState<string | null>(null)
    const [savedVisitIdForNav, setSavedVisitIdForNav] = useState<string | null>(null)
    const [creatingTreatment, setCreatingTreatment] = useState(false)
    const [treatmentModalMessage, setTreatmentModalMessage] = useState('Creating Treatment Plan and Saving Prescription...')
    const [generatedOpdNo, setGeneratedOpdNo] = useState<string>('')
    const [hasDraft, setHasDraft] = useState(false)
    const [showRestoreDraftModal, setShowRestoreDraftModal] = useState(false)
    const [draftData, setDraftData] = useState<any>(null)
    const [currentStep, setCurrentStep] = useState(1)
    const [isPatientSelectOpen, setIsPatientSelectOpen] = useState(false)
    const [isGenderOpen, setIsGenderOpen] = useState(false)
    const [isTemperamentOpen, setIsTemperamentOpen] = useState(false)
    const [isPulseDiagnosisOpen, setIsPulseDiagnosisOpen] = useState(false)
    const [isPulseDiagnosis2Open, setIsPulseDiagnosis2Open] = useState(false)
    const [isInvestigationOpen, setIsInvestigationOpen] = useState(false)
    const [isProvDiagnosisOpen, setIsProvDiagnosisOpen] = useState(false)
    const [isTreatmentSelectOpen, setIsTreatmentSelectOpen] = useState(false)
    const [isMedicineSelectOpen, setIsMedicineSelectOpen] = useState(false)
    const [isPrescriptionDropdownOpen, setIsPrescriptionDropdownOpen] = useState<{ [key: number]: { [field: string]: boolean } }>({})
    
    // Undo functionality for restore default
    const [undoStack, setUndoStack] = useState<any[]>([])
    const [undoAllStack, setUndoAllStack] = useState<any[]>([])

    // ── Prescription option card-flip (navigate through product alternatives) ──
    const [prFlipPhase, setPrFlipPhase] = useState<{[i: number]: 'idle'|'out'|'in'}>({})
    const [prFlipDir, setPrFlipDir] = useState<{[i: number]: 'left'|'right'}>({})
    // ────────────────────────────────────────────────────────────────────────
    
    // Treatment plan comparison modal
    const [showPlanCompareModal, setShowPlanCompareModal] = useState(false)
    const [selectedProvDiagnosis, setSelectedProvDiagnosis] = useState<string>('')
    const [freeTextDiagnosis, setFreeTextDiagnosis] = useState<string>('')
    const [showAddPlanButton, setShowAddPlanButton] = useState(false)
    const [selectedDiagnosisTags, setSelectedDiagnosisTags] = useState<string[]>([])
    const [provisionalDiagnosisInput, setProvisionalDiagnosisInput] = useState('')
    const [selectedInvestigationTags, setSelectedInvestigationTags] = useState<string[]>([])
    const [investigationInput, setInvestigationInput] = useState('')
    const [selectedPlansByDiagnosis, setSelectedPlansByDiagnosis] = useState<Record<string, string[]>>({})
    const [skippedPlanCompareDiagnoses, setSkippedPlanCompareDiagnoses] = useState<string[]>([])
    const [planCompareQueue, setPlanCompareQueue] = useState<string[]>([])
    const [planCompareStepIndex, setPlanCompareStepIndex] = useState(0)
    const [autoPlanComparePromptKey, setAutoPlanComparePromptKey] = useState('')
    const [modifiedTreatmentPlanIds, setModifiedTreatmentPlanIds] = useState<string[]>([])
    const [modifiedPlanStepIndex, setModifiedPlanStepIndex] = useState(0)
    const [modifiedPlanActions, setModifiedPlanActions] = useState<Record<string, 'update' | 'create' | 'prescription-only'>>({})
    const [showMergePlansModal, setShowMergePlansModal] = useState(false)
    const [processingMergeModal, setProcessingMergeModal] = useState(false)
    const [pendingSelectedTreatments, setPendingSelectedTreatments] = useState<any[]>([])
    const [duplicateMergeItems, setDuplicateMergeItems] = useState<Array<{ productId: string; productName: string; planIds: string[]; planLabels: string[]; occurrences: number }>>([])
    const [duplicateMergeSelection, setDuplicateMergeSelection] = useState<Record<string, boolean>>({})
    const [appliedPlanSelectionKey, setAppliedPlanSelectionKey] = useState('')
    const [pausedPlanSelectionKey, setPausedPlanSelectionKey] = useState('')
    const [pendingMergeSelectionKey, setPendingMergeSelectionKey] = useState('')
    const [suppressVisitLoadingModal, setSuppressVisitLoadingModal] = useState(false)
    const [showVisitSuccessModal, setShowVisitSuccessModal] = useState(false)
    const [visitSuccessId, setVisitSuccessId] = useState<string | null>(null)

    // Treatment filter modal for provisional diagnosis in tab2
    const [showTreatmentFilterModal, setShowTreatmentFilterModal] = useState(false)
    const [diagFilterSystems, setDiagFilterSystems] = useState('')
    const [diagFilterPulseDiagnosis, setDiagFilterPulseDiagnosis] = useState('')
    const [diagFilterSpeciality, setDiagFilterSpeciality] = useState('')
    const [diagFilterOrgan, setDiagFilterOrgan] = useState('')
    
    // Prescription selection and repeat functionality
    const [selectedPrescriptions, setSelectedPrescriptions] = useState<Set<number>>(new Set())
    const [showRepeatInput, setShowRepeatInput] = useState(false)
    const [repeatCount, setRepeatCount] = useState<string>('')
    const [showRepeatInputForRow, setShowRepeatInputForRow] = useState<number | null>(null)
    const [repeatCountForRow, setRepeatCountForRow] = useState<string>('')
    const [tab5SearchQuery, setTab5SearchQuery] = useState('')
    const [tab5ShowSelectedOnly, setTab5ShowSelectedOnly] = useState(false)
    const [tab5ShowIssuesOnly, setTab5ShowIssuesOnly] = useState(false)
    const [tab5PinSelectedToTop, setTab5PinSelectedToTop] = useState(false)
    const [tab5FocusMode, setTab5FocusMode] = useState(false)
    const [tab5FocusedIndex, setTab5FocusedIndex] = useState<number | null>(null)
    const [tab5ShowMoreTools, setTab5ShowMoreTools] = useState(false)
    const tab5SearchInputRef = useRef<HTMLInputElement | null>(null)
    const stepProgressScrollerRef = useRef<HTMLDivElement | null>(null)
    const [isBulkDosagePanelOpen, setIsBulkDosagePanelOpen] = useState(false)
    const [bulkDosageAdminValues, setBulkDosageAdminValues] = useState({
        quantity: String(prescriptionDefaults.quantity ?? 15),
        timing: prescriptionDefaults.timing ?? 'AM',
        doseQuantity: prescriptionDefaults.doseQuantity ?? '10',
        doseTiming: prescriptionDefaults.doseTiming ?? 'TDS',
        dilution: prescriptionDefaults.dilution ?? 'WATER',
        procedure: prescriptionDefaults.procedure ?? 'ORAL',
        presentation: prescriptionDefaults.presentation ?? 'DRP',
        administration: '',
    })

    // Patient copy preview state
    const [previewExpanded, setPreviewExpanded] = useState(false)

    // Ref for redirect timer so we can cancel on unmount
    const redirectTimerRef = useRef<NodeJS.Timeout | null>(null)

    // Clean up modals and timers when navigating away from prescriptions page
    useEffect(() => {
        const handleRouteChange = () => {
            // Cancel any pending redirect timers
            if (redirectTimerRef.current) {
                clearTimeout(redirectTimerRef.current)
                redirectTimerRef.current = null
            }
            // Close all modals that could block the UI
            setShowSaveModal(false)
            setShowNavigationModal(false)
            setShowVisitSuccessModal(false)
            setCreatingTreatment(false)
            setLoading(false)
        }
        
        router.events.on('routeChangeStart', handleRouteChange)
        return () => {
            router.events.off('routeChangeStart', handleRouteChange)
            // Also clear timers on unmount
            if (redirectTimerRef.current) {
                clearTimeout(redirectTimerRef.current)
                redirectTimerRef.current = null
            }
        }
    }, [router.events])

    // Step configuration
    const steps = [
        { number: 1, title: 'Patient Info', description: 'Patient details' },
        { number: 2, title: 'Clinical', description: 'Clinical information' },
        { number: 3, title: 'Next Visit', description: 'Visit tracking' },
        { number: 4, title: 'Medicines', description: 'Select medicines' },
        { number: 5, title: 'Prescriptions', description: 'Medicine details' },
        { number: 6, title: 'Payment', description: 'Financial info' },
    ]

    const normalizeCategoryKey = (value: string): string => {
        return normalizeCategoryRuleKey(value)
    }

    const getProductCategoryKey = (product: any): string => {
        if (!product) return ''
        const rawCategory = typeof product.category === 'string' ? product.category : product.category?.name || ''
        return normalizeCategoryKey(rawCategory)
    }

    const TABLET_CAPSULE_CATEGORY_KEYS = new Set(['TABLETS', 'CAPSULES'])
    const SYRUP_CATEGORY_KEYS = new Set(['SYRUPS100ML', 'SYRUPS200ML'])
    const ML_DROPS_CATEGORY_KEYS = new Set([
        'DILUTIONS',
        'DROPS30ML',
        'DROPSR24R33',
        'ECODROPS30ML',
        'EENDROPS',
        'SPECIALDROPS',
        'NEWSPDROPS',
    ])

    const isTabletOrCapsuleProduct = (product: any): boolean => {
        return TABLET_CAPSULE_CATEGORY_KEYS.has(getProductCategoryKey(product))
    }

    const isSyrupProduct = (product: any): boolean => {
        return SYRUP_CATEGORY_KEYS.has(getProductCategoryKey(product))
    }

    const isMlDropsProduct = (product: any): boolean => {
        return ML_DROPS_CATEGORY_KEYS.has(getProductCategoryKey(product))
    }

    const spagyricComponentsWithPlaceholder = useMemo(() => {
        const seen = new Set<string>()
        const options = (Array.isArray(products) ? products : [])
            .filter((p: any) => getProductCategoryKey(p).startsWith('SPAGYRIC'))
            .map((p: any) => String(p?.name || '').trim())
            .filter((name: string) => {
                if (!name) return false
                const key = name.toUpperCase()
                if (seen.has(key)) return false
                seen.add(key)
                return true
            })
            .sort((a: string, b: string) => a.localeCompare(b))
            .map((name: string) => ({ value: name, label: name }))

        return [{ value: '', label: 'Select Component' }, ...options]
    }, [products])

    const categoryFieldRules = useMemo(() => {
        return normalizeCategoryFieldRules(prescriptionDefaults?.categoryFieldRules)
    }, [prescriptionDefaults?.categoryFieldRules])

    const getPrescriptionFieldVisibility = useCallback((product: any) => {
        const categoryKey = getProductCategoryKey(product)
        const visibility = getCategoryFieldVisibility(categoryFieldRules, categoryKey)

        // Preserve the old DRP-name fallback when no explicit category rule exists.
        const hasExplicitCategoryRule = hasCategoryFieldRule(categoryFieldRules, categoryKey)
        const productName = String(product?.name || '').toUpperCase().trim()
        if (!hasExplicitCategoryRule && productName.startsWith('DRP')) {
            return {
                ...visibility,
                dropper: true,
            }
        }

        return visibility
    }, [categoryFieldRules])

    const complaintTags = useMemo(() => parseComplaintTags(form.majorComplaints || ''), [form.majorComplaints])

    useEffect(() => {
        const nextRaw = String(form.provisionalDiagnosis || '')
            .split(',')
            .map((v) => String(v || '').trim())
            .filter(Boolean)

        const seen = new Set<string>()
        const parsed: string[] = []
        nextRaw.forEach((item) => {
            const key = item.toLowerCase()
            if (seen.has(key)) return
            seen.add(key)
            parsed.push(item)
        })

        const current = selectedDiagnosisTags.join('|').toLowerCase()
        const next = parsed.join('|').toLowerCase()
        if (current !== next) {
            setSelectedDiagnosisTags(parsed)
        }
    }, [form.provisionalDiagnosis])

    useEffect(() => {
        const nextRaw = String(form.investigations || '')
            .split(',')
            .map((v) => String(v || '').trim())
            .filter(Boolean)

        const seen = new Set<string>()
        const parsed: string[] = []
        nextRaw.forEach((item) => {
            const key = item.toLowerCase()
            if (seen.has(key)) return
            seen.add(key)
            parsed.push(item)
        })

        const current = selectedInvestigationTags.join('|').toLowerCase()
        const next = parsed.join('|').toLowerCase()
        if (current !== next) {
            setSelectedInvestigationTags(parsed)
        }
    }, [form.investigations])

    const diagnosisSuggestions = useMemo(() => {
        const grouped = new Map<string, any[]>()
        ;(Array.isArray(treatments) ? treatments : [])
            .filter((t: any) => !t.deleted && t.provDiagnosis)
            .forEach((t: any) => {
                const diagnosis = String(t.provDiagnosis || '').trim()
                if (!diagnosis) return
                if (!grouped.has(diagnosis)) grouped.set(diagnosis, [])
                grouped.get(diagnosis)!.push(t)
            })

        const out: Array<{ provDiagnosis: string; score: number }> = []
        grouped.forEach((plans, provDiagnosis) => {
            const mergedKeywordMap = new Map<string, number>()
            plans.forEach((plan: any) => {
                const fromJson = normalizeTreatmentKeywords(plan.keywords)
                const source = fromJson.length > 0 ? fromJson : parseTreatmentKeywordsFromNotes(plan.notes)
                source.forEach((k) => {
                    const word = String(k.word || '').trim().toLowerCase()
                    if (!word) return
                    mergedKeywordMap.set(word, (mergedKeywordMap.get(word) || 0) + (Number(k.weight) || 1))
                })
            })

            const mergedKeywords = Array.from(mergedKeywordMap.entries()).map(([word, weight]) => ({ word, weight }))
            const score = scoreTreatmentFromComplaints(complaintTags, mergedKeywords)
            if (score > 0) out.push({ provDiagnosis, score })
        })

        return out.sort((a, b) => b.score - a.score || a.provDiagnosis.localeCompare(b.provDiagnosis))
    }, [treatments, complaintTags])

    const scoredTreatments = useMemo(() => {
        return diagnosisSuggestions.map((s) => ({
            treatment: { provDiagnosis: s.provDiagnosis },
            score: s.score,
        }))
    }, [diagnosisSuggestions])

    const diagnosisScoreMap = useMemo(() => {
        const map = new Map<string, number>()
        diagnosisSuggestions.forEach(({ provDiagnosis, score }) => {
            const diag = String(provDiagnosis || '').trim()
            if (!diag) return
            const prev = map.get(diag) || 0
            if (score > prev) map.set(diag, score)
        })
        return map
    }, [diagnosisSuggestions])

    const topSuggestedDiagnoses = useMemo(() => {
        const seen = new Set<string>()
        const out: Array<{ diagnosis: string; score: number; plan: string }> = []
        for (const item of diagnosisSuggestions) {
            const diagnosis = String(item.provDiagnosis || '').trim()
            if (!diagnosis || seen.has(diagnosis)) continue
            seen.add(diagnosis)
            out.push({
                diagnosis,
                score: item.score,
                plan: 'Diagnosis Match',
            })
            if (out.length >= 5) break
        }
        return out
    }, [diagnosisSuggestions])

    const complaintKeywordSuggestions = useMemo(() => {
        const selectedDiagSet = new Set(selectedDiagnosisTags.map((d) => String(d || '').trim().toLowerCase()).filter(Boolean))
        const map = new Map<string, number>()

        ;(Array.isArray(treatments) ? treatments : [])
            .filter((t: any) => !t.deleted)
            .forEach((t: any) => {
                const diagnosis = String(t.provDiagnosis || '').trim().toLowerCase()
                if (selectedDiagSet.size > 0 && diagnosis && !selectedDiagSet.has(diagnosis)) return

                const fromJson = normalizeTreatmentKeywords(t.keywords)
                const fromNotes = parseTreatmentKeywordsFromNotes(t.notes)
                const source = fromJson.length > 0 ? fromJson : fromNotes
                source.forEach((k) => {
                    const word = String(k.word || '').trim().toLowerCase()
                    if (!word) return
                    const weight = Number(k.weight) || 1
                    const prev = map.get(word) || 0
                    map.set(word, Math.max(prev, weight))
                })
            })

        return Array.from(map.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, 24)
            .map(([word]) => word)
    }, [treatments, selectedDiagnosisTags])

    const plansByDiagnosis = useMemo(() => {
        const grouped = new Map<string, any[]>()
        ;(Array.isArray(treatments) ? treatments : [])
            .filter((t: any) => !t.deleted && t.provDiagnosis)
            .forEach((t: any) => {
                const diagnosis = String(t.provDiagnosis || '').trim()
                if (!diagnosis) return
                if (!grouped.has(diagnosis)) grouped.set(diagnosis, [])
                grouped.get(diagnosis)!.push(t)
            })

        grouped.forEach((plans) => {
            plans.sort((a: any, b: any) => {
                const aPlan = String(a.planNumber || '')
                const bPlan = String(b.planNumber || '')
                return aPlan.localeCompare(bPlan)
            })
        })

        return grouped
    }, [treatments])

    const diagnosisCanonicalMap = useMemo(() => {
        const map = new Map<string, string>()
        ;(Array.isArray(treatments) ? treatments : [])
            .filter((t: any) => !t.deleted && t.provDiagnosis)
            .forEach((t: any) => {
                const value = String(t.provDiagnosis || '').trim()
                if (!value) return
                const key = value.toLowerCase()
                if (!map.has(key)) map.set(key, value)
            })
        return map
    }, [treatments])

    const rankedDiagnosisOptions = useMemo(() => {
        const unique = Array.from(new Set(
            (Array.isArray(treatments) ? treatments : [])
                .filter((t: any) => !t.deleted && t.provDiagnosis)
                .filter((t: any) => !(t.provDiagnosis === 'IMPORTED' && t.planNumber === '00'))
                .map((t: any) => String(t.provDiagnosis))
        ))

        unique.sort((a, b) => {
            const scoreDiff = (diagnosisScoreMap.get(b) || 0) - (diagnosisScoreMap.get(a) || 0)
            if (scoreDiff !== 0) return scoreDiff
            return a.localeCompare(b)
        })

        return [
            { value: '', label: '-- select provisional diagnosis or type new --' },
            ...unique.map((diagnosis) => {
                const score = diagnosisScoreMap.get(diagnosis) || 0
                return {
                    value: diagnosis,
                    label: score > 0 ? `${diagnosis} (score ${score})` : diagnosis,
                    description: score > 0 ? 'SUGGESTED' : undefined,
                }
            }),
        ]
    }, [treatments, diagnosisScoreMap])

    const filteredDiagnosisOptions = useMemo(() => {
        let filtered = (Array.isArray(treatments) ? treatments : []).filter((t: any) =>
            !t.deleted && t.provDiagnosis && !(t.provDiagnosis === 'IMPORTED' && t.planNumber === '00')
        )
        if (diagFilterSystems) filtered = filtered.filter((t: any) => (t.systems || '').toLowerCase() === diagFilterSystems.toLowerCase())
        if (diagFilterPulseDiagnosis) filtered = filtered.filter((t: any) => (t.pulseDiagnosis || '').toLowerCase() === diagFilterPulseDiagnosis.toLowerCase())
        if (diagFilterSpeciality) filtered = filtered.filter((t: any) => (t.speciality || '').toLowerCase() === diagFilterSpeciality.toLowerCase())
        if (diagFilterOrgan) filtered = filtered.filter((t: any) => (t.organ || '').toLowerCase() === diagFilterOrgan.toLowerCase())

        const unique = Array.from(new Set(filtered.map((t: any) => String(t.provDiagnosis))))
        unique.sort((a, b) => {
            const scoreDiff = (diagnosisScoreMap.get(b) || 0) - (diagnosisScoreMap.get(a) || 0)
            if (scoreDiff !== 0) return scoreDiff
            return a.localeCompare(b)
        })

        return [
            { value: '', label: 'Select diagnosis to add' },
            ...unique.map((diagnosis) => {
                const score = diagnosisScoreMap.get(diagnosis) || 0
                return {
                    value: diagnosis,
                    label: score > 0 ? `${diagnosis} (score ${score})` : diagnosis,
                    description: score > 0 ? 'SUGGESTED' : undefined,
                }
            }),
        ]
    }, [treatments, diagFilterSystems, diagFilterPulseDiagnosis, diagFilterSpeciality, diagFilterOrgan, diagnosisScoreMap])

    const learnedInvestigationSuggestions = useMemo(() => {
        const isLikelyInvestigation = (word: string): boolean => {
            const w = String(word || '').toUpperCase().trim()
            if (!w) return false
            return /(CBC|ESR|CRP|LFT|KFT|RBS|FBS|PPBS|HBA1C|TSH|URINE|X-RAY|XRAY|USG|ULTRASOUND|ECG|ECHO|MRI|CT|WIDAL|DENGUE|MALARIA|TEST|PANEL|PROFILE|SCAN)/.test(w)
        }

        const set = new Set<string>()
        ;(Array.isArray(treatments) ? treatments : [])
            .filter((t: any) => !t.deleted)
            .forEach((t: any) => {
                const keywords = normalizeTreatmentKeywords(t.keywords)
                const fallback = parseTreatmentKeywordsFromNotes(t.notes)
                const source = keywords.length > 0 ? keywords : fallback
                source.forEach((k) => {
                    const word = String(k.word || '').trim().toUpperCase()
                    if (!word) return
                    if (!isLikelyInvestigation(word)) return
                    set.add(word)
                })
            })
        return Array.from(set).sort((a, b) => a.localeCompare(b))
    }, [treatments])

    const investigationOptions = useMemo(() => {
        const sampleLabTests = [
            'CBC',
            'ESR',
            'CRP',
            'LFT',
            'KFT',
            'RBS',
            'FBS/PPBS',
            'HBA1C',
            'TSH',
            'URINE ROUTINE',
            'DENGUE NS1',
            'MALARIA PARASITE',
            'WIDAL',
            'X-RAY CHEST',
            'USG ABDOMEN',
            'ECG',
        ]
        const merged = Array.from(new Set([...sampleLabTests, ...learnedInvestigationSuggestions]))
        return [
            { value: '', label: 'Select investigation' },
            ...merged.map((t) => ({ value: t, label: t })),
        ]
    }, [learnedInvestigationSuggestions])

    const planCompareEligibleDiagnoses = useMemo(() => {
        return selectedDiagnosisTags.filter((diagnosis) => {
            const plans = plansByDiagnosis.get(diagnosis) || []
            return plans.length > 0
        })
    }, [selectedDiagnosisTags, plansByDiagnosis])

    const unresolvedPlanCompareDiagnoses = useMemo(() => {
        return planCompareEligibleDiagnoses.filter((diagnosis) => {
            if (skippedPlanCompareDiagnoses.includes(diagnosis)) return false
            const selected = selectedPlansByDiagnosis[diagnosis] || []
            return selected.length === 0
        })
    }, [planCompareEligibleDiagnoses, selectedPlansByDiagnosis, skippedPlanCompareDiagnoses])

    const unresolvedPlanCompareKey = useMemo(() => {
        return [...unresolvedPlanCompareDiagnoses].sort().join('|')
    }, [unresolvedPlanCompareDiagnoses])

    const closePlanCompareProgressModal = useCallback(() => {
        setShowPlanCompareModal(false)
        setSelectedProvDiagnosis('')
        setPlanCompareQueue([])
        setPlanCompareStepIndex(0)
    }, [])

    const openPlanCompareProgressModal = useCallback((diagnoses?: string[]) => {
        const source = Array.isArray(diagnoses) && diagnoses.length > 0
            ? diagnoses
            : unresolvedPlanCompareDiagnoses

        const queue = Array.from(new Set(source.map((item) => String(item || '').trim()).filter(Boolean))).filter((diagnosis) => {
            const plans = plansByDiagnosis.get(diagnosis) || []
            return plans.length > 0
        })

        if (queue.length === 0) return false

        const unresolvedStartIndex = queue.findIndex((diagnosis) => {
            const selected = selectedPlansByDiagnosis[diagnosis] || []
            return selected.length === 0
        })
        const startIndex = unresolvedStartIndex >= 0 ? unresolvedStartIndex : 0

        setPlanCompareQueue(queue)
        setPlanCompareStepIndex(startIndex)
        setSelectedProvDiagnosis(queue[startIndex] || '')
        setShowPlanCompareModal(true)
        return true
    }, [plansByDiagnosis, selectedPlansByDiagnosis, unresolvedPlanCompareDiagnoses])

    const movePlanCompareStep = useCallback((nextIndex: number) => {
        const boundedIndex = Math.max(0, Math.min(nextIndex, planCompareQueue.length - 1))
        setPlanCompareStepIndex(boundedIndex)
        setSelectedProvDiagnosis(planCompareQueue[boundedIndex] || '')
    }, [planCompareQueue])

    const advancePlanCompareToNextPending = useCallback(() => {
        if (planCompareQueue.length === 0) {
            closePlanCompareProgressModal()
            return
        }

        const nextIndex = planCompareQueue.findIndex((diagnosis, index) => {
            if (index <= planCompareStepIndex) return false
            if (skippedPlanCompareDiagnoses.includes(diagnosis)) return false
            return true
        })

        if (nextIndex >= 0) {
            movePlanCompareStep(nextIndex)
            return
        }

        closePlanCompareProgressModal()
    }, [
        planCompareQueue,
        planCompareStepIndex,
        skippedPlanCompareDiagnoses,
        selectedPlansByDiagnosis,
        movePlanCompareStep,
        closePlanCompareProgressModal,
    ])

    const skipCurrentPlanCompareDiagnosis = useCallback(() => {
        const diagnosis = planCompareQueue[planCompareStepIndex] || selectedProvDiagnosis
        if (!diagnosis) {
            closePlanCompareProgressModal()
            return
        }

        setSkippedPlanCompareDiagnoses((prev) => {
            if (prev.includes(diagnosis)) return prev
            return [...prev, diagnosis]
        })

        const skippedSet = new Set([...skippedPlanCompareDiagnoses, diagnosis])
        const nextIndex = planCompareQueue.findIndex((item, index) => {
            if (index <= planCompareStepIndex) return false
            if (skippedSet.has(item)) return false
            const selected = selectedPlansByDiagnosis[item] || []
            return selected.length === 0
        })

        if (nextIndex >= 0) {
            movePlanCompareStep(nextIndex)
            return
        }

        closePlanCompareProgressModal()
    }, [
        planCompareQueue,
        planCompareStepIndex,
        selectedProvDiagnosis,
        skippedPlanCompareDiagnoses,
        selectedPlansByDiagnosis,
        movePlanCompareStep,
        closePlanCompareProgressModal,
    ])



    // Fetch all required data eagerly on mount
    useEffect(() => {
        const fetchData = async () => {
            setDataLoading(true)
            try {
                const [patientsRes, treatmentsRes, productsRes, purchaseOrdersRes] = await Promise.all([
                    fetch('/api/patients'),
                    fetch('/api/treatments'),
                    fetch('/api/products'),
                    fetch('/api/purchase-orders')
                ])

                const patientsData = await patientsRes.json()
                const treatmentsData = await treatmentsRes.json()
                const productsData = await productsRes.json()
                const purchaseOrdersData = await purchaseOrdersRes.json()

                setPatients(Array.isArray(patientsData) ? patientsData : [])
                setTreatments(treatmentsData)
                setProducts(productsData)
                setPurchaseOrders(Array.isArray(purchaseOrdersData) ? purchaseOrdersData : [])
            } catch (err) {
                setPatients([])
            } finally {
                setDataLoading(false)
            }
        }
        fetchData()
    }, [])
    
    // Fetch dropdown options from API
    useEffect(() => {
        const fetchOptions = async () => {
            try {
                setLoadingOptions(true)
                const [
                    genderData,
                    temperamentData,
                    pulseDiagnosisData,
                    pulseDiagnosis2Data,
                    componentsData,
                    timingData,
                    doseQuantityData,
                    doseTimingData,
                    dilutionData,
                    additionsData,
                    procedureData,
                    presentationData,
                    administrationData,
                    bottlePricingData
                ] = await Promise.all([
                    fetch('/api/options/gender').then(r => r.json()).catch(() => []),
                    fetch('/api/options/temperament').then(r => r.json()).catch(() => []),
                    fetch('/api/options/pulse-diagnosis').then(r => r.json()).catch(() => []),
                    fetch('/api/options/pulse-diagnosis-2').then(r => r.json()).catch(() => []),
                    fetch('/api/options/components').then(r => r.json()).catch(() => []),
                    fetch('/api/options/timing').then(r => r.json()).catch(() => []),
                    fetch('/api/options/dose-quantity').then(r => r.json()).catch(() => []),
                    fetch('/api/options/dose-timing').then(r => r.json()).catch(() => []),
                    fetch('/api/options/dilution').then(r => r.json()).catch(() => []),
                    fetch('/api/options/additions').then(r => r.json()).catch(() => []),
                    fetch('/api/options/procedure').then(r => r.json()).catch(() => []),
                    fetch('/api/options/presentation').then(r => r.json()).catch(() => []),
                    fetch('/api/options/administration').then(r => r.json()).catch(() => []),
                    fetch('/api/options/bottle-pricing').then(r => r.json()).catch(() => [])
                ])
                
                // Fallback to JSON files if API returns empty data
                const genderJSON = (await import('../data/gender.json')).default
                const temperamentJSON = (await import('../data/temperament.json')).default
                const pulseDiagnosisJSON = (await import('../data/pulseDiagnosis.json')).default
                const pulseDiagnosis2JSON = (await import('../data/pulseDiagnosis2.json')).default
                const componentsJSON = (await import('../data/components.json')).default
                const timingJSON = (await import('../data/timing.json')).default
                const doseQuantityJSON = (await import('../data/doseQuantity.json')).default
                const doseTimingJSON = (await import('../data/doseTiming.json')).default
                const dilutionJSON = (await import('../data/dilution.json')).default
                const additionsJSON = (await import('../data/additions.json')).default
                const procedureJSON = (await import('../data/procedure.json')).default
                const presentationJSON = (await import('../data/presentation.json')).default
                const administrationJSON = (await import('../data/administration.json')).default
                const bottlePricingJSON = (await import('../data/bottlePricing.json')).default
                
                setGenderOptions(genderData.length > 0 ? genderData : genderJSON)
                setTemperamentOptions(temperamentData.length > 0 ? temperamentData : temperamentJSON)
                setPulseDiagnosisOptions(pulseDiagnosisData.length > 0 ? pulseDiagnosisData : pulseDiagnosisJSON)
                setPulseDiagnosis2Options(pulseDiagnosis2Data.length > 0 ? pulseDiagnosis2Data : pulseDiagnosis2JSON)
                setComponents(componentsData.length > 0 ? componentsData : componentsJSON)
                setTiming(timingData.length > 0 ? timingData : timingJSON)
                setDoseQuantity(doseQuantityData.length > 0 ? doseQuantityData : doseQuantityJSON)
                setDoseTiming(doseTimingData.length > 0 ? doseTimingData : doseTimingJSON)
                setDilution(dilutionData.length > 0 ? dilutionData : dilutionJSON)
                setAdditions(additionsData.length > 0 ? additionsData : additionsJSON)
                setProcedure(procedureData.length > 0 ? procedureData : procedureJSON)
                setPresentation(presentationData.length > 0 ? presentationData : presentationJSON)
                setAdministration(administrationData.length > 0 ? administrationData : administrationJSON)
                setBottlePricing(bottlePricingData.length > 0 ? bottlePricingData : bottlePricingJSON)
            } catch (error) {
            } finally {
                setLoadingOptions(false)
            }
        }
        fetchOptions()
    }, [])

    // Keep active step visible and centered in horizontal progress strip.
    useEffect(() => {
        const scroller = stepProgressScrollerRef.current
        if (!scroller) return
        const activeStepButton = scroller.querySelector<HTMLButtonElement>(`button[data-step="${currentStep}"]`)
        if (!activeStepButton) return

        const centerActiveStep = () => {
            const scrollerRect = scroller.getBoundingClientRect()
            const activeRect = activeStepButton.getBoundingClientRect()
            const delta = (activeRect.left - scrollerRect.left) - ((scroller.clientWidth - activeRect.width) / 2)
            scroller.scrollBy({ left: delta, behavior: 'smooth' })
        }

        const rafId = window.requestAnimationFrame(centerActiveStep)
        const timeoutId = window.setTimeout(centerActiveStep, 90)
        return () => {
            window.cancelAnimationFrame(rafId)
            window.clearTimeout(timeoutId)
        }
    }, [currentStep, previewExpanded])

    useEffect(() => {
        if (!previewExpanded) {
            setTab5ShowMoreTools(false)
        }
    }, [previewExpanded])

    // In step 4, auto-open the plan compare modal only once per unresolved diagnosis set.
    useEffect(() => {
        if (currentStep !== 4) return
        if (isEditMode) return
        if (showPlanCompareModal || showMergePlansModal || processingMergeModal) return
        if (!unresolvedPlanCompareKey) return
        if (unresolvedPlanCompareKey === autoPlanComparePromptKey) return

        const opened = openPlanCompareProgressModal(unresolvedPlanCompareDiagnoses)
        if (opened) {
            setAutoPlanComparePromptKey(unresolvedPlanCompareKey)
        }
    }, [
        currentStep,
        showPlanCompareModal,
        showMergePlansModal,
        processingMergeModal,
        unresolvedPlanCompareDiagnoses,
        unresolvedPlanCompareKey,
        autoPlanComparePromptKey,
        openPlanCompareProgressModal,
    ])

    useEffect(() => {
        if (!unresolvedPlanCompareKey && autoPlanComparePromptKey) {
            setAutoPlanComparePromptKey('')
        }
    }, [unresolvedPlanCompareKey, autoPlanComparePromptKey])

    useEffect(() => {
        if (!showPlanCompareModal) return
        if (planCompareQueue.length === 0) return

        const safeIndex = Math.max(0, Math.min(planCompareStepIndex, planCompareQueue.length - 1))
        const diagnosisAtIndex = planCompareQueue[safeIndex] || ''

        if (safeIndex !== planCompareStepIndex) {
            setPlanCompareStepIndex(safeIndex)
        }

        if (selectedProvDiagnosis !== diagnosisAtIndex) {
            setSelectedProvDiagnosis(diagnosisAtIndex)
        }
    }, [showPlanCompareModal, planCompareQueue, planCompareStepIndex, selectedProvDiagnosis])

    // Initialize default droppers for new prescriptions (not in edit mode)
    useEffect(() => {
        if (!isEditMode && products.length > 0 && prescriptions.length === 0) {
            const defaultDroppers = [
                'DRP SCOROFOLOSO/D5',
                'DRP CANCEROSO/D5',
                'DRP FEBRIFUGO/D5'
            ]

            const defaultPrescriptions = defaultDroppers.map(dropperName => {
                // Prefer exact DRP/D5 match; fallback to partial for legacy names.
                const upperName = dropperName.toUpperCase()
                const product =
                    products.find(p => String(p.name || '').toUpperCase().trim() === upperName) ||
                    products.find(p =>
                        String(p.name || '').toUpperCase().includes(upperName) ||
                        upperName.includes(String(p.name || '').toUpperCase())
                    )

                // Find default 15ml dropper
                const defaultDropper = products.find(p => 
                    p.category?.name?.toUpperCase() === 'MISC' && 
                    p.name?.toUpperCase().includes('DROPPER') &&
                    p.name?.toLowerCase().includes('15ml')
                )

                return {
                    treatmentId: '',
                    productId: product ? String(product.id) : '',
                    spy1: '', spy2: '', spy3: '', spy4: '', spy5: '', spy6: '',
                    quantity: prescriptionDefaults.quantity ?? 15, timing: prescriptionDefaults.timing ?? 'AM', dosage: `${prescriptionDefaults.doseQuantity ?? '10'}|${prescriptionDefaults.doseTiming ?? 'TDS'}|${prescriptionDefaults.dilution ?? 'WATER'}`,
                    addition1: '', addition2: '', addition3: '',
                    procedure: prescriptionDefaults.procedure ?? 'ORAL', presentation: prescriptionDefaults.presentation ?? 'DRP',
                    droppersToday: '', medicineQuantity: '',
                    administration: '', patientHasMedicine: false,
                    bottleSize: prescriptionDefaults.bottleSize ?? '15', discussions: '',
                    selectedDropper: prescriptionDefaults.selectedDropper ? String(prescriptionDefaults.selectedDropper) : (defaultDropper ? String(defaultDropper.id) : ''), selectedLabel: 'LABELS ORAL (ENG)', includeLabelProduct: true,
                    includeVrsProduct: true, vrsQuantity: 0.125
                }
            })

            setPrescriptions(defaultPrescriptions)
        }
    }, [products, isEditMode])

    // Sync GST rate with default values
    useEffect(() => {
        if (prescriptionDefaults.gstRate !== undefined) {
            setGstRate(prescriptionDefaults.gstRate)
        } else if (invoiceDefaults.gstRate !== undefined) {
            setGstRate(invoiceDefaults.gstRate)
        }
        
        if (prescriptionDefaults.consultationFees !== undefined) {
            setConsultationFees(prescriptionDefaults.consultationFees)
        } else if (invoiceDefaults.consultationFees !== undefined) {
            setConsultationFees(invoiceDefaults.consultationFees)
        }
    }, [prescriptionDefaults, invoiceDefaults])

    // Set patientId and visitNumber from URL query parameters
    useEffect(() => {
        const { patientId, visitNumber } = router.query
        if (patientId && !isEditMode && patients.length > 0) {
            const found = patients.find(p => String(p.id) === String(patientId))
            if (found) {
                // Fetch the most recent visit for this patient to get opdNo
                fetch(`/api/visits?patientId=${patientId}`)
                    .then(r => r.json())
                    .then(async (patientVisits: any[]) => {
                        const latestVisit = patientVisits.length > 0 ? patientVisits[0] : null

                        // Always generate new OPD number for new visits
                        const previewOpdNo = await generateOpdNoPreview(String(patientId))
                        setGeneratedOpdNo(previewOpdNo)

                        setForm((prev: any) => ({
            ...prev,
                            patientId: String(patientId),
                            opdNo: previewOpdNo,
                            visitNumber: visitNumber ? String(visitNumber) : (prev.visitNumber || ''),
                            dob: formatDateForInput(found.dob) || '',
                            age: String(found.age ?? ''),
                            address: found.address || '',
                            gender: found.gender || '',
                            phone: found.phone || '',
                            occupation: found.occupation || '',
                            pendingPaymentCents: String(found.pendingPaymentCents ?? ''),
                            height: String(found.height ?? ''),
                            weight: String(found.weight ?? ''),
                            fatherHusbandGuardianName: found.fatherHusbandGuardianName || '',
                            // Load clinical information from patient record
                            temperament: found.temperament || '',
                            pulseDiagnosis: found.pulseDiagnosis || '',
                            pulseDiagnosis2: found.pulseDiagnosis2 || '',
                            majorComplaints: found.majorComplaints || '',
                            historyReports: found.historyReports || '',
                            investigations: found.investigations || '',
                            provisionalDiagnosis: found.provisionalDiagnosis || '',
                            improvements: found.improvements || ''
                        }))
                    })
                    .catch(() => {
                        // If fetch fails, just set patient data without opdNo
                        setForm((prev: any) => ({
                            ...prev,
                            patientId: String(patientId),
                            opdNo: '',
                            visitNumber: visitNumber ? String(visitNumber) : (prev.visitNumber || ''),
                            dob: formatDateForInput(found.dob) || '',
                            age: String(found.age ?? ''),
                            address: found.address || '',
                            gender: found.gender || '',
                            phone: found.phone || '',
                            occupation: found.occupation || '',
                            pendingPaymentCents: String(found.pendingPaymentCents ?? ''),
                            height: String(found.height ?? ''),
                            weight: String(found.weight ?? ''),
                            fatherHusbandGuardianName: found.fatherHusbandGuardianName || '',
                            // Load clinical information from patient record
                            temperament: found.temperament || '',
                            pulseDiagnosis: found.pulseDiagnosis || '',
                            pulseDiagnosis2: found.pulseDiagnosis2 || '',
                            majorComplaints: found.majorComplaints || '',
                            historyReports: found.historyReports || '',
                            investigations: found.investigations || '',
                            provisionalDiagnosis: found.provisionalDiagnosis || '',
                            improvements: found.improvements || ''
                        }))
                    })
            } else {
                setForm((prev: any) => ({
                    ...prev,
                    patientId: String(patientId),
                    visitNumber: visitNumber ? String(visitNumber) : prev.visitNumber
                }))
            }
        }
    }, [router.query.patientId, router.query.visitNumber, isEditMode, patients])

    // Fetch previous weight when patient is selected
    useEffect(() => {
        if (form.patientId && !isEditMode) {
            fetch(`/api/visits?patientId=${form.patientId}`)
                .then(r => r.json())
                .then(visits => {
                    if (visits && visits.length > 0) {
                        // Sort by date descending and get the most recent visit
                        const sortedVisits = visits.sort((a: any, b: any) =>
                            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
                        )
                        const lastVisit = sortedVisits[0]
                        if (lastVisit.patient?.weight) {
                            setPreviousWeight(lastVisit.patient.weight)
                        }
                    }
                })
                .catch(() => {})
        }
    }, [form.patientId, isEditMode])

    // Auto-calculate amount from prescriptions
    useEffect(() => {
        if (prescriptions.length === 0 || products.length === 0) return

        let totalAmount = 0
        let spyBottleAdded = false
        let additionsBottleAdded = false

        prescriptions.forEach(pr => {
            // Skip medicines that patient already has ("not taken")
            if (pr.patientHasMedicine) return
            
            const product = products.find(p => String(p.id) === String(pr.productId))
            if (product && product.priceRupees !== undefined) {
                const quantity = parseInt(pr.quantity) || 1
                // priceRupees is the rate per unit (selling price)
                totalAmount += (Number(product.priceRupees) * quantity)
            }

            // Add bottle price based on bottle size selection and filled components
            if (pr.bottleSize) {
                const bottlePriceData = bottlePricing.find(b => b.value === pr.bottleSize)
                const bottlePrice = bottlePriceData ? bottlePriceData.price : 0

                // Add for SPY components (spy4-spy6)
                if (!spyBottleAdded && (pr.spy4 || pr.spy5 || pr.spy6) && bottlePrice > 0) {
                    totalAmount += bottlePrice
                    spyBottleAdded = true
                }

                // Add for Additions (addition1-addition3)
                if (!additionsBottleAdded && (pr.addition1 || pr.addition2 || pr.addition3) && bottlePrice > 0) {
                    totalAmount += bottlePrice
                    additionsBottleAdded = true
                }
            }
        })

        const amountInRupees = formatPrice(totalAmount)
        setForm((prev: any) => ({ ...prev, amount: amountInRupees }))
    }, [prescriptions, products])

    // Auto-calculate balance when amount, discount, payment, or consultation fees changes
    useEffect(() => {
        const amount = parseFloat(form.amount) || 0
        const discount = parseFloat(form.discount) || 0
        const payment = parseFloat(form.payment) || 0
        const consultation = consultationFees || 0
        const balance = formatPrice(amount - discount + consultation - payment)

        setForm((prev: any) => ({ ...prev, balance }))
    }, [form.amount, form.discount, form.payment, consultationFees])

    // Auto-calculate medicine box quantity based on TABLET/CAPSULE products
    useEffect(() => {
        if (prescriptions.length === 0 || products.length === 0) {
            setMedicineBoxQuantity(0)
            setDefaultMiscProducts(prev => ({ ...prev, 'MEDICINE BOX': false }))
            return
        }

        // Calculate total quantity of TABLET/CAPSULE products
        let totalTabletCapsuleQty = 0
        prescriptions.forEach(pr => {
            const product = products.find(p => String(p.id) === String(pr.productId))
            if (product) {
                const categoryName = (typeof product.category === 'string' ? product.category : product.category?.name || '').toUpperCase()
                const productName = product.name.toUpperCase()
                
                // Check if product is TABLET or CAPSULE
                if (categoryName.includes('TABLET') || categoryName.includes('TAB') || 
                    categoryName.includes('CAPSULE') || categoryName.includes('CAP') ||
                    productName.includes('TABLET') || productName.includes('TAB') ||
                    productName.includes('CAPSULE') || productName.includes('CAP')) {
                    const quantity = parseInt(pr.quantity) || 0
                    totalTabletCapsuleQty += quantity
                }
            }
        })

        // Determine medicine box quantity: 0 if no tablets/capsules, 1 if <= 100, 2 if > 100
        let boxQty = 0
        let shouldCheck = false
        if (totalTabletCapsuleQty > 0) {
            boxQty = totalTabletCapsuleQty > 100 ? 2 : 1
            shouldCheck = true
        }
        
        setMedicineBoxQuantity(boxQty)
        setDefaultMiscProducts(prev => ({ ...prev, 'MEDICINE BOX': shouldCheck }))
    }, [prescriptions, products])

    // Auto-convert height: cm to feet-inches
    useEffect(() => {
        if (isUpdatingHeightFromFeet.current) {
            isUpdatingHeightFromFeet.current = false
            return
        }

        if (form.height && form.height !== '') {
            const cm = parseFloat(form.height)
            if (!isNaN(cm) && cm > 0) {
                const totalInches = cm / 2.54
                const feet = Math.floor(totalInches / 12)
                const inches = Math.round(totalInches % 12)
                const calculatedFeet = feet.toString()
                const calculatedInches = inches.toString()
                if (form.heightFeet !== calculatedFeet || form.heightInches !== calculatedInches) {
                    isUpdatingFeetFromHeight.current = true
                    setForm((prev: any) => ({ ...prev, heightFeet: calculatedFeet, heightInches: calculatedInches }))
                }
            }
        }
    }, [form.height])

    // Auto-save prescriptions periodically to prevent data loss (backup mechanism)
    useEffect(() => {
        if (!isEditMode && prescriptions.length > 0 && form.patientId) {
            const backupTimer = setTimeout(() => {
                try {
                    const backup = {
                        prescriptions,
                        timestamp: new Date().toISOString(),
                        patientId: form.patientId
                    }
                    localStorage.setItem('prescriptionBackup', JSON.stringify(backup))
                } catch (err) {
                }
            }, 5000) // Save every 5 seconds

            return () => clearTimeout(backupTimer)
        }
    }, [prescriptions, form.patientId, isEditMode])

    // Monitor prescription count changes to detect unexpected deletions
    useEffect(() => {
        const currentCount = prescriptions.length
        
        // Detect suspicious emptying of prescriptions
        if (previousPrescriptionCount > 0 && currentCount === 0 && !loading) {
            
            // Try to auto-restore from backup
            setTimeout(() => {
                const restored = restoreFromBackup()
                if (!restored) {
                    showError(`Warning: All ${previousPrescriptionCount} medicines disappeared! No backup found to restore.`)
                }
            }, 100)
        }
        
        // Update tracking
        if (currentCount !== previousPrescriptionCount) {
            setPreviousPrescriptionCount(currentCount)
        }
    }, [prescriptions, previousPrescriptionCount, loading])

    // Auto-convert height: feet-inches to cm
    useEffect(() => {
        if (isUpdatingFeetFromHeight.current) {
            isUpdatingFeetFromHeight.current = false
            return
        }

        if ((form.heightFeet !== '' || form.heightInches !== '') && form.heightFeet !== undefined && form.heightInches !== undefined) {
            const feet = parseFloat(form.heightFeet) || 0
            const inches = parseFloat(form.heightInches) || 0
            if (feet > 0 || inches > 0) {
                const totalInches = (feet * 12) + inches
                const cm = Math.round(totalInches * 2.54)
                const calculatedHeight = cm.toString()
                if (form.height !== calculatedHeight) {
                    isUpdatingHeightFromFeet.current = true
                    setForm((prev: any) => ({ ...prev, height: calculatedHeight }))
                }
            }
        }
    }, [form.heightFeet, form.heightInches])

    // Auto-save form data to localStorage (with debounce)
    useEffect(() => {
        if (isEditMode) return // Don't auto-save in edit mode

        const timeoutId = setTimeout(() => {
            try {
                const draftData = {
                    form,
                    prescriptions,
                    timestamp: Date.now()
                }
                localStorage.setItem('prescriptionDraft', JSON.stringify(draftData))
                setHasDraft(true)
            } catch (err) {
            }
        }, 2000) // Save 2 seconds after user stops typing

        return () => clearTimeout(timeoutId)
    }, [form, prescriptions, isEditMode])

    // Restore draft on mount
    useEffect(() => {
        if (isEditMode) return // Don't restore in edit mode
        if (router.query.patientId) return // Don't restore if patient is pre-selected from URL

        try {
            const savedDraft = localStorage.getItem('prescriptionDraft')
            if (savedDraft) {
                const draftData = JSON.parse(savedDraft)
                const age = Date.now() - draftData.timestamp
                const maxAge = 24 * 60 * 60 * 1000 // 24 hours

                // Only restore if draft is less than 24 hours old
                if (age < maxAge) {
                    setHasDraft(true)
                    setDraftData(draftData)
                    setShowRestoreDraftModal(true)
                } else {
                    // Draft is too old, remove it
                    localStorage.removeItem('prescriptionDraft')
                    setHasDraft(false)
                }
            }
        } catch (err) {
        }
    }, []) // Only run once on mount

    // Auto-calculate age from DOB
    useEffect(() => {
        if (form.dob && form.dob !== '') {
            const birthDate = new Date(form.dob)
            const today = new Date()
            let age = today.getFullYear() - birthDate.getFullYear()
            const monthDiff = today.getMonth() - birthDate.getMonth()
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
                age--
            }
            if (age >= 0) {
                setForm((prev: any) => ({ ...prev, age: age.toString() }))
            }
        }
    }, [form.dob])


    // Load existing visit data when in edit mode
    useEffect(() => {
        if (isEditMode && visitId) {
            setLoading(true)
            fetch(`/api/visits?id=${visitId}`)
                .then(r => r.json())
                .then(visit => {
                    if (!visit) {
                        showError('Visit not found')
                        router.push('/visits')
                        return
                    }

                    // Split nextVisit into date and time
                    let nextVisitDate = ''
                    let nextVisitTime = ''
                    if (visit.nextVisit) {
                        const dt = new Date(visit.nextVisit).toISOString()
                        nextVisitDate = dt.slice(0, 10)
                        nextVisitTime = dt.slice(11, 16)
                    }

                    const visitConsultationFees = Number(visit.consultationFees) || 0
                    setConsultationFees(visitConsultationFees)

                    // Normalize legacy records where consultation was historically included in amount.
                    const rawAmount = Number(visit.amount) || 0
                    const rawDiscount = Number(visit.discount) || 0
                    const rawPayment = Number(visit.payment) || 0
                    const rawBalance = Number(visit.balance) || 0
                    const expectedBalanceIfConsultInAmount = rawAmount - rawDiscount - rawPayment
                    const expectedBalanceIfConsultSeparate = rawAmount - rawDiscount + visitConsultationFees - rawPayment
                    const amountLooksConsultInclusive = Math.abs(rawBalance - expectedBalanceIfConsultInAmount) <= 0.01 &&
                        Math.abs(rawBalance - expectedBalanceIfConsultSeparate) > 0.01
                    const normalizedAmount = amountLooksConsultInclusive
                        ? Math.max(0, rawAmount - visitConsultationFees)
                        : rawAmount

                    // Pre-fill form with existing data
                    setForm({
                        patientId: String(visit.patientId),
                        opdNo: visit.opdNo || '',
                        date: formatDateForInput(visit.date),
                        temperament: visit.temperament || '',
                        pulseDiagnosis: visit.pulseDiagnosis || '',
                        pulseDiagnosis2: visit.pulseDiagnosis2 || '',
                        majorComplaints: visit.majorComplaints || '',
                        historyReports: visit.historyReports || '',
                        investigations: visit.investigations || '',
                        reports: visit.reports || '',
                        provisionalDiagnosis: visit.provisionalDiagnosis || '',
                        improvements: visit.improvements || '',
                        specialNote: visit.specialNote || '',
                        discussion: visit.discussion || visit.investigations || '',
                        dob: formatDateForInput(visit.patient?.dob),
                        age: visit.patient?.age ?? '',
                        address: visit.patient?.address || '',
                        gender: visit.patient?.gender || '',
                        phone: visit.patient?.phone || '',
                        nextVisitDate,
                        nextVisitTime,
                        occupation: visit.patient?.occupation || '',
                        pendingPaymentCents: visit.patient?.pendingPaymentCents ?? '',
                        height: visit.height ?? visit.patient?.height ?? '',
                        heightFeet: '',
                        heightInches: '',
                        weight: visit.weight ?? visit.patient?.weight ?? '',
                        fatherHusbandGuardianName: visit.patient?.fatherHusbandGuardianName || '',
                        imageUrl: visit.patient?.imageUrl || '',
                        amount: normalizedAmount,
                        discount: visit.discount ?? '',
                        payment: visit.payment ?? '',
                        balance: visit.balance ?? '',
                        visitNumber: visit.visitNumber ?? '',
                        followUpCount: visit.followUpCount ?? ''
                    })

                    // Load reports attachments if they exist
                    if (visit.reportsAttachments) {
                        try {
                            const parsed = JSON.parse(visit.reportsAttachments)
                            if (Array.isArray(parsed)) {
                                setReportsAttachments(parsed)
                            }
                        } catch (e) {
                            setReportsAttachments([])
                        }
                    }

                    // Pre-fill prescriptions
                    if (visit.prescriptions && visit.prescriptions.length > 0) {
                        const loadedPrescriptions = visit.prescriptions.map((p: any) => ({
                            treatmentId: p.treatmentId ? String(p.treatmentId) : '',
                            productId: String(p.productId),
                            spy1: p.spy1 || '',
                            spy2: p.spy2 || '',
                            spy3: p.spy3 || '',
                            spy4: p.spy4 || '',
                            spy5: p.spy5 || '',
                            spy6: p.spy6 || '',
                            quantity: p.quantity || 1,
                            timing: p.timing || '',
                            dosage: p.dosage || '',
                            addition1: p.addition1 || '',
                            addition2: p.addition2 || '',
                            addition3: p.addition3 || '',
                            procedure: p.procedure || '',
                            presentation: p.presentation || '',
                            droppersToday: p.droppersToday?.toString() || '',
                            medicineQuantity: p.medicineQuantity?.toString() || '',
                            administration: p.administration || '',
                            patientHasMedicine: p.patientHasMedicine || false,
                            bottleSize: p.bottleSize || '',
                            selectedDropper: p.selectedDropper || '',
                            selectedLabel: p.selectedLabel || 'LABELS ORAL (PUN)',
                            includeLabelProduct: p.includeLabelProduct !== undefined ? p.includeLabelProduct : true,
                            includeVrsProduct: p.includeVrsProduct !== undefined ? p.includeVrsProduct : true,
                            vrsQuantity: p.vrsQuantity || 0,
                            optionProductIds: (() => {
                                try { return p.optionProductIds ? (Array.isArray(p.optionProductIds) ? p.optionProductIds : JSON.parse(p.optionProductIds)).map(String) : [] }
                                catch { return [] }
                            })(),
                            activeOptionIndex: p.activeOptionIndex ?? -1
                        }))

                        setPrescriptions(loadedPrescriptions)
                        originalPrescriptionsRef.current = loadedPrescriptions

                        // Check if prescriptions have a treatment plan attached
                        const firstTreatmentId = visit.prescriptions[0]?.treatmentId
                        if (firstTreatmentId) {
                            // Set the selected treatment ID
                            setSelectedTreatmentId(String(firstTreatmentId))
                            // Fetch only the linked treatment by id to avoid large includeDeleted payloads.
                            fetch(`/api/treatments?id=${firstTreatmentId}`)
                                .then(r => (r.ok ? r.json() : null))
                                .then((treatment) => {
                                    if (treatment) {
                                        setSelectedTreatmentPlan(treatment)
                                        setTreatments((prev: any[]) => {
                                            const list = Array.isArray(prev) ? prev : []
                                            if (list.some((t: any) => String(t.id) === String(treatment.id))) return list
                                            return [...list, treatment]
                                        })
                                    }
                                })
                                .catch(() => {})
                            // Store original treatment data for comparison
                            setOriginalTreatmentData(JSON.parse(JSON.stringify(loadedPrescriptions)))
                        }
                    }

                    setLoading(false)
                })
                .catch(err => {
                    showError('Failed to load visit data')
                    setLoading(false)
                })
        }
    }, [isEditMode, visitId, router])

    // Handle copying data from previous visit
    useEffect(() => {
        const { copyFromVisitId } = router.query
        if (copyFromVisitId && !isEditMode) {
            setLoading(true)
            fetch(`/api/visits?id=${copyFromVisitId}`)
                .then(r => r.json())
                .then(async (visit) => {
                    if (!visit) {
                        showError('Previous visit not found')
                        setLoading(false)
                        return
                    }

                    // Generate new OPD number for the copied visit
                    let newOpdNo = ''
                    if (visit.patientId) {
                        try {
                            newOpdNo = await generateOpdNoPreview(String(visit.patientId))
                            setGeneratedOpdNo(newOpdNo)
                        } catch (err) {
                        }
                    }

                    // Pre-fill form with previous visit data (but with new OPD number)
                    setForm((prevForm: any) => ({
                        ...prevForm,
                        patientId: String(visit.patientId),
                        opdNo: newOpdNo, // Use newly generated OPD number
                        temperament: visit.temperament || '',
                        pulseDiagnosis: visit.pulseDiagnosis || '',
                        pulseDiagnosis2: visit.pulseDiagnosis2 || '',
                        majorComplaints: visit.majorComplaints || '',
                        historyReports: visit.historyReports || '',
                        investigations: visit.investigations || '',
                        reports: visit.reports || '',
                        provisionalDiagnosis: visit.provisionalDiagnosis || '',
                        improvements: visit.improvements || '',
                        specialNote: visit.specialNote || ''
                    }))

                    // Pre-fill prescriptions from previous visit
                    if (visit.prescriptions && visit.prescriptions.length > 0) {
                        const copiedPrescriptions = visit.prescriptions.map((p: any) => ({
                            treatmentId: p.treatmentId ? String(p.treatmentId) : '',
                            productId: String(p.productId),
                            spy1: p.spy1 || '',
                            spy2: p.spy2 || '',
                            spy3: p.spy3 || '',
                            spy4: p.spy4 || '',
                            spy5: p.spy5 || '',
                            spy6: p.spy6 || '',
                            quantity: p.quantity || 1,
                            timing: p.timing || '',
                            dosage: p.dosage || '',
                            addition1: p.addition1 || '',
                            addition2: p.addition2 || '',
                            addition3: p.addition3 || '',
                            procedure: p.procedure || '',
                            presentation: p.presentation || '',
                            droppersToday: p.droppersToday?.toString() || '',
                            medicineQuantity: p.medicineQuantity?.toString() || '',
                            administration: p.administration || '',
                            patientHasMedicine: false, // Reset for new visit
                            bottleSize: p.bottleSize || '',
                            selectedDropper: '', // Reset for new visit
                            selectedLabel: 'LABELS ORAL (PUN)', // Default for new visit
                            includeLabelProduct: true // Default for new visit
                        }))

                        setPrescriptions(copiedPrescriptions)

                        // Check if prescriptions have a treatment plan attached
                        const firstTreatmentId = visit.prescriptions[0]?.treatmentId
                        if (firstTreatmentId) {
                            setSelectedTreatmentId(String(firstTreatmentId))
                            fetch(`/api/treatments?id=${firstTreatmentId}`)
                                .then(r => (r.ok ? r.json() : null))
                                .then((treatment) => {
                                    if (treatment) {
                                        setSelectedTreatmentPlan(treatment)
                                        setTreatments((prev: any[]) => {
                                            const list = Array.isArray(prev) ? prev : []
                                            if (list.some((t: any) => String(t.id) === String(treatment.id))) return list
                                            return [...list, treatment]
                                        })
                                    }
                                })
                                .catch(() => {})
                        }
                    }

                    // Show success toast only once after all data is loaded
                    showSuccess('Previous visit data loaded successfully')
                    setLoading(false)
                })
                .catch(err => {
                    showError('Failed to load previous visit data')
                    setLoading(false)
                })
        }
    }, [router.query.copyFromVisitId, isEditMode])

    // Auto-calculate followUpCount based on nextVisitDate
    useEffect(() => {
        if (isUpdatingDateFromCount.current) {
            isUpdatingDateFromCount.current = false
            return
        }

        if (form.nextVisitDate) {
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const nextVisit = new Date(form.nextVisitDate)
            nextVisit.setHours(0, 0, 0, 0)

            const diffTime = nextVisit.getTime() - today.getTime()
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

            if (diffDays >= 0 && form.followUpCount !== diffDays.toString()) {
                isUpdatingCountFromDate.current = true
                setForm((prev: any) => ({ ...prev, followUpCount: diffDays.toString() }))
            }
        }
    }, [form.nextVisitDate])

    // Auto-calculate nextVisitDate based on followUpCount
    useEffect(() => {
        if (isUpdatingCountFromDate.current) {
            isUpdatingCountFromDate.current = false
            return
        }

        if (form.followUpCount && form.followUpCount !== '' && !isNaN(Number(form.followUpCount))) {
            const today = new Date()
            const daysToAdd = parseInt(form.followUpCount, 10)

            if (daysToAdd >= 0) {
                const nextDate = new Date(today)
                nextDate.setDate(today.getDate() + daysToAdd)

                const formattedDate = nextDate.toISOString().split('T')[0]

                if (form.nextVisitDate !== formattedDate) {
                    isUpdatingDateFromCount.current = true
                    setForm((prev: any) => ({ ...prev, nextVisitDate: formattedDate }))
                }
            }
        }
    }, [form.followUpCount])

    useEffect(() => {
        if (isEditMode) return
        if (!Array.isArray(prescriptions) || prescriptions.length === 0) return
        if (!form.followUpCount || isNaN(Number(form.followUpCount))) return

        setPrescriptions((prev) => prev.map((pr) => {
            if (!pr?.dosage) return pr
            const autoQty = calculateAutoQuantityFromPrescription(pr)
            if (!Number.isFinite(autoQty) || autoQty === null || autoQty <= 0) return pr
            return { ...pr, quantity: autoQty }
        }))
    }, [form.followUpCount, isEditMode])

    async function handleAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const files = e.target.files
        if (!files || files.length === 0) return

        // Check total file count
        if (attachments.length + files.length > 10) {
            showError('You can upload a maximum of 10 files')
            return
        }

        setUploadingAttachment(true)
        try {
            const uploadedFiles: Array<{ url: string, name: string, type: string }> = []

            // Get patient name for folder organization
            const selectedPatient = patients.find(p => String(p.id) === String(form.patientId))
            const patientName = selectedPatient ? `${selectedPatient.firstName || ''} ${selectedPatient.lastName || ''}`.trim() || 'Unknown Patient' : 'Unknown Patient'

            for (let i = 0; i < files.length; i++) {
                const file = files[i]

                // Validate file size (max 10MB per file)
                if (file.size > 10 * 1024 * 1024) {
                    showError(`File "${file.name}" is too large. Maximum size is 10MB.`)
                    continue
                }

                // Convert to base64
                const reader = new FileReader()
                const base64 = await new Promise<string>((resolve, reject) => {
                    reader.onloadend = () => resolve(reader.result as string)
                    reader.onerror = reject
                    reader.readAsDataURL(file)
                })

                // Upload to Google Drive with patient name in folder path
                const res = await fetch('/api/upload-to-drive', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        file: base64,
                        fileName: file.name,
                        mimeType: file.type,
                        patientName: patientName
                    })
                })

                const data = await res.json()
                if (res.ok) {
                    uploadedFiles.push({
                        url: data.webViewLink,
                        name: file.name,
                        type: file.type
                    })
                } else {
                    throw new Error(data.error || `Failed to upload ${file.name}`)
                }
            }

            setAttachments([...attachments, ...uploadedFiles])
        } catch (error: any) {
            showError(`Failed to upload attachments: ${error.message || 'Unknown error'}`)
        } finally {
            setUploadingAttachment(false)
            // Reset input
            e.target.value = ''
        }
    }

    function removeAttachment(index: number) {
        setAttachments(attachments.filter((_, i) => i !== index))
    }

    async function handleReportsAttachmentUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const files = e.target.files
        if (!files || files.length === 0) return

        if (!form.patientId) {
            showError('Please select a patient first')
            e.target.value = ''
            return
        }

        if (reportsAttachments.length + files.length > 10) {
            showError('You can upload a maximum of 10 files')
            return
        }

        setUploadingReports(true)
        try {
            const uploadedFiles: Array<{ url: string, name: string, type: string }> = []
            const selectedPatient = patients.find(p => String(p.id) === String(form.patientId))
            const patientName = selectedPatient ? `${selectedPatient.firstName || ''} ${selectedPatient.lastName || ''}`.trim() || 'Unknown Patient' : 'Unknown Patient'

            for (let i = 0; i < files.length; i++) {
                const file = files[i]
                if (file.size > 10 * 1024 * 1024) {
                    showError(`File "${file.name}" is too large. Maximum size is 10MB.`)
                    continue
                }

                const reader = new FileReader()
                const base64 = await new Promise<string>((resolve, reject) => {
                    reader.onloadend = () => resolve(reader.result as string)
                    reader.onerror = reject
                    reader.readAsDataURL(file)
                })

                const res = await fetch('/api/upload-to-drive', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        file: base64,
                        fileName: file.name,
                        mimeType: file.type,
                        patientName: `${patientName}/reports`
                    })
                })

                const data = await res.json()
                if (res.ok) {
                    uploadedFiles.push({
                        url: data.webViewLink,
                        name: file.name,
                        type: file.type
                    })
                } else {
                    throw new Error(data.error || `Failed to upload ${file.name}`)
                }
            }

            setReportsAttachments([...reportsAttachments, ...uploadedFiles])
        } catch (error: any) {
            showError(`Failed to upload attachments: ${error.message || 'Unknown error'}`)
        } finally {
            setUploadingReports(false)
            e.target.value = ''
        }
    }

    // Handle captured image from camera modal
    async function handleCameraCapture(imageData: string) {
        if (!form.patientId) {
            showError('Please select a patient first')
            return
        }

        if (reportsAttachments.length >= 10) {
            showError('You can upload a maximum of 10 files')
            return
        }

        setUploadingReports(true)
        try {
            const selectedPatient = patients.find(p => String(p.id) === String(form.patientId))
            const patientName = selectedPatient ? `${selectedPatient.firstName || ''} ${selectedPatient.lastName || ''}`.trim() || 'Unknown Patient' : 'Unknown Patient'
            const fileName = `document_${Date.now()}.jpg`

            const res = await fetch('/api/upload-to-drive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file: imageData,
                    fileName: fileName,
                    mimeType: 'image/jpeg',
                    patientName: `${patientName}/reports`
                })
            })

            const data = await res.json()
            if (res.ok) {
                setReportsAttachments([...reportsAttachments, {
                    url: data.webViewLink,
                    name: fileName,
                    type: 'image/jpeg'
                }])
            } else {
                throw new Error(data.error || 'Failed to upload captured image')
            }
        } catch (error: any) {
            showError(`Failed to upload image: ${error.message || 'Unknown error'}`)
        } finally {
            setUploadingReports(false)
        }
    }

    function removeReportsAttachment(index: number) {
        setReportsAttachments(reportsAttachments.filter((_, i) => i !== index))
    }

    // Camera functions
    async function startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: cameraFacingMode }
            })
            setCameraStream(stream)
            if (videoRef.current) {
                videoRef.current.srcObject = stream
            }
            setShowCamera(true)
        } catch (error) {
            showError('Unable to access camera. Please check permissions.')
        }
    }

    function stopCamera() {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop())
            setCameraStream(null)
        }
        setShowCamera(false)
    }

    function toggleCameraFacing() {
        const newFacingMode = cameraFacingMode === 'user' ? 'environment' : 'user'
        setCameraFacingMode(newFacingMode)
        if (cameraStream) {
            stopCamera()
            setTimeout(() => startCamera(), 100)
        }
    }

    async function capturePhoto() {
        if (!videoRef.current || !form.patientId) {
            showError('Please select a patient first')
            return
        }

        const canvas = document.createElement('canvas')
        canvas.width = videoRef.current.videoWidth
        canvas.height = videoRef.current.videoHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        ctx.drawImage(videoRef.current, 0, 0)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8)

        setUploadingReports(true)
        try {
            const selectedPatient = patients.find(p => String(p.id) === String(form.patientId))
            const patientName = selectedPatient ? `${selectedPatient.firstName || ''} ${selectedPatient.lastName || ''}`.trim() || 'Unknown Patient' : 'Unknown Patient'
            const fileName = `capture_${Date.now()}.jpg`

            const res = await fetch('/api/upload-to-drive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    file: dataUrl,
                    fileName: fileName,
                    mimeType: 'image/jpeg',
                    patientName: `${patientName}/reports`
                })
            })

            const data = await res.json()
            if (res.ok) {
                setReportsAttachments([...reportsAttachments, {
                    url: data.webViewLink,
                    name: fileName,
                    type: 'image/jpeg'
                }])
                stopCamera()
                showSuccess('Photo captured and uploaded successfully!')
            } else {
                throw new Error(data.error || 'Upload failed')
            }
        } catch (error: any) {
            showError(`Failed to upload photo: ${error.message || 'Unknown error'}`)
        } finally {
            setUploadingReports(false)
        }
    }

    // Helper functions for component and dosage parsing
    function parseComponent(compValue: string): { name: string; volume: string } {
        if (!compValue) return { name: '', volume: '' }
        const parts = compValue.split('|')
        return { name: parts[0] || '', volume: parts[1] || '' }
    }

    function formatComponent(name: string, volume: string): string {
        if (!name && !volume) return ''
        return `${name}|${volume}`
    }

    function parseDosage(dosageValue: string): { quantity: string; timing: string; dilution: string } {
        if (!dosageValue) return { quantity: '', timing: '', dilution: '' }
        const parts = dosageValue.split('|')
        if (parts.length >= 3) {
            return { quantity: parts[0] || '', timing: parts[1] || '', dilution: parts[2] || '' }
        }
        // Try to parse old format (e.g., "10/DRP/TDS/WTR")
        const oldParts = dosageValue.split('/')
        if (oldParts.length >= 3) {
            return {
                quantity: oldParts[0] || '',
                timing: oldParts[2] || '',
                dilution: oldParts[3] || ''
            }
        }
        return { quantity: '', timing: '', dilution: '' }
    }

    function formatDosage(quantity: string, timing: string, dilution: string): string {
        if (!quantity && !timing && !dilution) return ''
        return `${quantity}|${timing}|${dilution}`
    }

    function getDailyFrequencyFromDosageTiming(dosageTiming: string) {
        const key = String(dosageTiming || '').trim().toUpperCase()

        // Explicit frequency mapping in doses/day.
        const map: Record<string, number> = {
            OD: 1,
            BD: 2,
            TDS: 3,
            QID: 4,
            HRLY: 24,
            '1/2 HRLY': 48,
            EOD: 0.5,
            'EVERY 2 MNTS': 720,
            HS: 1,
            SOS: 1,
            STAT: 1,
        }
        if (map[key]) return map[key]

        const everyMinutesMatch = key.match(/^EVERY\s+(\d+(?:\.\d+)?)\s*(MINS?|MINUTES?|MNTS?)$/)
        if (everyMinutesMatch) {
            const mins = Number(everyMinutesMatch[1])
            if (Number.isFinite(mins) && mins > 0) return 1440 / mins
        }

        const everyHoursMatch = key.match(/^EVERY\s+(\d+(?:\.\d+)?)\s*(HRS?|HOURS?)$/)
        if (everyHoursMatch) {
            const hrs = Number(everyHoursMatch[1])
            if (Number.isFinite(hrs) && hrs > 0) return 24 / hrs
        }

        const weeklyMatch = key.match(/^(\d+(?:\.\d+)?)\s*A\s*WEEK$/)
        if (weeklyMatch) {
            const perWeek = Number(weeklyMatch[1])
            if (Number.isFinite(perWeek) && perWeek > 0) return perWeek / 7
        }

        if (key === 'WEEKLY') return 1 / 7
        if (key === 'FORTNIGHTLY') return 1 / 14

        const extractedNumber = parseFloat(key)
        return Number.isFinite(extractedNumber) && extractedNumber > 0 ? extractedNumber : 1
    }

    function calculateAutoQuantityFromPrescription(pr: any): number | null {
        const followUpRaw = parseInt(String(form.followUpCount || '1'), 10)
        const followUpDays = Number.isFinite(followUpRaw) && followUpRaw >= 0 ? followUpRaw : 1
        const parsedDosage = parseDosage(String(pr?.dosage || ''))
        const dose = Math.max(1, parseFloat(String(parsedDosage.quantity || '1')) || 1)
        const frequency = getDailyFrequencyFromDosageTiming(parsedDosage.timing)
        const product = products.find((p) => String(p.id) === String(pr?.productId || ''))

        // Only selected categories should derive quantity from follow-up count.
        if (isTabletOrCapsuleProduct(product)) {
            return Math.ceil(dose * frequency * followUpDays)
        }

        if (isSyrupProduct(product)) {
            // 1 teaspoon = 5 ml
            return Math.ceil(dose * frequency * 5 * followUpDays)
        }

        if (isMlDropsProduct(product)) {
            // 1 ml = 20 drops
            return Math.ceil((dose * frequency * followUpDays) / 20)
        }

        return null
    }

    function createBasePrescriptionRow(treatmentId: string = '') {
        const defaultDropper = products.find(p =>
            p.category?.name?.toUpperCase() === 'MISC' &&
            p.name?.toUpperCase() === 'DROPPER 15 ML 100'
        ) || products.find(p =>
            p.category?.name?.toUpperCase() === 'MISC' &&
            p.name?.toUpperCase().includes('DROPPER') &&
            p.name?.includes('15')
        )

        return {
            treatmentId,
            productId: '',
            spy1: '', spy2: '', spy3: '', spy4: '', spy5: '', spy6: '',
            quantity: prescriptionDefaults.quantity ?? 15,
            timing: prescriptionDefaults.timing ?? 'AM',
            dosage: `${prescriptionDefaults.doseQuantity ?? '10'}|${prescriptionDefaults.doseTiming ?? 'TDS'}|${prescriptionDefaults.dilution ?? 'WATER'}`,
            addition1: '', addition2: '', addition3: '',
            procedure: prescriptionDefaults.procedure ?? 'ORAL',
            presentation: prescriptionDefaults.presentation ?? 'DRP',
            droppersToday: '', medicineQuantity: '',
            administration: '', patientHasMedicine: false,
            bottleSize: prescriptionDefaults.bottleSize ?? '15', discussions: '',
            selectedDropper: defaultDropper ? String(defaultDropper.id) : '',
            selectedLabel: 'LABELS ORAL (PUN)',
            includeLabelProduct: true,
            includeVrsProduct: true,
            vrsQuantity: 0,
        }
    }

    function addSelectedProductToPrescription() {
        if (!selectedProductId) return showError('Select a medicine first')
        const prod = products.find(p => String(p.id) === String(selectedProductId))
        if (!prod) return showError('Selected product not found')

        // Clear treatment plan tracking when adding individual medicine
        setSelectedTreatmentId(null)
        setSelectedTreatmentPlan(null)
        setOriginalTreatmentData([])

        // Find default dropper "DROPPER 15 ML 100"
        const defaultDropper = products.find(p => 
            p.category?.name?.toUpperCase() === 'MISC' && 
            p.name?.toUpperCase() === 'DROPPER 15 ML 100'
        ) || products.find(p => 
            p.category?.name?.toUpperCase() === 'MISC' && 
            p.name?.toUpperCase().includes('DROPPER') &&
            p.name?.includes('15')
        )

        setPrescriptions([...prescriptions, {
            treatmentId: '', productId: String(prod.id),
            spy1: '', spy2: '', spy3: '', spy4: '', spy5: '', spy6: '',
            quantity: prescriptionDefaults.quantity ?? 15, timing: prescriptionDefaults.timing ?? 'AM', dosage: `${prescriptionDefaults.doseQuantity ?? '10'}|${prescriptionDefaults.doseTiming ?? 'TDS'}|${prescriptionDefaults.dilution ?? 'WATER'}`,
            addition1: '', addition2: '', addition3: '',
            procedure: prescriptionDefaults.procedure ?? 'ORAL', presentation: prescriptionDefaults.presentation ?? 'DRP',
            droppersToday: '', medicineQuantity: '',
            administration: '', patientHasMedicine: false,
            bottleSize: prescriptionDefaults.bottleSize ?? '15',
            selectedDropper: defaultDropper ? String(defaultDropper.id) : '', selectedLabel: 'LABELS ORAL (PUN)', includeLabelProduct: true
        }])
    }

    function addToSelectedMedicines() {
        if (!selectedProductId) return showError('Select a medicine first')

        // Check if already in the list
        if (selectedMedicines.includes(selectedProductId)) {
            return showInfo('This medicine is already in your selection')
        }

        setSelectedMedicines([...selectedMedicines, selectedProductId])
        setSelectedProductId('') // Clear the dropdown
    }

    function removeFromSelectedMedicines(productId: string) {
        setSelectedMedicines(selectedMedicines.filter(id => id !== productId))
    }

    function removeAllSelectedMedicines() {
        setSelectedMedicines([])
    }

    function addAllSelectedMedicinesToPrescription() {
        if (selectedMedicines.length === 0) return showError('No medicines selected')

        // Find default 15ml dropper
        const defaultDropper = products.find(p => 
            p.category?.name?.toUpperCase() === 'MISC' && 
            p.name?.toUpperCase().includes('DROPPER') &&
            p.name?.toLowerCase().includes('15ml')
        )

        const newPrescriptions = selectedMedicines.map(productId => {
            const product = products.find(p => String(p.id) === String(productId))
            const unitParts = product?.unit ? String(product.unit).trim().split(/\s+/) : []
            const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
            const flowInventory = (Number(product?.totalPurchased) || 0) - (Number(product?.totalSales) || 0)
            const actualInventory = unitQuantity > 0 ? Math.floor(flowInventory / unitQuantity) : 0
            const calculatedQty = 1.0 * actualInventory
            const defaultQty = 10
            
            return {
                treatmentId: selectedTreatmentId || '', // Use selected treatment plan if any
                productId: productId,
                spy1: '', spy2: '', spy3: '', spy4: '', spy5: '', spy6: '',
                quantity: prescriptionDefaults.quantity ?? 15, timing: prescriptionDefaults.timing ?? 'AM', dosage: `${prescriptionDefaults.doseQuantity ?? '10'}|${prescriptionDefaults.doseTiming ?? 'TDS'}|${prescriptionDefaults.dilution ?? 'WATER'}`,
                addition1: '', addition2: '', addition3: '',
                procedure: prescriptionDefaults.procedure ?? 'ORAL', presentation: prescriptionDefaults.presentation ?? 'DRP',
                droppersToday: '', medicineQuantity: '',
                administration: '', patientHasMedicine: false,
                bottleSize: prescriptionDefaults.bottleSize ?? '15',
                selectedDropper: defaultDropper ? String(defaultDropper.id) : '', selectedLabel: 'LABELS ORAL (PUN)', includeLabelProduct: true,
                includeVrsProduct: true, vrsQuantity: 0
            }
        })

        setPrescriptions([...prescriptions, ...newPrescriptions])
        setSelectedMedicines([]) // Clear the selected medicines
        showSuccess('Medicines added to prescription successfully')
    }

    function handleRestoreDraft() {
        if (draftData) {
            setForm(draftData.form)
            setPrescriptions(draftData.prescriptions)
            showSuccess('Draft restored successfully!')
        }
        setShowRestoreDraftModal(false)
    }

    function handleDiscardDraft() {
        localStorage.removeItem('prescriptionDraft')
        setHasDraft(false)
        setShowRestoreDraftModal(false)
    }

    // Restore prescriptions from backup
    function restoreFromBackup() {
        try {
            const backupStr = localStorage.getItem('prescriptionBackup')
            if (backupStr) {
                const backup = JSON.parse(backupStr)
                if (backup.prescriptions && Array.isArray(backup.prescriptions) && backup.prescriptions.length > 0) {
                    setPrescriptions(backup.prescriptions)
                    showSuccess(`Restored ${backup.prescriptions.length} medicines from backup (${new Date(backup.timestamp).toLocaleString()})`)
                    return true
                }
            }
            showError('No backup found')
            return false
        } catch (err) {
            showError('Failed to restore from backup')
            return false
        }
    }

    // Helpers to format dates for inputs
    function formatDateForInput(dateStr?: string | null) {
        if (!dateStr) return ''
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return ''
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        return `${yyyy}-${mm}-${dd}`
    }

    function formatDateTimeLocal(dateStr?: string | null) {
        if (!dateStr) return ''
        const d = new Date(dateStr)
        if (isNaN(d.getTime())) return ''
        const yyyy = d.getFullYear()
        const mm = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        const hh = String(d.getHours()).padStart(2, '0')
        const min = String(d.getMinutes()).padStart(2, '0')
        return `${yyyy}-${mm}-${dd}T${hh}:${min}`
    }

    // When a patient is selected, populate the patient-related fields from the loaded patient record
    function handlePatientChange(e: any) {
        const id = e.target.value
        setForm((prev: any) => ({ ...prev, patientId: id }))
        const found = patients.find(p => String(p.id) === String(id))
        if (!found) return

        // Split nextVisit into date and time
        let nextVisitDate = ''
        let nextVisitTime = ''
        if (found.nextVisit) {
            const dt = new Date(found.nextVisit).toISOString()
            nextVisitDate = dt.slice(0, 10)
            nextVisitTime = dt.slice(11, 16)
        }

        // Fetch the most recent visit for this patient to get opdNo
        fetch(`/api/visits?patientId=${id}`)
            .then(r => r.json())
            .then(async (patientVisits: any[]) => {
                const latestVisit = patientVisits.length > 0 ? patientVisits[0] : null

                // Always generate new OPD number for new visits
                const previewOpdNo = await generateOpdNoPreview(id)
                setGeneratedOpdNo(previewOpdNo)

                setForm((prev: any) => ({
                    ...prev,
                    patientId: String(found.id),
                    opdNo: previewOpdNo,
                    dob: formatDateForInput(found.dob),
                    age: found.age ?? '',
                    address: found.address || '',
                    gender: found.gender || '',
                    phone: found.phone || '',
                    nextVisitDate,
                    nextVisitTime,
                    occupation: found.occupation || '',
                    pendingPaymentCents: found.pendingPaymentCents ?? '',
                    height: found.height ?? '',
                    weight: found.weight ?? '',
                    // Load clinical information from patient record
                    temperament: found.temperament || '',
                    pulseDiagnosis: found.pulseDiagnosis || '',
                    pulseDiagnosis2: found.pulseDiagnosis2 || '',
                    majorComplaints: found.majorComplaints || '',
                    historyReports: found.historyReports || '',
                    investigations: found.investigations || '',
                    provisionalDiagnosis: found.provisionalDiagnosis || '',
                    improvements: found.improvements || ''
                }))
            })
            .catch(() => {
                // If fetch fails, just set patient data without opdNo
                setForm((prev: any) => ({
                    ...prev,
                    patientId: String(found.id),
                    opdNo: '',
                    dob: formatDateForInput(found.dob),
                    age: found.age ?? '',
                    address: found.address || '',
                    gender: found.gender || '',
                    phone: found.phone || '',
                    nextVisitDate,
                    nextVisitTime,
                    occupation: found.occupation || '',
                    pendingPaymentCents: found.pendingPaymentCents ?? '',
                    height: found.height ?? '',
                    weight: found.weight ?? '',
                    // Load clinical information from patient record
                    temperament: found.temperament || '',
                    pulseDiagnosis: found.pulseDiagnosis || '',
                    pulseDiagnosis2: found.pulseDiagnosis2 || '',
                    majorComplaints: found.majorComplaints || '',
                    historyReports: found.historyReports || '',
                    investigations: found.investigations || '',
                    provisionalDiagnosis: found.provisionalDiagnosis || '',
                    improvements: found.improvements || ''
                }))
            })
    }

    function addEmptyPrescription() {
        // Clear treatment plan tracking when adding empty row
        setSelectedTreatmentId(null)
        setSelectedTreatmentPlan(null)
        setOriginalTreatmentData([])
        setPrescriptions([...prescriptions, createBasePrescriptionRow('')])
    }

    function addEmptyPrescriptionForTreatment(planId: string) {
        setPrescriptions((prev) => [...prev, createBasePrescriptionRow(String(planId || ''))])
        const plan = treatments.find((t: any) => String(t.id) === String(planId))
        showSuccess(`Added empty row for ${plan?.planNumber ? `Plan ${plan.planNumber}` : 'selected treatment'}`)
    }

    // Debounce timer ref
    const updateTimerRef = useRef<NodeJS.Timeout | null>(null)

    /** Navigate through product options for a prescription row with card-flip animation */
    function navigatePrOption(i: number, dir: 'left'|'right') {
        const pr = prescriptions[i]
        const opts: string[] = pr.optionProductIds || []
        if (opts.length === 0) return
        if (prFlipPhase[i] === 'out' || prFlipPhase[i] === 'in') return
        setPrFlipDir(p => ({...p, [i]: dir}))
        setPrFlipPhase(p => ({...p, [i]: 'out'}))
        setTimeout(() => {
            const cur = pr.activeOptionIndex ?? -1
            let next: number
            if (dir === 'right') {
                next = cur >= opts.length - 1 ? -1 : cur + 1
            } else {
                next = cur <= -1 ? opts.length - 1 : cur - 1
            }
            const copy = [...prescriptions]
            copy[i] = {...copy[i], activeOptionIndex: next}
            setPrescriptions(copy)
            setPrFlipPhase(p => ({...p, [i]: 'in'}))
            setTimeout(() => setPrFlipPhase(p => ({...p, [i]: 'idle'})), 240)
        }, 190)
    }
    
    function updatePrescription(i: number, patch: any) {
        const copy = [...prescriptions]

        // If treatmentId is being updated, auto-fill all related fields
        if (patch.treatmentId !== undefined) {
            const treatment = treatments.find(t => String(t.id) === String(patch.treatmentId))
            if (treatment && treatment.treatmentProducts && treatment.treatmentProducts.length > 0) {
                // Get the first product from the treatment (or you could create multiple prescriptions)
                const firstProduct = treatment.treatmentProducts[0]

                // Auto-fill all fields from treatment and its first product
                copy[i] = {
                    ...copy[i],
                    treatmentId: patch.treatmentId,
                    productId: String(firstProduct.productId),
                    spy1: firstProduct.spy1 || '',
                    spy2: firstProduct.spy2 || '',
                    spy3: firstProduct.spy3 || '',
                    spy4: firstProduct.spy4 || '',
                    spy5: firstProduct.spy5 || '',
                    spy6: firstProduct.spy6 || '',
                    quantity: firstProduct.quantity || treatment.quantity || 1,
                    timing: firstProduct.timing || '',
                    dosage: firstProduct.dosage || treatment.dosage || '',
                    additions: firstProduct.additions || '',
                    addition1: firstProduct.addition1 || '',
                    addition2: firstProduct.addition2 || '',
                    addition3: firstProduct.addition3 || '',
                    procedure: firstProduct.procedure || treatment.procedure || '',
                    presentation: firstProduct.presentation || '',
                    droppersToday: firstProduct.droppersToday?.toString() || '',
                    medicineQuantity: firstProduct.medicineQuantity?.toString() || '',
                    administration: treatment.administration || ''
                }
                setPrescriptions(copy)
                return
            }
        }

        copy[i] = { ...copy[i], ...patch }

        // Auto-calculate quantity from dose/frequency/follow-up only for supported categories unless user edits quantity directly.
        if (patch.quantity === undefined && (patch.dosage !== undefined || patch.timing !== undefined || patch.productId !== undefined)) {
            const autoQty = calculateAutoQuantityFromPrescription(copy[i])
            if (Number.isFinite(autoQty) && autoQty !== null && autoQty > 0) {
                copy[i].quantity = autoQty
            }
        }
        
        // Calculate VRS quantity if dropper changed and product is dilution category
        if (patch.selectedDropper !== undefined) {
            const product = products.find(p => String(p.id) === String(copy[i].productId))
            const categoryName = product ? (typeof product.category === 'string' ? product.category : product.category?.name || '').toLowerCase() : ''
            
            if (categoryName === 'dilutions') {
                const dropperProduct = products.find(p => String(p.id) === String(patch.selectedDropper))
                if (dropperProduct) {
                    // Extract dropper size from product name (e.g., "DROPPER 1 ML" -> 1)
                    const dropperName = dropperProduct.name.toUpperCase()
                    let vrsQty = 0
                    
                    if (dropperName.includes('1 ML') || dropperName.includes('1ML')) {
                        vrsQty = 0.025
                    } else if (dropperName.includes('5 ML') || dropperName.includes('5ML')) {
                        vrsQty = 0.125
                    } else if (dropperName.includes('15 ML') || dropperName.includes('15ML')) {
                        vrsQty = 0.375
                    } else if (dropperName.includes('30 ML') || dropperName.includes('30ML')) {
                        vrsQty = 0.750
                    } else if (dropperName.includes('60 ML') || dropperName.includes('60ML')) {
                        vrsQty = 1.500
                    }
                    
                    copy[i].vrsQuantity = vrsQty
                }
            }
        }
        
        // Clear any pending update
        if (updateTimerRef.current) {
            clearTimeout(updateTimerRef.current)
        }
        
        // Update immediately for responsive UI
        setPrescriptions(copy)
        
        // Validate stock if quantity is being updated
        if (patch.quantity !== undefined) {
            validateStock(i, copy[i])
        } else if (patch.dosage !== undefined || patch.timing !== undefined || patch.productId !== undefined) {
            validateStock(i, copy[i])
        }
    }

    function handleDiagnosisTagsChange(tags: string[]) {
        const seen = new Set<string>()
        const normalized = tags
            .map((t) => String(t || '').trim())
            .filter(Boolean)
            .map((t) => diagnosisCanonicalMap.get(t.toLowerCase()) || t)
            .filter((t) => {
                const key = t.toLowerCase()
                if (seen.has(key)) return false
                seen.add(key)
                return true
            })
        setSelectedDiagnosisTags(normalized)
        setSkippedPlanCompareDiagnoses((prev) => prev.filter((diagnosis) => normalized.includes(diagnosis)))
        setProvisionalDiagnosisInput('')
        setForm((prev: any) => ({ ...prev, provisionalDiagnosis: normalized.join(', ') }))

        // Keep selected plans only for active diagnosis tags.
        setSelectedPlansByDiagnosis((prev) => {
            const next: Record<string, string[]> = {}
            normalized.forEach((d) => {
                if (Array.isArray(prev[d]) && prev[d].length > 0) next[d] = prev[d]
            })
            return next
        })
    }

    function addDiagnosisTag(rawDiagnosis: string) {
        const diagnosisRaw = String(rawDiagnosis || '').trim()
        const diagnosis = diagnosisCanonicalMap.get(diagnosisRaw.toLowerCase()) || diagnosisRaw
        if (!diagnosis) return
        const exists = selectedDiagnosisTags.some((tag) => tag.toLowerCase() === diagnosis.toLowerCase())
        if (exists) {
            setProvisionalDiagnosisInput('')
            return
        }
        handleDiagnosisTagsChange([...selectedDiagnosisTags, diagnosis])
    }

    function removeDiagnosisTag(diagnosisToRemove: string) {
        handleDiagnosisTagsChange(selectedDiagnosisTags.filter((tag) => tag.toLowerCase() !== String(diagnosisToRemove || '').toLowerCase()))
    }

    function handleInvestigationTagsChange(tags: string[]) {
        const seen = new Set<string>()
        const normalized = tags
            .map((t) => String(t || '').trim())
            .filter(Boolean)
            .filter((t) => {
                const key = t.toLowerCase()
                if (seen.has(key)) return false
                seen.add(key)
                return true
            })
        setSelectedInvestigationTags(normalized)
        setInvestigationInput('')
        setForm((prev: any) => ({ ...prev, investigations: normalized.join(', ') }))
    }

    function addInvestigationTag(rawInvestigation: string) {
        const investigation = String(rawInvestigation || '').trim()
        if (!investigation) return
        const exists = selectedInvestigationTags.some((tag) => tag.toLowerCase() === investigation.toLowerCase())
        if (exists) {
            setInvestigationInput('')
            return
        }
        handleInvestigationTagsChange([...selectedInvestigationTags, investigation])
    }

    function removeInvestigationTag(investigationToRemove: string) {
        handleInvestigationTagsChange(selectedInvestigationTags.filter((tag) => tag.toLowerCase() !== String(investigationToRemove || '').toLowerCase()))
    }

    function togglePlanSelection(diagnosis: string, treatmentId: string, checked: boolean) {
        if (checked) {
            setSkippedPlanCompareDiagnoses((prev) => prev.filter((item) => item !== diagnosis))
        }
        setSelectedPlansByDiagnosis((prev) => {
            const current = Array.isArray(prev[diagnosis]) ? prev[diagnosis] : []
            const nextSet = new Set(current)
            if (checked) nextSet.add(treatmentId)
            else nextSet.delete(treatmentId)
            return {
                ...prev,
                [diagnosis]: Array.from(nextSet),
            }
        })
    }

    const selectedTreatmentIds = useMemo(() => {
        const all = Object.values(selectedPlansByDiagnosis).flat()
        return Array.from(new Set(all.map((id) => String(id))))
    }, [selectedPlansByDiagnosis])

    const selectedTreatmentSelectionKey = useMemo(() => {
        return [...selectedTreatmentIds].sort().join('|')
    }, [selectedTreatmentIds])

    const selectedTreatmentsForMerge = useMemo(() => {
        return (Array.isArray(treatments) ? treatments : []).filter((t: any) => selectedTreatmentIds.includes(String(t.id)))
    }, [treatments, selectedTreatmentIds])

    const productsById = useMemo(() => {
        const map = new Map<string, any>()
        ;(Array.isArray(products) ? products : []).forEach((product: any) => {
            map.set(String(product.id), product)
        })
        return map
    }, [products])

    const activePlanCompareDiagnosis = useMemo(() => {
        if (planCompareQueue.length === 0) return selectedProvDiagnosis
        const safeIndex = Math.max(0, Math.min(planCompareStepIndex, planCompareQueue.length - 1))
        return planCompareQueue[safeIndex] || selectedProvDiagnosis
    }, [planCompareQueue, planCompareStepIndex, selectedProvDiagnosis])

    const resolvedPlanCompareCount = useMemo(() => {
        if (planCompareQueue.length === 0) return 0
        return planCompareQueue.filter((diagnosis) => (selectedPlansByDiagnosis[diagnosis] || []).length > 0).length
    }, [planCompareQueue, selectedPlansByDiagnosis])

    const activeDiagnosisTreatments = useMemo(() => {
        const diagnosisKey = String(activePlanCompareDiagnosis || '').toLowerCase()
        if (!diagnosisKey) return []
        return (Array.isArray(treatments) ? treatments : []).filter((t: any) =>
            !t.deleted && String(t.provDiagnosis || '').toLowerCase() === diagnosisKey
        )
    }, [treatments, activePlanCompareDiagnosis])

    const duplicateProductsForSelectedPlans = useMemo(() => {
        if (selectedTreatmentsForMerge.length === 0) return []
        return getDuplicateProductsAcrossTreatments(selectedTreatmentsForMerge)
    }, [selectedTreatmentsForMerge, products])

    const previewMedicinesFromSelectedPlans = useMemo(() => {
        if (selectedTreatmentsForMerge.length === 0) return []

        const items = new Map<string, any>()
        selectedTreatmentsForMerge.forEach((plan: any) => {
            const planProducts = Array.isArray(plan?.treatmentProducts) ? plan.treatmentProducts : []
            planProducts.forEach((tp: any) => {
                const pid = String(tp?.productId || '')
                if (!pid) return
                const product = products.find((p: any) => String(p.id) === pid)
                if (!product) return
                if (!items.has(pid)) {
                    const status = getStockStatus(product)
                    items.set(pid, {
                        productId: pid,
                        name: String(product?.name || '').trim(),
                        flowInventory: status.flowInventory,
                        isCritical: status.isCritical,
                        isLow: status.isLow,
                        isGreen: status.isGreen,
                    })
                }
            })
        })

        return Array.from(items.values())
            .filter((item) => item.name)
            .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    }, [selectedTreatmentsForMerge, products])

    // Default workflow: selecting plans in tab 4 auto-generates prescriptions.
    useEffect(() => {
        if (currentStep !== 4) return
        if (showPlanCompareModal || showMergePlansModal || processingMergeModal) return

        if (!selectedTreatmentSelectionKey) {
            if (appliedPlanSelectionKey) setAppliedPlanSelectionKey('')
            if (pausedPlanSelectionKey) setPausedPlanSelectionKey('')
            return
        }

        if (selectedTreatmentSelectionKey === appliedPlanSelectionKey) return
        if (selectedTreatmentSelectionKey === pausedPlanSelectionKey) return

        generatePrescriptionsFromSelectedPlans()
    }, [
        currentStep,
        showPlanCompareModal,
        showMergePlansModal,
        processingMergeModal,
        selectedTreatmentSelectionKey,
        appliedPlanSelectionKey,
        pausedPlanSelectionKey,
    ])

    const groupedPrescriptionSections = useMemo(() => {
        const groups = new Map<string, Array<{ pr: any; index: number }>>()
        prescriptions.forEach((pr: any, index: number) => {
            const treatment = pr.treatmentId ? treatments.find((t: any) => String(t.id) === String(pr.treatmentId)) : null
            const diagnosis = String(treatment?.provDiagnosis || 'MANUAL / NO DIAGNOSIS').trim()
            if (!groups.has(diagnosis)) groups.set(diagnosis, [])
            groups.get(diagnosis)!.push({ pr, index })
        })
        return Array.from(groups.entries()).map(([diagnosis, items]) => ({ diagnosis, items }))
    }, [prescriptions, treatments])

    const filteredGroupedPrescriptionSections = useMemo(() => {
        const query = tab5SearchQuery.trim().toLowerCase()
        const shouldFilterByQuery = query.length > 0

        return groupedPrescriptionSections
            .map((section) => {
                const filteredItems = section.items.filter(({ pr, index }) => {
                    if (tab5ShowSelectedOnly && !selectedPrescriptions.has(index)) return false
                    if (tab5ShowIssuesOnly && !quantityErrors[index]) return false

                    if (!shouldFilterByQuery) return true

                    const optionProductIds: string[] = pr.optionProductIds || []
                    const activeIndex = pr.activeOptionIndex ?? -1
                    const displayProductId = activeIndex === -1
                        ? String(pr.productId || '')
                        : String(optionProductIds[activeIndex] || pr.productId || '')
                    const product = products.find((p) => String(p.id) === displayProductId)

                    const searchableText = [
                        section.diagnosis,
                        product?.name || '',
                        pr.timing || '',
                        pr.dosage || '',
                        pr.procedure || '',
                        pr.presentation || '',
                        pr.administration || '',
                    ].join(' ').toLowerCase()

                    return searchableText.includes(query)
                })

                return { ...section, items: filteredItems }
            })
            .filter((section) => section.items.length > 0)
    }, [groupedPrescriptionSections, tab5SearchQuery, tab5ShowSelectedOnly, tab5ShowIssuesOnly, selectedPrescriptions, quantityErrors, products])

    const visibleGroupedPrescriptionSections = useMemo(() => {
        let sections = filteredGroupedPrescriptionSections.map((section) => ({
            ...section,
            items: [...section.items],
        }))

        if (tab5PinSelectedToTop) {
            sections = sections
                .map((section) => ({
                    ...section,
                    items: section.items.sort((a, b) => Number(selectedPrescriptions.has(b.index)) - Number(selectedPrescriptions.has(a.index))),
                }))
                .sort((a, b) => {
                    const aHasSelected = a.items.some((item) => selectedPrescriptions.has(item.index))
                    const bHasSelected = b.items.some((item) => selectedPrescriptions.has(item.index))
                    return Number(bHasSelected) - Number(aHasSelected)
                })
        }

        if (tab5FocusMode && tab5FocusedIndex !== null) {
            sections = sections
                .map((section) => ({
                    ...section,
                    items: section.items.filter((item) => item.index === tab5FocusedIndex),
                }))
                .filter((section) => section.items.length > 0)
        }

        return sections
    }, [filteredGroupedPrescriptionSections, tab5PinSelectedToTop, tab5FocusMode, tab5FocusedIndex, selectedPrescriptions])

    const visiblePrescriptionCount = useMemo(() => {
        return visibleGroupedPrescriptionSections.reduce((total, section) => total + section.items.length, 0)
    }, [visibleGroupedPrescriptionSections])

    const visiblePrescriptionIndices = useMemo(() => {
        return visibleGroupedPrescriptionSections.flatMap((section) => section.items.map(({ index }) => index))
    }, [visibleGroupedPrescriptionSections])

    const hiddenPrescriptionCount = Math.max(0, prescriptions.length - visiblePrescriptionCount)

    const visibleIssueCount = useMemo(() => {
        return visibleGroupedPrescriptionSections.reduce((total, section) => {
            return total + section.items.filter(({ index }) => Boolean(quantityErrors[index])).length
        }, 0)
    }, [visibleGroupedPrescriptionSections, quantityErrors])

    const hasTab5Filters = tab5ShowSelectedOnly || tab5ShowIssuesOnly || tab5SearchQuery.trim().length > 0

    function clearTab5Filters() {
        setTab5SearchQuery('')
        setTab5ShowSelectedOnly(false)
        setTab5ShowIssuesOnly(false)
    }

    function toggleTab5FocusMode() {
        setTab5FocusMode((prev) => !prev)
    }

    function focusPrescriptionRow(index: number) {
        setTab5FocusMode(true)
        setTab5FocusedIndex(index)
    }

    function moveTab5Focus(direction: 'next' | 'prev') {
        const list = visiblePrescriptionIndices
        if (list.length === 0) return

        if (tab5FocusedIndex === null || !list.includes(tab5FocusedIndex)) {
            setTab5FocusedIndex(list[0])
            return
        }

        const currentPos = list.indexOf(tab5FocusedIndex)
        if (currentPos === -1) {
            setTab5FocusedIndex(list[0])
            return
        }

        const step = direction === 'next' ? 1 : -1
        const nextPos = (currentPos + step + list.length) % list.length
        setTab5FocusedIndex(list[nextPos])
    }

    function selectVisiblePrescriptions() {
        setSelectedPrescriptions(new Set(visiblePrescriptionIndices))
    }

    function selectVisibleIssuePrescriptions() {
        const issueIndices = visiblePrescriptionIndices.filter((index) => Boolean(quantityErrors[index]))
        setSelectedPrescriptions(new Set(issueIndices))
        if (issueIndices.length === 0) showInfo('No stock issue rows in visible results')
    }

    function clearPrescriptionSelection() {
        setSelectedPrescriptions(new Set())
    }

    function setAdvancedSectionsCollapsedForVisible(collapsed: boolean) {
        setCollapsedSections((prev) => {
            const next = { ...prev }
            visiblePrescriptionIndices.forEach((index) => {
                next[index] = {
                    spy46: collapsed,
                    additions: collapsed,
                }
            })
            return next
        })
    }

    useEffect(() => {
        if (!tab5FocusMode) {
            setTab5FocusedIndex(null)
            return
        }
        if (visiblePrescriptionIndices.length === 0) {
            setTab5FocusedIndex(null)
            return
        }
        if (tab5FocusedIndex === null || !visiblePrescriptionIndices.includes(tab5FocusedIndex)) {
            setTab5FocusedIndex(visiblePrescriptionIndices[0])
        }
    }, [tab5FocusMode, visiblePrescriptionIndices, tab5FocusedIndex])

    useEffect(() => {
        if (currentStep !== 5) return

        const onKeyDown = (event: KeyboardEvent) => {
            const active = document.activeElement as HTMLElement | null
            const tag = active?.tagName?.toLowerCase()
            const isTyping = Boolean(
                active?.isContentEditable ||
                tag === 'input' ||
                tag === 'textarea' ||
                tag === 'select'
            )

            if (event.key === '/' && !isTyping) {
                event.preventDefault()
                tab5SearchInputRef.current?.focus()
                return
            }

            if (isTyping && !(event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp'))) return

            if (!event.altKey) return

            const key = event.key.toLowerCase()
            if (key === 's') {
                event.preventDefault()
                selectVisiblePrescriptions()
            } else if (key === 'i') {
                event.preventDefault()
                selectVisibleIssuePrescriptions()
            } else if (key === 'c') {
                event.preventDefault()
                clearTab5Filters()
            } else if (key === 'x') {
                event.preventDefault()
                setAdvancedSectionsCollapsedForVisible(true)
            } else if (key === 'e') {
                event.preventDefault()
                setAdvancedSectionsCollapsedForVisible(false)
            } else if (key === 'p') {
                event.preventDefault()
                setTab5PinSelectedToTop((prev) => !prev)
            } else if (key === 'f') {
                event.preventDefault()
                toggleTab5FocusMode()
            } else if (key === 'enter') {
                event.preventDefault()
                applyBulkDosageAdministrationToSelected()
            } else if (event.key === 'ArrowDown') {
                event.preventDefault()
                moveTab5Focus('next')
            } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                moveTab5Focus('prev')
            }
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [
        currentStep,
        visiblePrescriptionIndices,
        tab5FocusedIndex,
        selectVisiblePrescriptions,
        selectVisibleIssuePrescriptions,
        clearTab5Filters,
        setAdvancedSectionsCollapsedForVisible,
        toggleTab5FocusMode,
        applyBulkDosageAdministrationToSelected,
        moveTab5Focus,
    ])

    function getRowsForTreatmentPlan(planId: string, rows: any[] = prescriptions) {
        return rows.filter((row: any) => String(row.treatmentId || '') === String(planId))
    }

    function normalizeRowsForPlanComparison(rows: any[]) {
        const fields = [
            'productId', 'spy1', 'spy2', 'spy3', 'spy4', 'spy5', 'spy6',
            'quantity', 'timing', 'dosage', 'additions', 'addition1', 'addition2', 'addition3',
            'procedure', 'presentation', 'droppersToday', 'medicineQuantity', 'administration',
            'patientHasMedicine', 'bottleSize', 'selectedDropper', 'selectedLabel', 'includeLabelProduct',
            'includeVrsProduct', 'vrsQuantity'
        ]
        return rows
            .map((row: any) => {
                const reduced: Record<string, string> = {}
                fields.forEach((field) => {
                    reduced[field] = String(row?.[field] ?? '')
                })
                return reduced
            })
            .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    }

    function getTrackedTreatmentPlanIds() {
        const ids = new Set<string>()
        if (selectedTreatmentId) ids.add(String(selectedTreatmentId))

        originalTreatmentData.forEach((row: any) => {
            if (row?.treatmentId) ids.add(String(row.treatmentId))
        })

        if (ids.size === 0 && selectedTreatmentIds.length > 0) {
            selectedTreatmentIds.forEach((id) => ids.add(String(id)))
        }
        return Array.from(ids)
    }

    function getModifiedTreatmentIds() {
        const trackedIds = getTrackedTreatmentPlanIds()
        if (trackedIds.length === 0 || originalTreatmentData.length === 0) return []

        return trackedIds.filter((planId) => {
            const currentRows = getRowsForTreatmentPlan(planId, prescriptions)
            const originalRows = getRowsForTreatmentPlan(planId, originalTreatmentData)
            if (originalRows.length === 0) return false
            if (currentRows.length !== originalRows.length) return true

            const currentNorm = normalizeRowsForPlanComparison(currentRows)
            const originalNorm = normalizeRowsForPlanComparison(originalRows)
            return JSON.stringify(currentNorm) !== JSON.stringify(originalNorm)
        })
    }

    function getDuplicateProductsAcrossTreatments(selected: any[]) {
        const productMap = new Map<string, { productName: string; planIds: Set<string>; planLabels: Set<string>; occurrences: number }>()

        selected.forEach((plan: any, idx: number) => {
            const planId = String(plan?.id || '')
            const planLabel = plan?.planNumber ? `Plan ${plan.planNumber}` : `Plan ${idx + 1}`
            const productsInPlan = Array.isArray(plan?.treatmentProducts) ? plan.treatmentProducts : []

            productsInPlan.forEach((tp: any) => {
                const pid = String(tp?.productId || '')
                if (!pid) return
                const product = products.find((p: any) => String(p.id) === pid)
                const existing = productMap.get(pid)
                if (!existing) {
                    productMap.set(pid, {
                        productName: product?.name || `Product #${pid}`,
                        planIds: new Set([planId]),
                        planLabels: new Set([planLabel]),
                        occurrences: 1,
                    })
                } else {
                    existing.planIds.add(planId)
                    existing.planLabels.add(planLabel)
                    existing.occurrences += 1
                }
            })
        })

        return Array.from(productMap.entries())
            .filter(([, value]) => value.planIds.size > 1)
            .map(([productId, value]) => ({
                productId,
                productName: value.productName,
                planIds: Array.from(value.planIds),
                planLabels: Array.from(value.planLabels),
                occurrences: value.occurrences,
            }))
    }

    async function createPrescriptionsFromSelectedPlans(selected: any[], mergeSelection?: Record<string, boolean>) {
        const deduped = new Map<string, any>()

        selected.forEach((t: any) => {
            const productsInPlan = Array.isArray(t.treatmentProducts) ? t.treatmentProducts : []
            productsInPlan.forEach((tp: any, tpIdx: number) => {
                const pid = String(tp.productId || '')
                if (!pid) return

                const shouldMergeByProduct = mergeSelection ? mergeSelection[pid] !== false : true
                const mapKey = shouldMergeByProduct ? pid : `${String(t.id)}:${pid}:${tpIdx}`
                if (deduped.has(mapKey)) return

                deduped.set(mapKey, {
                    treatmentId: String(t.id),
                    productId: pid,
                    spy1: tp.spy1 || '', spy2: tp.spy2 || '', spy3: tp.spy3 || '', spy4: tp.spy4 || '', spy5: tp.spy5 || '', spy6: tp.spy6 || '',
                    quantity: tp.quantity || t.quantity || prescriptionDefaults.quantity || 15,
                    timing: tp.timing || '',
                    dosage: tp.dosage || t.dosage || `${prescriptionDefaults.doseQuantity ?? '10'}|${prescriptionDefaults.doseTiming ?? 'TDS'}|${prescriptionDefaults.dilution ?? 'WATER'}`,
                    additions: tp.additions || '',
                    addition1: tp.addition1 || '', addition2: tp.addition2 || '', addition3: tp.addition3 || '',
                    procedure: tp.procedure || t.procedure || prescriptionDefaults.procedure || 'ORAL',
                    presentation: tp.presentation || prescriptionDefaults.presentation || 'DRP',
                    droppersToday: tp.droppersToday?.toString() || '',
                    medicineQuantity: tp.medicineQuantity?.toString() || '',
                    administration: tp.administration || t.administration || '',
                    patientHasMedicine: false,
                    bottleSize: tp.bottleSize || prescriptionDefaults.bottleSize || '15',
                    discussions: tp.discussions || '',
                    selectedDropper: '',
                    selectedLabel: 'LABELS ORAL (PUN)',
                    includeLabelProduct: true,
                    includeVrsProduct: true,
                    vrsQuantity: 0,
                })
            })
        })

        const mergedPrescriptions = Array.from(deduped.values())
        setPrescriptions(mergedPrescriptions)
        setSelectedTreatmentId(null)
        setSelectedTreatmentPlan(null)
        setOriginalTreatmentData(JSON.parse(JSON.stringify(mergedPrescriptions)))

        await fetch('/api/treatments/learn-keywords', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                diagnoses: selectedDiagnosisTags,
                complaints: complaintTags,
                investigations: selectedInvestigationTags,
            }),
        }).catch(() => {})

        return mergedPrescriptions
    }

    async function generatePrescriptionsFromSelectedPlans() {
        if (selectedTreatmentIds.length === 0) {
            showError('Select at least one treatment plan')
            return
        }

        try {
            setLoading(true)
            const selectionKey = selectedTreatmentSelectionKey
            const selectedTreatments = (Array.isArray(treatments) ? treatments : [])
                .filter((t: any) => selectedTreatmentIds.includes(String(t.id)))

            if (selectedTreatments.length === 0) {
                showError('Selected plans not found')
                setLoading(false)
                return
            }
            const duplicates = getDuplicateProductsAcrossTreatments(selectedTreatments)
            if (duplicates.length > 0) {
                const initialSelection: Record<string, boolean> = {}
                duplicates.forEach((item) => {
                    initialSelection[item.productId] = true
                })
                setDuplicateMergeItems(duplicates)
                setDuplicateMergeSelection(initialSelection)
                setPendingSelectedTreatments(selectedTreatments)
                setPendingMergeSelectionKey(selectionKey)
                setShowMergePlansModal(true)
                setLoading(false)
                return
            }

            const mergedPrescriptions = await createPrescriptionsFromSelectedPlans(selectedTreatments)
            setAppliedPlanSelectionKey(selectionKey)
            setPausedPlanSelectionKey('')
            showSuccess(`Generated ${mergedPrescriptions.length} prescriptions from ${selectedTreatmentIds.length} selected plan(s)`)
        } catch (err: any) {
            showError(err?.message || 'Failed to generate prescriptions from selected plans')
        } finally {
            setLoading(false)
        }
    }

    // Validate stock availability based on flow inventory
    function validateStock(index: number, prescription: any) {
        if (!prescription.productId || !prescription.quantity) {
            // Clear error if no product or quantity
            setQuantityErrors(prev => {
                const updated = { ...prev }
                delete updated[index]
                return updated
            })
            return
        }

        const product = products.find(p => String(p.id) === String(prescription.productId))
        if (!product) return

        const fieldVisibility = getPrescriptionFieldVisibility(product)
        if (!fieldVisibility.quantity) {
            setQuantityErrors(prev => {
                const updated = { ...prev }
                delete updated[index]
                return updated
            })
            return
        }

        // Calculate flow inventory
        let flowInventory = (Number(product.totalPurchased) || 0) - (Number(product.totalSales) || 0)

        // In edit mode, the original quantity for this prescription was already deducted from totalSales
        // when the visit was first created. Add it back so the threshold is fair.
        if (isEditMode) {
            const orig = originalPrescriptionsRef.current[index]
            if (orig && String(orig.productId) === String(prescription.productId)) {
                flowInventory += Number(orig.quantity) || 0
            }
        }

        const requestedQuantity = Number(prescription.quantity) || 0

        if (requestedQuantity > flowInventory) {
            // Show error
            setQuantityErrors(prev => ({
                ...prev,
                [index]: `Insufficient stock! Maximum available: ${formatQuantity(flowInventory)} units`
            }))
        } else {
            // Clear error
            setQuantityErrors(prev => {
                const updated = { ...prev }
                delete updated[index]
                return updated
            })
        }
    }

    // Get stock status for a product
    function getStockStatus(product: any) {
        const flowInventory = (Number(product.totalPurchased) || 0) - (Number(product.totalSales) || 0)
        const threshold = product.minStockLevel || 0
        const threshold70 = threshold * 0.7
        const threshold85 = threshold * 0.85

        // Check if there's a pending purchase order for this product
        const hasPendingPO = purchaseOrders.some((po: any) => 
            po.items?.some((item: any) => 
                Number(item.productId) === Number(product.id) && 
                item.receivedQuantity < item.quantity
            )
        )

        return {
            flowInventory,
            threshold,
            threshold70,
            threshold85,
            hasPendingPO,
            // Critical: ≤ 10% of threshold remaining
            isCritical: threshold > 0 && flowInventory <= threshold * 0.1,
            // Low: > 10% but ≤ 30% of threshold
            isLow: threshold > 0 && flowInventory > threshold * 0.1 && flowInventory <= threshold * 0.3,
            // Red: < 70% of threshold
            isRed: flowInventory < threshold70,
            // Yellow: >= 70% but < threshold
            isYellow: flowInventory >= threshold70 && flowInventory < threshold,
            // Green: has pending PO and (< threshold OR items not received)
            isGreen: hasPendingPO && flowInventory < threshold,
            // Block: < 85% of threshold
            isBlocked: flowInventory < threshold85
        }
    }

    // Play a short alert beep tone for critical stock selections
    function playAlertTone() {
        try {
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.type = 'sine'
            osc.frequency.setValueAtTime(880, ctx.currentTime)
            osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.3)
            gain.gain.setValueAtTime(0.4, ctx.currentTime)
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45)
            osc.start(ctx.currentTime)
            osc.stop(ctx.currentTime + 0.5)
        } catch (_) {}
    }

    // Trigger device vibration (works on mobile even in silent/vibrate mode)
    function triggerVibrate() {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
            try { navigator.vibrate([200, 100, 200]) } catch (_) {}
        }
    }

    // Add shake animation to a prescription row briefly
    function triggerFieldShake(index: number) {
        setShakingPrescriptionIndices(prev => new Set([...prev, index]))
        setTimeout(() => {
            setShakingPrescriptionIndices(prev => {
                const next = new Set(prev)
                next.delete(index)
                return next
            })
        }, 650)
    }

    // Check if product can be added to medicines
    function canAddProduct(productId: string): { allowed: boolean, message?: string } {
        const product = products.find(p => String(p.id) === String(productId))
        if (!product) return { allowed: false, message: 'Product not found' }

        const status = getStockStatus(product)
        
        if (status.isBlocked) {
            return { 
                allowed: false, 
                message: `${product.name} is not in stock yet` 
            }
        }

        return { allowed: true }
    }

    // Reorder prescriptions via drag and drop
    function reorderPrescriptions(fromIndex: number, toIndex: number) {
        if (fromIndex === toIndex) return
        
        const copy = [...prescriptions]
        const [movedItem] = copy.splice(fromIndex, 1)
        copy.splice(toIndex, 0, movedItem)
        setPrescriptions(copy)
        showSuccess('Medicine reordered successfully')
    }

    // Restore default dosage & administrative details for a single prescription
    function restoreDefaultValues(index: number) {
        // Save current state for undo
        setUndoStack([...undoStack, { index, prescription: { ...prescriptions[index] } }])
        
        updatePrescription(index, {
            quantity: prescriptionDefaults.quantity ?? 15,
            timing: prescriptionDefaults.timing ?? 'AM',
            dosage: `${prescriptionDefaults.doseQuantity ?? '10'}|${prescriptionDefaults.doseTiming ?? 'TDS'}|${prescriptionDefaults.dilution ?? 'WATER'}`,
            procedure: prescriptionDefaults.procedure ?? 'ORAL',
            presentation: prescriptionDefaults.presentation ?? 'DRP',
            bottleSize: prescriptionDefaults.bottleSize ?? '15'
        })
        showSuccess('Default values restored')
    }

    // Restore default dosage & administrative details for all prescriptions
    function restoreDefaultValuesForAll() {
        // Save current state for undo
        setUndoAllStack([...undoAllStack, [...prescriptions]])
        
        // Also add each prescription to individual undo stack so all buttons become undo buttons
        const newUndoStack = prescriptions.map((pr, index) => ({
            index,
            prescription: { ...pr }
        }))
        setUndoStack(newUndoStack)
        
        const copy = prescriptions.map(pr => ({
            ...pr,
            quantity: prescriptionDefaults.quantity ?? 15,
            timing: prescriptionDefaults.timing ?? 'AM',
            dosage: `${prescriptionDefaults.doseQuantity ?? '10'}|${prescriptionDefaults.doseTiming ?? 'TDS'}|${prescriptionDefaults.dilution ?? 'WATER'}`,
            procedure: prescriptionDefaults.procedure ?? 'ORAL',
            presentation: prescriptionDefaults.presentation ?? 'DRP',
            bottleSize: prescriptionDefaults.bottleSize ?? '15'
        }))
        setPrescriptions(copy)
        showSuccess(`Default values restored for all ${copy.length} medicines`)
    }
    
    // Undo single restore
    function undoRestore() {
        if (undoStack.length === 0) {
            showError('Nothing to undo')
            return
        }
        
        const lastUndo = undoStack[undoStack.length - 1]
        const newStack = undoStack.slice(0, -1)
        setUndoStack(newStack)
        
        updatePrescription(lastUndo.index, lastUndo.prescription)
        showSuccess('Undo successful')
    }
    
    // Undo restore all
    function undoRestoreAll() {
        if (undoAllStack.length === 0) {
            showError('Nothing to undo')
            return
        }
        
        const lastState = undoAllStack[undoAllStack.length - 1]
        const newStack = undoAllStack.slice(0, -1)
        setUndoAllStack(newStack)
        
        // Clear individual undo stack when undoing all
        setUndoStack([])
        
        setPrescriptions(lastState)
        showSuccess('Undo successful')
    }
    
    // Toggle prescription selection
    function togglePrescriptionSelection(index: number) {
        const newSelected = new Set(selectedPrescriptions)
        if (newSelected.has(index)) {
            newSelected.delete(index)
        } else {
            newSelected.add(index)
        }
        setSelectedPrescriptions(newSelected)
    }
    
    // Toggle select all prescriptions
    function toggleSelectAll() {
        if (selectedPrescriptions.size === prescriptions.length) {
            setSelectedPrescriptions(new Set())
        } else {
            setSelectedPrescriptions(new Set(prescriptions.map((_, i) => i)))
        }
    }
    
    // Remove selected prescriptions
    function removeSelectedPrescriptions() {
        if (selectedPrescriptions.size === 0) {
            showError('No prescriptions selected')
            return
        }
        
        const newPrescriptions = prescriptions.filter((_, i) => !selectedPrescriptions.has(i))
        setPrescriptions(newPrescriptions)
        setSelectedPrescriptions(new Set())
        showSuccess(`Removed ${selectedPrescriptions.size} prescription(s)`)
    }
    
    // Repeat selected prescriptions
    function repeatSelectedPrescriptions() {
        if (selectedPrescriptions.size === 0) {
            showError('No prescriptions selected')
            return
        }
        
        const count = parseInt(repeatCount)
        if (!count || count < 1) {
            showError('Please enter a valid positive number')
            return
        }
        
        const selectedIndices = Array.from(selectedPrescriptions).sort((a, b) => a - b)
        const itemsToRepeat = selectedIndices.map(i => ({ ...prescriptions[i] }))
        
        const newPrescriptions = [...prescriptions]
        for (let i = 0; i < count; i++) {
            newPrescriptions.push(...itemsToRepeat.map(item => ({ ...item })))
        }
        
        setPrescriptions(newPrescriptions)
        setSelectedPrescriptions(new Set())
        setShowRepeatInput(false)
        setRepeatCount('')
        showSuccess(`Repeated ${selectedIndices.length} prescription(s) ${count} time(s)`)
    }
    
    // Repeat single row
    function repeatSingleRow(index: number) {
        const count = parseInt(repeatCountForRow)
        if (!count || count < 1) {
            showError('Please enter a valid positive number')
            return
        }
        
        const itemToRepeat = { ...prescriptions[index] }
        const newPrescriptions = [...prescriptions]
        
        for (let i = 0; i < count; i++) {
            newPrescriptions.push({ ...itemToRepeat })
        }
        
        setPrescriptions(newPrescriptions)
        setShowRepeatInputForRow(null)
        setRepeatCountForRow('')
        showSuccess(`Repeated prescription ${count} time(s)`)
    }

    function applyBulkDosageAdministrationToIndices(indices: number[]) {
        if (indices.length === 0) {
            showError('No prescriptions available to update')
            return
        }

        const quantityRaw = String(bulkDosageAdminValues.quantity || '').trim()
        const parsedQuantity = Number(quantityRaw)
        if (quantityRaw !== '' && (!Number.isFinite(parsedQuantity) || parsedQuantity < 0)) {
            showError('Please enter a valid quantity')
            return
        }

        const dosageValue = formatDosage(
            String(bulkDosageAdminValues.doseQuantity || '').trim(),
            String(bulkDosageAdminValues.doseTiming || '').trim().toUpperCase(),
            String(bulkDosageAdminValues.dilution || '').trim().toUpperCase()
        )

        setUndoAllStack([...undoAllStack, [...prescriptions]])

        const indexSet = new Set(indices)
        const newUndoStack = indices.map((index) => ({
            index,
            prescription: { ...prescriptions[index] }
        }))
        setUndoStack((prev) => [...prev, ...newUndoStack])

        const updatedPrescriptions = prescriptions.map((pr, index) => {
            if (!indexSet.has(index)) return pr
            return {
                ...pr,
                quantity: quantityRaw === '' ? '' : parsedQuantity,
                timing: String(bulkDosageAdminValues.timing || '').trim().toUpperCase(),
                dosage: dosageValue,
                procedure: String(bulkDosageAdminValues.procedure || '').trim().toUpperCase(),
                presentation: String(bulkDosageAdminValues.presentation || '').trim().toUpperCase(),
                administration: String(bulkDosageAdminValues.administration || '').trim().toUpperCase(),
            }
        })

        setPrescriptions(updatedPrescriptions)
        showSuccess(`Applied dosage and administration details to ${indices.length} medicine(s)`)
    }

    function applyBulkDosageAdministrationToAll() {
        applyBulkDosageAdministrationToIndices(prescriptions.map((_, index) => index))
    }

    function applyBulkDosageAdministrationToSelected() {
        const selectedIndices = Array.from(selectedPrescriptions).sort((a, b) => a - b)
        if (selectedIndices.length === 0) {
            showError('Select at least one prescription row first')
            return
        }
        applyBulkDosageAdministrationToIndices(selectedIndices)
    }

    // Step navigation functions
    const nextStep = () => {
        if (currentStep < steps.length) {
            setCurrentStep(currentStep + 1)
            window.scrollTo({ top: 0, behavior: 'smooth' })
        }
    }

    const prevStep = () => {
        if (currentStep > 1) {
            setCurrentStep(currentStep - 1)
            window.scrollTo({ top: 0, behavior: 'smooth' })
        }
    }

    const goToStep = (stepNumber: number) => {
        if (stepNumber >= 1 && stepNumber <= steps.length) {
            setCurrentStep(stepNumber)
            window.scrollTo({ top: 0, behavior: 'smooth' })
        }
    }

    async function submit(e: any) {
        e.preventDefault()

        // Clear previous errors
        setFieldErrors({})

        // Validate required fields
        const errors: { [key: string]: string } = {}

        if (!form.patientId) {
            errors.patientId = 'Patient is required'
        }

        // Check for quantity errors (insufficient stock)
        if (Object.keys(quantityErrors).length > 0) {
            showError('Please fix the stock availability issues before creating the prescription')
            // Scroll to prescriptions section (step 5)
            setCurrentStep(5)
            return
        }

        // If there are validation errors, show them and scroll to first error
        if (Object.keys(errors).length > 0) {
            setFieldErrors(errors)
            showError('Please select a patient before creating a visit')

            // Scroll to Patient Information card
            const patientCard = document.querySelector('.card')
            if (patientCard) {
                patientCard.scrollIntoView({ behavior: 'smooth', block: 'center' })
            }
            return
        }

        // Check if one or more linked treatment plans were modified
        const modifiedIds = getModifiedTreatmentIds()
        if (modifiedIds.length > 0) {
            setModifiedTreatmentPlanIds(modifiedIds)
            setModifiedPlanStepIndex(0)
            setModifiedPlanActions({})
            setPendingSubmit(e)
            setShowSaveModal(true)
            return
        }

        // Proceed with normal save
        await performSubmit()
    }

    function hasModifiedTreatmentData() {
        return getModifiedTreatmentIds().length > 0
    }

    async function applyModifiedPlanActionsAndSubmit() {
        if (modifiedTreatmentPlanIds.length === 0) {
            setShowSaveModal(false)
            await performSubmit()
            return
        }

        const hasAllChoices = modifiedTreatmentPlanIds.every((id) => Boolean(modifiedPlanActions[id]))
        if (!hasAllChoices) {
            showError('Select an action for every modified treatment plan')
            return
        }

        try {
            setCreatingTreatment(true)
            setTreatmentModalMessage('Saving treatment plan changes...')

            let nextPlanNumberCounter: number | null = null
            const allTreatmentsRes = await fetch('/api/treatments')
            const allTreatments = await allTreatmentsRes.json()
            const existingPlanNumbers = (Array.isArray(allTreatments) ? allTreatments : [])
                .map((t: any) => t.planNumber)
                .filter((pn: string) => pn && /^\d+$/.test(pn))
                .map((pn: string) => parseInt(pn, 10))
            nextPlanNumberCounter = (existingPlanNumbers.length > 0 ? Math.max(...existingPlanNumbers) : 0) + 1

            for (const planId of modifiedTreatmentPlanIds) {
                const action = modifiedPlanActions[planId]
                if (!action || action === 'prescription-only') continue

                const sourcePlan = treatments.find((t: any) => String(t.id) === String(planId))
                const planRows = getRowsForTreatmentPlan(planId, prescriptions)
                if (!sourcePlan || planRows.length === 0) continue

                const productsPayload = planRows.map((pr: any) => ({
                    productId: pr.productId,
                    spy1: pr.spy1 || '',
                    spy2: pr.spy2 || '',
                    spy3: pr.spy3 || '',
                    spy4: pr.spy4 || '',
                    spy5: pr.spy5 || '',
                    spy6: pr.spy6 || '',
                    quantity: pr.quantity || 0,
                    timing: pr.timing || '',
                    dosage: pr.dosage || '',
                    additions: pr.additions || '',
                    addition1: pr.addition1 || '',
                    addition2: pr.addition2 || '',
                    addition3: pr.addition3 || '',
                    procedure: pr.procedure || '',
                    presentation: pr.presentation || '',
                    administration: pr.administration || '',
                    bottleSize: pr.bottleSize || '',
                    discussions: pr.discussions || '',
                }))

                if (action === 'update') {
                    const updateRes = await fetch('/api/treatments', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            id: planId,
                            speciality: sourcePlan.speciality || form.temperament || '',
                            organ: sourcePlan.organ || '',
                            diseaseAction: sourcePlan.diseaseAction || '',
                            provDiagnosis: sourcePlan.provDiagnosis || form.provisionalDiagnosis || '',
                            treatmentPlan: sourcePlan.treatmentPlan || sourcePlan.provDiagnosis || form.provisionalDiagnosis || 'Treatment',
                            planNumber: sourcePlan.planNumber || '',
                            administration: planRows[0]?.administration || sourcePlan.administration || '',
                            notes: sourcePlan.notes || '',
                            products: productsPayload,
                        }),
                    })
                    if (!updateRes.ok) {
                        const error = await updateRes.json().catch(() => ({ error: 'Failed to update treatment plan' }))
                        throw new Error(error.error || 'Failed to update treatment plan')
                    }
                }

                if (action === 'create') {
                    const createRes = await fetch('/api/treatments', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            speciality: sourcePlan.speciality || form.temperament || '',
                            organ: sourcePlan.organ || '',
                            diseaseAction: sourcePlan.diseaseAction || '',
                            provDiagnosis: sourcePlan.provDiagnosis || form.provisionalDiagnosis || '',
                            treatmentPlan: sourcePlan.treatmentPlan || sourcePlan.provDiagnosis || form.provisionalDiagnosis || 'Treatment',
                            planNumber: String(nextPlanNumberCounter || ''),
                            administration: planRows[0]?.administration || sourcePlan.administration || '',
                            notes: sourcePlan.notes || '',
                            products: productsPayload,
                        }),
                    })
                    if (!createRes.ok) {
                        const error = await createRes.json().catch(() => ({ error: 'Failed to create treatment plan' }))
                        throw new Error(error.error || 'Failed to create treatment plan')
                    }
                    if (nextPlanNumberCounter !== null) nextPlanNumberCounter += 1
                }
            }

            const refreshedTreatments = await fetch('/api/treatments').then((r) => r.json())
            setTreatments(refreshedTreatments)
            setShowSaveModal(false)
            setModifiedTreatmentPlanIds([])
            setModifiedPlanActions({})
            setCreatingTreatment(false)
            await performSubmit({ suppressLoadingModal: true, showSuccessModal: true })
        } catch (error: any) {
            setCreatingTreatment(false)
            showError(error?.message || 'Failed to process treatment plan updates')
        }
    }

    async function performSubmit(options?: { suppressLoadingModal?: boolean; showSuccessModal?: boolean }) {
        const useSuppressedLoading = options?.suppressLoadingModal === true
        if (useSuppressedLoading) {
            setSuppressVisitLoadingModal(true)
        }
        setLoading(true)
        try {
            // Filter out prescriptions with invalid or empty productId
            const validPrescriptions = prescriptions.filter(pr => {
                const productId = pr.productId
                return productId && productId !== '' && !isNaN(Number(productId))
            })

            // Warn if some prescriptions were filtered out
            if (validPrescriptions.length < prescriptions.length) {
                showError(`${prescriptions.length - validPrescriptions.length} prescription(s) skipped due to missing medicine selection`)
            }

            // SAFETY CHECK: If editing and all prescriptions became invalid, prevent accidental deletion
            if (isEditMode && prescriptions.length > 0 && validPrescriptions.length === 0) {
                const shouldContinue = confirm(
                    `⚠️ WARNING: All medicines appear to be invalid and would be deleted!\n\n` +
                    `This could be a data corruption issue. Are you sure you want to continue?\n\n` +
                    `Click Cancel to go back and check your medicines.`
                )
                if (!shouldContinue) {
                    setLoading(false)
                    if (useSuppressedLoading) setSuppressVisitLoadingModal(false)
                    return
                }
            }

            // Prepare payload
            const payload = { 
                ...form, 
                prescriptions: validPrescriptions, 
                autoGenerateInvoice: true // Always true - will update existing invoice when editing
            }

            // Keep pending payment derived from financial fields in visits API.
            delete (payload as any).pendingPaymentCents

            // Add MISC products automatically (RX PAD, FILE COVER, ENVELOPS, MEDICINE BOX) - only if checked
            const miscProductsToAdd = ['RX PAD', 'FILE COVER', 'ENVELOPS', 'MEDICINE BOX']
            const miscProducts: any[] = []
            
            for (const miscName of miscProductsToAdd) {
                // Only add if checkbox is checked
                if (defaultMiscProducts[miscName]) {
                    const miscProduct = products.find(p => 
                        p.name?.toUpperCase() === miscName && 
                        p.category?.name?.toUpperCase() === 'MISC'
                    )
                    if (miscProduct) {
                        // Use the specific quantity for MEDICINE BOX, otherwise 1
                        const quantity = miscName === 'MEDICINE BOX' ? medicineBoxQuantity : 1
                        miscProducts.push({
                            productId: String(miscProduct.id),
                            quantity: quantity,
                            isMiscAutoAdded: true // Flag to exclude from pricing
                        })
                    }
                }
            }
            
            // Add selected dropper products for each prescription
            validPrescriptions.forEach((pr: any) => {
                const selectedProduct = products.find(p => String(p.id) === String(pr.productId))
                const allowDropperForProduct = getPrescriptionFieldVisibility(selectedProduct).dropper

                if (allowDropperForProduct && pr.selectedDropper) {
                    miscProducts.push({
                        productId: pr.selectedDropper,
                        quantity: 1,
                        isMiscAutoAdded: true // Flag to exclude from pricing
                    })
                }
                
                // Add selected label product if checkbox is checked
                if (pr.includeLabelProduct !== false) {
                    const labelName = pr.selectedLabel || 'LABELS ORAL (PUN)'
                    const labelProduct = products.find(p => p.name === labelName)
                    if (labelProduct) {
                        miscProducts.push({
                            productId: String(labelProduct.id),
                            quantity: 1,
                            isMiscAutoAdded: true // Flag to exclude from pricing
                        })
                    }
                }
                
                // Add VRS product if checkbox is checked and product is dilution category
                if (pr.includeVrsProduct !== false && pr.vrsQuantity > 0) {
                    const product = products.find(p => String(p.id) === String(pr.productId))
                    const categoryName = product ? (typeof product.category === 'string' ? product.category : product.category?.name || '').toLowerCase() : ''
                    
                    if (categoryName === 'dilutions') {
                        const vrsProduct = products.find(p => 
                            p.name?.toUpperCase() === 'VRS' && 
                            p.category?.name?.toUpperCase() === 'MISC'
                        )
                        if (vrsProduct) {
                            miscProducts.push({
                                productId: String(vrsProduct.id),
                                quantity: pr.vrsQuantity,
                                isMiscAutoAdded: true // Flag to exclude from pricing
                            })
                        }
                    }
                }
            })
            
            // Add the misc products to payload
            payload.miscProducts = miscProducts
            payload.prescriptions = validPrescriptions.map((pr: any) => {
                const selectedProduct = products.find(p => String(p.id) === String(pr.productId))
                const allowDropperForProduct = getPrescriptionFieldVisibility(selectedProduct).dropper

                return {
                    ...pr,
                    selectedDropper: allowDropperForProduct ? (pr.selectedDropper || null) : null,
                    selectedLabel: pr.selectedLabel || null,
                    includeLabelProduct: pr.includeLabelProduct !== undefined ? pr.includeLabelProduct : true,
                    includeVrsProduct: pr.includeVrsProduct !== undefined ? pr.includeVrsProduct : true,
                    vrsQuantity: pr.vrsQuantity || 0
                }
            })

            // Send consultation fees separately. Amount remains medicine amount.
            payload.consultationFees = consultationFees.toString()

            // Always add reports attachments as JSON string (even if empty to clear old data)
            payload.reportsAttachments = reportsAttachments.length > 0 
                ? JSON.stringify(reportsAttachments)
                : null

            // Combine date and time for nextVisit
            if (form.nextVisitDate) {
                const time = form.nextVisitTime || '00:00'
                payload.nextVisit = `${form.nextVisitDate}T${time}`
            }

            // If editing, include the visit ID
            if (isEditMode && visitId) {
                payload.id = visitId
            }

            const res = await fetch('/api/visits', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })
            if (!res.ok) {
                const b = await res.json().catch(() => ({ error: res.statusText }))
                showError(`${isEditMode ? 'Update' : 'Save'} failed: ` + (b?.error || res.statusText))
                setLoading(false)
                if (useSuppressedLoading) setSuppressVisitLoadingModal(false)
                return
            }
            const data = await res.json()
            setLastCreatedVisitId(data.id)
            setLastCreatedVisit(data)

            // Learn complaint keywords from this visit (deterministic, no AI).
            const diagnosesForLearning = (selectedDiagnosisTags.length > 0
                ? selectedDiagnosisTags
                : parseComplaintTags(form.provisionalDiagnosis || ''))
                .map((d) => String(d || '').trim())
                .filter(Boolean)
            const complaintsForLearning = parseComplaintTags(form.majorComplaints || '')
            const investigationsForLearning = selectedInvestigationTags
                .map((v) => String(v || '').trim())
                .filter(Boolean)

            if (diagnosesForLearning.length > 0 && (complaintsForLearning.length > 0 || investigationsForLearning.length > 0)) {
                await fetch('/api/treatments/learn-keywords', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        diagnoses: diagnosesForLearning,
                        complaints: complaintsForLearning,
                        investigations: investigationsForLearning,
                    }),
                }).catch(() => {})
            }

            showSuccess(`Visit ${isEditMode ? 'updated' : 'created'} successfully!${data.invoiceCreated ? ' Invoice generated.' : ''}`)

            // Clear the auto-saved draft after successful submission
            if (!isEditMode) {
                try {
                    localStorage.removeItem('prescriptionDraft')
                    setHasDraft(false)
                } catch (err) {
                }
            }

            // Show success modal instead of redirect when submission came from another modal action
            if (options?.showSuccessModal) {
                setVisitSuccessId(String(data.id))
                setShowVisitSuccessModal(true)
                setLoading(false)
                if (useSuppressedLoading) setSuppressVisitLoadingModal(false)
                return
            }

            // Redirect to visit details page
            setLoading(false)
            if (useSuppressedLoading) setSuppressVisitLoadingModal(false)
            router.push(`/visits/${data.id}`)
        } catch (err) {
            showError(`${isEditMode ? 'Update' : 'Save'} failed. Please try again.`)
            setLoading(false)
            if (useSuppressedLoading) setSuppressVisitLoadingModal(false)
        }
    }

    // Show loading state while fetching initial data
    if (dataLoading || (patients.length === 0 && products.length === 0)) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-muted">Loading patients and medicines...</p>
            </div>
        )
    }

    const renderModal = (node: React.ReactNode) => {
        if (!node) return null
        if (typeof document === 'undefined') return node
        return createPortal(node, document.body)
    }

    const financialAmount = Number(form.amount) || 0
    const financialDiscount = Number(form.discount) || 0
    const financialPayment = Number(form.payment) || 0
    const financialConsultation = Number(consultationFees) || 0
    const exactPayableAmount = Math.max(0, financialAmount - financialDiscount + financialConsultation)
    const totalPayableAmount = Math.round(exactPayableAmount)
    const payableRoundOff = totalPayableAmount - exactPayableAmount
    const pendingBalanceAmount = Math.max(0, totalPayableAmount - financialPayment)

    return (
        <div>
            {/* Loading Modal */}
            <LoadingModal isOpen={loading && !suppressVisitLoadingModal} message={isEditMode ? 'Loading visit data...' : 'Loading...'} />
            {/* Creating Treatment Modal */}
            <LoadingModal isOpen={creatingTreatment} message={treatmentModalMessage} />
            {/* Camera Modal for Reports */}
            <CameraModal
                isOpen={showCamera}
                onClose={() => setShowCamera(false)}
                onCapture={handleCameraCapture}
                title="Capture Report Document"
            />
            {/* Restore Draft Modal */}
            <ConfirmModal
                isOpen={showRestoreDraftModal}
                onCancel={handleDiscardDraft}
                onConfirm={handleRestoreDraft}
                title="Restore Draft"
                message="Found unsaved prescription data from a previous session. Would you like to restore it?"
                confirmText="Restore"
                cancelText="Discard"
                variant="info"
            />

            {isPatient ? (
                // Patient view - Read-only prescription list
                <UserPrescriptionsContent user={user} />
            ) : (
                // Staff view - Create/Edit prescriptions (original form)
                <>
                    <PatientCopyPreview
                        form={form}
                        prescriptions={prescriptions}
                        products={products}
                        patients={patients}
                        bottlePricing={bottlePricing}
                        isExpanded={previewExpanded}
                        onToggle={() => setPreviewExpanded((prev) => !prev)}
                    />

                    <div className={previewExpanded ? 'w-full transition-[padding] duration-300 md:pr-[640px]' : 'w-full transition-[padding] duration-300'}>
                    <div className="section-header">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 className="section-title">{isEditMode ? 'Edit Visit & Prescriptions' : 'Create Visit & Prescriptions'}</h2>
                                <p className="text-sm text-muted">Comprehensive visit recording with prescriptions and patient updates</p>
                            </div>
                            <div className="flex items-start gap-3">
                                {!isEditMode && hasDraft && (
                                    <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                                        <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Draft Auto-Saved</span>
                                    </div>
                                )}
                                {/* Update/Save Button */}
                                <button
                                    type="button"
                                    disabled={loading}
                                    onClick={submit}
                                    className="px-6 py-2 text-base font-bold text-white bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 disabled:from-gray-400 disabled:to-gray-500 rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all duration-300 transform hover:scale-105 disabled:scale-100 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                                >
                                    {loading ? (
                                        <>
                                            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                            <span>{isEditMode ? 'Updating...' : 'Saving...'}</span>
                                        </>
                                    ) : (
                                        <>
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                            <span>{isEditMode ? 'Update Prescription' : 'Save Prescription'}</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Toast Notifications */}
                    <ToastNotification toasts={toasts} removeToast={removeToast} />

                    <form onSubmit={submit} className="space-y-5">
                        {/* Minimalistic Step Progress Bar */}
                        <div className="flex items-center gap-2 sm:gap-3 pb-8 mb-2">
                            {/* Back Button */}
                            <button
                                type="button"
                                onClick={prevStep}
                                disabled={currentStep === 1}
                                className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center"
                                title="Previous step"
                            >
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>

                            <div ref={stepProgressScrollerRef} className="flex-1 relative">
                                <div className="flex items-center w-full">
                                    {steps.map((step, index) => (
                                        <div key={step.number} className="flex items-center flex-1 last:flex-initial">
                                            {/* Step Node */}
                                            <button
                                                type="button"
                                                onClick={() => goToStep(step.number)}
                                                data-step={step.number}
                                                className={`relative flex-shrink-0 w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
                                                    currentStep === step.number
                                                        ? 'bg-gradient-to-br from-blue-500 to-sky-500 text-white shadow-md shadow-blue-500/25 ring-2 ring-blue-400/30 ring-offset-1 ring-offset-white dark:ring-offset-gray-900 scale-110'
                                                        : currentStep > step.number
                                                            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'
                                                } hover:scale-110 cursor-pointer`}
                                                title={`${step.title}: ${step.description}`}
                                            >
                                                {/* Healthcare Icons */}
                                                {currentStep > step.number ? (
                                                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                ) : step.number === 1 ? (
                                                    /* Patient/User icon */
                                                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                                                    </svg>
                                                ) : step.number === 2 ? (
                                                    /* Stethoscope/Heart icon */
                                                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                                                    </svg>
                                                ) : step.number === 3 ? (
                                                    /* Calendar icon */
                                                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                                                    </svg>
                                                ) : step.number === 4 ? (
                                                    /* Capsule/Medicine icon */
                                                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 5.61a1.518 1.518 0 01-1.451 1.943H4.249a1.518 1.518 0 01-1.451-1.943L4.2 15.3" />
                                                    </svg>
                                                ) : step.number === 5 ? (
                                                    /* Clipboard/Prescription icon */
                                                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                                                    </svg>
                                                ) : (
                                                    /* Credit card/Payment icon */
                                                    <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                                                    </svg>
                                                )}
                                                {/* Active step label */}
                                                {currentStep === step.number && (
                                                    <span className="absolute -bottom-5 sm:-bottom-6 left-1/2 -translate-x-1/2 text-[9px] sm:text-[10px] font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                                                        {step.title}
                                                    </span>
                                                )}
                                            </button>

                                            {/* Connecting Track */}
                                            {index < steps.length - 1 && (
                                                <div className="flex-1 h-[3px] mx-0.5 sm:mx-1 bg-gray-200 dark:bg-gray-700/60 rounded-full relative">
                                                    <div
                                                        className={`absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-sky-400 rounded-full transition-all duration-500 ease-out ${
                                                            currentStep > step.number ? 'w-full' : 'w-0'
                                                        }`}
                                                    />
                                                    {/* Traveling pill on the last completed track */}
                                                    {currentStep === step.number + 1 && (
                                                        <div
                                                            className="step-pill-traveller absolute top-1/2"
                                                            style={{ right: '-2px' }}
                                                        >
                                                            <svg className="w-5 h-4 drop-shadow-md" viewBox="0 0 24 16" fill="none">
                                                                <rect x="1" y="1" width="22" height="14" rx="7" ry="7" fill="url(#pillGrad)" stroke="white" strokeWidth="1" />
                                                                <line x1="12" y1="2" x2="12" y2="14" stroke="white" strokeWidth="1.5" strokeOpacity="0.6" />
                                                                <defs>
                                                                    <linearGradient id="pillGrad" x1="0" y1="0" x2="24" y2="16">
                                                                        <stop offset="0%" stopColor="#3b82f6" />
                                                                        <stop offset="100%" stopColor="#0ea5e9" />
                                                                    </linearGradient>
                                                                </defs>
                                                            </svg>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Next Button */}
                            <button
                                type="button"
                                onClick={nextStep}
                                disabled={currentStep === steps.length}
                                className="flex-shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-blue-500 to-sky-500 hover:from-blue-600 hover:to-sky-600 disabled:from-gray-300 disabled:to-gray-400 dark:disabled:from-gray-600 dark:disabled:to-gray-700 disabled:cursor-not-allowed text-white transition-all duration-200 flex items-center justify-center shadow-sm hover:shadow-md hover:shadow-blue-500/20"
                                title="Next step"
                            >
                                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>

                        {/* Patient Selection Card - Green Futuristic Theme */}
                        <div className={`relative overflow-hidden rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm ${isPatientSelectOpen ? 'relative z-[999999]' : 'relative z-0'}`}
                            style={{ display: currentStep !== 1 ? 'none' : 'block' }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none"></div>
                            <div className="relative p-6">
                                <h3 className="text-lg font-bold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">Patient Information</h3>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-sm font-medium mb-1.5">
                                            Select Patient <span className="text-red-600">*</span>
                                        </label>
                                        <div className={fieldErrors.patientId ? 'border-2 border-red-600 rounded-lg' : ''}>
                                            <CustomSelect
                                                required
                                                value={form.patientId}
                                                onChange={(id) => {
                                                    setForm((prev: any) => ({ ...prev, patientId: id }))
                                                    setFieldErrors((prev) => ({ ...prev, patientId: '' }))
                                                    const found = patients.find(p => String(p.id) === String(id))
                                                    if (!found) return

                                                    // Split nextVisit into date and time
                                                    let nextVisitDate = ''
                                                    let nextVisitTime = ''
                                                    if (found.nextVisit) {
                                                        const dt = new Date(found.nextVisit).toISOString()
                                                        nextVisitDate = dt.slice(0, 10)
                                                        nextVisitTime = dt.slice(11, 16)
                                                    }

                                                    // Fetch the most recent visit for this patient to get opdNo
                                                    fetch(`/api/visits?patientId=${id}`)
                                                        .then(r => r.json())
                                                        .then(async (patientVisits: any[]) => {
                                                            const latestVisit = patientVisits.length > 0 ? patientVisits[0] : null

                                                            // Always generate new OPD number for new visits
                                                            const previewOpdNo = await generateOpdNoPreview(id)
                                                            setGeneratedOpdNo(previewOpdNo)

                                                            setForm((prev: any) => ({
                                                                ...prev,
                                                                patientId: String(found.id),
                                                                opdNo: previewOpdNo,
                                                                dob: formatDateForInput(found.dob) || '',
                                                                age: String(found.age ?? ''),
                                                                address: found.address || '',
                                                                gender: found.gender || '',
                                                                phone: found.phone || '',
                                                                nextVisitDate: nextVisitDate || '',
                                                                nextVisitTime: nextVisitTime || '',
                                                                occupation: found.occupation || '',
                                                                pendingPaymentCents: String(found.pendingPaymentCents ?? ''),
                                                                height: String(found.height ?? ''),
                                                                weight: String(found.weight ?? ''),
                                                                imageUrl: found.imageUrl || ''
                                                            }))
                                                        })
                                                        .catch(() => {
                                                            setForm((prev: any) => ({
                                                                ...prev,
                                                                patientId: String(found.id),
                                                                opdNo: '',
                                                                dob: formatDateForInput(found.dob) || '',
                                                                age: String(found.age ?? ''),
                                                                address: found.address || '',
                                                                gender: found.gender || '',
                                                                phone: found.phone || '',
                                                                nextVisitDate: nextVisitDate || '',
                                                                nextVisitTime: nextVisitTime || '',
                                                                occupation: found.occupation || '',
                                                                pendingPaymentCents: String(found.pendingPaymentCents ?? ''),
                                                                height: String(found.height ?? ''),
                                                                weight: String(found.weight ?? ''),
                                                                imageUrl: found.imageUrl || ''
                                                            }))
                                                        })
                                                }}
                                                options={[
                                                    { value: '', label: 'Select patient' },
                                                    ...patients.map(p => ({
                                                        value: String(p.id),
                                                        label: (`${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Unknown') + `${p.phone ? ' · ' + p.phone : ''}`,
                                                        badge: p.generatedPatientId || formatPatientId(p.date || p.createdAt),
                                                        subtitle: p.fatherHusbandGuardianName ? `in care of ${p.fatherHusbandGuardianName}` : undefined,
                                                        searchString: `${p.firstName || ''} ${p.lastName || ''} ${p.generatedPatientId || formatPatientId(p.date || p.createdAt)} ${p.phone || ''} ${p.fatherHusbandGuardianName || ''}`
                                                    }))
                                                ]}
                                                placeholder="Select patient"
                                                onOpenChange={setIsPatientSelectOpen}
                                            />
                                        </div>
                                        {fieldErrors.patientId && (
                                            <p className="text-red-600 text-sm mt-1">{fieldErrors.patientId}</p>
                                        )}
                                    </div>

                                    {/* Patient Info Display Card - Premium Themed */}
                                    {form.patientId && (() => {
                                        const selectedPatientData = patients.find(p => String(p.id) === String(form.patientId))
                                        const patientFullName = `${selectedPatientData?.firstName || ''} ${selectedPatientData?.lastName || ''}`.trim() || 'Unknown'
                                        const patientImageSrc = selectedPatientData?.imageUrl || process.env.NEXT_PUBLIC_DEFAULT_PATIENT_IMAGE || ''
                                        const pendingAmountRupees = Number(form.pendingPaymentCents || 0)
                                        return (
                                        <div className="relative overflow-hidden rounded-2xl my-4 border border-blue-200/50 dark:border-blue-700/50 shadow-lg shadow-blue-500/5 dark:shadow-blue-900/20 backdrop-blur-md bg-white/40 dark:bg-slate-900/40">
                                            {/* Subtle gradient layer */}
                                            <div className="absolute inset-0 bg-gradient-to-br from-blue-50/50 via-transparent to-sky-100/30 dark:from-blue-900/10 dark:via-transparent dark:to-sky-900/10 pointer-events-none" style={{zIndex:0}}></div>

                                            <div className="relative p-4 sm:p-5" style={{zIndex:1}}>
                                                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 sm:gap-5">
                                                    {/* Patient Avatar */}
                                                    <div className="flex-shrink-0 relative">
                                                        <img
                                                            src={patientImageSrc}
                                                            alt={patientFullName}
                                                            className="w-16 h-16 sm:w-[5.5rem] sm:h-[5.5rem] object-cover rounded-2xl border-2 border-white/80 dark:border-gray-800 shadow-sm ring-4 ring-blue-50/50 dark:ring-blue-900/20 bg-gray-50 dark:bg-gray-900"
                                                            onError={(e) => { e.currentTarget.src = process.env.NEXT_PUBLIC_DEFAULT_PATIENT_IMAGE || '/default-patient.png' }}
                                                        />
                                                    </div>

                                                    {/* Patient Info */}
                                                    <div className="flex-grow text-center sm:text-left w-full min-w-0">
                                                        {/* Name + Patient ID row */}
                                                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
                                                            <h4 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100 truncate tracking-tight">{patientFullName}</h4>
                                                            {form.opdNo && (
                                                                <span className="inline-flex items-center gap-1 self-center sm:self-auto px-2 py-0.5 rounded text-[11px] font-semibold tracking-wide bg-blue-100/80 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200 border border-blue-200/60 dark:border-blue-800/60 shadow-sm backdrop-blur-sm">
                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>
                                                                    {form.opdNo}
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* Info badges row */}
                                                        <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
                                                            {form.date && (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-white/60 dark:bg-gray-800/60 border border-gray-200/50 dark:border-gray-700/50 text-gray-700 dark:text-gray-300 shadow-sm backdrop-blur-md">
                                                                    <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                                                    {new Date(form.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                                </span>
                                                            )}
                                                            {form.age && (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-white/60 dark:bg-gray-800/60 border border-gray-200/50 dark:border-gray-700/50 text-gray-700 dark:text-gray-300 shadow-sm backdrop-blur-md">
                                                                    <svg className="w-3.5 h-3.5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                                                    {form.age} yrs
                                                                </span>
                                                            )}
                                                            {form.gender && (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-white/60 dark:bg-gray-800/60 border border-gray-200/50 dark:border-gray-700/50 text-gray-700 dark:text-gray-300 shadow-sm backdrop-blur-md">
                                                                    <svg className="w-3.5 h-3.5 text-pink-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
                                                                    {form.gender}
                                                                </span>
                                                            )}
                                                            {form.phone && (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-white/60 dark:bg-gray-800/60 border border-gray-200/50 dark:border-gray-700/50 text-gray-700 dark:text-gray-300 shadow-sm backdrop-blur-md">
                                                                    <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                                                    {form.phone}
                                                                </span>
                                                            )}
                                                            {pendingAmountRupees > 0 && (
                                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-50/70 dark:bg-amber-900/30 border border-amber-200/50 dark:border-amber-800/50 text-amber-700 dark:text-amber-400 shadow-sm backdrop-blur-md">
                                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                                    Due ₹{pendingAmountRupees}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        )
                                    })()}

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-sm font-medium mb-1.5">OPD Number</label>
                                            <div className={minimalReadOnlyClass}>
                                                {form.opdNo || <span className="text-muted italic">Select a patient first</span>}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-1.5">Current Visit Date <span className="text-red-600">*</span></label>
                                            <DateInput type="date" placeholder="Select visit date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className={minimalFieldClass} required />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-1.5">Date of Birth</label>
                                            <DateInput type="date" placeholder="Select date of birth" value={form.dob} onChange={e => setForm({ ...form, dob: e.target.value })} className={minimalFieldClass} />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-1.5">Age</label>
                                            <input type="number" placeholder="35" value={form.age || ''} onChange={e => setForm({ ...form, age: e.target.value })} className={minimalFieldClass} />
                                        </div>
                                        <div className={isGenderOpen ? 'relative z-[10000]' : 'relative z-0'}>
                                            <label className="block text-sm font-medium mb-1.5">Gender</label>
                                            <CustomSelect
                                                value={form.gender}
                                                onChange={(val) => setForm({ ...form, gender: val })}
                                                options={genderOptionsWithPlaceholder}
                                                placeholder="Select gender"
                                                allowCustom={true}
                                                onOpenChange={setIsGenderOpen}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-1.5">Phone</label>
                                            <input placeholder="+91 98765 43210" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value.toUpperCase() })} className={minimalFieldClass} />
                                        </div>
                                        <div className="sm:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div>
                                                <label className="block text-sm font-medium mb-1.5">Occupation</label>
                                                <input placeholder="Engineer" value={form.occupation || ''} onChange={e => setForm({ ...form, occupation: e.target.value.toUpperCase() })} className={minimalFieldClass} />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium mb-1.5">Father/Husband/Guardian Name</label>
                                                <input placeholder="Father/Husband/Guardian Name" value={form.fatherHusbandGuardianName || ''} onChange={e => setForm({ ...form, fatherHusbandGuardianName: e.target.value.toUpperCase() })} className={minimalFieldClass} />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium mb-1.5">Address</label>
                                                <input placeholder="123 Main St, City" value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value.toUpperCase() })} className={minimalFieldClass} />
                                            </div>
                                        </div>
                                        <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                                            <div>
                                                <label className="block text-sm font-medium mb-1.5">Height</label>
                                                <div className={`grid grid-cols-1 ${previewExpanded ? 'gap-2' : 'xl:grid-cols-2 gap-2.5'}`}>
                                                    <div className={`rounded-xl border border-sky-200/70 dark:border-sky-700/50 bg-sky-50/60 dark:bg-sky-900/20 ${previewExpanded ? 'p-2' : 'p-2.5'}`}>
                                                        <p className={`mb-1 font-semibold uppercase tracking-wide text-sky-700 dark:text-sky-300 ${previewExpanded ? 'text-[10px]' : 'text-[11px]'}`}>Metric</p>
                                                        <div className="relative">
                                                            <input
                                                                type="number"
                                                                placeholder="175"
                                                                value={form.height || ''}
                                                                onChange={e => setForm({ ...form, height: e.target.value })}
                                                                className={`w-full pr-10 border border-sky-200 dark:border-sky-700 bg-white dark:bg-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 ${previewExpanded ? 'p-2 text-sm' : 'p-2.5'}`}
                                                            />
                                                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-sky-700 dark:text-sky-300">cm</span>
                                                        </div>
                                                    </div>

                                                    <div className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/70 ${previewExpanded ? 'p-2' : 'p-2.5'}`}>
                                                        <p className={`mb-1 font-semibold uppercase tracking-wide text-gray-700 dark:text-gray-300 ${previewExpanded ? 'text-[10px]' : 'text-[11px]'}`}>Imperial</p>
                                                        <div className={`grid grid-cols-2 ${previewExpanded ? 'gap-1.5' : 'gap-2'}`}>
                                                            <div className="relative">
                                                                <input
                                                                    type="number"
                                                                    placeholder="5"
                                                                    value={form.heightFeet || ''}
                                                                    onChange={e => setForm({ ...form, heightFeet: e.target.value })}
                                                                    className={`w-full pr-10 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-sky-500 ${previewExpanded ? 'p-2 text-sm' : 'p-2.5'}`}
                                                                    title="Feet"
                                                                />
                                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-600 dark:text-gray-400">ft</span>
                                                            </div>
                                                            <div className="relative">
                                                                <input
                                                                    type="number"
                                                                    placeholder="9"
                                                                    value={form.heightInches || ''}
                                                                    onChange={e => setForm({ ...form, heightInches: e.target.value })}
                                                                    className={`w-full pr-10 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 rounded-lg text-center focus:outline-none focus:ring-2 focus:ring-sky-500 ${previewExpanded ? 'p-2 text-sm' : 'p-2.5'}`}
                                                                    title="Inches"
                                                                />
                                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-600 dark:text-gray-400">in</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                <p className={`mt-1 text-gray-500 ${previewExpanded ? 'text-[11px]' : 'text-xs'}`}>Enter either metric or imperial values. Both stay synced automatically.</p>
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium mb-1.5">Pending Payment (₹)</label>
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        step="1"
                                                        min="0"
                                                        placeholder="0"
                                                        value={form.pendingPaymentCents || ''}
                                                        disabled
                                                        className={`${minimalReadOnlyClass} pr-10 cursor-not-allowed`}
                                                    />
                                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" title="Auto-calculated from payment details">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                        </svg>
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-xs text-gray-500">Locked. Updated automatically when this visit is saved.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Clinical Information Card */}
                        <div className={`relative rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900/80 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-6 ${isTemperamentOpen || isPulseDiagnosisOpen || isPulseDiagnosis2Open || isInvestigationOpen ? 'z-[10000]' : 'z-0'}`}
                            style={{ display: currentStep !== 2 ? 'none' : 'block' }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-2xl"></div>
                            <h3 className="relative text-lg font-semibold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">Clinical Information</h3>

                            {/* Temperament and Pulse Diagnoses in one line */}
                            <div className="relative grid grid-cols-1 lg:grid-cols-4 gap-3 mb-3">
                                <div>
                                    <label className="block text-sm font-medium mb-1.5">Temperament</label>
                                    <CustomSelect
                                        value={form.temperament}
                                        onChange={(val) => setForm({ ...form, temperament: val })}
                                        options={temperamentOptionsWithPlaceholder}
                                        placeholder="Select temperament"
                                        allowCustom={true}
                                        onOpenChange={setIsTemperamentOpen}
                                        loading={loadingOptions}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1.5">Pulse Diagnosis</label>
                                    <CustomSelect
                                        value={form.pulseDiagnosis}
                                        onChange={(val) => setForm({ ...form, pulseDiagnosis: val })}
                                        options={pulseDiagnosisOptionsWithPlaceholder}
                                        placeholder="Select pulse diagnosis"
                                        allowCustom={true}
                                        onOpenChange={setIsPulseDiagnosisOpen}
                                        loading={loadingOptions}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1.5">Pulse Diagnosis 2</label>
                                    <CustomSelect
                                        value={form.pulseDiagnosis2}
                                        onChange={(val) => setForm({ ...form, pulseDiagnosis2: val })}
                                        options={pulseDiagnosis2OptionsWithPlaceholder}
                                        placeholder="Select pulse diagnosis 2"
                                        allowCustom={true}
                                        onOpenChange={setIsPulseDiagnosis2Open}
                                        loading={loadingOptions}
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1.5">
                                        Weight (kg)
                                        {previousWeight && (
                                            <span className="ml-2 text-xs text-gray-500 font-normal">
                                                (Previous: {previousWeight} kg)
                                            </span>
                                        )}
                                    </label>
                                    <input type="number" placeholder="70" value={form.weight || ''} onChange={e => setForm({ ...form, weight: e.target.value })} className="w-full p-2 border rounded" />
                                </div>
                            </div>

                            {/* Symptoms and Diagnoses */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-medium mb-1.5">Major Complaints</label>
                                    <TagInput
                                        tags={complaintTags}
                                        onChange={(tags) => setForm({ ...form, majorComplaints: tags.join(', ').toUpperCase() })}
                                        placeholder="Type complaint and press Enter"
                                        suggestions={complaintKeywordSuggestions}
                                    />
                                    {topSuggestedDiagnoses.length > 0 && (
                                        <div className="mt-2 p-2.5 rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/20">
                                            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1.5">Suggested Diagnoses (deterministic keyword match)</p>
                                            <div className="flex flex-wrap gap-2">
                                                {topSuggestedDiagnoses.map((s) => (
                                                    <button
                                                        key={s.diagnosis}
                                                        type="button"
                                                        onClick={() => {
                                                            const next = Array.from(new Set([...selectedDiagnosisTags, s.diagnosis]))
                                                            handleDiagnosisTagsChange(next)
                                                        }}
                                                        className="px-2.5 py-1 rounded-full text-xs font-medium bg-white dark:bg-gray-800 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                                                        title={`Score ${s.score} • ${s.plan}`}
                                                    >
                                                        {s.diagnosis} ({s.score})
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1.5">Investigation Ordered</label>
                                    <div className={isInvestigationOpen ? 'relative z-[10000]' : 'relative z-0'}>
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <CustomSelect
                                                value={investigationInput}
                                                onChange={(val) => setInvestigationInput(String(val || '').toUpperCase())}
                                                options={investigationOptions}
                                                placeholder="Select or type investigation"
                                                allowCustom={true}
                                                onOpenChange={setIsInvestigationOpen}
                                                className="flex-1"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => addInvestigationTag(investigationInput)}
                                                disabled={!String(investigationInput || '').trim()}
                                                className="px-3 py-2 bg-brand text-white rounded-lg text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {selectedInvestigationTags.length === 0 && (
                                            <span className="text-xs text-gray-500 dark:text-gray-400">No investigations selected yet.</span>
                                        )}
                                        {selectedInvestigationTags.map((investigation) => (
                                            <span key={investigation} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-sky-100/80 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-700/60">
                                                {investigation}
                                                <button
                                                    type="button"
                                                    onClick={() => removeInvestigationTag(investigation)}
                                                    className="text-sky-700/70 dark:text-sky-300/70 hover:text-red-600"
                                                    aria-label={`Remove ${investigation}`}
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1.5">Provisional Diagnosis</label>
                                    <div className={isProvDiagnosisOpen ? 'relative z-[10000]' : 'relative z-0'}>
                                        <div className="flex flex-col sm:flex-row gap-2">
                                            <CustomSelect
                                                value={provisionalDiagnosisInput}
                                                onChange={(val) => setProvisionalDiagnosisInput(String(val || ''))}
                                                options={filteredDiagnosisOptions}
                                                placeholder="Select or type provisional diagnosis"
                                                allowCustom={true}
                                                onOpenChange={setIsProvDiagnosisOpen}
                                                className="flex-1"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => addDiagnosisTag(provisionalDiagnosisInput)}
                                                disabled={!String(provisionalDiagnosisInput || '').trim()}
                                                className="px-3 py-2 bg-brand text-white rounded-lg text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {selectedDiagnosisTags.length === 0 && (
                                            <span className="text-xs text-gray-500 dark:text-gray-400">No provisional diagnosis selected yet.</span>
                                        )}
                                        {selectedDiagnosisTags.map((diagnosis) => (
                                            <span key={diagnosis} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-brand/10 text-brand border border-brand/20">
                                                {diagnosis}
                                                <button
                                                    type="button"
                                                    onClick={() => removeDiagnosisTag(diagnosis)}
                                                    className="text-brand/70 hover:text-red-600"
                                                    aria-label={`Remove ${diagnosis}`}
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                    <div className="mt-2 flex gap-2 items-center">
                                        <button
                                            type="button"
                                            onClick={() => setShowTreatmentFilterModal(true)}
                                            className="px-3 py-2 bg-brand text-white rounded-lg text-xs font-semibold flex items-center gap-1 hover:opacity-90 transition-opacity whitespace-nowrap flex-shrink-0"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                                            </svg>
                                            Filters +
                                        </button>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">Use filters to refine diagnosis suggestions.</span>
                                    </div>
                                    {(diagFilterSystems || diagFilterPulseDiagnosis || diagFilterSpeciality || diagFilterOrgan) && (
                                        <div className="flex flex-wrap gap-1 mt-1.5 items-center">
                                            {diagFilterSystems && <span className="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full">System: {diagFilterSystems}</span>}
                                            {diagFilterPulseDiagnosis && <span className="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full">Pulse: {diagFilterPulseDiagnosis}</span>}
                                            {diagFilterSpeciality && <span className="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full">Speciality: {diagFilterSpeciality}</span>}
                                            {diagFilterOrgan && <span className="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full">Organ: {diagFilterOrgan}</span>}
                                            <button type="button" onClick={() => { setDiagFilterSystems(''); setDiagFilterPulseDiagnosis(''); setDiagFilterSpeciality(''); setDiagFilterOrgan('') }} className="text-xs text-red-500 hover:text-red-700 ml-1">✕ Clear filters</button>
                                        </div>
                                    )}
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Suggestions matched from major complaints are marked as SUGGESTED. In step 4, plans auto-open once in a single progress modal. Use Edit later to reopen.
                                    </p>
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-medium mb-1.5">Improvements</label>
                                    <input placeholder="Patient showing recovery" value={form.improvements} onChange={e => setForm({ ...form, improvements: e.target.value.toUpperCase() })} className="w-full px-3 py-2 border border-blue-200 dark:border-blue-700 rounded-lg bg-white/80 dark:bg-gray-800/80" />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-medium mb-1.5">Special Note</label>
                                    <input placeholder="Follow-up in 7 days" value={form.specialNote} onChange={e => setForm({ ...form, specialNote: e.target.value.toUpperCase() })} className="w-full px-3 py-2 border border-blue-200 dark:border-blue-700 rounded-lg bg-white/80 dark:bg-gray-800/80" />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-medium mb-1.5">Discussions</label>
                                    <input placeholder="Discussion notes" value={form.discussion} onChange={e => setForm({ ...form, discussion: e.target.value.toUpperCase() })} className="w-full px-3 py-2 border border-blue-200 dark:border-blue-700 rounded-lg bg-white/80 dark:bg-gray-800/80" />
                                </div>

                                {/* History / Reports - Split into two columns */}
                                <div>
                                    <label className="block text-sm font-medium mb-1.5">History</label>
                                    <VoiceInput
                                        label={null}
                                        rows={4}
                                        placeholder="Previous medical history"
                                        value={form.historyReports}
                                        onChange={(value) => setForm({ ...form, historyReports: String(value || '').toUpperCase() })}
                                        className="w-full"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1.5">Reports</label>
                                    <VoiceInput
                                        label={null}
                                        rows={4}
                                        placeholder="Lab reports, test results"
                                        value={form.reports}
                                        onChange={(value) => setForm({ ...form, reports: String(value || '').toUpperCase() })}
                                        className="w-full"
                                    />

                                    {/* Minimalistic Reports Attachments with Camera */}
                                    <div className="space-y-2">
                                        {/* File Upload & Camera Controls */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            <label className="cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-xs">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                                </svg>
                                                <span>File</span>
                                                <input
                                                    type="file"
                                                    multiple
                                                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,image/*"
                                                    onChange={handleReportsAttachmentUpload}
                                                    disabled={uploadingReports || reportsAttachments.length >= 10}
                                                    className="hidden"
                                                />
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!form.patientId) {
                                                        showError('Please select a patient first')
                                                        return
                                                    }
                                                    setShowCamera(true)
                                                }}
                                                disabled={uploadingReports || reportsAttachments.length >= 10}
                                                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 rounded hover:bg-sky-100 dark:hover:bg-sky-900/30 transition-colors text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                                <span>Camera</span>
                                            </button>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                {reportsAttachments.length}/10
                                            </span>
                                        </div>

                                        {/* Uploaded Files List */}
                                        {reportsAttachments.length > 0 && (
                                            <div className="space-y-1">
                                                {reportsAttachments.map((attachment, index) => (
                                                    <div key={index} className="flex items-center gap-2 p-1.5 bg-gray-50 dark:bg-gray-800 rounded text-xs">
                                                        <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="flex-1 truncate hover:text-blue-600">
                                                            {attachment.name}
                                                        </a>
                                                        <button
                                                            type="button"
                                                            onClick={() => removeReportsAttachment(index)}
                                                            className="text-gray-400 hover:text-red-600 p-0.5"
                                                        >
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Navigation Buttons for Step 2 */}
                        {currentStep === 2 && (
                            <div className="flex justify-between">
                                <button
                                    type="button"
                                    onClick={prevStep}
                                    className="px-4 sm:px-6 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105 flex items-center gap-2"
                                    title="Back to previous step"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    <span className="hidden sm:inline">Back</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={nextStep}
                                    className="px-4 sm:px-6 py-3 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/30 transition-all duration-300 hover:shadow-xl hover:scale-105 flex items-center gap-2"
                                    title="Next: Visit Tracking"
                                >
                                    <span className="hidden sm:inline">Next: Visit Tracking</span>
                                    <span className="sm:hidden">Next</span>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </div>
                        )}

                        {/* Next Visit & Tracking - Consolidated in single line */}
                        <div className="relative rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900/80 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-6"
                            style={{ display: currentStep !== 3 ? 'none' : 'block' }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-2xl"></div>
                            <h3 className="relative text-lg font-semibold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">Next Visit & Tracking</h3>
                            <div className="relative grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                <div>
                                    <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Next Visit Date</label>
                                    <DateInput type="date" placeholder="Select visit date" value={form.nextVisitDate} onChange={e => setForm({ ...form, nextVisitDate: e.target.value })} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Visit Number (V)</label>
                                    <input type="number" placeholder="1" value={form.visitNumber || ''} onChange={e => setForm({ ...form, visitNumber: e.target.value })} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all text-sm" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Follow-Up Count (FU)</label>
                                    <input type="number" placeholder="0" value={form.followUpCount || ''} onChange={e => setForm({ ...form, followUpCount: e.target.value })} className="w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all text-sm" />
                                </div>
                            </div>
                        </div>

                        {/* Medicines Selection Card */}
                        <div className={`relative rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900/80 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-6 ${isTreatmentSelectOpen || isMedicineSelectOpen ? 'z-[10000]' : 'z-0'}`}
                            style={{ display: currentStep !== 4 ? 'none' : 'block', overflow: 'visible', position: 'relative' }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-2xl"></div>
                            <h3 className="relative text-lg font-semibold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">Medicine Selection</h3>

                            {/* Add from Treatment Plan */}
                            <div className="relative mb-4 p-3 bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl backdrop-blur-sm" style={{ overflow: 'visible', position: 'relative', zIndex: 100 }}>
                                <label className="block text-sm font-medium mb-2">
                                    Quick Add from Treatment Plan
                                </label>
                                <div className="flex gap-2" style={{ position: 'relative', zIndex: 100 }}>
                                    <CustomSelect
                                        value={selectedProvDiagnosis || freeTextDiagnosis || ""}
                                        onChange={(value) => {
                                            // Match by provisional diagnosis OR treatment plan name (case-insensitive).
                                            const diagnosisTreatments = treatments.filter((t: any) =>
                                                !t.deleted && (
                                                    String(t.provDiagnosis || '').toLowerCase() === String(value || '').toLowerCase() ||
                                                    String(t.treatmentPlan || '').toLowerCase() === String(value || '').toLowerCase()
                                                )
                                            )
                                            
                                            if (diagnosisTreatments.length > 0) {
                                                // Existing diagnosis/plan match - open compare modal for canonical diagnosis.
                                                const canonicalDiagnosis = String(diagnosisTreatments[0]?.provDiagnosis || value || '')
                                                setSelectedProvDiagnosis(canonicalDiagnosis)
                                                setFreeTextDiagnosis('')
                                                openPlanCompareProgressModal([canonicalDiagnosis])
                                            } else {
                                                // This is free text - store it and show button to add plan later
                                                setFreeTextDiagnosis(value)
                                                setSelectedProvDiagnosis('')
                                                setShowAddPlanButton(true)
                                            }
                                        }}
                                        options={rankedDiagnosisOptions}
                                        placeholder="-- select or type diagnosis --"
                                        className="flex-1"
                                        allowCustom={true}
                                    />
                                </div>
                                {freeTextDiagnosis && !selectedTreatmentId && (
                                    <div className="mt-2 flex items-center gap-2 text-sm">
                                        <span className="text-blue-600 dark:text-blue-400 font-semibold">New Diagnosis:</span>
                                        <span className="text-gray-700 dark:text-gray-300">{freeTextDiagnosis}</span>
                                        <span className="text-gray-500 dark:text-gray-400 text-xs">(will create treatment plan when saving)</span>
                                    </div>
                                )}
                                <p className="text-xs text-muted mt-1">This will <strong>replace all medicines</strong> with the selected treatment plan. To add individual medicines, use the selector below.</p>
                            </div>

                            {/* Multi-diagnosis + multi-plan deterministic selection */}
                            {selectedDiagnosisTags.length > 0 && (
                                <div className="relative mb-4 p-2.5 bg-gradient-to-r from-indigo-50/70 to-blue-50/60 dark:from-indigo-900/25 dark:to-blue-900/20 border border-indigo-200/80 dark:border-indigo-800/70 rounded-xl backdrop-blur-sm">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Selected Diagnoses and Plans</label>
                                        <div className="flex items-center gap-2">
                                            {planCompareEligibleDiagnoses.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => openPlanCompareProgressModal(planCompareEligibleDiagnoses)}
                                                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
                                                >
                                                    Edit
                                                </button>
                                            )}
                                            {duplicateProductsForSelectedPlans.length > 0 && selectedTreatmentSelectionKey !== appliedPlanSelectionKey && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        const initialSelection: Record<string, boolean> = {}
                                                        duplicateProductsForSelectedPlans.forEach((item) => {
                                                            initialSelection[item.productId] = true
                                                        })
                                                        setDuplicateMergeItems(duplicateProductsForSelectedPlans)
                                                        setDuplicateMergeSelection(initialSelection)
                                                        setPendingSelectedTreatments(selectedTreatmentsForMerge)
                                                        setPendingMergeSelectionKey(selectedTreatmentSelectionKey)
                                                        setPausedPlanSelectionKey('')
                                                        setShowMergePlansModal(true)
                                                    }}
                                                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                                                >
                                                    Merge ({duplicateProductsForSelectedPlans.length})
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-2.5">
                                        {selectedDiagnosisTags.map((diagnosis) => {
                                            const plans = plansByDiagnosis.get(diagnosis) || []
                                            const selectedPlanIds = selectedPlansByDiagnosis[diagnosis] || []
                                            return (
                                                <div key={diagnosis} className="rounded-xl overflow-hidden border border-indigo-200/70 dark:border-indigo-700/60 bg-white/70 dark:bg-gray-800/70 shadow-sm">
                                                    <div className="flex items-center justify-between px-2.5 py-1.5 bg-indigo-50/70 dark:bg-indigo-900/20 border-b border-indigo-200/70 dark:border-indigo-700/50">
                                                        <div className="flex items-center gap-2">
                                                            <div className="text-xs font-semibold text-gray-800 dark:text-gray-100">{diagnosis}</div>
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-semibold leading-none">
                                                                {selectedPlanIds.length}/{plans.length} selected
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5">
                                                            {plans.length > 0 && selectedPlanIds.length < plans.length && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setSelectedPlansByDiagnosis((prev) => ({
                                                                            ...prev,
                                                                            [diagnosis]: plans.map((p: any) => String(p.id)),
                                                                        }))
                                                                        setSkippedPlanCompareDiagnoses((prev) => prev.filter((item) => item !== diagnosis))
                                                                    }}
                                                                    className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
                                                                >
                                                                    Add All
                                                                </button>
                                                            )}
                                                            {selectedPlanIds.length > 0 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        setSelectedPlansByDiagnosis((prev) => ({ ...prev, [diagnosis]: [] }))
                                                                        setSkippedPlanCompareDiagnoses((prev) => (prev.includes(diagnosis) ? prev : [...prev, diagnosis]))
                                                                    }}
                                                                    className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900/40"
                                                                >
                                                                    Remove All
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="p-2.5 space-y-2">
                                                        <div>
                                                            <div className="text-[11px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Available Plans</div>
                                                            {plans.length === 0 ? (
                                                                <div className="text-xs text-gray-500 dark:text-gray-400">No existing plan found for this diagnosis</div>
                                                            ) : (
                                                                <div className="flex flex-wrap gap-1.5">
                                                                    {plans.map((plan: any, idx: number) => {
                                                                        const planId = String(plan.id)
                                                                        const checked = selectedPlanIds.includes(planId)
                                                                        const label = plan.planNumber ? `Plan ${plan.planNumber}` : `Plan ${idx + 1}`
                                                                        return (
                                                                            <button
                                                                                key={planId}
                                                                                type="button"
                                                                                onClick={() => togglePlanSelection(diagnosis, planId, !checked)}
                                                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border transition-colors ${checked
                                                                                    ? 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                                                                                    : 'bg-indigo-50/50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/35'
                                                                                    }`}
                                                                            >
                                                                                <span className="font-semibold">{label}</span>
                                                                                <span className="text-gray-500 dark:text-gray-400">({plan.treatmentProducts?.length || 0} meds)</span>
                                                                                <span className="font-semibold">{checked ? 'ADDED' : 'ADD'}</span>
                                                                            </button>
                                                                        )
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div>
                                                            <div className="text-[11px] uppercase tracking-wide font-semibold text-gray-500 dark:text-gray-400 mb-1.5">Selected Treatment Plans</div>
                                                            {selectedPlanIds.length === 0 ? (
                                                                <div className="text-xs text-gray-500 dark:text-gray-400">No treatment plan selected yet.</div>
                                                            ) : (
                                                                <div className="space-y-1.5">
                                                                    {selectedPlanIds.map((planId) => {
                                                                        const plan: any = plans.find((p: any) => String(p.id) === String(planId))
                                                                        if (!plan) return null
                                                                        return (
                                                                            <div key={planId} className="flex items-center justify-between bg-white dark:bg-gray-900 rounded p-2 text-sm border border-gray-200 dark:border-gray-700">
                                                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                                                    <span className="font-medium truncate">
                                                                                        {plan.planNumber ? `Plan ${plan.planNumber}` : `Plan #${planId}`}
                                                                                    </span>
                                                                                    <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                                                                        {plan.treatmentProducts?.length || 0} meds
                                                                                    </span>
                                                                                </div>
                                                                                <div className="flex items-center gap-1.5">
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => {
                                                                                            setSelectedProvDiagnosis(diagnosis)
                                                                                            openPlanCompareProgressModal([diagnosis])
                                                                                        }}
                                                                                        className="text-brand hover:opacity-70 dark:text-brand text-xs font-semibold px-2"
                                                                                    >
                                                                                        Switch Plan
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => togglePlanSelection(diagnosis, String(planId), false)}
                                                                                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-semibold px-2"
                                                                                    >
                                                                                        Remove
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        )
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Add Individual Medicine */}
                            {products.length === 0 ? (
                                <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm">
                                    No medicines in inventory. Add products on the <a href="/products" className="text-brand underline font-medium">Inventory page</a>.
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-sm font-medium mb-2">Or Add Individual Medicine</label>
                                    <div className="mb-3" ref={medicineDropdownRef}>
                                        <CustomSelect
                                            value=""
                                            onChange={(value) => {
                                                if (value && value !== '') {
                                                    // Check stock status before adding
                                                    const product = products.find(p => String(p.id) === String(value))
                                                    if (product) {
                                                        const status = getStockStatus(product)
                                                        const unitParts = product.unit ? String(product.unit).trim().split(/\s+/) : []
                                                        const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                                                        const flowInventory = (Number(product.totalPurchased) || 0) - (Number(product.totalSales) || 0)
                                                        const actualInventory = unitQuantity > 0 ? Math.floor(flowInventory / unitQuantity) : 0
                                                        
                                                        // Critical stock - block addition
                                                        if (status.isRed) {
                                                            showError(`${product.name} is at critical stock level and cannot be added`)
                                                            return
                                                        }
                                                        
                                                        // Low stock - show warning but allow addition
                                                        if (status.isYellow) {
                                                            showWarning(`${product.name} is at low stock. Available: ${formatQuantity(actualInventory)} (${formatQuantity(flowInventory)})`)
                                                        }
                                                    }
                                                    
                                                    // Add to selectedMedicines if not already selected
                                                    if (!selectedMedicines.includes(value)) {
                                                        setSelectedMedicines([...selectedMedicines, value])
                                                    }
                                                }
                                            }}
                                            options={[
                                                { value: '', label: '-- select medicine from inventory --' },
                                                ...products
                                                    .map(p => {
                                                        const unitParts = p.unit ? String(p.unit).trim().split(/\s+/) : []
                                                        const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                                                        const flowInventory = (Number(p.totalPurchased) || 0) - (Number(p.totalSales) || 0)
                                                        const actualInventory = unitQuantity > 0 ? Math.floor(flowInventory / unitQuantity) : 0
                                                        const status = getStockStatus(p)
                                                        
                                                        let indicator = ''
                                                        if (status.isRed) {
                                                            indicator = ' 🔴 CRITICAL'
                                                        } else if (status.isYellow) {
                                                            indicator = ' 🟡 LOW'
                                                        } else if (status.isGreen) {
                                                            indicator = ' 🟢 PO'
                                                        }
                                                        
                                                        return {
                                                            value: String(p.id),
                                                            label: `${p.name} · Stock: ${formatQuantity(actualInventory)} (${formatQuantity(flowInventory)})${indicator}`
                                                        }
                                                    })
                                            ]}
                                            placeholder="-- select medicine from inventory --"
                                            className="flex-1"
                                            onOpenChange={setIsMedicineSelectOpen}
                                        />
                                    </div>

                                    {/* Selected / Treatment Plan Medicines List */}
                                    <div className="bg-blue-50/60 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 mb-3 backdrop-blur-sm">
                                        {selectedTreatmentId ? (
                                            // ── Treatment plan view: read-only hierarchy ──
                                            <>
                                                <div className="flex items-center justify-between mb-3">
                                                    <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                                                        Treatment Plan Medicines ({prescriptions.filter(p => p.productId).length})
                                                    </span>
                                                </div>
                                                {prescriptions.filter(p => p.productId).length === 0 ? (
                                                    <p className="text-center py-3 text-gray-500 dark:text-gray-400 text-sm italic">No medicines in this treatment plan.</p>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {prescriptions.filter(p => p.productId).map((rx, idx) => {
                                                            const mainProduct = products.find(p => String(p.id) === String(rx.productId))
                                                            const optIds: string[] = Array.isArray(rx.optionProductIds) ? rx.optionProductIds.map(String) : []
                                                            const mainStatus = mainProduct ? getStockStatus(mainProduct) : null
                                                            return (
                                                                <div key={idx} className="rounded-xl overflow-hidden border border-blue-200/70 dark:border-blue-700/60 shadow-sm bg-white dark:bg-gray-800/90">
                                                                    {/* Main product header */}
                                                                    <div className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-blue-50 to-sky-50/60 dark:from-blue-950/40 dark:to-sky-950/20">
                                                                        <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-blue-500 to-sky-500 flex-shrink-0"></div>
                                                                        <span className="flex-1 text-sm font-semibold text-blue-800 dark:text-blue-200">{mainProduct?.name || `Product #${rx.productId}`}</span>
                                                                        {mainProduct && (
                                                                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/80 dark:bg-gray-900/70 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300">
                                                                                Stock: {formatQuantity(mainStatus?.flowInventory || 0)}
                                                                            </span>
                                                                        )}
                                                                        {mainStatus?.isCritical && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-semibold">Critical</span>}
                                                                        {!mainStatus?.isCritical && mainStatus?.isLow && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-semibold">Low</span>}
                                                                        {mainStatus?.isGreen && <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 font-semibold">PO Pending</span>}
                                                                        {rx.bottleSize && <span className="text-xs text-gray-500 dark:text-gray-400">{rx.bottleSize} ml</span>}
                                                                    </div>
                                                                    {/* Options hierarchy */}
                                                                    {optIds.length > 0 && (
                                                                        <div className="px-4 py-2 space-y-1.5">
                                                                            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500">Options</p>
                                                                            {optIds.map((optId, optIdx) => {
                                                                                const optProduct = products.find(p => String(p.id) === optId)
                                                                                const optStatus = optProduct ? getStockStatus(optProduct) : null
                                                                                return (
                                                                                    <div key={optIdx} className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-lg bg-slate-50 dark:bg-gray-700/40 border border-slate-200/80 dark:border-gray-600/50">
                                                                                        <div className="flex flex-col items-center flex-shrink-0 self-stretch justify-center">
                                                                                            <div className="w-px h-2 bg-blue-300 dark:bg-blue-600"></div>
                                                                                            <div className="w-3 h-px bg-blue-300 dark:bg-blue-600"></div>
                                                                                        </div>
                                                                                        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-[9px] font-bold">{optIdx + 1}</span>
                                                                                        <span className="flex-1 text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{optProduct?.name || optId}</span>
                                                                                        {optProduct && (
                                                                                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-600 text-gray-700 dark:text-gray-300">{formatQuantity(optStatus?.flowInventory || 0)}</span>
                                                                                        )}
                                                                                        {optStatus?.isCritical && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-semibold">Critical</span>}
                                                                                        {!optStatus?.isCritical && optStatus?.isLow && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-semibold">Low</span>}
                                                                                    </div>
                                                                                )
                                                                            })}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            // ── Manual selection view ──
                                            <>
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                                                        Selected Medicines ({selectedMedicines.length})
                                                    </span>
                                                    {selectedMedicines.length > 0 && (
                                                        <div className="flex gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={removeAllSelectedMedicines}
                                                                className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg transition-colors shadow-sm"
                                                            >
                                                                Remove All
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={addAllSelectedMedicinesToPrescription}
                                                                className="px-3 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 rounded-lg transition-all shadow-sm hover:shadow-md"
                                                            >
                                                                Add All to Prescription
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                                {selectedTreatmentIds.length > 0 && previewMedicinesFromSelectedPlans.length > 0 && (
                                                    <div className="mb-3 rounded-lg border border-indigo-200 dark:border-indigo-700 bg-indigo-50/70 dark:bg-indigo-900/20 p-3">
                                                        <div className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300 mb-2">
                                                            Preview From Selected Plans ({previewMedicinesFromSelectedPlans.length})
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            {previewMedicinesFromSelectedPlans.map((item) => (
                                                                <div key={item.productId} className="flex items-center justify-between rounded-md px-2 py-1 bg-white/90 dark:bg-gray-800/90 border border-indigo-200 dark:border-indigo-700">
                                                                    <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300 truncate">{item.name}</span>
                                                                    <div className="flex items-center gap-2 ml-2">
                                                                        <span className="text-[11px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-semibold">
                                                                            Stock: {formatQuantity(item.flowInventory)}
                                                                        </span>
                                                                        {item.isCritical && (
                                                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-semibold">
                                                                                Critical
                                                                            </span>
                                                                        )}
                                                                        {!item.isCritical && item.isLow && (
                                                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-semibold">
                                                                                Low
                                                                            </span>
                                                                        )}
                                                                        {item.isGreen && (
                                                                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 font-semibold">
                                                                                PO Pending
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                {selectedMedicines.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center py-5 gap-3">
                                                        <p className="text-sm text-gray-500 dark:text-gray-400">No medicines selected yet.</p>
                                                        <button
                                                            type="button"
                                                            onClick={openMedicineDropdown}
                                                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                            </svg>
                                                            Add Product
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-2">
                                                        {selectedMedicines.map((productId) => {
                                                            const product = products.find(p => String(p.id) === productId)
                                                            if (!product) return null
                                                            const status = getStockStatus(product)
                                                            return (
                                                                <div key={productId} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded p-2 text-sm border border-gray-200 dark:border-gray-700">
                                                                    <div className="flex items-center gap-2 flex-1">
                                                                        <span className="font-medium">{product.name}</span>
                                                                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold">
                                                                            Stock: {formatQuantity(status.flowInventory)}
                                                                        </span>
                                                                        {status.isCritical && (
                                                                            <div className="flex items-center gap-1">
                                                                                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                                                                <span className="text-xs text-red-600 dark:text-red-400 font-semibold">Critical</span>
                                                                            </div>
                                                                        )}
                                                                        {!status.isCritical && status.isLow && (
                                                                            <div className="flex items-center gap-1">
                                                                                <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div>
                                                                                <span className="text-xs text-yellow-600 dark:text-yellow-400 font-semibold">Low</span>
                                                                            </div>
                                                                        )}
                                                                        {status.isGreen && (
                                                                            <div className="flex items-center gap-1">
                                                                                <div className="w-2 h-2 rounded-full bg-sky-500"></div>
                                                                                <span className="text-xs text-sky-600 dark:text-sky-400 font-semibold">PO Pending</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => removeFromSelectedMedicines(productId)}
                                                                        className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 font-semibold px-2"
                                                                    >
                                                                        Remove
                                                                    </button>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Navigation Buttons for Step 4 */}
                        {currentStep === 4 && (
                            <div className="flex justify-between">
                                <button
                                    type="button"
                                    onClick={prevStep}
                                    className="px-4 sm:px-6 py-3 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl shadow-lg transition-all duration-300 hover:shadow-xl hover:scale-105 flex items-center gap-2"
                                    title="Back to previous step"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    <span className="hidden sm:inline">Back</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={nextStep}
                                    className="px-4 sm:px-6 py-3 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/30 transition-all duration-300 hover:shadow-xl hover:scale-105 flex items-center gap-2"
                                    title="Next: Prescription Details"
                                >
                                    <span className="hidden sm:inline">Next: Prescription Details</span>
                                    <span className="sm:hidden">Next</span>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>
                            </div>
                        )}

                        {/* Prescriptions Card */}
                        {currentStep === 5 && (
                        <div className="relative rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-white dark:bg-gray-900 shadow-lg p-4 sm:p-6 overflow-visible">
                            <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                                <h3 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400 flex items-center gap-3">
                                    {prescriptions.length > 0 && (
                                        <label className="relative group/checkbox cursor-pointer flex-shrink-0">
                                            <input
                                                type="checkbox"
                                                checked={selectedPrescriptions.size === prescriptions.length && prescriptions.length > 0}
                                                onChange={toggleSelectAll}
                                                className="peer sr-only"
                                            />
                                            <div className="w-6 h-6 border-2 border-blue-400 dark:border-blue-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-blue-500 peer-checked:to-sky-600 peer-checked:border-blue-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-blue-500/50 group-hover/checkbox:border-blue-500 group-hover/checkbox:scale-110">
                                                <svg className="w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                            <div className="absolute inset-0 rounded-md bg-blue-400 opacity-0 peer-checked:opacity-20 blur-md transition-opacity duration-200 pointer-events-none"></div>
                                        </label>
                                    )}
                                    <span>Prescriptions {selectedPrescriptions.size > 0 && <span className="px-2 py-0.5 ml-2 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 rounded-full text-xs font-bold">({selectedPrescriptions.size} selected)</span>}</span>
                                </h3>
                                <div className="flex gap-2 flex-wrap">
                                    {prescriptions.length > 0 && (
                                        <>                                            
                                            {/* Remove Selected Button */}
                                            {selectedPrescriptions.size > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={removeSelectedPrescriptions}
                                                    className="px-3 sm:px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg transition-colors shadow-sm hover:shadow-md"
                                                    title={`Remove ${selectedPrescriptions.size} selected prescription(s)`}
                                                >
                                                    <svg className="w-4 h-4 inline sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                    <span className="hidden sm:inline">Remove Selected ({selectedPrescriptions.size})</span>
                                                    <span className="sm:hidden">Remove ({selectedPrescriptions.size})</span>
                                                </button>
                                            )}
                                            
                                            {/* Repeat Selected Button */}
                                            {selectedPrescriptions.size > 0 && (
                                                <>
                                                    {!showRepeatInput ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setShowRepeatInput(true)}
                                                            className="px-3 sm:px-4 py-2 text-sm font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 border border-purple-200 dark:border-purple-700 rounded-lg transition-colors shadow-sm hover:shadow-md"
                                                            title={`Repeat ${selectedPrescriptions.size} selected prescription(s)`}
                                                        >
                                                            <svg className="w-4 h-4 inline sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                            </svg>
                                                            <span className="hidden sm:inline">Repeat Selected</span>
                                                        </button>
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="number"
                                                                min="1"
                                                                value={repeatCount}
                                                                onChange={(e) => setRepeatCount(e.target.value)}
                                                                placeholder="Times"
                                                                className="w-20 px-2 py-2 text-sm border border-purple-300 dark:border-purple-700 rounded-lg focus:ring-2 focus:ring-purple-500 dark:bg-gray-800"
                                                                autoFocus
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={repeatSelectedPrescriptions}
                                                                className="px-3 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                                                                title="Confirm repeat"
                                                            >
                                                                ✓
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => { setShowRepeatInput(false); setRepeatCount(''); }}
                                                                className="px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                                                                title="Cancel"
                                                            >
                                                                ✕
                                                            </button>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                            
                                            <button 
                                                type="button" 
                                                onClick={undoAllStack.length > 0 ? undoRestoreAll : restoreDefaultValuesForAll}
                                                className={`px-3 sm:px-4 py-2 text-sm font-medium rounded-lg transition-all duration-300 shadow-sm hover:shadow-md ${
                                                    undoAllStack.length > 0 
                                                        ? 'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 border border-purple-200 dark:border-purple-700'
                                                        : 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-700'
                                                }`}
                                                title={undoAllStack.length > 0 ? 'Undo the last Restore Default on All action' : 'Restore default values (Qty: 15, Timing: AM, Dose: 10|TDS|WATER) for all medicines'}
                                            >
                                                <svg className="w-4 h-4 inline sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    {undoAllStack.length > 0 ? (
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                                    ) : (
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                    )}
                                                </svg>
                                                <span className="hidden sm:inline">{undoAllStack.length > 0 ? 'Undo All' : 'Restore Default on All'}</span>
                                            </button>
                                        </>
                                    )}
                                    <button type="button" onClick={addEmptyPrescription} className="px-3 sm:px-4 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-700 rounded-lg transition-colors shadow-sm hover:shadow-md" title="Add empty prescription row">
                                        <svg className="w-4 h-4 inline sm:mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        <span className="hidden sm:inline">Add Empty Row</span>
                                    </button>
                                </div>
                            </div>
                            {prescriptions.length === 0 ? (
                                <div className="relative text-center py-8 text-gray-500 dark:text-gray-400">
                                    No prescriptions added yet. Use the medicine selector above or click "Add Empty Row".
                                </div>
                            ) : (
                                <ThemedScrollArea className="space-y-3 max-h-[132rem] pr-1 overflow-x-visible">
                                    <div className={`sticky top-2 z-40 rounded-xl border border-sky-200/70 dark:border-sky-700/60 bg-sky-50/95 dark:bg-sky-900/30 backdrop-blur-sm shadow-sm ${previewExpanded ? 'p-2.5' : 'p-3'}`}>
                                        <div className="flex flex-col xl:flex-row gap-3 xl:items-end xl:justify-between">
                                            <div className="flex-1 min-w-0 xl:min-w-[240px]">
                                                <label className="block text-[11px] font-semibold text-sky-700 dark:text-sky-300 mb-1">Quick Find In Tab 5</label>
                                                <input
                                                    type="text"
                                                    ref={tab5SearchInputRef}
                                                    value={tab5SearchQuery}
                                                    onChange={(e) => setTab5SearchQuery(e.target.value)}
                                                    placeholder="Search by medicine, diagnosis, timing, dose, instruction..."
                                                    className="w-full px-3 py-2 text-sm border border-sky-300 dark:border-sky-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                                                />
                                            </div>

                                            <div className="flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 max-w-full [&>*]:shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => setTab5ShowSelectedOnly((prev) => !prev)}
                                                    className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${tab5ShowSelectedOnly ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/40'}`}
                                                >
                                                    Selected Only
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setTab5ShowIssuesOnly((prev) => !prev)}
                                                    className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${tab5ShowIssuesOnly ? 'bg-red-600 text-white border-red-600' : 'bg-white dark:bg-gray-800 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/40'}`}
                                                >
                                                    Stock Issues Only
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={clearTab5Filters}
                                                    disabled={!hasTab5Filters}
                                                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Clear Filters
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={selectVisiblePrescriptions}
                                                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 bg-white dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/40"
                                                >
                                                    Select Visible
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={clearPrescriptionSelection}
                                                    disabled={selectedPrescriptions.size === 0}
                                                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Clear Selection
                                                </button>
                                                {previewExpanded && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setTab5ShowMoreTools((prev) => !prev)}
                                                        className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${tab5ShowMoreTools ? 'bg-slate-700 text-white border-slate-700' : 'bg-white dark:bg-gray-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                                                    >
                                                        {tab5ShowMoreTools ? 'Less Tools' : 'More Tools'}
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {(!previewExpanded || tab5ShowMoreTools) && (
                                            <div className="mt-2 flex flex-nowrap items-center gap-2 overflow-x-auto pb-1 max-w-full [&>*]:shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={selectVisibleIssuePrescriptions}
                                                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 bg-white dark:bg-gray-800 hover:bg-rose-50 dark:hover:bg-rose-900/40"
                                                >
                                                    Select Visible Issues
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setAdvancedSectionsCollapsedForVisible(true)}
                                                    disabled={visiblePrescriptionIndices.length === 0}
                                                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 bg-white dark:bg-gray-800 hover:bg-sky-50 dark:hover:bg-sky-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Collapse Advanced
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setAdvancedSectionsCollapsedForVisible(false)}
                                                    disabled={visiblePrescriptionIndices.length === 0}
                                                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 bg-white dark:bg-gray-800 hover:bg-sky-50 dark:hover:bg-sky-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Expand Advanced
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setTab5PinSelectedToTop((prev) => !prev)}
                                                    className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${tab5PinSelectedToTop ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-800 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/40'}`}
                                                >
                                                    {tab5PinSelectedToTop ? 'Pinned: Selected First' : 'Pin Selected To Top'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={toggleTab5FocusMode}
                                                    disabled={visiblePrescriptionIndices.length === 0}
                                                    className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${tab5FocusMode ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-gray-800 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/40'}`}
                                                >
                                                    {tab5FocusMode ? 'Focus Mode: ON' : 'Focus Mode'}
                                                </button>
                                            </div>
                                        )}

                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                                            <span className="px-2 py-1 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-300 font-semibold">
                                                Visible: {visiblePrescriptionCount} / {prescriptions.length}
                                            </span>
                                            {hiddenPrescriptionCount > 0 && (
                                                <span className="px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold">
                                                    Hidden by filters: {hiddenPrescriptionCount}
                                                </span>
                                            )}
                                            {visibleIssueCount > 0 && (
                                                <span className="px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-semibold">
                                                    Visible stock alerts: {visibleIssueCount}
                                                </span>
                                            )}
                                            {tab5FocusMode && tab5FocusedIndex !== null && (
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => moveTab5Focus('prev')}
                                                        className="px-2 py-1 rounded-md bg-white dark:bg-gray-800 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 font-semibold"
                                                    >
                                                        Prev
                                                    </button>
                                                    <span className="px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold">
                                                        Focused row #{tab5FocusedIndex + 1}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        onClick={() => moveTab5Focus('next')}
                                                        className="px-2 py-1 rounded-md bg-white dark:bg-gray-800 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 font-semibold"
                                                    >
                                                        Next
                                                    </button>
                                                </div>
                                            )}
                                            <span className="hidden xl:inline-flex px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold">
                                                Shortcuts: / find, Alt+S visible, Alt+I issues, Alt+F focus, Alt+Enter apply selected
                                            </span>
                                        </div>
                                    </div>

                                    {/* Default MISC Products Row */}
                                    <div className="relative bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-2 border-amber-200 dark:border-amber-700 rounded-xl p-4 shadow-md">
                                        <div className="flex items-center justify-between gap-4 flex-wrap">
                                            <div className="flex items-center gap-2">
                                                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                                <span className="text-sm font-bold text-amber-800 dark:text-amber-300">Default Items (Auto-Added)</span>
                                            </div>
                                            <div className="flex items-center gap-6 flex-wrap">
                                                {['RX PAD', 'FILE COVER', 'ENVELOPS'].map((productName) => {
                                                    const miscProduct = products.find(p => 
                                                        p.name?.toUpperCase() === productName && 
                                                        p.category?.name?.toUpperCase() === 'MISC'
                                                    )
                                                    return (
                                                        <label key={productName} className="flex items-center gap-2.5 cursor-pointer group/misc">
                                                            <div className="relative">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={defaultMiscProducts[productName]}
                                                                    onChange={(e) => setDefaultMiscProducts({
                                                                        ...defaultMiscProducts,
                                                                        [productName]: e.target.checked
                                                                    })}
                                                                    className="peer sr-only"
                                                                />
                                                                <div className="w-5 h-5 border-2 border-blue-300 dark:border-blue-600 rounded-md peer-checked:bg-gradient-to-br peer-checked:from-blue-500 peer-checked:to-sky-500 peer-checked:border-blue-500 flex items-center justify-center shadow-sm peer-checked:shadow-blue-500/30">
                                                                    <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                </div>
                                                            </div>
                                                            <span className="text-sm font-medium text-amber-900 dark:text-amber-200 group-hover/misc:text-amber-700 dark:group-hover/misc:text-amber-300 transition-colors">
                                                                {productName}
                                                                {miscProduct && (
                                                                    <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">
                                                                        (Stock: {formatQuantity((Number(miscProduct.totalPurchased) || 0) - (Number(miscProduct.totalSales) || 0))})
                                                                    </span>
                                                                )}
                                                            </span>
                                                        </label>
                                                    )
                                                })}
                                                {/* Medicine Box with quantity dropdown */}
                                                {(() => {
                                                    const medicineBoxProduct = products.find(p => 
                                                        p.name?.toUpperCase() === 'MEDICINE BOX' && 
                                                        p.category?.name?.toUpperCase() === 'MISC'
                                                    )
                                                    return (
                                                        <div className="flex items-center gap-2.5">
                                                            <label className="flex items-center gap-2.5 cursor-pointer group/misc">
                                                                <div className="relative">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={defaultMiscProducts['MEDICINE BOX']}
                                                                        onChange={(e) => {
                                                                            setDefaultMiscProducts({
                                                                                ...defaultMiscProducts,
                                                                                'MEDICINE BOX': e.target.checked
                                                                            })
                                                                            if (!e.target.checked) {
                                                                                setMedicineBoxQuantity(0)
                                                                            }
                                                                        }}
                                                                        className="peer sr-only"
                                                                    />
                                                                    <div className="w-5 h-5 border-2 border-blue-300 dark:border-blue-600 rounded-md peer-checked:bg-gradient-to-br peer-checked:from-blue-500 peer-checked:to-sky-500 peer-checked:border-blue-500 flex items-center justify-center shadow-sm peer-checked:shadow-blue-500/30">
                                                                        <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                        </svg>
                                                                    </div>
                                                                </div>
                                                                <span className="text-sm font-medium text-amber-900 dark:text-amber-200 group-hover/misc:text-amber-700 dark:group-hover/misc:text-amber-300 transition-colors">
                                                                    MEDICINE BOX
                                                                    {medicineBoxProduct && (
                                                                        <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">
                                                                            (Stock: {formatQuantity((Number(medicineBoxProduct.totalPurchased) || 0) - (Number(medicineBoxProduct.totalSales) || 0))})
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            </label>
                                                            <select
                                                                value={medicineBoxQuantity}
                                                                onChange={(e) => setMedicineBoxQuantity(Number(e.target.value))}
                                                                disabled={!defaultMiscProducts['MEDICINE BOX']}
                                                                className="px-2 py-1 text-sm bg-white dark:bg-gray-800 border border-amber-300 dark:border-amber-600 rounded-md text-amber-900 dark:text-amber-200 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                                            >
                                                                <option value={0}>0</option>
                                                                <option value={1}>1</option>
                                                                <option value={2}>2</option>
                                                            </select>
                                                        </div>
                                                    )
                                                })()}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="relative bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-4 shadow-sm">
                                        <button
                                            type="button"
                                            onClick={() => setIsBulkDosagePanelOpen(!isBulkDosagePanelOpen)}
                                            className="w-full flex items-center justify-between gap-3 text-left"
                                        >
                                            <div>
                                                <div className="text-sm font-bold text-blue-800 dark:text-blue-300">Bulk Dosage & Administration Details</div>
                                                <div className="text-xs text-blue-600 dark:text-blue-400">Set once and apply exactly to all products in this tab</div>
                                            </div>
                                            <svg className={`w-5 h-5 text-blue-600 dark:text-blue-400 transition-transform ${isBulkDosagePanelOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>

                                        {isBulkDosagePanelOpen && (
                                            <div className="mt-4 pt-4 border-t border-blue-200/70 dark:border-blue-700/60 space-y-4">
                                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                                    <div>
                                                        <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Qty</label>
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            value={bulkDosageAdminValues.quantity}
                                                            onChange={(e) => setBulkDosageAdminValues({ ...bulkDosageAdminValues, quantity: e.target.value })}
                                                            placeholder="0"
                                                            className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-xs h-8 dark:bg-gray-800"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Timing</label>
                                                        <CustomSelect
                                                            value={bulkDosageAdminValues.timing}
                                                            onChange={(val) => setBulkDosageAdminValues({ ...bulkDosageAdminValues, timing: val })}
                                                            options={timingWithPlaceholder}
                                                            placeholder="Time"
                                                            allowCustom={true}
                                                            className="text-xs h-8"
                                                            loading={loadingOptions}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Dose</label>
                                                        <CustomSelect
                                                            value={bulkDosageAdminValues.doseQuantity}
                                                            onChange={(val) => setBulkDosageAdminValues({ ...bulkDosageAdminValues, doseQuantity: val })}
                                                            options={doseQuantityWithPlaceholder}
                                                            placeholder="Dose"
                                                            allowCustom={true}
                                                            className="text-xs h-8"
                                                            loading={loadingOptions}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Frequency</label>
                                                        <CustomSelect
                                                            value={bulkDosageAdminValues.doseTiming}
                                                            onChange={(val) => setBulkDosageAdminValues({ ...bulkDosageAdminValues, doseTiming: val })}
                                                            options={doseTimingWithPlaceholder}
                                                            placeholder="Frequency"
                                                            allowCustom={true}
                                                            className="text-xs h-8"
                                                            loading={loadingOptions}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Along With</label>
                                                        <CustomSelect
                                                            value={bulkDosageAdminValues.dilution}
                                                            onChange={(val) => setBulkDosageAdminValues({ ...bulkDosageAdminValues, dilution: val })}
                                                            options={dilutionWithPlaceholder}
                                                            placeholder="Dilution"
                                                            allowCustom={true}
                                                            className="text-xs h-8"
                                                            loading={loadingOptions}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Instruction</label>
                                                        <CustomSelect
                                                            value={bulkDosageAdminValues.procedure}
                                                            onChange={(val) => setBulkDosageAdminValues({ ...bulkDosageAdminValues, procedure: val })}
                                                            options={procedureWithPlaceholder}
                                                            placeholder="Instruction"
                                                            allowCustom={true}
                                                            className="text-xs h-8"
                                                            loading={loadingOptions}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Presentation</label>
                                                        <CustomSelect
                                                            value={bulkDosageAdminValues.presentation}
                                                            onChange={(val) => setBulkDosageAdminValues({ ...bulkDosageAdminValues, presentation: val })}
                                                            options={presentationWithPlaceholder}
                                                            placeholder="Presentation"
                                                            allowCustom={true}
                                                            className="text-xs h-8"
                                                            loading={loadingOptions}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">Site</label>
                                                        <CustomSelect
                                                            value={bulkDosageAdminValues.administration}
                                                            onChange={(val) => setBulkDosageAdminValues({ ...bulkDosageAdminValues, administration: val })}
                                                            options={administrationWithPlaceholder}
                                                            placeholder="Site"
                                                            allowCustom={true}
                                                            className="text-xs h-8"
                                                            loading={loadingOptions}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap justify-end gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={applyBulkDosageAdministrationToSelected}
                                                        disabled={selectedPrescriptions.size === 0}
                                                        className="px-4 py-2 text-sm font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        Apply To Selected ({selectedPrescriptions.size})
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={applyBulkDosageAdministrationToAll}
                                                        className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 rounded-lg shadow-md transition-all"
                                                    >
                                                        Apply To All Products
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Regular Prescriptions grouped by diagnosis */}
                                    {visibleGroupedPrescriptionSections.map((section) => {
                                        const sectionPlanId = section.items.find(({ pr }) => pr?.treatmentId)?.pr?.treatmentId
                                        return (
                                        <div key={section.diagnosis} className="space-y-2">
                                            <div className="px-3 py-1.5 rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 text-xs font-semibold text-sky-700 dark:text-sky-300 flex items-center justify-between gap-2">
                                                <span>{section.diagnosis}</span>
                                                {sectionPlanId && (
                                                    <button
                                                        type="button"
                                                        onClick={() => addEmptyPrescriptionForTreatment(String(sectionPlanId))}
                                                        className="px-2 py-1 rounded-md text-[10px] font-semibold bg-sky-600 text-white hover:bg-sky-700"
                                                    >
                                                        Add Empty Row For This Treatment Only
                                                    </button>
                                                )}
                                            </div>
                                            {section.items.map(({ pr, index: i }) => {
                                        const prescriptionTreatment = pr.treatmentId && Array.isArray(treatments) ? treatments.find(t => String(t.id) === String(pr.treatmentId)) : null
                                        const isDeleted = prescriptionTreatment?.deleted === true
                                        const isFocusedRow = tab5FocusMode && tab5FocusedIndex === i
                                        
                                        // Pre-calculate product and category info to avoid repeated lookups
                                        const prOptIds: string[] = pr.optionProductIds || []
                                        const prHasOpts = prOptIds.length > 0
                                        const prActiveIdx = pr.activeOptionIndex ?? -1
                                        const prDisplayProdId = prActiveIdx === -1 ? String(pr.productId) : (prOptIds[prActiveIdx] || String(pr.productId))
                                        const product = products.find(p => String(p.id) === prDisplayProdId)
                                        const prFlipAnimClass = prFlipPhase[i] === 'out'
                                            ? (prFlipDir[i] === 'right' ? 'med-flip-out-left' : 'med-flip-out-right')
                                            : prFlipPhase[i] === 'in'
                                            ? (prFlipDir[i] === 'right' ? 'med-flip-in-right' : 'med-flip-in-left')
                                            : ''
                                        const categoryName = product ? (typeof product.category === 'string' ? product.category : product.category?.name || '').toLowerCase() : ''
                                        const fieldVisibility = getPrescriptionFieldVisibility(product)
                                        const showDropperInput = fieldVisibility.dropper
                                        const showSpyFields = fieldVisibility.spagyricComponents
                                        const showAdditions = fieldVisibility.additions
                                        const showBottleSize = fieldVisibility.bottleSize
                                        const showQuantityInput = fieldVisibility.quantity
                                        const showTimingInput = fieldVisibility.timing
                                        const showDoseQuantityInput = fieldVisibility.doseQuantity
                                        const showDoseTimingInput = fieldVisibility.doseTiming
                                        const showDilutionInput = fieldVisibility.dilution
                                        const showProcedureInput = fieldVisibility.procedure
                                        const showPresentationInput = fieldVisibility.presentation
                                        const showAdministrationInput = fieldVisibility.administration
                                        
                                        // Pre-parse dosage to avoid repeated parsing in onChange handlers
                                        const parsedDosageValues = parseDosage(pr.dosage || '')
                                        const isProductDropdownOpen = Boolean(isPrescriptionDropdownOpen[i]?.product)

                                        return (
                                            <div 
                                                key={`prescription-${i}-${pr.productId || 'empty'}`} 
                                                draggable={!isDeleted}
                                                onDragStart={(e) => {
                                                    setDraggedItemIndex(i)
                                                    e.dataTransfer.effectAllowed = 'move'
                                                    // Add a subtle visual indicator
                                                    e.currentTarget.style.opacity = '0.5'
                                                }}
                                                onDragEnd={(e) => {
                                                    e.currentTarget.style.opacity = '1'
                                                    setDraggedItemIndex(null)
                                                }}
                                                onDragOver={(e) => {
                                                    e.preventDefault()
                                                    e.dataTransfer.dropEffect = 'move'
                                                }}
                                                onDrop={(e) => {
                                                    e.preventDefault()
                                                    if (draggedItemIndex !== null && draggedItemIndex !== i) {
                                                        reorderPrescriptions(draggedItemIndex, i)
                                                    }
                                                }}
                                                className={`relative group overflow-visible transition-all duration-200 ${isDeleted ? 'border border-red-400/50 dark:border-red-600/50 bg-red-50/50 dark:bg-red-950/30 rounded-2xl' : 'border border-blue-200/40 dark:border-blue-700/40 bg-white dark:bg-gray-800 rounded-2xl hover:border-blue-400/60 dark:hover:border-blue-600/60'} ${!isDeleted ? 'cursor-move' : ''} ${tab5FocusMode && !isFocusedRow ? 'opacity-45' : ''} ${isFocusedRow ? 'ring-2 ring-sky-400 dark:ring-sky-500 shadow-xl shadow-sky-500/15' : ''} ${isProductDropdownOpen ? 'z-[70]' : 'z-0 hover:z-20 focus-within:z-30'}`}
                                            >
                                                <button
                                                    type="button"
                                                    onClick={() => focusPrescriptionRow(i)}
                                                    className="absolute top-2 right-2 z-20 px-2 py-1 rounded-md text-[10px] font-semibold bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-700 hover:bg-sky-200 dark:hover:bg-sky-900/60"
                                                    title="Focus this row"
                                                >
                                                    Focus
                                                </button>
                                                {/* Drag handle indicator */}
                                                {!isDeleted && (
                                                    <div className="absolute -left-3 top-1/2 -translate-y-1/2 flex flex-col gap-0.5 opacity-0 group-hover:opacity-60 pointer-events-none">
                                                        <div className="w-1 h-1 bg-blue-600 dark:bg-blue-400 rounded-full"></div>
                                                        <div className="w-1 h-1 bg-blue-600 dark:bg-blue-400 rounded-full"></div>
                                                        <div className="w-1 h-1 bg-blue-600 dark:bg-blue-400 rounded-full"></div>
                                                        <div className="w-1 h-1 bg-blue-600 dark:bg-blue-400 rounded-full"></div>
                                                    </div>
                                                )}
                                                
                                                {/* Selection Checkbox */}
                                                {!isDeleted && (
                                                    <div className="absolute top-4 left-4 z-10">
                                                        <label className="relative group/checkbox cursor-pointer flex-shrink-0">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedPrescriptions.has(i)}
                                                                onChange={() => togglePrescriptionSelection(i)}
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="peer sr-only"
                                                            />
                                                            <div className="w-6 h-6 border-2 border-blue-400 dark:border-blue-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-blue-500 peer-checked:to-sky-600 peer-checked:border-blue-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-blue-500/50 group-hover/checkbox:border-blue-500 group-hover/checkbox:scale-110">
                                                                <svg className="w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                </svg>
                                                            </div>
                                                        </label>
                                                    </div>
                                                )}
                                                
                                                {/* Futuristic glow effect on hover */}
                                                {!isDeleted && (
                                                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-400/0 via-sky-400/0 to-blue-500/0 group-hover:from-blue-400/5 group-hover:via-sky-400/5 group-hover:to-blue-500/5 transition-all duration-300 pointer-events-none"></div>
                                                )}

                                                {isDeleted && (
                                                    <div className="mb-3 p-2.5 bg-red-100/80 dark:bg-red-900/50 border border-red-300/50 dark:border-red-700/50 rounded-xl text-sm backdrop-blur-sm">
                                                        <span className="text-red-700 dark:text-red-300 font-semibold">⚠ DELETED TREATMENT PLAN - Read Only</span>
                                                    </div>
                                                )}
                                                <div className={`relative overflow-visible ${!isDeleted ? 'pl-12' : ''} p-4`}>
                                                    {/* Row 1: Medicine Name (Left) + 3x3 SPY Grid (Right) */}
                                                    <div className={`flex flex-col ${previewExpanded ? 'gap-3' : 'lg:flex-row gap-4'} mb-3`}>
                                                        {/* LEFT: Medicine Info */}
                                                        <div className={previewExpanded ? 'w-full' : 'w-full lg:w-64 lg:flex-shrink-0'}>
                                                            {/* Header: label + option indicator */}
                                                            <div className="flex items-center justify-between mb-2">
                                                                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Medicine</label>
                                                                {prHasOpts && (
                                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${prActiveIdx === -1 ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300' : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'}`}>
                                                                        {prActiveIdx === -1 ? `${prOptIds.length} opt${prOptIds.length > 1 ? 's' : ''}` : `OPT ${prActiveIdx + 1} / ${prOptIds.length}`}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {/* Card with floating nav arrows */}
                                                            <div className="relative med-card-wrap">
                                                                {/* Left / Prev arrow */}
                                                                {prHasOpts && (
                                                                    <button type="button" onClick={() => navigatePrOption(i, 'left')} disabled={isDeleted}
                                                                        className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-white dark:bg-gray-700 border border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 shadow transition-all hover:scale-110 disabled:opacity-40">
                                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7"/></svg>
                                                                    </button>
                                                                )}
                                                                {/* Right / Next arrow */}
                                                                {prHasOpts && (
                                                                    <button type="button" onClick={() => navigatePrOption(i, 'right')} disabled={isDeleted}
                                                                        className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-white dark:bg-gray-700 border border-indigo-200 dark:border-indigo-700 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/50 shadow transition-all hover:scale-110 disabled:opacity-40">
                                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/></svg>
                                                                    </button>
                                                                )}
                                                                {/* Flip animation */}
                                                                <div className={prFlipAnimClass}>
                                                            {pr.productId ? (
                                                                <div className="relative p-3 text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                                                    {/* Top bar: index badge + name */}
                                                                    <div className="flex items-start gap-2 mb-2 pr-6">
                                                                        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-gradient-to-br from-blue-600 to-sky-500 text-white rounded-md text-[10px] font-bold shadow-sm">{i + 1}</span>
                                                                        <span className={`font-semibold leading-snug text-gray-800 dark:text-gray-100 ${pr.patientHasMedicine ? 'line-through text-gray-400' : ''}`}>{product ? product.name : `Product #${prDisplayProdId}`}</span>
                                                                    </div>
                                                                    {/* Edit button */}
                                                                    {!isDeleted && (
                                                                        <button type="button" onClick={() => updatePrescription(i, { productId: '' })}
                                                                            className="absolute top-2.5 right-2.5 p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors" title="Change medicine">
                                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                            </svg>
                                                                        </button>
                                                                    )}
                                                                    {product?.category && (
                                                                        <div className="space-y-1.5">
                                                                            <div className="flex items-center gap-1 text-[10px]">
                                                                                {product.unit ? (
                                                                                    <span className="px-1.5 py-0.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-full">
                                                                                        {categoryName} {(() => {
                                                                                            const unitParts = String(product.unit).trim().split(/\s+/)
                                                                                            const unitType = unitParts.length >= 2 ? unitParts[1] : ''
                                                                                            return unitType ? `(${unitType})` : ''
                                                                                        })()}
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="px-1.5 py-0.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-full">
                                                                                        {categoryName}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            {product && (
                                                                                <div className="space-y-1">
                                                                                    <div className="text-[10px] text-gray-500">Stock: {(() => {
                                                                                        const unitParts = product.unit ? String(product.unit).trim().split(/\s+/) : []
                                                                                        const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                                                                                        const flowInventory = (Number(product.totalPurchased) || 0) - (Number(product.totalSales) || 0)
                                                                                        const actualInventory = unitQuantity > 0 ? Math.floor(flowInventory / unitQuantity) : 0
                                                                                        return `${formatQuantity(actualInventory)} (${formatQuantity(flowInventory)})`
                                                                                    })()}</div>
                                                                                    {/* Stock Status Indicators */}
                                                                                    {(() => {
                                                                                        const status = getStockStatus(product)
                                                                                        return (
                                                                                            <div className="space-y-1 mt-1.5">
                                                                                                {status.isRed && (
                                                                                                    <div className="flex items-center gap-1.5 text-[9px] font-semibold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">
                                                                                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                                                                                                        <span>Low Stock</span>
                                                                                                    </div>
                                                                                                )}
                                                                                                {status.isYellow && !status.isRed && (
                                                                                                    <div className="flex items-center gap-1.5 text-[9px] font-semibold text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 px-2 py-1 rounded">
                                                                                                        <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse"></div>
                                                                                                        <span>Low Stock</span>
                                                                                                    </div>
                                                                                                )}
                                                                                                {status.isGreen && (
                                                                                                    <div className="flex items-center gap-1.5 text-[9px] font-semibold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/20 px-2 py-1 rounded">
                                                                                                        <div className="w-1.5 h-1.5 rounded-full bg-sky-500"></div>
                                                                                                        <span>PO Made - Not Received</span>
                                                                                                    </div>
                                                                                                )}
                                                                                            </div>
                                                                                        )
                                                                                    })()}
                                                                                    {showBottleSize && (
                                                                                        <div className="mt-2">
                                                                                            <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400 mb-1">Bottle Size</label>
                                                                                            <CustomSelect
                                                                                                value={pr.bottleSize || ''}
                                                                                                onChange={(val) => {
                                                                                                    if (!isDeleted) {
                                                                                                        const bottleSizeNum = parseInt(val)
                                                                                                        const dropperProducts = products.filter(p => 
                                                                                                            p.category?.name?.toUpperCase() === 'MISC' && 
                                                                                                            p.name?.toUpperCase().includes('DROPPER')
                                                                                                        )
                                                                                                        let selectedDropper = ''
                                                                                                        if (dropperProducts.length > 0 && !isNaN(bottleSizeNum)) {
                                                                                                            const matchingDropper = dropperProducts.find(p => {
                                                                                                                const name = p.name?.toLowerCase() || ''
                                                                                                                return name.includes(`${bottleSizeNum} ml`) || name.includes(`${bottleSizeNum}ml`)
                                                                                                            })
                                                                                                            if (matchingDropper) {
                                                                                                                selectedDropper = String(matchingDropper.id)
                                                                                                            } else {
                                                                                                                const dropperSizes = dropperProducts
                                                                                                                    .map(p => {
                                                                                                                        const match = p.name?.match(/(\d+)\s*ml/i)
                                                                                                                        return match ? { id: p.id, size: parseInt(match[1]), name: p.name } : null
                                                                                                                    })
                                                                                                                    .filter((d): d is { id: number; size: number; name: string } => d !== null && d.size <= bottleSizeNum)
                                                                                                                    .sort((a, b) => b.size - a.size)
                                                                                                                if (dropperSizes.length > 0) {
                                                                                                                    selectedDropper = String(dropperSizes[0].id)
                                                                                                                } else {
                                                                                                                    const allDropperSizes = dropperProducts
                                                                                                                        .map(p => {
                                                                                                                            const match = p.name?.match(/(\d+)\s*ml/i)
                                                                                                                            return match ? { id: p.id, size: parseInt(match[1]), name: p.name } : null
                                                                                                                        })
                                                                                                                        .filter((d): d is { id: number; size: number; name: string } => d !== null)
                                                                                                                        .sort((a, b) => b.size - a.size)
                                                                                                                    if (allDropperSizes.length > 0) {
                                                                                                                        selectedDropper = String(allDropperSizes[0].id)
                                                                                                                    }
                                                                                                                }
                                                                                                            }
                                                                                                        }
                                                                                                        updatePrescription(i, { 
                                                                                                            bottleSize: val,
                                                                                                            quantity: !isNaN(bottleSizeNum) ? bottleSizeNum : pr.quantity,
                                                                                                            selectedDropper: showDropperInput ? selectedDropper : ''
                                                                                                        })
                                                                                                    }
                                                                                                }}
                                                                                                options={bottlePricingWithPlaceholder}
                                                                                                placeholder="Bottle Size"
                                                                                                className="text-xs h-8"
                                                                                            />
                                                                                        </div>
                                                                                    )}
                                                                                    {showDropperInput && (
                                                                                        <div className="mt-4">
                                                                                            <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400 mb-1">Dropper</label>
                                                                                            <CustomSelect
                                                                                                value={pr.selectedDropper || ''}
                                                                                                onChange={(val) => { if (!isDeleted) updatePrescription(i, { selectedDropper: val }) }}
                                                                                                options={[
                                                                                                    { value: '', label: 'No Dropper' },
                                                                                                    ...products
                                                                                                        .filter(p => p.category?.name?.toUpperCase() === 'MISC' && p.name?.toUpperCase().includes('DROPPER'))
                                                                                                        .map(p => ({ value: String(p.id), label: p.name }))
                                                                                                ]}
                                                                                                placeholder="Select Dropper"
                                                                                                className="text-xs h-8"
                                                                                            />
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                <CustomSelect
                                                                    key={`medicine-select-${i}`}
                                                                    value={pr.productId}
                                                                    onChange={(val) => {
                                                                        if (!isDeleted) {
                                                                            if (val === '' || products.some(p => String(p.id) === val)) {
                                                                                updatePrescription(i, { productId: val })
                                                                                if (val) {
                                                                                    const sel = products.find(p => String(p.id) === val)
                                                                                    if (sel) {
                                                                                        const st = getStockStatus(sel)
                                                                                        if (st.isCritical) {
                                                                                            triggerFieldShake(i)
                                                                                            triggerVibrate()
                                                                                            playAlertTone()
                                                                                            showError(`⚠️ Critical stock: ${sel.name} ≤10% of minimum threshold (${st.flowInventory} units left)`)
                                                                                        } else if (st.isLow) {
                                                                                            showWarning(`Low stock: ${sel.name} is below 30% of minimum threshold (${st.flowInventory} units)`)
                                                                                        }
                                                                                    }
                                                                                }
                                                                            }
                                                                        }
                                                                    }}
                                                                    options={[
                                                                        { value: '', label: '-- select medicine --' },
                                                                        ...products.map(p => {
                                                                            const unitParts = p.unit ? String(p.unit).trim().split(/\s+/) : []
                                                                            const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                                                                            const flowInventory = (Number(p.totalPurchased) || 0) - (Number(p.totalSales) || 0)
                                                                            const actualInventory = unitQuantity > 0 ? Math.floor(flowInventory / unitQuantity) : 0
                                                                            return {
                                                                                value: String(p.id),
                                                                                label: `${p.name} · Stock: ${formatQuantity(actualInventory)} (${formatQuantity(flowInventory)})${p.reorderLevel ? ' · Reorder: ' + p.reorderLevel : ''}`
                                                                            }
                                                                        })
                                                                    ]}
                                                                    placeholder="-- select --"
                                                                    className={`text-xs h-9 ${isDeleted ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''} ${shakingPrescriptionIndices.has(i) ? 'animate-shake' : ''}`}
                                                                    onOpenChange={(open) => setIsPrescriptionDropdownOpen((prev) => ({
                                                                        ...prev,
                                                                        [i]: {
                                                                            ...(prev[i] || {}),
                                                                            product: open,
                                                                        },
                                                                    }))}
                                                                />
                                                            )}
                                                                </div>{/* end flip anim */}
                                                                {/* Page dots */}
                                                                {prHasOpts && pr.productId && (
                                                                    <div className="flex items-center justify-center gap-1.5 mt-2">
                                                                        <div className={`w-1.5 h-1.5 rounded-full transition-all ${prActiveIdx === -1 ? 'bg-blue-600 dark:bg-blue-400 scale-125' : 'bg-gray-300 dark:bg-gray-600'}`}/>
                                                                        {prOptIds.map((_: string, oi: number) => (
                                                                            <div key={oi} className={`w-1.5 h-1.5 rounded-full transition-all ${prActiveIdx === oi ? 'bg-indigo-600 dark:bg-indigo-400 scale-125' : 'bg-gray-300 dark:bg-gray-600'}`}/>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>{/* end relative card wrapper */}
                                                        </div>{/* end LEFT */}

                                                        {/* RIGHT: SPY Grid + Additions */}
                                                        {showSpyFields && (
                                                        <div className={`flex-1 ${isDeleted ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''}`}>
                                                            <label className="block text-xs font-semibold mb-2 text-gray-600 dark:text-gray-400">Spagyric Components</label>
                                                            {/* Row 1: SPY 1-3 */}
                                                            <div className={previewExpanded ? 'grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3' : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-3'}>{[1, 2, 3].map(num => {
                                                                    const spyKey = `spy${num}` as keyof typeof pr
                                                                    const spyValue = pr[spyKey] as string || ''
                                                                    const parsedSpy = parseComponent(spyValue)
                                                                    return (
                                                                        <div key={num} className="flex gap-1">
                                                                            <CustomSelect
                                                                                value={parsedSpy.name}
                                                                                onChange={(val) => {
                                                                                    updatePrescription(i, { [spyKey]: formatComponent(val.toUpperCase(), parsedSpy.volume) })
                                                                                }}
                                                                                options={spagyricComponentsWithPlaceholder}
                                                                                placeholder={`SPY${num}`}
                                                                                allowCustom={true}
                                                                                className="flex-1 text-xs h-8"
                                                                                loading={loadingOptions}
                                                                            />
                                                                            <input
                                                                                type="text"
                                                                                value={parsedSpy.volume}
                                                                                onChange={(e) => {
                                                                                    updatePrescription(i, { [spyKey]: formatComponent(parsedSpy.name, e.target.value) })
                                                                                }}
                                                                                placeholder="Drops"
                                                                                className={`${previewExpanded ? 'w-12' : 'w-14'} px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs h-8 dark:bg-gray-800 text-center`}
                                                                            />
                                                                        </div>
                                                                    )
                                                                })}
                                                            </div>
                                                            <label 
                                                                className="flex items-center gap-2 text-xs font-semibold mb-2 mt-2 text-gray-600 dark:text-gray-400 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                                                onClick={() => {
                                                                    setCollapsedSections(prev => ({
                                                                        ...prev,
                                                                        [i]: {
                                                                            ...prev[i],
                                                                            spy46: !prev[i]?.spy46
                                                                        }
                                                                    }))
                                                                }}
                                                            >
                                                                <svg className={`w-3 h-3 transition-transform ${(collapsedSections[i]?.spy46 ?? !(pr.spy4 || pr.spy5 || pr.spy6)) ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                                </svg>
                                                                SPY 4-6
                                                            </label>
                                                            {/* Row 2: SPY 4-6 */}
                                                            {!(collapsedSections[i]?.spy46 ?? !(pr.spy4 || pr.spy5 || pr.spy6)) && (
                                                                <div className={previewExpanded ? 'grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3' : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-3'}>
                                                                    {[4, 5, 6].map(num => {
                                                                        const spyKey = `spy${num}` as keyof typeof pr
                                                                        const spyValue = pr[spyKey] as string || ''
                                                                        const parsedSpy = parseComponent(spyValue)
                                                                        return (
                                                                            <div key={num} className="flex gap-1">
                                                                                <CustomSelect
                                                                                    value={parsedSpy.name}
                                                                                    onChange={(val) => {
                                                                                        updatePrescription(i, { [spyKey]: formatComponent(val.toUpperCase(), parsedSpy.volume) })
                                                                                    }}
                                                                                    options={spagyricComponentsWithPlaceholder}
                                                                                    placeholder={`SPY${num}`}
                                                                                    allowCustom={true}
                                                                                    className="flex-1 text-xs h-8"
                                                                                    loading={loadingOptions}
                                                                                />
                                                                                <input
                                                                                    type="text"
                                                                                    value={parsedSpy.volume}
                                                                                    onChange={(e) => {
                                                                                        updatePrescription(i, { [spyKey]: formatComponent(parsedSpy.name, e.target.value) })
                                                                                    }}
                                                                                    placeholder="Drops"
                                                                                    className={`${previewExpanded ? 'w-12' : 'w-14'} px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs h-8 dark:bg-gray-800 text-center`}
                                                                                />
                                                                            </div>
                                                                        )
                                                                    })}

                                                                    {visibleGroupedPrescriptionSections.length === 0 && (
                                                                        <div className="rounded-xl border border-dashed border-sky-300 dark:border-sky-700 p-6 text-center bg-sky-50/60 dark:bg-sky-900/20">
                                                                            <div className="text-sm font-semibold text-sky-800 dark:text-sky-300">No matching prescriptions in current filters</div>
                                                                            <div className="text-xs text-sky-600 dark:text-sky-400 mt-1">Try clearing filters or searching with different keywords.</div>
                                                                            <button
                                                                                type="button"
                                                                                onClick={clearTab5Filters}
                                                                                className="mt-3 px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700"
                                                                            >
                                                                                Clear Filters
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                            {showAdditions && (
                                                                <>
                                                                    <label 
                                                                        className="flex items-center gap-2 text-xs font-semibold mb-2 mt-2 text-blue-600 dark:text-blue-400 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                                                        onClick={() => {
                                                                            setCollapsedSections(prev => ({
                                                                                ...prev,
                                                                                [i]: {
                                                                                    ...prev[i],
                                                                                    additions: !prev[i]?.additions
                                                                                }
                                                                            }))
                                                                        }}
                                                                    >
                                                                        <svg className={`w-3 h-3 transition-transform ${(collapsedSections[i]?.additions ?? !(pr.addition1 || pr.addition2 || pr.addition3)) ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                                        </svg>
                                                                        Additions
                                                                    </label>
                                                                    {/* Row 3: Add 1-3 */}
                                                                    {!(collapsedSections[i]?.additions ?? !(pr.addition1 || pr.addition2 || pr.addition3)) && (
                                                                        <div className={previewExpanded ? 'grid grid-cols-1 sm:grid-cols-2 gap-2' : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3'}>
                                                                            {[1, 2, 3].map(num => {
                                                                                const additionKey = `addition${num}` as keyof typeof pr
                                                                                const additionValue = pr[additionKey] as string || ''
                                                                                const parsedAddition = parseComponent(additionValue)
                                                                                return (
                                                                                    <div key={num} className="flex gap-1">
                                                                                        <CustomSelect
                                                                                            value={parsedAddition.name}
                                                                                            onChange={(val) => updatePrescription(i, { [additionKey]: formatComponent(val.toUpperCase(), parsedAddition.volume) })}
                                                                                            options={additionsWithPlaceholder}
                                                                                            placeholder={`Add ${num}`}
                                                                                            allowCustom={true}
                                                                                            className="flex-1 text-xs h-8"
                                                                                            loading={loadingOptions}
                                                                                        />
                                                                                        <input
                                                                                            type="text"
                                                                                            value={parsedAddition.volume}
                                                                                            onChange={(e) => updatePrescription(i, { [additionKey]: formatComponent(parsedAddition.name, e.target.value) })}
                                                                                            placeholder="Vol"
                                                                                            className={`${previewExpanded ? 'w-12' : 'w-14'} px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs h-8 dark:bg-gray-800 text-center`}
                                                                                        />
                                                                                    </div>
                                                                                )
                                                                            })}
                                                                        </div>
                                                                    )}
                                                                </>
                                                            )}
                                                        </div>
                                                        )}
                                                    </div>

                                                    {/* Row 2: Remaining Fields in ONE LINE */}
                                                    <div className="mt-4">
                                                        <label className="block text-xs font-semibold mb-2 text-gray-600 dark:text-gray-400">Dosage & Administration Details</label>
                                                        <div className={`grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-3 items-end w-full ${isDeleted ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''}`}>
                                                            {/* Qty, Timing, Dosage */}
                                                            {showQuantityInput && (
                                                                <div className="min-w-0 sm:flex-1 sm:min-w-[56px]">
                                                                    <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400 mb-0.5">Qty</label>
                                                                    <input 
                                                                        type="number" 
                                                                        placeholder="0" 
                                                                        value={pr.quantity || ''} 
                                                                        onChange={e => {
                                                                            const qty = Number(e.target.value)
                                                                            updatePrescription(i, { quantity: qty })
                                                                        }} 
                                                                        className={`w-full p-1 border ${quantityErrors[i] ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'} rounded text-xs h-8 dark:bg-gray-800`} 
                                                                    />
                                                                    {quantityErrors[i] && (
                                                                        <div className="text-red-500 text-[9px] mt-0.5 font-medium">
                                                                            {quantityErrors[i]}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                            {showTimingInput && (
                                                                <div className="min-w-0 sm:flex-1 sm:min-w-[96px]">
                                                                    <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400 mb-0.5">Timing</label>
                                                                    <CustomSelect value={pr.timing || ''} onChange={(val) => updatePrescription(i, { timing: val })} options={timingWithPlaceholder} placeholder="Time" allowCustom={true} className="text-xs h-8" loading={loadingOptions} />
                                                                </div>
                                                            )}
                                                            {showDoseQuantityInput && (
                                                                <div className="min-w-0 sm:flex-1 sm:min-w-[80px]">
                                                                    <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400 mb-0.5">Dose</label>
                                                                    <CustomSelect value={parsedDosageValues.quantity} onChange={(val) => { updatePrescription(i, { dosage: formatDosage(val, parsedDosageValues.timing, parsedDosageValues.dilution) }) }} options={doseQuantityWithPlaceholder} placeholder="Dose" allowCustom={true} className="text-xs h-8" loading={loadingOptions} />
                                                                </div>
                                                            )}
                                                            {showDoseTimingInput && (
                                                                <div className="min-w-0 sm:flex-1 sm:min-w-[80px]">
                                                                    <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400 mb-0.5">Frequency</label>
                                                                    <CustomSelect value={parsedDosageValues.timing} onChange={(val) => { updatePrescription(i, { dosage: formatDosage(parsedDosageValues.quantity, val, parsedDosageValues.dilution) }) }} options={doseTimingWithPlaceholder} placeholder="Time" allowCustom={true} className="text-xs h-8" loading={loadingOptions} />
                                                                </div>
                                                            )}
                                                            {showDilutionInput && (
                                                                <div className="min-w-0 sm:flex-1 sm:min-w-[80px]">
                                                                    <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400 mb-0.5">Along With</label>
                                                                    <CustomSelect value={parsedDosageValues.dilution} onChange={(val) => { updatePrescription(i, { dosage: formatDosage(parsedDosageValues.quantity, parsedDosageValues.timing, val) }) }} options={dilutionWithPlaceholder} placeholder="Dil" allowCustom={true} className="text-xs h-8" loading={loadingOptions} />
                                                                </div>
                                                            )}

                                                            {/* Procedure, Presentation, Administration */}
                                                            {showProcedureInput && (
                                                                <div className="min-w-0 sm:flex-1 sm:min-w-[112px]">
                                                                    <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400 mb-0.5">Instruction</label>
                                                                    <CustomSelect value={pr.procedure || ''} onChange={(val) => updatePrescription(i, { procedure: val.toUpperCase() })} options={procedureWithPlaceholder} placeholder="Proc" allowCustom={true} className="text-xs h-8" loading={loadingOptions} />
                                                                </div>
                                                            )}
                                                            {showPresentationInput && (
                                                                <div className="min-w-0 sm:flex-1 sm:min-w-[112px]">
                                                                    <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400 mb-0.5">Presentation</label>
                                                                    <CustomSelect value={pr.presentation || ''} onChange={(val) => updatePrescription(i, { presentation: val.toUpperCase() })} options={presentationWithPlaceholder} placeholder="Pres" allowCustom={true} className="text-xs h-8" loading={loadingOptions} />
                                                                </div>
                                                            )}
                                                            {showAdministrationInput && (
                                                                <div className="min-w-0 sm:flex-1 sm:min-w-[128px]">
                                                                    <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400 mb-0.5">Site</label>
                                                                    <CustomSelect value={pr.administration || ''} onChange={(val) => updatePrescription(i, { administration: val.toUpperCase() })} options={administrationWithPlaceholder} placeholder="Admin" allowCustom={true} className="text-xs h-8" loading={loadingOptions} />
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Taken Checkbox & Remove Button - Original Position */}
                                                        <div className={`${previewExpanded ? 'flex flex-col items-stretch' : 'flex flex-col sm:flex-row items-start sm:items-center'} justify-between gap-3 pt-3 border-t border-blue-200/30 dark:border-blue-700/30 mt-3`}>
                                                            <div className={`${previewExpanded ? 'flex flex-col items-stretch gap-3 w-full' : 'flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 w-full sm:w-auto'}`}>
                                                                {/* Not Taken Checkbox */}
                                                                <label className="flex items-center gap-2.5 cursor-pointer group/check flex-shrink-0">
                                                                    <div className="relative">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={pr.patientHasMedicine || false}
                                                                            onChange={(e) => updatePrescription(i, { patientHasMedicine: e.target.checked })}
                                                                            className="peer sr-only"
                                                                        />
                                                                        <div className="w-5 h-5 border-2 border-blue-300 dark:border-blue-600 rounded-md peer-checked:bg-gradient-to-br peer-checked:from-blue-500 peer-checked:to-sky-500 peer-checked:border-blue-500 flex items-center justify-center shadow-sm peer-checked:shadow-blue-500/30">
                                                                            <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                            </svg>
                                                                        </div>
                                                                    </div>
                                                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover/check:text-blue-600 dark:group-hover/check:text-blue-400 transition-colors">Not Taken</span>
                                                                </label>

                                                                {/* Label Product Selection */}
                                                                <div className={`${previewExpanded ? 'flex items-center gap-2 w-full' : 'flex items-center gap-2 w-full sm:w-auto'}`}>
                                                                    <label className="flex items-center gap-2.5 cursor-pointer group/labelcheck flex-shrink-0">
                                                                        <div className="relative">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={pr.includeLabelProduct !== undefined ? pr.includeLabelProduct : true}
                                                                                onChange={(e) => updatePrescription(i, { includeLabelProduct: e.target.checked })}
                                                                                className="peer sr-only"
                                                                            />
                                                                            <div className="w-5 h-5 border-2 border-blue-300 dark:border-blue-600 rounded-md peer-checked:bg-gradient-to-br peer-checked:from-blue-500 peer-checked:to-sky-500 peer-checked:border-blue-500 flex items-center justify-center shadow-sm peer-checked:shadow-blue-500/30">
                                                                                <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                                </svg>
                                                                            </div>
                                                                        </div>
                                                                    </label>
                                                                    <div className={`flex-1 min-w-0 ${previewExpanded ? 'max-w-full min-[420px]:max-w-[320px]' : 'sm:min-w-[192px]'}`}>
                                                                        <CustomSelect
                                                                            value={pr.selectedLabel || 'LABELS ORAL (PUN)'}
                                                                            onChange={(val) => updatePrescription(i, { selectedLabel: val })}
                                                                            options={[
                                                                                { value: 'LABELS ORAL (PUN)', label: 'LABELS ORAL (PUN)' },
                                                                                { value: 'LABELS ORAL (ENG)', label: 'LABELS ORAL (ENG)' },
                                                                                { value: 'LABELS EXT (ENG)', label: 'LABELS EXT (ENG)' },
                                                                                { value: 'LABELS EXT (PUN)', label: 'LABELS EXT (PUN)' }
                                                                            ]}
                                                                            placeholder="Select Label"
                                                                            className="text-xs h-8 w-full"
                                                                        />
                                                                    </div>
                                                                </div>

                                                                {/* VRS Product Selection - Only for Dilution products */}
                                                                {categoryName === 'dilutions' && (
                                                                    <div className={`${previewExpanded ? 'flex flex-wrap items-center gap-2 w-full' : 'flex items-center gap-2 w-full sm:w-auto'}`}>
                                                                        <label className="flex items-center gap-2.5 cursor-pointer group/vrscheck flex-shrink-0">
                                                                            <div className="relative">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    checked={pr.includeVrsProduct !== undefined ? pr.includeVrsProduct : true}
                                                                                    onChange={(e) => updatePrescription(i, { includeVrsProduct: e.target.checked })}
                                                                                    className="peer sr-only"
                                                                                />
                                                                                <div className="w-5 h-5 border-2 border-purple-300 dark:border-purple-600 rounded-md peer-checked:bg-gradient-to-br peer-checked:from-purple-500 peer-checked:to-indigo-500 peer-checked:border-purple-500 flex items-center justify-center shadow-sm peer-checked:shadow-purple-500/30">
                                                                                    <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                                    </svg>
                                                                                </div>
                                                                            </div>
                                                                        </label>
                                                                        <span className="text-xs font-medium text-purple-700 dark:text-purple-300 mr-2 flex-shrink-0">VRS</span>
                                                                        <input
                                                                            type="number"
                                                                            value={pr.vrsQuantity || 0.125}
                                                                            readOnly
                                                                            className="text-xs h-8 w-20 sm:w-24 px-2 border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 flex-shrink-0"
                                                                            title="VRS quantity (auto-calculated from dropper)"
                                                                        />
                                                                        {(() => {
                                                                            const vrsProduct = products.find(p => 
                                                                                p.name?.toUpperCase() === 'VRS' && 
                                                                                p.category?.name?.toUpperCase() === 'MISC'
                                                                            )
                                                                            const vrsStock = vrsProduct ? vrsProduct.quantity : 0
                                                                            const isLowStock = vrsStock < 50
                                                                            return (
                                                                                <span className={`text-xs font-medium flex-shrink-0 ${
                                                                                    isLowStock 
                                                                                        ? 'text-red-600 dark:text-red-400' 
                                                                                        : 'text-gray-600 dark:text-gray-400'
                                                                                }`}>
                                                                                    ({vrsStock} available)
                                                                                </span>
                                                                            )
                                                                        })()}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className={`${previewExpanded ? 'w-full flex items-center justify-start gap-2 flex-wrap' : 'flex items-center gap-2 flex-wrap'}`}>
                                                                {!isDeleted && (
                                                                    <>
                                                                    <button
                                                                        type="button"
                                                                        onClick={undoStack.some(u => u.index === i) ? undoRestore : () => restoreDefaultValues(i)}
                                                                        className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-300 hover:shadow-md ${
                                                                            undoStack.some(u => u.index === i)
                                                                                ? 'text-purple-600 dark:text-purple-400 hover:text-white hover:bg-purple-500 dark:hover:bg-purple-600 border border-purple-300 dark:border-purple-700'
                                                                                : 'text-blue-600 dark:text-blue-400 hover:text-white hover:bg-blue-500 dark:hover:bg-blue-600 border border-blue-300 dark:border-blue-700'
                                                                        }`}
                                                                        title={undoStack.some(u => u.index === i) ? 'Undo the last Restore Default action' : 'Restore default values (Qty: 15, Timing: AM, Dose: 10|TDS|WATER)'}
                                                                    >
                                                                        <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            {undoStack.some(u => u.index === i) ? (
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                                                            ) : (
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                            )}
                                                                        </svg>
                                                                        {undoStack.some(u => u.index === i) ? 'Undo' : 'Restore Default'}
                                                                    </button>
                                                                    
                                                                    {/* Repeat Row Button */}
                                                                    {showRepeatInputForRow !== i ? (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setShowRepeatInputForRow(i)}
                                                                            className="px-3 py-1.5 text-sm font-medium text-purple-600 dark:text-purple-400 hover:text-white hover:bg-purple-500 dark:hover:bg-purple-600 border border-purple-300 dark:border-purple-700 rounded-lg transition-all duration-300 hover:shadow-md"
                                                                            title="Repeat this prescription"
                                                                        >
                                                                            <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                            </svg>
                                                                            Repeat
                                                                        </button>
                                                                    ) : (
                                                                        <div className="flex items-center gap-1">
                                                                            <input
                                                                                type="number"
                                                                                min="1"
                                                                                value={repeatCountForRow}
                                                                                onChange={(e) => setRepeatCountForRow(e.target.value)}
                                                                                placeholder="Times"
                                                                                className="w-16 px-2 py-1.5 text-sm border border-purple-300 dark:border-purple-700 rounded-lg focus:ring-2 focus:ring-purple-500 dark:bg-gray-800"
                                                                                autoFocus
                                                                            />
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => repeatSingleRow(i)}
                                                                                className="px-2 py-1.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                                                                                title="Confirm repeat"
                                                                            >
                                                                                ✓
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => { setShowRepeatInputForRow(null); setRepeatCountForRow(''); }}
                                                                                className="px-2 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                                                                                title="Cancel"
                                                                            >
                                                                                ✕
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                    </>
                                                                )}
                                                                <button
                                                                    type="button"
                                                                    onClick={() => { const copy = [...prescriptions]; copy.splice(i, 1); setPrescriptions(copy); }}
                                                                    className="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:text-white hover:bg-red-500 dark:hover:bg-red-600 border border-red-300 dark:border-red-700 rounded-lg hover:shadow-md"
                                                                >
                                                                    Remove
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                            })}
                                        </div>
                                        )
                                    })}
                                </ThemedScrollArea>
                            )}
                        </div>
                        )}

                        {/* Financial Information Card */}
                        <div className="relative rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900/80 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-4 sm:p-6"
                            style={{ display: currentStep !== 6 ? 'none' : 'block' }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-2xl"></div>
                            <h3 className="relative text-lg font-semibold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">Financial Information</h3>
                            <div className="relative grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                                <div className="min-w-0">
                                    <label className="block text-sm font-medium mb-1.5">Amount (₹)</label>
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        placeholder="1000.00" 
                                        value={form.amount ? (Number(form.amount) * (1 - gstRate / 100)).toFixed(2) : ''} 
                                        onChange={e => {
                                            // Calculate amount with tax from entered subtotal
                                            const subtotal = Number(e.target.value) || 0
                                            const amountWithTax = subtotal / (1 - gstRate / 100)
                                            setForm({ ...form, amount: amountWithTax.toFixed(2) })
                                        }} 
                                        className="w-full p-2 border rounded" 
                                    />
                                </div>
                                <div className="min-w-0">
                                    <label className="block text-sm font-medium mb-1.5">Discount (₹)</label>
                                    <input type="number" step="0.01" placeholder="100.00" value={form.discount || ''} onChange={e => setForm({ ...form, discount: e.target.value })} className="w-full p-2 border rounded" />
                                </div>
                                <div className="min-w-0">
                                    <label className="block text-sm font-medium mb-1.5">Consultation Fees (₹)</label>
                                    <div className="relative">
                                        <input 
                                            type="number" 
                                            step="0.01" 
                                            placeholder="200.00" 
                                            value={consultationFees || ''} 
                                            onChange={e => setConsultationFees(Number(e.target.value) || 0)} 
                                            disabled={isConsultationFeesLocked}
                                            className="w-full p-2 pr-10 border rounded disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed" 
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setIsConsultationFeesLocked(!isConsultationFeesLocked)}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                            title={isConsultationFeesLocked ? "Click to unlock Consultation Fees" : "Click to lock Consultation Fees"}
                                        >
                                            {isConsultationFeesLocked ? (
                                                <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                                </svg>
                                            ) : (
                                                <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                </div>
                                <div className="min-w-0">
                                    <label className="block text-sm font-medium mb-1.5">Payment Received (₹)</label>
                                    <input type="number" step="0.01" placeholder="900.00" value={form.payment || ''} onChange={e => setForm({ ...form, payment: e.target.value })} className="w-full p-2 border rounded" />
                                </div>
                                <div className="min-w-0">
                                    <label className="block text-sm font-medium mb-1.5">Balance Due (₹)</label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            step="0.01"
                                            placeholder="0.00"
                                            value={form.balance || ''}
                                            disabled
                                            className="w-full p-2 pr-10 border rounded bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                                        />
                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" title="Auto-calculated from amount, discount, consultation fees, and payment">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                            </svg>
                                        </span>
                                    </div>
                                </div>
                            </div>
                            
                            {/* GST Configuration */}
                            <div className="relative mt-4 border border-blue-300 dark:border-blue-700 rounded-lg p-3 bg-blue-50/50 dark:bg-blue-900/20">
                                <div className="flex flex-col gap-3">
                                    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setIsGstLocked(!isGstLocked)}
                                            className="p-1 hover:bg-blue-100 dark:hover:bg-blue-800 rounded transition-colors"
                                            title={isGstLocked ? "Click to unlock GST" : "Click to lock GST"}
                                        >
                                            {isGstLocked ? (
                                                <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                                                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                                </svg>
                                            ) : (
                                                <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z" />
                                                </svg>
                                            )}
                                        </button>
                                        <input
                                            type="number"
                                            step="0.1"
                                            min="0"
                                            max="100"
                                            value={gstRate}
                                            onChange={e => setGstRate(Number(e.target.value) || 0)}
                                            disabled={isGstLocked}
                                            className="w-16 px-2 py-1 text-sm border rounded text-center disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
                                        />
                                        <span className="text-sm font-medium text-blue-700 dark:text-blue-300">% GST</span>
                                    </div>
                                    {(form.amount || form.discount || form.payment || consultationFees) && (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 text-xs text-blue-600 dark:text-blue-400 w-full">
                                            <div className="flex items-center justify-between gap-2 rounded-full bg-white/50 dark:bg-gray-900/25 px-3 py-2 min-w-0">
                                                <span className="truncate">SGST ({(gstRate / 2).toFixed(2)}%):</span>
                                                <span className="font-semibold whitespace-nowrap">₹{((Number(form.amount) * gstRate) / 200).toFixed(2)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 rounded-full bg-white/50 dark:bg-gray-900/25 px-3 py-2 min-w-0">
                                                <span className="truncate">CGST ({(gstRate / 2).toFixed(2)}%):</span>
                                                <span className="font-semibold whitespace-nowrap">₹{((Number(form.amount) * gstRate) / 200).toFixed(2)}</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 rounded-full bg-white/50 dark:bg-gray-900/25 px-3 py-2 min-w-0 sm:col-span-2 xl:col-span-1">
                                                <span className="truncate">Subtotal (with GST):</span>
                                                <span className="font-bold whitespace-nowrap">₹{Number(form.amount).toFixed(2)}</span>
                                            </div>
                                            <div className="sm:col-span-2 xl:col-span-1 xl:ml-auto xl:pl-3 xl:border-l xl:border-blue-300 xl:dark:border-blue-700 text-left xl:text-right space-y-2 rounded-2xl bg-white/40 dark:bg-gray-900/20 px-3 py-2 xl:bg-transparent xl:px-0 xl:py-0 w-full">
                                                <div className="flex items-center justify-between gap-2 xl:block">
                                                    <span className="text-[11px] text-gray-600 dark:text-gray-300 mr-1">Round off +/-:</span>
                                                    <span className="font-semibold text-sky-600 dark:text-sky-400 whitespace-nowrap">₹{payableRoundOff.toFixed(2)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2 xl:block">
                                                    <span className="text-[11px] text-gray-600 dark:text-gray-300 mr-1">Total Payable (Rounded):</span>
                                                    <span className="font-bold text-green-600 dark:text-green-400 whitespace-nowrap">₹{totalPayableAmount.toFixed(2)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-2 xl:block">
                                                    <span className="text-[11px] text-gray-600 dark:text-gray-300 mr-1">Pending Balance:</span>
                                                    <span className="font-bold text-red-600 dark:text-red-400 whitespace-nowrap">₹{pendingBalanceAmount.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </form>

                    {/* Treatment Diagnosis Filter Modal */}
                    {renderModal(showTreatmentFilterModal && (
                        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
                            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
                                <div className="flex items-center justify-between mb-5">
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">Filter Treatments</h3>
                                    <button type="button" onClick={() => setShowTreatmentFilterModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl font-bold leading-none">✕</button>
                                </div>
                                <div className="space-y-4">
                                    {/* Systems */}
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Systems</label>
                                        <select
                                            value={diagFilterSystems}
                                            onChange={e => setDiagFilterSystems(e.target.value)}
                                            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        >
                                            <option value="">All Systems</option>
                                            {Array.from(new Set((Array.isArray(treatments) ? treatments : []).filter(t => !t.deleted && t.systems).map(t => t.systems as string))).sort().map(s => (
                                                <option key={s} value={s}>{s}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {/* Pulse Diagnosis */}
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Pulse Diagnosis</label>
                                        <select
                                            value={diagFilterPulseDiagnosis}
                                            onChange={e => setDiagFilterPulseDiagnosis(e.target.value)}
                                            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        >
                                            <option value="">All Pulse Diagnoses</option>
                                            {Array.from(new Set((Array.isArray(treatments) ? treatments : []).filter(t => !t.deleted && t.pulseDiagnosis).map(t => t.pulseDiagnosis as string))).sort().map(p => (
                                                <option key={p} value={p}>{p}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {/* Speciality */}
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Speciality</label>
                                        <select
                                            value={diagFilterSpeciality}
                                            onChange={e => setDiagFilterSpeciality(e.target.value)}
                                            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        >
                                            <option value="">All Specialities</option>
                                            {Array.from(new Set((Array.isArray(treatments) ? treatments : []).filter(t => !t.deleted && t.speciality).map(t => t.speciality as string))).sort().map(s => (
                                                <option key={s} value={s}>{s}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {/* Organ */}
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Organ</label>
                                        <select
                                            value={diagFilterOrgan}
                                            onChange={e => setDiagFilterOrgan(e.target.value)}
                                            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        >
                                            <option value="">All Organs</option>
                                            {Array.from(new Set((Array.isArray(treatments) ? treatments : []).filter(t => !t.deleted && t.organ).map(t => t.organ as string))).sort().map(o => (
                                                <option key={o} value={o}>{o}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between mt-6 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setDiagFilterSystems('')
                                            setDiagFilterPulseDiagnosis('')
                                            setDiagFilterSpeciality('')
                                            setDiagFilterOrgan('')
                                        }}
                                        className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        Reset All
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowTreatmentFilterModal(false)}
                                        className="flex-1 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:opacity-90 transition-opacity"
                                    >
                                        Apply Filters
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Treatment Plan Comparison Modal */}
                    {renderModal(showPlanCompareModal && activePlanCompareDiagnosis && (
                        <div
                            className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-fadeIn"
                            style={{ animation: 'fadeIn 0.2s ease-in-out' }}
                        >
                            <div
                                className="w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col rounded-2xl border border-blue-200/40 dark:border-blue-700/40 bg-gradient-to-br from-white via-blue-50/40 to-sky-50/30 dark:from-gray-900 dark:via-blue-950/25 dark:to-gray-900 shadow-2xl shadow-blue-500/20 animate-scaleIn"
                                style={{ animation: 'scaleIn 0.3s ease-out', willChange: 'transform' }}
                            >
                                {/* Modal Header */}
                                <div className="p-3 border-b border-blue-200/50 dark:border-blue-700/40 bg-gradient-to-r from-blue-50/70 to-sky-50/60 dark:from-blue-900/20 dark:to-sky-900/10">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-base font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-sky-600 dark:from-blue-300 dark:to-sky-300">Select Treatment Plan</h3>
                                            <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                                                <span className="font-medium">Diagnosis:</span> {activePlanCompareDiagnosis}
                                            </p>
                                            {planCompareQueue.length > 1 && (
                                                <p className="text-[11px] text-blue-700 dark:text-blue-300 mt-1.5">
                                                    Diagnosis {planCompareStepIndex + 1} of {planCompareQueue.length} · {resolvedPlanCompareCount}/{planCompareQueue.length} selected
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => {
                                                closePlanCompareProgressModal()
                                            }}
                                            className="p-1.5 rounded-md text-gray-500 hover:bg-blue-100 dark:hover:bg-blue-900/40"
                                        >
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                    {planCompareQueue.length > 1 && (
                                        <div className="mt-2 flex items-center justify-between gap-2">
                                            <button
                                                type="button"
                                                onClick={() => movePlanCompareStep(planCompareStepIndex - 1)}
                                                disabled={planCompareStepIndex === 0}
                                                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white/90 dark:bg-gray-900/70 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                Previous Diagnosis
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => movePlanCompareStep(planCompareStepIndex + 1)}
                                                disabled={planCompareStepIndex >= planCompareQueue.length - 1}
                                                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white/90 dark:bg-gray-900/70 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                Next Diagnosis
                                            </button>
                                        </div>
                                    )}
                                    <div className="mt-1.5">
                                        <button
                                            type="button"
                                            onClick={skipCurrentPlanCompareDiagnosis}
                                            className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                                        >
                                            Skip This Diagnosis
                                        </button>
                                    </div>
                                </div>

                                {/* Modal Body - Treatment Plans Grid */}
                                <ThemedScrollArea className="p-3 sm:p-4 max-h-[calc(92vh-212px)] pr-2" density="compact">
                                    {activeDiagnosisTreatments.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-blue-300/70 dark:border-blue-700/60 bg-blue-50/60 dark:bg-blue-900/15 p-4 text-sm text-blue-700 dark:text-blue-300">
                                            <p>No treatment plans found for this diagnosis.</p>
                                            <button
                                                type="button"
                                                onClick={skipCurrentPlanCompareDiagnosis}
                                                className="mt-3 px-2.5 py-1 rounded-md text-[11px] font-semibold bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                                            >
                                                Skip This Diagnosis
                                            </button>
                                        </div>
                                    ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                                        {activeDiagnosisTreatments.map((treatment, idx) => {
                                                const displayPlanNumber = treatment.planNumber || (idx + 1)
                                                return (
                                                    <div
                                                        key={treatment.id}
                                                        className="rounded-xl border border-blue-200/70 dark:border-blue-700/60 bg-white/80 dark:bg-gray-900/60 p-2.5 shadow-sm"
                                                    >
                                                        {/* Plan Header */}
                                                        <div className="flex items-center justify-between mb-2">
                                                            <h4 className="text-xs font-semibold text-blue-800 dark:text-blue-200">
                                                                Plan {displayPlanNumber}
                                                            </h4>
                                                            <span className="px-1.5 py-0.5 text-[10px] rounded-full border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300 font-semibold">
                                                                {treatment.treatmentProducts?.length || 0} medicines
                                                            </span>
                                                        </div>

                                                        {/* Plan Details */}
                                                        <div className="space-y-1 mb-2 text-[11px] text-gray-600 dark:text-gray-400">
                                                            {treatment.speciality && (
                                                                <div>
                                                                    <span className="font-medium text-gray-700 dark:text-gray-300">Speciality:</span>{' '}
                                                                    <span>{treatment.speciality}</span>
                                                                </div>
                                                            )}
                                                            {treatment.organ && (
                                                                <div>
                                                                    <span className="font-medium text-gray-700 dark:text-gray-300">Organ:</span>{' '}
                                                                    <span>{treatment.organ}</span>
                                                                </div>
                                                            )}
                                                            {treatment.diseaseAction && (
                                                                <div>
                                                                    <span className="font-medium text-gray-700 dark:text-gray-300">Disease Action:</span>{' '}
                                                                    <span>{treatment.diseaseAction}</span>
                                                                </div>
                                                            )}
                                                            {treatment.administration && (
                                                                <div>
                                                                    <span className="font-medium text-gray-700 dark:text-gray-300">Administration:</span>{' '}
                                                                    <span>{treatment.administration}</span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Medicines List */}
                                                        {treatment.treatmentProducts && treatment.treatmentProducts.length > 0 && (
                                                            <div className="mb-2">
                                                                <h5 className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1.5">Medicines</h5>
                                                                <ThemedScrollArea className="space-y-1 max-h-48 pr-1" density="compact">
                                                {treatment.treatmentProducts.map((tp: any, tpIdx: number) => {
                                                                        const product = productsById.get(String(tp.productId))
                                                                        const components = [tp.spy1, tp.spy2, tp.spy3, tp.spy4, tp.spy5, tp.spy6].filter(Boolean)
                                                                        const additions = [tp.addition1, tp.addition2, tp.addition3].filter(Boolean)
                                                                        const stockStatus = product ? getStockStatus(product) : null
                                                                        return (
                                                                            <div key={tpIdx} className="text-[11px] p-1.5 rounded-md border border-blue-200/60 dark:border-blue-700/50 bg-white/95 dark:bg-gray-900/70">
                                                                                <div className="flex items-center gap-2 mb-1">
                                                                                    <p className="font-semibold text-gray-900 dark:text-white flex-1 leading-tight">
                                                                                        {tpIdx + 1}. {product?.name || 'Unknown Medicine'}
                                                                                    </p>
                                                                                    {stockStatus?.isCritical && (
                                                                                        <span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-[10px] font-semibold rounded-full shrink-0">Critical</span>
                                                                                    )}
                                                                                    {!stockStatus?.isCritical && stockStatus?.isLow && (
                                                                                        <span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px] font-semibold rounded-full shrink-0">Low</span>
                                                                                    )}
                                                                                </div>
                                                                                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-gray-600 dark:text-gray-400">
                                                                                    {tp.quantity && <span><span className="font-medium text-gray-700 dark:text-gray-300">Qty:</span> {tp.quantity}</span>}
                                                                                    {tp.dosage && <span><span className="font-medium text-gray-700 dark:text-gray-300">Dosage:</span> {tp.dosage}</span>}
                                                                                    {tp.timing && <span><span className="font-medium text-gray-700 dark:text-gray-300">Timing:</span> {tp.timing}</span>}
                                                                                    {tp.procedure && <span><span className="font-medium text-gray-700 dark:text-gray-300">Procedure:</span> {tp.procedure}</span>}
                                                                                    {tp.presentation && <span><span className="font-medium text-gray-700 dark:text-gray-300">Presentation:</span> {tp.presentation}</span>}
                                                                                    {tp.bottleSize && <span><span className="font-medium text-gray-700 dark:text-gray-300">Bottle:</span> {tp.bottleSize} ml</span>}
                                                                                </div>
                                                                                {components.length > 0 && (
                                                                                    <div className="mt-1">
                                                                                        <span className="font-medium text-gray-700 dark:text-gray-300">Components: </span>
                                                                                        <span className="text-gray-600 dark:text-gray-400">{components.join(', ')}</span>
                                                                                    </div>
                                                                                )}
                                                                                {additions.length > 0 && (
                                                                                    <div className="mt-0.5">
                                                                                        <span className="font-medium text-gray-700 dark:text-gray-300">Additions: </span>
                                                                                        <span className="text-gray-600 dark:text-gray-400">{additions.join(', ')}</span>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        )
                                                                    })}
                                                                </ThemedScrollArea>
                                                            </div>
                                                        )}

                                                        {/* Select Button */}
                                                        {selectedPlansByDiagnosis[activePlanCompareDiagnosis || '']?.includes(String(treatment.id)) ? (
                                                            <div className="flex gap-2">
                                                                <button 
                                                                    onClick={() => {
                                                                        const targetDiag = String(treatment.provDiagnosis || '')
                                                                        const targetId = String(treatment.id)
                                                                        
                                                                        const remainingPrescriptions = prescriptions.filter(p => String(p.treatmentId) !== targetId)
                                                                        setPrescriptions(remainingPrescriptions)
                                                                        setOriginalTreatmentData(JSON.parse(JSON.stringify(remainingPrescriptions)))
                                                                        
                                                                        setSelectedPlansByDiagnosis(prev => ({
                                                                            ...prev,
                                                                            [targetDiag]: (prev[targetDiag] || []).filter(id => id !== targetId)
                                                                        }))
                                                                        
                                                                        if (selectedTreatmentId === targetId) {
                                                                            setSelectedTreatmentId(null)
                                                                            setSelectedTreatmentPlan(null)
                                                                        }
                                                                        
                                                                        showSuccess(`Plan unselected`)
                                                                    }}
                                                                    className="w-1/2 px-3 py-1.5 rounded-md bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 hover:border-red-300 dark:hover:border-red-700 text-xs font-semibold shadow-sm transition-colors"
                                                                >
                                                                    Unselect This Plan
                                                                </button>
                                                                <button
                                                                    onClick={() => advancePlanCompareToNextPending()}
                                                                    className="w-1/2 px-3 py-1.5 rounded-md bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white text-xs font-semibold shadow-sm transition-colors"
                                                                >
                                                                    Next
                                                                </button>
                                                            </div>
                                                        ) : (
                                                        <button
                                                            onClick={() => {
                                                                // Add this treatment plan to current prescriptions (dedupe by product).
                                                                if (treatment.treatmentProducts && treatment.treatmentProducts.length > 0) {
                                                                    const newPrescriptions = treatment.treatmentProducts.map((tp: any) => ({
                                                                        treatmentId: String(treatment.id),
                                                                        productId: String(tp.productId),
                                                                        spy1: tp.spy1 || '',
                                                                        spy2: tp.spy2 || '',
                                                                        spy3: tp.spy3 || '',
                                                                        spy4: tp.spy4 || '',
                                                                        spy5: tp.spy5 || '',
                                                                        spy6: tp.spy6 || '',
                                                                        quantity: tp.quantity || treatment.quantity || 1,
                                                                        timing: tp.timing || '',
                                                                        dosage: tp.dosage || treatment.dosage || '',
                                                                        additions: tp.additions || '',
                                                                        addition1: tp.addition1 || '',
                                                                        addition2: tp.addition2 || '',
                                                                        addition3: tp.addition3 || '',
                                                                        procedure: tp.procedure || treatment.procedure || '',
                                                                        presentation: tp.presentation || '',
                                                                        droppersToday: tp.droppersToday?.toString() || '',
                                                                        medicineQuantity: tp.medicineQuantity?.toString() || '',
                                                                        administration: tp.administration || '',
                                                                        patientHasMedicine: false,
                                                                        bottleSize: tp.bottleSize || '',
                                                                        discussions: tp.discussions || '',
                                                                        selectedDropper: (() => {
                                                                            const bSize = parseInt(tp.bottleSize || prescriptionDefaults?.bottleSize || '15')
                                                                            const dropperProducts = Array.isArray(products) ? products.filter(p => p.category?.name?.toUpperCase() === 'MISC' && p.name?.toUpperCase().includes('DROPPER')) : []
                                                                            if (!dropperProducts.length || isNaN(bSize)) return ''
                                                                            const exact = dropperProducts.find(p => { const n = p.name?.toLowerCase() || ''; return n.includes(`${bSize} ml`) || n.includes(`${bSize}ml`) })
                                                                            if (exact) return String(exact.id)
                                                                            const best = dropperProducts.map(p => { const m = p.name?.match(/(\d+)\s*ml/i); return m ? { id: p.id, size: parseInt(m[1]) } : null }).filter((d): d is { id: number; size: number } => !!d && d.size <= bSize).sort((a, b) => b.size - a.size)
                                                                            return best.length ? String(best[0].id) : ''
                                                                        })(),
                                                                        selectedLabel: 'LABELS ORAL (PUN)', // Default for treatment plan
                                                                        includeLabelProduct: true, // Default for treatment plan
                                                                        optionProductIds: (() => {
                                                                            try { return tp.optionProductIds ? (Array.isArray(tp.optionProductIds) ? tp.optionProductIds : JSON.parse(tp.optionProductIds)).map(String) : [] }
                                                                            catch { return [] }
                                                                        })(),
                                                                        activeOptionIndex: -1
                                                                    }))

                                                                    const merged = [...prescriptions]
                                                                    const seen = new Set(merged.map((p: any) => String(p.productId || '')))
                                                                    newPrescriptions.forEach((np: any) => {
                                                                        const pid = String(np.productId || '')
                                                                        if (!pid) return
                                                                        if (seen.has(pid)) return
                                                                        seen.add(pid)
                                                                        merged.push(np)
                                                                    })

                                                                    setPrescriptions(merged)
                                                                    setSelectedTreatmentId(String(treatment.id))
                                                                    setSelectedTreatmentPlan(treatment)
                                                                    setOriginalTreatmentData(JSON.parse(JSON.stringify(merged)))
                                                                    handleDiagnosisTagsChange(Array.from(new Set([...selectedDiagnosisTags, String(treatment.provDiagnosis || '')].filter(Boolean))))
                                                                    setSkippedPlanCompareDiagnoses((prev) => prev.filter((item) => item !== String(treatment.provDiagnosis || '')))
                                                                    setSelectedPlansByDiagnosis((prev) => ({
                                                                        ...prev,
                                                                        [String(treatment.provDiagnosis || '')]: Array.from(new Set([...(prev[String(treatment.provDiagnosis || '')] || []), String(treatment.id)])),
                                                                    }))

                                                                    // Warn if any product has empty inventory
                                                                    const emptyInventoryProducts = treatment.treatmentProducts
                                                                        .map((tp: any) => productsById.get(String(tp.productId)))
                                                                        .filter((p: any) => p && ((Number(p.totalPurchased) || 0) - (Number(p.totalSales) || 0)) <= 0)
                                                                    if (emptyInventoryProducts.length > 0) {
                                                                        const names = emptyInventoryProducts.map((p: any) => p.name).join(', ')
                                                                        showWarning(`Low/empty inventory for: ${names}. Please refill stock.`)
                                                                    }

                                                                    // Critical stock alert: vibrate + tone
                                                                    const criticalProducts = treatment.treatmentProducts
                                                                        .map((tp: any) => productsById.get(String(tp.productId)))
                                                                        .filter((p: any) => p && getStockStatus(p).isCritical)
                                                                    if (criticalProducts.length > 0) {
                                                                        const names = criticalProducts.map((p: any) => p.name).join(', ')
                                                                        playAlertTone()
                                                                        triggerVibrate()
                                                                        showError(`⚠️ Critical stock: ${names} — stock ≤10% of threshold!`)
                                                                    } else {
                                                                        // Low stock toast only
                                                                        const lowProducts = treatment.treatmentProducts
                                                                            .map((tp: any) => productsById.get(String(tp.productId)))
                                                                            .filter((p: any) => p && !getStockStatus(p).isCritical && getStockStatus(p).isLow)
                                                                        if (lowProducts.length > 0) {
                                                                            const names = lowProducts.map((p: any) => p.name).join(', ')
                                                                            showWarning(`Low stock warning: ${names} — below 30% of threshold.`)
                                                                        }
                                                                    }
                                                                }
                                                                advancePlanCompareToNextPending()
                                                                showSuccess(`Plan ${displayPlanNumber} added successfully`)
                                                            }}
                                                            className="w-full px-3 py-1.5 rounded-md bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white text-xs font-semibold shadow-sm"
                                                        >
                                                            Select This Plan
                                                        </button>
                                                        )}
                                                    </div>
                                                )
                                                })}
                                            </div>
                                            )}
                                </ThemedScrollArea>

                                {/* Modal Footer */}
                                <div className="p-3 border-t border-blue-200/50 dark:border-blue-700/40 bg-gray-50/50 dark:bg-gray-900/50 flex flex-wrap items-center justify-between gap-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => movePlanCompareStep(planCompareStepIndex - 1)}
                                            disabled={planCompareStepIndex === 0}
                                            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            Previous
                                        </button>
                                        <button
                                            type="button"
                                            onClick={skipCurrentPlanCompareDiagnosis}
                                            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                                        >
                                            Skip
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => movePlanCompareStep(planCompareStepIndex + 1)}
                                            disabled={planCompareStepIndex >= planCompareQueue.length - 1}
                                            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            Next
                                        </button>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => closePlanCompareProgressModal()}
                                        className="px-6 py-1.5 rounded-md text-xs font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm transition-all hover:scale-[1.02]"
                                    >
                                        Submit
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Treatment Plan Modification Modal */}
                    {renderModal(showMergePlansModal && (
                        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn" style={{ animation: 'fadeIn 0.2s ease-in-out' }}>
                            <div className="w-full max-w-2xl rounded-2xl border border-blue-200/40 dark:border-blue-700/40 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-2xl shadow-blue-500/20 p-4 animate-scaleIn" style={{ animation: 'scaleIn 0.3s ease-out', willChange: 'transform' }}>
                                <h3 className="text-base font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-700 to-sky-600 dark:from-blue-300 dark:to-sky-300 mb-1">Merge Common Medicines</h3>
                                <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
                                    Duplicate medicines across selected plans are preselected for merge.
                                </p>

                                <div className="flex items-center gap-2 mb-3">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const next: Record<string, boolean> = {}
                                            duplicateMergeItems.forEach((item) => {
                                                next[item.productId] = true
                                            })
                                            setDuplicateMergeSelection(next)
                                        }}
                                        className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white/90 dark:bg-gray-900/70 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300"
                                    >
                                        Select All
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const next: Record<string, boolean> = {}
                                            duplicateMergeItems.forEach((item) => {
                                                next[item.productId] = false
                                            })
                                            setDuplicateMergeSelection(next)
                                        }}
                                        className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white/90 dark:bg-gray-900/70 border border-blue-200 dark:border-blue-700 text-blue-700 dark:text-blue-300"
                                    >
                                        Unselect All
                                    </button>
                                </div>

                                <ThemedScrollArea className="max-h-[48vh] space-y-2 pr-1" density="compact">
                                    {duplicateMergeItems.map((item) => (
                                        <label key={item.productId} className="flex items-start gap-3 p-2.5 rounded-lg border border-blue-200/70 dark:border-blue-700/60 bg-white/85 dark:bg-gray-900/60 cursor-pointer">
                                            <span className="flex-shrink-0 mt-0.5">
                                                <input
                                                    type="checkbox"
                                                    checked={duplicateMergeSelection[item.productId] !== false}
                                                    onChange={(e) => setDuplicateMergeSelection((prev) => ({ ...prev, [item.productId]: e.target.checked }))}
                                                    className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                                />
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">{item.productName}</div>
                                                <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                                                    Found in: {item.planLabels.join(', ')} ({item.occurrences} occurrences)
                                                </div>
                                            </div>
                                        </label>
                                    ))}
                                </ThemedScrollArea>

                                <div className="flex items-center justify-end gap-2 mt-5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (processingMergeModal) return
                                            setShowMergePlansModal(false)
                                            setPausedPlanSelectionKey(pendingMergeSelectionKey || selectedTreatmentSelectionKey)
                                            setPendingMergeSelectionKey('')
                                            setPendingSelectedTreatments([])
                                            setDuplicateMergeItems([])
                                            setProcessingMergeModal(false)
                                        }}
                                        disabled={processingMergeModal}
                                        className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            try {
                                                setProcessingMergeModal(true)
                                                const mergedPrescriptions = await createPrescriptionsFromSelectedPlans(pendingSelectedTreatments, duplicateMergeSelection)
                                                setAppliedPlanSelectionKey(pendingMergeSelectionKey || selectedTreatmentSelectionKey)
                                                setPausedPlanSelectionKey('')
                                                setShowMergePlansModal(false)
                                                setPendingMergeSelectionKey('')
                                                setPendingSelectedTreatments([])
                                                setDuplicateMergeItems([])
                                                setProcessingMergeModal(false)
                                                showSuccess(`Generated ${mergedPrescriptions.length} prescriptions from ${selectedTreatmentIds.length} selected plan(s)`)
                                            } catch (err: any) {
                                                setProcessingMergeModal(false)
                                                showError(err?.message || 'Failed to generate prescriptions from selected plans')
                                            }
                                        }}
                                        disabled={processingMergeModal}
                                        className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-sky-600 text-white font-semibold hover:from-blue-700 hover:to-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {processingMergeModal ? 'Processing...' : 'Continue'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Treatment Plan Modification Modal */}
                    {renderModal(showSaveModal && (
                        <div
                            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-fadeIn"
                            style={{
                                animation: 'fadeIn 0.2s ease-in-out'
                            }}
                        >
                            <div
                                className="bg-gradient-to-br from-white to-blue-50/30 dark:from-gray-800 dark:to-blue-950/30 rounded-2xl shadow-2xl shadow-blue-500/20 max-w-2xl w-full p-6 animate-scaleIn border border-blue-200/30 dark:border-blue-700/30"
                                style={{
                                    animation: 'scaleIn 0.3s ease-out'
                                }}
                            >
                                <h3 className="text-lg font-semibold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">Treatment Plan Modified</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                                    You modified one or more selected treatment plans. Choose an action for each plan, then submit.
                                </p>
                                <div className="space-y-4">
                                    {(() => {
                                        const currentPlanId = modifiedTreatmentPlanIds[modifiedPlanStepIndex] || ''
                                        const currentPlan = treatments.find((t: any) => String(t.id) === String(currentPlanId))
                                        const selectedAction = modifiedPlanActions[currentPlanId]
                                        const resolvedCount = modifiedTreatmentPlanIds.filter((id) => Boolean(modifiedPlanActions[id])).length
                                        const allResolved = modifiedTreatmentPlanIds.length > 0 && resolvedCount === modifiedTreatmentPlanIds.length
                                        return (
                                            <>
                                                <div className="rounded-xl border border-blue-200 dark:border-blue-700 bg-blue-50/60 dark:bg-blue-900/20 p-3">
                                                    <div className="flex items-center justify-between mb-1">
                                                        <div className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                                                            Plan {modifiedPlanStepIndex + 1} of {modifiedTreatmentPlanIds.length}
                                                        </div>
                                                        <div className="text-xs text-blue-700 dark:text-blue-300">
                                                            {resolvedCount}/{modifiedTreatmentPlanIds.length} decided
                                                        </div>
                                                    </div>
                                                    <div className="text-sm text-gray-700 dark:text-gray-300">
                                                        {currentPlan?.planNumber ? `Plan ${currentPlan.planNumber}` : `Plan #${currentPlanId}`} · {currentPlan?.provDiagnosis || 'Diagnosis not set'}
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setModifiedPlanActions((prev) => ({ ...prev, [currentPlanId]: 'update' }))}
                                                        className={`px-3 py-2 rounded-lg text-sm font-medium border ${selectedAction === 'update' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white dark:bg-gray-800 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700'}`}
                                                    >
                                                        Update Current Plan
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setModifiedPlanActions((prev) => ({ ...prev, [currentPlanId]: 'create' }))}
                                                        className={`px-3 py-2 rounded-lg text-sm font-medium border ${selectedAction === 'create' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700'}`}
                                                    >
                                                        Create New Treatment Plan
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setModifiedPlanActions((prev) => ({ ...prev, [currentPlanId]: 'prescription-only' }))}
                                                        className={`px-3 py-2 rounded-lg text-sm font-medium border ${selectedAction === 'prescription-only' ? 'bg-sky-600 text-white border-sky-600' : 'bg-white dark:bg-gray-800 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-700'}`}
                                                    >
                                                        Use for This Prescription Only
                                                    </button>
                                                </div>

                                                <div className="flex items-center justify-between">
                                                    <button
                                                        type="button"
                                                        onClick={() => setModifiedPlanStepIndex((idx) => Math.max(0, idx - 1))}
                                                        disabled={modifiedPlanStepIndex === 0}
                                                        className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 disabled:opacity-40"
                                                    >
                                                        Previous
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setModifiedPlanStepIndex((idx) => Math.min(modifiedTreatmentPlanIds.length - 1, idx + 1))}
                                                        disabled={modifiedPlanStepIndex >= modifiedTreatmentPlanIds.length - 1}
                                                        className="px-3 py-2 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 disabled:opacity-40"
                                                    >
                                                        Next
                                                    </button>
                                                </div>

                                                <div className="space-y-2 pt-2 border-t border-blue-200/70 dark:border-blue-700/40">
                                                    <button
                                                        type="button"
                                                        onClick={applyModifiedPlanActionsAndSubmit}
                                                        disabled={!allResolved}
                                                        className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        Submit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setShowSaveModal(false)
                                                            setPendingSubmit(null)
                                                            setModifiedTreatmentPlanIds([])
                                                            setModifiedPlanActions({})
                                                        }}
                                                        className="w-full px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </>
                                        )
                                    })()}
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Navigation Modal - After Treatment Plan Created */}
                    {renderModal(showVisitSuccessModal && (
                        <div
                            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-fadeIn"
                            style={{ animation: 'fadeIn 0.2s ease-in-out' }}
                        >
                            <div
                                className="bg-gradient-to-br from-white to-blue-50/30 dark:from-gray-800 dark:to-blue-950/30 rounded-2xl shadow-2xl shadow-blue-500/20 max-w-md w-full p-6 animate-scaleIn border border-blue-200/30 dark:border-blue-700/30"
                                style={{ animation: 'scaleIn 0.3s ease-out' }}
                            >
                                <div className="text-center mb-6">
                                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-sky-100 dark:bg-sky-900 mb-4">
                                        <svg className="h-6 w-6 text-sky-600 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <h3 className="text-lg font-semibold mb-2">Visit Saved Successfully</h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Choose where to go next.</p>
                                </div>
                                <div className="space-y-3">
                                    <button
                                        onClick={async () => {
                                            setShowVisitSuccessModal(false)
                                            if (visitSuccessId) {
                                                router.push(`/visits/${visitSuccessId}`)
                                            }
                                        }}
                                        className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
                                    >
                                        View Visit Details
                                    </button>
                                    <button
                                        onClick={() => {
                                            setShowVisitSuccessModal(false)
                                            setVisitSuccessId(null)
                                        }}
                                        className="w-full px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                                    >
                                        Stay on Page
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Navigation Modal - After Treatment Plan Created */}
                    {renderModal(showNavigationModal && (
                        <div
                            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-fadeIn"
                            style={{
                                animation: 'fadeIn 0.2s ease-in-out'
                            }}
                        >
                            <div
                                className="bg-gradient-to-br from-white to-blue-50/30 dark:from-gray-800 dark:to-blue-950/30 rounded-2xl shadow-2xl shadow-blue-500/20 max-w-md w-full p-6 animate-scaleIn border border-blue-200/30 dark:border-blue-700/30"
                                style={{
                                    animation: 'scaleIn 0.3s ease-out'
                                }}
                            >
                                <div className="text-center mb-6">
                                    <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-sky-100 dark:bg-sky-900 mb-4">
                                        <svg className="h-6 w-6 text-sky-600 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <h3 className="text-lg font-semibold mb-2">Treatment Plan Created!</h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        Where would you like to go next?
                                    </p>
                                </div>
                                <div className="space-y-3">
                                    {selectedTreatmentId && selectedTreatmentId !== createdTreatmentId && (
                                        <button
                                            onClick={async () => {
                                                const modal = document.querySelector('.animate-fadeIn')
                                                if (modal) {
                                                    modal.classList.add('animate-fadeOut')
                                                    await new Promise(resolve => setTimeout(resolve, 200))
                                                }
                                                setShowNavigationModal(false)
                                                router.push(`/treatments/${selectedTreatmentId}`)
                                            }}
                                            className="w-full px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium flex items-center justify-center gap-2"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                            </svg>
                                            Edit Source Plan ({(() => {
                                                const plan = treatments.find(t => String(t.id) === String(selectedTreatmentId))
                                                return plan?.planNumber ? `Plan ${plan.planNumber}` : 'Original'
                                            })()})
                                        </button>
                                    )}
                                    <button
                                        onClick={async () => {
                                            const modal = document.querySelector('.animate-fadeIn')
                                            if (modal) {
                                                modal.classList.add('animate-fadeOut')
                                                await new Promise(resolve => setTimeout(resolve, 200))
                                            }
                                            setShowNavigationModal(false)
                                            if (createdTreatmentId) {
                                                router.push(`/treatments/${createdTreatmentId}`)
                                            }
                                        }}
                                        className="w-full px-4 py-3 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                        </svg>
                                        Edit Treatment Plan
                                    </button>
                                    <button
                                        onClick={async () => {
                                            const modal = document.querySelector('.animate-fadeIn')
                                            if (modal) {
                                                modal.classList.add('animate-fadeOut')
                                                await new Promise(resolve => setTimeout(resolve, 200))
                                            }
                                            setShowNavigationModal(false)
                                            if (savedVisitIdForNav) {
                                                router.push(`/visits/${savedVisitIdForNav}`)
                                            }
                                        }}
                                        className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        View Visit Details
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Prescription Preview Card */}

                    </div>
                </>
            )}
        </div>
    )
}

// User/Patient Prescriptions Content Component
function UserPrescriptionsContent({ user }: { user: any }) {
    const [visits, setVisits] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!user) return
        fetch('/api/visits?limit=500&includePrescriptions=true')
            .then(r => r.json())
            .then(response => {
                const data = response.data || response
                // Filter visits that belong to this user
                const userVisits = data.filter((v: any) =>
                    v.patient?.email === user.email || v.patient?.phone === user.phone
                )
                setVisits(userVisits)
                setLoading(false)
            })
            .catch(() => setLoading(false))
    }, [user])

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                <p className="text-muted">Loading your prescriptions...</p>
            </div>
        )
    }

    // Get all prescriptions from all visits
    const allPrescriptions = visits.flatMap(v =>
        (v.prescriptions || []).map((p: any) => ({ ...p, visit: v }))
    )

    return (
        <div>
            <div className="section-header">
                <h2 className="section-title">My Prescriptions</h2>
                <span className="badge">{allPrescriptions.length} prescription(s)</span>
            </div>

            {allPrescriptions.length === 0 ? (
                <div className="card text-center py-12">
                    <span className="text-6xl mb-4 block">💊</span>
                    <h3 className="text-xl font-semibold mb-2">No Prescriptions Yet</h3>
                    <p className="text-muted">Your prescribed medications will appear here after your doctor's visit.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {visits.filter(v => v.prescriptions && v.prescriptions.length > 0).map(visit => (
                        <div key={visit.id} className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-4 overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                            <div className="relative">
                                {/* Visit Header */}
                                <div className="border-b border-gray-200 dark:border-gray-700 pb-4 mb-4">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="text-lg font-semibold mb-1">
                                                Visit - {new Date(visit.date).toLocaleDateString('en-IN', {
                                                    year: 'numeric',
                                                    month: 'long',
                                                    day: 'numeric'
                                                })}
                                            </h3>
                                            <p className="text-sm text-muted">OPD No: <span className="text-sky-600 dark:text-sky-400">{visit.opdNo}</span></p>
                                            {visit.diagnoses && (
                                                <p className="text-sm mt-2">
                                                    <span className="font-medium">Diagnosis:</span> {visit.diagnoses}
                                                </p>
                                            )}
                                            {visit.chiefComplaint && (
                                                <p className="text-sm mt-1">
                                                    <span className="font-medium">Chief Complaint:</span> {visit.chiefComplaint}
                                                </p>
                                            )}
                                        </div>
                                        <Link
                                            href={`/visits/${visit.id}`}
                                            className="btn btn-secondary text-sm"
                                        >
                                            View Full Report
                                        </Link>
                                    </div>
                                </div>

                                {/* Prescriptions List */}
                                <h4 className="font-semibold mb-3">Prescribed Medications:</h4>
                                <div className="space-y-3">
                                    {visit.prescriptions.map((prescription: any, idx: number) => (
                                        <div
                                            key={idx}
                                            className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                                        >
                                            <div className="flex items-start gap-4">
                                                <div className="flex-shrink-0 w-10 h-10 bg-brand text-white rounded-full flex items-center justify-center font-bold">
                                                    {idx + 1}
                                                </div>
                                                <div className="flex-1">
                                                    <h5 className="font-semibold text-base mb-2">
                                                        {prescription.product?.name || 'Medicine'}
                                                    </h5>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                                                        {prescription.dosage && (
                                                            <div>
                                                                <span className="font-medium">Dosage:</span> {(prescription.dosage || '').replace(/\|/g, '/')}
                                                            </div>
                                                        )}
                                                        {prescription.timing && (
                                                            <div>
                                                                <span className="font-medium">Timing:</span> {(prescription.timing || '').replace(/\|/g, '/')}
                                                            </div>
                                                        )}
                                                        {prescription.quantity && (
                                                            <div>
                                                                <span className="font-medium">Quantity:</span> {formatQuantity(prescription.quantity)}
                                                            </div>
                                                        )}
                                                        {prescription.administration && (
                                                            <div>
                                                                <span className="font-medium">Administration:</span> {(prescription.administration || '').replace(/\|/g, '/')}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {prescription.additions && (
                                                        <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded text-sm">
                                                            <span className="font-medium">Special Instructions:</span> {(prescription.additions || '').replace(/\|/g, '/')}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

