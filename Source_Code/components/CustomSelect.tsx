import { useState, useRef, useEffect, memo } from 'react'
import { createPortal } from 'react-dom'
import ThemedScrollArea from './ThemedScrollArea'

export interface Option {
    value: string
    label: string
    description?: string  // Optional description field
    badge?: string
    subtitle?: string
    searchString?: string
}

interface CustomSelectProps {
    value: string
    onChange: (value: string) => void
    options: Option[]
    placeholder?: string
    className?: string
    required?: boolean
    allowCustom?: boolean  // Allow typing custom values
    onOpenChange?: (isOpen: boolean) => void  // Callback when dropdown opens/closes
    disabled?: boolean  // Disable the select
    loading?: boolean  // Show loading state
    usePortal?: boolean  // Render dropdown in a portal (default true)
}

function CustomSelect({
    value,
    onChange,
    options,
    placeholder = 'Select...',
    className = '',
    required = false,
    allowCustom = false,
    onOpenChange,
    disabled = false,
    loading = false,
    usePortal = true
}: CustomSelectProps) {
    const OPENING_ANIMATION_MS = 180
    const CLOSING_ANIMATION_MS = 170

    const [isOpen, setIsOpen] = useState(false)
    const [isOpening, setIsOpening] = useState(false)
    const [isClosing, setIsClosing] = useState(false)
    const [inputValue, setInputValue] = useState('')
    const [highlightedIndex, setHighlightedIndex] = useState(0)
    const [hoveredOption, setHoveredOption] = useState<Option | null>(null)
    const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0, maxHeight: 300, openUp: false, zIndex: 45 })
    const [forceInlineDropdown, setForceInlineDropdown] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const optionsRef = useRef<HTMLDivElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)
    const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const shouldUsePortal = usePortal && !forceInlineDropdown
    const isDropdownVisible = isOpen || isClosing

    const clearOpenTimer = () => {
        if (openTimerRef.current) {
            clearTimeout(openTimerRef.current)
            openTimerRef.current = null
        }
    }

    const clearCloseTimer = () => {
        if (closeTimerRef.current) {
            clearTimeout(closeTimerRef.current)
            closeTimerRef.current = null
        }
    }

    const openDropdown = () => {
        if (isOpen && !isClosing) return
        clearOpenTimer()
        clearCloseTimer()
        setIsClosing(false)
        setIsOpen(true)
        setIsOpening(true)
        openTimerRef.current = setTimeout(() => {
            setIsOpening(false)
            openTimerRef.current = null
        }, OPENING_ANIMATION_MS)
    }

    const closeDropdown = () => {
        if (!isOpen) return
        clearOpenTimer()
        clearCloseTimer()
        setIsOpening(false)
        setIsOpen(false)
        setIsClosing(true)
        closeTimerRef.current = setTimeout(() => {
            setIsClosing(false)
            closeTimerRef.current = null
        }, CLOSING_ANIMATION_MS)
    }

    useEffect(() => {
        return () => {
            clearOpenTimer()
            clearCloseTimer()
        }
    }, [])

    // Keep dropdown in portal mode for consistent stacking above complex form layouts.
    useEffect(() => {
        setForceInlineDropdown(false)
    }, [])

    // Update input value when value prop changes (for pre-filled forms)
    useEffect(() => {
        if (!isOpen) {
            if (value) {
                const option = options.find(opt => opt && opt.value === value)
                if (option) {
                    setInputValue(String(option.label || ''))
                } else {
                    // Show custom value (not in options list)
                    setInputValue(value)
                }
            } else {
                setInputValue('')
            }
        }
    }, [value, options, allowCustom, isOpen])

    // Notify parent when dropdown opens/closes.
    // Only report open state when dropdown is inline; with portal rendering,
    // parent z-index boosts can cause labels/inputs to overlap sticky headers.
    useEffect(() => {
        if (onOpenChange) {
            onOpenChange(isOpen && !shouldUsePortal)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, shouldUsePortal])

    // Close dropdown when clicking outside.
    // Use click (not mousedown) so close timing matches the icon toggle path.
    useEffect(() => {
        if (!isDropdownVisible) return

        function handleClickOutside(event: MouseEvent) {
            const target = event.target as Node
            const clickedInContainer = containerRef.current && containerRef.current.contains(target)
            const clickedInDropdown = dropdownRef.current && dropdownRef.current.contains(target)
            
            if (!clickedInContainer && !clickedInDropdown) {
                window.requestAnimationFrame(() => {
                    closeDropdown()
                    // Keep the custom value or restore the selected option label
                    if (!isOpen) return
                    const selectedOption = options.find(opt => opt.value === value)
                    if (selectedOption) {
                        setInputValue(String(selectedOption.label || ''))
                    } else if (value) {
                        // Keep custom value
                        setInputValue(value)
                    } else {
                        setInputValue('')
                    }
                })
            }
        }
        document.addEventListener('click', handleClickOutside)
        return () => document.removeEventListener('click', handleClickOutside)
    }, [isDropdownVisible, isOpen, value, options])

    // Reset highlighted index when filtered options change
    useEffect(() => {
        setHighlightedIndex(0)
    }, [inputValue])

    // Scroll highlighted option into view
    useEffect(() => {
        if (isOpen && optionsRef.current && optionsRef.current.children[highlightedIndex]) {
            const highlightedElement = optionsRef.current.children[highlightedIndex] as HTMLElement
            if (highlightedElement) {
                highlightedElement.scrollIntoView({ block: 'nearest', behavior: 'auto' })
            }
        }
    }, [highlightedIndex, isOpen])

    // Update dropdown position on scroll
    useEffect(() => {
        if (!isOpen || !shouldUsePortal) return
        
        const updatePosition = () => {
            if (containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect()
                const viewportHeight = window.visualViewport?.height ?? window.innerHeight
                const viewportWidth = window.visualViewport?.width ?? window.innerWidth
                const viewportPadding = 12
                const dropdownJoinOffset = -6
                const minDropdownHeight = 140

                const spaceBelow = viewportHeight - rect.bottom - viewportPadding
                const spaceAbove = rect.top - viewportPadding
                const shouldOpenUp = spaceBelow < 220 && spaceAbove > spaceBelow && spaceAbove >= minDropdownHeight
                const availableSpace = shouldOpenUp ? spaceAbove : spaceBelow
                const maxHeight = Math.max(140, Math.min(320, availableSpace))
                const maxWidth = Math.max(220, viewportWidth - viewportPadding * 2)
                const width = Math.min(rect.width, maxWidth)
                const top = shouldOpenUp
                    ? rect.top + dropdownJoinOffset
                    : rect.bottom - dropdownJoinOffset
                const left = Math.min(
                    Math.max(viewportPadding, rect.left),
                    Math.max(viewportPadding, viewportWidth - width - viewportPadding)
                )

                let highestAncestorZ = 0
                let ancestor: HTMLElement | null = containerRef.current.parentElement

                while (ancestor && ancestor !== document.body) {
                    const computedZ = window.getComputedStyle(ancestor).zIndex
                    const parsedZ = Number.parseInt(computedZ, 10)
                    if (Number.isFinite(parsedZ) && parsedZ > highestAncestorZ) {
                        highestAncestorZ = parsedZ
                    }
                    ancestor = ancestor.parentElement
                }

                const portalZIndex = highestAncestorZ >= 100 ? highestAncestorZ + 2 : 45

                setDropdownPosition({
                    top,
                    left,
                    width,
                    maxHeight,
                    openUp: shouldOpenUp,
                    zIndex: portalZIndex
                })
            }
        }
        
        updatePosition()
        window.addEventListener('scroll', updatePosition, true)
        window.addEventListener('resize', updatePosition)
        window.visualViewport?.addEventListener('resize', updatePosition)
        window.visualViewport?.addEventListener('scroll', updatePosition)
        
        return () => {
            window.removeEventListener('scroll', updatePosition, true)
            window.removeEventListener('resize', updatePosition)
            window.visualViewport?.removeEventListener('resize', updatePosition)
            window.visualViewport?.removeEventListener('scroll', updatePosition)
        }
    }, [isOpen, shouldUsePortal])

    // Filter options based on input value and sort alphabetically
    const filteredOptions = options
        .filter(option => {
            if (!option) return false
            const label = String(option?.searchString ?? option?.label ?? '')
            return option.value !== '' && label.toLowerCase().includes(inputValue.toLowerCase())
        })
        .sort((a, b) => {
            const labelA = String(a?.label ?? '')
            const labelB = String(b?.label ?? '')
            return labelA.localeCompare(labelB)
        })

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault()
                if (!isOpen) {
                    openDropdown()
                } else if (highlightedIndex < filteredOptions.length - 1) {
                    setHighlightedIndex(highlightedIndex + 1)
                }
                break
            case 'ArrowUp':
                e.preventDefault()
                if (!isOpen) {
                    openDropdown()
                } else if (highlightedIndex > 0) {
                    setHighlightedIndex(highlightedIndex - 1)
                }
                break
            case 'Enter':
                e.preventDefault()
                if (isOpen && filteredOptions.length > 0) {
                    const selectedOption = filteredOptions[highlightedIndex]
                    if (selectedOption) {
                        selectOption(selectedOption)
                    }
                } else if (isOpen && inputValue.trim()) {
                    // If no options match, use the custom input value
                    onChange(inputValue.trim())
                    closeDropdown()
                } else if (!isOpen) {
                    openDropdown()
                }
                break
            case 'Escape':
                e.preventDefault()
                closeDropdown()
                // Restore the selected option label or keep custom value
                const selectedOption = options.find(opt => opt.value === value)
                if (selectedOption) {
                    setInputValue(String(selectedOption.label || ''))
                } else if (value) {
                    // Keep custom value
                    setInputValue(value)
                } else {
                    setInputValue('')
                }
                break
            case 'Tab':
                if (isOpen) {
                    // If there's a highlighted option, select it
                    if (filteredOptions.length > 0) {
                        const selectedOption = filteredOptions[highlightedIndex]
                        if (selectedOption) {
                            selectOption(selectedOption)
                        }
                    } else {
                        closeDropdown()
                    }
                }
                break
        }
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value
        setInputValue(newValue)
        openDropdown()
        setHighlightedIndex(0)
        
        // Only update the value as user types if allowCustom is enabled
        if (allowCustom) {
            onChange(newValue)
        }
    }

    const handleInputFocus = () => {
        // Keep existing text so users can edit at cursor position.
        openDropdown()
        setHighlightedIndex(0)
    }

    const selectOption = (option: Option) => {
        onChange(option.value)
        setInputValue(String(option.label || ''))
        closeDropdown()
    }

    const handleOptionClick = (option: Option) => {
        selectOption(option)
    }

    const dropdownContent = (
        <div 
            ref={dropdownRef}
            className={`custom-select-dropdown ${dropdownPosition.openUp ? 'open-up' : 'open-down'} ${isClosing ? 'closing' : isOpening ? 'opening' : 'open'}`}
            style={shouldUsePortal ? {
                position: 'fixed',
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
                width: `${dropdownPosition.width}px`,
                maxHeight: `${dropdownPosition.maxHeight}px`,
                zIndex: dropdownPosition.zIndex,
                transform: dropdownPosition.openUp ? 'translateY(-100%)' : 'none'
            } : {
                position: 'absolute',
                top: 'calc(100% + 6px)',
                left: 0,
                width: '100%'
            }}
        >
            <div className={`custom-select-dropdown-panel ${dropdownPosition.openUp ? 'open-up' : 'open-down'}`}>
                <ThemedScrollArea
                    className="custom-select-options-scroll"
                    shellClassName="custom-select-scroll-shell"
                    density="compact"
                    viewportElementRef={optionsRef}
                    style={{ maxHeight: `${shouldUsePortal ? dropdownPosition.maxHeight : 240}px` }}
                >
                {loading ? (
                    <div className="px-4 py-8 text-center">
                        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-sky-600"></div>
                        <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">Loading...</div>
                    </div>
                ) : filteredOptions.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 text-center">
                        {inputValue.trim() ? (
                            <div>
                                <div className="mb-2" style={{fontSize: '0.7rem'}}>No matching options</div>
                                <div style={{fontSize: '0.65rem'}} className="text-sky-600 dark:text-sky-400 font-medium">
                                    Press Enter to save: "{inputValue}"
                                </div>
                            </div>
                        ) : (
                            'No options found'
                        )}
                    </div>
                ) : (
                    filteredOptions.map((option, index) => {
                        const isSuggested = option.description === 'SUGGESTED'
                        const hasNoPhone = (option as any).noPhone
                        const hasPhone = (option as any).hasPhone
                        return (
                        <div
                            key={option.value}
                            className={`custom-select-option ${value === option.value ? 'selected' : ''} ${highlightedIndex === index ? 'highlighted' : ''} ${isSuggested ? 'bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800' : ''}`}
                            onClick={() => handleOptionClick(option)}
                            onMouseEnter={() => {
                                setHighlightedIndex(index)
                                if (option.description && option.description !== 'SUGGESTED') {
                                    setHoveredOption(option)
                                }
                            }}
                            onMouseLeave={() => setHoveredOption(null)}
                            style={{ cursor: 'pointer', position: 'relative' }}
                        >
                              <div className="flex flex-col w-full gap-0.5" style={{ minWidth: 0 }}>
                                  <div className="flex items-center gap-2" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
                                      <span className="flex-1" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(option.label || '')}</span>
                                      {option.badge && (
                                          <span className="inline-flex flex-shrink-0 items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                                              {option.badge}
                                          </span>
                                      )}
                                      {isSuggested && (
                                    <span className="px-2 py-0.5 bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 rounded-full font-semibold flex-shrink-0 border border-sky-200 dark:border-sky-700" style={{fontSize: '0.65rem'}}>
                                        SUGGESTED
                                    </span>
                                )}
                                {hasNoPhone && (
                                    <span className="px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded-full font-semibold flex-shrink-0 border border-red-200 dark:border-red-700" style={{fontSize: '0.65rem'}}>
                                        NO PHONE NO.
                                    </span>
                                )}
                                {hasPhone && !isSuggested && (
                                    <span className="px-2 py-0.5 bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 rounded-full font-medium flex-shrink-0 border border-sky-200 dark:border-sky-700" style={{fontSize: '0.65rem'}}>
                                        ✓
                                    </span>
                                )}
                            </div>                              {option.subtitle && (
                                  <span className="text-xs font-medium text-brand truncate" style={{ opacity: 0.9 }}>
                                      {option.subtitle}
                                  </span>
                              )}
                              </div>                            {hoveredOption?.value === option.value && option.description && option.description !== 'SUGGESTED' && (
                                <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm p-3 text-gray-700 dark:text-gray-200" style={{fontSize: '0.7rem'}}>
                                    <div className="flex items-start gap-2">
                                        <svg className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                        </svg>
                                        <span className="leading-relaxed">{option.description}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        )
                    })
                )}
                </ThemedScrollArea>
            </div>
        </div>
    )

    const openDirectionClass = dropdownPosition.openUp ? 'open-up' : 'open-down'

    return (
        <div ref={containerRef} className={`custom-select ${isDropdownVisible ? `open ${openDirectionClass}` : ''} ${shouldUsePortal ? '' : 'relative'} ${className}`}>
            <div className="custom-select-input-wrapper">
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    className="custom-select-input"
                    autoComplete="off"
                    required={required}
                    disabled={disabled}
                    style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
                />
                {value && !disabled && (
                    <svg
                        className="clear-button"
                        width="16"
                        height="16"
                        viewBox="0 0 16 16"
                        fill="none"
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                            e.stopPropagation()
                            onChange('')
                            setInputValue('')
                            closeDropdown()
                        }}
                    >
                        <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.1" />
                        <path
                            d="M5 5L11 11M11 5L5 11"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                        />
                    </svg>
                )}
                <svg
                    className={`arrow ${isDropdownVisible ? 'open' : ''}`}
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                    onClick={() => {
                        if (isOpen) {
                            closeDropdown()
                        } else {
                            openDropdown()
                            inputRef.current?.focus()
                        }
                    }}
                    style={{ cursor: 'pointer' }}
                >
                    <path
                        d="M5.5 6.5L8 4L10.5 6.5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <path
                        d="M5.5 9.5L8 12L10.5 9.5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </div>

            {isDropdownVisible && (shouldUsePortal
                ? (typeof window !== 'undefined' ? createPortal(dropdownContent, document.body) : null)
                : dropdownContent
            )}
        </div>
    )
}

export default memo(CustomSelect)

