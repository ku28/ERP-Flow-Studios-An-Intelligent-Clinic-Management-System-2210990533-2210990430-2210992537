import React, { createContext, useContext, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/router'

interface PageState {
  [key: string]: any
}

interface PageStateContextType {
  savePageState: (state: PageState) => void
  getPageState: () => PageState | null
  clearPageState: () => void
  registerPageStateListener: (callback: (state: PageState) => void) => () => void
}

const PageStateContext = createContext<PageStateContextType | undefined>(undefined)

const STORAGE_KEY = 'page_state_cache'
const MAX_CACHED_PAGES = 10

export function PageStateProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const stateRef = useRef<Map<string, PageState>>(new Map())
  const listenersRef = useRef<Set<(state: PageState) => void>>(new Set())
  const currentPathRef = useRef<string>('')

  // Initialize from sessionStorage on mount
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        stateRef.current = new Map(Object.entries(parsed))
      }
    } catch (error) {
      console.warn('Failed to restore page state from sessionStorage:', error)
    }
  }, [])

  // Track current path for save/restore
  useEffect(() => {
    currentPathRef.current = router.pathname + (router.asPath.includes('?') ? router.asPath.substring(router.asPath.indexOf('?')) : '')
  }, [router.pathname, router.asPath])

  const savePageState = useCallback((state: PageState) => {
    if (!currentPathRef.current) return

    stateRef.current.set(currentPathRef.current, state)

    // Limit cached pages to prevent excessive memory usage
    if (stateRef.current.size > MAX_CACHED_PAGES) {
      const keys = Array.from(stateRef.current.keys())
      for (let i = 0; i < keys.length - MAX_CACHED_PAGES; i++) {
        stateRef.current.delete(keys[i])
      }
    }

    // Persist to sessionStorage
    try {
      const obj = Object.fromEntries(stateRef.current)
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
    } catch (error) {
      console.warn('Failed to save page state to sessionStorage:', error)
    }
  }, [])

  const getPageState = useCallback((): PageState | null => {
    if (!currentPathRef.current) return null
    return stateRef.current.get(currentPathRef.current) || null
  }, [])

  const clearPageState = useCallback(() => {
    if (!currentPathRef.current) return
    stateRef.current.delete(currentPathRef.current)
    try {
      const obj = Object.fromEntries(stateRef.current)
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
    } catch (error) {
      console.warn('Failed to clear page state in sessionStorage:', error)
    }
  }, [])

  const registerPageStateListener = useCallback((callback: (state: PageState) => void) => {
    listenersRef.current.add(callback)
    return () => {
      listenersRef.current.delete(callback)
    }
  }, [])

  // Notify listeners when state is restored
  const notifyListeners = useCallback(() => {
    const currentState = getPageState()
    if (currentState) {
      listenersRef.current.forEach(listener => listener(currentState))
    }
  }, [getPageState])

  // Trigger restoration when page path changes
  useEffect(() => {
    notifyListeners()
  }, [router.pathname, notifyListeners])

  const value: PageStateContextType = {
    savePageState,
    getPageState,
    clearPageState,
    registerPageStateListener,
  }

  return (
    <PageStateContext.Provider value={value}>
      {children}
    </PageStateContext.Provider>
  )
}

/**
 * Hook to save and restore page state across navigation
 * Usage:
 *   const { state, setState, saveState } = usePageState()
 *   useEffect(() => { saveState() }, [state])
 */
export function usePageState() {
  const context = useContext(PageStateContext)
  if (!context) {
    throw new Error('usePageState must be used within PageStateProvider')
  }

  const [restoredState, setRestoredState] = React.useState<PageState | null>(null)

  // Restore state on mount
  React.useEffect(() => {
    const state = context.getPageState()
    if (state) {
      setRestoredState(state)
    }
  }, [context])

  return {
    restoredState,
    saveState: context.savePageState,
    clearState: context.clearPageState,
    registerListener: context.registerPageStateListener,
  }
}
