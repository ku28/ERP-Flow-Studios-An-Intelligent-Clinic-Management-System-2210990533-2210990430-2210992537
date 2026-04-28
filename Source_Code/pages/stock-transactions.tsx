import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'
import LoadingModal from '../components/LoadingModal'
import ToastNotification from '../components/ToastNotification'
import CustomSelect from '../components/CustomSelect'
import { useToast } from '../hooks/useToast'
import { useDataCache } from '../contexts/DataCacheContext'
import * as XLSX from 'xlsx'
import { isBasicPlan } from '../lib/subscription'
import StandardFeatureBadge from '../components/StandardFeatureBadge'
import ThemedScrollArea from '../components/ThemedScrollArea'

export default function StockTransactionsPage() {
    const router = useRouter()
    const [transactions, setTransactions] = useState<any[]>([])
    const [products, setProducts] = useState<any[]>([])
    const [filterProduct, setFilterProduct] = useState('')
    const [filterType, setFilterType] = useState('')
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isAnimating, setIsAnimating] = useState(false)
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [deleteProgress, setDeleteProgress] = useState({ current: 0, total: 0 })
    const [isDeleteMinimized, setIsDeleteMinimized] = useState(false)
    const [confirmModal, setConfirmModal] = useState<{ open: boolean; id?: number; deleteMultiple?: boolean; message?: string }>({ open: false })
    const [confirmModalAnimating, setConfirmModalAnimating] = useState(false)
    const [confirmStep, setConfirmStep] = useState<1 | 2>(1)
    
    // Set-based state for multi-select
    const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<number>>(new Set())
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
    
    // Export and sorting state
    const [showExportDropdown, setShowExportDropdown] = useState(false)
    const [sortField, setSortField] = useState<string>('createdAt')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
    const [isFilterProductOpen, setIsFilterProductOpen] = useState(false)
    const [isFilterTypeOpen, setIsFilterTypeOpen] = useState(false)
    const [isModalProductOpen, setIsModalProductOpen] = useState(false)
    const [isModalTransactionTypeOpen, setIsModalTransactionTypeOpen] = useState(false)
    
    const { toasts, removeToast, showSuccess, showError, showInfo } = useToast()
    const { getCache, setCache } = useDataCache()
    
    const [form, setForm] = useState({
        productId: '',
        transactionType: 'ADJUSTMENT',
        quantity: '',
        unitPrice: '',
        notes: '',
        performedBy: ''
    })
    
    const { user } = useAuth()
    const isBasicSubscription = isBasicPlan(user?.clinic?.subscriptionPlan)

    useEffect(() => {
        // Check cache first
        const cachedTransactions = getCache<any[]>('stockTransactions')
        const cachedProducts = getCache<any[]>('products')
        
        if (cachedTransactions) {
            setTransactions(cachedTransactions)
        }
        if (cachedProducts) {
            setProducts(cachedProducts)
        }
        
        // Fetch in background
        fetchInitialData()
        
        // Cleanup on unmount
        return () => {
            setTransactions([])
            setProducts([])
        }
    }, [])

    const fetchInitialData = async () => {
        setLoading(true)
        try {
            await Promise.all([
                fetchTransactions(),
                fetchProducts()
            ])
        } finally {
            setLoading(false)
        }
    }

    const fetchTransactions = async (productId?: string, type?: string) => {
        let url = '/api/stock-transactions?limit=100'
        if (productId) url += `&productId=${productId}`
        if (type) url += `&type=${type}`
        
        const response = await fetch(url)
        const data = await response.json()
        const transactionsData = Array.isArray(data) ? data : []
        setTransactions(transactionsData)
        setCache('stockTransactions', transactionsData)
    }

    const fetchProducts = async () => {
        const response = await fetch('/api/products/public')
        const data = await response.json()
        setProducts(Array.isArray(data) ? data : [])
    }

    useEffect(() => {
        fetchTransactions(filterProduct, filterType)
    }, [filterProduct, filterType])

    async function handleSubmit(e: any) {
        e.preventDefault()
        setSubmitting(true)
        try {
            const payload = {
                productId: Number(form.productId),
                transactionType: form.transactionType,
                quantity: Number(form.quantity),
                unitPrice: form.unitPrice ? Number(form.unitPrice) : 0,
                notes: form.notes || null,
                performedBy: form.performedBy || user?.name || 'System'
            }
            
            const response = await fetch('/api/stock-transactions', { 
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(payload) 
            })
            
            if (response.ok) {
                await fetchTransactions(filterProduct, filterType)
                await fetchProducts() // Refresh to get updated quantities
                closeModal()
                showSuccess('Inventory movement recorded successfully!')
            } else {
                const error = await response.json()
                showError('Failed: ' + (error.error || 'Unknown error'))
            }
        } catch (error) {
            showError('Failed to save transaction')
        } finally {
            setSubmitting(false)
        }
    }

    function closeModal() {
        setIsAnimating(false)
        document.body.style.overflow = 'unset'
        setTimeout(() => {
            setIsModalOpen(false)
            setForm({
                productId: '',
                transactionType: 'ADJUSTMENT',
                quantity: '',
                unitPrice: '',
                notes: '',
                performedBy: ''
            })
        }, 200)
    }

    function getTransactionIcon(type: string) {
        switch (type) {
            case 'IN': return '📦'
            case 'OUT': return '📤'
            case 'ADJUSTMENT': return '🔧'
            case 'RETURN': return '↩️'
            default: return '📊'
        }
    }

    function getTransactionColor(type: string) {
        switch (type) {
            case 'IN': return 'bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-200'
            case 'OUT': return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
            case 'ADJUSTMENT': return 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
            case 'RETURN': return 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
            default: return 'bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200'
        }
    }

    // Selection functions
    function toggleSelectTransaction(id: number) {
        const newSelected = new Set(selectedTransactionIds)
        if (newSelected.has(id)) {
            newSelected.delete(id)
        } else {
            newSelected.add(id)
        }
        setSelectedTransactionIds(newSelected)
    }

    function toggleSelectAll() {
        const filtered = getFilteredAndSortedTransactions()
        if (selectedTransactionIds.size === filtered.length && filtered.length > 0) {
            setSelectedTransactionIds(new Set())
        } else {
            setSelectedTransactionIds(new Set(filtered.map(t => t.id)))
        }
    }

    function toggleExpandRow(id: number) {
        const newExpanded = new Set(expandedRows)
        if (newExpanded.has(id)) {
            newExpanded.delete(id)
        } else {
            newExpanded.add(id)
        }
        setExpandedRows(newExpanded)
    }

    // Delete functions
    function openDeleteConfirm(id?: number) {
        setConfirmStep(1)
        if (id) {
            setConfirmModal({ open: true, id, message: 'Are you sure you want to delete this transaction? This action cannot be undone.' })
        } else if (selectedTransactionIds.size > 0) {
            setConfirmModal({ 
                open: true, 
                deleteMultiple: true, 
                message: `Are you sure you want to delete ${selectedTransactionIds.size} selected transaction(s)? This action cannot be undone.` 
            })
        }
        setTimeout(() => setConfirmModalAnimating(true), 10)
    }

    function closeConfirmModal() {
        setConfirmModalAnimating(false)
        setTimeout(() => {
            setConfirmModal({ open: false })
            setConfirmStep(1)
        }, 300)
    }

    async function handleConfirmDelete() {
        if (!confirmModal.id && !confirmModal.deleteMultiple) {
            closeConfirmModal()
            return
        }
        
        closeConfirmModal()
        setDeleting(true)
        
        try {
            if (confirmModal.deleteMultiple) {
                // Delete multiple transactions with progress tracking
                const idsArray = Array.from(selectedTransactionIds)
                const total = idsArray.length
                setDeleteProgress({ current: 0, total })
                
                // Delete in chunks
                const CHUNK_SIZE = 100
                let completed = 0
                
                for (let i = 0; i < idsArray.length; i += CHUNK_SIZE) {
                    const chunk = idsArray.slice(i, i + CHUNK_SIZE)
                    await fetch('/api/stock-transactions', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ ids: chunk })
                    })
                    
                    completed += chunk.length
                    setDeleteProgress({ current: completed, total })
                }
                
                await fetchTransactions(filterProduct, filterType)
                await fetchProducts()
                setSelectedTransactionIds(new Set())
                showSuccess(`Successfully deleted ${completed} transaction(s)`)
                setDeleteProgress({ current: 0, total: 0 })
            } else if (confirmModal.id) {
                // Single delete
                const res = await fetch('/api/stock-transactions', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: confirmModal.id })
                })
                
                if (!res.ok) throw new Error('Delete failed')
                
                await fetchTransactions(filterProduct, filterType)
                await fetchProducts()
                showSuccess('Transaction deleted successfully')
            }
        } catch (error) {
            showError('Failed to delete transaction(s)')
        } finally {
            setDeleting(false)
            setIsDeleteMinimized(false)
        }
    }

    function getFilteredAndSortedTransactions() {
        let filtered = transactions

        // Apply filters if needed (filterProduct and filterType are applied server-side via API)
        
        // Sort
        filtered = [...filtered].sort((a, b) => {
            let aVal = a[sortField]
            let bVal = b[sortField]

            // Handle different data types
            if (sortField === 'createdAt') {
                aVal = new Date(aVal).getTime()
                bVal = new Date(bVal).getTime()
            } else if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase()
                bVal = bVal?.toLowerCase() || ''
            }

            if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1
            if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1
            return 0
        })

        return filtered
    }

    // Export functions
    function exportData(format: 'csv' | 'json' | 'xlsx') {
        if (isBasicSubscription) {
            showInfo('Export is available in Standard plan.')
            router.push('/upgrade')
            return
        }

        const dataToExport = selectedTransactionIds.size > 0
            ? transactions.filter(t => selectedTransactionIds.has(t.id))
            : getFilteredAndSortedTransactions()

        const exportData = dataToExport.map(t => {
            const product = products.find(p => p.id === t.productId)
            return {
                'Date': new Date(t.createdAt).toLocaleString(),
                'Product': product?.name || 'Unknown',
                'Type': t.transactionType,
                'Quantity': t.quantity,
                'Unit Price': t.unitPrice || 0,
                'Total Value': (t.quantity * (t.unitPrice || 0)).toFixed(2),
                'Performed By': t.performedBy || 'System',
                'Notes': t.notes || '',
                'Reference': t.referenceType || ''
            }
        })

        if (format === 'csv') {
            exportToCSV(exportData)
        } else if (format === 'json') {
            exportToJSON(exportData)
        } else if (format === 'xlsx') {
            exportToExcel(exportData)
        }

        setShowExportDropdown(false)
        showSuccess(`Exported ${exportData.length} transaction(s) as ${format.toUpperCase()}!`)
    }

    const exportToCSV = (data: any[]) => {
        if (data.length === 0) {
            showError('No data to export')
            return
        }

        const headers = Object.keys(data[0])
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => {
                const value = row[header]?.toString() || ''
                return value.includes(',') ? `"${value}"` : value
            }).join(','))
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `stock_transactions_${new Date().toISOString().split('T')[0]}.csv`
        link.click()
    }

    const exportToJSON = (data: any[]) => {
        if (data.length === 0) {
            showError('No data to export')
            return
        }

        const jsonContent = JSON.stringify(data, null, 2)
        const blob = new Blob([jsonContent], { type: 'application/json' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `stock_transactions_${new Date().toISOString().split('T')[0]}.json`
        link.click()
    }

    const exportToExcel = (data: any[]) => {
        if (data.length === 0) {
            showError('No data to export')
            return
        }

        const worksheet = XLSX.utils.json_to_sheet(data)
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Stock Transactions')
        
        // Auto-size columns
        const maxWidth = 50
        const colWidths = Object.keys(data[0]).map(key => {
            const maxLen = Math.max(
                key.length,
                ...data.map(row => (row[key]?.toString() || '').length)
            )
            return { wch: Math.min(maxLen + 2, maxWidth) }
        })
        worksheet['!cols'] = colWidths

        XLSX.writeFile(workbook, `stock_transactions_${new Date().toISOString().split('T')[0]}.xlsx`)
    }

    const filteredTransactions = getFilteredAndSortedTransactions()

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                        Inventory History
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Track all stock movements and adjustments</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Export Dropdown */}
                    {user && (
                        <div className="relative">
                        <button 
                            onClick={() => setShowExportDropdown(!showExportDropdown)}
                            className="relative px-2 sm:px-4 py-2.5 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-lg shadow-lg shadow-blue-500/30 flex items-center gap-2 transition-all duration-200 font-medium"
                            title={selectedTransactionIds.size > 0 ? `Export ${selectedTransactionIds.size} selected` : 'Export All'}
                            aria-label={selectedTransactionIds.size > 0 ? `Export ${selectedTransactionIds.size} selected` : 'Export All'}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="hidden sm:inline">{selectedTransactionIds.size > 0 ? `Export (${selectedTransactionIds.size})` : 'Export All'}</span>
                            {isBasicSubscription && (
                                <>
                                    <span className="hidden sm:block"><StandardFeatureBadge /></span>
                                    <span className="sm:hidden"><StandardFeatureBadge mobile /></span>
                                </>
                            )}
                        </button>                            {showExportDropdown && (
                                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 z-[9999] overflow-hidden">
                                    <button
                                        onClick={() => exportData('csv')}
                                        className="w-full px-4 py-3 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-3 transition-colors border-b border-gray-100 dark:border-gray-700"
                                    >
                                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <div>
                                            <div className="font-medium text-gray-900 dark:text-gray-100">Export CSV</div>
                                            <div className="text-xs text-gray-500">Comma-separated</div>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => exportData('json')}
                                        className="w-full px-4 py-3 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-3 transition-colors border-b border-gray-100 dark:border-gray-700"
                                    >
                                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                        </svg>
                                        <div>
                                            <div className="font-medium text-gray-900 dark:text-gray-100">Export JSON</div>
                                            <div className="text-xs text-gray-500">For developers</div>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => exportData('xlsx')}
                                        className="w-full px-4 py-3 text-left hover:bg-blue-50 dark:hover:bg-blue-900/20 flex items-center gap-3 transition-colors"
                                    >
                                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        </svg>
                                        <div>
                                            <div className="font-medium text-gray-900 dark:text-gray-100">Export Excel</div>
                                            <div className="text-xs text-gray-500">XLSX format</div>
                                        </div>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    <button 
                        onClick={() => {
                            setIsModalOpen(true)
                            document.body.style.overflow = 'hidden'
                            setIsAnimating(false)
                            setTimeout(() => setIsAnimating(true), 10)
                        }}
                        className="px-4 py-2.5 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-lg shadow-lg flex items-center gap-2 transition-all duration-200 font-medium"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Manual Adjustment
                    </button>
                </div>
            </div>

            {/* Bulk Action Bar */}
            {selectedTransactionIds.size > 0 && (
                <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-900/20 dark:to-sky-900/20 border border-blue-200/30 dark:border-blue-700/30 rounded-lg">
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                            {selectedTransactionIds.size} transaction(s) selected
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => openDeleteConfirm()}
                                disabled={!user}
                                className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Delete Selected
                            </button>
                            <button
                                onClick={() => setSelectedTransactionIds(new Set())}
                                className="px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors border border-gray-300 dark:border-gray-600"
                            >
                                Clear Selection
                            </button>
                        </div>
                    </div>
                </div>
            )}

                {/* Info Card */}
                <div className="card mb-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                    <div className="flex items-start gap-3">
                        <div className="text-3xl">ℹ️</div>
                        <div>
                            <h3 className="font-semibold mb-1 text-blue-900 dark:text-blue-100">About Inventory History</h3>
                            <p className="text-sm text-blue-800 dark:text-blue-200">
                                This page shows all inventory movements. Transactions are automatically created when you receive purchase orders or create customer invoices. 
                                Use "Manual Adjustment" to correct stock levels, record returns, or make other inventory changes.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Filter Bar */}
                <div className="relative rounded-xl border border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-br from-white via-blue-50 to-sky-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 shadow-lg shadow-blue-500/10 p-4 mb-4">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                    <div className="relative flex items-center gap-3 flex-wrap">
                        <div className={`min-w-[200px] ${isFilterProductOpen ? 'relative z-[10000]' : 'relative z-0'}`}>
                            <CustomSelect
                                value={filterProduct}
                                onChange={(value) => setFilterProduct(value)}
                                options={[
                                    { value: '', label: 'All Products' },
                                    ...products.map(p => ({
                                        value: p.id.toString(),
                                        label: p.name
                                    }))
                                ]}
                                placeholder="All Products"
                                onOpenChange={setIsFilterProductOpen}
                            />
                        </div>
                        <div className={`min-w-[180px] ${isFilterTypeOpen ? 'relative z-[10000]' : 'relative z-0'}`}>
                            <CustomSelect
                                value={filterType}
                                onChange={(value) => setFilterType(value)}
                                options={[
                                    { value: '', label: 'All Types' },
                                    { value: 'IN', label: 'Stock In' },
                                    { value: 'OUT', label: 'Stock Out' },
                                    { value: 'ADJUSTMENT', label: 'Adjustments' },
                                    { value: 'RETURN', label: 'Returns' }
                                ]}
                                placeholder="All Types"
                                onOpenChange={setIsFilterTypeOpen}
                            />
                        </div>
                        {(filterProduct || filterType) && (
                            <button
                                onClick={() => {
                                    setFilterProduct('')
                                    setFilterType('')
                                }}
                                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                            >
                                Clear Filters
                            </button>
                        )}
                    </div>
                </div>

                {/* Manual Adjustment Modal */}
                {isModalOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
                        <div className="relative overflow-hidden rounded-2xl border border-purple-200/30 dark:border-purple-700/30 bg-gradient-to-br from-white via-purple-50/30 to-pink-50/20 dark:from-gray-900 dark:via-purple-950/20 dark:to-gray-900 shadow-lg shadow-purple-500/20 backdrop-blur-sm max-w-2xl w-full p-6">
                            <div className="absolute inset-0 bg-gradient-to-br from-purple-400/5 via-transparent to-pink-500/5 pointer-events-none"></div>
                            {/* Header */}
                            <div className="relative flex items-center justify-between mb-6">
                                <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400">Manual Stock Adjustment</h2>
                                <button
                                    onClick={closeModal}
                                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none"
                                >
                                    ×
                                </button>
                            </div>

                            {/* Form Content */}
                            <form onSubmit={handleSubmit}>
                                <div className="space-y-4">
                                    <div className={isModalProductOpen ? 'relative z-[10000]' : 'relative z-0'}>
                                        <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Product *</label>
                                        <CustomSelect
                                            value={form.productId}
                                            onChange={(value) => setForm({...form, productId: value})}
                                            options={products.map(p => {
                                                const unitParts = p.unit ? String(p.unit).trim().split(/\s+/) : []
                                                const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                                                const flowQty = p.quantity || 0
                                                const actualQty = unitQuantity > 0 ? Math.floor(flowQty / unitQuantity) : 0
                                                return {
                                                    value: p.id.toString(),
                                                    label: `${p.name} (Current: ${actualQty.toFixed(1)} (${flowQty.toFixed(1)}))`
                                                }
                                            })}
                                            placeholder="Select Product"
                                            required
                                            onOpenChange={setIsModalProductOpen}
                                        />
                                    </div>

                                    <div className={isModalTransactionTypeOpen ? 'relative z-[10000]' : 'relative z-0'}>
                                        <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Transaction Type *</label>
                                        <CustomSelect
                                            value={form.transactionType}
                                            onChange={(value) => setForm({...form, transactionType: value})}
                                            options={[
                                                { value: 'ADJUSTMENT', label: 'Adjustment (Correction)' },
                                                { value: 'IN', label: 'Stock In (Add Stock)' },
                                                { value: 'OUT', label: 'Stock Out (Remove Stock)' },
                                                { value: 'RETURN', label: 'Return (Customer Return)' }
                                            ]}
                                            placeholder="Select transaction type"
                                            required
                                            onOpenChange={setIsModalTransactionTypeOpen}
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Quantity *</label>
                                            <input
                                                type="number"
                                                required
                                                value={form.quantity}
                                                onChange={(e) => setForm({...form, quantity: e.target.value})}
                                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                                placeholder="0"
                                                min="0"
                                                step="1"
                                            />
                                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                                                {form.transactionType === 'IN' || form.transactionType === 'RETURN' 
                                                    ? 'This will be added to current stock'
                                                    : 'This will be subtracted from current stock'}
                                            </p>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Unit Price (₹)</label>
                                            <input
                                                type="number"
                                                value={form.unitPrice}
                                                onChange={(e) => setForm({...form, unitPrice: e.target.value})}
                                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                                placeholder="0.00"
                                                min="0"
                                                step="0.01"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Performed By</label>
                                        <input
                                            type="text"
                                            value={form.performedBy}
                                            onChange={(e) => setForm({...form, performedBy: e.target.value})}
                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                            placeholder={user?.name || 'System'}
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Notes *</label>
                                        <textarea
                                            required
                                            value={form.notes}
                                            onChange={(e) => setForm({...form, notes: e.target.value})}
                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                            rows={3}
                                            placeholder="Reason for this transaction (e.g., 'Damaged goods', 'Stock count correction', 'Customer return')"
                                        />
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                                    <button
                                        type="button"
                                        onClick={closeModal}
                                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={!user}
                                        className="px-4 py-2 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Record Transaction
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Transactions Timeline */}
                <div className="relative rounded-xl border border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-br from-white via-blue-50 to-sky-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 shadow-lg shadow-blue-500/10 p-4 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                    <div className="relative">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold flex items-center gap-3">
                            <label className="relative group/checkbox cursor-pointer flex-shrink-0">
                                <input
                                    type="checkbox"
                                    checked={selectedTransactionIds.size === filteredTransactions.length && filteredTransactions.length > 0}
                                    onChange={toggleSelectAll}
                                    className="peer sr-only"
                                />
                                <div className="w-6 h-6 border-2 border-sky-400 dark:border-sky-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-sky-500 peer-checked:to-blue-600 peer-checked:border-sky-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-sky-500/50 group-hover/checkbox:border-sky-500 group-hover/checkbox:scale-110">
                                    <svg className="w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <div className="absolute inset-0 rounded-md bg-sky-400 opacity-0 peer-checked:opacity-20 blur-md transition-opacity duration-200 pointer-events-none"></div>
                            </label>
                            <span className="font-bold text-gray-900 dark:text-gray-100">Transaction Records {selectedTransactionIds.size > 0 && <span className="px-2 py-0.5 ml-2 bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-400 rounded-full text-xs font-bold">({selectedTransactionIds.size} selected)</span>}</span>
                        </h3>
                        <span className="badge">
                            {filteredTransactions.length} transactions
                        </span>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mb-4"></div>
                            <p className="text-muted">Loading transactions...</p>
                        </div>
                    ) : filteredTransactions.length === 0 ? (
                        <div className="text-center py-8 text-muted">
                            <p className="text-lg mb-2">
                                {filterProduct || filterType ? 'No transactions match your filters' : 'No transactions yet'}
                            </p>
                            <p className="text-sm">
                                Transactions will appear here when you receive purchase orders or create invoices
                            </p>
                        </div>
                    ) : (
                        <ThemedScrollArea className="space-y-2 max-h-[44rem] pr-1">
                            {filteredTransactions.map(txn => (
                                <div key={txn.id} className={`border dark:border-gray-700 rounded-lg p-3 sm:p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${selectedTransactionIds.has(txn.id) ? 'ring-2 ring-sky-500 bg-sky-50/30 dark:bg-sky-950/30' : ''}`}>
                                    <div className="flex items-start gap-2 sm:gap-4">
                                        {/* Checkbox */}
                                        <label className="relative group/checkbox cursor-pointer flex-shrink-0 mt-1">
                                            <input
                                                type="checkbox"
                                                checked={selectedTransactionIds.has(txn.id)}
                                                onChange={() => toggleSelectTransaction(txn.id)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="peer sr-only"
                                            />
                                            <div className="w-5 h-5 sm:w-6 sm:h-6 border-2 border-sky-400 dark:border-sky-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-sky-500 peer-checked:to-blue-600 peer-checked:border-sky-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-sky-500/50 group-hover/checkbox:border-sky-500 group-hover/checkbox:scale-110">
                                                <svg className="w-3 h-3 sm:w-4 sm:h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                            <div className="absolute inset-0 rounded-md bg-sky-400 opacity-0 peer-checked:opacity-20 blur-md transition-opacity duration-200 pointer-events-none"></div>
                                        </label>
                                        
                                        {/* Icon */}
                                        <div className="text-2xl sm:text-3xl flex-shrink-0">
                                            {getTransactionIcon(txn.transactionType)}
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4 mb-2">
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-semibold text-base sm:text-lg mb-1 truncate">
                                                        {txn.product?.name || 'Unknown Product'}
                                                    </h4>
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className={`px-2 py-1 text-xs rounded font-semibold ${getTransactionColor(txn.transactionType)}`}>
                                                            {txn.transactionType}
                                                        </span>
                                                        {txn.referenceType && (
                                                            <span className="text-xs text-muted">
                                                                via {txn.referenceType} #{txn.referenceId}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="text-left sm:text-right flex-shrink-0">
                                                    <div className="text-xs text-muted mb-1">
                                                        {new Date(txn.transactionDate).toLocaleString()}
                                                    </div>
                                                    <div className="text-xs sm:text-sm font-medium">
                                                        By: {txn.performedBy || 'System'}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Transaction Details */}
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4 p-2 sm:p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                                <div>
                                                    <div className="text-xs text-muted mb-1">Quantity</div>
                                                    <div className="font-semibold text-sm">
                                                        {txn.transactionType === 'IN' || txn.transactionType === 'RETURN' ? '+' : '-'}
                                                        {txn.quantity}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-muted mb-1">Unit Price</div>
                                                    <div className="font-semibold text-sm">₹{(txn.unitPrice || 0).toFixed(2)}</div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-muted mb-1">Total Value</div>
                                                    <div className="font-semibold text-sm">₹{(txn.totalValue || 0).toFixed(2)}</div>
                                                </div>
                                                <div>
                                                    <div className="text-xs text-muted mb-1">Balance After</div>
                                                    <div className="font-semibold text-sm text-blue-600 dark:text-blue-400">
                                                        {txn.balanceQuantity}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Notes */}
                                            {txn.notes && (
                                                <div className="mt-2 text-xs sm:text-sm text-muted break-words">
                                                    <strong>Notes:</strong> {txn.notes}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}

                        </ThemedScrollArea>
                    )}
                </div>
                </div>

            {/* Delete Progress Modal */}
            {deleteProgress.total > 0 && !isDeleteMinimized && (
                <div className="fixed inset-0 bg-black/70 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999]">
                    <div className="relative overflow-hidden rounded-2xl border border-red-200/30 dark:border-red-700/30 bg-gradient-to-br from-white via-red-50/30 to-orange-50/20 dark:from-gray-900 dark:via-red-950/20 dark:to-gray-900 shadow-2xl shadow-red-500/20 max-w-md w-full mx-4">
                        {/* Gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-br from-red-400/5 via-transparent to-orange-500/5 pointer-events-none" />
                        
                        <div className="relative flex items-center justify-between px-6 py-4 border-b border-red-200/30 dark:border-red-700/30">
                            <h3 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600 dark:from-red-400 dark:to-orange-400">
                                Deleting Transactions
                            </h3>
                            <button
                                onClick={() => setIsDeleteMinimized(true)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                title="Minimize"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                                </svg>
                            </button>
                        </div>
                        <div className="relative p-8">
                            <div className="flex flex-col items-center">
                                <div className="w-20 h-20 bg-gradient-to-br from-red-100 to-orange-100 dark:from-red-900/40 dark:to-orange-900/40 rounded-full shadow-lg shadow-red-500/20 animate-pulse flex items-center justify-center mb-4">
                                    <svg className="w-10 h-10 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600 dark:from-red-400 dark:to-orange-400 mb-2">
                                    Deleting Transactions
                                </h3>
                                <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600 dark:from-red-400 dark:to-orange-400 mb-4 tabular-nums">
                                    {deleteProgress.current} / {deleteProgress.total}
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-5 mb-4 overflow-hidden shadow-inner">
                                    <div 
                                        className="h-5 bg-gradient-to-r from-red-500 via-red-600 to-orange-600 rounded-full shadow-lg shadow-red-500/50 transition-all duration-300 ease-out flex items-center justify-end pr-2"
                                        style={{ width: `${(deleteProgress.current / deleteProgress.total) * 100}%` }}
                                    >
                                        <span className="text-xs font-semibold text-white">
                                            {Math.round((deleteProgress.current / deleteProgress.total) * 100)}%
                                        </span>
                                    </div>
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    Please wait while we delete the transactions...
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmModal.open && (
                <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] transition-opacity duration-300 ${confirmModalAnimating ? 'opacity-100' : 'opacity-0'}`}>
                    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 transform transition-all duration-300 ${confirmModalAnimating ? 'scale-100' : 'scale-95'}`}>
                        <div className="p-6">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center flex-shrink-0">
                                    <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{confirmStep === 1 ? 'Confirm Delete' : 'Final Confirmation'}</h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        {confirmStep === 1
                                            ? confirmModal.message
                                            : 'This action is irreversible and will permanently remove stock transaction data. Do you want to continue?'}
                                    </p>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    onClick={closeConfirmModal}
                                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        if (confirmStep === 1) {
                                            setConfirmStep(2)
                                            return
                                        }
                                        handleConfirmDelete()
                                    }}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                                >
                                    {confirmStep === 1 ? 'Review Impact' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Export Button */}
            {selectedTransactionIds.size > 0 && (
                <div className="relative">
                    <button
                        onClick={() => setShowExportDropdown(!showExportDropdown)}
                        className="fixed bottom-8 right-40 z-50 group mobile-safe-page-fab-export"
                        title={`Export ${selectedTransactionIds.size} selected transaction(s)`}
                    >
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-r from-sky-500 to-blue-600 rounded-full blur-xl opacity-75 group-hover:opacity-100 transition-opacity duration-200"></div>
                            <div className="relative w-14 h-14 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 transform group-hover:scale-110">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                </svg>
                                <span className="absolute -top-1 -right-1 min-w-[24px] h-5 px-1.5 bg-sky-600 text-white rounded-full text-xs font-bold flex items-center justify-center shadow-lg ring-2 ring-white">
                                    {selectedTransactionIds.size}
                                </span>
                            </div>
                        </div>
                    </button>
                    {showExportDropdown && (
                        <div className="fixed bottom-24 right-40 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-sky-200 dark:border-sky-900 z-[9999] overflow-hidden mobile-safe-page-fab-menu">
                            <button
                                onClick={() => exportData('csv')}
                                className="w-full text-left px-4 py-2.5 hover:bg-gradient-to-r hover:from-sky-50 hover:to-blue-50 dark:hover:from-sky-900 dark:hover:to-blue-900 transition-all duration-150 flex items-center gap-2 text-gray-700 dark:text-gray-300"
                            >
                                <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="font-medium">CSV Format</span>
                            </button>
                            <button
                                onClick={() => exportData('json')}
                                className="w-full text-left px-4 py-2.5 hover:bg-gradient-to-r hover:from-sky-50 hover:to-blue-50 dark:hover:from-sky-900 dark:hover:to-blue-900 transition-all duration-150 flex items-center gap-2 text-gray-700 dark:text-gray-300"
                            >
                                <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                </svg>
                                <span className="font-medium">JSON Format</span>
                            </button>
                            <button
                                onClick={() => exportData('xlsx')}
                                className="w-full text-left px-4 py-2.5 hover:bg-gradient-to-r hover:from-sky-50 hover:to-blue-50 dark:hover:from-sky-900 dark:hover:to-blue-900 transition-all duration-150 flex items-center gap-2 text-gray-700 dark:text-gray-300 rounded-b-lg"
                            >
                                <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                <span className="font-medium">Excel Format</span>
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Floating Delete Selected Button */}
            {selectedTransactionIds.size > 0 && (
                <button
                    onClick={() => {
                        setConfirmModal({ open: true, deleteMultiple: true, message: `Are you sure you want to delete ${selectedTransactionIds.size} selected transaction(s)?` })
                        setConfirmModalAnimating(true)
                    }}
                    className="fixed bottom-8 right-24 z-50 group mobile-safe-page-fab-delete"
                    title={`Delete ${selectedTransactionIds.size} selected transaction(s)`}
                >
                    <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-rose-600 rounded-full blur-xl opacity-75 group-hover:opacity-100 transition-opacity duration-200 animate-pulse"></div>
                        <div className="relative w-14 h-14 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 transform group-hover:scale-110">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span className="absolute -top-1 -right-1 min-w-[24px] h-5 px-1.5 bg-red-600 text-white rounded-full text-xs font-bold flex items-center justify-center shadow-lg ring-2 ring-white">
                                {selectedTransactionIds.size}
                            </span>
                        </div>
                    </div>
                </button>
            )}

            {submitting && (
                <LoadingModal 
                    isOpen={true} 
                    message="Recording transaction..."
                />
            )}

            <ToastNotification toasts={toasts} removeToast={removeToast} />
        </div>
    )
}

