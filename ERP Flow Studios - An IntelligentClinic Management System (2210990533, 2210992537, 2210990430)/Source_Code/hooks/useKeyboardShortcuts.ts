import { useEffect } from 'react'
import { useRouter } from 'next/router'

interface UseKeyboardShortcutsOptions {
    onOpenCommandPalette?: () => void
    enabled?: boolean
}

export default function useKeyboardShortcuts({ onOpenCommandPalette, enabled = true }: UseKeyboardShortcutsOptions) {
    const router = useRouter()

    useEffect(() => {
        if (!enabled) return

        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if typing in an input/textarea/contenteditable
            const target = e.target as HTMLElement
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                // Allow Ctrl+K and Ctrl+/ even in inputs
                if (!((e.ctrlKey && e.key === 'k') || (e.ctrlKey && e.key === '/'))) return
            }

            // Ctrl+K — Command Palette
            if (e.ctrlKey && e.key === 'k') {
                e.preventDefault()
                onOpenCommandPalette?.()
                return
            }

            // Ctrl+/ — Show keyboard shortcuts help
            if (e.ctrlKey && e.key === '/') {
                e.preventDefault()
                // Trigger help modal or toast
                const event = new CustomEvent('show-keyboard-shortcuts')
                window.dispatchEvent(event)
                return
            }

            // Ctrl+Shift+N — New Patient
            if (e.ctrlKey && e.shiftKey && e.key === 'N') {
                e.preventDefault()
                router.push('/patients?action=new')
                return
            }

            // Ctrl+Shift+V — New Visit
            if (e.ctrlKey && e.shiftKey && e.key === 'V') {
                e.preventDefault()
                router.push('/visits?action=new')
                return
            }

            // Ctrl+Shift+P — New Product
            if (e.ctrlKey && e.shiftKey && e.key === 'P') {
                e.preventDefault()
                router.push('/products?action=new')
                return
            }

            // Ctrl+Shift+B — New Invoice
            if (e.ctrlKey && e.shiftKey && e.key === 'B') {
                e.preventDefault()
                router.push('/invoices?action=new')
                return
            }

            // Ctrl+Shift+S — New Supplier
            if (e.ctrlKey && e.shiftKey && e.key === 'S') {
                e.preventDefault()
                router.push('/suppliers?action=new')
                return
            }

            // Ctrl+Shift+T — New Treatment
            if (e.ctrlKey && e.shiftKey && e.key === 'T') {
                e.preventDefault()
                router.push('/treatments?action=new')
                return
            }

            // Ctrl+H — Go to Home/Dashboard
            if (e.ctrlKey && e.key === 'h') {
                e.preventDefault()
                router.push('/dashboard')
                return
            }

            // Ctrl+B — Go Back
            if (e.ctrlKey && e.key === 'b') {
                e.preventDefault()
                router.back()
                return
            }

            // Ctrl+Shift+F — Search/Focus search field
            if (e.ctrlKey && e.shiftKey && e.key === 'F') {
                e.preventDefault()
                // Focus the search input if it exists
                const searchInput = document.querySelector('input[type="search"], input[placeholder*="Search"]') as HTMLInputElement
                searchInput?.focus()
                return
            }

            // Alt+1-9 — Quick navigation
            if (e.altKey && !e.ctrlKey && !e.shiftKey) {
                const num = parseInt(e.key)
                if (num >= 1 && num <= 9) {
                    const routes = ['/dashboard', '/patients', '/treatments', '/products', '/visits', '/invoices', '/analytics', '/suppliers', '/tasks']
                    if (routes[num - 1]) {
                        e.preventDefault()
                        router.push(routes[num - 1])
                    }
                }
            }

            // Ctrl+E — Export data (trigger export on current page)
            if (e.ctrlKey && e.key === 'e') {
                e.preventDefault()
                const event = new CustomEvent('trigger-export')
                window.dispatchEvent(event)
                return
            }

            // Ctrl+Shift+R — Refresh data on current page  
            if (e.ctrlKey && e.shiftKey && e.key === 'R') {
                e.preventDefault()
                const event = new CustomEvent('trigger-refresh')
                window.dispatchEvent(event)
                return
            }

            // Escape — Close modals/dropdowns
            if (e.key === 'Escape') {
                const event = new CustomEvent('close-all-modals')
                window.dispatchEvent(event)
                return
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [enabled, onOpenCommandPalette, router])
}