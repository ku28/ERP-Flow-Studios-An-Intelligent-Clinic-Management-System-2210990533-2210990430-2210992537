/**
 * /app — Mobile entry point for the Capacitor Android / iOS app.
 *
 * Load order:
 * 1. Resolve auth in the background.
 * 2. Navigate to destination once auth is resolved.
 */

import { useEffect, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'

type SavedAccount = {
    id: number
    name: string
    email: string
    role: string
    sessionToken: string
    lastActive: number
    clinicId?: string | null
}

const APP_VERSION = '2.1.2'

export default function AppEntryPage() {
    const router = useRouter()
    const { user: authUser, loading: authLoading } = useAuth()
    const [status, setStatus] = useState<'Checking session...' | 'Restoring account...' | 'Redirecting...'>('Checking session...')
    const [resolvedDest, setResolvedDest] = useState<string | null>(null)

    useEffect(() => {
        router.prefetch('/dashboard').catch(() => {})
        router.prefetch('/patients').catch(() => {})
        router.prefetch('/login').catch(() => {})
    }, [router])

    // Navigate as soon as auth resolves
    useEffect(() => {
        if (resolvedDest) {
            setStatus('Redirecting...')
            router.replace(resolvedDest)
        }
    }, [resolvedDest, router])

    useEffect(() => {
        // Guard: only run on client
        if (typeof window === 'undefined') return
        if (authLoading) return

        let cancelled = false

        async function resolveEntry() {
            // ── Step 1: Check existing session via AuthContext ──────────────────────
            if (authUser) {
                const dest = authUser.role?.toLowerCase() === 'receptionist' ? '/patients' : '/dashboard'
                if (!cancelled) setResolvedDest(dest)
                return
            }

            if (cancelled) return

            // ── Step 2: Try to restore from localStorage saved accounts ──────────
            setStatus('Restoring account...')
            try {
                const clinicId = localStorage.getItem('clinicId')
                const storageKey = clinicId ? `savedAccounts_${clinicId}` : 'savedAccounts'
                const raw = localStorage.getItem(storageKey)

                if (raw) {
                    const accounts: SavedAccount[] = JSON.parse(raw)
                    // Pick the most recently active account
                    const latest = accounts
                        .filter((a) => a.sessionToken)
                        .sort((a, b) => (b.lastActive ?? 0) - (a.lastActive ?? 0))[0]

                    if (latest?.sessionToken) {
                        const switchRes = await fetch('/api/auth/switch-session', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({
                                sessionToken: latest.sessionToken,
                                clinicId: clinicId || undefined,
                            }),
                        })

                        if (!cancelled && switchRes.ok) {
                            const dest = latest.role?.toLowerCase() === 'receptionist' ? '/patients' : '/dashboard'
                            setResolvedDest(dest)
                            return
                        }
                    }
                }
            } catch {
                // parse / network error — fall through to login
            }

            if (cancelled) return

            // ── Step 3: No valid session found — go to login ─────────────────────
            const clinicId = localStorage.getItem('clinicId')
            const loginUrl = clinicId ? `/login?clinicId=${encodeURIComponent(clinicId)}` : '/login'
            setResolvedDest(loginUrl)
        }

        resolveEntry()
        return () => {
            cancelled = true
        }
    }, [authUser, authLoading])

    return (
        <>
            <Head>
                <title>ERP Flow Studios</title>
                <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
            </Head>

            {/* ── Auth-checking UI ── */}
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '100vh',
                    background: '#0f172a',
                    color: '#e2e8f0',
                    fontFamily: 'system-ui, sans-serif',
                    gap: '20px',
                }}
            >
                {/* Spinner */}
                <div
                    style={{
                        width: 48,
                        height: 48,
                        borderRadius: '50%',
                        border: '4px solid #334155',
                        borderTopColor: '#6366f1',
                        animation: 'spin 0.8s linear infinite',
                    }}
                />
                <p style={{ margin: 0, fontSize: 15, color: '#94a3b8', letterSpacing: '0.02em' }}>{status}</p>

                <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
            </div>
        </>
    )
}
