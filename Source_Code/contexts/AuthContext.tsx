import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useRef } from 'react'
import { clearCachedCurrentUser, getCachedCurrentUser, setCachedCurrentUser } from '../lib/currentUserStorage'

interface AuthContextType {
    user: any | null
    loading: boolean
    logout: () => Promise<void>
    /** Force refresh user from server (call after login / profile update) */
    refreshUser: () => Promise<void>
    /** Allow _app.tsx to push the user it already fetched so we never double-fetch */
    setExternalUser: (user: any | null) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<any | null>(() => {
        if (typeof window === 'undefined') return null
        return getCachedCurrentUser<any>()
    })
    const [loading, setLoading] = useState(true)
    const fetchedRef = useRef(false)

    useEffect(() => {
        const cachedUser = getCachedCurrentUser<any>()
        if (cachedUser) {
            setUser(cachedUser)
            setLoading(false)
            // Background revalidate — _app.tsx will call setExternalUser when it gets fresh data
            fetchedRef.current = true
        } else if (!fetchedRef.current) {
            // No cache and _app.tsx hasn't set the user yet — fetch ourselves
            checkAuth()
        }

        const handleUserLogin = () => {
            const latestCachedUser = getCachedCurrentUser<any>()
            if (latestCachedUser) {
                setUser(latestCachedUser)
                setLoading(false)
            }
        }

        window.addEventListener('user-login', handleUserLogin)
        return () => window.removeEventListener('user-login', handleUserLogin)
    }, [])

    async function checkAuth() {
        try {
            const res = await fetch('/api/auth/me', {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store'
            })
            const data = await res.json()
            setUser(data.user || null)
            if (data.user) setCachedCurrentUser(data.user)
        } catch (error) {
            const fallbackUser = getCachedCurrentUser<any>()
            setUser(fallbackUser)
        } finally {
            setLoading(false)
            fetchedRef.current = true
        }
    }

    const refreshUser = useCallback(async () => {
        try {
            const res = await fetch('/api/auth/me', {
                method: 'GET',
                credentials: 'include',
                cache: 'no-store'
            })
            const data = await res.json()
            setUser(data.user || null)
            if (data.user) setCachedCurrentUser(data.user)
            else clearCachedCurrentUser()
        } catch { /* keep current user */ }
    }, [])

    const setExternalUser = useCallback((externalUser: any | null) => {
        setUser(externalUser)
        setLoading(false)
        fetchedRef.current = true
        if (externalUser) setCachedCurrentUser(externalUser)
    }, [])

    async function logout() {
        try {
            await fetch('/api/auth/logout', { method: 'POST' })
        } catch {}
        setUser(null)
        clearCachedCurrentUser()
        localStorage.removeItem('clinicId')
        localStorage.removeItem('clinicName')
        localStorage.removeItem('clinicIcon')
        sessionStorage.removeItem('currentUser')
        // Clear all data cache entries on logout
        try {
            const keysToRemove: string[] = []
            for (let i = 0; i < sessionStorage.length; i++) {
                const k = sessionStorage.key(i)
                if (k && k.startsWith('erp_cache_')) keysToRemove.push(k)
            }
            keysToRemove.forEach(k => sessionStorage.removeItem(k))
        } catch { /* ignore */ }
        const cap = (window as any).Capacitor
        const isNativeCapacitor = !!cap && (
            (typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) ||
            (typeof cap.getPlatform === 'function' && cap.getPlatform() !== 'web')
        )
        const isApp = !!(window as any).electronAPI || isNativeCapacitor
        window.location.href = isApp ? '/login' : '/'
    }

    return (
        <AuthContext.Provider value={{ user, loading, logout, refreshUser, setExternalUser }}>
            {children}
        </AuthContext.Provider>
    )
}

export function useAuth() {
    const context = useContext(AuthContext)
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
}
