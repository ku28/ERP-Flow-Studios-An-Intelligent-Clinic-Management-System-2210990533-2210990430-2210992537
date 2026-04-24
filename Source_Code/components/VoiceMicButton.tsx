/**
 * VoiceMicButton — Floating Action Button for speech-to-text dictation
 *
 * A global FAB that appears when any text input/textarea is focused.
 * Dictated text is injected into the focused field at the cursor position.
 *
 * Supports:
 *   - Browser Web Speech API (web + Electron)
 *   - Capacitor SpeechRecognition plugin (Android native)
 *   - Hold-to-talk (touch) and click-toggle (mouse/desktop)
 *   - Real-time interim + final transcript
 *   - Animated pulse rings, speech wave dots, and glassmorphic tooltip
 *
 * Permission handling:
 *   - In Electron: trusts the main process permission handler, no pre-check
 *   - In Capacitor Android: uses plugin permission API, no browser pre-check
 *   - In regular browsers: uses navigator.permissions.query + getUserMedia
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
    getSpeechRecognition,
    mergeTranscript,
    isElectronEnvironment,
    isCapacitorEnvironment,
} from '../hooks/useSpeechRecognition'
import type {
    SpeechRecognitionInstance,
    SpeechRecognitionEvent,
    SpeechRecognitionErrorEvent,
} from '../hooks/useSpeechRecognition'

/* ------------------------------------------------------------------ */
/*  Global type declarations                                           */
/* ------------------------------------------------------------------ */

declare global {
    interface Window {
        SpeechRecognition: new () => SpeechRecognitionInstance
        webkitSpeechRecognition: new () => SpeechRecognitionInstance
        Capacitor?: {
            getPlatform?: () => string
            Plugins?: {
                App?: { getInfo?: () => Promise<{ version?: string }> }
                SpeechRecognition?: any
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Permission helpers                                                 */
/* ------------------------------------------------------------------ */

type MicPermissionState = 'granted' | 'denied' | 'prompt' | 'unknown'

async function getMicrophonePermissionState(): Promise<MicPermissionState> {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown'
    try {
        const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName })
        return permission.state
    } catch {
        return 'unknown'
    }
}

/* ------------------------------------------------------------------ */
/*  DOM injection helpers                                              */
/* ------------------------------------------------------------------ */

type DictationInputElement = HTMLInputElement | HTMLTextAreaElement

function isTextSelectableInputType(input: HTMLInputElement): boolean {
    const type = String(input.type || 'text').toLowerCase()
    return type === 'text' || type === 'search' || type === 'url' || type === 'tel' || type === 'password' || type === 'email'
}

function isDictationInputElement(el: HTMLElement | null): el is DictationInputElement {
    if (!el) return false
    if (el instanceof HTMLTextAreaElement) return true
    if (el instanceof HTMLInputElement) return isTextSelectableInputType(el)
    return false
}

function isVoiceTargetElement(el: EventTarget | null): el is HTMLElement {
    if (!el || !(el instanceof HTMLElement)) return false
    const tag = el.tagName.toLowerCase()
    if (tag === 'input') {
        const type = (el as HTMLInputElement).type.toLowerCase()
        const excluded = ['checkbox', 'radio', 'file', 'submit', 'button', 'reset', 'image', 'range', 'color']
        return !excluded.includes(type)
    }
    if (tag === 'textarea') return true
    if (el.isContentEditable) return true
    return false
}

function setInputElementValue(el: DictationInputElement, nextValue: string, caretPos: number) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        el instanceof HTMLInputElement
            ? window.HTMLInputElement.prototype
            : window.HTMLTextAreaElement.prototype,
        'value'
    )?.set

    if (nativeInputValueSetter) {
        nativeInputValueSetter.call(el, nextValue)
    } else {
        el.value = nextValue
    }

    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))

    try {
        el.setSelectionRange(caretPos, caretPos)
    } catch {
        // Some browser/input combos reject caret updates; keep text update.
    }
}

