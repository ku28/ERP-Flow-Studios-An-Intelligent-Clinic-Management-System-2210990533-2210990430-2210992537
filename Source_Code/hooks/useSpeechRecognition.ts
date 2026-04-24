/**
 * useSpeechRecognition — Shared hook for Web Speech API
 *
 * Encapsulates browser speech recognition with:
 *   - Auto-detection of SpeechRecognition support
 *   - Real-time interim + final text accumulation
 *   - Configurable silence auto-stop
 *   - Categorized error handling
 *   - Safe cleanup on unmount (no memory leaks)
 *
 * This is the single source of truth for speech recognition across
 * VoiceInput, VoiceMicButton, and ElectronVoiceInput.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

/* ------------------------------------------------------------------ */
/*  Type declarations for the Web Speech API                          */
/* ------------------------------------------------------------------ */

export interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList
    resultIndex: number
}

export interface SpeechRecognitionErrorEvent extends Event {
    error: string
    message?: string
}

export interface SpeechRecognitionInstance extends EventTarget {
    lang: string
    interimResults: boolean
    continuous: boolean
    maxAlternatives: number
    start(): void
    stop(): void
    abort(): void
    onresult: ((event: SpeechRecognitionEvent) => void) | null
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
    onend: (() => void) | null
    onstart: (() => void) | null
    onspeechstart?: (() => void) | null
}

/* ------------------------------------------------------------------ */
/*  Utility helpers                                                    */
/* ------------------------------------------------------------------ */

/** Merge transcript parts, collapsing whitespace */
export function mergeTranscript(...parts: string[]): string {
    return parts
        .map((p) => String(p || '').trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
}

/** Resolve the browser's SpeechRecognition constructor (webkit-prefixed or standard) */
export function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
    if (typeof window === 'undefined') return null
    const win = window as Window & {
        SpeechRecognition?: new () => SpeechRecognitionInstance
        webkitSpeechRecognition?: new () => SpeechRecognitionInstance
    }
    return win.SpeechRecognition || win.webkitSpeechRecognition || null
}

/** Check if the current environment is Electron (desktop app) */
export function isElectronEnvironment(): boolean {
    return typeof window !== 'undefined' && !!(window as any).electronAPI
}

/** Check if the current environment is Capacitor (native mobile) */
export function isCapacitorEnvironment(): boolean {
    if (typeof window === 'undefined') return false
    const cap = (window as any).Capacitor
    return !!cap && typeof cap.getPlatform === 'function' && cap.getPlatform() !== 'web'
}

/* ------------------------------------------------------------------ */
/*  Error categories                                                   */
/* ------------------------------------------------------------------ */

export type SpeechErrorCategory =
    | 'permission-denied'
    | 'no-speech'
    | 'network'
    | 'service-unavailable'
    | 'aborted'
    | 'unknown'

export function categorizeSpeechError(errorCode: string): SpeechErrorCategory {
    const code = String(errorCode || '').toLowerCase()
    if (code === 'not-allowed' || code === 'service-not-allowed') return 'permission-denied'
    if (code === 'no-speech') return 'no-speech'
    if (code === 'network' || code === 'audio-capture') return 'network'
    if (code === 'aborted') return 'aborted'
    return 'unknown'
}

export function getErrorMessage(category: SpeechErrorCategory): string {
    switch (category) {
        case 'permission-denied':
            return 'Microphone permission denied. Please enable mic access and try again.'
        case 'no-speech':
            return 'No speech detected. Try speaking closer to the microphone.'
        case 'network':
            return 'Speech service network issue. Please retry.'
        case 'service-unavailable':
            return 'Speech recognition unavailable. Please try again.'
        case 'aborted':
            return '' // Silent — user initiated
        default:
            return 'Speech recognition failed. Please try again.'
    }
}

/* ------------------------------------------------------------------ */
/*  Hook options & return types                                        */
/* ------------------------------------------------------------------ */

export interface UseSpeechRecognitionOptions {
    /** BCP-47 language tag (default: 'en-IN') */
    language?: string
    /** Keep recognition alive until explicitly stopped (default: true) */
    continuous?: boolean
    /** Auto-stop after this many ms of silence. 0 = disabled. (default: 0) */
    silenceTimeoutMs?: number
}

export interface UseSpeechRecognitionReturn {
    /** Whether the Web Speech API is available in this browser */
    isSupported: boolean
    /** Whether recognition is currently active */
    isListening: boolean
    /** All finalized (confirmed) text so far in this session */
    committedText: string
    /** Current interim (unconfirmed, still changing) transcript */
    interimText: string
    /** Combined display text: committed + interim */
    liveText: string
    /** Human-readable status/error message */
    statusMessage: string
    /** Whether any speech has been detected this session */
    speechDetected: boolean
    /** Start a new recognition session */
    start: () => void
    /** Stop the current recognition session */
    stop: () => void
    /** Reset all transcript state */
    reset: () => void
}

/* ------------------------------------------------------------------ */
/*  Hook implementation                                                */
/* ------------------------------------------------------------------ */

