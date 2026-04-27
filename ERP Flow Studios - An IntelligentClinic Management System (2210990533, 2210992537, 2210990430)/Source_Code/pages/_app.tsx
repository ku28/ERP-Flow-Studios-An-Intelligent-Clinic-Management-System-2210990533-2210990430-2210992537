import '../styles/globals.css'
import type { AppProps } from 'next/app'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Analytics } from '@vercel/analytics/next'
import { useRouter } from 'next/router'
import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Script from 'next/script'
import dynamic from 'next/dynamic'
import Layout from '../components/Layout'
import ToastNotification from '../components/ToastNotification'
import { useRelease } from '../hooks/useRelease'
import { useToast } from '../hooks/useToast'
import { useVersionCheck } from '../hooks/useVersionCheck'
import { ImportProvider } from '../contexts/ImportContext'
import { DataCacheProvider } from '../contexts/DataCacheContext'
import { AuthProvider, useAuth } from '../contexts/AuthContext'
import { DoctorProvider } from '../contexts/DoctorContext'
import { PageStateProvider } from '../contexts/PageStateContext'
import VoiceMicButton from '../components/VoiceMicButton'
import LanguageSwitcher from '../components/LanguageSwitcher'
import GoogleAnalytics from '../components/GoogleAnalytics'
import { initializeSyncQueue } from '../utils/syncQueue'
import { clearCachedCurrentUser, getCachedCurrentUser, setCachedCurrentUser } from '../lib/currentUserStorage'
import { initializeMobileNotifications } from '../lib/mobileNotifications'
import { initializeAndroidPermissions } from '../lib/mobilePermissions'
import { SITE_DESCRIPTION, SITE_OG_DESCRIPTION, SITE_TITLE, buildCanonicalUrl, getSiteUrl, normalizePath } from '../lib/seo'
import { OFFLINE_MODE_EVENT, getEffectiveOnlineState } from '../lib/offlineMode'
import '../utils/clearStorage' // Make storage utilities available in browser console

const VersionUpdateModal = dynamic(() => import('../components/VersionUpdateModal'))
const ReleaseBanner = dynamic(() => import('../components/ReleaseBanner'))
const UpdateModal = dynamic(() => import('../components/UpdateModal'))

const SITE_KEYWORDS = 'clinic management software, healthcare ERP, clinic ERP system, hospital management software, medical practice management, ERP Flow Studios'
const SITE_URL = getSiteUrl()
const SITE_OG_IMAGE = `${SITE_URL}/og-image.png`

type UpdaterEventName =
  | 'checking-for-update'
  | 'update-available'
  | 'download-progress'
  | 'update-downloaded'
  | 'error'

interface UpdaterEventPayload {
  event: UpdaterEventName
  status?: string
  version?: string | null
  percent?: number
  error?: string
}

declare global {
  interface Window {
    electronAPI?: {
      quitApp?: () => void
      startUpdateDownload?: () => Promise<{ ok: boolean; error?: string }>
      checkForUpdates?: () => Promise<{ ok: boolean; error?: string }>
      onUpdaterEvent?: (callback: (payload: UpdaterEventPayload) => void) => () => void
    }
  }
}

/** Bridge that syncs _app.tsx's activeUser into AuthContext so pages can
 *  use `useAuth()` instead of fetching /api/auth/me themselves. Must be
 *  rendered INSIDE AuthProvider. */
