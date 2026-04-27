import { useRef, useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface CameraModalProps {
    isOpen: boolean
    onClose: () => void
    onCapture: (imageData: string) => void
    title?: string
}

export default function CameraModal({ isOpen, onClose, onCapture, title = 'Capture Document' }: CameraModalProps) {
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [stream, setStream] = useState<MediaStream | null>(null)
    const [isCameraReady, setIsCameraReady] = useState(false)
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')

    // Start camera when modal opens or facingMode changes
    useEffect(() => {
        if (isOpen) {
            startCamera()
        } else {
            stopCamera()
        }
        return () => stopCamera()
    }, [isOpen, facingMode])

    const startCamera = async () => {
        // Stop existing stream first
        if (stream) {
            stream.getTracks().forEach(track => track.stop())
        }
        
        setIsCameraReady(false)
        
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: facingMode, // Use selected camera
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                }
            })
            setStream(mediaStream)
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream
                videoRef.current.onloadedmetadata = () => {
                    setIsCameraReady(true)
                }
            }
        } catch (err) {
            alert('Unable to access camera. Please check permissions.')
        }
    }

    const switchCamera = () => {
        setFacingMode(prev => prev === 'environment' ? 'user' : 'environment')
    }

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop())
            setStream(null)
        }
        setIsCameraReady(false)
    }

    const captureImage = () => {
        if (!videoRef.current || !canvasRef.current) return

        const video = videoRef.current
        const canvas = canvasRef.current
        
        // Set canvas size to match video dimensions
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight

        // Draw video frame to canvas
        const ctx = canvas.getContext('2d')
        if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            
            // Convert to base64
            const imageData = canvas.toDataURL('image/jpeg', 0.9)
            onCapture(imageData)
            handleClose()
        }
    }

    const handleClose = () => {
        stopCamera()
        onClose()
    }

    if (!isOpen) return null

    const modal = (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-75 p-4" style={{ zIndex: 10001 }}>
            <div className="relative rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/20 backdrop-blur-sm max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none"></div>
                {/* Header */}
                <div className="relative flex items-center justify-between p-3 border-b border-blue-200/30 dark:border-blue-700/30 flex-shrink-0">
                    <h3 className="text-base font-semibold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">{title}</h3>
                    <button
                        onClick={handleClose}
                        className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Camera View - A4 aspect ratio (1:1.414) */}
                <div className="relative bg-black flex-shrink-0" style={{ aspectRatio: '1 / 1.414', maxHeight: 'calc(90vh - 140px)' }}>
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                    />
                    
                    {/* Overlay guide for document alignment */}
                    <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute inset-4 border-2 border-dashed border-white opacity-50 rounded"></div>
                    </div>

                    {!isCameraReady && (
                        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                            <div className="text-white text-center">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                                <p>Loading camera...</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 flex-shrink-0">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={switchCamera}
                        disabled={!isCameraReady}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                        title="Switch Camera"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Switch
                    </button>
                    <button
                        onClick={captureImage}
                        disabled={!isCameraReady}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        Capture
                    </button>
                </div>

                {/* Hidden canvas for image capture */}
                <canvas ref={canvasRef} className="hidden" />
            </div>
        </div>
    )

    if (typeof document === 'undefined') return modal
    return createPortal(modal, document.body)
}

