/**
 * ElectronVoiceInput — Reusable speech-to-text module for Electron renderer
 *
 * Uses Web Speech API (available in Chromium-based Electron) with enhancements:
 *   - Configurable silence auto-stop
 *   - Continuous auto-restart (keeps listening until explicitly stopped)
 *   - Visibility-based pause/resume (avoids orphaned recognizers in hidden windows)
 *   - Clinical entity parsing via parseClinicalSpeech
 *   - Static isSupported() check for pre-instantiation validation
 *   - Clean destroy() lifecycle
 *
 * Does NOT use any paid APIs — purely browser-native speech recognition.
 */

import { ParsedClinicalSpeech, parseClinicalSpeech } from './parseClinicalSpeech'

/* ------------------------------------------------------------------ */
/*  Type declarations (Web Speech API)                                 */
/* ------------------------------------------------------------------ */

interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList
    resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
    error: string
}

interface SpeechRecognitionInstance extends EventTarget {
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
}

/* ------------------------------------------------------------------ */
/*  Public types                                                       */
/* ------------------------------------------------------------------ */

export type VoiceInputState = 'idle' | 'listening' | 'stopped'

export interface ElectronVoiceInputCallbacks {
    /** Called with the combined live transcript (committed + interim) on every update */
    onLiveText: (text: string) => void
    /** Called when the recognizer state changes */
    onStateChange?: (state: VoiceInputState) => void
    /** Called when an error occurs */
    onError?: (message: string) => void
    /** Called when speech ends with parsed clinical entities */
    onParsed?: (parsed: ParsedClinicalSpeech) => void
}

export interface ElectronVoiceInputOptions {
    /** BCP-47 language tag (default: 'en-IN') */
    language?: string
    /** Auto-stop after this many ms of silence. 0 = disabled. (default: 0) */
    silenceTimeoutMs?: number
    /** Keep recognition alive until explicitly stopped (default: true) */
    continuous?: boolean
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getSpeechRecognition(): (new () => SpeechRecognitionInstance) | null {
    if (typeof window === 'undefined') return null
    const win = window as Window & {
        SpeechRecognition?: new () => SpeechRecognitionInstance
        webkitSpeechRecognition?: new () => SpeechRecognitionInstance
    }
    return win.SpeechRecognition || win.webkitSpeechRecognition || null
}

function mergeParts(...parts: string[]): string {
    return parts
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
}

/* ------------------------------------------------------------------ */
/*  Main class                                                         */
/* ------------------------------------------------------------------ */

export class ElectronVoiceInput {
    private callbacks: ElectronVoiceInputCallbacks
    private language: string
    private silenceTimeoutMs: number
    private continuousMode: boolean
    private recognition: SpeechRecognitionInstance | null = null
    private state: VoiceInputState = 'idle'
    private finalText = ''
    private intentionalStop = false
    private silenceTimer: ReturnType<typeof setTimeout> | null = null
    private visibilityHandler: (() => void) | null = null
    private wasListeningBeforeHide = false

    constructor(callbacks: ElectronVoiceInputCallbacks, options: ElectronVoiceInputOptions = {}) {
        this.callbacks = callbacks
        this.language = options.language || 'en-IN'
        this.silenceTimeoutMs = options.silenceTimeoutMs || 0
        this.continuousMode = options.continuous !== false
    }

    /** Check if speech recognition is available before instantiating */
    static isSupported(): boolean {
        return !!getSpeechRecognition()
    }

    /** Start speech recognition */
    start() {
        if (this.state === 'listening') return

        const SR = getSpeechRecognition()
        if (!SR) {
            this.callbacks.onError?.('Speech recognition is not available in this Electron renderer.')
            return
        }

        this.intentionalStop = false
        this.startBrowserSpeech(SR)
        this.attachVisibilityGuard()
    }

    /** Stop speech recognition (intentional) */
    stop() {
        this.intentionalStop = true
        this.clearSilenceTimer()

        if (this.recognition) {
            try { this.recognition.stop() } catch { /* ignore */ }
        }

        this.updateState('stopped')
    }