function AuthSync({ activeUser }: { activeUser: any | null | undefined }) {
  const { setExternalUser } = useAuth()
  useEffect(() => {
    // Wait until _app resolves auth state; avoids transient null redirects.
    if (activeUser === undefined) return
    setExternalUser(activeUser)
  }, [activeUser, setExternalUser])
  return null
}

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()
  const [authChecked, setAuthChecked] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [isNativeMobileApp, setIsNativeMobileApp] = useState(false)
  const [mobileSlideDirection, setMobileSlideDirection] = useState<'left' | 'right'>('left')
  const [faviconUrl, setFaviconUrl] = useState('/favicon.png')
  const [pageTitle, setPageTitle] = useState(SITE_TITLE)
  const [isProUser, setIsProUser] = useState(() => typeof window !== 'undefined' ? localStorage.getItem('clinicIsPro') === '1' : false)
  const [activeUser, setActiveUser] = useState<any | null | undefined>(undefined)
  const [trialReminderVisible, setTrialReminderVisible] = useState(false)
  const [trialReminderMessage, setTrialReminderMessage] = useState('')
  const { toasts, removeToast, showError, showInfo, showSuccess } = useToast()
  const [isOnline, setIsOnline] = useState(true)
  const { hasUpdate, latestRelease, displayType, dismissRelease } = useRelease()
  const versionCheck = useVersionCheck()
  const [updateDismissed, setUpdateDismissed] = useState(false)
  const [hasDesktopUpdaterBridge, setHasDesktopUpdaterBridge] = useState(false)
  const [desktopAutoUpdate, setDesktopAutoUpdate] = useState({
    visible: false,
    currentVersion: '',
    latestVersion: '',
    statusMessage: 'Checking for updates...',
    progressPercent: 0,
    isDownloading: false,
    isInstalling: false,
  })
  const mobileInitDoneRef = useRef(false)
  const splashHiddenRef = useRef(false)
  
  // Pages that don't require authentication
  const publicPages = ['/', '/app', '/download', '/clinic-login', '/register-clinic', '/login', '/signup', '/upgrade', '/review-upgrade-request', '/super-admin-login', '/privacy', '/privacy-policy', '/terms', '/refund-policy', '/contact', '/clinic-erp', '/clinic-management-software-india', '/features', '/pricing', '/blog/[slug]']
  const isPublicPage = publicPages.includes(router.pathname)
  const superAdminOnlyPages = ['/super-admin', '/super-admin-profile']
  
  // Landing pages that should not have page transitions
  const landingPages = ['/', '/download', '/about', '/services', '/gallery', '/contact', '/privacy-policy', '/terms', '/refund-policy', '/clinic-erp', '/clinic-management-software-india', '/features', '/pricing', '/blog/[slug]']
  const isLandingPage = landingPages.includes(router.pathname)
  
  // Edit pages that use their own EditLayout (no need for main Layout wrapper)
  const editPages = ['/edit', '/edit-about', '/edit-services', '/edit-gallery', '/edit-contact', '/super-admin-profile', '/clinic/branding-builder']
  const isEditPage = editPages.includes(router.pathname)
  const isBrandingBuilderPage = router.pathname === '/clinic/branding-builder'

  const isNativeCapacitorRuntime = () => {
    if (typeof window === 'undefined') return false
    const cap = (window as any).Capacitor
    if (!cap) return false
    if (typeof cap.isNativePlatform === 'function') return !!cap.isNativePlatform()
    if (typeof cap.getPlatform === 'function') return cap.getPlatform() !== 'web'
    return false
  }

  useEffect(() => {
    if (typeof window === 'undefined' || process.env.NODE_ENV !== 'development') return

    const w = window as any
    if (w.__devConsoleFiltered) return

    const originalLog = console.log
    const blockedPrefixes = ['[HMR] connected', '[Fast Refresh] rebuilding']

    console.log = (...args: any[]) => {
      const firstArg = typeof args[0] === 'string' ? args[0] : ''
      if (blockedPrefixes.some((prefix) => firstArg.startsWith(prefix))) {
        return
      }
      originalLog(...args)
    }

    w.__devConsoleFiltered = true
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const isNativeMobile = isNativeCapacitorRuntime()
    setIsNativeMobileApp(isNativeMobile)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setHasDesktopUpdaterBridge(
      !!window.electronAPI?.checkForUpdates && !!window.electronAPI?.onUpdaterEvent
    )
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.electronAPI?.onUpdaterEvent) return

    const removeListener = window.electronAPI.onUpdaterEvent((payload) => {
      setDesktopAutoUpdate((prev) => {
        if (payload.event === 'checking-for-update') {
          return {
            ...prev,
            statusMessage: payload.status || 'Checking for updates...'
          }
        }

        if (payload.event === 'update-available') {
          return {
            ...prev,
            visible: true,
            currentVersion: versionCheck.currentVersion || prev.currentVersion,
            latestVersion: payload.version || prev.latestVersion,
            statusMessage: payload.status || 'Update available',
            progressPercent: 0,
            isDownloading: false,
            isInstalling: false,
          }
        }

        if (payload.event === 'download-progress') {
          return {
            ...prev,
            visible: true,
            statusMessage: payload.status || 'Downloading update...',
            progressPercent: typeof payload.percent === 'number' ? payload.percent : prev.progressPercent,
            isDownloading: true,
          }
        }

        if (payload.event === 'update-downloaded') {
          return {
            ...prev,
            visible: true,
            statusMessage: payload.status || 'Update downloaded. Restarting...',
            progressPercent: 100,
            isDownloading: false,
            isInstalling: true,
          }
        }

        if (payload.event === 'error') {
          return {
            ...prev,
            visible: true,
            statusMessage: payload.error || payload.status || 'Update failed',
            isDownloading: false,
            isInstalling: false,
          }
        }

        return prev
      })
    })

    window.electronAPI.checkForUpdates?.().then((result) => {
      if (!result?.ok) {
        setDesktopAutoUpdate((prev) => ({
          ...prev,
          visible: true,
          statusMessage: result?.error || 'Unable to check for updates',
          isDownloading: false,
          isInstalling: false,
        }))
      }
    }).catch(() => {
      setDesktopAutoUpdate((prev) => ({
        ...prev,
        visible: true,
        statusMessage: 'Unable to check for updates',
        isDownloading: false,
        isInstalling: false,
      }))
    })

    return () => {
      removeListener?.()
    }
  }, [versionCheck.currentVersion])

  const startDesktopAutoUpdate = async () => {
    if (!window.electronAPI?.startUpdateDownload) return

    setDesktopAutoUpdate((prev) => ({
      ...prev,
      isDownloading: true,
      statusMessage: 'Starting download...',
    }))

    const result = await window.electronAPI.startUpdateDownload()
    if (!result.ok) {
      setDesktopAutoUpdate((prev) => ({
        ...prev,
        isDownloading: false,
        statusMessage: result.error || 'Unable to start update download',
      }))
    }
  }

  // Apply cached clinic branding immediately to avoid blocking route transitions on network.
  useEffect(() => {
    // Reset to default branding for super admin pages and the public landing page
    if (
      router.pathname === '/super-admin' ||
      router.pathname === '/super-admin-login' ||
      router.pathname === '/super-admin-profile' ||
      router.pathname === '/register-clinic' ||
      router.pathname === '/review-upgrade-request' ||
      router.pathname === '/' ||
      router.pathname === '/clinic-erp' ||
      router.pathname === '/clinic-management-software-india' ||
      router.pathname === '/features' ||
      router.pathname === '/pricing' ||
      router.pathname === '/download' ||
      router.pathname === '/about' ||
      router.pathname === '/services' ||
      router.pathname === '/gallery' ||
        router.pathname === '/contact' ||
        router.pathname === '/privacy' ||
        router.pathname === '/privacy-policy' ||
        router.pathname === '/terms' ||
        router.pathname === '/refund-policy'
    ) {
      localStorage.removeItem('clinicName')
      localStorage.removeItem('clinicIcon')
        setPageTitle(SITE_TITLE)
      setFaviconUrl('/favicon.png')
      // Keep default blue — do NOT apply any clinic theme
      document.documentElement.style.setProperty('--brand', '#3B82F6')
      document.documentElement.setAttribute('data-theme', 'blue')
      return
    }

    const storedClinicName = localStorage.getItem('clinicName')
    const storedClinicIcon = localStorage.getItem('clinicIcon')

      setPageTitle(storedClinicName ? `${storedClinicName} ERP` : SITE_TITLE)
    setFaviconUrl(storedClinicIcon || '/favicon.png')

    // Apply cached theme — set data-theme FIRST so CSS variable overrides fire immediately
    const cachedTheme = localStorage.getItem('clinicTheme') || 'blue'
    document.documentElement.setAttribute('data-theme', cachedTheme)

    const cachedBrand = localStorage.getItem('clinicBrandColor')
    const cachedBrandDark = localStorage.getItem('clinicBrandColorDark')
    if (cachedBrand) {
      document.documentElement.style.setProperty('--brand', cachedBrand)
    }
    if (cachedBrandDark) {
      document.documentElement.style.setProperty('--brand-dark', cachedBrandDark)
    }
  }, [router.pathname])

  useEffect(() => {
    // Skip auth check for public pages
    if (isPublicPage) {
      setAuthChecked(true)
      return
    }

    let cancelled = false

    const applyClinicBranding = (clinic: any) => {
      if (!clinic) return

      const clinicName = clinic.name || 'Clinic'
      localStorage.setItem('clinicName', clinicName)
      setPageTitle(`${clinicName} ERP`)

      const icon = clinic.iconUrl || clinic.logoUrl || ''
      if (icon) {
        localStorage.setItem('clinicIcon', icon)
        setFaviconUrl(icon)
      }

      // Apply clinic theme gradient via CSS variable
      const themeGradient = clinic.themeGradient || 'blue'
      const themeMap: Record<string, { brand: string; brandDark: string }> = {
        blue:    { brand: '#3B82F6', brandDark: '#60A5FA' },
        purple:  { brand: '#8B5CF6', brandDark: '#A78BFA' },
        emerald: { brand: '#10B981', brandDark: '#34D399' },
        rose:    { brand: '#F43F5E', brandDark: '#FB7185' },
        teal:    { brand: '#22C55E', brandDark: '#4ADE80' },
      }
      const colors = themeMap[themeGradient] || themeMap.blue
      document.documentElement.style.setProperty('--brand', colors.brand)
      document.documentElement.style.setProperty('--brand-dark', colors.brandDark)
      // Set data-theme so CSS variable blocks in globals.css fire for ALL blue/sky/indigo utilities
      document.documentElement.setAttribute('data-theme', themeGradient)
      localStorage.setItem('clinicTheme', themeGradient)
      localStorage.setItem('clinicBrandColor', colors.brand)
      localStorage.setItem('clinicBrandColorDark', colors.brandDark)
    }

    const handleUnauthenticated = (storedClinicId: string | null) => {
      if (superAdminOnlyPages.includes(router.pathname)) {
        router.push('/super-admin-login')
        return
      }

      const isNativeApp = typeof window !== 'undefined' && (!!(window as any).electronAPI || isNativeCapacitorRuntime())
      clearCachedCurrentUser()
      if (isNativeApp) {
        const next = storedClinicId
          ? `/login?clinicId=${encodeURIComponent(storedClinicId)}`
          : '/login'
        router.push(next)
      } else if (storedClinicId) {
        router.push(`/login?clinicId=${storedClinicId}`)
      } else {
        router.push('/clinic-login')
      }
    }

    const enforceRouteAccess = (user: any, storedClinicId: string | null) => {
      if (!user) {
        handleUnauthenticated(storedClinicId)
        return false
      }

      // Allow access if there's a stored clinic session even if user DB record doesn't have clinicId.
      if (user.role !== 'super_admin' && !user.clinicId && !storedClinicId) {
        showError('You must log in with a clinic to access the ERP system')
        router.push('/clinic-login')
        return false
      }

      // Super admin can only access super-admin pages.
      const superAdminPages = superAdminOnlyPages
      if (user.role === 'super_admin' && !superAdminPages.includes(router.pathname)) {
        router.push('/super-admin')
        return false
      }

      // Non-super-admin users cannot access super-admin page.
      if (user.role !== 'super_admin' && superAdminPages.includes(router.pathname)) {
        showError('Access denied')
        router.push('/dashboard')
        return false
      }

      const clinicUpgradeRequired = Boolean(user?.clinic?.upgradeRequired)
      const isUpgradeRoute = router.pathname === '/upgrade'
      if (user.role !== 'super_admin' && clinicUpgradeRequired && !isUpgradeRoute) {
        router.push('/upgrade?reason=trial_expired')
        return false
      }

      return true
    }

    const storedClinicId = localStorage.getItem('clinicId')
    const cachedUser = getCachedCurrentUser<any>()
    if (!cachedUser) {
      // If offline with no cache, allow render immediately (offline banner will show)
      if (!navigator.onLine) {
        setAuthChecked(true)
      } else {
        setAuthChecked(false)
      }
    }

    // Fast path: use cached user to avoid blocking initial render on network.
    if (cachedUser) {
      setActiveUser(cachedUser)
      if (enforceRouteAccess(cachedUser, storedClinicId)) {
        setAuthChecked(true)
        if (cachedUser.clinic) {
          applyClinicBranding(cachedUser.clinic)
          const subEnd = cachedUser.clinic.subscriptionEnd
          const subPlan = cachedUser.clinic.subscriptionPlan
          const isPro = subPlan === 'pro' && (!subEnd || new Date(subEnd) > new Date())
          if (isPro) { setIsProUser(true); localStorage.setItem('clinicIsPro', '1') }
        }
      }
    }

    // Revalidate auth in background to keep cache and clinic metadata fresh.
    const checkAuth = async () => {
      // If offline, trust cached session entirely — do not attempt redirect
      if (!navigator.onLine) {
        if (!cachedUser) {
          // No cache at all while offline: show app but it will be limited
          setAuthChecked(true)
        }
        return
      }
      try {
        const res = await fetch('/api/auth/me', {
          method: 'GET',
          credentials: 'include',
          cache: 'no-store'
        })
        const data = await res.json()

        if (cancelled) return

        if (!data.user) {
          setActiveUser(null)
          handleUnauthenticated(storedClinicId)
          return
        }

        setActiveUser(data.user)
        setCachedCurrentUser(data.user)

        // Store clinic info - prioritize user's clinic, fallback to stored clinic.
        if (data.user.clinic) {
          localStorage.setItem('clinicId', data.user.clinic.clinicId)
          applyClinicBranding(data.user.clinic)
          const subEnd = data.user.clinic.subscriptionEnd
          const subPlan = data.user.clinic.subscriptionPlan
          const isPro = subPlan === 'pro' && (!subEnd || new Date(subEnd) > new Date())
          setIsProUser(isPro)
          localStorage.setItem('clinicIsPro', isPro ? '1' : '0')
        } else if (storedClinicId) {
          localStorage.setItem('clinicId', storedClinicId)
        }

        if (enforceRouteAccess(data.user, storedClinicId)) {
          setAuthChecked(true)
        }
      } catch (err) {
        if (cancelled) return
        // Network error (offline / server unreachable) — keep the cached session
        // so the user stays on their current page instead of being kicked to login.
        if (cachedUser) {
          setActiveUser(cachedUser)
          setAuthChecked(true)
        } else {
          setActiveUser(null)
          // No cache and cannot reach server — redirect to login only when a
          // stored clinicId exists (so the login URL is correct), otherwise
          // go to clinic-login as a last resort.
          handleUnauthenticated(storedClinicId)
        }
      }
    }

    checkAuth()

    return () => {
      cancelled = true
    }
  }, [router.pathname, isPublicPage, router])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!activeUser?.clinic || activeUser?.role === 'super_admin') return
    if (router.pathname === '/upgrade') return

    const clinic = activeUser.clinic
    const isTrial = clinic.subscriptionStatus === 'trial'
    if (!isTrial) return

    const trialEndRaw = clinic.trialEndsAt
    const trialDaysTotal = Number(clinic.trialDaysTotal || 0)
    if (!trialEndRaw || !trialDaysTotal || trialDaysTotal <= 0) return

    const trialEnd = new Date(trialEndRaw)
    if (Number.isNaN(trialEnd.getTime())) return

    const now = new Date()
    if (now >= trialEnd) return

    const trialStart = new Date(trialEnd.getTime() - trialDaysTotal * 24 * 60 * 60 * 1000)
    const halfPoint = new Date(trialStart.getTime() + (trialEnd.getTime() - trialStart.getTime()) / 2)
    if (now < halfPoint) return

    const reminderKey = `trialReminderLastSeen_${clinic.id || clinic.clinicId || 'clinic'}_${activeUser.id || 'user'}`
    const lastSeenRaw = localStorage.getItem(reminderKey)
    const lastSeen = lastSeenRaw ? Number(lastSeenRaw) : 0
    const elapsed = now.getTime() - lastSeen
    const twentyFourHoursMs = 24 * 60 * 60 * 1000

    if (!lastSeen || elapsed >= twentyFourHoursMs) {
      const daysLeft = Number(clinic.trialDaysLeft || 0)
      setTrialReminderMessage(
        daysLeft > 0
          ? `Your free trial is in its final phase. ${daysLeft} day(s) left before upgrade is required.`
          : 'Your free trial is about to end. Upgrade now to prevent service interruption.'
      )
      setTrialReminderVisible(true)
    }
  }, [activeUser, router.pathname])

  const dismissTrialReminder = () => {
    const clinic = activeUser?.clinic
    if (typeof window !== 'undefined' && clinic) {
      const reminderKey = `trialReminderLastSeen_${clinic.id || clinic.clinicId || 'clinic'}_${activeUser?.id || 'user'}`
      localStorage.setItem(reminderKey, String(Date.now()))
    }
    setTrialReminderVisible(false)
  }

  // Offline / online detection
  useEffect(() => {
    setIsOnline(getEffectiveOnlineState())
    let syncTimer: ReturnType<typeof setTimeout> | null = null
    const handleOffline = () => setIsOnline(false)
    const handleOnline = () => {
      if (!getEffectiveOnlineState()) {
        setIsOnline(false)
        return
      }
      setIsOnline(true)
      showInfo('Reconnected — syncing data…')
      syncTimer = setTimeout(() => showSuccess('All data in sync ✓'), 2500)
    }
    const handleOfflineModeChanged = () => {
      const effectiveOnline = getEffectiveOnlineState()
      setIsOnline(effectiveOnline)
      if (!effectiveOnline && syncTimer) {
        clearTimeout(syncTimer)
      }
    }
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    window.addEventListener(OFFLINE_MODE_EVENT, handleOfflineModeChanged as EventListener)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener(OFFLINE_MODE_EVENT, handleOfflineModeChanged as EventListener)
      if (syncTimer) clearTimeout(syncTimer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle page transition progress bar.
  // router.events is a stable EventEmitter (same reference for the app's lifetime),
  // so [] is safe here. Using [router] was causing the effect to re-run mid-navigation
  // which cleared the fallback timer and left the bar stuck indefinitely.
  useEffect(() => {
    let fallbackTimer: ReturnType<typeof setTimeout>

    const handleStart = () => {
      clearTimeout(fallbackTimer)
      setIsTransitioning(true)
    }
    const hideBar = () => {
      clearTimeout(fallbackTimer)
      setIsTransitioning(false)
    }
    const handleComplete = () => {
      // Pages that dispatch 'page-data-loaded' hide it immediately; others fall back.
      fallbackTimer = setTimeout(hideBar, isNativeMobileApp ? 280 : 800)
    }

    router.events.on('routeChangeStart', handleStart)
    router.events.on('routeChangeComplete', handleComplete)
    router.events.on('routeChangeError', hideBar)
    window.addEventListener('page-data-loaded', hideBar)

    return () => {
      clearTimeout(fallbackTimer)
      router.events.off('routeChangeStart', handleStart)
      router.events.off('routeChangeComplete', handleComplete)
      router.events.off('routeChangeError', hideBar)
      window.removeEventListener('page-data-loaded', hideBar)
    }
  }, [isNativeMobileApp, router.events])

  useEffect(() => {
    if (!isNativeMobileApp || typeof window === 'undefined') return

    const handleDirection = (event: Event) => {
      const custom = event as CustomEvent<{ direction?: 'left' | 'right' }>
      if (custom.detail?.direction === 'left' || custom.detail?.direction === 'right') {
        setMobileSlideDirection(custom.detail.direction)
      }
    }

    window.addEventListener('mobile-swipe-navigation', handleDirection as EventListener)
    return () => {
      window.removeEventListener('mobile-swipe-navigation', handleDirection as EventListener)
    }
  }, [isNativeMobileApp])

  // Initialize offline sync queue for mobile app
  useEffect(() => {
    if (typeof window !== 'undefined' && isNativeCapacitorRuntime() && !mobileInitDoneRef.current) {
      mobileInitDoneRef.current = true
      initializeSyncQueue()
      initializeMobileNotifications()
      initializeAndroidPermissions()
    }
  }, [])

  useEffect(() => {
    if (!isNativeMobileApp) return

    let cancelled = false

    const configureNativeBars = async () => {
      try {
        const cap = (window as any).Capacitor
        if (cancelled || !cap) return

        const platform = typeof cap.getPlatform === 'function' ? cap.getPlatform() : 'web'
        if (platform !== 'android') return

        const statusBar = cap.Plugins?.StatusBar
        if (!statusBar) return

        await statusBar.setOverlaysWebView?.({ overlay: false })
        await statusBar.setBackgroundColor?.({ color: '#0f172a' })
        await statusBar.setStyle?.({ style: 'DARK' })
      } catch {
        // Ignore plugin/config errors and keep the app usable.
      }
    }

    configureNativeBars()
    return () => { cancelled = true }
  }, [isNativeMobileApp])

  useEffect(() => {
    if (!isNativeMobileApp) return
    if (splashHiddenRef.current) return
    if (!(authChecked || isPublicPage)) return

    let cancelled = false

    const hideNativeSplash = async () => {
      try {
        const splash = (window as any).Capacitor?.Plugins?.SplashScreen
        if (!splash) {
          splashHiddenRef.current = true
          return
        }
        if (cancelled) return
        await splash.hide?.()
        splashHiddenRef.current = true
      } catch {
        // Ignore plugin/config errors and keep the app usable.
      }
    }

    hideNativeSplash()
    return () => { cancelled = true }
  }, [authChecked, isNativeMobileApp, isPublicPage])



  const canonicalUrl = buildCanonicalUrl(normalizePath(router.asPath))

  return (
    <>
      {/* Page transition progress bar – always uses clinic brand color (var(--brand) defaults to blue) */}
      {!isNativeMobileApp && isTransitioning && (
        <div
          className="fixed top-0 left-0 right-0 h-[3px]"
          style={{ zIndex: 999999, background: 'var(--brand, #3B82F6)' }}
        >
          <div
            className="h-full animate-progress-bar"
            style={{
              background: 'linear-gradient(90deg, transparent, var(--brand-dark, var(--brand, #60A5FA)))',
              boxShadow: '0 0 8px var(--brand, #3B82F6)'
            }}
          />
        </div>
      )}
      <PageStateProvider>
        <AuthProvider>
              <AuthSync activeUser={activeUser} />
          <DoctorProvider>
            <DataCacheProvider>
              <ImportProvider>
              <ToastNotification toasts={toasts} removeToast={removeToast} />
            {/* Offline indicator banner */}
            {!isOnline && (
              <div
                className="fixed top-0 left-0 right-0 z-[99999] flex items-center justify-center gap-2 px-3 py-1.5 text-white text-xs font-medium"
                style={{ background: 'linear-gradient(90deg, #b45309 0%, #d97706 100%)', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
                  <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                  <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
                  <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                  <line x1="12" y1="20" x2="12.01" y2="20" />
                </svg>
                <span>You are offline — some features may be unavailable</span>
              </div>
            )}
            {/* Platform update modal (version.json-driven for web/mobile and legacy desktop clients) */}
            {versionCheck.updateAvailable && !updateDismissed && versionCheck.currentVersion && versionCheck.latestVersion && versionCheck.downloadUrl && (versionCheck.platform !== 'desktop' || !hasDesktopUpdaterBridge) && (
              <UpdateModal
                currentVersion={versionCheck.currentVersion}
                latestVersion={versionCheck.latestVersion}
                downloadUrl={versionCheck.downloadUrl}
                platform={versionCheck.platform}
                onDismiss={() => setUpdateDismissed(true)}
              />
            )}
            {/* Desktop in-app auto updater modal (electron-updater-driven) */}
            {desktopAutoUpdate.visible && !updateDismissed && (
              <UpdateModal
                currentVersion={desktopAutoUpdate.currentVersion || versionCheck.currentVersion || 'Current'}
                latestVersion={desktopAutoUpdate.latestVersion || versionCheck.latestVersion || 'Latest'}
                platform="desktop"
                statusMessage={desktopAutoUpdate.statusMessage}
                progressPercent={desktopAutoUpdate.progressPercent}
                isDownloading={desktopAutoUpdate.isDownloading}
                isInstalling={desktopAutoUpdate.isInstalling}
                onDesktopUpdate={startDesktopAutoUpdate}
                onDismiss={() => setUpdateDismissed(true)}
              />
            )}
            {/* Database-driven release notifications */}
            {hasUpdate && latestRelease && displayType === 'modal' && (
              <VersionUpdateModal release={latestRelease} onDismiss={dismissRelease} />
            )}
            {hasUpdate && latestRelease && displayType === 'banner' && (
              <ReleaseBanner release={latestRelease} onDismiss={dismissRelease} />
            )}
            {trialReminderVisible && (
              <div className="fixed inset-0 z-[100000] bg-black/45 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-2xl border border-amber-200 bg-white shadow-2xl p-5">
                  <h3 className="text-lg font-bold text-gray-900">Trial Reminder</h3>
                  <p className="mt-2 text-sm text-gray-600">{trialReminderMessage}</p>
                  <div className="mt-5 flex gap-3">
                    <button
                      type="button"
                      onClick={dismissTrialReminder}
                      className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Maybe Later
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        dismissTrialReminder()
                        router.push('/upgrade?reason=trial_reminder')
                      }}
                      className="flex-1 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
                    >
                      Upgrade
                    </button>
                  </div>
                </div>
              </div>
            )}
        <Head>
          <meta charSet="utf-8" />
          <title>{pageTitle}</title>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
          <meta name="description" content={SITE_DESCRIPTION} key="description" />
          <meta name="keywords" content={SITE_KEYWORDS} key="keywords" />
          <meta name="robots" content="index, follow" key="robots" />
          <link rel="canonical" href={canonicalUrl} key="canonical" />
          <meta property="og:title" content={SITE_TITLE} key="og:title" />
          <meta property="og:description" content={SITE_OG_DESCRIPTION} key="og:description" />
          <meta property="og:image" content={SITE_OG_IMAGE} key="og:image" />
          <meta property="og:url" content={canonicalUrl} key="og:url" />
          <meta property="og:type" content="website" key="og:type" />
          <meta property="og:site_name" content="ERP Flow Studios" key="og:site_name" />
          <meta name="twitter:card" content="summary_large_image" key="twitter:card" />
          <meta name="twitter:title" content={SITE_TITLE} key="twitter:title" />
          <meta name="twitter:description" content={SITE_OG_DESCRIPTION} key="twitter:description" />
          <meta name="twitter:image" content={SITE_OG_IMAGE} key="twitter:image" />
          {/* PWA manifest */}
          <link rel="manifest" href="/manifest.webmanifest" />
          {/* Dynamic favicon based on clinic */}
          <link rel="icon" href={faviconUrl} type="image/png" />
          <link rel="shortcut icon" href={faviconUrl} />
          {/* PWA meta tags */}
          <meta name="mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
          <meta name="apple-mobile-web-app-title" content="ERP Flow Studios" />
          <link rel="apple-touch-icon" href="/favicon.png" />
          {/* Fallback small PNG data URI in case the .ico doesn't surface due to cache or server issues */}
          <link rel="icon" href="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAQAAAC1+jfqAAAAKUlEQVR4AWP4z8DAwMjI+P///xkYGBgYGRgYGBgYGBgYAAAs6QFQz5lXJwAAAABJRU5ErkJggg==" type="image/png" sizes="16x16" />
          <meta name="theme-color" content="#000000" />
        </Head>

      {/* Prevent theme flash by setting theme before React hydrates */}
      <Script
        id="theme-script"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                var theme = localStorage.getItem('theme');
                if (theme === 'dark') {
                  document.documentElement.classList.add('dark');
                } else if (theme === 'light') {
                  document.documentElement.classList.remove('dark');
                } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                  document.documentElement.classList.add('dark');
                }
              } catch (e) {}
            })();
          `,
        }}
      />

      <GoogleAnalytics />

      {/* Conditionally wrap with Layout - skip for edit pages that have their own EditLayout */}
      {isEditPage ? (
        <>
          {/* Only render component after auth check (or if public page) */}
          {(authChecked || isPublicPage) ? (
            <div className={`${!isLandingPage
              ? (isNativeMobileApp
                ? `mobile-page-transition ${isTransitioning ? `mobile-page-transition--${mobileSlideDirection}` : ''}`
                : `page-transition ${isTransitioning ? 'page-exiting' : 'page-entering'}`)
              : ''}`}>
              <Component {...pageProps} />
            </div>
          ) : (
            <div className="flex items-center justify-center min-h-screen">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand mx-auto mb-4"></div>
                <p className="text-muted">Checking authentication...</p>
              </div>
            </div>
          )}
          {/* Keep full-screen builder workspace unobstructed by floating globals */}
          {!isBrandingBuilderPage && <VoiceMicButton />}
          {!isBrandingBuilderPage && (
            <div className="fixed top-3 right-3 sm:top-4 sm:right-4" style={{ zIndex: 9900 }}>
              <LanguageSwitcher />
            </div>
          )}
        </>
      ) : (
        <Layout>
          {/* Only render component after auth check (or if public page) */}
          {(authChecked || isPublicPage) ? (
            <div className={`${!isLandingPage
              ? (isNativeMobileApp
                ? `mobile-page-transition ${isTransitioning ? `mobile-page-transition--${mobileSlideDirection}` : ''}`
                : `page-transition ${isTransitioning ? 'page-exiting' : 'page-entering'}`)
              : ''}`}>
              <Component {...pageProps} />
            </div>
          ) : (
            <div className="flex items-center justify-center min-h-screen">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand mx-auto mb-4"></div>
                <p className="text-muted">Checking authentication...</p>
              </div>
            </div>
          )}
        </Layout>
      )}
          </ImportProvider>
        </DataCacheProvider>
        </DoctorProvider>
      </AuthProvider>
      </PageStateProvider>
      {process.env.NODE_ENV === 'production' ? <SpeedInsights /> : null}
      {process.env.NODE_ENV === 'production' ? <Analytics /> : null}
    </>
  )
}
