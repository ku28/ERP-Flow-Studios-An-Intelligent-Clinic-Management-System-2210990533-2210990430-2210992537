import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type ScrollAxis = 'vertical' | 'both'
type ScrollDensity = 'comfortable' | 'compact'
type TouchVariant = 'auto' | 'always' | 'never'

interface ThemedScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode
    axis?: ScrollAxis
    density?: ScrollDensity
    touchVariant?: TouchVariant
    shellClassName?: string
    viewportElementRef?: React.Ref<HTMLDivElement>
}

export default function ThemedScrollArea({
    children,
    className = '',
    axis = 'vertical',
    density = 'comfortable',
    touchVariant = 'auto',
    shellClassName = '',
    viewportElementRef,
    ...rest
}: ThemedScrollAreaProps) {
    const viewportRef = useRef<HTMLDivElement | null>(null)
    const railRef = useRef<HTMLDivElement | null>(null)
    const thumbRef = useRef<HTMLDivElement | null>(null)
    const rafIdRef = useRef<number | null>(null)
    const thumbTopRef = useRef(0)
    const thumbHeightRef = useRef(44)
    const lastAppliedTopRef = useRef(-1)
    const lastAppliedHeightRef = useRef(-1)
    const dragStateRef = useRef<{
        active: boolean
        pointerId: number
        startY: number
        startTop: number
    }>({
        active: false,
        pointerId: -1,
        startY: 0,
        startTop: 0,
    })

    const [isScrollable, setIsScrollable] = useState(false)
    const [isTouchInput, setIsTouchInput] = useState(false)

    const axisClass = axis === 'both' ? 'overflow-auto' : 'overflow-y-auto overflow-x-hidden'
    const densityClass = density === 'compact' ? 'efs-scroll-shell--compact' : 'efs-scroll-shell--comfortable'

    const minThumbHeight = density === 'compact' ? 34 : 42

    const applyThumbStyle = useCallback((nextThumbTop: number, nextThumbHeight: number) => {
        const normalizedTop = Math.max(0, nextThumbTop)
        const normalizedHeight = Math.max(minThumbHeight, nextThumbHeight)
        const roundedTop = Math.round(normalizedTop * 100) / 100
        const roundedHeight = Math.round(normalizedHeight * 100) / 100

        thumbTopRef.current = roundedTop
        thumbHeightRef.current = roundedHeight

        if (
            Math.abs(lastAppliedTopRef.current - roundedTop) < 0.2 &&
            Math.abs(lastAppliedHeightRef.current - roundedHeight) < 0.2
        ) {
            return
        }

        lastAppliedTopRef.current = roundedTop
        lastAppliedHeightRef.current = roundedHeight

        const thumb = thumbRef.current
        if (!thumb) return

        thumb.style.height = `${roundedHeight}px`
        thumb.style.transform = `translate3d(0, ${roundedTop}px, 0)`
    }, [minThumbHeight])

    const updateThumbMetrics = useCallback(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        const { scrollTop, scrollHeight, clientHeight } = viewport
        const hasScroll = scrollHeight > clientHeight + 1
        setIsScrollable((prev) => (prev === hasScroll ? prev : hasScroll))

        if (!hasScroll) {
            applyThumbStyle(0, minThumbHeight)
            return
        }

        const computedThumbHeight = Math.max(minThumbHeight, (clientHeight / scrollHeight) * clientHeight)
        const maxThumbTop = Math.max(0, clientHeight - computedThumbHeight)
        const scrollRange = Math.max(1, scrollHeight - clientHeight)
        const scrollProgress = scrollTop / scrollRange
        const computedThumbTop = scrollProgress * maxThumbTop

        applyThumbStyle(computedThumbTop, computedThumbHeight)
    }, [applyThumbStyle, minThumbHeight])

    const scheduleThumbMetricsUpdate = useCallback(() => {
        if (rafIdRef.current !== null) return

        rafIdRef.current = window.requestAnimationFrame(() => {
            rafIdRef.current = null
            updateThumbMetrics()
        })
    }, [updateThumbMetrics])

    useEffect(() => {
        if (touchVariant === 'always') {
            setIsTouchInput(true)
            return
        }

        if (touchVariant === 'never') {
            setIsTouchInput(false)
            return
        }

        const detectTouchInput = () => {
            const coarsePointer = typeof window.matchMedia === 'function'
                ? window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(any-pointer: coarse)').matches
                : false

            const touchPoints = typeof navigator !== 'undefined' && typeof navigator.maxTouchPoints === 'number'
                ? navigator.maxTouchPoints > 0
                : false

            setIsTouchInput(coarsePointer || touchPoints)
        }

        detectTouchInput()
        window.addEventListener('resize', detectTouchInput)

        return () => {
            window.removeEventListener('resize', detectTouchInput)
        }
    }, [touchVariant])

    useEffect(() => {
        updateThumbMetrics()
    }, [children, className, axis, density, updateThumbMetrics])

    useEffect(() => {
        const viewport = viewportRef.current
        if (!viewport) return

        const onScroll = () => scheduleThumbMetricsUpdate()
        viewport.addEventListener('scroll', onScroll, { passive: true })

        const resizeObserver = new ResizeObserver(() => scheduleThumbMetricsUpdate())
        resizeObserver.observe(viewport)

        window.addEventListener('resize', scheduleThumbMetricsUpdate)

        return () => {
            viewport.removeEventListener('scroll', onScroll)
            resizeObserver.disconnect()
            window.removeEventListener('resize', scheduleThumbMetricsUpdate)
            if (rafIdRef.current !== null) {
                window.cancelAnimationFrame(rafIdRef.current)
                rafIdRef.current = null
            }
        }
    }, [scheduleThumbMetricsUpdate])

    const setScrollTopFromThumbTop = useCallback((nextThumbTop: number) => {
        const viewport = viewportRef.current
        if (!viewport) return

        const maxThumbTop = Math.max(1, viewport.clientHeight - thumbHeightRef.current)
        const thumbProgress = Math.max(0, Math.min(nextThumbTop, maxThumbTop)) / maxThumbTop
        const nextScrollTop = thumbProgress * (viewport.scrollHeight - viewport.clientHeight)
        viewport.scrollTop = nextScrollTop
    }, [])

    const onThumbPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        event.preventDefault()
        event.stopPropagation()

        dragStateRef.current = {
            active: true,
            pointerId: event.pointerId,
            startY: event.clientY,
            startTop: thumbTopRef.current,
        }

        ;(event.currentTarget as HTMLDivElement).setPointerCapture(event.pointerId)
        document.body.classList.add('efs-scroll-dragging')
    }, [])

    const onThumbPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const dragState = dragStateRef.current
        if (!dragState.active || dragState.pointerId !== event.pointerId) return

        const deltaY = event.clientY - dragState.startY
        const nextThumbTop = dragState.startTop + deltaY
        setScrollTopFromThumbTop(nextThumbTop)
    }, [setScrollTopFromThumbTop])

    const stopDragging = useCallback((pointerId?: number) => {
        const dragState = dragStateRef.current
        if (!dragState.active) return
        if (typeof pointerId === 'number' && pointerId !== dragState.pointerId) return

        dragStateRef.current = {
            active: false,
            pointerId: -1,
            startY: 0,
            startTop: 0,
        }
        document.body.classList.remove('efs-scroll-dragging')
    }, [])

    const onThumbPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        stopDragging(event.pointerId)
    }, [stopDragging])

    const onThumbPointerCancel = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        stopDragging(event.pointerId)
    }, [stopDragging])

    const onRailPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const rail = railRef.current
        if (!rail) return

        const clickedThumb = (event.target as HTMLElement).closest('.efs-scroll-thumb')
        if (clickedThumb) return

        const railRect = rail.getBoundingClientRect()
        const localY = event.clientY - railRect.top
        const centeredThumbTop = localY - thumbHeightRef.current / 2
        setScrollTopFromThumbTop(centeredThumbTop)
    }, [setScrollTopFromThumbTop])

    useEffect(() => {
        return () => {
            document.body.classList.remove('efs-scroll-dragging')
        }
    }, [])

    const resolvedShellClassName = useMemo(
        () => ['efs-scroll-shell', densityClass, isTouchInput ? 'efs-scroll-shell--touch' : 'efs-scroll-shell--desktop', shellClassName].filter(Boolean).join(' '),
        [densityClass, isTouchInput, shellClassName]
    )

    const viewportClassName = useMemo(
        () => ['efs-scroll-viewport', axisClass, className].filter(Boolean).join(' '),
        [axisClass, className]
    )

    const setViewportElementRef = useCallback((node: HTMLDivElement | null) => {
        viewportRef.current = node

        if (!viewportElementRef) return

        if (typeof viewportElementRef === 'function') {
            viewportElementRef(node)
            return
        }

        if ('current' in viewportElementRef) {
            ;(viewportElementRef as React.MutableRefObject<HTMLDivElement | null>).current = node
        }
    }, [viewportElementRef])

    return (
        <div className={resolvedShellClassName}>
            <div ref={setViewportElementRef} className={viewportClassName} {...rest}>
                {children}
            </div>

            {isScrollable && (
                <div ref={railRef} className="efs-scroll-rail" onPointerDown={onRailPointerDown}>
                    <div
                        ref={thumbRef}
                        className="efs-scroll-thumb"
                        style={{ height: `${thumbHeightRef.current}px`, transform: `translate3d(0, ${thumbTopRef.current}px, 0)` }}
                        onPointerDown={onThumbPointerDown}
                        onPointerMove={onThumbPointerMove}
                        onPointerUp={onThumbPointerUp}
                        onPointerCancel={onThumbPointerCancel}
                    >
                        <span className="efs-scroll-orb" aria-hidden="true" />
                    </div>
                </div>
            )}
        </div>
    )
}
