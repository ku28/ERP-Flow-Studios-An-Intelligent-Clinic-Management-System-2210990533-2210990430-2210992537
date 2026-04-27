import React from 'react'

type A4PageProps = {
    children: React.ReactNode
    marginColor?: string
    className?: string
}

export default function A4Page({ children, marginColor = '#111111', className = '' }: A4PageProps) {
    return (
        <div
            className={`relative text-black shadow-lg overflow-hidden ${className}`}
            style={{
                width: '794px',
                minHeight: '1123px',
                padding: '20px',
                border: `1px solid ${marginColor}`,
                backgroundColor: '#ffffff',
                boxSizing: 'border-box',
            }}
        >
            <style>{`@page { size: A4; margin: 0; }`}</style>
            {children}
        </div>
    )
}