    /** Full cleanup — call when the component/module is no longer needed */
    destroy() {
        this.stop()
        this.detachVisibilityGuard()

        if (this.recognition) {
            this.recognition.onresult = null
            this.recognition.onerror = null
            this.recognition.onend = null
            try { this.recognition.abort() } catch { /* ignore */ }
            this.recognition = null
        }

        this.finalText = ''
        this.updateState('idle')
    }

    /* ---- Private methods ---- */

    private startBrowserSpeech(SR: new () => SpeechRecognitionInstance) {
        if (this.recognition) {
            try { this.recognition.abort() } catch { /* ignore */ }
        }

        this.finalText = ''
        const recognition = new SR()
        this.recognition = recognition

        recognition.lang = this.language
        recognition.continuous = this.continuousMode
        recognition.interimResults = true
        recognition.maxAlternatives = 1

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            let interim = ''
            let finalChunk = ''

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const part = event.results[i][0]?.transcript || ''
                if (event.results[i].isFinal) finalChunk = mergeParts(finalChunk, part)
                else interim = mergeParts(interim, part)
            }

            if (finalChunk) this.finalText = mergeParts(this.finalText, finalChunk)
            this.callbacks.onLiveText(mergeParts(this.finalText, interim))

            // Reset silence timer on any speech activity
            this.resetSilenceTimer()
        }

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            const code = String(event.error || '').toLowerCase()

            // Transient non-errors — don't surface
            if (code === 'no-speech' || code === 'aborted') return

            // In Electron, 'not-allowed'/'service-not-allowed' often fire
            // even though the main process already granted media permissions.
            // Treat these as transient service issues, not real errors.
            if (code === 'not-allowed' || code === 'service-not-allowed') {
                // Just log to console for debugging; don't break UX
                return
            }

            this.callbacks.onError?.(`Speech error: ${event.error || 'unknown'}`)
            this.updateState('stopped')
        }

        recognition.onend = () => {
            this.clearSilenceTimer()

            // If continuous mode and not intentionally stopped, auto-restart
            if (this.continuousMode && !this.intentionalStop) {
                try {
                    recognition.start()
                    return
                } catch {
                    // Fall through to stopped state
                }
            }

            if (this.finalText) {
                this.callbacks.onParsed?.(parseClinicalSpeech(this.finalText))
            }
            this.updateState('stopped')
        }

        try {
            recognition.start()
            this.updateState('listening')
            this.resetSilenceTimer()
        } catch {
            this.callbacks.onError?.('Failed to start speech recognition.')
            this.updateState('stopped')
        }
    }

    private resetSilenceTimer() {
        this.clearSilenceTimer()
        if (this.silenceTimeoutMs > 0) {
            this.silenceTimer = setTimeout(() => {
                this.stop()
            }, this.silenceTimeoutMs)
        }
    }

    private clearSilenceTimer() {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer)
            this.silenceTimer = null
        }
    }

    /**
     * Visibility guard: when the Electron window is hidden (e.g., minimized,
     * another app focused), pause speech recognition to avoid orphaned
     * recognizers consuming resources. Resume when the window becomes visible again.
     */
    private attachVisibilityGuard() {
        if (typeof document === 'undefined') return
        if (this.visibilityHandler) return // Already attached

        this.visibilityHandler = () => {
            if (document.visibilityState === 'hidden') {
                if (this.state === 'listening') {
                    this.wasListeningBeforeHide = true
                    this.intentionalStop = true
                    try { this.recognition?.stop() } catch { /* ignore */ }
                }
            } else if (document.visibilityState === 'visible') {
                if (this.wasListeningBeforeHide) {
                    this.wasListeningBeforeHide = false
                    this.start() // Resume listening
                }
            }
        }

        document.addEventListener('visibilitychange', this.visibilityHandler)
    }

    private detachVisibilityGuard() {
        if (this.visibilityHandler && typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', this.visibilityHandler)
            this.visibilityHandler = null
        }
    }

    private updateState(next: VoiceInputState) {
        this.state = next
        this.callbacks.onStateChange?.(next)
    }
}
