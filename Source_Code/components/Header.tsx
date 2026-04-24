import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
import { canAccessRoute } from '../lib/permissions'
import ImportNotifications from './ImportNotifications'
import AppSwitcherModal from './AppSwitcherModal'
import AccountSwitcherModal from './AccountSwitcherModal'
import { useDoctor } from '../contexts/DoctorContext'
import { useAuth } from '../contexts/AuthContext'
import { isBasicPlan } from '../lib/subscription'
import StandardFeatureBadge from './StandardFeatureBadge'
import { OFFLINE_MODE_EVENT, isOfflineModeEnabled, setOfflineModeEnabled } from '../lib/offlineMode'

const LanguageSwitcher = dynamic(() => import('./LanguageSwitcher'), { ssr: false })

interface HeaderProps {
  title?: string
  onOpenTokenSidebar?: () => void
}

export default function Header({ onOpenTokenSidebar }: HeaderProps) {
  const { user: authUser } = useAuth()
  const [user, setUser] = useState<any>(null)
  const [dark, setDark] = useState<boolean>(false)
  const [isNativeApp, setIsNativeApp] = useState(false)
  const [nativePlatform, setNativePlatform] = useState<'desktop' | 'mobile' | null>(null)
  const [accountingOpen, setAccountingOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [userDropdownOpen, setUserDropdownOpen] = useState(false)
  const [appSwitcherModalOpen, setAppSwitcherModalOpen] = useState(false)
  const [accountSwitcherModalOpen, setAccountSwitcherModalOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [offlineModeEnabled, setOfflineModeEnabledState] = useState(false)
  const [offlineToggleSupported, setOfflineToggleSupported] = useState(false)
  const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number } | null>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const submenuNavRef = useRef<HTMLDivElement>(null)
  const dropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const router = useRouter()
  const { selectedDoctorId, setSelectedDoctorId, doctors, loading: doctorsLoading } = useDoctor()

  // Determine current app and title
  const landingPages = ['/', '/about', '/services', '/gallery', '/contact']
  const isWebsite = landingPages.includes(router.pathname)
  const currentApp = isWebsite ? 'website' : 'erp'
  const title = isWebsite ? 'ERP Flow Studios' : 'ERP Flow Studios'

  // Helper to check if user can access a route
  const canAccess = (route: string) => {
    if (!user) return false
    return canAccessRoute(user.role, route)
  }

  // Helper to check if user is receptionist
  const isReception = user?.role === 'receptionist'
  
  // Helper to check if user is a patient (user role)
  const isPatient = user?.role?.toLowerCase() === 'user'
  const isBasicSubscription = isBasicPlan(user?.clinic?.subscriptionPlan)

  const isNativeCapacitorRuntime = () => {
    const cap = (window as any).Capacitor
    if (!cap) return false
    if (typeof cap.isNativePlatform === 'function') return !!cap.isNativePlatform()
    if (typeof cap.getPlatform === 'function') return cap.getPlatform() !== 'web'
    return false
  }

  // Sync user from AuthContext instead of fetching /api/auth/me
  useEffect(() => {
    setUser(authUser)
  }, [authUser])

  useEffect(() => {
    // Detect native app environment
    const hasElectron = !!(window as any).electronAPI
    const hasCapacitor = isNativeCapacitorRuntime()
    if (hasElectron || hasCapacitor) {
      setIsNativeApp(true)
      setNativePlatform(hasElectron ? 'desktop' : 'mobile')
    } else {
      setIsNativeApp(false)
      setNativePlatform(null)
    }

    const isAndroidNative = (window as any).Capacitor?.getPlatform?.() === 'android'
    setOfflineToggleSupported(hasElectron || isAndroidNative)
    setOfflineModeEnabledState(isOfflineModeEnabled())

    const handleOfflineModeChanged = (event: Event) => {
      const detailEnabled = (event as CustomEvent<{ enabled?: boolean }>).detail?.enabled
      setOfflineModeEnabledState(typeof detailEnabled === 'boolean' ? detailEnabled : isOfflineModeEnabled())
    }

    window.addEventListener(OFFLINE_MODE_EVENT, handleOfflineModeChanged as EventListener)

    // initialize theme from localStorage or prefers-color-scheme
    try {
      const stored = localStorage.getItem('theme')
      if (stored) {
        setDark(stored === 'dark')
        document.documentElement.classList.toggle('dark', stored === 'dark')
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setDark(true)
        document.documentElement.classList.add('dark')
      }
    } catch (e) {
      // ignore (SSR)
    }

    // Cleanup listeners
    return () => {
      window.removeEventListener(OFFLINE_MODE_EVENT, handleOfflineModeChanged as EventListener)
    }
  }, [])

  useEffect(() => {
    const openMenu = () => setMobileMenuOpen(true)
    const closeMenu = () => setMobileMenuOpen(false)
    window.addEventListener('open-mobile-menu', openMenu)
    window.addEventListener('close-mobile-menu', closeMenu)

    return () => {
      window.removeEventListener('open-mobile-menu', openMenu)
      window.removeEventListener('close-mobile-menu', closeMenu)
    }
  }, [])

  // Update indicator position when route changes
  useEffect(() => {
    const updateIndicator = () => {
      // Check if we're on an accounting page
      const isAccountingPage = ['/suppliers', '/purchase-orders', '/invoices', '/stock-transactions', '/analytics'].includes(router.pathname)
      
      if (isAccountingPage && submenuNavRef.current && accountingOpen) {
        // Use submenu nav for accounting pages
        const activeLink = submenuNavRef.current.querySelector('[data-active="true"]') as HTMLElement
        if (activeLink) {
          const navRect = submenuNavRef.current.getBoundingClientRect()
          const linkRect = activeLink.getBoundingClientRect()
          setIndicatorStyle({
            left: linkRect.left - navRect.left,
            width: linkRect.width
          })
          return
        }
      }
      
      // Use main nav for other pages
      if (navRef.current) {
        const activeLink = navRef.current.querySelector('[data-active="true"]') as HTMLElement
        if (activeLink) {
          const navRect = navRef.current.getBoundingClientRect()
          const linkRect = activeLink.getBoundingClientRect()
          setIndicatorStyle({
            left: linkRect.left - navRect.left,
            width: linkRect.width
          })
        } else {
          setIndicatorStyle(null)
        }
      }
    }

    // Update on mount and route change
    updateIndicator()
    
    // Update after delays to ensure DOM is ready
    const timer1 = setTimeout(updateIndicator, 100)
    const timer2 = setTimeout(updateIndicator, 300)
    
    return () => {
      clearTimeout(timer1)
      clearTimeout(timer2)
    }
  }, [router.pathname, user, accountingOpen])

  function toggleTheme() {
    const next = !dark
    setDark(next)
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light')
      // add a transient class to animate the transition
      document.documentElement.classList.add('theme-transition')
      document.documentElement.classList.toggle('dark', next)
      window.setTimeout(() => document.documentElement.classList.remove('theme-transition'), 300)
    } catch (e) {
      // ignore
    }
  }

  const toggleOfflineMode = () => {
    const next = !offlineModeEnabled
    setOfflineModeEnabled(next)
    setOfflineModeEnabledState(next)
  }

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {}
    setUser(null)
    setUserDropdownOpen(false)
    localStorage.removeItem('clinicId')
    localStorage.removeItem('clinicName')
    localStorage.removeItem('clinicIcon')
    sessionStorage.removeItem('currentUser')
    const isApp = !!(window as any).electronAPI || isNativeCapacitorRuntime()
    if (isApp) {
      router.replace('/login')
      return
    }
    window.location.href = '/'
  }

  const handleClinicLogout = async () => {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {}
    setUser(null)
    setUserDropdownOpen(false)
    localStorage.removeItem('clinicId')
    localStorage.removeItem('clinicName')
    localStorage.removeItem('clinicIcon')
    sessionStorage.removeItem('currentUser')
    const isApp = !!(window as any).electronAPI || isNativeCapacitorRuntime()
    if (isApp) {
      router.replace('/login')
      return
    }
    window.location.href = '/'
  }

  const handleDropdownEnter = () => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current)
      dropdownTimeoutRef.current = null
    }
    setUserDropdownOpen(true)
  }

  const handleDropdownLeave = () => {
    dropdownTimeoutRef.current = setTimeout(() => {
      setUserDropdownOpen(false)
    }, 300) // 300ms delay before closing
  }

  return (
    <>
      <AppSwitcherModal 
        isOpen={appSwitcherModalOpen}
        onClose={() => setAppSwitcherModalOpen(false)}
        currentApp={currentApp}
        user={user}
      />
      
      <AccountSwitcherModal
        isOpen={accountSwitcherModalOpen}
        onClose={() => setAccountSwitcherModalOpen(false)}
        currentUser={user}
      />
      
      <header className={`safe-area-top border-b border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-r from-white via-blue-50/20 to-sky-50/10 dark:from-gray-900 dark:via-blue-950/10 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-md mb-8 sticky top-0 z-50 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)]`}>
      <div className="absolute inset-0 bg-gradient-to-br from-blue-400/3 via-transparent to-sky-500/3 pointer-events-none"></div>
      
      <div className={`relative max-w-7xl mx-auto px-2 sm:px-3 transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${accountingOpen ? 'py-3' : 'py-3'}`}>
      <div className="flex justify-between items-center min-h-[52px]">
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="md:hidden p-2 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
            aria-label="Toggle menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          {/* Logo and Title with App Switcher Icon */}
          <div className="flex items-center gap-1">
            <img 
              src={user?.clinic?.iconUrl || "/favicon.png"} 
              alt={user?.clinic?.name || "ERP Flow Studios"} 
              className="w-7 h-7 sm:w-8 sm:h-8 object-contain"
            />
            <div className="relative min-w-0">
              <div className="text-sm sm:text-base md:text-lg font-bold bg-gradient-to-r from-blue-500 to-sky-600 dark:from-blue-400 dark:to-sky-400 bg-clip-text text-transparent whitespace-nowrap max-w-[120px] sm:max-w-[170px] lg:max-w-none overflow-hidden text-ellipsis block">
                {user?.clinic ? `${user.clinic.name} ERP` : title}
              </div>
            </div>
            
            {/* PRO badge - shown inline to avoid overlapping platform badge */}
            {user?.clinic?.subscriptionPlan === 'pro' && (
              <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-md shadow-sm shadow-amber-500/30 leading-none flex-shrink-0">
                PRO
              </span>
            )}

            {/* App Switcher Icon Button - hidden in native apps */}
            {!isNativeApp && (
            <button
              onClick={() => setAppSwitcherModalOpen(true)}
              className="p-1 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-all duration-200 group"
              aria-label="Switch application"
              title="Switch between ERP Flow Studios Website and App"
            >
              <svg 
                className="w-4 h-4 text-gray-600 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </button>
            )}
            {/* Platform badge for native apps */}
            {isNativeApp && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-md leading-none flex-shrink-0">
                {nativePlatform === 'desktop' ? 'Desktop' : 'Mobile'}
              </span>
            )}
          </div>

          {/* main nav - hidden on small screens */}
          <nav ref={navRef} className="hidden md:flex items-center gap-1 relative">
            {/* Sliding indicator */}
            {indicatorStyle && !['/suppliers', '/purchase-orders', '/invoices', '/stock-transactions', '/analytics'].includes(router.pathname) && (
              <span 
                className="absolute bottom-0 h-0.5 bg-gradient-to-r from-sky-500 to-blue-600 rounded-full transition-all duration-300 ease-out"
                style={{ 
                  left: `${indicatorStyle.left}px`, 
                  width: `${indicatorStyle.width}px` 
                }}
              />
            )}
            
            {/* Staff/Admin/Doctor/Reception Navigation */}
            {!isPatient && (
              <>
                {/* Receptionist sees Patients, Visits, and Tasks */}
                {isReception && (
                  <>
                    {canAccess('/patients') && (
                      <Link href="/patients" data-active={router.pathname === '/patients'} className={`px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm relative ${router.pathname === '/patients' ? 'text-sky-600 dark:text-sky-400' : ''}`}>
                        Patients
                      </Link>
                    )}
                    {canAccess('/visits') && (
                      <Link href="/visits" data-active={router.pathname === '/visits'} className={`px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm relative ${router.pathname === '/visits' ? 'text-sky-600 dark:text-sky-400' : ''}`}>
                        Visits
                      </Link>
                    )}
                    {canAccess('/tasks') && (
                      <Link href="/tasks" data-active={router.pathname === '/tasks'} className={`px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm relative ${router.pathname === '/tasks' ? 'text-sky-600 dark:text-sky-400' : ''}`}>
                        Tasks
                      </Link>
                    )}
                  </>
                )}
                
                {/* Full navigation for non-reception staff */}
                {!isReception && (
                <>
                {canAccess('/dashboard') && (
                  <Link href="/dashboard" data-active={router.pathname === '/dashboard'} className={`px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm relative ${router.pathname === '/dashboard' ? 'text-sky-600 dark:text-sky-400' : ''}`}>
                    Dashboard
                  </Link>
                )}
                {canAccess('/patients') && (
                  <Link href="/patients" data-active={router.pathname === '/patients'} className={`px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm relative ${router.pathname === '/patients' ? 'text-sky-600 dark:text-sky-400' : ''}`}>
                    Patients
                  </Link>
                )}
                {canAccess('/treatments') && (
                  <Link href="/treatments" data-active={router.pathname === '/treatments'} className={`px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm relative ${router.pathname === '/treatments' ? 'text-sky-600 dark:text-sky-400' : ''}`}>
                    Treatments
                  </Link>
                )}
                {canAccess('/products') && (
                  <Link href="/products" data-active={router.pathname === '/products'} className={`px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm relative ${router.pathname === '/products' ? 'text-sky-600 dark:text-sky-400' : ''}`}>
                    Inventory
                  </Link>
                )}
                {canAccess('/visits') && (
                  <Link href="/visits" data-active={router.pathname === '/visits'} className={`px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm relative ${router.pathname === '/visits' ? 'text-sky-600 dark:text-sky-400' : ''}`}>
                    Visits
                  </Link>
                )}
                </>
                )}
                
                {/* Accounting Expandable Menu - only show for non-reception users who can access accounting features */}
                {!isReception && (canAccess('/suppliers') || canAccess('/purchase-orders') || canAccess('/invoices') || canAccess('/stock-transactions') || canAccess('/analytics')) && (
                  <button
                    data-active={['/suppliers', '/purchase-orders', '/invoices', '/stock-transactions', '/analytics'].includes(router.pathname)}
                    onClick={() => setAccountingOpen(!accountingOpen)}
                    className={`px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm flex items-center gap-1 relative ${['/suppliers', '/purchase-orders', '/invoices', '/stock-transactions', '/analytics'].includes(router.pathname) ? 'text-sky-600 dark:text-sky-400' : ''}`}
                  >
                    Accounting
                    <svg className={`w-4 h-4 transition-transform duration-300 ${accountingOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
              </>
            )}
          </nav>

        </div>
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Import Notifications - only for admin/staff/doctor, not reception or super admin */}
          {user && !isPatient && !isReception && user.role !== 'super_admin' && <ImportNotifications />}

          {/* Tokens button for all staff including receptionist, but NOT super admin - hide on small screens */}
          {user && !isPatient && user.role !== 'super_admin' && (
            <button 
              onClick={onOpenTokenSidebar}
              className="hidden sm:block p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors relative"
              title="Token Queue"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
              </svg>
            </button>
          )}

          
          {/* Upgrade button for admins - icon only to save space */}
          {user && user.role === 'admin' && user?.clinic?.subscriptionPlan !== 'pro' && !isWebsite && (
            <button
              onClick={() => router.push('/upgrade')}
              title="Upgrade Plan"
              className="hidden sm:flex items-center p-1.5 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
            </button>
          )}

          {/* Language Switcher - hidden on xs */}
          <div className="hidden sm:block">
            <LanguageSwitcher />
          </div>

          {/* theme toggle (sun/moon) - shows both icons with a sliding knob */}
          <button
            aria-label="Toggle theme"
            aria-pressed={dark}
            onClick={toggleTheme}
            title={dark ? 'Switch to light' : 'Switch to dark'}
            className={`theme-toggle ${dark ? 'is-dark' : ''}`}
          >
            <span className="toggle-icon toggle-sun" aria-hidden>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M6.76 4.84l-1.8-1.79L3.17 4.84l1.79 1.8 1.8-1.8zM1 13h3v-2H1v2zm10-9h2V1h-2v3zm7.03 1.05l1.8-1.8-1.8-1.79-1.79 1.79 1.79 1.8zM17 13h3v-2h-3v2zM6.76 19.16l-1.8 1.79L3.17 19.16l1.79-1.79 1.8 1.79zM12 20a1 1 0 110 2 1 1 0 010-2zm0-6a4 4 0 100-8 4 4 0 000 8z" />
              </svg>
            </span>
            <span className="toggle-icon toggle-moon" aria-hidden>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            </span>
            <span className="toggle-knob" aria-hidden />
          </button>

          {user ? (
            <div 
              className="relative"
              onMouseEnter={handleDropdownEnter}
              onMouseLeave={handleDropdownLeave}
            >
              <Link href="/profile" className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer">
                {user.profileImage ? (
                  <img 
                    src={user.profileImage} 
                    alt="Profile" 
                    className="w-8 h-8 rounded-full object-cover border-2 border-gray-300 dark:border-gray-600"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center border-2 border-gray-300 dark:border-gray-600">
                    <span className="text-xs sm:text-sm font-bold text-white">
                      {user.name?.[0]?.toUpperCase() || user.email?.[0]?.toUpperCase() || 'U'}
                    </span>
                  </div>
                )}
                <div className="text-sm hidden xl:block max-w-[110px]">
                  <div className="font-medium whitespace-nowrap overflow-hidden text-ellipsis">{user.name || user.email}</div>
                  <div className="text-xs text-muted whitespace-nowrap overflow-hidden text-ellipsis capitalize">{user.role}</div>
                </div>
              </Link>

              {/* User Dropdown Menu */}
              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-blue-300/60 dark:border-blue-600/60 bg-white/95 dark:bg-gray-900/95 shadow-2xl backdrop-blur-xl py-2 z-50 overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-blue-400/10 via-transparent to-sky-500/10 pointer-events-none rounded-xl"></div>
                  <div className="relative">
                  {offlineToggleSupported && (
                    <>
                      <button
                        onClick={toggleOfflineMode}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0119 12.55m-14 0a10.94 10.94 0 015.17-2.39m.54-5.11A16 16 0 0122.56 9M1.42 9A15.91 15.91 0 016.12 6.12" />
                            </svg>
                            <span>Offline Mode</span>
                          </div>
                          <span className={`inline-flex min-w-[2.4rem] items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${offlineModeEnabled ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'}`}>
                            {offlineModeEnabled ? 'ON' : 'OFF'}
                          </span>
                        </div>
                      </button>
                      <hr className="my-1 border-gray-200 dark:border-gray-700" />
                    </>
                  )}
                  
                  {/* Doctor Switcher for Admin */}
                  {user?.role === 'admin' && (
                    <>
                      <div className="px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        View as Doctor
                      </div>
                      {doctorsLoading ? (
                        <div className="px-4 py-3 flex items-center justify-center">
                          <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent"></div>
                        </div>
                      ) : doctors.length > 0 ? (
                        <div className="max-h-48 overflow-y-auto">
                          {doctors.map(doctor => (
                            <button
                              key={doctor.id}
                              onClick={() => {
                                setSelectedDoctorId(doctor.id)
                                setUserDropdownOpen(false)
                                // Dispatch event to trigger data refresh
                                window.dispatchEvent(new CustomEvent('doctor-changed', { 
                                  detail: { doctorId: doctor.id } 
                                }))
                              }}
                              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                                selectedDoctorId === doctor.id
                                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                  : 'text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-950/30'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              <span className="truncate">{doctor.name || 'Unnamed Doctor'}</span>
                            </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="px-4 py-2.5 text-sm text-gray-500 dark:text-gray-400">
                          No doctors found
                        </div>
                      )}
                      <hr className="my-1 border-gray-200 dark:border-gray-700" />
                    </>
                  )}
                  
                  {/* Current Doctor Display (for doctors) */}
                  {user?.role === 'doctor' && (
                    <>
                      <div className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300">
                        <div className="flex items-center gap-2">
                          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          <span className="font-medium">{user.name}</span>
                        </div>
                      </div>
                      <hr className="my-1 border-gray-200 dark:border-gray-700" />
                    </>
                  )}
                  
                  <Link 
                    href={user?.role === 'super_admin' ? '/super-admin-profile' : '/profile'}
                    className="block px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                    onClick={() => setUserDropdownOpen(false)}
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <span>View Profile</span>
                    </div>
                  </Link>
                  {user?.role === 'admin' && (
                    <>
                    <button
                      className="block w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                      onClick={() => {
                        setUserDropdownOpen(false)
                        router.push(isBasicSubscription ? '/upgrade' : '/admin-settings')
                      }}
                    >
                      <div className="relative flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>Admin Settings</span>
                        {isBasicSubscription && (
                          <>
                            <span className="hidden sm:block"><StandardFeatureBadge className="-top-1 -right-6" /></span>
                            <span className="sm:hidden"><StandardFeatureBadge mobile className="-top-0.5 -right-5" /></span>
                          </>
                        )}
                      </div>
                    </button>
                    <button
                      className="block w-full px-4 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                      onClick={() => {
                        setUserDropdownOpen(false)
                        router.push('/clinic-edit')
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                        <span>Clinic Edit</span>
                      </div>
                    </button>
                  </>
                  )}
                  {user?.role !== 'super_admin' && (
                  <button
                    onClick={() => {
                      setUserDropdownOpen(false)
                      setAccountSwitcherModalOpen(true)
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                      <span>Switch Account</span>
                    </div>
                  </button>
                  )}
                  <hr className="my-1 border-gray-200 dark:border-gray-700" />
                  <button
                    onClick={handleLogout}
                    disabled={loggingOut}
                    className="w-full text-left px-4 py-2.5 text-sm text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors disabled:opacity-60"
                  >
                    <div className="flex items-center gap-2">
                      {loggingOut ? (
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                      )}
                      <span>{loggingOut ? 'Logging out...' : 'Logout'}</span>
                    </div>
                  </button>
                  {user?.role !== 'super_admin' && (
                    <button
                      onClick={handleClinicLogout}
                      disabled={loggingOut}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-60"
                    >
                      <div className="flex items-center gap-2">
                        {loggingOut ? (
                          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                          </svg>
                        )}
                        <span>{loggingOut ? 'Logging out...' : 'Logout from Clinic'}</span>
                      </div>
                    </button>
                  )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex gap-2">
              <Link href="/login" className="px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand-600 transition-all hover:shadow-lg font-medium text-sm">Login</Link>
            </div>
          )}
        </div>
      </div>

      {/* Accounting Submenu Row - Appears below main navbar when accounting is expanded */}
      <div className={`overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${accountingOpen ? 'max-h-[60px] opacity-100 mt-3' : 'max-h-0 opacity-0'}`}>
        {!isReception && (canAccess('/suppliers') || canAccess('/purchase-orders') || canAccess('/invoices') || canAccess('/stock-transactions') || canAccess('/analytics')) && (
        <>
          <div className="flex items-center gap-2 sm:gap-4">
          {/* Mobile Menu Button Spacer - hidden on desktop, matches button width on mobile */}
          <div className="md:hidden w-[40px]"></div>
          
          {/* Logo/Title/AppSwitcher Area Spacer - must exactly match the main logo area */}
          <div className="flex items-center gap-1 invisible pointer-events-none">
            <img 
              src={user?.clinic?.iconUrl || "/favicon.png"} 
              alt={user?.clinic?.name || "ERP Flow Studios"} 
              className="w-7 h-7 sm:w-8 sm:h-8 object-contain"
            />
            <div className="relative min-w-0">
              <div className="text-sm sm:text-base md:text-lg font-bold whitespace-nowrap max-w-[120px] sm:max-w-[170px] lg:max-w-none overflow-hidden text-ellipsis block">{user?.clinic ? `${user.clinic.name} ERP` : title}</div>
            </div>
            {user?.clinic?.subscriptionPlan === 'pro' && <span className="px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider flex-shrink-0">PRO</span>}
            {!isNativeApp && (
            <button className="p-1 rounded-lg">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </button>
            )}
            {isNativeApp && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-md leading-none flex-shrink-0">
                {nativePlatform === 'desktop' ? 'Desktop' : 'Mobile'}
              </span>
            )}
          </div>
          
          <nav ref={submenuNavRef} className="hidden md:flex items-center gap-1 relative">
            {/* Sliding indicator for accounting submenu */}
            {indicatorStyle && accountingOpen && ['/suppliers', '/purchase-orders', '/invoices', '/stock-transactions', '/analytics'].includes(router.pathname) && (
              <span 
                className="absolute bottom-0 h-0.5 bg-gradient-to-r from-sky-500 to-blue-600 rounded-full transition-all duration-300 ease-out"
                style={{ 
                  left: `${indicatorStyle.left}px`, 
                  width: `${indicatorStyle.width}px` 
                }}
              />
            )}
            {canAccess('/suppliers') && (
              <Link 
                href="/suppliers" 
                data-active={router.pathname === '/suppliers'}
                className={`px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm ${router.pathname === '/suppliers' ? 'text-sky-600 dark:text-sky-400' : ''}`}
              >
                Suppliers
              </Link>
            )}
            {canAccess('/purchase-orders') && (
              <Link 
                href="/purchase-orders" 
                data-active={router.pathname === '/purchase-orders'}
                className={`px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm ${router.pathname === '/purchase-orders' ? 'text-sky-600 dark:text-sky-400' : ''}`}
              >
                PO & Billing
              </Link>
            )}
            {canAccess('/invoices') && (
              <Link 
                href="/invoices" 
                data-active={router.pathname === '/invoices'}
                className={`px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm ${router.pathname === '/invoices' ? 'text-sky-600 dark:text-sky-400' : ''}`}
              >
                Invoices
              </Link>
            )}
            {canAccess('/stock-transactions') && (
              <Link 
                href="/stock-transactions" 
                data-active={router.pathname === '/stock-transactions'}
                className={`px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm ${router.pathname === '/stock-transactions' ? 'text-sky-600 dark:text-sky-400' : ''}`}
              >
                Inventory History
              </Link>
            )}
            {canAccess('/analytics') && (
              <Link 
                href="/analytics" 
                data-active={router.pathname === '/analytics'}
                className={`px-2 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm ${router.pathname === '/analytics' ? 'text-sky-600 dark:text-sky-400' : ''}`}
              >
                Analytics & Reports
              </Link>
            )}
          </nav>
          </div>
        </>
        )}
      </div>
      </div>
      </header>
      
      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black/50 z-40 md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
          
          {/* Mobile Menu Drawer */}
          <div className="fixed top-0 left-0 bottom-0 w-[84vw] max-w-[360px] bg-white dark:bg-gray-900 z-50 md:hidden overflow-y-auto border-r border-gray-200 dark:border-gray-700 shadow-2xl">
            {/* Mobile Menu Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-2">
                <img 
                  src={user?.clinic?.iconUrl || "/favicon.png"} 
                  alt={user?.clinic?.name || "ERP Flow Studios"} 
                  className="w-8 h-8 object-contain"
                />
                <div className="relative">
                  <div className="text-lg font-bold bg-gradient-to-r from-brand to-sky-600 bg-clip-text text-transparent">{user?.clinic ? `${user.clinic.name} ERP` : title}</div>
                  {user?.clinic?.subscriptionPlan === 'pro' && (
                    <span className="absolute -top-2 -right-8 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-md shadow-sm shadow-amber-500/30 leading-none">
                      PRO
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                aria-label="Close menu"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Mobile Menu Content */}
            <nav className="flex flex-col p-4 space-y-1">
            
            {/* Quick Actions Section for Mobile */}
            <div className="pb-3 mb-3 border-b border-gray-200 dark:border-gray-700">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 px-4">Quick Actions</p>
              
              {/* App Switcher for Mobile */}
              <button
                onClick={() => {
                  setAppSwitcherModalOpen(true)
                  setMobileMenuOpen(false)
                }}
                className="w-full px-4 py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm flex items-center gap-3"
              >
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                <span>Switch App</span>
              </button>
              
              {/* Theme Toggle for Mobile */}
              <button
                onClick={() => {
                  toggleTheme()
                }}
                className="w-full px-4 py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm flex items-center gap-3"
              >
                {dark ? (
                  <>
                    <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6.76 4.84l-1.8-1.79L3.17 4.84l1.79 1.8 1.8-1.8zM1 13h3v-2H1v2zm10-9h2V1h-2v3zm7.03 1.05l1.8-1.8-1.8-1.79-1.79 1.79 1.79 1.8zM17 13h3v-2h-3v2zM6.76 19.16l-1.8 1.79L3.17 19.16l1.79-1.79 1.8 1.79zM12 20a1 1 0 110 2 1 1 0 010-2zm0-6a4 4 0 100-8 4 4 0 000 8z" />
                    </svg>
                    <span>Switch to Light Mode</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                    </svg>
                    <span>Switch to Dark Mode</span>
                  </>
                )}
              </button>
              
              {/* Tokens Button for Mobile (Admin/Reception but not Super Admin) */}
              {user && !isPatient && user.role !== 'super_admin' && onOpenTokenSidebar && (
                <button
                  onClick={() => {
                    onOpenTokenSidebar()
                    setMobileMenuOpen(false)
                  }}
                  className="w-full px-4 py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm flex items-center gap-3"
                >
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                  </svg>
                  <span>Token Queue</span>
                </button>
              )}
              
              {/* Upgrade button for mobile - basic/standard plan admins */}
              {user && user.role === 'admin' && user?.clinic?.subscriptionPlan !== 'pro' && !isWebsite && (
                <button
                  onClick={() => { setMobileMenuOpen(false); router.push('/upgrade') }}
                  title="Upgrade Plan"
                  className="w-full px-4 py-3 rounded-lg font-medium text-sm flex items-center gap-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 text-amber-700 dark:text-amber-400 hover:from-amber-100 hover:to-orange-100 dark:hover:from-amber-900/40 dark:hover:to-orange-900/40 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                  <span>Upgrade Plan</span>
                  <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </button>
              )}

            </div>
            
            {/* Navigation Section */}
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 px-4">Navigation</p>
            
            {/* Patient/User Mobile Navigation */}
            {isPatient && (
              <>
                <Link 
                  href="/visits" 
                  className="px-4 py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm flex items-center gap-3"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>Appointments</span>
                </Link>
                <Link 
                  href="/prescriptions" 
                  className="px-4 py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm flex items-center gap-3"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Prescriptions</span>
                </Link>
              </>
            )}
            
            {/* Staff/Admin/Doctor/Reception Mobile Navigation */}
            {!isPatient && (
              <>
                {/* Receptionist sees only Patients and Tasks */}
                {isReception && canAccess('/patients') && (
                  <>
                    <Link 
                      href="/patients" 
                      className="px-4 py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm flex items-center gap-3"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <span>Patients</span>
                    </Link>
                    <Link 
                      href="/tasks" 
                      className="px-4 py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm flex items-center gap-3"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                      <span>Tasks</span>
                    </Link>
                  </>
                )}
                
                {/* Full navigation for non-reception staff */}
                {!isReception && (
                <>
                {canAccess('/dashboard') && (
                  <Link 
                    href="/dashboard" 
                    className="px-4 py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm flex items-center gap-3"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Dashboard
                  </Link>
                )}
                {canAccess('/patients') && (
                  <Link 
                    href="/patients" 
                    className="px-4 py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm flex items-center gap-3"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span>Patients</span>
                  </Link>
                )}
                {canAccess('/treatments') && (
                  <Link 
                    href="/treatments" 
                    className="px-4 py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm flex items-center gap-3"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    <span>Treatments</span>
                  </Link>
                )}
                {canAccess('/products') && (
                  <Link 
                    href="/products" 
                    className="px-4 py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm flex items-center gap-3"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                    <span>Inventory</span>
                  </Link>
                )}
                {canAccess('/visits') && (
                  <Link 
                    href="/visits" 
                    className="px-4 py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm flex items-center gap-3"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    <span>Visits</span>
                  </Link>
                )}
                {canAccess('/invoices') && (
                  <Link 
                    href="/invoices" 
                    className="px-4 py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm flex items-center gap-3"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    <span>Invoices</span>
                  </Link>
                )}
                {canAccess('/suppliers') && (
                  <Link 
                    href="/suppliers" 
                    className="px-4 py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm flex items-center gap-3"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                    </svg>
                    <span>Suppliers</span>
                  </Link>
                )}
                {canAccess('/purchase-orders') && (
                  <Link 
                    href="/purchase-orders" 
                    className="px-4 py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm flex items-center gap-3"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                    <span>PO & Billing</span>
                  </Link>
                )}
                {canAccess('/stock-transactions') && (
                  <Link 
                    href="/stock-transactions" 
                    className="px-4 py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm flex items-center gap-3"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Inventory History</span>
                  </Link>
                )}
                {canAccess('/analytics') && (
                  <Link 
                    href="/analytics" 
                    className="px-4 py-3 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors font-medium text-sm flex items-center gap-3"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span>Analytics</span>
                  </Link>
                )}
                </>
                )}
              </>
            )}
            </div>
          </nav>
        </div>
        </>
      )}
    </>
  )
}
