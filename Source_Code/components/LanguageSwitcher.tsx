import { useEffect, useRef, useState } from 'react'

declare global {
    interface Window {
        google?: {
            translate?: {
                TranslateElement?: new (opts: object, id: string) => void
            }
        }
        googleTranslateElementInit?: () => void
    }
}

const LANGUAGES = [
    { code: 'en', label: 'English', native: 'English' },
    { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
    { code: 'pa', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
]

// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
function getGTSelect(): HTMLSelectElement | null {
    return document.querySelector('.goog-te-combo') as HTMLSelectElement | null
}

/** Delete the googtrans cookie that GT uses to remember the language */
function clearGTCookie() {
    const domains = [location.hostname, '.' + location.hostname, '']
    domains.forEach(d => {
        document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${d}`
    })
}

/**
 * Attempt to set the GT select to `langCode`.
 * Retries up to `maxTries` times with `interval` ms between tries
 * to handle the case where the GT widget hasn't injected yet.
 */
function translateWithRetry(langCode: string, maxTries = 20, interval = 150) {
    let tries = 0

    const attempt = () => {
        tries++
        const sel = getGTSelect()
        if (!sel) {
            if (tries < maxTries) setTimeout(attempt, interval)
            return
        }

        if (langCode === 'en') {
            // The only reliable way to restore original English is to
            // wipe the googtrans cookie on every possible path/domain and reload.
            clearGTCookie()
            // Also set the cookie to /en/en explicitly so GT knows the target is English
            const domains = [location.hostname, '.' + location.hostname, '']
            domains.forEach(d => {
                document.cookie = `googtrans=/en/en; path=/; domain=${d}`
            })
            // Small delay so the cookie write flushes, then hard reload
            setTimeout(() => window.location.reload(), 80)
            return
        } else {
            sel.value = langCode
            sel.dispatchEvent(new Event('change'))

            // Verify the change took; retry if GT reset it
            setTimeout(() => {
                const s = getGTSelect()
                if (s && s.value !== langCode && tries < maxTries) {
                    s.value = langCode
                    s.dispatchEvent(new Event('change'))
                }
            }, 300)
        }
    }

    attempt()
}

// ----------------------------------------------------------------
// Component
// ----------------------------------------------------------------
export default function LanguageSwitcher() {
    const [open, setOpen] = useState(false)
    const [current, setCurrent] = useState('en')
    const [gtReady, setGtReady] = useState(false)
    const [gtScriptLoading, setGtScriptLoading] = useState(false)
    const [pendingLanguage, setPendingLanguage] = useState<string | null>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const loadGoogleTranslate = () => {
        if (document.getElementById('gt-script') || gtScriptLoading) return
        setGtScriptLoading(true)

        const script = document.createElement('script')
        script.id = 'gt-script'
        script.src =
            'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit'
        script.async = true
        script.defer = true
        script.onload = () => setGtScriptLoading(false)
        script.onerror = () => setGtScriptLoading(false)
        document.head.appendChild(script)
    }

    // ----------------------------------------------------------------
    // Bootstrap Google Translate widget once
    // ----------------------------------------------------------------
    useEffect(() => {
        // Hidden container for GT widget
        if (!document.getElementById('google_translate_element')) {
            const div = document.createElement('div')
            div.id = 'google_translate_element'
            div.style.cssText =
                'position:absolute;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-9999px;'
            document.body.appendChild(div)
        }

        // Suppress GT banner / toolbar
        if (!document.getElementById('gt-hide-banner')) {
            const style = document.createElement('style')
            style.id = 'gt-hide-banner'
            style.innerHTML = `
                .goog-te-banner-frame, .goog-te-balloon-frame { display:none!important; }
                body { top:0px!important; }
                .skiptranslate { display:none!important; }
                .goog-te-gadget { display:none!important; }
                #google_translate_element { display:none!important; }
            `
            document.head.appendChild(style)
        }

        // Init callback — called by GT script after load
        window.googleTranslateElementInit = () => {
            if (window.google?.translate?.TranslateElement) {
                try {
                    new window.google.translate.TranslateElement(
                        { pageLanguage: 'en', includedLanguages: 'en,hi,pa', autoDisplay: false },
                        'google_translate_element'
                    )
                } catch (_) {}
                // Give the widget time to inject its <select>
                setTimeout(() => setGtReady(true), 1000)
            }
        }

        if (document.getElementById('gt-script')) {
            // Script already present (hot-reload / SPA nav)
            setTimeout(() => setGtReady(true), 500)
        }
    }, [])

    // ----------------------------------------------------------------
    // Restore saved preference once GT is ready
    // ----------------------------------------------------------------
    useEffect(() => {
        if (!gtReady) return
        const saved = localStorage.getItem('appLanguage') || 'en'
        if (saved !== 'en') {
            setCurrent(saved)
            translateWithRetry(saved)
        }
    }, [gtReady])

    useEffect(() => {
        if (!gtReady || !pendingLanguage) return
        translateWithRetry(pendingLanguage)
        setPendingLanguage(null)
    }, [gtReady, pendingLanguage])

    // ----------------------------------------------------------------
    // Close on outside click
    // ----------------------------------------------------------------
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [])

    const handleSelect = (code: string) => {
        setCurrent(code)
        localStorage.setItem('appLanguage', code)
        if (!gtReady) {
            setPendingLanguage(code)
            loadGoogleTranslate()
            setOpen(false)
            return
        }
        translateWithRetry(code)
        setOpen(false)
    }

    const currentLang = LANGUAGES.find(l => l.code === current) || LANGUAGES[0]

    return (
        <div
            ref={dropdownRef}
            className="relative"
            /* Prevent GT from translating the switcher UI itself */
            translate="no"
        >
            {/* Trigger button */}
            <button
                onClick={() => {
                    loadGoogleTranslate()
                    setOpen(o => !o)
                }}
                aria-label="Switch language"
                title="Switch language"
                className={`notranslate flex items-center gap-1.5 px-2.5 py-1.5 rounded-full shadow-lg border transition-all duration-200 backdrop-blur-md
                    ${open
                        ? 'bg-blue-600 text-white border-blue-500 shadow-blue-400/30'
                        : 'bg-white/80 dark:bg-gray-900/80 text-gray-700 dark:text-gray-200 border-gray-200/60 dark:border-gray-700/60 hover:bg-white dark:hover:bg-gray-800'
                    }`}
                translate="no"
            >
                {/* Globe icon */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <span className="notranslate text-xs font-bold tracking-wide" translate="no">
                    {currentLang.code.toUpperCase()}
                </span>
                <svg
                    width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                    strokeLinecap="round" strokeLinejoin="round"
                    className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </button>

            {/* Dropdown */}
            {open && (
                <div
                    className="notranslate absolute right-0 top-full mt-2 w-44 rounded-2xl shadow-2xl border overflow-hidden"
                    translate="no"
                    style={{
                        background: 'var(--panel)',
                        borderColor: 'rgba(148,163,184,0.2)',
                        animation: 'fadeInDown 0.15s ease-out',
                    }}
                >
                    {LANGUAGES.map(lang => (
                        <button
                            key={lang.code}
                            onClick={() => handleSelect(lang.code)}
                            translate="no"
                            className={`notranslate w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors
                                hover:bg-blue-50 dark:hover:bg-blue-950/40
                                ${current === lang.code
                                    ? 'text-blue-600 dark:text-blue-400 font-semibold bg-blue-50/60 dark:bg-blue-950/30'
                                    : 'text-gray-700 dark:text-gray-300'
                                }`}
                        >
                            {/* Both spans marked notranslate so GT never touches them */}
                            <span className="notranslate flex-1 text-left" translate="no">{lang.label}</span>
                            <span className="notranslate text-xs opacity-50" translate="no">{lang.native}</span>
                            {current === lang.code && (
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                                    className="text-blue-500 shrink-0">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
