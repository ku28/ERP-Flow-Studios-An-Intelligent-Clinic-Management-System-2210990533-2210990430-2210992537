import { useState, useEffect } from 'react'
import CustomSelect from './CustomSelect'
import { formatQuantity } from '../lib/utils'

interface AddDemandItemsModalProps {
    isOpen: boolean
    onClose: () => void
    products: any[]
    onAddItems: (items: any[]) => void
}

export default function AddDemandItemsModal({ isOpen, onClose, products, onAddItems }: AddDemandItemsModalProps) {
    const [animating, setAnimating] = useState(false)
    const [selectedItems, setSelectedItems] = useState<any[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set())

    useEffect(() => {
        if (isOpen) {
            setAnimating(false)
            setTimeout(() => setAnimating(true), 10)
            
            // Auto-add low stock and out of stock items
            const autoAddItems = products
                .filter(p => {
                    const flowInventory = (Number(p.totalPurchased) || 0) - (Number(p.totalSales) || 0)
                    const threshold = Number(p.minStockLevel) || 200
                    
                    // Only include out of stock and low stock items
                    return flowInventory < threshold
                })
                .map(p => {
                    const unitParts = p.unit ? String(p.unit).trim().split(/\s+/) : []
                    const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                    const flowInventory = (Number(p.totalPurchased) || 0) - (Number(p.totalSales) || 0)
                    const actualInventory = unitQuantity > 0 ? Math.floor(flowInventory / unitQuantity) : 0
                    const threshold = Number(p.minStockLevel) || 200
                    const requestedQuantity = Math.max(0, threshold - flowInventory)
                    const purchasePricePerUnit = Number(p.purchasePricePerUnit || p.purchasePriceRupees || 0)
                    
                    return {
                        productId: p.id,
                        productName: p.name,
                        currentStock: actualInventory,
                        flowInventory: flowInventory,
                        requestedQuantity: requestedQuantity, // Set to threshold value
                        unit: p.unit || '',
                        purchasePricePerUnit: purchasePricePerUnit,
                        total: requestedQuantity * purchasePricePerUnit,
                        source: flowInventory === 0 ? 'Out of Stock' : 'Low Stock'
                    }
                })
            
            setSelectedItems(autoAddItems)
            // Select all items by default (like Order Low Stock in products page)
            setSelectedItemIds(new Set(autoAddItems.map((_, index) => index)))
        } else {
            setSelectedItems([])
            setSearchQuery('')
            setSelectedItemIds(new Set())
        }
    }, [isOpen, products])

    if (!isOpen) return null

    const closeModal = () => {
        setAnimating(false)
        setTimeout(onClose, 300)
    }

    const handleAddItem = (productId: string) => {
        const product = products.find(p => p.id.toString() === productId)
        if (!product) return

        // Check if already added
        if (selectedItems.some(item => item.productId === product.id)) {
            return
        }

        const unitParts = product.unit ? String(product.unit).trim().split(/\s+/) : []
        const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
        const flowInventory = (Number(product.totalPurchased) || 0) - (Number(product.totalSales) || 0)
        const actualInventory = unitQuantity > 0 ? Math.floor(flowInventory / unitQuantity) : 0
        const threshold = Number(product.minStockLevel) || 200
        const requestedQuantity = Math.max(0, threshold - flowInventory)
        const purchasePricePerUnit = Number(product.purchasePricePerUnit || product.purchasePriceRupees || 0)

        const newItem = {
            productId: product.id,
            productName: product.name,
            currentStock: actualInventory,
            flowInventory: flowInventory,
            requestedQuantity: requestedQuantity, // Set to threshold value
            unit: product.unit || '',
            purchasePricePerUnit: purchasePricePerUnit,
            total: requestedQuantity * purchasePricePerUnit,
            source: 'Manual'
        }

        setSelectedItems([...selectedItems, newItem])
        // Auto-select the newly added item
        const newSelected = new Set(selectedItemIds)
        newSelected.add(selectedItems.length)
        setSelectedItemIds(newSelected)
    }

    const handleRemoveItem = (productId: number) => {
        setSelectedItems(selectedItems.filter(item => item.productId !== productId))
        const newSelected = new Set(selectedItemIds)
        const itemIndex = selectedItems.findIndex(item => item.productId === productId)
        if (itemIndex >= 0) {
            newSelected.delete(itemIndex)
            setSelectedItemIds(newSelected)
        }
    }

    const handleQuantityChange = (productId: number, quantity: number | string) => {
        setSelectedItems(selectedItems.map(item => {
            if (item.productId === productId) {
                const qty = quantity === '' ? '' : Number(quantity)
                const total = qty === '' ? 0 : qty * (item.purchasePricePerUnit || 0)
                return { ...item, requestedQuantity: qty, total: total }
            }
            return item
        }))
    }

    const handleAddAllItems = () => {
        // Only add items that are selected (checked) and have valid quantity
        const validItems = selectedItems.filter((item, index) => 
            selectedItemIds.has(index) && item.requestedQuantity !== '' && Number(item.requestedQuantity) > 0
        )
        if (validItems.length === 0) {
            return // Don't add if no valid items
        }
        onAddItems(validItems)
        closeModal()
    }

    // Selection functions for items
    const toggleSelectItem = (index: number) => {
        const newSelected = new Set(selectedItemIds)
        if (newSelected.has(index)) {
            newSelected.delete(index)
        } else {
            newSelected.add(index)
        }
        setSelectedItemIds(newSelected)
    }

    const toggleSelectAllItems = () => {
        if (selectedItemIds.size === selectedItems.length) {
            // Deselect all
            setSelectedItemIds(new Set())
        } else {
            // Select all
            setSelectedItemIds(new Set(selectedItems.map((_, index) => index)))
        }
    }

    const handleRefresh = async () => {
        setIsRefreshing(true)
        
        // Simulate loading with animation
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // Refresh low stock and out of stock items only
        const autoAddItems = products
            .filter(p => {
                const flowInventory = (Number(p.totalPurchased) || 0) - (Number(p.totalSales) || 0)
                const threshold = Number(p.minStockLevel) || 200
                
                return flowInventory < threshold
            })
            .map(p => {
                const unitParts = p.unit ? String(p.unit).trim().split(/\s+/) : []
                const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                const flowInventory = (Number(p.totalPurchased) || 0) - (Number(p.totalSales) || 0)
                const actualInventory = unitQuantity > 0 ? Math.floor(flowInventory / unitQuantity) : 0
                const threshold = Number(p.minStockLevel) || 200
                const requestedQuantity = Math.max(0, threshold - flowInventory)
                const purchasePricePerUnit = Number(p.purchasePricePerUnit || p.purchasePriceRupees || 0)
                
                return {
                    productId: p.id,
                    productName: p.name,
                    currentStock: actualInventory,
                    flowInventory: flowInventory,
                    requestedQuantity: requestedQuantity,
                    unit: p.unit || '',
                    purchasePricePerUnit: purchasePricePerUnit,
                    total: requestedQuantity * purchasePricePerUnit,
                    source: flowInventory === 0 ? 'Out of Stock' : 'Low Stock'
                }
            })
        
        // Merge with manual items
        const manualItems = selectedItems.filter(item => item.source === 'Manual')
        const mergedItems = [...autoAddItems]
        
        manualItems.forEach(manual => {
            if (!mergedItems.some(item => item.productId === manual.productId)) {
                mergedItems.push(manual)
            }
        })
        
        setSelectedItems(mergedItems)
        // Select all items by default after refresh
        setSelectedItemIds(new Set(mergedItems.map((_, index) => index)))
        setIsRefreshing(false)
    }

    // Show ALL products, sorted by stock status
    const getFilteredProducts = () => {
        let filtered = products.filter(p => 
            !selectedItems.some(item => item.productId === p.id) &&
            (searchQuery === '' || p.name.toLowerCase().includes(searchQuery.toLowerCase()))
        )

        // Sort: out of stock first, then low stock, then by stock level ascending
        return filtered.sort((a, b) => {
            const aFlowInventory = (Number(a.totalPurchased) || 0) - (Number(a.totalSales) || 0)
            const aThreshold = Number(a.minStockLevel) || 200
            
            const bFlowInventory = (Number(b.totalPurchased) || 0) - (Number(b.totalSales) || 0)
            const bThreshold = Number(b.minStockLevel) || 200
            
            const aOutOfStock = aFlowInventory === 0
            const bOutOfStock = bFlowInventory === 0
            const aLowStock = aFlowInventory < aThreshold
            const bLowStock = bFlowInventory < bThreshold

            if (aOutOfStock && !bOutOfStock) return -1
            if (!aOutOfStock && bOutOfStock) return 1
            if (aLowStock && !bLowStock) return -1
            if (!aLowStock && bLowStock) return 1
            
            return aFlowInventory - bFlowInventory
        })
    }

    const getStockBadge = (product: any) => {
        const flowInventory = (Number(product.totalPurchased) || 0) - (Number(product.totalSales) || 0)
        const threshold = Number(product.minStockLevel) || 200
        
        if (flowInventory === 0) {
            return <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs rounded-full font-medium">Out of Stock</span>
        }
        if (flowInventory < threshold) {
            return <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 text-xs rounded-full font-medium">Low Stock</span>
        }
        return null
    }

    const filteredProducts = getFilteredProducts()

    return (
        <div 
            className={`fixed inset-0 bg-black flex items-center justify-center p-4 transition-opacity duration-300 ${animating ? 'bg-opacity-50' : 'bg-opacity-0'}`} 
            style={{ zIndex: 10000 }}
            onClick={closeModal}
        >
            <div 
                className={`relative overflow-hidden rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/20 backdrop-blur-sm max-w-5xl w-full max-h-[90vh] overflow-y-auto transform transition-all duration-300 ${animating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none"></div>
                
                <div className="relative p-6">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                                Add Items to Demand List
                            </h2>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                Select products to add to your purchase order
                            </p>
                        </div>
                        <button
                            onClick={closeModal}
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Add Medicine Section */}
                    <div className="mb-6 p-4 bg-white/50 dark:bg-gray-800/50 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="flex-1">
                                <CustomSelect
                                    value=""
                                    onChange={handleAddItem}
                                    options={filteredProducts.map(p => {
                                        const flowInventory = (Number(p.totalPurchased) || 0) - (Number(p.totalSales) || 0)
                                        const threshold = Number(p.minStockLevel) || 200
                                        const unitParts = p.unit ? String(p.unit).trim().split(/\s+/) : []
                                        const unitQuantity = unitParts.length >= 1 ? Number(unitParts[0]) : 1
                                        const actualInventory = unitQuantity > 0 ? Math.floor(flowInventory / unitQuantity) : 0
                                        const badge = flowInventory === 0 ? ' ❌' : flowInventory < threshold ? ' ⚠️' : ''
                                        return {
                                            value: p.id.toString(),
                                            label: `${p.name}${badge} · Stock: ${formatQuantity(actualInventory)} (${formatQuantity(flowInventory)})`
                                        }
                                    })}
                                    placeholder="Select Medicine to Add..."
                                    className="text-sm"
                                />
                            </div>
                            <button
                                onClick={handleRefresh}
                                disabled={isRefreshing}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Refresh low stock items"
                            >
                                <svg className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                                {isRefreshing ? 'Refreshing...' : 'Refresh'}
                            </button>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                            <span className="inline-block w-3 h-3 bg-red-500 rounded-full mr-1"></span> Out of stock
                            <span className="ml-3 inline-block w-3 h-3 bg-orange-500 rounded-full mr-1"></span> Low stock (stock &lt; threshold)
                        </p>
                    </div>

                    {/* Selected Items List */}
                    <div className="mb-4">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-3">
                                {selectedItems.length > 0 && (
                                    <label className="relative group/checkbox cursor-pointer flex-shrink-0">
                                        <input
                                            type="checkbox"
                                            checked={selectedItems.length > 0 && selectedItemIds.size === selectedItems.length}
                                            onChange={toggleSelectAllItems}
                                            className="peer sr-only"
                                        />
                                        <div className="w-6 h-6 border-2 border-blue-400 dark:border-blue-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-blue-500 peer-checked:to-sky-600 peer-checked:border-blue-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-blue-500/50 group-hover/checkbox:border-blue-500 group-hover/checkbox:scale-110">
                                            <svg className="w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                            </svg>
                                        </div>
                                        <div className="absolute inset-0 rounded-md bg-blue-400 opacity-0 peer-checked:opacity-20 blur-md transition-opacity duration-200 pointer-events-none"></div>
                                    </label>
                                )}
                                <span>
                                    Selected Items ({selectedItems.length})
                                    {selectedItemIds.size > 0 && <span className="px-2 py-0.5 ml-2 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 rounded-full text-xs font-bold">({selectedItemIds.size} selected)</span>}
                                </span>
                            </h3>
                        </div>

                        {selectedItems.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                No items selected. Add items from the dropdown above.
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50 dark:bg-gray-800">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-10">
                                                <label className="relative group/checkbox cursor-pointer flex-shrink-0">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedItemIds.size === selectedItems.length && selectedItems.length > 0}
                                                        onChange={toggleSelectAllItems}
                                                        className="peer sr-only"
                                                    />
                                                    <div className="w-5 h-5 border-2 border-purple-400 dark:border-purple-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-purple-500 peer-checked:to-purple-600 peer-checked:border-purple-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-purple-500/50 group-hover/checkbox:border-purple-500 group-hover/checkbox:scale-110">
                                                        <svg className="w-3.5 h-3.5 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    </div>
                                                    <div className="absolute inset-0 rounded-md bg-purple-400 opacity-0 peer-checked:opacity-20 blur-md transition-opacity duration-200 pointer-events-none"></div>
                                                </label>
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Product</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Current Stock</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Requested Qty</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Source</th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {selectedItems.map((item, index) => (
                                            <tr key={item.productId} className={`hover:bg-gray-50 dark:hover:bg-gray-800 ${selectedItemIds.has(index) ? 'bg-purple-50/30 dark:bg-purple-950/20' : ''}`}>
                                                <td className="px-4 py-3">
                                                    <label className="relative group/checkbox cursor-pointer flex-shrink-0">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedItemIds.has(index)}
                                                            onChange={() => toggleSelectItem(index)}
                                                            className="peer sr-only"
                                                        />
                                                        <div className="w-5 h-5 border-2 border-purple-400 dark:border-purple-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-purple-500 peer-checked:to-purple-600 peer-checked:border-purple-500 transition-all duration-200 flex items-center justify-center shadow-sm">
                                                            <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        </div>
                                                    </label>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-gray-900 dark:text-white">{item.productName}</span>
                                                        {getStockBadge(products.find(p => p.id === item.productId) || item)}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-gray-900 dark:text-white">{formatQuantity(item.currentStock)} ({formatQuantity(item.flowInventory || 0)})</td>
                                                <td className="px-4 py-3">
                                                    <input
                                                        type="number"
                                                        value={item.requestedQuantity}
                                                        onChange={(e) => handleQuantityChange(item.productId, e.target.value)}
                                                        placeholder="Enter quantity"
                                                        className="w-32 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                                                        min="1"
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                        item.source === 'Out of Stock' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' :
                                                        item.source === 'Low Stock' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' :
                                                        'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                                    }`}>
                                                        {item.source}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <button
                                                        onClick={() => handleRemoveItem(item.productId)}
                                                        className="text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                                                        title="Remove item"
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <button
                            onClick={closeModal}
                            className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleAddAllItems}
                            disabled={selectedItemIds.size === 0}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                            </svg>
                            Add Selected Items ({selectedItemIds.size})
                        </button>
                    </div>
                </div>


            </div>
        </div>
    )
}