function injectTextIntoElement(el: HTMLElement, text: string) {
    if (el.isContentEditable) {
        const current = String(el.textContent || '')
        const separator = current.length && !current.endsWith(' ') ? ' ' : ''
        el.textContent = `${current}${separator}${text}`
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        return
    }

    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return

    const supportsCaret = !(el instanceof HTMLInputElement) || isTextSelectableInputType(el)
    const start = supportsCaret ? (el.selectionStart ?? el.value.length) : el.value.length
    const end = supportsCaret ? (el.selectionEnd ?? el.value.length) : el.value.length
    const before = el.value.substring(0, start)
    const after = el.value.substring(end)
    const separator = before.length && !before.endsWith(' ') ? ' ' : ''
    const newValue = before + separator + text
    const newEnd = newValue.length

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        el instanceof HTMLInputElement
            ? window.HTMLInputElement.prototype
            : window.HTMLTextAreaElement.prototype,
        'value'
    )?.set

    if (nativeInputValueSetter) {
        nativeInputValueSetter.call(el, newValue + after)
    } else {
        el.value = newValue + after
    }

    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    if (supportsCaret) {
        try {
            el.setSelectionRange(newEnd, newEnd)
        } catch {
            // Some input types reject selection updates.
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Text merge helpers                                                 */
/* ------------------------------------------------------------------ */

function appendOrReplaceRecognized(current: string, incoming: string): string {
    const prev = String(current || '').trim()
    const next = String(incoming || '').trim()
    if (!next) return prev
    if (!prev) return next
    if (next === prev) return prev
    if (next.startsWith(prev)) return next
    if (prev.startsWith(next)) return prev
    if (prev.endsWith(next)) return prev
    return mergeTranscript(prev, next)
}

function combineCommittedAndInterim(committed: string, interim: string): string {
    const finalText = String(committed || '').trim()
    const interimText = String(interim || '').trim()
    if (!interimText) return finalText
    if (!finalText) return interimText
    if (interimText.startsWith(finalText)) return interimText
    if (finalText.startsWith(interimText)) return finalText
    return mergeTranscript(finalText, interimText)
}

function extractSpeechText(payload: any): string {
    const candidates: string[] = []
    if (Array.isArray(payload?.matches) && payload.matches.length > 0) {
        candidates.push(String(payload.matches[0] || ''))
    }
    candidates.push(
        String(payload?.value || ''),
        String(payload?.text || ''),
        String(payload?.transcript || ''),
        String(payload?.partial || '')
    )
    return candidates.map((entry) => entry.trim()).find(Boolean) || ''
}

function resolveCapacitorListeningState(data: any): boolean | null {
    const status = String(data?.status || '').toLowerCase()
    if (status === 'started') return true
    if (status === 'stopped') return false
    if (typeof data?.listening === 'boolean') return data.listening
    return null
}

/* ------------------------------------------------------------------ */
/*  Live indicator styles (applied directly to focused input)          */
/* ------------------------------------------------------------------ */

interface LiveIndicatorStyleSnapshot {
    outline: string
    outlineOffset: string
    backgroundImage: string
    backgroundRepeat: string
    backgroundSize: string
    backgroundPosition: string
    paddingRight: string
}

interface DictationSnapshot {
    el: DictationInputElement
    before: string
    after: string
    separator: string
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

interface VoiceMicButtonProps {
    leftOffset?: string
    bottomOffset?: string
}

type SttProvider = 'browser' | 'capacitor-android' | 'none'

export default function VoiceMicButton({ leftOffset, bottomOffset }: VoiceMicButtonProps = {}) {
    const HOLD_THRESHOLD_MS = 500

    const [provider, setProvider] = useState<SttProvider>('none')
    const [supported, setSupported] = useState(false)
    const [listening, setListening] = useState(false)
    const [activeEl, setActiveEl] = useState<HTMLElement | null>(null)
    const [showHint, setShowHint] = useState(false)
    const [status, setStatus] = useState<'idle' | 'listening' | 'processing'>('idle')
    const [transcript, setTranscript] = useState('')
    const [speechDetected, setSpeechDetected] = useState(false)
    const [permissionDenied, setPermissionDenied] = useState(false)
    const [serviceUnavailable, setServiceUnavailable] = useState(false)

    const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
    const activeProviderRef = useRef<SttProvider>('none')
    const capacitorSpeechRef = useRef<any>(null)
    const capacitorListenersRef = useRef<any[]>([])
    const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const holdStartedAtRef = useRef<number | null>(null)
    const isHoldRef = useRef(false)
    const listeningRef = useRef(false)
    const activeElRef = useRef<HTMLElement | null>(null)
    const lastEditableElRef = useRef<HTMLElement | null>(null)
    const micPointerDownRef = useRef(false)
    const suppressNextClickRef = useRef(false)
    const dictationSnapshotRef = useRef<DictationSnapshot | null>(null)
    const browserCommittedRef = useRef('')
    const browserInterimRef = useRef('')
    const capacitorCommittedRef = useRef('')
    const capacitorInterimRef = useRef('')
    const liveIndicatorElRef = useRef<DictationInputElement | null>(null)
    const liveIndicatorStyleRef = useRef<LiveIndicatorStyleSnapshot | null>(null)

    useEffect(() => { listeningRef.current = listening }, [listening])
    useEffect(() => { activeProviderRef.current = provider }, [provider])
    useEffect(() => { activeElRef.current = activeEl }, [activeEl])

    const isNativeAndroid = typeof window !== 'undefined' && !!(window as any).Capacitor && (window as any).Capacitor?.getPlatform?.() === 'android'

    const permissionHelpText = isNativeAndroid
        ? 'Mic blocked. Open app settings, then allow Microphone permission.'
        : 'Mic blocked. Allow microphone in site/app permissions, then try again.'

    const speechServiceHelpText = isNativeAndroid
        ? 'Voice recognition service is unavailable on this device. Update Android System WebView/Google app, or use keyboard voice input.'
        : 'Voice recognition service is temporarily unavailable. Please try again.'

    // ---- Provider detection ----
    useEffect(() => {
        if (typeof window === 'undefined') {
            setProvider('none')
            setSupported(false)
            return
        }

        const platform = String(window.Capacitor?.getPlatform?.() || '').toLowerCase()
        const isAndroid = platform === 'android'
        const capSpeech = window.Capacitor?.Plugins?.SpeechRecognition

        if (isAndroid && capSpeech?.start && capSpeech?.stop) {
            capacitorSpeechRef.current = capSpeech
            setProvider('capacitor-android')
            setSupported(true)
            return
        }

        const browserAvailable = !!getSpeechRecognition()
        if (browserAvailable) {
            setProvider('browser')
            setSupported(true)
            return
        }

        setProvider('none')
        setSupported(false)
    }, [])

    // ---- Focus tracking ----
    useEffect(() => {
        const isInputLike = (el: EventTarget | null): el is HTMLElement => isVoiceTargetElement(el)

        const onFocusIn = (e: FocusEvent) => {
            if (isInputLike(e.target)) {
                const target = e.target as HTMLElement
                setActiveEl(target)
                lastEditableElRef.current = target
                setShowHint(true)
            }
        }

        const onFocusOut = (e: FocusEvent) => {
            const related = e.relatedTarget as HTMLElement | null
            if (related?.closest('[data-voice-mic-button]')) return
            setShowHint(false)

            setTimeout(() => {
                if (micPointerDownRef.current || listeningRef.current) return
                const focused = document.activeElement as HTMLElement | null
                if (!isInputLike(focused)) {
                    setActiveEl(null)
                }
            }, 0)
        }

        document.addEventListener('focusin', onFocusIn)
        document.addEventListener('focusout', onFocusOut)
        return () => {
            document.removeEventListener('focusin', onFocusIn)
            document.removeEventListener('focusout', onFocusOut)
        }
    }, [])

    // ---- Live indicator (red outline on focused input during dictation) ----
    const clearInputLiveIndicator = useCallback(() => {
        const el = liveIndicatorElRef.current
        const saved = liveIndicatorStyleRef.current
        if (el && saved) {
            el.style.outline = saved.outline
            el.style.outlineOffset = saved.outlineOffset
            el.style.backgroundImage = saved.backgroundImage
            el.style.backgroundRepeat = saved.backgroundRepeat
            el.style.backgroundSize = saved.backgroundSize
            el.style.backgroundPosition = saved.backgroundPosition
            el.style.paddingRight = saved.paddingRight
        }
        liveIndicatorElRef.current = null
        liveIndicatorStyleRef.current = null
    }, [])

    const applyInputLiveIndicator = useCallback((el: DictationInputElement) => {
        if (liveIndicatorElRef.current === el) return
        clearInputLiveIndicator()

        liveIndicatorElRef.current = el
        liveIndicatorStyleRef.current = {
            outline: el.style.outline,
            outlineOffset: el.style.outlineOffset,
            backgroundImage: el.style.backgroundImage,
            backgroundRepeat: el.style.backgroundRepeat,
            backgroundSize: el.style.backgroundSize,
            backgroundPosition: el.style.backgroundPosition,
            paddingRight: el.style.paddingRight,
        }

        el.style.outline = '2px solid rgba(239, 68, 68, 0.78)'
        el.style.outlineOffset = '1px'
        el.style.backgroundImage = 'radial-gradient(circle at center, rgba(239,68,68,1) 0 45%, rgba(239,68,68,0.25) 46% 100%)'
        el.style.backgroundRepeat = 'no-repeat'
        el.style.backgroundSize = '10px 10px'
        el.style.backgroundPosition = 'right 10px center'

        const computedPaddingRight = Number.parseFloat(window.getComputedStyle(el).paddingRight || '0')
        if (!Number.isNaN(computedPaddingRight) && computedPaddingRight < 24) {
            el.style.paddingRight = '24px'
        }
    }, [clearInputLiveIndicator])

    // ---- Resolve which element to inject text into ----
    const resolveVoiceTargetElement = useCallback((): HTMLElement | null => {
        const activeDocEl = typeof document !== 'undefined' && isVoiceTargetElement(document.activeElement)
            ? (document.activeElement as HTMLElement)
            : null

        const candidates = [activeElRef.current, lastEditableElRef.current, activeDocEl]
        for (const candidate of candidates) {
            if (!candidate || !candidate.isConnected) continue
            if (!isVoiceTargetElement(candidate)) continue
            lastEditableElRef.current = candidate
            return candidate
        }
        return null
    }, [])

    // ---- Dictation session management ----
    const beginDictationSession = useCallback(() => {
        const el = resolveVoiceTargetElement()
        if (!isDictationInputElement(el)) {
            dictationSnapshotRef.current = null
            return
        }

        let start = el.value.length
        let end = el.value.length
        try {
            start = el.selectionStart ?? el.value.length
            end = el.selectionEnd ?? el.value.length
        } catch {
            start = el.value.length
            end = el.value.length
        }

        const before = el.value.substring(0, start)
        const after = el.value.substring(end)
        const separator = before.length && !before.endsWith(' ') ? ' ' : ''

        dictationSnapshotRef.current = { el, before, after, separator }
        applyInputLiveIndicator(el)
    }, [applyInputLiveIndicator, resolveVoiceTargetElement])

    const applyDictationText = useCallback((spokenText: string) => {
        if (!dictationSnapshotRef.current || !dictationSnapshotRef.current.el.isConnected) {
            beginDictationSession()
        }
        const snap = dictationSnapshotRef.current
        if (!snap) return

        const cleaned = String(spokenText || '').trim()
        const composed = `${snap.before}${snap.separator}${cleaned}${snap.after}`
        const caretPos = (snap.before + snap.separator + cleaned).length
        setInputElementValue(snap.el, composed, caretPos)
    }, [beginDictationSession])

    const clearDictationSession = useCallback(() => {
        dictationSnapshotRef.current = null
        browserCommittedRef.current = ''
        browserInterimRef.current = ''
        capacitorCommittedRef.current = ''
        capacitorInterimRef.current = ''
        setSpeechDetected(false)
        clearInputLiveIndicator()
    }, [clearInputLiveIndicator])

    const clearCapacitorListeners = useCallback(async () => {
        if (!capacitorListenersRef.current.length) return
        const handles = [...capacitorListenersRef.current]
        capacitorListenersRef.current = []
        await Promise.all(handles.map(async (h: any) => {
            try {
                if (typeof h?.remove === 'function') await h.remove()
            } catch {
                // Best effort cleanup.
            }
        }))
    }, [])

    // ---- Browser speech recognition ----
    const startBrowserListening = useCallback(async () => {
        const SR = getSpeechRecognition()
        if (!SR) {
            setServiceUnavailable(true)
            setTranscript(speechServiceHelpText)
            setShowHint(true)
            return
        }

        // Permission pre-check: skip in Electron & Capacitor contexts where
        // the host process already handles media permissions.
        // This fixes the bug where "Allow microphone" label was shown even
        // though permissions were already granted by the Electron main process
        // or the Capacitor native layer.
        if (!isElectronEnvironment() && !isCapacitorEnvironment()) {
            const micState = await getMicrophonePermissionState()
            if (micState === 'denied') {
                setListening(false)
                setStatus('idle')
                setPermissionDenied(true)
                setServiceUnavailable(false)
                setTranscript(permissionHelpText)
                setShowHint(true)
                return
            }
        }

        setPermissionDenied(false)
        setServiceUnavailable(false)

        if (recognitionRef.current) {
            try { recognitionRef.current.abort() } catch (_) { }
        }

        const recognition = new SR()
        recognitionRef.current = recognition
        browserCommittedRef.current = ''
        browserInterimRef.current = ''
        beginDictationSession()
        recognition.lang = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : 'en-IN'
        recognition.interimResults = true
        recognition.continuous = false
        recognition.maxAlternatives = 1

        recognition.onstart = () => {
            setListening(true)
            setStatus('listening')
            setSpeechDetected(false)
            if (!browserCommittedRef.current && !browserInterimRef.current) {
                setTranscript('')
            }
        }

        ;(recognition as any).onspeechstart = () => {
            setSpeechDetected(true)
        }

        ;(recognition as any).onsoundstart = () => {
            setSpeechDetected(true)
        }

        recognition.onresult = (event: SpeechRecognitionEvent) => {
            let interim = ''
            let finalText = ''

            const resultCount = event?.results?.length || 0
            const startIndex = Number.isFinite(event?.resultIndex as number) ? Number(event.resultIndex) : 0

            for (let i = Math.max(0, startIndex); i < resultCount; i++) {
                const result = event.results[i]
                const segment = String(result?.[0]?.transcript || '').trim()
                if (!segment) continue
                if (result?.isFinal) finalText = mergeTranscript(finalText, segment)
                else interim = mergeTranscript(interim, segment)
            }

            if (!finalText && !interim && resultCount > 0) {
                for (let i = 0; i < resultCount; i++) {
                    const result = event.results[i]
                    const segment = String(result?.[0]?.transcript || '').trim()
                    if (!segment) continue
                    if (result?.isFinal) finalText = mergeTranscript(finalText, segment)
                    else interim = mergeTranscript(interim, segment)
                }
            }

            if (finalText) {
                browserCommittedRef.current = appendOrReplaceRecognized(browserCommittedRef.current, finalText)
            }
            browserInterimRef.current = interim

            const liveText = combineCommittedAndInterim(browserCommittedRef.current, browserInterimRef.current)
            if (liveText) setSpeechDetected(true)

            setTranscript(liveText || 'Listening...')
            applyDictationText(liveText)

            if (!dictationSnapshotRef.current && finalText.trim()) {
                const el = resolveVoiceTargetElement()
                if (el) injectTextIntoElement(el, finalText.trim())
            }
        }

        recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
            const errorCode = (e.error || '').toLowerCase()

            // Transient non-errors — do not surface to user
            if (errorCode === 'no-speech' || errorCode === 'audio-capture' || errorCode === 'network') {
                setTranscript('Listening...')
                return
            }

            // In Electron and Capacitor, 'not-allowed' and 'service-not-allowed' often fire
            // even though permissions ARE granted. The underlying Chromium speech service
            // uses Google's servers and can transiently fail. Treat these as service hiccups,
            // not real permission denials, to avoid the misleading "Allow microphone" label.
            if (isElectronEnvironment() || isCapacitorEnvironment()) {
                if (errorCode === 'not-allowed' || errorCode === 'service-not-allowed') {
                    // Silently retry by not blocking — the onend handler will auto-restart
                    return
                }
            }

            if (errorCode === 'service-not-allowed') {
                setPermissionDenied(false)
                setServiceUnavailable(true)
                setShowHint(true)
                setTranscript(speechServiceHelpText)
                setStatus('idle')
                setListening(false)
                return
            }

            if (errorCode === 'not-allowed') {
                void (async () => {
                    const micState = await getMicrophonePermissionState()
                    const isRealPermissionBlock = micState === 'denied'
                    setPermissionDenied(isRealPermissionBlock)
                    setServiceUnavailable(!isRealPermissionBlock)
                    setShowHint(true)
                    setTranscript(isRealPermissionBlock ? permissionHelpText : speechServiceHelpText)
                    setStatus('idle')
                    setListening(false)
                })()
                return
            }

            if (errorCode !== 'aborted') {
                setStatus('idle')
                setListening(false)
            }
        }

        recognition.onend = () => {
            if (listeningRef.current) {
                try { recognition.start() } catch (_) { }
            } else {
                setStatus('idle')
                setTranscript('')
                clearDictationSession()
            }
        }

        try {
            recognition.start()
        } catch {
            setServiceUnavailable(true)
            setTranscript(speechServiceHelpText)
            setShowHint(true)
        }
    }, [applyDictationText, beginDictationSession, clearDictationSession, permissionHelpText, resolveVoiceTargetElement, speechServiceHelpText])

    // ---- Capacitor (Android native) speech recognition ----
    const startCapacitorListening = useCallback(async () => {
        const plugin = capacitorSpeechRef.current || window.Capacitor?.Plugins?.SpeechRecognition
        if (!plugin?.start) {
            setServiceUnavailable(true)
            setTranscript(speechServiceHelpText)
            setShowHint(true)
            return
        }

        capacitorSpeechRef.current = plugin
        capacitorCommittedRef.current = ''
        capacitorInterimRef.current = ''
        setSpeechDetected(false)
        beginDictationSession()
        setPermissionDenied(false)
        setServiceUnavailable(false)

        try {
            let granted = true
            if (typeof plugin.checkPermissions === 'function') {
                const perm = await plugin.checkPermissions()
                const values = Object.values(perm || {}).map((v) => String(v || '').toLowerCase())
                granted = values.length === 0 || values.some((v) => v === 'granted')
            }
            if (!granted && typeof plugin.requestPermissions === 'function') {
                const requested = await plugin.requestPermissions()
                const values = Object.values(requested || {}).map((v) => String(v || '').toLowerCase())
                granted = values.length === 0 || values.some((v) => v === 'granted')
            }

            if (!granted) {
                setPermissionDenied(true)
                setServiceUnavailable(false)
                setTranscript(permissionHelpText)
                setShowHint(true)
                return
            }

            await clearCapacitorListeners()

            if (typeof plugin.addListener === 'function') {
                const partialHandler = (data: any) => {
                    const partial = extractSpeechText(data)
                    if (!partial) return
                    capacitorInterimRef.current = partial
                    const liveText = combineCommittedAndInterim(capacitorCommittedRef.current, capacitorInterimRef.current)
                    if (liveText) setSpeechDetected(true)
                    setTranscript(liveText)
                    applyDictationText(liveText)
                }

                const finalHandler = (data: any) => {
                    const text = extractSpeechText(data)
                    if (!text) return
                    capacitorCommittedRef.current = appendOrReplaceRecognized(capacitorCommittedRef.current, text)
                    capacitorInterimRef.current = ''
                    const liveText = capacitorCommittedRef.current
                    if (liveText) setSpeechDetected(true)
                    setTranscript(liveText)
                    applyDictationText(liveText)

                    if (!dictationSnapshotRef.current) {
                        const el = resolveVoiceTargetElement()
                        if (el) injectTextIntoElement(el, text)
                    }
                }

                const partialHandles = await Promise.all([
                    Promise.resolve(plugin.addListener('partialResults', partialHandler)).catch(() => null),
                    Promise.resolve(plugin.addListener('partialResult', partialHandler)).catch(() => null),
                ])

                const finalHandles = await Promise.all([
                    Promise.resolve(plugin.addListener('result', finalHandler)).catch(() => null),
                    Promise.resolve(plugin.addListener('results', finalHandler)).catch(() => null),
                ])

                const stateHandle = await plugin.addListener('listeningState', (data: any) => {
                    const listeningState = resolveCapacitorListeningState(data)
                    if (listeningState === true) {
                        setListening(true)
                        setStatus('listening')
                    } else if (listeningState === false && !listeningRef.current) {
                        setListening(false)
                        setStatus('idle')
                    }
                })
                capacitorListenersRef.current = [...partialHandles, ...finalHandles, stateHandle].filter(Boolean)
            }

            setListening(true)
            setStatus('listening')
            setTranscript('')

            const preferredLanguage = (typeof navigator !== 'undefined' && navigator.language)
                ? navigator.language
                : 'en-IN'

            const startResult = await plugin.start({
                language: preferredLanguage,
                maxResults: 1,
                partialResults: true,
                popup: false,
            })

            const immediateText = extractSpeechText(startResult)
            if (immediateText) {
                capacitorCommittedRef.current = appendOrReplaceRecognized(capacitorCommittedRef.current, immediateText)
                capacitorInterimRef.current = ''
                setSpeechDetected(true)
                setTranscript(capacitorCommittedRef.current)
                applyDictationText(capacitorCommittedRef.current)
            }
        } catch {
            if (getSpeechRecognition()) {
                setProvider('browser')
                activeProviderRef.current = 'browser'
                await startBrowserListening()
                return
            }

            setListening(false)
            setStatus('idle')
            setPermissionDenied(false)
            setServiceUnavailable(true)
            setTranscript(speechServiceHelpText)
            setShowHint(true)
        }
    }, [applyDictationText, beginDictationSession, clearCapacitorListeners, permissionHelpText, resolveVoiceTargetElement, speechServiceHelpText, startBrowserListening])

    // ---- Start/stop orchestration ----
    const startListening = useCallback(async () => {
        if (provider === 'capacitor-android') {
            activeProviderRef.current = 'capacitor-android'
            await startCapacitorListening()
            return
        }
        if (provider === 'browser') {
            activeProviderRef.current = 'browser'
            await startBrowserListening()
            return
        }

        setServiceUnavailable(true)
        setTranscript('Speech-to-text is not available on this device yet.')
        setShowHint(true)
    }, [provider, startBrowserListening, startCapacitorListening])

    const stopListening = useCallback(() => {
        const activeProvider = activeProviderRef.current
        setListening(false)
        setStatus('processing')

        if (activeProvider === 'capacitor-android') {
            const plugin = capacitorSpeechRef.current || window.Capacitor?.Plugins?.SpeechRecognition
            if (plugin?.stop) {
                void Promise.resolve(plugin.stop()).catch(() => { })
            }
            void clearCapacitorListeners()
        } else if (recognitionRef.current) {
            try { recognitionRef.current.stop() } catch (_) { }
        }

        setTimeout(() => {
            setStatus('idle')
            setTranscript('')
            clearDictationSession()
        }, 600)
    }, [clearCapacitorListeners, clearDictationSession])

    // ---- Click/pointer handlers ----
    const handleClick = useCallback(() => {
        if (status === 'processing') return

        if (listeningRef.current) {
            stopListening()
            return
        }

        const targetEl = activeElRef.current || lastEditableElRef.current
        if (targetEl) {
            try { targetEl.focus() } catch (_) { }
        }
        void startListening()
    }, [status, startListening, stopListening])

    const handlePointerDown = useCallback((e: React.PointerEvent) => {
        e.preventDefault()
        micPointerDownRef.current = true

        // Hold-to-talk for touch only; mouse/desktop = stable toggle
        if (e.pointerType !== 'touch') {
            isHoldRef.current = false
            holdStartedAtRef.current = null
            if (holdTimerRef.current) {
                clearTimeout(holdTimerRef.current)
                holdTimerRef.current = null
            }
            return
        }

        isHoldRef.current = false
        holdStartedAtRef.current = null
        holdTimerRef.current = setTimeout(() => {
            isHoldRef.current = true
            holdStartedAtRef.current = Date.now()
            const targetEl = activeElRef.current || lastEditableElRef.current
            if (targetEl) {
                try { targetEl.focus() } catch (_) { }
            }
            void startListening()
        }, HOLD_THRESHOLD_MS)
    }, [HOLD_THRESHOLD_MS, startListening])

    const handlePointerUp = useCallback((e: React.PointerEvent) => {
        e.preventDefault()
        micPointerDownRef.current = false

        if (e.pointerType !== 'touch') {
            // Most desktop browsers fire onPointerUp and onClick for one mouse click.
            // We handle pointer-up as the primary action and suppress the trailing click.
            suppressNextClickRef.current = true
            handleClick()
            return
        }

        if (holdTimerRef.current) {
            clearTimeout(holdTimerRef.current)
            holdTimerRef.current = null
        }

        if (isHoldRef.current) {
            const holdDuration = holdStartedAtRef.current ? Date.now() - holdStartedAtRef.current : 0
            if (holdDuration < 120) {
                setTimeout(() => stopListening(), 120 - holdDuration)
            } else {
                stopListening()
            }
            isHoldRef.current = false
            holdStartedAtRef.current = null
        } else {
            handleClick()
        }
    }, [handleClick, stopListening])

    const handlePointerCancel = useCallback(() => {
        micPointerDownRef.current = false
        suppressNextClickRef.current = false
        if (holdTimerRef.current) {
            clearTimeout(holdTimerRef.current)
            holdTimerRef.current = null
        }
        if (isHoldRef.current && listeningRef.current) {
            stopListening()
            isHoldRef.current = false
        }
        holdStartedAtRef.current = null
    }, [stopListening])

    const handleButtonClick = useCallback(() => {
        if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false
            return
        }
        handleClick()
    }, [handleClick])

    // ---- Cleanup on unmount ----
    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                try { recognitionRef.current.abort() } catch (_) { }
            }
            const plugin = capacitorSpeechRef.current || window.Capacitor?.Plugins?.SpeechRecognition
            if (plugin?.stop) {
                try { plugin.stop() } catch (_) { }
            }
            void clearCapacitorListeners()
            if (holdTimerRef.current) clearTimeout(holdTimerRef.current)
            clearDictationSession()
        }
    }, [clearCapacitorListeners, clearDictationSession])

    // ---- Render conditions ----
    if (!supported) return null

    const isActive = listening || status === 'processing'
    const showSpeechWaves = isActive && (status === 'processing' || speechDetected)
    const issueVisible = permissionDenied || serviceUnavailable
    const shouldShowMic = !!activeEl || isActive

    if (!shouldShowMic) return null

    return (
        <div
            className="fixed z-[9999] voice-mic-root mobile-safe-fab mobile-safe-fab-left"
            style={{
                bottom: bottomOffset ?? '1.5rem',
                left: leftOffset ?? '1.5rem',
                transition: 'left 0.2s ease'
            }}
            data-voice-mic-button="true"
        >
            {/* Tooltip / hint bubble */}
            <div
                className={`voice-mic-hint absolute bottom-full left-0 mb-3 rounded-xl px-3 py-2 text-xs font-semibold shadow-xl select-none transition-all duration-300 ${issueVisible ? 'pointer-events-auto' : 'pointer-events-none'} ${showHint || isActive || !!transcript ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
                style={{
                    background: isActive ? 'rgba(239,68,68,0.92)' : 'rgba(30,41,59,0.90)',
                    color: '#fff',
                    backdropFilter: 'blur(8px)',
                    border: isActive ? '1px solid rgba(252,165,165,0.4)' : '1px solid rgba(148,163,184,0.2)',
                    minWidth: issueVisible ? 'min(16rem, calc(100vw - 1rem))' : '10rem',
                    maxWidth: 'min(18rem, calc(100vw - 1rem))',
                    textAlign: 'center',
                }}
            >
                {status === 'listening' ? (
                    <span className="flex items-center gap-1.5 justify-center">
                        <span className={`voice-dot ${speechDetected ? 'voice-dot-wave' : 'voice-dot-still'}`} />
                        <span className={`voice-dot ${speechDetected ? 'voice-dot-wave' : 'voice-dot-still'}`} style={{ animationDelay: '0.15s' }} />
                        <span className={`voice-dot ${speechDetected ? 'voice-dot-wave' : 'voice-dot-still'}`} style={{ animationDelay: '0.3s' }} />
                        <span className="ml-1">{transcript || 'Listening...'}</span>
                    </span>
                ) : status === 'processing' ? (
                    'Processing...'
                ) : permissionDenied ? (
                    <span className="whitespace-normal leading-relaxed">{transcript || permissionHelpText}</span>
                ) : serviceUnavailable ? (
                    <span className="whitespace-normal leading-relaxed">{transcript || speechServiceHelpText}</span>
                ) : transcript ? (
                    transcript
                ) : showHint ? (
                    provider === 'capacitor-android'
                        ? 'Hold or click to speak'
                        : 'Click to speak'
                ) : null}

                {/* Arrow pointing down to the button */}
                <span
                    className="absolute -bottom-1.5"
                    style={{
                        left: '1.625rem',
                        width: 0,
                        height: 0,
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderTop: isActive ? '6px solid rgba(239,68,68,0.92)' : '6px solid rgba(30,41,59,0.90)',
                    }}
                />
            </div>

            {/* Pulse rings when actively listening */}
            {showSpeechWaves && (
                <>
                    <span className="voice-ring voice-ring-1" />
                    <span className="voice-ring voice-ring-2" />
                </>
            )}

            {/* Idle attention pulse */}
            {showHint && !isActive && (
                <span className="voice-ring-hint" />
            )}

            {/* Main FAB button */}
            <button
                data-voice-mic-button="true"
                aria-label={isActive ? 'Stop voice input' : 'Start voice input'}
                onClick={handleButtonClick}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onPointerLeave={handlePointerCancel}
                className={`voice-mic-btn relative flex items-center justify-center rounded-full shadow-2xl outline-none focus-visible:ring-4 focus-visible:ring-offset-2 select-none transition-all duration-200 active:scale-95 ${isActive
                    ? 'bg-red-500 hover:bg-red-600 focus-visible:ring-red-400 text-white voice-mic-listening'
                    : 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-400 text-white'
                    }`}
                style={{
                    width: '3.25rem',
                    height: '3.25rem',
                    touchAction: 'none',
                    WebkitUserSelect: 'none',
                    userSelect: 'none',
                    cursor: 'pointer',
                }}
            >
                {status === 'processing' ? (
                    <svg className="animate-spin" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                        <path d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                ) : isActive ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <rect x="5" y="5" width="14" height="14" rx="2" />
                    </svg>
                ) : (
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 1a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z" fill="currentColor" stroke="none" />
                        <path d="M19 10a7 7 0 0 1-14 0" />
                        <line x1="12" y1="19" x2="12" y2="23" />
                        <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                )}
            </button>
        </div>
    )
}
