import { useEffect, useRef } from 'react'
import { useRouter } from 'next/router'

interface UseSwipeGesturesOptions {
    enabled?: boolean
    onSwipeLeft?: () => void
    onSwipeRight?: () => void
    onSwipeUp?: () => void
    onSwipeDown?: () => void
}

export default function useSwipeGestures({
    enabled = true,
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown
}: UseSwipeGesturesOptions = {}) {
    const router = useRouter()
    const touchStartX = useRef<number>(0)
    const touchStartY = useRef<number>(0)
    const touchEndX = useRef<number>(0)
    const touchEndY = useRef<number>(0)
    
    // Minimum swipe distance in pixels
    const minSwipeDistance = 80
    
    useEffect(() => {
        if (!enabled) return

        const handleTouchStart = (e: TouchEvent) => {
            // Ignore swipes on inputs, textareas, and buttons
            const target = e.target as HTMLElement
            if (
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'BUTTON' ||
                target.closest('button') ||
                target.closest('a') ||
                target.closest('[role="button"]') ||
                target.isContentEditable
            ) {
                return
            }

            touchStartX.current = e.touches[0].clientX
            touchStartY.current = e.touches[0].clientY
        }

        const handleTouchMove = (e: TouchEvent) => {
            touchEndX.current = e.touches[0].clientX
            touchEndY.current = e.touches[0].clientY
        }

        const handleTouchEnd = () => {
            const target = document.elementFromPoint(touchStartX.current, touchStartY.current) as HTMLElement
            
            // Ignore swipes on interactive elements
            if (
                !target ||
                target.tagName === 'INPUT' ||
                target.tagName === 'TEXTAREA' ||
                target.tagName === 'BUTTON' ||
                target.closest('button') ||
                target.closest('a') ||
                target.closest('[role="button"]') ||
                target.isContentEditable
            ) {
                return
            }

            const deltaX = touchEndX.current - touchStartX.current
            const deltaY = touchEndY.current - touchStartY.current
            
            // Determine if horizontal or vertical swipe
            const isHorizontalSwipe = Math.abs(deltaX) > Math.abs(deltaY)
            
            if (isHorizontalSwipe) {
                // Horizontal swipe
                if (Math.abs(deltaX) > minSwipeDistance) {
                    if (deltaX > 0) {
                        // Swipe right - go back
                        if (onSwipeRight) {
                            onSwipeRight()
                        } else {
                            router.back()
                        }
                    } else {
                        // Swipe left - go forward or trigger custom action
                        if (onSwipeLeft) {
                            onSwipeLeft()
                        }
                    }
                }
            } else {
                // Vertical swipe
                if (Math.abs(deltaY) > minSwipeDistance) {
                    if (deltaY > 0) {
                        // Swipe down - refresh
                        if (onSwipeDown) {
                            onSwipeDown()
                        } else {
                            // Trigger refresh event
                            const event = new CustomEvent('trigger-refresh')
                            window.dispatchEvent(event)
                        }
                    } else {
                        // Swipe up - custom action
                        if (onSwipeUp) {
                            onSwipeUp()
                        }
                    }
                }
            }
            
            // Reset values
            touchStartX.current = 0
            touchStartY.current = 0
            touchEndX.current = 0
            touchEndY.current = 0
        }

        // Add touch event listeners
        document.addEventListener('touchstart', handleTouchStart, { passive: true })
        document.addEventListener('touchmove', handleTouchMove, { passive: true })
        document.addEventListener('touchend', handleTouchEnd)

        return () => {
            document.removeEventListener('touchstart', handleTouchStart)
            document.removeEventListener('touchmove', handleTouchMove)
            document.removeEventListener('touchend', handleTouchEnd)
        }
    }, [enabled, onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, router])
}
