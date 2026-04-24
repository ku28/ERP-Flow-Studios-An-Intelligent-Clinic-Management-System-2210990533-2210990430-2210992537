import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'

export type Platform = 'desktop' | 'android' | null

export interface VersionCheckResult {
    updateAvailable: boolean
    currentVersion: string | null
    latestVersion: string | null
    downloadUrl: string | null
    platform: Platform
}

interface VersionManifest {
    latestDesktopVersion: string
    latestAndroidVersion: string
    desktopDownloadUrl: string
    androidDownloadUrl: string
}

declare global {
    interface Window {
        Capacitor?: {
            getPlatform?: () => string
            Plugins?: {
                App?: {
                    getInfo?: () => Promise<{ version?: string }>
                }
                SpeechRecognition?: any
            }
        }
    }
}

/** Returns negative/zero/positive like strcmp for semver strings "X.Y.Z" */
function compareSemver(a: string, b: string): number {
    const normalize = (value: string) =>
        value
            .trim()
            .replace(/^v/i, '')
            .split('+')[0]
            .split('-')[0]

    const pa = normalize(a).split('.').map(part => Number(part.replace(/[^0-9]/g, '')) || 0)
    const pb = normalize(b).split('.').map(part => Number(part.replace(/[^0-9]/g, '')) || 0)
    for (let i = 0; i < 3; i++) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
        if (diff !== 0) return diff
    }
    return 0
}

const SESSION_KEY_DESKTOP = 'erpfs_desktopVersion'
const SESSION_KEY_ANDROID = 'erpfs_androidVersion'

export function useVersionCheck(): VersionCheckResult {
    const router = useRouter()
    const [result, setResult] = useState<VersionCheckResult>({
        updateAvailable: false,
        currentVersion: null,
        latestVersion: null,
        downloadUrl: null,
        platform: null,
    })

    useEffect(() => {
        if (typeof window === 'undefined') return

        // Persist version params from the initial URL into sessionStorage so they
        // survive client-side navigations that strip the query string.
        const params = new URLSearchParams(window.location.search)
        const desktopParam = params.get('desktopVersion')
        const androidParam = params.get('androidVersion')

        if (desktopParam) sessionStorage.setItem(SESSION_KEY_DESKTOP, desktopParam)
        if (androidParam) sessionStorage.setItem(SESSION_KEY_ANDROID, androidParam)

        const desktopVersion = sessionStorage.getItem(SESSION_KEY_DESKTOP)
        const androidVersionFromSession = sessionStorage.getItem(SESSION_KEY_ANDROID)
        const isElectronRuntime = typeof navigator !== 'undefined' && /electron/i.test(navigator.userAgent)
        let capacitorPlatform: string | null = null

        try {
            capacitorPlatform = Capacitor.getPlatform()
        } catch {
            capacitorPlatform = window.Capacitor?.getPlatform?.() || null
        }

        const platform: Platform = desktopVersion
            ? 'desktop'
            : (androidVersionFromSession || capacitorPlatform === 'android')
                ? 'android'
                : (isElectronRuntime ? 'desktop' : null)

        if (!platform) return

        let cancelled = false

        async function check() {
            try {
                let currentVersion: string | null = desktopVersion ?? androidVersionFromSession

                if (!currentVersion && platform === 'android') {
                    let nativeVersion: string | null = null

                    try {
                        const appInfo = await CapacitorApp.getInfo()
                        nativeVersion = appInfo?.version || null
                    } catch {
                        try {
                            const appInfo = await window.Capacitor?.Plugins?.App?.getInfo?.()
                            nativeVersion = appInfo?.version || null
                        } catch {
                            nativeVersion = null
                        }
                    }

                    if (nativeVersion) {
                        currentVersion = nativeVersion
                        sessionStorage.setItem(SESSION_KEY_ANDROID, nativeVersion)
                    }
                }

                const res = await fetch('/version.json', { cache: 'no-store' })
                if (!res.ok || cancelled) return

                const manifest: VersionManifest = await res.json()

                const latestVersion =
                    platform === 'desktop'
                        ? manifest.latestDesktopVersion
                        : manifest.latestAndroidVersion

                const downloadUrl =
                    platform === 'desktop'
                        ? manifest.desktopDownloadUrl
                        : manifest.androidDownloadUrl

                if (cancelled) return

                const updateAvailable = currentVersion
                    ? compareSemver(currentVersion, latestVersion) < 0
                    : false
                const resolvedCurrentVersion = currentVersion || 'Unknown'
                const resolvedUpdateAvailable = currentVersion
                    ? updateAvailable
                    : platform === 'desktop'

                setResult({
                    updateAvailable: resolvedUpdateAvailable,
                    currentVersion: resolvedCurrentVersion,
                    latestVersion,
                    downloadUrl,
                    platform
                })
            } catch {
                // Network error — silently skip update check
            }
        }

        check()
        return () => { cancelled = true }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    return result
}
