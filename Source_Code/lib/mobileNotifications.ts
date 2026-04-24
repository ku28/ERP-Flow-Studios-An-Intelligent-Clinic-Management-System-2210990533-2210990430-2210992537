let mobileNotificationsInitialized = false
let mobileDownloadChannelInitialized = false

async function getAndroidLocalNotifications() {
  if (typeof window === 'undefined') return null

  const cap = (window as any).Capacitor
  if (!cap?.isNativePlatform || !cap.isNativePlatform()) return null

  const [{ Capacitor }, localModule] = await Promise.all([
    import('@capacitor/core'),
    import('@capacitor/local-notifications')
  ])

  if (Capacitor.getPlatform() !== 'android') return null
  return localModule.LocalNotifications
}

function getNextTime(hour: number, minute: number) {
  const now = new Date()
  const at = new Date()
  at.setHours(hour, minute, 0, 0)
  if (at <= now) {
    at.setDate(at.getDate() + 1)
  }
  return at
}

function todayKey() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export async function initializeMobileNotifications() {
  if (typeof window === 'undefined' || mobileNotificationsInitialized) return

  const cap = (window as any).Capacitor
  if (!cap?.isNativePlatform || !cap.isNativePlatform()) return

  mobileNotificationsInitialized = true

  const [{ Capacitor }, pushModule, localModule] = await Promise.all([
    import('@capacitor/core'),
    import('@capacitor/push-notifications'),
    import('@capacitor/local-notifications')
  ])

  if (Capacitor.getPlatform() !== 'android') return

  const { PushNotifications } = pushModule
  const { LocalNotifications } = localModule

  const pushPermission = await PushNotifications.requestPermissions()
  if (pushPermission.receive === 'granted') {
    await PushNotifications.register()
  }

  await LocalNotifications.requestPermissions()

  await LocalNotifications.createChannel({
    id: 'erp-daily-reminders',
    name: 'ERP Daily Reminders',
    importance: 3,
    visibility: 1
  })

  await LocalNotifications.cancel({
    notifications: [{ id: 9301 }, { id: 2030 }]
  })

  await LocalNotifications.schedule({
    notifications: [
      {
        id: 9301,
        title: 'Good Morning',
        body: 'Time to start using ERP Flow Studios and manage your clinic tasks.',
        schedule: {
          at: getNextTime(9, 30),
          repeats: true,
          allowWhileIdle: true
        },
        channelId: 'erp-daily-reminders'
      }
    ]
  })

  const day = todayKey()
  localStorage.setItem('erpLastUsageDate', day)
  const now = new Date()
  const evening = new Date()
  evening.setHours(20, 30, 0, 0)

  if (localStorage.getItem('erpLastUsageDate') === day && now < evening) {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: 2030,
          title: 'Thank You',
          body: 'Thanks for using ERP Flow Studios today.',
          schedule: { at: evening, allowWhileIdle: true },
          channelId: 'erp-daily-reminders'
        }
      ]
    })
  }

  PushNotifications.addListener('registration', async (token) => {
    try {
      await fetch('/api/save-device-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: token.value, platform: 'android' })
      })
    } catch {
      // Ignore token save errors on client; backend logs should be inspected.
    }
  })

  PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
    const taskId = notification.notification?.data?.taskId
    if (taskId) {
      window.location.href = '/tasks'
    }
  })
}

export async function notifyAndroidDownloadProgress(title: string, body: string) {
  try {
    const LocalNotifications = await getAndroidLocalNotifications()
    if (!LocalNotifications) return false

    await LocalNotifications.requestPermissions()

    if (!mobileDownloadChannelInitialized) {
      await LocalNotifications.createChannel({
        id: 'erp-download-status',
        name: 'Download Status',
        importance: 3,
        visibility: 1
      })
      mobileDownloadChannelInitialized = true
    }

    const id = Math.floor(Date.now() % 2000000000)
    await LocalNotifications.schedule({
      notifications: [
        {
          id,
          title,
          body,
          channelId: 'erp-download-status',
          schedule: {
            at: new Date(Date.now() + 25),
            allowWhileIdle: true
          }
        }
      ]
    })

    return true
  } catch {
    return false
  }
}
