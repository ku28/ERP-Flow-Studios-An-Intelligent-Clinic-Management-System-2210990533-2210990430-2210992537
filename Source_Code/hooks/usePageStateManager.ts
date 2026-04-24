import React, { useEffect, useCallback, useRef } from 'react'
import { usePageState } from '../contexts/PageStateContext'

/**
 * Hook to automatically save and restore component page state across navigation
 * 
 * Usage:
 *   const { restoredState } = usePageStateManager()
 *   
 *   useEffect(() => {
 *     if (restoredState?.searchQuery) setSearchQuery(restoredState.searchQuery)
 *   }, [restoredState])
 *   
 *   useEffect(() => {
 *     savePageState({ searchQuery, filters, scrollPosition })
 *   }, [searchQuery, filters, scrollPosition])
 */
export function usePageStateManager() {
  const { restoredState, saveState, clearState, registerListener } = usePageState()
  const stateRef = useRef<Record<string, any>>({})

  // Save state whenever it changes
  const savePageState = useCallback((state: Record<string, any>) => {
    stateRef.current = state
    saveState(state)
  }, [saveState])

  const clearPageState = useCallback(() => {
    stateRef.current = {}
    clearState()
  }, [clearState])

  // Support for listeners if needed
  const onStateRestore = useCallback(
    (callback: (state: Record<string, any>) => void) => registerListener(callback),
    [registerListener]
  )

  return {
    restoredState: restoredState || {},
    savePageState,
    clearPageState,
    onStateRestore,
  }
}

/**
 * Hook to preserve specific state values across page navigation
 * 
 * Usage:
 *   const [searchQuery, setSearchQuery] = usePersistedState('searchQuery', '')
 *   const [filters, setFilters] = usePersistedState('filters', {})
 */
export function usePersistedState<T = any>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = React.useState(initialValue)
  const { restoredState, savePageState } = usePageStateManager()

  // Restore from page state on mount
  React.useEffect(() => {
    if (restoredState && key in restoredState) {
      setState(restoredState[key])
    }
  }, [restoredState, key])

  // Save to page state whenever state changes
  const handleStateChange = useCallback((nextValue: T | ((prev: T) => T)) => {
    const finalValue = typeof nextValue === 'function' ? (nextValue as (prev: T) => T)(state) : nextValue
    setState(finalValue)
    savePageState({ ...restoredState, [key]: finalValue })
  }, [key, state, restoredState, savePageState])

  return [state, handleStateChange]
}

/**
 * Hook to auto-save scroll position across page navigation
 * 
 * Usage:
 *   const scrollRef = useScrollPosition()
 *   <div ref={scrollRef} className="overflow-auto">...</div>
 */
export function useScrollPosition() {
  const { restoredState, savePageState } = usePageStateManager()
  const containerRef = useRef<HTMLDivElement>(null)

  // Restore scroll position on mount
  useEffect(() => {
    if (restoredState?.scrollPosition && containerRef.current) {
      setTimeout(() => {
        if (containerRef.current) {
          containerRef.current.scrollTop = restoredState.scrollPosition
        }
      }, 0)
    }
  }, [restoredState])

  // Save scroll position on scroll
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleScroll = () => {
      savePageState({
        ...restoredState,
        scrollPosition: container.scrollTop,
      })
    }

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [restoredState, savePageState])

  return containerRef
}
