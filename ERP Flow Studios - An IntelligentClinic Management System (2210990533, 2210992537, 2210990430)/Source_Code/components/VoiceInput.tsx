/**
 * VoiceInput — Reusable controlled textarea with built-in speech-to-text
 *
 * Designed for clinic ERP fields (patient notes, symptoms, diagnosis).
 * Uses the shared useSpeechRecognition hook for Web Speech API integration.
 *
 * Features:
 *   - SVG mic button with animated pulse (idle → listening → stopped)
 *   - Real-time interim transcript display in the textarea
 *   - Auto-stop after configurable silence timeout
 *   - Intelligent append: speech text appends to existing value, never overwrites
 *   - Clinical entity parsing (symptoms, medicines, dosage) via onParsed callback
 *   - Graceful fallback for unsupported browsers
 *   - Clean unmount — no memory leaks
 */

import React, { useCallback, useEffect, useRef } from 'react'
import { useSpeechRecognition, mergeTranscript } from '../hooks/useSpeechRecognition'
import { ParsedClinicalSpeech, parseClinicalSpeech } from '../lib/speech/parseClinicalSpeech'

export interface VoiceInputProps {
    /** Current controlled value */
    value: string
    /** Called when value changes (typing or speech) */
    onChange: (value: string) => void
    /** Field label (set to null to hide) */
    label?: string | null
    /** Textarea placeholder text */
    placeholder?: string
    /** BCP-47 language tag for speech recognition */
    language?: string
    /** Textarea row count */
    rows?: number
    /** Disable both typing and voice */
    disabled?: boolean
    /** Additional CSS class for the wrapper */
    className?: string
    /** Auto-stop after silence (ms). 0 = disabled. Default: 10000 */
    silenceTimeoutMs?: number
    /** Called when speech ends with parsed clinical entities */
    onParsed?: (parsed: ParsedClinicalSpeech) => void
}

export default function VoiceInput({
    value,
    onChange,
    label = 'Notes',
    placeholder = 'Type or dictate clinical notes...',
    language = 'en-IN',
    rows = 4,
    disabled = false,
    className,
    silenceTimeoutMs = 10000,
    onParsed,
}: VoiceInputProps) {
    // Snapshot of the text that existed before this listening session started.
    // Speech output is appended after this, so manual typing is never overwritten.
    const baseTextRef = useRef('')

    const {
        isSupported,
        isListening,
        liveText,
        committedText,
        statusMessage,
        speechDetected,
        start,
        stop,
        reset,
    } = useSpeechRecognition({ language, continuous: true, silenceTimeoutMs })

    // When speech produces live text, merge it with the pre-existing base text
    // and push the combined value outward through onChange.
    useEffect(() => {
        if (!isListening && !liveText) return
        if (liveText) {
            const nextValue = mergeTranscript(baseTextRef.current, liveText)
            onChange(nextValue)
        }
    }, [liveText]) // eslint-disable-line react-hooks/exhaustive-deps

    // When recognition ends, emit parsed clinical entities
    useEffect(() => {
        if (isListening) return // Still going
        if (!committedText) return // Nothing was captured
        if (onParsed) {
            const fullText = mergeTranscript(baseTextRef.current, committedText)
            onParsed(parseClinicalSpeech(fullText))
        }
    }, [isListening]) // eslint-disable-line react-hooks/exhaustive-deps

    const handleToggle = useCallback(() => {
        if (disabled) return
        if (isListening) {
            stop()
        } else {
            // Capture what's currently in the field so we can append to it
            baseTextRef.current = value
            reset()
            start()
        }
    }, [disabled, isListening, start, stop, reset, value])

    // Mic icon SVGs
    const MicIdleIcon = (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a4 4 0 0 0-4 4v6a4 4 0 0 0 8 0V5a4 4 0 0 0-4-4Z" fill="currentColor" stroke="none" />
            <path d="M19 10a7 7 0 0 1-14 0" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
    )

    const StopIcon = (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
    )

    // Determine status text
    const displayStatus = isListening
        ? 'Listening...'
        : statusMessage || (isSupported ? 'Click mic to dictate' : '')

    return (
        <div className={`voice-input-wrapper ${className || ''}`}>
            {label ? (
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {label}
                </label>
            ) : null}

            <div className="flex items-start gap-2">
                {/* Textarea — always allows manual typing */}
                <textarea
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    rows={rows}
                    disabled={disabled}
                    className="w-full rounded-xl border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 dark:text-gray-100 transition-all duration-200"
                    style={isListening ? { borderColor: 'rgba(239, 68, 68, 0.5)', boxShadow: '0 0 0 3px rgba(239, 68, 68, 0.1)' } : undefined}
                />

                {/* Mic toggle button */}
                <button
                    type="button"
                    disabled={!isSupported || disabled}
                    onClick={handleToggle}
                    className={`voice-input-mic flex-shrink-0 ${isListening ? 'voice-input-mic--listening' : 'voice-input-mic--idle'} disabled:cursor-not-allowed disabled:opacity-40`}
                    style={{ width: 40, height: 40 }}
                    aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                    title={isSupported ? (isListening ? 'Stop listening' : 'Click to dictate') : 'Speech API not supported'}
                >
                    {/* Animated ring when listening */}
                    {isListening && <span className="voice-input-ring" />}
                    {isListening ? StopIcon : MicIdleIcon}
                </button>
            </div>

            {/* Status indicator */}
            <div className={`voice-input-status ${isListening ? 'voice-input-status--active' : 'voice-input-status--idle'}`}>
                {isListening && (
                    <>
                        <span className={`voice-dot ${speechDetected ? 'voice-dot-wave' : 'voice-dot-still'}`} />
                        <span className={`voice-dot ${speechDetected ? 'voice-dot-wave' : 'voice-dot-still'}`} style={{ animationDelay: '0.15s' }} />
                        <span className={`voice-dot ${speechDetected ? 'voice-dot-wave' : 'voice-dot-still'}`} style={{ animationDelay: '0.3s' }} />
                    </>
                )}
                {!isSupported ? (
                    <span className="text-amber-700 dark:text-amber-400">
                        Voice input is not supported in this browser. You can continue typing manually.
                    </span>
                ) : (
                    <span>{displayStatus}</span>
                )}
            </div>
        </div>
    )
}
