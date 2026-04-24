import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { createPortal } from 'react-dom'
import { setCachedCurrentUser } from '../lib/currentUserStorage'

interface AccountSwitcherModalProps {
    isOpen: boolean
    onClose: () => void
    currentUser: any
}

interface SavedAccount {
    id: number
    name: string
    email: string
    role: string
    profileImage?: string
    sessionToken: string
    lastActive: number
}

export default function AccountSwitcherModal({ isOpen, onClose, currentUser }: AccountSwitcherModalProps) {
    const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([])
    const [isAnimating, setIsAnimating] = useState(false)
    const [expandedAccountId, setExpandedAccountId] = useState<number | null>(null)
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [isSwitching, setIsSwitching] = useState(false)
    const [reAuthLoading, setReAuthLoading] = useState(false)
    const [switchSuccess, setSwitchSuccess] = useState(false)
    const [switchedUserName, setSwitchedUserName] = useState('')
    const [activeTab, setActiveTab] = useState<'admin' | 'receptionist' | 'doctor'>('admin')
    const [clinicInfo, setClinicInfo] = useState<{name: string, clinicId: string, iconUrl?: string} | null>(null)
    const router = useRouter()

    const isNativeCapacitorRuntime = () => {
        if (typeof window === 'undefined') return false
        const cap = (window as any).Capacitor
        if (!cap) return false
        if (typeof cap.isNativePlatform === 'function') return !!cap.isNativePlatform()
        if (typeof cap.getPlatform === 'function') return cap.getPlatform() !== 'web'
        return false
    }

    // Helper function to get storage key for current clinic
    const getStorageKey = () => {
        const clinicId = currentUser?.clinicId || localStorage.getItem('clinicId')
        return clinicId ? `savedAccounts_${clinicId}` : 'savedAccounts'
    }

    useEffect(() => {
        if (isOpen) {
            setIsAnimating(false)
            setIsSwitching(false)
            setSwitchSuccess(false)
            setTimeout(() => setIsAnimating(true), 10)
            loadSavedAccounts()
            
            // Load clinic info from localStorage if not in currentUser
            if (!currentUser?.clinic) {
                const clinicId = localStorage.getItem('clinicId')
                const clinicName = localStorage.getItem('clinicName')
                if (clinicId && clinicName) {
                    setClinicInfo({ clinicId, name: clinicName })
                }
            }
        } else {
            setIsAnimating(false)
            setIsSwitching(false)
            setSwitchSuccess(false)
        }
    }, [isOpen, currentUser])

    const loadSavedAccounts = () => {
        try {
            // Load accounts for current clinic
            const clinicId = currentUser?.clinicId || localStorage.getItem('clinicId')
            const storageKey = clinicId ? `savedAccounts_${clinicId}` : 'savedAccounts'
            const stored = localStorage.getItem(storageKey)
            if (stored) {
                const accounts: SavedAccount[] = JSON.parse(stored)
                // Filter out the current user and sort by last active
                const filteredAccounts = accounts
                    .filter(acc => acc.id !== currentUser?.id)
                    .sort((a, b) => b.lastActive - a.lastActive)
                setSavedAccounts(filteredAccounts)
            }
        } catch (e) {
        }
    }

    const saveCurrentAccount = async () => {
        if (!currentUser) return

        try {
            // Get storage key first
            const storageKey = getStorageKey()
            
            // Get session token from server-side API (HttpOnly cookie)
            const response = await fetch('/api/auth/get-session-token')
            if (!response.ok) {
                return
            }

            const { sessionToken } = await response.json()
            if (!sessionToken) {
                return
            }

            const stored = localStorage.getItem(storageKey)
            const accounts: SavedAccount[] = stored ? JSON.parse(stored) : []

            // Check if current account is already saved
            const existingIndex = accounts.findIndex(acc => acc.id === currentUser.id)

            const accountData: SavedAccount = {
                id: currentUser.id,
                name: currentUser.name || currentUser.email,
                email: currentUser.email,
                role: currentUser.role,
                profileImage: currentUser.profileImage,
                sessionToken,
                lastActive: Date.now()
            }

            if (existingIndex >= 0) {
                // Update existing account
                accounts[existingIndex] = accountData
            } else {
                // Add new account
                accounts.push(accountData)
            }

            // Keep only last 10 accounts
            const limitedAccounts = accounts.slice(-10)
            localStorage.setItem(storageKey, JSON.stringify(limitedAccounts))
        } catch (e) {
        }
    }

    const switchToAccount = async (account: SavedAccount) => {
        try {
            setIsSwitching(true)
            
            // Save current account before switching
            await saveCurrentAccount()

            // Call the API to switch sessions server-side
            const response = await fetch('/api/auth/switch-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionToken: account.sessionToken })
            })

            if (response.ok) {
                const data = await response.json()

                // Update last active time
                updateAccountLastActive(account.id)

                // Clear any cached user data to force fresh load
                sessionStorage.removeItem('currentUser')
                sessionStorage.removeItem('authChecked')

                // Determine redirect path based on role FIRST
                const redirectPath = account.role?.toLowerCase() === 'receptionist' ? '/patients' : '/dashboard'

                // Cache the user data with role before redirect
                setCachedCurrentUser(data.user)

                // Show success message briefly
                setSwitchedUserName(account.name)
                setSwitchSuccess(true)
                
                // Redirect immediately without delay to prevent dashboard flash
                setTimeout(() => {
                    window.location.replace(redirectPath)
                }, 500)
            } else {
                const error = await response.json()
                // Session expired, remove from saved accounts
                removeAccount(account.id)
                setIsSwitching(false)
                alert('This session has expired. Please log in again.')
            }
        } catch (error) {
            setIsSwitching(false)
            alert('Failed to switch account. Please try again.')
        }
    }

    const updateAccountLastActive = (accountId: number) => {
        try {
            const storageKey = getStorageKey()
            const stored = localStorage.getItem(storageKey)
            if (stored) {
                const accounts: SavedAccount[] = JSON.parse(stored)
                const accountIndex = accounts.findIndex(acc => acc.id === accountId)
                if (accountIndex >= 0) {
                    accounts[accountIndex].lastActive = Date.now()
                    localStorage.setItem(storageKey, JSON.stringify(accounts))
                }
            }
        } catch (e) {
        }
    }

    const removeAccount = (accountId: number) => {
        try {
            const storageKey = getStorageKey()
            const stored = localStorage.getItem(storageKey)
            if (stored) {
                const accounts: SavedAccount[] = JSON.parse(stored)
                const filteredAccounts = accounts.filter(acc => acc.id !== accountId)
                localStorage.setItem(storageKey, JSON.stringify(filteredAccounts))
                setSavedAccounts(filteredAccounts.filter(acc => acc.id !== currentUser?.id))
            }
        } catch (e) {
        }
    }

    const handleAccountClick = (account: SavedAccount) => {
        if (isAccountExpired(account.lastActive)) {
            // Expand to show password input
            setExpandedAccountId(expandedAccountId === account.id ? null : account.id)
            setPassword('')
        } else {
            // Switch directly
            switchToAccount(account)
        }
    }

    const handleReAuthenticate = async (account: SavedAccount) => {
        if (!password) {
            alert('Please enter your password')
            return
        }

        setReAuthLoading(true)
        setIsSwitching(true)
        try {
            // Try to login with email and password
            const loginRes = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ emailOrPhone: account.email, password })
            })

            if (!loginRes.ok) {
                alert('Invalid password')
                setReAuthLoading(false)
                setIsSwitching(false)
                return
            }

            // Get new session token
            await new Promise(resolve => setTimeout(resolve, 200))
            const tokenRes = await fetch('/api/auth/get-session-token')
            if (!tokenRes.ok) {
                alert('Failed to get session token')
                setReAuthLoading(false)
                setIsSwitching(false)
                return
            }

            const { sessionToken } = await tokenRes.json()

            // Update the account with new token and timestamp
            const storageKey = getStorageKey()
            const stored = localStorage.getItem(storageKey)
            if (stored) {
                const accounts: SavedAccount[] = JSON.parse(stored)
                const accountIndex = accounts.findIndex(acc => acc.id === account.id)
                if (accountIndex >= 0) {
                    accounts[accountIndex].sessionToken = sessionToken
                    accounts[accountIndex].lastActive = Date.now()
                    localStorage.setItem(storageKey, JSON.stringify(accounts))
                }
            }

            // Clear any cached user data
            sessionStorage.removeItem('currentUser')
            sessionStorage.removeItem('authChecked')

            // Show success message
            setSwitchedUserName(account.name)
            setSwitchSuccess(true)

            // Redirect immediately
            setTimeout(() => {
                const redirectPath = account.role?.toLowerCase() === 'receptionist' ? '/patients' : '/dashboard'
                window.location.replace(redirectPath)
            }, 500)
        } catch (error) {
            alert('Failed to re-authenticate. Please try again.')
            setIsSwitching(false)
        } finally {
            setReAuthLoading(false)
        }
    }

    const addNewAccount = async () => {
        // Save current account before adding new
        await saveCurrentAccount()
        onClose()
        const clinicId = localStorage.getItem('clinicId')
        router.push(`/login?mode=add${clinicId ? `&clinicId=${clinicId}` : ''}`)
    }

    const isAccountExpired = (timestamp: number) => {
        const now = Date.now()
        const diff = now - timestamp
        const hours = diff / 3600000
        return hours >= 24
    }

    const getTimeSinceActive = (timestamp: number) => {
        const now = Date.now()
        const diff = now - timestamp
        const minutes = Math.floor(diff / 60000)
        const hours = Math.floor(diff / 3600000)
        const days = Math.floor(diff / 86400000)

        if (days > 0) return `${days}d ago`
        if (hours > 0) return `${hours}h ago`
        if (minutes > 0) return `${minutes}m ago`
        return 'Just now'
    }

    if (!isOpen) return null

    // Loading/Success overlay
    if (isSwitching) {
        const switchingOverlay = (
            <div
                className="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center p-4"
            >
                <div className="relative overflow-hidden rounded-2xl border border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-2xl backdrop-blur-sm max-w-md w-full p-8">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none"></div>
                    
                    <div className="relative flex flex-col items-center justify-center space-y-4">
                        {!switchSuccess ? (
                            <>
                                {/* Loading Spinner */}
                                <div className="relative w-16 h-16">
                                    <div className="absolute inset-0 border-4 border-blue-200 dark:border-blue-800 rounded-full"></div>
                                    <div className="absolute inset-0 border-4 border-transparent border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
                                </div>
                                <div className="text-center">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                                        Switching Account...
                                    </h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                        Please wait
                                    </p>
                                </div>
                            </>
                        ) : (
                            <>
                                {/* Success Check Mark */}
                                <div className="relative w-16 h-16">
                                    <div className="absolute inset-0 bg-gradient-to-br from-blue-400 to-sky-500 rounded-full flex items-center justify-center animate-scale-in">
                                        <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                </div>
                                <div className="text-center">
                                    <h3 className="text-lg font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                                        Success!
                                    </h3>
                                    <p className="text-sm text-gray-900 dark:text-gray-100 mt-1 font-medium">
                                        Logged in as {switchedUserName}
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>
        )

        return typeof document !== 'undefined' ? createPortal(switchingOverlay, document.body) : null
    }

    const modal = (
        <div
            className={`fixed inset-0 bg-black transition-opacity duration-300 z-[9999] ${isAnimating ? 'bg-opacity-50' : 'bg-opacity-0'}`}
            onClick={onClose}
        >
            <div
                className={`fixed inset-0 flex items-center justify-center p-4 transition-all duration-300 ${isAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="relative overflow-hidden rounded-2xl border border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-2xl backdrop-blur-sm max-w-md w-full max-h-[80vh]">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none"></div>

                    {/* Header with Clinic Info */}
                    <div className="relative px-6 py-4 border-b border-blue-200/30 dark:border-blue-700/30">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                                Switch Account
                            </h2>
                            <button
                                onClick={onClose}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                                aria-label="Close"
                            >
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        {/* Clinic Info */}
                        {(currentUser?.clinic || clinicInfo) && (
                            <div className="flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border border-purple-200/50 dark:border-purple-700/50">
                                {(currentUser?.clinic?.iconUrl || clinicInfo?.iconUrl) ? (
                                    <img
                                        src={currentUser?.clinic?.iconUrl || clinicInfo?.iconUrl}
                                        alt={currentUser?.clinic?.name || clinicInfo?.name}
                                        className="w-10 h-10 rounded-full object-cover border-2 border-purple-300 dark:border-purple-600"
                                    />
                                ) : (
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center border-2 border-purple-300 dark:border-purple-600">
                                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                        </svg>
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                                        {currentUser?.clinic?.name || clinicInfo?.name}
                                    </div>
                                    <div className="text-xs text-purple-600 dark:text-purple-400 font-mono font-medium tracking-wider">
                                        Access Code: {currentUser?.clinic?.clinicId || clinicInfo?.clinicId}
                                    </div>
                                </div>
                                <button
                                    onClick={async () => {
                                        try {
                                            // Clear clinic session
                                            localStorage.removeItem('clinicId')
                                            localStorage.removeItem('clinicName')
                                            await fetch('/api/auth/logout', { method: 'POST' })
                                            onClose()
                                            const isApp = !!(window as any).electronAPI || isNativeCapacitorRuntime()
                                            window.location.href = isApp ? '/login' : '/'
                                        } catch (error) {
                                        }
                                    }}
                                    className="flex-shrink-0 p-2 text-red-600 hover:text-white hover:bg-red-600 dark:text-red-400 dark:hover:bg-red-500 rounded-lg transition-all"
                                    title="Logout from Clinic"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                    </svg>
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Content */}
                    <div className="relative overflow-y-auto max-h-[calc(80vh-140px)]">
                        <div className="p-6 space-y-4">
                            {/* Current Account */}
                            {currentUser && (
                                <div className="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-sky-50 dark:from-blue-950/30 dark:to-sky-950/30 border-2 border-blue-300 dark:border-blue-600">
                                    <div className="flex items-center gap-3">
                                        {currentUser.profileImage ? (
                                            <img
                                                src={currentUser.profileImage}
                                                alt={currentUser.name || currentUser.email}
                                                className="w-12 h-12 rounded-full object-cover border-2 border-blue-400"
                                            />
                                        ) : (
                                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-sky-500 flex items-center justify-center border-2 border-blue-400">
                                                <span className="text-lg font-bold text-white">
                                                    {currentUser.name?.[0]?.toUpperCase() || currentUser.email?.[0]?.toUpperCase() || 'U'}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex-1 min-w-0">
                                            <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                                                {currentUser.name || currentUser.email}
                                            </div>
                                            <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                                                {currentUser.email}
                                            </div>
                                            <div className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-1">
                                                Current Account
                                            </div>
                                        </div>
                                        <div className="flex-shrink-0">
                                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 capitalize">
                                                {currentUser.role}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Tabs */}
                            {savedAccounts.length > 0 && (
                                <>
                                    <div className="flex gap-2 border-b border-blue-200 dark:border-blue-700 overflow-x-auto">
                                        <button
                                            onClick={() => setActiveTab('admin')}
                                            className={`px-4 py-2 font-medium transition-all text-sm whitespace-nowrap ${
                                                activeTab === 'admin'
                                                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                                                    : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'
                                            }`}
                                        >
                                            Admin
                                            <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                                                activeTab === 'admin'
                                                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                                            }`}>
                                                {savedAccounts.filter(acc => acc.role?.toLowerCase() === 'admin').length}
                                            </span>
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('receptionist')}
                                            className={`px-4 py-2 font-medium transition-all text-sm whitespace-nowrap ${
                                                activeTab === 'receptionist'
                                                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                                                    : 'text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400'
                                            }`}
                                        >
                                            Receptionist
                                            <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                                                activeTab === 'receptionist'
                                                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                                            }`}>
                                                {savedAccounts.filter(acc => acc.role?.toLowerCase() === 'receptionist').length}
                                            </span>
                                        </button>
                                        <button
                                            onClick={() => setActiveTab('doctor')}
                                            className={`px-4 py-2 font-medium transition-all text-sm whitespace-nowrap ${
                                                activeTab === 'doctor'
                                                    ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400'
                                                    : 'text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400'
                                            }`}
                                        >
                                            Doctor
                                            <span className={`ml-2 px-2 py-0.5 rounded text-xs ${
                                                activeTab === 'doctor'
                                                    ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400'
                                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                                            }`}>
                                                {savedAccounts.filter(acc => acc.role?.toLowerCase() === 'doctor').length}
                                            </span>
                                        </button>
                                    </div>

                                    {/* Saved Accounts - Filtered by Tab */}
                                    <div className="space-y-2">
                                        {savedAccounts.filter(acc => acc.role?.toLowerCase() === activeTab).map((account) => {
                                            const expired = isAccountExpired(account.lastActive)
                                            const isExpanded = expandedAccountId === account.id
                                            return (
                                                <div key={account.id} className="space-y-2">
                                                    <div
                                                        className={`group relative p-4 rounded-xl bg-white dark:bg-gray-800 border ${expired ? 'border-orange-300 dark:border-orange-600' : 'border-gray-200 dark:border-gray-700'} hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-lg transition-all duration-200 cursor-pointer`}
                                                        onClick={() => handleAccountClick(account)}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            {account.profileImage ? (
                                                                <img
                                                                    src={account.profileImage}
                                                                    alt={account.name}
                                                                    className="w-12 h-12 rounded-full object-cover border-2 border-gray-300 dark:border-gray-600 group-hover:border-blue-400 transition-colors"
                                                                />
                                                            ) : (
                                                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center border-2 border-gray-300 dark:border-gray-600 group-hover:border-blue-400 transition-colors">
                                                                    <span className="text-lg font-bold text-white">
                                                                        {account.name?.[0]?.toUpperCase() || account.email?.[0]?.toUpperCase() || 'U'}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            <div className="flex-1 min-w-0">
                                                                <div className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                                                                    {account.name}
                                                                </div>
                                                                <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                                                                    {account.email}
                                                                </div>
                                                                <div className={`text-xs mt-1 ${expired ? 'text-orange-600 dark:text-orange-400 font-medium' : 'text-gray-500 dark:text-gray-500'}`}>
                                                                    {expired ? 'Session expired - Enter password' : `Active ${getTimeSinceActive(account.lastActive)}`}
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col items-end gap-2">
                                                                <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 capitalize">
                                                                    {account.role}
                                                                </span>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        removeAccount(account.id)
                                                                    }}
                                                                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                                                    title="Remove account"
                                                                >
                                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                    </svg>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {/* Password Input for Expired Accounts */}
                                                    {expired && isExpanded && (
                                                        <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800">
                                                            <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                                                Enter Password
                                                            </label>
                                                            <div className="flex gap-2">
                                                                <div className="relative flex-1">
                                                                    <input
                                                                        type={showPassword ? 'text' : 'password'}
                                                                        value={password}
                                                                        onChange={(e) => setPassword(e.target.value)}
                                                                        onKeyDown={(e) => e.key === 'Enter' && handleReAuthenticate(account)}
                                                                        placeholder="••••••••"
                                                                        className="w-full px-3 py-1.5 pr-9 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        tabIndex={-1}
                                                                        onClick={(e) => { e.stopPropagation(); setShowPassword(v => !v) }}
                                                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                                                    >
                                                                        {showPassword ? (
                                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                                                        ) : (
                                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                                        )}
                                                                    </button>
                                                                </div>
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        handleReAuthenticate(account)
                                                                    }}
                                                                    disabled={reAuthLoading}
                                                                    className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 rounded-md transition-colors"
                                                                >
                                                                    {reAuthLoading ? 'Loading...' : 'Sign In'}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )
                                        })}
                                    </div>
                                </>
                            )}

                            {/* No Saved Accounts Message */}
                            {savedAccounts.length === 0 && (
                                <div className="text-center py-8">
                                    <svg className="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                    </svg>
                                    <p className="text-gray-600 dark:text-gray-400 text-sm">
                                        No saved accounts yet
                                    </p>
                                    <p className="text-gray-500 dark:text-gray-500 text-xs mt-1">
                                        Sign in with another account to switch between them
                                    </p>
                                </div>
                            )}

                            {/* Add Account Button */}
                            <button
                                onClick={addNewAccount}
                                className="w-full p-4 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/50 dark:hover:bg-blue-950/30 transition-all duration-200 group"
                            >
                                <div className="flex items-center justify-center gap-3">
                                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-sky-500 flex items-center justify-center group-hover:scale-110 transition-transform">
                                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                                        </svg>
                                    </div>
                                    <div className="text-left">
                                        <div className="font-semibold text-gray-900 dark:text-gray-100">
                                            Add Another Account
                                        </div>
                                        <div className="text-sm text-gray-600 dark:text-gray-400">
                                            Sign in with a different account
                                        </div>
                                    </div>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )

    return typeof document !== 'undefined' ? createPortal(modal, document.body) : null
}
