import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../hooks/useToast'
import ToastNotification from '../components/ToastNotification'
import RefreshButton from '../components/RefreshButton'
import CustomSelect from '../components/CustomSelect'
import { useDataCache } from '../contexts/DataCacheContext'
import { useDoctor } from '../contexts/DoctorContext'
import * as XLSX from 'xlsx'
import { formatPrice, formatQuantity, formatCurrency } from '../lib/utils'
import { themeStyle } from '../lib/theme'
import { useDefaultValues } from '../hooks/useDefaultValues'
import { isBasicPlan } from '../lib/subscription'
import StandardFeatureBadge from '../components/StandardFeatureBadge'

export default function AnalyticsPage() {
    const { defaults: invoiceDefaults } = useDefaultValues('invoices')
    const [loading, setLoading] = useState(false)
    const [activeReport, setActiveReport] = useState<string | null>(null)
    const [reportData, setReportData] = useState<any>(null)
    const [startDate, setStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0])
    const [partyId, setPartyId] = useState('')
    const [partyType, setPartyType] = useState<'customer' | 'supplier'>('customer')
    const [selectedSupplierId, setSelectedSupplierId] = useState('')
    const [paymentAmount, setPaymentAmount] = useState('')
    const [gstRate, setGstRate] = useState(invoiceDefaults.gstRate ?? 5)
    const [isGSTLocked, setIsGSTLocked] = useState(true)
    const [customers, setCustomers] = useState<any[]>([])
    const [suppliers, setSuppliers] = useState<any[]>([])
    const [products, setProducts] = useState<any[]>([])
    const [purchaseOrders, setPurchaseOrders] = useState<any[]>([])
    const [invoices, setInvoices] = useState<any[]>([])
    const [dataLoading, setDataLoading] = useState(true)
    const { user } = useAuth()
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

            const [customersRes, suppliersRes, productsRes, posRes, invoicesRes] = await Promise.all([
                fetch('/api/patients'),
                fetch('/api/suppliers'),
                fetch(`/api/products/public${queryString}`),
                fetch(`/api/purchase-orders${queryString}`),
                fetch(`/api/customer-invoices${queryString}`)
            ])

            const [customersData, suppliersData, productsData, posData, invoicesData] = await Promise.all([
                customersRes.json(),
                suppliersRes.json(),
                productsRes.json(),
                posRes.json(),
                invoicesRes.json()
            ])

            const analyticsData = {
                customers: Array.isArray(customersData) ? customersData : [],
                suppliers: Array.isArray(suppliersData) ? suppliersData : [],
                products: Array.isArray(productsData) ? productsData : [],
                purchaseOrders: Array.isArray(posData) ? posData : [],
                invoices: Array.isArray(invoicesData) ? invoicesData : []
            }

            setCustomers(analyticsData.customers)
            setSuppliers(analyticsData.suppliers)
            setProducts(analyticsData.products)
            setPurchaseOrders(analyticsData.purchaseOrders)
            setInvoices(analyticsData.invoices)

            const cacheKey = `analytics_${selectedDoctorId || 'all'}`
            setCache(cacheKey, analyticsData)
        } catch (error) {
        } finally {
            setDataLoading(false)
        }
    }, [selectedDoctorId, setCache])

    // Sync GST rate with default values
    useEffect(() => {
        if (invoiceDefaults.gstRate !== undefined) {
            setGstRate(invoiceDefaults.gstRate)
        }
    }, [invoiceDefaults])



    useEffect(() => {
        const cacheKey = `analytics_${selectedDoctorId || 'all'}`
        const cachedAnalytics = getCache<any>(cacheKey)
        if (cachedAnalytics) {
            setCustomers(cachedAnalytics.customers || [])
            setSuppliers(cachedAnalytics.suppliers || [])
            setProducts(cachedAnalytics.products || [])
            setPurchaseOrders(cachedAnalytics.purchaseOrders || [])
            setInvoices(cachedAnalytics.invoices || [])
            setDataLoading(false)
            // Fetch in background to refresh data without showing loading state
            const refreshData = async () => {
                try {
                    const params = new URLSearchParams()
                    if (selectedDoctorId) {
                        params.append('doctorId', selectedDoctorId.toString())
                    }
                    const queryString = params.toString() ? `?${params.toString()}` : ''

                    const [customersRes, suppliersRes, productsRes, posRes, invoicesRes] = await Promise.all([
                        fetch('/api/patients'),
                        fetch('/api/suppliers'),
                        fetch(`/api/products/public${queryString}`),
                        fetch(`/api/purchase-orders${queryString}`),
                        fetch(`/api/customer-invoices${queryString}`)
                    ])

                    const [customersData, suppliersData, productsData, posData, invoicesData] = await Promise.all([
                        customersRes.json(),
                        suppliersRes.json(),
                        productsRes.json(),
                        posRes.json(),
                        invoicesRes.json()
                    ])

                    const analyticsData = {
                        customers: Array.isArray(customersData) ? customersData : [],
                        suppliers: Array.isArray(suppliersData) ? suppliersData : [],
                        products: Array.isArray(productsData) ? productsData : [],
                        purchaseOrders: Array.isArray(posData) ? posData : [],
                        invoices: Array.isArray(invoicesData) ? invoicesData : []
                    }

                    setCustomers(analyticsData.customers)
                    setSuppliers(analyticsData.suppliers)
                    setProducts(analyticsData.products)
                    setPurchaseOrders(analyticsData.purchaseOrders)
                    setInvoices(analyticsData.invoices)
                    setCache(cacheKey, analyticsData)
                } catch (error) {
                }
            }
            refreshData()
        } else {
            // No cache, fetch with loading state
            fetchAllData()
        }

        return () => {
            setCustomers([])
            setSuppliers([])
            setProducts([])
            setPurchaseOrders([])
            setInvoices([])
        }
    }, [selectedDoctorId, getCache])

    useEffect(() => {
        const handleDoctorChange = () => {
            fetchAllData()
        }

        window.addEventListener('doctor-changed', handleDoctorChange)
        return () => window.removeEventListener('doctor-changed', handleDoctorChange)
    }, [fetchAllData])

    // Calculate metrics
    const totalProducts = products.length
    const totalStockValue = products.reduce((sum, p) => sum + (p.quantity * (p.priceRupees || 0)), 0)
    const activeSuppliers = suppliers.filter(s => s.status === 'active').length
    const totalPurchaseValue = purchaseOrders.reduce((sum, po) => sum + (po.totalAmount || 0), 0)
    const totalInvoiceValue = invoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0)
    const totalReceivables = invoices.reduce((sum, inv) => sum + (inv.balanceAmount || 0), 0)
    const pendingPOs = purchaseOrders.filter(po => po.status === 'pending').length
    const unpaidInvoices = invoices.filter(inv => inv.status === 'unpaid' || inv.status === 'partial').length

    const generateReport = async (reportType: string) => {
        setLoading(true)
        setActiveReport(reportType)
        try {
            let url = ''
            const params = new URLSearchParams()

            switch (reportType) {
                case 'gst':
                    params.append('startDate', startDate)
                    params.append('endDate', endDate)
                    params.append('gstRate', gstRate.toString())
                    url = `/api/reports/gst-report?${params.toString()}`
                    break
                case 'party-ledger':
                    if (!partyId) {
                        showError('Please select a party')
                        setLoading(false)
                        return
                    }
                    params.append('partyId', partyId)
                    params.append('partyType', partyType)
                    params.append('startDate', startDate)
                    params.append('endDate', endDate)
                    url = `/api/reports/party-ledger?${params.toString()}`
                    break
                case 'product-ledger':
                    if (!partyId) {
                        showError('Please select a product')
                        setLoading(false)
                        return
                    }
                    params.append('productId', partyId)
                    params.append('startDate', startDate)
                    params.append('endDate', endDate)
                    url = `/api/reports/product-ledger?${params.toString()}`
                    break
                case 'profit-loss':
                    params.append('startDate', startDate)
                    params.append('endDate', endDate)
                    url = `/api/reports/profit-loss?${params.toString()}`
                    break
                case 'supplier-transactions':
                    if (!selectedSupplierId) {
                        showError('Please select a supplier')
                        setLoading(false)
                        return
                    }
                    if (!paymentAmount || Number(paymentAmount) <= 0) {
                        showError('Please enter a valid payment amount')
                        setLoading(false)
                        return
                    }
                    params.append('supplierId', selectedSupplierId)
                    params.append('paymentAmount', paymentAmount)
                    params.append('startDate', startDate)
                    params.append('endDate', endDate)
                    url = `/api/reports/supplier-transactions?${params.toString()}`
                    break
            }

            const response = await fetch(url)
            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to generate report')
            }

            setReportData(data)
            
            // If supplier transactions report, record the payment in the database
            if (reportType === 'supplier-transactions' && selectedSupplierId && paymentAmount) {
                try {
                    const paymentResponse = await fetch('/api/suppliers/record-payment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            supplierId: selectedSupplierId,
                            paymentAmount: paymentAmount
                        })
                    })
                    
                    const paymentResult = await paymentResponse.json()
                    
                    if (paymentResponse.ok) {
                        showSuccess('Payment recorded and balance updated!')
                        // Clear the fields after successful payment
                        setSelectedSupplierId('')
                        setPaymentAmount('')
                        // Refresh suppliers data to show updated balance
                        const suppliersRes = await fetch('/api/suppliers')
                        const suppliersData = await suppliersRes.json()
                        if (Array.isArray(suppliersData)) {
                            setSuppliers(suppliersData)
                            // Update both analytics cache and global suppliers cache
                            const cacheKey = `analytics_${selectedDoctorId || 'all'}`
                            const cachedAnalytics = getCache<any>(cacheKey)
                            if (cachedAnalytics) {
                                setCache(cacheKey, { ...cachedAnalytics, suppliers: suppliersData })
                            }
                            // Update global suppliers cache so suppliers page reflects changes
                            setCache('suppliers', suppliersData)
                        }
                    } else {
                        showError(paymentResult.error || 'Failed to record payment')
                    }
                } catch (paymentError) {
                    showError('Failed to record payment')
                }
            } else {
                showSuccess('Report generated successfully!')
            }
        } catch (error: any) {
            showError(error.message || 'Failed to generate report')
            setReportData(null)
        } finally {
            setLoading(false)
        }
    }

    const exportToExcel = () => {
        if (isBasicPlan(user?.clinic?.subscriptionPlan)) {
            showError('Export is available in Standard plan.')
            router.push('/upgrade')
            return
        }

        if (!reportData || !activeReport) return

        let dataToExport: any[] = []
        let fileName = ''

        switch (activeReport) {
            case 'gst':
                fileName = `GST_Report_${startDate}_to_${endDate}.xlsx`
                const wb = XLSX.utils.book_new()

                // Summary sheet
                const summaryData = [
                    ['GST Report Summary'],
                    ['Period', `${startDate} to ${endDate}`],
                    [''],
                    ['Total Invoices', reportData.summary.totalInvoices],
                    ['Total Sales', reportData.summary.totalSales],
                    ['Total Tax', reportData.summary.totalTax],
                    ['Total Discount', reportData.summary.totalDiscount],
                    ['Net Sales', reportData.summary.netSales]
                ]
                const summarySheet = XLSX.utils.aoa_to_sheet(summaryData)
                XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary')

                // Tax breakdown sheet
                const taxData = [['Tax Rate', 'Taxable Amount', 'CGST', 'SGST', 'IGST', 'Total Tax']]
                reportData.taxBreakdown.forEach((item: any) => {
                    taxData.push([
                        `${item.taxRate}%`,
                        item.taxableAmount,
                        item.cgst,
                        item.sgst,
                        item.igst,
                        item.totalTax
                    ])
                })
                const taxSheet = XLSX.utils.aoa_to_sheet(taxData)
                XLSX.utils.book_append_sheet(wb, taxSheet, 'Tax Breakdown')

                // HSN summary sheet
                const hsnData = [['HSN Code', 'Description', 'Quantity', 'Value', 'Tax Amount']]
                reportData.hsnSummary.forEach((item: any) => {
                    hsnData.push([
                        item.hsnCode,
                        item.description,
                        item.quantity,
                        item.value,
                        item.taxAmount
                    ])
                })
                const hsnSheet = XLSX.utils.aoa_to_sheet(hsnData)
                XLSX.utils.book_append_sheet(wb, hsnSheet, 'HSN Summary')

                XLSX.writeFile(wb, fileName)
                return

            case 'party-ledger':
                fileName = `Party_Ledger_${reportData.partyInfo.name}.xlsx`
                dataToExport = [
                    ['Party Ledger'],
                    ['Party Name', reportData.partyInfo.name],
                    ['Phone', reportData.partyInfo.phone || ''],
                    ['Email', reportData.partyInfo.email || ''],
                    [''],
                    ['Opening Balance', reportData.openingBalance],
                    [''],
                    ['Date', 'Type', 'Reference', 'Debit', 'Credit', 'Balance'],
                    ...reportData.entries.map((entry: any) => [
                        new Date(entry.date).toLocaleDateString(),
                        entry.type,
                        entry.reference,
                        entry.debit,
                        entry.credit,
                        entry.balance
                    ]),
                    [''],
                    ['Closing Balance', reportData.closingBalance]
                ]
                break

            case 'product-ledger':
            case 'all-products':
                fileName = `Product_Ledger_${new Date().toISOString().split('T')[0]}.xlsx`
                const productWb = XLSX.utils.book_new()

                // Create summary sheet
                const productSummary = [
                    ['Product Ledger Report'],
                    ['Period', `${startDate} to ${endDate}`],
                    ['Generated', new Date().toLocaleString()],
                    [''],
                    ['Product', 'Opening Stock', 'Purchases', 'Sales', 'Closing Stock', 'Stock Value']
                ]

                if (reportData?.entries) {
                    reportData.entries.forEach((entry: any) => {
                        productSummary.push([
                            entry.productName,
                            entry.openingStock,
                            entry.purchases,
                            entry.sales,
                            entry.closingStock,
                            entry.stockValue
                        ])
                    })
                }

                const productSummarySheet = XLSX.utils.aoa_to_sheet(productSummary)
                XLSX.utils.book_append_sheet(productWb, productSummarySheet, 'Product Ledger')

                XLSX.writeFile(productWb, fileName)
                return

            default:
                showError('Export not available for this report')
                return
        }

        if (dataToExport.length > 0) {
            const ws = XLSX.utils.aoa_to_sheet(dataToExport)
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, 'Report')
            XLSX.writeFile(wb, fileName)
            showSuccess('Report exported successfully!')
        }
    }

    return (
        <>
            <ToastNotification toasts={toasts} removeToast={removeToast} />

            <div className="p-4 sm:p-6">
                <div className="max-w-7xl mx-auto">
                    <div className="mb-6 flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">Analytics & Reports</h1>
                            <p className="text-gray-600 dark:text-gray-400 mt-1">View key metrics and generate comprehensive financial reports</p>
                        </div>
                        <RefreshButton onRefresh={fetchAllData} />
                    </div>

                    {/* Key Metrics Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                        {/* Total Products */}
                        <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-white dark:from-gray-800 dark:via-blue-900/20 dark:to-gray-800 shadow-lg shadow-blue-500/5 dark:shadow-blue-500/10 p-6 hover:shadow-xl transition-all duration-300 cursor-pointer backdrop-blur-sm">
                            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-500/5 to-transparent dark:from-blue-500/10 pointer-events-none"></div>
                            <div className="relative">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                                        <span className="text-2xl">📦</span>
                                    </div>
                                </div>
                                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Total Products</h3>
                                {dataLoading ? (
                                    <div className="flex items-center gap-2 h-9">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                                        <span className="text-sm text-gray-500">Loading...</span>
                                    </div>
                                ) : (
                                    <p className="text-3xl font-bold text-gray-900 dark:text-white">{totalProducts}</p>
                                )}
                            </div>
                        </div>

                        {/* Stock Value */}
                        <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-white dark:from-gray-800 dark:via-blue-900/20 dark:to-gray-800 shadow-lg shadow-blue-500/5 dark:shadow-blue-500/10 p-6 hover:shadow-xl transition-all duration-300 cursor-pointer backdrop-blur-sm">
                            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-500/5 to-transparent dark:from-blue-500/10 pointer-events-none"></div>
                            <div className="relative">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                                        <span className="text-2xl">💰</span>
                                    </div>
                                </div>
                                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Stock Value</h3>
                                {dataLoading ? (
                                    <div className="flex items-center gap-2 h-9">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                                        <span className="text-sm text-gray-500">Loading...</span>
                                    </div>
                                ) : (
                                    <p className="text-3xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalStockValue)}</p>
                                )}
                            </div>
                        </div>

                        {/* Active Suppliers */}
                        <div className="relative rounded-xl border border-purple-200/30 dark:border-purple-700/30 bg-gradient-to-br from-white via-purple-50/30 to-white dark:from-gray-800 dark:via-purple-900/20 dark:to-gray-800 shadow-lg shadow-purple-500/5 dark:shadow-purple-500/10 p-6 hover:shadow-xl transition-all duration-300 cursor-pointer backdrop-blur-sm">
                            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-purple-500/5 to-transparent dark:from-purple-500/10 pointer-events-none"></div>
                            <div className="relative">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="p-3 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                                        <span className="text-2xl">🏭</span>
                                    </div>
                                </div>
                                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Active Suppliers</h3>
                                {dataLoading ? (
                                    <div className="flex items-center gap-2 h-9">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                                        <span className="text-sm text-gray-500">Loading...</span>
                                    </div>
                                ) : (
                                    <p className="text-3xl font-bold text-gray-900 dark:text-white">{activeSuppliers}</p>
                                )}
                            </div>
                        </div>

                        {/* Accounts Receivable */}
                        <div className="relative rounded-xl border border-orange-200/30 dark:border-orange-700/30 bg-gradient-to-br from-white via-orange-50/30 to-white dark:from-gray-800 dark:via-orange-900/20 dark:to-gray-800 shadow-lg shadow-orange-500/5 dark:shadow-orange-500/10 p-6 hover:shadow-xl transition-all duration-300 cursor-pointer backdrop-blur-sm">
                            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-orange-500/5 to-transparent dark:from-orange-500/10 pointer-events-none"></div>
                            <div className="relative">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="p-3 bg-orange-100 dark:bg-orange-900/50 rounded-lg">
                                        <span className="text-2xl">📊</span>
                                    </div>
                                </div>
                                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Accounts Receivable</h3>
                                {dataLoading ? (
                                    <div className="flex items-center gap-2 h-9">
                                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600"></div>
                                        <span className="text-sm text-gray-500">Loading...</span>
                                    </div>
                                ) : (
                                    <p className="text-3xl font-bold text-gray-900 dark:text-white">{formatCurrency(totalReceivables)}</p>
                                )}
                            </div>
                        </div>
                    </div>




                    {/* Reports Section */}
                    <div className="mb-6">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Financial Reports</h2>
                        <p className="text-gray-600 dark:text-gray-400 mb-2">Generate and export detailed financial reports</p>
                    </div>

                    {/* Date Range Filter */}
                    <div className="relative rounded-xl border border-indigo-200/30 dark:border-indigo-700/30 bg-gradient-to-br from-white via-indigo-50/30 to-white dark:from-gray-800 dark:via-indigo-900/20 dark:to-gray-800 shadow-lg shadow-indigo-500/5 dark:shadow-indigo-500/10 p-6 mb-8 backdrop-blur-sm">
                        <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-indigo-500/5 to-transparent dark:from-indigo-500/10 pointer-events-none"></div>
                        <div className="relative">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                Report Period
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Start Date</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => setStartDate(e.target.value)}
                                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-all text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">End Date</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => setEndDate(e.target.value)}
                                        className="w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-transparent transition-all text-sm"
                                    />
                                </div>
                                <div className="sm:col-span-2 lg:col-span-1 flex items-end">
                                    <button
                                        onClick={() => {
                                            setStartDate(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0])
                                            setEndDate(new Date().toISOString().split('T')[0])
                                        }}
                                        className="w-full px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all font-medium shadow-md text-sm"
                                    >
                                        This Month
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Report Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">{/* GST Report */}
                        <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-white dark:from-gray-800 dark:via-blue-900/20 dark:to-gray-800 shadow-lg shadow-blue-500/5 dark:shadow-blue-500/10 p-6 hover:shadow-xl transition-all duration-300 cursor-pointer backdrop-blur-sm"
                            onClick={() => !loading && generateReport('gst')}>
                            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-blue-500/5 to-transparent dark:from-blue-500/10 pointer-events-none"></div>
                            <div className="relative">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-lg">
                                        <svg className="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                        </svg>
                                    </div>
                                    {loading && activeReport === 'gst' && (
                                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                                    )}
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">GST Report</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Tax summary and compliance report</p>
                                
                                {/* GST Rate Control */}
                                <div className="mb-3 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-700">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-xs font-medium text-gray-700 dark:text-gray-300">GST Rate (Inclusive)</label>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setIsGSTLocked(!isGSTLocked)
                                            }}
                                            className="p-1 hover:bg-blue-100 dark:hover:bg-blue-800 rounded transition-colors"
                                            title={isGSTLocked ? 'Unlock to edit' : 'Lock rate'}
                                        >
                                            {isGSTLocked ? (
                                                <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                </svg>
                                            ) : (
                                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                                                </svg>
                                            )}
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="number"
                                            value={gstRate}
                                            onChange={(e) => {
                                                e.stopPropagation()
                                                setGstRate(Number(e.target.value))
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            disabled={isGSTLocked}
                                            className="flex-1 px-3 py-1.5 border border-blue-300 dark:border-blue-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white text-sm disabled:bg-gray-100 dark:disabled:bg-gray-800 disabled:cursor-not-allowed"
                                            min="0"
                                            max="100"
                                            step="0.1"
                                        />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">%</span>
                                    </div>
                                    <div className="flex items-center justify-between mt-2 text-xs">
                                        <span className="text-gray-600 dark:text-gray-400">CGST:</span>
                                        <span className="font-medium text-blue-600 dark:text-blue-400">{formatQuantity(gstRate / 2)}%</span>
                                    </div>
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-gray-600 dark:text-gray-400">SGST:</span>
                                        <span className="font-medium text-blue-600 dark:text-blue-400">{formatQuantity(gstRate / 2)}%</span>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Prices include GST. This rate will be extracted.</p>
                                </div>
                                
                                <button className="w-full px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all font-medium shadow-md disabled:opacity-50 disabled:cursor-not-allowed" onClick={(e) => { e.stopPropagation(); generateReport('gst'); }} disabled={loading}>
                                    {loading && activeReport === 'gst' ? 'Generating...' : 'Generate Report'}
                                </button>
                            </div>
                        </div>

                        {/* Product Ledger */}
                        <div className="relative rounded-xl border border-orange-200/30 dark:border-orange-700/30 bg-gradient-to-br from-white via-orange-50/30 to-white dark:from-gray-800 dark:via-orange-900/20 dark:to-gray-800 shadow-lg shadow-orange-500/5 dark:shadow-orange-500/10 p-6 hover:shadow-xl transition-all duration-300 backdrop-blur-sm">{/* Note: Not clickable at top level due to form inputs inside */}
                            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-orange-500/5 to-transparent dark:from-orange-500/10 pointer-events-none"></div>
                            <div className="relative">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-3 bg-orange-100 dark:bg-orange-900/50 rounded-lg">
                                            <svg className="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                            </svg>
                                        </div>
                                        {loading && activeReport === 'product-ledger' && (
                                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-600"></div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => router.push('/product-analytics')}
                                        className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg hover:from-purple-700 hover:to-indigo-700 transition-all text-sm font-medium shadow-md whitespace-nowrap flex items-center gap-2"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                        </svg>
                                        All Products
                                    </button>
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Product Ledger</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">View individual product statements</p>

                                <div className="space-y-2">
                                    <CustomSelect
                                        value={partyId}
                                        onChange={(value: string) => setPartyId(value)}
                                        options={products.map((product: any) => ({
                                            value: product.id,
                                            label: product.name
                                        }))}
                                        placeholder="Select Product"
                                        className="text-sm"
                                    />
                                    <button
                                        onClick={() => generateReport('product-ledger')}
                                        disabled={!partyId || loading}
                                        className="w-full px-4 py-2 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-lg hover:from-orange-700 hover:to-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-md"
                                    >
                                        {loading && activeReport === 'product-ledger' ? 'Generating...' : 'Generate Ledger'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Profit/Loss Report */}
                        <div className="relative rounded-xl border border-purple-200/30 dark:border-purple-700/30 bg-gradient-to-br from-white via-purple-50/30 to-white dark:from-gray-800 dark:via-purple-900/20 dark:to-gray-800 shadow-lg shadow-purple-500/5 dark:shadow-purple-500/10 p-6 hover:shadow-xl transition-all duration-300 backdrop-blur-sm">
                            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-purple-500/5 to-transparent dark:from-purple-500/10 pointer-events-none"></div>
                            <div className="relative">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-3 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                                            <svg className="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                            </svg>
                                        </div>
                                        {loading && activeReport === 'profit-loss' && (
                                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
                                        )}
                                    </div>
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Profit/Loss Report</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">View profit trends from purchase orders</p>
                                <button
                                    onClick={() => generateReport('profit-loss')}
                                    disabled={loading}
                                    className="w-full px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-md"
                                >
                                    {loading && activeReport === 'profit-loss' ? 'Generating...' : 'Get Report'}
                                </button>
                            </div>
                        </div>

                        {/* Supplier Transactions Report */}
                        <div className="relative rounded-xl border border-cyan-200/30 dark:border-cyan-700/30 bg-gradient-to-br from-white via-cyan-50/30 to-white dark:from-gray-800 dark:via-cyan-900/20 dark:to-gray-800 shadow-lg shadow-cyan-500/5 dark:shadow-cyan-500/10 p-6 hover:shadow-xl transition-all duration-300 backdrop-blur-sm">
                            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-500/5 to-transparent dark:from-cyan-500/10 pointer-events-none"></div>
                            <div className="relative">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-3 bg-cyan-100 dark:bg-cyan-900/50 rounded-lg">
                                            <svg className="w-6 h-6 text-cyan-600 dark:text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                                            </svg>
                                        </div>
                                        {loading && activeReport === 'supplier-transactions' && (
                                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-cyan-600"></div>
                                        )}
                                    </div>
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Supplier Transactions</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Track supplier payments over time</p>
                                <div className="space-y-2">
                                    <CustomSelect
                                        value={selectedSupplierId}
                                        onChange={(value: string) => setSelectedSupplierId(value)}
                                        options={suppliers.map((supplier: any) => ({
                                            value: supplier.id.toString(),
                                            label: `${supplier.name} (${formatCurrency(supplier.pendingBalance || 0)})`
                                        }))}
                                        placeholder="Select Supplier"
                                        className="text-sm"
                                    />
                                    <input
                                        type="number"
                                        value={paymentAmount}
                                        onChange={(e) => setPaymentAmount(e.target.value)}
                                        placeholder="Payment Amount *"
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 dark:bg-gray-700 dark:text-white text-sm"
                                        min="0"
                                        step="0.01"
                                    />
                                    <button
                                        onClick={() => generateReport('supplier-transactions')}
                                        disabled={!selectedSupplierId || !paymentAmount || loading}
                                        className="w-full px-4 py-2 bg-gradient-to-r from-cyan-600 to-cyan-600 text-white rounded-lg hover:from-cyan-700 hover:to-cyan-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-md"
                                    >
                                        {loading && activeReport === 'supplier-transactions' ? 'Generating...' : 'Get Report'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Report Display */}
                    {reportData && (
                        <div className="relative rounded-xl border border-gray-200/30 dark:border-gray-700/30 bg-gradient-to-br from-white via-gray-50/30 to-white dark:from-gray-800 dark:via-gray-900/20 dark:to-gray-800 shadow-lg shadow-gray-500/5 dark:shadow-gray-500/10 p-6 backdrop-blur-sm">
                            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-gray-500/5 to-transparent dark:from-gray-500/10 pointer-events-none"></div>
                            <div className="relative">
                                <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        <svg className="w-7 h-7 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        Report Results
                                    </h2>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={exportToExcel}
                                            className="relative px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-600 text-white rounded-lg hover:from-sky-700 hover:to-blue-700 transition-all font-medium flex items-center gap-2 shadow-md"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            Export to Excel
                                            {isBasicPlan(user?.clinic?.subscriptionPlan) && (
                                                <>
                                                    <span className="hidden sm:block"><StandardFeatureBadge /></span>
                                                    <span className="sm:hidden"><StandardFeatureBadge mobile /></span>
                                                </>
                                            )}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setReportData(null)
                                                setActiveReport(null)
                                            }}
                                            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all font-medium shadow-md"
                                        >
                                            Close
                                        </button>
                                    </div>
                                </div>

                                {/* GST Report Display */}
                                {activeReport === 'gst' && (
                                    <div className="space-y-6">
                                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
                                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Summary</h3>
                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Invoices</p>
                                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{reportData.summary?.totalInvoices || 0}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Sales</p>
                                                    <p className="text-2xl font-bold text-sky-600 dark:text-sky-400">{formatCurrency(reportData.summary?.totalSales || 0)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Tax</p>
                                                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(reportData.summary?.totalTax || 0)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Discount</p>
                                                    <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{formatCurrency(reportData.summary?.totalDiscount || 0)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Net Sales</p>
                                                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{formatCurrency(reportData.summary?.netSales || 0)}</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* GST Chart Visualization */}
                                        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden p-6">
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">GST Distribution</h3>
                                            <div className="h-64 flex items-end justify-around gap-4">
                                                {/* Base Amount Bar */}
                                                <div className="flex-1 flex flex-col items-center">
                                                    <div 
                                                        className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t-lg transition-all duration-500 hover:shadow-lg flex items-end justify-center pb-2"
                                                        style={{ 
                                                            height: `${Math.max(20, (reportData.summary?.netSales / reportData.summary?.totalSales * 100) || 0)}%`
                                                        }}
                                                    >
                                                        <span className="text-white font-bold text-sm">{formatCurrency(reportData.summary?.netSales || 0)}</span>
                                                    </div>
                                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-2">Base Amount</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">(excl. GST)</p>
                                                </div>
                                                {/* GST Amount Bar */}
                                                <div className="flex-1 flex flex-col items-center">
                                                    <div 
                                                        className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t-lg transition-all duration-500 hover:shadow-lg flex items-end justify-center pb-2"
                                                        style={{ 
                                                            height: `${Math.max(20, (reportData.summary?.totalTax / reportData.summary?.totalSales * 100) || 0)}%`
                                                        }}
                                                    >
                                                        <span className="text-white font-bold text-sm">₹{(reportData.summary?.totalTax || 0).toFixed(0)}</span>
                                                    </div>
                                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-2">Total GST</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">({reportData.summary?.gstRate || 0}%)</p>
                                                </div>
                                                {/* CGST Bar */}
                                                <div className="flex-1 flex flex-col items-center">
                                                    <div 
                                                        className="w-full bg-gradient-to-t from-purple-500 to-purple-400 rounded-t-lg transition-all duration-500 hover:shadow-lg flex items-end justify-center pb-2"
                                                        style={{ 
                                                            height: `${Math.max(20, (reportData.summary?.totalTax / 2 / reportData.summary?.totalSales * 100) || 0)}%`
                                                        }}
                                                    >
                                                        <span className="text-white font-bold text-sm">₹{((reportData.summary?.totalTax || 0) / 2).toFixed(0)}</span>
                                                    </div>
                                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-2">CGST</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">({((reportData.summary?.gstRate || 0) / 2).toFixed(2)}%)</p>
                                                </div>
                                                {/* SGST Bar */}
                                                <div className="flex-1 flex flex-col items-center">
                                                    <div 
                                                        className="w-full bg-gradient-to-t from-pink-500 to-pink-400 rounded-t-lg transition-all duration-500 hover:shadow-lg flex items-end justify-center pb-2"
                                                        style={{ 
                                                            height: `${Math.max(20, (reportData.summary?.totalTax / 2 / reportData.summary?.totalSales * 100) || 0)}%`
                                                        }}
                                                    >
                                                        <span className="text-white font-bold text-sm">₹{((reportData.summary?.totalTax || 0) / 2).toFixed(0)}</span>
                                                    </div>
                                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-2">SGST</p>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">({((reportData.summary?.gstRate || 0) / 2).toFixed(2)}%)</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white p-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">Tax Breakdown</h3>
                                            <div className="overflow-x-auto">
                                                <table className="w-full">
                                                    <thead className="bg-gray-100 dark:bg-gray-900">
                                                        <tr>
                                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Tax Rate</th>
                                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Taxable Amount</th>
                                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">CGST</th>
                                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">SGST</th>
                                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">IGST</th>
                                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Total Tax</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                        {reportData.taxBreakdown?.map((item: any, index: number) => (
                                                            <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                                                                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{item.taxRate}%</td>
                                                                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">₹{item.taxableAmount.toFixed(2)}</td>
                                                                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">₹{item.cgst.toFixed(2)}</td>
                                                                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">₹{item.sgst.toFixed(2)}</td>
                                                                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">₹{item.igst.toFixed(2)}</td>
                                                                <td className="px-4 py-3 text-sm text-right font-semibold text-blue-600 dark:text-blue-400">₹{item.totalTax.toFixed(2)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>

                                        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white p-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">HSN Summary</h3>
                                            <div className="overflow-x-auto">
                                                <table className="w-full">
                                                    <thead className="bg-gray-100 dark:bg-gray-900">
                                                        <tr>
                                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">HSN Code</th>
                                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Description</th>
                                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Quantity</th>
                                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Value</th>
                                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Tax Amount</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                        {reportData.hsnSummary?.map((item: any, index: number) => (
                                                            <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                                                                <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{item.hsnCode}</td>
                                                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{item.description}</td>
                                                                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{item.quantity}</td>
                                                                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">₹{item.value.toFixed(2)}</td>
                                                                <td className="px-4 py-3 text-sm text-right font-semibold text-blue-600 dark:text-blue-400">₹{item.taxAmount.toFixed(2)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Party Ledger Report Display */}
                                {activeReport === 'party-ledger' && (
                                    <div className="space-y-6">
                                        <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 rounded-lg p-6 border border-orange-200 dark:border-orange-800">
                                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Party Information</h3>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Name</p>
                                                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{reportData.partyInfo?.name}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Phone</p>
                                                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{reportData.partyInfo?.phone || 'N/A'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Opening Balance</p>
                                                    <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">₹{(reportData.openingBalance || 0).toFixed(2)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Closing Balance</p>
                                                    <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">₹{(reportData.closingBalance || 0).toFixed(2)}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white p-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">Transaction History</h3>
                                            <div className="overflow-x-auto">
                                                <table className="w-full">
                                                    <thead className="bg-gray-100 dark:bg-gray-900">
                                                        <tr>
                                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Date</th>
                                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Type</th>
                                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Reference</th>
                                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Debit</th>
                                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Credit</th>
                                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Balance</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                        {reportData.entries?.map((entry: any, index: number) => (
                                                            <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                                                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{new Date(entry.date).toLocaleDateString()}</td>
                                                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{entry.type}</td>
                                                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{entry.reference}</td>
                                                                <td className="px-4 py-3 text-sm text-right text-red-600 dark:text-red-400">₹{entry.debit.toFixed(2)}</td>
                                                                <td className="px-4 py-3 text-sm text-right text-sky-600 dark:text-sky-400">₹{entry.credit.toFixed(2)}</td>
                                                                <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900 dark:text-white">₹{entry.balance.toFixed(2)}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Product Ledger Report Display */}
                                {activeReport === 'product-ledger' && (
                                    <div className="space-y-6">
                                        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-purple-200 dark:border-purple-800">
                                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Product Information</h3>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Product Name</p>
                                                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{reportData.productInfo?.name}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Category</p>
                                                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{reportData.productInfo?.category || 'N/A'}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Current Stock</p>
                                                    <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">{reportData.productInfo?.currentStock || 0}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Price/Unit</p>
                                                    <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">₹{(reportData.productInfo?.pricePerUnit || 0).toFixed(2)}</p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t border-purple-200 dark:border-purple-700">
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Opening Stock</p>
                                                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{reportData.openingStock || 0}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Total Purchases</p>
                                                    <p className="text-lg font-semibold text-sky-600 dark:text-sky-400">{reportData.totalPurchases || 0}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Total Sales</p>
                                                    <p className="text-lg font-semibold text-red-600 dark:text-red-400">{reportData.totalSales || 0}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Stock Value</p>
                                                    <p className="text-lg font-semibold text-blue-600 dark:text-blue-400">₹{(reportData.stockValue || 0).toFixed(2)}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white p-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">Transaction History</h3>
                                            <div className="overflow-x-auto">
                                                <table className="w-full">
                                                    <thead className="bg-gray-100 dark:bg-gray-900">
                                                        <tr>
                                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Date</th>
                                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Type</th>
                                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Reference</th>
                                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Party</th>
                                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Inward</th>
                                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Outward</th>
                                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Rate</th>
                                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Amount</th>
                                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-700 dark:text-gray-300 uppercase tracking-wider">Balance</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                        {reportData.entries?.map((entry: any, index: number) => (
                                                            <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                                                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{new Date(entry.date).toLocaleDateString()}</td>
                                                                <td className="px-4 py-3 text-sm">
                                                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                                                        entry.type === 'Purchase' 
                                                                            ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400' 
                                                                            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                                                    }`}>
                                                                        {entry.type}
                                                                    </span>
                                                                </td>
                                                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{entry.reference}</td>
                                                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{entry.party}</td>
                                                                <td className="px-4 py-3 text-sm text-right text-sky-600 dark:text-sky-400 font-semibold">{entry.inward || '-'}</td>
                                                                <td className="px-4 py-3 text-sm text-right text-red-600 dark:text-red-400 font-semibold">{entry.outward || '-'}</td>
                                                                <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">₹{entry.rate.toFixed(2)}</td>
                                                                <td className="px-4 py-3 text-sm text-right text-blue-600 dark:text-blue-400 font-semibold">₹{entry.amount.toFixed(2)}</td>
                                                                <td className="px-4 py-3 text-sm text-right font-bold text-gray-900 dark:text-white">{entry.balance}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Profit/Loss Report Display */}
                                {activeReport === 'profit-loss' && (
                                    <div className="space-y-6">
                                        <div className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg p-6 border border-purple-200 dark:border-purple-800">
                                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Summary</h3>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Total Orders</p>
                                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{reportData.summary?.totalOrders || 0}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Total Purchase</p>
                                                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">₹{(reportData.summary?.totalPurchase || 0).toFixed(2)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Est. Sales</p>
                                                    <p className="text-2xl font-bold text-sky-600 dark:text-sky-400">₹{(reportData.summary?.totalEstimatedSales || 0).toFixed(2)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Total Profit</p>
                                                    <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">₹{(reportData.summary?.totalProfit || 0).toFixed(2)}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden p-6">
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Profit Trend</h3>
                                            <div className="h-96">
                                                <svg className="w-full h-full" viewBox="0 0 800 400" preserveAspectRatio="none">
                                                    <defs>
                                                        <linearGradient id="profitGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                                            <stop offset="0%" style={{ stopColor: themeStyle.chartPurple(1).replace('rgba', 'rgb').replace(/,[^,]*\)/, ')'), stopOpacity: 0.4 }} />
                                                            <stop offset="100%" style={{ stopColor: themeStyle.chartPurple(1).replace('rgba', 'rgb').replace(/,[^,]*\)/, ')'), stopOpacity: 0 }} />
                                                        </linearGradient>
                                                    </defs>
                                                    {(() => {
                                                        const data = reportData.profitData || []
                                                        if (data.length === 0) return null
                                                        
                                                        const maxProfit = Math.max(...data.map((d: any) => d.profit), 0)
                                                        const minProfit = Math.min(...data.map((d: any) => d.profit), 0)
                                                        const range = maxProfit - minProfit || 1
                                                        const padding = 40
                                                        const chartHeight = 400 - padding * 2
                                                        const chartWidth = 800 - padding * 2
                                                        const xStep = chartWidth / (data.length - 1 || 1)
                                                        
                                                        const points = data.map((d: any, i: number) => ({
                                                            x: padding + i * xStep,
                                                            y: padding + chartHeight - ((d.profit - minProfit) / range) * chartHeight
                                                        }))
                                                        
                                                        const pathData = points.map((p: { x: number; y: number }, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
                                                        const areaData = `${pathData} L ${points[points.length - 1].x} ${padding + chartHeight} L ${padding} ${padding + chartHeight} Z`
                                                        
                                                        return (
                                                            <>
                                                                {/* Grid lines */}
                                                                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                                                                    <line
                                                                        key={ratio}
                                                                        x1={padding}
                                                                        y1={padding + chartHeight * (1 - ratio)}
                                                                        x2={800 - padding}
                                                                        y2={padding + chartHeight * (1 - ratio)}
                                                                        stroke="currentColor"
                                                                        strokeWidth="1"
                                                                        opacity="0.1"
                                                                        className="text-gray-400"
                                                                    />
                                                                ))}
                                                                {/* Area */}
                                                                <path d={areaData} fill="url(#profitGradient)" />
                                                                {/* Line */}
                                                                <path d={pathData} fill="none" stroke={themeStyle.chartPurple(1)} strokeWidth="3" />
                                                                {/* Points */}
                                                                {points.map((p: { x: number; y: number }, i: number) => (
                                                                    <circle key={i} cx={p.x} cy={p.y} r="4" fill={themeStyle.chartPurple(1)} />
                                                                ))}
                                                                {/* Y-axis labels */}
                                                                {[0, 0.5, 1].map((ratio) => (
                                                                    <text
                                                                        key={ratio}
                                                                        x={padding - 10}
                                                                        y={padding + chartHeight * (1 - ratio)}
                                                                        textAnchor="end"
                                                                        alignmentBaseline="middle"
                                                                        className="text-xs fill-gray-600 dark:fill-gray-400"
                                                                    >
                                                                        ₹{(minProfit + range * ratio).toFixed(0)}
                                                                    </text>
                                                                ))}
                                                            </>
                                                        )
                                                    })()}
                                                </svg>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Supplier Transactions Report Display */}
                                {activeReport === 'supplier-transactions' && (
                                    <div className="space-y-6">
                                        <div className="bg-gradient-to-r from-cyan-50 to-cyan-50 dark:from-cyan-900/20 dark:to-cyan-900/20 rounded-lg p-6 border border-cyan-200 dark:border-cyan-800">
                                            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{reportData.summary?.supplierName}</h3>
                                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Opening Balance</p>
                                                    <p className="text-xl font-bold text-gray-900 dark:text-white">₹{(reportData.summary?.openingBalance || 0).toFixed(2)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Total Orders</p>
                                                    <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{reportData.summary?.totalOrders || 0}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Purchases</p>
                                                    <p className="text-xl font-bold text-orange-600 dark:text-orange-400">₹{(reportData.summary?.totalPurchases || 0).toFixed(2)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">Payment</p>
                                                    <p className="text-xl font-bold text-sky-600 dark:text-sky-400">₹{(reportData.summary?.payment || 0).toFixed(2)}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600 dark:text-gray-400">New Balance</p>
                                                    <p className="text-xl font-bold text-cyan-600 dark:text-cyan-400">₹{(reportData.summary?.closingBalance || 0).toFixed(2)}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden p-6">
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Balance Trend</h3>
                                            <div className="h-96">
                                                <svg className="w-full h-full" viewBox="0 0 800 400" preserveAspectRatio="none">
                                                    <defs>
                                                        <linearGradient id="balanceGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                                            <stop offset="0%" style={{ stopColor: themeStyle.chartTeal(1).replace('rgba', 'rgb').replace(/,[^,]*\)/, ')'), stopOpacity: 0.4 }} />
                                                            <stop offset="100%" style={{ stopColor: themeStyle.chartTeal(1).replace('rgba', 'rgb').replace(/,[^,]*\)/, ')'), stopOpacity: 0 }} />
                                                        </linearGradient>
                                                    </defs>
                                                    {(() => {
                                                        const data = reportData.transactions || []
                                                        if (data.length === 0) return null
                                                        
                                                        const maxBalance = Math.max(...data.map((d: any) => d.balance))
                                                        const minBalance = Math.min(...data.map((d: any) => d.balance), 0)
                                                        const range = maxBalance - minBalance || 1
                                                        const padding = 40
                                                        const chartHeight = 400 - padding * 2
                                                        const chartWidth = 800 - padding * 2
                                                        const xStep = chartWidth / (data.length - 1 || 1)
                                                        
                                                        const points: { x: number; y: number }[] = data.map((d: any, i: number) => ({
                                                            x: padding + i * xStep,
                                                            y: padding + chartHeight - ((d.balance - minBalance) / range) * chartHeight
                                                        }))
                                                        
                                                        const pathData = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
                                                        const areaData = `${pathData} L ${points[points.length - 1].x} ${padding + chartHeight} L ${padding} ${padding + chartHeight} Z`
                                                        
                                                        return (
                                                            <>
                                                                {/* Grid lines */}
                                                                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                                                                    <line
                                                                        key={ratio}
                                                                        x1={padding}
                                                                        y1={padding + chartHeight * (1 - ratio)}
                                                                        x2={800 - padding}
                                                                        y2={padding + chartHeight * (1 - ratio)}
                                                                        stroke="currentColor"
                                                                        strokeWidth="1"
                                                                        opacity="0.1"
                                                                        className="text-gray-400"
                                                                    />
                                                                ))}
                                                                {/* Area */}
                                                                <path d={areaData} fill="url(#balanceGradient)" />
                                                                {/* Line */}
                                                                <path d={pathData} fill="none" stroke="rgb(20, 184, 166)" strokeWidth="3" />
                                                                {/* Points */}
                                                                {points.map((p, i) => (
                                                                    <circle key={i} cx={p.x} cy={p.y} r="4" fill="rgb(20, 184, 166)" />
                                                                ))}
                                                                {/* Y-axis labels */}
                                                                {[0, 0.5, 1].map((ratio) => (
                                                                    <text
                                                                        key={ratio}
                                                                        x={padding - 10}
                                                                        y={padding + chartHeight * (1 - ratio)}
                                                                        textAnchor="end"
                                                                        alignmentBaseline="middle"
                                                                        className="text-xs fill-gray-600 dark:fill-gray-400"
                                                                    >
                                                                        ₹{(minBalance + range * ratio).toFixed(0)}
                                                                    </text>
                                                                ))}
                                                            </>
                                                        )
                                                    })()}
                                                </svg>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 8px;
                    height: 8px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: linear-gradient(to bottom, #8b5cf6, #6366f1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: linear-gradient(to bottom, #7c3aed, #4f46e5);
                }
            `}</style>
        </>
    )
}

