import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { formatQuantity } from '../lib/utils'
import Layout from '../components/Layout'
import Link from 'next/link'
import { useAuth } from '../contexts/AuthContext'
import { useDataCache } from '../contexts/DataCacheContext'
import RefreshButton from '../components/RefreshButton'

interface DashboardStats {
  lowStockProducts: any[]
  recentSales: number
  pendingPurchaseOrders: number
  totalRevenue: number
  unpaidInvoices: number
  expiringProducts: any[]
  topSellingProducts: any[]
  recentActivities: any[]
}

export default function Dashboard() {
  const router = useRouter()
  const [stats, setStats] = useState<DashboardStats>({
    lowStockProducts: [],
    recentSales: 0,
    pendingPurchaseOrders: 0,
    totalRevenue: 0,
    unpaidInvoices: 0,
    expiringProducts: [],
    topSellingProducts: [],
    recentActivities: []
  })
  const [loading, setLoading] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)
  const { getCache, setCache } = useDataCache()
  const { user: authUser, loading: authLoading } = useAuth()

  // IMMEDIATE redirect for Receptionist using AuthContext
  useEffect(() => {
    if (authLoading) return

    if (!authUser) {
      router.push('/login')
      return
    }

    if (authUser.role?.toLowerCase() === 'receptionist') {
      router.replace('/patients')
      return
    }

    setAuthChecked(true)

    // Check cache first
    const cachedStats = getCache<DashboardStats>('dashboardStats')
    if (cachedStats) {
      setStats(cachedStats)
      setLoading(false)
    } else {
      fetchDashboardData()
    }
  }, [authLoading, authUser])

  async function fetchDashboardData() {
    try {
      setLoading(true)
      // Single lightweight endpoint instead of 5 full API fetches
      const res = await fetch('/api/dashboard-summary')
      if (!res.ok) throw new Error('Failed to fetch dashboard data')
      const data: DashboardStats = await res.json()

      setStats(data)
      setCache('dashboardStats', data)
    } catch (error) {
    } finally {
      setLoading(false)
    }
  }

  if (!authChecked) {
    return (
      <div className="py-6 space-y-6">
        <div className="flex justify-between items-center">
          <div className="h-9 w-40 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse"></div>
          <div className="h-10 w-10 bg-gray-200 dark:bg-gray-800 rounded-lg animate-pulse"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-[104px] rounded-xl bg-gray-100 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-800 animate-pulse"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-[280px] rounded-xl bg-gray-100 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-800 animate-pulse"></div>
          <div className="h-[280px] rounded-xl bg-gray-100 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-800 animate-pulse"></div>
        </div>
      </div>
    )
  }

  return (
      <div className="py-6 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <RefreshButton onRefresh={fetchDashboardData} />
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-4 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none"></div>
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-sm text-muted mb-1">Total Revenue</p>
                {loading ? (
                  <div className="animate-pulse h-8 bg-blue-200 dark:bg-blue-700 rounded w-24"></div>
                ) : (
                  <p className="text-2xl font-bold">₹{(stats.totalRevenue / 100).toFixed(2)}</p>
                )}
              </div>
              <span className="text-4xl">💰</span>
            </div>
          </div>

          <div className="relative rounded-xl border border-yellow-200/30 dark:border-yellow-700/30 bg-gradient-to-br from-white via-yellow-50/30 to-orange-50/20 dark:from-gray-900 dark:via-yellow-950/20 dark:to-gray-900 shadow-lg shadow-yellow-500/5 backdrop-blur-sm p-4 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-400/5 via-transparent to-orange-500/5 pointer-events-none"></div>
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-sm text-muted mb-1">Low Stock Alerts</p>
                {loading ? (
                  <div className="animate-pulse h-8 bg-yellow-200 dark:bg-yellow-700 rounded w-16"></div>
                ) : (
                  <p className="text-2xl font-bold text-red-600">{stats.lowStockProducts.length}</p>
                )}
              </div>
              <span className="text-4xl">⚠️</span>
            </div>
          </div>

          <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-4 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none"></div>
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-sm text-muted mb-1">Pending Purchase Orders</p>
                {loading ? (
                  <div className="animate-pulse h-8 bg-blue-200 dark:bg-blue-700 rounded w-12"></div>
                ) : (
                  <p className="text-2xl font-bold">{stats.pendingPurchaseOrders}</p>
                )}
              </div>
              <span className="text-4xl">📋</span>
            </div>
          </div>

          <div className="relative rounded-xl border border-red-200/30 dark:border-red-700/30 bg-gradient-to-br from-white via-red-50/30 to-orange-50/20 dark:from-gray-900 dark:via-red-950/20 dark:to-gray-900 shadow-lg shadow-red-500/5 backdrop-blur-sm p-4 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-red-400/5 via-transparent to-orange-500/5 pointer-events-none"></div>
            <div className="relative flex items-center justify-between">
              <div>
                <p className="text-sm text-muted mb-1">Unpaid Invoices</p>
                {loading ? (
                  <div className="animate-pulse h-8 bg-red-200 dark:bg-red-700 rounded w-12"></div>
                ) : (
                  <p className="text-2xl font-bold">{stats.unpaidInvoices}</p>
                )}
              </div>
              <span className="text-4xl">📄</span>
            </div>
          </div>
        </div>

        {/* Alert Cards */}
        {!loading && stats.lowStockProducts.length > 0 && (
          <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-4 border-l-4 border-l-red-500 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
            <div className="relative">
            <div className="flex items-start gap-3">
              <span className="text-3xl">🚨</span>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-red-600 mb-2">Low Stock Alert!</h3>
                <p className="text-sm text-muted mb-3">
                  {stats.lowStockProducts.length} product(s) are running low on stock and need reordering.
                </p>
                <div className="space-y-2 mb-4">
                  {stats.lowStockProducts.slice(0, 5).map((product: any) => (
                    <div key={product.id} className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 p-2 rounded">
                      <span className="font-medium">{product.name}</span>
                      <span className="text-sm">
                        <span className="text-red-600 font-bold">{formatQuantity(product.quantity)}</span>
                        <span className="text-muted"> units left</span>
                      </span>
                    </div>
                  ))}
                  {stats.lowStockProducts.length > 5 && (
                    <p className="text-sm text-muted">+ {stats.lowStockProducts.length - 5} more</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Link 
                    href="/products"
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all text-sm"
                  >
                    View All Products
                  </Link>
                  <Link 
                    href="/purchase-orders"
                    className="px-4 py-2 bg-sky-600 text-white rounded-lg hover:bg-sky-700 transition-all text-sm"
                  >
                    Create Purchase Order
                  </Link>
                </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Selling Products */}
          <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-4 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
            <div className="relative">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span>🏆</span>
              <span>Top Selling Products</span>
            </h3>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse flex items-center justify-between">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                  </div>
                ))}
              </div>
            ) : stats.topSellingProducts.length === 0 ? (
              <p className="text-muted text-sm">No sales data available</p>
            ) : (
              <div className="space-y-3">
                {stats.topSellingProducts.map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '📦'}</span>
                      <span className="font-medium">{item.product?.name || 'Unknown'}</span>
                    </div>
                    <span className="text-brand font-bold">{formatQuantity(item.quantity)} sold</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>

          {/* Recent Activities */}
          <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-4 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
            <div className="relative">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span>📊</span>
              <span>Recent Activities</span>
            </h3>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse flex items-start gap-3">
                    <div className="h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded"></div>
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : stats.recentActivities.length === 0 ? (
              <p className="text-muted text-sm">No recent activities</p>
            ) : (
              <div className="space-y-2">
                {stats.recentActivities.map((activity: any, idx: number) => (
                  <div key={idx} className="flex items-start gap-3 p-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded transition-colors">
                    <span className="text-xl">{activity.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{activity.message}</p>
                      <p className="text-xs text-muted">{new Date(activity.date).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-4 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
          <div className="relative">
          <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Link 
              href="/visits"
              className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:shadow-md transition-all text-center"
            >
              <span className="text-3xl block mb-2">🏥</span>
              <span className="text-sm font-medium">New Visit</span>
            </Link>
            <Link 
              href="/prescriptions"
              className="p-4 bg-sky-50 dark:bg-sky-900/20 rounded-lg hover:shadow-md transition-all text-center"
            >
              <span className="text-3xl block mb-2">💊</span>
              <span className="text-sm font-medium">Prescriptions</span>
            </Link>
            <Link 
              href="/purchase-orders"
              className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg hover:shadow-md transition-all text-center"
            >
              <span className="text-3xl block mb-2">📦</span>
              <span className="text-sm font-medium">Purchase Order</span>
            </Link>
            <Link 
              href="/invoices"
              className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg hover:shadow-md transition-all text-center"
            >
              <span className="text-3xl block mb-2">💳</span>
              <span className="text-sm font-medium">Invoices</span>
            </Link>
          </div>
          </div>
        </div>
      </div>
  )
}