export function useSpeechRecognition(
    options: UseSpeechRecognitionOptions = {}
): UseSpeechRecognitionReturn {
    const {
        language = 'en-IN',
        continuous = true,
        silenceTimeoutMs = 0,
    } = options

    const [isSupported, setIsSupported] = useState(false)
    const [isListening, setIsListening] = useState(false)
    const [committedText, setCommittedText] = useState('')
    const [interimText, setInterimText] = useState('')
    const [statusMessage, setStatusMessage] = useState('')
    const [speechDetected, setSpeechDetected] = useState(false)

    const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
    const committedRef = useRef('')
    const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const intentionalStopRef = useRef(false)

    // Detect support on mount
    useEffect(() => {
        setIsSupported(!!getSpeechRecognition())
    }, [])

    // Reset silence timer whenever new speech comes in
    const resetSilenceTimer = useCallback(() => {
        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current)
            silenceTimerRef.current = null
        }
        if (silenceTimeoutMs > 0) {
            silenceTimerRef.current = setTimeout(() => {
                // Auto-stop after silence
                intentionalStopRef.current = true
                try { recognitionRef.current?.stop() } catch { /* ignore */ }
            }, silenceTimeoutMs)
        }
    }, [silenceTimeoutMs])

    const cleanupRecognizer = useCallback(() => {
        if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current)
            silenceTimerRef.current = null
        }
        const rec = recognitionRef.current
        if (!rec) return
        rec.onresult = null
        rec.onerror = null
        rec.onend = null
        rec.onstart = null
        ;(rec as any).onspeechstart = null
        try { rec.abort() } catch { /* ignore */ }
        recognitionRef.current = null
    }, [])

    const reset = useCallback(() => {
        committedRef.current = ''
        setCommittedText('')
        setInterimText('')
        setStatusMessage('')
        setSpeechDetected(false)
    }, [])

    const stop = useCallback(() => {
        intentionalStopRef.current = true
        try { recognitionRef.current?.stop() } catch { /* ignore */ }
    }, [])

    const start = useCallback(() => {
        const SR = getSpeechRecognition()
        if (!SR) {
            setStatusMessage('Speech-to-text is not supported in this browser.')
            return
        }

        // Clean up any previous session
        cleanupRecognizer()
        committedRef.current = ''
        setCommittedText('')
        setInterimText('')
        setSpeechDetected(false)
        intentionalStopRef.current = false

        const recognition = new SR()
        recognitionRef.current = recognition

        recognition.lang = language
        recognition.continuous = continuous
        recognition.interimResults = true
        recognition.maxAlternatives = 1

        recognition.onstart = () => {
            setIsListening(true)
            setStatusMessage('Listening...')
        }

        ;(recognition as any).onspeechstart = () => {
            setSpeechDetected(true)
        }

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            let interim = ''
            let finalChunk = ''

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const segment = event.results[i][0]?.transcript || ''
                if (event.results[i].isFinal) {
                    finalChunk = mergeTranscript(finalChunk, segment)
                } else {
                    interim = mergeTranscript(interim, segment)
                }
            }

            if (finalChunk) {
                committedRef.current = mergeTranscript(committedRef.current, finalChunk)
                setCommittedText(committedRef.current)
            }

            setInterimText(interim)
            if (finalChunk || interim) setSpeechDetected(true)

            // Reset silence auto-stop timer on any speech activity
            resetSilenceTimer()
        }

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            const code = String(event.error || '').toLowerCase()

            // In Electron/Capacitor, 'not-allowed' and 'service-not-allowed' errors
            // frequently fire despite permissions being granted. The underlying
            // Chromium speech service uses Google's servers and can transiently fail.
            // Skip these errors in embedded contexts to avoid showing misleading UI.
            if (isElectronEnvironment() || isCapacitorEnvironment()) {
                if (code === 'not-allowed' || code === 'service-not-allowed') {
                    // Treat as a transient service hiccup, not a real permission block
                    return
                }
            }

            // 'no-speech' and 'aborted' are not real errors — don't surface them
            if (code === 'no-speech' || code === 'aborted') return

            const category = categorizeSpeechError(code)
            const message = getErrorMessage(category)
            if (message) setStatusMessage(message)
            setIsListening(false)
        }

        recognition.onend = () => {
            if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current)
                silenceTimerRef.current = null
            }

            // If continuous mode and not intentionally stopped, auto-restart
            if (continuous && !intentionalStopRef.current) {
                try {
                    recognition.start()
                    return
                } catch {
                    // Fall through to stopped state
                }
            }

            setIsListening(false)
            setInterimText('')
            if (!committedRef.current && !intentionalStopRef.current) {
                setStatusMessage('No speech captured.')
            }
        }

        setStatusMessage('Listening...')

        try {
            recognition.start()
            resetSilenceTimer()
        } catch {
            setIsListening(false)
            setStatusMessage('Unable to start microphone. Please retry.')
        }
    }, [cleanupRecognizer, continuous, language, resetSilenceTimer])

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanupRecognizer()
        }
    }, [cleanupRecognizer])

    const liveText = mergeTranscript(committedText, interimText)

    return {
        isSupported,
        isListening,
        committedText,
        interimText,
        liveText,
        statusMessage,
        speechDetected,
        start,
        stop,
        reset,
    }
}
