import { KeyboardEvent, useMemo, useState } from 'react'

type ComplaintTagsInputProps = {
    tags: string[]
    onChange: (tags: string[]) => void
    placeholder?: string
    disabled?: boolean
}

function normalizeTag(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export default function ComplaintTagsInput({
    tags,
    onChange,
    placeholder = 'Type complaint and press Enter',
    disabled = false,
}: ComplaintTagsInputProps) {
    const [draft, setDraft] = useState('')

    const normalizedTags = useMemo(() => tags.map(normalizeTag).filter(Boolean), [tags])

    const addTag = (raw: string) => {
        const normalized = normalizeTag(raw)
        if (!normalized) return
        if (normalizedTags.includes(normalized)) return
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
        </div>
    )
}
