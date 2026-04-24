import { useState, useEffect } from 'react'

export default function KeyboardShortcutsModal() {
    const [isOpen, setIsOpen] = useState(false)
    const [animating, setAnimating] = useState(false)

    useEffect(() => {
        const handleShowShortcuts = () => {
            setIsOpen(true)
            setTimeout(() => setAnimating(true), 10)
        }

        const handleCloseModals = () => {
            closeModal()
        }

        window.addEventListener('show-keyboard-shortcuts', handleShowShortcuts)
        window.addEventListener('close-all-modals', handleCloseModals)

        return () => {
            window.removeEventListener('show-keyboard-shortcuts', handleShowShortcuts)
            window.removeEventListener('close-all-modals', handleCloseModals)
        }
    }, [])

    const closeModal = () => {
        setAnimating(false)
        setTimeout(() => setIsOpen(false), 300)
    }

    if (!isOpen) return null

    const shortcuts = [
        { category: 'General', items: [
            { keys: ['Ctrl', 'K'], description: 'Open command palette' },
            { keys: ['Ctrl', '/'], description: 'Show keyboard shortcuts' },
            { keys: ['Ctrl', 'H'], description: 'Go to home/dashboard' },
            { keys: ['Ctrl', 'B'], description: 'Go back' },
            { keys: ['Esc'], description: 'Close modals/dropdowns' },
        ]},
        { category: 'Quick Create', items: [
            { keys: ['Ctrl', 'Shift', 'N'], description: 'New patient' },
            { keys: ['Ctrl', 'Shift', 'V'], description: 'New visit' },
            { keys: ['Ctrl', 'Shift', 'P'], description: 'New product' },
            { keys: ['Ctrl', 'Shift', 'B'], description: 'New invoice' },
            { keys: ['Ctrl', 'Shift', 'S'], description: 'New supplier' },
            { keys: ['Ctrl', 'Shift', 'T'], description: 'New treatment' },
        ]},
        { category: 'Navigation', items: [
            { keys: ['Alt', '1'], description: 'Dashboard' },
            { keys: ['Alt', '2'], description: 'Patients' },
            { keys: ['Alt', '3'], description: 'Treatments' },
            { keys: ['Alt', '4'], description: 'Inventory' },
            { keys: ['Alt', '5'], description: 'Visits' },
            { keys: ['Alt', '6'], description: 'Invoices' },
            { keys: ['Alt', '7'], description: 'Analytics' },
            { keys: ['Alt', '8'], description: 'Suppliers' },
            { keys: ['Alt', '9'], description: 'Tasks' },
        ]},
        { category: 'Actions', items: [
            { keys: ['Ctrl', 'Shift', 'F'], description: 'Focus search field' },
            { keys: ['Ctrl', 'E'], description: 'Export data' },
            { keys: ['Ctrl', 'Shift', 'R'], description: 'Refresh data' },
        ]},
    ]

    return (
        <>
            {/* Backdrop */}
            <div 
                className={`fixed inset-0 bg-black/50 z-[100] transition-opacity duration-300 ${animating ? 'opacity-100' : 'opacity-0'}`}
                onClick={closeModal}
            />
            
            {/* Modal */}
            <div className={`fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none`}>
                <div 
                    className={`bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden pointer-events-auto transition-all duration-300 ${
                        animating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                    }`}
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Keyboard Shortcuts</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Boost your productivity with these shortcuts</p>
                        </div>
                        <button
                            onClick={closeModal}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Content */}
                    <div className="overflow-y-auto max-h-[calc(80vh-5rem)] p-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {shortcuts.map((section, idx) => (
                                <div key={idx} className="space-y-3">
                                    <h3 className="font-semibold text-sm uppercase tracking-wider text-blue-600 dark:text-blue-400">
                                        {section.category}
                                    </h3>
                                    <div className="space-y-2">
                                        {section.items.map((shortcut, i) => (
                                            <div key={i} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                                                <span className="text-sm text-gray-700 dark:text-gray-300">
                                                    {shortcut.description}
                                                </span>
                                                <div className="flex items-center gap-1">
                                                    {shortcut.keys.map((key, k) => (
                                                        <kbd 
                                                            key={k} 
                                                            className="px-2 py-1 text-xs font-semibold text-gray-800 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded shadow-sm"
                                                        >
                                                            {key}
                                                        </kbd>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Mobile Gestures Section */}
                        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                            <h3 className="font-semibold text-sm uppercase tracking-wider text-blue-600 dark:text-blue-400 mb-3">
                                Mobile Gestures
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                    <div className="flex-shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                                        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                                        </svg>
                                    </div>
                                    <div>
                                        <div className="font-medium text-sm text-gray-900 dark:text-white">Swipe Right</div>
                                        <div className="text-xs text-gray-600 dark:text-gray-400">Go back</div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                    <div className="flex-shrink-0 w-10 h-10 bg-blue-100 dark:bg-blue-900/50 rounded-full flex items-center justify-center">
                                        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                                        </svg>
                                    </div>
                                    <div>
                                        <div className="font-medium text-sm text-gray-900 dark:text-white">Swipe Down</div>
                                        <div className="text-xs text-gray-600 dark:text-gray-400">Refresh page</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer tip */}
                        <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                            <p className="text-xs text-gray-600 dark:text-gray-400 text-center">
                                <span className="font-semibold">Tip:</span> Press <kbd className="px-1.5 py-0.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">Ctrl</kbd> + <kbd className="px-1.5 py-0.5 text-xs bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">/</kbd> anytime to see this list
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
