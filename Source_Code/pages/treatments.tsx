import { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'
import { requireDoctorOrAdmin } from '../lib/withAuth'
import ConfirmationModal from '../components/ConfirmationModal'
import LoadingModal from '../components/LoadingModal'
import ImportTreatmentModal from '../components/ImportTreatmentModal'
import CustomSelect from '../components/CustomSelect'
import { useDataCache } from '../contexts/DataCacheContext'
import { useDoctor } from '../contexts/DoctorContext'
import RefreshButton from '../components/RefreshButton'
import { useToast } from '../hooks/useToast'
import { getCachedCurrentUser, setCachedCurrentUser } from '../lib/currentUserStorage'
import { isBasicPlan } from '../lib/subscription'
import StandardFeatureBadge from '../components/StandardFeatureBadge'
import ThemedScrollArea from '../components/ThemedScrollArea'

function TreatmentsPage() {
    const router = useRouter()
    const [items, setItems] = useState<any[]>([])
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
    const [selectedPlanByDiagnosis, setSelectedPlanByDiagnosis] = useState<{[key: string]: number}>({})
    const [searchQuery, setSearchQuery] = useState('')
    const [loading, setLoading] = useState(false)
    const { user } = useAuth()
    const isBasicSubscription = isBasicPlan(user?.clinic?.subscriptionPlan)
    const [doctors, setDoctors] = useState<any[]>([])
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [deleteId, setDeleteId] = useState<number | null>(null)
    const [deleting, setDeleting] = useState(false)
    const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set())
    const [showImportModal, setShowImportModal] = useState(false)
    const [hasNewTreatmentDefaults, setHasNewTreatmentDefaults] = useState(false)
    const [treatmentImportPulseEnabled, setTreatmentImportPulseEnabled] = useState(true)
    const [showExportDropdown, setShowExportDropdown] = useState(false)
    const [selectedTreatmentIds, setSelectedTreatmentIds] = useState<Set<number>>(new Set())
    const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false)
    const [deleteAllDiagnosis, setDeleteAllDiagnosis] = useState<string>('')
    const [deleteAllIds, setDeleteAllIds] = useState<number[]>([])
    const [deleteAllProgress, setDeleteAllProgress] = useState({ current: 0, total: 0 })
    const [sortBy, setSortBy] = useState<'diagnosis' | 'planNumber' | 'speciality' | 'organ'>('diagnosis')
    const [sortOrders, setSortOrders] = useState<{[key: string]: 'asc' | 'desc'}>({
        diagnosis: 'asc',
        planNumber: 'asc',
        speciality: 'asc',
        organ: 'asc'
    })
    const [showSortDropdown, setShowSortDropdown] = useState(false)
    const [products, setProducts] = useState<any[]>([])  // for resolving option product names in export
    const [showFilters, setShowFilters] = useState(false)
    const [filterSystems, setFilterSystems] = useState<string>('')
    const [filterPulseDiagnosis, setFilterPulseDiagnosis] = useState<string>('')
    const [filterSpeciality, setFilterSpeciality] = useState<string>('')
    const [filterOrgan, setFilterOrgan] = useState<string>('')
    const [showNewOnly, setShowNewOnly] = useState(false)
    const [isFilterSystemsOpen, setIsFilterSystemsOpen] = useState(false)
    const [isFilterPulseDiagnosisOpen, setIsFilterPulseDiagnosisOpen] = useState(false)
    const [isFilterSpecialityOpen, setIsFilterSpecialityOpen] = useState(false)
    const [isFilterOrganOpen, setIsFilterOrganOpen] = useState(false)
    const [systems, setSystems] = useState<any[]>([])
    const [pulseDiagnosis, setPulseDiagnosis] = useState<any[]>([])
    const [speciality, setSpeciality] = useState<any[]>([])
    const [organs, setOrgans] = useState<any[]>([])
    const [loadingOptions, setLoadingOptions] = useState(true)
    const { getCache, setCache } = useDataCache()
    const { selectedDoctorId } = useDoctor()
    const { showSuccess, showError, showInfo } = useToast()

    const fetchDefaultTemplateStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/default-templates-status')
            if (!res.ok) return
            const status = await res.json()
            setHasNewTreatmentDefaults(Boolean(status?.hasNewTreatmentDefaults))
            setTreatmentImportPulseEnabled(status?.treatmentImportPulseEnabled !== false)
        } catch {
            // Ignore status fetch errors; import actions remain available.
        }
    }, [])
    
    useEffect(() => {
        if (user && (user.role === 'admin' || user.role === 'receptionist')) {
            fetch('/api/doctors/list').then(r => r.json()).then(d => setDoctors(d.doctors || [])).catch(() => {})
        }
    }, [user])
    
    useEffect(() => {
        // Fetch dropdown options
        const fetchOptions = async () => {
            try {
                setLoadingOptions(true)
                const [
                    systemsData,
                    pulseDiagnosisData,
                    specialityData,
                    organData
                ] = await Promise.all([
                    fetch('/api/options/systems').then(r => r.json()).catch(() => []),
                    fetch('/api/options/pulse-diagnosis').then(r => r.json()).catch(() => []),
                    fetch('/api/options/speciality').then(r => r.json()).catch(() => []),
                    fetch('/api/options/organ').then(r => r.json()).catch(() => [])
                ])
                
                // Fallback to JSON files if API returns empty data
                const systemsJSON = (await import('../data/systems.json')).default
                const pulseDiagnosisJSON = (await import('../data/pulseDiagnosis.json')).default
                const specialityJSON = (await import('../data/speciality.json')).default
                const organJSON = (await import('../data/organ.json')).default
                
                setSystems(systemsData.length > 0 ? systemsData : systemsJSON)
                setPulseDiagnosis(pulseDiagnosisData.length > 0 ? pulseDiagnosisData : pulseDiagnosisJSON)
                setSpeciality(specialityData.length > 0 ? specialityData : specialityJSON)
                setOrgans(organData.length > 0 ? organData : organJSON)
            } catch (error) {
            } finally {
                setLoadingOptions(false)
            }
        }
        fetchOptions()
    }, [])
    
    const fetchTreatments = useCallback(async (newId?: number) => {
        try {
            setLoading(true)
            const params = new URLSearchParams()
            if (selectedDoctorId) params.append('doctorId', selectedDoctorId.toString())
            const res = await fetch(`/api/treatments${params.toString() ? `?${params}` : ''}`)
            const treatmentsData = await res.json()
            const data = Array.isArray(treatmentsData) ? treatmentsData : []
            setItems(data)
            setCache('treatments', data)
        } catch (err) {
        } finally {
            setLoading(false)
        }
    }, [selectedDoctorId, setCache])

    // Fetch products once for export option-name resolution
    useEffect(() => {
        fetch('/api/products').then(r => r.json()).then(data => {
            setProducts(Array.isArray(data) ? data : [])
        }).catch(() => {})
    }, [])
    
    useEffect(() => { 
        // Check if returning from creating new treatment
        if (router.query.newId) {
            const newId = Number(router.query.newId)
            fetchTreatments(newId)
            // Clean up URL
            router.replace('/treatments', undefined, { shallow: true })
        } else {
            const cachedTreatments = getCache<any[]>('treatments')
            if (cachedTreatments) {
                setItems(cachedTreatments)
                setLoading(false)
                // Don't fetch in background to avoid loading spinner
            } else {
                fetchTreatments()
            }
        }
        
        // Cleanup on unmount
        return () => {
            setItems([])
        }
    }, [router.query.newId, selectedDoctorId, fetchTreatments, getCache])
    
    // Listen for doctor change events
    useEffect(() => {
        const handleDoctorChange = () => {
            fetchTreatments()
        }
        
        window.addEventListener('doctor-changed', handleDoctorChange)
        return () => window.removeEventListener('doctor-changed', handleDoctorChange)
    }, [fetchTreatments])

    function handleImportSuccess() {
        fetchTreatments()
        fetchDefaultTemplateStatus()
    }

    useEffect(() => {
        fetchDefaultTemplateStatus()
    }, [fetchDefaultTemplateStatus])

    function toggleTreatmentSelection(id: number) {
        const newSelected = new Set(selectedTreatmentIds)
        if (newSelected.has(id)) {
            newSelected.delete(id)
        } else {
            newSelected.add(id)
        }
        setSelectedTreatmentIds(newSelected)
    }

    function toggleSelectAll(treatments: any[]) {
        const treatmentIds = treatments.map((t: any) => t.id)
        const allSelected = treatmentIds.every((id: number) => selectedTreatmentIds.has(id))
        
        const newSelected = new Set(selectedTreatmentIds)
        if (allSelected) {
            // Deselect all from this page
            treatmentIds.forEach((id: number) => newSelected.delete(id))
        } else {
            // Select all from this page
            treatmentIds.forEach((id: number) => newSelected.add(id))
        }
        setSelectedTreatmentIds(newSelected)
    }

    async function deleteSelectedTreatments() {
        if (selectedTreatmentIds.size === 0) return
        
        const idsArray = Array.from(selectedTreatmentIds)
        setDeleteAllIds(idsArray)
        setDeleteAllDiagnosis(`${idsArray.length} selected treatment${idsArray.length > 1 ? 's' : ''}`)
        setShowDeleteAllConfirm(true)
    }

    function toggleRowExpansion(id: string) {
        const newExpanded = new Set(expandedRows)
        if (newExpanded.has(id)) {
            newExpanded.delete(id)
        } else {
            newExpanded.add(id)
        }
        setExpandedRows(newExpanded)
    }

    function openDeleteConfirmation(id: number) {
        setDeleteId(id)
        setShowDeleteConfirm(true)
    }

    async function confirmDelete() {
        if (deleteId === null) return
        
        // Immediately show deleting state
        setDeletingIds(prev => new Set(prev).add(deleteId))
        setShowDeleteConfirm(false)
        
        // Show "Deleting..." text for 1.5 seconds so it's clearly visible
        await new Promise(resolve => setTimeout(resolve, 1500))
        
        setDeleting(true)
        
        try {
            // Start the delete API call
            const response = await fetch('/api/treatments', { 
                method: 'DELETE', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ id: deleteId }) 
            })
            if (response.ok) {
                // Wait for fade animation (700ms) before updating the list
                await new Promise(resolve => setTimeout(resolve, 700))
                
                // NOW update the list - item fades out first, then gets removed
                const params = new URLSearchParams()
                if (selectedDoctorId) params.append('doctorId', selectedDoctorId.toString())
                const updatedItems = await (await fetch(`/api/treatments${params.toString() ? `?${params}` : ''}`)).json()
                setItems(updatedItems)
                setCache('treatments', updatedItems)
                
                showSuccess('Treatment plan deleted successfully!')
            } else {
                const error = await response.json()
                showError('Failed to delete treatment: ' + (error.error || 'Unknown error'))
            }
        } catch (error) {
            showError('Failed to delete treatment')
        } finally {
            setDeletingIds(prev => {
                const next = new Set(prev)
                next.delete(deleteId)
                return next
            })
            setDeleting(false)
            setDeleteId(null)
        }
    }

    function cancelDelete() {
        setShowDeleteConfirm(false)
        setDeleteId(null)
    }

    function openDeleteAllConfirmation(diagnosis: string, treatmentIds: number[]) {
        setDeleteAllDiagnosis(diagnosis)
        setDeleteAllIds(treatmentIds)
        setShowDeleteAllConfirm(true)
    }

    async function confirmDeleteAll() {
        if (deleteAllIds.length === 0) return
        
        setShowDeleteAllConfirm(false)
        setDeleting(true)
        
        const totalPlans = deleteAllIds.length
        setDeleteAllProgress({ current: 0, total: totalPlans })
        
        try {
            // Use bulk delete endpoint for much faster deletion
            const response = await fetch('/api/treatments/bulk', { 
                method: 'DELETE', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify({ ids: deleteAllIds }) 
            })
            
            if (!response.ok) {
                const error = await response.json()
                throw new Error(`Failed to delete treatments: ${error.error || 'Unknown error'}`)
            }

            const result = await response.json()
            
            // Quick animation to show completion
            const steps = Math.min(10, totalPlans)
            for (let i = 1; i <= steps; i++) {
                setDeleteAllProgress({ 
                    current: Math.floor((i / steps) * totalPlans), 
                    total: totalPlans 
                })
                await new Promise(resolve => setTimeout(resolve, 30))
            }
            setDeleteAllProgress({ current: totalPlans, total: totalPlans })
            
            // Small delay to show completion
            await new Promise(resolve => setTimeout(resolve, 300))
            
            // Refresh the list
            await fetchTreatments()
            
            // Clear selections
            setSelectedTreatmentIds(new Set())
        } catch (error: any) {
            showError('Failed to delete all treatments: ' + error.message)
        } finally {
            setDeleting(false)
            setDeleteAllDiagnosis('')
            setDeleteAllIds([])
            setDeleteAllProgress({ current: 0, total: 0 })
        }
    }

    function cancelDeleteAll() {
        setShowDeleteAllConfirm(false)
        setDeleteAllDiagnosis('')
        setDeleteAllIds([])
    }

    function exportData(format: 'csv' | 'json' | 'xlsx') {
        try {
            if (isBasicSubscription) {
                showInfo('Export is available in Standard plan.')
                router.push('/upgrade')
                return
            }

            if (selectedTreatmentIds.size === 0) {
                showInfo('Please select at least one treatment to export')
                return
            }

            const selectedTreatments = items.filter((item: any) => selectedTreatmentIds.has(item.id))

            // Export in row-per-product format matching visits export style
            const dataToExport: any[] = []
            
            selectedTreatments.forEach((t: any) => {
                if (t.treatmentProducts && t.treatmentProducts.length > 0) {
                    // One row per product (main + options get same DRN)
                    t.treatmentProducts.forEach((tp: any, index: number) => {
                        const dosageParts = (tp.dosage || '').split('|')
                        const drn = index + 1
                        const baseRow = {
                            'Plan Number': t.planNumber || '',
                            'Diagnosis': t.provDiagnosis || '',
                            'Speciality': t.speciality || '',
                            'Imbalance': t.imbalance || '',
                            'Systems': t.systems || '',
                            'Organ': t.organ || '',
                            'Disease Action': t.diseaseAction || '',
                            'Pulse Diagnosis': t.pulseDiagnosis || '',
                            'Treatment Plan': t.treatmentPlan || '',
                            'Notes': t.notes || '',
                            'DRN': drn,
                            'Product Name': tp.product?.name || '',
                            'SPY1': tp.spy1 || '',
                            'SPY2': tp.spy2 || '',
                            'SPY3': tp.spy3 || '',
                            'SPY4': tp.spy4 || '',
                            'SPY5': tp.spy5 || '',
                            'SPY6': tp.spy6 || '',
                            'Timing': tp.timing || '',
                            'Dose Quantity': dosageParts[0] || '',
                            'Dose Timing': dosageParts[1] || '',
                            'Dilution': dosageParts[2] || '',
                            'Addition1': tp.addition1 || '',
                            'Addition2': tp.addition2 || '',
                            'Addition3': tp.addition3 || '',
                            'Procedure': tp.procedure || '',
                            'Product Administration': tp.administration || '',
                            'Presentation': tp.presentation || '',
                            'Bottle Size': tp.bottleSize || '',
                            'Quantity': tp.quantity || ''
                        }
                        dataToExport.push(baseRow)
                        // Export options as additional rows with the same DRN
                        if (tp.optionProductIds) {
                            try {
                                const optIds: any[] = JSON.parse(tp.optionProductIds)
                                optIds.forEach((optId: any) => {
                                    const optProduct = products.find((p: any) => String(p.id) === String(optId))
                                    // Try from products state if not embedded
                                    const optName = optProduct?.name || String(optId)
                                    dataToExport.push({
                                        ...baseRow,
                                        'Product Name': optName,
                                        // Options inherit all dosage/spy fields from parent (empty in export row)
                                        'SPY1': '', 'SPY2': '', 'SPY3': '', 'SPY4': '', 'SPY5': '', 'SPY6': '',
                                        'Timing': '', 'Dose Quantity': '', 'Dose Timing': '', 'Dilution': '',
                                        'Addition1': '', 'Addition2': '', 'Addition3': '',
                                        'Procedure': '', 'Product Administration': '', 'Presentation': '',
                                        'Bottle Size': '', 'Quantity': ''
                                    })
                                })
                            } catch {}
                        }
                    })
                } else {
                    // No products - export treatment-level data only
                    dataToExport.push({
                        'Plan Number': t.planNumber || '',
                        'Diagnosis': t.provDiagnosis || '',
                        'Speciality': t.speciality || '',
                        'Imbalance': t.imbalance || '',
                        'Systems': t.systems || '',
                        'Organ': t.organ || '',
                        'Disease Action': t.diseaseAction || '',
                        'Pulse Diagnosis': t.pulseDiagnosis || '',
                        'Treatment Plan': t.treatmentPlan || '',
                        'Notes': t.notes || '',
                        'DRN': '',
                        'Product Name': '',
                        'SPY1': '',
                        'SPY2': '',
                        'SPY3': '',
                        'SPY4': '',
                        'SPY5': '',
                        'SPY6': '',
                        'Timing': '',
                        'Dose Quantity': '',
                        'Dose Timing': '',
                        'Dilution': '',
                        'Addition1': '',
                        'Addition2': '',
                        'Addition3': '',
                        'Procedure': '',
                        'Product Administration': '',
                        'Presentation': '',
                        'Bottle Size': '',
                        'Quantity': ''
                    })
                }
            })

            const timestamp = new Date().toISOString().split('T')[0]
            
            if (format === 'json') {
                const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `treatments_${timestamp}.json`
                a.click()
                URL.revokeObjectURL(url)
            } else if (format === 'csv') {
                const headers = Object.keys(dataToExport[0] || {})
                const csvContent = [
                    headers.join(','),
                    ...dataToExport.map(row => 
                        headers.map(header => {
                            const value = row[header as keyof typeof row] || ''
                            return String(value).includes(',') || String(value).includes('"') 
                                ? `"${String(value).replace(/"/g, '""')}"` 
                                : value
                        }).join(',')
                    )
                ].join('\n')
                
                const blob = new Blob([csvContent], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `treatments_${timestamp}.csv`
                a.click()
                URL.revokeObjectURL(url)
            } else if (format === 'xlsx') {
                const ws = XLSX.utils.json_to_sheet(dataToExport)
                const wb = XLSX.utils.book_new()
                XLSX.utils.book_append_sheet(wb, ws, 'Treatments')
                XLSX.writeFile(wb, `treatments_${timestamp}.xlsx`)
            }
            
            showSuccess(`${selectedTreatmentIds.size} treatment(s) exported as ${format.toUpperCase()}`)
            setShowExportDropdown(false)
        } catch (e) {
            showError('Failed to export treatments')
        }
    }

    // Close export dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const target = event.target as HTMLElement
            if (showExportDropdown && !target.closest('.relative')) {
                setShowExportDropdown(false)
            }
        }
        if (showExportDropdown) {
            document.addEventListener('click', handleClickOutside)
        }
        return () => document.removeEventListener('click', handleClickOutside)
    }, [showExportDropdown])

    const isTreatmentNew = (treatment: any) => {
        if (!treatment?.createdAt) return false
        const createdDate = new Date(treatment.createdAt).toDateString()
        const today = new Date().toDateString()
        return createdDate === today
    }

    const matchesTreatmentFilters = (treatment: any, applyNewFilter: boolean = true) => {
        if (searchQuery) {
            const diagnosis = (treatment.provDiagnosis || '').toLowerCase()
            const treatmentPlan = (treatment.treatmentPlan || '').toLowerCase()
            const search = searchQuery.toLowerCase()
            if (!diagnosis.includes(search) && !treatmentPlan.includes(search)) {
                return false
            }
        }

        if (filterSystems && filterSystems !== '') {
            if ((treatment.systems || '').toLowerCase() !== filterSystems.toLowerCase()) {
                return false
            }
        }

        if (filterPulseDiagnosis && filterPulseDiagnosis !== '') {
            if ((treatment.pulseDiagnosis || '').toLowerCase() !== filterPulseDiagnosis.toLowerCase()) {
                return false
            }
        }

        if (filterSpeciality && filterSpeciality !== '') {
            if ((treatment.speciality || '').toLowerCase() !== filterSpeciality.toLowerCase()) {
                return false
            }
        }

        if (filterOrgan && filterOrgan !== '') {
            if ((treatment.organ || '').toLowerCase() !== filterOrgan.toLowerCase()) {
                return false
            }
        }

        if (applyNewFilter && showNewOnly && !isTreatmentNew(treatment)) {
            return false
        }

        return true
    }

    const baseFilteredItems = items.filter((t: any) => matchesTreatmentFilters(t, false))
    const filteredItems = items.filter((t: any) => matchesTreatmentFilters(t, true))
    const newBadgeCount = baseFilteredItems.filter((t: any) => isTreatmentNew(t)).length

    return (
        <div>
            {/* Import Modal */}
            <ImportTreatmentModal
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                onImportSuccess={handleImportSuccess}
                doctors={doctors}
                userRole={user?.role}
            />

            {/* Confirmation Modal */}
            <ConfirmationModal
                isOpen={showDeleteConfirm}
                title="Delete Treatment Plan"
                message="Are you sure you want to delete this treatment plan? This action will soft-delete the plan and renumber the remaining plans."
                confirmText="Delete"
                cancelText="Cancel"
                onConfirm={confirmDelete}
                onCancel={cancelDelete}
                type="danger"
            />

            {/* Delete All Confirmation Modal */}
            <ConfirmationModal
                isOpen={showDeleteAllConfirm}
                title="Delete All Plans"
                message={`Are you sure you want to delete ALL ${deleteAllIds.length} treatment plan${deleteAllIds.length > 1 ? 's' : ''} for "${deleteAllDiagnosis}"? This action will soft-delete all plans in this diagnosis group.`}
                confirmText={`Delete All ${deleteAllIds.length} Plans`}
                cancelText="Cancel"
                onConfirm={confirmDeleteAll}
                onCancel={cancelDeleteAll}
                type="danger"
            />

            {/* Deleting Loading Modal */}
            {deleting && deleteAllProgress.total > 0 ? (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
                        <div className="text-center">
                            <div className="mb-6">
                                <svg className="w-16 h-16 mx-auto text-red-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </div>
                            
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                Deleting Treatment Plans
                            </h3>
                            
                            <div className="text-3xl font-bold text-red-600 dark:text-red-400 mb-2">
                                {deleteAllProgress.current} / {deleteAllProgress.total}
                            </div>
                            
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                                {Math.round((deleteAllProgress.current / deleteAllProgress.total) * 100)}% Complete
                            </p>
                            
                            {/* Progress Bar */}
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
                                <div 
                                    className="bg-red-600 h-4 rounded-full transition-all duration-300 ease-out flex items-center justify-end pr-2"
                                    style={{ width: `${(deleteAllProgress.current / deleteAllProgress.total) * 100}%` }}
                                >
                                    <span className="text-xs text-white font-medium">
                                        {deleteAllProgress.current > 0 && `${Math.round((deleteAllProgress.current / deleteAllProgress.total) * 100)}%`}
                                    </span>
                                </div>
                            </div>
                            
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-4">
                                Please wait, deleting plan {deleteAllProgress.current} of {deleteAllProgress.total}...
                            </p>
                        </div>
                    </div>
                </div>
            ) : (
                <LoadingModal isOpen={deleting} message="Deleting treatment plan..." />
            )}

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                        Treatment Management
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Create and manage treatment plans</p>
                </div>
                    <div className="flex gap-3 items-center">
                    <RefreshButton onRefresh={fetchTreatments} />
                    <div className="relative">
                        <button 
                            onClick={() => setShowExportDropdown(!showExportDropdown)}
                                className="btn h-10 sm:h-11 relative bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white transition-all duration-200 flex items-center gap-2 shadow-lg shadow-sky-200 dark:shadow-sky-900/50 px-2 sm:px-4 py-2.5"
                            title={selectedTreatmentIds.size > 0 ? `Export ${selectedTreatmentIds.size} selected` : 'Export All'}
                            aria-label={selectedTreatmentIds.size > 0 ? `Export ${selectedTreatmentIds.size} selected` : 'Export All'}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                            </svg>
                            <span className="font-semibold hidden sm:inline">{selectedTreatmentIds.size > 0 ? `Export (${selectedTreatmentIds.size})` : 'Export All'}</span>
                            <svg className="w-4 h-4 hidden sm:inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                            {isBasicSubscription && (
                                <>
                                    <span className="hidden sm:block"><StandardFeatureBadge /></span>
                                    <span className="sm:hidden"><StandardFeatureBadge mobile /></span>
                                </>
                            )}
                        </button>
                        {showExportDropdown && (
                            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-sky-200 dark:border-sky-900 z-[9999] overflow-hidden">
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
                    <button 
                        onClick={() => setShowImportModal(true)}
                        className={`btn h-10 sm:h-11 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white shadow-lg shadow-sky-200 dark:shadow-sky-900/50 transition-all duration-200 flex items-center gap-2 px-2 sm:px-4 py-2.5 ${hasNewTreatmentDefaults && treatmentImportPulseEnabled ? 'animate-pulse ring-2 ring-amber-300 dark:ring-amber-500' : ''}`}
                        title={hasNewTreatmentDefaults ? 'Import treatments (new defaults available)' : 'Import treatments'}
                        aria-label="Import treatments"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <span className="font-semibold hidden sm:inline">{hasNewTreatmentDefaults ? 'Import (New Defaults)' : 'Import'}</span>
                    </button>
                    <button 
                        onClick={() => router.push('/treatments/form?new=true')}
                        className="btn h-10 sm:h-11 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white shadow-lg shadow-sky-200 dark:shadow-sky-900/50 transition-all duration-200 flex items-center gap-2 px-2 sm:px-4 py-2.5"
                        title="Add New Treatment"
                        aria-label="Add New Treatment"
                    >
                        <span>+</span>
                        <span className="hidden sm:inline ml-1">Add New Treatment</span>
                    </button>
                </div>
            </div>

            {/* Search and Sort Bar */}
            <div className="relative rounded-xl border border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-br from-white via-blue-50 to-sky-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 shadow-lg shadow-blue-500/10 p-4 mb-4">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                <div className="relative flex items-center gap-3">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder="🔍 Search treatments by diagnosis or treatment plan..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full p-3 pr-10 border border-blue-200 dark:border-blue-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-white"
                        />
                        <svg className="w-5 h-5 absolute right-3 top-1/2 transform -translate-y-1/2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    
                    {/* Sort Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowSortDropdown(!showSortDropdown)}
                            className="px-2 sm:px-4 py-2.5 bg-white dark:bg-gray-800 border-2 border-blue-200 dark:border-blue-700 rounded-lg hover:border-blue-400 dark:hover:border-blue-600 transition-all duration-200 flex items-center gap-2 font-medium text-sm shadow-sm hover:shadow-md"
                            title="Sort treatments"
                            aria-label="Sort treatments"
                        >
                            <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                            </svg>
                            <span className="hidden sm:inline">Sort</span>
                        </button>
                        {showSortDropdown && (
                            <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-[9999] overflow-hidden">
                                <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-sky-50 to-blue-50 dark:from-gray-900 dark:to-gray-900">
                                    <p className="text-xs font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wider">
                                        Sort Treatment Plans
                                    </p>
                                </div>
                                <div className="p-2">
                                    <button
                                        onClick={() => {
                                            setSortBy('diagnosis')
                                            setSortOrders({...sortOrders, diagnosis: sortOrders.diagnosis === 'asc' ? 'desc' : 'asc'})
                                        }}
                                        className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 flex items-center justify-between gap-3 ${
                                            sortBy === 'diagnosis'
                                                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <svg className={`w-4 h-4 ${sortBy === 'diagnosis' ? 'text-white' : 'text-sky-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            <span className="font-medium">Diagnosis</span>
                                        </div>
                                        {sortBy === 'diagnosis' && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {sortOrders.diagnosis === 'asc' ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                )}
                                            </svg>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSortBy('planNumber')
                                            setSortOrders({...sortOrders, planNumber: sortOrders.planNumber === 'asc' ? 'desc' : 'asc'})
                                        }}
                                        className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 flex items-center justify-between gap-3 ${
                                            sortBy === 'planNumber'
                                                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <svg className={`w-4 h-4 ${sortBy === 'planNumber' ? 'text-white' : 'text-sky-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                                            </svg>
                                            <span className="font-medium">Plan Number</span>
                                        </div>
                                        {sortBy === 'planNumber' && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {sortOrders.planNumber === 'asc' ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                )}
                                            </svg>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSortBy('speciality')
                                            setSortOrders({...sortOrders, speciality: sortOrders.speciality === 'asc' ? 'desc' : 'asc'})
                                        }}
                                        className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 flex items-center justify-between gap-3 ${
                                            sortBy === 'speciality'
                                                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <svg className={`w-4 h-4 ${sortBy === 'speciality' ? 'text-white' : 'text-sky-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                                            </svg>
                                            <span className="font-medium">Speciality</span>
                                        </div>
                                        {sortBy === 'speciality' && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {sortOrders.speciality === 'asc' ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                )}
                                            </svg>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSortBy('organ')
                                            setSortOrders({...sortOrders, organ: sortOrders.organ === 'asc' ? 'desc' : 'asc'})
                                        }}
                                        className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 flex items-center justify-between gap-3 ${
                                            sortBy === 'organ'
                                                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <svg className={`w-4 h-4 ${sortBy === 'organ' ? 'text-white' : 'text-sky-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                            </svg>
                                            <span className="font-medium">Organ</span>
                                        </div>
                                        {sortBy === 'organ' && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {sortOrders.organ === 'asc' ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                )}
                                            </svg>
                                        )}
                                    </button>
                                </div>
                            </div>
                        )}  
                    </div>
                    
                    {/* Filter Button */}
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="px-2 sm:px-4 py-2.5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-sky-400 dark:hover:border-sky-600 transition-all duration-200 flex items-center gap-2 font-medium text-sm shadow-sm hover:shadow-md"
                    >
                        <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                        <span className="hidden sm:inline">Filters</span>
                    </button>
                    {(searchQuery || filterSystems || filterPulseDiagnosis || filterSpeciality || filterOrgan) && (
                        <button
                            onClick={() => {
                                setSearchQuery('')
                                setFilterSystems('')
                                setFilterPulseDiagnosis('')
                                setFilterSpeciality('')
                                setFilterOrgan('')
                            }}
                            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                            Clear All
                        </button>
                    )}
                </div>

                {/* Filter Panel */}
                {showFilters && (
                    <div className="border-t dark:border-gray-700 pt-4 mt-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4" style={{ overflow: 'visible' }}>
                            {/* Systems Filter */}
                            <div className={isFilterSystemsOpen ? 'relative z-[10000]' : 'relative z-0'}>
                                <label className="block text-sm font-medium mb-2">Systems</label>
                                <CustomSelect
                                    value={filterSystems}
                                    onChange={(value) => setFilterSystems(value)}
                                    options={[
                                        { value: '', label: 'All Systems' },
                                        ...systems.sort((a, b) => String(a?.label || a || '').localeCompare(String(b?.label || b || ''))).map(s => ({ value: s?.value || s, label: s?.label || s }))
                                    ]}
                                    placeholder="All Systems"
                                    onOpenChange={setIsFilterSystemsOpen}
                                    loading={loadingOptions}
                                />
                            </div>

                            {/* Pulse Diagnosis Filter */}
                            <div className={isFilterPulseDiagnosisOpen ? 'relative z-[10000]' : 'relative z-0'}>
                                <label className="block text-sm font-medium mb-2">Pulse Diagnosis</label>
                                <CustomSelect
                                    value={filterPulseDiagnosis}
                                    onChange={(value) => setFilterPulseDiagnosis(value)}
                                    options={[
                                        { value: '', label: 'All Pulse Diagnosis' },
                                        ...pulseDiagnosis.filter(p => p.value !== '')
                                    ]}
                                    placeholder="All Pulse Diagnosis"
                                    onOpenChange={setIsFilterPulseDiagnosisOpen}
                                    loading={loadingOptions}
                                />
                            </div>

                            {/* Speciality Filter */}
                            <div className={isFilterSpecialityOpen ? 'relative z-[10000]' : 'relative z-0'}>
                                <label className="block text-sm font-medium mb-2">Speciality</label>
                                <CustomSelect
                                    value={filterSpeciality}
                                    onChange={(value) => setFilterSpeciality(value)}
                                    options={[
                                        { value: '', label: 'All Specialities' },
                                        ...speciality.sort((a, b) => String(a.label || a).localeCompare(String(b.label || b))).map(s => ({ value: s.value || s, label: s.label || s }))
                                    ]}
                                    placeholder="All Specialities"
                                    onOpenChange={setIsFilterSpecialityOpen}
                                    loading={loadingOptions}
                                />
                            </div>
                            
                            {/* Organ Filter */}
                            <div className={isFilterOrganOpen ? 'relative z-[10000]' : 'relative z-0'}>
                                <label className="block text-sm font-medium mb-2">Organ</label>
                                <CustomSelect
                                    value={filterOrgan}
                                    onChange={(value) => setFilterOrgan(value)}
                                    options={[
                                        { value: '', label: 'All Organs' },
                                        ...organs.sort((a, b) => String(a.label || a).localeCompare(String(b.label || b))).map(o => ({ value: o.value || o, label: o.label || o }))
                                    ]}
                                    placeholder="All Organs"
                                    onOpenChange={setIsFilterOrganOpen}
                                    loading={loadingOptions}
                                />
                            </div>
                        </div>

                        {/* Active Filters Display */}
                        {(filterSystems || filterPulseDiagnosis || filterSpeciality || filterOrgan) && (
                            <div className="mt-4 flex flex-wrap gap-2">
                                <span className="text-sm font-medium">Active Filters:</span>
                                {filterSystems && (
                                    <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm flex items-center gap-2">
                                        {filterSystems}
                                        <button onClick={() => setFilterSystems('')} className="hover:text-blue-600">×</button>
                                    </span>
                                )}
                                {filterPulseDiagnosis && (
                                    <span className="px-3 py-1 bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-200 rounded-full text-sm flex items-center gap-2">
                                        {filterPulseDiagnosis}
                                        <button onClick={() => setFilterPulseDiagnosis('')} className="hover:text-sky-600">×</button>
                                    </span>
                                )}
                                {filterSpeciality && (
                                    <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full text-sm flex items-center gap-2">
                                        {filterSpeciality}
                                        <button onClick={() => setFilterSpeciality('')} className="hover:text-purple-600">×</button>
                                    </span>
                                )}
                                {filterOrgan && (
                                    <span className="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full text-sm flex items-center gap-2">
                                        {filterOrgan}
                                        <button onClick={() => setFilterOrgan('')} className="hover:text-green-600">×</button>
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Treatments Table */}
            <div className="relative rounded-xl border border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-br from-white via-blue-50 to-sky-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 shadow-lg shadow-blue-500/10 p-4 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                <div className="relative">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-3">
                        <label className="relative group/checkbox cursor-pointer flex-shrink-0">
                            <input
                                type="checkbox"
                                checked={filteredItems.length > 0 && filteredItems.every((t: any) => selectedTreatmentIds.has(t.id))}
                                onChange={() => {
                                    toggleSelectAll(filteredItems)
                                }}
                                className="peer sr-only"
                            />
                            <div className="w-6 h-6 border-2 border-sky-400 dark:border-sky-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-sky-500 peer-checked:to-blue-600 peer-checked:border-sky-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-sky-500/50 group-hover/checkbox:border-sky-500 group-hover/checkbox:scale-110">
                                <svg className="w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <div className="absolute inset-0 rounded-md bg-sky-400 opacity-0 peer-checked:opacity-20 blur-md transition-opacity duration-200 pointer-events-none"></div>
                        </label>
                        <span>Treatment Plans</span>
                        {selectedTreatmentIds.size > 0 && (
                            <span className="px-2 py-0.5 bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-400 rounded-full text-xs font-bold">
                                {selectedTreatmentIds.size} selected
                            </span>
                        )}
                        <span className="badge">
                            {filteredItems.length} treatments
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowNewOnly(prev => !prev)}
                            className={`px-2 py-0.5 text-xs rounded-full font-bold transition-all ${showNewOnly ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md' : 'bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900'}`}
                            title={showNewOnly ? 'Show all treatments' : 'Show only NEW treatments'}
                        >
                            NEW {newBadgeCount > 0 ? `(${newBadgeCount})` : ''}
                        </button>
                    </h3>
                </div>
                {(() => {
                    if (loading) {
                        return (
                            <div className="flex flex-col items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                                <p className="text-muted">Loading treatments...</p>
                            </div>
                        )
                    }
                    
                    if (filteredItems.length === 0 && (searchQuery || filterSystems || filterPulseDiagnosis || filterSpeciality || filterOrgan || showNewOnly)) {
                        return (
                            <div className="text-center py-12 text-muted">
                                <p className="text-lg mb-2">{showNewOnly ? 'No new treatments found' : 'No treatments found'}</p>
                                <p className="text-sm">{showNewOnly ? 'Turn off NEW filter or adjust your search/filters' : 'Try adjusting your search query'}</p>
                            </div>
                        )
                    }
                    
                    if (filteredItems.length === 0) {
                        return (
                            <div className="text-center py-12 text-muted">
                                <p className="text-lg mb-2">No treatments available yet</p>
                                <p className="text-sm">Click "Add New Treatment" to get started</p>
                            </div>
                        )
                    }
                    
                    return (
                        <div className="space-y-2">
                            {(() => {
                                // Prioritize treatments created today
                                const sortedItems = [...filteredItems].sort((a: any, b: any) => {
                                    const aIsNew = isTreatmentNew(a)
                                    const bIsNew = isTreatmentNew(b)
                                    if (aIsNew && !bIsNew) return -1
                                    if (!aIsNew && bIsNew) return 1
                                    
                                    // Apply selected sort
                                    let compareResult = 0
                                    if (sortBy === 'diagnosis') {
                                        compareResult = (a.provDiagnosis || '').localeCompare(b.provDiagnosis || '')
                                    } else if (sortBy === 'planNumber') {
                                        compareResult = (a.planNumber || '00').localeCompare(b.planNumber || '00')
                                    } else if (sortBy === 'speciality') {
                                        compareResult = (a.speciality || '').localeCompare(b.speciality || '')
                                    } else if (sortBy === 'organ') {
                                        compareResult = (a.organ || '').localeCompare(b.organ || '')
                                    }
                                    return sortOrders[sortBy] === 'asc' ? compareResult : -compareResult
                                })
                                
                                // Group treatments by provDiagnosis
                                const groupedByDiagnosis = sortedItems.reduce((acc: any, t: any) => {
                                const key = t.provDiagnosis || 'Unknown'
                                if (!acc[key]) {
                                    acc[key] = []
                                }
                                acc[key].push(t)
                                return acc
                            }, {})

                            // Sort each group by plan number (within the group)
                            Object.keys(groupedByDiagnosis).forEach(key => {
                                groupedByDiagnosis[key].sort((a: any, b: any) => {
                                    const aNum = a.planNumber || '00'
                                    const bNum = b.planNumber || '00'
                                    return aNum.localeCompare(bNum)
                                })
                            })

                            const groupedEntries = Object.entries(groupedByDiagnosis)

                            return (
                                <>
                                <ThemedScrollArea className="space-y-3 max-h-[44rem] pr-1">
                                {groupedEntries.map(([diagnosis, treatments]: [string, any]) => {
                                const firstTreatment = treatments[0]
                                const groupKey = `diagnosis-${diagnosis}`
                                const isExpanded = expandedRows.has(groupKey as any)
                                
                                return (
                                    <div key={groupKey} className="border border-blue-100 dark:border-blue-800 rounded-lg overflow-hidden hover:shadow-lg hover:shadow-blue-100 dark:hover:shadow-blue-900/20 transition-shadow duration-200">
                                        {/* Summary Row */}
                                        <div className="bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-950/50 dark:to-sky-950/50 p-3 flex items-center gap-3 border-b border-blue-100 dark:border-blue-800">
                                            {/* Checkbox for selecting all plans in this diagnosis */}
                                            <div className="flex-shrink-0">
                                                <label className="relative group/checkbox cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={treatments.every((t: any) => selectedTreatmentIds.has(t.id))}
                                                        onChange={() => {
                                                            const allSelected = treatments.every((t: any) => selectedTreatmentIds.has(t.id))
                                                            const newSelected = new Set(selectedTreatmentIds)
                                                            
                                                            treatments.forEach((t: any) => {
                                                                if (allSelected) {
                                                                    newSelected.delete(t.id)
                                                                } else {
                                                                    newSelected.add(t.id)
                                                                }
                                                            })
                                                            
                                                            setSelectedTreatmentIds(newSelected)
                                                        }}
                                                        className="peer sr-only"
                                                        title="Select all plans in this diagnosis"
                                                    />
                                                    <div className="w-6 h-6 border-2 border-blue-400 dark:border-blue-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-blue-500 peer-checked:to-sky-600 peer-checked:border-blue-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-blue-500/50 group-hover/checkbox:border-blue-500 group-hover/checkbox:scale-110">
                                                        <svg className="w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    </div>
                                                    <div className="absolute inset-0 rounded-md bg-blue-400 opacity-0 peer-checked:opacity-20 blur-md transition-opacity duration-200 pointer-events-none"></div>
                                                </label>
                                            </div>
                                            
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <div className="font-semibold text-sm">{diagnosis}</div>
                                                    {treatments.some((t: any) => isTreatmentNew(t)) && (
                                                        <span className="px-2 py-0.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white text-xs rounded-full font-bold shadow-md">
                                                            NEW
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted mt-0.5">
                                                    {firstTreatment.speciality} • {firstTreatment.organ} • {firstTreatment.diseaseAction}
                                                    <span className="ml-2 px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded">
                                                        {treatments.length} plan{treatments.length > 1 ? 's' : ''}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                                <button
                                                    onClick={() => {
                                                        const params = new URLSearchParams({
                                                            diagnosis: firstTreatment.provDiagnosis || '',
                                                            speciality: firstTreatment.speciality || '',
                                                            organ: firstTreatment.organ || '',
                                                            diseaseAction: firstTreatment.diseaseAction || ''
                                                        })
                                                        router.push(`/treatments/form?new=true&${params.toString()}`)
                                                    }}
                                                    className="px-2 sm:px-3 py-1.5 text-xs bg-sky-600 hover:bg-sky-700 text-white rounded flex items-center gap-1"
                                                    title="Add Plan"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                                    </svg>
                                                    <span className="hidden sm:inline">Add Plan</span>
                                                </button>
                                                <button
                                                    onClick={() => openDeleteAllConfirmation(diagnosis, treatments.map((t: any) => t.id))}
                                                    className="px-2 sm:px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded flex items-center gap-1"
                                                    title="Delete All Plans"
                                                >
                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                    <span className="hidden sm:inline">Delete All</span>
                                                </button>
                                                <button
                                                    onClick={() => toggleRowExpansion(groupKey as any)}
                                                    className="px-2 sm:px-3 py-1.5 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded flex items-center gap-1"
                                                    title={isExpanded ? "Hide Details" : "View More"}
                                                >
                                                    {isExpanded ? (
                                                        <>
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                            </svg>
                                                            <span className="hidden sm:inline">Hide</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <svg className="w-3 h-3 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                            <span className="hidden sm:inline">View More</span>
                                                            <svg className="w-3 h-3 hidden sm:inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expanded Details - Show all plans */}
                                        {isExpanded && (() => {
                                            // Get or set the selected plan index for this diagnosis
                                            const selectedIndex = selectedPlanByDiagnosis[groupKey] ?? 0
                                            const selectedTreatment = treatments[selectedIndex] || treatments[0]
                                            
                                            return (
                                                <div className="p-4 bg-white dark:bg-gray-900 space-y-4">
                                                    {/* Basic Info (common across all plans) */}
                                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pb-3 border-b border-gray-200 dark:border-gray-700">
                                                        <div>
                                                            <div className="text-xs text-muted mb-1">Speciality</div>
                                                            <div className="text-sm font-medium">{firstTreatment.speciality || '-'}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-muted mb-1">Imbalance</div>
                                                            <div className="text-sm font-medium">{firstTreatment.imbalance || '-'}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-muted mb-1">Systems</div>
                                                            <div className="text-sm font-medium">{firstTreatment.systems || '-'}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-muted mb-1">Organ</div>
                                                            <div className="text-sm font-medium">{firstTreatment.organ || '-'}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-muted mb-1">Disease Action</div>
                                                            <div className="text-sm font-medium">{firstTreatment.diseaseAction || '-'}</div>
                                                        </div>
                                                        <div>
                                                            <div className="text-xs text-muted mb-1">Pulse Diagnosis</div>
                                                            <div className="text-sm font-medium">{firstTreatment.pulseDiagnosis || '-'}</div>
                                                        </div>
                                                    </div>

                                                    {/* Plan Selector with Checkboxes */}
                                                    <div className="space-y-1.5 pb-3 border-b border-gray-200 dark:border-gray-700">
                                                        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide block mb-2">Plans</label>
                                                        {treatments.map((t: any, idx: number) => {
                                                            const isSelected = selectedTreatmentIds.has(t.id)
                                                            const isCurrentPlan = idx === selectedIndex
                                                            const isDeleting = deletingIds.has(t.id)
                                                            
                                                            return (
                                                                <div 
                                                                    key={t.id} 
                                                                    className={`flex items-center gap-2 p-2 rounded ${isDeleting ? 'transition-all duration-700 ease-in-out opacity-0 -translate-x-full scale-95' : 'transition-all duration-300'} ${
                                                                        isCurrentPlan 
                                                                            ? 'bg-blue-50 dark:bg-blue-900/10' 
                                                                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                                                    }`}
                                                                >
                                                                    {isDeleting ? (
                                                                        <div className="w-full p-6 text-center bg-red-50 dark:bg-red-950/30 animate-pulse">
                                                                            <span className="text-red-600 dark:text-red-400 font-bold text-lg">Deleting...</span>
                                                                        </div>
                                                                    ) : (
                                                                        <>
                                                                    <label className="relative group/checkbox cursor-pointer flex-shrink-0">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isSelected}
                                                                            onChange={() => toggleTreatmentSelection(t.id)}
                                                                            className="peer sr-only"
                                                                        />
                                                                        <div className="w-5 h-5 border-2 border-sky-400 dark:border-sky-600 rounded bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-sky-500 peer-checked:to-blue-600 peer-checked:border-sky-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-md peer-checked:shadow-sky-500/50 group-hover/checkbox:border-sky-500 group-hover/checkbox:scale-110">
                                                                            <svg className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                                                            </svg>
                                                                        </div>
                                                                        <div className="absolute inset-0 rounded bg-sky-400 opacity-0 peer-checked:opacity-20 blur-sm transition-opacity duration-200 pointer-events-none"></div>
                                                                    </label>
                                                                    <div 
                                                                        className="flex-1 cursor-pointer select-none"
                                                                        onClick={() => {
                                                                            setSelectedPlanByDiagnosis({
                                                                                ...selectedPlanByDiagnosis,
                                                                                [groupKey]: idx
                                                                            })
                                                                        }}
                                                                    >
                                                                        <span className="text-sm text-gray-700 dark:text-gray-300">
                                                                            Plan {treatments.length === 1 ? '1' : (t.planNumber || (idx + 1))}
                                                                        </span>
                                                                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                                                                            {t.treatmentPlan || diagnosis}
                                                                        </span>
                                                                        {isCurrentPlan && (
                                                                            <span className="ml-2 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded">Viewing</span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-1">
                                                                        <button
                                                                            onClick={() => router.push(`/treatments/form?id=${t.id}&edit=true`)}
                                                                            className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                                                                            title="Edit"
                                                                        >
                                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                            </svg>
                                                                        </button>
                                                                        <button
                                                                            onClick={() => openDeleteConfirmation(t.id)}
                                                                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                                                            title="Delete"
                                                                        >
                                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                            </svg>
                                                                        </button>
                                                                    </div>
                                                                </>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>

                                                    {/* Selected Treatment Plan Details */}
                                                    <div>
                                                        <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                                                            {/* Plan Header */}
                                                            <div className="mb-3">
                                                                <div className="font-semibold text-base mb-2">
                                                                    Plan {treatments.length === 1 ? '1' : (selectedTreatment.planNumber || '-')}: {selectedTreatment.treatmentPlan || diagnosis}
                                                                </div>
                                                            </div>

                                                            {/* Plan Details */}
                                                            <div className="grid grid-cols-2 gap-3 mb-3">
                                                                {selectedTreatment.administration && (
                                                                    <div>
                                                                        <div className="text-xs text-muted mb-1">Administration</div>
                                                                        <div className="text-sm font-medium">{selectedTreatment.administration}</div>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            {/* Notes */}
                                                            {selectedTreatment.notes && (
                                                                <div className="mb-3">
                                                                    <div className="text-xs text-muted mb-1">Notes</div>
                                                                    <div className="text-sm p-2 bg-white dark:bg-gray-900 rounded border">
                                                                        {selectedTreatment.notes}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Medicines */}
                                                            <div>
                                                                <div className="text-xs font-semibold mb-2">Medicines ({selectedTreatment.treatmentProducts?.length || 0})</div>
                                                                {selectedTreatment.treatmentProducts && selectedTreatment.treatmentProducts.length > 0 ? (
                                                                    <div className="space-y-2">
                                                                        {selectedTreatment.treatmentProducts.map((tp: any, idx: number) => (
                                                                            <div key={tp.id} className="p-2 bg-white dark:bg-gray-900 rounded border border-gray-300 dark:border-gray-600">
                                                                                <div className="flex items-start justify-between mb-1">
                                                                                    <div className="font-semibold text-xs">{tp.product?.name || 'Unknown Medicine'}</div>
                                                                                    <div className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-1.5 py-0.5 rounded">
                                                                                        Qty: {tp.quantity || '-'}
                                                                                    </div>
                                                                                </div>
                                                                                
                                                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-1 text-[10px]">
                                                                                    {(tp.spy1 || tp.spy2 || tp.spy3 || tp.spy4 || tp.spy5 || tp.spy6) && (
                                                                                        <div className="col-span-2 md:col-span-3">
                                                                                            <span className="text-muted">SPY: </span>
                                                                                            <span className="font-medium">
                                                                                                {[tp.spy1, tp.spy2, tp.spy3, tp.spy4, tp.spy5, tp.spy6].filter(Boolean).map(s => (s || '').replace(/\|/g, '/')).join(', ')}
                                                                                            </span>
                                                                                        </div>
                                                                                    )}
                                                                                    {(tp.addition1 || tp.addition2 || tp.addition3) && (
                                                                                        <div className="col-span-2 md:col-span-3">
                                                                                            <span className="text-muted">Additions: </span>
                                                                                            <span className="font-medium">
                                                                                                {[tp.addition1, tp.addition2, tp.addition3].filter(Boolean).map(a => (a || '').replace(/\|/g, '/')).join(', ')}
                                                                                            </span>
                                                                                        </div>
                                                                                    )}
                                                                                    {tp.timing && (
                                                                                        <div>
                                                                                            <span className="text-muted">Timing: </span>
                                                                                            <span className="font-medium">{(tp.timing || '').replace(/\|/g, '/')}</span>
                                                                                        </div>
                                                                                    )}
                                                                                    {tp.dosage && (
                                                                                        <div>
                                                                                            <span className="text-muted">Dosage: </span>
                                                                                            <span className="font-medium">{(tp.dosage || '').replace(/\|/g, '/')}</span>
                                                                                        </div>
                                                                                    )}
                                                                                    {tp.additions && (
                                                                                        <div>
                                                                                            <span className="text-muted">Additions: </span>
                                                                                            <span className="font-medium">{(tp.additions || '').replace(/\|/g, '/')}</span>
                                                                                        </div>
                                                                                    )}
                                                                                    {tp.procedure && (
                                                                                        <div>
                                                                                            <span className="text-muted">Procedure: </span>
                                                                                            <span className="font-medium">{(tp.procedure || '').replace(/\|/g, '/')}</span>
                                                                                        </div>
                                                                                    )}
                                                                                    {tp.presentation && (
                                                                                        <div>
                                                                                            <span className="text-muted">Presentation: </span>
                                                                                            <span className="font-medium">{tp.presentation}</span>
                                                                                        </div>
                                                                                    )}
                                                                                    {tp.administration && (
                                                                                        <div>
                                                                                            <span className="text-muted">Site: </span>
                                                                                            <span className="font-medium">{tp.administration}</span>
                                                                                        </div>
                                                                                    )}
                                                                                    {tp.droppersToday !== null && tp.droppersToday !== undefined && (
                                                                                        <div>
                                                                                            <span className="text-muted">Droppers Today: </span>
                                                                                            <span className="font-medium">{tp.droppersToday}</span>
                                                                                        </div>
                                                                                    )}
                                                                                    {tp.medicineQuantity !== null && tp.medicineQuantity !== undefined && (
                                                                                        <div>
                                                                                            <span className="text-muted">Medicine Qty: </span>
                                                                                            <span className="font-medium">{tp.medicineQuantity}</span>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-xs text-muted italic p-2 bg-white dark:bg-gray-900 rounded">
                                                                        No medicines added
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })()}
                                    </div>
                                )
                            })}
                                </ThemedScrollArea>
                            </>
                            )
                            })()}
                        </div>
                    )
                })()}
                </div>
            </div>

            {/* Floating Export Button */}
            {selectedTreatmentIds.size > 0 && (
                <div className="relative">
                    <button
                        onClick={() => setShowExportDropdown(!showExportDropdown)}
                        className="fixed bottom-8 right-40 z-50 group mobile-safe-page-fab-export"
                        title={`Export ${selectedTreatmentIds.size} selected treatment(s)`}
                    >
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-r from-sky-500 to-blue-600 rounded-full blur-xl opacity-75 group-hover:opacity-100 transition-opacity duration-200"></div>
                            <div className="relative w-14 h-14 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 transform group-hover:scale-110">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                </svg>
                                <span className="absolute -top-1 -right-1 min-w-[24px] h-5 px-1.5 bg-sky-600 text-white rounded-full text-xs font-bold flex items-center justify-center shadow-lg ring-2 ring-white">
                                    {selectedTreatmentIds.size}
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
            {selectedTreatmentIds.size > 0 && (
                <button
                    onClick={deleteSelectedTreatments}
                    className="fixed bottom-8 right-24 z-50 group mobile-safe-page-fab-delete"
                    title={`Delete ${selectedTreatmentIds.size} selected treatment(s)`}
                >
                    <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-rose-600 rounded-full blur-xl opacity-75 group-hover:opacity-100 transition-opacity duration-200 animate-pulse"></div>
                        <div className="relative w-14 h-14 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 transform group-hover:scale-110">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span className="absolute -top-1 -right-1 min-w-[24px] h-5 px-1.5 bg-red-600 text-white rounded-full text-xs font-bold flex items-center justify-center shadow-lg ring-2 ring-white">
                                {selectedTreatmentIds.size}
                            </span>
                        </div>
                    </div>
                </button>
            )}
        </div>
    )
}

// Protect this page - only doctors and admins can access
export default requireDoctorOrAdmin(TreatmentsPage)
