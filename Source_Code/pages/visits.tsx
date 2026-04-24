import { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'
import ImportVisitsModal from '../components/ImportVisitsModal'
import PatientSelectionModal from '../components/PatientSelectionModal'
import CameraModal from '../components/CameraModal'
import ReportsPreviewModal from '../components/ReportsPreviewModal'
import { useToast } from '../hooks/useToast'
import { useImportContext } from '../contexts/ImportContext'
import { useDataCache } from '../contexts/DataCacheContext'
import { useDoctor } from '../contexts/DoctorContext'
import RefreshButton from '../components/RefreshButton'
import PhoneNumber from '../components/PhoneNumber'
import ImagePreviewModal from '../components/ImagePreviewModal'
import { getCachedCurrentUser, setCachedCurrentUser } from '../lib/currentUserStorage'
import { isBasicPlan } from '../lib/subscription'
import StandardFeatureBadge from '../components/StandardFeatureBadge'
import ThemedScrollArea from '../components/ThemedScrollArea'

export default function VisitsPage() {
    const router = useRouter()
    const [visits, setVisits] = useState<any[]>([])
    const [patients, setPatients] = useState<any[]>([])
    const [form, setForm] = useState({ patientId: '', opdNo: '', diagnoses: '' })
    const [searchQuery, setSearchQuery] = useState('')
    const [sortBy, setSortBy] = useState<'patientName' | 'date' | 'opdNo' | 'visitType' | 'complaint'>('date')
    const [sortOrders, setSortOrders] = useState<{[key: string]: 'asc' | 'desc'}>({
        patientName: 'asc',
        date: 'desc',
        opdNo: 'asc',
        visitType: 'asc',
        complaint: 'asc'
    })
    const [showSortDropdown, setShowSortDropdown] = useState(false)
    const { user } = useAuth()
    const isBasicSubscription = isBasicPlan(user?.clinic?.subscriptionPlan)
    const [loading, setLoading] = useState(true)
    const [deleting, setDeleting] = useState(false)
    const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set())
    const [visitToDelete, setVisitToDelete] = useState<any>(null)
    const [confirmModalAnimating, setConfirmModalAnimating] = useState(false)
    const [singleDeleteStep, setSingleDeleteStep] = useState<1 | 2>(1)
    const [bulkDeleteStep, setBulkDeleteStep] = useState<1 | 2>(1)
    const [showImportModal, setShowImportModal] = useState(false)
    const [showExportDropdown, setShowExportDropdown] = useState(false)
    const [selectedVisitIds, setSelectedVisitIds] = useState<Set<number>>(new Set())
    const [showPatientModal, setShowPatientModal] = useState(false)
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
    const [showDeleteSelectedConfirm, setShowDeleteSelectedConfirm] = useState(false)
    const [deleteProgress, setDeleteProgress] = useState({ current: 0, total: 0 })
    const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null)
    const [isDeleteMinimized, setIsDeleteMinimized] = useState(false)
    const [cancelDeleteRequested, setCancelDeleteRequested] = useState(false)
    const [showCancelDeleteConfirm, setShowCancelDeleteConfirm] = useState(false)
    const isPatient = user?.role?.toLowerCase() === 'user'
    const isReceptionist = user?.role?.toLowerCase() === 'receptionist'
    const { toasts, removeToast, showSuccess, showError, showInfo } = useToast()
    const { addTask, updateTask, cancelTask } = useImportContext()
    const { getCache, setCache } = useDataCache()
    const { selectedDoctorId } = useDoctor()
    
    // Report upload states for receptionists
    const [uploadingReports, setUploadingReports] = useState(false)
    const [showCameraModal, setShowCameraModal] = useState(false)
    const [currentUploadVisit, setCurrentUploadVisit] = useState<any>(null)
    const [showReportsPreview, setShowReportsPreview] = useState(false)
    const [currentReportsForPreview, setCurrentReportsForPreview] = useState<Array<{ url: string, name: string, type: string }>>([])
    const [currentPreviewVisitId, setCurrentPreviewVisitId] = useState<number | null>(null)
    
    // Image preview modal states
    const [showImagePreviewModal, setShowImagePreviewModal] = useState(false)
    const [previewImageUrl, setPreviewImageUrl] = useState('')
    const [previewPatientName, setPreviewPatientName] = useState('')
    
    // Listen for maximize events from notification dropdown
    useEffect(() => {
        const handleMaximize = (e: any) => {
            if (e.detail.type === 'visits' && e.detail.operation === 'delete' && e.detail.taskId === deleteTaskId) {
                setIsDeleteMinimized(false)
            }
        }
        window.addEventListener('maximizeTask', handleMaximize)
        return () => window.removeEventListener('maximizeTask', handleMaximize)
    }, [deleteTaskId])
    


    const fetchVisits = useCallback(async () => {
        setLoading(true)
        try {
            const params = new URLSearchParams({ limit: '10000', includePrescriptions: 'false' })
            if (selectedDoctorId) params.append('doctorId', selectedDoctorId.toString())
            
            const [visitsResponse, patientsData] = await Promise.all([
                fetch(`/api/visits?${params}`).then(r => r.json()),
                fetch(`/api/patients${selectedDoctorId ? `?doctorId=${selectedDoctorId}` : ''}`).then(r => r.json())
            ])
            
            
            // Check for API error
            if (visitsResponse.error) {
                setVisits([])
                setPatients(patientsData)
                return
            }
            
            
            // Handle paginated response
            const visitsData = Array.isArray(visitsResponse.data) ? visitsResponse.data : 
                               Array.isArray(visitsResponse) ? visitsResponse : []
            
            
            // Filter visits for user role - show only their own visits
            let filteredVisits = visitsData
            if (user?.role?.toLowerCase() === 'user') {
                filteredVisits = visitsData.filter((v: any) => 
                    v.patient?.email === user.email || v.patient?.phone === user.phone
                )
            }
            
            
            setVisits(filteredVisits)
            setPatients(patientsData)
            setCache('visits', visitsData)
        } catch (err) {
            setVisits([])
            setPatients([])
        } finally {
            setLoading(false)
        }
    }, [user, selectedDoctorId, setCache])

    useEffect(() => {
        if (!user) return
        
        const cachedVisits = getCache<any[]>('visits')
        if (cachedVisits) {
            // Apply filtering for cached data
            let filteredVisits = cachedVisits
            if (user?.role?.toLowerCase() === 'user') {
                filteredVisits = cachedVisits.filter((v: any) => 
                    v.patient?.email === user.email || v.patient?.phone === user.phone
                )
            }
            setVisits(filteredVisits)
            setLoading(false)
        } else {
            fetchVisits()
        }
        
        // Cleanup on unmount
        return () => {
            setVisits([])
        }
    }, [user, selectedDoctorId, fetchVisits, getCache])
    
    // Listen for doctor change events
    useEffect(() => {
        const handleDoctorChange = () => {
            if (user) fetchVisits()
        }
        
        window.addEventListener('doctor-changed', handleDoctorChange)
        return () => window.removeEventListener('doctor-changed', handleDoctorChange)
    }, [user, fetchVisits])

    async function create(e: any) {
        e.preventDefault()
        const response = await fetch('/api/visits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
        if (response.ok) {
            const newVisit = await response.json()
            const params = new URLSearchParams({ limit: '10000', includePrescriptions: 'false' })
            if (selectedDoctorId) params.append('doctorId', selectedDoctorId.toString())
            const allVisitsResponse = await (await fetch(`/api/visits?${params}`)).json()
            const allVisits = Array.isArray(allVisitsResponse.data) ? allVisitsResponse.data : 
                              Array.isArray(allVisitsResponse) ? allVisitsResponse : []
            setVisits(allVisits)
        } else {
            const params = new URLSearchParams({ limit: '10000', includePrescriptions: 'false' })
            if (selectedDoctorId) params.append('doctorId', selectedDoctorId.toString())
            const visitsResponse = await (await fetch(`/api/visits?${params}`)).json()
            const visitsArray = Array.isArray(visitsResponse.data) ? visitsResponse.data : 
                                Array.isArray(visitsResponse) ? visitsResponse : []
            setVisits(visitsArray)
        }
        setForm({ patientId: '', opdNo: '', diagnoses: '' })
    }

    function openDeleteModal(visit: any) {
        setVisitToDelete(visit)
        setSingleDeleteStep(1)
        setConfirmModalAnimating(false)
    }

    function closeConfirmModal() {
        setConfirmModalAnimating(true)
        setTimeout(() => {
            setVisitToDelete(null)
            setConfirmModalAnimating(false)
            setSingleDeleteStep(1)
        }, 300)
    }

    async function handleConfirmDelete() {
        if (!visitToDelete) return
        
        // Immediately show deleting state
        setDeletingIds(new Set([visitToDelete.id]))
        
        // Show "Deleting..." text for 1.5 seconds so it's clearly visible
        await new Promise(resolve => setTimeout(resolve, 1500))
        
        setDeleting(true)
        
        try {
            // Start the delete API call
            const res = await fetch(`/api/visits?id=${visitToDelete.id}`, { method: 'DELETE' })
            if (res.ok) {
                // Wait for fade animation (700ms) before updating the list
                await new Promise(resolve => setTimeout(resolve, 700))
                
                // NOW update the list - item fades out first, then gets removed
                showSuccess('Visit deleted successfully')
                closeConfirmModal()
                const visitsArray = Array.isArray(visits) ? visits : []
                setVisits(visitsArray.filter(v => v.id !== visitToDelete.id))
                setCache('visits', visitsArray.filter(v => v.id !== visitToDelete.id))
                
                setDeletingIds(new Set())
            } else {
                const error = await res.json().catch(() => ({ error: 'Failed to delete visit' }))
                showError(error.error || 'Failed to delete visit')
                setDeletingIds(new Set())
            }
        } catch (err) {
            showError('Failed to delete visit')
            setDeletingIds(new Set())
        } finally {
            setDeleting(false)
        }
    }

    function toggleVisitSelection(id: number) {
        const newSelected = new Set(selectedVisitIds)
        if (newSelected.has(id)) {
            newSelected.delete(id)
        } else {
            newSelected.add(id)
        }
        setSelectedVisitIds(newSelected)
    }

    function toggleSelectAll() {
        const visitsArray = Array.isArray(visits) ? visits : []
        const filteredVisits = visitsArray.filter((v: any) => {
            const patientName = `${v.patient?.firstName || ''} ${v.patient?.lastName || ''}`.toLowerCase()
            const opdNo = (v.opdNo || '').toLowerCase()
            const search = searchQuery.toLowerCase()
            return patientName.includes(search) || opdNo.includes(search)
        })
        
        if (selectedVisitIds.size === filteredVisits.length) {
            setSelectedVisitIds(new Set())
        } else {
            setSelectedVisitIds(new Set(filteredVisits.map((v: any) => v.id)))
        }
    }

    function toggleRowExpansion(id: string | number) {
        const newExpanded = new Set(expandedRows)
        const key = typeof id === 'string' ? id : String(id)
        if (newExpanded.has(key)) {
            newExpanded.delete(key)
        } else {
            newExpanded.add(key)
        }
        setExpandedRows(newExpanded)
    }

    async function deleteSelectedVisits() {
        if (selectedVisitIds.size === 0) return
        
        setShowDeleteSelectedConfirm(false)
        setBulkDeleteStep(1)
        setDeleting(true)
        setCancelDeleteRequested(false)
        
        const idsArray = Array.from(selectedVisitIds)
        const total = idsArray.length
        setDeleteProgress({ current: 0, total })
        
        // Create task in global context
        const id = addTask({
            type: 'visits',
            operation: 'delete',
            status: 'deleting',
            progress: { current: 0, total }
        })
        setDeleteTaskId(id)
        
        try {
            let completed = 0
            const deletedIds: number[] = []
            
            // Delete in batches for speed
            const BATCH_SIZE = 20
            const batches = []
            for (let i = 0; i < idsArray.length; i += BATCH_SIZE) {
                batches.push(idsArray.slice(i, i + BATCH_SIZE))
            }
            
            
            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                // Check if cancel was requested at start of batch
                if (cancelDeleteRequested) {
                    cancelTask(id)
                    
                    // Remove already deleted items from UI
                    if (deletedIds.length > 0) {
                        const visitsArray = Array.isArray(visits) ? visits : []
                        setVisits(visitsArray.filter(v => !deletedIds.includes(v.id)))
                        setSelectedVisitIds(new Set(idsArray.filter(id => !deletedIds.includes(id))))
                    }
                    
                    setDeleting(false)
                    setDeleteProgress({ current: 0, total: 0 })
                    setDeleteTaskId(null)
                    setIsDeleteMinimized(false)
                    setCancelDeleteRequested(false)
                    return
                }
                
                const batch = batches[batchIndex]
                const batchStartIndex = batchIndex * BATCH_SIZE
                
                // Delete all items in batch concurrently
                const deletePromises = batch.map(visitId =>
                    fetch(`/api/visits?id=${visitId}`, { method: 'DELETE' })
                        .then(() => visitId)
                        .catch(err => {
                            return null
                        })
                )
                
                const results = await Promise.all(deletePromises)
                
                // Track successfully deleted IDs
                results.forEach(visitId => {
                    if (visitId !== null) {
                        deletedIds.push(visitId)
                        completed++
                    }
                })
                
                // Update progress for each item in the batch
                for (let i = 0; i < batch.length; i++) {
                    const currentProgress = batchStartIndex + i + 1
                    setDeleteProgress({ current: currentProgress, total })
                    updateTask(id, {
                        progress: { current: currentProgress, total }
                    })
                }
            }
            
            // Remove deleted visits from UI
            const visitsArray = Array.isArray(visits) ? visits : []
            setVisits(visitsArray.filter(v => !deletedIds.includes(v.id)))
            setSelectedVisitIds(new Set())
            
            // Update task to success
            updateTask(id, {
                status: 'success',
                summary: { success: completed, errors: total - completed },
                endTime: Date.now()
            })
            
            showSuccess(`${completed} visit(s) deleted successfully`)
        } catch (err) {
            
            // Update task to error
            if (id) {
                updateTask(id, {
                    status: 'error',
                    error: 'Failed to delete some visits',
                    endTime: Date.now()
                })
            }
            
            showError('Failed to delete some visits')
        } finally {
            setDeleting(false)
            setDeleteProgress({ current: 0, total: 0 })
            setDeleteTaskId(null)
            setIsDeleteMinimized(false)
            setCancelDeleteRequested(false)
        }
    }

    const handleCancelDelete = () => {
        setShowCancelDeleteConfirm(true)
    }

    const confirmCancelDelete = () => {
        setCancelDeleteRequested(true)
        setShowCancelDeleteConfirm(false)
    }

    // Report upload functions for receptionists
    async function handleReportFileUpload(visit: any, e: React.ChangeEvent<HTMLInputElement>) {
        const files = e.target.files
        if (!files || files.length === 0) return

        const patient = patients.find(p => p.id === visit.patientId)
        if (!patient) {
            showError('Patient information not found')
            e.target.value = ''
            return
        }

        // Get existing reports
        let existingReports: Array<{ url: string, name: string, type: string }> = []
        try {
            if (visit.reportsAttachments) {
                existingReports = JSON.parse(visit.reportsAttachments)
            }
        } catch (err) {
        }

        if (existingReports.length + files.length > 10) {
            showError('You can upload a maximum of 10 files per visit')
            e.target.value = ''
            return
        }

        setUploadingReports(true)
        try {
            const uploadedFiles: Array<{ url: string, name: string, type: string }> = []
            const patientName = `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Unknown Patient'

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

            // Update visit with new reports
            const updatedReports = [...existingReports, ...uploadedFiles]
            const updateRes = await fetch(`/api/visits`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...visit,
                    id: visit.id,
                    patientId: visit.patientId,
                    reportsAttachments: JSON.stringify(updatedReports)
                })
            })

            if (updateRes.ok) {
                // Update local state
                const visitsArray = Array.isArray(visits) ? visits : []
                setVisits(visitsArray.map((v: any) => 
                    v.id === visit.id 
                        ? { ...v, reportsAttachments: JSON.stringify(updatedReports) }
                        : v
                ))
                showSuccess(`${uploadedFiles.length} report(s) uploaded successfully`)
            } else {
                throw new Error('Failed to update visit with new reports')
            }
        } catch (error: any) {
            showError(`Failed to upload reports: ${error.message || 'Unknown error'}`)
        } finally {
            setUploadingReports(false)
            e.target.value = ''
        }
    }

    async function handleCameraCapture(imageData: string) {
        if (!currentUploadVisit) {
            showError('Visit information not found')
            return
        }

        const patient = patients.find(p => p.id === currentUploadVisit.patientId)
        if (!patient) {
            showError('Patient information not found')
            return
        }

        // Get existing reports
        let existingReports: Array<{ url: string, name: string, type: string }> = []
        try {
            if (currentUploadVisit.reportsAttachments) {
                existingReports = JSON.parse(currentUploadVisit.reportsAttachments)
            }
        } catch (err) {
        }

        if (existingReports.length >= 10) {
            showError('Maximum 10 files per visit reached')
            return
        }

        setUploadingReports(true)
        try {
            const patientName = `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || 'Unknown Patient'
            const fileName = `report_${Date.now()}.jpg`

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
                const updatedReports = [...existingReports, {
                    url: data.webViewLink,
                    name: fileName,
                    type: 'image/jpeg'
                }]

                // Update visit with new reports
                const updateRes = await fetch(`/api/visits`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...currentUploadVisit,
                        id: currentUploadVisit.id,
                        patientId: currentUploadVisit.patientId,
                        reportsAttachments: JSON.stringify(updatedReports)
                    })
                })

                if (updateRes.ok) {
                    // Update local state
                    const visitsArray = Array.isArray(visits) ? visits : []
                    setVisits(visitsArray.map((v: any) => 
                        v.id === currentUploadVisit.id 
                            ? { ...v, reportsAttachments: JSON.stringify(updatedReports) }
                            : v
                    ))
                    showSuccess('Report captured and uploaded successfully')
                } else {
                    throw new Error('Failed to update visit with captured image')
                }
            } else {
                throw new Error(data.error || 'Failed to upload captured image')
            }
        } catch (error: any) {
            showError(`Failed to upload image: ${error.message || 'Unknown error'}`)
        } finally {
            setUploadingReports(false)
            setShowCameraModal(false)
            setCurrentUploadVisit(null)
        }
    }

    function openCameraForVisit(visit: any) {
        setCurrentUploadVisit(visit)
        setShowCameraModal(true)
    }

    function openReportsPreview(visit: any) {
        let reports: Array<{ url: string, name: string, type: string }> = []
        try {
            if (visit.reportsAttachments) {
                reports = JSON.parse(visit.reportsAttachments)
            }
        } catch (err) {
        }

        if (reports.length === 0) {
            showInfo('No reports available for this visit yet. Please upload reports first.')
            return
        }

        setCurrentReportsForPreview(reports)
        setCurrentPreviewVisitId(visit.id)
        setShowReportsPreview(true)
    }

    async function handleReportsUpdate(updatedReports: Array<{ url: string, name: string, type: string }>) {
        if (!currentPreviewVisitId) return

        try {
            // Find the visit to get patientId
            const visit = visits.find((v: any) => v.id === currentPreviewVisitId)
            if (!visit) {
                throw new Error('Visit not found')
            }

            const updateRes = await fetch(`/api/visits`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...visit,
                    id: currentPreviewVisitId,
                    patientId: visit.patientId,
                    reportsAttachments: JSON.stringify(updatedReports)
                })
            })

            if (updateRes.ok) {
                // Update local state
                const visitsArray = Array.isArray(visits) ? visits : []
                setVisits(visitsArray.map((v: any) => 
                    v.id === currentPreviewVisitId 
                        ? { ...v, reportsAttachments: JSON.stringify(updatedReports) }
                        : v
                ))
                showSuccess('Reports updated successfully')
            } else {
                throw new Error('Failed to update reports')
            }
        } catch (error: any) {
            showError(`Failed to update reports: ${error.message || 'Unknown error'}`)
        }
    }

    function confirmDeleteSelected() {
        if (selectedVisitIds.size === 0) {
            showError('Please select at least one visit to delete')
            return
        }
        setBulkDeleteStep(1)
        setShowDeleteSelectedConfirm(true)
    }

    function exportData(format: 'csv' | 'json' | 'xlsx') {
        try {
            if (isBasicSubscription) {
                showInfo('Export is available in Standard plan.')
                router.push('/upgrade')
                return
            }

            if (selectedVisitIds.size === 0) {
                showError('Please select at least one visit to export')
                return
            }

            const visitsArray = Array.isArray(visits) ? visits : []
            const selectedVisits = visitsArray.filter((v: any) => selectedVisitIds.has(v.id))

            const dataToExport = selectedVisits.map((v: any) => {
                const patientName = v.patient ? `${v.patient.firstName || ''} ${v.patient.lastName || ''}`.trim() : ''
                const prescriptions = v.prescriptions || []
                
                // Helper function to format date as DD-MM-YYYY
                const formatDate = (dateStr: any): string => {
                    if (!dateStr) return ''
                    try {
                        const date = new Date(dateStr)
                        if (isNaN(date.getTime())) return ''
                        const day = String(date.getDate()).padStart(2, '0')
                        const month = String(date.getMonth() + 1).padStart(2, '0')
                        const year = date.getFullYear()
                        return `${day}-${month}-${year}`
                    } catch {
                        return ''
                    }
                }
                
                // Base visit data matching the template format
                const row: any = {
                    'OPDN': v.opdNo || '',
                    'Date': formatDate(v.date),
                    'Patient Name': patientName,
                    'Address': v.address || v.patient?.address || '',
                    'F/H/G Name': v.patient?.fatherHusbandGuardianName || '',
                    'Mob./Ph': v.phone || v.patient?.phone || '',
                    'AMT': v.amount || '',
                    'DISCOUNT': v.discount || '',
                    'PAYMENT': v.payment || '',
                    'BAL': v.balance || '',
                    'V': v.visitNumber || '', // Visit number
                    'FU': v.followUpCount || '',
                    'Next V': formatDate(v.nextVisit),
                    'Sex': v.gender || v.patient?.gender || '',
                    'DOB': formatDate(v.dob || v.patient?.dob),
                    'Age': v.age || v.patient?.age || '',
                    'Wt': v.weight || '',
                    'Ht': v.height || '',
                    'Temp': v.temperament || '',
                    'PulseD 1': v.pulseDiagnosis || '',
                    'PulseD 2': v.pulseDiagnosis2 || '',
                    'Investigations': v.investigations || '',
                    'Diagnosis': v.diagnoses || v.provisionalDiagnosis || '',
                    'Hist/Reports': v.historyReports || '',
                    'Chief Complaints': v.majorComplaints || '',
                    'Imp': v.improvements || ''
                }
                
                // Add prescription data for up to 12 medicines
                for (let i = 0; i < 12; i++) {
                    const pr = prescriptions[i]
                    const num = String(i + 1).padStart(2, '0') // Format as 01, 02, etc.
                    
                    if (pr) {
                        const productName = pr.product?.name || ''
                        row[`DRN-${num}`] = i + 1 // Dropper number (sequential)
                        row[`DL-${num}`] = pr.spy1 || ''
                        row[`CR-${num}`] = productName
                        row[`SY-${num}`] = pr.spy2 || ''
                        row[`EF-${num}`] = pr.spy3 || ''
                        row[`TM-${num}`] = pr.timing || ''
                        row[`DOSE-${num}`] = pr.dosage || ''
                        row[`AD-${num}`] = pr.addition1 || ''
                        row[`PR-${num}`] = pr.procedure || ''
                        row[`PRE-${num}`] = pr.presentation || ''
                        row[`TDY-${num}`] = pr.droppersToday || ''
                        row[i === 0 ? `QTY-${num}` : `QNTY-${num}`] = pr.quantity || '' // First one is QTY, rest are QNTY
                    } else {
                        row[`DRN-${num}`] = ''
                        row[`DL-${num}`] = ''
                        row[`CR-${num}`] = ''
                        row[`SY-${num}`] = ''
                        row[`EF-${num}`] = ''
                        row[`TM-${num}`] = ''
                        row[`DOSE-${num}`] = ''
                        row[`AD-${num}`] = ''
                        row[`PR-${num}`] = ''
                        row[`PRE-${num}`] = ''
                        row[`TDY-${num}`] = ''
                        row[i === 0 ? `QTY-${num}` : `QNTY-${num}`] = ''
                    }
                }
                
                // Add final columns
                row['PROCEDURE'] = v.procedureAdopted || ''
                row['DISCUSSION'] = v.discussion || ''
                row['EXTRA'] = v.extra || ''
                
                return row
            })

            const timestamp = new Date().toISOString().split('T')[0]
            
            if (format === 'json') {
                const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `visits_${timestamp}.json`
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
                a.download = `visits_${timestamp}.csv`
                a.click()
                URL.revokeObjectURL(url)
            } else if (format === 'xlsx') {
                const ws = XLSX.utils.json_to_sheet(dataToExport)
                const wb = XLSX.utils.book_new()
                XLSX.utils.book_append_sheet(wb, ws, 'Visits')
                XLSX.writeFile(wb, `visits_${timestamp}.xlsx`)
            }
            
            showSuccess(`${selectedVisitIds.size} visit(s) exported as ${format.toUpperCase()}`)
            setShowExportDropdown(false)
        } catch (e) {
            showError('Failed to export visits')
        }
    }

    function getFilteredAndSortedVisits() {
        // Ensure visits is an array
        const visitsArray = Array.isArray(visits) ? visits : []
        
        // First filter by search query
        let filtered = visitsArray.filter(v => {
            if (!searchQuery) return true
            const patientName = (v.patient ? `${v.patient.firstName || ''} ${v.patient.lastName || ''}` : '').toLowerCase()
            const opdNo = (v.opdNo || '').toLowerCase()
            const search = searchQuery.toLowerCase()
            return patientName.includes(search) || opdNo.includes(search)
        })

        // Helper to check if visit is from today
        const isFromToday = (visit: any) => {
            if (!visit.createdAt) return false
            const createdDate = new Date(visit.createdAt).toDateString()
            const today = new Date().toDateString()
            return createdDate === today
        }

        // Then sort
        filtered.sort((a, b) => {
            // Keep visits created today at top
            const aIsNew = isFromToday(a)
            const bIsNew = isFromToday(b)
            if (aIsNew && !bIsNew) return -1
            if (!aIsNew && bIsNew) return 1
            
            let compareResult = 0
            
            if (sortBy === 'patientName') {
                const nameA = (a.patient ? `${a.patient.firstName || ''} ${a.patient.lastName || ''}` : '').toLowerCase()
                const nameB = (b.patient ? `${b.patient.firstName || ''} ${b.patient.lastName || ''}` : '').toLowerCase()
                compareResult = nameA.localeCompare(nameB)
            } else if (sortBy === 'date') {
                const dateA = new Date(a.date || 0).getTime()
                const dateB = new Date(b.date || 0).getTime()
                compareResult = dateA - dateB
            } else if (sortBy === 'opdNo') {
                compareResult = (a.opdNo || '').localeCompare(b.opdNo || '')
            } else if (sortBy === 'visitType') {
                compareResult = (a.visitType || '').localeCompare(b.visitType || '')
            } else if (sortBy === 'complaint') {
                compareResult = (a.complaint || '').localeCompare(b.complaint || '')
            }
            
            return sortOrders[sortBy] === 'asc' ? compareResult : -compareResult
        })

        return filtered
    }

    // Close export dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const target = event.target as HTMLElement
            if (showExportDropdown && !target.closest('.relative')) {
                setShowExportDropdown(false)
            }
            if (showSortDropdown && !target.closest('.sort-dropdown')) {
                setShowSortDropdown(false)
            }
        }
        if (showExportDropdown || showSortDropdown) {
            document.addEventListener('click', handleClickOutside)
        }
        return () => document.removeEventListener('click', handleClickOutside)
    }, [showExportDropdown, showSortDropdown])

    return (
        <div>
            {/* Progress Modal for Deleting - Minimizable */}
            {deleting && deleteProgress.total > 0 && !isDeleteMinimized && (
                <div className="fixed inset-0 bg-black/70 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999]">
                    <div className="relative overflow-hidden rounded-2xl border border-red-200/30 dark:border-red-700/30 bg-gradient-to-br from-white via-red-50/30 to-orange-50/20 dark:from-gray-900 dark:via-red-950/20 dark:to-gray-900 shadow-2xl shadow-red-500/20 max-w-md w-full mx-4">
                        {/* Gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-br from-red-400/5 via-transparent to-orange-500/5 pointer-events-none" />
                        
                        {/* Header with minimize button */}
                        <div className="relative flex items-center justify-between px-6 py-4 border-b border-red-200/30 dark:border-red-700/30">
                            <h3 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600 dark:from-red-400 dark:to-orange-400">
                                Deleting Visits
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

                        {/* Content */}
                        <div className="relative p-8">
                            <div className="text-center">
                                <div className="mb-6 flex justify-center">
                                    <div className="w-20 h-20 bg-gradient-to-br from-red-100 to-orange-100 dark:from-red-900/40 dark:to-orange-900/40 rounded-full shadow-lg shadow-red-500/20 animate-pulse flex items-center justify-center">
                                        <svg className="w-10 h-10 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </div>
                                </div>
                                
                                <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600 dark:from-red-400 dark:to-orange-400 mb-2 tabular-nums">
                                    {deleteProgress.current} / {deleteProgress.total}
                                </div>
                                
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                                    {Math.round((deleteProgress.current / deleteProgress.total) * 100)}% Complete
                                </p>
                                
                                {/* Progress Bar */}
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-5 overflow-hidden shadow-inner">
                                    <div 
                                        className="bg-gradient-to-r from-red-500 via-red-600 to-orange-600 rounded-full shadow-lg shadow-red-500/50 h-5 transition-all duration-300 ease-out flex items-center justify-end pr-2"
                                        style={{ width: `${(deleteProgress.current / deleteProgress.total) * 100}%` }}
                                    >
                                        <span className="text-xs text-white font-medium">
                                            {deleteProgress.current > 0 && `${Math.round((deleteProgress.current / deleteProgress.total) * 100)}%`}
                                        </span>
                                    </div>
                                </div>
                                
                                <p className="text-xs text-gray-500 dark:text-gray-500 mt-4">
                                    Please wait, deleting visit {deleteProgress.current} of {deleteProgress.total}...
                                </p>

                                {/* Cancel Button */}
                                <button
                                    onClick={handleCancelDelete}
                                    className="mt-6 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                                >
                                    Cancel Delete
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                        {isPatient ? 'My Appointments' : 'Patient Visits'}
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Track and manage patient appointments</p>
                </div>
                <div className="flex items-center gap-3">
                    <RefreshButton onRefresh={fetchVisits} />
                    {!isPatient && !isReceptionist && (
                        <>
                            <div className="relative">
                                <button 
                                    onClick={() => setShowExportDropdown(!showExportDropdown)}
                                    className="group relative h-10 sm:h-11 px-2 sm:px-4 py-2.5 bg-gradient-to-r from-blue-500 to-sky-600 hover:from-blue-600 hover:to-sky-700 text-white rounded-lg font-medium text-sm transition-all duration-200 shadow-lg shadow-sky-500/30 flex items-center gap-2"
                                    title={selectedVisitIds.size > 0 ? `Export ${selectedVisitIds.size} selected` : 'Export All'}
                                    aria-label={selectedVisitIds.size > 0 ? `Export ${selectedVisitIds.size} selected` : 'Export All'}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                    </svg>
                                    <span className="hidden sm:inline">{selectedVisitIds.size > 0 ? `Export (${selectedVisitIds.size})` : 'Export All'}</span>
                                    <svg className="w-4 h-4 ml-1 hidden sm:inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                    <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-[9999] overflow-hidden">
                                        <button
                                            onClick={() => exportData('csv')}
                                            className="w-full text-left px-4 py-3 hover:bg-gradient-to-r hover:from-sky-50 hover:to-blue-50 dark:hover:from-gray-700 dark:hover:to-gray-700 transition-all duration-200 flex items-center gap-2 text-sm font-medium"
                                        >
                                            <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            Export as CSV
                                        </button>
                                        <button
                                            onClick={() => exportData('json')}
                                            className="w-full text-left px-4 py-3 hover:bg-gradient-to-r hover:from-sky-50 hover:to-blue-50 dark:hover:from-gray-700 dark:hover:to-gray-700 transition-all duration-200 flex items-center gap-2 text-sm font-medium"
                                        >
                                            <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                                            </svg>
                                            Export as JSON
                                        </button>
                                        <button
                                            onClick={() => exportData('xlsx')}
                                            className="w-full text-left px-4 py-3 hover:bg-gradient-to-r hover:from-sky-50 hover:to-blue-50 dark:hover:from-gray-700 dark:hover:to-gray-700 transition-all duration-200 flex items-center gap-2 text-sm font-medium"
                                        >
                                            <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                            </svg>
                                            Export as XLSX
                                        </button>
                                    </div>
                                )}
                            </div>
                            <button 
                                onClick={() => setShowImportModal(true)} 
                                className="group relative h-10 sm:h-11 px-2 sm:px-4 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-lg font-medium text-sm transition-all duration-200 shadow-lg shadow-sky-500/30 flex items-center gap-2"
                                title="Import visits"
                                aria-label="Import visits"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                <span className="hidden sm:inline">Import</span>
                            </button>
                        </>
                    )}
                    <div className="px-3 py-1.5 bg-gradient-to-r from-sky-100 to-blue-100 dark:from-sky-900/30 dark:to-blue-900/30 text-sky-800 dark:text-sky-300 rounded-lg text-sm font-semibold border border-sky-200 dark:border-sky-800">
                        {getFilteredAndSortedVisits().length} total {isPatient ? 'appointments' : 'visits'}
                    </div>
                    {!isPatient && !isReceptionist && (
                        <button
                            onClick={() => setShowPatientModal(true)}
                            className="h-10 sm:h-11 px-2 sm:px-4 py-2.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white rounded-lg font-semibold text-sm transition-all duration-200 shadow-lg shadow-sky-500/30 flex items-center gap-2"
                            title="Create Visit"
                            aria-label="Create Visit"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            <span className="hidden sm:inline">Create Visit</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Search Bar */}
            <div className="relative rounded-xl border border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-br from-white via-blue-50 to-sky-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 shadow-lg shadow-blue-500/10 p-4 mb-4">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                <div className="relative flex items-center gap-3">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder="🔍 Search visits by patient name or OPD number..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full p-3 pr-10 border border-blue-200 dark:border-blue-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-white"
                        />
                        <svg className="w-5 h-5 absolute right-3 top-1/2 transform -translate-y-1/2 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    
                    {/* Sort Dropdown */}
                    <div className="relative sort-dropdown">
                        <button
                            onClick={() => setShowSortDropdown(!showSortDropdown)}
                            className="px-4 py-2.5 bg-white dark:bg-gray-800 border-2 border-blue-200 dark:border-blue-700 rounded-lg hover:border-blue-400 dark:hover:border-blue-600 transition-all duration-200 flex items-center gap-2 font-medium text-sm shadow-sm hover:shadow-md"
                        >
                            <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                            </svg>
                            <span>Sort</span>
                        </button>
                        {showSortDropdown && (
                            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                                <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-sky-50 to-blue-50 dark:from-gray-900 dark:to-gray-900">
                                    <p className="text-xs font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wider">
                                        Sort By
                                    </p>
                                </div>
                                <div className="p-2">
                                    <button
                                        onClick={() => {
                                            setSortBy('date')
                                            setSortOrders({...sortOrders, date: sortOrders.date === 'asc' ? 'desc' : 'asc'})
                                        }}
                                        className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 flex items-center justify-between gap-3 ${
                                            sortBy === 'date'
                                                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <svg className={`w-4 h-4 ${sortBy === 'date' ? 'text-white' : 'text-sky-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            <span className="font-medium">Visit Date</span>
                                        </div>
                                        {sortBy === 'date' && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {sortOrders.date === 'asc' ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                )}
                                            </svg>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSortBy('patientName')
                                            setSortOrders({...sortOrders, patientName: sortOrders.patientName === 'asc' ? 'desc' : 'asc'})
                                        }}
                                        className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 flex items-center justify-between gap-3 ${
                                            sortBy === 'patientName'
                                                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <svg className={`w-4 h-4 ${sortBy === 'patientName' ? 'text-white' : 'text-sky-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                            </svg>
                                            <span className="font-medium">Patient Name</span>
                                        </div>
                                        {sortBy === 'patientName' && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {sortOrders.patientName === 'asc' ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                )}
                                            </svg>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSortBy('opdNo')
                                            setSortOrders({...sortOrders, opdNo: sortOrders.opdNo === 'asc' ? 'desc' : 'asc'})
                                        }}
                                        className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 flex items-center justify-between gap-3 ${
                                            sortBy === 'opdNo'
                                                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <svg className={`w-4 h-4 ${sortBy === 'opdNo' ? 'text-white' : 'text-sky-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                                            </svg>
                                            <span className="font-medium">OPD Number</span>
                                        </div>
                                        {sortBy === 'opdNo' && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {sortOrders.opdNo === 'asc' ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                )}
                                            </svg>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSortBy('visitType')
                                            setSortOrders({...sortOrders, visitType: sortOrders.visitType === 'asc' ? 'desc' : 'asc'})
                                        }}
                                        className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 flex items-center justify-between gap-3 ${
                                            sortBy === 'visitType'
                                                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <svg className={`w-4 h-4 ${sortBy === 'visitType' ? 'text-white' : 'text-sky-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                            </svg>
                                            <span className="font-medium">Visit Type</span>
                                        </div>
                                        {sortBy === 'visitType' && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {sortOrders.visitType === 'asc' ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                )}
                                            </svg>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSortBy('complaint')
                                            setSortOrders({...sortOrders, complaint: sortOrders.complaint === 'asc' ? 'desc' : 'asc'})
                                        }}
                                        className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 flex items-center justify-between gap-3 ${
                                            sortBy === 'complaint'
                                                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <svg className={`w-4 h-4 ${sortBy === 'complaint' ? 'text-white' : 'text-sky-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            <span className="font-medium">Complaint</span>
                                        </div>
                                        {sortBy === 'complaint' && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {sortOrders.complaint === 'asc' ? (
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
                    
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            className="px-4 py-2.5 bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:from-gray-200 hover:to-gray-300 dark:hover:from-gray-600 dark:hover:to-gray-500 transition-all duration-200 shadow-sm font-medium text-sm"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>

            <div className="relative rounded-xl border border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-br from-white via-blue-50 to-sky-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 shadow-lg shadow-blue-500/10 p-4 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                <div className="relative">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-3">
                    {!isPatient && (
                        <label className="relative group/checkbox cursor-pointer flex-shrink-0">
                            <input
                                type="checkbox"
                                checked={getFilteredAndSortedVisits().length > 0 && selectedVisitIds.size === getFilteredAndSortedVisits().length}
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
                    )}
                    <span>{isPatient ? 'My Appointment History' : 'Visit History'}</span>
                    {!isPatient && selectedVisitIds.size > 0 && (
                        <span className="px-2 py-0.5 bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-400 rounded-full text-xs font-bold">
                            {selectedVisitIds.size} selected
                        </span>
                    )}
                </h3>
                {(() => {
                    const filteredVisits = getFilteredAndSortedVisits()
                    
                    if (loading) {
                        return (
                            <div className="flex flex-col items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mb-4"></div>
                                <p className="text-muted">Loading visits...</p>
                            </div>
                        )
                    }
                    
                    if (filteredVisits.length === 0 && searchQuery) {
                        return (
                            <div className="text-center py-8 text-muted">
                                <p className="text-lg mb-2">No visits found</p>
                                <p className="text-sm">Try adjusting your search query</p>
                            </div>
                        )
                    }
                    
                    if (filteredVisits.length === 0) {
                        return (
                            <div className="text-center py-8 text-muted">
                                {isPatient ? 'You have no appointments yet' : 'No visits recorded yet'}
                            </div>
                        )
                    }
                    
                    // Group visits by patient (using normalized name strictly)
                    const groupedByPatient = filteredVisits.reduce((acc: any, v: any) => {
                        // Create a key using normalized name only (not phone)
                        const normalizedName = `${v.patient?.firstName || ''} ${v.patient?.lastName || ''}`.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '')
                        const patientKey = normalizedName ? `name-${normalizedName}` : `patient-${v.patient?.id || 'unknown'}`
                        
                        if (!acc[patientKey]) {
                            acc[patientKey] = {
                                patient: v.patient,
                                visits: []
                            }
                        }
                        acc[patientKey].visits.push(v)
                        return acc
                    }, {})

                    // Sort visits within each patient group by date (most recent first)
                    Object.keys(groupedByPatient).forEach(key => {
                        groupedByPatient[key].visits.sort((a: any, b: any) => {
                            const dateA = new Date(a.date || 0).getTime()
                            const dateB = new Date(b.date || 0).getTime()
                            return dateB - dateA
                        })
                    })

                    const groupedEntries = Object.entries(groupedByPatient)

                    return (
                        <>
                        <ThemedScrollArea className="space-y-3 max-h-[44rem] pr-1">
                            {groupedEntries.map(([patientKey, data]: [string, any]) => {
                                const { patient, visits } = data
                                const isExpanded = expandedRows.has(patientKey)
                                const mostRecentVisit = visits[0]
                                const allVisitsSelected = visits.every((v: any) => selectedVisitIds.has(v.id))
                                
                                return (
                                    <div key={patientKey} className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
                                        {/* Summary Row */}
                                        <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-850 p-4 flex items-center gap-4">
                                            {/* Checkbox for selecting all visits for this patient (only for non-patient users and non-receptionists) */}
                                            {!isPatient && !isReceptionist && (
                                                <div className="flex-shrink-0">
                                                    <label className="relative group/checkbox cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={allVisitsSelected}
                                                            onChange={() => {
                                                                const newSelected = new Set(selectedVisitIds)
                                                                visits.forEach((v: any) => {
                                                                    if (allVisitsSelected) {
                                                                        newSelected.delete(v.id)
                                                                    } else {
                                                                        newSelected.add(v.id)
                                                                    }
                                                                })
                                                                setSelectedVisitIds(newSelected)
                                                            }}
                                                            className="peer sr-only"
                                                            title="Select all visits for this patient"
                                                        />
                                                        <div className="w-6 h-6 border-2 border-sky-400 dark:border-sky-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-sky-500 peer-checked:to-blue-600 peer-checked:border-sky-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-sky-500/50 group-hover/checkbox:border-sky-500 group-hover/checkbox:scale-110">
                                                            <svg className="w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        </div>
                                                        <div className="absolute inset-0 rounded-md bg-sky-400 opacity-0 peer-checked:opacity-20 blur-md transition-opacity duration-200 pointer-events-none"></div>
                                                    </label>
                                                </div>
                                            )}
                                            
                                            {/* Patient Image Circle */}
                                            <div className="flex-shrink-0">
                                                <img 
                                                    src={patient?.imageUrl && patient.imageUrl.trim() !== '' ? patient.imageUrl : process.env.NEXT_PUBLIC_DEFAULT_PATIENT_IMAGE} 
                                                    alt="Patient" 
                                                    className="w-12 h-12 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600 cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all"
                                                    onClick={() => {
                                                        setPreviewImageUrl(patient?.imageUrl && patient.imageUrl.trim() !== '' ? patient.imageUrl : process.env.NEXT_PUBLIC_DEFAULT_PATIENT_IMAGE || '')
                                                        setPreviewPatientName(`${patient?.firstName || ''} ${patient?.lastName || ''}`.trim())
                                                        setShowImagePreviewModal(true)
                                                    }}
                                                    title="Click to preview image"
                                                    onError={(e) => {
                                                        const target = e.target as HTMLImageElement;
                                                        const defaultImg = process.env.NEXT_PUBLIC_DEFAULT_PATIENT_IMAGE || '/default-patient.png';
                                                        if (target.src !== defaultImg) {
                                                            target.src = defaultImg;
                                                        }
                                                    }}
                                                />
                                            </div>
                                            
                                            {/* Patient Summary */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="font-bold text-base text-gray-900 dark:text-white truncate">
                                                        {([patient?.firstName, patient?.lastName].filter(Boolean).join(' ')) || 'Unknown'}
                                                    </h4>
                                                    {visits.some((v: any) => {
                                                        if (!v.date) return false
                                                        const visitDate = new Date(v.date).toDateString()
                                                        const today = new Date().toDateString()
                                                        return visitDate === today
                                                    }) && (
                                                        <span className="px-2 py-0.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white text-xs rounded-full font-bold shadow-md">
                                                            NEW
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2 flex-wrap mt-1">
                                                    {patient?.phone && (
                                                        <div className="text-xs">
                                                            <PhoneNumber phone={patient.phone} />
                                                        </div>
                                                    )}
                                                    {patient?.email && (
                                                        <div className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400">
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                            </svg>
                                                            <span className="truncate">{patient.email}</span>
                                                        </div>
                                                    )}
                                                    <span className="px-2.5 py-0.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white rounded-full text-xs font-bold shadow-sm">
                                                        {visits.length} visit{visits.length > 1 ? 's' : ''}
                                                    </span>
                                                </div>
                                                {mostRecentVisit && (
                                                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mt-1.5">
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                        </svg>
                                                        <span className="font-medium">Latest:</span>
                                                        <span>{mostRecentVisit.date ? new Date(mostRecentVisit.date).toLocaleDateString('en-GB') : '-'}</span>
                                                        <span className="text-gray-400">•</span>
                                                        <span className="font-mono">OPD: {mostRecentVisit.opdNo}</span>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            {/* Action Button */}
                                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-shrink-0">
                                                {!isReceptionist && (
                                                    <Link
                                                        href={`/visits/compare?patientId=${patient?.id}`}
                                                        className="px-3 sm:px-4 py-2 text-xs font-semibold bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700 text-white rounded-lg shadow-sm transition-all duration-200 flex items-center gap-1.5"
                                                        title="Compare Visits"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                                        </svg>
                                                        <span className="hidden sm:inline">Compare</span>
                                                    </Link>
                                                )}
                                                <button
                                                    onClick={() => toggleRowExpansion(patientKey)}
                                                    className="px-3 sm:px-4 py-2 text-xs font-semibold bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white rounded-lg shadow-sm transition-all duration-200 flex items-center gap-1.5"
                                                    title={isExpanded ? "Hide Details" : "View More"}
                                                >
                                                    {isExpanded ? (
                                                        <>
                                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                            </svg>
                                                            <span className="hidden sm:inline">Hide</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <svg className="w-3.5 h-3.5 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                            <span className="hidden sm:inline">View Visits</span>
                                                            <svg className="w-3.5 h-3.5 hidden sm:block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>

                                        {/* Expanded Details - Show all visits */}
                                        {isExpanded && (
                                            <div className="p-4 bg-white dark:bg-gray-900 space-y-3">
                                                {visits.map((v: any, idx: number) => {
                                                    const isSelected = selectedVisitIds.has(v.id)
                                                    const isDeleting = deletingIds.has(v.id)
                                                    
                                                    return (
                                                        <div key={v.id} className={`p-3 border border-gray-200 dark:border-gray-700 rounded-lg ${isDeleting ? 'transition-all duration-700 ease-in-out opacity-0 -translate-x-full scale-95' : 'transition-all duration-300'} ${isSelected ? 'bg-sky-50/50 dark:bg-sky-900/10 border-sky-400' : ''}`}>
                                                            {isDeleting ? (
                                                                <div className="p-12 text-center bg-red-50 dark:bg-red-950/30 animate-pulse">
                                                                    <span className="text-red-600 dark:text-red-400 font-bold text-2xl">Deleting...</span>
                                                                </div>
                                                            ) : (
                                                            <div className="flex items-start gap-3">
                                                                {/* Individual visit checkbox */}
                                                                {!isPatient && !isReceptionist && (
                                                                    <div className="flex-shrink-0 pt-1">
                                                                        <label className="relative group/checkbox cursor-pointer">
                                                                            <input
                                                                                type="checkbox"
                                                                                checked={isSelected}
                                                                                onChange={() => toggleVisitSelection(v.id)}
                                                                                className="peer sr-only"
                                                                            />
                                                                            <div className="w-5 h-5 border-2 border-sky-400 dark:border-sky-600 rounded bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-sky-500 peer-checked:to-blue-600 peer-checked:border-sky-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-sky-500/50 group-hover/checkbox:border-sky-500 group-hover/checkbox:scale-110">
                                                                                <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                                                                </svg>
                                                                            </div>
                                                                            <div className="absolute inset-0 rounded bg-sky-400 opacity-0 peer-checked:opacity-20 blur-md transition-opacity duration-200 pointer-events-none"></div>
                                                                        </label>
                                                                    </div>
                                                                )}
                                                                
                                                                {/* Visit Details */}
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 mb-1">
                                                                        <span className="font-medium text-sm">Visit #{v.visitNumber || idx + 1}</span>
                                                                        <span className="badge text-xs">OPD: {v.opdNo}</span>
                                                                    </div>
                                                                    <div className="text-xs text-muted space-y-0.5">
                                                                        <div><span className="font-medium">Date:</span> {v.date ? new Date(v.date).toLocaleDateString('en-GB') : '-'}</div>
                                                                        {v.provisionalDiagnosis && (
                                                                            <div><span className="font-medium">Diagnosis:</span> {v.provisionalDiagnosis}</div>
                                                                        )}
                                                                        {v.prescriptions && v.prescriptions.length > 0 && (
                                                                            <div><span className="font-medium">Prescriptions:</span> {v.prescriptions.length} item(s)</div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                
                                                                {/* Action Buttons */}
                                                                <div className="flex flex-col gap-2 self-start flex-shrink-0">
                                                                    {!isReceptionist && (
                                                                        <Link href={`/visits/${v.id}`} className="px-2 sm:px-3 py-1 text-xs bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white rounded font-medium transition-all duration-200" title="View Details">
                                                                            <svg className="w-4 h-4 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                            </svg>
                                                                            <span className="hidden sm:inline">View Details</span>
                                                                        </Link>
                                                                    )}
                                                                    {!isPatient && !isReceptionist && (
                                                                        <>
                                                                            <Link href={`/prescriptions?visitId=${v.id}&edit=true`} className="px-2 sm:px-3 py-1 text-xs bg-gray-600 hover:bg-gray-700 text-white rounded" title="Edit">
                                                                                <svg className="w-4 h-4 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                                </svg>
                                                                                <span className="hidden sm:inline">Edit</span>
                                                                            </Link>
                                                                            <button
                                                                                onClick={() => openDeleteModal(v)}
                                                                                className="px-2 sm:px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
                                                                                title="Delete"
                                                                            >
                                                                                <svg className="w-4 h-4 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                                </svg>
                                                                                <span className="hidden sm:inline">Delete</span>
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                    {isReceptionist && (
                                                                        <>
                                                                            {/* File Upload for Receptionist */}
                                                                            <label className={`${uploadingReports ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                                                                                <input
                                                                                    type="file"
                                                                                    accept="image/*,application/pdf"
                                                                                    multiple
                                                                                    className="hidden"
                                                                                    onChange={(e) => handleReportFileUpload(v, e)}
                                                                                    disabled={uploadingReports}
                                                                                />
                                                                                <div className="px-2 sm:px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded font-medium transition-all duration-200 flex items-center gap-1" title="Upload Report File">
                                                                                    {uploadingReports ? (
                                                                                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                                        </svg>
                                                                                    ) : (
                                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                                        </svg>
                                                                                    )}
                                                                                    <span className="hidden sm:inline">{uploadingReports ? 'Uploading...' : 'Upload File'}</span>
                                                                                </div>
                                                                            </label>
                                                                            {/* Camera Upload for Receptionist */}
                                                                            <button
                                                                                onClick={() => openCameraForVisit(v)}
                                                                                disabled={uploadingReports}
                                                                                className="px-2 sm:px-3 py-1 text-xs bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 disabled:cursor-not-allowed text-white rounded font-medium transition-all duration-200 flex items-center gap-1"
                                                                                title="Capture Report with Camera"
                                                                            >
                                                                                {uploadingReports ? (
                                                                                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                                                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                                    </svg>
                                                                                ) : (
                                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                                    </svg>
                                                                                )}
                                                                                <span className="hidden sm:inline">{uploadingReports ? 'Uploading...' : 'Camera'}</span>
                                                                            </button>
                                                                            {/* Show Preview Button for Receptionist */}
                                                                            <button
                                                                                onClick={() => openReportsPreview(v)}
                                                                                className="px-2 sm:px-3 py-1 text-xs bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white rounded font-medium transition-all duration-200 flex items-center gap-1"
                                                                                title="Preview Reports"
                                                                            >
                                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                                </svg>
                                                                                <span className="hidden sm:inline">
                                                                                    View Reports
                                                                                    {(() => {
                                                                                        try {
                                                                                            const count = v.reportsAttachments ? JSON.parse(v.reportsAttachments).length : 0
                                                                                            return count > 0 ? ` (${count})` : ''
                                                                                        } catch {
                                                                                            return ''
                                                                                        }
                                                                                    })()}
                                                                                </span>
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            )}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )
                            })}
                        </ThemedScrollArea>
                    
                    </>
                    )
                })()}
            </div>

            {/* Toast Notifications */}
            <div className="fixed top-4 right-4 z-50 space-y-2">
                {toasts.map(toast => (
                    <div key={toast.id} className={`px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 min-w-[300px] animate-slideIn ${
                        toast.type === 'success' ? 'bg-sky-500 text-white' :
                        toast.type === 'error' ? 'bg-red-500 text-white' :
                        'bg-sky-500 text-white'
                    }`}>
                        <span className="flex-1">{toast.message}</span>
                        <button onClick={() => removeToast(toast.id)} className="text-white hover:text-gray-200">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                ))}
            </div>

            {/* Delete Confirmation Modal */}
            {visitToDelete && (
                <div 
                    className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] transition-opacity duration-300 ${
                        confirmModalAnimating ? 'opacity-0' : 'opacity-100'
                    }`}
                    onClick={closeConfirmModal}
                >
                    <div 
                        className={`bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl transition-transform duration-300 ${
                            confirmModalAnimating ? 'scale-95' : 'scale-100'
                        }`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
                                <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{singleDeleteStep === 1 ? 'Delete Visit' : 'Final Confirmation'}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">This action cannot be undone</p>
                            </div>
                        </div>
                        <p className="text-gray-700 dark:text-gray-300 mb-6">
                            {singleDeleteStep === 1
                                ? <>Are you sure you want to delete the visit for <span className="font-semibold">{[visitToDelete.patient?.firstName, visitToDelete.patient?.lastName].filter(Boolean).join(' ') || 'Unknown'}</span> (OPD: {visitToDelete.opdNo})?</>
                                : 'This will permanently remove the selected visit and cannot be reversed. Do you want to continue?'}
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={closeConfirmModal}
                                disabled={deleting}
                                className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 font-medium disabled:opacity-50 shadow-sm hover:shadow-md"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    if (singleDeleteStep === 1) {
                                        setSingleDeleteStep(2)
                                        return
                                    }
                                    handleConfirmDelete()
                                }}
                                disabled={deleting}
                                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white font-semibold shadow-lg shadow-red-500/30 hover:shadow-xl hover:shadow-red-500/40 transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
                            >
                                {deleting && (
                                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                )}
                                {deleting ? 'Deleting...' : (singleDeleteStep === 1 ? 'Review Impact' : 'Delete Visit')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ImportVisitsModal 
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                onImportSuccess={() => {
                    const params = new URLSearchParams()
                    if (selectedDoctorId) params.append('doctorId', selectedDoctorId.toString())
                    fetch(`/api/visits${params.toString() ? `?${params}` : ''}`)
                        .then(r => r.json())
                        .then(data => setVisits(data))
                    showSuccess('Visits imported successfully!')
                }}
            />

            {/* Floating Export Button */}
            {!isPatient && selectedVisitIds.size > 0 && (
                <div className="relative">
                    <button
                        onClick={() => setShowExportDropdown(!showExportDropdown)}
                        className="fixed bottom-8 right-40 z-50 group mobile-safe-page-fab-export"
                        title={`Export ${selectedVisitIds.size} selected visit(s)`}
                    >
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-r from-sky-500 to-blue-600 rounded-full blur-xl opacity-75 group-hover:opacity-100 transition-opacity duration-200"></div>
                            <div className="relative w-14 h-14 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 transform group-hover:scale-110">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                </svg>
                                <span className="absolute -top-1 -right-1 min-w-[24px] h-5 px-1.5 bg-sky-600 text-white rounded-full text-xs font-bold flex items-center justify-center shadow-lg ring-2 ring-white">
                                    {selectedVisitIds.size}
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
            {!isPatient && !isReceptionist && selectedVisitIds.size > 0 && (
                <button
                    onClick={confirmDeleteSelected}
                    className="fixed bottom-8 right-24 z-50 group mobile-safe-page-fab-delete"
                    title={`Delete ${selectedVisitIds.size} selected visit(s)`}
                >
                    <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-rose-600 rounded-full blur-xl opacity-75 group-hover:opacity-100 transition-opacity duration-200 animate-pulse"></div>
                        <div className="relative w-14 h-14 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 transform group-hover:scale-110">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span className="absolute -top-1 -right-1 min-w-[24px] h-5 px-1.5 bg-red-600 text-white rounded-full text-xs font-bold flex items-center justify-center shadow-lg ring-2 ring-white">
                                {selectedVisitIds.size}
                            </span>
                        </div>
                    </div>
                </button>
            )}

            <PatientSelectionModal
                isOpen={showPatientModal}
                onClose={() => setShowPatientModal(false)}
            />

            {/* Delete Selected Confirmation Modal */}
            {showDeleteSelectedConfirm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
                    <div className="relative overflow-hidden rounded-2xl border border-red-200/30 dark:border-red-700/30 bg-gradient-to-br from-white via-red-50/30 to-orange-50/20 dark:from-gray-900 dark:via-red-950/20 dark:to-gray-900 shadow-lg shadow-red-500/20 backdrop-blur-sm max-w-md w-full mx-4">
                        <div className="absolute inset-0 bg-gradient-to-br from-red-400/5 via-transparent to-orange-500/5 pointer-events-none"></div>
                        <div className="relative p-6">
                            <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full">
                                <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold text-center mb-2 text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600 dark:from-red-400 dark:to-orange-400">
                                {bulkDeleteStep === 1 ? 'Confirm Delete' : 'Final Confirmation'}
                            </h3>
                            <p className="text-sm text-center text-gray-600 dark:text-gray-400 mb-6">
                                {bulkDeleteStep === 1
                                    ? `Are you sure you want to delete ${selectedVisitIds.size} selected visit(s)? This action cannot be undone.`
                                    : 'This will permanently remove all selected visits and cannot be reversed. Do you want to continue?'}
                            </p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setShowDeleteSelectedConfirm(false)
                                        setBulkDeleteStep(1)
                                    }}
                                    className="flex-1 px-4 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                                    disabled={deleting}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        if (bulkDeleteStep === 1) {
                                            setBulkDeleteStep(2)
                                            return
                                        }
                                        deleteSelectedVisits()
                                    }}
                                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors font-medium shadow-md"
                                    disabled={deleting}
                                >
                                    {deleting && (
                                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    )}
                                    {deleting ? 'Deleting...' : (bulkDeleteStep === 1 ? 'Review Impact' : 'Yes, Delete')}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Button */}
            {!isPatient && !isReceptionist && (
                <button
                    onClick={() => setShowPatientModal(true)}
                    className="fixed bottom-8 right-8 z-50 group mobile-safe-page-fab-primary"
                    title="Create Visit with Prescription"
                >
                    <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-full blur-xl opacity-75 group-hover:opacity-100 transition-opacity duration-200"></div>
                        <div className="relative w-14 h-14 bg-gradient-to-r from-blue-600 to-cyan-700 hover:from-blue-700 hover:to-cyan-800 text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 transform group-hover:scale-110 group-hover:rotate-90">
                            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                            </svg>
                        </div>
                    </div>
                </button>
            )}

            {/* Cancel Delete Confirmation Modal */}
            {showCancelDeleteConfirm && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999]">
                    <div className="relative rounded-xl border border-red-200/30 dark:border-red-700/30 bg-gradient-to-br from-white via-red-50/30 to-orange-50/20 dark:from-gray-900 dark:via-red-950/20 dark:to-gray-900 shadow-2xl shadow-red-500/20 backdrop-blur-sm max-w-md w-full mx-4 overflow-hidden">
                        {/* Animated gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-br from-red-400/5 via-transparent to-orange-500/5 pointer-events-none"></div>
                        
                        <div className="relative p-6">
                            <div className="flex items-start gap-4">
                                <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-gradient-to-br from-red-500/20 to-orange-500/20 backdrop-blur-sm border border-red-300/30 dark:border-red-600/30">
                                    <svg className="w-6 h-6 text-red-600 dark:text-red-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600 dark:from-red-400 dark:to-orange-400 mb-2">
                                        Cancel Delete Operation
                                    </h3>
                                    <p className="text-sm text-gray-700 dark:text-gray-300 mb-6 leading-relaxed">
                                        Are you sure you want to cancel this delete operation? Already deleted items cannot be recovered.
                                    </p>
                                    <div className="flex justify-end gap-3">
                                        <button
                                            onClick={() => setShowCancelDeleteConfirm(false)}
                                            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors border border-gray-300 dark:border-gray-600"
                                        >
                                            No, Continue Deleting
                                        </button>
                                        <button
                                            onClick={confirmCancelDelete}
                                            className="px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 rounded-lg transition-all duration-200 shadow-lg shadow-red-500/30 hover:shadow-red-500/50 hover:scale-105"
                                        >
                                            Yes, Cancel Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Camera Modal for Receptionist Report Upload */}
            <CameraModal
                isOpen={showCameraModal}
                onClose={() => {
                    setShowCameraModal(false)
                    setCurrentUploadVisit(null)
                }}
                onCapture={handleCameraCapture}
                title="Capture Report Document"
            />

            {/* Reports Preview Modal for Receptionist */}
            <ReportsPreviewModal
                isOpen={showReportsPreview}
                onClose={() => {
                    setShowReportsPreview(false)
                    setCurrentReportsForPreview([])
                    setCurrentPreviewVisitId(null)
                }}
                reports={currentReportsForPreview}
                onUpdate={handleReportsUpdate}
                readOnly={false}
            />
            
            {/* Image Preview Modal */}
            <ImagePreviewModal
                isOpen={showImagePreviewModal}
                imageUrl={previewImageUrl}
                patientName={previewPatientName}
                onClose={() => setShowImagePreviewModal(false)}
            />
            </div>
        </div>
    )
}
