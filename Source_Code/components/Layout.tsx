import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Header from './Header'
import DesktopHeader from './DesktopHeader'
import MobileBottomNav from './MobileBottomNav'
import Footer from './Footer'
import FloatingPrescriptionButton from './FloatingPrescriptionButton'
import FloatingTaskButton from './FloatingTaskButton'
import TaskSidebar from './TaskSidebar'
import TokenSidebar from './TokenSidebar'
import TaskNotificationSystem from './TaskNotificationSystem'
import VoiceMicButton from './VoiceMicButton'
import LanguageSwitcher from './LanguageSwitcher'
import CommandPalette from './CommandPalette'
import NotificationCenter from './NotificationCenter'
import KeyboardShortcutsModal from './KeyboardShortcutsModal'
import OfflineBanner from './OfflineBanner'
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts'
import { useAuth } from '../contexts/AuthContext'

export default function Layout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { user: authUser } = useAuth()
  const [user, setUser] = useState<any>(null)
  const [tokenSidebarOpen, setTokenSidebarOpen] = useState(false)
  const [taskSidebarOpen, setTaskSidebarOpen] = useState(false)
  const [nativePlatform, setNativePlatform] = useState<'desktop' | 'mobile' | null>(null)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const landingPages = ['/', '/download', '/about', '/services', '/gallery', '/contact', '/privacy', '/privacy-policy', '/terms', '/refund-policy', '/clinic-erp', '/clinic-management-software-india', '/features', '/pricing', '/blog/[slug]']
  const isLanding = landingPages.includes(router.pathname)
  const isNativeApp = nativePlatform !== null
  const isDesktop = nativePlatform === 'desktop'
  const isPatient = user?.role?.toLowerCase() === 'user'
  const isReception = user?.role === 'receptionist'
  const isSuperAdmin = user?.role === 'super_admin'
  const isUpgradePage = router.pathname === '/upgrade'
  const upgradeReason = typeof router.query?.reason === 'string' ? router.query.reason : ''
  const showUpgradeLockHeader = isUpgradePage && (upgradeReason === 'trial_expired' || upgradeReason === 'trial_reminder' || user?.clinic?.upgradeRequired)

  const isNativeCapacitorRuntime = () => {
    if (typeof window === 'undefined') return false
    const cap = (window as any).Capacitor
    if (!cap) return false
    if (typeof cap.isNativePlatform === 'function') return !!cap.isNativePlatform()
    if (typeof cap.getPlatform === 'function') return cap.getPlatform() !== 'web'
    return false
  }

  // Keyboard shortcuts for native apps
  useKeyboardShortcuts({
    onOpenCommandPalette: () => setCommandPaletteOpen(true),
    enabled: isNativeApp && !isLanding,
  })

  useEffect(() => {
    if (nativePlatform !== 'mobile' || isLanding) return

    const EDGE_SIZE = 24
    const MIN_DISTANCE = 70
    const MAX_VERTICAL_DRIFT = 60

    let startX = 0
    let startY = 0
    let zone: 'none' | 'left' | 'right-top' | 'right-bottom' = 'none'

    const isInteractiveTarget = (target: EventTarget | null) => {
      const el = target as HTMLElement | null
      if (!el) return false
      return !!(
        el.closest('input, textarea, select, button, a, [role="button"], [contenteditable="true"]')
      )
    }

    const onTouchStart = (e: TouchEvent) => {
      if (isInteractiveTarget(e.target)) {
        zone = 'none'
        return
      }

      const t = e.touches[0]
      startX = t.clientX
      startY = t.clientY
      zone = 'none'

      const width = window.innerWidth
      const height = window.innerHeight
      if (startX <= EDGE_SIZE) {
        zone = 'left'
      } else if (startX >= width - EDGE_SIZE) {
        zone = startY >= height / 2 ? 'right-bottom' : 'right-top'
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (zone === 'none') return

      const t = e.changedTouches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY

      if (Math.abs(dy) > MAX_VERTICAL_DRIFT) {
        zone = 'none'
        return
      }

      if (zone === 'left' && dx > MIN_DISTANCE) {
        window.dispatchEvent(new CustomEvent('open-mobile-menu'))
      } else if (zone === 'right-top' && dx < -MIN_DISTANCE && !!user) {
        setTokenSidebarOpen(true)
      } else if (zone === 'right-bottom' && dx < -MIN_DISTANCE) {
        if (!!user && !isPatient && !isReception && !isSuperAdmin) {
          setTaskSidebarOpen(true)
        }
      }

      zone = 'none'
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchend', onTouchEnd)
    }
  }, [nativePlatform, isLanding, isPatient, isReception, isSuperAdmin, user])

  // Sync user from AuthContext instead of fetching /api/auth/me on every route change
  useEffect(() => {
    setUser(authUser)
  }, [authUser])

  useEffect(() => {
    // Detect native app environment
    const hasElectron = !!(window as any).electronAPI
    const hasCapacitor = isNativeCapacitorRuntime()
    if (hasElectron) setNativePlatform('desktop')
    else if (hasCapacitor) setNativePlatform('mobile')
    else setNativePlatform(null)
  }, [])

  useEffect(() => {
    const bodyClass = 'native-mobile-app'
    if (nativePlatform === 'mobile') {
      document.body.classList.add(bodyClass)
    } else {
      document.body.classList.remove(bodyClass)
    }

    return () => {
      document.body.classList.remove(bodyClass)
    }
  }, [nativePlatform])

  useEffect(() => {
    const keyboardClass = 'native-mobile-keyboard-open'
    const body = document.body

    if (nativePlatform !== 'mobile') {
      body.classList.remove(keyboardClass)
      body.style.setProperty('--mobile-keyboard-inset', '0px')
      return
    }

    const updateKeyboardInset = () => {
      const vv = window.visualViewport
      if (!vv) {
        body.classList.remove(keyboardClass)
        body.style.setProperty('--mobile-keyboard-inset', '0px')
        return
      }

      const layoutHeight = window.innerHeight
      const keyboardInset = Math.max(0, Math.round(layoutHeight - vv.height - vv.offsetTop))

      body.style.setProperty('--mobile-keyboard-inset', `${keyboardInset}px`)
      if (keyboardInset > 80) {
        body.classList.add(keyboardClass)
      } else {
        body.classList.remove(keyboardClass)
      }
    }

    updateKeyboardInset()
    window.visualViewport?.addEventListener('resize', updateKeyboardInset)
    window.visualViewport?.addEventListener('scroll', updateKeyboardInset)
    window.addEventListener('resize', updateKeyboardInset)

    return () => {
      window.visualViewport?.removeEventListener('resize', updateKeyboardInset)
      window.visualViewport?.removeEventListener('scroll', updateKeyboardInset)
      window.removeEventListener('resize', updateKeyboardInset)
      body.classList.remove(keyboardClass)
      body.style.setProperty('--mobile-keyboard-inset', '0px')
    }
  }, [nativePlatform])

  // Sync sidebar collapsed state from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('desktop-sidebar-collapsed')
      if (stored === 'true') setSidebarCollapsed(true)
    } catch {}
    const handler = () => {
      try {
        setSidebarCollapsed(localStorage.getItem('desktop-sidebar-collapsed') === 'true')
      } catch {}
    }
    window.addEventListener('storage', handler)
    // Also listen for internal changes
    const observer = new MutationObserver(() => {
      try {
        setSidebarCollapsed(localStorage.getItem('desktop-sidebar-collapsed') === 'true')
      } catch {}
    })
    observer.observe(document.body, { attributes: true, subtree: false })
    // Poll for sidebar state changes (since localStorage changes within same tab don't fire 'storage')
    const interval = setInterval(handler, 500)
    return () => {
      window.removeEventListener('storage', handler)
      observer.disconnect()
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    // Listen for custom events from floating buttons and gesture handlers
    const handleOpenTokenSidebar = () => setTokenSidebarOpen(true)
    const handleOpenTaskSidebar = () => setTaskSidebarOpen(true)
    window.addEventListener('open-token-sidebar', handleOpenTokenSidebar)
    window.addEventListener('open-task-sidebar', handleOpenTaskSidebar)

    return () => {
      window.removeEventListener('open-token-sidebar', handleOpenTokenSidebar)
      window.removeEventListener('open-task-sidebar', handleOpenTaskSidebar)
    }
  }, [])

  // Pages that should NOT show the background watermark
  const noWatermarkPaths = ['/', '/clinic-login', '/clinic-edit', '/login', '/signup',
    '/about', '/services', '/gallery', '/contact']
  const isNoWatermarkPage = noWatermarkPaths.includes(router.pathname) ||
    router.pathname.startsWith('/clinic-edit')

  // Watermark URL: super_admin uses favicon; regular users use clinic logo → favicon fallback
  const bgWatermarkUrl = isSuperAdmin
    ? '/favicon.png'
    : (user?.clinic?.iconUrl || '/favicon.png')

  const showBgWatermark = !isNoWatermarkPage && !!user

  // Desktop sidebar offset for content
  const desktopContentMargin = isDesktop && !isLanding ? (sidebarCollapsed ? 'ml-[52px]' : 'ml-[220px]') : ''

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--bg)', position: 'relative' }}>
      {/* Background watermark – clinic logo at 30% opacity, shown on all app pages */}
      {showBgWatermark && (
        <div
          aria-hidden="true"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundImage: `url(${bgWatermarkUrl})`,
            backgroundSize: '280px',
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'center',
            opacity: 0.3,
            pointerEvents: 'none',
            zIndex: 0
          }}
        />
      )}

      {/* Render platform-specific header/sidebar */}
      {isLanding ? null : (
        isDesktop
          ? <DesktopHeader
              onOpenTokenSidebar={() => setTokenSidebarOpen(true)}
              onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            />
          : <Header onOpenTokenSidebar={() => setTokenSidebarOpen(true)} />
      )}

      {showUpgradeLockHeader && (
        <div className="w-full border-b border-red-200 bg-red-50">
          <div className="max-w-7xl mx-auto px-4 py-3 text-center">
            <p className="text-sm font-semibold text-red-700">
              Trial expired. Upgrade is required to restore full clinic access.
            </p>
          </div>
        </div>
      )}

      {/* Main content area — offset by sidebar width on desktop */}
      <div className={`flex-1 flex flex-col transition-all duration-200 ${desktopContentMargin}`}>
        {isLanding ? (
          <main className="flex-1 w-full" style={{ position: 'relative' }}>{children}</main>
        ) : (
          <div className={`flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 ${nativePlatform === 'mobile' ? 'pb-20' : ''}`} style={{ position: 'relative' }}>
            <main className={isDesktop ? 'py-4' : 'py-6'}>{children}</main>
          </div>
        )}

        {!isLanding && !isNativeApp && !isUpgradePage && <Footer />}
      </div>

      {/* Show FloatingPrescriptionButton for staff/admin/doctor but not reception or super admin – hide on mobile */}
      {!isLanding && !isUpgradePage && !!user && !isPatient && !isReception && !isSuperAdmin && nativePlatform !== 'mobile' && <FloatingPrescriptionButton />}
      
      {/* Show FloatingTaskButton for admin/doctor roles only, not for super admin */}
      {!isLanding && !isUpgradePage && !!user && !isSuperAdmin && nativePlatform !== 'mobile' && router.pathname !== '/prescriptions' && <FloatingTaskButton userRole={user?.role} hasOtherFloatingButton={!isPatient && !isReception} />}

      {/* Task Sidebar (mobile edge gestures / desktop explicit open) */}
      {!isLanding && !isUpgradePage && !!user && !isPatient && !isReception && !isSuperAdmin && (
        <TaskSidebar
          isOpen={taskSidebarOpen}
          onClose={() => setTaskSidebarOpen(false)}
        />
      )}

      {/* Token Sidebar - Show for reception and other staff roles, but NOT for super admin or patients */}
      {!isLanding && !isUpgradePage && !!user && !isPatient && !isSuperAdmin && (
        <TokenSidebar 
          isOpen={tokenSidebarOpen} 
          onClose={() => setTokenSidebarOpen(false)} 
        />
      )}

      {/* Task Notification System - Show for receptionists only, NOT for super admin */}
      {!isLanding && !isUpgradePage && !!user && !isSuperAdmin && <TaskNotificationSystem userRole={user?.role} />}

      {/* Mobile bottom navigation bar - only in Capacitor APK */}
      {!isLanding && !!user && nativePlatform === 'mobile' && <MobileBottomNav user={user} />}

      {/* Global floating voice-to-text mic button – shown on all app pages */}
      {!isLanding && !isUpgradePage && (
        <VoiceMicButton
          leftOffset={isDesktop
            ? (sidebarCollapsed ? 'calc(52px + 1.5rem)' : 'calc(220px + 1.5rem)')
            : '1.5rem'
          }
          bottomOffset={nativePlatform === 'mobile' ? '5.5rem' : '1.5rem'}
        />
      )}

      {/* Command Palette - available in native apps */}
      {isNativeApp && (
        <CommandPalette isOpen={commandPaletteOpen} onClose={() => setCommandPaletteOpen(false)} />
      )}

      {/* Notification Center panel */}
      <NotificationCenter isOpen={notificationCenterOpen} onClose={() => setNotificationCenterOpen(false)} />

      {/* Keyboard Shortcuts Modal - available everywhere */}
      <KeyboardShortcutsModal />

      {/* Offline Banner - mobile native apps only */}
      {nativePlatform === 'mobile' && <OfflineBanner />}
    </div>
  )
}
