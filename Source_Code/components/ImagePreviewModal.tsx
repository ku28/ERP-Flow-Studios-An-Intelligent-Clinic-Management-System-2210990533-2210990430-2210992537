import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface ImagePreviewModalProps {
    isOpen: boolean
    imageUrl: string
    onClose: () => void
    patientName?: string
}

export default function ImagePreviewModal({ isOpen, imageUrl, onClose, patientName }: ImagePreviewModalProps) {
    // Close modal on Escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose()
            }
        }

        document.addEventListener('keydown', handleEscape)
        return () => document.removeEventListener('keydown', handleEscape)
    }, [isOpen, onClose])

    // Prevent body scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = 'unset'
        }
        return () => {
            document.body.style.overflow = 'unset'
        }
    }, [isOpen])

    if (!isOpen) return null

    const modal = (
        <div 
            className="fixed inset-0 bg-black/90 flex items-center justify-center z-[10000] p-4 animate-fade-in"
            onClick={onClose}
        >
            <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col">
                {/* Header with patient name and close button */}
                <div className="flex items-center justify-between mb-4 px-2">
                    {patientName && (
                        <h3 className="text-white text-xl font-semibold">
                            {patientName}
                        </h3>
                    )}
                    <button
                        onClick={onClose}
                        className="ml-auto p-2 text-white hover:text-gray-300 transition-colors bg-white/10 rounded-full hover:bg-white/20"
                        title="Close (Esc)"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Image container */}
                <div 
                    className="relative bg-black rounded-lg overflow-hidden shadow-2xl animate-scale-in"
                    onClick={(e) => e.stopPropagation()}
                >
                    <img
                        src={imageUrl}
                        alt={patientName || 'Patient Image'}
                        className="w-full h-auto max-h-[80vh] object-contain"
                        onError={(e) => {
                            const target = e.target as HTMLImageElement
                            target.src = process.env.NEXT_PUBLIC_DEFAULT_PATIENT_IMAGE || '/default-patient.png'
                        }}
                    />
                </div>

                {/* Download button */}
                <div className="flex justify-center mt-4">
                    <a
                        href={imageUrl}
                        download
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-lg transition-all duration-200 flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download Image
                    </a>
                </div>
            </div>
        </div>
    )

    return typeof document !== 'undefined' ? createPortal(modal, document.body) : null
}
