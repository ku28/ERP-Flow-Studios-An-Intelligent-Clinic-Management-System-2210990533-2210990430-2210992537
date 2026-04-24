/**
 * Safe helpers for sessionStorage currentUser cache.
 * Prevents crashes from malformed values like "undefined".
 */

export function getCachedCurrentUser<T = any>(): T | null {
    if (typeof window === 'undefined') return null

    let raw: string | null = null
    try {
        raw = sessionStorage.getItem('currentUser')
    } catch {
        return null
    }

    if (!raw || raw === 'undefined' || raw === 'null') {
        if (raw === 'undefined' || raw === 'null') {
            clearCachedCurrentUser()
        }
        return null
    }

    try {
        const parsed = JSON.parse(raw) as T
        if (!parsed || typeof parsed !== 'object') {
            clearCachedCurrentUser()
            return null
        }
        return parsed
    } catch {
        clearCachedCurrentUser()
        return null
    }
}

export function setCachedCurrentUser(user: unknown): void {
    if (typeof window === 'undefined') return

    try {
        if (user && typeof user === 'object') {
            sessionStorage.setItem('currentUser', JSON.stringify(user))
        } else {
            sessionStorage.removeItem('currentUser')
        }
    } catch {
        // Ignore storage failures.
    }
}

export function clearCachedCurrentUser(): void {
    if (typeof window === 'undefined') return
    try {
        sessionStorage.removeItem('currentUser')
    } catch {
        // Ignore storage failures.
    }
}
