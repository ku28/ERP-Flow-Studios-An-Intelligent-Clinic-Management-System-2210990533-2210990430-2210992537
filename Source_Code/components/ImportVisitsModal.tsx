import { useState, useRef, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { useImportContext } from '../contexts/ImportContext'
import { useDoctor } from '../contexts/DoctorContext'
import CustomSelect from './CustomSelect'
import { useAuth } from '../contexts/AuthContext'

interface ImportVisitsModalProps {
    isOpen: boolean
    onClose: () => void
    onImportSuccess: () => void
}

interface VisitRow {
    // Visit base fields
    opdNo: string
    date?: string
    patientName?: string
    visitNumber?: number
    address?: string
    fatherHusbandGuardianName?: string
    phone?: string
    amount?: number
    discount?: number
    payment?: number
    balance?: number
    followUpCount?: number
    nextVisit?: string
    gender?: string
    dob?: string
    age?: number
    weight?: any // Can be string (for history like "94/93/94") or number
    height?: number
    temperament?: string
    pulseDiagnosis?: string
    pulseDiagnosis2?: string
    investigations?: string
    provDiagnosis?: string // Changed from diagnoses to match schema
    historyReports?: string
    majorComplaints?: string
    improvements?: string
    procedureAdopted?: string
    discussion?: string
    extra?: string
    
    // Prescription fields for up to 12 medicines
    prescriptions?: Array<{
        quantity?: number
        productName?: string
        spy1?: string // CR - Spagyric 1 (SPY1)
        spy2?: string // SY - Spagyric 2 (SPY2)
        spy3?: string // EF - Spagyric 3 (SPY3)
        spy4?: string // CP4 - Spagyric 4 (optional)
        spy5?: string // CP5 - Spagyric 5 (optional)
        timing?: string // TM - Timing
        dosage?: string
        additions?: string
        procedure?: string
        presentation?: string
        droppersToday?: number
    }>
}

export default function ImportVisitsModal({ isOpen, onClose, onImportSuccess }: ImportVisitsModalProps) {
    const [file, setFile] = useState<File | null>(null)
    const [parsedData, setParsedData] = useState<VisitRow[]>([])
    const [previewData, setPreviewData] = useState<any[]>([])
    const [importing, setImporting] = useState(false)
    const [error, setError] = useState<string>('')
    const [step, setStep] = useState<'select' | 'preview' | 'checking' | 'confirm' | 'importing' | 'success'>('select')
    const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
    const [importSummary, setImportSummary] = useState({ success: 0, errors: 0 })
    const [isMinimized, setIsMinimized] = useState(false)
    const [taskId, setTaskId] = useState<string | null>(null)
    const [cancelRequested, setCancelRequested] = useState(false)
    const [showCancelConfirm, setShowCancelConfirm] = useState(false)
    const [duplicateInfo, setDuplicateInfo] = useState<any>(null)
    const [includeDuplicates, setIncludeDuplicates] = useState(false)
    const [selectedDoctorForImport, setSelectedDoctorForImport] = useState<number | null>(null)
    const [doctorError, setDoctorError] = useState<string>('')
    const fileInputRef = useRef<HTMLInputElement>(null)
    const cancelRef = useRef(false)
    const abortControllerRef = useRef<AbortController | null>(null)
    const { addTask, updateTask, removeTask, cancelTask } = useImportContext()
    const { doctors, selectedDoctorId } = useDoctor()
    const { user } = useAuth()

    // Listen for maximize events from notification dropdown
    useEffect(() => {
        const handleMaximize = (e: any) => {
            if (e.detail.type === 'visits' && e.detail.operation === 'import' && e.detail.taskId === taskId) {
                setIsMinimized(false)
            }
        }
        window.addEventListener('maximizeTask', handleMaximize)
        return () => window.removeEventListener('maximizeTask', handleMaximize)
    }, [taskId])

    // Set default doctor selection based on AuthContext user
    useEffect(() => {
        if (user?.role === 'admin' && selectedDoctorId) {
            setSelectedDoctorForImport(selectedDoctorId)
        } else if (user?.role === 'doctor') {
            setSelectedDoctorForImport(user.id)
        }
    }, [user, selectedDoctorId])

    if (!isOpen) return null

    const isAdmin = user?.role === 'admin'

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
                const workbook = XLSX.read(data, { 
                    type: 'array',
                    cellDates: false,  // Don't parse dates automatically
                    cellText: false,   // Don't use formatted text
                    raw: true          // Keep raw values
                })
                const worksheet = workbook.Sheets[workbook.SheetNames[0]]
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
                    defval: '',
                    raw: false  // Use formatted string values instead of raw numbers
                })
                processData(jsonData)
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

        // Helper function to parse dates from various formats
        const parseDate = (dateStr: any): string | undefined => {
            if (!dateStr) return undefined
            
            let str = String(dateStr).trim()
            if (!str) return undefined
            
            // Try to parse DD-MM-YYYY format (e.g., "01-11-2025" or "04-11-2025")
            const ddmmyyyyMatch = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
            if (ddmmyyyyMatch) {
                const day = parseInt(ddmmyyyyMatch[1])
                const month = parseInt(ddmmyyyyMatch[2])
                const year = parseInt(ddmmyyyyMatch[3])
                
                // Create date directly in YYYY-MM-DD format
                const result = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                
                // Validate the date is real
                const testDate = new Date(year, month - 1, day)
                if (!isNaN(testDate.getTime()) && 
                    testDate.getFullYear() === year && 
                    testDate.getMonth() === month - 1 && 
                    testDate.getDate() === day) {
                    return result
                }
            }
            
            // If it's a pure number (Excel serial), return undefined to show as "-"
            const numValue = parseFloat(str)
            if (!isNaN(numValue) && !/[\/-]/.test(str)) {
                return undefined
            }
            
            // Try to parse DD/MM/YYYY format
            const ddmmyyyySlashMatch = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
            if (ddmmyyyySlashMatch) {
                const day = parseInt(ddmmyyyySlashMatch[1])
                const month = parseInt(ddmmyyyySlashMatch[2])
                const year = parseInt(ddmmyyyySlashMatch[3])
                
                const result = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                
                // Validate the date is real
                const testDate = new Date(year, month - 1, day)
                if (!isNaN(testDate.getTime()) && 
                    testDate.getFullYear() === year && 
                    testDate.getMonth() === month - 1 && 
                    testDate.getDate() === day) {
                    return result
                }
            }
            
            // Try to parse as ISO date or let Date constructor handle it
            const date = new Date(str)
            if (!isNaN(date.getTime())) {
                const result = date.toISOString().split('T')[0]
                return result
            }
            
            return undefined
        }

        const visits: VisitRow[] = data.map((row: any) => {
            // Parse prescriptions from numbered columns (01-12)
            const prescriptions = []
            for (let i = 1; i <= 12; i++) {
                const num = String(i).padStart(2, '0') // Format as 01, 02, etc.
                const qtyKey = i === 1 ? `QTY-${num}` : `QNTY-${num}` // First is QTY, rest are QNTY
                const qty = row[qtyKey]
                const productName = row[`DL-${num}`] // DL = Medicine name (corrected mapping)
                
                // Only add prescription if product name exists and is not 0 or '0'
                if (productName && productName !== 0 && String(productName).trim() !== '0' && String(productName).trim() !== '') {
                    prescriptions.push({
                        quantity: qty ? Number(qty) : 1,
                        productName: String(productName).trim(),
                        spy1: row[`CR-${num}`] || '', // CR = Spagyric 1 (SPY1)
                        spy2: row[`SY-${num}`] || '', // SY = Spagyric 2 (SPY2)
                        spy3: row[`EF-${num}`] || '', // EF = Spagyric 3 (SPY3)
                        spy4: row[`CP4-${num}`] || '', // CP4 = Spagyric 4 (optional)
                        spy5: row[`CP5-${num}`] || '', // CP5 = Spagyric 5 (optional)
                        timing: row[`TM-${num}`] || '',
                        dosage: row[`DOSE-${num}`] || '',
                        additions: row[`AD-${num}`] || '',
                        procedure: row[`PR-${num}`] || '',
                        presentation: row[`PRE-${num}`] || '',
                        droppersToday: row[`TDY-${num}`] ? Number(row[`TDY-${num}`]) : undefined
                    })
                }
            }
            
            return {
                opdNo: String(row.OPDN || row.opdNo || '').trim(),
                date: parseDate(row.Date || row.date),
                patientName: row['Patient Name'] || row.patientName || undefined,
                visitNumber: row.V ? Number(row.V) : undefined, // Use V column for visit number
                address: row.Address || row.address || undefined,
                fatherHusbandGuardianName: row['F/H/G Name'] || row.fatherHusbandGuardianName || undefined,
                phone: String(row['Mob./Ph'] || row.phone || '').trim() || undefined,
                amount: row.AMT ? parseFloat(String(row.AMT).replace(/,/g, '')) : undefined,
                discount: row.DISCOUNT ? parseFloat(String(row.DISCOUNT).replace(/,/g, '')) : undefined,
                payment: row.PAYMENT ? parseFloat(String(row.PAYMENT).replace(/,/g, '')) : undefined,
                balance: row.BAL ? parseFloat(String(row.BAL).replace(/,/g, '')) : undefined,
                followUpCount: row.FU ? Number(row.FU) : undefined,
                nextVisit: parseDate(row['Next V'] || row.nextVisit),
                gender: row.Sex || row.gender || undefined,
                dob: parseDate(row.DOB || row.dob),
                age: row.Age ? Number(String(row.Age).replace(/[^0-9]/g, '')) : undefined,
                weight: row.Wt || row.weight || undefined, // Keep as string to preserve history format like "94/93/94"
                height: row.Ht ? (() => {
                    const htStr = String(row.Ht).trim()
                    // Handle formats like "3' 9\"" or "3'9" or plain numbers
                    const feetInchMatch = htStr.match(/(\d+)'?\s*(\d+)?/)
                    if (feetInchMatch) {
                        const feet = parseInt(feetInchMatch[1]) || 0
                        const inches = parseInt(feetInchMatch[2] || '0')
                        return feet * 12 + inches // Convert to total inches
                    }
                    // Plain number
                    return parseFloat(htStr.replace(/[^0-9.]/g, '')) || undefined
                })() : undefined,
                temperament: row.Temp || row.temperament || undefined,
                pulseDiagnosis: row['PulseD 1'] || row.pulseDiagnosis || undefined,
                pulseDiagnosis2: row['PulseD 2'] || row.pulseDiagnosis2 || undefined,
                investigations: row.Investigations || row.investigations || undefined,
                provDiagnosis: row.Diagnosis || row['Diagnosis'] || row.provDiagnosis || undefined,
                historyReports: row['Hist/Reports'] || row.historyReports || undefined,
                majorComplaints: row['Chief Complaints'] || row.majorComplaints || undefined,
                improvements: row.Imp || row.improvements || undefined,
                procedureAdopted: row.PROCEDURE || row.procedureAdopted || undefined,
                discussion: row.DISCUSSION || row.discussion || undefined,
                extra: row.EXTRA ? String(row.EXTRA) : undefined, // Convert to string
                prescriptions: prescriptions.length > 0 ? prescriptions : undefined
            }
        })

        // Validate required fields
        const errors: string[] = []
        visits.forEach((v, index) => {
            if (!v.opdNo) {
                errors.push(`Row ${index + 1}: Missing OPDN (OPD Number)`)
            }
        })


        if (errors.length > 0) {
            setError(errors.slice(0, 5).join('\n') + (errors.length > 5 ? `\n...and ${errors.length - 5} more errors` : ''))
            return
        }

        setParsedData(visits)
        setPreviewData(visits.slice(0, 10))
        setStep('preview')
    }

    const checkDuplicates = async () => {
        setStep('checking')
        setError('')

        try {
            
            // Extract just the opdNos to reduce payload size
            const opdNos = parsedData.map((v, index) => ({ 
                opdNo: v.opdNo, 
                index 
            })).filter(item => item.opdNo)
            
            let response
            try {
                response = await fetch('/api/visits/check-duplicates', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ opdNos }) // Send only opdNos, not full visit data
                })
            } catch (fetchError) {
                throw new Error('Network error: Unable to connect to server. Please check if the server is running.')
            }

            let result
            try {
                result = await response.json()
            } catch (jsonError) {
                throw new Error('Invalid response from server')
            }

            if (!response.ok) {
                throw new Error(result.error || 'Failed to check for duplicates')
            }

            setDuplicateInfo(result)
            
            if (result.duplicates > 0) {
                setStep('confirm')
            } else {
                // No duplicates, proceed directly to import
                handleImport()
            }
        } catch (err: any) {
            setError(err.message || 'Failed to check duplicates. Please try again.')
            setStep('preview')
        }
    }

    const handleImport = async () => {
        setImporting(true)
        setError('')
        setStep('importing')
        setCancelRequested(false)
        cancelRef.current = false
        
        // Create new AbortController for this import
        abortControllerRef.current = new AbortController()

        // Determine which data to import based on duplicate settings
        let dataToImport = parsedData
        if (duplicateInfo && !includeDuplicates) {
            // Only import unique records using indices
            const uniqueIndices = duplicateInfo.uniqueIndices || []
            dataToImport = uniqueIndices.map((index: number) => parsedData[index])
        }

        // Create task in global context
        const id = addTask({
            type: 'visits',
            operation: 'import',
            status: 'importing',
            progress: { current: 0, total: dataToImport.length }
        })
        setTaskId(id)

        try {
            const totalVisits = dataToImport.length
            setImportProgress({ current: 0, total: totalVisits })

            let successCount = 0
            const allErrors: any[] = []

            // Send 100 visits per batch to backend
            const BATCH_SIZE = 100
            const batches = []
            for (let i = 0; i < dataToImport.length; i += BATCH_SIZE) {
                batches.push(dataToImport.slice(i, i + BATCH_SIZE))
            }

            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                // Check if cancel was requested at start of batch
                if (cancelRef.current) {
                    cancelTask(id)
                    setImporting(false)
                    setStep('select')
                    abortControllerRef.current = null
                    return
                }

                const batch = batches[batchIndex]
                const batchStartIndex = batchIndex * BATCH_SIZE
                
                
                try {
                    // Send batch request with abort signal
                    const response = await fetch('/api/visits/bulk', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            visits: batch,
                            doctorId: selectedDoctorForImport 
                        }),
                        signal: abortControllerRef.current?.signal
                    })

                    if (response.ok) {
                        const result = await response.json()
                        if (result.errors && result.errors.length > 0) {
                            allErrors.push(...result.errors)
                        }
                        successCount += result.count || batch.length
                        
                        // Update progress instantly for each item in the batch
                        for (let i = 0; i < batch.length; i++) {
                            const currentProgress = batchStartIndex + i + 1
                            setImportProgress({ current: currentProgress, total: totalVisits })
                            updateTask(id, {
                                progress: { current: currentProgress, total: totalVisits }
                            })
                        }
                    } else {
                        const error = await response.json()
                        allErrors.push({ error: error.error || 'Unknown error', batch: batchIndex + 1 })
                    }
                } catch (err: any) {
                    allErrors.push({ error: err.message, batch: batchIndex + 1 })
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
            // Don't show error if user cancelled
            if (err.name === 'AbortError') {
                setImporting(false)
                setStep('select')
                return
            }
            
            setError(err.message)
            setImporting(false)
            setStep('select')
            
            // Update task to error
            if (id) {
                updateTask(id, {
                    status: 'error',
                    error: err.message,
                    endTime: Date.now()
                })
            }
        } finally {
            abortControllerRef.current = null
        }
    }

    const handleCancelImport = () => {
        setShowCancelConfirm(true)
    }

    const confirmCancelImport = () => {
        setCancelRequested(true)
        cancelRef.current = true
        setShowCancelConfirm(false)
        
        // Abort any in-flight request immediately
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
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
        
        setFile(null)
        setParsedData([])
        setPreviewData([])
        setError('')
        setStep('select')
        setImportProgress({ current: 0, total: 0 })
        setImportSummary({ success: 0, errors: 0 })
        setIsMinimized(false)
        setTaskId(null)
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
                <div className="h-1 w-full bg-gradient-to-r from-purple-500 via-pink-500 to-rose-400 rounded-t-2xl" />

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-md shadow-purple-500/20">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-gray-900 dark:text-white leading-tight">Import Visits</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">CSV · XLSX · JSON</p>
                        </div>
                    </div>

                    {/* Step indicators */}
                    <div className="hidden sm:flex items-center gap-1.5 mr-4">
                        {steps.map((s, i) => (
                            <div key={s} className="flex items-center gap-1.5">
                                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                                    i < stepIndex ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' :
                                    i === stepIndex ? 'bg-purple-600 text-white shadow-sm shadow-purple-500/30' :
                                    'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
                                }`}>
                                    {i < stepIndex ? (
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    ) : (
                                        <span className="w-3.5 h-3.5 flex items-center justify-center rounded-full border border-current text-[9px]">{i + 1}</span>
                                    )}
                                    {s}
                                </div>
                                {i < steps.length - 1 && <div className={`w-4 h-px ${i < stepIndex ? 'bg-purple-300 dark:bg-purple-700' : 'bg-gray-200 dark:bg-gray-700'}`} />}
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
                            {/* Admin doctor selector */}
                            {isAdmin && (
                                <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/60">
                                    <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                    <div className="flex-1">
                                        <label className="block text-sm font-semibold text-amber-900 dark:text-amber-100 mb-1.5">Assign to Doctor <span className="text-red-500">*</span></label>
                                        <select value={selectedDoctorForImport || ''} onChange={(e) => { setSelectedDoctorForImport(Number(e.target.value)); if (e.target.value) setDoctorError('') }}
                                            className="w-full px-3 py-2 bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-400 focus:border-transparent">
                                            <option value="">— Select Doctor —</option>
                                            {doctors.map(d => <option key={d.id} value={d.id}>{d.name} ({d.email})</option>)}
                                        </select>
                                        <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">All imported visits will be assigned to this doctor</p>
                                        {doctorError && (
                                            <p className="mt-1.5 text-xs text-red-600 font-medium flex items-center gap-1">
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                {doctorError}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Drop zone */}
                            <div className="relative">
                                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.json" onChange={handleFileSelect} className="hidden" id="visit-file-input" />
                                <label
                                    htmlFor="visit-file-input"
                                    onClick={(e) => {
                                        if (isAdmin && !selectedDoctorForImport) {
                                            e.preventDefault()
                                            setDoctorError('Please select a doctor first before uploading a file')
                                            return
                                        }
                                        setDoctorError('')
                                    }}
                                    className={`group flex flex-col items-center justify-center gap-3 w-full py-12 rounded-xl border-2 border-dashed transition-all ${isAdmin && !selectedDoctorForImport ? 'border-red-200 dark:border-red-800 bg-red-50/30 dark:bg-red-900/10 cursor-pointer' : 'border-gray-200 dark:border-gray-700 hover:border-purple-400 dark:hover:border-purple-500 bg-gray-50/50 dark:bg-gray-800/30 hover:bg-purple-50/40 dark:hover:bg-purple-900/10 cursor-pointer'}`}>
                                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm transition-all ${isAdmin && !selectedDoctorForImport ? 'bg-red-50 dark:bg-red-900/20' : 'bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 group-hover:from-purple-200 group-hover:to-pink-200'}`}>
                                        <svg className={`w-7 h-7 ${isAdmin && !selectedDoctorForImport ? 'text-red-400' : 'text-purple-600 dark:text-purple-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                    </div>
                                    <div className="text-center">
                                        <p className={`font-semibold transition-colors ${isAdmin && !selectedDoctorForImport ? 'text-red-500 dark:text-red-400' : 'text-gray-700 dark:text-gray-200 group-hover:text-purple-700 dark:group-hover:text-purple-300'}`}>
                                            {isAdmin && !selectedDoctorForImport ? 'Select a doctor first' : 'Click to choose a file'}
                                        </p>
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
                                        <div><code className="px-1.5 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded text-[10px] font-mono">OPDN</code> <span className="text-gray-500 dark:text-gray-400">OPD Number</span></div>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-2"><span className="w-1.5 h-1.5 rounded-full bg-purple-500" /><span className="font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide text-[10px]">Visit fields</span></div>
                                        <div className="space-y-1 text-gray-500 dark:text-gray-400">
                                            {[['Date','Visit date'],['Patient Name','Matched by phone'],['AMT / DISCOUNT','Billing'],['Diagnoses','Diagnoses text']].map(([f,d]) => (
                                                <div key={f}><code className="px-1 py-0.5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded text-[10px] font-mono">{f}</code> <span>{d}</span></div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="sm:col-span-2">
                                        <div className="flex items-center gap-1.5 mb-2"><span className="w-1.5 h-1.5 rounded-full bg-pink-500" /><span className="font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide text-[10px]">Medicine columns (01–12)</span></div>
                                        <div className="flex flex-wrap gap-1 text-gray-500 dark:text-gray-400">
                                            {['DL','CR','SY','EF','CP4','CP5','TM','DOSE','AD','PR','PRE','TDY','QTY/QNTY'].map(f => (
                                                <code key={f} className="px-1 py-0.5 bg-pink-50 dark:bg-pink-900/20 text-pink-700 dark:text-pink-300 rounded text-[10px] font-mono">{f}-01…12</code>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-purple-50/40 dark:bg-purple-900/10 text-xs text-purple-700 dark:text-purple-400">
                                    • Duplicate OPD numbers update existing visits &nbsp;·&nbsp; New patients are created automatically
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <a href="/templates/visits_import_template.csv" download className="inline-flex items-center gap-1.5 text-xs text-purple-600 dark:text-purple-400 hover:underline font-medium">
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
                            {error && (
                                <div className="flex gap-3 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/60 rounded-xl">
                                    <svg className="w-5 h-5 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <p className="text-sm text-red-700 dark:text-red-300 whitespace-pre-line">{error}</p>
                                </div>
                            )}

                            <div className="flex flex-wrap gap-3">
                                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200/60 dark:border-purple-800/60">
                                    <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                    <div>
                                        <div className="text-xs text-purple-600 dark:text-purple-400 font-medium">Visits found</div>
                                        <div className="text-lg font-bold text-purple-700 dark:text-purple-300 leading-tight">{parsedData.length}</div>
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
                                                {['OPD No','Patient','Date','Diagnosis','Medicines'].map(h => (
                                                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px]">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800/80">
                                            {previewData.map((v, i) => (
                                                <tr key={i} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors">
                                                    <td className="px-3 py-2 font-mono text-xs font-medium text-gray-700 dark:text-gray-300">{v.opdNo}</td>
                                                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300 max-w-[120px] truncate">{v.patientName || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{v.date || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400 max-w-[140px] truncate">{v.provDiagnosis || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                                    <td className="px-3 py-2">
                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300">{v.prescriptions?.length || 0}</span>
                                                    </td>
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
                            <div className="w-12 h-12 rounded-full border-4 border-purple-200 dark:border-purple-800 border-t-purple-600 dark:border-t-purple-400 animate-spin" />
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Checking for duplicates…</p>
                        </div>
                    )}

                    {/* ── STEP: CONFIRM ── */}
                    {step === 'confirm' && duplicateInfo && (
                        <div className="p-6 space-y-5">
                            <div className="flex flex-wrap gap-3">
                                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200/60 dark:border-purple-800/60">
                                    <svg className="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                    <div>
                                        <div className="text-xs text-purple-600 dark:text-purple-400 font-medium">Total</div>
                                        <div className="text-lg font-bold text-purple-700 dark:text-purple-300 leading-tight">{duplicateInfo.total}</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200/60 dark:border-green-800/60">
                                    <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <div>
                                        <div className="text-xs text-green-600 dark:text-green-400 font-medium">Unique</div>
                                        <div className="text-lg font-bold text-green-700 dark:text-green-300 leading-tight">{duplicateInfo.unique}</div>
                                    </div>
                                </div>
                                {duplicateInfo.duplicates > 0 && (
                                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200/60 dark:border-orange-800/60">
                                        <svg className="w-4 h-4 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                        <div>
                                            <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">Duplicates</div>
                                            <div className="text-lg font-bold text-orange-700 dark:text-orange-300 leading-tight">{duplicateInfo.duplicates}</div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Radio choice */}
                            <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">How to handle duplicates?</span>
                                </div>
                                <div className="p-4 space-y-3">
                                    <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${!includeDuplicates ? 'border-green-400 dark:border-green-600 bg-green-50/50 dark:bg-green-900/10' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                                        <input type="radio" checked={!includeDuplicates} onChange={() => setIncludeDuplicates(false)} className="mt-0.5 w-4 h-4 text-green-600 accent-green-600" />
                                        <div>
                                            <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">Import unique only</div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{duplicateInfo.unique} visits — skip records that already exist</div>
                                        </div>
                                    </label>
                                    <label className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${includeDuplicates ? 'border-purple-400 dark:border-purple-600 bg-purple-50/50 dark:bg-purple-900/10' : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                                        <input type="radio" checked={includeDuplicates} onChange={() => setIncludeDuplicates(true)} className="mt-0.5 w-4 h-4 text-purple-600 accent-purple-600" />
                                        <div>
                                            <div className="text-sm font-semibold text-gray-800 dark:text-gray-200">Import all including duplicates</div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{duplicateInfo.total} visits — update existing records</div>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── STEP: IMPORTING ── */}
                    {step === 'importing' && (
                        <div className="flex flex-col items-center justify-center py-16 px-6 gap-6">
                            <div className="relative w-24 h-24">
                                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                                    <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-gray-100 dark:text-gray-800" />
                                    <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray={`${2 * Math.PI * 40}`} strokeDashoffset={`${2 * Math.PI * 40 * (1 - pct / 100)}`} strokeLinecap="round" className="text-purple-600 dark:text-purple-400 transition-all duration-500" />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-xl font-bold text-gray-900 dark:text-white">{pct}%</span>
                                </div>
                            </div>
                            <div className="text-center">
                                <h3 className="text-base font-bold text-gray-900 dark:text-white">Importing Visits</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{importProgress.current} of {importProgress.total} visits processed</p>
                            </div>
                            <div className="w-full max-w-sm">
                                <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                    <div className="h-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
                                </div>
                            </div>
                            <button onClick={handleCancelImport} className="flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/60 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                Cancel Import
                            </button>
                            <p className="text-xs text-gray-400 dark:text-gray-500">Please don&apos;t close this window</p>
                        </div>
                    )}

                    {/* ── STEP: SUCCESS ── */}
                    {step === 'success' && (
                        <div className="flex flex-col items-center justify-center py-16 px-6 gap-4">
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/25">
                                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            </div>
                            <div className="text-center">
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Import Complete!</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Your visits have been saved</p>
                            </div>
                            <div className="flex gap-3 mt-1">
                                <div className="px-4 py-2.5 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200/60 dark:border-purple-800/60 text-center">
                                    <div className="text-2xl font-bold text-purple-700 dark:text-purple-300">{importSummary.success}</div>
                                    <div className="text-xs text-purple-600 dark:text-purple-400 font-medium">Imported</div>
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
                            onClick={() => {
                                if (step === 'select') { handleClose(); return }
                                if (step === 'confirm') { setStep('preview'); setDuplicateInfo(null); return }
                                setStep('select'); setError('')
                            }}
                            className="flex items-center gap-1.5 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            {step !== 'select' ? <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>Back</> : 'Cancel'}
                        </button>
                        <div className="flex gap-2">
                            {step === 'preview' && (
                                <>
                                    <button onClick={handleImport} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">
                                        Skip Check & Import
                                    </button>
                                    <button onClick={checkDuplicates} className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-purple-500/20 transition-all">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        Check Duplicates
                                    </button>
                                </>
                            )}
                            {step === 'confirm' && duplicateInfo && (
                                <button onClick={handleImport} className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-purple-500/20 transition-all">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                    Import {includeDuplicates ? duplicateInfo.total : duplicateInfo.unique} Visits
                                </button>
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
