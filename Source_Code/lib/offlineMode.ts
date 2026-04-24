export const OFFLINE_MODE_STORAGE_KEY = 'offline-mode-enabled'
export const OFFLINE_MODE_EVENT = 'offline-mode-changed'

export function isOfflineModeEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(OFFLINE_MODE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setOfflineModeEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(OFFLINE_MODE_STORAGE_KEY, enabled ? '1' : '0')
  } catch {
    // Ignore storage failures and still dispatch event.
  }

  window.dispatchEvent(new CustomEvent(OFFLINE_MODE_EVENT, { detail: { enabled } }))
}

export function getEffectiveOnlineState(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine && !isOfflineModeEnabled()
}
