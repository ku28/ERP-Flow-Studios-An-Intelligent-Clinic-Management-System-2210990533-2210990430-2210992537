import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'
import LoadingModal from '../components/LoadingModal'
import ToastNotification from '../components/ToastNotification'
import CustomSelect from '../components/CustomSelect'
import { useToast } from '../hooks/useToast'
import { useDataCache } from '../contexts/DataCacheContext'
import { useImportContext } from '../contexts/ImportContext'
import { useDefaultValues } from '../hooks/useDefaultValues'
import RefreshButton from '../components/RefreshButton'
import * as XLSX from 'xlsx'
import { formatPrice, formatQuantity, formatCurrency, formatPatientId } from '../lib/utils'
import { isBasicPlan } from '../lib/subscription'
import { notifyAndroidDownloadProgress } from '../lib/mobileNotifications'
import { sharePdfWithFallback, downloadPdfBlob } from '../lib/pdfShare'
import StandardFeatureBadge from '../components/StandardFeatureBadge'
import ThemedScrollArea from '../components/ThemedScrollArea'

export default function InvoicesPage() {
    const router = useRouter()
    const { defaults: invoiceDefaults } = useDefaultValues('invoices')
    const [invoices, setInvoices] = useState<any[]>([])
    const [patients, setPatients] = useState<any[]>([])
    const [products, setProducts] = useState<any[]>([])
    const [editingId, setEditingId] = useState<number | null>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isAnimating, setIsAnimating] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [deleteId, setDeleteId] = useState<number | null>(null)
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
    const [paymentInvoice, setPaymentInvoice] = useState<any>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [filterStatus, setFilterStatus] = useState('')
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<number>>(new Set())
    const [sortField, setSortField] = useState<string>('createdAt')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
    const [showSortDropdown, setShowSortDropdown] = useState(false)
    const [showExportDropdown, setShowExportDropdown] = useState(false)
    const [isImportModalOpen, setIsImportModalOpen] = useState(false)
    const [deleteProgress, setDeleteProgress] = useState({ current: 0, total: 0 })
    const [isDeleteMinimized, setIsDeleteMinimized] = useState(false)
    const [currentGenerationTaskId, setCurrentGenerationTaskId] = useState<string | null>(null)
    const [generationAbortController, setGenerationAbortController] = useState<AbortController | null>(null)
    const [isGeneratingModalOpen, setIsGeneratingModalOpen] = useState(false)
    const [confirmModal, setConfirmModal] = useState<{ open: boolean; id?: number; deleteMultiple?: boolean; message?: string }>({ open: false })
    const [confirmModalAnimating, setConfirmModalAnimating] = useState(false)
    const [confirmStep, setConfirmStep] = useState<1 | 2>(1)
    const [showCancelGenerationConfirm, setShowCancelGenerationConfirm] = useState(false)
    const [cancelConfirmAnimating, setCancelConfirmAnimating] = useState(false)
    const { user } = useAuth()
    const [clinicImages, setClinicImages] = useState<{
        header: string
        signature: string
    }>({ header: '', signature: '' })
    const [isFilterStatusOpen, setIsFilterStatusOpen] = useState(false)
    const [isPatientSelectOpen, setIsPatientSelectOpen] = useState(false)
    const [isProductSelectOpen, setIsProductSelectOpen] = useState<{[key: number]: boolean}>({})
    const [isPaymentMethodOpen, setIsPaymentMethodOpen] = useState(false)
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)
    const [printModalAnimating, setPrintModalAnimating] = useState(false)
    const [printModalStep, setPrintModalStep] = useState<1 | 2>(1)
    const [currentPrintInvoice, setCurrentPrintInvoice] = useState<any>(null)
    const [printAction, setPrintAction] = useState<'print' | 'download' | 'share' | 'preview'>('print')
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
    const [previewModalAnimating, setPreviewModalAnimating] = useState(false)
    const [previewInvoice, setPreviewInvoice] = useState<any>(null)
    const [previewZoom, setPreviewZoom] = useState(100)
    const [showPreviewExportDropdown, setShowPreviewExportDropdown] = useState(false)
    const [doctors, setDoctors] = useState<any[]>([])
    const [bottlePricing, setBottlePricing] = useState<any[]>([])
    const [invoiceDetails, setInvoiceDetails] = useState({
        manufacturer: '',
        expiry: '',
        taxPercent: invoiceDefaults?.gstRate?.toString() || '5',
        assignedBy: '',
        processingFees: invoiceDefaults?.consultationFees?.toString() || '0',
        itemBatches: {} as Record<string, string>
    })
    const { toasts, removeToast, showSuccess, showError, showInfo } = useToast()
        const isBasicSubscription = isBasicPlan(user?.clinic?.subscriptionPlan)

    const { getCache, setCache } = useDataCache()
    const importContext = useImportContext()

    const emptyForm = {
        patientId: '',
        customerName: '',
        customerEmail: '',
        customerPhone: '',
        customerAddress: '',
        customerGSTIN: '',
        invoiceDate: new Date().toISOString().split('T')[0],
        dueDate: '',
        discount: '',
        processingFees: invoiceDefaults?.consultationFees?.toString() || '0',
        notes: '',
        termsAndConditions: 'Payment due within 30 days. Late payments may incur interest charges.',
        items: [{ productId: '', description: '', quantity: '', unitPrice: '', taxRate: invoiceDefaults?.gst || '5', discount: '' }]
    }

    const [form, setForm] = useState(emptyForm)
    const [paymentForm, setPaymentForm] = useState({
        amount: '',
        paymentMethod: 'CASH',
        transactionId: ''
    })

    useEffect(() => {
        // Check cache first
        const cachedInvoices = getCache<any[]>('invoices')
        const cachedPatients = getCache<any[]>('patients')
        const cachedProducts = getCache<any[]>('products')
        
        if (cachedInvoices) {
            setInvoices(cachedInvoices)
        }
        if (cachedPatients) {
            setPatients(cachedPatients)
        }
        if (cachedProducts) {
            setProducts(cachedProducts)
        }
        
        // Fetch in background if cache exists, or show loading if no cache
        if (cachedInvoices && cachedPatients && cachedProducts) {
            fetchInitialData()
        } else {
            fetchInitialData()
        }
        
        // Cleanup on unmount to prevent data flashing
        return () => {
            setInvoices([])
            setPatients([])
            setProducts([])
        }
    }, [])

    // Set clinic images from auth user
    useEffect(() => {
        if (user?.clinic) {
            setClinicImages({
                header: user.clinic.prescriptionHeaderUrl || '/header.png',
                signature: user.clinic.prescriptionSignatureUrl || '/signature.png'
            })
        }
    }, [user])
    
    // Load clinic-specific invoice details after user is fetched
    useEffect(() => {
        if (!user || !user.clinicId) return
        
        // Load saved invoice details from localStorage with clinic-specific key
        const storageKey = `invoiceDetails_${user.clinicId}`
        const savedDetails = localStorage.getItem(storageKey)
        if (savedDetails) {
            try {
                const parsed = JSON.parse(savedDetails)
                setInvoiceDetails({
                    ...parsed,
                    taxPercent: parsed.taxPercent || invoiceDefaults?.gstRate?.toString() || '5',
                    processingFees: parsed.processingFees || invoiceDefaults?.consultationFees?.toString() || '0',
                    itemBatches: {}
                })
            } catch (e) {
            }
        } else {
            // Set tax and processing fees from defaults if no saved details
            setInvoiceDetails(prev => ({
                ...prev,
                taxPercent: invoiceDefaults?.gstRate?.toString() || '5',
                processingFees: invoiceDefaults?.consultationFees?.toString() || '0',
                itemBatches: {}
            }))
        }
    }, [user, invoiceDefaults])

    // Separate effect for fetching doctors and bottle pricing
    useEffect(() => {
        // Fetch doctors list
        fetch('/api/doctors/list')
            .then(r => r.json())
            .then(data => setDoctors(data.doctors || []))
            .catch(() => {})
        
        // Fetch bottle pricing
        fetch('/api/options/bottle-pricing')
            .then(r => r.json())
            .then(data => setBottlePricing(Array.isArray(data) ? data : []))
            .catch(() => {})
    }, [])

    // Separate effect for maximize event listener
    useEffect(() => {
        const handleMaximize = (event: any) => {
            const { taskId, type, operation } = event.detail
            // Open the modal if it's an invoice generation task
            if (type === 'invoices' && operation === 'generate') {
                setCurrentGenerationTaskId(taskId)
                setIsGeneratingModalOpen(true)
            }
        }
        window.addEventListener('maximizeTask', handleMaximize)
        return () => window.removeEventListener('maximizeTask', handleMaximize)
    }, [])

    const fetchInitialData = async () => {
        setLoading(true)
        try {
            await Promise.all([
                fetchInvoices(),
                fetchPatients(),
                fetchProducts()
            ])
        } finally {
            setLoading(false)
        }
    }

    const fetchInvoices = async () => {
        const response = await fetch('/api/customer-invoices')
        const data = await response.json()
        const invoicesData = Array.isArray(data) ? data : []
        setInvoices(invoicesData)
        setCache('invoices', invoicesData)
    }

    const fetchPatients = async () => {
        // Use cached patients data from DataCacheContext
        const cachedPatients = getCache('patients')
        if (cachedPatients) {
            setPatients(Array.isArray(cachedPatients) ? cachedPatients : [])
        }
    }

    const fetchProducts = async () => {
        const response = await fetch('/api/products/public')
        const data = await response.json()
        setProducts(Array.isArray(data) ? data : [])
    }

    async function handleSubmit(e: any) {
        e.preventDefault()
        setSubmitting(true)
        try {
            const validItems = form.items.filter(item =>
                (item.productId || item.description) && item.quantity && item.unitPrice
            )

            if (validItems.length === 0) {
                showError('Please add at least one item to the invoice')
                setSubmitting(false)
                return
            }

            const payload = {
                patientId: form.patientId ? Number(form.patientId) : null,
                customerName: form.customerName,
                customerEmail: form.customerEmail || null,
                customerPhone: form.customerPhone || null,
                customerAddress: form.customerAddress || null,
                customerGSTIN: form.customerGSTIN || null,
                invoiceDate: form.invoiceDate,
                dueDate: form.dueDate || null,
                discount: form.discount ? Number(form.discount) : 0,
                processingFees: form.processingFees ? Number(form.processingFees) : 0,
                notes: form.notes || null,
                termsAndConditions: form.termsAndConditions || null,
                items: validItems.map(item => ({
                    productId: item.productId ? Number(item.productId) : null,
                    description: item.description,
                    quantity: Number(item.quantity),
                    unitPrice: Number(item.unitPrice),
                    taxRate: item.taxRate ? Number(item.taxRate) : 0,
                    discount: item.discount ? Number(item.discount) : 0
                }))
            }

            const response = await fetch(editingId ? `/api/customer-invoices/${editingId}` : '/api/customer-invoices', {
                method: editingId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (response.ok) {
                await fetchInvoices()
                closeModal()
                showSuccess(editingId ? 'Invoice updated successfully!' : 'Invoice created successfully!')
            } else {
                const error = await response.json()
                showError('Failed: ' + (error.error || 'Unknown error'))
            }
        } catch (error) {
            showError('Failed to save invoice')
        } finally {
            setSubmitting(false)
        }
    }

    function addItem() {
        const defaultTaxRate = invoiceDefaults?.gst || '5'
        setForm({
            ...form,
            items: [...form.items, { productId: '', description: '', quantity: '', unitPrice: '', taxRate: defaultTaxRate, discount: '' }]
        })
    }

    function removeItem(index: number) {
        const newItems = form.items.filter((_, i) => i !== index)
        setForm({ ...form, items: newItems })
    }

    function updateItem(index: number, field: string, value: any) {
        const newItems = [...form.items]
        newItems[index] = { ...newItems[index], [field]: value }

        if (field === 'productId' && value) {
            const product = products.find(p => p.id === Number(value))
            if (product) {
                newItems[index].description = product.name
                newItems[index].unitPrice = (product.priceRupees || 0).toString()
            }
        }

        setForm({ ...form, items: newItems })
    }

    function fillFromPatient(patientId: string) {
        const patient = patients.find(p => p.id === Number(patientId))
        if (patient) {
            setForm({
                ...form,
                patientId,
                customerName: patient.name,
                customerPhone: patient.phone || '',
                customerEmail: patient.email || '',
                customerAddress: patient.address || ''
            })
        }
    }

    function openPaymentModal(invoice: any) {
        setPaymentInvoice(invoice)
        setPaymentForm({
            amount: (invoice.balanceAmount || 0).toString(),
            paymentMethod: 'CASH',
            transactionId: ''
        })
        setIsPaymentModalOpen(true)
        setIsAnimating(false)
        setTimeout(() => setIsAnimating(true), 10)
    }

    async function handlePayment(e: any) {
        e.preventDefault()
        setSubmitting(true)
        try {
            const response = await fetch('/api/customer-invoices', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: paymentInvoice.id,
                    paidAmount: Number(paymentForm.amount),
                    paymentMethod: paymentForm.paymentMethod,
                    transactionId: paymentForm.transactionId || null
                })
            })

            if (response.ok) {
                await fetchInvoices()
                setIsPaymentModalOpen(false)
                setPaymentInvoice(null)
                showSuccess('Payment recorded successfully!')
            } else {
                const error = await response.json()
                showError('Failed: ' + (error.error || 'Unknown error'))
            }
        } catch (error) {
            showError('Failed to record payment')
        } finally {
            setSubmitting(false)
        }
    }

    function closeModal() {
        setIsAnimating(false)
        setTimeout(() => {
            setIsModalOpen(false)
            setForm(emptyForm)
            setEditingId(null)
        }, 200)
    }

    function editInvoice(invoice: any) {
        setEditingId(invoice.id)
        setForm({
            patientId: invoice.patientId ? String(invoice.patientId) : '',
            customerName: invoice.customerName || '',
            customerEmail: invoice.customerEmail || '',
            customerPhone: invoice.customerPhone || '',
            customerAddress: invoice.customerAddress || '',
            customerGSTIN: invoice.customerGSTIN || '',
            invoiceDate: invoice.invoiceDate ? new Date(invoice.invoiceDate).toISOString().split('T')[0] : '',
            dueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().split('T')[0] : '',
            discount: invoice.discount ? String(invoice.discount) : '',
            processingFees: invoice.processingFees !== null && invoice.processingFees !== undefined ? String(invoice.processingFees) : (invoiceDefaults?.consultationFees?.toString() || '0'),
            notes: invoice.notes || '',
            termsAndConditions: invoice.termsAndConditions || 'Payment due within 30 days. Late payments may incur interest charges.',
            items: invoice.items && invoice.items.length > 0 
                ? invoice.items.map((item: any) => ({
                    productId: item.productId ? String(item.productId) : '',
                    description: item.description || '',
                    quantity: String(item.quantity || ''),
                    unitPrice: String(item.unitPrice || ''),
                    taxRate: String(item.taxRate || ''),
                    discount: String(item.discount || '')
                }))
                : [{ productId: '', description: '', quantity: '', unitPrice: '', taxRate: '', discount: '' }]
        })
        setIsModalOpen(true)
        setIsAnimating(false)
        setTimeout(() => setIsAnimating(true), 10)
    }

    function closePaymentModal() {
        setIsPaymentModalOpen(false)
        setPaymentInvoice(null)
    }

    function openPrintModal(inv: any, action: 'print' | 'download' | 'share' | 'preview') {
        // Set processing fees from invoice or prescription consultation fees
        const processingFeesValue = inv.processingFees !== null && inv.processingFees !== undefined 
            ? String(inv.processingFees)
            : (inv.visit?.consultationFees ? String(inv.visit.consultationFees) : invoiceDefaults?.consultationFees?.toString() || '0')
        
        const initialItemBatches: Record<string, string> = {}
        ;(inv.items || []).forEach((item: any, idx: number) => {
            const product = products.find((p: any) => p.id === item.productId || p.name === item.description)
            initialItemBatches[String(idx)] = product?.latestBatchNumber || ''
        })

        setInvoiceDetails(prev => ({
            ...prev,
            processingFees: processingFeesValue,
            itemBatches: initialItemBatches
        }))
        
        setCurrentPrintInvoice(inv)
        setPrintAction(action)
        setPrintModalStep(1)
        setIsPrintModalOpen(true)
        setPrintModalAnimating(false)
        setTimeout(() => setPrintModalAnimating(true), 10)
    }

    function closePrintModal() {
        setPrintModalAnimating(false)
        setTimeout(() => {
            setIsPrintModalOpen(false)
            setCurrentPrintInvoice(null)
            setPrintModalStep(1)
        }, 200)
    }

    async function persistLatestProductBatches(inv: any) {
        const items = inv?.items || []
        const updates = new Map<number, string>()

        items.forEach((item: any, idx: number) => {
            const batchValue = (invoiceDetails.itemBatches?.[String(idx)] || '').trim()
            if (!batchValue) return

            let productId = item.productId ? Number(item.productId) : null
            if (!productId) {
                const product = products.find((p: any) => p.name === item.description)
                if (product?.id) productId = Number(product.id)
            }

            if (productId) {
                updates.set(productId, batchValue)
            }
        })

        if (updates.size === 0) return

        await Promise.all(
            Array.from(updates.entries()).map(([id, latestBatchNumber]) =>
                fetch('/api/products', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id, batchOnly: true, latestBatchNumber })
                })
            )
        )

        await fetchProducts()
    }

    async function handlePrintSubmit() {
        if (printModalStep === 1) {
            setPrintModalStep(2)
            return
        }

        // Save reusable invoice details to localStorage with clinic-specific key
        if (user && user.clinicId) {
            const storageKey = `invoiceDetails_${user.clinicId}`
            const persistentDetails = {
                manufacturer: invoiceDetails.manufacturer,
                expiry: invoiceDetails.expiry,
                taxPercent: invoiceDetails.taxPercent,
                assignedBy: invoiceDetails.assignedBy,
                processingFees: invoiceDetails.processingFees
            }
            localStorage.setItem(storageKey, JSON.stringify(persistentDetails))
        }

        if (currentPrintInvoice) {
            try {
                await persistLatestProductBatches(currentPrintInvoice)
            } catch (error) {
                // Printing should continue even if batch persistence fails.
            }
        }

        const invoiceToExport = currentPrintInvoice
        const actionToRun = printAction
        closePrintModal()

        if (!invoiceToExport) {
            return
        }

        if (actionToRun === 'preview') {
            setShowPreviewExportDropdown(false)
            setPreviewInvoice(invoiceToExport)
            setPreviewZoom(100)
            setIsPreviewModalOpen(true)
            setPreviewModalAnimating(false)
            setTimeout(() => setPreviewModalAnimating(true), 10)
            return
        }

        if (actionToRun === 'share') {
            void shareInvoice(invoiceToExport)
            return
        }

        void printInvoice(invoiceToExport, actionToRun)
    }

    async function shareInvoice(inv: any) {
        try {
            const clinicName = user?.clinic?.name || 'ERP Flow Studios'
            const clinicCity = user?.clinic?.city || 'Your City'
            const isPro = user?.clinic?.subscriptionPlan === 'pro'
            const htmlContent = generateInvoiceHTML(inv, products, invoiceDetails, 'share', bottlePricing, invoiceDefaults, clinicImages, clinicName, clinicCity, isPro)
            const safeInvoiceNumber = String(inv?.invoiceNumber || 'Download').replace(/[\\/:*?"<>|]+/g, '-')
            const fallbackFileName = `Invoice_${safeInvoiceNumber}.pdf`

            const payload = await new Promise<{ pdfBlob: Blob; fileName: string }>((resolve, reject) => {
                const shareWindow = window.open('', '_blank')
                if (!shareWindow) {
                    reject(new Error('Popup blocked. Please allow popups to share the invoice PDF.'))
                    return
                }

                const timeoutId = window.setTimeout(() => {
                    cleanup()
                    try {
                        if (!shareWindow.closed) {
                            shareWindow.close()
                        }
                    } catch {
                    }
                    reject(new Error('Timed out while preparing invoice for sharing. Please try again.'))
                }, 25000)

                const cleanup = () => {
                    window.clearTimeout(timeoutId)
                    window.removeEventListener('message', handleMessage)
                }

                const handleMessage = (event: MessageEvent) => {
                    if (event.origin !== window.location.origin) {
                        return
                    }

                    const data = event.data as {
                        source?: string
                        type?: string
                        blob?: Blob
                        fileName?: string
                        message?: string
                    } | null

                    if (!data || data.source !== 'invoice-export') {
                        return
                    }

                    if (data.type === 'share-ready' && data.blob && typeof data.blob.size === 'number') {
                        cleanup()
                        resolve({
                            pdfBlob: data.blob,
                            fileName: data.fileName || fallbackFileName,
                        })
                        return
                    }

                    if (data.type === 'share-error') {
                        cleanup()
                        reject(new Error(data.message || 'Failed to prepare invoice PDF for sharing.'))
                    }
                }

                window.addEventListener('message', handleMessage)
                shareWindow.document.write(htmlContent)
                shareWindow.document.close()
            })

            const result = await sharePdfWithFallback(payload.pdfBlob, {
                fileName: payload.fileName,
                title: 'Invoice PDF',
                text: `Invoice ${inv?.invoiceNumber || ''}`,
                folder: 'invoices',
            })

            if (result === 'native-share') {
                showSuccess('Share sheet opened.')
            } else {
                showSuccess('Share link copied to clipboard.')
            }
        } catch (error: any) {
            if (String(error?.name || '') === 'AbortError') {
                showInfo('Share cancelled.')
                return
            }
            showError(error instanceof Error ? error.message : 'Failed to share invoice PDF')
        }
    }

    async function printInvoice(inv: any, action: 'print' | 'download' = 'print') {
        const clinicName = user?.clinic?.name || 'ERP Flow Studios'
        const clinicCity = user?.clinic?.city || 'Your City'
        const isPro = user?.clinic?.subscriptionPlan === 'pro'
        const htmlContent = generateInvoiceHTML(inv, products, invoiceDetails, action, bottlePricing, invoiceDefaults, clinicImages, clinicName, clinicCity, isPro)

        if (action === 'download') {
            try {
                await notifyAndroidDownloadProgress('Invoice Download', 'Preparing invoice PDF download...')
                const safeInvoiceNumber = String(inv?.invoiceNumber || 'Download').replace(/[\\/:*?"<>|]+/g, '-')
                const fallbackFileName = `Invoice_${safeInvoiceNumber}.pdf`

                const payload = await new Promise<{ pdfBlob: Blob; fileName: string }>((resolve, reject) => {
                    const downloadWindow = window.open('', '_blank')
                    if (!downloadWindow) {
                        reject(new Error('Popup blocked. Please allow popups to download the invoice PDF.'))
                        return
                    }

                    const timeoutId = window.setTimeout(() => {
                        cleanup()
                        try { if (!downloadWindow.closed) downloadWindow.close() } catch {}
                        reject(new Error('Timed out while preparing invoice PDF. Please try again.'))
                    }, 25000)

                    const cleanup = () => {
                        window.clearTimeout(timeoutId)
                        window.removeEventListener('message', handleMessage)
                    }

                    const handleMessage = (event: MessageEvent) => {
                        if (event.origin !== window.location.origin) return
                        const data = event.data as any
                        if (!data || data.source !== 'invoice-export') return

                        if (data.type === 'download-ready' && data.blob && typeof data.blob.size === 'number') {
                            cleanup()
                            resolve({ pdfBlob: data.blob, fileName: data.fileName || fallbackFileName })
                            return
                        }
                        if (data.type === 'download-error') {
                            cleanup()
                            reject(new Error(data.message || 'Failed to prepare invoice PDF.'))
                        }
                    }

                    window.addEventListener('message', handleMessage)
                    downloadWindow.document.write(htmlContent)
                    downloadWindow.document.close()
                })

                await downloadPdfBlob(payload.pdfBlob, payload.fileName, {
                    preferNativeShareOnAndroid: true,
                    shareTitle: 'Invoice PDF',
                    shareText: `Invoice ${inv?.invoiceNumber || ''}`,
                })
                await notifyAndroidDownloadProgress('Invoice Download Ready', 'Invoice PDF has been saved.')
            } catch (error) {
                await notifyAndroidDownloadProgress('Invoice Download Failed', 'Unable to generate invoice PDF.')
                showError(error instanceof Error ? error.message : 'Failed to download invoice PDF')
            }
            return
        }

        const printWindow = window.open('', '_blank')
        if (!printWindow) return
        printWindow.document.write(htmlContent)
        printWindow.document.close()
    }

    function closePaymentModal2() {
        setIsAnimating(false)
        setTimeout(() => {
            setIsPaymentModalOpen(false)
            setPaymentInvoice(null)
        }, 200)
    }

    // Bulk selection handlers
    function toggleSelectInvoice(id: number) {
        const newSelected = new Set(selectedInvoiceIds)
        if (newSelected.has(id)) {
            newSelected.delete(id)
        } else {
            newSelected.add(id)
        }
        setSelectedInvoiceIds(newSelected)
    }

    function toggleSelectAll() {
        const filteredInvs = getFilteredAndSortedInvoices()
        
        if (selectedInvoiceIds.size === filteredInvs.length) {
            // Deselect all
            setSelectedInvoiceIds(new Set())
        } else {
            // Select all filtered invoices
            setSelectedInvoiceIds(new Set(filteredInvs.map(inv => inv.id)))
        }
    }

    function openPreviewModal(inv: any) {
        // Set assigned doctor from patient data
        const patientDoctor = inv.patient?.doctor
        
        // Set processing fees from invoice or prescription consultation fees
        const processingFeesValue = inv.processingFees !== null && inv.processingFees !== undefined 
            ? String(inv.processingFees)
            : (inv.visit?.consultationFees ? String(inv.visit.consultationFees) : invoiceDefaults?.consultationFees?.toString() || '0')
        
        const initialItemBatches: Record<string, string> = {}
        ;(inv.items || []).forEach((item: any, idx: number) => {
            const product = products.find((p: any) => p.id === item.productId || p.name === item.description)
            initialItemBatches[String(idx)] = product?.latestBatchNumber || ''
        })

        if (patientDoctor && !invoiceDetails.assignedBy) {
            setInvoiceDetails(prev => ({
                ...prev,
                assignedBy: String(patientDoctor.id || ''),
                processingFees: processingFeesValue,
                itemBatches: initialItemBatches
            }))
        } else {
            setInvoiceDetails(prev => ({
                ...prev,
                processingFees: processingFeesValue,
                itemBatches: initialItemBatches
            }))
        }

        setShowPreviewExportDropdown(false)
        openPrintModal(inv, 'preview')
    }

    function openExportFromPreview(action: 'download' | 'print' | 'share') {
        if (!previewInvoice) return
        setShowPreviewExportDropdown(false)

        if (action === 'share') {
            void shareInvoice(previewInvoice)
            return
        }

        void printInvoice(previewInvoice, action === 'download' ? 'download' : 'print')
    }

    function closePreviewModal() {
        setPreviewModalAnimating(false)
        setTimeout(() => {
            setIsPreviewModalOpen(false)
            setPreviewInvoice(null)
            setShowPreviewExportDropdown(false)
        }, 200)
    }

    function getFilteredAndSortedInvoices() {
        // Filter invoices
        let filtered = invoices.filter(inv => {
            const matchesSearch = searchQuery ?
                inv.invoiceNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                inv.customerName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                inv.customerPhone?.toLowerCase().includes(searchQuery.toLowerCase())
                : true
            
            const matchesStatus = filterStatus ?
                inv.status === filterStatus
                : true
            
            return matchesSearch && matchesStatus
        })

        // Sort invoices
        filtered.sort((a, b) => {
            let compareResult = 0
            
            if (sortField === 'invoiceNumber') {
                compareResult = (a.invoiceNumber || '').localeCompare(b.invoiceNumber || '')
            } else if (sortField === 'customerName') {
                compareResult = (a.customerName || '').localeCompare(b.customerName || '')
            } else if (sortField === 'invoiceDate') {
                const dateA = a.invoiceDate ? new Date(a.invoiceDate).getTime() : 0
                const dateB = b.invoiceDate ? new Date(b.invoiceDate).getTime() : 0
                compareResult = dateA - dateB
            } else if (sortField === 'totalAmount') {
                compareResult = (a.totalAmount || 0) - (b.totalAmount || 0)
            } else if (sortField === 'balanceAmount') {
                compareResult = (a.balanceAmount || 0) - (b.balanceAmount || 0)
            } else if (sortField === 'status') {
                compareResult = (a.status || '').localeCompare(b.status || '')
            } else if (sortField === 'createdAt') {
                const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
                const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
                compareResult = dateA - dateB
            }
            
            return sortOrder === 'asc' ? compareResult : -compareResult
        })

        return filtered
    }

    // Delete functions
    async function deleteInvoice(id: number) {
        setConfirmStep(1)
        setConfirmModal({ open: true, id, message: 'Are you sure you want to delete this invoice?' })
        setTimeout(() => setConfirmModalAnimating(true), 10)
    }

    function openBulkDeleteConfirm() {
        setConfirmStep(1)
        setConfirmModal({
            open: true,
            deleteMultiple: true,
            message: `Are you sure you want to delete ${selectedInvoiceIds.size} selected invoice(s)?`
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
                // Delete multiple invoices with progress tracking
                const idsArray = Array.from(selectedInvoiceIds)
                const total = idsArray.length
                setDeleteProgress({ current: 0, total })
                
                // Delete in chunks for better progress tracking
                const CHUNK_SIZE = 100
                let completed = 0
                let failed = 0
                
                for (let i = 0; i < idsArray.length; i += CHUNK_SIZE) {
                    const chunk = idsArray.slice(i, i + CHUNK_SIZE)
                    const deletePromises = chunk.map(async (invoiceId) => {
                        try {
                            const res = await fetch(`/api/customer-invoices/${invoiceId}`, { method: 'DELETE' })
                            if (!res.ok && res.status !== 404) {
                                throw new Error('Delete failed')
                            }
                            return { success: true, id: invoiceId }
                        } catch (error) {
                            return { success: false, id: invoiceId }
                        }
                    })
                    
                    const results = await Promise.all(deletePromises)
                    completed += results.filter(r => r.success).length
                    failed += results.filter(r => !r.success).length
                    
                    setDeleteProgress({ current: i + chunk.length, total })
                }
                
                await fetchInvoices()
                setSelectedInvoiceIds(new Set())
                
                if (failed > 0) {
                    showError(`Deleted ${completed} invoice(s), ${failed} failed`)
                } else {
                    showSuccess(`Successfully deleted ${completed} invoice(s)`)
                }
                setDeleteProgress({ current: 0, total: 0 })
            } else {
                // Single delete
                const res = await fetch(`/api/customer-invoices/${id}`, { method: 'DELETE' })
                if (!res.ok) {
                    if (res.status === 404) {
                        showError('Invoice not found - it may have already been deleted')
                    } else {
                        throw new Error('Delete failed')
                    }
                    return
                }
                await fetchInvoices()
                showSuccess('Invoice deleted successfully')
            }
        } catch (error: any) {
            showError(error.message || 'Failed to delete invoice(s)')
        } finally {
            setDeleting(false)
        }
    }

    // Export functions
    function exportData(format: 'csv' | 'json' | 'xlsx') {
        if (isBasicSubscription) {
            showInfo('Export is available in Standard plan.')
            router.push('/upgrade')
            return
        }

        const dataToExport = selectedInvoiceIds.size > 0
            ? invoices.filter(inv => selectedInvoiceIds.has(inv.id))
            : getFilteredAndSortedInvoices()

        if (dataToExport.length === 0) {
            showError('No data to export')
            return
        }

        if (format === 'csv') {
            exportToCSV(dataToExport)
        } else if (format === 'json') {
            exportToJSON(dataToExport)
        } else if (format === 'xlsx') {
            exportToExcel(dataToExport)
        }
        
        setShowExportDropdown(false)
    }

    const exportToCSV = (data: any[]) => {
        const headers = ['Invoice Number', 'Customer', 'Phone', 'Email', 'Date', 'Due Date', 'Total Amount', 'Paid Amount', 'Balance', 'Status']
        const rows = data.map(inv => [
            inv.invoiceNumber || '',
            inv.customerName || '',
            inv.customerPhone || '',
            inv.customerEmail || '',
            inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString() : '',
            inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '',
            formatPrice(inv.totalAmount) || '0.00',
            formatPrice(inv.paidAmount) || '0.00',
            formatPrice(inv.balanceAmount) || '0.00',
            inv.status || ''
        ])

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `invoices_${new Date().toISOString().split('T')[0]}.csv`
        link.click()
        
        showSuccess(`Exported ${data.length} invoice(s) to CSV`)
    }

    const exportToJSON = (data: any[]) => {
        const jsonData = JSON.stringify(data, null, 2)
        const blob = new Blob([jsonData], { type: 'application/json' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `invoices_${new Date().toISOString().split('T')[0]}.json`
        link.click()
        
        showSuccess(`Exported ${data.length} invoice(s) to JSON`)
    }

    const exportToExcel = (data: any[]) => {
        const worksheet = XLSX.utils.json_to_sheet(data.map(inv => ({
            'Invoice Number': inv.invoiceNumber || '',
            'Customer': inv.customerName || '',
            'Phone': inv.customerPhone || '',
            'Email': inv.customerEmail || '',
            'Invoice Date': inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString() : '',
            'Due Date': inv.dueDate ? new Date(inv.dueDate).toLocaleDateString() : '',
            'Total Amount': inv.totalAmount || 0,
            'Paid Amount': inv.paidAmount || 0,
            'Balance': inv.balanceAmount || 0,
            'Status': inv.status || ''
        })))
        
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Invoices')
        XLSX.writeFile(workbook, `invoices_${new Date().toISOString().split('T')[0]}.xlsx`)
        
        showSuccess(`Exported ${data.length} invoice(s) to Excel`)
    }

    const handlePDFUpload = async (file: File) => {
        try {
            setLoading(true)
            showInfo('Processing PDF file...')
            
            const formData = new FormData()
            formData.append('pdf', file)
            
            const response = await fetch('/api/invoices/parse-pdf', {
                method: 'POST',
                body: formData
            })
            
            if (!response.ok) {
                throw new Error('Failed to parse PDF')
            }
            
            const result = await response.json()
            
            if (result.error) {
                throw new Error(result.error)
            }
            
            // Populate form with extracted data
            setForm({
                ...emptyForm,
                customerName: result.customerName || '',
                customerEmail: result.customerEmail || '',
                customerPhone: result.customerPhone || '',
                customerAddress: result.customerAddress || '',
                customerGSTIN: result.customerGSTIN || '',
                invoiceDate: result.invoiceDate || new Date().toISOString().split('T')[0],
                dueDate: result.dueDate || '',
                discount: result.discount || '',
                notes: result.notes || '',
                items: result.items && result.items.length > 0 ? result.items : [{ productId: '', description: '', quantity: '', unitPrice: '', taxRate: '', discount: '' }]
            })
            
            setIsImportModalOpen(false)
            setIsModalOpen(true)
            setIsAnimating(true)
            
            showSuccess('PDF data extracted successfully! Please review and save.')
        } catch (error: any) {
            showError(error.message || 'Failed to import PDF. Please try again or enter data manually.')
        } finally {
            setLoading(false)
        }
    }

    function calculateItemTotal(item: any) {
        const quantity = Number(item.quantity) || 0
        const unitPrice = Number(item.unitPrice) || 0
        const taxRate = Number(item.taxRate) || 0
        const discount = Number(item.discount) || 0

        const subtotal = quantity * unitPrice
        const afterDiscount = subtotal - discount
        const tax = afterDiscount * (taxRate / 100)

        return afterDiscount + tax
    }

    function calculateInvoiceTotal() {
        // Filter out MISC category products (droppers/bottles) from pricing
        const itemsTotal = form.items.reduce((sum, item) => {
            const product = products.find((p: any) => String(p.id) === String(item.productId));
            const categoryName = product?.category?.name || product?.category || '';
            // Skip MISC category products from invoice total
            if (categoryName.toLowerCase() === 'misc') {
                return sum;
            }
            return sum + calculateItemTotal(item);
        }, 0)
        const discount = Number(form.discount) || 0

        return itemsTotal - discount
    }

    async function generateInvoicesFromVisits() {
        const { addTask, updateTask } = importContext
        
        const taskId = addTask({
            type: 'invoices',
            operation: 'generate',
            status: 'generating',
            progress: { current: 0, total: 0 },
            summary: { success: 0, errors: 0 }
        })
        
        setCurrentGenerationTaskId(taskId)
        setIsGeneratingModalOpen(true)
        const abortController = new AbortController()
        setGenerationAbortController(abortController)
        
        try {
            const response = await fetch('/api/invoices/generate-from-visits', {
                method: 'POST',
                signal: abortController.signal
            })

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`)
            }

            if (!response.body) {
                throw new Error('No response body')
            }

            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let buffer = ''

            while (true) {
                const { done, value } = await reader.read()
                
                if (done) {
                    break
                }

                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n\n')
                buffer = lines.pop() || ''

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6))
                            
                            if (data.type === 'progress') {
                                updateTask(taskId, {
                                    progress: { current: data.current || 0, total: data.total || 0 },
                                    summary: { success: data.created || 0, errors: data.errors || 0, skipped: data.skipped || 0 }
                                })
                            } else if (data.type === 'cancelled') {
                                updateTask(taskId, {
                                    status: 'cancelled',
                                    endTime: Date.now()
                                })
                                showInfo('Invoice generation cancelled')
                                setCurrentGenerationTaskId(null)
                                setIsGeneratingModalOpen(false)
                                setGenerationAbortController(null)
                                break
                            } else if (data.type === 'complete') {
                                updateTask(taskId, {
                                    status: 'success',
                                    endTime: Date.now(),
                                    progress: { current: data.total, total: data.total },
                                    summary: { success: data.created, errors: data.failed, skipped: data.skipped || 0 }
                                })
                                
                                // Refresh invoice list
                                await fetchInvoices()
                                setCurrentGenerationTaskId(null)
                                setIsGeneratingModalOpen(false)
                                setGenerationAbortController(null)
                            } else if (data.type === 'error') {
                                throw new Error(data.error)
                            }
                        } catch (parseError) {
                        }
                    }
                }
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                updateTask(taskId, {
                    status: 'cancelled',
                    endTime: Date.now()
                })
                showInfo('Invoice generation cancelled')
            } else {
                updateTask(taskId, {
                    status: 'error',
                    endTime: Date.now(),
                    error: error.message || 'Failed to generate invoices from visits'
                })
                showError(error.message || 'Failed to generate invoices from visits')
            }
            setCurrentGenerationTaskId(null)
            setIsGeneratingModalOpen(false)
            setGenerationAbortController(null)
        }
    }

    function cancelGeneration() {
        setShowCancelGenerationConfirm(true)
        setTimeout(() => setCancelConfirmAnimating(true), 10)
    }

    function confirmCancelGeneration() {
        if (generationAbortController) {
            generationAbortController.abort()
        }
        setShowCancelGenerationConfirm(false)
        setCancelConfirmAnimating(false)
    }

    function closeCancelConfirm() {
        setCancelConfirmAnimating(false)
        setTimeout(() => setShowCancelGenerationConfirm(false), 300)
    }

    const filteredInvoices = getFilteredAndSortedInvoices()

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                        Customer Invoices
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Generate and manage customer invoices</p>
                </div>
                {user && (
                    <div className="flex gap-2">
                        <RefreshButton onRefresh={fetchInvoices} />
                        <div className="relative">
                            <button 
                                onClick={() => setShowExportDropdown(!showExportDropdown)}
                                className="btn h-10 sm:h-11 relative bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white transition-all duration-200 flex items-center gap-2 shadow-lg shadow-sky-200 dark:shadow-sky-900/50 px-2 sm:px-4 py-2.5"
                                title={selectedInvoiceIds.size > 0 ? `Export ${selectedInvoiceIds.size} selected` : 'Export All'}
                                aria-label={selectedInvoiceIds.size > 0 ? `Export ${selectedInvoiceIds.size} selected` : 'Export All'}
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                </svg>
                                <span className="font-semibold hidden sm:inline">{selectedInvoiceIds.size > 0 ? `Export (${selectedInvoiceIds.size})` : 'Export All'}</span>
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
                                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-sky-200 dark:border-sky-900 z-[100] overflow-hidden">
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
                            onClick={() => setIsImportModalOpen(true)} 
                            className="btn h-10 sm:h-11 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white shadow-lg shadow-sky-200 dark:shadow-sky-900/50 transition-all duration-200 flex items-center gap-2 px-2 sm:px-4 py-2.5"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            <span className="hidden sm:inline font-semibold">Import</span>
                        </button>
                        <button
                            onClick={generateInvoicesFromVisits}
                            disabled={loading}
                            className="h-10 sm:h-11 flex items-center gap-2 px-2 sm:px-4 py-2.5 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-medium rounded-lg shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="hidden sm:inline font-semibold">{loading ? 'Generating...' : 'Generate from Visits'}</span>
                            <span className="sm:hidden text-sm font-semibold">{loading ? 'Gen...' : 'Generate'}</span>
                        </button>
                        <button
                            onClick={() => {
                                setIsModalOpen(true)
                                setIsAnimating(false)
                                setTimeout(() => setIsAnimating(true), 10)
                            }}
                            className="btn h-10 sm:h-11 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white shadow-lg shadow-sky-200 dark:shadow-sky-900/50 transition-all duration-200 flex items-center gap-2 px-2 sm:px-4 py-2.5"
                        >
                            <span className="text-lg">+</span>
                            <span className="hidden sm:inline">Create Invoice</span>
                            <span className="sm:hidden">New</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Search and Filter Bar */}
            <div className="relative rounded-xl border border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-br from-white via-blue-50 to-sky-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 shadow-lg shadow-blue-500/10 p-3 sm:p-4 mb-4">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                <div className="relative flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                    <div className="flex-1 relative min-w-0">
                        <input
                            type="text"
                            placeholder="🔍 Search invoices..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full p-2 sm:p-3 pr-10 text-sm sm:text-base border border-blue-200 dark:border-blue-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
                        />
                    </div>
                    <div className={`w-full sm:w-48 ${isFilterStatusOpen ? 'relative z-[101]' : 'relative z-0'}`}>
                        <CustomSelect
                            value={filterStatus}
                            onChange={(value) => setFilterStatus(value)}
                            options={[
                                { value: '', label: 'All Status' },
                                { value: 'unpaid', label: 'Unpaid' },
                                { value: 'partial', label: 'Partially Paid' },
                                { value: 'paid', label: 'Paid' }
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
                            className="px-3 sm:px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>

            {/* Invoices Table */}
            <div className="relative rounded-xl border border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-br from-white via-blue-50 to-sky-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 shadow-lg shadow-blue-500/10 p-6">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                <h3 className="relative text-lg font-semibold mb-4 flex items-center justify-between">
                    <span className="flex items-center gap-3">
                        <label className="relative group/checkbox cursor-pointer flex-shrink-0">
                            <input
                                type="checkbox"
                                checked={filteredInvoices.length > 0 && selectedInvoiceIds.size === filteredInvoices.length}
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
                        <span className="font-bold text-gray-900 dark:text-gray-100">Invoice Records {selectedInvoiceIds.size > 0 && <span className="px-2 py-0.5 ml-2 bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-400 rounded-full text-xs font-bold">({selectedInvoiceIds.size} selected)</span>}</span>
                    </span>
                    <span className="badge">{filteredInvoices.length} invoices</span>
                </h3>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mb-4"></div>
                        <p className="text-muted">Loading invoices...</p>
                    </div>
                ) : filteredInvoices.length === 0 ? (
                    <div className="relative text-center py-12 text-gray-500 dark:text-gray-400">
                        <p className="text-lg mb-2">No invoices found</p>
                        <p className="text-sm">Try adjusting your search or create a new invoice</p>
                    </div>
                ) : (
                    <>
                        <ThemedScrollArea className="relative space-y-2 max-h-[44rem] pr-1">
                            {filteredInvoices.map(inv => {
                                // Calculate net amount with bottle pricing but WITHOUT consultation fees for row display
                                const prescriptions = inv.visit?.prescriptions || inv.prescriptions || []
                                let totalBottlePricing = 0
                                
                                if (prescriptions.length > 0 && bottlePricing.length > 0) {
                                    let spyBottleAdded = false
                                    let additionsBottleAdded = false
                                    
                                    prescriptions.forEach((pr: any) => {
                                        if (pr.bottleSize) {
                                            const bottlePriceData = bottlePricing.find((b: any) => b.value === pr.bottleSize)
                                            const bottlePrice = bottlePriceData ? bottlePriceData.price : 0
                                            
                                            if (!spyBottleAdded && (pr.spy4 || pr.spy5 || pr.spy6) && bottlePrice > 0) {
                                                totalBottlePricing += bottlePrice
                                                spyBottleAdded = true
                                            }
                                            
                                            if (!additionsBottleAdded && (pr.addition1 || pr.addition2 || pr.addition3) && bottlePrice > 0) {
                                                totalBottlePricing += bottlePrice
                                                additionsBottleAdded = true
                                            }
                                        }
                                    })
                                }
                                
                                // Net amount for row display does NOT include processing fees
                                const netAmount = (inv.totalAmount || 0) + totalBottlePricing
                                
                                return (
                                    <div key={inv.id} className={`border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden transition-all duration-300 ${selectedInvoiceIds.has(inv.id) ? 'ring-2 ring-sky-500 shadow-xl shadow-sky-100 dark:shadow-sky-900/30 bg-gradient-to-r from-sky-50/30 to-blue-50/30 dark:from-gray-800 dark:to-gray-800' : ''}`}>
                                        {/* Summary Row */}
                                        <div className="bg-gray-50 dark:bg-gray-800 p-3 flex items-center gap-3">
                                            {/* Checkbox */}
                                            <div className="flex-shrink-0">
                                                <label className="relative group/checkbox cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedInvoiceIds.has(inv.id)}
                                                        onChange={() => toggleSelectInvoice(inv.id)}
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

                                            {/* Invoice Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 flex-wrap">
                                                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                                                        {inv.invoiceNumber}
                                                    </span>
                                                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                                                        {inv.customerName}
                                                    </span>
                                                    {inv.customerPhone && (
                                                        <span className="text-xs text-muted">
                                                            📞 {inv.customerPhone}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted mt-1 flex items-center gap-3 flex-wrap">
                                                    <span>📅 {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString() : '-'}</span>
                                                    <span className="font-semibold text-blue-700 dark:text-blue-400">
                                                        Net Amount: {formatCurrency(netAmount)}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-shrink-0">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        openPreviewModal(inv)
                                                    }}
                                                    className="px-2 sm:px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded transition-colors flex items-center gap-1"
                                                    title="View/Export Invoice"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                    </svg>
                                                    <span className="hidden sm:inline">View/Export</span>
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        editInvoice(inv)
                                                    }}
                                                    className="px-2 sm:px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors"
                                                    title="Edit"
                                                >
                                                    <svg className="w-4 h-4 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                    <span className="hidden sm:flex items-center gap-1">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                        </svg>
                                                        Edit
                                                    </span>
                                                </button>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        deleteInvoice(inv.id)
                                                    }}
                                                    disabled={!user}
                                                    className="px-2 sm:px-3 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                    title="Delete"
                                                >
                                                    <svg className="w-4 h-4 sm:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                    <span className="hidden sm:flex items-center gap-1">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                        Delete
                                                    </span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )
                            })}
                        </ThemedScrollArea>

                    </>
                )}
            </div>

            {/* Create/Edit Invoice Modal */}
            {isModalOpen && (
                <div className={`fixed inset-0 bg-black transition-opacity duration-300 ${isAnimating ? 'bg-opacity-50' : 'bg-opacity-0'}`} style={{ zIndex: 100 }} onClick={closeModal}>
                    <div className={`fixed inset-0 flex items-center justify-center p-4 transition-all duration-300 ${isAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`} style={{ zIndex: 101 }}>
                        <div className="relative overflow-hidden rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/20 backdrop-blur-sm max-w-5xl w-full max-h-[90vh]" onClick={e => e.stopPropagation()}>
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none"></div>
                            
                            {/* Header */}
                            <div className="relative bg-gradient-to-r from-blue-50 to-sky-50 dark:from-gray-800 dark:to-gray-800 px-4 sm:px-6 py-3 sm:py-4 border-b border-blue-200/30 dark:border-blue-700/30">
                                <div className="flex justify-between items-center">
                                    <h2 className="text-lg sm:text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400 flex items-center gap-2">
                                        {editingId ? (
                                            <>
                                                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                </svg>
                                                Edit Invoice
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                                New Invoice
                                            </>
                                        )}
                                    </h2>
                                    <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* Form Content - Scrollable */}
                            <div className="relative p-4 sm:p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
                                <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
                                    {/* Customer Information Section */}
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">👤 Customer Information</h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                            <div className={isPatientSelectOpen ? 'relative z-[101]' : 'relative z-0'}>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Patient (Optional)</label>
                                                <CustomSelect
                                                    value={form.patientId}
                                                    onChange={(value) => {
                                                        setForm({ ...form, patientId: value })
                                                        if (value) fillFromPatient(value)
                                                    }}
                                                    options={[
                                                        { value: '', label: 'Select patient' },
                                                        ...patients.map(p => ({
                                                            value: p.id.toString(),
                                                            label: (`${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Unknown'),
                                                            badge: p.generatedPatientId || formatPatientId(p.date || p.createdAt),
                                                            subtitle: p.fatherHusbandGuardianName ? `in care of ${p.fatherHusbandGuardianName}` : undefined,
                                                            searchString: `${p.firstName || ''} ${p.lastName || ''} ${p.generatedPatientId || formatPatientId(p.date || p.createdAt)} ${p.phone || ''} ${p.fatherHusbandGuardianName || ''}`
                                                        }))
                                                    ]}
                                                    placeholder="Select patient"
                                                    onOpenChange={setIsPatientSelectOpen}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Customer Name *</label>
                                                <input
                                                    required
                                                    placeholder="Enter customer name"
                                                    value={form.customerName}
                                                    onChange={(e) => setForm({ ...form, customerName: e.target.value })}
                                                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Email</label>
                                                <input
                                                    type="email"
                                                    placeholder="customer@example.com"
                                                    value={form.customerEmail}
                                                    onChange={(e) => setForm({ ...form, customerEmail: e.target.value })}
                                                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Phone</label>
                                                <input
                                                    type="tel"
                                                    placeholder="+91 98765 43210"
                                                    value={form.customerPhone}
                                                    onChange={(e) => setForm({ ...form, customerPhone: e.target.value })}
                                                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Address</label>
                                                <textarea
                                                    placeholder="Customer address"
                                                    value={form.customerAddress}
                                                    onChange={(e) => setForm({ ...form, customerAddress: e.target.value })}
                                                    rows={2}
                                                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all resize-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">GSTIN (Optional)</label>
                                                <input
                                                    placeholder="22AAAAA0000A1Z5"
                                                    value={form.customerGSTIN}
                                                    onChange={(e) => setForm({ ...form, customerGSTIN: e.target.value.toUpperCase() })}
                                                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Invoice Details Section */}
                                    <div>
                                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wide">📅 Invoice Details</h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Invoice Date *</label>
                                                <input
                                                    type="date"
                                                    required
                                                    value={form.invoiceDate}
                                                    onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
                                                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Due Date</label>
                                                <input
                                                    type="date"
                                                    value={form.dueDate}
                                                    onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                                                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Discount (₹)</label>
                                                <input
                                                    type="number"
                                                    placeholder="0.00"
                                                    value={form.discount}
                                                    onChange={(e) => setForm({ ...form, discount: e.target.value })}
                                                    min="0"
                                                    step="0.01"
                                                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Processing Fees (₹)</label>
                                                <input
                                                    type="number"
                                                    placeholder="0.00"
                                                    value={form.processingFees}
                                                    onChange={(e) => setForm({ ...form, processingFees: e.target.value })}
                                                    min="0"
                                                    step="0.01"
                                                    className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Line Items Section */}
                                    <div>
                                        <div className="flex items-center justify-between mb-3">
                                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">🛒 Line Items</h3>
                                            <button
                                                type="button"
                                                onClick={addItem}
                                                className="px-3 py-1.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white text-sm font-medium rounded-lg transition-all shadow-md"
                                            >
                                                ➕ Add Item
                                            </button>
                                        </div>
                                        <div className="space-y-3">
                                            {form.items.map((item, index) => (
                                                <div key={index} className="relative p-4 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 shadow-sm">
                                                    <div className="grid grid-cols-6 gap-3">
                                                        <div className={`col-span-2 ${isProductSelectOpen[index] ? 'relative z-[101]' : 'relative z-0'}`}>
                                                            <label className="block text-xs font-medium mb-1.5 text-gray-600 dark:text-gray-400">Product</label>
                                                            <CustomSelect
                                                                value={item.productId}
                                                                onChange={(value) => updateItem(index, 'productId', value)}
                                                                options={[
                                                                    { value: '', label: '-- Optional --' },
                                                                    ...products.map(p => ({
                                                                        value: p.id.toString(),
                                                                        label: p.name
                                                                    }))
                                                                ]}
                                                                placeholder="Select product"
                                                                onOpenChange={(isOpen) => setIsProductSelectOpen(prev => ({...prev, [index]: isOpen}))}
                                                            />
                                                        </div>
                                                        <div className="col-span-2">
                                                            <label className="block text-xs font-medium mb-1.5 text-gray-600 dark:text-gray-400">Description *</label>
                                                            <input
                                                                required
                                                                placeholder="Item description"
                                                                value={item.description}
                                                                onChange={(e) => updateItem(index, 'description', e.target.value)}
                                                                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-medium mb-1.5 text-gray-600 dark:text-gray-400">Quantity *</label>
                                                            <input
                                                                type="number"
                                                                required
                                                                placeholder="1"
                                                                value={item.quantity}
                                                                onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                                                                min="1"
                                                                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-medium mb-1.5 text-gray-600 dark:text-gray-400">Price *</label>
                                                            <input
                                                                type="number"
                                                                required
                                                                placeholder="0.00"
                                                                value={item.unitPrice}
                                                                onChange={(e) => updateItem(index, 'unitPrice', e.target.value)}
                                                                min="0"
                                                                step="0.01"
                                                                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-300 dark:border-gray-600">
                                                        <div className="text-sm font-semibold text-sky-600 dark:text-sky-400">
                                                            Total: {formatCurrency(calculateItemTotal(item))}
                                                        </div>
                                                        {form.items.length > 1 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => removeItem(index)}
                                                                className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs rounded-md transition-colors flex items-center gap-1"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                </svg>
                                                                Remove
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Total Section */}
                                    <div className="p-4 bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-900/20 dark:to-blue-900/20 rounded-lg border-2 border-sky-200 dark:border-sky-800">
                                        <div className="flex items-center justify-between">
                                            <span className="text-lg font-semibold text-gray-900 dark:text-white">💰 Invoice Total:</span>
                                            <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-blue-600 dark:from-sky-400 dark:to-blue-400">
                                                ₹{calculateInvoiceTotal().toFixed(2)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Notes Section */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">📝 Notes</label>
                                        <textarea
                                            placeholder="Add any additional notes or comments..."
                                            value={form.notes}
                                            onChange={(e) => setForm({ ...form, notes: e.target.value })}
                                            rows={3}
                                            className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all resize-none"
                                        />
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                                        <button
                                            type="button"
                                            onClick={closeModal}
                                            disabled={submitting}
                                            className="px-6 py-2.5 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium disabled:opacity-50"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={submitting || !user}
                                            className="px-6 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md"
                                        >
                                            {submitting ? 'Saving...' : (editingId ? '✓ Update Invoice' : '✓ Create Invoice')}
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Payment Modal */}
            {isPaymentModalOpen && paymentInvoice && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
                        {/* Header */}
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">Record Payment</h2>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Invoice: {paymentInvoice.invoiceNumber}</p>
                            </div>
                            <button
                                onClick={closePaymentModal}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-2xl leading-none"
                            >
                                ×
                            </button>
                        </div>

                        {/* Content */}
                        <form onSubmit={handlePayment}>
                            <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Balance Due:</span>
                                    <span className="font-bold text-lg text-red-600 dark:text-red-400">
                                        ₹{(paymentInvoice.balanceAmount || 0).toFixed(2)}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Payment Amount (₹) *</label>
                                    <input
                                        type="number"
                                        required
                                        value={paymentForm.amount}
                                        onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                                        className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                                        max={paymentInvoice.balanceAmount}
                                        step="0.01"
                                        placeholder="Enter payment amount"
                                    />
                                </div>

                                <div className={isPaymentMethodOpen ? 'relative z-[101]' : 'relative z-0'}>
                                    <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">Payment Method *</label>
                                    <CustomSelect
                                        value={paymentForm.paymentMethod}
                                        onChange={(value) => setPaymentForm({ ...paymentForm, paymentMethod: value })}
                                        options={[
                                            { value: 'CASH', label: 'Cash' },
                                            { value: 'CARD', label: 'Card' },
                                            { value: 'UPI', label: 'UPI' },
                                            { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
                                            { value: 'CHEQUE', label: 'Cheque' }
                                        ]}
                                        placeholder="Select payment method"
                                        required
                                        onOpenChange={setIsPaymentMethodOpen}
                                    />
                                </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={closePaymentModal}
                                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={!user}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    Record Payment
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Confirm Delete Modal */}
            {confirmModal.open && (
                <div className={`fixed inset-0 bg-black transition-opacity duration-300 z-[100] ${confirmModalAnimating ? 'bg-opacity-50' : 'bg-opacity-0'}`} onClick={closeConfirmModal}>
                    <div className={`fixed inset-0 flex items-center justify-center p-4 z-[101] transition-all duration-300 ${confirmModalAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                        <div className="bg-gradient-to-br from-white via-red-50/50 to-white dark:from-gray-900 dark:via-red-900/20 dark:to-gray-900 rounded-2xl shadow-2xl max-w-md w-full p-6 border-2 border-red-200 dark:border-red-700" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-center w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-red-100 to-orange-100 dark:from-red-900/30 dark:to-orange-900/30 rounded-full ring-4 ring-red-100 dark:ring-red-900/20">
                                <svg className="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h3 className="text-xl font-bold text-center mb-2 text-gray-900 dark:text-gray-100">
                                {confirmStep === 1 ? 'Confirm Delete' : 'Final Confirmation'}
                            </h3>
                            <p className="text-sm text-center text-gray-600 dark:text-gray-400 mb-6">
                                {confirmStep === 1
                                    ? confirmModal.message
                                    : 'This action is irreversible and will permanently remove invoice data. Do you want to continue?'}
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
                                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-700 hover:to-orange-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-xl font-medium"
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
            )}

            {/* Delete Progress Modal (for bulk deletes) */}
            {deleting && deleteProgress.total > 0 && !isDeleteMinimized && (
                <div className="fixed inset-0 bg-black/70 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="relative overflow-hidden rounded-2xl border border-red-200/30 dark:border-red-700/30 bg-gradient-to-br from-white via-red-50/30 to-orange-50/20 dark:from-gray-900 dark:via-red-950/20 dark:to-gray-900 shadow-2xl shadow-red-500/20 max-w-md w-full">
                        {/* Gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-br from-red-400/5 via-transparent to-orange-500/5 pointer-events-none" />
                        
                        <div className="relative p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600 dark:from-red-400 dark:to-orange-400">Deleting Invoices</h3>
                                <button
                                    onClick={() => setIsDeleteMinimized(true)}
                                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                                    </svg>
                                </button>
                            </div>
                            
                            <div className="flex items-center justify-center mb-6">
                                <div className="w-20 h-20 bg-gradient-to-br from-red-100 to-orange-100 dark:from-red-900/40 dark:to-orange-900/40 rounded-full shadow-lg shadow-red-500/20 animate-pulse flex items-center justify-center">
                                    <svg className="w-10 h-10 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </div>
                            </div>
                            
                            <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600 dark:from-red-400 dark:to-orange-400 mb-2 text-center tabular-nums">
                                {deleteProgress.current} / {deleteProgress.total}
                            </div>
                            
                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6 text-center">
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
                            
                            <p className="text-xs text-gray-500 dark:text-gray-500 mt-4 text-center">
                                Please wait, deleting invoice {deleteProgress.current} of {deleteProgress.total}...
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Export Button */}
            {selectedInvoiceIds.size > 0 && (
                <div className="relative">
                    <button
                        onClick={() => setShowExportDropdown(!showExportDropdown)}
                        className="fixed bottom-8 right-40 z-50 group mobile-safe-page-fab-export"
                        title={`Export ${selectedInvoiceIds.size} selected invoice(s)`}
                    >
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-r from-sky-500 to-blue-600 rounded-full blur-xl opacity-75 group-hover:opacity-100 transition-opacity duration-200"></div>
                            <div className="relative w-14 h-14 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 transform group-hover:scale-110">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                </svg>
                                <span className="absolute -top-1 -right-1 min-w-[24px] h-5 px-1.5 bg-sky-600 text-white rounded-full text-xs font-bold flex items-center justify-center shadow-lg ring-2 ring-white">
                                    {selectedInvoiceIds.size}
                                </span>
                                {isBasicSubscription && (
                                    <>
                                        <span className="hidden sm:block"><StandardFeatureBadge className="-top-2 -left-3" /></span>
                                        <span className="sm:hidden"><StandardFeatureBadge mobile className="-top-1 -left-1" /></span>
                                    </>
                                )}
                            </div>
                        </div>
                    </button>
                    {showExportDropdown && (
                        <div className="fixed bottom-24 right-40 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-sky-200 dark:border-sky-900 z-[100] overflow-hidden mobile-safe-page-fab-menu">
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
            {selectedInvoiceIds.size > 0 && (
                <button
                    onClick={() => {
                        setConfirmStep(1)
                        setConfirmModal({ open: true, deleteMultiple: true, message: `Are you sure you want to delete ${selectedInvoiceIds.size} selected invoice(s)?` })
                        setConfirmModalAnimating(true)
                    }}
                    className="fixed bottom-8 right-24 z-50 group mobile-safe-page-fab-delete"
                    title={`Delete ${selectedInvoiceIds.size} selected invoice(s)`}
                >
                    <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-rose-600 rounded-full blur-xl opacity-75 group-hover:opacity-100 transition-opacity duration-200 animate-pulse"></div>
                        <div className="relative w-14 h-14 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 transform group-hover:scale-110">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span className="absolute -top-1 -right-1 min-w-[24px] h-5 px-1.5 bg-red-600 text-white rounded-full text-xs font-bold flex items-center justify-center shadow-lg ring-2 ring-white">
                                {selectedInvoiceIds.size}
                            </span>
                        </div>
                    </div>
                </button>
            )}

            {submitting && (
                <LoadingModal isOpen={true} message="Processing..." />
            )}

            {/* Generation Progress Modal */}
            {isGeneratingModalOpen && currentGenerationTaskId && (() => {
                const task = importContext.tasks.find(t => t.id === currentGenerationTaskId)
                if (!task) return null
                
                return (
                    <div className="fixed inset-0 bg-black/70 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-[101] p-4">
                        <div 
                            className="bg-gradient-to-br from-white via-blue-50/50 to-white dark:from-gray-800 dark:via-blue-900/20 dark:to-gray-800 rounded-2xl shadow-2xl p-8 max-w-2xl w-full animate-fadeIn border-2 border-blue-200 dark:border-blue-700"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-2xl font-bold flex items-center gap-3">
                                    <svg className="w-8 h-8 text-blue-600 dark:text-blue-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    <span className="text-gray-800 dark:text-white">Generating Invoices from Visits</span>
                                </h2>
                                <button
                                    onClick={() => {
                                        setIsGeneratingModalOpen(false)
                                        // Task will continue in background and show in notifications
                                    }}
                                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                                    title="Minimize to notification"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                            </div>

                            <div className="space-y-6">
                                {/* Progress Bar */}
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                                            {task.progress.total > 0 
                                                ? `Processing: ${task.progress.current} / ${task.progress.total}`
                                                : 'Initializing...'}
                                        </span>
                                        <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                                            {task.progress.total > 0 ? Math.round((task.progress.current / task.progress.total) * 100) : 0}%
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden shadow-inner">
                                        <div 
                                            className="bg-gradient-to-r from-blue-500 via-blue-600 to-blue-500 h-3 rounded-full transition-all duration-300 ease-out shadow-lg"
                                            style={{ 
                                                width: `${task.progress.total > 0 ? (task.progress.current / task.progress.total) * 100 : 0}%`,
                                                minWidth: task.progress.total === 0 ? '20%' : '0%'
                                            }}
                                        >
                                            {task.progress.total === 0 && (
                                                <div className="w-full h-full bg-gradient-to-r from-transparent via-white/30 to-transparent animate-pulse"></div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Stats */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-gradient-to-br from-sky-50 to-sky-100/50 dark:from-sky-900/20 dark:to-sky-900/10 rounded-xl p-4 border-2 border-sky-200 dark:border-sky-800 shadow-sm">
                                        <div className="text-2xl font-bold text-sky-600 dark:text-sky-400 tabular-nums">
                                            {task.summary?.success || 0}
                                        </div>
                                        <div className="text-xs font-semibold text-sky-700 dark:text-sky-300 mt-1 uppercase tracking-wide">
                                            ✓ Created
                                        </div>
                                    </div>
                                    <div className="bg-gradient-to-br from-yellow-50 to-yellow-100/50 dark:from-yellow-900/20 dark:to-yellow-900/10 rounded-xl p-4 border-2 border-yellow-200 dark:border-yellow-800 shadow-sm">
                                        <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 tabular-nums">
                                            {task.summary?.skipped || 0}
                                        </div>
                                        <div className="text-xs font-semibold text-yellow-700 dark:text-yellow-300 mt-1 uppercase tracking-wide">
                                            ⊘ Skipped
                                        </div>
                                    </div>
                                    <div className="bg-gradient-to-br from-red-50 to-red-100/50 dark:from-red-900/20 dark:to-red-900/10 rounded-xl p-4 border-2 border-red-200 dark:border-red-800 shadow-sm">
                                        <div className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums">
                                            {task.summary?.errors || 0}
                                        </div>
                                        <div className="text-xs font-semibold text-red-700 dark:text-red-300 mt-1 uppercase tracking-wide">
                                            ✕ Errors
                                        </div>
                                    </div>
                                </div>

                                {/* Info Box */}
                                <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-900/20 dark:to-blue-900/10 rounded-xl p-4 border-2 border-blue-200 dark:border-blue-800 shadow-sm">
                                    <div className="flex gap-3">
                                        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <div className="text-sm text-blue-700 dark:text-blue-300">
                                            <p className="font-semibold mb-1.5">What's happening:</p>
                                            <ul className="space-y-1 text-xs leading-relaxed">
                                                <li className="flex items-start gap-2">
                                                    <span className="text-blue-500 mt-0.5">•</span>
                                                    <span>Processing visits in batches of 100 for optimal performance</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-blue-500 mt-0.5">•</span>
                                                    <span>Creating invoices from visit prescriptions (skipping duplicates)</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-blue-500 mt-0.5">•</span>
                                                    <span>Updating product stock levels and creating transactions</span>
                                                </li>
                                                <li className="flex items-start gap-2">
                                                    <span className="text-blue-500 mt-0.5">•</span>
                                                    <span>Skipping visits that already have invoices</span>
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                                </div>

                                {/* Cancel Button */}
                                <div className="flex gap-3 justify-end pt-2">
                                    <button 
                                        onClick={cancelGeneration}
                                        className="px-6 py-2.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-lg transition-all font-medium flex items-center gap-2 shadow-lg hover:shadow-xl"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                        Cancel Generation
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            })()}

            {/* Cancel Generation Confirmation Modal */}
            {showCancelGenerationConfirm && (
                <div className={`fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[10001] transition-opacity duration-300 ${cancelConfirmAnimating ? 'opacity-100' : 'opacity-0'}`}>
                    <div className={`bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 transform transition-all duration-300 ${cancelConfirmAnimating ? 'scale-100' : 'scale-95'}`}>
                        <div className="p-6">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center flex-shrink-0">
                                    <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Cancel Invoice Generation?</h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        This will stop the invoice generation process. Any invoices created so far will be saved.
                                    </p>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    onClick={closeCancelConfirm}
                                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                    Continue Generating
                                </button>
                                <button
                                    onClick={confirmCancelGeneration}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                                >
                                    Yes, Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isImportModalOpen && (
                <div 
                    className="fixed inset-0 bg-black/70 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-[101] p-4"
                    onClick={() => setIsImportModalOpen(false)}
                >
                    <div 
                        className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-2xl w-full animate-fadeIn border border-gray-200 dark:border-gray-700"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-gray-800 dark:text-white flex items-center gap-3">
                                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                Import Invoice from PDF
                            </h2>
                            <button 
                                onClick={() => setIsImportModalOpen(false)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-blue-500 dark:hover:border-blue-400 transition-colors">
                                <input 
                                    type="file" 
                                    accept=".pdf"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) {
                                            handlePDFUpload(file)
                                        }
                                    }}
                                    className="hidden"
                                    id="pdf-upload"
                                />
                                <label 
                                    htmlFor="pdf-upload" 
                                    className="cursor-pointer flex flex-col items-center gap-3"
                                >
                                    <svg className="w-16 h-16 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                    <div>
                                        <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">Click to upload PDF</p>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">or drag and drop</p>
                                    </div>
                                    <p className="text-xs text-gray-400 dark:text-gray-500">PDF files only</p>
                                </label>
                            </div>

                            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 border border-blue-200 dark:border-blue-800">
                                <div className="flex gap-3">
                                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <div className="text-sm text-blue-700 dark:text-blue-300">
                                        <p className="font-semibold mb-1">How it works:</p>
                                        <ul className="list-disc list-inside space-y-1 text-xs">
                                            <li>Upload a PDF invoice file</li>
                                            <li>The system will extract invoice details automatically</li>
                                            <li>Review and edit the extracted data</li>
                                            <li>Save to create the invoice in your system</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3 justify-end">
                                <button 
                                    onClick={() => setIsImportModalOpen(false)}
                                    className="px-6 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Print/Download Modal */}
            {isPrintModalOpen && (
                <div className={`fixed inset-0 bg-black transition-opacity duration-300 ${printModalAnimating ? 'bg-opacity-50' : 'bg-opacity-0'}`} style={{ zIndex: 100 }} onClick={closePrintModal}>
                    <div className={`fixed inset-0 flex items-center justify-center p-4 transition-all duration-300 ${printModalAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`} style={{ zIndex: 101 }}>
                        <div className="relative overflow-hidden rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/20 backdrop-blur-sm max-w-md w-full" onClick={e => e.stopPropagation()}>
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none" />
                            
                            <div className="relative p-6">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                                        {printAction === 'print' ? '🖨️ Print' : printAction === 'download' ? '⬇️ Download' : printAction === 'preview' ? '👁️ Preview' : '🔗 Share'} Invoice Details
                                    </h2>
                                    <button 
                                        onClick={closePrintModal}
                                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                                    >
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>

                                <div className="mb-4 text-xs text-blue-600 dark:text-blue-300 font-semibold">
                                    Step {printModalStep} of 2
                                </div>

                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                    {printModalStep === 1 ? 'Fill invoice details, then continue to batch entry.' : 'Enter batch number for each product in this invoice.'}
                                </p>

                                {printModalStep === 1 ? (
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                                                Manufacturer
                                            </label>
                                            <input
                                                type="text"
                                                value={invoiceDetails.manufacturer}
                                                onChange={(e) => setInvoiceDetails({ ...invoiceDetails, manufacturer: e.target.value })}
                                                className="w-full p-2.5 border border-blue-200 dark:border-blue-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
                                                placeholder={invoiceDefaults?.manufacturer || "Enter manufacturer name"}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                                                Expiry Date
                                            </label>
                                            <input
                                                type="text"
                                                value={invoiceDetails.expiry}
                                                onChange={(e) => setInvoiceDetails({ ...invoiceDetails, expiry: e.target.value })}
                                                className="w-full p-2.5 border border-blue-200 dark:border-blue-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
                                                placeholder={invoiceDefaults?.expiry || "e.g., Dec-25"}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                                                Tax Percentage
                                            </label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={invoiceDetails.taxPercent}
                                                onChange={(e) => setInvoiceDetails({ ...invoiceDetails, taxPercent: e.target.value })}
                                                className="w-full p-2.5 border border-blue-200 dark:border-blue-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
                                                placeholder={invoiceDefaults?.gstRate?.toString() || "e.g., 5"}
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                                                Prescribed By (Doctor)
                                            </label>
                                            <CustomSelect
                                                value={invoiceDetails.assignedBy}
                                                onChange={(val) => setInvoiceDetails({ ...invoiceDetails, assignedBy: val })}
                                                options={[
                                                    { value: '', label: 'Select Doctor' },
                                                    ...doctors.map(d => ({
                                                        value: String(d.id),
                                                        label: d.name || d.email || 'Unknown'
                                                    }))
                                                ]}
                                                placeholder="Select Doctor"
                                                className="w-full"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                                                Processing Fees (₹)
                                            </label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={invoiceDetails.processingFees}
                                                onChange={(e) => setInvoiceDetails({ ...invoiceDetails, processingFees: e.target.value })}
                                                className="w-full p-2.5 border border-blue-200 dark:border-blue-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
                                                placeholder={invoiceDefaults?.consultationFees?.toString() || "0.00"}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                                        {(currentPrintInvoice?.items || []).map((item: any, idx: number) => {
                                            const product = products.find((p: any) => p.id === item.productId || p.name === item.description)
                                            return (
                                                <div key={`${item.productId || item.description || 'item'}-${idx}`} className="p-3 rounded-lg border border-blue-100 dark:border-blue-800 bg-white/80 dark:bg-gray-800/60">
                                                    <div className="flex items-center justify-between gap-3 mb-2">
                                                        <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">{item.description || product?.name || `Item ${idx + 1}`}</div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Qty: {item.quantity || 0}</div>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={invoiceDetails.itemBatches?.[String(idx)] || ''}
                                                        onChange={(e) => setInvoiceDetails(prev => ({
                                                            ...prev,
                                                            itemBatches: {
                                                                ...(prev.itemBatches || {}),
                                                                [String(idx)]: e.target.value
                                                            }
                                                        }))}
                                                        className="w-full p-2.5 border border-blue-200 dark:border-blue-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:text-white"
                                                        placeholder={product?.latestBatchNumber || 'Enter batch number'}
                                                    />
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}

                                <div className="flex gap-3 mt-6">
                                    {printModalStep === 1 ? (
                                        <>
                                            <button
                                                onClick={closePrintModal}
                                                className="flex-1 px-4 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handlePrintSubmit}
                                                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-sky-600 hover:from-blue-600 hover:to-sky-700 text-white rounded-lg shadow-lg shadow-blue-200 dark:shadow-blue-900/50 transition-all duration-200 font-medium"
                                            >
                                                Next
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                onClick={() => setPrintModalStep(1)}
                                                className="flex-1 px-4 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
                                            >
                                                Back
                                            </button>
                                            <button
                                                onClick={handlePrintSubmit}
                                                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-sky-600 hover:from-blue-600 hover:to-sky-700 text-white rounded-lg shadow-lg shadow-blue-200 dark:shadow-blue-900/50 transition-all duration-200 font-medium"
                                            >
                                                {printAction === 'print' ? 'Print' : printAction === 'download' ? 'Download' : printAction === 'preview' ? 'Preview' : 'Share'}
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Preview Modal */}
            {isPreviewModalOpen && previewInvoice && (
                <div className={`fixed inset-0 bg-black transition-opacity duration-300 ${previewModalAnimating ? 'bg-opacity-75' : 'bg-opacity-0'}`} style={{ zIndex: 100 }} onClick={closePreviewModal}>
                    <div className={`fixed inset-0 flex items-start justify-center p-2 sm:p-4 overflow-auto transition-all duration-300 ${previewModalAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`} style={{ zIndex: 101 }}>
                        <div className="relative overflow-hidden rounded-lg sm:rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-white dark:bg-gray-900 shadow-2xl w-[98vw] sm:w-[96vw] max-w-5xl h-[90vh] sm:h-[85vh]" onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div className="absolute top-0 left-0 right-0 bg-gradient-to-br from-blue-50 via-white to-sky-50 dark:from-gray-800 dark:via-gray-900 dark:to-gray-800 p-2 sm:p-3 border-b border-blue-200/30 dark:border-blue-700/30 flex items-start sm:items-center justify-between gap-2 sm:gap-3 z-10">
                                <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                                    <h3 className="text-xs sm:text-sm md:text-base font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400 truncate">
                                        Invoice Preview - {previewInvoice.invoiceNumber}
                                    </h3>
                                    {/* Zoom Controls */}
                                    <div className="flex items-center gap-1 sm:gap-2 bg-white dark:bg-gray-800 rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 border border-blue-200/50 dark:border-blue-700/50">
                                        <button
                                            onClick={() => setPreviewZoom(Math.max(50, previewZoom - 10))}
                                            disabled={previewZoom <= 50}
                                            className="p-0.5 sm:p-1 hover:bg-blue-100 dark:hover:bg-gray-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                            title="Zoom Out"
                                        >
                                            <svg className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
                                            </svg>
                                        </button>
                                        <span className="text-xs font-medium text-gray-600 dark:text-gray-400 min-w-[2.5rem] text-center">
                                            {previewZoom}%
                                        </span>
                                        <button
                                            onClick={() => setPreviewZoom(Math.min(200, previewZoom + 10))}
                                            disabled={previewZoom >= 200}
                                            className="p-0.5 sm:p-1 hover:bg-blue-100 dark:hover:bg-gray-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                            title="Zoom In"
                                        >
                                            <svg className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => setPreviewZoom(100)}
                                            className="p-0.5 sm:p-1 hover:bg-blue-100 dark:hover:bg-gray-700 rounded transition-colors ml-0.5 sm:ml-1"
                                            title="Reset Zoom"
                                        >
                                            <svg className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowPreviewExportDropdown((prev) => !prev)}
                                            className="w-full sm:w-auto px-3 py-1.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-500 hover:to-blue-600 transition-all duration-200 shadow-md shadow-sky-700/20 flex items-center justify-center sm:justify-start gap-2"
                                            title="Export Invoice"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10m-3 5l-2 2m0 0l-2-2m2 2v-6M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                            </svg>
                                            <span>Export</span>
                                            <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${showPreviewExportDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 9l-7 7-7-7" />
                                            </svg>
                                        </button>

                                        {showPreviewExportDropdown && (
                                            <>
                                                <div className="fixed inset-0 z-[120]" onClick={() => setShowPreviewExportDropdown(false)}></div>
                                                <div className="absolute right-0 mt-2 bg-white/95 dark:bg-gray-800/95 backdrop-blur-lg border border-blue-200 dark:border-blue-700 rounded-2xl shadow-2xl z-[130] overflow-hidden sm:w-[240px]">
                                                    <button
                                                        onClick={() => openExportFromPreview('download')}
                                                        className="w-full px-4 py-3 flex items-center gap-2 text-left text-sm font-semibold text-blue-800 dark:text-blue-200 hover:bg-blue-50 dark:hover:bg-blue-900/25 transition-colors border-b border-blue-100 dark:border-blue-800/60"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                        </svg>
                                                        Download
                                                    </button>
                                                    <button
                                                        onClick={() => openExportFromPreview('print')}
                                                        className="w-full px-4 py-3 flex items-center gap-2 text-left text-sm font-semibold text-blue-800 dark:text-blue-200 hover:bg-blue-50 dark:hover:bg-blue-900/25 transition-colors border-b border-blue-100 dark:border-blue-800/60"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                                        </svg>
                                                        Print
                                                    </button>
                                                    <button
                                                        onClick={() => openExportFromPreview('share')}
                                                        className="w-full px-4 py-3 flex items-center gap-2 text-left text-sm font-semibold text-blue-800 dark:text-blue-200 hover:bg-blue-50 dark:hover:bg-blue-900/25 transition-colors"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C9.886 14.036 11.278 14.5 12 14.5c.722 0 2.114-.464 3.316-1.158M8.684 10.658C9.886 9.964 11.278 9.5 12 9.5c.722 0 2.114.464 3.316 1.158M4 6a3 3 0 116 0 3 3 0 01-6 0zm10 12a3 3 0 116 0 3 3 0 01-6 0z" />
                                                        </svg>
                                                        Share
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    <button
                                        onClick={closePreviewModal}
                                        className="p-1.5 sm:p-2 hover:bg-blue-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex-shrink-0"
                                        title="Close"
                                    >
                                        <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>

                            {/* PDF Preview - Full height iframe with zoom and scroll */}
                            <div className="relative w-full h-[calc(100%-60px)] sm:h-[calc(100%-56px)] mt-[60px] sm:mt-14 bg-gray-100 dark:bg-gray-800 overflow-auto">
                                <div className="min-w-full" style={{ 
                                    transform: `scale(${previewZoom / 100})`,
                                    transformOrigin: 'top left',
                                    minWidth: '1120px',
                                    transition: 'transform 0.2s ease-out'
                                }}>
                                    <iframe
                                        srcDoc={generateInvoiceHTML(previewInvoice, products, invoiceDetails, 'preview', bottlePricing, invoiceDefaults, clinicImages, user?.clinic?.name || 'ERP Flow Studios', user?.clinic?.city || 'Your City', user?.clinic?.subscriptionPlan === 'pro')}
                                        className="border-0 w-full bg-white"
                                        style={{ width: '1120px', height: '794px' }}
                                        title="Invoice Preview"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ToastNotification toasts={toasts} removeToast={removeToast} />
        </div>
    )
}

function generateInvoiceHTML(inv: any, products: any[], invoiceDetails: any, action: 'print' | 'download' | 'share' | 'preview' = 'print', bottlePricing: any[] = [], defaults: any = null, clinicImages: { header: string, signature: string } = { header: '/header.png', signature: '/signature.png' }, clinicName: string = 'ERP Flow Studios', clinicCity: string = 'Your City', isPro: boolean = false): string {
    const items = inv.items || []
    const formatMoney = (value: number) => Number(value || 0).toFixed(2)
    const printableItems = items.filter((item: any) => {
        const product = products.find((p: any) => p.name === item.description || p.id === item.productId)
        const categoryName = product?.category?.name || product?.category || ''
        return categoryName.toLowerCase() !== 'misc'
    })
    const printableItemCount = printableItems.length
    const densityClass =
        printableItemCount > 20 ? 'ultra-dense' :
        printableItemCount > 15 ? 'dense' :
        printableItemCount > 10 ? 'compact' :
        ''
    
    // Use saved invoice details
    const { manufacturer, expiry, taxPercent, assignedBy, processingFees, itemBatches } = invoiceDetails
    const taxRate = taxPercent !== '' && taxPercent !== null && taxPercent !== undefined 
        ? Number(taxPercent) 
        : (defaults?.gstRate !== null && defaults?.gstRate !== undefined ? Number(defaults.gstRate) : 0)
    // Use processingFees from invoiceDetails (set in modal), fallback to invoice or defaults
    const consultationFees = processingFees !== '' && processingFees !== null && processingFees !== undefined 
        ? Number(processingFees)
        : (inv.processingFees !== null && inv.processingFees !== undefined 
            ? Number(inv.processingFees) 
            : (Number(defaults?.consultationFees) || 0))
    
    // Find assigned doctor name - use assignedBy if available, otherwise fall back to patient doctor
    let assignedDoctorName = 'N/A'
    if (assignedBy) {
        // If assignedBy is set, find the doctor name from the doctors list or use patient doctor
        assignedDoctorName = inv.patient?.doctor?.name || 'N/A'
    } else {
        // Fall back to patient's doctor if no assignedBy is set
        assignedDoctorName = inv.patient?.doctor?.name || 'N/A'
    }
    
    // Get prescriptions from visit if available (populated when invoice is loaded with visit data)
    const prescriptions = inv.visit?.prescriptions || inv.prescriptions || []
    
    // Calculate bottle pricing to add to product prices
    let totalBottlePricing = 0
    const productBottlePricing: { [productId: number]: number } = {}
    
    if (prescriptions.length > 0 && bottlePricing.length > 0) {
        let spyBottleAdded = false
        let additionsBottleAdded = false
        
        prescriptions.forEach((pr: any) => {
            if (pr.bottleSize) {
                const bottlePriceData = bottlePricing.find((b: any) => b.value === pr.bottleSize)
                const bottlePrice = bottlePriceData ? bottlePriceData.price : 0
                
                // Add for SPY components (spy4-spy6) - add to first product with spy4-6
                if (!spyBottleAdded && (pr.spy4 || pr.spy5 || pr.spy6) && bottlePrice > 0) {
                    productBottlePricing[pr.productId] = (productBottlePricing[pr.productId] || 0) + bottlePrice
                    totalBottlePricing += bottlePrice
                    spyBottleAdded = true
                }
                
                // Add for Additions (addition1-addition3) - add to first product with add1-3
                if (!additionsBottleAdded && (pr.addition1 || pr.addition2 || pr.addition3) && bottlePrice > 0) {
                    productBottlePricing[pr.productId] = (productBottlePricing[pr.productId] || 0) + bottlePrice
                    totalBottlePricing += bottlePrice
                    additionsBottleAdded = true
                }
            }
        })
    }
    
    const discount = inv.discount || 0
    
    // Calculate total from items, adding bottle pricing proportionally to products
    const totalWithTax = printableItems.reduce((sum: number, item: any) => {
        const qty = item.quantity || 0
        const price = item.unitPrice || 0
        const itemTotal = qty * price
        return sum + itemTotal
    }, 0) + totalBottlePricing
    
    const totalAfterDiscount = totalWithTax - discount
    
    // Calculate subtotal by removing tax from total (reverse calculation)
    // If total includes tax: total = subtotal * (1 + taxRate/100)
    // So: subtotal = total / (1 + taxRate/100)
    const subtotal = totalAfterDiscount / (1 + taxRate / 100)
    const totalTax = totalAfterDiscount - subtotal
    
    // Final amount includes processing fees and is rounded to the nearest rupee for display.
    const exactTotal = totalAfterDiscount + consultationFees
    const roundedTotal = Math.round(exactTotal)
    const roundOff = roundedTotal - exactTotal
    
    const headerImgUrl = clinicImages.header
    const watermarkImgUrl = clinicImages.signature
    
    const convertNumberToWords = (amount: number) => {
        const words = new Map([
            [0, 'ZERO'], [1, 'ONE'], [2, 'TWO'], [3, 'THREE'], [4, 'FOUR'], 
            [5, 'FIVE'], [6, 'SIX'], [7, 'SEVEN'], [8, 'EIGHT'], [9, 'NINE'], 
            [10, 'TEN'], [11, 'ELEVEN'], [12, 'TWELVE'], [13, 'THIRTEEN'], 
            [14, 'FOURTEEN'], [15, 'FIFTEEN'], [16, 'SIXTEEN'], [17, 'SEVENTEEN'], 
            [18, 'EIGHTEEN'], [19, 'NINETEEN'], [20, 'TWENTY'], [30, 'THIRTY'], 
            [40, 'FORTY'], [50, 'FIFTY'], [60, 'SIXTY'], [70, 'SEVENTY'], 
            [80, 'EIGHTY'], [90, 'NINETY']
        ]);
        
        const toWords = (num: number): string => {
            if (num < 20) return words.get(num) || '';
            if (num < 100) return (words.get(Math.floor(num / 10) * 10) || '') + (num % 10 ? ' ' + words.get(num % 10) : '');
            if (num < 1000) return (words.get(Math.floor(num / 100)) || '') + ' HUNDRED' + (num % 100 ? ' AND ' + toWords(num % 100) : '');
            if (num < 100000) return toWords(Math.floor(num / 1000)) + ' THOUSAND' + (num % 1000 ? ' ' + toWords(num % 1000) : '');
            if (num < 10000000) return toWords(Math.floor(num / 100000)) + ' LAKH' + (num % 100000 ? ' ' + toWords(num % 100000) : '');
            return toWords(Math.floor(num / 10000000)) + ' CRORE' + (num % 10000000 ? ' ' + toWords(num % 10000000) : '');
        };
        
        if (amount === 0) return 'ZERO ONLY';
        return toWords(Math.floor(amount)) + ' ONLY';
    };

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Invoice ${inv.invoiceNumber} - V2</title>
            <style>
                @page { size: A4 landscape; margin: 0; }
                * { box-sizing: border-box; }
                html, body { margin: 0; padding: 0; width: 297mm; height: 210mm; font-family: Arial, sans-serif; font-size: 10pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; overflow: hidden; background: white; }
                body { display: flex; justify-content: center; align-items: flex-start; background: white; }
                .a4-page {
                    width: 297mm;
                    height: 210mm;
                    overflow: hidden;
                    position: relative;
                    margin: 0 auto;
                    background: #fff;
                }
                .container {
                    width: 100%;
                    padding: 4mm 5mm 5mm 5mm;
                    display: flex;
                    flex-direction: column;
                    background: white;
                    transform-origin: top left;
                    will-change: transform;
                }
                .content-wrapper { flex: 0 0 auto; min-height: 0; }
                
                .header-img { width: 100%; height: auto; display: block; margin-bottom: 5px; }
                
                table { width: 100%; border-collapse: collapse; border: 1px solid #000; margin-top: 5px; table-layout: fixed; }
                th { background-color: ${isPro ? '#ffeb3b' : '#ffffff'}; color: ${isPro ? 'red' : '#000000'}; border: 1px solid #000; padding: 5px; font-weight: bold; text-align: center; font-size: 9pt; line-height: 1.15; }
                td { border: 1px solid #000; padding: 5px; font-size: 9pt; vertical-align: top; line-height: 1.15; }
                
                .col-sno { width: 40px; text-align: center; }
                .col-qty { width: 84px; text-align: center; white-space: nowrap; }
                .col-item { }
                .col-mfg { width: 120px; }
                .col-batch { width: 100px; }
                .col-exp { width: 80px; }
                .col-price { width: 80px; text-align: right; }
                .col-tax { width: 50px; text-align: center; }
                .col-total { width: 100px; text-align: right; }
                
                .footer-section { flex-shrink: 0; margin-top: 8px; border: 1px solid #000; border-top: none; }
                .amount-words { border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 5px; font-weight: bold; }
                
                .bottom-layout { display: flex; justify-content: space-between; align-items: flex-end; }
                .terms { flex: 1; padding: 10px; font-size: 8pt; }
                .center-logo { flex: 1; text-align: center; padding-bottom: 10px; }
                .watermark { height: 90px; width: auto; margin-bottom: 5px; }
                .totals { width: 300px; padding: 0; font-size: 9pt; border-left: 1px solid #000; }
                
                .totals-row { display: flex; justify-content: space-between; padding: 2px 5px; }
                .totals-row.final { background-color: ${isPro ? '#ffeb3b' : '#ffffff'}; font-weight: bold; border-top: 1px solid #000; }
                
                .yellow-bar { background-color: ${isPro ? 'orange' : '#ffffff'}; color: black; text-align: center; font-weight: bold; padding: 2px; border-top: 1px solid #000; }
                .compact th, .compact td { padding: 4px; font-size: 8pt; line-height: 1.05; }
                .compact .header-img { margin-bottom: 3px; }
                .compact .footer-section { margin-top: 6px; }
                .compact .terms { padding: 8px; font-size: 7.5pt; }
                .compact .watermark { height: 72px; }
                .compact .totals { width: 280px; font-size: 8pt; }
                .compact .totals-row { padding: 1px 5px; }
                .dense th, .dense td { padding: 3px; font-size: 7.25pt; line-height: 1; }
                .dense .header-img { margin-bottom: 2px; }
                .dense .footer-section { margin-top: 5px; }
                .dense .amount-words { padding: 4px; font-size: 8pt; }
                .dense .terms { padding: 6px; font-size: 7pt; }
                .dense .watermark { height: 60px; margin-bottom: 3px; }
                .dense .totals { width: 260px; font-size: 7.5pt; }
                .dense .totals-row { padding: 1px 4px; }
                .dense .yellow-bar { padding: 1px; font-size: 8pt; }
                .ultra-dense th, .ultra-dense td { padding: 2px; font-size: 6.5pt; line-height: 1; }
                .ultra-dense .header-img { margin-bottom: 1px; }
                .ultra-dense .footer-section { margin-top: 4px; }
                .ultra-dense .amount-words { padding: 3px; font-size: 7pt; }
                .ultra-dense .terms { padding: 5px; font-size: 6.25pt; }
                .ultra-dense .watermark { height: 48px; margin-bottom: 2px; }
                .ultra-dense .totals { width: 230px; font-size: 6.75pt; }
                .ultra-dense .totals-row { padding: 1px 3px; }
                .ultra-dense .yellow-bar { padding: 1px; font-size: 7pt; }
                
                @media print {
                    @page { size: A4 landscape; margin: 0; }
                    html, body { width: 297mm; height: 210mm; overflow: hidden; }
                    body { margin: 0; }
                    .a4-page { width: 297mm; height: 210mm; }
                }
            </style>
        </head>
        <body>
            <div id="invoice-page" class="a4-page ${densityClass}">
            <div id="invoice-content" class="container">
                <div class="content-wrapper">
                <img src="${headerImgUrl}" class="header-img" alt="Header" />
                
                <div style="padding: 2px 5px; border: 1px solid #000; border-bottom: none; display: flex; justify-content: space-between; font-size: 9pt;">
                    <div>
                        <strong>Patient:</strong> ${inv.customerName || ''} &nbsp;&nbsp;
                        <strong>Prescribed by:</strong> ${assignedDoctorName}
                    </div>
                    <div>
                        <strong>Invoice No:</strong> ${inv.invoiceNumber || ''} &nbsp;&nbsp;
                        <strong>Date:</strong> ${inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('en-IN') : ''}
                    </div>
                </div>

                <table>
                    <thead>
                        <tr>
                            <th class="col-sno">sno</th>
                            <th class="col-qty">quantity</th>
                            <th class="col-item">item</th>
                            <th class="col-mfg">manufacturer</th>
                            <th class="col-batch">batch</th>
                            <th class="col-exp">expiry</th>
                            <th class="col-price">price/unit</th>
                            <th class="col-tax">tax %</th>
                            <th class="col-total">total amount</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${(() => {
                            // Calculate bottle pricing first
                            let spyBottlePrice = 0
                            let additionsBottlePrice = 0
                            let spyProductId: number | null = null
                            let additionsProductId: number | null = null
                            
                            if (prescriptions.length > 0 && bottlePricing.length > 0) {
                                let spyBottleAdded = false
                                let additionsBottleAdded = false
                                
                                prescriptions.forEach((pr: any) => {
                                    if (pr.bottleSize) {
                                        const bottlePriceData = bottlePricing.find((b: any) => b.value === pr.bottleSize)
                                        const bottlePrice = bottlePriceData ? bottlePriceData.price : 0
                                        
                                        // Add for SPY components (spy4-spy6)
                                        if (!spyBottleAdded && (pr.spy4 || pr.spy5 || pr.spy6) && bottlePrice > 0) {
                                            spyBottlePrice = bottlePrice
                                            spyProductId = pr.productId
                                            spyBottleAdded = true
                                        }
                                        
                                        // Add for Additions (addition1-addition3)
                                        if (!additionsBottleAdded && (pr.addition1 || pr.addition2 || pr.addition3) && bottlePrice > 0) {
                                            additionsBottlePrice = bottlePrice
                                            additionsProductId = pr.productId
                                            additionsBottleAdded = true
                                        }
                                    }
                                })
                            }
                            
                            return printableItems.map((item: any, idx: number) => {
                                const product = products.find((p: any) => p.name === item.description || p.id === item.productId);
                                const mfg = manufacturer || product?.manufacturer || '';
                                const itemBatch = (itemBatches?.[String(idx)] || product?.latestBatchNumber || '').trim();
                                const itemExpiry = expiry || '';
                                
                                // Quantity column should show invoice quantity with unit type (e.g., 15 ML).
                                const unitStr = product?.unit ? String(product.unit).trim() : '';
                                const unitParts = unitStr.split(/\s+/).filter(Boolean);
                                const firstPart = unitParts[0] || '1';
                                const unitQuantity = !isNaN(Number(firstPart)) ? Number(firstPart) : 1;
                                const unitType = unitParts.length > 1 ? unitParts.slice(1).join(' ') : 'UNIT';
                                const prescriptionQty = Number(item.quantity) || 0;
                                const displayQuantity = prescriptionQty;
                                const formattedQuantity = Number.isFinite(displayQuantity)
                                    ? (Math.round(displayQuantity * 10) / 10).toString().replace(/\.0$/, '')
                                    : '0';
                                const quantityDisplay = `${formattedQuantity} ${unitType}`.trim();
                                
                                // Get base unit price
                                let unitPrice = Number(item.unitPrice) || 0;
                                
                                // Add bottle pricing to this product if it has SPY4-6 or ADD1-3
                                let bottlePriceToAdd = 0
                                if (product && String(product.id) === String(spyProductId) && spyBottlePrice > 0) {
                                    bottlePriceToAdd += spyBottlePrice
                                }
                                if (product && String(product.id) === String(additionsProductId) && additionsBottlePrice > 0) {
                                    bottlePriceToAdd += additionsBottlePrice
                                }
                                
                                // Add bottle price evenly distributed across quantity
                                // This way unit price shows the correct per-unit cost including bottle
                                const bottlePricePerUnit = bottlePriceToAdd > 0 && prescriptionQty > 0 ? bottlePriceToAdd / prescriptionQty : 0
                                const adjustedUnitPrice = unitPrice + bottlePricePerUnit
                                
                                // Calculate sale price per pack with bottle pricing included
                                const salePricePerPack = adjustedUnitPrice * unitQuantity;
                                
                                // Total calculation: prescription quantity * adjusted unit price
                                const itemTotal = prescriptionQty * adjustedUnitPrice;
                                const roundedItemTotal = Math.round(itemTotal);
                            
                                return `
                                <tr>
                                    <td class="col-sno">${idx + 1}</td>
                                    <td class="col-qty">${quantityDisplay}</td>
                                    <td class="col-item">${item.description}</td>
                                    <td class="col-mfg">${mfg}</td>
                                    <td class="col-batch">${itemBatch}</td>
                                    <td class="col-exp">${itemExpiry}</td>
                                    <td class="col-price">${Number(salePricePerPack).toFixed(2)}</td>
                                    <td class="col-tax">${taxRate}</td>
                                    <td class="col-total">${formatMoney(roundedItemTotal)}</td>
                                </tr>
                                `;
                            }).join('')
                        })()}
                    </tbody>
                </table>
                </div>
                
                <div class="footer-section">
                    <div class="amount-words">
                        Rupees: ${convertNumberToWords(roundedTotal)}
                    </div>
                    
                    <div class="bottom-layout">
                        <div class="terms">
                            <p>1. Subject to ${clinicCity} Jurisdiction.</p>
                            <p>2. Goods once sold can not be taken back.</p>
                            <p>3. Net amount includes all taxes</p>
                        </div>
                        
                        <div class="center-logo">
                            <img src="${watermarkImgUrl}" class="watermark" alt="Logo" />
                            <div style="font-weight: bold; font-size: 9pt;">${clinicName}</div>
                        </div>

                        <div class="totals">
                            <div class="totals-row">
                                <span>Sub Total</span>
                                <span>${formatMoney(subtotal)}</span>
                            </div>
                            <div class="totals-row">
                                <span>CGST ${(taxRate/2).toFixed(2)}%</span>
                                <span>${formatMoney(totalTax / 2)}</span>
                            </div>
                            <div class="totals-row">
                                <span>SGST ${(taxRate/2).toFixed(2)}%</span>
                                <span>${formatMoney(totalTax / 2)}</span>
                            </div>
                            <div class="totals-row">
                                <span>Processing Fees</span>
                                <span>${formatMoney(consultationFees)}</span>
                            </div>
                            <div class="totals-row">
                                <span>Discount</span>
                                <span>${formatMoney(discount)}</span>
                            </div>
                            <div class="totals-row">
                                <span>Round off +/-</span>
                                <span>${formatMoney(roundOff)}</span>
                            </div>
                            <div class="totals-row final">
                                <span>Net Amount</span>
                                <span>${formatMoney(roundedTotal)}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="yellow-bar">
                        Thanks for your buisness connection
                    </div>
                </div>
            </div>
                </div>
                <script>
                    function fitInvoiceToSingleA4Page() {
                        var page = document.getElementById('invoice-page');
                        var content = document.getElementById('invoice-content');
                        if (!page || !content) return;

                        content.style.transform = 'translateX(0) scale(1)';

                        var availableWidth = page.clientWidth;
                        var availableHeight = page.clientHeight;
                        var contentWidth = content.scrollWidth;
                        var contentHeight = content.scrollHeight;

                        var widthScale = availableWidth / Math.max(contentWidth, 1);
                        var heightScale = availableHeight / Math.max(contentHeight, 1);
                        var scale = Math.min(1, widthScale, heightScale);
                        var scaledWidth = contentWidth * scale;
                        var translateX = Math.max((availableWidth - scaledWidth) / 2, 0);

                        content.style.transform = 'translateX(' + translateX + 'px) scale(' + scale + ')';
                    }

                    function scheduleFit() {
                        fitInvoiceToSingleA4Page();
                        requestAnimationFrame(function() {
                            fitInvoiceToSingleA4Page();
                        });
                    }

                    window.addEventListener('load', function() {
                        setTimeout(scheduleFit, 120);

                        Array.prototype.forEach.call(document.images || [], function(img) {
                            if (!img.complete) {
                                img.addEventListener('load', scheduleFit);
                                img.addEventListener('error', scheduleFit);
                            }
                        });
                    });

                    window.addEventListener('resize', function() {
                        scheduleFit();
                    });
                </script>
            ${action !== 'preview' ? `
            <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
            <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
            <script>
                window.onload = function() {
                    setTimeout(function() {
                        scheduleFit();
                        const exportMode = '${action}';
                        const isDownload = exportMode === 'download';
                        const isShare = exportMode === 'share';
                        if (isDownload || isShare) {
                                // Guaranteed single-page A4 PDF by capturing fitted page as one image.
                                const element = document.getElementById('invoice-page');
                                html2canvas(element, { scale: 2, useCORS: true, letterRendering: true, backgroundColor: '#ffffff' })
                                    .then(function(canvas) {
                                        const imgData = canvas.toDataURL('image/jpeg', 0.98);
                                        const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
                                        pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210);

                                        const fileName = 'Invoice_${inv.invoiceNumber || 'Download'}.pdf';

                                        const blob = pdf.output('blob');
                                        if (window.opener && !window.opener.closed) {
                                            var msgType = isDownload ? 'download-ready' : 'share-ready';
                                            window.opener.postMessage({
                                                source: 'invoice-export',
                                                type: msgType,
                                                blob: blob,
                                                fileName: fileName
                                            }, window.location.origin);
                                        } else if (isDownload) {
                                            pdf.save(fileName);
                                        }
                                    })
                                    .catch(function(error) {
                                        if ((isShare || isDownload) && window.opener && !window.opener.closed) {
                                            var errType = isDownload ? 'download-error' : 'share-error';
                                            window.opener.postMessage({
                                                source: 'invoice-export',
                                                type: errType,
                                                message: error && error.message ? error.message : 'Failed to prepare invoice PDF.'
                                            }, window.location.origin);
                                        }
                                    })
                                    .finally(function() {
                                        window.close();
                                    });
                        } else {
                            // Regular print
                            window.print();
                            window.close();
                        }
                    }, 500);
                };
            </script>
            ` : ''}
        </body>
        </html>
    `
}
