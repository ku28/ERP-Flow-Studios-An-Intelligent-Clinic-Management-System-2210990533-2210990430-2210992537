import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'
import LoadingModal from '../components/LoadingModal'
import ToastNotification from '../components/ToastNotification'
import CustomSelect from '../components/CustomSelect'
import ReceiveGoodsBillUploadModal from '../components/ReceiveGoodsBillUploadModal'
import UnmatchedItemsModal from '../components/UnmatchedItemsModal'
import AddDemandItemsModal from '../components/AddDemandItemsModal'
import RefreshButton from '../components/RefreshButton'
import ThemedScrollArea from '../components/ThemedScrollArea'
import { useToast } from '../hooks/useToast'
import { useDataCache } from '../contexts/DataCacheContext'
import * as XLSX from 'xlsx'
import { formatQuantity, formatPrice } from '../lib/utils'
import { useDefaultValues } from '../hooks/useDefaultValues'
import { isBasicPlan } from '../lib/subscription'
import StandardFeatureBadge from '../components/StandardFeatureBadge'

export default function PurchaseOrdersPage() {
    const router = useRouter()
    const { defaults: purchaseOrderDefaults } = useDefaultValues('purchaseOrders')
    const [sentDemands, setSentDemands] = useState<any[]>([])
    const [suppliers, setSuppliers] = useState<any[]>([])
    const [products, setProducts] = useState<any[]>([])
    const [demandList, setDemandList] = useState<any[]>([]) // Current demand list being built
    const [showSupplierModal, setShowSupplierModal] = useState(false)
    const [supplierModalAnimating, setSupplierModalAnimating] = useState(false)
    const [selectedSupplier, setSelectedSupplier] = useState('')
    const [supplierModalStep, setSupplierModalStep] = useState<1 | 2>(1)
    const [productNotes, setProductNotes] = useState<Record<number, string>>({})
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [deleteId, setDeleteId] = useState<number | null>(null)
    const [activeTab, setActiveTab] = useState<'pending' | 'received' | 'deleted'>('pending')
    const [searchQuery, setSearchQuery] = useState('')
    const [isDirectBillUploadModalOpen, setIsDirectBillUploadModalOpen] = useState(false)
    const [filterSupplier, setFilterSupplier] = useState('')
    const [loading, setLoading] = useState(false)
    const [sendingEmail, setSendingEmail] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [receiving, setReceiving] = useState(false)
    const [isReceivingModalOpen, setIsReceivingModalOpen] = useState(false)
    const [receivingModalAnimating, setReceivingModalAnimating] = useState(false)
    const [receivingPO, setReceivingPO] = useState<any>(null)
    const [showSuccessModal, setShowSuccessModal] = useState(false)
    const [successModalAnimating, setSuccessModalAnimating] = useState(false)
    const [receivedPODetails, setReceivedPODetails] = useState<any>(null)
    const [isBillUploadModalOpen, setIsBillUploadModalOpen] = useState(false)
    const [isAddItemsModalOpen, setIsAddItemsModalOpen] = useState(false)
    const [isUnmatchedItemsModalOpen, setIsUnmatchedItemsModalOpen] = useState(false)
    const [unmatchedItems, setUnmatchedItems] = useState<any[]>([])
    const [availableProducts, setAvailableProducts] = useState<any[]>([])
    const [pendingMatchedItems, setPendingMatchedItems] = useState<any[]>([])
    const [pendingBillUrl, setPendingBillUrl] = useState<string>('')
    const { toasts, removeToast, showSuccess, showError, showInfo } = useToast()
    const { getCache, setCache } = useDataCache()
    const { user } = useAuth()
    
    // Bulk operations and sorting
    const [selectedPOIds, setSelectedPOIds] = useState<Set<number>>(new Set())
    const [selectedDemandIds, setSelectedDemandIds] = useState<Set<number>>(new Set())
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
    const [expandedPORows, setExpandedPORows] = useState<Set<number>>(new Set())
    const [editingPOIds, setEditingPOIds] = useState<Set<number>>(new Set())
    const [editedPOData, setEditedPOData] = useState<{[key: number]: any}>({})
    const [uploadingBillForPO, setUploadingBillForPO] = useState<number | null>(null)
    const [restoringPOId, setRestoringPOId] = useState<number | null>(null)
    const [deletingPOId, setDeletingPOId] = useState<number | null>(null)
    const [sortField, setSortField] = useState<string>('createdAt')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
    const [showSortDropdown, setShowSortDropdown] = useState(false)
    const [showExportDropdown, setShowExportDropdown] = useState(false)
    const [isImportModalOpen, setIsImportModalOpen] = useState(false)
    const [deleteProgress, setDeleteProgress] = useState({ current: 0, total: 0 })
    const [isDeleteMinimized, setIsDeleteMinimized] = useState(false)
    const [confirmModal, setConfirmModal] = useState<{ open: boolean; id?: number; deleteMultiple?: boolean; message?: string; onConfirm?: () => void }>({ open: false })
    const [confirmModalAnimating, setConfirmModalAnimating] = useState(false)
    const [confirmStep, setConfirmStep] = useState<1 | 2>(1)
    const [isProductDropdownOpen, setIsProductDropdownOpen] = useState(false)
    const [isFilterSupplierOpen, setIsFilterSupplierOpen] = useState(false)
    const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false)
    const [isPdfPreviewModalOpen, setIsPdfPreviewModalOpen] = useState(false)
    const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string>('')
    const [pdfPreviewModalAnimating, setPdfPreviewModalAnimating] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [loadingDemandList, setLoadingDemandList] = useState(true)
    const isBasicSubscription = isBasicPlan(user?.clinic?.subscriptionPlan)

    // Always-current ref so async functions (fetchProducts) never read stale demandList
    const demandListRef = useRef<any[]>([])
    demandListRef.current = demandList

    useEffect(() => {
        // Check cache first
        const cachedPOs = getCache<any[]>('purchaseOrders')
        const cachedSuppliers = getCache<any[]>('suppliers')
        const cachedProducts = getCache<any[]>('products')
        
        if (cachedPOs) {
            setSentDemands(cachedPOs)
        }
        if (cachedSuppliers) {
            setSuppliers(cachedSuppliers.filter((s: any) => s.status === 'active'))
        }
        if (cachedProducts) {
            setProducts(cachedProducts)
        }
        
        // Load demandList from localStorage
        if (typeof window !== 'undefined') {
            const savedDemandList = localStorage.getItem('demandList')
            if (savedDemandList) {
                try {
                    const parsed = JSON.parse(savedDemandList)
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        setDemandList(parsed)
                        // Select all items by default (use productId, not index)
                        setSelectedDemandIds(new Set(parsed.map((item: any) => item.productId)))
                    }
                } catch (error) {
                    localStorage.removeItem('demandList')
                }
            }
        }
        
        // Fetch in background
        fetchInitialData()
    }, [])

    // Persist demandList to localStorage whenever it changes
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('demandList', JSON.stringify(demandList))
        }
    }, [demandList])

    const fetchInitialData = async () => {
        setLoading(true)
        try {
            await Promise.all([
                fetchSentDemands(),
                fetchSuppliers(),
                fetchProducts()
            ])
        } finally {
            setLoading(false)
            setLoadingDemandList(false)  // Stop demand list loading animation
        }
    }

    const fetchSentDemands = async () => {
        const response = await fetch('/api/purchase-orders')
        const data = await response.json()
        const posData = Array.isArray(data) ? data : []
        setSentDemands(posData)
        setCache('purchaseOrders', posData)
    }

    const fetchSuppliers = async () => {
        const response = await fetch('/api/suppliers')
        const data = await response.json()
        const suppliersData = Array.isArray(data) ? data.filter((s: any) => s.status === 'active') : []
        setSuppliers(suppliersData)
        setCache('suppliers', suppliersData)
    }

    const fetchProducts = async () => {
        const response = await fetch('/api/products')
        const data = await response.json()
        const productsData = Array.isArray(data) ? data : []
        setProducts(productsData)
        setCache('products', productsData)

        // Auto-add low and out of stock items to demand list (based on FLOW inventory)
        const lowStockItems = productsData.filter((p: any) => {
            const totalPurchased = Number(p.totalPurchased) || 0
            const totalSales = Number(p.totalSales) || 0
            const flowInventory = totalPurchased - totalSales
            const minStock = Number(p.minStockLevel) || 200
            return flowInventory < minStock
        })

        const autoItems = lowStockItems.map((p: any) => {
            const unitParts = p.unit ? String(p.unit).trim().split(/\s+/) : []
            const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
            const flowInventory = (Number(p.totalPurchased) || 0) - (Number(p.totalSales) || 0)
            const actualInventory = unitQuantity > 0 ? Math.floor(flowInventory / unitQuantity) : 0
            const minStock = Number(p.minStockLevel) || 200
            const requestedQuantity = Math.max(0, minStock - flowInventory)
            const purchasePricePerUnit = Number(p.purchasePricePerUnit || p.purchasePriceRupees || 0)
            return {
                productId: p.id,
                productName: p.name,
                currentStock: actualInventory,
                flowInventory: flowInventory,
                requestedQuantity: requestedQuantity,
                unit: p.unit || 'pcs',
                purchasePricePerUnit: purchasePricePerUnit,
                total: requestedQuantity * purchasePricePerUnit,
                source: 'Auto',
                autoAdded: true
            }
        })

        // Read the latest demand list via ref (avoids stale closure)
        const currentList = demandListRef.current
        const validProductIds = new Set(productsData.map((p: any) => p.id))

        // 1. Remove items whose products were deleted; skip validation if products returned empty
        const validatedList = productsData.length > 0
            ? currentList.filter((item: any) => validProductIds.has(item.productId))
            : currentList

        // 2. Fill in missing purchase prices from fresh product data
        const priceUpdatedList = validatedList.map((item: any) => {
            if (!item.purchasePricePerUnit || item.purchasePricePerUnit === 0) {
                const product = productsData.find((p: any) => p.id === item.productId)
                if (product) {
                    const price = Number(product.purchasePricePerUnit || product.purchasePriceRupees || 0)
                    return { ...item, purchasePricePerUnit: price, total: (item.requestedQuantity || 0) * price }
                }
            }
            return item
        })

        // 3. Merge new low-stock items (dedup by productId)
        const existingIds = new Set(priceUpdatedList.map((item: any) => item.productId))
        const newItems = autoItems.filter((item: any) => !existingIds.has(item.productId))
        const mergedList = [...priceUpdatedList, ...newItems]

        setDemandList(mergedList)
        // Only add newly detected items to selection — preserve existing user unchecks
        if (newItems.length > 0) {
            setSelectedDemandIds((prev: Set<number>) => {
                const s = new Set(prev)
                newItems.forEach((item: any) => s.add(item.productId))
                return s
            })
        }
    }

    const handleRefresh = async () => {
        setIsRefreshing(true)
        setLoadingDemandList(true)
        try {
            // Only refresh products to update demand list
            await fetchProducts()
            showSuccess('Demand list refreshed successfully')
        } catch (error) {
            showError('Failed to refresh demand list')
        } finally {
            setIsRefreshing(false)
            setLoadingDemandList(false)
        }
    }

    const addManualItem = () => {
        setIsAddItemsModalOpen(true)
    }

    const handleAddItemsFromModal = (items: any[]) => {
        // Merge with existing demand list, avoiding duplicates
        const existingIds = new Set(demandList.map(item => item.productId))
        const newItems = items.filter(item => !existingIds.has(item.productId))
        const merged = [...demandList, ...newItems]
        setDemandList(merged)
        // Only add newly added items to selection (preserves existing unchecked items)
        setSelectedDemandIds(prev => {
            const s = new Set(prev)
            newItems.forEach(item => s.add(item.productId))
            return s
        })
        showSuccess(`Added ${newItems.length} items to demand list`)
    }

    const removeItem = (index: number) => {
        setDemandList(demandList.filter((_, i) => i !== index))
    }

    const updateItem = (index: number, field: string, value: any) => {
        const newList = [...demandList]
        newList[index] = { ...newList[index], [field]: value }
        
        // Recalculate total when quantity changes
        if (field === 'requestedQuantity') {
            const purchasePrice = Number(newList[index].purchasePricePerUnit || 0)
            newList[index].total = Number(value) * purchasePrice
        }
        
        // Auto-fill product details when product is selected
        if (field === 'productId' && value) {
            const product = products.find(p => p.id === Number(value))
            if (product) {
                // Calculate flow inventory and actual inventory
                const unitParts = product.unit ? String(product.unit).trim().split(/\s+/) : []
                const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                const flowInventory = (Number(product.totalPurchased) || 0) - (Number(product.totalSales) || 0)
                const actualInventory = unitQuantity > 0 ? Math.floor(flowInventory / unitQuantity) : 0
                const threshold = Number(product.minStockLevel) || 200
                
                // Get purchase price per unit
                const purchasePricePerUnit = Number(product.purchasePricePerUnit || product.purchasePriceRupees || 0)
                
                newList[index].productName = product.name
                newList[index].currentStock = actualInventory
                newList[index].flowInventory = flowInventory
                newList[index].unit = product.unit || 'pcs'
                newList[index].purchasePricePerUnit = purchasePricePerUnit
                newList[index].source = 'Manual'
                // Default requested quantity for manual items is threshold
                if (!newList[index].requestedQuantity) {
                    newList[index].requestedQuantity = threshold
                }
                // Calculate total
                newList[index].total = newList[index].requestedQuantity * purchasePricePerUnit
            }
        }
        
        setDemandList(newList)
    }

    const openSupplierModal = () => {
        if (selectedDemandIds.size === 0) {
            showError('Please select items to send')
            return
        }
        
        // Check if selected items have quantity
        const selectedItems = demandList.filter(item => selectedDemandIds.has(item.productId))
        const invalidItems = selectedItems.filter(item => !item.productId || !item.requestedQuantity || item.requestedQuantity <= 0)
        if (invalidItems.length > 0) {
            showError('Please fill in all item details and quantities')
            return
        }
        
        const initialNotes: Record<number, string> = {}
        selectedItems.forEach(item => {
            initialNotes[item.productId] = productNotes[item.productId] || ''
        })

        setProductNotes(initialNotes)
        setSupplierModalStep(1)
        setShowSupplierModal(true)
        document.body.style.overflow = 'hidden'
        setSupplierModalAnimating(false)
        setTimeout(() => setSupplierModalAnimating(true), 10)
    }

    const closeSupplierModal = () => {
        setSupplierModalAnimating(false)
        document.body.style.overflow = 'unset'
        setTimeout(() => {
            setShowSupplierModal(false)
            setSelectedSupplier('')
            setSupplierModalStep(1)
            setProductNotes({})
        }, 200)
    }

    const updateProductNote = (productId: number, value: string) => {
        setProductNotes(prev => ({
            ...prev,
            [productId]: value
        }))
    }

    const sendDemand = async () => {
        if (!selectedSupplier) {
            showError('Please select a supplier')
            return
        }

        setSendingEmail(true)
        try {
            // 1. Create purchase order
            const payload = {
                supplierId: Number(selectedSupplier),
                orderDate: new Date().toISOString().split('T')[0],
                expectedDate: null,
                status: purchaseOrderDefaults.status ?? 'pending',
                discount: 0,
                shippingCost: 0,
                notes: 'Demand request generated from low stock alert',
                items: demandList.filter(item => selectedDemandIds.has(item.productId)).map(item => ({
                    productId: Number(item.productId),
                    quantity: Number(item.requestedQuantity),
                    unitPrice: Number(item.purchasePricePerUnit || 0),
                    taxRate: 0,
                    discount: 0
                }))
            }

            const poResponse = await fetch('/api/purchase-orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!poResponse.ok) {
                throw new Error('Failed to create purchase order')
            }

            const newPO = await poResponse.json()

            // 2. Send email to supplier
            const supplier = suppliers.find(s => s.id === Number(selectedSupplier))
            
            if (supplier?.email) {
                const emailResponse = await fetch('/api/purchase-orders/send-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        purchaseOrderId: newPO.id,
                        productNotes: Object.fromEntries(
                            Object.entries(productNotes)
                                .map(([productId, note]) => [productId, String(note || '').trim()])
                                .filter(([, note]) => note.length > 0)
                        )
                    })
                })

                const emailResult = await emailResponse.json()

                if (emailResponse.ok) {
                    showSuccess(`Demand sent successfully to ${supplier.name}! Email sent to ${supplier.email}`)
                } else {
                    showError(`Demand created but email failed: ${emailResult.error || 'Unknown error'}`)
                }
            } else {
                showInfo(`Demand created successfully! (No email - supplier has no email address)`)
            }

            // 3. Remove only the sent items from demand list (keep un-selected ones)
            const sentProductIds = new Set(
                demandList.filter(item => selectedDemandIds.has(item.productId)).map(item => item.productId)
            )
            const remainingItems = demandList.filter(item => !sentProductIds.has(item.productId))
            setDemandList(remainingItems)
            setSelectedDemandIds(new Set())
            // Persist to localStorage
            if (typeof window !== 'undefined') {
                if (remainingItems.length === 0) {
                    localStorage.removeItem('demandList')
                } else {
                    localStorage.setItem('demandList', JSON.stringify(remainingItems))
                }
            }
            await fetchSentDemands()
            closeSupplierModal()

        } catch (error) {
            showError('Failed to send demand: ' + error)
        } finally {
            setSendingEmail(false)
        }
    }

    const openReceivingModal = (po: any) => {
        setReceivingPO({
            ...po,
            items: po.items.map((item: any) => ({
                ...item,
                receivingQuantity: item.quantity - (item.receivedQuantity || 0)
            }))
        })
        setIsReceivingModalOpen(true)
        document.body.style.overflow = 'hidden'
        setReceivingModalAnimating(false)
        setTimeout(() => setReceivingModalAnimating(true), 10)
    }

    const handleBillDataExtracted = (extractedData: any[], billUrl?: string, unmatchedItems?: any[], availableProducts?: any[], priceUpdates?: any[]) => {
        if (!receivingPO) return
        
        // Store the matched items and billUrl temporarily
        setPendingMatchedItems(extractedData)
        setPendingBillUrl(billUrl || '')
        
        // Show price update notification if any prices were updated
        if (priceUpdates && priceUpdates.length > 0) {
            const updateMsg = priceUpdates.map((update: any) => 
                `${update.productName}: ${formatPrice(update.oldPricePerUnit || 0)} → ${formatPrice(update.newPricePerUnit)} per unit`
            ).join('\n')
            showSuccess(`Updated prices for ${priceUpdates.length} product(s):\n${updateMsg}`)
        }
        
        // If there are unmatched items, show the modal
        if (unmatchedItems && unmatchedItems.length > 0) {
            setUnmatchedItems(unmatchedItems)
            setAvailableProducts(availableProducts || [])
            setIsUnmatchedItemsModalOpen(true)
        } else {
            // No unmatched items, proceed with matched items
            applyMatchedItems(extractedData, billUrl)
        }
    }

    const applyMatchedItems = (extractedData: any[], billUrl?: string) => {
        if (!receivingPO) return
        
        // Map extracted data to receiving quantities and unit prices
        const updatedItems = receivingPO.items.map((item: any) => {
            const extracted = extractedData.find((e: any) => 
                e.productId === item.productId || 
                e.productName?.toLowerCase() === item.product?.name?.toLowerCase()
            )
            
            if (extracted) {
                return { 
                    ...item, 
                    receivingQuantity: extracted.quantity || item.receivingQuantity,
                    unitPrice: extracted.unitPrice || item.unitPrice
                }
            }
            return item
        })
        
        setReceivingPO({ ...receivingPO, items: updatedItems, billUrl: billUrl || receivingPO.billUrl })
        showSuccess('Bill data extracted and prices filled successfully!')
    }

    const handleUnmatchedItemsComplete = async (mappings: any[]) => {
        // Combine pending matched items with newly mapped items
        const allItems = [...pendingMatchedItems, ...mappings]
        
        // Check if this is for receiving goods or direct upload
        if (receivingPO) {
            // Receiving goods flow
            applyMatchedItems(allItems, pendingBillUrl || receivingPO?.billUrl)
        } else if (isDirectBillUploadModalOpen || pendingMatchedItems.length > 0) {
            // Direct bill upload flow - continue with the upload process
            try {
                const sortedDemands = [...sentDemands].sort((a, b) => b.id - a.id)
                const lastUsedSupplierId = sortedDemands[0]?.supplierId || (suppliers[0]?.id || 0)
                
                if (!lastUsedSupplierId) {
                    showError('No supplier found. Please create a supplier first.')
                    return
                }
                
                const items = allItems.map((item: any) => ({
                    productId: item.productId,
                    quantity: item.quantity || 0,
                    receivedQuantity: item.quantity || 0,
                    unitPrice: item.unitPrice || 0
                }))
                
                if (items.length === 0) {
                    showError('No items to process.')
                    return
                }
                
                const today = new Date().toISOString().split('T')[0]
                
                const newPO = {
                    supplierId: lastUsedSupplierId,
                    status: 'received',
                    demandDate: today,
                    receivedDate: today,
                    billUrl: pendingBillUrl || '',
                    items: items
                }
                
                const res = await fetch('/api/purchase-orders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newPO)
                })
                
                if (!res.ok) throw new Error('Failed to create purchase order')
                
                showSuccess('Purchase order created successfully!')
                setIsDirectBillUploadModalOpen(false)
                
                const updatedRes = await fetch('/api/purchase-orders')
                if (updatedRes.ok) {
                    const data = await updatedRes.json()
                    setSentDemands(data)
                }
                
                setActiveTab('received')
            } catch (error) {
                showError('Failed to create purchase order')
            }
        }
        
        setIsUnmatchedItemsModalOpen(false)
        setUnmatchedItems([])
        setPendingMatchedItems([])
        setPendingBillUrl('')
    }
    
    const toggleEditMode = (poId: number) => {
        const newEditing = new Set(editingPOIds)
        if (newEditing.has(poId)) {
            newEditing.delete(poId)
            // Remove edited data
            const newData = { ...editedPOData }
            delete newData[poId]
            setEditedPOData(newData)
        } else {
            newEditing.add(poId)
            // Initialize edited data with current PO data
            const po = sentDemands.find(p => p.id === poId)
            if (po) {
                setEditedPOData({
                    ...editedPOData,
                    [poId]: {
                        supplierName: po.supplier?.name || '',
                        orderDate: po.orderDate || '',
                        receivedDate: po.receivedDate || '',
                        status: po.status || 'pending',
                        items: po.items || []
                    }
                })
            }
        }
        setEditingPOIds(newEditing)
    }
    
    const handleDirectBillAttachment = async (poId: number, file: File) => {
        try {
            setUploadingBillForPO(poId)
            const formData = new FormData()
            formData.append('file', file)
            
            const response = await fetch('/api/upload-bill-only', {
                method: 'POST',
                body: formData
            })
            
            if (!response.ok) throw new Error('Failed to upload bill')
            
            const data = await response.json()
            
            // Update PO with bill URL
            const updateResponse = await fetch('/api/purchase-orders', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: poId,
                    billUrl: data.billUrl
                })
            })
            
            if (!updateResponse.ok) throw new Error('Failed to update PO')
            
            const updatedPO = await updateResponse.json()
            
            showSuccess('Bill uploaded successfully!')
            await fetchSentDemands()
        } catch (error) {
            showError('Failed to upload bill')
        } finally {
            setUploadingBillForPO(null)
        }
    }
    
    const saveEditedPO = async (poId: number) => {
        try {
            const editedData = editedPOData[poId]
            if (!editedData) return
            
            const response = await fetch('/api/purchase-orders', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: poId,
                    status: editedData.status,
                    receivedDate: editedData.receivedDate,
                    items: editedData.items.map((item: any) => ({
                        id: item.id,
                        productId: item.productId,
                        quantity: item.quantity,
                        receivedQuantity: item.receivedQuantity,
                        unitPrice: item.unitPrice
                    }))
                })
            })
            
            if (!response.ok) throw new Error('Failed to save changes')
            
            showSuccess('Changes saved successfully!')
            toggleEditMode(poId)
            await fetchSentDemands()
        } catch (error) {
            showError('Failed to save changes')
        }
    }
    
    const restorePO = async (poId: number) => {
        try {
            setRestoringPOId(poId)
            const response = await fetch('/api/purchase-orders', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: poId,
                    status: purchaseOrderDefaults.status ?? 'pending'
                })
            })
            
            if (!response.ok) throw new Error('Failed to restore purchase order')
            
            showSuccess('Purchase order restored successfully!')
            await fetchSentDemands()
        } catch (error) {
            showError('Failed to restore purchase order')
        } finally {
            setRestoringPOId(null)
        }
    }
    
    const removeBillAttachment = async (poId: number) => {
        try {
            const response = await fetch('/api/purchase-orders', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: poId,
                    billUrl: null
                })
            })
            
            if (!response.ok) throw new Error('Failed to remove bill')
            
            showSuccess('Bill removed successfully!')
            await fetchSentDemands()
        } catch (error) {
            showError('Failed to remove bill')
        }
    }
    
    const handleDirectBillUpload = async (extractedData: any[], billUrl?: string, unmatchedItems?: any[], availableProducts?: any[], priceUpdates?: any[]) => {
        
        // Show price update notification if any prices were updated
        if (priceUpdates && priceUpdates.length > 0) {
            const updateMsg = priceUpdates.map((update: any) => 
                `${update.productName}: ${formatPrice(update.oldPricePerUnit || 0)} → ${formatPrice(update.newPricePerUnit)} per unit`
            ).join('\n')
            showSuccess(`Updated prices for ${priceUpdates.length} product(s):\n${updateMsg}`)
        }
        
        // If there are unmatched items, show modal first
        if (unmatchedItems && unmatchedItems.length > 0) {
            setPendingMatchedItems(extractedData)
            setPendingBillUrl(billUrl || '')
            setUnmatchedItems(unmatchedItems)
            setAvailableProducts(availableProducts || [])
            setIsUnmatchedItemsModalOpen(true)
            // The rest will be handled by handleUnmatchedItemsComplete
            return
        }
        
        try {
            // First, try to match with pending orders
            const pendingOrders = sentDemands.filter(po => po.status === 'pending')
            let matchedPO = null
            let bestMatchScore = 0
            
            for (const po of pendingOrders) {
                let matchScore = 0
                const poProductIds = new Set(po.items.map((item: any) => item.productId))
                
                for (const billItem of extractedData) {
                    if (poProductIds.has(billItem.productId)) {
                        matchScore++
                    }
                }
                
                if (matchScore > bestMatchScore && matchScore >= extractedData.length * 0.5) {
                    bestMatchScore = matchScore
                    matchedPO = po
                }
            }
            
            // If found a matching PO, open the receive goods modal
            if (matchedPO) {
                const updatedItems = matchedPO.items.map((item: any) => {
                    const extracted = extractedData.find((e: any) => e.productId === item.productId)
                    return {
                        ...item,
                        receivingQuantity: extracted?.quantity || 0
                    }
                })
                
                setReceivingPO({
                    ...matchedPO,
                    items: updatedItems,
                    billUrl: billUrl || matchedPO.billUrl
                })
                
                setReceivingModalAnimating(false)
                setTimeout(() => {
                    setIsReceivingModalOpen(true)
                    setReceivingModalAnimating(true)
                }, 10)
                
                showInfo(`Matched bill with ${matchedPO.poNumber}. Review and confirm receipt.`)
                return
            }
            
            // No matching PO found, create new received order
            const sortedDemands = [...sentDemands].sort((a, b) => b.id - a.id)
            const lastUsedSupplierId = sortedDemands[0]?.supplierId || (suppliers[0]?.id || 0)
            
            if (!lastUsedSupplierId) {
                showError('No supplier found. Please create a supplier first.')
                return
            }
            
            // Create items array with receivedQuantity = quantity
            const items = extractedData.map((item: any) => ({
                productId: item.productId,
                quantity: item.quantity || 0,
                receivedQuantity: item.quantity || 0,
                unitPrice: item.unitPrice || 0
            }))
            
            if (items.length === 0) {
                showError('No items extracted from bill. Please try again.')
                return
            }
            
            const today = new Date().toISOString().split('T')[0]
            
            // Create new purchase order
            const newPO = {
                supplierId: lastUsedSupplierId,
                status: 'received',
                demandDate: today,
                receivedDate: today,
                billUrl: billUrl || '',
                items: items
            }
            
            const res = await fetch('/api/purchase-orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newPO)
            })
            
            if (!res.ok) throw new Error('Failed to create purchase order')
            
            showSuccess('Purchase order created successfully from uploaded bill!')
            setIsDirectBillUploadModalOpen(false)
            
            // Refresh the purchase orders list
            const updatedRes = await fetch('/api/purchase-orders')
            if (updatedRes.ok) {
                const data = await updatedRes.json()
                setSentDemands(data)
            }
            
            // Switch to received tab to show the newly created PO
            setActiveTab('received')
            
        } catch (error) {
            showError('Failed to process bill upload')
        }
    }

    const closeReceivingModal = () => {
        setReceivingModalAnimating(false)
        document.body.style.overflow = 'unset'
        setTimeout(() => {
            setIsReceivingModalOpen(false)
            setReceivingPO(null)
        }, 200)
    }

    const handleReceiveGoods = async (e: any) => {
        e.preventDefault()
        
        if (!receivingPO) {
            showError('No purchase order selected')
            return
        }
        
        setReceiving(true)
        try {
            const items = receivingPO.items.map((item: any) => ({
                id: item.id,
                productId: item.productId,
                receivedQuantity: Number(item.receivingQuantity) || 0,
                unitPrice: item.unitPrice
            }))

            // Check if there are any items with partial receiving
            const remainingItems = receivingPO.items.filter((item: any) => {
                const ordered = Number(item.quantity)
                const previouslyReceived = Number(item.receivedQuantity) || 0
                const receivingNow = Number(item.receivingQuantity) || 0
                const totalReceived = previouslyReceived + receivingNow
                return totalReceived < ordered
            }).map((item: any) => ({
                ...item,
                remainingQty: item.quantity - ((Number(item.receivedQuantity) || 0) + (Number(item.receivingQuantity) || 0))
            }))


            const response = await fetch('/api/purchase-orders', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: receivingPO.id,
                    status: 'received', // Mark as received
                    receivedDate: new Date().toISOString().split('T')[0],
                    billUrl: receivingPO.billUrl || null,
                    items
                })
            })

            
            if (response.ok) {
                const updatedPO = await response.json()
                
                // If there are remaining items, create a NEW purchase order for them
                if (remainingItems.length > 0) {
                    try {
                        const today = new Date().toISOString().split('T')[0]
                        
                        // Create new PO with remaining items
                        const newPOResponse = await fetch('/api/purchase-orders', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                supplierId: receivingPO.supplierId,
                                status: purchaseOrderDefaults.status ?? 'pending',
                                demandDate: today,
                                items: remainingItems.map((item: any) => ({
                                    productId: item.productId,
                                    quantity: item.remainingQty,
                                    receivedQuantity: 0,
                                    unitPrice: item.unitPrice
                                }))
                            })
                        })
                        
                        if (newPOResponse.ok) {
                            const newPO = await newPOResponse.json()
                            
                            // Send email to supplier about remaining items
                            const emailResponse = await fetch('/api/purchase-orders/send-remaining-email', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    purchaseOrderId: newPO.id,
                                    remainingItems: remainingItems.map((item: any) => ({
                                        productName: item.product?.name,
                                        ordered: item.remainingQty,
                                        received: 0,
                                        remaining: item.remainingQty
                                    }))
                                })
                            })
                            
                            if (emailResponse.ok) {
                                showSuccess(`Goods received! New PO ${newPO.poNumber} created for ${remainingItems.length} remaining items. Email sent to supplier.`)
                            } else {
                                showInfo(`Goods received! New PO ${newPO.poNumber} created for remaining items. Failed to send email.`)
                            }
                        } else {
                            showInfo('Goods received! Failed to create new PO for remaining items.')
                        }
                    } catch (error) {
                        showInfo('Goods received! Failed to create new PO for remaining items.')
                    }
                } else {
                    showSuccess('All goods received successfully!')
                }
                
                // Clear demand list after successful receipt
                setDemandList([])
                if (typeof window !== 'undefined') {
                    localStorage.removeItem('demandList')
                }
                
                await fetchSentDemands()
                closeReceivingModal()
                
                // Show success modal
                setReceivedPODetails(updatedPO)
                setShowSuccessModal(true)
                document.body.style.overflow = 'hidden'
                setSuccessModalAnimating(false)
                setTimeout(() => setSuccessModalAnimating(true), 10)
            } else {
                const error = await response.json()
                showError('Failed: ' + (error.error || 'Unknown error'))
            }
        } catch (error) {
            showError('Failed to receive goods: ' + error)
        } finally {
            setReceiving(false)
        }
    }

    const closeSuccessModal = () => {
        setSuccessModalAnimating(false)
        document.body.style.overflow = 'unset'
        setTimeout(() => {
            setShowSuccessModal(false)
            setReceivedPODetails(null)
        }, 300)
    }

    // Get stock status for display
    const getStockStatus = (qty: number) => {
        if (qty <= 0) return { label: 'OUT', color: 'text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30' }
        if (qty <= 10) return { label: 'LOW', color: 'text-yellow-600 bg-yellow-100 dark:text-yellow-400 dark:bg-yellow-900/30' }
        return { label: 'OK', color: 'text-sky-600 bg-sky-100 dark:text-sky-400 dark:bg-sky-900/30' }
    }

    // Bulk selection handlers
    function toggleSelectPO(id: number) {
        const newSelected = new Set(selectedPOIds)
        if (newSelected.has(id)) {
            newSelected.delete(id)
        } else {
            newSelected.add(id)
        }
        setSelectedPOIds(newSelected)
    }

    function toggleSelectAll() {
        const filteredPOs = getFilteredAndSortedDemands()
        
        if (selectedPOIds.size === filteredPOs.length) {
            // Deselect all
            setSelectedPOIds(new Set())
        } else {
            // Select all filtered POs
            setSelectedPOIds(new Set(filteredPOs.map(d => d.id)))
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

    // Demand list selection functions (use productId as stable key, not array index)
    function toggleSelectDemand(productId: number) {
        const newSelected = new Set(selectedDemandIds)
        if (newSelected.has(productId)) {
            newSelected.delete(productId)
        } else {
            newSelected.add(productId)
        }
        setSelectedDemandIds(newSelected)
    }

    function toggleSelectAllDemands() {
        if (selectedDemandIds.size === demandList.length) {
            // Deselect all
            setSelectedDemandIds(new Set())
        } else {
            // Select all
            setSelectedDemandIds(new Set(demandList.map(item => item.productId)))
        }
    }

    function removeSelectedDemands() {
        const newDemandList = demandList.filter(item => !selectedDemandIds.has(item.productId))
        setDemandList(newDemandList)
        // Keep remaining items selected
        setSelectedDemandIds(new Set(newDemandList.map(item => item.productId)))
    }

    function getFilteredAndSortedDemands() {
        // Filter
        let filtered = sentDemands.filter(demand => {
            const matchesTab = activeTab === 'pending' ?
                demand.status === 'pending' :
                activeTab === 'received' ?
                demand.status === 'received' :
                demand.status === 'deleted'
            
            const matchesSearch = searchQuery ?
                demand.poNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                demand.supplier?.name?.toLowerCase().includes(searchQuery.toLowerCase())
                : true
            
            const matchesSupplier = filterSupplier ?
                demand.supplierId === Number(filterSupplier)
                : true
            
            return matchesTab && matchesSearch && matchesSupplier
        })

        // Sort
        filtered.sort((a, b) => {
            let compareResult = 0
            
            if (sortField === 'createdAt') {
                const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0
                const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0
                compareResult = dateA - dateB
            } else if (sortField === 'poNumber') {
                compareResult = (a.poNumber || '').localeCompare(b.poNumber || '')
            } else if (sortField === 'supplier') {
                compareResult = (a.supplier?.name || '').localeCompare(b.supplier?.name || '')
            } else if (sortField === 'status') {
                compareResult = (a.status || '').localeCompare(b.status || '')
            }
            
            return sortOrder === 'asc' ? compareResult : -compareResult
        })

        return filtered
    }

    // Delete functions
    async function deleteDemand(id: number, isPermanent: boolean = false) {
        const demand = sentDemands.find(d => d.id === id)
        const message = isPermanent || demand?.status === 'deleted' 
            ? 'Are you sure you want to PERMANENTLY delete this purchase order? This cannot be undone.' 
            : 'Are you sure you want to move this purchase order to deleted?'
        setConfirmStep(1)
        setConfirmModal({ open: true, id, message })
        document.body.style.overflow = 'hidden'
        setTimeout(() => setConfirmModalAnimating(true), 10)
    }

    function openBulkDeleteConfirm() {
        setConfirmStep(1)
        setConfirmModal({
            open: true,
            deleteMultiple: true,
            message: `Are you sure you want to delete ${selectedPOIds.size} selected purchase order(s)?`
        })
        document.body.style.overflow = 'hidden'
        setTimeout(() => setConfirmModalAnimating(true), 10)
    }

    function closeConfirmModal() {
        setConfirmModalAnimating(false)
        document.body.style.overflow = 'unset'
        setTimeout(() => {
            setConfirmModal({ open: false })
            setConfirmStep(1)
        }, 300)
    }

    async function handleConfirmDelete(id?: number, isPermanent: boolean = false) {
        if (!id && !confirmModal.deleteMultiple) {
            closeConfirmModal()
            return
        }
        
        closeConfirmModal()
        setDeleting(true)
        if (id) setDeletingPOId(id)
        
        try {
            if (confirmModal.deleteMultiple) {
                // Delete multiple POs with progress tracking
                const idsArray = Array.from(selectedPOIds)
                const total = idsArray.length
                setDeleteProgress({ current: 0, total })
                
                // Delete in chunks for better progress tracking
                const CHUNK_SIZE = 10
                let completed = 0
                
                for (let i = 0; i < idsArray.length; i += CHUNK_SIZE) {
                    const chunk = idsArray.slice(i, i + CHUNK_SIZE)
                    const deletePromises = chunk.map(poId => {
                        const demand = sentDemands.find(d => d.id === poId)
                        if (isPermanent || demand?.status === 'deleted') {
                            return fetch(`/api/purchase-orders?id=${poId}`, { method: 'DELETE' })
                        } else {
                            return fetch('/api/purchase-orders', {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: poId, status: 'deleted' })
                            })
                        }
                    })
                    await Promise.all(deletePromises)
                    
                    completed += chunk.length
                    setDeleteProgress({ current: completed, total })
                }
                
                await fetchSentDemands()
                setSelectedPOIds(new Set())
                showSuccess(`Successfully ${isPermanent ? 'permanently deleted' : 'moved to deleted'} ${completed} purchase order(s)`)
                setDeleteProgress({ current: 0, total: 0 })
            } else {
                // Single delete
                const demand = sentDemands.find(d => d.id === id)
                if (isPermanent || demand?.status === 'deleted') {
                    // Permanent delete
                    const res = await fetch(`/api/purchase-orders?id=${id}`, { method: 'DELETE' })
                    if (!res.ok) throw new Error('Delete failed')
                    showSuccess('Purchase order permanently deleted')
                } else {
                    // Soft delete - move to deleted tab
                    const res = await fetch('/api/purchase-orders', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id, status: 'deleted' })
                    })
                    if (!res.ok) throw new Error('Update failed')
                    showSuccess('Purchase order moved to deleted')
                }
                await fetchSentDemands()
            }
        } catch (error: any) {
            showError(error.message || 'Failed to delete purchase order(s)')
        } finally {
            setDeleting(false)
            setDeletingPOId(null)
        }
    }

    // Export functions
    function exportData(format: 'csv' | 'json' | 'xlsx') {
        if (isBasicSubscription) {
            showInfo('Export is available in Standard plan.')
            router.push('/upgrade')
            return
        }

        const dataToExport = selectedPOIds.size > 0
            ? sentDemands.filter(d => selectedPOIds.has(d.id))
            : getFilteredAndSortedDemands()

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
        const headers = ['PO Number', 'Supplier', 'Order Date', 'Items Count', 'Total Amount', 'Status']
        const rows = data.map(d => [
            d.poNumber || '',
            d.supplier?.name || '',
            d.orderDate ? new Date(d.orderDate).toLocaleDateString() : '',
            d.items?.length || 0,
            d.totalAmount?.toFixed(2) || '0.00',
            d.status || ''
        ])

        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n')

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `purchase-orders_${new Date().toISOString().split('T')[0]}.csv`
        link.click()
        
        showSuccess(`Exported ${data.length} purchase order(s) to CSV`)
    }

    const exportToJSON = (data: any[]) => {
        const jsonData = JSON.stringify(data, null, 2)
        const blob = new Blob([jsonData], { type: 'application/json' })
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `purchase-orders_${new Date().toISOString().split('T')[0]}.json`
        link.click()
        
        showSuccess(`Exported ${data.length} purchase order(s) to JSON`)
    }

    const exportToExcel = (data: any[]) => {
        const worksheet = XLSX.utils.json_to_sheet(data.map(d => ({
            'PO Number': d.poNumber || '',
            'Supplier': d.supplier?.name || '',
            'Order Date': d.orderDate ? new Date(d.orderDate).toLocaleDateString() : '',
            'Items Count': d.items?.length || 0,
            'Total Amount': d.totalAmount || 0,
            'Status': d.status || ''
        })))
        
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Purchase Orders')
        XLSX.writeFile(workbook, `purchase-orders_${new Date().toISOString().split('T')[0]}.xlsx`)
        
        showSuccess(`Exported ${data.length} purchase order(s) to Excel`)
    }

    const filteredDemands = getFilteredAndSortedDemands()

    return (
        <>
            <div className="max-w-7xl mx-auto space-y-6">
                {/* Page Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                            Purchase Demands
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">Build demand list and send to suppliers</p>
                    </div>
                    {user && (
                        <div className="flex gap-2">
                            <div className="relative">
                                <button 
                                    onClick={() => setShowExportDropdown(!showExportDropdown)}
                                    className="btn relative bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white transition-all duration-200 flex items-center gap-2 shadow-lg shadow-sky-200 dark:shadow-sky-900/50 px-2 sm:px-4"
                                    title={selectedPOIds.size > 0 ? `Export ${selectedPOIds.size} selected` : 'Export All'}
                                    aria-label={selectedPOIds.size > 0 ? `Export ${selectedPOIds.size} selected` : 'Export All'}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                    </svg>
                                    <span className="font-semibold hidden sm:inline">{selectedPOIds.size > 0 ? `Export (${selectedPOIds.size})` : 'Export All'}</span>
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
                                onClick={() => setIsImportModalOpen(true)} 
                                className="btn bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 text-white shadow-lg shadow-sky-200 dark:shadow-sky-900/50 transition-all duration-200 flex items-center gap-2 px-2 sm:px-4"
                                title="Import purchase orders"
                                aria-label="Import purchase orders"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                <span className="font-semibold hidden sm:inline">Import</span>
                            </button>
                        </div>
                    )}
                </div>

                {/* Main Grid: Demand List and Purchase Orders Side by Side */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Demand List Builder */}
                    <div className="relative rounded-xl border border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-br from-white via-blue-50 to-sky-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 shadow-lg shadow-blue-500/10 p-6 flex flex-col h-[450px]">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                        <div className="relative flex justify-between items-center mb-4">
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                {demandList.length > 0 && (
                                    <label className="relative group/checkbox cursor-pointer flex-shrink-0">
                                        <input
                                            type="checkbox"
                                            checked={demandList.length > 0 && selectedDemandIds.size === demandList.length}
                                            onChange={toggleSelectAllDemands}
                                            className="peer sr-only"
                                        />
                                        <div className="w-5 h-5 border-2 border-blue-400 dark:border-blue-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-blue-500 peer-checked:to-sky-600 peer-checked:border-blue-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-blue-500/50 group-hover/checkbox:border-blue-500 group-hover/checkbox:scale-110">
                                            <svg className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                        <div className="absolute inset-0 rounded-md bg-blue-400 opacity-0 peer-checked:opacity-20 blur-md transition-opacity duration-200 pointer-events-none"></div>
                                    </label>
                                )}
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                                    Current Demand List ({demandList.length})
                                    {selectedDemandIds.size > 0 && <span className="px-1.5 py-0.5 ml-2 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 rounded-full text-xs font-bold">({selectedDemandIds.size})</span>}
                                </span>
                            </h2>
                            <div className="flex gap-1.5">
                                <button
                                    onClick={handleRefresh}
                                    disabled={isRefreshing}
                                    className="px-2 py-1.5 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-lg text-sm font-medium transition-all shadow-md hover:shadow-lg flex items-center gap-1.5"
                                    title="Refresh data"
                                    aria-label="Refresh data"
                                >
                                    <svg 
                                        className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} 
                                        fill="none" 
                                        stroke="currentColor" 
                                        viewBox="0 0 24 24"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                </button>
                                <button
                                    onClick={addManualItem}
                                    className="px-2 py-1.5 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-lg text-sm font-medium transition-all shadow-md hover:shadow-lg flex items-center gap-1.5"
                                    title="Add item to demand list"
                                    aria-label="Add item to demand list"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                    </svg>
                                    <span>Add</span>
                                </button>
                                <button
                                    onClick={openSupplierModal}
                                    disabled={selectedDemandIds.size === 0}
                                    className="px-2 py-1.5 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-lg text-sm font-medium transition-all shadow-md hover:shadow-lg flex items-center gap-1.5"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                    <span>Send ({selectedDemandIds.size})</span>
                                </button>
                            </div>
                        </div>

                        {loadingDemandList ? (
                            <div className="flex flex-col items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                                <p className="text-gray-500 dark:text-gray-400">Loading demand list...</p>
                            </div>
                        ) : demandList.length === 0 ? (
                            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                                <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                                </svg>
                                <p className="text-lg font-medium">No items in demand list</p>
                                <p className="text-sm mt-2">Add items manually or they will be auto-added from low stock products</p>
                            </div>
                        ) : (
                            <div className="relative overflow-hidden flex-1 min-h-0">
                                <ThemedScrollArea shellClassName="h-full min-h-0" className="space-y-2 h-full pr-1">
                                {demandList.map((item, index) => {
                                    const stockStatus = getStockStatus(item.currentStock)
                                    const isExpanded = expandedRows.has(index)
                                    const isSelected = selectedDemandIds.has(item.productId)
                                    
                                    return (
                                        <div key={index} className="relative group">
                                            {/* Main Row */}
                                            <div className={`relative rounded-lg border border-blue-200/40 dark:border-blue-700/40 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm transition-all hover:shadow-md ${
                                                item.currentStock === 0 ? 'border-l-4 border-l-red-500' :
                                                item.currentStock < 50 ? 'border-l-4 border-l-orange-500' :
                                                'border-l-4 border-l-blue-500'
                                            }`}>
                                                <div className="p-3 flex items-center gap-3">
                                                    {/* Checkbox */}
                                                    <label className="relative group/checkbox cursor-pointer flex-shrink-0">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => toggleSelectDemand(item.productId)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="peer sr-only"
                                                        />
                                                        <div className="w-5 h-5 border-2 border-purple-400 dark:border-purple-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-purple-500 peer-checked:to-purple-600 peer-checked:border-purple-500 transition-all duration-200 flex items-center justify-center shadow-sm">
                                                            <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        </div>
                                                    </label>

                                                    {/* Status Dot */}
                                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                                        item.currentStock === 0 ? 'bg-red-500 shadow-lg shadow-red-500/50' :
                                                        item.currentStock < 50 ? 'bg-orange-500 shadow-lg shadow-orange-500/50' :
                                                        'bg-blue-500 shadow-lg shadow-blue-500/50'
                                                    }`}></div>

                                                    {/* Product Name */}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-medium text-gray-900 dark:text-white truncate">{item.productName || 'Select Product'}</div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400">Stock: {formatQuantity(item.currentStock)} ({formatQuantity(item.flowInventory || 0)})</div>
                                                    </div>

                                                    {/* Requested Qty (Editable in collapsed view) */}
                                                    {!isExpanded && (
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-xs text-gray-500 dark:text-gray-400">Qty:</span>
                                                            <span className="font-medium text-gray-900 dark:text-white">{item.requestedQuantity}</span>
                                                        </div>
                                                    )}

                                                    {/* Actions */}
                                                    <div className="flex items-center gap-1">
                                                        {/* Edit Button */}
                                                        <button
                                                            onClick={() => {
                                                                const newExpanded = new Set(expandedRows)
                                                                if (isExpanded) {
                                                                    newExpanded.delete(index)
                                                                } else {
                                                                    newExpanded.add(index)
                                                                }
                                                                setExpandedRows(newExpanded)
                                                            }}
                                                            className="p-1.5 bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 text-purple-600 dark:text-purple-400 rounded transition-colors"
                                                            title="Edit"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                            </svg>
                                                        </button>

                                                        {/* Expand/Collapse Button */}
                                                        <button
                                                            onClick={() => {
                                                                const newExpanded = new Set(expandedRows)
                                                                if (isExpanded) {
                                                                    newExpanded.delete(index)
                                                                } else {
                                                                    newExpanded.add(index)
                                                                }
                                                                setExpandedRows(newExpanded)
                                                            }}
                                                            className="p-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 rounded transition-colors"
                                                            title={isExpanded ? "Collapse" : "Expand"}
                                                        >
                                                            <svg className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                        </button>

                                                        {/* Delete Button */}
                                                        <button
                                                            onClick={() => removeItem(index)}
                                                            className="p-1.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded transition-colors"
                                                            title="Delete"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Expanded Details */}
                                                {isExpanded && (
                                                    <div className="px-3 pb-3 pt-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                                                        <div className="grid grid-cols-2 gap-3 text-sm">
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Requested Qty</label>
                                                                <input
                                                                    type="number"
                                                                    value={item.requestedQuantity}
                                                                    onChange={(e) => updateItem(index, 'requestedQuantity', e.target.value)}
                                                                    className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                                                    min="1"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Unit</label>
                                                                <div className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300">
                                                                    {item.unit || 'N/A'}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Purchase Price/Unit</label>
                                                                <div className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300">
                                                                    ₹{(item.purchasePricePerUnit || 0).toFixed(2)}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Total</label>
                                                                <div className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-lg text-blue-700 dark:text-blue-400 font-semibold">
                                                                    ₹{((item.requestedQuantity || 0) * (item.purchasePricePerUnit || 0)).toFixed(2)}
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Source</label>
                                                                <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                                                    item.source === 'Out of Stock' || item.source === 'Low Stock' 
                                                                        ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' 
                                                                        : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                                                }`}>
                                                                    {item.source || 'Manual'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </ThemedScrollArea>
                        </div>
                        )}


                    </div>

                    {/* Purchase Order Records */}
                    <div className="relative rounded-xl border border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-br from-white via-blue-50 to-sky-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 shadow-lg shadow-blue-500/10 p-4 sm:p-6 flex flex-col h-[450px]">
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                        <div className="relative flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 mb-4">
                            <h2 className="text-lg sm:text-xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                                <span className="hidden sm:inline">Purchase Order Records</span>
                                <span className="sm:hidden">PO Records</span>
                                {selectedPOIds.size > 0 && <span className="px-2 py-0.5 ml-2 bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-400 rounded-full text-xs font-bold">({selectedPOIds.size})</span>}
                            </h2>
                        </div>
                    
                        {/* Tabs and Upload Bill Button */}
                        <div className="relative flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 mb-4">
                            <div className="flex gap-1 sm:gap-2 border-b border-blue-200 dark:border-blue-700 overflow-x-auto">
                                <button
                                    onClick={() => setActiveTab('pending')}
                                    className={`px-2 sm:px-4 py-2 font-medium transition-all text-xs sm:text-sm whitespace-nowrap ${
                                        activeTab === 'pending'
                                            ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                                            : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'
                                    }`}
                                >
                                    Pending
                                    <span className={`ml-1 sm:ml-2 px-1.5 sm:px-2 py-0.5 rounded text-xs ${
                                        activeTab === 'pending'
                                            ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                                    }`}>
                                        {sentDemands.filter(d => d.status === 'pending').length}
                                    </span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('received')}
                                    className={`px-2 sm:px-4 py-2 font-medium transition-all text-xs sm:text-sm whitespace-nowrap ${
                                        activeTab === 'received'
                                            ? 'text-sky-600 dark:text-sky-400 border-b-2 border-sky-600 dark:border-sky-400'
                                            : 'text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400'
                                    }`}
                                >
                                    Received
                                    <span className={`ml-1 sm:ml-2 px-1.5 sm:px-2 py-0.5 rounded text-xs ${
                                        activeTab === 'received'
                                            ? 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400'
                                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                                    }`}>
                                        {sentDemands.filter(d => d.status === 'received').length}
                                    </span>
                                </button>
                                <button
                                    onClick={() => setActiveTab('deleted')}
                                    className={`px-2 sm:px-4 py-2 font-medium transition-all text-xs sm:text-sm whitespace-nowrap ${
                                        activeTab === 'deleted'
                                            ? 'text-red-600 dark:text-red-400 border-b-2 border-red-600 dark:border-red-400'
                                            : 'text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400'
                                    }`}
                                >
                                    Deleted
                                    <span className={`ml-1 sm:ml-2 px-1.5 sm:px-2 py-0.5 rounded text-xs ${
                                        activeTab === 'deleted'
                                            ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                                            : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                                    }`}>
                                        {sentDemands.filter(d => d.status === 'deleted').length}
                                    </span>
                                </button>
                            </div>
                            <div className="flex items-center gap-2">
                                <RefreshButton onRefresh={fetchSentDemands} />
                                <button
                                    onClick={() => {
                                        if (isBasicSubscription) {
                                            showInfo('Upload Bill is available in Standard plan.')
                                            router.push('/upgrade')
                                            return
                                        }
                                        setIsDirectBillUploadModalOpen(true)
                                    }}
                                    className="relative px-2 sm:px-3 py-1.5 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-lg font-medium transition-all shadow-md text-xs sm:text-sm flex items-center gap-1 sm:gap-2"
                                >
                                    <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                    </svg>
                                    <span className="hidden sm:inline">Upload Bill</span>
                                    <span className="sm:hidden">Upload</span>
                                    {isBasicSubscription && (
                                        <>
                                            <span className="hidden sm:block"><StandardFeatureBadge /></span>
                                            <span className="sm:hidden"><StandardFeatureBadge mobile /></span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                        
                        {/* Search and Filter */}
                        <div className="relative flex flex-col sm:flex-row gap-2 mb-4">
                            <input
                                type="text"
                                placeholder="🔍 Search PO or Supplier..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="flex-1 px-3 py-2 text-sm border border-blue-200 dark:border-blue-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <div className={`w-full sm:w-40 ${isFilterSupplierOpen ? 'relative z-[10000]' : 'relative z-0'}`}>
                                <CustomSelect
                                    value={filterSupplier}
                                    onChange={(value) => setFilterSupplier(value)}
                                    options={suppliers.map(s => ({ value: s.id.toString(), label: s.name }))}
                                    placeholder="All Suppliers"
                                    className="w-40"
                                    onOpenChange={setIsFilterSupplierOpen}
                                />
                            </div>
                        </div>

                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mb-4"></div>
                                <p className="text-gray-500 dark:text-gray-400">Loading purchase orders...</p>
                            </div>
                        ) : filteredDemands.length === 0 ? (
                            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                                <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <p className="text-lg font-medium">No purchase orders yet</p>
                                <p className="text-sm mt-2">Send demands to suppliers to create purchase orders</p>
                            </div>
                        ) : (
                            <ThemedScrollArea shellClassName="flex-1 min-h-0" className="space-y-2 h-full pr-1">
                                {filteredDemands.map((demand) => {
                                    const isPOExpanded = expandedPORows.has(demand.id)
                                    
                                    return (
                                        <div key={demand.id} className="relative group">
                                            {/* Main Row */}
                                            <div className={`relative rounded-lg border border-blue-200/40 dark:border-blue-700/40 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm transition-all hover:shadow-md ${
                                                selectedPOIds.has(demand.id) ? 'ring-2 ring-sky-500 bg-sky-50/30 dark:bg-sky-950/30' : ''
                                            } ${
                                                demand.status === 'pending' ? 'border-l-4 border-l-yellow-500' :
                                                demand.status === 'received' ? 'border-l-4 border-l-sky-500' :
                                                'border-l-4 border-l-gray-400'
                                            }`}>
                                                <div className="p-3 flex items-center gap-2 sm:gap-3 flex-wrap">
                                                                    {/* Status Dot */}
                                                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                                                        demand.status === 'pending' ? 'bg-yellow-500 shadow-lg shadow-yellow-500/50' :
                                                                        demand.status === 'received' ? 'bg-sky-500 shadow-lg shadow-sky-500/50' :
                                                                        demand.status === 'deleted' ? 'bg-red-500 shadow-lg shadow-red-500/50' :
                                                                        'bg-gray-400 shadow-lg shadow-gray-400/50'
                                                                    }`}></div>                                                    {/* Checkbox */}
                                                    <label className="relative group/checkbox cursor-pointer flex-shrink-0">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedPOIds.has(demand.id)}
                                                            onChange={() => toggleSelectPO(demand.id)}
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="peer sr-only"
                                                        />
                                                        <div className="w-5 h-5 border-2 border-sky-400 dark:border-sky-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-sky-500 peer-checked:to-blue-600 peer-checked:border-sky-500 transition-all duration-200 flex items-center justify-center shadow-sm">
                                                            <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        </div>
                                                    </label>

                                                    {/* PO Number */}
                                                    <div className="font-medium text-gray-900 dark:text-white font-mono text-xs sm:text-sm min-w-[80px] sm:min-w-[100px]">
                                                        <span className="hidden sm:inline">PON. </span>{demand.poNumber}
                                                    </div>

                                                    {/* Items Count */}
                                                    <div className="flex items-center gap-1 text-xs sm:text-sm">
                                                        <span className="text-gray-500 dark:text-gray-400">Items:</span>
                                                        <span className="font-medium text-gray-900 dark:text-white">{demand.items?.length || 0}</span>
                                                    </div>

                                                    {/* Amount */}
                                                    <div className="flex-1 text-right">
                                                        <div className="font-semibold text-sky-600 dark:text-sky-400">
                                                            ₹{(demand.totalAmount || 0).toFixed(2)}
                                                        </div>
                                                    </div>

                                                                    {/* Actions */}
                                                                    <div className="flex items-center gap-1">
                                                                        {/* Receive Button (only for pending) */}
                                                                        {demand.status === 'pending' && (
                                                                            <button
                                                                                onClick={() => openReceivingModal(demand)}
                                                                                className="p-1.5 bg-sky-100 hover:bg-sky-200 dark:bg-sky-900/30 dark:hover:bg-sky-900/50 text-sky-600 dark:text-sky-400 rounded transition-colors"
                                                                                title="Receive Goods"
                                                                            >
                                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                                                                </svg>
                                                                            </button>
                                                                        )}
                                                                        
                                                                        {/* Bill Actions - Only in Received Tab */}
                                                                        {demand.status === 'received' && (
                                                                            <>
                                                                                {demand.billUrl ? (
                                                                                    <>
                                                                                        {/* View Button */}
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                setPdfPreviewUrl(demand.billUrl)
                                                                                                setIsPdfPreviewModalOpen(true)
                                                                                                setPdfPreviewModalAnimating(false)
                                                                                                setTimeout(() => setPdfPreviewModalAnimating(true), 10)
                                                                                            }}
                                                                                            className="p-1.5 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded transition-colors"
                                                                                            title="View Bill"
                                                                                        >
                                                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                                            </svg>
                                                                                        </button>
                                                                                        
                                                                                        <button
                                                                                            onClick={async () => {
                                                                                                try {
                                                                                                    setUploadingBillForPO(demand.id)
                                                                                                    
                                                                                                    // Download PDF through API proxy
                                                                                                    const response = await fetch(`/api/download-bill?url=${encodeURIComponent(demand.billUrl)}`)
                                                                                                    if (!response.ok) {
                                                                                                        const errorData = await response.json().catch(() => ({}))
                                                                                                        throw new Error(errorData.error || 'Download failed')
                                                                                                    }
                                                                                                    const blob = await response.blob()
                                                                                                    const url = window.URL.createObjectURL(blob)
                                                                                                    
                                                                                                    // Create an iframe to load and print the PDF
                                                                                                    const iframe = document.createElement('iframe')
                                                                                                    iframe.style.display = 'none'
                                                                                                    iframe.src = url
                                                                                                    document.body.appendChild(iframe)
                                                                                                    
                                                                                                    // Wait for the iframe to load, then print
                                                                                                    iframe.onload = () => {
                                                                                                        setTimeout(() => {
                                                                                                            iframe.contentWindow?.print()
                                                                                                            // Clean up after printing
                                                                                                            setTimeout(() => {
                                                                                                                document.body.removeChild(iframe)
                                                                                                                window.URL.revokeObjectURL(url)
                                                                                                            }, 100)
                                                                                                        }, 100)
                                                                                                    }
                                                                                                } catch (error: any) {
                                                                                                    showError(error.message || 'Failed to print bill')
                                                                                                } finally {
                                                                                                    setUploadingBillForPO(null)
                                                                                                }
                                                                                            }}
                                                                                            disabled={uploadingBillForPO === demand.id}
                                                                                            className="p-1.5 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded transition-colors inline-flex items-center justify-center disabled:opacity-50"
                                                                                            title="Print Bill"
                                                                                        >
                                                                                            {uploadingBillForPO === demand.id ? (
                                                                                                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                                                </svg>
                                                                                            ) : (
                                                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                                                                                                </svg>
                                                                                            )}
                                                                                        </button>
                                                                                        
                                                                                        {/* Download Button */}
                                                                                        <button
                                                                                            onClick={async () => {
                                                                                                try {
                                                                                                    setUploadingBillForPO(demand.id)
                                                                                                    
                                                                                                    // Always use API proxy for Cloudinary files
                                                                                                    const response = await fetch(`/api/download-bill?url=${encodeURIComponent(demand.billUrl)}`)
                                                                                                    if (!response.ok) {
                                                                                                        const errorData = await response.json().catch(() => ({}))
                                                                                                        throw new Error(errorData.error || 'Download failed')
                                                                                                    }
                                                                                                    const blob = await response.blob()
                                                                                                    const url = window.URL.createObjectURL(blob)
                                                                                                    const a = document.createElement('a')
                                                                                                    a.href = url
                                                                                                    a.download = `bill-${demand.poNumber}.pdf`
                                                                                                    document.body.appendChild(a)
                                                                                                    a.click()
                                                                                                    document.body.removeChild(a)
                                                                                                    window.URL.revokeObjectURL(url)
                                                                                                    showSuccess('Bill downloaded successfully!')
                                                                                                } catch (error: any) {
                                                                                                    showError(error.message || 'Failed to download bill')
                                                                                                } finally {
                                                                                                    setUploadingBillForPO(null)
                                                                                                }
                                                                                            }}
                                                                                            disabled={uploadingBillForPO === demand.id}
                                                                                            className="p-1.5 bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 text-purple-600 dark:text-purple-400 rounded transition-colors inline-flex items-center justify-center disabled:opacity-50"
                                                                                            title="Download Bill"
                                                                                        >
                                                                                            {uploadingBillForPO === demand.id ? (
                                                                                                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                                                </svg>
                                                                                            ) : (
                                                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                                                                </svg>
                                                                                            )}
                                                                                        </button>
                                                                                    </>
                                                                                ) : uploadingBillForPO === demand.id ? (
                                                                                    <div className="p-1.5 bg-gray-100 dark:bg-gray-700 text-gray-400 rounded inline-flex items-center justify-center" title="Uploading...">
                                                                                        <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                                        </svg>
                                                                                    </div>
                                                                                ) : (
                                                                                    <label className="p-1.5 bg-sky-100 hover:bg-sky-200 dark:bg-sky-900/30 dark:hover:bg-sky-900/50 text-sky-600 dark:text-sky-400 rounded transition-colors cursor-pointer inline-flex items-center justify-center" title="Upload Bill">
                                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                                                        </svg>
                                                                                        <input
                                                                                            type="file"
                                                                                            accept=".pdf,image/*"
                                                                                            className="hidden"
                                                                                            onChange={(e) => {
                                                                                                const file = e.target.files?.[0]
                                                                                                if (file) handleDirectBillAttachment(demand.id, file)
                                                                                            }}
                                                                                        />
                                                                                    </label>
                                                                                )}
                                                                            </>
                                                                        )}

                                                                        {/* Expand/Collapse Button */}
                                                        <button
                                                            onClick={() => {
                                                                const newExpanded = new Set(expandedPORows)
                                                                if (isPOExpanded) {
                                                                    newExpanded.delete(demand.id)
                                                                } else {
                                                                    newExpanded.add(demand.id)
                                                                }
                                                                setExpandedPORows(newExpanded)
                                                            }}
                                                            className="p-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 rounded transition-colors"
                                                            title={isPOExpanded ? "Collapse" : "Expand"}
                                                        >
                                                            <svg className={`w-4 h-4 transition-transform ${isPOExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                        </button>

                                                        {/* Edit Button */}
                                                        {!editingPOIds.has(demand.id) ? (
                                                            <button
                                                                onClick={() => toggleEditMode(demand.id)}
                                                                className="p-1.5 bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded transition-colors"
                                                                title="Edit"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                </svg>
                                                            </button>
                                                        ) : (
                                                            <>
                                                                <button
                                                                    onClick={() => saveEditedPO(demand.id)}
                                                                    className="p-1.5 bg-sky-100 hover:bg-sky-200 dark:bg-sky-900/30 dark:hover:bg-sky-900/50 text-sky-600 dark:text-sky-400 rounded transition-colors"
                                                                    title="Save"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                </button>
                                                                <button
                                                                    onClick={() => toggleEditMode(demand.id)}
                                                                    className="p-1.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 rounded transition-colors"
                                                                    title="Cancel"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                    </svg>
                                                                </button>
                                                            </>
                                                        )}

                                                        {/* Delete or Restore Button */}
                                                        {activeTab === 'deleted' ? (
                                                            <>
                                                                <button
                                                                    onClick={() => restorePO(demand.id)}
                                                                    disabled={restoringPOId === demand.id}
                                                                    className="p-1.5 bg-sky-100 hover:bg-sky-200 dark:bg-sky-900/30 dark:hover:bg-sky-900/50 text-sky-600 dark:text-sky-400 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    title="Restore"
                                                                >
                                                                    {restoringPOId === demand.id ? (
                                                                        <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                        </svg>
                                                                    ) : (
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                        </svg>
                                                                    )}
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        setConfirmStep(1)
                                                                        setConfirmModal({
                                                                            open: true,
                                                                            message: 'Are you sure you want to permanently delete this purchase order? This action cannot be undone.',
                                                                            onConfirm: () => handleConfirmDelete(demand.id, true),
                                                                            deleteMultiple: false
                                                                        })
                                                                        setConfirmModalAnimating(true)
                                                                    }}
                                                                    disabled={deletingPOId === demand.id}
                                                                    className="p-1.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                    title="Permanently Delete"
                                                                >
                                                                    {deletingPOId === demand.id ? (
                                                                        <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                        </svg>
                                                                    ) : (
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                        </svg>
                                                                    )}
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <button
                                                                onClick={() => deleteDemand(demand.id)}
                                                                disabled={deletingPOId === demand.id}
                                                                className="p-1.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                                                title="Delete"
                                                            >
                                                                {deletingPOId === demand.id ? (
                                                                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                                    </svg>
                                                                ) : (
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                    </svg>
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Expanded Details */}
                                                {isPOExpanded && (
                                                    <div className="px-3 pb-3 pt-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/30">
                                                        {editingPOIds.has(demand.id) && demand.status === 'received' && (
                                                            <div className="mb-3">
                                                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Bill Attachment</label>
                                                                {demand.billUrl ? (
                                                                    <div className="flex items-center gap-2 p-2 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded">
                                                                        <svg className="w-4 h-4 text-sky-600 dark:text-sky-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                        </svg>
                                                                        <span className="text-sm text-sky-700 dark:text-sky-300 flex-1 truncate">
                                                                            {demand.billUrl.split('/').pop() || 'Bill attached'}
                                                                        </span>
                                                                        <button
                                                                            onClick={() => removeBillAttachment(demand.id)}
                                                                            className="p-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 rounded transition-colors flex-shrink-0"
                                                                            title="Remove Bill"
                                                                        >
                                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                                            </svg>
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <label className="flex items-center gap-2 p-2 bg-sky-100 hover:bg-sky-200 dark:bg-sky-900/30 dark:hover:bg-sky-900/50 text-sky-600 dark:text-sky-400 rounded transition-colors cursor-pointer">
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                                        </svg>
                                                                        <span className="text-sm font-medium">Upload Bill PDF</span>
                                                                        <input
                                                                            type="file"
                                                                            accept=".pdf,image/*"
                                                                            className="hidden"
                                                                            onChange={(e) => {
                                                                                const file = e.target.files?.[0]
                                                                                if (file) handleDirectBillAttachment(demand.id, file)
                                                                            }}
                                                                        />
                                                                    </label>
                                                                )}
                                                            </div>
                                                        )}
                                                        <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Supplier</label>
                                                                {editingPOIds.has(demand.id) ? (
                                                                    <input
                                                                        type="text"
                                                                        value={editedPOData[demand.id]?.supplierName || ''}
                                                                        onChange={(e) => setEditedPOData({
                                                                            ...editedPOData,
                                                                            [demand.id]: { ...editedPOData[demand.id], supplierName: e.target.value }
                                                                        })}
                                                                        className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                                                                        disabled
                                                                    />
                                                                ) : (
                                                                    <div className="text-gray-900 dark:text-white font-medium">{demand.supplier?.name || 'N/A'}</div>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Date</label>
                                                                {editingPOIds.has(demand.id) ? (
                                                                    <input
                                                                        type="date"
                                                                        value={editedPOData[demand.id]?.orderDate?.split('T')[0] || ''}
                                                                        onChange={(e) => setEditedPOData({
                                                                            ...editedPOData,
                                                                            [demand.id]: { ...editedPOData[demand.id], orderDate: e.target.value }
                                                                        })}
                                                                        className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                                                                        disabled
                                                                    />
                                                                ) : (
                                                                    <div className="text-gray-900 dark:text-white">
                                                                        {demand.orderDate ? new Date(demand.orderDate).toLocaleDateString() : '-'}
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status</label>
                                                                {editingPOIds.has(demand.id) ? (
                                                                    <div className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm">
                                                                        {demand.status === 'received' ? 'Received' : demand.status === 'pending' ? 'Pending' : demand.status || 'Pending'}
                                                                    </div>
                                                                ) : (
                                                                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                                                                        demand.status === 'received' ? 'bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400' :
                                                                        demand.status === 'pending' ? 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                                                        demand.status === 'deleted' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                                                                        'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                                                                    }`}>
                                                                        {demand.status || 'pending'}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {demand.receivedDate && (
                                                                <div>
                                                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Received Date</label>
                                                                    {editingPOIds.has(demand.id) ? (
                                                                        <input
                                                                            type="date"
                                                                            value={editedPOData[demand.id]?.receivedDate?.split('T')[0] || ''}
                                                                            onChange={(e) => setEditedPOData({
                                                                                ...editedPOData,
                                                                                [demand.id]: { ...editedPOData[demand.id], receivedDate: e.target.value }
                                                                            })}
                                                                            className="w-full px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                                                                        />
                                                                    ) : (
                                                                        <div className="text-gray-900 dark:text-white">
                                                                            {new Date(demand.receivedDate).toLocaleDateString()}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Items List */}
                                                        {demand.items && demand.items.length > 0 && (
                                                            <div>
                                                                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Items:</label>
                                                                <div className="space-y-1">
                                                                    {(editingPOIds.has(demand.id) ? editedPOData[demand.id]?.items || demand.items : demand.items).map((item: any, idx: number) => (
                                                                        <div key={idx} className="flex justify-between items-center text-xs bg-white dark:bg-gray-800 rounded px-2 py-1.5">
                                                                            <div className="flex-1">
                                                                                <div className="font-medium text-gray-900 dark:text-white">{item.product?.name || item.productName || 'Unknown Product'}</div>
                                                                                <div className="text-gray-500 dark:text-gray-400 text-xs mt-0.5 flex items-center gap-2">
                                                                                    {editingPOIds.has(demand.id) ? (
                                                                                        <>
                                                                                            <span>Qty:</span>
                                                                                            <input
                                                                                                type="number"
                                                                                                value={item.quantity || 0}
                                                                                                onChange={(e) => {
                                                                                                    const newItems = [...(editedPOData[demand.id]?.items || [])]
                                                                                                    newItems[idx] = { ...newItems[idx], quantity: Number(e.target.value) }
                                                                                                    setEditedPOData({
                                                                                                        ...editedPOData,
                                                                                                        [demand.id]: { ...editedPOData[demand.id], items: newItems }
                                                                                                    })
                                                                                                }}
                                                                                                className="w-16 px-1 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                                                            />
                                                                                            <span>{item.product?.unit || ''}</span>
                                                                                        </>
                                                                                    ) : (
                                                                                        <>
                                                                                            {(() => {
                                                                                                const unitParts = item.product?.unit ? String(item.product.unit).trim().split(/\s+/) : []
                                                                                                const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                                                                                                const flowQty = item.quantity || item.requestedQuantity
                                                                                                const actualQty = unitQuantity > 0 ? Math.floor(flowQty / unitQuantity) : 0
                                                                                                return `Qty: ${formatQuantity(actualQty)} (${formatQuantity(flowQty)}) ${item.product?.unit || ''}`
                                                                                            })()}
                                                                                        </>
                                                                                    )}
                                                                                    {item.receivedQuantity > 0 && !editingPOIds.has(demand.id) && (
                                                                                        <span className="ml-2 text-sky-600 dark:text-sky-400">
                                                                                            {(() => {
                                                                                                const unitParts = item.product?.unit ? String(item.product.unit).trim().split(/\s+/) : []
                                                                                                const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                                                                                                const actualReceived = unitQuantity > 0 ? Math.floor(item.receivedQuantity / unitQuantity) : 0
                                                                                                return `(Received: ${formatQuantity(actualReceived)} (${formatQuantity(item.receivedQuantity)}))`
                                                                                            })()}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex flex-col items-end gap-0.5">
                                                                                {editingPOIds.has(demand.id) ? (
                                                                                    <input
                                                                                        type="number"
                                                                                        step="0.01"
                                                                                        value={item.unitPrice || 0}
                                                                                        onChange={(e) => {
                                                                                            const newItems = [...(editedPOData[demand.id]?.items || [])]
                                                                                            newItems[idx] = { ...newItems[idx], unitPrice: Number(e.target.value) }
                                                                                            setEditedPOData({
                                                                                                ...editedPOData,
                                                                                                [demand.id]: { ...editedPOData[demand.id], items: newItems }
                                                                                            })
                                                                                        }}
                                                                                        className="w-20 px-1 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-right"
                                                                                    />
                                                                                ) : (
                                                                                    <span className={`text-xs ${(item.product?.purchasePricePerUnit || 0) > 0 ? 'text-gray-500 dark:text-gray-400' : 'text-orange-500 dark:text-orange-400'}`}>
                                                                                        {(item.product?.purchasePricePerUnit || 0) > 0 ? `₹${Number(item.product.purchasePricePerUnit).toFixed(2)}/unit` : 'Price not set'}
                                                                                    </span>
                                                                                )}
                                                                                <span className="font-medium text-sky-600 dark:text-sky-400">₹{((item.quantity || item.requestedQuantity) * (item.product?.purchasePricePerUnit || 0)).toFixed(2)}</span>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </ThemedScrollArea>
                        )}
                    </div>
                </div>
            </div>



            {/* Modals */}
            {/* Supplier Selection Modal */}
            {showSupplierModal && (
                <div className={`fixed inset-0 bg-black flex items-center justify-center p-4 transition-opacity duration-300 ${supplierModalAnimating ? 'bg-opacity-50' : 'bg-opacity-0'}`} style={{ zIndex: 9999 }}>
                    <div className={`relative overflow-hidden rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/20 backdrop-blur-sm max-w-lg w-full transform transition-all duration-300 ${supplierModalAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none"></div>
                        <div className="relative p-4 sm:p-5">
                            <h2 className="text-xl sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400 mb-2 sm:mb-3">
                                {supplierModalStep === 1 ? 'Select Supplier' : 'Add Product Notes'}
                            </h2>
                            <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-3 sm:mb-4">
                                {supplierModalStep === 1
                                    ? 'Choose a supplier to send this demand to.'
                                    : 'Add optional notes for each product. These notes will be included in the supplier email.'}
                            </p>
                            <div className="mb-4 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                                Step {supplierModalStep} of 2
                            </div>

                            {supplierModalStep === 1 && (
                                <>
                                    <div className={isSupplierModalOpen ? 'relative z-[10000]' : 'relative z-0'}>
                                        <CustomSelect
                                            value={selectedSupplier}
                                            onChange={(value) => setSelectedSupplier(value)}
                                            options={suppliers.map(s => ({
                                                value: s.id.toString(),
                                                label: `${s.name}${s.email ? ` (${s.email})` : ' (No email)'}`
                                            }))}
                                            placeholder="Select Supplier"
                                            className="mb-6"
                                            onOpenChange={setIsSupplierModalOpen}
                                        />
                                    </div>

                                    {selectedSupplier && (
                                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
                                            <p className="text-sm text-blue-900 dark:text-blue-200">
                                                <strong>Demand Summary:</strong>
                                            </p>
                                            <ul className="text-sm text-blue-700 dark:text-blue-300 mt-2 space-y-1">
                                                <li>• Total Items: {demandList.filter(item => selectedDemandIds.has(item.productId)).length}</li>
                                                <li>• Total Amount: ₹{demandList.filter(item => selectedDemandIds.has(item.productId)).reduce((sum, item) => sum + ((item.requestedQuantity || 0) * (item.purchasePricePerUnit || 0)), 0).toFixed(2)}</li>
                                                <li>• Supplier: {suppliers.find(s => s.id === Number(selectedSupplier))?.name}</li>
                                            </ul>
                                        </div>
                                    )}
                                </>
                            )}

                            {supplierModalStep === 2 && (
                                <div className="border border-blue-200/60 dark:border-blue-800 rounded-lg bg-white/70 dark:bg-gray-800/60 max-h-[320px] overflow-auto mb-6">
                                    <div className="grid grid-cols-12 gap-3 px-3 py-2 border-b border-blue-100 dark:border-blue-900 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                                        <div className="col-span-5">Product</div>
                                        <div className="col-span-7">Notes (Optional)</div>
                                    </div>
                                    {demandList.filter(item => selectedDemandIds.has(item.productId)).map((item) => (
                                        <div key={item.productId} className="grid grid-cols-12 gap-3 px-3 py-3 border-b last:border-b-0 border-blue-100 dark:border-blue-900/60">
                                            <div className="col-span-5 text-sm text-gray-800 dark:text-gray-100 break-words">
                                                {item.productName}
                                            </div>
                                            <div className="col-span-7">
                                                <input
                                                    type="text"
                                                    value={productNotes[item.productId] || ''}
                                                    onChange={(e) => updateProductNote(item.productId, e.target.value)}
                                                    placeholder="Any note for this product"
                                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
                                <button
                                    onClick={closeSupplierModal}
                                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-sm sm:text-base"
                                >
                                    Cancel
                                </button>
                                {supplierModalStep === 2 && (
                                    <button
                                        onClick={() => setSupplierModalStep(1)}
                                        disabled={sendingEmail}
                                        className="px-4 py-2 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors text-sm sm:text-base"
                                    >
                                        Back
                                    </button>
                                )}
                                {supplierModalStep === 1 ? (
                                    <button
                                        onClick={() => setSupplierModalStep(2)}
                                        disabled={!selectedSupplier}
                                        className="px-4 sm:px-6 py-2 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 disabled:from-gray-400 disabled:to-gray-400 text-white rounded-lg font-medium transition-colors shadow-md text-sm sm:text-base"
                                    >
                                        Next
                                    </button>
                                ) : (
                                    <button
                                        onClick={sendDemand}
                                        disabled={sendingEmail}
                                        className="px-4 sm:px-6 py-2 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 disabled:from-gray-400 disabled:to-gray-400 text-white rounded-lg font-medium transition-colors shadow-md text-sm sm:text-base"
                                    >
                                        {sendingEmail ? 'Sending...' : '📧 Send Demand'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Receiving Goods Modal */}
            {isReceivingModalOpen && receivingPO && (
                <div className={`fixed inset-0 bg-black flex items-center justify-center p-4 transition-opacity duration-300 ${receivingModalAnimating ? 'bg-opacity-50' : 'bg-opacity-0'}`} style={{ zIndex: 9999 }} onClick={closeReceivingModal}>
                    <div className={`relative rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/20 backdrop-blur-sm max-w-3xl w-full h-[85vh] flex flex-col transform transition-all duration-300 ${receivingModalAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`} onClick={(e) => e.stopPropagation()}>
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-2xl"></div>
                        <form onSubmit={handleReceiveGoods} className="relative flex flex-col h-full overflow-hidden">
                            {/* Header - Fixed */}
                            <div className="flex-shrink-0 p-4 sm:p-5 border-b border-blue-200/30 dark:border-blue-700/30">
                                <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
                                    <div className="flex-1">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <h2 className="text-lg sm:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">Receive Goods - {receivingPO.poNumber}</h2>
                                                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-2">
                                                    Supplier: <strong>{receivingPO.supplier?.name}</strong> | 
                                                    Order Date: <strong>{receivingPO.orderDate ? new Date(receivingPO.orderDate).toLocaleDateString() : '-'}</strong>
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={closeReceivingModal}
                                                className="ml-4 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                                                title="Close"
                                            >
                                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (isBasicSubscription) {
                                                showInfo('Upload Bill is available in Standard plan.')
                                                router.push('/upgrade')
                                                return
                                            }
                                            setIsBillUploadModalOpen(true)
                                        }}
                                        className="relative px-2 sm:px-3 py-1.5 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-lg font-medium transition-all shadow-md text-xs sm:text-sm flex items-center gap-1 sm:gap-2"
                                    >
                                        <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                        </svg>
                                        <span className="hidden sm:inline">Upload Bill</span>
                                        <span className="sm:hidden">Bill</span>
                                        {isBasicSubscription && (
                                            <>
                                                <span className="hidden sm:block"><StandardFeatureBadge /></span>
                                                <span className="sm:hidden"><StandardFeatureBadge mobile /></span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* Scrollable Content */}
                            <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0">
                                <div className="p-4 sm:p-5">
                                    <div className="overflow-x-auto">
                                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                        <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                                            <tr>
                                                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Product</th>
                                                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Ordered</th>
                                                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Prev. Recv.</th>
                                                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Recv. Now</th>
                                                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Purchase Price</th>
                                                <th className="px-2 sm:px-4 py-2 sm:py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {receivingPO.items.map((item: any, index: number) => {
                                            const receivingQty = Number(item.receivingQuantity) || 0
                                            const purchasePrice = Number(item.product?.purchasePricePerUnit || 0)
                                            const total = receivingQty * purchasePrice
                                            return (
                                                <tr key={index}>
                                                    <td className="px-4 py-3 text-gray-900 dark:text-white">{item.product?.name}</td>
                                                    <td className="px-4 py-3 text-gray-900 dark:text-white">
                                                        {(() => {
                                                            const unitParts = item.product?.unit ? String(item.product.unit).trim().split(/\s+/) : []
                                                            const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                                                            const actualOrdered = unitQuantity > 0 ? Math.floor(item.quantity / unitQuantity) : 0
                                                            return `${formatQuantity(actualOrdered)} (${formatQuantity(item.quantity)})`
                                                        })()}
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                                                        {(() => {
                                                            const unitParts = item.product?.unit ? String(item.product.unit).trim().split(/\s+/) : []
                                                            const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                                                            const actualReceived = unitQuantity > 0 ? Math.floor((item.receivedQuantity || 0) / unitQuantity) : 0
                                                            return `${formatQuantity(actualReceived)} (${formatQuantity(item.receivedQuantity || 0)})`
                                                        })()}
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <input
                                                            type="number"
                                                            value={item.receivingQuantity}
                                                            onChange={(e) => {
                                                                const newPO = { ...receivingPO }
                                                                newPO.items[index].receivingQuantity = e.target.value
                                                                setReceivingPO(newPO)
                                                            }}
                                                            className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                                            min="0"
                                                            max={item.quantity - (item.receivedQuantity || 0)}
                                                        />
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-900 dark:text-white">
                                                            ₹{purchasePrice.toFixed(2)}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-900 dark:text-white font-medium">₹{total.toFixed(2)}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                    <tfoot className="bg-gray-50 dark:bg-gray-800 sticky bottom-0">
                                        <tr>
                                            <td colSpan={5} className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                                                Receiving Total:
                                            </td>
                                            <td className="px-4 py-3 font-bold text-lg text-sky-600 dark:text-sky-400">
                                                ₹{receivingPO.items.reduce((sum: number, item: any) => 
                                                    sum + (Number(item.receivingQuantity) || 0) * (Number(item.product?.purchasePricePerUnit) || 0), 0
                                                ).toFixed(2)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                        </table>
                                    </div>
                                </div>
                            </div>

                            {/* Footer with Buttons - Fixed */}
                            <div className="flex-shrink-0 p-4 sm:p-5 border-t border-blue-200/30 dark:border-blue-700/30 bg-white/50 dark:bg-gray-900/50">
                                <div className="flex justify-end gap-3">
                                    <button
                                        type="button"
                                        onClick={closeReceivingModal}
                                        disabled={receiving}
                                        className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={receiving}
                                        className="px-6 py-2 bg-sky-600 hover:bg-sky-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors"
                                    >
                                        {receiving ? 'Processing...' : '✓ Confirm Receipt'}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Success Modal */}
            {showSuccessModal && receivedPODetails && (
                <div className={`fixed inset-0 bg-black flex items-center justify-center p-4 transition-opacity duration-300 ${successModalAnimating ? 'bg-opacity-50' : 'bg-opacity-0'}`} style={{ zIndex: 9999 }}>
                    <div className={`relative rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/20 backdrop-blur-sm max-w-2xl w-full max-h-[70vh] flex flex-col transform transition-all duration-300 ${successModalAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                        <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-2xl"></div>
                        
                        {/* Header - Fixed */}
                        <div className="relative flex-shrink-0 p-4 text-center border-b border-gray-200 dark:border-gray-700">
                            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-sky-100 dark:bg-sky-900/30 mb-3">
                                <svg className="h-8 w-8 text-sky-600 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">Goods Received Successfully!</h2>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">Order {receivedPODetails.poNumber} has been marked as received and inventory has been updated.</p>
                        </div>

                        {/* Scrollable Content */}
                        <div className="relative flex-1 overflow-y-auto min-h-0 p-4 space-y-3">
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <p className="text-xs text-gray-600 dark:text-gray-400">Supplier</p>
                                        <p className="font-semibold text-sm text-gray-900 dark:text-white">{receivedPODetails.supplier?.name}</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-600 dark:text-gray-400">Received Date</p>
                                        <p className="font-semibold text-sm text-gray-900 dark:text-white">
                                            {receivedPODetails.receivedDate ? new Date(receivedPODetails.receivedDate).toLocaleDateString() : new Date().toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-600 dark:text-gray-400">Items Received</p>
                                        <p className="font-semibold text-sm text-gray-900 dark:text-white">{receivedPODetails.items?.length || 0} items</p>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-600 dark:text-gray-400">Total Amount</p>
                                        <p className="font-semibold text-sm text-sky-600 dark:text-sky-400">₹{(receivedPODetails.totalAmount || 0).toFixed(2)}</p>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Received Items</h3>
                                <div className="space-y-2">
                                    {receivedPODetails.items?.map((item: any, index: number) => {
                                        const purchasePrice = Number(item.product?.purchasePricePerUnit || 0)
                                        return (
                                            <div key={index} className="flex items-center justify-between p-2.5 bg-sky-50 dark:bg-sky-900/20 rounded-lg border border-sky-200 dark:border-sky-800">
                                                <div className="flex-1">
                                                    <p className="font-medium text-sm text-gray-900 dark:text-white">{item.product?.name}</p>
                                                    <p className="text-xs text-gray-600 dark:text-gray-400">
                                                        Quantity: <span className="font-semibold text-sky-600">
                                                            {(() => {
                                                                const unitParts = item.product?.unit ? String(item.product.unit).trim().split(/\s+/) : []
                                                                const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                                                                const flowQty = item.receivedQuantity || item.quantity
                                                                const actualQty = unitQuantity > 0 ? Math.floor(flowQty / unitQuantity) : 0
                                                                return `${formatQuantity(actualQty)} (${formatQuantity(flowQty)})`
                                                            })()
                                                            }
                                                        </span> {item.product?.unit || 'pcs'}
                                                        {purchasePrice > 0 && (
                                                            <span className="ml-2">• Purchase Price: ₹{purchasePrice.toFixed(2)}/unit</span>
                                                        )}
                                                    </p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                                                        ₹{((item.receivedQuantity || item.quantity) * purchasePrice).toFixed(2)}
                                                    </p>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>

                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                                <div className="flex items-start gap-2">
                                    <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <div className="flex-1">
                                        <p className="text-xs font-medium text-blue-900 dark:text-blue-200">Inventory Updated</p>
                                        <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                                            Product quantities have been automatically updated in your inventory. Stock transactions have been recorded for audit tracking.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer - Fixed */}
                        <div className="flex-shrink-0 flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-900/50">
                            <button
                                onClick={closeSuccessModal}
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
                                        : 'This action is irreversible and will permanently remove purchase order data. Do you want to continue?'}
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
                                            if (confirmModal.onConfirm) {
                                                confirmModal.onConfirm()
                                            } else {
                                                handleConfirmDelete(confirmModal.id)
                                            }
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
                <div className="fixed inset-0 bg-black/70 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
                    <div className="relative overflow-hidden rounded-2xl border border-red-200/30 dark:border-red-700/30 bg-gradient-to-br from-white via-red-50/30 to-orange-50/20 dark:from-gray-900 dark:via-red-950/20 dark:to-gray-900 shadow-2xl shadow-red-500/20 max-w-md w-full">
                        {/* Gradient overlay */}
                        <div className="absolute inset-0 bg-gradient-to-br from-red-400/5 via-transparent to-orange-500/5 pointer-events-none" />
                        
                        <div className="relative p-6">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600 dark:from-red-400 dark:to-orange-400">Deleting Purchase Orders</h3>
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
                                Please wait, deleting purchase order {deleteProgress.current} of {deleteProgress.total}...
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Floating Export Button */}
            {selectedPOIds.size > 0 && (
                <div className="relative">
                    <button
                        onClick={() => setShowExportDropdown(!showExportDropdown)}
                        className="fixed bottom-8 right-40 z-50 group mobile-safe-page-fab-export"
                        title={`Export ${selectedPOIds.size} selected order(s)`}
                    >
                        <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-r from-sky-500 to-blue-600 rounded-full blur-xl opacity-75 group-hover:opacity-100 transition-opacity duration-200"></div>
                            <div className="relative w-14 h-14 bg-gradient-to-r from-sky-600 to-blue-700 hover:from-sky-700 hover:to-blue-800 text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 transform group-hover:scale-110">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                                </svg>
                                <span className="absolute -top-1 -right-1 min-w-[24px] h-5 px-1.5 bg-sky-600 text-white rounded-full text-xs font-bold flex items-center justify-center shadow-lg ring-2 ring-white">
                                    {selectedPOIds.size}
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
            {selectedPOIds.size > 0 && (
                <button
                    onClick={() => {
                        setConfirmStep(1)
                        setConfirmModal({ open: true, deleteMultiple: true, message: `Are you sure you want to delete ${selectedPOIds.size} selected order(s)?` })
                        setConfirmModalAnimating(true)
                    }}
                    className="fixed bottom-8 right-24 z-50 group mobile-safe-page-fab-delete"
                    title={`Delete ${selectedPOIds.size} selected order(s)`}
                >
                    <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-red-500 to-rose-600 rounded-full blur-xl opacity-75 group-hover:opacity-100 transition-opacity duration-200 animate-pulse"></div>
                        <div className="relative w-14 h-14 bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 text-white rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 transform group-hover:scale-110">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            <span className="absolute -top-1 -right-1 min-w-[24px] h-5 px-1.5 bg-red-600 text-white rounded-full text-xs font-bold flex items-center justify-center shadow-lg ring-2 ring-white">
                                {selectedPOIds.size}
                            </span>
                        </div>
                    </div>
                </button>
            )}

            {(sendingEmail || receiving) && (
                <LoadingModal 
                    isOpen={true} 
                    message={sendingEmail ? 'Sending demand...' : 'Receiving goods...'}
                />
            )}

            {/* Bill Upload Modal */}
            <ReceiveGoodsBillUploadModal
                isOpen={isBillUploadModalOpen}
                onClose={() => setIsBillUploadModalOpen(false)}
                onDataExtracted={handleBillDataExtracted}
                user={user}
            />
            
            {/* Unmatched Items Modal */}
            <UnmatchedItemsModal
                isOpen={isUnmatchedItemsModalOpen}
                onClose={() => {
                    setIsUnmatchedItemsModalOpen(false)
                    setUnmatchedItems([])
                    setPendingMatchedItems([])
                }}
                unmatchedItems={unmatchedItems}
                availableProducts={availableProducts}
                onComplete={handleUnmatchedItemsComplete}
            />
            
            {/* Direct Bill Upload Modal */}
            <ReceiveGoodsBillUploadModal
                isOpen={isDirectBillUploadModalOpen}
                onClose={() => setIsDirectBillUploadModalOpen(false)}
                onDataExtracted={handleDirectBillUpload}
                user={user}
            />

            {/* Add Items Modal */}
            <AddDemandItemsModal
                isOpen={isAddItemsModalOpen}
                onClose={() => setIsAddItemsModalOpen(false)}
                products={products}
                onAddItems={handleAddItemsFromModal}
            />

            {/* PDF Preview Modal */}
            {isPdfPreviewModalOpen && (
                <div className={`fixed inset-0 bg-black transition-opacity duration-300 ${pdfPreviewModalAnimating ? 'bg-opacity-75' : 'bg-opacity-0'}`} style={{ zIndex: 9999 }} onClick={() => {
                    setPdfPreviewModalAnimating(false)
                    setTimeout(() => {
                        setIsPdfPreviewModalOpen(false)
                        setPdfPreviewUrl('')
                    }, 200)
                }}>
                    <div className={`fixed inset-0 flex items-center justify-center p-4 transition-all duration-300 ${pdfPreviewModalAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`} style={{ zIndex: 10000 }}>
                        <div className="relative overflow-hidden rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-white dark:bg-gray-900 shadow-2xl max-w-6xl w-full h-[90vh]" onClick={e => e.stopPropagation()}>
                            <div className="absolute top-0 left-0 right-0 bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-800 dark:via-gray-900 dark:to-gray-800 p-4 border-b border-blue-200/30 dark:border-blue-700/30 flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400">
                                    Bill Preview
                                </h3>
                                <button
                                    onClick={() => {
                                        setPdfPreviewModalAnimating(false)
                                        setTimeout(() => {
                                            setIsPdfPreviewModalOpen(false)
                                            setPdfPreviewUrl('')
                                        }, 200)
                                    }}
                                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                    title="Close"
                                >
                                    <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                            <div className="relative w-full h-[calc(100%-64px)] mt-16">
                                <iframe
                                    src={pdfPreviewUrl}
                                    className="w-full h-full border-0"
                                    title="PDF Preview"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ToastNotification toasts={toasts} removeToast={removeToast} />
        </>
    )
}

