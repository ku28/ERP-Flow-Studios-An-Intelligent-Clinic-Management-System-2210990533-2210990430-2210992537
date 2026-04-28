import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import * as XLSX from 'xlsx'
import { useImportContext } from '../contexts/ImportContext'
import ConfirmationModal from './ConfirmationModal'

interface ImportProductsModalProps {
    isOpen: boolean
    onClose: () => void
    onImportSuccess: () => void
}

interface ProductRow {
    name: string
    priceRupees: number
    quantity: number
    latestBatchNumber?: string
    purchasePriceRupees?: number
    unit?: string
    category?: string
    minStockLevel?: number
    actualInventory?: number
    inventoryValue?: number
    latestUpdate?: string
    purchaseValue?: number
    salesValue?: number
    totalPurchased?: number
    totalSales?: number
}

interface ImportUsageGuard {
    canResetAndPopulate: boolean
    hasProductsInUseByVisits: boolean
    hasTreatmentsInUseByVisits: boolean
    productCatalogCount: number
}

export default function ImportProductsModal({ isOpen, onClose, onImportSuccess }: ImportProductsModalProps) {
    const [file, setFile] = useState<File | null>(null)
    const [parsedData, setParsedData] = useState<ProductRow[]>([])
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
    const [showResetConfirm, setShowResetConfirm] = useState(false)
    const [usageGuardLoading, setUsageGuardLoading] = useState(false)
    const [usageGuardError, setUsageGuardError] = useState('')
    const [usageGuard, setUsageGuard] = useState<ImportUsageGuard | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const cancelRef = useRef(false)
    const { addTask, updateTask, removeTask, cancelTask } = useImportContext()

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
        setDuplicateIndices([])
        setDuplicateCount(0)
        setUniqueCount(0)
        setCancelRequested(false)
        setShowCancelConfirm(false)
        setShowResetConfirm(false)
        setUsageGuardLoading(false)
        setUsageGuardError('')
        setUsageGuard(null)
        cancelRef.current = false
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const fetchUsageGuard = async () => {
        setUsageGuardLoading(true)
        setUsageGuardError('')

        try {
            const response = await fetch('/api/import/usage-guard')
            const result = await response.json()

            if (!response.ok) {
                throw new Error(result?.error || 'Failed to validate usage state')
            }

            setUsageGuard(result as ImportUsageGuard)
        } catch (err: any) {
            setUsageGuard(null)
            setUsageGuardError(String(err?.message || err || 'Failed to validate usage state'))
        } finally {
            setUsageGuardLoading(false)
        }
    }

    // Listen for maximize events from notification dropdown
    useEffect(() => {
        const handleMaximize = (e: any) => {
            if (e.detail.type === 'products' && e.detail.operation === 'import' && e.detail.taskId === taskId) {
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

    const processData = (data: any[]) => {
        if (!data || data.length === 0) {
            setError('No data found in file')
            return
        }

        // Helper: normalize header keys to simple uppercase tokens (remove non-alphanum)
        const normalizeKey = (k: string) => String(k || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()

        const parsedRows: ProductRow[] = data.map((row: any, rowIndex: number) => {
            // Build normalized map from normalizedKey -> value
            const normMap: Record<string, any> = {}
            Object.keys(row).forEach(k => {
                const nk = normalizeKey(k)
                normMap[nk] = row[k]
            })

            const getRaw = (...keys: string[]) => {
                for (const k of keys) {
                    const nk = normalizeKey(k)
                    if (nk in normMap) return normMap[nk]
                }
                return undefined
            }

            const parseNumber = (v: any) => {
                if (v === undefined || v === null || v === '') return undefined
                // Normalize to string and strip any non-numeric characters except dot and minus.
                // This removes currency symbols (e.g. ₹, $), commas, spaces and other noise.
                let s = String(v).trim()
                s = s.replace(/[^0-9.\-]/g, '')
                if (s === '') return undefined
                const n = Number(s)
                if (isNaN(n)) return undefined
                return n
            }

            const rawName = getRaw('ITEM', 'NAME', 'PRODUCTNAME', 'PRODUCT NAME') || ''
            const name = String(rawName).trim()

            // RATE/UNIT - sale price per unit
            const rawRate = getRaw('RATE/UNIT', 'RATE/U', 'RATEU', 'RATE', 'PRICE', 'PRICECENTS')
            let priceRupees = 0
            if (rawRate !== undefined && rawRate !== null && String(rawRate).trim() !== '') {
                const n = parseNumber(rawRate)
                if (n !== undefined) {
                    priceRupees = n
                }
            }

            // UNITS - no. of units
            const rawUnits = getRaw('UNITS', 'UINT', 'UNIT', 'UNITQUANTITY', 'UNIT QUANTITY', 'NO OF UNITS')
            const units = parseNumber(rawUnits) || 1
            
            // UNIT TYPE
            const rawUnitType = getRaw('UNITTYPE', 'UNIT TYPE', 'UNIT_TYPE', 'TYPE')
            const unitType = rawUnitType === undefined || rawUnitType === null || String(rawUnitType).trim() === '' ? '' : String(rawUnitType).trim().toUpperCase()
            
            // Combine unit quantity and type if both exist
            const unit = unitType ? `${units} ${unitType}` : String(units)

            // PURCHASE PRICE/PACK - purchase price * no. of units
            const rawPurchasePricePack = getRaw('PURCHASEPRICE/PACK', 'PURCHASEPRICE PACK', 'PURCHASEPRICEPACK', 'P/PRICE', 'PPRICE', 'PURCHASEPRICE', 'PURCHASEPRICECENTS')
            let purchasePriceRupees: number | undefined = undefined
            if (rawPurchasePricePack !== undefined && rawPurchasePricePack !== null && String(rawPurchasePricePack).trim() !== '') {
                const n = parseNumber(rawPurchasePricePack)
                if (n !== undefined) {
                    purchasePriceRupees = n
                }
            }

            // Category field
            const rawCategory = getRaw('CATEGORY', 'CAT', 'CATEGORYNAME', 'CATEGORY NAME')
            const category = rawCategory === undefined || rawCategory === null || String(rawCategory).trim() === '' ? undefined : String(rawCategory).trim()

            // LATEST BATCH NUMBER
            const rawLatestBatchNumber = getRaw('LATESTBATCHNUMBER', 'LATEST BATCH NUMBER', 'LATESTBATCH', 'BATCHNUMBER', 'BATCH NO', 'BATCH')
            const latestBatchNumber = rawLatestBatchNumber === undefined || rawLatestBatchNumber === null || String(rawLatestBatchNumber).trim() === ''
                ? undefined
                : String(rawLatestBatchNumber).trim()

            // THRESH/IN - threshold
            const rawThreshold = getRaw('THRESH/IN', 'THRESHIN', 'THRESHOLD', 'THRESH', 'MINSTOCKLEVEL', 'MIN STOCK')
            const minStockLevel = parseNumber(rawThreshold)

            // INVENTORY (FLOW) - flow inventory (calculated from purchase - sales, or provided directly)
            const rawInventoryFlow = getRaw('INVENTORY(FLOW)', 'INVENTORYFLOW', 'INVENTORY FLOW', 'INVENTORY', 'INV', 'QUANTITY', 'FLOW INVENTORY')
            const inventoryFlow = parseNumber(rawInventoryFlow)

            // ACTUAL INVENTORY - actual inventory
            const rawActualInventory = getRaw('ACTUALINVENTORY', 'ACTUAL INVENTORY', 'ACTUAL', 'ACTUALQTY')
            const actualInventory = parseNumber(rawActualInventory)

            // INVENTORY VALUE
            const rawInventoryValue = getRaw('INVENTORYVALUE', 'INVENTORY VALUE', 'INVVAL', 'INV/VAL', 'INVVALUE')
            const inventoryValue = parseNumber(rawInventoryValue)

            // PURCHASE (FLOW)
            const rawPurchaseFlow = getRaw('PURCHASE(FLOW)', 'PURCHASEFLOW', 'PURCHASE FLOW', 'PURCHASE', 'TOTALPURCHASED', 'TOTAL PURCHASED', 'TOTALPUR', 'PURCHASED')
            const totalPurchased = parseNumber(rawPurchaseFlow)

            // PURCHASE VALUE
            const rawPurchaseValue = getRaw('PURCHASEVALUE', 'PURCHASE VALUE', 'PUR/VAL', 'PURVAL')
            const purchaseValue = parseNumber(rawPurchaseValue)

            // SALES (FLOW)
            const rawSalesFlow = getRaw('SALES(FLOW)', 'SALESFLOW', 'SALES FLOW', 'SALES', 'TOTALSALES', 'TOTAL SALES', 'TOTAL_SALES', 'SALES_TOTAL')
            const totalSales = parseNumber(rawSalesFlow)

            // SALES VALUE
            const rawSalesValue = getRaw('SALESVALUE', 'SALES VALUE', 'SALE/VAL', 'SALEVAL')
            const salesValue = parseNumber(rawSalesValue)

            return {
                name,
                priceRupees,
                quantity: inventoryFlow !== undefined ? inventoryFlow : 
                         (totalPurchased !== undefined && totalSales !== undefined) ? (totalPurchased - totalSales) :
                         (totalPurchased !== undefined) ? totalPurchased : 0,
                latestBatchNumber,
                purchasePriceRupees,
                unit,
                category,
                minStockLevel: minStockLevel !== undefined ? Math.round(minStockLevel) : undefined,
                actualInventory: actualInventory !== undefined ? Math.round(actualInventory) : undefined,
                inventoryValue: inventoryValue !== undefined ? Number(inventoryValue) : undefined,
                purchaseValue: purchaseValue !== undefined ? Number(purchaseValue) : undefined,
                salesValue: salesValue !== undefined ? Number(salesValue) : undefined,
                totalPurchased: totalPurchased !== undefined ? Math.round(totalPurchased) : undefined,
                totalSales: totalSales !== undefined ? Math.round(totalSales) : undefined
            }
        })
        // Validate required fields
        const errors: string[] = []
        parsedRows.forEach((p, index) => {
            if (!p.name) errors.push(`Row ${index + 1}: Missing name`)
        })

        if (errors.length > 0) {
            setError(errors.slice(0, 5).join('\n') + (errors.length > 5 ? `\n...and ${errors.length - 5} more errors` : ''))
            return
        }

        setParsedData(parsedRows)
        setPreviewData(parsedRows.slice(0, 10))
        setDuplicateIndices([])
        setDuplicateCount(0)
        setUniqueCount(0)
        setStep('preview')
    }

    const loadDefaultProductsIntoFlow = async (reset: boolean = false) => {
        setPopulatingDefaults(true)
        setError('')
        setPopulateDefaultsMessage(null)

        try {
            const response = await fetch('/api/default-products/rows')
            const result = await response.json()

            if (!response.ok) {
                throw new Error(result?.error || 'Failed to load default products')
            }

            const rows = Array.isArray(result?.products) ? result.products : []
            if (rows.length === 0) {
                throw new Error('No default products found to import')
            }

            setParsedData(rows)
            setPreviewData(rows.slice(0, 10))
            setDuplicateIndices([])
            setDuplicateCount(0)
            setUniqueCount(0)
            setDefaultFlowMode(reset ? 'reset' : 'populate')
            setDefaultTemplateVersion(Number(result?.latestVersion) || null)
            setImportMode(reset ? 'upsert' : 'create')
            setStep('preview')
            setPopulateDefaultsMessage({
                type: 'success',
                text: `Loaded ${rows.length} default products (v${result?.latestVersion || '?'}) into import flow. Continue with Check & Continue.`
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
        setStep('checking')
        setError('')

        try {
            const productsToCheck = parsedData.map((product, index) => ({
                name: product.name,
                index
            }))

            const response = await fetch('/api/products/check-duplicates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ products: productsToCheck })
            })

            if (!response.ok) {
                throw new Error('Failed to check for duplicates')
            }

            const result = await response.json()

            const duplicateIndices = result.duplicateIndices || []
            const duplicateTotal = duplicateIndices.length || 0

            setDuplicateIndices(duplicateIndices)
            setDuplicateCount(duplicateTotal)
            setUniqueCount(result.uniqueIndices?.length || 0)
            setImportMode(duplicateTotal > 0 ? 'upsert' : 'create')
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
        setProgressPhase(importMode === 'upsert' ? 'update' : 'import')
        setCancelRequested(false)
        cancelRef.current = false

        const dataToImport = skipDuplicates
            ? parsedData.filter((_, index) => !duplicateIndices.includes(index))
            : parsedData

        const id = addTask({
            type: 'products',
            operation: 'import',
            status: 'importing',
            progress: { current: 0, total: dataToImport.length }
        })
        setTaskId(id)

        try {
            const total = dataToImport.length
            setImportProgress({ current: 0, total })

            const BATCH_SIZE = 100
            const batches = []
            for (let i = 0; i < dataToImport.length; i += BATCH_SIZE) {
                batches.push(dataToImport.slice(i, i + BATCH_SIZE))
            }

            let successCount = 0
            const allErrors: any[] = []

            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
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
                
                const response = await fetch('/api/products/bulk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        products: batch,
                        mode: importMode
                    })
                })

                if (!response.ok) {
                    const error = await response.json()
                    throw new Error(`Failed to import products: ${error.error || 'Unknown error'}`)
                }

                const result = await response.json()
                
                if (result.errors && result.errors.length > 0) {
                    allErrors.push(...result.errors)
                }
                
                successCount += result.count || 0

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

            if (defaultFlowMode) {
                await fetch('/api/default-templates/mark-synced', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        templateType: 'product',
                        version: defaultTemplateVersion || undefined
                    })
                })
            }

            setImportSummary({ success: successCount, errors: allErrors.length })
            setStep('success')
            setImporting(false)
            
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

            const response = await fetch('/api/default-products/populate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reset: true })
            })

            const result = await response.json()
            if (!response.ok) {
                throw new Error(result?.error || 'Failed to reset and populate default products')
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
            setError(err.message || 'Failed to reset and populate default products')
            setImporting(false)
            setStep('confirm')
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

        await loadDefaultProductsIntoFlow(reset)
    }

    const handleMinimize = () => {
        setIsMinimized(true)
    }

    const handleMaximize = () => {
        setIsMinimized(false)
    }

    // If minimized, show nothing (task is tracked in notification dropdown)
    if (isMinimized) return null

    if (!isOpen) return null

    const pct = importProgress.total > 0 ? Math.round((importProgress.current / importProgress.total) * 100) : 0
    const steps = ['Upload', 'Preview', 'Confirm', 'Import']
    const stepIndex = step === 'select' ? 0 : step === 'preview' ? 1 : step === 'checking' ? 2 : step === 'confirm' ? 2 : step === 'importing' ? 3 : step === 'success' ? 3 : 1
    const isUpdateMode = importMode === 'upsert'
    const progressTitle = progressPhase === 'delete'
        ? 'Deleting Existing Products'
        : progressPhase === 'reset'
            ? 'Resetting Product Defaults'
            : isUpdateMode
                ? 'Updating Products'
                : 'Importing Products'
    const progressSubtitle = progressPhase === 'delete'
        ? 'Removing old default-matching products before repopulating'
        : progressPhase === 'reset'
            ? `${importProgress.current} of ${importProgress.total} default batches processed`
            : `${importProgress.current} of ${importProgress.total} products processed`
    const successTitle = defaultFlowMode === 'reset'
        ? 'Reset Complete!'
        : isUpdateMode
            ? 'Update Complete!'
            : 'Import Complete!'
    const successSubtitle = defaultFlowMode === 'reset'
        ? 'Your default products have been refreshed'
        : isUpdateMode
            ? 'Your products have been updated with the latest file data'
            : 'Your products have been saved'
    const successCountLabel = defaultFlowMode === 'reset'
        ? 'Reset'
        : isUpdateMode
            ? 'Applied'
            : 'Imported'
    const resetDisabledByUsage = usageGuardLoading || !usageGuard?.canResetAndPopulate

    const modalContent = (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[99999] p-4">
            <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-200/60 dark:border-gray-700/60">

                {/* Decorative top bar */}
                <div className="h-1 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-400 rounded-t-2xl" />

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/20">
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-gray-900 dark:text-white leading-tight">Import Products</h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">CSV · XLSX · JSON</p>
                        </div>
                    </div>

                    {/* Step indicators */}
                    <div className="hidden sm:flex items-center gap-1.5 mr-4">
                        {steps.map((s, i) => (
                            <div key={s} className="flex items-center gap-1.5">
                                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                                    i < stepIndex ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                                    i === stepIndex ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/30' :
                                    'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600'
                                }`}>
                                    {i < stepIndex ? (
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    ) : (
                                        <span className="w-3.5 h-3.5 flex items-center justify-center rounded-full border border-current text-[9px]">{i + 1}</span>
                                    )}
                                    {s}
                                </div>
                                {i < steps.length - 1 && <div className={`w-4 h-px ${i < stepIndex ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-gray-200 dark:bg-gray-700'}`} />}
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
                                        <p className="text-xs text-blue-700/90 dark:text-blue-300/90 mt-0.5">Copy latest default product template rows into this clinic without doctor-specific assignment.</p>
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

                            <ConfirmationModal
                                isOpen={showResetConfirm}
                                title="Reset And Populate Products"
                                message="This will overwrite existing default-matching products in this clinic and repopulate the latest defaults. Continue?"
                                confirmText="Reset & Populate"
                                cancelText="Cancel"
                                type="warning"
                                onCancel={() => setShowResetConfirm(false)}
                                onConfirm={() => {
                                    setShowResetConfirm(false)
                                    handlePopulateDefaults(true)
                                }}
                            />

                            {/* Drop zone */}
                            <div className="relative">
                                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.json" onChange={handleFileSelect} className="hidden" id="product-file-input" />
                                <label
                                    htmlFor="product-file-input"
                                    className="group flex flex-col items-center justify-center gap-3 w-full py-12 rounded-xl border-2 border-dashed transition-all border-gray-200 dark:border-gray-700 hover:border-emerald-400 dark:hover:border-emerald-500 bg-gray-50/50 dark:bg-gray-800/30 hover:bg-emerald-50/40 dark:hover:bg-emerald-900/10 cursor-pointer">
                                    <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm transition-all bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 group-hover:from-emerald-200 group-hover:to-teal-200">
                                        <svg className="w-7 h-7 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                    </div>
                                    <div className="text-center">
                                        <p className="font-semibold transition-colors text-gray-700 dark:text-gray-200 group-hover:text-emerald-700 dark:group-hover:text-emerald-300">Click to choose a file</p>
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
                                        <div><code className="px-1.5 py-0.5 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded text-[10px] font-mono">name</code> <span className="text-gray-500 dark:text-gray-400">Product/Medicine name</span></div>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1.5 mb-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span className="font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide text-[10px]">Optional</span></div>
                                        <div className="space-y-1 text-gray-500 dark:text-gray-400">
                                            {[['price','Selling price (₹)'],['purchasePrice','Cost price'],['quantity','Stock quantity'],['unit / unitQuantity','Unit amount'],['unitType','ML, GM, TABS, CAPS…'],['category','Product category'],['latestBatchNumber','Most recent batch number']].map(([f,d]) => (
                                                <div key={f}><code className="px-1 py-0.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded text-[10px] font-mono">{f}</code> <span>{d}</span></div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-amber-50/40 dark:bg-amber-900/10 text-xs text-amber-700 dark:text-amber-400">
                                    • Duplicate names are skipped by default &nbsp;·&nbsp; Missing prices default to ₹0.00
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                <a href="/templates/product_import_template.csv" download className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-medium">
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
                                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/60 dark:border-emerald-800/60">
                                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                                    <div>
                                        <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Products found</div>
                                        <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300 leading-tight">{parsedData.length}</div>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Import Mode</span>
                                </div>
                                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {[
                                        { val: 'create', label: 'Create new only', desc: 'Skip products that already exist', icon: 'M12 4v16m8-8H4' },
                                        { val: 'upsert', label: 'Update existing', desc: 'Overwrite matching products with new data', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' }
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

                            <div className="rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                                    <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Data Preview</span>
                                    <span className="text-xs text-gray-400 dark:text-gray-500">First 10 rows</span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="min-w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-gray-100 dark:border-gray-800">
                                                {['Name','Category','Batch','Price','Qty','Unit'].map(h => (
                                                    <th key={h} className="px-3 py-2.5 text-left font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px]">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800/80">
                                            {previewData.map((p, i) => (
                                                <tr key={i} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors">
                                                    <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-200 max-w-[160px] truncate">{p.name}</td>
                                                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{p.category || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{p.latestBatchNumber || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
                                                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">₹{(Number(p.priceRupees) || 0).toFixed(2)}</td>
                                                    <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{p.quantity}</td>
                                                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{p.unit || <span className="text-gray-300 dark:text-gray-600">—</span>}</td>
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
                            <div className="w-12 h-12 rounded-full border-4 border-emerald-200 dark:border-emerald-800 border-t-emerald-600 dark:border-t-emerald-400 animate-spin" />
                            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Checking for duplicates…</p>
                        </div>
                    )}

                    {/* ── STEP: CONFIRM ── */}
                    {step === 'confirm' && (
                        <div className="p-6 space-y-5">
                            <div className="flex flex-wrap gap-3">
                                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/60 dark:border-emerald-800/60">
                                    <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <div>
                                        <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Unique</div>
                                        <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300 leading-tight">{uniqueCount}</div>
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
                                    <span>{isUpdateMode ? `${duplicateCount} product names already exist and will be updated if you continue with update mode.` : `${duplicateCount} product names already exist. Choose how to handle them below.`}</span>
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
                                    <circle cx="48" cy="48" r="40" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray={`${2 * Math.PI * 40}`} strokeDashoffset={`${2 * Math.PI * 40 * (1 - pct / 100)}`} strokeLinecap="round" className="text-emerald-600 dark:text-emerald-400 transition-all duration-500" />
                                </svg>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-xl font-bold text-gray-900 dark:text-white">{pct}%</span>
                                </div>
                            </div>
                            <div className="text-center">
                                <h3 className="text-base font-bold text-gray-900 dark:text-white">{progressTitle}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{progressSubtitle}</p>
                            </div>
                            <div className="w-full max-w-sm">
                                <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                    <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
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
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
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
                            {step !== 'select' ? <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>Back</> : 'Cancel'}
                        </button>
                        <div className="flex gap-2">
                            {step === 'preview' && (
                                <button onClick={checkDuplicates} className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-emerald-500/20 transition-all">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    Check & Continue
                                </button>
                            )}
                            {step === 'confirm' && (
                                <>
                                    {defaultFlowMode === 'populate' ? (
                                        <button onClick={() => handleImport(!isUpdateMode)} className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-emerald-500/20 transition-all">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                            {isUpdateMode ? `Update ${parsedData.length} Products` : `Populate ${uniqueCount} Unique`}
                                        </button>
                                    ) : defaultFlowMode === 'reset' ? (
                                        <button onClick={handleResetAndPopulateDefaults} disabled={resetDisabledByUsage} className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-amber-500/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9M9 9H4m16 11v-5h-.582m0 0a8.003 8.003 0 01-15.357-2M15 15h5" /></svg>
                                            Reset & Update {parsedData.length}
                                        </button>
                                    ) : (
                                        <>
                                            {duplicateCount > 0 && (
                                                <button onClick={() => handleImport(true)} className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold rounded-lg transition-all">
                                                    {isUpdateMode ? `Create ${uniqueCount} New` : `Import ${uniqueCount} Unique`}
                                                </button>
                                            )}
                                            <button onClick={() => handleImport(false)} className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-sm font-semibold rounded-lg shadow-sm shadow-emerald-500/20 transition-all">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                                {isUpdateMode ? `Update All ${parsedData.length}` : `Import All ${parsedData.length}`}
                                            </button>
                                        </>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Cancel Confirm Dialog */}
            {showCancelConfirm && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100000]">
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

    return createPortal(modalContent, document.body)
}
