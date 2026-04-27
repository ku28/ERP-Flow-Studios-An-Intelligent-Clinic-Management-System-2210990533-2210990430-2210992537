import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { canAccessRoute } from '../lib/permissions'
import ImportNotifications from './ImportNotifications'
import AccountSwitcherModal from './AccountSwitcherModal'
import LanguageSwitcher from './LanguageSwitcher'
import { useDoctor } from '../contexts/DoctorContext'
import { useAuth } from '../contexts/AuthContext'
import { isBasicPlan } from '../lib/subscription'
import StandardFeatureBadge from './StandardFeatureBadge'
import { OFFLINE_MODE_EVENT, isOfflineModeEnabled, setOfflineModeEnabled } from '../lib/offlineMode'

interface DesktopHeaderProps {
    onOpenTokenSidebar?: () => void
    onOpenCommandPalette?: () => void
}

export default function DesktopHeader({ onOpenTokenSidebar, onOpenCommandPalette }: DesktopHeaderProps) {
    const { user: authUser } = useAuth()
    const [user, setUser] = useState<any>(null)
    const [dark, setDark] = useState(false)
    const [userDropdownOpen, setUserDropdownOpen] = useState(false)
    const [accountSwitcherModalOpen, setAccountSwitcherModalOpen] = useState(false)
    const [loggingOut, setLoggingOut] = useState(false)
    const [collapsed, setCollapsed] = useState(false)
    const [accountingOpen, setAccountingOpen] = useState(false)
    const [offlineModeEnabled, setOfflineModeEnabledState] = useState(false)
    const [offlineToggleSupported, setOfflineToggleSupported] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const router = useRouter()
    const { selectedDoctorId, setSelectedDoctorId, doctors, loading: doctorsLoading } = useDoctor()

    const canAccess = (route: string) => user ? canAccessRoute(user.role, route) : false
    const isReception = user?.role === 'receptionist'
    const isPatient = user?.role?.toLowerCase() === 'user'
    const isSuperAdmin = user?.role === 'super_admin'
    const isBasicSubscription = isBasicPlan(user?.clinic?.subscriptionPlan)

    // Sync user from AuthContext
    useEffect(() => {
        setUser(authUser)
    }, [authUser])

    useEffect(() => {
        try {
            const stored = localStorage.getItem('theme')
            if (stored) { setDark(stored === 'dark'); document.documentElement.classList.toggle('dark', stored === 'dark') }
            else if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) { setDark(true); document.documentElement.classList.add('dark') }
            const sidebarState = localStorage.getItem('desktop-sidebar-collapsed')
            if (sidebarState === 'true') setCollapsed(true)
            setOfflineModeEnabledState(isOfflineModeEnabled())
            const hasElectron = !!(window as any).electronAPI
            const isAndroid = (window as any).Capacitor?.getPlatform?.() === 'android'
            setOfflineToggleSupported(hasElectron || isAndroid)
        } catch { }

        const handleOfflineModeChanged = (event: Event) => {
            const detailEnabled = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled
            setOfflineModeEnabledState(typeof detailEnabled === 'boolean' ? detailEnabled : isOfflineModeEnabled())
        }

        window.addEventListener(OFFLINE_MODE_EVENT, handleOfflineModeChanged as EventListener)

        return () => {
            window.removeEventListener(OFFLINE_MODE_EVENT, handleOfflineModeChanged as EventListener)
        }
    }, [])

    // Auto-expand accounting section if on an accounting page
    useEffect(() => {
        const accountingPaths = ['/suppliers', '/purchase-orders', '/invoices', '/stock-transactions', '/analytics']
        if (accountingPaths.includes(router.pathname)) setAccountingOpen(true)
    }, [router.pathname])

    // Close dropdown on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setUserDropdownOpen(false)
        }
        if (userDropdownOpen) document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [userDropdownOpen])

    function toggleTheme() {
        const next = !dark
        setDark(next)
        try {
            localStorage.setItem('theme', next ? 'dark' : 'light')
            document.documentElement.classList.add('theme-transition')
            document.documentElement.classList.toggle('dark', next)
            setTimeout(() => document.documentElement.classList.remove('theme-transition'), 300)
        } catch { }
    }

    function toggleCollapse() {
        const next = !collapsed
        setCollapsed(next)
        try { localStorage.setItem('desktop-sidebar-collapsed', String(next)) } catch { }
    }

    function toggleOfflineMode() {
        const next = !offlineModeEnabled
        setOfflineModeEnabled(next)
        setOfflineModeEnabledState(next)
    }

    const handleLogout = async () => {
        setLoggingOut(true)
        try { await fetch('/api/auth/logout', { method: 'POST' }) } catch { }
        setUser(null)
        setUserDropdownOpen(false)
        localStorage.removeItem('clinicId')
        localStorage.removeItem('clinicName')
        localStorage.removeItem('clinicIcon')
        sessionStorage.removeItem('currentUser')
        window.location.href = '/login'
    }

    const handleClinicLogout = async () => {
        setLoggingOut(true)
        try { await fetch('/api/auth/logout', { method: 'POST' }) } catch { }
        setUser(null)
        setUserDropdownOpen(false)
        localStorage.removeItem('clinicId')
        localStorage.removeItem('clinicName')
        localStorage.removeItem('clinicIcon')
        sessionStorage.removeItem('currentUser')
        window.location.href = '/login'
    }

    // Build nav items
    type NavItem = { href: string; label: string; iconPath: string; section?: string }
    const mainItems: NavItem[] = []
    const accountingItems: NavItem[] = []

    if (isPatient) {
        mainItems.push(
            { href: '/visits', label: 'Appointments', iconPath: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
            { href: '/prescriptions', label: 'Prescriptions', iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
        )
    } else if (!isSuperAdmin) {
        if (isReception) {
            if (canAccess('/patients')) mainItems.push({ href: '/patients', label: 'Patients', iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' })
            if (canAccess('/visits')) mainItems.push({ href: '/visits', label: 'Visits', iconPath: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' })
            if (canAccess('/tasks')) mainItems.push({ href: '/tasks', label: 'Tasks', iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' })
        } else {
            if (canAccess('/dashboard')) mainItems.push({ href: '/dashboard', label: 'Dashboard', iconPath: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' })
            if (canAccess('/patients')) mainItems.push({ href: '/patients', label: 'Patients', iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' })
            if (canAccess('/treatments')) mainItems.push({ href: '/treatments', label: 'Treatments', iconPath: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' })
            if (canAccess('/products')) mainItems.push({ href: '/products', label: 'Inventory', iconPath: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' })
            if (canAccess('/visits')) mainItems.push({ href: '/visits', label: 'Visits', iconPath: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' })
            // Accounting sub-items
            if (canAccess('/suppliers')) accountingItems.push({ href: '/suppliers', label: 'Suppliers', iconPath: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' })
            if (canAccess('/purchase-orders')) accountingItems.push({ href: '/purchase-orders', label: 'PO & Billing', iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' })
            if (canAccess('/invoices')) accountingItems.push({ href: '/invoices', label: 'Invoices', iconPath: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z' })
            if (canAccess('/stock-transactions')) accountingItems.push({ href: '/stock-transactions', label: 'Stock History', iconPath: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z' })
            if (canAccess('/analytics')) accountingItems.push({ href: '/analytics', label: 'Analytics', iconPath: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' })
        }
    }

    const title = user?.clinic ? `${user.clinic.name}` : 'ERP Flow Studios'
    const sidebarWidth = collapsed ? 'w-[52px]' : 'w-[220px]'

    const renderNavItem = (item: NavItem, compact = false) => {
        const isActive = router.pathname === item.href
        return (
            <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`group flex items-center gap-2.5 rounded-lg transition-all duration-150 ${collapsed ? 'justify-center px-2 py-2 mx-1' : 'px-3 py-2 mx-2'} ${isActive
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/60 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
            >
                <svg className={`flex-shrink-0 ${compact ? 'w-3.5 h-3.5' : 'w-4 h-4'}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.iconPath} />
                </svg>
                {!collapsed && <span className={`text-[13px] font-medium truncate ${compact ? 'text-xs' : ''}`}>{item.label}</span>}
                {isActive && collapsed && <span className="absolute left-0 w-[3px] h-5 bg-blue-600 dark:bg-blue-400 rounded-r-full" />}
            </Link>
        )
    }

    return (
        <>
            <AccountSwitcherModal
                isOpen={accountSwitcherModalOpen}
                onClose={() => setAccountSwitcherModalOpen(false)}
                currentUser={user}
            />

            {/* Desktop sidebar */}
            <aside className={`desktop-sidebar fixed left-0 top-0 bottom-0 z-50 flex flex-col ${sidebarWidth} bg-white dark:bg-gray-950 border-r border-gray-200 dark:border-gray-800 transition-all duration-200 select-none`}>
                {/* Title bar / drag region */}
                <div className="h-9 flex items-center px-2 border-b border-gray-100 dark:border-gray-800/60 flex-shrink-0" style={{ WebkitAppRegion: 'drag' } as any}>
                    <div className="flex items-center gap-2 min-w-0 flex-1" style={{ WebkitAppRegion: 'no-drag' } as any}>
                        <img src={user?.clinic?.iconUrl || '/favicon.png'} alt={title} className="w-5 h-5 object-contain rounded flex-shrink-0" />
                        {!collapsed && (
                            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{title}</span>
                        )}
                        {!collapsed && user?.clinic?.subscriptionPlan === 'pro' && (
                            <span className="px-1 py-px text-[7px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded leading-none flex-shrink-0">PRO</span>
                        )}
                    </div>
                    <button onClick={toggleCollapse} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex-shrink-0" style={{ WebkitAppRegion: 'no-drag' } as any}
                        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
                        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                        </svg>
                    </button>
                </div>

                {/* Search / Command Palette trigger */}
                {!collapsed ? (
                    <button onClick={onOpenCommandPalette}
                        className="flex items-center gap-2 mx-2 mt-2 mb-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-400 text-xs hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        <span>Search...</span>
                        <kbd className="ml-auto text-[10px] px-1 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-mono">Ctrl+K</kbd>
                    </button>
                ) : (
                    <button onClick={onOpenCommandPalette} className="flex justify-center mx-1 mt-2 mb-1 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Search (Ctrl+K)">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    </button>
                )}

                {/* Main navigation */}
                <nav className="flex-1 overflow-y-auto py-1 space-y-0.5 scrollbar-hide">
                    {!collapsed && mainItems.length > 0 && (
                        <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Navigation</div>
                    )}
                    {mainItems.map(item => renderNavItem(item))}

                    {/* Accounting section with collapsible group */}
                    {accountingItems.length > 0 && (
                        <>
                            {!collapsed ? (
                                <button
                                    onClick={() => setAccountingOpen(!accountingOpen)}
                                    className="w-full flex items-center gap-2 px-3 pt-3 pb-1 mx-0 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                >
                                    <svg className={`w-3 h-3 transition-transform duration-200 ${accountingOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                    Accounting
                                </button>
                            ) : (
                                <div className="mx-auto my-2 w-6 border-t border-gray-200 dark:border-gray-700" />
                            )}
                            {(collapsed || accountingOpen) && accountingItems.map(item => renderNavItem(item, true))}
                        </>
                    )}
                </nav>

                {/* Bottom section: actions + user */}
                <div className="flex-shrink-0 border-t border-gray-100 dark:border-gray-800/60 py-2">
                    {/* Quick action buttons */}
                    <div className={`flex ${collapsed ? 'flex-col items-center gap-1 px-1' : 'items-center gap-1 px-2'}`}>
                        {user && !isPatient && !isReception && user.role !== 'super_admin' && <ImportNotifications />}
                        {user && !isPatient && user.role !== 'super_admin' && onOpenTokenSidebar && (
                            <button onClick={onOpenTokenSidebar} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Token Queue">
                                <svg className="w-4 h-4 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                                </svg>
                            </button>
                        )}
                        {/* Upgrade button for admins - icon only to save space */}
                        {user && user.role === 'admin' && user?.clinic?.subscriptionPlan !== 'pro' && (
                            <button
                                onClick={() => router.push('/upgrade')}
                                title="Upgrade Plan"
                                className="flex items-center p-1.5 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-all"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                            </button>
                        )}
                        <LanguageSwitcher />
                        <button onClick={toggleTheme} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title={dark ? 'Light mode' : 'Dark mode'}>
                            {dark ? (
                                <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" /></svg>
                            ) : (
                                <svg className="w-4 h-4 text-gray-500" fill="currentColor" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>
                            )}
                        </button>
                    </div>

                    {/* User profile area */}
                    {user && (
                        <div className="relative mt-2" ref={dropdownRef}>
                            <button
                                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800/60 transition-colors ${collapsed ? 'justify-center mx-1' : 'mx-2'}`}
                            >
                                {user.profileImage ? (
                                    <img src={user.profileImage} alt="" className="w-6 h-6 rounded-full object-cover border border-gray-200 dark:border-gray-700 flex-shrink-0" />
                                ) : (
                                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-sky-400 to-blue-600 flex items-center justify-center flex-shrink-0">
                                        <span className="text-[10px] font-bold text-white">{user.name?.[0]?.toUpperCase() || 'U'}</span>
                                    </div>
                                )}
                                {!collapsed && (
                                    <div className="flex-1 min-w-0 text-left">
                                        <div className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{user.name || user.email}</div>
                                        <div className="text-[10px] text-gray-400 truncate capitalize">{user.role}</div>
                                    </div>
                                )}
                                {!collapsed && (
                                    <svg className={`w-3 h-3 text-gray-400 transition-transform ${userDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                    </svg>
                                )}
                            </button>

                            {userDropdownOpen && (
                                <div className={`absolute ${collapsed ? 'left-full bottom-0 ml-2' : 'left-2 right-2 bottom-full mb-1'} rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl py-1 z-[60]`}>
                                    {offlineToggleSupported && (
                                        <>
                                            <button
                                                onClick={toggleOfflineMode}
                                                className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                            >
                                                <span className="flex items-center gap-2">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55m-14 0a10.94 10.94 0 015.17-2.39m.54-5.11A16 16 0 0122.56 9M1.42 9A15.91 15.91 0 016.12 6.12" />
                                                    </svg>
                                                    Offline Mode
                                                </span>
                                                <span className={`inline-flex min-w-[2.2rem] items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${offlineModeEnabled ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>
                                                    {offlineModeEnabled ? 'ON' : 'OFF'}
                                                </span>
                                            </button>
                                            <hr className="my-1 border-gray-100 dark:border-gray-800" />
                                        </>
                                    )}
                                    {/* Doctor Switcher for Admin */}
                                    {user?.role === 'admin' && (
                                        <>
                                            <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">View as Doctor</div>
                                            {doctorsLoading ? (
                                                <div className="px-3 py-2 flex justify-center"><div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent" /></div>
                                            ) : doctors.length > 0 ? (
                                                <div className="max-h-32 overflow-y-auto">
                                                    {doctors.map(d => (
                                                        <button key={d.id} onClick={() => { setSelectedDoctorId(d.id); setUserDropdownOpen(false); window.dispatchEvent(new CustomEvent('doctor-changed', { detail: { doctorId: d.id } })) }}
                                                            className={`w-full text-left px-3 py-1.5 text-xs ${selectedDoctorId === d.id ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                                                            {d.name || 'Unnamed Doctor'}
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : <div className="px-3 py-1.5 text-xs text-gray-400">No doctors</div>}
                                            <hr className="my-1 border-gray-100 dark:border-gray-800" />
                                        </>
                                    )}
                                    <Link href={user?.role === 'super_admin' ? '/super-admin-profile' : '/profile'} onClick={() => setUserDropdownOpen(false)}
                                        className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                        Profile
                                    </Link>
                                    {user?.role === 'admin' && (
                                        <>
                                            <button
                                                onClick={() => {
                                                    setUserDropdownOpen(false)
                                                    router.push(isBasicSubscription ? '/upgrade' : '/admin-settings')
                                                }}
                                                className="relative flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                Settings
                                                {isBasicSubscription && (
                                                    <>
                                                        <span className="hidden sm:block"><StandardFeatureBadge className="-top-1 -right-1" /></span>
                                                        <span className="sm:hidden"><StandardFeatureBadge mobile className="-top-0.5 -right-1" /></span>
                                                    </>
                                                )}
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setUserDropdownOpen(false)
                                                    router.push('/clinic-edit')
                                                }}
                                                className="relative flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                                Clinic Edit
                                            </button>
                                        </>
                                    )}
                                    {user?.role !== 'super_admin' && (
                                        <button onClick={() => { setUserDropdownOpen(false); setAccountSwitcherModalOpen(true) }}
                                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                                            Switch Account
                                        </button>
                                    )}
                                    <hr className="my-1 border-gray-100 dark:border-gray-800" />
                                    <button onClick={handleLogout} disabled={loggingOut}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 disabled:opacity-50">
                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                        {loggingOut ? 'Logging out...' : 'Logout'}
                                    </button>
                                    {user?.role !== 'super_admin' && (
                                        <button onClick={handleClinicLogout} disabled={loggingOut}
                                            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                            {loggingOut ? 'Logging out...' : 'Logout from Clinic'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    {!user && (
                        <div className={`${collapsed ? 'px-1' : 'px-2'} mt-1`}>
                            <Link href="/login" className="block text-center px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors">
                                {collapsed ? <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg> : 'Login'}
                            </Link>
                        </div>
                    )}
                </div>
            </aside>
        </>
    )
}
