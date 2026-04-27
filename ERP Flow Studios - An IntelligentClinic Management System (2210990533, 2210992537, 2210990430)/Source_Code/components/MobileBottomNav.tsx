import { useRouter } from 'next/router'
import { useState, useEffect, useMemo, useRef } from 'react'
import { canAccessRoute } from '../lib/permissions'
import useOfflineMode from '../hooks/useOfflineMode'

interface MobileBottomNavProps {
    user: any
}

export default function MobileBottomNav({ user }: MobileBottomNavProps) {
    const router = useRouter()
    const { isOnline, pendingSync } = useOfflineMode()
    const [pendingTasks, setPendingTasks] = useState(0)
    const touchStartX = useRef(0)
    const touchStartY = useRef(0)

    const isReception = user?.role === 'receptionist'

    // Poll pending task count for receptionists — must be before any early return
    useEffect(() => {
        if (!user || !isReception) return
        const load = async () => {
            try {
                const res = await fetch('/api/tasks')
                const data = await res.json()
                if (res.ok) {
                    const count = (data.tasks || []).filter((t: any) => t.status === 'pending').length
                    setPendingTasks(count)
                }
            } catch { /* ignore */ }
        }
        load()
        const iv = setInterval(load, 30000)
        const onUpdate = () => load()
        window.addEventListener('task-updated', onUpdate)
        return () => { clearInterval(iv); window.removeEventListener('task-updated', onUpdate) }
    }, [isReception])

    if (!user) return null

    const canAccess = (route: string) => canAccessRoute(user.role, route)
    const isPatient = user.role?.toLowerCase() === 'user'
    const isSuperAdmin = user.role === 'super_admin'

    if (isSuperAdmin) return null

    const navItems: { href: string; label: string; badge?: number; icon: React.ReactNode; onClick?: () => void }[] = []

    if (isPatient) {
        navItems.push(
            { href: '/visits', label: 'Visits', icon: <CalendarIcon /> },
            { href: '/prescriptions', label: 'Prescriptions', icon: <PrescriptionIcon /> },
            { href: '/profile', label: 'Profile', icon: <ProfileIcon /> },
        )
    } else if (isReception) {
        if (canAccess('/patients')) navItems.push({ href: '/patients', label: 'Patients', icon: <PatientsIcon /> })
        if (canAccess('/visits')) navItems.push({ href: '/visits', label: 'Visits', icon: <CalendarIcon /> })
        if (canAccess('/tasks')) navItems.push({ href: '/tasks', label: 'Tasks', icon: <TaskIcon />, badge: pendingTasks })
        navItems.push({ href: '/profile', label: 'Profile', icon: <ProfileIcon /> })
    } else {
        if (canAccess('/dashboard')) navItems.push({ href: '/dashboard', label: 'Home', icon: <HomeIcon /> })
        if (canAccess('/patients')) navItems.push({ href: '/patients', label: 'Patients', icon: <PatientsIcon /> })
        if (canAccess('/visits')) navItems.push({ href: '/visits', label: 'Visits', icon: <CalendarIcon /> })
        if (canAccess('/products')) navItems.push({ href: '/products', label: 'Stock', icon: <StockIcon /> })
        navItems.push({
            href: '/profile',
            label: 'More',
            icon: <MoreIcon />,
            onClick: () => window.dispatchEvent(new CustomEvent('open-mobile-menu')),
        })
    }

    const items = navItems.slice(0, 5)

    const swipeableItems = useMemo(
        () => items.filter((item) => item.label !== 'More'),
        [items]
    )

    useEffect(() => {
        // Prefetch nav destinations so adjacent swipes feel instant.
        swipeableItems.forEach((item) => {
            router.prefetch(item.href).catch(() => {})
        })
    }, [router, swipeableItems])

    const navigateWithDirection = (targetHref: string) => {
        const currentIndex = swipeableItems.findIndex((item) => router.pathname === item.href || router.pathname.startsWith(item.href + '/'))
        const targetIndex = swipeableItems.findIndex((item) => item.href === targetHref)

        if (currentIndex !== -1 && targetIndex !== -1 && currentIndex !== targetIndex) {
            const direction = targetIndex > currentIndex ? 'left' : 'right'
            window.dispatchEvent(new CustomEvent('mobile-swipe-navigation', { detail: { direction } }))
        }

        router.push(targetHref)
    }

    useEffect(() => {
        const MIN_DISTANCE = 80
        const MAX_VERTICAL_DRIFT = 60

        const onTouchStart = (e: TouchEvent) => {
            const target = e.target as HTMLElement | null
            if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
            const startY = e.touches[0].clientY
            // Trigger tab-swipe only from lower screen area to avoid accidental navigation while scrolling content.
            if (startY < window.innerHeight * 0.55) return
            touchStartX.current = e.touches[0].clientX
            touchStartY.current = startY
        }

        const onTouchEnd = (e: TouchEvent) => {
            const startX = touchStartX.current
            const startY = touchStartY.current
            if (!startX && !startY) return

            const endX = e.changedTouches[0].clientX
            const endY = e.changedTouches[0].clientY
            const dx = endX - startX
            const dy = endY - startY

            touchStartX.current = 0
            touchStartY.current = 0

            if (Math.abs(dy) > MAX_VERTICAL_DRIFT || Math.abs(dx) < MIN_DISTANCE) return

            const currentIndex = swipeableItems.findIndex((item) => router.pathname === item.href || router.pathname.startsWith(item.href + '/'))
            if (currentIndex === -1) return

            if (dx < 0 && currentIndex < swipeableItems.length - 1) {
                window.dispatchEvent(new CustomEvent('mobile-swipe-navigation', { detail: { direction: 'left' } }))
                router.push(swipeableItems[currentIndex + 1].href)
            } else if (dx > 0 && currentIndex > 0) {
                window.dispatchEvent(new CustomEvent('mobile-swipe-navigation', { detail: { direction: 'right' } }))
                router.push(swipeableItems[currentIndex - 1].href)
            }
        }

        document.addEventListener('touchstart', onTouchStart, { passive: true })
        document.addEventListener('touchend', onTouchEnd, { passive: true })
        return () => {
            document.removeEventListener('touchstart', onTouchStart)
            document.removeEventListener('touchend', onTouchEnd)
        }
    }, [router, swipeableItems])

    return (
        <>
            {/* Offline pill above nav */}
            {!isOnline && (
                <div
                    className="fixed z-[61] flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-white"
                    style={{
                        bottom: 72,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'rgba(217,119,6,0.97)',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                        boxShadow: '0 2px 12px rgba(0,0,0,0.25)',
                        whiteSpace: 'nowrap',
                    }}
                >
                    <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
                    </svg>
                    <span>Offline{pendingSync > 0 ? ` · ${pendingSync} pending` : ''}</span>
                </div>
            )}

            {/* Bottom nav bar */}
            <nav
                className="fixed bottom-0 left-0 right-0 z-[60] safe-area-bottom"
                style={{
                    background: 'rgba(255,255,255,0.82)',
                    backdropFilter: 'blur(28px) saturate(200%)',
                    WebkitBackdropFilter: 'blur(28px) saturate(200%)',
                    borderTop: '1px solid rgba(0,0,0,0.07)',
                    boxShadow: '0 -4px 24px rgba(0,0,0,0.08)',
                }}
            >
                {/* Top hairline */}
                <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.95) 20%, rgba(255,255,255,0.95) 80%, transparent)', marginBottom: -1, pointerEvents: 'none' }} />

                <div className="flex items-end justify-around px-2 pt-2 pb-2 dark:[background:rgba(12,12,14,0.82)] dark:[border-top:1px_solid_rgba(255,255,255,0.07)]">
                    {items.map(item => {
                        const isActive = router.pathname === item.href || router.pathname.startsWith(item.href + '/')
                        return (
                            <button
                                key={item.href}
                                onClick={() => {
                                    if (item.onClick) {
                                        item.onClick()
                                    } else {
                                        navigateWithDirection(item.href)
                                    }
                                }}
                                className="relative flex flex-col items-center justify-end gap-1 min-w-[52px] px-1 pb-0.5 transition-all duration-200 active:scale-90 outline-none"
                                style={{ WebkitTapHighlightColor: 'transparent' }}
                            >
                                {/* Pill / icon container */}
                                <div className="relative">
                                    {/* Active pill background */}
                                    {isActive && (
                                        <span
                                            className="absolute inset-0 rounded-2xl"
                                            style={{
                                                background: 'var(--brand, #3B82F6)',
                                                opacity: 0.13,
                                                transform: 'scale(1.15)',
                                            }}
                                        />
                                    )}
                                    <div
                                        className="relative flex items-center justify-center w-10 h-8 rounded-2xl transition-all duration-200"
                                        style={isActive ? { color: 'var(--brand, #3B82F6)' } : { color: 'var(--nav-inactive, #6b7280)' }}
                                    >
                                        {item.icon}
                                        {/* Badge */}
                                        {(item.badge ?? 0) > 0 && (
                                            <span
                                                className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
                                                style={{ background: 'var(--brand, #3B82F6)', lineHeight: 1 }}
                                            >
                                                {(item.badge ?? 0) > 99 ? '99+' : item.badge}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Label */}
                                <span
                                    className="text-[10px] leading-none font-medium transition-all duration-200"
                                    style={isActive
                                        ? { color: 'var(--brand, #3B82F6)', fontWeight: 700 }
                                        : { color: 'var(--nav-inactive, #6b7280)' }
                                    }
                                >
                                    {item.label}
                                </span>

                                {/* Active dot */}
                                {isActive && (
                                    <span
                                        className="absolute top-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                                        style={{ background: 'var(--brand, #3B82F6)', marginTop: -2 }}
                                    />
                                )}
                            </button>
                        )
                    })}
                </div>
            </nav>
        </>
    )
}

/* ── Inline SVG icon components ── */
function HomeIcon() {
    return (
        <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
    )
}
function PatientsIcon() {
    return (
        <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
    )
}
function CalendarIcon() {
    return (
        <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
    )
}
function TaskIcon() {
    return (
        <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
    )
}
function StockIcon() {
    return (
        <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
    )
}
function ProfileIcon() {
    return (
        <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
    )
}
function PrescriptionIcon() {
    return (
        <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
    )
}
function MoreIcon() {
    return (
        <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="5" cy="12" r="1.8" />
            <circle cx="12" cy="12" r="1.8" />
            <circle cx="19" cy="12" r="1.8" />
        </svg>
    )
}
