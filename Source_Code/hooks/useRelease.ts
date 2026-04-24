import { useState, useEffect, useCallback } from 'react'

interface Release {
    id: number
    version: string
    title: string
    description: string | null
    features: string[]
    releaseType: string
    isActive: boolean
    createdAt: string
}

interface ReleaseCheckResult {
    hasUpdate: boolean
    lastSeenVersion: string
    latestRelease: Release | null
    displayType: 'modal' | 'banner' | 'silent'
}

interface UseReleaseReturn {
    /** Whether there's an unseen release update */
    hasUpdate: boolean
    /** The latest unseen release data */
    latestRelease: Release | null
    /** How to display the release: 'modal', 'banner', or 'silent' */
    displayType: 'modal' | 'banner' | 'silent'
    /** The user's last seen version */
    lastSeenVersion: string
    /** Whether the hook is still loading */
    loading: boolean
    /** Mark the current release as seen by the user */
    dismissRelease: () => Promise<void>
    /** Re-fetch release status */
    refetch: () => void
}

/**
 * Global hook to check for new releases and manage release notifications.
 * Compares the latest active release against the user's last seen version
 * stored in the database (not localStorage).
 */
export function useRelease(): UseReleaseReturn {
    const [hasUpdate, setHasUpdate] = useState(false)
    const [latestRelease, setLatestRelease] = useState<Release | null>(null)
    const [displayType, setDisplayType] = useState<'modal' | 'banner' | 'silent'>('silent')
    const [lastSeenVersion, setLastSeenVersion] = useState('0.0.0')
    const [loading, setLoading] = useState(true)

    const checkRelease = useCallback(async () => {
        try {
            const res = await fetch('/api/releases/check')
            if (!res.ok) {
                // User not authenticated or server error — silently skip
                setLoading(false)
                return
            }
            const data: ReleaseCheckResult = await res.json()
            setHasUpdate(data.hasUpdate)
            setLatestRelease(data.latestRelease)
            setDisplayType(data.displayType)
            setLastSeenVersion(data.lastSeenVersion)
        } catch {
            // Network error — silently skip
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        checkRelease()
    }, [checkRelease])

    const dismissRelease = useCallback(async () => {
        if (!latestRelease) return
        try {
            await fetch('/api/releases/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ version: latestRelease.version })
            })
            setHasUpdate(false)
            setLatestRelease(null)
            setDisplayType('silent')
            setLastSeenVersion(latestRelease.version)
        } catch {
            // Silently fail — user can dismiss again later
        }
    }, [latestRelease])

    return {
        hasUpdate,
        latestRelease,
        displayType,
        lastSeenVersion,
        loading,
        dismissRelease,
        refetch: checkRelease
    }
}
