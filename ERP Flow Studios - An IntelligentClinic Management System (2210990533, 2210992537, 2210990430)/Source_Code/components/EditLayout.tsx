import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'

interface EditLayoutProps {
    children: React.ReactNode
}

export default function EditLayout({ children }: EditLayoutProps) {
    const router = useRouter()
    const [mobileOpen, setMobileOpen] = useState(false)
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

    const navLinks = [
        { href: '/edit', label: 'Home' },
        { href: '/edit-about', label: 'About' },
        { href: '/edit-services', label: 'Services' },
        { href: '/edit-gallery', label: 'Gallery' },
        { href: '/edit-contact', label: 'Contact' },
    ]

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
            {/* Header */}
            <header className="sticky top-5 z-50 w-[90%] md:w-[70%] lg:w-[75%] lg:max-w-screen-xl mx-auto rounded-2xl shadow-inner bg-white/80 dark:bg-black/15 backdrop-blur-md border border-gray-200/50 dark:border-gray-700/50 py-2">
                <div className="mx-auto px-2 sm:px-4 flex justify-between items-center">
                    <div className="flex items-center gap-3 sm:gap-6">
                        <button
                            onClick={() => setMobileOpen(!mobileOpen)}
                            className="md:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-white/10 transition-colors text-gray-800 dark:text-white"
                            aria-label="Toggle menu"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                {mobileOpen ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                )}
                            </svg>
                        </button>

                        <div className="flex items-center gap-2 sm:gap-3">
                            <img src="/favicon.png" alt="ERP" className="w-8 h-8 sm:w-10 sm:h-10 object-contain" />
                            <h1 className="text-lg sm:text-xl font-bold text-gray-800 dark:text-white">ERP Flow Studios</h1>
                        </div>

                        <nav className="hidden md:flex items-center gap-1">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={`px-3 py-2 rounded-lg transition-colors font-medium text-sm ${
                                        router.pathname === link.href
                                            ? 'bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white'
                                            : 'text-gray-800 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10'
                                    }`}
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </nav>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => router.push('/')}
                            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white rounded-lg text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                            Exit Edit
                        </button>
                        <button
                            aria-label="Toggle theme"
                            onClick={toggleTheme}
                            className="w-10 h-10 flex items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                        >
                            {dark ? (
                                <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                                </svg>
                            ) : (
                                <svg className="w-5 h-5 text-gray-700" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>

                {/* Mobile Menu */}
                {mobileOpen && (
                    <nav className="md:hidden mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 px-2">
                        {navLinks.map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`block px-3 py-2 rounded-lg transition-colors font-medium text-sm mb-1 ${
                                    router.pathname === link.href
                                        ? 'bg-gray-100 dark:bg-white/10 text-gray-900 dark:text-white'
                                        : 'text-gray-800 dark:text-white hover:bg-gray-100 dark:hover:bg-white/10'
                                }`}
                                onClick={() => setMobileOpen(false)}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </nav>
                )}
            </header>

            {/* Floating Edit Mode Indicator */}
            <div className="fixed bottom-8 left-8 z-50 flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-full shadow-lg animate-pulse mobile-safe-fab mobile-safe-fab-tertiary mobile-safe-fab-left">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span className="font-semibold text-sm">EDIT MODE</span>
            </div>

            {/* Main Content */}
            <main className="pt-8">
                {children}
            </main>
        </div>
    )
}
