import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../../contexts/AuthContext'
import { formatQuantity } from '../../lib/utils'
import CustomSelect from '../../components/CustomSelect'
import LoadingModal from '../../components/LoadingModal'
import ConfirmationModal from '../../components/ConfirmationModal'
import VoiceInput from '../../components/VoiceInput'
import { requireDoctorOrAdmin } from '../../lib/withAuth'
import { useDefaultValues } from '../../hooks/useDefaultValues'
import {
    getCategoryFieldVisibility,
    normalizeCategoryFieldRules,
    normalizeCategoryRuleKey,
} from '../../lib/categoryFieldRules'

function TreatmentPage() {
    const router = useRouter()
    const { id, edit } = router.query
    const isEditMode = edit === 'true' && id
    const { defaults: treatmentDefaults } = useDefaultValues('treatments')
    const [products, setProducts] = useState<any[]>([])
    
    // Initialize loading based on edit mode or prefill parameters
    const hasPrefillParams = typeof window !== 'undefined' && (
        new URLSearchParams(window.location.search).has('diagnosis') ||
        (edit === 'true' && !!id)
    )
    
    // Dropdown options state
    const [components, setComponents] = useState<any[]>([])
    const [timing, setTiming] = useState<any[]>([])
    const [dosage, setDosage] = useState<any[]>([])
    const [doseQuantity, setDoseQuantity] = useState<any[]>([])
    const [doseTiming, setDoseTiming] = useState<any[]>([])
    const [dilution, setDilution] = useState<any[]>([])
    const [additions, setAdditions] = useState<any[]>([])
    const [procedure, setProcedure] = useState<any[]>([])
    const [presentation, setPresentation] = useState<any[]>([])
    const [administration, setAdministration] = useState<any[]>([])
    const [bottlePricing, setBottlePricing] = useState<any[]>([])
    const [organ, setOrgan] = useState<any[]>([])
    const [speciality, setSpeciality] = useState<any[]>([])
    const [diseaseAction, setDiseaseAction] = useState<any[]>([])
    const [imbalance, setImbalance] = useState<any[]>([])
    const [systems, setSystems] = useState<any[]>([])
    const [pulseDiagnosis, setPulseDiagnosis] = useState<any[]>([])
    const [loadingOptions, setLoadingOptions] = useState(true)
    
    const [loading, setLoading] = useState<boolean>(hasPrefillParams)
    const [saving, setSaving] = useState(false)
    const [showSuccessModal, setShowSuccessModal] = useState(false)
    const [allTreatments, setAllTreatments] = useState<any[]>([])
    const [uniqueDiagnoses, setUniqueDiagnoses] = useState<string[]>([])
    const [prefillMode, setPrefillMode] = useState(false)
    const [planNumber, setPlanNumber] = useState('1')
    const [isPlanNumberLocked, setIsPlanNumberLocked] = useState(true)
    const [selectedProductId, setSelectedProductId] = useState('')
    const [selectedMedicines, setSelectedMedicines] = useState<string[]>([])
    const [medicines, setMedicines] = useState<any[]>([])
    const [selectedMedicineIndices, setSelectedMedicineIndices] = useState<Set<number>>(new Set())
    const [showRepeatInput, setShowRepeatInput] = useState(false)
    const [repeatCount, setRepeatCount] = useState<string>('')
    const [showRepeatInputForRow, setShowRepeatInputForRow] = useState<{[key: number]: boolean}>({})
    const [repeatCountForRow, setRepeatCountForRow] = useState<{[key: number]: string}>({})
    const [tab5SearchQuery, setTab5SearchQuery] = useState('')
    const [tab5ShowSelectedOnly, setTab5ShowSelectedOnly] = useState(false)
    const [tab5ShowIncompleteOnly, setTab5ShowIncompleteOnly] = useState(false)
    const [tab5PinSelectedToTop, setTab5PinSelectedToTop] = useState(false)
    const [tab5FocusMode, setTab5FocusMode] = useState(false)
    const [tab5FocusedIndex, setTab5FocusedIndex] = useState<number | null>(null)
    const tab5SearchInputRef = useRef<HTMLInputElement | null>(null)
    const [isBulkDosagePanelOpen, setIsBulkDosagePanelOpen] = useState(false)
    const [bulkDosageAdminValues, setBulkDosageAdminValues] = useState({
        quantity: String(treatmentDefaults.quantity ?? 15),
        timing: treatmentDefaults.timing ?? 'AM',
        doseQuantity: treatmentDefaults.doseQuantity ?? '10',
        doseTiming: treatmentDefaults.doseTiming ?? 'TDS',
        dilution: treatmentDefaults.dilution ?? 'WATER',
        procedure: treatmentDefaults.procedure ?? 'ORAL',
        presentation: treatmentDefaults.presentation ?? 'DRP',
        administration: '',
    })
    const [isBasicInfoDropdownOpen, setIsBasicInfoDropdownOpen] = useState(false)
    const [isOrganOpen, setIsOrganOpen] = useState(false)
    const [isSpecialityOpen, setIsSpecialityOpen] = useState(false)
    const [isImbalanceOpen, setIsImbalanceOpen] = useState(false)
    const [isSystemsOpen, setIsSystemsOpen] = useState(false)
    const [isDiseaseActionOpen, setIsDiseaseActionOpen] = useState(false)
    const [isPulseDiagnosisOpen, setIsPulseDiagnosisOpen] = useState(false)
    const [isAdministrationOpen, setIsAdministrationOpen] = useState(false)
    const [isMedicineSelectOpen, setIsMedicineSelectOpen] = useState(false)
    const [collapsedSections, setCollapsedSections] = useState<{ [key: number]: { spy46: boolean, additions: boolean } }>({})
    
    // ── Medicine Option Feature ──────────────────────────────────────────────
    // Per-row card flip animation state: 'idle' | 'out' | 'in'
    const [medFlipPhase, setMedFlipPhase] = useState<{[idx: number]: 'idle'|'out'|'in'}>({})
    // Direction of flip: 'right' = forward/add (new card from right), 'left' = backward/cancel
    const [medFlipDir, setMedFlipDir] = useState<{[idx: number]: 'left'|'right'}>({})
    // Whether a row is currently showing the "add option" card instead of the product display
    const [medAddMode, setMedAddMode] = useState<{[idx: number]: boolean}>({})
    // Pending product selection for the add option card
    const [medPendingOption, setMedPendingOption] = useState<{[idx: number]: string}>({})

    // Selected medicines list option feature
    const [selMedOptions, setSelMedOptions] = useState<{[productId: string]: string[]}>({})
    const [selMedAddMode, setSelMedAddMode] = useState<string | null>(null)
    const [selMedPending, setSelMedPending] = useState<string>('')
    const [selMedEditIdx, setSelMedEditIdx] = useState<{productId: string; optIdx: number} | null>(null)
    // ────────────────────────────────────────────────────────────────────────
    const [undoStack, setUndoStack] = useState<{ index: number, medicine: any }[]>([])
    const [undoAllStack, setUndoAllStack] = useState<any[][]>([])
    
    // Compare Plan functionality
    const [showComparePlanModal, setShowComparePlanModal] = useState(false)
    const [selectedComparePlan, setSelectedComparePlan] = useState<any>(null)
    const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false)
    const [keywordGenerateError, setKeywordGenerateError] = useState('')
    const [appendGeneratedKeywords, setAppendGeneratedKeywords] = useState(true)

    // Helper functions for parsing component and dosage formats
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
        return { quantity: parts[0] || '', timing: parts[1] || '', dilution: parts[2] || '' }
    }

    function formatDosage(quantity: string, timing: string, dilution: string): string {
        if (!quantity && !timing && !dilution) return ''
        return `${quantity}|${timing}|${dilution}`
    }

    const categoryFieldRules = useMemo(() => {
        return normalizeCategoryFieldRules(treatmentDefaults?.categoryFieldRules)
    }, [treatmentDefaults?.categoryFieldRules])

    function getProductCategoryKey(product: any): string {
        if (!product) return ''
        const rawCategory = typeof product.category === 'string' ? product.category : product.category?.name || ''
        return normalizeCategoryRuleKey(rawCategory)
    }

    function getDisplayProductForMedicine(medicine: any) {
        const optionProductIds: string[] = medicine?.options || []
        const activeOptionIndex = medicine?.activeOptionIndex ?? -1
        const displayProductId = activeOptionIndex === -1
            ? medicine?.productId
            : (optionProductIds[activeOptionIndex] || medicine?.productId)

        if (!displayProductId) return null
        return products.find((p) => String(p.id) === String(displayProductId)) || null
    }

    function getMedicineFieldVisibility(medicine: any) {
        const product = getDisplayProductForMedicine(medicine)
        return getCategoryFieldVisibility(categoryFieldRules, getProductCategoryKey(product))
    }

    const emptyForm = {
        speciality: '',
        imbalance: '',
        systems: '',
        organ: '',
        diseaseAction: '',
        pulseDiagnosis: '',
        provDiagnosis: '',
        treatmentPlan: '',
        notes: ''
    }

    const [form, setForm] = useState(emptyForm)
    const { user } = useAuth()


    useEffect(() => {
        fetch('/api/products').then(r => r.json()).then(data => {
            setProducts(Array.isArray(data) ? data : [])
        })

        // Fetch all treatments to get unique diagnoses and calculate next plan number
        fetch('/api/treatments').then(r => r.json()).then(treatments => {
            setAllTreatments(Array.isArray(treatments) ? treatments : [])

            // Get unique diagnoses
            const diagnoses = Array.from(new Set(
                treatments
                    .filter((t: any) => t.provDiagnosis && !t.deleted)
                    .map((t: any) => t.provDiagnosis)
            )) as string[]
            setUniqueDiagnoses(diagnoses.sort())

            // Calculate initial plan number only for new plans (not edit mode)
            if (!isEditMode) {
                const allPlanNumbers = treatments
                    .filter((t: any) => !t.deleted && t.planNumber)
                    .map((t: any) => parseInt(t.planNumber) || 0)
                const maxPlanNumber = allPlanNumbers.length > 0 ? Math.max(...allPlanNumbers) : 0
                const nextPlanNumber = String(maxPlanNumber + 1)
                setPlanNumber(nextPlanNumber)
            }
        })
    }, [])
    
    // Fetch dropdown options from API
    useEffect(() => {
        const fetchOptions = async () => {
            try {
                setLoadingOptions(true)
                const [
                    componentsData,
                    timingData,
                    dosageData,
                    doseQuantityData,
                    doseTimingData,
                    dilutionData,
                    additionsData,
                    procedureData,
                    presentationData,
                    administrationData,
                    bottlePricingData,
                    organData,
                    specialityData,
                    diseaseActionData,
                    imbalanceData,
                    systemsData,
                    pulseDiagnosisData
                ] = await Promise.all([
                    fetch('/api/options/components').then(r => r.json()).catch(() => []),
                    fetch('/api/options/timing').then(r => r.json()).catch(() => []),
                    fetch('/api/options/dosage').then(r => r.json()).catch(() => []),
                    fetch('/api/options/dose-quantity').then(r => r.json()).catch(() => []),
                    fetch('/api/options/dose-timing').then(r => r.json()).catch(() => []),
                    fetch('/api/options/dilution').then(r => r.json()).catch(() => []),
                    fetch('/api/options/additions').then(r => r.json()).catch(() => []),
                    fetch('/api/options/procedure').then(r => r.json()).catch(() => []),
                    fetch('/api/options/presentation').then(r => r.json()).catch(() => []),
                    fetch('/api/options/administration').then(r => r.json()).catch(() => []),
                    fetch('/api/options/bottle-pricing').then(r => r.json()).catch(() => []),
                    fetch('/api/options/organ').then(r => r.json()).catch(() => []),
                    fetch('/api/options/speciality').then(r => r.json()).catch(() => []),
                    fetch('/api/options/disease-action').then(r => r.json()).catch(() => []),
                    fetch('/api/options/imbalance').then(r => r.json()).catch(() => []),
                    fetch('/api/options/systems').then(r => r.json()).catch(() => []),
                    fetch('/api/options/pulse-diagnosis').then(r => r.json()).catch(() => [])
                ])
                
                // Fallback to JSON files if API returns empty data
                const componentsJSON = (await import('../../data/components.json')).default
                const timingJSON = (await import('../../data/timing.json')).default
                const doseQuantityJSON = (await import('../../data/doseQuantity.json')).default
                const doseTimingJSON = (await import('../../data/doseTiming.json')).default
                const dilutionJSON = (await import('../../data/dilution.json')).default
                const additionsJSON = (await import('../../data/additions.json')).default
                const procedureJSON = (await import('../../data/procedure.json')).default
                const presentationJSON = (await import('../../data/presentation.json')).default
                const administrationJSON = (await import('../../data/administration.json')).default
                const bottlePricingJSON = (await import('../../data/bottlePricing.json')).default
                const organJSON = (await import('../../data/organ.json')).default
                const specialityJSON = (await import('../../data/speciality.json')).default
                const diseaseActionJSON = (await import('../../data/diseaseAction.json')).default
                const imbalanceJSON = (await import('../../data/imbalance.json')).default
                const systemsJSON = (await import('../../data/systems.json')).default
                const pulseDiagnosisJSON = (await import('../../data/pulseDiagnosis.json')).default
                
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
                setOrgan(organData.length > 0 ? organData : organJSON)
                setSpeciality(specialityData.length > 0 ? specialityData : specialityJSON)
                setDiseaseAction(diseaseActionData.length > 0 ? diseaseActionData : diseaseActionJSON)
                setImbalance(imbalanceData.length > 0 ? imbalanceData : imbalanceJSON)
                setSystems(systemsData.length > 0 ? systemsData : systemsJSON)
                setPulseDiagnosis(pulseDiagnosisData.length > 0 ? pulseDiagnosisData : pulseDiagnosisJSON)
            } catch (error) {
            } finally {
                setLoadingOptions(false)
            }
        }
        fetchOptions()
    }, [])

    // Load existing treatment data in edit mode
    useEffect(() => {
        if (!isEditMode || !id) return

        fetch(`/api/treatments?id=${id}`)
            .then(r => {
                if (!r.ok) throw new Error('Treatment not found')
                return r.json()
            })
            .then(treatment => {
                // Load treatment data - convert to uppercase
                setForm({
                    speciality: treatment.speciality?.toUpperCase() || '',
                    imbalance: treatment.imbalance || '',
                    systems: treatment.systems || '',
                    organ: treatment.organ?.toUpperCase() || '',
                    diseaseAction: treatment.diseaseAction?.toUpperCase() || '',
                    pulseDiagnosis: treatment.pulseDiagnosis || '',
                    provDiagnosis: treatment.provDiagnosis?.toUpperCase() || '',
                    treatmentPlan: treatment.treatmentPlan?.toUpperCase() || '',
                    notes: treatment.notes?.toUpperCase() || ''
                })

                setPlanNumber(treatment.planNumber || '01')

                // Load existing medicines
                if (treatment.treatmentProducts && treatment.treatmentProducts.length > 0) {
                    setMedicines(treatment.treatmentProducts.map((tp: any) => ({
                        id: tp.id,
                        productId: tp.productId.toString(),
                        options: (() => {
                            try { return tp.optionProductIds ? JSON.parse(tp.optionProductIds).map(String) : [] }
                            catch { return [] }
                        })(),
                        activeOptionIndex: -1,
                        spy1: tp.spy1 || '',
                        spy2: tp.spy2 || '',
                        spy3: tp.spy3 || '',
                        spy4: tp.spy4 || '',
                        spy5: tp.spy5 || '',
                        spy6: tp.spy6 || '',
                        quantity: tp.quantity || 1,
                        bottleSize: tp.bottleSize || '15',
                        timing: tp.timing || '',
                        dosage: tp.dosage || '',
                        addition1: tp.addition1 || '',
                        addition2: tp.addition2 || '',
                        addition3: tp.addition3 || '',
                        procedure: tp.procedure || '',
                        presentation: tp.presentation || '',
                        administration: tp.administration || '',
                        droppersToday: tp.droppersToday?.toString() || '',
                        medicineQuantity: tp.medicineQuantity?.toString() || ''
                    })))
                }

                // Delay hiding loading modal to ensure all data is rendered
                setTimeout(() => {
                    setLoading(false)
                }, 300)
            })
            .catch(err => {
                alert('Failed to load treatment')
                router.push('/treatments')
                setLoading(false)
            })
    }, [id, isEditMode, router])

    // Check for prefill parameters from URL
    useEffect(() => {
        if (!allTreatments.length) return // Wait for treatments to load

        const params = new URLSearchParams(window.location.search)
        const diagnosis = params.get('diagnosis')
        const speciality = params.get('speciality')
        const imbalance = params.get('imbalance')
        const systems = params.get('systems')
        const organ = params.get('organ')
        const diseaseAction = params.get('diseaseAction')

        if (diagnosis) {
            setPrefillMode(true)
            setForm({
                provDiagnosis: diagnosis.toUpperCase(),
                speciality: speciality?.toUpperCase() || '',
                imbalance: imbalance || '',
                systems: systems || '',
                organ: organ?.toUpperCase() || '',
                diseaseAction: diseaseAction?.toUpperCase() || '',
                pulseDiagnosis: '',
                treatmentPlan: diagnosis.toUpperCase(),
                notes: ''
            })
            // Calculate plan number for the prefilled diagnosis
            updateProvDiagnosis(diagnosis)
            
            // Delay to ensure form is populated
            setTimeout(() => {
                setLoading(false)
            }, 300)
        }
    }, [allTreatments])

    function updateProvDiagnosis(newDiagnosis: string) {
        const upperDiagnosis = newDiagnosis.toUpperCase()
        
        // Calculate next plan number for this diagnosis
        if (upperDiagnosis && allTreatments.length > 0) {
            const diagnosisTreatments = allTreatments.filter((t: any) => 
                t.provDiagnosis?.toUpperCase() === upperDiagnosis && !t.deleted
            )
            const planNumbers = diagnosisTreatments.map((t: any) => parseInt(t.planNumber) || 0)
            const maxPlanNumber = planNumbers.length > 0 ? Math.max(...planNumbers) : 0
            const nextPlanNumber = String(maxPlanNumber + 1)
            setPlanNumber(nextPlanNumber)
        } else {
            setPlanNumber('1')
        }
        
        // Auto-fill other fields based on selected diagnosis (including imbalance and systems)
        if (upperDiagnosis && allTreatments.length > 0) {
            const matchingTreatment = allTreatments.find((t: any) =>
                t.provDiagnosis?.toUpperCase() === upperDiagnosis
            )
            
            if (matchingTreatment) {
                const newFormData = {
                    ...form,
                    provDiagnosis: upperDiagnosis,
                    speciality: matchingTreatment.speciality || form.speciality,
                    imbalance: matchingTreatment.imbalance || form.imbalance,
                    systems: matchingTreatment.systems || form.systems,
                    organ: matchingTreatment.organ || form.organ,
                    diseaseAction: matchingTreatment.diseaseAction || form.diseaseAction,
                    pulseDiagnosis: matchingTreatment.pulseDiagnosis || form.pulseDiagnosis,
                    treatmentPlan: upperDiagnosis
                }
                setForm(newFormData)
                return
            }
        }

        // If no match found, just update diagnosis and treatment plan
        setForm(prev => ({
            ...prev,
            provDiagnosis: upperDiagnosis,
            treatmentPlan: upperDiagnosis
        }))
    }

    // Medicine list functionality
    function removeFromSelectedMedicines(productId: string) {
        setSelectedMedicines(selectedMedicines.filter(id => id !== productId))
    }

    function removeAllSelectedMedicines() {
        setSelectedMedicines([])
    }

    function addAllSelectedMedicinesToTreatment() {
        const newMedicines = selectedMedicines.map(productId => ({
            productId: productId,
            options: selMedOptions[productId] || [],
            activeOptionIndex: -1,
            spy1: '', spy2: '', spy3: '', spy4: '', spy5: '', spy6: '',
            quantity: treatmentDefaults.quantity ?? 15,
            bottleSize: treatmentDefaults.bottleSize ?? '15',
            timing: treatmentDefaults.timing ?? 'AM',
            dosage: `${treatmentDefaults.doseQuantity ?? '10'}|${treatmentDefaults.doseTiming ?? 'TDS'}|${treatmentDefaults.dilution ?? 'WATER'}`,
            addition1: '', addition2: '', addition3: '',
            procedure: treatmentDefaults.procedure ?? 'ORAL',
            presentation: treatmentDefaults.presentation ?? 'DRP',
            administration: ''
        }))
        setMedicines([...medicines, ...newMedicines])
        setSelectedMedicines([])
        setSelMedOptions({})
        setSelMedAddMode(null)
    }

    function addMedicine(productId: string) {
        if (!productId || productId === '') return

        // Add medicine to the list
        setMedicines([...medicines, {
            productId: productId,
            options: [],
            activeOptionIndex: -1,
            spy1: '', spy2: '', spy3: '', spy4: '', spy5: '', spy6: '',
            quantity: treatmentDefaults.quantity ?? 15,
            bottleSize: treatmentDefaults.bottleSize ?? '15',
            timing: treatmentDefaults.timing ?? 'AM',
            dosage: `${treatmentDefaults.doseQuantity ?? '10'}|${treatmentDefaults.doseTiming ?? 'TDS'}|${treatmentDefaults.dilution ?? 'WATER'}`,
            addition1: '', addition2: '', addition3: '',
            procedure: treatmentDefaults.procedure ?? 'ORAL',
            presentation: treatmentDefaults.presentation ?? 'DRP',
            administration: ''
        }])

        // Clear selection
        setSelectedProductId('')
    }

    function removeMedicine(index: number) {
        setMedicines(medicines.filter((_, i) => i !== index))
        // Update selected indices after removal
        const newSelected = new Set<number>()
        selectedMedicineIndices.forEach(i => {
            if (i < index) newSelected.add(i)
            else if (i > index) newSelected.add(i - 1)
        })
        setSelectedMedicineIndices(newSelected)
    }
    
    // Toggle medicine selection
    function toggleMedicineSelection(index: number) {
        const newSelected = new Set(selectedMedicineIndices)
        if (newSelected.has(index)) {
            newSelected.delete(index)
        } else {
            newSelected.add(index)
        }
        setSelectedMedicineIndices(newSelected)
    }
    
    // Toggle select all medicines
    function toggleSelectAll() {
        if (selectedMedicineIndices.size === medicines.length) {
            setSelectedMedicineIndices(new Set())
        } else {
            setSelectedMedicineIndices(new Set(medicines.map((_, i) => i)))
        }
    }
    
    // Remove selected medicines
    function removeSelectedMedicines() {
        if (selectedMedicineIndices.size === 0) return
        const newMedicines = medicines.filter((_, i) => !selectedMedicineIndices.has(i))
        setMedicines(newMedicines)
        setSelectedMedicineIndices(new Set())
    }
    
    // Repeat selected medicines
    function repeatSelectedMedicines() {
        if (selectedMedicineIndices.size === 0) return
        const count = parseInt(repeatCount)
        if (!count || count < 1) return
        
        const selectedIndices = Array.from(selectedMedicineIndices).sort((a, b) => a - b)
        const itemsToRepeat = selectedIndices.map(i => ({ ...medicines[i] }))
        
        const newMedicines = [...medicines]
        for (let i = 0; i < count; i++) {
            newMedicines.push(...itemsToRepeat.map(item => ({ ...item })))
        }
        
        setMedicines(newMedicines)
        setSelectedMedicineIndices(new Set())
        setShowRepeatInput(false)
        setRepeatCount('')
    }
    
    // Repeat single row
    function repeatSingleRow(index: number) {
        const count = parseInt(repeatCountForRow[index] || '')
        if (!count || count < 1) return
        
        const itemToRepeat = { ...medicines[index] }
        const newMedicines = [...medicines]
        
        for (let i = 0; i < count; i++) {
            newMedicines.push({ ...itemToRepeat })
        }
        
        setMedicines(newMedicines)
        setShowRepeatInputForRow(prev => ({ ...prev, [index]: false }))
        setRepeatCountForRow(prev => ({ ...prev, [index]: '' }))
    }
    
    // Restore default dosage & administrative details for a single medicine
    function restoreDefaultValues(index: number) {
        // Save current state for undo
        setUndoStack([...undoStack, { index, medicine: { ...medicines[index] } }])
        
        updateMedicine(index, 'quantity', 15)
        updateMedicine(index, 'timing', 'AM')
        updateMedicine(index, 'dosage', '10|TDS|WATER')
        updateMedicine(index, 'procedure', 'ORAL')
        updateMedicine(index, 'presentation', 'DRP')
        updateMedicine(index, 'bottleSize', '15')
    }
    
    // Restore default dosage & administrative details for all medicines
    function restoreDefaultValuesForAll() {
        // Save current state for undo
        setUndoAllStack([...undoAllStack, [...medicines]])
        
        // Also add each medicine to individual undo stack so all buttons become undo buttons
        const newUndoStack = medicines.map((med, index) => ({
            index,
            medicine: { ...med }
        }))
        setUndoStack(newUndoStack)
        
        const updated = medicines.map(med => ({
            ...med,
            quantity: treatmentDefaults.quantity ?? 15,
            timing: treatmentDefaults.timing ?? 'AM',
            dosage: `${treatmentDefaults.doseQuantity ?? '10'}|${treatmentDefaults.doseTiming ?? 'TDS'}|${treatmentDefaults.dilution ?? 'WATER'}`,
            procedure: treatmentDefaults.procedure ?? 'ORAL',
            presentation: treatmentDefaults.presentation ?? 'DRP',
            bottleSize: treatmentDefaults.bottleSize ?? '15'
        }))
        setMedicines(updated)
    }

    function applyBulkDosageAdministrationToAll() {
        applyBulkDosageAdministrationToIndices(medicines.map((_, index) => index))
    }

    function applyBulkDosageAdministrationToSelected() {
        const selectedIndices = Array.from(selectedMedicineIndices).sort((a, b) => a - b)
        if (selectedIndices.length === 0) return
        applyBulkDosageAdministrationToIndices(selectedIndices)
    }

    function applyBulkDosageAdministrationToIndices(indices: number[]) {
        if (indices.length === 0) return

        const quantityRaw = String(bulkDosageAdminValues.quantity || '').trim()
        const parsedQuantity = Number(quantityRaw)
        if (quantityRaw !== '' && (!Number.isFinite(parsedQuantity) || parsedQuantity < 0)) return

        const dosageValue = formatDosage(
            String(bulkDosageAdminValues.doseQuantity || '').trim(),
            String(bulkDosageAdminValues.doseTiming || '').trim().toUpperCase(),
            String(bulkDosageAdminValues.dilution || '').trim().toUpperCase()
        )

        setUndoAllStack([...undoAllStack, [...medicines]])

        const indexSet = new Set(indices)
        const newUndoStack = indices.map((index) => ({
            index,
            medicine: { ...medicines[index] }
        }))
        setUndoStack((prev) => [...prev, ...newUndoStack])

        const updated = medicines.map((med, index) => {
            if (!indexSet.has(index)) return med
            return {
                ...med,
                quantity: quantityRaw === '' ? '' : parsedQuantity,
                timing: String(bulkDosageAdminValues.timing || '').trim().toUpperCase(),
                dosage: dosageValue,
                procedure: String(bulkDosageAdminValues.procedure || '').trim().toUpperCase(),
                presentation: String(bulkDosageAdminValues.presentation || '').trim().toUpperCase(),
                administration: String(bulkDosageAdminValues.administration || '').trim().toUpperCase(),
            }
        })
        setMedicines(updated)
    }

    function isMedicineIncomplete(medicine: any): boolean {
        const parsed = parseDosage(medicine?.dosage || '')
        const visibility = getMedicineFieldVisibility(medicine)

        return !medicine?.productId
            || (visibility.quantity && !medicine?.quantity)
            || (visibility.timing && !medicine?.timing)
            || (visibility.doseQuantity && !parsed.quantity)
            || (visibility.doseTiming && !parsed.timing)
            || (visibility.dilution && !parsed.dilution)
            || (visibility.procedure && !medicine?.procedure)
            || (visibility.presentation && !medicine?.presentation)
    }

    const filteredMedicineRows = useMemo(() => {
        const query = tab5SearchQuery.trim().toLowerCase()
        const shouldFilterByQuery = query.length > 0

        return medicines
            .map((medicine, index) => ({ medicine, index }))
            .filter(({ medicine, index }) => {
                if (tab5ShowSelectedOnly && !selectedMedicineIndices.has(index)) return false
                if (tab5ShowIncompleteOnly && !isMedicineIncomplete(medicine)) return false

                if (!shouldFilterByQuery) return true

                const optionProductIds: string[] = medicine.options || []
                const activeOptionIndex = medicine.activeOptionIndex ?? -1
                const displayProductId = activeOptionIndex === -1
                    ? String(medicine.productId || '')
                    : String(optionProductIds[activeOptionIndex] || medicine.productId || '')
                const product = products.find((p) => String(p.id) === displayProductId)
                const text = [
                    product?.name || '',
                    medicine.timing || '',
                    medicine.dosage || '',
                    medicine.procedure || '',
                    medicine.presentation || '',
                    medicine.administration || '',
                ].join(' ').toLowerCase()

                return text.includes(query)
            })
    }, [medicines, tab5SearchQuery, tab5ShowSelectedOnly, tab5ShowIncompleteOnly, selectedMedicineIndices, products])

    const visibleMedicineRows = useMemo(() => {
        let rows = [...filteredMedicineRows]

        if (tab5PinSelectedToTop) {
            rows.sort((a, b) => Number(selectedMedicineIndices.has(b.index)) - Number(selectedMedicineIndices.has(a.index)))
        }

        if (tab5FocusMode && tab5FocusedIndex !== null) {
            rows = rows.filter((row) => row.index === tab5FocusedIndex)
        }

        return rows
    }, [filteredMedicineRows, tab5PinSelectedToTop, tab5FocusMode, tab5FocusedIndex, selectedMedicineIndices])

    const visibleMedicineIndices = useMemo(() => visibleMedicineRows.map((row) => row.index), [visibleMedicineRows])
    const visibleMedicineCount = visibleMedicineRows.length
    const hiddenMedicineCount = Math.max(0, medicines.length - visibleMedicineCount)
    const visibleIncompleteCount = useMemo(() => visibleMedicineRows.filter(({ medicine }) => isMedicineIncomplete(medicine)).length, [visibleMedicineRows])
    const hasTab5Filters = tab5ShowSelectedOnly || tab5ShowIncompleteOnly || tab5SearchQuery.trim().length > 0

    function clearTab5Filters() {
        setTab5SearchQuery('')
        setTab5ShowSelectedOnly(false)
        setTab5ShowIncompleteOnly(false)
    }

    function selectVisibleMedicines() {
        setSelectedMedicineIndices(new Set(visibleMedicineIndices))
    }

    function selectVisibleIncompleteMedicines() {
        const issueIndices = visibleMedicineRows.filter(({ medicine }) => isMedicineIncomplete(medicine)).map(({ index }) => index)
        setSelectedMedicineIndices(new Set(issueIndices))
    }

    function clearMedicineSelection() {
        setSelectedMedicineIndices(new Set())
    }

    function setAdvancedSectionsCollapsedForVisible(collapsed: boolean) {
        setCollapsedSections((prev) => {
            const next = { ...prev }
            visibleMedicineIndices.forEach((index) => {
                next[index] = { spy46: collapsed, additions: collapsed }
            })
            return next
        })
    }

    function toggleTab5FocusMode() {
        setTab5FocusMode((prev) => !prev)
    }

    function focusMedicineRow(index: number) {
        setTab5FocusMode(true)
        setTab5FocusedIndex(index)
    }

    function moveTab5Focus(direction: 'next' | 'prev') {
        const list = visibleMedicineIndices
        if (list.length === 0) return
        if (tab5FocusedIndex === null || !list.includes(tab5FocusedIndex)) {
            setTab5FocusedIndex(list[0])
            return
        }
        const currentPos = list.indexOf(tab5FocusedIndex)
        const step = direction === 'next' ? 1 : -1
        const nextPos = (currentPos + step + list.length) % list.length
        setTab5FocusedIndex(list[nextPos])
    }

    useEffect(() => {
        if (!tab5FocusMode) {
            setTab5FocusedIndex(null)
            return
        }
        if (visibleMedicineIndices.length === 0) {
            setTab5FocusedIndex(null)
            return
        }
        if (tab5FocusedIndex === null || !visibleMedicineIndices.includes(tab5FocusedIndex)) {
            setTab5FocusedIndex(visibleMedicineIndices[0])
        }
    }, [tab5FocusMode, visibleMedicineIndices, tab5FocusedIndex])

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const active = document.activeElement as HTMLElement | null
            const tag = active?.tagName?.toLowerCase()
            const isTyping = Boolean(active?.isContentEditable || tag === 'input' || tag === 'textarea' || tag === 'select')

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
                selectVisibleMedicines()
            } else if (key === 'i') {
                event.preventDefault()
                selectVisibleIncompleteMedicines()
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
    }, [visibleMedicineIndices, tab5FocusedIndex])
    
    // Undo single restore
    function undoRestore() {
        if (undoStack.length === 0) return
        
        const lastUndo = undoStack[undoStack.length - 1]
        const newStack = undoStack.slice(0, -1)
        setUndoStack(newStack)
        
        const updated = [...medicines]
        updated[lastUndo.index] = lastUndo.medicine
        setMedicines(updated)
    }
    
    // Undo restore all
    function undoRestoreAll() {
        if (undoAllStack.length === 0) return
        
        const lastState = undoAllStack[undoAllStack.length - 1]
        const newStack = undoAllStack.slice(0, -1)
        setUndoAllStack(newStack)
        
        // Clear individual undo stack when undoing all
        setUndoStack([])
        
        setMedicines(lastState)
    }
    
    // ── Medicine Option Card Flip Helpers ─────────────────────────────────────
    /** Flip a medicine row's card from current view to a new view.
     *  dir='right' → new content enters from right (add-option / navigate forward)
     *  dir='left'  → new content enters from left  (cancel / navigate backward) */
    function _flipMed(idx: number, dir: 'left'|'right', callback: () => void) {
        // Ignore if already animating
        if (medFlipPhase[idx] === 'out' || medFlipPhase[idx] === 'in') return
        setMedFlipDir(p => ({...p, [idx]: dir}))
        setMedFlipPhase(p => ({...p, [idx]: 'out'}))
        setTimeout(() => {
            callback()
            setMedFlipPhase(p => ({...p, [idx]: 'in'}))
            setTimeout(() => setMedFlipPhase(p => ({...p, [idx]: 'idle'})), 240)
        }, 190)
    }

    /** Open "add option" card for a medicine row */
    function openAddOption(idx: number) {
        _flipMed(idx, 'right', () => {
            setMedAddMode(p => ({...p, [idx]: true}))
            setMedPendingOption(p => ({...p, [idx]: ''}))
        })
    }

    /** Cancel "add option" card – flip back to product view */
    function cancelAddOption(idx: number) {
        _flipMed(idx, 'left', () => {
            setMedAddMode(p => ({...p, [idx]: false}))
            setMedPendingOption(p => ({...p, [idx]: ''}))
        })
    }

    /** Confirm the selected option – append to medicine.options then flip back */
    function confirmAddOption(idx: number) {
        const pendingId = medPendingOption[idx]
        if (!pendingId) return
        _flipMed(idx, 'left', () => {
            setMedicines(prev => {
                const updated = [...prev]
                const existing = updated[idx].options || []
                // Avoid duplicates
                if (!existing.includes(pendingId)) {
                    updated[idx] = {...updated[idx], options: [...existing, pendingId]}
                }
                return updated
            })
            setMedAddMode(p => ({...p, [idx]: false}))
            setMedPendingOption(p => ({...p, [idx]: ''}))
        })
    }

    /** Navigate through options. dir='right'=next, dir='left'=prev */
    function navigateOption(idx: number, dir: 'left'|'right') {
        const med = medicines[idx]
        const opts = med.options || []
        if (opts.length === 0) return
        const cur = med.activeOptionIndex ?? -1
        let next: number
        if (dir === 'right') {
            next = cur >= opts.length - 1 ? -1 : cur + 1
        } else {
            next = cur <= -1 ? opts.length - 1 : cur - 1
        }
        _flipMed(idx, dir, () => {
            setMedicines(prev => {
                const updated = [...prev]
                updated[idx] = {...updated[idx], activeOptionIndex: next}
                return updated
            })
        })
    }

    // ── Selected Medicines List Option Helpers ────────────────────────────────
    function openSelMedAddOption(productId: string) {
        setSelMedEditIdx(null)
        setSelMedPending('')
        setSelMedAddMode(productId)
    }

    function confirmSelMedOption(productId: string) {
        if (!selMedPending) return
        setSelMedOptions(prev => {
            const existing = prev[productId] || []
            if (selMedEditIdx && selMedEditIdx.productId === productId) {
                // Replace at edit index
                const updated = [...existing]
                updated[selMedEditIdx.optIdx] = selMedPending
                return {...prev, [productId]: updated}
            }
            if (existing.includes(selMedPending)) return prev
            return {...prev, [productId]: [...existing, selMedPending]}
        })
        setSelMedAddMode(null)
        setSelMedPending('')
        setSelMedEditIdx(null)
    }

    function removeSelMedOption(productId: string, optIdx: number) {
        setSelMedOptions(prev => ({
            ...prev,
            [productId]: (prev[productId] || []).filter((_, i) => i !== optIdx)
        }))
    }

    function editSelMedOption(productId: string, optIdx: number) {
        const optId = (selMedOptions[productId] || [])[optIdx]
        setSelMedEditIdx({productId, optIdx})
        setSelMedPending(optId || '')
        setSelMedAddMode(productId)
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Get existing plans for the current diagnosis
    function getExistingPlansForDiagnosis() {        if (!form.provDiagnosis) return []
        
        const diagnosisTreatments = allTreatments.filter((t: any) => 
            t.provDiagnosis?.toUpperCase() === form.provDiagnosis.toUpperCase() && !t.deleted
        )
        
        return diagnosisTreatments.sort((a: any, b: any) => 
            (parseInt(a.planNumber) || 0) - (parseInt(b.planNumber) || 0)
        )
    }
    
    // Use this plan data functionality
    function useThisPlanData(selectedPlan: any) {
        if (!selectedPlan) return
        
        // Copy medicines and all data from the selected plan
        if (selectedPlan.treatmentProducts && selectedPlan.treatmentProducts.length > 0) {
            const copiedMedicines = selectedPlan.treatmentProducts.map((tp: any) => ({
                productId: String(tp.productId),
                options: (() => {
                    try { return tp.optionProductIds ? JSON.parse(tp.optionProductIds).map(String) : [] }
                    catch { return [] }
                })(),
                activeOptionIndex: -1,
                spy1: tp.spy1 || '',
                spy2: tp.spy2 || '',
                spy3: tp.spy3 || '',
                spy4: tp.spy4 || '',
                spy5: tp.spy5 || '',
                spy6: tp.spy6 || '',
                quantity: tp.quantity || 15,
                timing: tp.timing || 'AM',
                dosage: tp.dosage || '10|TDS|WATER',
                addition1: tp.addition1 || '',
                addition2: tp.addition2 || '',
                addition3: tp.addition3 || '',
                procedure: tp.procedure || 'ORAL',
                presentation: tp.presentation || 'DRP',
                administration: tp.administration || '',
                bottleSize: tp.bottleSize || '15',
                droppersToday: tp.droppersToday?.toString() || '',
                medicineQuantity: tp.medicineQuantity?.toString() || ''
            }))
            
            setMedicines(copiedMedicines)
            setShowComparePlanModal(false)
            setSelectedComparePlan(null)
        }
    }

    function updateMedicine(index: number, field: string, value: any) {
        const updated = [...medicines]
        // Convert specific fields to uppercase
        if (['spy1', 'spy2', 'spy3', 'spy4', 'spy5', 'spy6', 'dosage', 'addition1', 'addition2', 'addition3', 'procedure', 'presentation'].includes(field)) {
            value = typeof value === 'string' ? value.toUpperCase() : value
        }
        updated[index] = { ...updated[index], [field]: value }
        setMedicines(updated)
    }

    function mergeWeightedKeywords(existingText: string, generatedText: string): string {
        const map = new Map<string, number>()

        const addFromText = (text: string) => {
            String(text || '')
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean)
                .forEach((item) => {
                    const colon = item.lastIndexOf(':')
                    const rawWord = (colon > -1 ? item.slice(0, colon) : item).trim().toLowerCase()
                    if (!rawWord) return
                    const rawWeight = colon > -1 ? Number(item.slice(colon + 1)) : 1
                    const safeWeight = Number.isFinite(rawWeight) ? Math.max(1, Math.min(5, Math.round(rawWeight))) : 1
                    const prev = map.get(rawWord) || 0
                    map.set(rawWord, Math.max(prev, safeWeight))
                })
        }

        addFromText(existingText)
        addFromText(generatedText)

        return Array.from(map.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([word, weight]) => `${word}:${weight}`)
            .join(', ')
    }

    async function handleGenerateKeywords() {
        if (!String(form.provDiagnosis || '').trim()) {
            alert('Please select provisional diagnosis first')
            return
        }

        try {
            setIsGeneratingKeywords(true)
            setKeywordGenerateError('')

            const medicineNames = medicines
                .map((m: any) => products.find((p: any) => String(p.id) === String(m.productId))?.name)
                .filter(Boolean)

            const res = await fetch('/api/treatments/generate-keywords', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    diagnosis: form.provDiagnosis,
                    speciality: form.speciality,
                    imbalance: form.imbalance,
                    systems: form.systems,
                    organ: form.organ,
                    diseaseAction: form.diseaseAction,
                    pulseDiagnosis: form.pulseDiagnosis,
                    treatmentPlan: form.treatmentPlan,
                    notes: form.notes,
                    medicineNames,
                    includeCommonComplaints: true,
                }),
            })

            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
                const message = String(data?.error || 'Failed to generate keywords')
                setKeywordGenerateError(message)
                return
            }

            const generated = String(data?.keywords || '').trim()
            if (!generated) {
                setKeywordGenerateError('No keywords were generated. Please try again.')
                return
            }

            setForm((prev) => {
                const nextNotes = appendGeneratedKeywords
                    ? mergeWeightedKeywords(prev.notes || '', generated)
                    : generated
                return { ...prev, notes: nextNotes.toUpperCase() }
            })
        } catch (error: any) {
            setKeywordGenerateError(String(error?.message || 'Failed to generate keywords'))
        } finally {
            setIsGeneratingKeywords(false)
        }
    }

    async function create(e: any) {
        e.preventDefault()

        setSaving(true)

        try {
            const treatmentData = {
                speciality: form.speciality.toUpperCase(),
                imbalance: form.imbalance.toUpperCase(),
                systems: form.systems.toUpperCase(),
                organ: form.organ.toUpperCase(),
                diseaseAction: form.diseaseAction.toUpperCase(),
                pulseDiagnosis: form.pulseDiagnosis || '',
                provDiagnosis: form.provDiagnosis.toUpperCase(),
                planNumber: planNumber,
                treatmentPlan: (form.treatmentPlan || form.provDiagnosis).toUpperCase(),
                notes: form.notes.toUpperCase(),
                products: medicines.filter((p: any) => p.productId).map((p: any) => ({
                    productId: p.productId,
                    optionProductIds: p.options && p.options.length > 0 ? p.options : [],
                    spy1: p.spy1?.toUpperCase() || '',
                    spy2: p.spy2?.toUpperCase() || '',
                    spy3: p.spy3?.toUpperCase() || '',
                    spy4: p.spy4?.toUpperCase() || '',
                    spy5: p.spy5?.toUpperCase() || '',
                    spy6: p.spy6?.toUpperCase() || '',
                    quantity: p.quantity,
                    bottleSize: p.bottleSize || '',
                    timing: p.timing,
                    dosage: p.dosage?.toUpperCase() || '',
                    addition1: p.addition1?.toUpperCase() || '',
                    addition2: p.addition2?.toUpperCase() || '',
                    addition3: p.addition3?.toUpperCase() || '',
                    procedure: p.procedure?.toUpperCase() || '',
                    presentation: p.presentation?.toUpperCase() || '',
                    administration: p.administration?.toUpperCase() || '',
                    droppersToday: p.droppersToday ? parseInt(p.droppersToday) : null,
                    medicineQuantity: p.medicineQuantity ? parseInt(p.medicineQuantity) : null
                }))
            }

            const url = '/api/treatments'
            const method = isEditMode ? 'PUT' : 'POST'
            const body = isEditMode 
                ? JSON.stringify({ ...treatmentData, id: parseInt(id as string) })
                : JSON.stringify(treatmentData)

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body
            })

            if (!res.ok) {
                const err = await res.text()
                alert('Failed to save treatment')
                setSaving(false)
                return
            }

            const savedTreatment = await res.json()

            // Store the new ID for showing NEW label (only for new treatments)
            if (!isEditMode && savedTreatment.id) {
                localStorage.setItem('newTreatmentId', savedTreatment.id.toString())
            }

            // Show success modal after save
            setSaving(false)
            setShowSuccessModal(true)
        } catch (error) {
            alert('Failed to save treatment')
            setSaving(false)
        }
    }

    function handleAddAnotherPlan() {
        setShowSuccessModal(false)
        
        if (isEditMode) {
            // In edit mode, just go back to treatments list
            router.push('/treatments')
        } else {
            // In add mode, prefill with basic information for another plan
            localStorage.removeItem('newTreatmentId')
            const params = new URLSearchParams({
                diagnosis: form.provDiagnosis,
                speciality: form.speciality,
                imbalance: form.imbalance,
                systems: form.systems,
                organ: form.organ,
                diseaseAction: form.diseaseAction
            })
            router.push(`/treatments/form?new=true&${params.toString()}`)
        }
    }

    function handleNoThanks() {
        setShowSuccessModal(false)
        const newId = localStorage.getItem('newTreatmentId')
        if (newId) {
            router.push(`/treatments?newId=${newId}`)
            localStorage.removeItem('newTreatmentId')
        } else {
            router.push('/treatments')
        }
    }

    return (
        <div>
            {/* Loading Modal */}
            <LoadingModal isOpen={loading} message="Loading treatment data..." />
            
            {/* Saving Loading Modal */}
            <LoadingModal isOpen={saving} message="Saving treatment plan..." />

            {/* Success Modal */}
            <ConfirmationModal
                isOpen={showSuccessModal}
                title={isEditMode ? "Treatment Plan Updated Successfully!" : "Treatment Plan Added Successfully!"}
                message={isEditMode ? "Treatment plan has been updated." : "Would you like to add another plan for this diagnosis?"}
                confirmText={isEditMode ? "Back to Treatments" : "Add Another Plan"}
                cancelText={isEditMode ? undefined : "No Thanks"}
                onConfirm={handleAddAnotherPlan}
                onCancel={handleNoThanks}
                type="info"
            />

            <div className="section-header">
                <h2 className="section-title">{isEditMode ? 'Edit Treatment Plan' : 'Add New Treatment'}</h2>
                <button
                    onClick={() => router.push('/treatments')}
                    className="btn btn-secondary"
                >
                    ← Back to Treatments
                </button>
            </div>

            <form onSubmit={create} className="space-y-6">
                <div className={`rounded-xl border border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-br from-white via-blue-50 to-sky-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 shadow-lg shadow-blue-500/10 p-6 backdrop-blur-sm ${isBasicInfoDropdownOpen ? 'relative z-[10000]' : 'relative z-0'}`}>
                    <h3 className="text-lg font-semibold mb-4 text-blue-900 dark:text-blue-100">Basic Information</h3>
                    <div className="grid grid-cols-1 gap-3">
                        <div>
                            <label className="block text-sm font-medium mb-1.5">Provisional Diagnosis</label>
                            {prefillMode ? (
                                <input
                                    placeholder="Enter diagnosis"
                                    value={form.provDiagnosis}
                                    readOnly
                                    className="p-2 border rounded w-full bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
                                />
                            ) : (
                                <CustomSelect
                                    value={form.provDiagnosis}
                                    onChange={(val) => updateProvDiagnosis(val)}
                                    options={[
                                        { value: '', label: 'Select diagnosis' },
                                        ...uniqueDiagnoses.map(d => ({
                                            value: d,
                                            label: d
                                        }))
                                    ]}
                                    placeholder="Select diagnosis"
                                    allowCustom={true}
                                    className="w-full"
                                    onOpenChange={setIsBasicInfoDropdownOpen}
                                    loading={loadingOptions}
                                />
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                        <div className={isSpecialityOpen ? 'relative z-[10000]' : 'relative z-0'}>
                            <label className="block text-sm font-medium mb-1.5">Speciality</label>
                            <CustomSelect
                                value={form.speciality}
                                onChange={(val) => setForm({ ...form, speciality: val.toUpperCase() })}
                                options={[
                                    { value: '', label: 'Select speciality' },
                                    ...speciality.sort((a, b) => String(a.label || a).localeCompare(String(b.label || b))).map(s => ({ value: s.value || s, label: s.label || s }))
                                ]}
                                placeholder="Select speciality"
                                allowCustom={true}
                                className="w-full"
                                disabled={prefillMode}
                                onOpenChange={setIsSpecialityOpen}
                                loading={loadingOptions}
                            />
                        </div>
                        <div className={isImbalanceOpen ? 'relative z-[10000]' : 'relative z-0'}>
                            <label className="block text-sm font-medium mb-1.5">Imbalance</label>
                            <CustomSelect
                                value={form.imbalance}
                                onChange={(val) => setForm({ ...form, imbalance: val })}
                                options={[
                                    { value: '', label: 'Select imbalance' },
                                    ...imbalance.sort((a, b) => String(a?.label || a || '').localeCompare(String(b?.label || b || ''))).map(i => ({ value: i?.value || i, label: i?.label || i }))
                                ]}
                                placeholder="Select imbalance"
                                allowCustom={true}
                                className="w-full"
                                disabled={prefillMode}
                                onOpenChange={setIsImbalanceOpen}
                                loading={loadingOptions}
                            />
                        </div>
                        <div className={isSystemsOpen ? 'relative z-[10000]' : 'relative z-0'}>
                            <label className="block text-sm font-medium mb-1.5">Systems</label>
                            <CustomSelect
                                value={form.systems}
                                onChange={(val) => setForm({ ...form, systems: val })}
                                options={[
                                    { value: '', label: 'Select system' },
                                    ...systems.sort((a, b) => String(a?.label || a || '').localeCompare(String(b?.label || b || ''))).map(s => ({ value: s?.value || s, label: s?.label || s }))
                                ]}
                                placeholder="Select system"
                                allowCustom={true}
                                className="w-full"
                                disabled={prefillMode}
                                onOpenChange={setIsSystemsOpen}
                                loading={loadingOptions}
                            />
                        </div>
                        <div className={isOrganOpen ? 'relative z-[10000]' : 'relative z-0'}>
                            <label className="block text-sm font-medium mb-1.5">Organ</label>
                            <CustomSelect
                                value={form.organ}
                                onChange={(val) => setForm({ ...form, organ: val })}
                                options={[
                                    { value: '', label: 'Select organ' },
                                    ...organ.sort((a, b) => String(a.label || a).localeCompare(String(b.label || b))).map(o => ({ value: o.value || o, label: o.label || o }))
                                ]}
                                placeholder="Select organ"
                                allowCustom={true}
                                className="w-full"
                                disabled={prefillMode}
                                onOpenChange={setIsOrganOpen}
                                loading={loadingOptions}
                            />
                        </div>
                        <div className={isDiseaseActionOpen ? 'relative z-[10000]' : 'relative z-0'}>
                            <label className="block text-sm font-medium mb-1.5">Disease Action</label>
                            <CustomSelect
                                value={form.diseaseAction}
                                onChange={(val) => setForm({ ...form, diseaseAction: val.toUpperCase() })}
                                options={[
                                    { value: '', label: 'Select disease action' },
                                    ...diseaseAction.sort((a, b) => String(a.label || a).localeCompare(String(b.label || b))).map(d => ({ value: d.value || d, label: d.label || d }))
                                ]}
                                placeholder="Select disease action"
                                allowCustom={true}
                                className="w-full"
                                disabled={prefillMode}
                                onOpenChange={setIsDiseaseActionOpen}
                                loading={loadingOptions}
                            />
                        </div>
                        <div className={isPulseDiagnosisOpen ? 'relative z-[10000]' : 'relative z-0'}>
                            <label className="block text-sm font-medium mb-1.5">Pulse Diagnosis</label>
                            <CustomSelect
                                value={form.pulseDiagnosis}
                                onChange={(val) => setForm({ ...form, pulseDiagnosis: val })}
                                options={pulseDiagnosis}
                                placeholder="Select pulse diagnosis"
                                allowCustom={false}
                                className="w-full"
                                disabled={prefillMode}
                                onOpenChange={setIsPulseDiagnosisOpen}
                                loading={loadingOptions}
                            />
                        </div>
                    </div>
                    <div className="mt-3">
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-sm font-medium">Additional Notes</label>
                            <button
                                type="button"
                                onClick={handleGenerateKeywords}
                                disabled={isGeneratingKeywords}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 disabled:opacity-60 disabled:cursor-not-allowed"
                                title="Generate electrohomeopathy keywords with Gemini"
                            >
                                {isGeneratingKeywords ? (
                                    <>
                                        <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                                            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                                        </svg>
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l1.9 3.9L18 9l-4.1 2.1L12 15l-1.9-3.9L6 9l4.1-2.1L12 3zM5 16l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2zm14-1l1.2 2.4L23 18.6l-2.8 1.2L19 22l-1.2-2.2L15 18.6l2.8-1.2L19 15z" />
                                        </svg>
                                        AI Keywords
                                    </>
                                )}
                            </button>
                        </div>
                        <VoiceInput
                            label={null}
                            rows={2}
                            placeholder="ADDITIONAL NOTES"
                            value={form.notes}
                            onChange={(value) => setForm((prev: any) => ({ ...prev, notes: String(value || '').toUpperCase() }))}
                            className="w-full"
                        />
                        <label className="mt-2 inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                            <input
                                type="checkbox"
                                checked={appendGeneratedKeywords}
                                onChange={(e) => setAppendGeneratedKeywords(e.target.checked)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            Append generated keywords to existing notes
                        </label>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Generates weighted electrohomeopathy keywords in format keyword:weight, including common patient complaints.
                        </p>
                        {keywordGenerateError && (
                            <p className="mt-1 text-xs text-red-600 dark:text-red-400">{keywordGenerateError}</p>
                        )}
                    </div>
                </div>

                {/* Treatment Plan Section (Single Plan) */}
                <div className="rounded-xl border border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-br from-white via-blue-50 to-sky-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 shadow-lg shadow-blue-500/10 p-6 backdrop-blur-sm">
                    <div className="border-2 border-blue-300/50 dark:border-blue-700/50 rounded-lg p-4 bg-gradient-to-br from-blue-50/50 via-sky-50/30 to-blue-100/50 dark:from-blue-950/30 dark:via-blue-900/20 dark:to-blue-950/30">
                        {/* Plan Header */}
                        <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-blue-300/50 dark:border-blue-700/50">
                            <div className="flex items-center gap-3">
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Plan Number:</span>
                                {isPlanNumberLocked ? (
                                    <span className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-sky-600 text-white rounded-md text-sm font-bold shadow-md">
                                        {planNumber}
                                    </span>
                                ) : (
                                    <input
                                        type="text"
                                        value={planNumber}
                                        onChange={(e) => setPlanNumber(e.target.value)}
                                        className="px-3 py-1.5 border-2 border-blue-500 rounded-md text-sm font-bold w-20 text-center"
                                    />
                                )}
                                <button
                                    type="button"
                                    onClick={() => setIsPlanNumberLocked(!isPlanNumberLocked)}
                                    className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
                                    title={isPlanNumberLocked ? "Unlock to edit" : "Lock plan number"}
                                >
                                    {isPlanNumberLocked ? (
                                        <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                        </svg>
                                    ) : (
                                        <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                            {form.provDiagnosis && (() => {
                                const existingPlans = getExistingPlansForDiagnosis()
                                
                                if (existingPlans.length === 0) return null
                                
                                return (
                                    <button
                                        type="button"
                                        onClick={() => setShowComparePlanModal(true)}
                                        className="px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-700 rounded-lg transition-colors shadow-sm hover:shadow-md flex items-center gap-1"
                                        title={`Compare ${existingPlans.length} existing plan(s)`}
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                        </svg>
                                        Compare Plans
                                    </button>
                                )
                            })()}
                        </div>

                        {/* Plan Details Form */}
                        <div className="grid grid-cols-1 gap-3 mb-4">
                            <div>
                                <label className="block text-sm font-medium mb-1.5">Treatment Plan Details</label>
                                <input
                                    placeholder="TREATMENT PLAN DESCRIPTION"
                                    value={form.treatmentPlan}
                                    onChange={e => setForm({ ...form, treatmentPlan: e.target.value.toUpperCase() })}
                                    className="p-2 border rounded-lg w-full text-sm uppercase"
                                    readOnly={prefillMode}
                                />
                            </div>
                        </div>

                        {/* Medicine Selection with List */}
                        <div className="border-t-2 border-blue-300/50 dark:border-blue-700/50 pt-4 mt-3">
                            <h5 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3">Select Medicines from Inventory</h5>

                            {/* Medicine Dropdown */}
                            <div className={`mb-3 medicine-select-wrapper ${isMedicineSelectOpen ? 'relative z-[10000]' : 'relative z-0'}`}>
                                <CustomSelect
                                    value={selectedProductId}
                                    onChange={(value) => {
                                        setSelectedProductId(value)
                                        if (value && value !== '') {
                                            // Check if already in selected medicines
                                            if (!selectedMedicines.includes(value)) {
                                                setSelectedMedicines([...selectedMedicines, value])
                                            }
                                            setSelectedProductId('')
                                        }
                                    }}
                                    options={[
                                        { value: '', label: '-- select medicine from inventory --' },
                                        ...products.map(p => {
                                            const unitParts = p.unit ? String(p.unit).trim().split(/\s+/) : []
                                            const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                                            const flowInventory = (Number(p.totalPurchased) || 0) - (Number(p.totalSales) || 0)
                                            const actualInventory = unitQuantity > 0 ? Math.floor(flowInventory / unitQuantity) : 0
                                            const rl = (p as any).reorderLevel ?? 0
                                            const low = flowInventory <= rl
                                            return {
                                                value: String(p.id),
                                                label: `${p.name} · Stock: ${formatQuantity(actualInventory)} (${formatQuantity(flowInventory)})${rl ? ' · Reorder: ' + rl : ''}${low ? ' · ⚠️ LOW' : ''}`
                                            }
                                        })
                                    ]}
                                    placeholder="-- select medicine from inventory --"
                                    className="w-full"
                                    onOpenChange={setIsMedicineSelectOpen}
                                />
                            </div>

                            {/* Selected Medicines List */}
                            <div className="bg-gradient-to-br from-blue-50/80 via-sky-50/60 to-blue-100/80 dark:from-blue-950/40 dark:via-blue-900/30 dark:to-blue-950/40 border border-blue-300/50 dark:border-blue-700/50 rounded-lg p-3 mb-3 backdrop-blur-sm">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                                        Selected Medicines ({selectedMedicines.length})
                                    </span>
                                    {selectedMedicines.length > 0 && (
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={removeAllSelectedMedicines}
                                                className="btn btn-secondary text-xs py-1 px-2"
                                            >
                                                Remove All
                                            </button>
                                            <button
                                                type="button"
                                                onClick={addAllSelectedMedicinesToTreatment}
                                                className="btn btn-primary text-xs py-1 px-2"
                                            >
                                                Add All to Treatment
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {selectedMedicines.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-4 gap-2.5">
                                        <p className="text-xs text-gray-500 dark:text-gray-400">No medicines selected yet.</p>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const input = document.querySelector<HTMLInputElement>('.medicine-select-wrapper input')
                                                if (input) { input.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => { input.focus(); input.click() }, 200) }
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold hover:opacity-90 transition-opacity"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                            </svg>
                                            Add Medicine
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-3 pr-0.5">
                                        {selectedMedicines.map((productId) => {
                                            const product = products.find(p => String(p.id) === productId)
                                            if (!product) return null
                                            const optionIds = selMedOptions[productId] || []
                                            const isAddingOpt = selMedAddMode === productId
                                            return (
                                                <div key={productId} className="rounded-xl overflow-hidden border border-blue-200/70 dark:border-blue-700/60 shadow-sm bg-white dark:bg-gray-800/90">
                                                    {/* Main product header */}
                                                    <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-50 to-sky-50/60 dark:from-blue-950/40 dark:to-sky-950/20 border-b border-blue-100 dark:border-blue-800/60">
                                                        {/* Color dot */}
                                                        <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-blue-500 to-sky-500 flex-shrink-0 shadow-sm shadow-blue-400/40"></div>
                                                        {/* Product name */}
                                                        <span className="flex-1 text-sm font-semibold text-blue-800 dark:text-blue-200 leading-snug">
                                                            {product.name}
                                                        </span>
                                                        {/* Action buttons */}
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (isAddingOpt) {
                                                                        setSelMedAddMode(null); setSelMedPending(''); setSelMedEditIdx(null)
                                                                    } else {
                                                                        openSelMedAddOption(productId)
                                                                    }
                                                                }}
                                                                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${isAddingOpt
                                                                    ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-800/40'
                                                                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800/50'}`}
                                                            >
                                                                {isAddingOpt
                                                                    ? <><span className="text-sm leading-none">✕</span> Cancel</>
                                                                    : <><span className="text-base leading-none font-bold">+</span> Options</>}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => removeFromSelectedMedicines(productId)}
                                                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 transition-all"
                                                            >
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                                                                Remove
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Add option input area */}
                                                    {isAddingOpt && (
                                                        <div className="px-4 py-3 bg-emerald-50/80 dark:bg-emerald-950/20 border-b border-emerald-200/70 dark:border-emerald-800/50">
                                                            <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium mb-2">Select alternative / option product:</p>
                                                            <div className="flex items-center gap-2">
                                                                <CustomSelect
                                                                    value={selMedPending}
                                                                    onChange={setSelMedPending}
                                                                    options={[
                                                                        { value: '', label: '-- select alternative product --' },
                                                                        ...products.map(p => ({ value: String(p.id), label: p.name }))
                                                                    ]}
                                                                    placeholder="-- select alternative product --"
                                                                    className="flex-1 text-xs h-8"
                                                                />
                                                                <button type="button" onClick={() => confirmSelMedOption(productId)}
                                                                        disabled={!selMedPending}
                                                                        title="Confirm option"
                                                                        className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm">
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Options tree */}
                                                    {optionIds.length > 0 && (
                                                        <div className="px-4 py-2 space-y-1.5">
                                                            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-400 dark:text-gray-500 mt-1 mb-2">Options</p>
                                                            {optionIds.map((optId, optIdx) => {
                                                                const optProduct = products.find(p => String(p.id) === optId)
                                                                return (
                                                                    <div key={optIdx} className="flex items-center gap-2 pl-3 pr-2 py-2 rounded-lg bg-slate-50 dark:bg-gray-700/40 border border-slate-200/80 dark:border-gray-600/50 group">
                                                                        {/* Connector */}
                                                                        <div className="flex flex-col items-center flex-shrink-0 self-stretch justify-center">
                                                                            <div className="w-px h-2 bg-blue-300 dark:bg-blue-600"></div>
                                                                            <div className="w-3 h-px bg-blue-300 dark:bg-blue-600"></div>
                                                                        </div>
                                                                        {/* Badge */}
                                                                        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-[9px] font-bold">{optIdx + 1}</span>
                                                                        {/* Name */}
                                                                        <span className="flex-1 text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{optProduct?.name || optId}</span>
                                                                        {/* Actions */}
                                                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                            <button type="button" onClick={() => editSelMedOption(productId, optIdx)}
                                                                                    className="px-2 py-1 text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 rounded-md transition-colors">
                                                                                Edit
                                                                            </button>
                                                                            <button type="button" onClick={() => removeSelMedOption(productId, optIdx)}
                                                                                    className="px-2 py-1 text-[10px] font-semibold text-red-500 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-md transition-colors">
                                                                                ✕
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )
                                                            })}
                                                            <div className="pb-1"></div>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Added Medicines in Treatment */}
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    {medicines.length > 0 && (
                                        <label className="relative group/checkbox cursor-pointer flex-shrink-0">
                                            <input
                                                type="checkbox"
                                                checked={selectedMedicineIndices.size === medicines.length && medicines.length > 0}
                                                onChange={toggleSelectAll}
                                                className="peer sr-only"
                                            />
                                            <div className="w-5 h-5 border-2 border-blue-400 dark:border-blue-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-blue-500 peer-checked:to-sky-600 peer-checked:border-blue-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-blue-500/50 group-hover/checkbox:border-blue-500 group-hover/checkbox:scale-110">
                                                <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                        </label>
                                    )}
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                        Medicines in Treatment {selectedMedicineIndices.size > 0 && <span className="px-2 py-0.5 ml-2 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 rounded-full text-xs font-bold">({selectedMedicineIndices.size} selected)</span>}
                                    </span>
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                    {selectedMedicineIndices.size > 0 && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={removeSelectedMedicines}
                                                className="px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg transition-colors shadow-sm hover:shadow-md"
                                                title={`Remove ${selectedMedicineIndices.size} selected`}
                                            >
                                                <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                                Remove ({selectedMedicineIndices.size})
                                            </button>
                                            {!showRepeatInput ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setShowRepeatInput(true)}
                                                    className="px-3 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 border border-purple-200 dark:border-purple-700 rounded-lg transition-colors shadow-sm hover:shadow-md"
                                                >
                                                    <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                    </svg>
                                                    Repeat
                                                </button>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        value={repeatCount}
                                                        onChange={(e) => setRepeatCount(e.target.value)}
                                                        placeholder="Times"
                                                        className="w-16 px-2 py-1 text-xs border border-purple-300 dark:border-purple-700 rounded bg-white dark:bg-gray-800"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={repeatSelectedMedicines}
                                                        className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
                                                    >
                                                        OK
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => { setShowRepeatInput(false); setRepeatCount('') }}
                                                        className="px-2 py-1 text-xs bg-gray-400 text-white rounded hover:bg-gray-500"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            )}
                                        </>
                                    )}
                                    {medicines.length > 0 && (
                                        <button 
                                            type="button" 
                                            onClick={undoAllStack.length > 0 ? undoRestoreAll : restoreDefaultValuesForAll}
                                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-300 shadow-sm hover:shadow-md ${
                                                undoAllStack.length > 0 
                                                    ? 'text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-900/30 hover:bg-purple-100 dark:hover:bg-purple-900/50 border border-purple-200 dark:border-purple-700'
                                                    : 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-700'
                                            }`}
                                            title={undoAllStack.length > 0 ? 'Undo the last Restore Default on All action' : 'Restore default values (Qty: 15, Timing: AM, Dose: 10|TDS|WATER, Procedure: ORAL, Presentation: DRP, Bottle: 15 ML) for all medicines'}
                                        >
                                                <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    {undoAllStack.length > 0 ? (
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                                    ) : (
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                    )}
                                                </svg>
                                                {undoAllStack.length > 0 ? 'Undo All' : 'Restore Default on All'}
                                            </button>
                                    )}
                                </div>
                            </div>
                            {medicines.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-6 gap-3 bg-white dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-xl">
                                    <p className="text-sm text-gray-500 dark:text-gray-400">No medicines added to treatment yet.</p>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const input = document.querySelector<HTMLInputElement>('.medicine-select-wrapper input')
                                            if (input) { input.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => { input.focus(); input.click() }, 200) }
                                        }}
                                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:opacity-90 transition-opacity shadow-sm"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        Add Medicine
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    <div className="sticky top-2 z-40 rounded-xl border border-sky-200/70 dark:border-sky-700/60 bg-sky-50/95 dark:bg-sky-900/30 backdrop-blur-sm p-3 shadow-sm">
                                        <div className="flex flex-col lg:flex-row gap-3 lg:items-end lg:justify-between">
                                            <div className="flex-1 min-w-[220px]">
                                                <label className="block text-[11px] font-semibold text-sky-700 dark:text-sky-300 mb-1">Quick Find In Medicines</label>
                                                <input
                                                    type="text"
                                                    ref={tab5SearchInputRef}
                                                    value={tab5SearchQuery}
                                                    onChange={(e) => setTab5SearchQuery(e.target.value)}
                                                    placeholder="Search by medicine, timing, dosage, instruction..."
                                                    className="w-full px-3 py-2 text-sm border border-sky-300 dark:border-sky-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                                                />
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setTab5ShowSelectedOnly((prev) => !prev)}
                                                    className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${tab5ShowSelectedOnly ? 'bg-blue-600 text-white border-blue-600' : 'bg-white dark:bg-gray-800 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/40'}`}
                                                >
                                                    Selected Only
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setTab5ShowIncompleteOnly((prev) => !prev)}
                                                    className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${tab5ShowIncompleteOnly ? 'bg-red-600 text-white border-red-600' : 'bg-white dark:bg-gray-800 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/40'}`}
                                                >
                                                    Incomplete Only
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
                                                    onClick={selectVisibleMedicines}
                                                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 bg-white dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/40"
                                                >
                                                    Select Visible
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={selectVisibleIncompleteMedicines}
                                                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 bg-white dark:bg-gray-800 hover:bg-rose-50 dark:hover:bg-rose-900/40"
                                                >
                                                    Select Incomplete
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={clearMedicineSelection}
                                                    disabled={selectedMedicineIndices.size === 0}
                                                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Clear Selection
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setAdvancedSectionsCollapsedForVisible(true)}
                                                    disabled={visibleMedicineIndices.length === 0}
                                                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 bg-white dark:bg-gray-800 hover:bg-sky-50 dark:hover:bg-sky-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Collapse Advanced
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setAdvancedSectionsCollapsedForVisible(false)}
                                                    disabled={visibleMedicineIndices.length === 0}
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
                                                    disabled={visibleMedicineIndices.length === 0}
                                                    className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${tab5FocusMode ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-gray-800 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/40'}`}
                                                >
                                                    {tab5FocusMode ? 'Focus Mode: ON' : 'Focus Mode'}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                                            <span className="px-2 py-1 rounded-full bg-sky-100 dark:bg-sky-900/50 text-sky-800 dark:text-sky-300 font-semibold">
                                                Visible: {visibleMedicineCount} / {medicines.length}
                                            </span>
                                            {hiddenMedicineCount > 0 && (
                                                <span className="px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold">
                                                    Hidden by filters: {hiddenMedicineCount}
                                                </span>
                                            )}
                                            {visibleIncompleteCount > 0 && (
                                                <span className="px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 font-semibold">
                                                    Visible incomplete: {visibleIncompleteCount}
                                                </span>
                                            )}
                                            {tab5FocusMode && tab5FocusedIndex !== null && (
                                                <div className="flex items-center gap-1">
                                                    <button type="button" onClick={() => moveTab5Focus('prev')} className="px-2 py-1 rounded-md bg-white dark:bg-gray-800 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 font-semibold">Prev</button>
                                                    <span className="px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-semibold">Focused row #{tab5FocusedIndex + 1}</span>
                                                    <button type="button" onClick={() => moveTab5Focus('next')} className="px-2 py-1 rounded-md bg-white dark:bg-gray-800 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 font-semibold">Next</button>
                                                </div>
                                            )}
                                            <span className="px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-semibold">
                                                Shortcuts: / find, Alt+S visible, Alt+I incomplete, Alt+F focus, Alt+Enter apply selected
                                            </span>
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
                                                <div className="text-xs text-blue-600 dark:text-blue-400">Set once and apply exactly to all medicines in this treatment</div>
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
                                                            options={timing}
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
                                                            options={doseQuantity}
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
                                                            options={doseTiming}
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
                                                            options={dilution}
                                                            placeholder="Along With"
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
                                                            options={procedure}
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
                                                            options={presentation}
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
                                                            options={administration}
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
                                                        disabled={selectedMedicineIndices.size === 0}
                                                        className="px-4 py-2 text-sm font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        Apply To Selected ({selectedMedicineIndices.size})
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={applyBulkDosageAdministrationToAll}
                                                        className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 rounded-lg shadow-md transition-all"
                                                    >
                                                        Apply To All Medicines
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {visibleMedicineRows.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-sky-300 dark:border-sky-700 p-6 text-center bg-sky-50/60 dark:bg-sky-900/20">
                                            <div className="text-sm font-semibold text-sky-800 dark:text-sky-300">No matching medicines in current filters</div>
                                            <div className="text-xs text-sky-600 dark:text-sky-400 mt-1">Try clearing filters or changing your search.</div>
                                            <button
                                                type="button"
                                                onClick={clearTab5Filters}
                                                className="mt-3 px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700"
                                            >
                                                Clear Filters
                                            </button>
                                        </div>
                                    ) : visibleMedicineRows.map(({ medicine, index: medicineIndex }) => {
                                        const isFocusedRow = tab5FocusMode && tab5FocusedIndex === medicineIndex
                                        const displayProduct = getDisplayProductForMedicine(medicine)
                                        const medicineFieldVisibility = getMedicineFieldVisibility(medicine)
                                        return (
                                            <div key={medicineIndex} className={`relative group transition-all duration-300 border border-blue-200/40 dark:border-blue-700/40 bg-gradient-to-br from-white via-blue-50/20 to-transparent dark:from-gray-900/80 dark:via-blue-950/10 dark:to-gray-900/80 rounded-2xl hover:border-blue-400/60 dark:hover:border-blue-600/60 hover:shadow-xl hover:shadow-blue-500/10 ${tab5FocusMode && !isFocusedRow ? 'opacity-45' : ''} ${isFocusedRow ? 'ring-2 ring-sky-400 dark:ring-sky-500 shadow-xl shadow-sky-500/15' : ''}`}>
                                                <button
                                                    type="button"
                                                    onClick={() => focusMedicineRow(medicineIndex)}
                                                    className="absolute top-2 right-2 z-20 px-2 py-1 rounded-md text-[10px] font-semibold bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-700 hover:bg-sky-200 dark:hover:bg-sky-900/60"
                                                    title="Focus this row"
                                                >
                                                    Focus
                                                </button>
                                                {/* Selection Checkbox */}
                                                <div className="absolute top-4 left-4 z-10">
                                                    <label className="relative group/checkbox cursor-pointer flex-shrink-0">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedMedicineIndices.has(medicineIndex)}
                                                            onChange={() => toggleMedicineSelection(medicineIndex)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="peer sr-only"
                                                        />
                                                        <div className="w-5 h-5 border-2 border-blue-400 dark:border-blue-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-blue-500 peer-checked:to-sky-600 peer-checked:border-blue-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-blue-500/50 group-hover/checkbox:border-blue-500 group-hover/checkbox:scale-110">
                                                            <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        </div>
                                                    </label>
                                                </div>
                                                {/* Futuristic glow effect on hover */}
                                                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-blue-400/0 via-sky-400/0 to-blue-500/0 group-hover:from-blue-400/5 group-hover:via-sky-400/5 group-hover:to-blue-500/5 transition-all duration-500 pointer-events-none"></div>
                                                <div className="relative pl-12 p-4">
                                                    {/* Row 1: Medicine Name (Left) + SPY Grid (Right) */}
                                                    <div className="flex flex-col lg:flex-row gap-4 mb-3">
                                                        {/* LEFT: Medicine Info with Options */}
                                                        <div className="w-full lg:w-64 lg:flex-shrink-0">
                                                            {/* Header row: label + options pill button */}
                                                            <div className="flex items-center justify-between mb-2">
                                                                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Medicine</label>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => medAddMode[medicineIndex] ? cancelAddOption(medicineIndex) : openAddOption(medicineIndex)}
                                                                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all duration-200 shadow-sm ${
                                                                        medAddMode[medicineIndex]
                                                                            ? 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-200'
                                                                            : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800/50'
                                                                    }`}
                                                                    title={medAddMode[medicineIndex] ? 'Cancel' : 'Add alternative option'}
                                                                >
                                                                    {medAddMode[medicineIndex] ? (
                                                                        <><svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg> Cancel</>
                                                                    ) : (
                                                                        <>
                                                                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4"/></svg>
                                                                            {(medicine.options?.length ?? 0) > 0 ? <><span>{medicine.options.length} Option{medicine.options.length > 1 ? 's' : ''}</span></> : 'Add Options'}
                                                                        </>
                                                                    )}
                                                                </button>
                                                            </div>

                                                            {/* Card area: nav arrows float on sides, flip card in between */}
                                                            <div className="relative">
                                                                {/* Left / Prev arrow */}
                                                                {(medicine.options?.length ?? 0) > 0 && !medAddMode[medicineIndex] && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => navigateOption(medicineIndex, 'left')}
                                                                        className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-white dark:bg-gray-700 border border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/50 shadow transition-all hover:scale-110"
                                                                        title="Previous"
                                                                    >
                                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7"/></svg>
                                                                    </button>
                                                                )}
                                                                {/* Right / Next arrow */}
                                                                {(medicine.options?.length ?? 0) > 0 && !medAddMode[medicineIndex] && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => navigateOption(medicineIndex, 'right')}
                                                                        className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-white dark:bg-gray-700 border border-blue-200 dark:border-blue-700 text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/50 shadow transition-all hover:scale-110"
                                                                        title="Next"
                                                                    >
                                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7"/></svg>
                                                                    </button>
                                                                )}

                                                                {/* Flip card */}
                                                                <div className="med-card-wrap">
                                                                    <div className={
                                                                        medFlipPhase[medicineIndex] === 'out'
                                                                            ? (medFlipDir[medicineIndex] === 'right' ? 'med-flip-out-left' : 'med-flip-out-right')
                                                                            : medFlipPhase[medicineIndex] === 'in'
                                                                            ? (medFlipDir[medicineIndex] === 'right' ? 'med-flip-in-right' : 'med-flip-in-left')
                                                                            : ''
                                                                    }>
                                                                        {medAddMode[medicineIndex] ? (
                                                                            /* ── Add Option Card ── */
                                                                            <div className="p-3 text-xs rounded-xl border-2 border-emerald-400 dark:border-emerald-600 bg-gradient-to-br from-emerald-50 to-teal-50/60 dark:from-emerald-950/40 dark:to-teal-950/20 shadow-sm">
                                                                                <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-2">Select Alternative Product</p>
                                                                                <CustomSelect
                                                                                    value={medPendingOption[medicineIndex] || ''}
                                                                                    onChange={(val) => setMedPendingOption(p => ({...p, [medicineIndex]: val}))}
                                                                                    options={[
                                                                                        { value: '', label: '-- select option product --' },
                                                                                        ...products.map(p => ({ value: String(p.id), label: p.name }))
                                                                                    ]}
                                                                                    placeholder="-- select option product --"
                                                                                    className="text-xs h-8 w-full mb-3"
                                                                                />
                                                                                <div className="flex gap-2">
                                                                                    <button type="button" onClick={() => cancelAddOption(medicineIndex)}
                                                                                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-white dark:bg-gray-700 border border-red-200 dark:border-red-700 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 text-[10px] font-semibold transition-colors">
                                                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                                                                                        Cancel
                                                                                    </button>
                                                                                    <button type="button" onClick={() => confirmAddOption(medicineIndex)}
                                                                                            disabled={!medPendingOption[medicineIndex]}
                                                                                            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[10px] font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-emerald-500/30">
                                                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/></svg>
                                                                                        Confirm
                                                                                    </button>
                                                                                </div>
                                                                            </div>
                                                                        ) : (() => {
                                                                            /* ── Normal product display / select ── */
                                                                            const activeIdx = medicine.activeOptionIndex ?? -1
                                                                            const displayProductId = activeIdx === -1
                                                                                ? medicine.productId
                                                                                : (medicine.options?.[activeIdx] || medicine.productId)
                                                                            return displayProductId && displayProduct ? (
                                                                                <div className="relative p-3 text-xs text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                                                                    {/* Top bar: index badge + name + edit icon */}
                                                                                    <div className="flex items-start gap-2 mb-2 pr-6">
                                                                                        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center bg-gradient-to-br from-blue-600 to-sky-500 text-white rounded-md text-[10px] font-bold shadow-sm">{medicineIndex + 1}</span>
                                                                                        <span className="font-semibold leading-snug text-gray-800 dark:text-gray-100">{displayProduct.name}</span>
                                                                                    </div>
                                                                                    {/* Edit button top-right */}
                                                                                    <button type="button" onClick={() => updateMedicine(medicineIndex, 'productId', '')}
                                                                                            className="absolute top-2.5 right-2.5 p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-md transition-colors" title="Change medicine">
                                                                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                                                                                        </svg>
                                                                                    </button>
                                                                                    {/* Option/Main indicator dots */}
                                                                                    {(medicine.options?.length ?? 0) > 0 && (
                                                                                        <div className="flex items-center gap-1 mb-2">
                                                                                            {/* Main dot */}
                                                                                            <button type="button" onClick={() => { if (activeIdx !== -1) navigateOption(medicineIndex, activeIdx >= 0 ? 'left' : 'right') }}
                                                                                                    className={`w-1.5 h-1.5 rounded-full transition-all ${activeIdx === -1 ? 'bg-blue-600 dark:bg-blue-400 scale-125' : 'bg-gray-300 dark:bg-gray-600 hover:bg-blue-400'}`} title="Main product"/>
                                                                                            {medicine.options.map((_: any, oi: number) => (
                                                                                                <button key={oi} type="button"
                                                                                                        onClick={() => { const diff = oi - activeIdx; if (diff !== 0) { for (let s = 0; s < Math.abs(diff); s++) navigateOption(medicineIndex, diff > 0 ? 'right' : 'left') } }}
                                                                                                        className={`w-1.5 h-1.5 rounded-full transition-all ${activeIdx === oi ? 'bg-indigo-600 dark:bg-indigo-400 scale-125' : 'bg-gray-300 dark:bg-gray-600 hover:bg-indigo-400'}`} title={`Option ${oi + 1}`}/>
                                                                                            ))}
                                                                                            {activeIdx >= 0 && <span className="ml-1 text-[9px] font-bold text-indigo-600 dark:text-indigo-400">OPT {activeIdx + 1}</span>}
                                                                                        </div>
                                                                                    )}
                                                                                    {/* Category + Stock */}
                                                                                    {displayProduct.category && (
                                                                                        <div className="space-y-1.5">
                                                                                            <div className="flex items-center gap-1 text-[10px]">
                                                                                                {(() => {
                                                                                                    const catName = typeof displayProduct.category === 'string' ? displayProduct.category : displayProduct.category.name
                                                                                                    if (displayProduct.unit) {
                                                                                                        const uParts = String(displayProduct.unit).trim().split(/\s+/)
                                                                                                        const uType = uParts.length >= 2 ? uParts[1] : ''
                                                                                                        return <span className="px-1.5 py-0.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-full">{catName}{uType ? ` (${uType})` : ''}</span>
                                                                                                    }
                                                                                                    return <span className="px-1.5 py-0.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-full">{catName}</span>
                                                                                                })()}
                                                                                            </div>

                                                                                            {medicineFieldVisibility.bottleSize && (
                                                                                                <div>
                                                                                                    <CustomSelect
                                                                                                        value={medicine.bottleSize || ''}
                                                                                                        onChange={(val) => {
                                                                                                            const bsNum = parseInt(val)
                                                                                                            const updated = [...medicines]
                                                                                                            updated[medicineIndex] = {...updated[medicineIndex], bottleSize: val, quantity: !isNaN(bsNum) ? bsNum : updated[medicineIndex].quantity}
                                                                                                            setMedicines(updated)
                                                                                                        }}
                                                                                                        options={bottlePricing.map(bp => ({value: bp.value, label: bp.label}))}
                                                                                                        placeholder="Bottle Size"
                                                                                                        className="text-xs h-8"
                                                                                                    />
                                                                                                </div>
                                                                                            )}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            ) : (
                                                                                <CustomSelect
                                                                                    value={medicine.productId}
                                                                                    onChange={(value) => updateMedicine(medicineIndex, 'productId', value)}
                                                                                    options={[
                                                                                        { value: '', label: '-- select medicine --' },
                                                                                        ...products.map(p => {
                                                                                            return { value: String(p.id), label: p.name }
                                                                                        })
                                                                                    ]}
                                                                                    placeholder="-- select medicine --"
                                                                                    className="text-xs h-9"
                                                                                />
                                                                            )
                                                                        })()}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* RIGHT: SPY Grid + Additions */}
                                                        <div className={`${medicineFieldVisibility.spagyricComponents || medicineFieldVisibility.additions ? 'flex-1' : 'hidden'}`}>
                                                            {medicineFieldVisibility.spagyricComponents && (
                                                                <>
                                                                    <label className="block text-xs font-semibold mb-2 text-gray-600 dark:text-gray-400">Spagyric Components</label>
                                                            {/* Row 1: SPY 1-3 with Component + Volume */}
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                                                                {/* SPY 1 */}
                                                                <div className="flex gap-1">
                                                                    <CustomSelect
                                                                        value={parseComponent(medicine.spy1 || '').name}
                                                                        onChange={(val) => {
                                                                            const parsed = parseComponent(medicine.spy1 || '')
                                                                            updateMedicine(medicineIndex, 'spy1', formatComponent(val.toUpperCase(), parsed.volume))
                                                                        }}
                                                                        options={components}
                                                                        placeholder="SPY 1"
                                                                        allowCustom={true}
                                                                        className="flex-1 text-xs h-8"
                                                                        loading={loadingOptions}
                                                                    />
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Drops"
                                                                        value={parseComponent(medicine.spy1 || '').volume}
                                                                        onChange={(e) => {
                                                                            const parsed = parseComponent(medicine.spy1 || '')
                                                                            updateMedicine(medicineIndex, 'spy1', formatComponent(parsed.name, e.target.value))
                                                                        }}
                                                                        className="w-14 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs h-8 dark:bg-gray-800 text-center"
                                                                    />
                                                                </div>
                                                                {/* SPY 2 */}
                                                                <div className="flex gap-1">
                                                                    <CustomSelect
                                                                        value={parseComponent(medicine.spy2 || '').name}
                                                                        onChange={(val) => {
                                                                            const parsed = parseComponent(medicine.spy2 || '')
                                                                            updateMedicine(medicineIndex, 'spy2', formatComponent(val.toUpperCase(), parsed.volume))
                                                                        }}
                                                                        options={components}
                                                                        placeholder="SPY 2"
                                                                        allowCustom={true}
                                                                        className="flex-1 text-xs h-8"
                                                                        loading={loadingOptions}
                                                                    />
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Drops"
                                                                        value={parseComponent(medicine.spy2 || '').volume}
                                                                        onChange={(e) => {
                                                                            const parsed = parseComponent(medicine.spy2 || '')
                                                                            updateMedicine(medicineIndex, 'spy2', formatComponent(parsed.name, e.target.value))
                                                                        }}
                                                                        className="w-14 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs h-8 dark:bg-gray-800 text-center"
                                                                    />
                                                                </div>
                                                                {/* SPY 3 */}
                                                                <div className="flex gap-1">
                                                                    <CustomSelect
                                                                        value={parseComponent(medicine.spy3 || '').name}
                                                                        onChange={(val) => {
                                                                            const parsed = parseComponent(medicine.spy3 || '')
                                                                            updateMedicine(medicineIndex, 'spy3', formatComponent(val.toUpperCase(), parsed.volume))
                                                                        }}
                                                                        options={components}
                                                                        placeholder="SPY 3"
                                                                        allowCustom={true}
                                                                        className="flex-1 text-xs h-8"
                                                                        loading={loadingOptions}
                                                                    />
                                                                    <input
                                                                        type="text"
                                                                        placeholder="Drops"
                                                                        value={parseComponent(medicine.spy3 || '').volume}
                                                                        onChange={(e) => {
                                                                            const parsed = parseComponent(medicine.spy3 || '')
                                                                            updateMedicine(medicineIndex, 'spy3', formatComponent(parsed.name, e.target.value))
                                                                        }}
                                                                        className="w-14 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs h-8 dark:bg-gray-800 text-center"
                                                                    />
                                                                </div>
                                                            </div>

                                                            {/* Collapsible SPY 4-6 Section */}
                                                            <div className="mb-3">
                                                                <label
                                                                    className="flex items-center gap-1 text-xs font-semibold mb-2 text-gray-600 dark:text-gray-400 cursor-pointer hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                                                                    onClick={() => {
                                                                        setCollapsedSections(prev => ({
                                                                            ...prev,
                                                                            [medicineIndex]: {
                                                                                ...prev[medicineIndex],
                                                                                spy46: !prev[medicineIndex]?.spy46
                                                                            }
                                                                        }))
                                                                    }}
                                                                >
                                                                    <svg className={`w-3 h-3 transition-transform ${(collapsedSections[medicineIndex]?.spy46 ?? !(medicine.spy4 || medicine.spy5 || medicine.spy6)) ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                                    </svg>
                                                                    SPY 4-6
                                                                </label>
                                                                {!(collapsedSections[medicineIndex]?.spy46 ?? !(medicine.spy4 || medicine.spy5 || medicine.spy6)) && (
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                                        {/* SPY 4 */}
                                                                        <div className="flex gap-1">
                                                                            <CustomSelect
                                                                                value={parseComponent(medicine.spy4 || '').name}
                                                                                onChange={(val) => {
                                                                                    const parsed = parseComponent(medicine.spy4 || '')
                                                                                    updateMedicine(medicineIndex, 'spy4', formatComponent(val.toUpperCase(), parsed.volume))
                                                                                }}
                                                                                options={components}
                                                                                placeholder="SPY 4"
                                                                                allowCustom={true}
                                                                                className="flex-1 text-xs h-8"
                                                                                loading={loadingOptions}
                                                                            />
                                                                            <input
                                                                                type="text"
                                                                                placeholder="Drops"
                                                                                value={parseComponent(medicine.spy4 || '').volume}
                                                                                onChange={(e) => {
                                                                                    const parsed = parseComponent(medicine.spy4 || '')
                                                                                    updateMedicine(medicineIndex, 'spy4', formatComponent(parsed.name, e.target.value))
                                                                                }}
                                                                                className="w-14 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs h-8 dark:bg-gray-800 text-center"
                                                                            />
                                                                        </div>
                                                                        {/* SPY 5 */}
                                                                        <div className="flex gap-1">
                                                                            <CustomSelect
                                                                                value={parseComponent(medicine.spy5 || '').name}
                                                                                onChange={(val) => {
                                                                                    const parsed = parseComponent(medicine.spy5 || '')
                                                                                    updateMedicine(medicineIndex, 'spy5', formatComponent(val.toUpperCase(), parsed.volume))
                                                                                }}
                                                                                options={components}
                                                                                placeholder="SPY 5"
                                                                                allowCustom={true}
                                                                                className="flex-1 text-xs h-8"
                                                                                loading={loadingOptions}
                                                                            />
                                                                            <input
                                                                                type="text"
                                                                                placeholder="Drops"
                                                                                value={parseComponent(medicine.spy5 || '').volume}
                                                                                onChange={(e) => {
                                                                                    const parsed = parseComponent(medicine.spy5 || '')
                                                                                    updateMedicine(medicineIndex, 'spy5', formatComponent(parsed.name, e.target.value))
                                                                                }}
                                                                                className="w-14 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs h-8 dark:bg-gray-800 text-center"
                                                                            />
                                                                        </div>
                                                                        {/* SPY 6 */}
                                                                        <div className="flex gap-1">
                                                                            <CustomSelect
                                                                                value={parseComponent(medicine.spy6 || '').name}
                                                                                onChange={(val) => {
                                                                                    const parsed = parseComponent(medicine.spy6 || '')
                                                                                    updateMedicine(medicineIndex, 'spy6', formatComponent(val.toUpperCase(), parsed.volume))
                                                                                }}
                                                                                options={components}
                                                                                placeholder="SPY 6"
                                                                                allowCustom={true}
                                                                                className="flex-1 text-xs h-8"
                                                                                loading={loadingOptions}
                                                                            />
                                                                            <input
                                                                                type="text"
                                                                                placeholder="Drops"
                                                                                value={parseComponent(medicine.spy6 || '').volume}
                                                                                onChange={(e) => {
                                                                                    const parsed = parseComponent(medicine.spy6 || '')
                                                                                    updateMedicine(medicineIndex, 'spy6', formatComponent(parsed.name, e.target.value))
                                                                                }}
                                                                                className="w-14 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs h-8 dark:bg-gray-800 text-center"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>

                                                                </>
                                                            )}

                                                            {/* Collapsible Additions Section */}
                                                            {medicineFieldVisibility.additions && (
                                                            <div>
                                                                <label
                                                                    className="flex items-center gap-1 text-xs font-semibold mb-2 text-blue-600 dark:text-blue-400 cursor-pointer hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                                                                    onClick={() => {
                                                                        setCollapsedSections(prev => ({
                                                                            ...prev,
                                                                            [medicineIndex]: {
                                                                                ...prev[medicineIndex],
                                                                                additions: !prev[medicineIndex]?.additions
                                                                            }
                                                                        }))
                                                                    }}
                                                                >
                                                                    <svg className={`w-3 h-3 transition-transform ${(collapsedSections[medicineIndex]?.additions ?? !(medicine.addition1 || medicine.addition2 || medicine.addition3)) ? '-rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                                    </svg>
                                                                    Additions
                                                                </label>
                                                                {!(collapsedSections[medicineIndex]?.additions ?? !(medicine.addition1 || medicine.addition2 || medicine.addition3)) && (
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                                                        {/* Addition 1 */}
                                                                        <div className="flex gap-1">
                                                                            <CustomSelect
                                                                                value={parseComponent(medicine.addition1 || '').name}
                                                                                onChange={(val) => {
                                                                                    const parsed = parseComponent(medicine.addition1 || '')
                                                                                    updateMedicine(medicineIndex, 'addition1', formatComponent(val.toUpperCase(), parsed.volume))
                                                                                }}
                                                                                options={additions}
                                                                                placeholder="Add 1"
                                                                                allowCustom={true}
                                                                                className="flex-1 text-xs h-8"
                                                                                loading={loadingOptions}
                                                                            />
                                                                            <input
                                                                                type="text"
                                                                                placeholder="Vol"
                                                                                value={parseComponent(medicine.addition1 || '').volume}
                                                                                onChange={(e) => {
                                                                                    const parsed = parseComponent(medicine.addition1 || '')
                                                                                    updateMedicine(medicineIndex, 'addition1', formatComponent(parsed.name, e.target.value))
                                                                                }}
                                                                                className="w-14 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs h-8 dark:bg-gray-800 text-center"
                                                                            />
                                                                        </div>
                                                                        {/* Addition 2 */}
                                                                        <div className="flex gap-1">
                                                                            <CustomSelect
                                                                                value={parseComponent(medicine.addition2 || '').name}
                                                                                onChange={(val) => {
                                                                                    const parsed = parseComponent(medicine.addition2 || '')
                                                                                    updateMedicine(medicineIndex, 'addition2', formatComponent(val.toUpperCase(), parsed.volume))
                                                                                }}
                                                                                options={additions}
                                                                                placeholder="Add 2"
                                                                                allowCustom={true}
                                                                                className="flex-1 text-xs h-8"
                                                                                loading={loadingOptions}
                                                                            />
                                                                            <input
                                                                                type="text"
                                                                                placeholder="Vol"
                                                                                value={parseComponent(medicine.addition2 || '').volume}
                                                                                onChange={(e) => {
                                                                                    const parsed = parseComponent(medicine.addition2 || '')
                                                                                    updateMedicine(medicineIndex, 'addition2', formatComponent(parsed.name, e.target.value))
                                                                                }}
                                                                                className="w-14 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs h-8 dark:bg-gray-800 text-center"
                                                                            />
                                                                        </div>
                                                                        {/* Addition 3 */}
                                                                        <div className="flex gap-1">
                                                                            <CustomSelect
                                                                                value={parseComponent(medicine.addition3 || '').name}
                                                                                onChange={(val) => {
                                                                                    const parsed = parseComponent(medicine.addition3 || '')
                                                                                    updateMedicine(medicineIndex, 'addition3', formatComponent(val.toUpperCase(), parsed.volume))
                                                                                }}
                                                                                options={additions}
                                                                                placeholder="Add 3"
                                                                                allowCustom={true}
                                                                                className="flex-1 text-xs h-8"
                                                                                loading={loadingOptions}
                                                                            />
                                                                            <input
                                                                                type="text"
                                                                                placeholder="Vol"
                                                                                value={parseComponent(medicine.addition3 || '').volume}
                                                                                onChange={(e) => {
                                                                                    const parsed = parseComponent(medicine.addition3 || '')
                                                                                    updateMedicine(medicineIndex, 'addition3', formatComponent(parsed.name, e.target.value))
                                                                                }}
                                                                                className="w-14 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs h-8 dark:bg-gray-800 text-center"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Row 2: Remaining Fields in ONE LINE */}
                                                    <div className="mt-4">
                                                        <label className="block text-xs font-semibold mb-2 text-gray-600 dark:text-gray-400">Dosage & Administration Details</label>
                                                        <div className="flex flex-wrap gap-3 items-end w-full">
                                                            {medicineFieldVisibility.quantity && (
                                                                <div className="flex-1 min-w-[56px]">
                                                                    <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400 mb-0.5">Qty</label>
                                                                    <input type="number" placeholder="0" value={medicine.quantity || ''} onChange={e => {
                                                                        const qty = parseInt(e.target.value)
                                                                        updateMedicine(medicineIndex, 'quantity', qty)
                                                                    }} className="w-full p-1 border border-gray-300 dark:border-gray-600 rounded text-xs h-8 dark:bg-gray-800" />
                                                                </div>
                                                            )}
                                                            {medicineFieldVisibility.timing && (
                                                                <div className="flex-1 min-w-[96px]">
                                                                    <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400 mb-0.5">Timing</label>
                                                                    <CustomSelect value={medicine.timing || ''} onChange={(val) => updateMedicine(medicineIndex, 'timing', val)} options={timing} placeholder="Time" allowCustom={true} className="text-xs h-8" loading={loadingOptions} />
                                                                </div>
                                                            )}
                                                            {medicineFieldVisibility.doseQuantity && (
                                                                <div className="flex-1 min-w-[80px]">
                                                                    <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400 mb-0.5">Dose Qty</label>
                                                                    <CustomSelect
                                                                        value={parseDosage(medicine.dosage || '').quantity}
                                                                        onChange={(val) => {
                                                                            const parsed = parseDosage(medicine.dosage || '')
                                                                            updateMedicine(medicineIndex, 'dosage', formatDosage(val, parsed.timing, parsed.dilution))
                                                                        }}
                                                                        options={doseQuantity}
                                                                        placeholder="Qty"
                                                                        allowCustom={true}
                                                                        className="text-xs h-8"
                                                                        loading={loadingOptions}
                                                                    />
                                                                </div>
                                                            )}
                                                            {medicineFieldVisibility.doseTiming && (
                                                                <div className="flex-1 min-w-[80px]">
                                                                    <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400 mb-0.5">Frequency</label>
                                                                    <CustomSelect
                                                                        value={parseDosage(medicine.dosage || '').timing}
                                                                        onChange={(val) => {
                                                                            const parsed = parseDosage(medicine.dosage || '')
                                                                            updateMedicine(medicineIndex, 'dosage', formatDosage(parsed.quantity, val, parsed.dilution))
                                                                        }}
                                                                        options={doseTiming}
                                                                        placeholder="Frequency"
                                                                        allowCustom={true}
                                                                        className="text-xs h-8"
                                                                        loading={loadingOptions}
                                                                    />
                                                                </div>
                                                            )}
                                                            {medicineFieldVisibility.dilution && (
                                                                <div className="flex-1 min-w-[80px]">
                                                                    <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400 mb-0.5">Along With</label>
                                                                    <CustomSelect
                                                                        value={parseDosage(medicine.dosage || '').dilution}
                                                                        onChange={(val) => {
                                                                            const parsed = parseDosage(medicine.dosage || '')
                                                                            updateMedicine(medicineIndex, 'dosage', formatDosage(parsed.quantity, parsed.timing, val.toUpperCase()))
                                                                        }}
                                                                        options={dilution}
                                                                        placeholder="Along With"
                                                                        allowCustom={true}
                                                                        className="text-xs h-8"
                                                                        loading={loadingOptions}
                                                                    />
                                                                </div>
                                                            )}
                                                            {medicineFieldVisibility.procedure && (
                                                                <div className="flex-1 min-w-[112px]">
                                                                    <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400 mb-0.5">Instruction</label>
                                                                    <CustomSelect value={medicine.procedure || ''} onChange={(val) => updateMedicine(medicineIndex, 'procedure', val.toUpperCase())} options={procedure} placeholder="Proc" allowCustom={true} className="text-xs h-8" loading={loadingOptions} />
                                                                </div>
                                                            )}
                                                            {medicineFieldVisibility.presentation && (
                                                                <div className="flex-1 min-w-[112px]">
                                                                    <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400 mb-0.5">Presentation</label>
                                                                    <CustomSelect value={medicine.presentation || ''} onChange={(val) => updateMedicine(medicineIndex, 'presentation', val.toUpperCase())} options={presentation} placeholder="Pres" allowCustom={true} className="text-xs h-8" loading={loadingOptions} />
                                                                </div>
                                                            )}
                                                            {medicineFieldVisibility.administration && (
                                                                <div className="flex-1 min-w-[128px]">
                                                                    <label className="block text-[10px] font-semibold text-gray-600 dark:text-gray-400 mb-0.5">Site</label>
                                                                    <CustomSelect value={medicine.administration || ''} onChange={(val) => updateMedicine(medicineIndex, 'administration', val.toUpperCase())} options={administration} placeholder="Admin" allowCustom={true} className="text-xs h-8" loading={loadingOptions} />
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Action Buttons */}
                                                        <div className="flex justify-end gap-2 pt-3 border-t border-blue-200/30 dark:border-blue-700/30 mt-3">
                                                            <button
                                                                type="button"
                                                                onClick={undoStack.some(u => u.index === medicineIndex) ? undoRestore : () => restoreDefaultValues(medicineIndex)}
                                                                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 hover:shadow-md ${
                                                                    undoStack.some(u => u.index === medicineIndex)
                                                                        ? 'text-purple-600 dark:text-purple-400 hover:text-white hover:bg-purple-500 dark:hover:bg-purple-600 border border-purple-300 dark:border-purple-700'
                                                                        : 'text-blue-600 dark:text-blue-400 hover:text-white hover:bg-blue-500 dark:hover:bg-blue-600 border border-blue-300 dark:border-blue-700'
                                                                }`}
                                                                title={undoStack.some(u => u.index === medicineIndex) ? 'Undo the last Restore Default action' : 'Restore default values (Qty: 15, Timing: AM, Dose: 10|TDS|WATER, Procedure: ORAL, Presentation: DRP, Bottle: 15 ML)'}
                                                            >
                                                                <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    {undoStack.some(u => u.index === medicineIndex) ? (
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                                                    ) : (
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                    )}
                                                                </svg>
                                                                {undoStack.some(u => u.index === medicineIndex) ? 'Undo' : 'Restore Default'}
                                                            </button>
                                                            {showRepeatInputForRow[medicineIndex] ? (
                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        value={repeatCountForRow[medicineIndex] || ''}
                                                                        onChange={(e) => setRepeatCountForRow(prev => ({ ...prev, [medicineIndex]: e.target.value }))}
                                                                        placeholder="Times"
                                                                        className="w-16 px-2 py-1 text-xs border border-purple-300 dark:border-purple-700 rounded bg-white dark:bg-gray-800"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => repeatSingleRow(medicineIndex)}
                                                                        className="px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700"
                                                                    >
                                                                        OK
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => { 
                                                                            setShowRepeatInputForRow(prev => ({ ...prev, [medicineIndex]: false }))
                                                                            setRepeatCountForRow(prev => ({ ...prev, [medicineIndex]: '' }))
                                                                        }}
                                                                        className="px-2 py-1 text-xs bg-gray-400 text-white rounded hover:bg-gray-500"
                                                                    >
                                                                        Cancel
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setShowRepeatInputForRow(prev => ({ ...prev, [medicineIndex]: true }))}
                                                                    className="px-3 py-1.5 text-xs font-medium text-purple-600 dark:text-purple-400 hover:text-white hover:bg-purple-500 dark:hover:bg-purple-600 border border-purple-300 dark:border-purple-700 rounded-lg transition-all duration-200 hover:shadow-md"
                                                                >
                                                                    <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                    </svg>
                                                                    Repeat
                                                                </button>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => removeMedicine(medicineIndex)}
                                                                className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:text-white hover:bg-red-500 dark:hover:bg-red-600 border border-red-300 dark:border-red-700 rounded-lg transition-all duration-200 hover:shadow-md"
                                                            >
                                                                <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                </svg>
                                                                Remove
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => router.push('/treatments')}
                        className="btn btn-secondary"
                    >
                        Cancel
                    </button>
                    <button type="submit" className="btn bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white shadow-lg shadow-sky-200 dark:shadow-sky-900/50 transition-all duration-200 flex items-center gap-2 px-2 sm:px-4">
                        {isEditMode ? 'Update Treatment' : 'Add Treatment'}
                    </button>
                </div>
            </form>

            {/* Compare Plan Modal */}
            {showComparePlanModal && form.provDiagnosis && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-fadeIn overflow-y-auto">
                    <div className="bg-gradient-to-br from-white to-blue-50/30 dark:from-gray-800 dark:to-blue-950/30 rounded-2xl shadow-2xl shadow-blue-500/20 max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-scaleIn border border-blue-200/30 dark:border-blue-700/30">
                        {/* Modal Header */}
                        <div className="p-6 border-b border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-r from-blue-50/50 to-sky-50/50 dark:from-blue-900/20 dark:to-sky-900/20">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Compare Treatment Plans</h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                        Select a plan to view and use its data: <span className="font-semibold text-blue-600 dark:text-blue-400">{form.provDiagnosis}</span>
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowComparePlanModal(false)
                                        setSelectedComparePlan(null)
                                    }}
                                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Modal Body - Treatment Plans Grid */}
                        <div className="p-6 overflow-y-auto flex-1">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {getExistingPlansForDiagnosis().map((treatment: any, idx: number) => {
                                    const displayPlanNumber = treatment.planNumber || (idx + 1)
                                    const isSelected = selectedComparePlan?.id === treatment.id
                                    return (
                                        <div
                                            key={treatment.id}
                                            className={`bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 border-2 ${isSelected ? 'border-blue-500 dark:border-blue-400' : 'border-blue-200 dark:border-blue-700'} rounded-xl p-4 hover:shadow-lg transition-all cursor-pointer`}
                                            onClick={() => setSelectedComparePlan(treatment)}
                                        >
                                            {/* Plan Header */}
                                            <div className="flex items-center justify-between mb-3">
                                                <h4 className="text-lg font-bold text-blue-700 dark:text-blue-300">
                                                    Plan {displayPlanNumber}
                                                </h4>
                                                <div className="flex items-center gap-2">
                                                    {isSelected && (
                                                        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                                        </svg>
                                                    )}
                                                    <span className="px-2 py-1 bg-blue-500/20 text-blue-700 dark:text-blue-300 text-xs font-semibold rounded-full">
                                                        {treatment.treatmentProducts?.length || 0} medicines
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Plan Details */}
                                            <div className="space-y-2 mb-4 text-sm">
                                                {treatment.speciality && (
                                                    <div>
                                                        <span className="font-semibold text-gray-700 dark:text-gray-300">Speciality:</span>
                                                        <p className="text-gray-600 dark:text-gray-400">{treatment.speciality}</p>
                                                    </div>
                                                )}
                                                {treatment.imbalance && (
                                                    <div>
                                                        <span className="font-semibold text-gray-700 dark:text-gray-300">Imbalance:</span>
                                                        <p className="text-gray-600 dark:text-gray-400">{treatment.imbalance}</p>
                                                    </div>
                                                )}
                                                {treatment.systems && (
                                                    <div>
                                                        <span className="font-semibold text-gray-700 dark:text-gray-300">Systems:</span>
                                                        <p className="text-gray-600 dark:text-gray-400">{treatment.systems}</p>
                                                    </div>
                                                )}
                                                {treatment.organ && (
                                                    <div>
                                                        <span className="font-semibold text-gray-700 dark:text-gray-300">Organ:</span>
                                                        <p className="text-gray-600 dark:text-gray-400">{treatment.organ}</p>
                                                    </div>
                                                )}
                                                {treatment.diseaseAction && (
                                                    <div>
                                                        <span className="font-semibold text-gray-700 dark:text-gray-300">Disease Action:</span>
                                                        <p className="text-gray-600 dark:text-gray-400">{treatment.diseaseAction}</p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Medicines List */}
                                            {treatment.treatmentProducts && treatment.treatmentProducts.length > 0 && (
                                                <div className="mb-4">
                                                    <h5 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Medicines:</h5>
                                                    <div className="space-y-1 max-h-40 overflow-y-auto">
                                                        {treatment.treatmentProducts.map((tp: any, tpIdx: number) => {
                                                            const product = products.find(p => String(p.id) === String(tp.productId))
                                                            return (
                                                                <div key={tpIdx} className="text-xs p-2 bg-white/60 dark:bg-gray-800/60 rounded border border-blue-200/40 dark:border-blue-700/40">
                                                                    <p className="font-medium text-gray-900 dark:text-white">
                                                                        {tpIdx + 1}. {product?.name || 'Unknown Medicine'}
                                                                    </p>
                                                                    {tp.dosage && (
                                                                        <p className="text-gray-600 dark:text-gray-400">Dosage: {tp.dosage}</p>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="p-6 border-t border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-r from-blue-50/50 to-sky-50/50 dark:from-blue-900/20 dark:to-sky-900/20 flex justify-end gap-3">
                            <button
                                onClick={() => {
                                    setShowComparePlanModal(false)
                                    setSelectedComparePlan(null)
                                }}
                                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-medium rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (selectedComparePlan) {
                                        useThisPlanData(selectedComparePlan)
                                    } else {
                                        alert('Please select a plan first')
                                    }
                                }}
                                disabled={!selectedComparePlan}
                                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white font-semibold rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Use This Data
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default requireDoctorOrAdmin(TreatmentPage)

