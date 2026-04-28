import prisma from './prisma'
import { getFirebaseMessaging } from './firebaseAdmin'

type PushPayload = {
    title: string
    body: string
    data?: Record<string, string>
}

const INVALID_TOKEN_ERRORS = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token'
])

export async function sendPushToUser(userId: number, payload: PushPayload) {
    const messaging = getFirebaseMessaging()
    if (!messaging) {
        return { sent: 0, failed: 0, skipped: true }
    }

    const tokens = await prisma.deviceToken.findMany({
        where: { userId, isActive: true },
        select: { id: true, token: true }
    })

    if (!tokens.length) {
        return { sent: 0, failed: 0, skipped: true }
    }

    const response = await messaging.sendEachForMulticast({
        tokens: tokens.map((t : { token: string }) => t.token),
        notification: {
            title: payload.title,
            body: payload.body,
        },
        data: payload.data,
        android: {
            priority: 'high'
        }
    })

    const invalidTokenIds: number[] = []
    response.responses.forEach((result, index) => {
        if (!result.success) {
            const code = result.error?.code || ''
            if (INVALID_TOKEN_ERRORS.has(code)) {
                invalidTokenIds.push(tokens[index].id)
            }
        }
    })

    if (invalidTokenIds.length) {
        await prisma.deviceToken.updateMany({
            where: { id: { in: invalidTokenIds } },
            data: { isActive: false }
        })
    }

    return {
        sent: response.successCount,
        failed: response.failureCount,
        skipped: false
    }
}
