import { createContext, useContext, useState, useCallback, ReactNode, useEffect, useRef } from 'react'

const STORAGE_KEY_PREFIX = 'erp_cache_'
const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface CacheEntry<T> {
    data: T
    timestamp: number
    ttl: number // ms
}

interface DataCacheContextType {
    getCache: <T>(key: string) => T | null
    setCache: <T>(key: string, data: T, ttlMs?: number) => void
    clearCache: (key: string) => void
    clearAllCache: () => void
}

const DataCacheContext = createContext<DataCacheContextType | undefined>(undefined)

/** Read a cache entry from sessionStorage */
function readFromStorage<T>(key: string): T | null {
    if (typeof window === 'undefined') return null
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY_PREFIX + key)
        if (!raw) return null
        const entry: CacheEntry<T> = JSON.parse(raw)
        // Check TTL
        if (Date.now() - entry.timestamp > entry.ttl) {
            sessionStorage.removeItem(STORAGE_KEY_PREFIX + key)
            return null
        }
        return entry.data
    } catch {
        return null
    }
}

/** Write a cache entry to sessionStorage */
function writeToStorage<T>(key: string, data: T, ttlMs: number): void {
    if (typeof window === 'undefined') return
    try {
        const entry: CacheEntry<T> = { data, timestamp: Date.now(), ttl: ttlMs }
        sessionStorage.setItem(STORAGE_KEY_PREFIX + key, JSON.stringify(entry))
    } catch {
        // sessionStorage quota exceeded — silently degrade to in-memory only
    }
}

export function DataCacheProvider({ children }: { children: ReactNode }) {
    // In-memory mirror for fast synchronous access within the same render
    const memCache = useRef<Map<string, CacheEntry<any>>>(new Map())

    // Hydrate in-memory cache from sessionStorage on mount
    useEffect(() => {
        if (typeof window === 'undefined') return
        try {
            for (let i = 0; i < sessionStorage.length; i++) {
                const storageKey = sessionStorage.key(i)
                if (!storageKey || !storageKey.startsWith(STORAGE_KEY_PREFIX)) continue
                const cacheKey = storageKey.slice(STORAGE_KEY_PREFIX.length)
                const raw = sessionStorage.getItem(storageKey)
                if (!raw) continue
                const entry: CacheEntry<any> = JSON.parse(raw)
                if (Date.now() - entry.timestamp <= entry.ttl) {
                    memCache.current.set(cacheKey, entry)
                } else {
                    sessionStorage.removeItem(storageKey)
                }
            }
        } catch { /* ignore */ }
    }, [])

    const getCache = useCallback(<T,>(key: string): T | null => {
        // Check in-memory first (fastest)
        const memEntry = memCache.current.get(key)
        if (memEntry && Date.now() - memEntry.timestamp <= memEntry.ttl) {
            return memEntry.data as T
        }
        // Fallback to sessionStorage (survives Next.js page navigations)
        const stored = readFromStorage<T>(key)
        if (stored !== null) {
            // Re-hydrate in-memory
            memCache.current.set(key, { data: stored, timestamp: Date.now(), ttl: DEFAULT_TTL_MS })
        }
        return stored
    }, [])

    const setCacheData = useCallback(<T,>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS) => {
        const entry: CacheEntry<T> = { data, timestamp: Date.now(), ttl: ttlMs }
        memCache.current.set(key, entry)
        writeToStorage(key, data, ttlMs)
    }, [])

    const clearCache = useCallback((key: string) => {
        memCache.current.delete(key)
        if (typeof window !== 'undefined') {
            try { sessionStorage.removeItem(STORAGE_KEY_PREFIX + key) } catch { /* ignore */ }
        }
    }, [])

    const clearAllCache = useCallback(() => {
        memCache.current.clear()
        if (typeof window !== 'undefined') {
            try {
                const keysToRemove: string[] = []
                for (let i = 0; i < sessionStorage.length; i++) {
                    const k = sessionStorage.key(i)
                    if (k && k.startsWith(STORAGE_KEY_PREFIX)) keysToRemove.push(k)
                }
                keysToRemove.forEach(k => sessionStorage.removeItem(k))
            } catch { /* ignore */ }
        }
    }, [])

    return (
        <DataCacheContext.Provider value={{ getCache, setCache: setCacheData, clearCache, clearAllCache }}>
            {children}
        </DataCacheContext.Provider>
    )
}

export function useDataCache() {
    const context = useContext(DataCacheContext)
    if (!context) {
        throw new Error('useDataCache must be used within DataCacheProvider')
    }
    return context
}
