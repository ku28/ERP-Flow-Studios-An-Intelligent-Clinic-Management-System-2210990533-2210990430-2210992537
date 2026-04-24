import prisma from './prisma'

const SERVICE_KEY = 'vision_ocr'
const SAFE_LIMIT = 950
const HARD_LIMIT = 1000

async function ensureRow() {
    await prisma.apiUsage.upsert({
        where: { service: SERVICE_KEY },
        create: { service: SERVICE_KEY, usageCount: 0 },
        update: {},
    })
}

export async function checkVisionLimit(): Promise<void> {
    await ensureRow()
    const row = await prisma.apiUsage.findUnique({ where: { service: SERVICE_KEY } })
    if ((row?.usageCount ?? 0) >= SAFE_LIMIT) {
        throw Object.assign(
            new Error(`Google Vision monthly usage limit reached (${row?.usageCount}/${HARD_LIMIT}). Resets on the 1st of next month.`),
            { code: 'VISION_LIMIT_EXCEEDED' }
        )
    }
}

export async function incrementVisionUsage(): Promise<void> {
    await ensureRow()
    await prisma.apiUsage.update({
        where: { service: SERVICE_KEY },
        data: { usageCount: { increment: 1 } },
    })
}

export async function resetVisionUsage(): Promise<void> {
    await ensureRow()
    await prisma.apiUsage.update({
        where: { service: SERVICE_KEY },
        data: { usageCount: 0 },
    })
}

export async function getVisionUsage(): Promise<{ used: number; limit: number; safeLimit: number }> {
    await ensureRow()
    const row = await prisma.apiUsage.findUnique({ where: { service: SERVICE_KEY } })
    return { used: row?.usageCount ?? 0, limit: HARD_LIMIT, safeLimit: SAFE_LIMIT }
}
