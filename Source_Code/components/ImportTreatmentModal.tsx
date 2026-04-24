import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import * as XLSX from 'xlsx'
import { useImportContext } from '../contexts/ImportContext'
import ConfirmationModal from './ConfirmationModal'

interface ImportTreatmentModalProps {
    isOpen: boolean
    onClose: () => void
    onImportSuccess: () => void
    doctors?: Array<{ id: number; name?: string; email: string }>
    userRole?: string
}

interface TreatmentRow {
    planNumber: string
    provDiagnosis?: string
    speciality?: string
    imbalance?: string
    systems?: string
    organ?: string
    diseaseAction?: string
    pulseDiagnosis?: string
    treatmentPlan?: string
    notes?: string
    drn?: string
    productName?: string
    spy1?: string
    spy2?: string
    spy3?: string
    spy4?: string
    spy5?: string
    spy6?: string
    timing?: string
    dosage?: string
    doseQuantity?: string
    doseTiming?: string
    dilution?: string
    addition1?: string
    addition2?: string
    addition3?: string
    procedure?: string
    presentation?: string
    bottleSize?: string
    quantity?: string
    administration?: string
}

interface ImportUsageGuard {
    canResetAndPopulate: boolean
    hasProductsInUseByVisits: boolean
    hasTreatmentsInUseByVisits: boolean
    productCatalogCount: number
}

