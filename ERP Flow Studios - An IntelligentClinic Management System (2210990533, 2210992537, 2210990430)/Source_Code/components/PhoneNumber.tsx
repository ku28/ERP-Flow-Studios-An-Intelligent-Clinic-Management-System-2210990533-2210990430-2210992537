import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface PhoneNumberProps {
    phone: string
    className?: string
}

export default function PhoneNumber({ phone, className = '' }: PhoneNumberProps) {
    const [showDropdown, setShowDropdown] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const buttonRef = useRef<HTMLButtonElement>(null)

    const updateDropdownPosition = () => {
        if (buttonRef.current && dropdownRef.current) {
            const rect = buttonRef.current.getBoundingClientRect()
            const dropdownHeight = 140 // Approximate height of dropdown
            const spaceBelow = window.innerHeight - rect.bottom
            const spaceAbove = rect.top
            
            // Position dropdown below if there's space, otherwise above
            if (spaceBelow >= dropdownHeight || spaceBelow > spaceAbove) {
                dropdownRef.current.style.top = `${rect.bottom + 4}px`
            } else {
                dropdownRef.current.style.top = `${rect.top - dropdownHeight - 4}px`
            }
            
            dropdownRef.current.style.left = `${rect.left}px`
        }
    }

    // Close dropdown on scroll, update position on resize
    useEffect(() => {
        if (showDropdown) {
            updateDropdownPosition()
            
            const handleScroll = () => {
                setShowDropdown(false)
            }
            
            window.addEventListener('scroll', handleScroll, true)
            window.addEventListener('resize', updateDropdownPosition)
            
            return () => {
                window.removeEventListener('scroll', handleScroll, true)
                window.removeEventListener('resize', updateDropdownPosition)
            }
        }
    }, [showDropdown])

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const target = event.target as Node
            const clickedInButton = buttonRef.current && buttonRef.current.contains(target)
            const clickedInDropdown = dropdownRef.current && dropdownRef.current.contains(target)
            
            if (!clickedInButton && !clickedInDropdown) {
                setShowDropdown(false)
            }
        }

        if (showDropdown) {
            document.addEventListener('mousedown', handleClickOutside)
            return () => document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [showDropdown])

    const handleCall = () => {
        window.location.href = `tel:${phone}`
        setShowDropdown(false)
    }

    const handleWhatsApp = () => {
        // Remove any non-digit characters and ensure it starts with country code
        const cleanPhone = phone.replace(/\D/g, '')
        const phoneWithCode = cleanPhone.startsWith('91') ? cleanPhone : `91${cleanPhone}`
        window.open(`https://wa.me/${phoneWithCode}`, '_blank')
        setShowDropdown(false)
    }

    return (
        <div className={showDropdown ? 'relative inline-block z-[10000]' : 'relative inline-block z-0'}>
            <button
                ref={buttonRef}
                onClick={() => setShowDropdown(!showDropdown)}
                className={`inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors ${className}`}
            >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span>{phone}</span>
            </button>

            {showDropdown && createPortal(
                <div 
                    ref={dropdownRef}
                    className="fixed w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden z-[10000]"
                >
                    <button
                        onClick={handleCall}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                    >
                        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        <span className="font-medium">Call</span>
                    </button>
                    <button
                        onClick={handleWhatsApp}
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors border-t border-gray-100 dark:border-gray-700"
                    >
                        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                        </svg>
                        <span className="font-medium">WhatsApp</span>
                    </button>
                </div>,
                document.body
            )}
        </div>
    )
}

