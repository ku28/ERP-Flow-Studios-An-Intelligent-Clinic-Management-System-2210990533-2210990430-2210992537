import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface ReportsPreviewModalProps {
    isOpen: boolean
    onClose: () => void
    reports: Array<{ url: string, name: string, type: string }>
    onUpdate?: (reports: Array<{ url: string, name: string, type: string }>) => void
    readOnly?: boolean
}

export default function ReportsPreviewModal({ isOpen, onClose, reports, onUpdate, readOnly = false }: ReportsPreviewModalProps) {
    const [currentIndex, setCurrentIndex] = useState(0)
    const [localReports, setLocalReports] = useState(reports)

    // Sync localReports with reports prop when modal opens or reports change
    useEffect(() => {
        if (isOpen) {
            setLocalReports(reports)
            setCurrentIndex(0)
        }
    }, [isOpen, reports])

    if (!isOpen || localReports.length === 0) return null

    const currentReport = localReports[currentIndex]

    const handleNext = () => {
        if (currentIndex < localReports.length - 1) {
            setCurrentIndex(currentIndex + 1)
        }
    }

    const handlePrevious = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1)
        }
    }

    const handleDelete = () => {
        if (readOnly) return
        
        const newReports = localReports.filter((_, idx) => idx !== currentIndex)
        setLocalReports(newReports)
        
        if (newReports.length === 0) {
            onUpdate?.(newReports)
            onClose()
        } else {
            if (currentIndex >= newReports.length) {
                setCurrentIndex(newReports.length - 1)
            }
        }
    }

    const handleSave = () => {
        if (!readOnly && onUpdate) {
            onUpdate(localReports)
        }
        onClose()
    }

    const handleClose = () => {
        setLocalReports(reports) // Reset to original
        setCurrentIndex(0)
        onClose()
    }

    const isImage = currentReport.type.startsWith('image/')
    const isPdf = currentReport.type === 'application/pdf'

    const modal = (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-75 p-4 z-[10002]">
            <div className="relative rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/20 backdrop-blur-sm max-w-5xl w-full max-h-[95vh] overflow-hidden flex flex-col">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none"></div>
                
                {/* Header */}
                <div className="relative flex items-center justify-between p-4 border-b border-blue-200/30 dark:border-blue-700/30 flex-shrink-0">
                    <div>
                        <h3 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                            Reports Preview
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                            Report {currentIndex + 1} of {localReports.length}
                        </p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content Area */}
                <div className="relative flex-1 overflow-auto bg-gray-100 dark:bg-gray-800 p-4">
                    <div className="h-full flex items-center justify-center">
                        {isImage && (
                            <img 
                                src={currentReport.url} 
                                alt={currentReport.name}
                                className="max-w-full max-h-full object-contain rounded-lg shadow-xl"
                            />
                        )}
                        {isPdf && (
                            <iframe 
                                src={currentReport.url}
                                className="w-full h-full border-0 rounded-lg shadow-xl"
                                title={currentReport.name}
                            />
                        )}
                        {!isImage && !isPdf && (
                            <div className="text-center">
                                <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                </svg>
                                <p className="text-gray-600 dark:text-gray-400 mb-4">
                                    Preview not available for this file type
                                </p>
                                <a 
                                    href={currentReport.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-lg font-medium transition-all duration-200"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                    Open in new tab
                                </a>
                            </div>
                        )}
                    </div>
                </div>

                {/* File Info Bar */}
                <div className="relative px-4 py-2 bg-gray-50 dark:bg-gray-800 border-t border-blue-200/30 dark:border-blue-700/30 flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                            <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                            </svg>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                                {currentReport.name}
                            </span>
                        </div>
                        <a 
                            href={currentReport.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors font-medium flex-shrink-0"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                            Open
                        </a>
                    </div>
                </div>

                {/* Navigation Controls */}
                <div className="relative flex items-center justify-between gap-3 p-4 bg-white dark:bg-gray-900 border-t border-blue-200/30 dark:border-blue-700/30 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handlePrevious}
                            disabled={currentIndex === 0}
                            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm flex items-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            Previous
                        </button>
                        <button
                            onClick={handleNext}
                            disabled={currentIndex === localReports.length - 1}
                            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm flex items-center gap-2"
                        >
                            Next
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {!readOnly && (
                            <button
                                onClick={handleDelete}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium text-sm flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                Delete
                            </button>
                        )}
                        <button
                            onClick={handleClose}
                            className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors font-medium text-sm"
                        >
                            Cancel
                        </button>
                        {!readOnly && (
                            <button
                                onClick={handleSave}
                                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-lg font-medium text-sm flex items-center gap-2 shadow-lg shadow-blue-500/30"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Save Changes
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )

    return typeof document !== 'undefined' ? createPortal(modal, document.body) : null
}