export default function ImportTreatmentModal({ isOpen, onClose, onImportSuccess, doctors = [], userRole }: ImportTreatmentModalProps) {
    const router = useRouter()
    const [file, setFile] = useState<File | null>(null)
    const [parsedData, setParsedData] = useState<TreatmentRow[]>([])
    const [previewData, setPreviewData] = useState<any[]>([])
    const [importing, setImporting] = useState(false)
    const [error, setError] = useState<string>('')
    const [step, setStep] = useState<'select' | 'preview' | 'checking' | 'confirm' | 'importing' | 'success'>('select')
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
    const [importSummary, setImportSummary] = useState({ success: 0, errors: 0 })
    const [importMode, setImportMode] = useState<'create' | 'upsert'>('create')
    const [progressPhase, setProgressPhase] = useState<'import' | 'update' | 'delete' | 'reset'>('import')
    const [isMinimized, setIsMinimized] = useState(false)
    const [taskId, setTaskId] = useState<string | null>(null)
    const [duplicateCount, setDuplicateCount] = useState(0)
    const [uniqueCount, setUniqueCount] = useState(0)
    const [duplicateIndices, setDuplicateIndices] = useState<number[]>([])
    const [cancelRequested, setCancelRequested] = useState(false)
    const [showCancelConfirm, setShowCancelConfirm] = useState(false)
    const [populatingDefaults, setPopulatingDefaults] = useState(false)
    const [populateDefaultsMessage, setPopulateDefaultsMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
    const [defaultFlowMode, setDefaultFlowMode] = useState<'populate' | 'reset' | null>(null)
    const [defaultTemplateVersion, setDefaultTemplateVersion] = useState<number | null>(null)
    const [duplicatePlanKeys, setDuplicatePlanKeys] = useState<string[]>([])
    const [showResetConfirm, setShowResetConfirm] = useState(false)
    const [usageGuardLoading, setUsageGuardLoading] = useState(false)
    const [usageGuardError, setUsageGuardError] = useState('')
    const [usageGuard, setUsageGuard] = useState<ImportUsageGuard | null>(null)
    const [showProductsRequiredModal, setShowProductsRequiredModal] = useState(false)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const cancelRef = useRef(false)
    const { addTask, updateTask, removeTask, cancelTask } = useImportContext()
    const normalizePlanKeyPart = (value?: string) => String(value || '').trim().toLowerCase()
    const buildPlanKey = (planNumber?: string, provDiagnosis?: string) => `${normalizePlanKeyPart(planNumber)}/${normalizePlanKeyPart(provDiagnosis)}`

    const resetModalState = () => {
        setFile(null)
        setParsedData([])
        setPreviewData([])
        setError('')
        setStep('select')
        setImporting(false)
        setImportProgress({ current: 0, total: 0 })
        setImportSummary({ success: 0, errors: 0 })
        setIsMinimized(false)
        setTaskId(null)
        setDefaultFlowMode(null)
        setDefaultTemplateVersion(null)
        setPopulateDefaultsMessage(null)
        setImportMode('create')
        setProgressPhase('import')
        setDuplicatePlanKeys([])
        setDuplicateIndices([])
        setDuplicateCount(0)
        setUniqueCount(0)
        setCancelRequested(false)
        setShowCancelConfirm(false)
        setShowResetConfirm(false)
        setUsageGuardLoading(false)
        setUsageGuardError('')
        setUsageGuard(null)
        setShowProductsRequiredModal(false)
        cancelRef.current = false
        if (fileInputRef.current) {
            fileInputRef.current.value = ''
        }
    }

    const fetchUsageGuard = async (): Promise<ImportUsageGuard | null> => {
        setUsageGuardLoading(true)
        setUsageGuardError('')

        try {
            const response = await fetch('/api/import/usage-guard')
            const result = await response.json()

            if (!response.ok) {
                throw new Error(result?.error || 'Failed to validate usage state')
            }

            const nextGuard = result as ImportUsageGuard
            setUsageGuard(nextGuard)
            return nextGuard
        } catch (err: any) {
            setUsageGuard(null)
            setUsageGuardError(String(err?.message || err || 'Failed to validate usage state'))
            return null
        } finally {
            setUsageGuardLoading(false)
        }
    }

    const ensureProductsAvailableForImport = async () => {
        const guard = await fetchUsageGuard()
        if (!guard) {
            setError('Unable to validate product prerequisites for treatment import. Please try again.')
            return false
        }

        if ((guard.productCatalogCount || 0) <= 0) {
            setShowProductsRequiredModal(true)
            return false
        }

        return true
    }

    // Listen for maximize events from notification dropdown
    useEffect(() => {
        const handleMaximize = (e: any) => {
            if (e.detail.type === 'treatments' && e.detail.operation === 'import' && e.detail.taskId === taskId) {
                setIsMinimized(false)
            }
        }
        window.addEventListener('maximizeTask', handleMaximize)
        return () => window.removeEventListener('maximizeTask', handleMaximize)
    }, [taskId])

    useEffect(() => {
        if (!isOpen) {
            resetModalState()
        }
    }, [isOpen])

    useEffect(() => {
        if (!isOpen) return
        void fetchUsageGuard()
    }, [isOpen])

    if (!isOpen) return null

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0]
        if (!selectedFile) return

        setDefaultFlowMode(null)
        setDefaultTemplateVersion(null)
        setPopulateDefaultsMessage(null)

        const fileExtension = selectedFile.name.split('.').pop()?.toLowerCase()
        if (!['csv', 'xlsx', 'xls', 'json'].includes(fileExtension || '')) {
            setError('Please select a CSV, XLSX, or JSON file')
            return
        }

        setFile(selectedFile)
        setError('')
        parseFile(selectedFile)
    }

    const parseFile = async (file: File) => {
        try {
            const fileExtension = file.name.split('.').pop()?.toLowerCase()

            if (fileExtension === 'json') {
                const text = await file.text()
                const data = JSON.parse(text)
                processData(Array.isArray(data) ? data : [data])
            } else if (fileExtension === 'csv') {
                const text = await file.text()
                const workbook = XLSX.read(text, { type: 'string' })
                const sheetName = workbook.SheetNames[0]
                const worksheet = workbook.Sheets[sheetName]
                const data = XLSX.utils.sheet_to_json(worksheet)
                processData(data)
            } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
                const arrayBuffer = await file.arrayBuffer()
                const workbook = XLSX.read(arrayBuffer, { type: 'array' })
                const sheetName = workbook.SheetNames[0]
                const worksheet = workbook.Sheets[sheetName]
                const data = XLSX.utils.sheet_to_json(worksheet)
                processData(data)
            }
        } catch (err: any) {
            setError(`Failed to parse file: ${err.message}`)
        }
    }

    const processData = (data: any[]) => {
        if (!data || data.length === 0) {
            setError('No data found in file')
            return
        }

        // Helper function to find field value with case-insensitive and flexible matching
        const findFieldValue = (row: any, ...fieldNames: string[]): string | undefined => {
            for (const fieldName of fieldNames) {
                // Try exact match first
                // Handle both string and numeric values (e.g., planNumber can be 0, 1, 2, etc. in XLSX)
                if (row[fieldName] !== undefined && row[fieldName] !== null) {
                    const value = String(row[fieldName]).trim()
                    if (value !== '') {
                        return value
                    }
                }
                
                // Try case-insensitive match
                const keys = Object.keys(row)
                const matchedKey = keys.find(k => k.toLowerCase() === fieldName.toLowerCase())
                if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null) {
                    const value = String(row[matchedKey]).trim()
                    if (value !== '') {
                        return value
                    }
                }
            }
            return undefined
        }

        // Validate and transform data
        const treatments: TreatmentRow[] = data.map((row: any) => ({
            planNumber: findFieldValue(row, 'planNumber', 'plan_number', 'Plan Number', 'PlanNumber', 'plan number') || '',
            provDiagnosis: findFieldValue(row, 'provDiagnosis', 'prov_diagnosis', 'Prov Diagnosis', 'provdiagnosis', 'Diagnosis', 'diagnosis') || undefined,
            speciality: findFieldValue(row, 'speciality', 'specialty', 'Speciality', 'Specialty') || undefined,
            imbalance: findFieldValue(row, 'imbalance', 'Imbalance') || undefined,
            systems: findFieldValue(row, 'systems', 'Systems', 'system') || undefined,
            organ: findFieldValue(row, 'organ', 'Organ') || undefined,
            diseaseAction: findFieldValue(row, 'diseaseAction', 'disease_action', 'Disease Action', 'diseaseaction') || undefined,
            pulseDiagnosis: findFieldValue(row, 'pulseDiagnosis', 'pulse_diagnosis', 'Pulse Diagnosis', 'pulsediagnosis', 'pulse diagnosis') || undefined,
            treatmentPlan: findFieldValue(row, 'treatmentPlan', 'treatment_plan', 'Treatment Plan', 'treatmentplan') || undefined,
            notes: findFieldValue(row, 'notes', 'Notes') || undefined,
            drn: findFieldValue(row, 'drn', 'DRN', 'Drn') || undefined,
            productName: findFieldValue(row, 'productName', 'product_name', 'Product Name', 'ProductName', 'product name') || undefined,
            spy1: findFieldValue(row, 'spy1', 'Spy1', 'SPY1') || undefined,
            spy2: findFieldValue(row, 'spy2', 'Spy2', 'SPY2') || undefined,
            spy3: findFieldValue(row, 'spy3', 'Spy3', 'SPY3') || undefined,
            spy4: findFieldValue(row, 'spy4', 'Spy4', 'SPY4') || undefined,
            spy5: findFieldValue(row, 'spy5', 'Spy5', 'SPY5') || undefined,
            spy6: findFieldValue(row, 'spy6', 'Spy6', 'SPY6') || undefined,
            timing: findFieldValue(row, 'timing', 'Timing') || undefined,
            dosage: findFieldValue(row, 'dosage', 'Dosage') || undefined,
            addition1: findFieldValue(row, 'addition1', 'Addition1', 'addition 1', 'Addition 1') || undefined,
            addition2: findFieldValue(row, 'addition2', 'Addition2', 'addition 2', 'Addition 2') || undefined,
            addition3: findFieldValue(row, 'addition3', 'Addition3', 'addition 3', 'Addition 3') || undefined,
            procedure: findFieldValue(row, 'procedure', 'Procedure') || undefined,
            presentation: findFieldValue(row, 'presentation', 'Presentation') || undefined,
            bottleSize: findFieldValue(row, 'bottleSize', 'bottle_size', 'Bottle Size', 'BottleSize', 'bottle size') || undefined,
            quantity: findFieldValue(row, 'quantity', 'Quantity', 'qty', 'Qty') || undefined,
            administration: findFieldValue(row, 'administration', 'Administration', 'admin', 'Admin', 'site', 'Site', 'Product Administration', 'product administration') || undefined,
            doseQuantity: findFieldValue(row, 'doseQuantity', 'dose_quantity', 'Dose Quantity', 'doseQuantity', 'dose quantity') || undefined,
            doseTiming: findFieldValue(row, 'doseTiming', 'dose_timing', 'Dose Timing', 'dosetiming', 'dose timing') || undefined,
            dilution: findFieldValue(row, 'dilution', 'Dilution') || undefined,
        }))

        // Validate required fields
        const errors: string[] = []
        
        treatments.forEach((t, index) => {
            if (!t.planNumber || t.planNumber === '') {
                // Get the original row to help debug
                const originalRow = data[index]
                const availableFields = Object.keys(originalRow).join(', ')
                errors.push(`Row ${index + 1}: Missing planNumber (Available fields: ${availableFields})`)
            }
        })

        if (errors.length > 0) {
            setError(errors.slice(0, 5).join('\n') + (errors.length > 5 ? `\n...and ${errors.length - 5} more errors` : ''))
            return
        }

        // Show info about unique products
        const uniqueProductNames = new Set(treatments.map(t => t.productName))
        setParsedData(treatments)
        setPreviewData(treatments.slice(0, 10)) // Show first 10 rows
        setDuplicateIndices([])
        setDuplicateCount(0)
        setUniqueCount(0)
        setDuplicatePlanKeys([])
        setStep('preview')
    }

    const loadDefaultTreatmentsIntoFlow = async (reset: boolean = false) => {
        const canProceed = await ensureProductsAvailableForImport()
        if (!canProceed) return

        setPopulatingDefaults(true)
        setPopulateDefaultsMessage(null)
        setError('')

        try {
            const response = await fetch('/api/default-treatments/rows')
            const result = await response.json()

            if (!response.ok) {
                throw new Error(result?.error || 'Failed to load default treatments')
            }

            const rows = Array.isArray(result?.treatments) ? result.treatments : []
            if (rows.length === 0) {
                throw new Error('No default treatments found to import')
            }

            setParsedData(rows)
            setPreviewData(rows.slice(0, 10))
            setDuplicateIndices([])
            setDuplicateCount(0)
            setUniqueCount(0)
            setDuplicatePlanKeys([])
            setDefaultFlowMode(reset ? 'reset' : 'populate')
            setDefaultTemplateVersion(Number(result?.latestVersion) || null)
            setImportMode(reset ? 'upsert' : 'create')
            setStep('preview')
            setPopulateDefaultsMessage({
                type: 'success',
                text: `Loaded ${rows.length} default treatment rows (v${result?.latestVersion || '?'}) into import flow. Continue with Check & Continue.`
            })
        } catch (err: any) {
            setPopulateDefaultsMessage({
                type: 'error',
                text: err.message || (reset ? 'Failed to load defaults for reset and populate' : 'Failed to load defaults for populate')
            })
        } finally {
            setPopulatingDefaults(false)
        }
    }

    const checkDuplicates = async () => {
        const canProceed = await ensureProductsAvailableForImport()
        if (!canProceed) return

        setStep('checking')
        setError('')

        try {
            const groupedMap = new Map<string, { provDiagnosis?: string; planNumber?: string; index: number; key: string }>()

            parsedData.forEach((row) => {
                const key = buildPlanKey(row.planNumber, row.provDiagnosis)
                if (!groupedMap.has(key)) {
                    groupedMap.set(key, {
                        provDiagnosis: row.provDiagnosis?.trim(),
                        planNumber: row.planNumber?.trim(),
                        index: groupedMap.size,
                        key
                    })
                }
            })

            const groupedEntries = Array.from(groupedMap.values())

            const response = await fetch('/api/treatments/check-duplicates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    treatments: groupedEntries.map((entry) => ({
                        provDiagnosis: entry.provDiagnosis,
                        planNumber: entry.planNumber,
                        index: entry.index
                    }))
                })
            })

            if (!response.ok) {
                throw new Error('Failed to check for duplicates')
            }

            const result = await response.json()
            const duplicatePlanIndices = Array.isArray(result?.duplicateIndices) ? result.duplicateIndices : []
            const duplicateKeys = groupedEntries
                .filter((entry) => duplicatePlanIndices.includes(entry.index))
                .map((entry) => entry.key)

            setDuplicateIndices(duplicatePlanIndices)
            setDuplicateCount(duplicatePlanIndices.length)
            setUniqueCount(Array.isArray(result?.uniqueIndices) ? result.uniqueIndices.length : Math.max(groupedEntries.length - duplicatePlanIndices.length, 0))
            setDuplicatePlanKeys(duplicateKeys)
            setImportMode(duplicatePlanIndices.length > 0 ? 'upsert' : 'create')
            setStep('confirm')
        } catch (err: any) {
            setError(`Failed to check duplicates: ${err.message}`)
            setStep('preview')
        }
    }

    const handleImport = async (skipDuplicates: boolean = false) => {
        const canProceed = await ensureProductsAvailableForImport()
        if (!canProceed) return

        setImporting(true)
        setError('')
        setStep('importing')
        setProgressPhase(importMode === 'upsert' ? 'update' : 'import')

        // Create task in global context
        const id = addTask({
            type: 'treatments',
            operation: 'import',
            status: 'importing',
            progress: { current: 0, total: 0 } // Will update with actual count
        })
        setTaskId(id)

        try {
            // Group rows by planNumber + provDiagnosis (rows with same plan should be merged)
            const treatmentGroups = new Map<string, TreatmentRow[]>()
            
            parsedData.forEach(row => {
                const key = buildPlanKey(row.planNumber, row.provDiagnosis)
                if (skipDuplicates && duplicatePlanKeys.includes(key)) {
                    return
                }
                if (!treatmentGroups.has(key)) {
                    treatmentGroups.set(key, [])
                }
                treatmentGroups.get(key)!.push(row)
            })

            const totalPlans = treatmentGroups.size
            setImportProgress({ current: 0, total: totalPlans })
            
            // Update task with actual total
            updateTask(id, {
                progress: { current: 0, total: totalPlans }
            })

            // Create one treatment per group, with all products from that group
            const treatmentsToCreate = Array.from(treatmentGroups.values()).map(rows => {
                const firstRow = rows[0] // Use first row for treatment-level data
                
                // Collect all products from all rows in this group
                // Step 1: Group rows by DRN. Rows sharing a DRN become options of the first row.
                const drnGroups = new Map<string, TreatmentRow[]>()
                const noDrnRows: TreatmentRow[] = []
                rows.forEach(row => {
                    if (row.drn) {
                        const key = row.drn.trim()
                        if (!drnGroups.has(key)) drnGroups.set(key, [])
                        drnGroups.get(key)!.push(row)
                    } else {
                        noDrnRows.push(row)
                    }
                })

                const productMap = new Map<string, any>()

                // Step 2a: Process DRN groups — first row is parent, rest become options
                drnGroups.forEach((drnRows) => {
                    const [firstRow, ...optionRows] = drnRows
                    if (!firstRow.productName) return
                    const productKey = firstRow.productName.trim().toUpperCase()
                    if (productMap.has(productKey)) return

                    let dosageValue = firstRow.dosage
                    if (!dosageValue && (firstRow.doseQuantity || firstRow.doseTiming || firstRow.dilution)) {
                        dosageValue = `${firstRow.doseQuantity || ''}|${firstRow.doseTiming || ''}|${firstRow.dilution || ''}`
                    }

                    const optionProductNames = optionRows
                        .filter(r => r.productName && r.productName.trim().toUpperCase() !== productKey)
                        .map(r => r.productName!)

                    productMap.set(productKey, {
                        productName: firstRow.productName!,
                        spy1: firstRow.spy1, spy2: firstRow.spy2, spy3: firstRow.spy3,
                        spy4: firstRow.spy4, spy5: firstRow.spy5, spy6: firstRow.spy6,
                        timing: firstRow.timing, dosage: dosageValue,
                        addition1: firstRow.addition1, addition2: firstRow.addition2, addition3: firstRow.addition3,
                        procedure: firstRow.procedure, presentation: firstRow.presentation,
                        bottleSize: firstRow.bottleSize,
                        quantity: firstRow.quantity ? parseInt(String(firstRow.quantity)) : undefined,
                        administration: firstRow.administration,
                        optionProductNames,
                    })
                })

                // Step 2b: Process rows without DRN (deduplicate by productName)
                noDrnRows.forEach(row => {
                    if (!row.productName) return
                    const productKey = row.productName.trim().toUpperCase()
                    if (productMap.has(productKey)) return

                    let dosageValue = row.dosage
                    if (!dosageValue && (row.doseQuantity || row.doseTiming || row.dilution)) {
                        dosageValue = `${row.doseQuantity || ''}|${row.doseTiming || ''}|${row.dilution || ''}`
                    }
                    productMap.set(productKey, {
                        productName: row.productName!,
                        spy1: row.spy1, spy2: row.spy2, spy3: row.spy3,
                        spy4: row.spy4, spy5: row.spy5, spy6: row.spy6,
                        timing: row.timing, dosage: dosageValue,
                        addition1: row.addition1, addition2: row.addition2, addition3: row.addition3,
                        procedure: row.procedure, presentation: row.presentation,
                        bottleSize: row.bottleSize,
                        quantity: row.quantity ? parseInt(String(row.quantity)) : undefined,
                        administration: row.administration,
                        optionProductNames: [],
                    })
                })
                
                const products = Array.from(productMap.values())

                return {
                    planNumber: firstRow.planNumber?.trim(),
                    provDiagnosis: firstRow.provDiagnosis?.trim(),
                    speciality: firstRow.speciality,
                    imbalance: firstRow.imbalance,
                    systems: firstRow.systems,
                    organ: firstRow.organ,
                    diseaseAction: firstRow.diseaseAction,
                    pulseDiagnosis: firstRow.pulseDiagnosis,
                    treatmentPlan: firstRow.treatmentPlan,
                    notes: firstRow.notes,
                    drn: firstRow.drn,
                    products: products
                }
            })

            // Send 50 treatment plans per batch to backend (reduced from 100 to avoid connection pool issues)
            const CHUNK_SIZE = 50
            const chunks = []
            for (let i = 0; i < treatmentsToCreate.length; i += CHUNK_SIZE) {
                chunks.push(treatmentsToCreate.slice(i, i + CHUNK_SIZE))
            }

            let completedCount = 0
            const allErrors: any[] = []
            let successCount = 0

            // Send chunks one by one
            for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
                const chunk = chunks[chunkIndex]
                
                const response = await fetch('/api/treatments/bulk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        treatments: chunk,
                        mode: importMode,
                        matchByDiagnosis: defaultFlowMode === 'populate'
                    })
                })

                if (!response.ok) {
                    const error = await response.json()
                    throw new Error(`Failed to import treatments: ${error.error || 'Unknown error'}`)
                }

                const result = await response.json()
                
                // Track any errors from this chunk
                if (result.errors && result.errors.length > 0) {
                    allErrors.push(...result.errors)
                }
                
                successCount += result.count || 0

                completedCount += chunk.length
                setImportProgress({ current: completedCount, total: totalPlans })
                
                // Update task progress
                updateTask(id, {
                    progress: { current: completedCount, total: totalPlans }
                })
                
                // Small delay between chunks to allow connection pool to recover
                if (chunkIndex < chunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 200))
                }
            }

            // Show warning if there were errors
            if (allErrors.length > 0) {
                const errorMsg = `Warning: ${allErrors.length} treatments failed to import. ${successCount} were successful.\n\nFirst few errors:\n${allErrors.slice(0, 3).map((e: any) => `Plan ${e.planNumber}: ${e.error}`).join('\n')}`
                
                // If all failed, show error instead of success
                if (successCount === 0) {
                    throw new Error(errorMsg)
                }
                
                // Partial success - show warning but continue to success screen
                setError(errorMsg)
            }

            if (defaultFlowMode) {
                await fetch('/api/default-templates/mark-synced', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        templateType: 'treatment',
                        version: defaultTemplateVersion || undefined
                    })
                })
            }

            // Show success message            
            setImportSummary({ success: successCount, errors: allErrors.length })
            setStep('success')
            setImporting(false)
            
            // Update task to success
            updateTask(id, {
                status: 'success',
                summary: { success: successCount, errors: allErrors.length },
                endTime: Date.now()
            })
            
            setTimeout(() => {
                onImportSuccess()
                handleClose()
            }, 2000)
        } catch (err: any) {
            setError(`Import failed: ${err.message}`)
            setStep('preview')
            setImporting(false)
            
            // Update task to error
            if (id) {
                updateTask(id, {
                    status: 'error',
                    error: err.message,
                    endTime: Date.now()
                })
            }
        }
    }

    const handleResetAndPopulateDefaults = async () => {
        setImporting(true)
        setError('')
        setStep('importing')
        setProgressPhase('delete')
        setImportProgress({ current: 0, total: 1 })

        try {
            await new Promise(resolve => setTimeout(resolve, 250))
            setImportProgress({ current: 1, total: 1 })
            setProgressPhase('reset')
            setImportProgress({ current: 0, total: 1 })

            const response = await fetch('/api/default-treatments/populate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reset: true })
            })

            const result = await response.json()
            if (!response.ok) {
                throw new Error(result?.error || 'Failed to reset and populate default treatments')
            }

            setImportProgress({ current: 1, total: 1 })
            setImportSummary({
                success: Number(result?.created || 0) + Number(result?.updated || 0),
                errors: 0
            })
            setStep('success')
            setImporting(false)

            setTimeout(() => {
                onImportSuccess()
                handleClose()
            }, 2000)
        } catch (err: any) {
            setError(err.message || 'Failed to reset and populate default treatments')
            setImporting(false)
            setStep('confirm')
        }
    }

    const handleClose = () => {
        // Only allow closing if not importing
        if (importing) {
            setIsMinimized(true)
            return
        }
        
        // Clean up task from context if it exists
        if (taskId) {
            removeTask(taskId)
        }
        resetModalState()
        onClose()
    }

    const handlePopulateDefaults = async (reset: boolean = false) => {
        if (reset) {
            if (usageGuardLoading) {
                setPopulateDefaultsMessage({
                    type: 'error',
                    text: 'Checking usage state. Please wait a moment and try again.'
                })
                return
            }

            if (!usageGuard?.canResetAndPopulate) {
                setPopulateDefaultsMessage({
                    type: 'error',
                    text: 'Reset & Populate is disabled because some products or treatment plans are already in use by visits.'
                })
                return
            }
        }

        await loadDefaultTreatmentsIntoFlow(reset)
    }

    const handleMinimize = () => {
        setIsMinimized(true)
    }

    const handleMaximize = () => {
        setIsMinimized(false)
    }

    const isUpdateMode = importMode === 'upsert'
    const progressTitle = progressPhase === 'delete'
        ? 'Deleting Existing Treatment Plans'
        : progressPhase === 'reset'
            ? 'Resetting Treatment Defaults'
            : isUpdateMode
                ? 'Updating Treatment Plans'
                : 'Importing Treatment Plans'
    const progressSubtitle = progressPhase === 'delete'
        ? 'Removing old default-matching plans before repopulating'
        : progressPhase === 'reset'
            ? `${importProgress.current} of ${importProgress.total} default batches processed`
            : `${importProgress.current} of ${importProgress.total} plans processed`
    const successTitle = defaultFlowMode === 'reset'
        ? 'Reset Complete!'
        : isUpdateMode
            ? 'Update Complete!'
            : 'Import Complete!'
    const successSubtitle = defaultFlowMode === 'reset'
        ? 'Your default treatment plans have been refreshed'
        : isUpdateMode
            ? 'Your treatment plans have been updated with the latest file data'
            : 'Your treatment plans have been saved'
    const successCountLabel = defaultFlowMode === 'reset'
        ? 'Reset'
        : isUpdateMode
            ? 'Applied'
            : 'Imported'
    const resetDisabledByUsage = usageGuardLoading || !usageGuard?.canResetAndPopulate

    // If minimized, show nothing (task is tracked in notification dropdown)
    if (isMinimized) return null

    const uniquePlanCount = Array.from(new Set(parsedData.map(t => buildPlanKey(t.planNumber, t.provDiagnosis)))).length
    const pct = importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0

    // Step indicator
    const steps = ['Upload', 'Preview', 'Confirm', 'Import']
    const stepIndex =
        step === 'select' ? 0 :
        step === 'preview' ? 1 :
        step === 'checking' ? 2 :
        step === 'confirm' ? 2 :
        step === 'importing' ? 3 :
        step === 'success' ? 3 : 1

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
            <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-200/60 dark:border-gray-700/60">

                {/* Decorative top bar */}
                <div className="h-1 w-full bg-gradient-to-r from-violet-500 via-blue-500 to-cyan-400 rounded-t-2xl" />

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-gray-900 dark:text-white leading-tight">Import Treatment Plans</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">CSV · XLSX · JSON</p>
                        </div>
                    </div>

                    {/* Step indicators */}
                    <div className="hidden sm:flex items-center gap-1.5 mr-4">
                        {steps.map((s, i) => (
                            <div key={s} className="flex items-center gap-1.5">
                                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                                    i < stepIndex ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                                    i === stepIndex ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30' :
                                    'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
                                }`}>
                                    {i < stepIndex ? (
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    ) : (
                                        <span className="w-3.5 h-3.5 flex items-center justify-center rounded-full border border-current text-[9px]">{i + 1}</span>
                                    )}
                                    {s}
                                </div>
                                {i < steps.length - 1 && <div className={`w-4 h-px ${i < stepIndex ? 'bg-blue-300 dark:bg-blue-700' : 'bg-gray-200 dark:bg-gray-700'}`} />}
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center gap-1">
                        {importing && (
                            <button onClick={handleMinimize} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors" title="Minimize">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" /></svg>
                            </button>
                        )}
                        <button onClick={handleClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">

                    {/* ── STEP: SELECT ── */}
                    {step === 'select' && (
                        <div className="p-6 space-y-5">
                            <div className="rounded-xl border border-blue-200/60 dark:border-blue-800/60 bg-blue-50/40 dark:bg-blue-900/10 p-4">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <div>
                                        <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">Populate Defaults</p>
                                        <p className="text-xs text-blue-700/90 dark:text-blue-300/90 mt-0.5">Copy latest default treatment template rows into this clinic as shared records.</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => handlePopulateDefaults(false)}
                                            disabled={populatingDefaults || importing}
                                            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                                        >
                                            {populatingDefaults ? 'Working...' : 'Populate Defaults'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowResetConfirm(true)}
                                            disabled={populatingDefaults || importing || resetDisabledByUsage}
                                            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                                        >
                                            {populatingDefaults ? 'Working...' : 'Reset & Populate'}
                                        </button>
                                    </div>
                                </div>
                                {populateDefaultsMessage && (
                                    <div className={`mt-3 text-xs font-medium ${populateDefaultsMessage.type === 'success' ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>
                                        {populateDefaultsMessage.text}
                                    </div>
                                )}
                                {!usageGuardLoading && !usageGuardError && usageGuard && !usageGuard.canResetAndPopulate && (
                                    <div className="mt-3 text-xs font-medium text-red-700 dark:text-red-300">
                                        Reset & Populate is disabled because some products are already in use by visits.
                                    </div>
                                )}
                                {usageGuardLoading && (
                                    <div className="mt-3 text-xs font-medium text-gray-600 dark:text-gray-300">
                                        Checking if reset is safe...
                                    </div>
                                )}
                                {usageGuardError && (
                                    <div className="mt-3 text-xs font-medium text-red-700 dark:text-red-300">
                                        Unable to verify usage state right now: {usageGuardError}
                                    </div>
                                )}
                            </div>

                            {/* Drop zone */}
                            <div className="relative">
                                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.json" onChange={handleFileSelect} className="hidden" id="file-input" />
                                <label
                                    htmlFor="file-input"
                                    onClick={() => setError('')}
                                    className="group flex flex-col items-center justify-center gap-3 w-full py-12 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 bg-gray-50/50 dark:bg-gray-800/30 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-all cursor-pointer">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-100 to-blue-100 dark:from-violet-900/30 dark:to-blue-900/30 group-hover:from-violet-200 group-hover:to-blue-200 dark:group-hover:from-violet-800/40 dark:group-hover:to-blue-800/40 flex items-center justify-center transition-all shadow-sm">
                                        <svg className="w-7 h-7 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                    </div>
                                    <div className="text-center">
                                        <p className="font-semibold text-gray-700 dark:text-gray-200 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors">Click to choose a file</p>
                                        <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">CSV, XLSX, XLS or JSON</p>
                                    </div>
                                </label>
                            </div>

                            {/* Field reference */}
                            <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                                <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                                    <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Column Reference</span>
                                </div>
                                <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                                    {/* Required */}
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                            <span className="font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide text-[10px]">Required</span>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <code className="px-1.5 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded text-[10px] font-mono">planNumber</code>
                                                <span className="text-gray-500 dark:text-gray-400">Plan identifier</span>
                                            </div>
                                        </div>
                                    </div>
                                    {/* Treatment fields */}
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                                            <span className="font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide text-[10px]">Treatment</span>
                                        </div>
                                        <div className="space-y-1 text-gray-500 dark:text-gray-400">
                                            {['provDiagnosis','speciality','imbalance','systems','organ','diseaseAction','pulseDiagnosis','treatmentPlan','notes'].map(f => (
                                                <div key={f}><code className="px-1 py-0.5 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 rounded text-[10px] font-mono">{f}</code></div>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Medicine fields */}
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                            <span className="font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide text-[10px]">Medicine</span>
                                        </div>
                                        <div className="space-y-1 text-gray-500 dark:text-gray-400">
                                            {['productName','Dose Quantity','Dose Timing','Dilution','timing','procedure','presentation','bottleSize','Product Administration','addition1–3','spy1–6'].map(f => (
                                                <div key={f}><code className="px-1 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded text-[10px] font-mono">{f}</code></div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-amber-50/40 dark:bg-amber-900/10 flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-700 dark:text-amber-400">
                                    <span>• Same <code className="font-mono">planNumber + provDiagnosis</code> = one plan, multiple medicines</span>
                                    <span>• Missing products are auto-created as placeholders</span>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <a href="/templates/treatment_plans_import_template.csv" download className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    Download CSV template
                                </a>
                                <span className="text-gray-300 dark:text-gray-700">·</span>
                                <a href="/templates/TREATMENT_IMPORT_INSTRUCTIONS.md" target="_blank" className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                    View instructions
                                </a>
                            </div>

                            {error && (
                                <div className="flex gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/60 rounded-xl">
                                    <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <p className="text-sm text-red-700 dark:text-red-300 whitespace-pre-line">{error}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── STEP: PREVIEW ── */}
                    {step === 'preview' && (
                        <div className="p-6 space-y-5">

                            {/* Summary chips */}
                            <div className="flex flex-wrap gap-3">
                                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200/60 dark:border-blue-800/60">
                                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                    <div>
                                        <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">Total rows</div>
                                        <div className="text-lg font-bold text-blue-700 dark:text-blue-300 leading-tight">{parsedData.length}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200/60 dark:border-violet-800/60">
                                    <svg className="w-4 h-4 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                                    <div>
                                        <div className="text-xs text-violet-600 dark:text-violet-400 font-medium">Treatment plans</div>
                                        <div className="text-lg font-bold text-violet-700 dark:text-violet-300 leading-tight">{uniquePlanCount}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/60 dark:border-emerald-800/60">
                                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <div>
                                        <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Unique products</div>
                                        <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300 leading-tight">{new Set(parsedData.map(t => t.productName).filter(Boolean)).size}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Import mode */}
                            <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Import Mode</span>
                                </div>
                                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {[
                                        { val: 'create', label: 'Create new only', desc: 'Skip plans that already exist', icon: 'M12 4v16m8-8H4' },
                                        { val: 'upsert', label: 'Update existing', desc: 'Overwrite matching plans with new data', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' }
                                    ].map(opt => (
                                        <label key={opt.val} className={`flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition-all ${importMode === opt.val ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-100 dark:border-gray-700 hover:border-gray-200 dark:hover:border-gray-600'}`}>
                                            <input type="radio" name="importMode" value={opt.val} checked={importMode === opt.val} onChange={(e) => setImportMode(e.target.value as 'create' | 'upsert')} className="sr-only" />
                                            <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${importMode === opt.val ? 'bg-blue-600' : 'bg-gray-100 dark:bg-gray-800'}`}>
                                                <svg className={`w-4 h-4 ${importMode === opt.val ? 'text-white' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={opt.icon} /></svg>
                                            </div>
                                            <div>
                                                <div className={`text-sm font-semibold ${importMode === opt.val ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}>{opt.label}</div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{opt.desc}</div>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Data preview table */}
                            <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Data Preview</span>
                                    <span className="text-xs text-gray-400 dark:text-gray-500">First 10 rows</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-gray-100 dark:border-gray-800">
                                                {['Plan #','Diagnosis','Product','Dose Qty','Dose Timing','Dilution','Timing','Administration'].map(h => (
                                                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] whitespace-nowrap">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800/80">
                                            {previewData.map((row, index) => (
                                                <tr key={index} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors">
                                                    <td className="px-3 py-2 whitespace-nowrap">
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-bold text-[10px]">#{row.planNumber}</span>
                                                    </td>
                                                    <td className="px-3 py-2 max-w-[120px] truncate text-gray-700 dark:text-gray-300">{row.provDiagnosis || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                                    <td className="px-3 py-2 max-w-[120px]">
                                                        {row.productName ? <span className="font-medium text-gray-800 dark:text-gray-200 truncate block">{row.productName}</span> : <span className="text-gray-300 dark:text-gray-600">—</span>}
                                                    </td>
                                                    <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-400">{row.doseQuantity || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                                    <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-400">{row.doseTiming || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                                    <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-400">{row.dilution || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                                    <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-400">{row.timing || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                                    <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-400">{row.administration || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                {parsedData.length > 10 && (
                                    <div className="px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/30 text-xs text-gray-400 dark:text-gray-500">
                                        + {parsedData.length - 10} more rows not shown
                                    </div>
                                )}
                            </div>

                            {error && (
                                <div className="flex gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/60 rounded-xl">
                                    <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <p className="text-sm text-red-700 dark:text-red-300 whitespace-pre-line">{error}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── STEP: CHECKING ── */}
                    {step === 'checking' && (
                        <div className="flex flex-col items-center justify-center py-16 gap-4">
                            <div className="w-12 h-12 rounded-full border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-400 animate-spin" />
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Checking for duplicate treatment plans and provisional diagnosis names…</p>
                        </div>
                    )}

                    {/* ── STEP: CONFIRM ── */}
                    {step === 'confirm' && (
                        <div className="p-6 space-y-5">
                            <div className="flex flex-wrap gap-3">
                                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/60 dark:border-emerald-800/60">
                                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <div>
                                        <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Unique Plans</div>
                                        <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300 leading-tight">{uniqueCount}</div>
                                    </div>
                                </div>
                                {duplicateCount > 0 && (
                                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200/60 dark:border-orange-800/60">
                                        <svg className="w-4 h-4 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                        <div>
                                            <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">Duplicate Plans</div>
                                            <div className="text-lg font-bold text-orange-700 dark:text-orange-300 leading-tight">{duplicateCount}</div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {duplicateCount > 0 && (
                                <div className="flex gap-3 p-4 bg-orange-50 dark:bg-orange-900/10 border border-orange-200/60 dark:border-orange-800/60 rounded-xl text-sm text-orange-800 dark:text-orange-300">
                                    <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <span>{isUpdateMode ? `${duplicateCount} treatment plans or provisional diagnosis names already exist and will be updated if you continue with update mode.` : `${duplicateCount} treatment plans or provisional diagnosis names already exist. You can import unique plans only, or import all to overwrite existing ones.`}</span>
                                </div>
                            )}

                            {error && (
                                <div className="flex gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/60 rounded-xl">
                                    <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <p className="text-sm text-red-700 dark:text-red-300 whitespace-pre-line">{error}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── STEP: IMPORTING ── */}
                    {step === 'importing' && (
                        <div className="flex flex-col items-center justify-center py-16 px-6 gap-6">
                            {/* Animated ring */}
                            <div className="relative w-24 h-24">
                                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                                    <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-gray-100 dark:text-gray-800" />
                                    <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray={`${2 * Math.PI * 40}`} strokeDashoffset={`${2 * Math.PI * 40 * (1 - pct / 100)}`} strokeLinecap="round" className="text-blue-600 dark:text-blue-400 transition-all duration-500" />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-xl font-bold text-gray-900 dark:text-white">{pct}%</span>
                                </div>
                            </div>

                            <div className="text-center">
                                <h3 className="text-base font-bold text-gray-900 dark:text-white">{progressTitle}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    {progressSubtitle}
                                </p>
                            </div>

                            {/* Linear bar */}
                            <div className="w-full max-w-sm">
                                <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                    <div className="h-2 rounded-full bg-gradient-to-r from-violet-500 to-blue-500 transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
                                </div>
                            </div>

                            <p className="text-xs text-gray-400 dark:text-gray-500">Please don&apos;t close this window</p>
                        </div>
                    )}

                    {/* ── STEP: SUCCESS ── */}
                    {step === 'success' && (
                        <div className="flex flex-col items-center justify-center py-16 px-6 gap-4">
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <div className="text-center">
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">{successTitle}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{successSubtitle}</p>
                            </div>
                            <div className="flex gap-3 mt-1">
                                <div className="px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/60 dark:border-emerald-800/60 text-center">
                                    <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{importSummary.success}</div>
                                    <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{successCountLabel}</div>
                                </div>
                                {importSummary.errors > 0 && (
                                    <div className="px-4 py-2.5 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200/60 dark:border-orange-800/60 text-center">
                                        <div className="text-2xl font-bold text-orange-700 dark:text-orange-300">{importSummary.errors}</div>
                                        <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">Failed</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {(step === 'select' || step === 'preview' || step === 'confirm') && (
                    <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 bg-gray-50/50 dark:bg-gray-800/20">
                        <button
                            onClick={step === 'select' ? handleClose : () => { setStep(step === 'confirm' ? 'preview' : 'select'); setError('') }}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            {step !== 'select' ? (
                                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>Back</>
                            ) : 'Cancel'}
                        </button>

                        {step === 'preview' && (
                            <button
                                onClick={checkDuplicates}
                                disabled={importing || parsedData.length === 0}
                                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-blue-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Check & Continue
                            </button>
                        )}

                        {step === 'confirm' && (
                            <div className="flex gap-2">
                                {defaultFlowMode === 'populate' ? (
                                    <button
                                        onClick={() => handleImport(!isUpdateMode)}
                                        className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-blue-500/20 transition-all"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                        {isUpdateMode ? `Update ${uniquePlanCount} Plans` : `Populate ${uniqueCount} Unique Plans`}
                                    </button>
                                ) : defaultFlowMode === 'reset' ? (
                                    <button
                                        onClick={handleResetAndPopulateDefaults}
                                        disabled={resetDisabledByUsage}
                                        className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-amber-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9M9 9H4m16 11v-5h-.582m0 0a8.003 8.003 0 01-15.357-2M15 15h5" /></svg>
                                        Reset & Update {uniquePlanCount} Plans
                                    </button>
                                ) : (
                                    <>
                                        {duplicateCount > 0 && (
                                            <button
                                                onClick={() => handleImport(true)}
                                                className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-lg transition-all"
                                            >
                                                {isUpdateMode ? `Create ${uniqueCount} New` : `Import ${uniqueCount} Unique`}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleImport(false)}
                                            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-700 hover:to-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-blue-500/20 transition-all"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                            {isUpdateMode ? `Update All ${uniquePlanCount}` : `Import All ${uniquePlanCount}`}
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <ConfirmationModal
                isOpen={showResetConfirm}
                title="Reset And Populate Treatments"
                message="This will overwrite existing default-matching treatments in this clinic and repopulate the latest defaults. Continue?"
                confirmText="Reset & Populate"
                cancelText="Cancel"
                type="warning"
                onCancel={() => setShowResetConfirm(false)}
                onConfirm={() => {
                    setShowResetConfirm(false)
                    handlePopulateDefaults(true)
                }}
            />

            {showProductsRequiredModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[10050] p-4">
                    <div className="w-full max-w-md rounded-2xl border border-red-200 dark:border-red-800 bg-white dark:bg-gray-900 shadow-2xl p-6">
                        <div className="flex items-start gap-3">
                            <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 flex items-center justify-center font-bold">!</div>
                            <div>
                                <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Import Products First</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                                    Treatments cannot be imported because no products are available yet. Import products first, then retry treatment import.
                                </p>
                            </div>
                        </div>
                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowProductsRequiredModal(false)}
                                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowProductsRequiredModal(false)
                                    handleClose()
                                    router.push('/products')
                                }}
                                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                Go To Products
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
