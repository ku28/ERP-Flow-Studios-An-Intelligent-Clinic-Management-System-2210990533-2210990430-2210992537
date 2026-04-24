import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'
import { isBasicPlan } from '../lib/subscription'

interface ReceiveGoodsBillUploadModalProps {
    isOpen: boolean
    onClose: () => void
    onDataExtracted: (data: any[], billUrl?: string, unmatchedItems?: any[], availableProducts?: any[], priceUpdates?: any[]) => void
    user?: any
}

const PROCESSING_STEPS = [
    { label: 'Uploading bill', sub: 'Sending file to server...' },
    { label: 'Extracting text from image', sub: 'OCR engine scanning the document...' },
    { label: 'Analyzing bill with AI', sub: 'AI is reading your bill...' },
    { label: 'Structuring bill data', sub: 'Building product list...' },
]

export default function ReceiveGoodsBillUploadModal({ isOpen, onClose, onDataExtracted, user }: ReceiveGoodsBillUploadModalProps) {
    const router = useRouter()
    const isBasicSubscription = isBasicPlan(user?.clinic?.subscriptionPlan)
    const isVisionUser = user?.clinic?.subscriptionPlan === 'pro' || user?.clinic?.subscriptionPlan === 'basic_ai_ocr' || user?.clinic?.subscriptionPlan === 'standard_ai_ocr'
    const [file, setFile] = useState<File | null>(null)
    const [preview, setPreview] = useState<string>('')
    const [uploading, setUploading] = useState(false)
    const [error, setError] = useState('')
    const [animating, setAnimating] = useState(false)
    const [activeTab, setActiveTab] = useState<'upload' | 'scan'>('upload')
    const [isCameraActive, setIsCameraActive] = useState(false)
    const [selectedOcrProvider, setSelectedOcrProvider] = useState<'tesseract' | 'google_vision'>('tesseract')
    const [extractedProducts, setExtractedProducts] = useState<any[]>([])
    const [extractionResult, setExtractionResult] = useState<any>(null)
    const [showResults, setShowResults] = useState(false)
    const [visionUsage, setVisionUsage] = useState<{ used: number; limit: number; safeLimit: number } | null>(null)

    // Multi-step processing UX
    const [modalStep, setModalStep] = useState<'upload' | 'processing' | 'results'>('upload')
    const [processingStepIdx, setProcessingStepIdx] = useState(0)
    const [dotCount, setDotCount] = useState(1)
    const [aiCacheHit, setAiCacheHit] = useState(false)
    const processingTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

    const fileInputRef = useRef<HTMLInputElement>(null)
    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const streamRef = useRef<MediaStream | null>(null)

    const stopCameraStream = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop())
            streamRef.current = null
        }
        if (videoRef.current) {
            videoRef.current.srcObject = null
        }
    }

    useEffect(() => {
        return () => { stopCameraStream() }
    }, [])

    useEffect(() => {
        if (isOpen && isBasicSubscription) {
            onClose()
            router.push('/upgrade')
        }
    }, [isOpen, isBasicSubscription, onClose, router])

    // Fetch Vision usage when modal opens (Pro users only)
    useEffect(() => {
        if (isOpen && isVisionUser) {
            fetch('/api/vision-usage').then(r => r.ok ? r.json() : null).then(data => {
                if (data) setVisionUsage(data)
            }).catch(() => {})
        }
    }, [isOpen, isVisionUser])

    // Animated dots while processing
    useEffect(() => {
        if (modalStep !== 'processing') return
        const interval = setInterval(() => setDotCount(d => d >= 3 ? 1 : d + 1), 500)
        return () => clearInterval(interval)
    }, [modalStep])

    // Assign stream to video element after it mounts
    useEffect(() => {
        if (isCameraActive && streamRef.current && videoRef.current) {
            videoRef.current.srcObject = streamRef.current
            videoRef.current.play().catch(() => {})
        }
    }, [isCameraActive])

    if (!isOpen || isBasicSubscription) return null

    const openModal = () => setAnimating(true)

    const closeModal = () => {
        setAnimating(false)
        stopCamera()
        setTimeout(() => { onClose(); resetState() }, 300)
    }

    const resetState = () => {
        setFile(null)
        setPreview('')
        setError('')
        setExtractedProducts([])
        setExtractionResult(null)
        setShowResults(false)
        setActiveTab('upload')
        setIsCameraActive(false)
        setModalStep('upload')
        setProcessingStepIdx(0)
        setAiCacheHit(false)
        processingTimersRef.current.forEach(clearTimeout)
        processingTimersRef.current = []
    }

    if (isOpen && !animating) {
        setTimeout(openModal, 10)
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0]
        if (!selectedFile) return
        const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']
        if (!validTypes.includes(selectedFile.type)) {
            setError('Please upload a PDF or image file (JPG, PNG, WebP)')
            return
        }
        setFile(selectedFile)
        setError('')
        setExtractedProducts([])
        setExtractionResult(null)
        setShowResults(false)
        if (selectedFile.type.startsWith('image/')) {
            const reader = new FileReader()
            reader.onload = (e) => setPreview(e.target?.result as string)
            reader.readAsDataURL(selectedFile)
        } else {
            setPreview('')
        }
    }

    const startCamera = async () => {
        try {
            setError('')
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 }, aspectRatio: { ideal: 0.75 } }
            })
            streamRef.current = stream
            setIsCameraActive(true)
        } catch (err: any) {
            if (err.name === 'NotAllowedError') setError('Camera permission denied. Please allow camera access in your browser settings.')
            else if (err.name === 'NotFoundError') setError('No camera found. Please connect a camera and try again.')
            else setError('Failed to access camera: ' + err.message)
        }
    }

    const stopCamera = () => {
        stopCameraStream()
        setIsCameraActive(false)
    }

    const capturePhoto = () => {
        if (!videoRef.current || !canvasRef.current) return
        const video = videoRef.current
        const canvas = canvasRef.current
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(video, 0, 0)
        canvas.toBlob((blob) => {
            if (!blob) return
            const capturedFile = new File([blob], `bill-scan-${Date.now()}.jpg`, { type: 'image/jpeg' })
            setFile(capturedFile)
            setPreview(canvas.toDataURL('image/jpeg', 0.9))
            setExtractedProducts([])
            setExtractionResult(null)
            setShowResults(false)
            stopCamera()
        }, 'image/jpeg', 0.9)
    }

    const processFile = async () => {
        if (!file) { setError('Please select or capture a file'); return }

        processingTimersRef.current.forEach(clearTimeout)
        processingTimersRef.current = []

        setUploading(true)
        setError('')
        setExtractedProducts([])
        setShowResults(false)
        setProcessingStepIdx(0)
        setModalStep('processing')

        // Simulate OCR then AI steps while the single request is in-flight
        const t1 = setTimeout(() => setProcessingStepIdx(1), 700)
        const t2 = setTimeout(() => setProcessingStepIdx(2), 2800)
        processingTimersRef.current = [t1, t2]

        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('ocrProvider', selectedOcrProvider)

            const response = await fetch('/api/process-bill', { method: 'POST', body: formData })

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}))
                throw new Error(errData.details || errData.error || 'Failed to process bill')
            }

            const data = await response.json()

            // Surface cache-hit so the AI step label can update
            if (data.aiParseCached === true) setAiCacheHit(true)

            // Clear timers, advance to structuring step briefly for visual closure
            processingTimersRef.current.forEach(clearTimeout)
            setProcessingStepIdx(3)
            await new Promise(r => setTimeout(r, 500))

            const allItems = data.allExtractedItems || [...(data.items || []), ...(data.unmatchedItems || [])]
            setExtractedProducts(allItems)
            setExtractionResult(data)
            setShowResults(true)
            setModalStep('results')
        } catch (err: any) {
            processingTimersRef.current.forEach(clearTimeout)
            setError(err.message || 'Failed to process bill. Please enter data manually.')
            setModalStep('upload')
        } finally {
            setUploading(false)
        }
    }

    const handleConfirmExtraction = () => {
        if (!extractionResult) return
        onDataExtracted(
            extractionResult.items || [],
            extractionResult.billUrl || null,
            extractionResult.unmatchedItems || [],
            extractionResult.availableProducts || [],
            extractionResult.priceUpdates || []
        )
        closeModal()
    }

    const dots = '.'.repeat(dotCount)

    return (
        <div
            className={`fixed inset-0 bg-black flex items-end sm:items-center justify-center sm:p-4 transition-opacity duration-300 ${animating ? 'bg-opacity-50' : 'bg-opacity-0'}`}
            style={{ zIndex: 10000 }}
            onClick={closeModal}
        >
            <style>{`
                @keyframes fadeSlideUp {
                    from { opacity: 0; transform: translateY(10px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .bill-item-anim { animation: fadeSlideUp 0.35s ease forwards; }
            `}</style>

            <div
                className={`relative overflow-hidden rounded-t-2xl sm:rounded-2xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/20 backdrop-blur-sm w-full sm:max-w-2xl max-h-[95vh] overflow-y-auto transform transition-all duration-300 ${animating ? 'opacity-100 translate-y-0 sm:scale-100' : 'opacity-0 translate-y-full sm:translate-y-0 sm:scale-95'}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none" />

                <div className="relative p-4 sm:p-5">
                    {/* Header */}
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                            Process Bill / Invoice
                        </h2>
                        <button onClick={closeModal} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    {/* Step breadcrumb */}
                    <div className="flex items-center justify-center gap-1.5 mb-4">
                        {['Upload', 'Processing', 'Results'].map((label, idx) => {
                            const stepKey = ['upload', 'processing', 'results'][idx]
                            const isActive = modalStep === stepKey
                            const isDone = (idx === 0 && modalStep !== 'upload') || (idx === 1 && modalStep === 'results')
                            return (
                                <div key={idx} className="flex items-center gap-1.5">
                                    <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${isActive ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/40' : isDone ? 'bg-green-500/20 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500'}`}>
                                        {isDone ? (
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                            </svg>
                                        ) : (
                                            <span className={`w-3.5 h-3.5 rounded-full border text-center leading-none flex items-center justify-center text-[10px] ${isActive ? 'border-white/60 text-white' : 'border-gray-300 dark:border-gray-600 text-gray-400'}`}>{idx + 1}</span>
                                        )}
                                        {label}
                                    </div>
                                    {idx < 2 && <svg className="w-3 h-3 text-gray-300 dark:text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>}
                                </div>
                            )
                        })}
                    </div>

                    {/* --- STEP 1: UPLOAD --- */}
                    {modalStep === 'upload' && (
                        <>
                            {/* Tabs */}
                            <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
                                <button onClick={() => { setActiveTab('upload'); stopCamera(); }} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'upload' ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                    Upload File
                                </button>
                                <button onClick={() => { setActiveTab('scan'); setFile(null); setPreview(''); setExtractedProducts([]); setExtractionResult(null); setShowResults(false); }} className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'scan' ? 'bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'}`}>
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    Scan / Camera
                                </button>
                            </div>

                            {/* Upload tab */}
                            {activeTab === 'upload' && (
                                <div className="mb-4">
                                    <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFileSelect} className="hidden" />
                                    <button onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-xl p-6 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50/40 dark:hover:bg-blue-900/10 transition-all">
                                        <div className="flex flex-col items-center gap-2">
                                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${file ? 'bg-green-100 dark:bg-green-900/30' : 'bg-blue-100 dark:bg-blue-900/30'}`}>
                                                {file ? (
                                                    <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                ) : (
                                                    <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                                )}
                                            </div>
                                            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{file ? file.name : 'Click to upload bill / invoice'}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">PDF, JPG, PNG, WebP - Max 10 MB</p>
                                        </div>
                                    </button>
                                </div>
                            )}

                            {/* Scan tab */}
                            {activeTab === 'scan' && (
                                <div className="mb-4">
                                    {!isCameraActive && !preview && (
                                        <button onClick={startCamera} className="w-full border-2 border-dashed border-green-300 dark:border-green-700 rounded-xl p-6 hover:border-green-400 dark:hover:border-green-600 hover:bg-green-50/40 dark:hover:bg-green-900/10 transition-all">
                                            <div className="flex flex-col items-center gap-2">
                                                <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                                                    <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                </div>
                                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Tap to open camera</p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">Hold bill in portrait mode for best results</p>
                                            </div>
                                        </button>
                                    )}
                                    <div className={isCameraActive ? 'relative rounded-xl overflow-hidden border border-gray-300 dark:border-gray-600' : 'hidden'}>
                                        <div className="relative" style={{ aspectRatio: '3/4' }}>
                                            <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
                                            <div className="absolute inset-4 pointer-events-none">
                                                <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-white rounded-tl-sm" />
                                                <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-white rounded-tr-sm" />
                                                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-white rounded-bl-sm" />
                                                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-white rounded-br-sm" />
                                            </div>
                                        </div>
                                        <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-3">
                                            <button onClick={capturePhoto} className="w-16 h-16 bg-white rounded-full border-4 border-blue-500 hover:border-blue-600 shadow-lg transition-all hover:scale-105 flex items-center justify-center" title="Capture">
                                                <div className="w-11 h-11 bg-blue-500 rounded-full" />
                                            </button>
                                            <button onClick={stopCamera} className="w-10 h-10 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-all flex items-center justify-center self-center" title="Stop">
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                            </button>
                                        </div>
                                    </div>
                                    <canvas ref={canvasRef} className="hidden" />
                                </div>
                            )}

                            {/* Image preview */}
                            {preview && (
                                <div className="mb-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{activeTab === 'scan' ? 'Captured image:' : 'Preview:'}</p>
                                        {activeTab === 'scan' && (
                                            <button onClick={() => { setFile(null); setPreview(''); }} className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1">
                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                Retake
                                            </button>
                                        )}
                                    </div>
                                    <img src={preview} alt="Bill preview" className="max-h-48 mx-auto rounded-lg border border-gray-300 dark:border-gray-600" />
                                </div>
                            )}

                            {/* OCR Provider picker */}
                            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-xl">
                                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">OCR Engine</p>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <label className={`flex items-center gap-2 flex-1 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${selectedOcrProvider === 'tesseract' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'}`}>
                                        <input type="radio" name="ocrProvider" value="tesseract" checked={selectedOcrProvider === 'tesseract'} onChange={() => setSelectedOcrProvider('tesseract')} className="accent-blue-600" />
                                        <div>
                                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Tesseract</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">Built-in, offline</p>
                                        </div>
                                    </label>
                                    <label className={`flex items-center gap-2 flex-1 px-3 py-2 rounded-lg border transition-colors cursor-pointer ${selectedOcrProvider === 'google_vision' ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30' : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'}`}>
                                        <input type="radio" name="ocrProvider" value="google_vision" checked={selectedOcrProvider === 'google_vision'} onChange={() => { if (!isVisionUser) { router.push('/upgrade'); return } setSelectedOcrProvider('google_vision') }} className="accent-purple-600" />
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Google Vision</p>
                                                {!isVisionUser && <span className="px-1.5 py-0.5 text-xs font-bold bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-full leading-none">AI OCR</span>}
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">{isVisionUser ? 'High accuracy, cloud-based' : 'Add AI OCR (₹500/yr) to unlock'}</p>
                                        </div>
                                    </label>
                                </div>
                                {isVisionUser && visionUsage && (
                                    <div className="mt-2 space-y-1">
                                        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                                            <span>Monthly Vision usage</span>
                                            <span className={`font-semibold ${visionUsage.used >= visionUsage.safeLimit ? 'text-red-500' : 'text-purple-600 dark:text-purple-400'}`}>{visionUsage.used} / {visionUsage.limit}</span>
                                        </div>
                                        <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full transition-all ${visionUsage.used >= visionUsage.safeLimit ? 'bg-red-500' : visionUsage.used >= visionUsage.limit * 0.7 ? 'bg-amber-500' : 'bg-purple-500'}`} style={{ width: `${Math.min(100, (visionUsage.used / visionUsage.limit) * 100)}%` }} />
                                        </div>
                                        {visionUsage.used >= visionUsage.safeLimit && (
                                            <p className="text-xs text-red-500 dark:text-red-400">Limit reached -- Vision OCR paused until the 1st.</p>
                                        )}
                                    </div>
                                )}
                            </div>

                            {error && (
                                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">{error}</div>
                            )}

                            <div className="flex justify-end gap-3">
                                <button onClick={closeModal} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">Cancel</button>
                                <button onClick={processFile} disabled={!file} className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 disabled:from-gray-400 disabled:to-gray-400 text-white rounded-lg font-medium transition-all shadow-md disabled:cursor-not-allowed flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                    Process & Extract Data
                                </button>
                            </div>

                            <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
                                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                                    <strong>Note:</strong> AI-powered bill extraction is in beta. Please verify the extracted data before confirming.
                                </p>
                            </div>
                        </>
                    )}

                    {/* --- STEP 2: PROCESSING --- */}
                    {modalStep === 'processing' && (
                        <div className="py-2">
                            <div className="text-center mb-6">
                                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-sky-500 shadow-lg shadow-blue-500/30 mb-3">
                                    <svg className="animate-spin w-7 h-7 text-white" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                </div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Analyzing your bill</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    {processingStepIdx === 2
                                        ? (aiCacheHit ? '⚡ Loaded from cache (instant)' : `AI analyzing bill${dots}`)
                                        : processingStepIdx === 3 ? 'Structuring data...' : 'Please wait...'}
                                </p>
                            </div>

                            {/* Processing steps */}
                            <div className="space-y-3 mb-6">
                                {PROCESSING_STEPS.map((step, idx) => {
                                    const isDone = processingStepIdx > idx
                                    const isActive = processingStepIdx === idx
                                    return (
                                        <div key={idx} className={`flex items-start gap-3 transition-all duration-500 ${isActive || isDone ? 'opacity-100' : 'opacity-30'}`}>
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-500 ${isDone ? 'bg-green-500 shadow-sm shadow-green-500/40' : isActive ? 'bg-blue-500 shadow-sm shadow-blue-500/40' : 'bg-gray-200 dark:bg-gray-700'}`}>
                                                {isDone ? (
                                                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                ) : isActive ? (
                                                    <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                                                ) : (
                                                    <div className="w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500" />
                                                )}
                                            </div>
                                            <div className="pt-1">
                                                <p className={`text-sm font-semibold leading-tight ${isDone ? 'text-green-700 dark:text-green-400' : isActive ? 'text-blue-700 dark:text-blue-300' : 'text-gray-400 dark:text-gray-500'}`}>
                                                    {step.label}{isActive && idx === 2 ? dots : ''}
                                                </p>
                                                {isActive && (
                                                    <p className="text-xs mt-0.5">
                                                        {idx === 2 && aiCacheHit
                                                            ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">⚡ Result from cache — no API call made</span>
                                                            : <span className="text-gray-500 dark:text-gray-400">{step.sub}</span>
                                                        }
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Skeleton bill preview */}
                            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-800/40 p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="h-3 w-28 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
                                    <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" />
                                </div>
                                {[65, 80, 55, 72].map((w, i) => (
                                    <div key={i} className="flex items-center gap-3 py-2.5 border-b border-gray-100 dark:border-gray-700/50 last:border-0">
                                        <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse flex-shrink-0" />
                                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse" style={{ width: `${w}%` }} />
                                        <div className="h-3 w-8 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse ml-auto flex-shrink-0" />
                                        <div className="h-3 w-14 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse flex-shrink-0" />
                                    </div>
                                ))}
                            </div>

                            <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-3">Typically 5-15 seconds</p>
                        </div>
                    )}

                    {/* --- STEP 3: RESULTS --- */}
                    {modalStep === 'results' && (
                        <div>
                            {extractedProducts.length > 0 ? (
                                <>
                                    {/* Success header */}
                                    <div className="flex items-start gap-3 mb-4 p-3.5 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800">
                                        <div className="w-10 h-10 bg-green-100 dark:bg-green-800/50 rounded-full flex items-center justify-center flex-shrink-0">
                                            <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-green-800 dark:text-green-200">
                                                {extractedProducts.length} product{extractedProducts.length !== 1 ? 's' : ''} extracted
                                            </p>
                                            <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                                                {extractionResult?.matchedCount ?? 0} matched / {extractionResult?.unmatchedCount ?? 0} need review
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                            {extractionResult?.aiParsed && (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-xs font-semibold rounded-full">
                                                    * AI
                                                </span>
                                            )}
                                            <span className="inline-flex items-center px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs rounded-full">
                                                {extractionResult?.ocrProvider === 'google_vision' ? 'Vision' : 'Tesseract'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Items list with staggered animation */}
                                    <div className="space-y-1 max-h-56 overflow-y-auto pr-0.5 mb-4">
                                        {extractedProducts.map((item: any, idx: number) => (
                                            <div
                                                key={idx}
                                                className="flex items-center justify-between px-3 py-2 rounded-lg bg-white dark:bg-gray-800/70 border border-gray-100 dark:border-gray-700/50 bill-item-anim"
                                                style={{ animationDelay: `${idx * 45}ms`, opacity: 0 }}
                                            >
                                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.matched ? 'bg-green-500' : 'bg-orange-400'}`} title={item.matched ? 'Matched' : 'Unmatched'} />
                                                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{item.productName}</span>
                                                    {item.matched && item.matchedProductName && item.matchedProductName !== item.productName && (
                                                        <span className="text-xs text-gray-400 dark:text-gray-500 truncate hidden sm:inline">-&gt; {item.matchedProductName}</span>
                                                    )}
                                                    {item.usedMapping && <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full flex-shrink-0">mapped</span>}
                                                </div>
                                                <div className="flex items-center gap-2.5 flex-shrink-0 ml-2 text-xs text-gray-500 dark:text-gray-400">
                                                    <span className="font-medium">x{item.quantity}</span>
                                                    {item.unitPrice > 0 && <span>Rs.{item.unitPrice.toFixed(2)}</span>}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* OCR text collapsible */}
                                    {extractionResult?.rawExtractedText && extractionResult.rawExtractedText.length > 10 && extractionResult.rawExtractedText !== '__IMAGE_PDF_NO_POPPLER__' && (
                                        <details className="mb-4 group">
                                            <summary className="flex items-center gap-2 cursor-pointer select-none text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 list-none">
                                                <svg className="w-3.5 h-3.5 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                Detected text from bill ({extractionResult.rawExtractedText.length} chars)
                                            </summary>
                                            <pre className="mt-2 text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/60 rounded-lg p-3 overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap break-all border border-gray-200 dark:border-gray-700">
                                                {extractionResult.rawExtractedText}
                                            </pre>
                                        </details>
                                    )}
                                </>
                            ) : (
                                /* No products extracted */
                                <div className="mb-4 p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-xl">
                                    <div className="flex items-start gap-3 mb-2">
                                        <svg className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                        <div>
                                            <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">
                                                AI could not fully parse this bill. Please review the extracted data.
                                            </p>
                                            <p className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
                                                OCR engine used: <span className="font-mono font-medium">{extractionResult?.ocrProvider || 'tesseract'}</span>
                                                {extractionResult?.aiParsed === false && ' - AI parsing was skipped'}
                                            </p>
                                        </div>
                                    </div>
                                    {extractionResult?.rawExtractedText === '__IMAGE_PDF_NO_POPPLER__' ? (
                                        <div className="mt-2 space-y-1">
                                            <p className="text-xs text-orange-800 dark:text-orange-200 font-medium">This PDF is image-based -- no embedded text for Tesseract to read.</p>
                                            <ul className="text-xs text-orange-700 dark:text-orange-300 list-disc list-inside space-y-1 mt-1">
                                                <li>Switch to <strong>Google Vision</strong> (Pro) for image-based PDFs</li>
                                                <li>Use the <strong>Scan / Camera</strong> tab to photograph the bill</li>
                                            </ul>
                                        </div>
                                    ) : extractionResult?.rawExtractedText && extractionResult.rawExtractedText.length > 10 ? (
                                        <details className="mt-2 group">
                                            <summary className="flex items-center gap-1 cursor-pointer select-none text-xs text-orange-700 dark:text-orange-300 hover:underline list-none">
                                                <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                                                Show extracted text ({extractionResult.rawExtractedText.length} chars)
                                            </summary>
                                            <pre className="mt-2 text-xs text-gray-700 dark:text-gray-300 bg-white/70 dark:bg-gray-900/50 rounded-lg p-2 overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap break-all">
                                                {extractionResult.rawExtractedText}
                                            </pre>
                                        </details>
                                    ) : (
                                        <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">No text could be extracted. Try the Camera tab or switch to Google Vision (Pro).</p>
                                    )}
                                </div>
                            )}

                            {/* Action buttons */}
                            <div className="flex justify-between gap-3 mt-2">
                                <button
                                    onClick={() => setModalStep('upload')}
                                    className="flex items-center gap-1.5 px-4 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-sm"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                                    Back
                                </button>
                                <div className="flex gap-2">
                                    <button onClick={closeModal} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-sm">Cancel</button>
                                    {extractedProducts.length > 0 && (
                                        <button onClick={handleConfirmExtraction} className="px-5 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-lg font-medium transition-all shadow-md flex items-center gap-2 text-sm">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                            Confirm & Import ({extractionResult?.matchedCount || 0} matched)
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
