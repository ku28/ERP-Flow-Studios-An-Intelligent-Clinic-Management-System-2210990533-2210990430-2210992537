import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/router'
import { canAccessRoute } from '../lib/permissions'
import { isBasicPlan } from '../lib/subscription'
import { useAuth } from '../contexts/AuthContext'

interface CommandPaletteProps {
    isOpen: boolean
    onClose: () => void
}

interface CommandItem {
    id: string
    label: string
    description?: string
    icon: string
    action: () => void
    category: 'navigation' | 'action' | 'settings'
    keywords?: string[]
}

export default function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
    const [query, setQuery] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const { user } = useAuth()
    const inputRef = useRef<HTMLInputElement>(null)
    const listRef = useRef<HTMLDivElement>(null)
    const router = useRouter()

    useEffect(() => {
        if (isOpen) {
            setQuery('')
            setSelectedIndex(0)
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }, [isOpen])

    const canAccess = (route: string) => user ? canAccessRoute(user.role, route) : false
    const isPatient = user?.role?.toLowerCase() === 'user'
    const isReception = user?.role === 'receptionist'
    const isSuperAdmin = user?.role === 'super_admin'

    const navigate = useCallback((path: string) => {
        router.push(path)
        onClose()
    }, [router, onClose])

    // Build command list based on user role
    const commands: CommandItem[] = []

    // Navigation commands
    if (!isSuperAdmin) {
        if (isPatient) {
            commands.push(
                { id: 'nav-visits', label: 'Go to Appointments', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', action: () => navigate('/visits'), category: 'navigation', keywords: ['visits', 'appointments', 'calendar'] },
                { id: 'nav-prescriptions', label: 'Go to Prescriptions', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', action: () => navigate('/prescriptions'), category: 'navigation', keywords: ['rx', 'medicine'] },
                { id: 'nav-profile', label: 'Go to Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', action: () => navigate('/profile'), category: 'navigation', keywords: ['account', 'settings'] },
            )
        } else {
            if (canAccess('/dashboard')) commands.push({ id: 'nav-dashboard', label: 'Go to Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', action: () => navigate('/dashboard'), category: 'navigation', keywords: ['home', 'overview'] })
            if (canAccess('/patients')) commands.push({ id: 'nav-patients', label: 'Go to Patients', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', action: () => navigate('/patients'), category: 'navigation', keywords: ['people', 'records'] })
            if (canAccess('/treatments')) commands.push({ id: 'nav-treatments', label: 'Go to Treatments', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z', action: () => navigate('/treatments'), category: 'navigation', keywords: ['medicine', 'prescribe'] })
            if (canAccess('/products')) commands.push({ id: 'nav-inventory', label: 'Go to Inventory', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4', action: () => navigate('/products'), category: 'navigation', keywords: ['products', 'stock', 'medicines'] })
            if (canAccess('/visits')) commands.push({ id: 'nav-visits', label: 'Go to Visits', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', action: () => navigate('/visits'), category: 'navigation', keywords: ['appointments', 'calendar', 'schedule'] })
            if (canAccess('/invoices')) commands.push({ id: 'nav-invoices', label: 'Go to Invoices', icon: 'M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z', action: () => navigate('/invoices'), category: 'navigation', keywords: ['billing', 'payments', 'money'] })
            if (canAccess('/analytics')) commands.push({ id: 'nav-analytics', label: 'Go to Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', action: () => navigate('/analytics'), category: 'navigation', keywords: ['reports', 'charts', 'statistics'] })
            if (canAccess('/suppliers')) commands.push({ id: 'nav-suppliers', label: 'Go to Suppliers', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', action: () => navigate('/suppliers'), category: 'navigation', keywords: ['vendors', 'purchase'] })
            if (canAccess('/purchase-orders')) commands.push({ id: 'nav-po', label: 'Go to Purchase Orders', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', action: () => navigate('/purchase-orders'), category: 'navigation', keywords: ['billing', 'orders'] })
            if (canAccess('/tasks')) commands.push({ id: 'nav-tasks', label: 'Go to Tasks', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', action: () => navigate('/tasks'), category: 'navigation', keywords: ['todo', 'checklist'] })
        }
    }

    // Action commands
    if (!isPatient && !isSuperAdmin) {
        if (canAccess('/patients')) {
            commands.push({ id: 'act-new-patient', label: 'Create New Patient', description: 'Add a new patient record', icon: 'M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z', action: () => navigate('/patients?action=new'), category: 'action', keywords: ['add', 'register', 'patient'] })
        }
        if (canAccess('/visits')) {
            commands.push({ id: 'act-new-visit', label: 'Create New Visit', description: 'Schedule a new appointment', icon: 'M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z', action: () => navigate('/visits?action=new'), category: 'action', keywords: ['add', 'appointment', 'schedule'] })
        }
        if (canAccess('/invoices')) {
            commands.push({ id: 'act-new-invoice', label: 'Create New Invoice', description: 'Generate a new bill', icon: 'M12 6v6m0 0v6m0-6h6m-6 0H6', action: () => navigate('/invoices?action=new'), category: 'action', keywords: ['add', 'bill', 'payment'] })
        }
    }

    // Settings commands
    commands.push(
        { id: 'set-profile', label: 'Open Profile', description: 'View your profile settings', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z', action: () => navigate(isSuperAdmin ? '/super-admin-profile' : '/profile'), category: 'settings', keywords: ['account', 'user'] },
    )
    if (user?.role === 'admin') {
        commands.push({ id: 'set-admin', label: 'Admin Settings', description: isBasicPlan(user?.clinic?.subscriptionPlan) ? 'Available in Standard plan' : 'Clinic administration', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z', action: () => navigate(isBasicPlan(user?.clinic?.subscriptionPlan) ? '/upgrade' : '/admin-settings'), category: 'settings', keywords: ['config', 'clinic', 'standard'] })
    }

    // Filter commands
    const filtered = query.trim()
        ? commands.filter(cmd => {
            const q = query.toLowerCase()
            return cmd.label.toLowerCase().includes(q) ||
                cmd.description?.toLowerCase().includes(q) ||
                cmd.keywords?.some(k => k.includes(q)) ||
                cmd.category.includes(q)
        })
        : commands

    // Group by category
    const groups = [
        { key: 'action', label: 'Actions', items: filtered.filter(c => c.category === 'action') },
        { key: 'navigation', label: 'Navigation', items: filtered.filter(c => c.category === 'navigation') },
        { key: 'settings', label: 'Settings', items: filtered.filter(c => c.category === 'settings') },
    ].filter(g => g.items.length > 0)

    const flatItems = groups.flatMap(g => g.items)

    // Keyboard navigation
    useEffect(() => {
        if (!isOpen) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSelectedIndex(i => Math.min(i + 1, flatItems.length - 1))
            } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSelectedIndex(i => Math.max(i - 1, 0))
            } else if (e.key === 'Enter' && flatItems[selectedIndex]) {
                e.preventDefault()
                flatItems[selectedIndex].action()
            } else if (e.key === 'Escape') {
                e.preventDefault()
                onClose()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, selectedIndex, flatItems, onClose])

    // Keep selected index in bounds
    useEffect(() => {
        setSelectedIndex(0)
    }, [query])

    // Scroll selected item into view
    useEffect(() => {
        if (listRef.current) {
            const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
            el?.scrollIntoView({ block: 'nearest' })
        }
    }, [selectedIndex])

    if (!isOpen) return null

    let itemIndex = -1

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={onClose}>
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

            {/* Palette */}
            <div
                className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden animate-command-palette-in"
                onClick={e => e.stopPropagation()}
            >
                {/* Search input */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Type a command or search..."
                        className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
                        style={{ textTransform: 'none' }}
                    />
                    <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-400 font-mono border border-gray-200 dark:border-gray-700">ESC</kbd>
                </div>

                {/* Results */}
                <div ref={listRef} className="max-h-[360px] overflow-y-auto py-2">
                    {groups.length === 0 && (
                        <div className="px-4 py-8 text-center text-sm text-gray-400">No commands found</div>
                    )}
                    {groups.map(group => (
                        <div key={group.key}>
                            <div className="px-4 py-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{group.label}</div>
                            {group.items.map(cmd => {
                                itemIndex++
                                const idx = itemIndex
                                const isSelected = selectedIndex === idx
                                return (
                                    <button
                                        key={cmd.id}
                                        data-index={idx}
                                        onClick={cmd.action}
                                        onMouseEnter={() => setSelectedIndex(idx)}
                                        className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${isSelected ? 'bg-blue-50 dark:bg-blue-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                                    >
                                        <div className={`p-1.5 rounded-lg flex-shrink-0 ${isSelected ? 'bg-blue-100 dark:bg-blue-800/50' : 'bg-gray-100 dark:bg-gray-800'}`}>
                                            <svg className={`w-4 h-4 ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" d={cmd.icon} />
                                            </svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-sm font-medium truncate ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-200'}`}>{cmd.label}</div>
                                            {cmd.description && <div className="text-xs text-gray-400 truncate">{cmd.description}</div>}
                                        </div>
                                        {isSelected && (
                                            <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-800/50 text-blue-500 dark:text-blue-400 font-mono">↵</kbd>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    ))}
                </div>

                {/* Footer hints */}
                <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400">
                    <span className="flex items-center gap-1"><kbd className="px-1 py-px rounded bg-gray-100 dark:bg-gray-800 font-mono">↑↓</kbd> Navigate</span>
                    <span className="flex items-center gap-1"><kbd className="px-1 py-px rounded bg-gray-100 dark:bg-gray-800 font-mono">↵</kbd> Select</span>
                    <span className="flex items-center gap-1"><kbd className="px-1 py-px rounded bg-gray-100 dark:bg-gray-800 font-mono">Esc</kbd> Close</span>
                </div>
            </div>
        </div>
    )
}