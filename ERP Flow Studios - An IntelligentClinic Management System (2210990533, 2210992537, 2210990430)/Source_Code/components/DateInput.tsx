import { useState } from 'react'

interface DateInputProps {
    type?: 'date' | 'datetime-local'
    value: string
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    placeholder?: string
    className?: string
    required?: boolean
}

export default function DateInput({
    type = 'date',
    value,
    onChange,
    placeholder,
    className = '',
    required = false
}: DateInputProps) {
    const [isFocused, setIsFocused] = useState(false)
    const hasValue = value && value.trim() !== ''

    return (
        <div className="date-input-wrapper" style={{ position: 'relative' }}>
            <input
                type={type}
                value={value}
                onChange={onChange}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                required={required}
                className={className}
                style={{
                    position: 'relative',
                    zIndex: 1,
                    color: hasValue || isFocused ? 'var(--text)' : 'transparent'
                }}
            />
            {!hasValue && !isFocused && placeholder && (
                <div
                    className="date-placeholder"
                    style={{
                        position: 'absolute',
                        left: '0.875rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--muted)',
                        opacity: 0.7,
                        pointerEvents: 'none',
                        fontSize: '0.9375rem',
                        zIndex: 0
                    }}
                >
                    {placeholder}
                </div>
            )}
        </div>
    )
}
