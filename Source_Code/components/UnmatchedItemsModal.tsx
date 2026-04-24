import React, { useState, useEffect } from 'react'
import CustomSelect from './CustomSelect'
import { formatQuantity, formatPrice } from '../lib/utils'

interface UnmatchedItem {
    productName: string
    quantity: number
    unitPrice: number
    bottleQuantity: number
    unitsPerBottle: number
}

interface AvailableProduct {
    id: string
    name: string
}

interface UnmatchedItemsModalProps {
    isOpen: boolean
    onClose: () => void
    unmatchedItems: UnmatchedItem[]
    availableProducts: AvailableProduct[]
    onComplete: (mappings: any[]) => void
}

export default function UnmatchedItemsModal({
    isOpen,
    onClose,
    unmatchedItems,
    availableProducts,
    onComplete
}: UnmatchedItemsModalProps) {
    const [currentIndex, setCurrentIndex] = useState(0)
    const [selectedProductId, setSelectedProductId] = useState<string>('')
    const [createNew, setCreateNew] = useState(false)
    const [newProductName, setNewProductName] = useState('')
    const [newProductCode, setNewProductCode] = useState('')
    const [newProductCategory, setNewProductCategory] = useState('')
    const [newProductUnitQuantity, setNewProductUnitQuantity] = useState('')
    const [newProductUnitType, setNewProductUnitType] = useState('ML')
    const [newProductMinStock, setNewProductMinStock] = useState('10')
    const [loading, setLoading] = useState(false)
    const [userChoices, setUserChoices] = useState<any[]>([])
    const [showSummary, setShowSummary] = useState(false)
    const [showSuccess, setShowSuccess] = useState(false)
    const [successStats, setSuccessStats] = useState({ created: 0, mapped: 0, skipped: 0 })
    const [finalMappings, setFinalMappings] = useState<any[]>([])
    const [isAnimating, setIsAnimating] = useState(false)
    const [categories, setCategories] = useState<any[]>([])

    const currentItem = unmatchedItems[currentIndex]

    // Fetch categories when modal opens
    useEffect(() => {
        if (isOpen) {
            fetch('/api/categories')
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setCategories(data)
                    }
                })
                .catch(() => {})
        }
    }, [isOpen])

    useEffect(() => {
        if (isOpen) {
            // Small delay to ensure DOM is mounted before animating
            const timer = setTimeout(() => setIsAnimating(true), 10)
            return () => clearTimeout(timer)
        } else {
            setIsAnimating(false)
        }
    }, [isOpen])

    useEffect(() => {
        if (currentItem) {
            setNewProductName(currentItem.productName)
            setNewProductCode(`PROD${Date.now()}`)
            setNewProductCategory('')
            setNewProductUnitQuantity('')
            setNewProductUnitType('ML')
            setNewProductMinStock('10')
        }
    }, [currentIndex, currentItem])

    if (!isOpen) return null

    const handleNext = () => {
        // Store the user's choice without making API calls yet
        const choice = {
            billProductName: currentItem.productName,
            quantity: currentItem.quantity,
            unitPrice: currentItem.unitPrice,
            bottleQuantity: currentItem.bottleQuantity,
            unitsPerBottle: currentItem.unitsPerBottle,
            action: createNew ? 'create' : selectedProductId ? 'map' : 'skip',
            selectedProductId: selectedProductId || null,
            selectedProductName: selectedProductId ? availableProducts.find(p => p.id === selectedProductId)?.name : null,
            newProductData: createNew ? {
                name: newProductName,
                categoryId: newProductCategory || 'UNCATEGORIZED',
                unitQuantity: newProductUnitQuantity || '',
                unitType: newProductUnitType || 'ML',
                minStockLevel: parseInt(newProductMinStock) || 10,
                priceRupees: currentItem.unitPrice || 0,
                purchasePriceRupees: currentItem.unitPrice || 0,
                quantity: 0
            } : null
        }

        const newChoices = [...userChoices, choice]
        setUserChoices(newChoices)

        // Move to next item or show summary
        if (currentIndex < unmatchedItems.length - 1) {
            setCurrentIndex(currentIndex + 1)
            setSelectedProductId('')
            setCreateNew(false)
        } else {
            // All items reviewed, show summary
            setShowSummary(true)
        }
    }

    const handleSkip = () => {
        const choice = {
            billProductName: currentItem.productName,
            quantity: currentItem.quantity,
            unitPrice: currentItem.unitPrice,
            bottleQuantity: currentItem.bottleQuantity,
            unitsPerBottle: currentItem.unitsPerBottle,
            action: 'skip',
            selectedProductId: null,
            selectedProductName: null,
            newProductData: null
        }

        const newChoices = [...userChoices, choice]
        setUserChoices(newChoices)

        if (currentIndex < unmatchedItems.length - 1) {
            setCurrentIndex(currentIndex + 1)
            setSelectedProductId('')
            setCreateNew(false)
        } else {
            setShowSummary(true)
        }
    }

    const handleConfirmSummary = async () => {
        setLoading(true)
        try {
            const mappings: any[] = []
            let createdCount = 0
            let mappedCount = 0
            let skippedCount = 0

            for (const choice of userChoices) {
                if (choice.action === 'skip') {
                    skippedCount++
                    continue
                }

                let productId = choice.selectedProductId

                // Create new product if needed
                if (choice.action === 'create' && choice.newProductData) {
                    const createResponse = await fetch('/api/products', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(choice.newProductData)
                    })

                    const createData = await createResponse.json()
                    if (!createResponse.ok) {
                        alert(`Error creating product ${choice.billProductName}: ${createData.error || 'Unknown error'}`)
                        skippedCount++
                        continue
                    }
                    productId = createData.id.toString()
                    createdCount++
                }

                // Map the product
                if (productId) {
                    const response = await fetch('/api/map-bill-product', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            billProductName: choice.billProductName,
                            selectedProductId: productId,
                            createNew: false,
                            productData: null
                        })
                    })

                    const data = await response.json()
                    if (data.success) {
                        mappings.push({
                            billProductName: choice.billProductName,
                            productId: data.product.id,
                            quantity: choice.quantity,
                            unitPrice: choice.unitPrice,
                            bottleQuantity: choice.bottleQuantity,
                            unitsPerBottle: choice.unitsPerBottle
                        })
                        if (choice.action !== 'create') mappedCount++
                    } else {
                        alert(`Error mapping ${choice.billProductName}: ${data.error}`)
                        skippedCount++
                    }
                }
            }

            setSuccessStats({ created: createdCount, mapped: mappedCount, skipped: skippedCount })
            setFinalMappings(mappings)
            setLoading(false)
            setShowSummary(false)
            setShowSuccess(true)
        } catch (error) {
            alert('Failed to process product mappings')
            setLoading(false)
        }
    }

    const handleEditChoice = (index: number) => {
        setShowSummary(false)
        setCurrentIndex(index)
        const choice = userChoices[index]
        
        if (choice.action === 'create') {
            setCreateNew(true)
            setNewProductName(choice.newProductData.name)
            setNewProductCategory(choice.newProductData.categoryId)
            setNewProductUnitQuantity(choice.newProductData.unitQuantity)
            setNewProductUnitType(choice.newProductData.unitType)
            setNewProductMinStock(choice.newProductData.minStockLevel.toString())
        } else if (choice.action === 'map') {
            setCreateNew(false)
            setSelectedProductId(choice.selectedProductId)
        } else {
            setCreateNew(false)
            setSelectedProductId('')
        }

        // Remove this choice and all after it
        setUserChoices(userChoices.slice(0, index))
    }

    // Render Content Helper
    const renderContent = () => {
        if (loading) {
            return (
                <div className="relative p-12 text-center">
                    <div className="w-20 h-20 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-6"></div>
                    <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400 mb-3">Processing...</h3>
                    <p className="text-gray-600 dark:text-gray-400 text-lg">Creating products and mapping items...</p>
                </div>
            )
        }

        if (showSuccess) {
            return (
                <div className="relative p-12 text-center">
                    <div className="w-20 h-20 bg-sky-100 dark:bg-sky-900/30 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce-in">
                        <svg className="w-12 h-12 text-sky-600 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    <h3 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400 mb-3">Processing Complete!</h3>
                    
                    <div className="space-y-3 mb-6 text-left max-w-sm mx-auto">
                        {successStats.created > 0 && (
                            <div className="flex items-center justify-between p-3 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700/50 rounded-lg">
                                <span className="text-gray-700 dark:text-gray-300">Products Created</span>
                                <span className="font-bold text-sky-600 dark:text-sky-400">{successStats.created}</span>
                            </div>
                        )}
                        {successStats.mapped > 0 && (
                            <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-lg">
                                <span className="text-gray-700 dark:text-gray-300">Products Mapped</span>
                                <span className="font-bold text-blue-600 dark:text-blue-400">{successStats.mapped}</span>
                            </div>
                        )}
                        {successStats.skipped > 0 && (
                            <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/50 rounded-lg">
                                <span className="text-gray-700 dark:text-gray-300">Items Skipped</span>
                                <span className="font-bold text-gray-600 dark:text-gray-400">{successStats.skipped}</span>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={() => {
                            setShowSuccess(false)
                            onClose()
                            onComplete(finalMappings)
                        }}
                        className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-lg font-medium transition-all shadow-md"
                    >
                        Continue
                    </button>
                </div>
            )
        }

        if (showSummary) {
            return (
                <div className="max-h-[85vh] overflow-y-auto">
                    <div className="relative p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                                Review Product Mappings
                            </h2>
                            <button
                                onClick={onClose}
                                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-lg">
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                                Review your selections below. Click "Edit" to modify any mapping, or "Confirm" to proceed with creating/mapping products.
                            </p>
                        </div>

                        <div className="space-y-3 mb-6">
                            {userChoices.map((choice, index) => (
                                <div key={index} className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-2">
                                                <span className="font-semibold text-gray-800 dark:text-gray-200">
                                                    {choice.billProductName}
                                                </span>
                                                <span className="text-gray-400">→</span>
                                                {choice.action === 'skip' ? (
                                                    <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full text-sm">
                                                        Skipped
                                                    </span>
                                                ) : choice.action === 'create' ? (
                                                    <span className="px-3 py-1 bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 rounded-full text-sm font-medium">
                                                        Added New: {choice.newProductData?.name}
                                                    </span>
                                                ) : (
                                                    <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-sm font-medium">
                                                        {choice.selectedProductName}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                                Qty: {formatQuantity(choice.quantity)} units | Price: {formatPrice(choice.unitPrice)}/unit
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleEditChoice(index)}
                                            className="ml-4 px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                                        >
                                            Edit
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between items-center pt-4 border-t border-blue-200/30 dark:border-blue-700/30">
                            <button
                                onClick={() => {
                                    setShowSummary(false)
                                    setCurrentIndex(userChoices.length - 1)
                                    // Remove last choice to allow re-selection
                                    setUserChoices(userChoices.slice(0, -1))
                                }}
                                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                                disabled={loading}
                            >
                                Back
                            </button>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                {userChoices.filter(c => c.action !== 'skip').length} items to process
                            </div>
                            <button
                                onClick={handleConfirmSummary}
                                disabled={loading}
                                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-lg font-medium transition-all shadow-md disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed"
                            >
                                {loading ? 'Processing...' : 'Confirm & Process'}
                            </button>
                        </div>
                    </div>
                </div>
            )
        }

        if (!currentItem) return null

        return (
            <div className="max-h-[85vh] overflow-y-auto">
                <div className="relative p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                            Product Not Found ({currentIndex + 1} of {unmatchedItems.length})
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="mb-6 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-lg">
                        <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-2">Bill Item Details:</h3>
                        <p className="text-gray-700 dark:text-gray-300"><strong>Name:</strong> {currentItem.productName}</p>
                        <p className="text-gray-600 dark:text-gray-400 text-sm"><strong>Bottles:</strong> {formatQuantity(currentItem.bottleQuantity)} × {formatQuantity(currentItem.unitsPerBottle)} units</p>
                        <p className="text-gray-600 dark:text-gray-400 text-sm"><strong>Total Units:</strong> {formatQuantity(currentItem.quantity)}</p>
                        <p className="text-gray-600 dark:text-gray-400 text-sm"><strong>Unit Price:</strong> {formatPrice(currentItem.unitPrice)}</p>
                    </div>

                    <div className="mb-6">
                        <label className="relative group/checkbox cursor-pointer flex items-center mb-4">
                            <input
                                type="checkbox"
                                checked={!createNew}
                                onChange={() => setCreateNew(false)}
                                className="peer sr-only"
                            />
                            <div className="w-5 h-5 border-2 border-sky-400 dark:border-sky-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-sky-500 peer-checked:to-blue-600 peer-checked:border-sky-500 transition-all duration-200 flex items-center justify-center shadow-sm mr-2">
                                <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Map to existing product</span>
                        </label>

                        {!createNew && (
                            <div className="ml-6">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Select Product:
                                </label>
                                <CustomSelect
                                    value={selectedProductId}
                                    onChange={setSelectedProductId}
                                    options={availableProducts.map(product => ({
                                        value: product.id,
                                        label: product.name
                                    }))}
                                    placeholder="-- Select a product --"
                                    className="w-full"
                                />
                            </div>
                        )}
                    </div>

                    <div className="mb-6">
                        <label className="relative group/checkbox cursor-pointer flex items-center mb-4">
                            <input
                                type="checkbox"
                                checked={createNew}
                                onChange={() => {
                                    setCreateNew(!createNew)
                                    if (!createNew) {
                                        setNewProductName(currentItem.productName)
                                    }
                                }}
                                className="peer sr-only"
                            />
                            <div className="w-5 h-5 border-2 border-sky-400 dark:border-sky-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-sky-500 peer-checked:to-blue-600 peer-checked:border-sky-500 transition-all duration-200 flex items-center justify-center shadow-sm mr-2">
                                <svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <span className="font-medium text-gray-700 dark:text-gray-300">Create new product</span>
                        </label>

                        {createNew && (
                            <div className="ml-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Product Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={newProductName}
                                        onChange={(e) => setNewProductName(e.target.value)}
                                        placeholder="e.g. DRP CANCEROMIN/R1"
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Category
                                    </label>
                                    <CustomSelect
                                        value={newProductCategory}
                                        onChange={setNewProductCategory}
                                        options={[
                                            { value: '', label: 'Select category' },
                                            ...categories.map((cat: any) => ({
                                                value: cat.name,
                                                label: cat.name
                                            }))
                                        ]}
                                        placeholder="Select category"
                                        className="w-full"
                                        allowCustom={true}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Unit Quantity
                                        </label>
                                        <input
                                            type="number"
                                            value={newProductUnitQuantity}
                                            onChange={(e) => setNewProductUnitQuantity(e.target.value)}
                                            placeholder="30"
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Unit Type
                                        </label>
                                        <CustomSelect
                                            value={newProductUnitType}
                                            onChange={setNewProductUnitType}
                                            options={[
                                                { value: 'ML', label: 'ML' },
                                                { value: 'MG', label: 'MG' },
                                                { value: 'G', label: 'G' },
                                                { value: 'KG', label: 'KG' },
                                                { value: 'L', label: 'L' },
                                                { value: 'PCS', label: 'PCS' },
                                                { value: 'BOTTLE', label: 'BOTTLE' },
                                                { value: 'BOX', label: 'BOX' }
                                            ]}
                                            className="w-full"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Minimum Stock Level
                                    </label>
                                    <input
                                        type="number"
                                        value={newProductMinStock}
                                        onChange={(e) => setNewProductMinStock(e.target.value)}
                                        placeholder="10"
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>

                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-lg">
                                    <p className="text-sm text-gray-700 dark:text-gray-300">
                                        <strong>Unit Price:</strong> {formatPrice(currentItem.unitPrice)}/unit (from bill)
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-between items-center pt-4 border-t border-blue-200/30 dark:border-blue-700/30">
                        <div className="flex gap-2">
                            {currentIndex > 0 && (
                                <button
                                    onClick={() => {
                                        setCurrentIndex(currentIndex - 1)
                                        setSelectedProductId('')
                                        setCreateNew(false)
                                    }}
                                    className="px-4 py-2 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors flex items-center gap-1"
                                    disabled={loading}
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                    </svg>
                                    Back
                                </button>
                            )}
                            <button
                                onClick={handleSkip}
                                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                                disabled={loading}
                            >
                                Skip
                            </button>
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                            {userChoices.length} items processed
                        </div>
                        <button
                            onClick={handleNext}
                            disabled={loading || (!createNew && !selectedProductId) || (createNew && !newProductName.trim())}
                            className="px-6 py-2 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-lg font-medium transition-all shadow-md disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Processing...' : currentIndex < unmatchedItems.length - 1 ? 'Next' : 'Complete'}
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div 
            className="fixed inset-0 bg-black flex items-center justify-center p-4 transition-opacity duration-200 ease-out"
            style={{
                opacity: isAnimating ? 1 : 0,
                backgroundColor: isAnimating ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0)',
                zIndex: 9999
            }}
        >
            <div 
                className={`relative overflow-hidden rounded-2xl border border-blue-200/50 dark:border-blue-700 bg-gradient-to-br from-white via-blue-50 to-sky-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 shadow-lg shadow-blue-500/10 w-full transition-all duration-300 ease-out ${showSummary ? 'max-w-4xl' : 'max-w-2xl'}`}
                style={{
                    opacity: isAnimating ? 1 : 0,
                    transform: isAnimating ? 'scale(1)' : 'scale(0.95)',
                    zIndex: 10000
                }}
            >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none"></div>
                {renderContent()}
            </div>
        </div>
    )
}

