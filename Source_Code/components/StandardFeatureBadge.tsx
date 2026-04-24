import React from 'react'

type StandardFeatureBadgeProps = {
    mobile?: boolean
    className?: string
}

export default function StandardFeatureBadge({ mobile = false, className = '' }: StandardFeatureBadgeProps) {
    if (mobile) {
        return (
            <span
                className={`absolute -top-1 -right-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow ${className}`}
                title="Standard feature"
                aria-label="Standard feature"
            >
                <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2l2.7 5.47L20.73 8l-4.37 4.26L17.4 18 12 15.2 6.6 18l1.04-5.74L3.27 8l6.03-.53L12 2z" />
                </svg>
            </span>
        )
    }

    return (
        <span
            className={`absolute -top-2 -right-2 rounded-full bg-gradient-to-r from-sky-500 to-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow ${className}`}
            title="Available in Standard"
            aria-label="Available in Standard"
        >
            Standard
        </span>
    )
}
