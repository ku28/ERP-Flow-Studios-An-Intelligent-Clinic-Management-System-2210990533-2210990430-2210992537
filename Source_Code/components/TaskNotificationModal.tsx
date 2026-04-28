import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { createPortal } from 'react-dom'

interface TaskNotificationModalProps {
    taskId: number
    title: string
    description?: string
    assignedBy: string
    isProcessing: boolean
    onAccept: () => Promise<void>
    onAddToQueue: () => Promise<void>
}

export default function TaskNotificationModal({
    taskId,
    title,
    description,
    assignedBy,
    isProcessing,
    onAccept,
    onAddToQueue
}: TaskNotificationModalProps) {
    const [isVisible, setIsVisible] = useState(false)
    const router = useRouter()

    useEffect(() => {
        // Trigger entrance animation
        setTimeout(() => setIsVisible(true), 10)

        // Play notification sound using Web Audio API
        const playSound = () => {
            try {
                // Create audio context
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
                if (!AudioContextClass) {
                    return
                }
                
                const audioContext = new AudioContextClass()
                
                // Create two-tone notification sound
                const playTone = (frequency: number, startTime: number, duration: number) => {
                    const oscillator = audioContext.createOscillator()
                    const gainNode = audioContext.createGain()
                    
                    oscillator.connect(gainNode)
                    gainNode.connect(audioContext.destination)
                    
                    oscillator.frequency.value = frequency
                    oscillator.type = 'sine'
                    
                    // Envelope for smooth sound
                    gainNode.gain.setValueAtTime(0, startTime)
                    gainNode.gain.linearRampToValueAtTime(0.3, startTime + 0.01)
                    gainNode.gain.linearRampToValueAtTime(0, startTime + duration)
                    
                    oscillator.start(startTime)
                    oscillator.stop(startTime + duration)
                }
                
                // Play two tones for a pleasant notification sound
                const now = audioContext.currentTime
                playTone(800, now, 0.15)  // First beep
                playTone(1000, now + 0.15, 0.15)  // Second beep
                
            } catch (error) {
            }
        }
        
        // Play immediately
        playSound()
    }, [])

    const handleAccept = async () => {
        if (isProcessing) return
        await onAccept()
        router.push('/tasks')
    }

    const handleAddToQueue = async () => {
        if (isProcessing) return
        await onAddToQueue()
    }

    const modal = (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            {/* Animated modal with blue theme and blinking effect */}
            <div 
                className={`relative max-w-md w-full bg-gradient-to-br from-blue-900/95 via-sky-900/95 to-cyan-900/95 border-2 border-blue-400/50 rounded-2xl shadow-2xl backdrop-blur-xl transition-all duration-500 animate-blink ${
                    isVisible ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
                }`}
                style={{
                    boxShadow: '0 0 40px rgba(59,130,246, 0.3), 0 0 80px rgba(59,130,246, 0.2)'
                }}
            >
                {/* Glowing border effect */}
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-400 via-sky-400 to-cyan-400 rounded-2xl opacity-20 blur-sm animate-pulse"></div>
                
                <div className="relative p-6">
                    {/* Alert icon with animation */}
                    <div className="flex justify-center mb-4">
                        <div className="relative">
                            <div className="absolute inset-0 bg-blue-500/30 rounded-full blur-xl animate-ping"></div>
                            <div className="relative w-16 h-16 bg-gradient-to-br from-blue-400 to-sky-500 rounded-full flex items-center justify-center shadow-lg">
                                <svg className="w-10 h-10 text-white animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* Title */}
                    <h2 className="text-2xl font-bold text-center mb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-200 via-sky-200 to-cyan-200 animate-pulse">
                        New Task Assigned!
                    </h2>

                    {/* Task details */}
                    <div className="space-y-3 mb-6">
                        <div className="bg-black/30 border border-blue-500/30 rounded-lg p-4">
                            <h3 className="text-blue-300 font-semibold mb-1 text-lg">{title}</h3>
                            {description && (
                                <p className="text-blue-200/80 text-sm">{description}</p>
                            )}
                        </div>
                        
                        <div className="flex items-center gap-2 text-blue-300/90 text-sm">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <span>Assigned by: <span className="font-semibold text-blue-200">{assignedBy}</span></span>
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={handleAccept}
                            disabled={isProcessing}
                            className="flex-1 bg-gradient-to-r from-blue-500 to-sky-600 hover:from-blue-600 hover:to-sky-700 text-white font-semibold py-3 px-6 rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                        >
                            {isProcessing ? (
                                <>
                                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    Accept
                                </>
                            )}
                        </button>
                        <button
                            onClick={handleAddToQueue}
                            disabled={isProcessing}
                            className="flex-1 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 font-semibold py-3 px-6 rounded-lg border-2 border-blue-500/50 hover:border-blue-400 transform hover:scale-105 transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                        >
                            {isProcessing ? (
                                <>
                                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    Add to Queue
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <style jsx>{`
                @keyframes blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
                .animate-blink {
                    animation: blink 1.5s ease-in-out infinite;
                }
            `}</style>
        </div>
    )

    return typeof document !== 'undefined' ? createPortal(modal, document.body) : null
}



