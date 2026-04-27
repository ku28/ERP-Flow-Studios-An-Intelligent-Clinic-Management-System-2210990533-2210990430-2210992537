import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import Image, { ImageLoaderProps } from 'next/image'
import dynamic from 'next/dynamic'
import AppSwitcherModal from './AppSwitcherModal'
import { useAuth } from '../contexts/AuthContext'

const LanguageSwitcher = dynamic(() => import('./LanguageSwitcher'), { ssr: false })
const passthroughLoader = ({ src }: ImageLoaderProps) => src

export default function LandingHeader() {
    const router = useRouter()
    // const [loading, setLoading] = useState(false) // Removed local loading
    const [mobileOpen, setMobileOpen] = useState(false)
    const [appSwitcherModalOpen, setAppSwitcherModalOpen] = useState(false)
    const { user, loading } = useAuth() // Use global auth

    // Removed local fetch effect explicitly as useAuth handles it

    const [dark, setDark] = useState(false)

    useEffect(() => {
        try {
            const stored = localStorage.getItem('theme')
            if (stored) {
                setDark(stored === 'dark')
                document.documentElement.classList.toggle('dark', stored === 'dark')
            } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                setDark(true)
                document.documentElement.classList.add('dark')
            }
        } catch (e) { }
    }, [])

    const toggleTheme = () => {
        const next = !dark
        setDark(next)
        try {
            localStorage.setItem('theme', next ? 'dark' : 'light')
            document.documentElement.classList.toggle('dark', next)
        } catch (e) { }
    }

    return (
        <>
            <AppSwitcherModal 
                isOpen={appSwitcherModalOpen}
                onClose={() => setAppSwitcherModalOpen(false)}
                currentApp="website"
                user={user}
            />
            
            <header className="sticky top-2 sm:top-5 z-50 w-[95%] sm:w-[90%] md:w-[70%] lg:w-[75%] lg:max-w-screen-xl mx-auto rounded-full shadow-inner bg-white/80 dark:bg-black/15 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 py-2 sm:py-3">
            <div className="mx-auto px-2 sm:px-4 md:px-6 flex justify-between items-center">
                <div className="flex items-center gap-2 sm:gap-3 md:gap-6 min-w-0">
                    <button
                        onClick={() => setMobileOpen(!mobileOpen)}
                        className="md:hidden p-1.5 sm:p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-gray-800 dark:text-white flex-shrink-0"
                        aria-label="Toggle menu"
                    >
                        <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {mobileOpen ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                            )}
                        </svg>
                    </button>

                    {/* Logo and Title with App Switcher Icon */}
                    <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 min-w-0">
                        <Image src="/favicon.png" alt="ERP Flow Studios logo" width={40} height={40} className="w-6 h-6 sm:w-8 sm:h-8 md:w-10 md:h-10 object-contain flex-shrink-0" priority />
                        <div className="text-sm sm:text-base md:text-lg lg:text-xl font-bold text-gray-800 dark:text-white truncate">ERP Flow Studios</div>
                        
                        {/* App Switcher Icon Button */}
                        <button
                            onClick={() => setAppSwitcherModalOpen(true)}
                            className="p-1 sm:p-1.5 md:p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-all duration-200 group flex-shrink-0"
                            aria-label="Switch application"
                            title="Switch between ERP Flow Studios Website and App"
                        >
                            <svg 
                                className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                            </svg>
                        </button>
                    </div>

                    <nav className="hidden md:flex items-center gap-1">
                        <Link href="/" className="px-2 lg:px-3 py-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-medium text-xs lg:text-sm text-gray-800 dark:text-white">Home</Link>
                        <Link href="/features" className="px-2 lg:px-3 py-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-medium text-xs lg:text-sm text-gray-800 dark:text-white">Features</Link>
                        <Link href="/pricing" className="px-2 lg:px-3 py-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-medium text-xs lg:text-sm text-gray-800 dark:text-white">Pricing</Link>
                        <Link href="/contact" className="px-2 lg:px-3 py-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-medium text-xs lg:text-sm text-gray-800 dark:text-white">Contact</Link>
                    </nav>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3 flex-shrink-0">
                    <Link
                        href="/download"
                        className="hidden md:inline-flex items-center gap-1.5 px-3 lg:px-4 py-1.5 sm:py-2 rounded-full bg-gradient-to-r from-brand to-purple-600 text-white text-xs lg:text-sm font-semibold shadow-md hover:shadow-lg hover:opacity-90 transition-all whitespace-nowrap"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download
                    </Link>
                    <button 
                        onClick={() => {
                            if ((user as any)?.clinic) {
                                router.push('/dashboard')
                            } else {
                                router.push('/clinic-login')
                            }
                        }}
                        className="px-2 sm:px-3 md:px-4 py-1.5 sm:py-2 bg-brand text-white rounded-full text-[10px] sm:text-xs md:text-sm font-medium hover:bg-brand-600 transition-colors whitespace-nowrap shadow-md hover:shadow-lg flex items-center gap-2 min-w-[100px] justify-center"
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                <span className="hidden sm:inline">Loading...</span>
                            </>
                        ) : (user as any)?.clinic ? (
                            <>
                                {(user as any).clinic.iconUrl && (
                                            <Image
                                                loader={passthroughLoader}
                                                unoptimized
                                                src={(user as any).clinic.iconUrl}
                                                alt=""
                                                width={20}
                                                height={20}
                                                className="w-4 h-4 sm:w-5 sm:h-5 object-contain rounded-full bg-white/10"
                                            />
                                )}
                                <span>Access {(user as any).clinic.name}</span>
                            </>
                        ) : (
                            <>
                                <span className="hidden sm:inline">Access Clinic</span>
                                <span className="sm:hidden">Access</span>
                            </>
                        )}
                    </button>
                    <LanguageSwitcher />
                    <button
                        aria-label="Toggle theme"
                        aria-pressed={dark}
                        onClick={toggleTheme}
                        title={dark ? 'Switch to light' : 'Switch to dark'}
                        className={`theme-toggle ${dark ? 'is-dark' : ''}`}
                    >
                        <span className="toggle-icon toggle-sun" aria-hidden>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                                <path d="M6.76 4.84l-1.8-1.79L3.17 4.84l1.79 1.8 1.8-1.8zM1 13h3v-2H1v2zm10-9h2V1h-2v3zm7.03 1.05l1.8-1.8-1.8-1.79-1.79 1.79 1.79 1.8zM17 13h3v-2h-3v2zM6.76 19.16l-1.8 1.79L3.17 19.16l1.79-1.79 1.8 1.79zM12 20a1 1 0 110 2 1 1 0 010-2zm0-6a4 4 0 100-8 4 4 0 000 8z" />
                            </svg>
                        </span>
                        <span className="toggle-icon toggle-moon" aria-hidden>
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                            </svg>
                        </span>
                        <span className="toggle-knob" aria-hidden />
                    </button>
                </div>
            </div>

            {mobileOpen && (
                <div className="md:hidden mt-3 sm:mt-4 px-3 sm:px-4 border-t border-gray-200 dark:border-gray-700/50 pt-3 sm:pt-4">
                    <nav className="flex flex-col gap-1.5 sm:gap-2">
                        <Link href="/" className="px-3 sm:px-4 py-2 sm:py-3 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-medium text-sm text-gray-800 dark:text-white">Home</Link>
                        <Link href="/features" className="px-3 sm:px-4 py-2 sm:py-3 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-medium text-sm text-gray-800 dark:text-white">Features</Link>
                        <Link href="/pricing" className="px-3 sm:px-4 py-2 sm:py-3 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-medium text-sm text-gray-800 dark:text-white">Pricing</Link>
                        <Link href="/contact" className="px-3 sm:px-4 py-2 sm:py-3 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors font-medium text-sm text-gray-800 dark:text-white">Contact</Link>
                        <Link href="/download" className="px-3 sm:px-4 py-2 sm:py-3 rounded-full bg-gradient-to-r from-brand to-purple-600 text-white font-semibold text-sm flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download
                        </Link>
                        <div className="flex gap-2 mt-2">
                            <button 
                                onClick={() => {
                                    if ((user as any)?.clinic) {
                                        router.push('/dashboard')
                                    } else {
                                        router.push('/clinic-login')
                                    }
                                }}
                                className="flex-1 text-center px-3 sm:px-4 py-2 sm:py-3 bg-brand text-white rounded-full hover:bg-brand-600 transition-colors text-sm font-medium flex items-center justify-center gap-2"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        <span>Loading...</span>
                                    </>
                                ) : (user as any)?.clinic ? (
                                    <>
                                        {(user as any).clinic.iconUrl && (
                                            <Image
                                                loader={passthroughLoader}
                                                unoptimized
                                                src={(user as any).clinic.iconUrl}
                                                alt=""
                                                width={20}
                                                height={20}
                                                className="w-5 h-5 object-contain rounded-full bg-white/10"
                                            />
                                        )}
                                        <span>Access {(user as any).clinic.name}</span>
                                    </>
                                ) : (
                                    <span>Access Clinic</span>
                                )}
                            </button>
                        </div>
                    </nav>
                </div>
            )}
        </header>
        </>
    )
}

