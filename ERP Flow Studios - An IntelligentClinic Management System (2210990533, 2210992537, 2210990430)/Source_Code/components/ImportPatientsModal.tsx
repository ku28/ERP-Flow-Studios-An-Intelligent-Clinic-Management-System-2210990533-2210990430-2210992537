import { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { useImportContext } from '../contexts/ImportContext'
import CustomSelect from './CustomSelect'

interface ImportPatientsModalProps {
    isOpen: boolean
    onClose: () => void
    onImportSuccess: () => void
    doctors?: Array<{ id: number; name?: string; email: string }>
    userRole?: string
}

interface PatientRow {
    fullName: string
    firstName?: string
    lastName?: string
    phone?: string
    email?: string
    gender?: string
    age?: number
    dob?: string
    date?: string
    weight?: number
    height?: number
    address?: string
    fatherHusbandGuardianName?: string
    temperament?: string
    pulseDiagnosis?: string
    pulseDiagnosis2?: string
    majorComplaints?: string
    historyReports?: string
    investigations?: string
    provisionalDiagnosis?: string
    improvements?: string
    nextVisit?: string
    imageUrl?: string
    opdNo?: string
    doctorId?: string | number
}

export default function ImportPatientsModal({ isOpen, onClose, onImportSuccess, doctors = [], userRole }: ImportPatientsModalProps) {
    const [file, setFile] = useState<File | null>(null)
    const [parsedData, setParsedData] = useState<PatientRow[]>([])
    const [previewData, setPreviewData] = useState<any[]>([])
    const [importing, setImporting] = useState(false)
    const [error, setError] = useState<string>('')
    const [step, setStep] = useState<'select' | 'preview' | 'checking' | 'confirm' | 'importing' | 'success'>('select')
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
    const [importSummary, setImportSummary] = useState({ success: 0, errors: 0 })
    const [isMinimized, setIsMinimized] = useState(false)
    const [taskId, setTaskId] = useState<string | null>(null)
    const [duplicateCount, setDuplicateCount] = useState(0)
    const [uniqueCount, setUniqueCount] = useState(0)
    const [duplicateIndices, setDuplicateIndices] = useState<number[]>([])
    const [cancelRequested, setCancelRequested] = useState(false)
    const [showCancelConfirm, setShowCancelConfirm] = useState(false)
    const [assignedDoctorId, setAssignedDoctorId] = useState<string>('')
    const [doctorError, setDoctorError] = useState<string>('')
    const fileInputRef = useRef<HTMLInputElement>(null)
    const cancelRef = useRef(false)
    const { addTask, updateTask, removeTask, cancelTask } = useImportContext()

    // Reset assigned doctor when modal opens
    useEffect(() => {
        if (isOpen) {
            setAssignedDoctorId('')
        }
    }, [isOpen])

    /** Safely parse a numeric value from any field */
    const parseNum = (val: any): number | undefined => {
        const n = parseFloat(val)
        return isNaN(n) ? undefined : n
    }

    if (!isOpen) return null

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0]
        if (!selectedFile) return

        const validTypes = [
            'text/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/json'
        ]

        if (!validTypes.includes(selectedFile.type) && !selectedFile.name.match(/\.(csv|xlsx|xls|json)$/i)) {
            setError('Invalid file type. Please upload CSV, XLSX, XLS, or JSON file.')
            return
        }

        setFile(selectedFile)
        setError('')
        parseFile(selectedFile)
    }

    const parseFile = async (file: File) => {
        try {
            if (file.name.endsWith('.json')) {
                const text = await file.text()
                const json = JSON.parse(text)
                processData(Array.isArray(json) ? json : [json])
            } else {
                const data = await file.arrayBuffer()
                const workbook = XLSX.read(data)
                const worksheet = workbook.Sheets[workbook.SheetNames[0]]
                const jsonData = XLSX.utils.sheet_to_json(worksheet)
                processData(jsonData)
            }
        } catch (err: any) {
            setError(`Failed to parse file: ${err.message}`)
        }
    }

    /** Convert any date-like value (Excel serial, Date object, string) to 'YYYY-MM-DD' or undefined */
    const toISODate = (value: any): string | undefined => {
        if (value === null || value === undefined || value === '') return undefined
        // Date object (from cellDates: true parsing)
        if (value instanceof Date) {
            if (isNaN(value.getTime())) return undefined
            return value.toISOString().slice(0, 10)
        }
        // Excel serial number (days since 1899-12-30)
        if (typeof value === 'number') {
            const d = new Date((value - 25569) * 86400 * 1000)
            if (!isNaN(d.getTime()) && d.getFullYear() >= 1900 && d.getFullYear() <= 2100) {
                return d.toISOString().slice(0, 10)
            }
            return undefined
        }
        // String
        if (typeof value === 'string') {
            const d = new Date(value)
            if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10)
            return value
        }
        return undefined
    }

    /** Ensure a value is a non-empty string (rejects Excel numeric leakage) */
    const toSafeString = (value: any): string | undefined => {
        if (value === null || value === undefined || value === '') return undefined
        if (typeof value !== 'string') return undefined
        const s = value.trim()
        return s || undefined
    }

    const processData = (data: any[]) => {
        if (!data || data.length === 0) {
            setError('No data found in file')
            return
        }

        const patients: PatientRow[] = data.map((row: any) => {
            // fullName: accept many possible column names, fall back to firstName+lastName concat
            const rawFullName =
                row.fullName || row.FullName || row['Full Name'] ||
                row.Name || row.name || row['Patient Name'] || row['patient name'] ||
                row.PatientName || row['FULL NAME'] || row['NAME'] || undefined
            const rawFirst = String(row.firstName || row.FirstName || row['First Name'] || '').trim()
            const rawLast  = String(row.lastName  || row.LastName  || row['Last Name']  || '').trim()
            const derivedName = rawFirst || rawLast
                ? `${rawFirst} ${rawLast}`.trim()
                : undefined
            const fullName = String(rawFullName || derivedName || '').trim()
            return ({
            fullName,
            firstName: rawFirst || undefined,
            lastName: rawLast || undefined,
            phone: row.phone || row.Phone ? String(row.phone || row.Phone).replace(/\D/g, '').slice(0, 15) : undefined,
            email: toSafeString(row.email || row.Email),
            gender: row.gender || row.Gender || undefined,
            age: row.age || row.Age ? parseInt(row.age || row.Age) : undefined,
            dob: toISODate(row.dob || row.DOB || row.dateOfBirth || row['Date of Birth']),
            date: toISODate(row.date || row.Date || row.registrationDate || row['Registration Date']),
            nextVisit: toISODate(row.nextVisit || row['Next Visit']) as any,
            weight: row.weight || row.Weight ? parseNum(row.weight || row.Weight) : undefined,
            height: row.height || row.Height ? parseNum(row.height || row.Height) : undefined,
            address: row.address || row.Address || undefined,
            fatherHusbandGuardianName: row.fatherHusbandGuardianName || row.guardianName || row['Guardian Name'] || undefined,
            temperament: row.temperament || row.Temperament || undefined,
            pulseDiagnosis: row.pulseDiagnosis || row['Pulse Diagnosis'] || undefined,
            pulseDiagnosis2: row.pulseDiagnosis2 || row['Pulse Diagnosis 2'] || undefined,
            majorComplaints: row.majorComplaints || row['Major Complaints'] || undefined,
            historyReports: row.historyReports || row['History Reports'] || undefined,
            investigations: row.investigations || row.Investigations || undefined,
            provisionalDiagnosis: row.provisionalDiagnosis || row['Provisional Diagnosis'] || undefined,
            improvements: row.improvements || row.Improvements || undefined,
            // nextVisit already mapped above
            imageUrl: row.imageUrl || row['Image URL'] || undefined,
            opdNo: row.opdNo || row.OPDNo || row['OPD No'] || undefined,
            // doctorId from file row — will be overridden at import time by assignedDoctorId if set
            doctorId: row.doctorId || row.DoctorId || undefined,
        })})

        // Validate required fields
        const errors: string[] = []
        patients.forEach((p, index) => {
            if (!p.fullName) errors.push(`Row ${index + 1}: Missing patient name`)
        })

        if (errors.length > 0) {
            setError(errors.slice(0, 5).join('\n') + (errors.length > 5 ? `\n...and ${errors.length - 5} more errors` : ''))
            return
        }

        setParsedData(patients)
        setPreviewData(patients.slice(0, 10))
        setStep('preview')
    }

    const checkDuplicates = async () => {
        setStep('checking')
        setError('')

        try {
            const patientsToCheck = parsedData.map((patient, index) => ({
                name: patient.fullName || `${patient.firstName || ''} ${patient.lastName || ''}`.trim(),
                phone: patient.phone,
                email: patient.email,
                dob: patient.dob,
                index
            }))

            const response = await fetch('/api/patients/check-duplicates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ patients: patientsToCheck })
            })

            if (!response.ok) throw new Error('Failed to check for duplicates')

            const result = await response.json()
            setDuplicateIndices(result.duplicateIndices || [])
            setDuplicateCount(result.duplicateIndices?.length || 0)
            setUniqueCount(result.uniqueIndices?.length || 0)
            setStep('confirm')
        } catch (err: any) {
            setError(`Failed to check duplicates: ${err.message}`)
            setStep('preview')
        }
    }

    const handleImport = async (skipDuplicates: boolean = false) => {
        setImporting(true)
        setError('')
        setStep('importing')
        setCancelRequested(false)
        cancelRef.current = false

        // Filter out duplicates if requested and apply assigned doctor
        const dataToImport = (skipDuplicates
            ? parsedData.filter((_, index) => !duplicateIndices.includes(index))
            : parsedData
        ).map(p => ({
            ...p,
            // Global doctor assignment overrides any per-row doctorId
            doctorId: assignedDoctorId ? assignedDoctorId : (p.doctorId ?? undefined),
        }))

        // Create task in global context
        const id = addTask({
            type: 'patients',
            operation: 'import',
            status: 'importing',
            progress: { current: 0, total: dataToImport.length }
        })
        setTaskId(id)

        try {
            const total = dataToImport.length
            setImportProgress({ current: 0, total })

            // Batch processing for speed
            const BATCH_SIZE = 100
            const batches = []
            for (let i = 0; i < dataToImport.length; i += BATCH_SIZE) {
                batches.push(dataToImport.slice(i, i + BATCH_SIZE))
            }

            let successCount = 0
            const allErrors: any[] = []

            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                // Check for cancellation at start of each batch
                if (cancelRef.current) {
                    cancelTask(id)
                    setImporting(false)
                    setImportProgress({ current: 0, total: 0 })
                    setTaskId(null)
                    setIsMinimized(false)
                    setCancelRequested(false)
                    cancelRef.current = false
                    return
                }

                const batch = batches[batchIndex]
                const batchStartIndex = batchIndex * BATCH_SIZE
                
                const response = await fetch('/api/patients/bulk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ patients: batch })
                })

                if (!response.ok) {
                    const error = await response.json()
                    throw new Error(`Failed to import patients: ${error.error || 'Unknown error'}`)
                }

                const result = await response.json()
                
                if (result.errors && result.errors.length > 0) {
                    allErrors.push(...result.errors)
                }
                
                successCount += result.count || 0

                // Update progress instantly for all items in batch
                for (let i = 0; i < batch.length; i++) {
                    const currentProgress = batchStartIndex + i + 1
                    setImportProgress({ current: currentProgress, total })
                    updateTask(id, {
                        progress: { current: currentProgress, total }
                    })
                }
            }

            if (allErrors.length > 0 && successCount === 0) {
                throw new Error(`Import failed: ${allErrors[0]?.error || 'Unknown error'}`)
            }

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
            setError(err.message)
            setImporting(false)
            setStep('select')
            
            // Update task to error
            if (taskId) {
                updateTask(taskId, {
                    status: 'error',
                    error: err.message,
                    endTime: Date.now()
                })
            }
        }
    }

    const handleCancel = () => {
        setShowCancelConfirm(true)
    }

    const confirmCancelImport = () => {
        setCancelRequested(true)
        cancelRef.current = true
        setShowCancelConfirm(false)
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
        
        setFile(null)
        setParsedData([])
        setPreviewData([])
        setError('')
        setStep('select')
        setImportProgress({ current: 0, total: 0 })
        setImportSummary({ success: 0, errors: 0 })
        setIsMinimized(false)
        setTaskId(null)
        setAssignedDoctorId('')
        if (fileInputRef.current) fileInputRef.current.value = ''
        onClose()
    }

    const handleMinimize = () => {
        setIsMinimized(true)
    }

    const handleMaximize = () => {
        setIsMinimized(false)
    }

    // If minimized, show nothing (task is tracked in notification dropdown)
    if (isMinimized) return null

    const pct = importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0
    const steps = ['Upload', 'Preview', 'Confirm', 'Import']
    const stepIndex = step === 'select' ? 0 : step === 'preview' ? 1 : step === 'checking' || step === 'confirm' ? 2 : 3

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
            <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-200/60 dark:border-gray-700/60">

                {/* Decorative top bar */}
                <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-400 rounded-t-2xl" />

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/20">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-gray-900 dark:text-white leading-tight">Import Patients</h2>
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
                            {/* Assigned To Doctor - only for admin/receptionist */}
                            {(userRole === 'admin' || userRole === 'receptionist') && doctors.length > 0 && (
                                <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                                    <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Assign to Doctor <span className="text-red-500">*</span></span>
                                        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">Required for import</span>
                                    </div>
                                    <div className="p-4">
                                        <CustomSelect
                                            value={assignedDoctorId}
                                            onChange={(val) => { setAssignedDoctorId(val); if (val) setDoctorError('') }}
                                            placeholder="— Select a doctor —"
                                            options={doctors.map(d => ({ value: d.id.toString(), label: d.name || d.email }))}
                                        />
                                        {doctorError && (
                                            <p className="mt-1.5 text-xs text-red-600 dark:text-red-400 font-medium flex items-center gap-1">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                {doctorError}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Drop zone */}
                            <div className="relative">
                                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.json" onChange={handleFileSelect} className="hidden" id="patient-file-input" />
                                <label
                                    htmlFor="patient-file-input"
                                    onClick={(e) => {
                                        const needsDoctor = (userRole === 'admin' || userRole === 'receptionist') && doctors.length > 0
                                        if (needsDoctor && !assignedDoctorId) {
                                            e.preventDefault()
                                            setDoctorError('Please select a doctor first before uploading a file')
                                            return
                                        }
                                        setDoctorError('')
                                    }}
                                    className="group flex flex-col items-center justify-center gap-3 w-full py-12 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 bg-gray-50/50 dark:bg-gray-800/30 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 cursor-pointer transition-all">
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 group-hover:from-blue-200 group-hover:to-indigo-200 flex items-center justify-center shadow-sm transition-all">
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
                                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Column Reference</span>
                                </div>
                                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-2"><span className="w-1.5 h-1.5 rounded-full bg-red-500" /><span className="font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide text-[10px]">Required</span></div>
                                        <div className="space-y-1">
                                            <div><code className="px-1.5 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded text-[10px] font-mono">fullName</code> <span className="text-gray-500 dark:text-gray-400">Patient's full name</span></div>
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-2"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" /><span className="font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide text-[10px]">Optional</span></div>
                                        <div className="space-y-1 text-gray-500 dark:text-gray-400">
                                            {[
                                                ['fullName','Full name (required)'],
                                                ['phone','10-digit phone (no country code)'],
                                                ['email','Email address'],
                                                ['gender','Male / Female / Other'],
                                                ['age','Age (number)'],
                                                ['dob','Date of birth (YYYY-MM-DD)'],
                                                ['registrationDate','Registration date (YYYY-MM-DD)'],
                                                ['weight','Weight in kg'],
                                                ['height','Height in cm'],
                                                ['address','Full address'],
                                                ['fatherHusbandGuardianName','Guardian name'],
                                                ['temperament','Temperament'],
                                                ['pulseDiagnosis','Pulse diagnosis'],
                                                ['pulseDiagnosis2','Pulse diagnosis 2'],
                                                ['majorComplaints','Major complaints'],
                                                ['historyReports','History / reports'],
                                                ['investigations','Investigations'],
                                                ['provisionalDiagnosis','Provisional diagnosis'],
                                                ['improvements','Improvements'],
                                                ['nextVisit','Next visit date (YYYY-MM-DD)'],
                                                ['imageUrl','Patient photo URL'],
                                                ['opdNo','OPD number'],
                                                ['doctorId','Doctor ID (overridden by Assign to Doctor)'],
                                            ].map(([f,d]) => (
                                                <div key={f}><code className="px-1 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded text-[10px] font-mono">{f}</code> <span>{d}</span></div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-blue-50/40 dark:bg-blue-900/10 text-xs text-blue-700 dark:text-blue-400 space-y-1">
                                    <div>• Duplicates are detected by: <strong>name + email</strong>, <strong>name + date of birth</strong>, or <strong>email alone</strong> — phone is not used for duplicate detection</div>
                                    <div>• Phones are automatically stripped of non-digit characters</div>
                                    <div>• Dates accept DD-MM-YYYY, MM/DD/YYYY, and ISO (YYYY-MM-DD) formats</div>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <a href="/templates/patients_import_template.csv" download className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                    Download CSV template
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
                            <div className="flex flex-wrap gap-3">
                                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200/60 dark:border-blue-800/60">
                                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    <div>
                                        <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">Patients found</div>
                                        <div className="text-lg font-bold text-blue-700 dark:text-blue-300 leading-tight">{parsedData.length}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Data Preview</span>
                                    <span className="text-xs text-gray-400 dark:text-gray-500">First 10 rows</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-gray-100 dark:border-gray-800">
                                                {['Full Name','Phone','Gender','Age','DOB','Weight','Height'].map(h => (
                                                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] whitespace-nowrap">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800/80">
                                            {previewData.map((p, i) => (
                                                <tr key={i} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors">
                                                    <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">{p.fullName || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{p.phone || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{p.gender || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{p.age ?? <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{p.dob || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{p.weight ?? <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{p.height ?? <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{p.height ?? <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
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
                        </div>
                    )}

                    {/* ── STEP: CHECKING ── */}
                    {step === 'checking' && (
                        <div className="flex flex-col items-center justify-center py-16 gap-4">
                            <div className="w-12 h-12 rounded-full border-4 border-blue-200 dark:border-blue-800 border-t-blue-600 dark:border-t-blue-400 animate-spin" />
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Checking for duplicates…</p>
                        </div>
                    )}

                    {/* ── STEP: CONFIRM ── */}
                    {step === 'confirm' && (
                        <div className="p-6 space-y-5">
                            <div className="flex flex-wrap gap-3">
                                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200/60 dark:border-blue-800/60">
                                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <div>
                                        <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">Unique</div>
                                        <div className="text-lg font-bold text-blue-700 dark:text-blue-300 leading-tight">{uniqueCount}</div>
                                    </div>
                                </div>
                                {duplicateCount > 0 && (
                                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200/60 dark:border-orange-800/60">
                                        <svg className="w-4 h-4 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                        <div>
                                            <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">Duplicates</div>
                                            <div className="text-lg font-bold text-orange-700 dark:text-orange-300 leading-tight">{duplicateCount}</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                            {duplicateCount > 0 && (
                                <div className="flex gap-3 p-4 bg-orange-50 dark:bg-orange-900/10 border border-orange-200/60 dark:border-orange-800/60 rounded-xl text-sm text-orange-800 dark:text-orange-300">
                                    <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <span>{duplicateCount} patient(s) may already exist (matched by name + email, name + DOB, or email alone). Choose how to handle them below.</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── STEP: IMPORTING ── */}
                    {step === 'importing' && (
                        <div className="flex flex-col items-center justify-center py-16 px-6 gap-6">
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
                                <h3 className="text-base font-bold text-gray-900 dark:text-white">Importing Patients</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{importProgress.current} of {importProgress.total} patients processed</p>
                            </div>
                            <div className="w-full max-w-sm">
                                <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                    <div className="h-2 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
                                </div>
                            </div>
                            <button onClick={handleCancel} className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                Cancel Import
                            </button>
                            <p className="text-xs text-gray-400 dark:text-gray-500">Please don&apos;t close this window</p>
                        </div>
                    )}

                    {/* ── STEP: SUCCESS ── */}
                    {step === 'success' && (
                        <div className="flex flex-col items-center justify-center py-16 px-6 gap-4">
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
                                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            </div>
                            <div className="text-center">
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Import Complete!</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Your patients have been saved</p>
                            </div>
                            <div className="flex gap-3 mt-1">
                                <div className="px-4 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200/60 dark:border-blue-800/60 text-center">
                                    <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">{importSummary.success}</div>
                                    <div className="text-xs text-blue-600 dark:text-blue-400 font-medium">Imported</div>
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
                            {step !== 'select' ? <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>Back</> : 'Cancel'}
                        </button>
                        <div className="flex gap-2">
                            {step === 'preview' && (
                                <button onClick={checkDuplicates} className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-blue-500/20 transition-all">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Check & Continue
                                </button>
                            )}
                            {step === 'confirm' && (
                                <>
                                    {duplicateCount > 0 && (
                                        <button onClick={() => handleImport(true)} className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-lg transition-all">
                                            Import {uniqueCount} Unique
                                        </button>
                                    )}
                                    <button onClick={() => handleImport(false)} className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-blue-500/20 transition-all">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                        Import All {parsedData.length}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Cancel Confirm Dialog */}
            {showCancelConfirm && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[10000]">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200/60 dark:border-gray-700/60 p-6 max-w-sm w-full mx-4">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                                <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <h3 className="text-base font-bold text-gray-900 dark:text-white">Cancel Import?</h3>
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Are you sure? Progress will be lost.</p>
                        <div className="flex gap-3 justify-end">
                            <button onClick={() => setShowCancelConfirm(false)} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Continue</button>
                            <button onClick={confirmCancelImport} className="px-4 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors">Yes, Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

