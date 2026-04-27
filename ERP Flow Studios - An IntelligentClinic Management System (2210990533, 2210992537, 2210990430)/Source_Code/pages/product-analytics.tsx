import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import { useToast } from '../hooks/useToast'
import ToastNotification from '../components/ToastNotification'
import RefreshButton from '../components/RefreshButton'
import CustomSelect from '../components/CustomSelect'
import { useDataCache } from '../contexts/DataCacheContext'
import { useDoctor } from '../contexts/DoctorContext'
import * as XLSX from 'xlsx'
import { themeStyle } from '../lib/theme'
import ThemedScrollArea from '../components/ThemedScrollArea'

// Dynamically import Chart.js components to avoid SSR issues
const Line = dynamic(() => import('react-chartjs-2').then((mod) => mod.Line), { ssr: false })
const Bar = dynamic(() => import('react-chartjs-2').then((mod) => mod.Bar), { ssr: false })

// Register Chart.js components on client side only
if (typeof window !== 'undefined') {
    import('chart.js').then((ChartJS) => {
        ChartJS.Chart.register(
            ChartJS.CategoryScale,
            ChartJS.LinearScale,
            ChartJS.PointElement,
            ChartJS.LineElement,
            ChartJS.BarElement,
            ChartJS.Title,
            ChartJS.Tooltip,
            ChartJS.Legend,
            ChartJS.Filler
        )
    })
}

