import { KeyboardEvent, useMemo, useState } from 'react'

type TagInputProps = {
    tags: string[]
    onChange: (tags: string[]) => void
    placeholder?: string
    disabled?: boolean
    suggestions?: string[]
    maxSuggestions?: number
}

function normalizeTag(value: string): string {
    return value.trim().replace(/\s+/g, ' ')
}

function dedupeTags(values: string[]): string[] {
    const seen = new Set<string>()
    const out: string[] = []
    values.forEach((v) => {
        const normalized = normalizeTag(v)
        if (!normalized) return
        const key = normalized.toLowerCase()
        if (seen.has(key)) return
        seen.add(key)
        out.push(normalized)
    })
    return out
}

export default function TagInput({
    tags,
    onChange,
    placeholder = 'Type and press Enter',
    disabled = false,
    suggestions = [],
    maxSuggestions = 8,
}: TagInputProps) {
    const [draft, setDraft] = useState('')

    const normalizedTags = useMemo(() => dedupeTags(tags), [tags])

    const addTag = (raw: string) => {
        const normalized = normalizeTag(raw)
        if (!normalized) return
        const exists = normalizedTags.some((t) => t.toLowerCase() === normalized.toLowerCase())
        if (exists) return
        onChange([...normalizedTags, normalized])
        setDraft('')
    }

    const removeTag = (idx: number) => {
        onChange(normalizedTags.filter((_, i) => i !== idx))
    }

    const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (disabled) return
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            addTag(draft)
            return
        }
        if (e.key === 'Backspace' && !draft && normalizedTags.length > 0) {
            e.preventDefault()
            removeTag(normalizedTags.length - 1)
        }
    }

    const visibleSuggestions = useMemo(() => {
        const used = new Set(normalizedTags.map((t) => t.toLowerCase()))
        const query = draft.trim().toLowerCase()
        return dedupeTags(suggestions)
            .filter((s) => !used.has(s.toLowerCase()))
            .filter((s) => !query || s.toLowerCase().includes(query))
            .slice(0, maxSuggestions)
    }, [suggestions, normalizedTags, draft, maxSuggestions])

    return (
        <div className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-2 focus-within:ring-2 focus-within:ring-blue-500">
            <div className="flex flex-wrap gap-2 items-center">
                {normalizedTags.map((tag, idx) => (
                    <span
                        key={`${tag}-${idx}`}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
                    >
                        {tag}
                        {!disabled && (
                            <button
                                type="button"
                                onClick={() => removeTag(idx)}
                                className="text-blue-700 dark:text-blue-300 hover:text-red-500"
                                aria-label={`Remove ${tag}`}
                            >
                                x
                            </button>
                        )}
                    </span>
                ))}
                <input
                    type="text"
                    value={draft}
                    disabled={disabled}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={onKeyDown}
                    onBlur={() => addTag(draft)}
                    placeholder={placeholder}
                    className="flex-1 min-w-[180px] bg-transparent outline-none text-sm text-gray-900 dark:text-gray-100"
                />
            </div>
            {visibleSuggestions.length > 0 && !disabled && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {visibleSuggestions.map((s) => (
                        <button
                            key={s}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => addTag(s)}
                            className="px-2 py-0.5 rounded-full text-xs border border-sky-300 dark:border-sky-700 text-sky-700 dark:text-sky-300 bg-sky-50/70 dark:bg-sky-900/20 hover:bg-sky-100 dark:hover:bg-sky-900/40"
                        >
                            {s}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}
