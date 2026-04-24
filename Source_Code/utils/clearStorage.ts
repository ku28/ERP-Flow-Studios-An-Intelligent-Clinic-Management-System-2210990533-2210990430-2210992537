/**
 * Clear all residual localStorage data except essential clinic session
 * Use this to clean up data copied from other apps
 */
export function clearResidualStorage() {
    if (typeof window === 'undefined') return
    
    // Get essential data to preserve
    const clinicId = localStorage.getItem('clinicId')
    const clinicName = localStorage.getItem('clinicName')
    
    // Clear everything
    localStorage.clear()
    
    // Restore essential clinic session data
    if (clinicId) {
        localStorage.setItem('clinicId', clinicId)
    }
    if (clinicName) {
        localStorage.setItem('clinicName', clinicName)
    }
    
    // Log what was done
    return {
        cleared: true,
        preserved: { clinicId, clinicName },
        message: 'All residual data cleared. Clinic session preserved.'
    }
}

/**
 * Clear ALL localStorage including clinic session
 * Use this for complete reset
 */
export function clearAllStorage() {
    if (typeof window === 'undefined') return
    
    localStorage.clear()
    
    return {
        cleared: true,
        message: 'All localStorage data cleared including clinic session.'
    }
}

/**
 * View all current localStorage keys and values
 */
export function viewStorage() {
    if (typeof window === 'undefined') return {}
    
    const storage: Record<string, string> = {}
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key) {
            storage[key] = localStorage.getItem(key) || ''
        }
    }
    return storage
}

/**
 * Remove specific keys from localStorage
 */
export function removeStorageKeys(keys: string[]) {
    if (typeof window === 'undefined') return
    
    keys.forEach(key => localStorage.removeItem(key))
    
    return {
        removed: keys,
        message: `Removed ${keys.length} keys from localStorage.`
    }
}

// Make available in browser console for debugging
if (typeof window !== 'undefined') {
    ;(window as any).clearResidualStorage = clearResidualStorage
    ;(window as any).clearAllStorage = clearAllStorage
    ;(window as any).viewStorage = viewStorage
    ;(window as any).removeStorageKeys = removeStorageKeys
}
