import { useState, useEffect, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/router'
import * as XLSX from 'xlsx'
import { useAuth } from '../contexts/AuthContext'
import CustomSelect from '../components/CustomSelect'
import ConfirmModal from '../components/ConfirmModal'
import ImportProductsModal from '../components/ImportProductsModal'
import ToastNotification from '../components/ToastNotification'
import { useToast } from '../hooks/useToast'
import { requireStaffOrAbove } from '../lib/withAuth'
import { useImportContext } from '../contexts/ImportContext'
import { useDataCache } from '../contexts/DataCacheContext'
import { useDoctor } from '../contexts/DoctorContext'
import RefreshButton from '../components/RefreshButton'
import { formatPrice, formatQuantity, formatCurrency } from '../lib/utils'
import { useDefaultValues } from '../hooks/useDefaultValues'
import { getCachedCurrentUser, setCachedCurrentUser } from '../lib/currentUserStorage'
import { isBasicPlan } from '../lib/subscription'
import StandardFeatureBadge from '../components/StandardFeatureBadge'
import ThemedScrollArea from '../components/ThemedScrollArea'

interface ProductDeleteImpact {
    id: number
    name: string
    categoryName: string
    flowInventory: number
    minStockLevel: number
    totalPurchased: number
    totalSales: number
    usage: {
        prescriptions: number
        invoiceItems: number
        treatmentPlans: number
        purchaseOrderItems: number
        stockTransactions: number
        batches: number
        productOrders: number
        forecasts: number
        billMappings: number
    }
    totalUsageCount: number
    isUsed: boolean
    isRecoverable: boolean
}

function ProductsPage() {
    const router = useRouter()
    const { defaults: productDefaults } = useDefaultValues('products')
    const [items, setItems] = useState<any[]>([])
    const [categories, setCategories] = useState<any[]>([])
    const [unitTypes, setUnitTypes] = useState<any[]>([])
    const [loadingOptions, setLoadingOptions] = useState(true)
    const [editingId, setEditingId] = useState<number | null>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isAnimating, setIsAnimating] = useState(false)
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [deleteId, setDeleteId] = useState<number | null>(null)
    const [searchQuery, setSearchQuery] = useState('')
    const [sortBy, setSortBy] = useState<'name' | 'price' | 'quantity' | 'category' | 'expiryDate' | 'stockStatus'>('name')
    const [sortOrders, setSortOrders] = useState<{[key: string]: 'asc' | 'desc'}>({
        name: 'asc',
        price: 'asc',
        quantity: 'desc',
        category: 'asc',
        expiryDate: 'asc',
        stockStatus: 'desc'
    })
    const [showSortDropdown, setShowSortDropdown] = useState(false)
    const [loading, setLoading] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [deletingIds, setDeletingIds] = useState<Set<number>>(new Set())
    const [showImportModal, setShowImportModal] = useState(false)
    const [hasNewProductDefaults, setHasNewProductDefaults] = useState(false)
    const [productImportPulseEnabled, setProductImportPulseEnabled] = useState(true)
    const [showExportDropdown, setShowExportDropdown] = useState(false)
    const [selectedProductIds, setSelectedProductIds] = useState<Set<number>>(new Set())
    const [showDeleteSelectedConfirm, setShowDeleteSelectedConfirm] = useState(false)
    const [deleteTargetIds, setDeleteTargetIds] = useState<number[]>([])
    const [deleteImpactLoading, setDeleteImpactLoading] = useState(false)
    const [deleteImpactRows, setDeleteImpactRows] = useState<ProductDeleteImpact[]>([])
    const [deleteImpactError, setDeleteImpactError] = useState('')
    const [resettingValues, setResettingValues] = useState(false)
    const [deleteProgress, setDeleteProgress] = useState({ current: 0, total: 0 })
    const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null)
    const [isDeleteMinimized, setIsDeleteMinimized] = useState(false)
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
    const [generatingPO, setGeneratingPO] = useState(false)
    const [showLowStockModal, setShowLowStockModal] = useState(false)
    const [lowStockModalAnimating, setLowStockModalAnimating] = useState(false)
    const [selectedSupplier, setSelectedSupplier] = useState('')
    const [suppliers, setSuppliers] = useState<any[]>([])
    const [selectedPOIndices, setSelectedPOIndices] = useState<Set<number>>(new Set())
    const [lowStockProducts, setLowStockProducts] = useState<any[]>([])
    const [poRequestedQty, setPORequestedQty] = useState<{[key: number]: number}>({})
    const [sendingEmail, setSendingEmail] = useState(false)
    const [showSuccessModal, setShowSuccessModal] = useState(false)
    const [successMessage, setSuccessMessage] = useState('')
    const [showLoadingModal, setShowLoadingModal] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [isFilterCategoryOpen, setIsFilterCategoryOpen] = useState(false)
    const [isFilterStockOpen, setIsFilterStockOpen] = useState(false)
    const [isFilterPriceOpen, setIsFilterPriceOpen] = useState(false)
    const [isModalCategoryOpen, setIsModalCategoryOpen] = useState(false)
    const [isUnitTypeOpen, setIsUnitTypeOpen] = useState(false)
    const [isSupplierOpen, setIsSupplierOpen] = useState(false)
    const [isPurchaseQtyLocked, setIsPurchaseQtyLocked] = useState(true)
    const [isSalesQtyLocked, setIsSalesQtyLocked] = useState(true)
    const [isMinStockLocked, setIsMinStockLocked] = useState(true)
    const { toasts, removeToast, showSuccess, showError, showInfo } = useToast()
    const { addTask, updateTask } = useImportContext()
    const { getCache, setCache } = useDataCache()
    const { selectedDoctorId } = useDoctor()
    
    // Memoize category options to prevent recreating array on every render
    const categoryOptions = useMemo(() => [
        { value: '', label: 'All Categories' },
        ...categories.map((cat: string) => ({
            value: cat,
            label: cat
        }))
    ], [categories])
    
    const modalCategoryOptions = useMemo(() => [
        { value: '', label: 'Select category' },
        ...categories.map((cat: string) => ({
            value: cat,
            label: cat
        }))
    ], [categories])
    
    // Filter states
    const [filterCategory, setFilterCategory] = useState<string>('')
    const [filterStockStatus, setFilterStockStatus] = useState<string>('')
    const [filterPriceRange, setFilterPriceRange] = useState<string>('')
    const [showNewOnly, setShowNewOnly] = useState(false)
    const [showFilters, setShowFilters] = useState(false)
    
    const emptyForm = {
        name: '',
        categoryId: '',
        unitQuantity: '',
        unitType: '',
        latestBatchNumber: '',
        priceRupees: '',
        purchasePriceRupees: '',
        totalPurchased: '',
        totalSales: '',
        quantity: '',
        inventoryValue: '',
        purchaseValue: '',
        salesValue: '',
        actualInventory: '',
        minStockLevel: productDefaults.minStockLevel ?? '200'
    }
    
    const [form, setForm] = useState(emptyForm)

    const fetchDefaultTemplateStatus = useCallback(async () => {
        try {
            const res = await fetch('/api/default-templates-status')
            if (!res.ok) return
            const status = await res.json()
            setHasNewProductDefaults(Boolean(status?.hasNewProductDefaults))
            setProductImportPulseEnabled(status?.productImportPulseEnabled !== false)
        } catch {
            // Ignore status fetch errors; import actions remain available.
        }
    }, [])

    const isProductFromToday = useCallback((product: any) => {
        if (!product?.createdAt) return false
        const createdDate = new Date(product.createdAt).toDateString()
        const today = new Date().toDateString()
        return createdDate === today
    }, [])

    const fetchProducts = useCallback(async () => {
        try {
            setLoading(true)
            const params = new URLSearchParams()
            if (selectedDoctorId) params.append('doctorId', selectedDoctorId.toString())
            const queryString = params.toString() ? `?${params}` : ''
            const [productsData, suppliersData, categoriesData] = await Promise.all([
                fetch(`/api/products${queryString}`).then(r => r.json()),
                fetch(`/api/suppliers${queryString}`).then(r => r.json()),
                fetch(`/api/categories${queryString}`).then(r => r.json())
            ])
            setItems(Array.isArray(productsData) ? productsData : [])
            // Use categories from database and remove duplicates
            const categoryNames = Array.isArray(categoriesData) ? categoriesData.map((c: any) => c.name).filter(Boolean) : []
            const uniqueCategories = Array.from(new Set(categoryNames))
            setCategories(uniqueCategories)
            setSuppliers(Array.isArray(suppliersData) ? suppliersData.filter((s: any) => s.status === 'active') : [])
            setCache('products', productsData)
        } catch (error) {
        } finally {
            setLoading(false)
        }
    }, [selectedDoctorId, setCache])

    useEffect(() => {
        const cachedProducts = getCache<any[]>('products')
        if (cachedProducts) {
            setItems(Array.isArray(cachedProducts) ? cachedProducts : [])
            setLoading(false)
            // Fetch categories and suppliers even with cached products
            const params = new URLSearchParams()
            if (selectedDoctorId) params.append('doctorId', selectedDoctorId.toString())
            const queryString = params.toString() ? `?${params}` : ''
            
            Promise.all([
                fetch(`/api/suppliers${queryString}`).then(r => r.json()),
                fetch(`/api/categories${queryString}`).then(r => r.json())
            ]).then(([suppliersData, categoriesData]) => {
                setSuppliers(Array.isArray(suppliersData) ? suppliersData.filter((s: any) => s.status === 'active') : [])
                const categoryNames = Array.isArray(categoriesData) ? categoriesData.map((c: any) => c.name).filter(Boolean) : []
                const uniqueCategories = Array.from(new Set(categoryNames))
                setCategories(uniqueCategories)
            }).catch(() => {})
        } else {
            // Only fetch if no cache
            fetchProducts()
        }
        
        // Cleanup on unmount
        return () => {
            setItems([])
            setCategories([])
            setSuppliers([])
        }
    }, [selectedDoctorId, fetchProducts, getCache])
    
    // Fetch dropdown options from API
    useEffect(() => {
        const fetchOptions = async () => {
            try {
                setLoadingOptions(true)
                const [unitTypesData] = await Promise.all([
                    fetch('/api/options/unit-types').then(r => r.json()).catch(() => [])
                ])
                
                // Fallback to JSON file if API returns empty data
                if (unitTypesData.length === 0) {
                    const unitTypesJSON = (await import('../data/unitTypes.json')).default
                    setUnitTypes(unitTypesJSON)
                } else {
                    setUnitTypes(unitTypesData)
                }
            } catch (error) {
                // Fallback to JSON on error
                try {
                    const unitTypesJSON = (await import('../data/unitTypes.json')).default
                    setUnitTypes(unitTypesJSON)
                } catch (fallbackError) {
                }
            } finally {
                setLoadingOptions(false)
            }
        }
        fetchOptions()
    }, [])
    
    // Listen for doctor change events
    useEffect(() => {
        const handleDoctorChange = () => {
            fetchProducts()
        }
        
        window.addEventListener('doctor-changed', handleDoctorChange)
        return () => window.removeEventListener('doctor-changed', handleDoctorChange)
    }, [fetchProducts])

    useEffect(() => {
        fetchDefaultTemplateStatus()
    }, [fetchDefaultTemplateStatus])
    
    const { user } = useAuth()
    const isBasicSubscription = isBasicPlan(user?.clinic?.subscriptionPlan)

    // Listen for maximize events from notification dropdown
    useEffect(() => {
        const handleMaximize = (e: any) => {
            if (e.detail.type === 'products' && e.detail.operation === 'delete' && e.detail.taskId === deleteTaskId) {
                setIsDeleteMinimized(false)
            }
        }
        window.addEventListener('maximizeTask', handleMaximize)
        return () => window.removeEventListener('maximizeTask', handleMaximize)
    }, [deleteTaskId])

    // Auto-calculate all formula fields
    useEffect(() => {
        const units = Number(form.unitQuantity) || 0  // No. of units
        const ratePerUnit = Number(form.priceRupees) || 0  // RATE/UNIT - sale price per unit
        const purchasePricePerPack = Number(form.purchasePriceRupees) || 0  // PURCHASE PRICE/PACK
        const purchase = Number(form.totalPurchased) || 0  // PURCHASE (FLOW)
        const sales = Number(form.totalSales) || 0  // SALES (FLOW)
        
        // SALE PRICE/PACK = sale price per unit × no. of units
        const salePricePerPack = ratePerUnit * units
        
        // INVENTORY (FLOW) = PURCHASE - SALES
        const flowInventory = purchase - sales
        
        // ACTUAL INVENTORY = INVENTORY (FLOW) / no. of units
        const actualInventory = units > 0 ? Math.floor(flowInventory / units) : 0
        
        // INVENTORY VALUE = sale price per unit × INVENTORY (FLOW)
        const inventoryValue = ratePerUnit * flowInventory
        
        // PURCHASE VALUE = sale price per unit × PURCHASE (FLOW)
        const purchaseValue = ratePerUnit * purchase
        
        // SALES VALUE = sale price per unit × SALES (FLOW)
        const salesValue = ratePerUnit * sales
        
        // MARGIN% = (SALE PRICE/PACK - PURCHASE PRICE/PACK) / SALE PRICE/PACK × 100
        const marginPercent = salePricePerPack > 0 ? ((salePricePerPack - purchasePricePerPack) / salePricePerPack) * 100 : 0
        
        setForm(prev => ({
            ...prev,
            quantity: String(flowInventory),
            actualInventory: String(actualInventory),
            inventoryValue: inventoryValue > 0 ? String(inventoryValue.toFixed(2)) : '0',
            purchaseValue: purchaseValue > 0 ? String(purchaseValue.toFixed(2)) : '0',
            salesValue: salesValue > 0 ? String(salesValue.toFixed(2)) : '0'
        }))
    }, [form.unitQuantity, form.priceRupees, form.purchasePriceRupees, form.totalPurchased, form.totalSales])

    async function create(e: any) {
        e.preventDefault()
        setSubmitting(true)
        setShowLoadingModal(true)
        try {
            // Find or create category in database
            let categoryIdValue = null
            if (form.categoryId) {
                const params = new URLSearchParams()
                if (selectedDoctorId) params.append('doctorId', selectedDoctorId.toString())
                const queryString = params.toString() ? `?${params}` : ''
                
                // First try to find existing category
                const categoriesFromDb = await fetch(`/api/categories${queryString}`).then(r => r.json())
                let category = categoriesFromDb.find((c: any) => c.name === form.categoryId)
                
                // If not found, create it
                if (!category) {
                    const createCategoryResponse = await fetch('/api/categories', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            name: form.categoryId,
                            doctorId: selectedDoctorId 
                        })
                    })
                    if (createCategoryResponse.ok) {
                        category = await createCategoryResponse.json()
                    }
                }
                
                categoryIdValue = category?.id || null
            }
            
            // Combine unitQuantity and unitType into unit field
            const unitValue = form.unitQuantity && form.unitType ? 
                `${form.unitQuantity} ${form.unitType}` : 
                form.unitQuantity || ''
            
            // Calculate purchasePricePerUnit (purchase price per pack divided by no. of units)
            const units = Number(form.unitQuantity) || 1
            const purchasePricePerUnit = (Number(form.purchasePriceRupees) || 0) / units
            
            const payload = {
                name: form.name,
                categoryId: categoryIdValue,
                unit: unitValue,
                latestBatchNumber: form.latestBatchNumber?.trim() || null,
                priceRupees: Number(form.priceRupees) || 0,
                purchasePriceRupees: Number(form.purchasePriceRupees) || 0,
                purchasePricePerUnit: purchasePricePerUnit,
                totalPurchased: Number(form.totalPurchased) || 0,
                totalSales: Number(form.totalSales) || 0,
                quantity: Number(form.quantity) || 0,
                actualInventory: Number(form.actualInventory) || null,
                inventoryValue: Number(form.inventoryValue) || 0,
                purchaseValue: Number(form.purchaseValue) || 0,
                salesValue: Number(form.salesValue) || 0,
                minStockLevel: Number(form.minStockLevel) || Number(productDefaults.minStockLevel) || 200
            }
            
            const response = await fetch('/api/products', { 
                method: 'POST', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(payload) 
            })
            
            if (response.ok) {
                const newProduct = await response.json()
                const updatedItems = await (await fetch('/api/products')).json()
                setItems(Array.isArray(updatedItems) ? updatedItems : [])
                setCache('products', Array.isArray(updatedItems) ? updatedItems : [])
                
                // Hide loading modal and show success modal
                setShowLoadingModal(false)
                setSuccessMessage('Product added successfully!')
                setShowSuccessModal(true)
                
                setTimeout(() => {
                    closeModal()
                    setShowSuccessModal(false)
                }, 2000)
            } else {
                const error = await response.json()
                showError('Failed to add product: ' + (error.error || 'Unknown error'))
                setShowLoadingModal(false)
            }
        } catch (error) {
            showError('Failed to add product: ' + error)
            setShowLoadingModal(false)
        } finally {
            setSubmitting(false)
        }
    }

    async function updateProduct(e: any) {
        e.preventDefault()
        if (!editingId) return
        
        setSubmitting(true)
        setShowLoadingModal(true)
        
        // Find the current product to preserve its category if needed
        const currentProduct = items.find(item => item.id === editingId)
        
        // Find or create category in database
        let categoryIdValue = currentProduct?.categoryId || null // Default to existing category
        if (form.categoryId) {
            const params = new URLSearchParams()
            if (selectedDoctorId) params.append('doctorId', selectedDoctorId.toString())
            const queryString = params.toString() ? `?${params}` : ''
            
            // First try to find existing category
            const categoriesFromDb = await fetch(`/api/categories${queryString}`).then(r => r.json())
            let category = categoriesFromDb.find((c: any) => c.name === form.categoryId)
            
            // If not found, create it
            if (!category) {
                const createCategoryResponse = await fetch('/api/categories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        name: form.categoryId,
                        doctorId: selectedDoctorId 
                    })
                })
                if (createCategoryResponse.ok) {
                    category = await createCategoryResponse.json()
                }
            }
            
            categoryIdValue = category?.id || null
        }
        
        // Combine unitQuantity and unitType into unit field
        const unitValue = form.unitQuantity && form.unitType ? 
            `${form.unitQuantity} ${form.unitType}` : 
            form.unitQuantity || ''
        
        // Calculate purchasePricePerUnit (purchase price per pack divided by no. of units)
        const units = Number(form.unitQuantity) || 1
        const purchasePricePerUnit = (Number(form.purchasePriceRupees) || 0) / units
        
        const payload = {
            id: editingId,
            name: form.name,
            categoryId: categoryIdValue,
            unit: unitValue,
            latestBatchNumber: form.latestBatchNumber?.trim() || null,
            priceRupees: Number(form.priceRupees) || 0,
            purchasePriceRupees: Number(form.purchasePriceRupees) || 0,
            purchasePricePerUnit: purchasePricePerUnit,
            totalPurchased: Number(form.totalPurchased) || 0,
            totalSales: Number(form.totalSales) || 0,
            quantity: Number(form.quantity) || 0,
            actualInventory: Number(form.actualInventory) || null,
            inventoryValue: Number(form.inventoryValue) || 0,
            purchaseValue: Number(form.purchaseValue) || 0,
            salesValue: Number(form.salesValue) || 0,
            minStockLevel: Number(form.minStockLevel) || Number(productDefaults.minStockLevel) || 200
        }
        
        try {
            const response = await fetch('/api/products', { 
                method: 'PUT', 
                headers: { 'Content-Type': 'application/json' }, 
                body: JSON.stringify(payload) 
            })
            
            if (response.ok) {
                const updatedItems = await (await fetch('/api/products')).json()
                setItems(updatedItems)
                setCache('products', updatedItems)
                
                // Hide loading modal and show success modal
                setShowLoadingModal(false)
                setSuccessMessage('Product updated successfully!')
                setShowSuccessModal(true)
                
                setTimeout(() => {
                    closeModal()
                    setShowSuccessModal(false)
                }, 2000)
            } else {
                const error = await response.json()
                showError('Failed to update product: ' + (error.error || 'Unknown error'))
                setShowLoadingModal(false)
            }
        } catch (error) {
            showError('Failed to update product')
            setShowLoadingModal(false)
        } finally {
            setSubmitting(false)
        }
    }

    function editProduct(product: any) {
        setEditingId(product.id)
        
        // Split unit field into quantity and type
        let unitQuantity = ''
        let unitType = ''
        if (product.unit) {
            const unitParts = String(product.unit).trim().split(/\s+/)
            if (unitParts.length >= 2) {
                unitQuantity = unitParts[0]
                unitType = unitParts[1].toUpperCase()
            } else {
                unitQuantity = unitParts[0]
            }
        }
        
        // Store category name (not ID) since CustomSelect uses category names
        setForm({
            name: product.name,
            categoryId: product.category?.name || '',
            unitQuantity: unitQuantity,
            unitType: unitType,
            latestBatchNumber: product.latestBatchNumber || '',
            priceRupees: String(product.priceRupees || 0),
            purchasePriceRupees: String(product.purchasePriceRupees || 0),
            totalPurchased: String(product.totalPurchased || 0),
            totalSales: String(product.totalSales || 0),
            quantity: String(product.quantity || 0),
            inventoryValue: String(product.inventoryValue || ''),
            purchaseValue: String(product.purchaseValue || ''),
            salesValue: String(product.salesValue || ''),
            actualInventory: product.actualInventory ? String(product.actualInventory) : '',
            minStockLevel: String(product.minStockLevel || productDefaults.minStockLevel || 200)
        })
        setIsPurchaseQtyLocked(true)
        setIsSalesQtyLocked(true)
        setIsMinStockLocked(true)
        setIsModalOpen(true)
        document.body.style.overflow = 'hidden'
        setIsAnimating(false)
        // Small delay to trigger opening animation
        setTimeout(() => setIsAnimating(true), 10)
    }

    function closeModal() {
        setIsAnimating(false)
        document.body.style.overflow = 'unset'
        setTimeout(() => {
            setIsModalOpen(false)
            setEditingId(null)
            setForm(emptyForm)
        }, 300) // Match the animation duration
    }

    function cancelEdit() {
        closeModal()
    }

    async function loadDeleteImpact(ids: number[]) {
        setDeleteImpactLoading(true)
        setDeleteImpactError('')
        try {
            const response = await fetch('/api/products/delete-impact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids }),
            })
            const data = await response.json()
            if (!response.ok) {
                throw new Error(data.error || 'Failed to analyze product delete impact')
            }
            setDeleteImpactRows(Array.isArray(data.products) ? data.products : [])
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to analyze product delete impact'
            setDeleteImpactError(message)
            setDeleteImpactRows([])
        } finally {
            setDeleteImpactLoading(false)
        }
    }

    async function deleteProduct(id: number) {
        setDeleteId(id)
        setDeleteTargetIds([id])
        setShowDeleteConfirm(true)
        await loadDeleteImpact([id])
    }

    function toggleProductSelection(id: number) {
        const newSelected = new Set(selectedProductIds)
        if (newSelected.has(id)) {
            newSelected.delete(id)
        } else {
            newSelected.add(id)
        }
        setSelectedProductIds(newSelected)
    }

    function toggleSelectAll() {
        if (selectedProductIds.size === filteredProducts.length) {
            setSelectedProductIds(new Set())
        } else {
            setSelectedProductIds(new Set(filteredProducts.map((p: any) => p.id)))
        }
    }

    function toggleRowExpansion(id: number) {
        const newExpanded = new Set(expandedRows)
        if (newExpanded.has(id)) {
            newExpanded.delete(id)
        } else {
            newExpanded.add(id)
        }
        setExpandedRows(newExpanded)
    }

    async function deleteSelectedProducts() {
        if (selectedProductIds.size === 0) {
            showError('Please select products to delete')
            return
        }

        const ids = Array.from(selectedProductIds)
        setDeleteTargetIds(ids)
        setDeleteImpactRows([])
        setDeleteImpactError('')
        setShowDeleteSelectedConfirm(true)
        await loadDeleteImpact(ids)
    }

    async function resetValuesInsteadOfDelete() {
        const idsToReset = deleteTargetIds
        if (!idsToReset.length) {
            showError('No products selected')
            return
        }

        setResettingValues(true)
        try {
            const response = await fetch('/api/products/reset-values', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: idsToReset }),
            })
            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to reset product values')
            }

            const params = new URLSearchParams()
            if (selectedDoctorId) params.append('doctorId', selectedDoctorId.toString())
            const query = params.toString() ? `?${params}` : ''
            const refreshedItems = await (await fetch(`/api/products${query}`)).json()
            setItems(Array.isArray(refreshedItems) ? refreshedItems : [])
            setCache('products', Array.isArray(refreshedItems) ? refreshedItems : [])

            const nextSelected = new Set(selectedProductIds)
            idsToReset.forEach((id) => nextSelected.delete(id))
            setSelectedProductIds(nextSelected)

            setShowDeleteConfirm(false)
            setShowDeleteSelectedConfirm(false)
            setDeleteTargetIds([])
            setDeleteId(null)
            showSuccess(`Reset values for ${data.count || idsToReset.length} product(s) successfully`)
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Failed to reset product values')
        } finally {
            setResettingValues(false)
        }
    }

    async function confirmDeleteSelected() {
        if (deleteImpactLoading) {
            showInfo('Please wait. Impact analysis is still running.')
            return
        }

        const idsToDelete = deleteTargetIds
        const total = idsToDelete.length

        if (!total) {
            showError('No products selected')
            return
        }

        setShowDeleteSelectedConfirm(false)
        setDeleting(true)

        // Initialize progress
        setDeleteProgress({ current: 0, total })

        // Create task in global context
        const id = addTask({
            type: 'products',
            operation: 'delete',
            status: 'deleting',
            progress: { current: 0, total }
        })
        setDeleteTaskId(id)

        const CHUNK_SIZE = 100
        let deletedCount = 0

        try {
            // Process in chunks
            for (let i = 0; i < idsToDelete.length; i += CHUNK_SIZE) {
                const chunk = idsToDelete.slice(i, i + CHUNK_SIZE)
                
                // Delete entire chunk in one request
                await fetch('/api/products', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ids: chunk })
                })
                    .then(async (response) => {
                        if (!response.ok) {
                            const error = await response.json().catch(() => ({}))
                            throw new Error(error.error || 'Failed to delete products')
                        }
                    })

                deletedCount += chunk.length
                setDeleteProgress({ current: deletedCount, total })

                // Update task progress
                updateTask(id, {
                    progress: { current: deletedCount, total }
                })
            }

            // Refresh data
            const params = new URLSearchParams()
            if (selectedDoctorId) params.append('doctorId', selectedDoctorId.toString())
            const refreshedItems = await (await fetch(`/api/products${params.toString() ? `?${params}` : ''}`)).json()
            setItems(Array.isArray(refreshedItems) ? refreshedItems : [])
            setCache('products', Array.isArray(refreshedItems) ? refreshedItems : [])

            const nextSelected = new Set(selectedProductIds)
            idsToDelete.forEach((id) => nextSelected.delete(id))
            setSelectedProductIds(nextSelected)
            setDeleteTargetIds([])
            setDeleteImpactRows([])
            setDeleteImpactError('')
            
            // Update task to success
            updateTask(id, {
                status: 'success',
                summary: { success: total, errors: 0 },
                endTime: Date.now()
            })
            
            showSuccess(`Deleted ${total} product(s) successfully`)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to delete products'
            
            // Update task to error
            updateTask(id, {
                status: 'error',
                error: message,
                endTime: Date.now()
            })
            
            showError(message)
        } finally {
            setDeleting(false)
            setDeleteProgress({ current: 0, total: 0 })
            setDeleteTaskId(null)
            setIsDeleteMinimized(false)
        }
    }

    function getFilteredProducts(applyNewFilter: boolean = true) {
        let filtered = items.filter((product: any) => {
            // Search filter - search in product name and category name
            if (searchQuery) {
                const query = searchQuery.toLowerCase()
                const nameMatch = product.name?.toLowerCase().includes(query)
                const categoryMatch = product.category?.name?.toLowerCase().includes(query)
                if (!nameMatch && !categoryMatch) {
                    return false
                }
            }
            // Category filter
            if (filterCategory && product.category?.name !== filterCategory) {
                return false
            }
            // Stock status filter
            if (filterStockStatus) {
                // Use EXACT same calculation as the display badges
                const flowInventory = (Number(product.totalPurchased) || 0) - (Number(product.totalSales) || 0)
                const minStock = Number(product.minStockLevel) || 0
                
                if (filterStockStatus === 'low-stock') {
                    // Low stock: flow inventory > 0 but less than minimum stock level (and minStock > 0)
                    const isLowStock = flowInventory > 0 && minStock > 0 && flowInventory < minStock
                    if (!isLowStock) return false
                }
                if (filterStockStatus === 'out-of-stock') {
                    // Out of stock: flow inventory <= 0
                    const isOutOfStock = flowInventory <= 0
                    if (!isOutOfStock) return false
                }
                if (filterStockStatus === 'in-stock') {
                    // In stock: flow inventory > minStock (or flow inventory > 0 if minStock is 0)
                    const isInStock = minStock > 0 ? flowInventory >= minStock : flowInventory > 0
                    if (!isInStock) return false
                }
            }
            // Price range filter
            if (filterPriceRange) {
                const price = product.priceRupees || 0
                if (filterPriceRange === '0-5000' && (price < 0 || price > 5000)) return false
                if (filterPriceRange === '5000-20000' && (price < 5000 || price > 20000)) return false
                if (filterPriceRange === '5000+' && price < 5000) return false
            }

            if (applyNewFilter && showNewOnly && !isProductFromToday(product)) {
                return false
            }

            return true
        })

        // Sort products
        filtered.sort((a, b) => {
            // Keep products created today at top
            const aIsNew = isProductFromToday(a)
            const bIsNew = isProductFromToday(b)
            if (aIsNew && !bIsNew) return -1
            if (!aIsNew && bIsNew) return 1
            
            let compareResult = 0
            
            if (sortBy === 'name') {
                compareResult = (a.name || '').localeCompare(b.name || '')
            } else if (sortBy === 'price') {
                compareResult = (a.priceRupees || 0) - (b.priceRupees || 0)
            } else if (sortBy === 'quantity') {
                compareResult = (a.quantity || 0) - (b.quantity || 0)
            } else if (sortBy === 'category') {
                compareResult = (a.category?.name || '').localeCompare(b.category?.name || '')
            } else if (sortBy === 'expiryDate') {
                const aExpiry = a.batches?.[0]?.expiryDate || '9999-12-31'
                const bExpiry = b.batches?.[0]?.expiryDate || '9999-12-31'
                compareResult = new Date(aExpiry).getTime() - new Date(bExpiry).getTime()
            } else if (sortBy === 'stockStatus') {
                // Use flow inventory if available, otherwise fall back to quantity field
                const aHasData = a.totalPurchased != null || a.totalSales != null
                const bHasData = b.totalPurchased != null || b.totalSales != null
                const aFlowInventory = aHasData 
                    ? (Number(a.totalPurchased) || 0) - (Number(a.totalSales) || 0)
                    : Number(a.quantity) || 0
                const bFlowInventory = bHasData 
                    ? (Number(b.totalPurchased) || 0) - (Number(b.totalSales) || 0)
                    : Number(b.quantity) || 0
                const aMinStock = Number(a.minStockLevel) || 0
                const bMinStock = Number(b.minStockLevel) || 0
                // 0 = out of stock, 1 = low stock, 2 = in stock
                const aStatus = aFlowInventory <= 0 ? 0 : aFlowInventory < aMinStock ? 1 : 2
                const bStatus = bFlowInventory <= 0 ? 0 : bFlowInventory < bMinStock ? 1 : 2
                compareResult = aStatus - bStatus
            }
            
            return sortOrders[sortBy] === 'asc' ? compareResult : -compareResult
        })

        return filtered
    }

    function toggleSelectPOItem(index: number) {
        const newSelected = new Set(selectedPOIndices)
        if (newSelected.has(index)) {
            newSelected.delete(index)
        } else {
            newSelected.add(index)
        }
        setSelectedPOIndices(newSelected)
    }

    function toggleSelectAllPOItems() {
        if (selectedPOIndices.size === lowStockProducts.length) {
            // Deselect all
            setSelectedPOIndices(new Set())
        } else {
            // Select all
            setSelectedPOIndices(new Set(lowStockProducts.map((_, index) => index)))
        }
    }

    function clearSelectedPOItems() {
        setSelectedPOIndices(new Set())
    }

    async function autoGeneratePurchaseOrder() {
        // Get low stock products - EXACT same logic as purchase-orders.tsx demand list
        const lowStock = items.filter((product: any) => {
            const flowInventory = (Number(product.totalPurchased) || 0) - (Number(product.totalSales) || 0)
            const minStock = Number(product.minStockLevel) || 200
            
            // Only filter by flow inventory vs threshold
            return flowInventory < minStock
        })

        if (lowStock.length === 0) {
            showInfo('No low stock products found')
            return
        }

        // Set low stock products and initialize with all items selected
        setLowStockProducts(lowStock)
        setSelectedPOIndices(new Set(lowStock.map((_, index) => index)))
        
        // Initialize requested quantities - same as purchase-orders.tsx
        const initialQty: {[key: number]: number} = {}
        lowStock.forEach((product, index) => {
            const flowInventory = (Number(product.totalPurchased) || 0) - (Number(product.totalSales) || 0)
            const minStock = Number(product.minStockLevel) || 200
            // Set requested quantity to (threshold - flow inventory)
            const requestedQuantity = Math.max(0, minStock - flowInventory)
            initialQty[index] = requestedQuantity
        })
        setPORequestedQty(initialQty)

        // Show modal for supplier selection
        setShowLowStockModal(true)
        setLowStockModalAnimating(false)
        setTimeout(() => setLowStockModalAnimating(true), 10)
    }

    async function createPurchaseOrderWithSupplier() {
        if (!selectedSupplier) {
            showError('Please select a supplier')
            return
        }

        if (selectedPOIndices.size === 0) {
            showError('Please select at least one item to order')
            return
        }

        setGeneratingPO(true)
        try {
            // Get selected products only
            const selectedProducts = lowStockProducts.filter((_, index) => selectedPOIndices.has(index))

            // Generate PO Number
            const lastPOResponse = await fetch('/api/purchase-orders')
            const existingPOs = await lastPOResponse.json()
            const poNumber = `PO-${String((existingPOs.length || 0) + 1).padStart(6, '0')}`

            // Create purchase order items
            let subtotal = 0
            const orderItems = selectedProducts.map((product: any, idx: number) => {
                const actualIndex = lowStockProducts.findIndex(p => p.id === product.id)
                const flowInventory = (Number(product.totalPurchased) || 0) - (Number(product.totalSales) || 0)
                const minStock = Number(product.minStockLevel) || 200
                const requestedQty = poRequestedQty[actualIndex] || Math.max(0, minStock - flowInventory)
                
                const unitPrice = product.purchasePricePerUnit || product.purchasePriceRupees || product.priceRupees || 0
                const itemTotal = requestedQty * unitPrice
                
                subtotal += itemTotal

                return {
                    productId: product.id,
                    quantity: requestedQty,
                    unitPrice: unitPrice,
                    taxRate: 0,
                    discount: 0
                }
            })

            const totalAmount = Math.round(subtotal)

            // Create the purchase order
            const response = await fetch('/api/purchase-orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supplierId: Number(selectedSupplier),
                    orderDate: new Date().toISOString(),
                    expectedDate: null,
                    items: orderItems,
                    notes: `Auto-generated purchase order for ${selectedProducts.length} low stock item(s)`,
                    shippingCost: 0,
                    discount: 0
                })
            })

            if (response.ok) {
                const purchaseOrder = await response.json()
                
                // Send email to supplier
                setSendingEmail(true)
                try {
                    const emailResponse = await fetch('/api/purchase-orders/send-email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ purchaseOrderId: purchaseOrder.id })
                    })

                    if (emailResponse.ok) {
                        const emailData = await emailResponse.json()
                        showSuccess(`✅ Purchase order ${purchaseOrder.poNumber} created and sent to supplier!`)
                    } else {
                        const emailError = await emailResponse.json()
                        showSuccess(`✅ Purchase order ${purchaseOrder.poNumber} created!`)
                        showError(`⚠️ Email failed: ${emailError.error}`)
                    }
                } catch (emailError) {
                    showSuccess(`✅ Purchase order ${purchaseOrder.poNumber} created!`)
                    showError('⚠️ Failed to send email to supplier')
                } finally {
                    setSendingEmail(false)
                }

                // Close modal and reset
                setLowStockModalAnimating(false)
                setTimeout(() => {
                    setShowLowStockModal(false)
                    setSelectedSupplier('')
                }, 300)
            } else {
                const error = await response.json()
                showError('❌ Error: ' + (error.error || 'Failed to generate purchase order'))
            }
        } catch (error) {
            showError('❌ Failed to generate purchase order')
        } finally {
            setGeneratingPO(false)
        }
    }

    function closeLowStockModal() {
        setLowStockModalAnimating(false)
        setTimeout(() => {
            setShowLowStockModal(false)
            setSelectedSupplier('')
            setSelectedPOIndices(new Set())
            setLowStockProducts([])
            setPORequestedQty({})
        }, 300)
    }

    async function confirmDelete() {
        if (deleteImpactLoading) {
            showInfo('Please wait. Impact analysis is still running.')
            return
        }

        if (deleteId === null) return
        
        // Add to deleting set and close modal immediately
        setDeletingIds(prev => new Set(prev).add(deleteId))
        setShowDeleteConfirm(false)
        
        // Show "Deleting..." text for 1.5 seconds so it's clearly visible
        await new Promise(resolve => setTimeout(resolve, 1500))
        
        setDeleting(true)
        
        try {
            // Start the delete API call
            const response = await fetch('/api/products', { 
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
                const updatedItems = await (await fetch(`/api/products${params.toString() ? `?${params}` : ''}`)).json()
                setItems(updatedItems)
                setCache('products', updatedItems)
                
                showSuccess('Product deleted successfully!')
            } else {
                const error = await response.json()
                showError('Failed to delete product: ' + (error.error || 'Unknown error'))
            }
        } catch (error) {
            showError('Failed to delete product')
        } finally {
            setDeletingIds(prev => {
                const next = new Set(prev)
                next.delete(deleteId)
                return next
            })
            setDeleting(false)
            setDeleteId(null)
            setDeleteTargetIds([])
            setDeleteImpactRows([])
            setDeleteImpactError('')
        }
    }

    function exportData(format: 'csv' | 'json' | 'xlsx') {
        try {
            if (isBasicSubscription) {
                showInfo('Export is available in Standard plan.')
                router.push('/upgrade')
                return
            }

            if (selectedProductIds.size === 0) {
                showError('Please select at least one product to export')
                return
            }

            const selectedProducts = items.filter((product: any) => selectedProductIds.has(product.id))

            // Build rows matching the new inventory structure
            const dataToExport = selectedProducts.map((p: any) => {
                const unitParts = p.unit ? String(p.unit).trim().split(/\s+/) : []
                const units = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                const unitType = unitParts.length >= 2 ? unitParts[1] : ''
                
                const ratePerUnit = Number(p.priceRupees) || 0
                const purchasePricePerPack = Number(p.purchasePriceRupees) || 0
                const salePricePerPack = ratePerUnit * units
                const flowInventory = (Number(p.totalPurchased) || 0) - (Number(p.totalSales) || 0)
                const actualInventory = units > 0 ? Math.floor(flowInventory / units) : 0
                const marginPercent = salePricePerPack > 0 ? ((salePricePerPack - purchasePricePerPack) / salePricePerPack) * 100 : 0
                
                return {
                    'PRODUCT NAME': p.name || '',
                    'CATEGORY': p.category?.name || '',
                    'LATEST BATCH NUMBER': p.latestBatchNumber || '',
                    'UNITS': units,
                    'UNIT TYPE': unitType,
                    'RATE/UNIT': ratePerUnit.toFixed(2),
                    'PURCHASE PRICE/PACK': purchasePricePerPack.toFixed(2),
                    'MARGIN%': marginPercent.toFixed(2),
                    'SALE PRICE/PACK': salePricePerPack.toFixed(2),
                    'THRESH/IN': p.minStockLevel || 0,
                    'INVENTORY (FLOW)': flowInventory.toFixed(1),
                    'ACTUAL INVENTORY': actualInventory.toFixed(1),
                    'INVENTORY VALUE': (p.inventoryValue || 0).toFixed(2),
                    'PURCHASE (FLOW)': (p.totalPurchased || 0).toFixed(1),
                    'PURCHASE VALUE': (p.purchaseValue || 0).toFixed(2),
                    'SALES (FLOW)': (p.totalSales || 0).toFixed(1),
                    'SALES VALUE': (p.salesValue || 0).toFixed(2)
                }
            })

            const timestamp = new Date().toISOString().split('T')[0]
            
            if (format === 'json') {
                const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `products_${timestamp}.json`
                a.click()
                URL.revokeObjectURL(url)
            } else if (format === 'csv') {
                // Ensure header order matches the new template
                const headers = ['PRODUCT NAME','CATEGORY','LATEST BATCH NUMBER','UNITS','UNIT TYPE','RATE/UNIT','PURCHASE PRICE/PACK','MARGIN%','SALE PRICE/PACK','THRESH/IN','INVENTORY (FLOW)','ACTUAL INVENTORY','INVENTORY VALUE','PURCHASE (FLOW)','PURCHASE VALUE','SALES (FLOW)','SALES VALUE']
                const csvRows = [
                    headers.join(','),
                    ...dataToExport.map(row => headers.map(h => {
                        const raw = row[h as keyof typeof row]
                        const value = raw === null || raw === undefined ? '' : String(raw)
                        return value.includes(',') || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value
                    }).join(','))
                ]
                const csvContent = csvRows.join('\n')
                const blob = new Blob([csvContent], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `products_${timestamp}.csv`
                a.click()
                URL.revokeObjectURL(url)
            } else if (format === 'xlsx') {
                const ws = XLSX.utils.json_to_sheet(dataToExport)
                const wb = XLSX.utils.book_new()
                XLSX.utils.book_append_sheet(wb, ws, 'Products')
                XLSX.writeFile(wb, `products_${timestamp}.xlsx`)
            }
            
            showSuccess(`${selectedProductIds.size} product(s) exported as ${format.toUpperCase()}`)
            setShowExportDropdown(false)
        } catch (e) {
            showError('Failed to export products')
        }
    }

    // Close export dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const target = event.target as HTMLElement
            if (showExportDropdown && !target.closest('.relative')) {
                setShowExportDropdown(false)
            }
            if (showSortDropdown && !target.closest('.relative')) {
                setShowSortDropdown(false)
            }
        }
        if (showExportDropdown || showSortDropdown) {
            document.addEventListener('click', handleClickOutside)
        }
        return () => document.removeEventListener('click', handleClickOutside)
    }, [showExportDropdown, showSortDropdown])

    const impactUsedRows = deleteImpactRows.filter((row) => row.isUsed)
    const impactTotalRows = deleteImpactRows.length
    const impactRiskCount = impactUsedRows.length
    const impactPreviewRows = impactUsedRows.slice(0, 20)

    const deleteImpactDetailItems = impactPreviewRows.map((row) => {
        const usageParts: string[] = []
        if (row.usage.prescriptions > 0) usageParts.push(`Prescriptions: ${row.usage.prescriptions}`)
        if (row.usage.invoiceItems > 0) usageParts.push(`Invoice Items: ${row.usage.invoiceItems}`)
        if (row.usage.treatmentPlans > 0) usageParts.push(`Treatment Plans: ${row.usage.treatmentPlans}`)
        if (row.usage.purchaseOrderItems > 0) usageParts.push(`PO Items: ${row.usage.purchaseOrderItems}`)
        if (row.usage.stockTransactions > 0) usageParts.push(`Stock Txns: ${row.usage.stockTransactions}`)
        if (row.usage.batches > 0) usageParts.push(`Batches: ${row.usage.batches}`)
        if (row.usage.productOrders > 0) usageParts.push(`Product Orders: ${row.usage.productOrders}`)
        if (row.usage.forecasts > 0) usageParts.push(`Forecasts: ${row.usage.forecasts}`)
        if (row.usage.billMappings > 0) usageParts.push(`Bill Mappings: ${row.usage.billMappings}`)

        return {
            title: `${row.name} (${row.categoryName})`,
            subtitle: usageParts.length > 0 ? usageParts.join(' | ') : `Historical usage detected (Purchased: ${row.totalPurchased}, Sold: ${row.totalSales})`,
            meta: `Flow Inventory: ${row.flowInventory}, Threshold: ${row.minStockLevel}`,
            severity: 'danger' as const,
        }
    })

    const deleteImpactSummaryMessage = deleteImpactLoading
        ? 'Checking where selected products are currently used. Please wait before proceeding.'
        : deleteImpactError
            ? `Could not fully analyze delete impact. ${deleteImpactError}`
            : impactRiskCount > 0
                ? `${impactRiskCount} of ${impactTotalRows} selected product(s) are in active/historical records. Deleting them is destructive and not fully recoverable.`
                : `No usage conflicts found for ${impactTotalRows} selected product(s).`

    const baseFilteredProducts = getFilteredProducts(false)
    const filteredProducts = getFilteredProducts(true)
    const newBadgeCount = baseFilteredProducts.filter((product: any) => isProductFromToday(product)).length

    return (
        <div>
            {/* Delete Progress Modal - Minimizable */}
            {deleteProgress.total > 0 && !isDeleteMinimized && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] backdrop-blur-sm">
                    <div className="relative overflow-hidden rounded-2xl border border-red-200/30 dark:border-red-700/30 bg-gradient-to-br from-white via-red-50/30 to-orange-50/20 dark:from-gray-900 dark:via-red-950/20 dark:to-gray-900 shadow-2xl shadow-red-500/20 max-w-md w-full mx-4 animate-in fade-in zoom-in duration-200">
                        <div className="absolute inset-0 bg-gradient-to-br from-red-400/5 via-transparent to-orange-500/5 pointer-events-none"></div>
                        {/* Header with minimize button */}
                        <div className="relative flex items-center justify-between px-6 py-4 border-b border-red-200/30 dark:border-red-700/30">
                            <h3 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600 dark:from-red-400 dark:to-orange-400">
                                Deleting Products
                            </h3>
                            <button
                                onClick={() => setIsDeleteMinimized(true)}
                                className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                title="Minimize"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                                </svg>
                            </button>
                        </div>

                        {/* Content */}
                        <div className="relative p-8">
                            <div className="flex flex-col items-center">
                                <div className="w-20 h-20 bg-gradient-to-br from-red-100 to-orange-100 dark:from-red-900/40 dark:to-orange-900/40 rounded-full flex items-center justify-center mb-4 shadow-lg shadow-red-500/20 animate-pulse">
                                    <svg className="w-10 h-10 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </div>
                                <h3 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600 dark:from-red-400 dark:to-orange-400 mb-2">
                                    Deleting Products
                                </h3>
                                <div className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600 dark:from-red-400 dark:to-orange-400 mb-4">
                                    {deleteProgress.current} / {deleteProgress.total}
                                </div>
                                <div className="w-full bg-gradient-to-r from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded-full h-5 mb-4 overflow-hidden shadow-inner">
                                    <div 
                                        className="h-full bg-gradient-to-r from-red-500 via-red-600 to-orange-600 rounded-full transition-all duration-300 ease-out flex items-center justify-end pr-3 shadow-lg shadow-red-500/50"
                                        style={{ width: `${(deleteProgress.current / deleteProgress.total) * 100}%` }}
                                    >
                                        <span className="text-xs font-bold text-white drop-shadow-lg">
                                            {Math.round((deleteProgress.current / deleteProgress.total) * 100)}%
                                        </span>
                                    </div>
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
                                    Please wait, deleting product {deleteProgress.current} of {deleteProgress.total}...
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                        Inventory Management
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Manage products, stock levels, and pricing</p>
                </div>
                <div className="flex gap-2">
                    <RefreshButton onRefresh={fetchProducts} />
                    <button 
                        onClick={autoGeneratePurchaseOrder}
                        disabled={generatingPO}
                        className="btn h-10 sm:h-11 bg-orange-600 hover:bg-orange-700 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center px-2 sm:px-4 py-2.5"
                        title="Order Low Stock Items"
                        aria-label="Order Low Stock Items"
                    >
                        {generatingPO ? (
                            <>
                                <svg className="w-4 h-4 inline animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span className="ml-2 hidden sm:inline">Processing...</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-4 h-4 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                                </svg>
                                <span className="ml-2 hidden sm:inline">Order Low Stock Items</span>
                            </>
                        )}
                    </button>
                    <div className="relative">
                        <button 
                            onClick={() => setShowExportDropdown(!showExportDropdown)}
                                className="btn h-10 sm:h-11 relative bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white transition-all duration-200 flex items-center gap-2 shadow-lg shadow-sky-200 dark:shadow-sky-900/50 px-2 sm:px-4 py-2.5"
                            title={selectedProductIds.size > 0 ? `Export ${selectedProductIds.size} selected` : 'Export All'}
                            aria-label={selectedProductIds.size > 0 ? `Export ${selectedProductIds.size} selected` : 'Export All'}
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                            </svg>
                            <span className="font-semibold hidden sm:inline">{selectedProductIds.size > 0 ? `Export (${selectedProductIds.size})` : 'Export All'}</span>
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
                        className={`btn h-10 sm:h-11 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white shadow-lg shadow-sky-200 dark:shadow-sky-900/50 transition-all duration-200 flex items-center gap-2 px-2 sm:px-4 py-2.5 ${hasNewProductDefaults && productImportPulseEnabled ? 'animate-pulse ring-2 ring-amber-300 dark:ring-amber-500' : ''}`}
                        title={hasNewProductDefaults ? 'Import products (new defaults available)' : 'Import products'}
                        aria-label="Import products"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        <span className="font-semibold hidden sm:inline">{hasNewProductDefaults ? 'Import (New Defaults)' : 'Import'}</span>
                    </button>
                    <button 
                        onClick={() => {
                            setIsPurchaseQtyLocked(false)
                            setIsSalesQtyLocked(false)
                            setIsModalOpen(true)
                            setIsAnimating(false)
                            setTimeout(() => setIsAnimating(true), 10)
                        }}
                        className="btn h-10 sm:h-11 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white shadow-lg shadow-sky-200 dark:shadow-sky-900/50 transition-all duration-200 flex items-center gap-2 px-2 sm:px-4 py-2.5"
                        title="Add New Product"
                        aria-label="Add New Product"
                    >
                        <span>+</span>
                        <span className="hidden sm:inline ml-1">Add New Product</span>
                    </button>
                </div>
            </div>

            {/* Stock Status Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                <div className="relative rounded-xl border border-sky-200/30 dark:border-sky-700/30 bg-gradient-to-br from-white via-sky-50/30 to-sky-50/20 dark:from-gray-900 dark:via-sky-950/20 dark:to-gray-900 shadow-lg shadow-sky-500/5 backdrop-blur-sm p-4 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-sky-400/5 via-transparent to-sky-500/5 pointer-events-none"></div>
                    <div className="relative flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted mb-1">Total Products</p>
                            {loading ? (
                                <div className="animate-pulse h-8 bg-sky-200 dark:bg-sky-700 rounded w-16"></div>
                            ) : (
                                <p className="text-2xl font-bold">{items.length}</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-4 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none"></div>
                    <div className="relative flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted mb-1">In Stock</p>
                            {loading ? (
                                <div className="animate-pulse h-8 bg-blue-200 dark:bg-blue-700 rounded w-16"></div>
                            ) : (
                                <p className="text-2xl font-bold">
                                    {items.filter(p => {
                                        const flowInventory = (Number(p.totalPurchased) || 0) - (Number(p.totalSales) || 0)
                                        const minStock = Number(p.minStockLevel) || 0
                                        return minStock > 0 ? flowInventory >= minStock : flowInventory > 0
                                    }).length}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="relative rounded-xl border border-yellow-200/30 dark:border-yellow-700/30 bg-gradient-to-br from-white via-yellow-50/30 to-yellow-50/20 dark:from-gray-900 dark:via-yellow-950/20 dark:to-gray-900 shadow-lg shadow-yellow-500/5 backdrop-blur-sm p-4 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/5 via-transparent to-yellow-500/5 pointer-events-none"></div>
                    <div className="relative flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted mb-1">Low Stock</p>
                            {loading ? (
                                <div className="animate-pulse h-8 bg-yellow-200 dark:bg-yellow-700 rounded w-16"></div>
                            ) : (
                                <p className="text-2xl font-bold">
                                    {items.filter(p => {
                                        const flowInventory = (Number(p.totalPurchased) || 0) - (Number(p.totalSales) || 0)
                                        const minStock = Number(p.minStockLevel) || 0
                                        return flowInventory > 0 && minStock > 0 && flowInventory < minStock
                                    }).length}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="relative rounded-xl border border-red-200/30 dark:border-red-700/30 bg-gradient-to-br from-white via-red-50/30 to-red-50/20 dark:from-gray-900 dark:via-red-950/20 dark:to-gray-900 shadow-lg shadow-red-500/5 backdrop-blur-sm p-4 overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-red-400/5 via-transparent to-red-500/5 pointer-events-none"></div>
                    <div className="relative flex items-center justify-between">
                        <div>
                            <p className="text-sm text-muted mb-1">Out of Stock</p>
                            {loading ? (
                                <div className="animate-pulse h-8 bg-red-200 dark:bg-red-700 rounded w-16"></div>
                            ) : (
                                <p className="text-2xl font-bold">
                                    {items.filter(p => {
                                        const flowInventory = (Number(p.totalPurchased) || 0) - (Number(p.totalSales) || 0)
                                        return flowInventory <= 0
                                    }).length}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Search Bar */}
            <div className="rounded-xl border border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-br from-white via-blue-50 to-sky-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 shadow-lg shadow-blue-500/10 p-4 mb-4 overflow-hidden" style={{ overflow: 'visible', zIndex: 1 }}>
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                <div className="relative">
                <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 relative">
                        <input
                            type="text"
                            placeholder="🔍 Search products by name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full p-3 pr-10 border border-blue-300 dark:border-blue-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-white"
                        />
                        <svg className="w-5 h-5 absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    
                    {/* Sort Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowSortDropdown(!showSortDropdown)}
                            className="px-4 py-2.5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-sky-400 dark:hover:border-sky-600 transition-all duration-200 flex items-center gap-2 font-medium text-sm shadow-sm hover:shadow-md"
                        >
                            <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                            </svg>
                            <span>Sort</span>
                        </button>
                        {showSortDropdown && (
                            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-[9999] overflow-hidden">
                                <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-sky-50 to-blue-50 dark:from-gray-900 dark:to-gray-900">
                                    <p className="text-xs font-bold text-sky-700 dark:text-sky-400 uppercase tracking-wider">
                                        Sort By
                                    </p>
                                </div>
                                <div className="p-2">
                                    <button
                                        onClick={() => {
                                            setSortBy('name')
                                            setSortOrders({...sortOrders, name: sortOrders.name === 'asc' ? 'desc' : 'asc'})
                                        }}
                                        className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 flex items-center justify-between gap-3 ${
                                            sortBy === 'name'
                                                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <svg className={`w-4 h-4 ${sortBy === 'name' ? 'text-white' : 'text-sky-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                                            </svg>
                                            <span className="font-medium">Name</span>
                                        </div>
                                        {sortBy === 'name' && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {sortOrders.name === 'asc' ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                )}
                                            </svg>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSortBy('price')
                                            setSortOrders({...sortOrders, price: sortOrders.price === 'asc' ? 'desc' : 'asc'})
                                        }}
                                        className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 flex items-center justify-between gap-3 ${
                                            sortBy === 'price'
                                                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <svg className={`w-4 h-4 ${sortBy === 'price' ? 'text-white' : 'text-sky-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="font-medium">Price</span>
                                        </div>
                                        {sortBy === 'price' && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {sortOrders.price === 'asc' ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                )}
                                            </svg>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSortBy('quantity')
                                            setSortOrders({...sortOrders, quantity: sortOrders.quantity === 'asc' ? 'desc' : 'asc'})
                                        }}
                                        className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 flex items-center justify-between gap-3 ${
                                            sortBy === 'quantity'
                                                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <svg className={`w-4 h-4 ${sortBy === 'quantity' ? 'text-white' : 'text-sky-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                            </svg>
                                            <span className="font-medium">Quantity</span>
                                        </div>
                                        {sortBy === 'quantity' && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {sortOrders.quantity === 'asc' ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                )}
                                            </svg>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSortBy('category')
                                            setSortOrders({...sortOrders, category: sortOrders.category === 'asc' ? 'desc' : 'asc'})
                                        }}
                                        className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 flex items-center justify-between gap-3 ${
                                            sortBy === 'category'
                                                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <svg className={`w-4 h-4 ${sortBy === 'category' ? 'text-white' : 'text-sky-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                            </svg>
                                            <span className="font-medium">Category</span>
                                        </div>
                                        {sortBy === 'category' && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {sortOrders.category === 'asc' ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                )}
                                            </svg>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSortBy('expiryDate')
                                            setSortOrders({...sortOrders, expiryDate: sortOrders.expiryDate === 'asc' ? 'desc' : 'asc'})
                                        }}
                                        className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 flex items-center justify-between gap-3 ${
                                            sortBy === 'expiryDate'
                                                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <svg className={`w-4 h-4 ${sortBy === 'expiryDate' ? 'text-white' : 'text-sky-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <span className="font-medium">Expiry Date</span>
                                        </div>
                                        {sortBy === 'expiryDate' && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {sortOrders.expiryDate === 'asc' ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                )}
                                            </svg>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => {
                                            setSortBy('stockStatus')
                                            setSortOrders({...sortOrders, stockStatus: sortOrders.stockStatus === 'asc' ? 'desc' : 'asc'})
                                        }}
                                        className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 flex items-center justify-between gap-3 ${
                                            sortBy === 'stockStatus'
                                                ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <svg className={`w-4 h-4 ${sortBy === 'stockStatus' ? 'text-white' : 'text-sky-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                            </svg>
                                            <span className="font-medium">Stock Status</span>
                                        </div>
                                        {sortBy === 'stockStatus' && (
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                {sortOrders.stockStatus === 'asc' ? (
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
                    
                    <button
                        onClick={() => setShowFilters(!showFilters)}
                        className="px-4 py-2.5 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-sky-400 dark:hover:border-sky-600 transition-all duration-200 flex items-center gap-2 font-medium text-sm shadow-sm hover:shadow-md"
                    >
                        <svg className="w-4 h-4 text-sky-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                        </svg>
                        <span>Filters</span>
                    </button>
                    {(searchQuery || filterCategory || filterStockStatus || filterPriceRange) && (
                        <button
                            onClick={() => {
                                setSearchQuery('')
                                setFilterCategory('')
                                setFilterStockStatus('')
                                setFilterPriceRange('')
                            }}
                            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                            Clear All
                        </button>
                    )}
                </div>

                {/* Filter Panel */}
                {showFilters && (
                    <div className="border-t dark:border-gray-700 pt-4 mt-2">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" style={{ overflow: 'visible' }}>
                            {/* Category Filter */}
                            <div className={isFilterCategoryOpen ? 'relative z-[10000]' : 'relative z-0'}>
                                <label className="block text-sm font-medium mb-2">Category</label>
                                <CustomSelect
                                    value={filterCategory}
                                    onChange={(value) => setFilterCategory(value)}
                                    options={categoryOptions}
                                    placeholder="All Categories"
                                    onOpenChange={setIsFilterCategoryOpen}
                                    loading={loadingOptions}
                                />
                            </div>

                            {/* Stock Status Filter */}
                            <div className={isFilterStockOpen ? 'relative z-[10000]' : 'relative z-0'}>
                                <label className="block text-sm font-medium mb-2">Stock Status</label>
                                <CustomSelect
                                    value={filterStockStatus}
                                    onChange={(value) => setFilterStockStatus(value)}
                                    options={[
                                        { value: '', label: 'All Stock Levels' },
                                        { value: 'in-stock', label: 'In Stock' },
                                        { value: 'low-stock', label: 'Low Stock (Below Threshold)' },
                                        { value: 'out-of-stock', label: 'Out of Stock' }
                                    ]}
                                    placeholder="All Stock Levels"
                                    onOpenChange={setIsFilterStockOpen}
                                />
                            </div>

                            {/* Price Range Filter */}
                            <div className={isFilterPriceOpen ? 'relative z-[10000]' : 'relative z-0'}>
                                <label className="block text-sm font-medium mb-2">Price Range</label>
                                <CustomSelect
                                    value={filterPriceRange}
                                    onChange={(value) => setFilterPriceRange(value)}
                                    options={[
                                        { value: '', label: 'All Prices' },
                                        { value: '0-100', label: '₹0 - ₹100' },
                                        { value: '100-500', label: '₹100 - ₹500' },
                                        { value: '500-1000', label: '₹500 - ₹1,000' },
                                        { value: '1000-5000', label: '₹1,000 - ₹5,000' },
                                        { value: '5000+', label: '₹5,000+' }
                                    ]}
                                    placeholder="All Prices"
                                    onOpenChange={setIsFilterPriceOpen}
                                />
                            </div>
                        </div>

                        {/* Active Filters Display */}
                        {(filterCategory || filterStockStatus || filterPriceRange) && (
                            <div className="mt-4 flex flex-wrap gap-2">
                                <span className="text-sm font-medium">Active Filters:</span>
                                {filterCategory && (
                                    <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm flex items-center gap-2">
                                        {filterCategory}
                                        <button onClick={() => setFilterCategory('')} className="hover:text-blue-600">×</button>
                                    </span>
                                )}
                                {filterStockStatus && (
                                    <span className="px-3 py-1 bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-200 rounded-full text-sm flex items-center gap-2">
                                        {filterStockStatus === 'in-stock' ? 'In Stock' : filterStockStatus === 'low-stock' ? 'Low Stock' : 'Out of Stock'}
                                        <button onClick={() => setFilterStockStatus('')} className="hover:text-sky-600">×</button>
                                    </span>
                                )}
                                {filterPriceRange && (
                                    <span className="px-3 py-1 bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full text-sm flex items-center gap-2">
                                        {filterPriceRange === '5000+' ? '₹5,000+' : `₹${filterPriceRange.replace('-', ' - ₹')}`}
                                        <button onClick={() => setFilterPriceRange('')} className="hover:text-purple-600">×</button>
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                )}
                </div>
            </div>

            {/* Modal/Dialog */}
            {isModalOpen && (
                <div 
                    className="fixed inset-0 bg-black flex items-center justify-center p-4 transition-opacity duration-200 ease-out"
                    style={{
                        opacity: isAnimating ? 1 : 0,
                        backgroundColor: isAnimating ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0)',
                        zIndex: 9999
                    }}
                    onClick={!showSuccessModal ? cancelEdit : undefined}
                >
                    <div 
                        className="relative overflow-hidden rounded-2xl border border-blue-200/50 dark:border-blue-700 bg-gradient-to-br from-white via-blue-50 to-sky-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 shadow-lg shadow-blue-500/10 max-w-lg w-full transition-all duration-300 ease-out"
                        style={{
                            opacity: isAnimating ? 1 : 0,
                            transform: isAnimating ? 'scale(1)' : 'scale(0.95)',
                            zIndex: 10000
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none"></div>
                        {showLoadingModal ? (
                            // Loading State
                            <div className="relative p-12 text-center">
                                <div className="w-20 h-20 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-6"></div>
                                <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400 mb-3">Processing...</h3>
                                <p className="text-gray-600 dark:text-gray-400 text-lg">{editingId ? 'Updating product information' : 'Adding new product'}</p>
                            </div>
                        ) : showSuccessModal ? (
                            // Success State
                            <div className="relative p-12 text-center">
                                <div className="w-20 h-20 bg-sky-100 dark:bg-sky-900/30 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce-in">
                                    <svg className="w-12 h-12 text-sky-600 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400 mb-3">Success!</h3>
                                <p className="text-gray-600 dark:text-gray-400 text-lg">{successMessage}</p>
                            </div>
                        ) : (
                            // Form State
                            <>
                                <div className="relative bg-gradient-to-r from-blue-50 to-sky-50 dark:from-gray-800 dark:to-gray-800 px-6 py-4 border-b border-blue-200/30 dark:border-blue-700/30">
                                    <div className="flex justify-between items-center">
                                        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">{editingId ? 'Edit Product' : 'New Product'}</h2>
                                        <button onClick={cancelEdit} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                <div className="p-6 max-h-[calc(90vh-180px)] overflow-y-auto">
                                    <form onSubmit={editingId ? updateProduct : create} className="space-y-5">
                                        {/* Product Details */}
                                        <div>
                                            <h3 className="text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400 mb-3 uppercase tracking-wide">Product Details</h3>
                                            <div className="space-y-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Product Name *</label>
                                                    <input required placeholder="e.g. DRP CANCEROMIN/R1" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" />
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className={isModalCategoryOpen ? 'relative z-[10000]' : 'relative z-0'}>
                                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Category</label>
                                                        <CustomSelect
                                                            value={form.categoryId}
                                                            onChange={(val) => setForm({ ...form, categoryId: val })}
                                                            options={modalCategoryOptions}
                                                            placeholder="Select category"
                                                            onOpenChange={setIsModalCategoryOpen}
                                                            allowCustom={true}
                                                            loading={loadingOptions}
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Units</label>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <input 
                                                                type="number" 
                                                                placeholder="30" 
                                                                value={form.unitQuantity} 
                                                                onChange={e => setForm({ ...form, unitQuantity: e.target.value })} 
                                                                className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
                                                            />
                                                            <div className={isUnitTypeOpen ? 'relative z-[10000]' : 'relative z-0'}>
                                                                <CustomSelect
                                                                    value={form.unitType}
                                                                    onChange={(val) => setForm({ ...form, unitType: val })}
                                                                    options={unitTypes}
                                                                    placeholder="Unit"
                                                                    onOpenChange={setIsUnitTypeOpen}
                                                                    loading={loadingOptions}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Latest Batch Number</label>
                                                        <input
                                                            type="text"
                                                            placeholder="e.g. B-1024"
                                                            value={form.latestBatchNumber}
                                                            onChange={e => setForm({ ...form, latestBatchNumber: e.target.value })}
                                                            className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Pricing & Inventory */}
                                        <div>
                                            <h3 className="text-sm font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400 mb-3 uppercase tracking-wide">Pricing & Inventory</h3>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Rate/Unit (Sale Price) ₹ *</label>
                                                    <input 
                                                        type="number" 
                                                        step="0.01" 
                                                        placeholder="5.00" 
                                                        value={form.priceRupees} 
                                                        onChange={e => setForm({ ...form, priceRupees: e.target.value })} 
                                                        className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Purchase Price/Pack ₹</label>
                                                    <input 
                                                        type="number" 
                                                        step="0.01" 
                                                        placeholder="120.00" 
                                                        value={form.purchasePriceRupees} 
                                                        onChange={e => setForm({ ...form, purchasePriceRupees: e.target.value })} 
                                                        className="w-full px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all" 
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Threshold (Min Stock)</label>
                                                    <div className="relative">
                                                        <input 
                                                            type="number" 
                                                            placeholder="200" 
                                                            value={form.minStockLevel} 
                                                            onChange={e => setForm({ ...form, minStockLevel: e.target.value })} 
                                                            disabled={!!editingId && isMinStockLocked}
                                                            className="w-full px-3 py-2.5 pr-10 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed" 
                                                            min="0"
                                                        />
                                                        {editingId && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setIsMinStockLocked(!isMinStockLocked)}
                                                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                                                title={isMinStockLocked ? "Unlock to edit" : "Lock field"}
                                                            >
                                                                {isMinStockLocked ? (
                                                                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                                    </svg>
                                                                ) : (
                                                                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                                                    </svg>
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Purchase (Flow)</label>
                                                    <div className="relative">
                                                        <input 
                                                            type="number" 
                                                            placeholder="150000" 
                                                            value={form.totalPurchased} 
                                                            onChange={e => setForm({ ...form, totalPurchased: e.target.value })} 
                                                            disabled={!!editingId && isPurchaseQtyLocked}
                                                            className="w-full px-3 py-2.5 pr-10 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed" 
                                                        />
                                                        {editingId && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setIsPurchaseQtyLocked(!isPurchaseQtyLocked)}
                                                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                                                title={isPurchaseQtyLocked ? "Unlock to edit" : "Lock field"}
                                                            >
                                                                {isPurchaseQtyLocked ? (
                                                                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                                    </svg>
                                                                ) : (
                                                                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                                                    </svg>
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">Sales (Flow)</label>
                                                    <div className="relative">
                                                        <input 
                                                            type="number" 
                                                            placeholder="304" 
                                                            value={form.totalSales} 
                                                            onChange={e => setForm({ ...form, totalSales: e.target.value })} 
                                                            disabled={!!editingId && isSalesQtyLocked}
                                                            className="w-full px-3 py-2.5 pr-10 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all disabled:bg-gray-100 dark:disabled:bg-gray-900 disabled:cursor-not-allowed" 
                                                        />
                                                        {editingId && (
                                                            <button
                                                                type="button"
                                                                onClick={() => setIsSalesQtyLocked(!isSalesQtyLocked)}
                                                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                                                title={isSalesQtyLocked ? "Unlock to edit" : "Lock field"}
                                                            >
                                                                {isSalesQtyLocked ? (
                                                                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                                    </svg>
                                                                ) : (
                                                                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                                                    </svg>
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Calculated Fields Display */}
                                        {(form.unitQuantity && form.priceRupees && (form.totalPurchased || form.totalSales || form.purchasePriceRupees)) && (
                                            <div className="bg-gradient-to-r from-blue-50 to-cyan-50 dark:from-blue-950/20 dark:to-cyan-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                                                <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-400 mb-3 flex items-center gap-2">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                                    </svg>
                                                    Calculated Values
                                                </h4>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                                                    {(() => {
                                                        const units = Number(form.unitQuantity) || 1
                                                        const ratePerUnit = Number(form.priceRupees) || 0
                                                        const purchasePricePerPack = Number(form.purchasePriceRupees) || 0
                                                        const salePricePerPack = ratePerUnit * units
                                                        const marginPercent = salePricePerPack > 0 ? ((salePricePerPack - purchasePricePerPack) / salePricePerPack) * 100 : 0
                                                        const purchase = Number(form.totalPurchased) || 0
                                                        const sales = Number(form.totalSales) || 0
                                                        const flowInventory = purchase - sales
                                                        const actualInventory = units > 0 ? Math.floor(flowInventory / units) : 0
                                                        const inventoryValue = Number(form.inventoryValue) || (ratePerUnit * flowInventory)
                                                        const purchaseValue = Number(form.purchaseValue) || (ratePerUnit * purchase)
                                                        const salesValue = Number(form.salesValue) || (ratePerUnit * sales)
                                                        
                                                        return (
                                                            <>
                                                                <div className="bg-white dark:bg-gray-800/50 p-2 rounded">
                                                                    <div className="text-xs text-gray-500 dark:text-gray-400">Sale Price/Pack</div>
                                                                    <div className="font-bold text-blue-600 dark:text-blue-400">{formatCurrency(salePricePerPack)}</div>
                                                                </div>
                                                                <div className={`bg-white dark:bg-gray-800/50 p-2 rounded ${marginPercent < 0 ? 'ring-1 ring-red-500' : ''}`}>
                                                                    <div className="text-xs text-gray-500 dark:text-gray-400">Margin%</div>
                                                                    <div className={`font-bold ${marginPercent >= 0 ? 'text-sky-600 dark:text-sky-400' : 'text-red-600 dark:text-red-400'}`}>
                                                                        {formatQuantity(marginPercent)}%
                                                                    </div>
                                                                </div>
                                                                <div className="bg-white dark:bg-gray-800/50 p-2 rounded">
                                                                    <div className="text-xs text-gray-500 dark:text-gray-400">Inventory (Flow)</div>
                                                                    <div className="font-bold text-blue-600 dark:text-blue-400">{formatQuantity(flowInventory)}</div>
                                                                </div>
                                                                <div className="bg-white dark:bg-gray-800/50 p-2 rounded">
                                                                    <div className="text-xs text-gray-500 dark:text-gray-400">Actual Inventory</div>
                                                                    <div className="font-bold text-blue-600 dark:text-blue-400">{formatQuantity(actualInventory)}</div>
                                                                </div>
                                                                <div className="bg-white dark:bg-gray-800/50 p-2 rounded">
                                                                    <div className="text-xs text-gray-500 dark:text-gray-400">Inventory Value</div>
                                                                    <div className="font-bold text-blue-600 dark:text-blue-400">{formatCurrency(inventoryValue)}</div>
                                                                </div>
                                                                <div className="bg-white dark:bg-gray-800/50 p-2 rounded">
                                                                    <div className="text-xs text-gray-500 dark:text-gray-400">Purchase Value</div>
                                                                    <div className="font-bold text-blue-600 dark:text-blue-400">{formatCurrency(purchaseValue)}</div>
                                                                </div>
                                                                <div className="bg-white dark:bg-gray-800/50 p-2 rounded">
                                                                    <div className="text-xs text-gray-500 dark:text-gray-400">Sales Value</div>
                                                                    <div className="font-bold text-blue-600 dark:text-blue-400">{formatCurrency(salesValue)}</div>
                                                                </div>
                                                            </>
                                                        )
                                                    })()}
                                                </div>
                                            </div>
                                        )}
                                    </form>
                                </div>

                                <div className="relative bg-gradient-to-r from-blue-50/50 to-sky-50/50 dark:from-gray-800 dark:to-gray-800 px-6 py-4 flex justify-end gap-3">
                                    <button type="button" onClick={cancelEdit} disabled={submitting} className="px-6 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors font-medium disabled:opacity-50">
                                        Cancel
                                    </button>
                                    <button type="submit" disabled={!user || submitting} onClick={editingId ? updateProduct : create} className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-lg font-semibold transition-all shadow-lg shadow-blue-500/30 hover:shadow-xl hover:scale-105 disabled:opacity-50">
                                        {submitting ? 'Processing...' : !user ? 'Login to add products' : editingId ? 'Update Product' : 'Add Product'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Products Table */}
            <div className="rounded-xl border border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-br from-white via-blue-50 to-sky-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 shadow-lg shadow-blue-500/10 p-4 overflow-hidden" style={{ position: 'relative', zIndex: 0 }}>
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl" style={{ zIndex: -1 }}></div>
                <div className="relative">
                <h3 className="text-lg font-semibold mb-4 flex items-center justify-between">
                    <span className="flex items-center gap-3">
                        <label className="relative group/checkbox cursor-pointer flex-shrink-0">
                            <input
                                type="checkbox"
                                checked={filteredProducts.length > 0 && selectedProductIds.size === filteredProducts.length}
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
                        <span className="font-bold text-gray-900 dark:text-gray-100">Products Inventory {selectedProductIds.size > 0 && <span className="px-2 py-0.5 ml-2 bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-400 rounded-full text-xs font-bold">({selectedProductIds.size} selected)</span>}</span>
                    </span>
                    <div className="flex items-center gap-2">
                        <span className="badge">{filteredProducts.length} products</span>
                        <button
                            type="button"
                            onClick={() => setShowNewOnly((prev) => !prev)}
                            className={`px-2 py-0.5 text-xs rounded-full font-bold transition-all ${showNewOnly ? 'bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md' : 'bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300 hover:bg-sky-200 dark:hover:bg-sky-900'}`}
                            title={showNewOnly ? 'Show all products' : 'Show only NEW products'}
                        >
                            NEW {newBadgeCount > 0 ? `(${newBadgeCount})` : ''}
                        </button>
                    </div>
                </h3>
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mb-4"></div>
                        <p className="text-muted">Loading products...</p>
                    </div>
                ) : filteredProducts.length === 0 ? (
                    <div className="text-center py-12 text-muted">
                        <p className="text-lg mb-2">{showNewOnly ? 'No new products found' : 'No products found'}</p>
                        <p className="text-sm">{showNewOnly ? 'Turn off NEW filter or adjust your search/filters' : 'Try adjusting your search or filter criteria'}</p>
                    </div>
                ) : (
                    <>
                        <ThemedScrollArea className="space-y-2 max-h-[44rem] pr-1">
                            {filteredProducts
                                .map(p => {
                                    const isDeleting = deletingIds.has(p.id)
                                    const isExpanded = expandedRows.has(p.id)
                                    const qty = p.quantity || 0
                                    const reorderLevel = p.category?.reorderLevel || 10
                                    const isLowStock = qty < reorderLevel && qty > 0
                                    const isOutOfStock = qty <= 0
                                    
                                    return (
                                        <div key={p.id} className={`border border-blue-100 dark:border-blue-800 rounded-lg overflow-hidden hover:shadow-lg hover:shadow-blue-100 dark:hover:shadow-blue-900/50 transition-all duration-300 ${isDeleting ? 'opacity-0 -translate-x-full scale-95' : ''} ${selectedProductIds.has(p.id) ? 'ring-2 ring-blue-500 shadow-xl shadow-blue-100 dark:shadow-blue-900 bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-950 dark:to-sky-950' : ''}`}>
                                            {isDeleting ? (
                                                <div className="p-6 text-center bg-red-50 dark:bg-red-950 animate-pulse">
                                                    <span className="text-red-600 dark:text-red-400 font-bold text-lg">Deleting...</span>
                                                </div>
                                            ) : (
                                            <>
                                            {/* Summary Row */}
                                            <div className="bg-gradient-to-r from-blue-50 to-sky-50 dark:from-blue-950/50 dark:to-sky-950/50 p-3 flex items-center gap-3 border-b border-blue-100 dark:border-blue-800">
                                                {/* Checkbox */}
                                                <div className="flex-shrink-0">
                                                    <label className="relative group/checkbox cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedProductIds.has(p.id)}
                                                            onChange={() => toggleProductSelection(p.id)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="peer sr-only"
                                                        />
                                                        <div className="w-6 h-6 border-2 border-blue-400 dark:border-blue-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-blue-500 peer-checked:to-sky-600 peer-checked:border-blue-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-blue-500/50 group-hover/checkbox:border-blue-500 group-hover/checkbox:scale-110">
                                                            <svg className="w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        </div>
                                                        <div className="absolute inset-0 rounded-md bg-blue-400 opacity-0 peer-checked:opacity-20 blur-md transition-opacity duration-200 pointer-events-none"></div>
                                                    </label>
                                                </div>
                                                
                                                {/* Product Info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <div className="font-semibold text-sm">{p.name}</div>
                                                        {isProductFromToday(p) && (
                                                            <span className="px-2 py-0.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white text-xs rounded-full font-bold shadow-md">
                                                                NEW
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="text-xs text-muted mt-0.5">
                                                        {(() => {
                                                            const unitParts = p.unit ? String(p.unit).trim().split(/\s+/) : []
                                                            const unitType = unitParts.length >= 2 ? unitParts[1] : ''
                                                            const flowInventory = (Number(p.totalPurchased) || 0) - (Number(p.totalSales) || 0)
                                                            const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                                                            const actualInventory = unitQuantity > 0 ? Math.floor(flowInventory / unitQuantity) : 0
                                                            
                                                            return (
                                                                <>
                                                                    {p.category && <span className="mr-2">📦 {p.category.name}</span>}
                                                                    {unitType && <span className="mr-2">| {unitType}</span>}
                                                                    <span className="mr-2">| Qty: {formatQuantity(actualInventory)} ({formatQuantity(flowInventory)})</span>
                                                                    <span>| Threshold: {formatQuantity((p.minStockLevel) || 0)}</span>
                                                                </>
                                                            )
                                                        })()}
                                                    </div>
                                                </div>
                                                
                                                {/* Stock Status Badge */}
                                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-shrink-0">
                                                    {(() => {
                                                        const unitParts = p.unit ? String(p.unit).trim().split(/\s+/) : []
                                                        const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                                                        const flowInventory = (Number(p.totalPurchased) || 0) - (Number(p.totalSales) || 0)
                                                        const actualInventory = unitQuantity > 0 ? Math.floor(flowInventory / unitQuantity) : 0
                                                        const minStock = Number(p.minStockLevel) || 0
                                                        const isOutOfStock = flowInventory <= 0
                                                        const isLowStock = flowInventory > 0 && flowInventory < minStock
                                                        
                                                        return (
                                                            <>
                                                                {isOutOfStock && (
                                                                    <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs rounded font-semibold">
                                                                        OUT OF STOCK
                                                                    </span>
                                                                )}
                                                                {isLowStock && (
                                                                    <span className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs rounded font-semibold">
                                                                        LOW STOCK
                                                                    </span>
                                                                )}
                                                                <span className={`text-sm font-semibold ${
                                                                    isOutOfStock ? 'text-red-600 dark:text-red-400' :
                                                                    isLowStock ? 'text-yellow-600 dark:text-yellow-400' :
                                                                    'text-sky-600 dark:text-sky-400'
                                                                }`}>
                                                                    Qty: {formatQuantity(Math.max(0, actualInventory))} ({formatQuantity(flowInventory)})
                                                                </span>
                                                            </>
                                                        )
                                                    })()}
                                                </div>
                                                
                                                {/* Action Buttons */}
                                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-shrink-0">
                                                    <button
                                                        onClick={() => editProduct(p)}
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
                                                        onClick={() => deleteProduct(p.id)}
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
                                                        onClick={() => toggleRowExpansion(p.id)}
                                                        className="px-2 sm:px-3 py-1.5 text-xs bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded shadow-sm"
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
                                            {isExpanded && (() => {
                                                const unitParts = p.unit ? String(p.unit).trim().split(/\s+/) : []
                                                const units = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                                                const unitType = unitParts.length >= 2 ? unitParts[1] : ''
                                                const ratePerUnit = Number(p.priceRupees) || 0
                                                const purchasePricePerPack = Number(p.purchasePriceRupees) || 0
                                                const salePricePerPack = ratePerUnit * units
                                                const marginPercent = salePricePerPack > 0 ? ((salePricePerPack - purchasePricePerPack) / salePricePerPack) * 100 : 0
                                                const purchaseQty = Number(p.totalPurchased) || 0
                                                const saleQty = Number(p.totalSales) || 0
                                                const flowInventory = purchaseQty - saleQty
                                                const actualInventory = units > 0 ? Math.floor(flowInventory / units) : 0
                                                const inventoryValue = Number(p.inventoryValue) || 0
                                                const purchaseValue = Number(p.purchaseValue) || 0
                                                const salesValue = Number(p.salesValue) || 0
                                                
                                                return (
                                                    <div className="bg-gradient-to-br from-white via-blue-50/20 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/10 dark:to-sky-950/10 p-4 border-t border-blue-100 dark:border-blue-800">
                                                        <h4 className="text-sm font-bold text-blue-700 dark:text-blue-400 mb-3 flex items-center gap-2">
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                                            </svg>
                                                            Product Details
                                                        </h4>
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 text-sm">
                                                            <div className="bg-white dark:bg-gray-800/50 p-3 rounded-lg border border-blue-100 dark:border-blue-800/50">
                                                                <div className="text-xs text-blue-600 dark:text-blue-400 mb-1 font-semibold">UNITS</div>
                                                                <div className="text-base font-bold">{formatQuantity(units)} {unitType}</div>
                                                            </div>
                                                            <div className="bg-white dark:bg-gray-800/50 p-3 rounded-lg border border-blue-100 dark:border-blue-800/50">
                                                                <div className="text-xs text-blue-600 dark:text-blue-400 mb-1 font-semibold">RATE/UNIT</div>
                                                                <div className="text-base font-bold">{formatCurrency(ratePerUnit)}</div>
                                                            </div>
                                                            <div className="bg-white dark:bg-gray-800/50 p-3 rounded-lg border border-purple-100 dark:border-purple-800/50">
                                                                <div className="text-xs text-purple-600 dark:text-purple-400 mb-1 font-semibold">PURCHASE PRICE/PACK</div>
                                                                <div className="text-base font-bold">{formatCurrency(purchasePricePerPack)}</div>
                                                            </div>
                                                            <div className="bg-white dark:bg-gray-800/50 p-3 rounded-lg border border-pink-100 dark:border-pink-800/50">
                                                                <div className="text-xs text-pink-600 dark:text-pink-400 mb-1 font-semibold">SALE PRICE/PACK</div>
                                                                <div className="text-base font-bold">{formatCurrency(salePricePerPack)}</div>
                                                            </div>
                                                            <div className={`bg-white dark:bg-gray-800/50 p-3 rounded-lg border ${marginPercent >= 0 ? 'border-sky-100 dark:border-sky-800/50' : 'border-red-100 dark:border-red-800/50'}`}>
                                                                <div className={`text-xs mb-1 font-semibold ${marginPercent >= 0 ? 'text-sky-600 dark:text-sky-400' : 'text-red-600 dark:text-red-400'}`}>MARGIN%</div>
                                                                <div className={`text-base font-bold ${marginPercent >= 0 ? 'text-sky-600 dark:text-sky-400' : 'text-red-600 dark:text-red-400'}`}>
                                                                    {formatQuantity(marginPercent)}%
                                                                </div>
                                                            </div>
                                                            <div className="bg-white dark:bg-gray-800/50 p-3 rounded-lg border border-orange-100 dark:border-orange-800/50">
                                                                <div className="text-xs text-orange-600 dark:text-orange-400 mb-1 font-semibold">INVENTORY (FLOW)</div>
                                                                <div className="text-base font-bold">{formatQuantity(flowInventory)}</div>
                                                            </div>
                                                            <div className="bg-white dark:bg-gray-800/50 p-3 rounded-lg border border-cyan-100 dark:border-cyan-800/50">
                                                                <div className="text-xs text-cyan-600 dark:text-cyan-400 mb-1 font-semibold">ACTUAL INVENTORY</div>
                                                                <div className="text-base font-bold">{formatQuantity(actualInventory)}</div>
                                                            </div>
                                                            <div className="bg-white dark:bg-gray-800/50 p-3 rounded-lg border border-cyan-100 dark:border-cyan-800/50">
                                                                <div className="text-xs text-cyan-600 dark:text-cyan-400 mb-1 font-semibold">INVENTORY VALUE</div>
                                                                <div className="text-base font-bold">{formatCurrency(inventoryValue)}</div>
                                                            </div>
                                                            <div className="bg-white dark:bg-gray-800/50 p-3 rounded-lg border border-indigo-100 dark:border-indigo-800/50">
                                                                <div className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-semibold">PURCHASE (FLOW)</div>
                                                                <div className="text-base font-bold">{formatQuantity(purchaseQty)}</div>
                                                            </div>
                                                            <div className="bg-white dark:bg-gray-800/50 p-3 rounded-lg border border-violet-100 dark:border-violet-800/50">
                                                                <div className="text-xs text-violet-600 dark:text-violet-400 mb-1 font-semibold">PURCHASE VALUE</div>
                                                                <div className="text-base font-bold">{formatCurrency(purchaseValue)}</div>
                                                            </div>
                                                            <div className="bg-white dark:bg-gray-800/50 p-3 rounded-lg border border-rose-100 dark:border-rose-800/50">
                                                                <div className="text-xs text-rose-600 dark:text-rose-400 mb-1 font-semibold">SALES (FLOW)</div>
                                                                <div className="text-base font-bold">{formatQuantity(saleQty)}</div>
                                                            </div>
                                                            <div className="bg-white dark:bg-gray-800/50 p-3 rounded-lg border border-amber-100 dark:border-amber-800/50">
                                                                <div className="text-xs text-amber-600 dark:text-amber-400 mb-1 font-semibold">SALES VALUE</div>
                                                                <div className="text-base font-bold">{formatCurrency(salesValue)}</div>
                                                            </div>
                                                            <div className="bg-white dark:bg-gray-800/50 p-3 rounded-lg border border-yellow-100 dark:border-yellow-800/50">
                                                                <div className="text-xs text-yellow-600 dark:text-yellow-400 mb-1 font-semibold">THRESHOLD</div>
                                                                <div className="text-base font-bold">{formatQuantity(p.minStockLevel || 0)}</div>
                                                            </div>
                                                            <div className="bg-white dark:bg-gray-800/50 p-3 rounded-lg border border-teal-100 dark:border-teal-800/50">
                                                                <div className="text-xs text-teal-600 dark:text-teal-400 mb-1 font-semibold">LATEST BATCH</div>
                                                                <div className="text-base font-bold">{p.latestBatchNumber || 'N/A'}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )
                                            })()}
                                        </>
                                        )}
                                        </div>
                                    )
                                })}
                            </ThemedScrollArea>
                    </>
                )}
            </div>

            <ConfirmModal
                isOpen={showDeleteSelectedConfirm}
                title="Delete Selected Products"
                message={`You selected ${deleteTargetIds.length || selectedProductIds.size} product(s) for deletion. This action is irreversible.`}
                stepOneConfirmText={deleteImpactLoading ? 'Analyzing...' : 'Review Impact'}
                secondStepTitle="Final Delete Confirmation"
                secondStepMessage={`${deleteImpactSummaryMessage}${impactUsedRows.length > 20 ? ` Showing first 20 impacted products.` : ''}`}
                detailsTitle="Products currently used in records"
                detailItems={deleteImpactError
                    ? [{ title: 'Impact analysis warning', subtitle: deleteImpactError, severity: 'warning' }]
                    : deleteImpactDetailItems}
                secondaryActionText="Reset Values Instead"
                onSecondaryAction={resetValuesInsteadOfDelete}
                secondaryActionLoading={resettingValues}
                confirmText="Proceed Delete"
                cancelText="Cancel"
                variant="danger"
                onConfirm={confirmDeleteSelected}
                loading={deleting}
                onCancel={() => {
                    setShowDeleteSelectedConfirm(false)
                    setDeleteTargetIds([])
                    setDeleteImpactRows([])
                    setDeleteImpactError('')
                }}
            />

            <ConfirmModal
                isOpen={showDeleteConfirm}
                title="Delete Product"
                message="This product will be permanently deleted. Please review impact before continuing."
                stepOneConfirmText={deleteImpactLoading ? 'Analyzing...' : 'Review Impact'}
                secondStepTitle="Final Delete Confirmation"
                secondStepMessage={deleteImpactSummaryMessage}
                detailsTitle="Product usage details"
                detailItems={deleteImpactError
                    ? [{ title: 'Impact analysis warning', subtitle: deleteImpactError, severity: 'warning' }]
                    : deleteImpactDetailItems}
                secondaryActionText="Reset Values Instead"
                onSecondaryAction={resetValuesInsteadOfDelete}
                secondaryActionLoading={resettingValues}
                confirmText="Proceed Delete"
                cancelText="Cancel"
                variant="danger"
                loading={deleting}
                onConfirm={confirmDelete}
                onCancel={() => {
                    setShowDeleteConfirm(false)
                    setDeleteId(null)
                    setDeleteTargetIds([])
                    setDeleteImpactRows([])
                    setDeleteImpactError('')
                }}
            />

            <ImportProductsModal 
                isOpen={showImportModal}
                onClose={() => setShowImportModal(false)}
                onImportSuccess={() => {
                    setLoading(true)
                    const params = new URLSearchParams()
                    if (selectedDoctorId) params.append('doctorId', selectedDoctorId.toString())
                    const queryString = params.toString() ? `?${params}` : ''
                    fetch(`/api/products${queryString}`)
                        .then(r => r.json())
                        .then(productsData => {
                            setItems(Array.isArray(productsData) ? productsData : [])
                            // Extract unique categories from products
                            const uniqueCategories = Array.from(new Set(
                                productsData.map((p: any) => {
                                    const cat = p.category
                                    return typeof cat === 'string' ? cat : (cat?.name || cat?.id || String(cat))
                                }).filter(Boolean)
                            ))
                            setCategories(uniqueCategories)
                            setLoading(false)
                            fetchDefaultTemplateStatus()
                        })
                        .catch(() => {
                            setLoading(false)
                            fetchDefaultTemplateStatus()
                        })
                }}
            />

            {/* Low Stock Purchase Order Modal */}
            {showLowStockModal && typeof document !== 'undefined' && createPortal(
                <div style={{ position: 'fixed', inset: 0, zIndex: 999999 }} className={`bg-black flex items-center justify-center p-4 transition-opacity duration-300 ${lowStockModalAnimating ? 'bg-opacity-50' : 'bg-opacity-0'}`}>
                    <div className={`relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50 to-sky-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 shadow-2xl shadow-blue-500/20 max-w-2xl w-full overflow-hidden transform transition-all duration-300 ${lowStockModalAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                        {/* Decorative gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                        
                        {/* Header */}
                        <div className="relative p-4 border-b border-blue-200/50 dark:border-blue-700/50">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-sky-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                                        </svg>
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">Create Purchase Order</h2>
                                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">Low & Out of Stock Items</p>
                                    </div>
                                </div>
                                
                                {/* Supplier Selection on same line */}
                                <div className={`flex-1 max-w-xs ${isSupplierOpen ? 'relative z-[10000]' : 'relative z-0'}`}>
                                    <CustomSelect
                                        value={selectedSupplier}
                                        onChange={(value) => setSelectedSupplier(value)}
                                        options={suppliers.map(s => ({
                                            value: s.id.toString(),
                                            label: `${s.name}${s.email ? ` (${s.email})` : ''}`
                                        }))}
                                        placeholder="Select supplier *"
                                        required
                                        onOpenChange={setIsSupplierOpen}
                                    />
                                </div>
                                
                                <button
                                    onClick={closeLowStockModal}
                                    disabled={generatingPO || sendingEmail}
                                    className="flex-shrink-0 w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200 flex items-center justify-center disabled:opacity-50 shadow-sm hover:shadow-md"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            {suppliers.length === 0 && (
                                <div className="mt-3 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                                    <p className="text-xs text-red-700 dark:text-red-400 flex items-center gap-1.5">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        No active suppliers found. Please add a supplier first.
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Content */}
                        <div className="relative overflow-y-auto max-h-[70vh] p-4">
                            {/* Low Stock Products List */}
                            <div className="mb-4">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                        {lowStockProducts.length > 0 && (
                                            <label className="relative group/checkbox cursor-pointer flex-shrink-0">
                                                <input
                                                    type="checkbox"
                                                    checked={lowStockProducts.length > 0 && selectedPOIndices.size === lowStockProducts.length}
                                                    onChange={toggleSelectAllPOItems}
                                                    className="peer sr-only"
                                                />
                                                <div className="w-5 h-5 border-2 border-blue-400 dark:border-blue-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-blue-500 peer-checked:to-blue-600 peer-checked:border-blue-500 transition-all duration-200 flex items-center justify-center shadow-sm group-hover/checkbox:shadow-md">
                                                    <svg className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                                <div className="absolute inset-0 rounded-md bg-blue-400 opacity-0 peer-checked:opacity-20 blur-md transition-opacity duration-200 pointer-events-none"></div>
                                            </label>
                                        )}
                                        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center shadow-lg shadow-yellow-500/30">
                                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                            </svg>
                                        </div>
                                        <span>Items Requiring Restock ({lowStockProducts.length})
                                            {selectedPOIndices.size > 0 && <span className="px-1.5 py-0.5 ml-2 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 rounded-full text-xs font-bold">({selectedPOIndices.size})</span>}
                                        </span>
                                    </h3>
                                    <div className="flex items-center gap-2">
                                        {selectedPOIndices.size > 0 && (
                                            <button
                                                onClick={clearSelectedPOItems}
                                                className="text-xs px-2 py-1 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors font-medium"
                                            >
                                                Clear Selected ({selectedPOIndices.size})
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-2">
                                    {lowStockProducts.map((product: any, index: number) => {
                                        const flowInventory = (Number(product.totalPurchased) || 0) - (Number(product.totalSales) || 0)
                                        const minStock = Number(product.minStockLevel) || 200
                                        const requestedQty = poRequestedQty[index] || Math.max(0, minStock - flowInventory)
                                        const isOutOfStock = flowInventory <= 0
                                        const isSelected = selectedPOIndices.has(index)
                                        
                                        return (
                                            <div key={product.id} className="relative rounded-lg border border-blue-200/50 dark:border-blue-700/50 bg-white dark:bg-gray-800 p-3 hover:shadow-lg hover:shadow-blue-500/10 transition-all duration-200 group">
                                                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-lg pointer-events-none"></div>
                                                <div className="relative flex items-center gap-3">
                                                    {/* Checkbox - Purple style matching demand list */}
                                                    <label className="relative group/checkbox cursor-pointer flex-shrink-0">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => toggleSelectPOItem(index)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="peer sr-only"
                                                        />
                                                        <div className="w-5 h-5 border-2 border-purple-400 dark:border-purple-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-purple-500 peer-checked:to-purple-600 peer-checked:border-purple-500 transition-all duration-200 flex items-center justify-center shadow-sm">
                                                            <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        </div>
                                                    </label>
                                                    <div className="flex-1 flex items-center justify-between">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                <span className="text-sm font-semibold text-gray-900 dark:text-white">{product.name}</span>
                                                                {isOutOfStock ? (
                                                                    <span className="px-2 py-0.5 bg-gradient-to-r from-red-500 to-rose-600 text-white text-[10px] rounded-full font-bold shadow-lg shadow-red-500/30">
                                                                        OUT
                                                                    </span>
                                                                ) : (
                                                                    <span className="px-2 py-0.5 bg-gradient-to-r from-yellow-500 to-amber-600 text-white text-[10px] rounded-full font-bold shadow-lg shadow-yellow-500/30">
                                                                        LOW
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2 text-xs">
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-gray-600 dark:text-gray-400">Cur:</span>
                                                                    <span className={`font-bold ${isOutOfStock ? 'text-red-600 dark:text-red-400' : 'text-yellow-600 dark:text-yellow-400'}`}>{flowInventory}</span>
                                                                </div>
                                                                <div className="w-px h-3 bg-gray-300 dark:bg-gray-600"></div>
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-gray-600 dark:text-gray-400">Min:</span>
                                                                    <span className="font-semibold text-gray-900 dark:text-white">{minStock}</span>
                                                                </div>
                                                                <div className="w-px h-3 bg-gray-300 dark:bg-gray-600"></div>
                                                                <div className="flex items-center gap-1">
                                                                    <span className="text-gray-600 dark:text-gray-400">Req Qty:</span>
                                                                    <input
                                                                        type="number"
                                                                        value={requestedQty}
                                                                        onChange={(e) => {
                                                                            const newQty = Number(e.target.value) || 0
                                                                            setPORequestedQty(prev => ({
                                                                                ...prev,
                                                                                [index]: newQty
                                                                            }))
                                                                        }}
                                                                        min="1"
                                                                        className="w-16 px-1 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 font-bold text-blue-600 dark:text-blue-400 text-center"
                                                                    />
                                                                    <span className="text-gray-500 dark:text-gray-500 text-[10px]">{product.unit || 'pcs'}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="text-right ml-3 flex items-center gap-2">
                                                            <div>
                                                                <p className="text-sm font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                                                                    {formatCurrency((product.purchasePricePerUnit || product.purchasePriceRupees || product.priceRupees || 0) * requestedQty)}
                                                                </p>
                                                                <p className="text-[10px] text-gray-500 dark:text-gray-500">
                                                                    {formatCurrency(product.purchasePricePerUnit || product.purchasePriceRupees || product.priceRupees || 0)}/u
                                                                </p>
                                                            </div>
                                                            <button
                                                                onClick={() => toggleSelectPOItem(index)}
                                                                className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-all duration-200 flex items-center justify-center"
                                                                title="Remove from order"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })
                                    }
                                </div>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="relative flex justify-between items-center gap-3 p-6 border-t border-blue-200/50 dark:border-blue-700/50">
                            {/* Total Summary */}
                            <div className="flex items-center gap-2">
                                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-sky-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <span className="text-sm font-semibold text-gray-900 dark:text-white">Total ({selectedPOIndices.size} items):</span>
                                <span className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                                    {formatCurrency(lowStockProducts
                                        .filter((_, index) => selectedPOIndices.has(index))
                                        .reduce((sum: number, p: any, idx: number) => {
                                            const actualIndex = lowStockProducts.findIndex(prod => prod.id === p.id)
                                            const flowInventory = (Number(p.totalPurchased) || 0) - (Number(p.totalSales) || 0)
                                            const minStock = Number(p.minStockLevel) || 200
                                            const requestedQty = poRequestedQty[actualIndex] || Math.max(0, minStock - flowInventory)
                                            const price = p.purchasePricePerUnit || p.purchasePriceRupees || p.priceRupees || 0
                                            return sum + (requestedQty * price)
                                        }, 0))
                                    }
                                </span>
                            </div>
                            
                            {/* Floating Delete Button */}
                            {selectedPOIndices.size > 0 && (
                                <button
                                    onClick={clearSelectedPOItems}
                                    className="absolute -top-12 right-6 w-10 h-10 rounded-full bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-lg shadow-red-500/40 hover:shadow-xl hover:shadow-red-500/50 transition-all duration-200 flex items-center justify-center group"
                                    title={`Clear ${selectedPOIndices.size} selected items`}
                                >
                                    <svg className="w-5 h-5 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-white dark:bg-gray-900 text-red-600 dark:text-red-400 rounded-full text-xs font-bold flex items-center justify-center shadow-md">
                                        {selectedPOIndices.size}
                                    </span>
                                </button>
                            )}
                            
                            {/* Action Buttons */}
                            <div className="flex gap-3">
                            <button
                                onClick={closeLowStockModal}
                                disabled={generatingPO || sendingEmail}
                                className="px-5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={createPurchaseOrderWithSupplier}
                                disabled={!selectedSupplier || generatingPO || sendingEmail || suppliers.length === 0}
                                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white font-semibold shadow-lg shadow-blue-500/30 hover:shadow-xl hover:shadow-blue-500/40 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {generatingPO || sendingEmail ? (
                                    <>
                                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        {sendingEmail ? 'Sending Email...' : 'Creating Order...'}
                                    </>
                                ) : (
                                    <>
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                        </svg>
                                        Create & Send Order
                                    </>
                                )}
                            </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Toast Notifications */}
            <ToastNotification toasts={toasts} removeToast={removeToast} />

            {/* Floating Export Button */}
            {selectedProductIds.size > 0 && (
                <div className="relative">
                    <button
                        onClick={() => setShowExportDropdown(!showExportDropdown)}
                        className="fixed bottom-8 right-40 z-50 group mobile-safe-page-fab-export"
                        title={`Export ${selectedProductIds.size} selected product(s)`}
                    >
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-r from-sky-500 to-blue-600 rounded-full blur-xl opacity-75 group-hover:opacity-100 transition-opacity duration-200"></div>
                            <div className="relative w-14 h-14 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 transform group-hover:scale-110">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                </svg>
                                <span className="absolute -top-1 -right-1 min-w-[24px] h-5 px-1.5 bg-sky-600 text-white rounded-full text-xs font-bold flex items-center justify-center shadow-lg ring-2 ring-white">
                                    {selectedProductIds.size}
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
            {selectedProductIds.size > 0 && (
                <button
                    onClick={deleteSelectedProducts}
                    className="fixed bottom-8 right-24 z-50 group mobile-safe-page-fab-delete"
                    title={`Delete ${selectedProductIds.size} selected product(s)`}
                >
                    <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-rose-600 rounded-full blur-xl opacity-75 group-hover:opacity-100 transition-opacity duration-200 animate-pulse"></div>
                        <div className="relative w-14 h-14 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 transform group-hover:scale-110">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span className="absolute -top-1 -right-1 min-w-[24px] h-5 px-1.5 bg-red-600 text-white rounded-full text-xs font-bold flex items-center justify-center shadow-lg ring-2 ring-white">
                                {selectedProductIds.size}
                            </span>
                        </div>
                    </div>
                </button>
            )}
            </div>
        </div>
    )
}

// Protect this page - only staff, doctors, and admins can access
export default requireStaffOrAbove(ProductsPage)
