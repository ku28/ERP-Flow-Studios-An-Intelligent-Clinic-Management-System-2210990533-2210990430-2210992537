let mobilePermissionsInitialized = false

type PermissionLike = 'camera' | 'microphone' | 'geolocation'

async function getPermissionState(name: PermissionLike): Promise<PermissionState | 'unknown'> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'unknown'

  try {
    const status = await navigator.permissions.query({ name: name as PermissionName })
    return status.state
  } catch {
    return 'unknown'
  }
}

async function requestCameraPermission() {
  const state = await getPermissionState('camera')
  if (state === 'granted' || state === 'denied') return
  if (!navigator.mediaDevices?.getUserMedia) return

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true })
    stream.getTracks().forEach(track => track.stop())
  } catch {
    // User can later enable permission from Android app settings.
  }
}

async function requestMicrophonePermission() {
  const state = await getPermissionState('microphone')
  if (state === 'granted' || state === 'denied') return
  if (!navigator.mediaDevices?.getUserMedia) return

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    stream.getTracks().forEach(track => track.stop())
  } catch {
    // User can later enable permission from Android app settings.
  }
}

async function requestLocationPermission() {
  const state = await getPermissionState('geolocation')
  if (state === 'granted' || state === 'denied') return
  if (!navigator.geolocation?.getCurrentPosition) return

  await new Promise<void>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      () => resolve(),
      () => resolve(),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    )
  })
}

export async function initializeAndroidPermissions() {
  if (typeof window === 'undefined' || mobilePermissionsInitialized) return

  const cap = (window as any).Capacitor
  if (!cap?.isNativePlatform || !cap.isNativePlatform()) return
  if (typeof cap.getPlatform !== 'function' || cap.getPlatform() !== 'android') return

  mobilePermissionsInitialized = true

  await requestCameraPermission()
  await requestMicrophonePermission()
  await requestLocationPermission()
}
