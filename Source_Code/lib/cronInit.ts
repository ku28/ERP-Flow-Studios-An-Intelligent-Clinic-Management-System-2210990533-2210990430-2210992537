import { resetVisionUsage } from './visionService'

let initialized = false

/**
 * Initialize node-cron jobs for local development.
 * In production (Vercel), use the cron routes configured in vercel.json.
 * This is a no-op in browser environments or if already initialized.
 */
export function initCronJobs(): void {
    if (initialized || typeof window !== 'undefined') return
    initialized = true

    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const cron = require('node-cron')

        // Reset Vision OCR usage counter on the 1st of every month at midnight
        cron.schedule('0 0 1 * *', async () => {
            try {
                await resetVisionUsage()
                console.log('[cron] Vision OCR usage reset for new month')
            } catch (err) {
                console.error('[cron] Failed to reset Vision OCR usage:', err)
            }
        })

        console.log('[cron] Scheduled: Vision OCR reset on 1st of each month')
    } catch {
        // node-cron may not be available in all environments; skip silently
    }
}
