import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'
import LoadingModal from '../components/LoadingModal'
import ToastNotification from '../components/ToastNotification'
import CustomSelect from '../components/CustomSelect'
import { useToast } from '../hooks/useToast'
import { useDataCache } from '../contexts/DataCacheContext'
import RefreshButton from '../components/RefreshButton'
import * as XLSX from 'xlsx'
import { isBasicPlan } from '../lib/subscription'
import StandardFeatureBadge from '../components/StandardFeatureBadge'
import ThemedScrollArea from '../components/ThemedScrollArea'

export default function SuppliersPage() {
    const router = useRouter()
    const [suppliers, setSuppliers] = useState<any[]>([])
    const [editingId, setEditingId] = useState<number | null>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isAnimating, setIsAnimating] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [filterStatus, setFilterStatus] = useState('')
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [showLoadingModal, setShowLoadingModal] = useState(false)
    const [showSuccessModal, setShowSuccessModal] = useState(false)
    const [successMessage, setSuccessMessage] = useState('')
    
    // Set-based state for multi-select
    const [selectedSupplierIds, setSelectedSupplierIds] = useState<Set<number>>(new Set())
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
    
    // Export and delete state
    const [showExportDropdown, setShowExportDropdown] = useState(false)
    const [deleteProgress, setDeleteProgress] = useState({ current: 0, total: 0 })
    const [confirmModal, setConfirmModal] = useState<{ open: boolean; id?: number; deleteMultiple?: boolean; message?: string }>({ open: false })
    const [confirmModalAnimating, setConfirmModalAnimating] = useState(false)
    const [confirmStep, setConfirmStep] = useState<1 | 2>(1)
    const [isDeleteMinimized, setIsDeleteMinimized] = useState(false)
    
    // Sorting state
    const [sortField, setSortField] = useState<string>('name')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
    const [isFilterStatusOpen, setIsFilterStatusOpen] = useState(false)
    
    const { toasts, removeToast, showSuccess, showError, showInfo } = useToast()
    const { getCache, setCache } = useDataCache()

    const emptyForm = {
        name: '',
        contactPerson: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        state: '',
        pincode: '',
        gstin: '',
        pendingBalance: '',
        notes: ''
    }

    const [form, setForm] = useState(emptyForm)
    const [supplierAddressInput, setSupplierAddressInput] = useState('')
    const { user } = useAuth()
    const isBasicSubscription = isBasicPlan(user?.clinic?.subscriptionPlan)

    const buildAddressInput = (data: { address?: string; city?: string; state?: string; pincode?: string }) =>
        `${data.address || ''}${data.city ? `, ${data.city}` : ''}${data.state ? `, ${data.state}` : ''}${data.pincode ? ` - ${data.pincode}` : ''}`

    const parseAddressInput = (value: string) => {
        const normalized = String(value || '').trim()
        if (!normalized) {
            return { address: '', city: '', state: '', pincode: '' }
        }

        const pincodeMatch = normalized.match(/(?:-|\s)(\d{4,10})$/)
        const pincode = pincodeMatch ? pincodeMatch[1] : ''
        const withoutPincode = normalized.replace(/(?:-|\s)\d{4,10}$/, '').trim()

        const parts = withoutPincode
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)

        return {
            address: parts[0] || '',
            city: parts[1] || '',
            state: parts[2] || '',
            pincode,
        }
    }

    const fetchSuppliers = useCallback(async () => {
        const response = await fetch('/api/suppliers')
        const data = await response.json()
        const suppliersData = Array.isArray(data) ? data : []
        setSuppliers(suppliersData)
        setCache('suppliers', suppliersData)
    }, [setCache])

    const fetchInitialData = useCallback(async () => {
        setLoading(true)
        try {
            await fetchSuppliers()
        } finally {
            setLoading(false)
        }
    }, [fetchSuppliers])

    useEffect(() => {
        const cachedSuppliers = getCache<any[]>('suppliers')
        if (cachedSuppliers) {
            setSuppliers(Array.isArray(cachedSuppliers) ? cachedSuppliers : [])
            setLoading(false)
        } else {
            fetchInitialData()
        }
        
        // Cleanup on unmount
        return () => {
            setSuppliers([])
        }
    }, [getCache, fetchInitialData])

    async function handleSubmit(e: any) {
        e.preventDefault()
        setSubmitting(true)
        setShowLoadingModal(true)
        try {
            const parsedAddress = parseAddressInput(supplierAddressInput)
            const payload = {
                ...form,
                ...parsedAddress,
                pendingBalance: form.pendingBalance ? Number(form.pendingBalance) : 0
            }

            const url = editingId ? '/api/suppliers' : '/api/suppliers'
            const method = editingId ? 'PUT' : 'POST'
            const body = editingId ? { ...payload, id: editingId } : payload

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })

            if (response.ok) {
                await fetchSuppliers()
                setShowLoadingModal(false)
                setSuccessMessage(editingId ? 'Supplier updated successfully!' : 'Supplier added successfully!')
                setShowSuccessModal(true)
                setTimeout(() => {
                    closeModal()
                    setShowSuccessModal(false)
                }, 2000)
            } else {
                const error = await response.json()
                showError('Failed: ' + (error.error || 'Unknown error'))
                setShowLoadingModal(false)
            }
        } catch (error) {
            showError('Failed to save supplier')
            setShowLoadingModal(false)
        } finally {
            setSubmitting(false)
        }
    }

    function editSupplier(supplier: any) {
        setForm({
            name: supplier.name || '',
            contactPerson: supplier.contactPerson || '',
            email: supplier.email || '',
            phone: supplier.phone || '',
            address: supplier.address || '',
            city: supplier.city || '',
            state: supplier.state || '',
            pincode: supplier.pincode || '',
            gstin: supplier.gstin || '',
            pendingBalance: supplier.pendingBalance || '',
            notes: supplier.notes || ''
        })
        setSupplierAddressInput(buildAddressInput(supplier))
        setEditingId(supplier.id)
        setIsModalOpen(true)
        document.body.style.overflow = 'hidden'
        setIsAnimating(false)
        setTimeout(() => setIsAnimating(true), 10)
    }

    async function deleteSupplier(id: number) {
        setConfirmStep(1)
        setConfirmModal({ open: true, id, message: 'Are you sure you want to delete this supplier?' })
        setTimeout(() => setConfirmModalAnimating(true), 10)
    }

    function openBulkDeleteConfirm() {
        setConfirmStep(1)
        setConfirmModal({
            open: true,
            deleteMultiple: true,
            message: `Are you sure you want to delete ${selectedSupplierIds.size} selected supplier(s)? This action cannot be undone.`
        })
        setTimeout(() => setConfirmModalAnimating(true), 10)
    }

    function closeConfirmModal() {
        setConfirmModalAnimating(false)
        setTimeout(() => {
            setConfirmModal({ open: false })
            setConfirmStep(1)
        }, 300)
    }

    async function handleConfirmDelete(id?: number) {
        if (!id && !confirmModal.deleteMultiple) {
            closeConfirmModal()
            return
        }

        closeConfirmModal()
        setDeleting(true)
        try {
            if (confirmModal.deleteMultiple) {
                const idsArray = Array.from(selectedSupplierIds)
                setDeleteProgress({ current: 0, total: idsArray.length })
                
                const CHUNK_SIZE = 10
                for (let i = 0; i < idsArray.length; i += CHUNK_SIZE) {
                    const chunk = idsArray.slice(i, i + CHUNK_SIZE)
                    await Promise.all(
                        chunk.map(supplierId =>
                            fetch(`/api/suppliers?id=${supplierId}`, { method: 'DELETE' })
                        )
                    )
                    const completed = Math.min(i + CHUNK_SIZE, idsArray.length)
                    setDeleteProgress({ current: completed, total: idsArray.length })
                }
                
                showSuccess(`Successfully deleted ${idsArray.length} supplier(s)!`)
                setSelectedSupplierIds(new Set())
            } else if (id) {
                const response = await fetch(`/api/suppliers?id=${id}`, { method: 'DELETE' })
                if (response.ok) {
                    showSuccess('Supplier deleted successfully!')
                } else {
                    showError('Failed to delete supplier')
                }
            }
            await fetchSuppliers()
        } catch (error) {
            showError('Failed to delete supplier(s)')
        } finally {
            setDeleting(false)
            setDeleteProgress({ current: 0, total: 0 })
            setIsDeleteMinimized(false)
        }
    }

    function toggleSelectSupplier(id: number) {
        const newSelected = new Set(selectedSupplierIds)
        if (newSelected.has(id)) {
            newSelected.delete(id)
        } else {
            newSelected.add(id)
        }
        setSelectedSupplierIds(newSelected)
    }

    function toggleSelectAll() {
        const filtered = getFilteredAndSortedSuppliers()
        if (selectedSupplierIds.size === filtered.length && filtered.length > 0) {
            setSelectedSupplierIds(new Set())
        } else {
            setSelectedSupplierIds(new Set(filtered.map(s => s.id)))
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

    function getFilteredAndSortedSuppliers() {
        let filtered = suppliers.filter(s => {
            const matchesSearch = searchQuery ?
                s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (s.contactPerson || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (s.phone || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (s.email || '').toLowerCase().includes(searchQuery.toLowerCase())
                : true

            const matchesStatus = filterStatus ? s.status === filterStatus : true

            return matchesSearch && matchesStatus
        })

        // Sort
        filtered.sort((a, b) => {
            let aVal = a[sortField]
            let bVal = b[sortField]

            // Handle different data types
            if (typeof aVal === 'string') aVal = aVal.toLowerCase()
            if (typeof bVal === 'string') bVal = bVal.toLowerCase()

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

        const dataToExport = selectedSupplierIds.size > 0
            ? suppliers.filter(s => selectedSupplierIds.has(s.id))
            : getFilteredAndSortedSuppliers()

        const exportData = dataToExport.map(s => ({
            'Supplier Name': s.name || '',
            'Contact Person': s.contactPerson || '',
            'Email': s.email || '',
            'Phone': s.phone || '',
            'Address': s.address || '',
            'City': s.city || '',
            'State': s.state || '',
            'Pincode': s.pincode || '',
            'GSTIN': s.gstin || '',
            'Pending Balance': s.pendingBalance || 0,
            'Status': s.status || '',
            'Notes': s.notes || ''
        }))

        if (format === 'csv') {
            exportToCSV(exportData)
        } else if (format === 'json') {
            exportToJSON(exportData)
        } else if (format === 'xlsx') {
            exportToExcel(exportData)
        }

        setShowExportDropdown(false)
        showSuccess(`Exported ${exportData.length} supplier(s) as ${format.toUpperCase()}!`)
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
        link.download = `suppliers_${new Date().toISOString().split('T')[0]}.csv`
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
        link.download = `suppliers_${new Date().toISOString().split('T')[0]}.json`
        link.click()
    }

    const exportToExcel = (data: any[]) => {
        if (data.length === 0) {
            showError('No data to export')
            return
        }

        const worksheet = XLSX.utils.json_to_sheet(data)
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Suppliers')
        
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

        XLSX.writeFile(workbook, `suppliers_${new Date().toISOString().split('T')[0]}.xlsx`)
    }

    function toggleRowExpansion(id: number) {
        toggleExpandRow(id)
    }

    async function toggleStatus(supplier: any) {
        try {
            const newStatus = supplier.status === 'active' ? 'inactive' : 'active'
            const response = await fetch('/api/suppliers', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: supplier.id, status: newStatus })
            })
            if (response.ok) {
                await fetchSuppliers()
                showSuccess(`Supplier ${newStatus === 'active' ? 'activated' : 'deactivated'} successfully!`)
            }
        } catch (error) {
            showError('Failed to update supplier status')
        }
    }

    function closeModal() {
        setIsAnimating(false)
        document.body.style.overflow = 'unset'
        setTimeout(() => {
            setIsModalOpen(false)
            setForm(emptyForm)
            setSupplierAddressInput('')
            setEditingId(null)
        }, 200)
    }

    function cancelEdit() {
        closeModal()
    }

    const filteredSuppliers = getFilteredAndSortedSuppliers()

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                        Supplier Management
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Manage supplier relationships and contacts</p>
                </div>
                <div className="flex items-center gap-3">
                    <RefreshButton onRefresh={fetchSuppliers} />
                    {/* Export Dropdown */}
                    {user && (
                        <div className="relative">
                            <button
                                onClick={() => setShowExportDropdown(!showExportDropdown)}
                                className="relative px-2 sm:px-4 py-2.5 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-lg shadow-lg shadow-blue-500/30 flex items-center gap-2 transition-all duration-200 font-medium"
                                title={selectedSupplierIds.size > 0 ? `Export ${selectedSupplierIds.size} selected` : 'Export All'}
                                aria-label={selectedSupplierIds.size > 0 ? `Export ${selectedSupplierIds.size} selected` : 'Export All'}
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="hidden sm:inline">{selectedSupplierIds.size > 0 ? `Export (${selectedSupplierIds.size})` : 'Export All'}</span>
                                {isBasicSubscription && (
                                    <>
                                        <span className="hidden sm:block"><StandardFeatureBadge /></span>
                                        <span className="sm:hidden"><StandardFeatureBadge mobile /></span>
                                    </>
                                )}
                            </button>

                            {showExportDropdown && (
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
                            setEditingId(null)
                            setForm(emptyForm)
                            setSupplierAddressInput('')
                            setIsModalOpen(true)
                            setIsAnimating(false)
                            setTimeout(() => setIsAnimating(true), 10)
                        }}
                        className="px-2 sm:px-4 py-2.5 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-lg shadow-lg flex items-center gap-2 transition-all duration-200 font-medium"
                        title="Add Supplier"
                        aria-label="Add Supplier"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="hidden sm:inline">Add Supplier</span>
                    </button>
                </div>
            </div>

                {/* Search and Filter Bar */}
                <div className="relative rounded-xl border border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-br from-white via-blue-50 to-sky-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 shadow-lg shadow-blue-500/10 p-4 mb-4">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                    <div className="relative flex items-center gap-3 flex-wrap">
                        <div className="flex-1 relative min-w-[250px]">
                            <input
                                type="text"
                                placeholder="🔍 Search suppliers by name, contact, phone, or email..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full p-3 pr-10 border border-blue-200 dark:border-blue-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
                            />
                        </div>
                        <div className={`w-48 ${isFilterStatusOpen ? 'relative z-[10000]' : 'relative z-0'}`}>
                            <CustomSelect
                                value={filterStatus}
                                onChange={(value) => setFilterStatus(value)}
                                options={[
                                    { value: '', label: 'All Status' },
                                    { value: 'active', label: 'Active' },
                                    { value: 'inactive', label: 'Inactive' }
                                ]}
                                placeholder="All Status"
                                onOpenChange={setIsFilterStatusOpen}
                            />
                        </div>
                        {(searchQuery || filterStatus) && (
                            <button
                                onClick={() => {
                                    setSearchQuery('')
                                    setFilterStatus('')
                                }}
                                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                            >
                                Clear
                            </button>
                        )}
                    </div>
                </div>

                {/* Modal/Dialog */}
                {isModalOpen && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
                        <div className="relative overflow-hidden rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/20 backdrop-blur-sm max-w-2xl w-full max-h-[85vh]">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none"></div>
                            {/* Header */}
                            <div className="relative flex items-center justify-between px-6 py-4 border-b border-blue-200/30 dark:border-blue-700/30">
                                <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                                    {editingId ? 'Edit Supplier' : 'Add New Supplier'}
                                </h2>
                                <button
                                    onClick={cancelEdit}
                                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none"
                                >
                                    ×
                                </button>
                            </div>

                            {/* Form Content - Scrollable */}
                            <div className="overflow-y-auto max-h-[calc(90vh-140px)]">
                                <form onSubmit={handleSubmit} className="p-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Basic Information */}
                                        <div className="md:col-span-2">
                                            <h3 className="text-lg font-semibold mb-4 text-blue-600 dark:text-blue-400">Basic Information</h3>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Supplier Name *</label>
                                            <input
                                                type="text"
                                                required
                                                value={form.name}
                                                onChange={(e) => setForm({...form, name: e.target.value})}
                                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                                placeholder="Enter supplier name"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Contact Person</label>
                                            <input
                                                type="text"
                                                value={form.contactPerson}
                                                onChange={(e) => setForm({...form, contactPerson: e.target.value})}
                                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                                placeholder="Contact person name"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Email</label>
                                            <input
                                                type="email"
                                                value={form.email}
                                                onChange={(e) => setForm({...form, email: e.target.value})}
                                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                                placeholder="supplier@example.com"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Phone</label>
                                            <input
                                                type="tel"
                                                value={form.phone}
                                                onChange={(e) => setForm({...form, phone: e.target.value})}
                                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                                placeholder="+91 98765 43210"
                                            />
                                        </div>

                                        {/* Address Information - Single Line */}
                                        <div className="md:col-span-2 mt-4">
                                            <h3 className="text-lg font-semibold mb-3 text-blue-600 dark:text-blue-400">Address & Business Info</h3>
                                        </div>

                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Full Address (Address, City, State, Pincode)</label>
                                            <input
                                                type="text"
                                                value={supplierAddressInput}
                                                onChange={(e) => setSupplierAddressInput(e.target.value)}
                                                onBlur={() => {
                                                    const parsed = parseAddressInput(supplierAddressInput)
                                                    setForm((prev) => ({ ...prev, ...parsed }))
                                                }}
                                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                                placeholder="Street address, City, State - Pincode"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">GSTIN</label>
                                            <input
                                                type="text"
                                                value={form.gstin}
                                                onChange={(e) => setForm({...form, gstin: e.target.value})}
                                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                                placeholder="22AAAAA0000A1Z5"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Pending Balance (₹)</label>
                                            <input
                                                type="number"
                                                value={form.pendingBalance}
                                                onChange={(e) => setForm({...form, pendingBalance: e.target.value})}
                                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                                placeholder="0 (positive or negative)"
                                                step="0.01"
                                            />
                                        </div>

                                        {/* Notes */}
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Notes</label>
                                            <textarea
                                                value={form.notes}
                                                onChange={(e) => setForm({...form, notes: e.target.value})}
                                                className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                                rows={3}
                                                placeholder="Additional notes about the supplier..."
                                            />
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
                                        <button
                                            type="button"
                                            onClick={cancelEdit}
                                            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={!user}
                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            {editingId ? 'Update Supplier' : 'Add Supplier'}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                )}

                {/* Suppliers List */}
                <div className="relative rounded-xl border border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-br from-white via-blue-50 to-sky-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 shadow-lg shadow-blue-500/10 p-4 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                    <div className="relative">
                    <h3 className="text-lg font-semibold mb-4 flex items-center justify-between">
                        <span className="flex items-center gap-3">
                            <label className="relative group/checkbox cursor-pointer flex-shrink-0">
                                <input
                                    type="checkbox"
                                    checked={filteredSuppliers.length > 0 && selectedSupplierIds.size === filteredSuppliers.length}
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
                            <span className="font-bold text-gray-900 dark:text-gray-100">Supplier Records {selectedSupplierIds.size > 0 && <span className="px-2 py-0.5 ml-2 bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-400 rounded-full text-xs font-bold">({selectedSupplierIds.size} selected)</span>}</span>
                        </span>
                        <span className="badge">{filteredSuppliers.length} suppliers</span>
                    </h3>

                    {filteredSuppliers.length === 0 ? (
                        <div className="text-center py-8 text-muted">
                            <p className="text-lg mb-2">
                                {searchQuery || filterStatus ? 'No suppliers match your filters' : 'No suppliers yet'}
                            </p>
                            <p className="text-sm">
                                {searchQuery || filterStatus ? 'Try adjusting your search or filter' : 'Click "Add New Supplier" to get started'}
                            </p>
                        </div>
                    ) : (
                        <>
                        <ThemedScrollArea className="space-y-2 max-h-[44rem] pr-1">
                            {filteredSuppliers.map(s => {
                                const isExpanded = expandedRows.has(s.id)
                                return (
                                    <div key={s.id} className={`border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden transition-all duration-300 ${selectedSupplierIds.has(s.id) ? 'ring-2 ring-sky-500 shadow-xl shadow-sky-100 dark:shadow-sky-900/30 bg-gradient-to-r from-sky-50/30 to-blue-50/30 dark:from-gray-800 dark:to-gray-800' : ''}`}>
                                        {/* Summary Row */}
                                        <div className="bg-gray-50 dark:bg-gray-800 p-3 flex items-center gap-3">
                                            {/* Checkbox */}
                                            <div className="flex-shrink-0">
                                                <label className="relative group/checkbox cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedSupplierIds.has(s.id)}
                                                        onChange={() => toggleSelectSupplier(s.id)}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="peer sr-only"
                                                    />
                                                    <div className="w-6 h-6 border-2 border-sky-400 dark:border-sky-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-sky-500 peer-checked:to-blue-600 peer-checked:border-sky-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-sky-500/50 group-hover/checkbox:border-sky-500 group-hover/checkbox:scale-110">
                                                        <svg className="w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    </div>
                                                    <div className="absolute inset-0 rounded-md bg-sky-400 opacity-0 peer-checked:opacity-20 blur-md transition-opacity duration-200 pointer-events-none"></div>
                                                </label>
                                            </div>
                                            
                                            {/* Supplier Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="font-semibold text-sm">{s.name}</div>
                                                <div className="text-xs text-muted mt-0.5">
                                                    {s.phone && <span className="mr-2">📞 {s.phone}</span>}
                                                    {s.city && <span>{s.city}</span>}
                                                </div>
                                            </div>
                                            
                                            {/* Status Badge */}
                                            <button
                                                onClick={() => toggleStatus(s)}
                                                className={`px-2 py-1 text-xs rounded ${
                                                    s.status === 'active' 
                                                        ? 'bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-200'
                                                        : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                                                }`}
                                            >
                                                {s.status}
                                            </button>
                                            
                                            {/* Action Buttons */}
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <button
                                                    onClick={() => editSupplier(s)}
                                                    className="px-2 sm:px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded"
                                                    title="Edit"
                                                >
                                                    <span className="sm:hidden">
                                                        <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                    </span>
                                                    <span className="hidden sm:inline">
                                                        <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                        Edit
                                                    </span>
                                                </button>
                                                <button
                                                    onClick={() => deleteSupplier(s.id)}
                                                    className="px-2 sm:px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
                                                    title="Delete"
                                                >
                                                    <span className="sm:hidden">
                                                        <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </span>
                                                    <span className="hidden sm:inline">
                                                        <svg className="w-4 h-4 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                        Delete
                                                    </span>
                                                </button>
                                                <button
                                                    onClick={() => toggleRowExpansion(s.id)}
                                                    className="px-2 sm:px-3 py-1.5 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded"
                                                    title={isExpanded ? "Hide Details" : "View More"}
                                                >
                                                    <span className="sm:hidden">
                                                        <svg className={`w-4 h-4 inline transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                    </span>
                                                    <span className="hidden sm:inline">
                                                        <svg className={`w-4 h-4 inline mr-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                        </svg>
                                                        {isExpanded ? 'Hide' : 'View More'}
                                                    </span>
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expanded Details */}
                                        {isExpanded && (
                                            <div className="p-4 bg-white dark:bg-gray-900 space-y-4">
                                                {/* Contact Info */}
                                                <div>
                                                    <div className="text-sm font-semibold mb-2">Contact Information</div>
                                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                        <div>
                                                            <div className="text-xs text-muted mb-1">Contact Person</div>
                                                            <div className="text-sm font-medium">{s.contactPerson || '-'}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-muted mb-1">Phone</div>
                                                            <div className="text-sm font-medium">{s.phone || '-'}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-muted mb-1">Email</div>
                                                            <div className="text-sm font-medium">{s.email || '-'}</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Address Info */}
                                                <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                                                    <div className="text-sm font-semibold mb-2">Address</div>
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                        <div>
                                                            <div className="text-xs text-muted mb-1">Address</div>
                                                            <div className="text-sm font-medium">{s.address || '-'}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-muted mb-1">City</div>
                                                            <div className="text-sm font-medium">{s.city || '-'}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-muted mb-1">State</div>
                                                            <div className="text-sm font-medium">{s.state || '-'}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-muted mb-1">Pincode</div>
                                                            <div className="text-sm font-medium">{s.pincode || '-'}</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Business Info */}
                                                <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                                                    <div className="text-sm font-semibold mb-2">Business Information</div>
                                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                        <div>
                                                            <div className="text-xs text-muted mb-1">GSTIN</div>
                                                            <div className="text-sm font-medium">{s.gstin || '-'}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-muted mb-1">Pending Balance</div>
                                                            <div className={`text-sm font-medium ${(s.pendingBalance || 0) >= 0 ? 'text-sky-600 dark:text-sky-400' : 'text-red-600 dark:text-red-400'}`}>
                                                                ₹{Math.abs(s.pendingBalance || 0).toLocaleString()} {(s.pendingBalance || 0) >= 0 ? '(CR)' : '(DR)'}
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-muted mb-1">Purchase Orders</div>
                                                            <div className="text-sm font-medium">{s._count?.purchaseOrders || 0}</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Notes */}
                                                {s.notes && (
                                                    <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
                                                        <div className="text-xs text-muted mb-1">Notes</div>
                                                        <div className="text-sm">{s.notes}</div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </ThemedScrollArea>

                        </>
                    )}
                </div>

            {/* Confirm Delete Modal */}
            {confirmModal.open && (
                <div className={`fixed inset-0 bg-black transition-opacity duration-300 ${confirmModalAnimating ? 'bg-opacity-50' : 'bg-opacity-0'}`} style={{ zIndex: 9999 }} onClick={closeConfirmModal}>
                    <div className={`fixed inset-0 flex items-center justify-center p-4 transition-all duration-300 ${confirmModalAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`} style={{ zIndex: 10000 }}>
                        <div className="relative overflow-hidden rounded-2xl border border-red-200/30 dark:border-red-700/30 bg-gradient-to-br from-white via-red-50/30 to-orange-50/20 dark:from-gray-900 dark:via-red-950/20 dark:to-gray-900 shadow-lg shadow-red-500/20 backdrop-blur-sm max-w-md w-full" onClick={e => e.stopPropagation()}>
                            <div className="absolute inset-0 bg-gradient-to-br from-red-400/5 via-transparent to-orange-500/5 pointer-events-none"></div>
                            <div className="relative p-6">
                                <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full">
                                    <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-semibold text-center mb-2 text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600 dark:from-red-400 dark:to-orange-400">
                                    {confirmStep === 1 ? 'Confirm Delete' : 'Final Confirmation'}
                                </h3>
                                <p className="text-sm text-center text-gray-600 dark:text-gray-400 mb-6">
                                    {confirmStep === 1
                                        ? confirmModal.message
                                        : 'This action is irreversible and will permanently remove the selected supplier data. Do you want to continue?'}
                                </p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={closeConfirmModal}
                                        className="flex-1 px-4 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        onClick={() => {
                                            if (confirmStep === 1) {
                                                setConfirmStep(2)
                                                return
                                            }
                                            handleConfirmDelete(confirmModal.id)
                                        }} 
                                        disabled={deleting} 
                                        className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors font-medium shadow-md"
                                    >
                                        {deleting && (
                                            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                            </svg>
                                        )}
                                        {deleting ? 'Deleting...' : (confirmStep === 1 ? 'Review Impact' : 'Yes, Delete')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Progress Modal (for bulk deletes) */}
            {deleting && deleteProgress.total > 0 && !isDeleteMinimized && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4 backdrop-blur-sm">
                    <div className="relative overflow-hidden rounded-2xl border border-red-200/30 dark:border-red-700/30 bg-gradient-to-br from-white via-red-50/30 to-orange-50/20 dark:from-gray-900 dark:via-red-950/20 dark:to-gray-900 shadow-2xl shadow-red-500/20 max-w-md w-full animate-in fade-in zoom-in duration-200">
                        <div className="absolute inset-0 bg-gradient-to-br from-red-400/5 via-transparent to-orange-500/5 pointer-events-none"></div>
                        <div className="relative p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600 dark:from-red-400 dark:to-orange-400">Deleting Suppliers</h3>
                                <button
                                    onClick={() => setIsDeleteMinimized(true)}
                                    className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                                    </svg>
                                </button>
                            </div>
                            
                            <div className="flex items-center justify-center mb-6">
                                <div className="w-20 h-20 bg-gradient-to-br from-red-100 to-orange-100 dark:from-red-900/40 dark:to-orange-900/40 rounded-full flex items-center justify-center shadow-lg shadow-red-500/20 animate-pulse">
                                    <svg className="w-10 h-10 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </div>
                            </div>
                            
                            <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600 dark:from-red-400 dark:to-orange-400 mb-2 text-center">
                                {deleteProgress.current} / {deleteProgress.total}
                            </div>
                            
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 text-center">
                                {Math.round((deleteProgress.current / deleteProgress.total) * 100)}% Complete
                            </p>
                            
                            {/* Progress Bar */}
                            <div className="w-full bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded-full h-5 overflow-hidden shadow-inner">
                                <div 
                                    className="h-full bg-gradient-to-r from-red-500 via-red-600 to-orange-600 rounded-full transition-all duration-300 ease-out flex items-center justify-end pr-3 shadow-lg shadow-red-500/50"
                                    style={{ width: `${(deleteProgress.current / deleteProgress.total) * 100}%` }}
                                >
                                    <span className="text-xs font-bold text-white drop-shadow-lg">
                                        {deleteProgress.current > 0 && `${Math.round((deleteProgress.current / deleteProgress.total) * 100)}%`}
                                    </span>
                                </div>
                            </div>
                            
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-4 text-center">
                                Please wait, deleting supplier {deleteProgress.current} of {deleteProgress.total}...
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Loading Modal */}
            {showLoadingModal && (
                <LoadingModal isOpen={true} message={submitting ? "Saving supplier..." : "Processing..."} />
            )}

            {/* Success Modal */}
            {showSuccessModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000]">
                    <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-sm mx-4 shadow-2xl transform transition-all duration-300 scale-100">
                        <div className="flex flex-col items-center">
                            <div className="w-16 h-16 bg-sky-100 dark:bg-sky-900/30 rounded-full flex items-center justify-center mb-4">
                                <svg className="w-8 h-8 text-sky-600 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Success!</h3>
                            <p className="text-gray-600 dark:text-gray-300 text-center">{successMessage}</p>
                        </div>
                    </div>
                </div>
            )}

            <ToastNotification toasts={toasts} removeToast={removeToast} />
            </div>
        </div>
    )
}

