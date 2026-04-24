import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { canAccessRoute } from '../lib/permissions'

interface MobileFABProps {
    user: any
}

export default function MobileFAB({ user }: MobileFABProps) {
    const [open, setOpen] = useState(false)
    const router = useRouter()
    const fabRef = useRef<HTMLDivElement>(null)

    const canAccess = (route: string) => user ? canAccessRoute(user.role, route) : false
    const isPatient = user?.role?.toLowerCase() === 'user'
    const isSuperAdmin = user?.role === 'super_admin'

    // Close on outside click
    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (fabRef.current && !fabRef.current.contains(e.target as Node)) setOpen(false)
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [open])

    // Close on route change
    useEffect(() => { setOpen(false) }, [router.pathname])

    if (!user || isPatient || isSuperAdmin) return null

    type FabAction = { label: string; icon: string; onClick: () => void; color: string }
    const actions: FabAction[] = []

    if (canAccess('/patients')) {
        actions.push({
            label: 'New Patient',
            icon: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z',
            onClick: () => { router.push('/patients?action=new'); setOpen(false) },
            color: 'bg-blue-500'
        })
    }
    if (canAccess('/visits')) {
        actions.push({
            label: 'New Visit',
            icon: 'M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z',
            onClick: () => { router.push('/visits?action=new'); setOpen(false) },
            color: 'bg-emerald-500'
        })
    }
    if (canAccess('/invoices')) {
        actions.push({
            label: 'New Invoice',
            icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z',
            onClick: () => { router.push('/invoices?action=new'); setOpen(false) },
            color: 'bg-purple-500'
        })
    }

    if (actions.length === 0) return null

    return (
        <div ref={fabRef} className="fixed right-4 z-[55] mobile-safe-fab mobile-safe-fab-primary" style={{ bottom: '72px' }}>
            {/* Expanded actions */}
            {open && (
                <div className="absolute bottom-14 right-0 flex flex-col items-end gap-2 mb-2 animate-fab-expand">
                    {actions.map((action, i) => (
                        <button
                            key={i}
                            onClick={action.onClick}
                            className="flex items-center gap-2 pl-3 pr-2 py-2 rounded-full shadow-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 transition-all active:scale-95"
                            style={{ animationDelay: `${i * 50}ms` }}
                        >
                            <span className="text-xs font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap">{action.label}</span>
                            <div className={`${action.color} p-1.5 rounded-full`}>
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" d={action.icon} />
                                </svg>
                            </div>
                        </button>
                    ))}
                </div>
            )}

            {/* FAB button */}
            <button
                onClick={() => setOpen(!open)}
                className={`w-12 h-12 rounded-full shadow-xl flex items-center justify-center transition-all duration-200 active:scale-90 ${open
                    ? 'bg-gray-700 dark:bg-gray-600 rotate-45'
                    : 'bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600'
                    }`}
            >
                <svg className="w-6 h-6 text-white transition-transform duration-200" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
                </svg>
            </button>
        </div>
    )
}