export default function ProductAnalyticsPage() {
    const [products, setProducts] = useState<any[]>([])
    const [purchaseOrders, setPurchaseOrders] = useState<any[]>([])
    const [invoices, setInvoices] = useState<any[]>([])
    const [dataLoading, setDataLoading] = useState(true)
    const [selectedProduct, setSelectedProduct] = useState<string>('')
    const [productLedgerData, setProductLedgerData] = useState<any>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [sortField, setSortField] = useState<string>('productName')
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
    const [selectedProducts, setSelectedProducts] = useState<string[]>([])
    const router = useRouter()
    const { toasts, removeToast, showSuccess, showError } = useToast()
    const { getCache, setCache } = useDataCache()
    const { selectedDoctorId } = useDoctor()

    const fetchAllData = useCallback(async () => {
        setDataLoading(true)
        try {
            const params = new URLSearchParams()
            if (selectedDoctorId) {
                params.append('doctorId', selectedDoctorId.toString())
            }
            const queryString = params.toString() ? `?${params.toString()}` : ''

            const [productsRes, posRes, invoicesRes] = await Promise.all([
                fetch(`/api/products/public${queryString}`),
                fetch(`/api/purchase-orders${queryString}`),
                fetch(`/api/customer-invoices${queryString}`)
            ])

            const [productsData, posData, invoicesData] = await Promise.all([
                productsRes.json(),
                posRes.json(),
                invoicesRes.json()
            ])

            const analyticsData = {
                products: Array.isArray(productsData) ? productsData : [],
                purchaseOrders: Array.isArray(posData) ? posData.map((po: any) => ({
                    ...po,
                    orderDate: new Date(po.orderDate),
                    items: po.items || []
                })) : [],
                invoices: Array.isArray(invoicesData) ? invoicesData.map((inv: any) => ({
                    ...inv,
                    createdAt: new Date(inv.createdAt),
                    items: inv.items || []
                })) : []
            }

            setProducts(analyticsData.products)
            setPurchaseOrders(analyticsData.purchaseOrders)
            setInvoices(analyticsData.invoices)

            const cacheKey = `product_analytics_${selectedDoctorId || 'all'}`
            setCache(cacheKey, analyticsData)

            // Generate ledger data
            generateAllProductsData(analyticsData.products, analyticsData.purchaseOrders, analyticsData.invoices)
        } catch (error) {
            showError('Failed to load product data')
        } finally {
            setDataLoading(false)
        }
    }, [selectedDoctorId, setCache, showError])

    useEffect(() => {
        fetchAllData()
    }, [fetchAllData])

    // Generate All Products Analytics Data
    const generateAllProductsData = useCallback((prods: any[], pos: any[], invs: any[]) => {
        // Get recently sold products (top 10)
        const recentlySold = prods
            .map(product => {
                const salesCount = invs.reduce((sum, inv) => {
                    const items = inv.items || []
                    const productSale = items.find((item: any) => item.productId === product.id)
                    return sum + (productSale?.quantity || 0)
                }, 0)
                return { ...product, salesCount }
            })
            .filter(p => p.salesCount > 0)
            .sort((a, b) => b.salesCount - a.salesCount)
            .slice(0, 10)

        setSelectedProducts(recentlySold.map(p => p.id))

        // Generate ledger entries for all products
        const ledgerEntries = prods.map(product => {
            const purchases = pos.reduce((sum, po) => {
                const items = po.items || []
                const productPurchase = items.find((item: any) => item.productId === product.id)
                return sum + (productPurchase?.quantity || 0)
            }, 0)

            const sales = invs.reduce((sum, inv) => {
                const items = inv.items || []
                const productSale = items.find((item: any) => item.productId === product.id)
                return sum + (productSale?.quantity || 0)
            }, 0)

            const closingStock = product.quantity || 0
            const openingStock = closingStock - purchases + sales
            const stockValue = closingStock * (product.priceRupees || 0)

            return {
                productId: product.id,
                productName: product.name,
                openingStock,
                purchases,
                sales,
                closingStock,
                stockValue,
                pricePerUnit: product.priceRupees || 0
            }
        })

        setProductLedgerData({ entries: ledgerEntries })
    }, [])

    // Generate chart data for selected product
    const getProductChartData = (productId: string) => {
        const product = products.find(p => p.id === productId)
        if (!product) return null

        // Get last 12 months data
        const months = []
        const salesData = []
        const purchaseData = []

        for (let i = 11; i >= 0; i--) {
            const date = new Date()
            date.setMonth(date.getMonth() - i)
            const monthStr = date.toLocaleString('default', { month: 'short', year: '2-digit' })
            months.push(monthStr)

            // Calculate sales for this month
            const monthSales = invoices.reduce((sum, inv) => {
                const invDate = new Date(inv.createdAt)
                if (invDate.getMonth() === date.getMonth() && invDate.getFullYear() === date.getFullYear()) {
                    const items = inv.items || []
                    const productSale = items.find((item: any) => item.productId === productId)
                    return sum + (productSale?.quantity || 0)
                }
                return sum
            }, 0)

            // Calculate purchases for this month
            const monthPurchases = purchaseOrders.reduce((sum, po) => {
                const poDate = new Date(po.orderDate)
                if (poDate.getMonth() === date.getMonth() && poDate.getFullYear() === date.getFullYear()) {
                    const items = po.items || []
                    const productPurchase = items.find((item: any) => item.productId === productId)
                    return sum + (productPurchase?.quantity || 0)
                }
                return sum
            }, 0)

            salesData.push(monthSales)
            purchaseData.push(monthPurchases)
        }

        return { months, salesData, purchaseData }
    }

    // Get bar chart data for multiple products
    const getProductsBarChartData = () => {
        const selectedProductsData = selectedProducts
            .map(id => products.find(p => p.id === id))
            .filter(Boolean)
            .slice(0, 10)

        const labels = selectedProductsData.map(p => p?.name.substring(0, 15) || '')
        const salesData = selectedProductsData.map(p => {
            return invoices.reduce((sum, inv) => {
                const items = inv.items || []
                const productSale = items.find((item: any) => item.productId === p?.id)
                return sum + (productSale?.quantity || 0)
            }, 0)
        })

        const purchaseData = selectedProductsData.map(p => {
            return purchaseOrders.reduce((sum, po) => {
                const items = po.items || []
                const productPurchase = items.find((item: any) => item.productId === p?.id)
                return sum + (productPurchase?.quantity || 0)
            }, 0)
        })

        return { labels, salesData, purchaseData }
    }

    // Single-page filtered ledger (scrollable viewport)
    const getPaginatedData = (): { data: any[], total: number } => {
        if (!productLedgerData) return { data: [], total: 0 }
        
        let filtered = productLedgerData.entries.filter((entry: any) =>
            entry.productName.toLowerCase().includes(searchTerm.toLowerCase())
        )

        // Apply sorting
        filtered = filtered.sort((a: any, b: any) => {
            const aValue = a[sortField]
            const bValue = b[sortField]
            
            if (sortOrder === 'asc') {
                return aValue > bValue ? 1 : -1
            } else {
                return aValue < bValue ? 1 : -1
            }
        })

        const totalFiltered = filtered.length
        const paginatedData = filtered
        
        return { data: paginatedData, total: totalFiltered }
    }

    const exportProductLedgerToExcel = () => {
        if (!productLedgerData) return

        const fileName = `All_Products_Ledger_${new Date().toISOString().split('T')[0]}.xlsx`
        const wb = XLSX.utils.book_new()

        const data = [
            ['All Products Ledger'],
            ['Generated', new Date().toLocaleString()],
            [''],
            ['Product Name', 'Opening Stock', 'Purchases', 'Sales', 'Closing Stock', 'Stock Value', 'Price/Unit'],
            ...productLedgerData.entries.map((entry: any) => [
                entry.productName,
                entry.openingStock,
                entry.purchases,
                entry.sales,
                entry.closingStock,
                entry.stockValue.toFixed(2),
                entry.pricePerUnit.toFixed(2)
            ])
        ]

        const ws = XLSX.utils.aoa_to_sheet(data)
        XLSX.utils.book_append_sheet(wb, ws, 'Product Ledger')
        XLSX.writeFile(wb, fileName)
        showSuccess('Product ledger exported successfully!')
    }

    const paginatedResult = getPaginatedData()

    return (
        <>
            <ToastNotification toasts={toasts} removeToast={removeToast} />

            <div className="p-4 sm:p-6">
                <div className="max-w-7xl mx-auto">
                    {/* Header */}
                    <div className="mb-6 flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-indigo-600 dark:from-purple-400 dark:to-indigo-400">All Products Analytics</h1>
                            <p className="text-gray-600 dark:text-gray-400 mt-1">Comprehensive product performance and inventory tracking</p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => router.push('/analytics')}
                                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-all font-medium shadow-md"
                            >
                                ← Back
                            </button>
                            <RefreshButton onRefresh={fetchAllData} />
                            <button
                                onClick={exportProductLedgerToExcel}
                                className="px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-600 text-white rounded-lg hover:from-sky-700 hover:to-blue-700 transition-all font-medium flex items-center gap-2 shadow-md"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                Export Excel
                            </button>
                        </div>
                    </div>

                    {dataLoading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-purple-600"></div>
                        </div>
                    ) : (
                        <>
                            {/* Charts Section */}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                                {/* Line Chart - Individual Product */}
                                <div className="relative rounded-xl border border-purple-200/30 dark:border-purple-700/30 bg-gradient-to-br from-white via-purple-50/30 to-white dark:from-gray-800 dark:via-purple-900/20 dark:to-gray-800 shadow-lg shadow-purple-500/5 dark:shadow-purple-500/10 p-6 backdrop-blur-sm">
                                    <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-purple-500/5 to-transparent dark:from-purple-500/10 pointer-events-none"></div>
                                    <div className="relative">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                            <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                                                <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                                                </svg>
                                            </div>
                                            Product Trend Analysis
                                        </h3>
                                        <CustomSelect
                                            value={selectedProduct}
                                            onChange={(value) => setSelectedProduct(value)}
                                            options={products.map(p => ({ value: p.id, label: p.name }))}
                                            placeholder="Select Product"
                                            className="text-sm mb-3"
                                        />
                                        {selectedProduct && (() => {
                                            const chartData = getProductChartData(selectedProduct)
                                            if (!chartData) return null
                                            
                                            const data = {
                                                labels: chartData.months,
                                                datasets: [
                                                    {
                                                        label: 'Sales (Out)',
                                                        data: chartData.salesData,
                                                        borderColor: themeStyle.chartRed(1),
                                                        backgroundColor: themeStyle.chartRed(0.1),
                                                        fill: true,
                                                        tension: 0.4
                                                    },
                                                    {
                                                        label: 'Purchases (In)',
                                                        data: chartData.purchaseData,
                                                        borderColor: themeStyle.chartGreen(1),
                                                        backgroundColor: themeStyle.chartGreen(0.1),
                                                        fill: true,
                                                        tension: 0.4
                                                    }
                                                ]
                                            }

                                            const options = {
                                                responsive: true,
                                                maintainAspectRatio: false,
                                                plugins: {
                                                    legend: { position: 'top' as const },
                                                    tooltip: {
                                                        mode: 'index' as const,
                                                        intersect: false
                                                    }
                                                },
                                                scales: {
                                                    y: { beginAtZero: true }
                                                }
                                            }

                                            return <div className="h-[280px]"><Line data={data} options={options} /></div>
                                        })()}
                                    </div>
                                </div>

                                {/* Bar Chart - Multiple Products */}
                                <div className="relative rounded-xl border border-indigo-200/30 dark:border-indigo-700/30 bg-gradient-to-br from-white via-indigo-50/30 to-white dark:from-gray-800 dark:via-indigo-900/20 dark:to-gray-800 shadow-lg shadow-indigo-500/5 dark:shadow-indigo-500/10 p-6 backdrop-blur-sm">
                                    <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500/5 to-transparent dark:from-indigo-500/10 pointer-events-none"></div>
                                    <div className="relative">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                                                <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                                </svg>
                                            </div>
                                            Top Products Comparison
                                        </h3>
                                        <div className="flex flex-wrap gap-2 mb-2">
                                            {products.slice(0, 15).map(p => (
                                                <button
                                                    key={p.id}
                                                    onClick={() => {
                                                        if (selectedProducts.includes(p.id)) {
                                                            setSelectedProducts(selectedProducts.filter(id => id !== p.id))
                                                        } else if (selectedProducts.length < 10) {
                                                            setSelectedProducts([...selectedProducts, p.id])
                                                        }
                                                    }}
                                                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                                                        selectedProducts.includes(p.id)
                                                            ? 'bg-indigo-600 text-white shadow-md'
                                                            : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                                                    }`}
                                                    disabled={!selectedProducts.includes(p.id) && selectedProducts.length >= 10}
                                                >
                                                    {p.name.substring(0, 12)}
                                                </button>
                                            ))}
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Select up to 10 products ({selectedProducts.length}/10)</p>
                                        {(() => {
                                            const chartData = getProductsBarChartData()
                                            
                                            const data = {
                                                labels: chartData.labels,
                                                datasets: [
                                                    {
                                                        label: 'Sales',
                                                        data: chartData.salesData,
                                                        backgroundColor: themeStyle.chartRed(0.7),
                                                    },
                                                    {
                                                        label: 'Purchases',
                                                        data: chartData.purchaseData,
                                                        backgroundColor: themeStyle.chartGreen(0.7),
                                                    }
                                                ]
                                            }

                                            const options = {
                                                responsive: true,
                                                maintainAspectRatio: false,
                                                plugins: {
                                                    legend: { position: 'top' as const }
                                                },
                                                scales: {
                                                    y: { beginAtZero: true }
                                                }
                                            }

                                            return <div className="h-[220px]"><Bar data={data} options={options} /></div>
                                        })()}
                                    </div>
                                </div>
                            </div>

                            {/* Product Ledger Table */}
                            <div className="relative rounded-xl border border-gray-200/30 dark:border-gray-700/30 bg-gradient-to-br from-white via-gray-50/30 to-white dark:from-gray-800 dark:via-gray-900/20 dark:to-gray-800 shadow-lg shadow-gray-500/5 dark:shadow-gray-500/10 backdrop-blur-sm overflow-hidden">
                                <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-gray-500/5 to-transparent dark:from-gray-500/10 pointer-events-none"></div>
                                <div className="relative">
                                    <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                            <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            Product Ledger
                                        </h3>
                                        
                                        {/* Search and Sort Controls */}
                                        <div className="flex flex-col sm:flex-row gap-4">
                                            <div className="flex-1">
                                                <input
                                                    type="text"
                                                    value={searchTerm}
                                                    onChange={(e) => setSearchTerm(e.target.value)}
                                                    placeholder="Search products..."
                                                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                                />
                                            </div>
                                            <div className="flex gap-2">
                                                <select
                                                    value={sortField}
                                                    onChange={(e) => setSortField(e.target.value)}
                                                    className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 transition-all"
                                                >
                                                    <option value="productName">Name</option>
                                                    <option value="sales">Sales</option>
                                                    <option value="purchases">Purchases</option>
                                                    <option value="closingStock">Stock</option>
                                                    <option value="stockValue">Value</option>
                                                </select>
                                                <button
                                                    onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all font-medium shadow-md"
                                                >
                                                    {sortOrder === 'asc' ? '↑' : '↓'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Table */}
                                    <ThemedScrollArea axis="both" className="max-h-[32rem]">
                                        <table className="w-full">
                                            <thead className="bg-gray-100 dark:bg-gray-700/50">
                                                <tr>
                                                    <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Product</th>
                                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Opening</th>
                                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Purchases</th>
                                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Sales</th>
                                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Closing</th>
                                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Stock Value</th>
                                                    <th className="px-6 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider">Price/Unit</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                {paginatedResult.data.map((entry: any, index: number) => (
                                                    <tr key={entry.productId} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                                                        <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">{entry.productName}</td>
                                                        <td className="px-6 py-4 text-sm text-right text-gray-700 dark:text-gray-300">{entry.openingStock}</td>
                                                        <td className="px-6 py-4 text-sm text-right text-sky-600 dark:text-sky-400 font-semibold">{entry.purchases}</td>
                                                        <td className="px-6 py-4 text-sm text-right text-red-600 dark:text-red-400 font-semibold">{entry.sales}</td>
                                                        <td className="px-6 py-4 text-sm text-right text-blue-600 dark:text-blue-400 font-semibold">{entry.closingStock}</td>
                                                        <td className="px-6 py-4 text-sm text-right text-blue-600 dark:text-blue-400 font-bold">₹{entry.stockValue.toFixed(2)}</td>
                                                        <td className="px-6 py-4 text-sm text-right text-gray-600 dark:text-gray-400">₹{entry.pricePerUnit.toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </ThemedScrollArea>

                                    <div className="p-4 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400">
                                        Showing all {paginatedResult.total} products in a scrollable list
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </>
    )
}

