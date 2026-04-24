import fs from 'fs/promises'
import path from 'path'

const REGISTRY_FILE = path.join(process.cwd(), 'data', 'trial-usage.json')

interface TrialUsageEntry {
    email: string
    firstUsedAt: string
    source?: string
}

async function ensureRegistryFile() {
    try {
        await fs.access(REGISTRY_FILE)
    } catch {
        await fs.mkdir(path.dirname(REGISTRY_FILE), { recursive: true })
        await fs.writeFile(REGISTRY_FILE, '[]', 'utf-8')
    }
}

async function readRegistry(): Promise<TrialUsageEntry[]> {
    await ensureRegistryFile()
    const raw = await fs.readFile(REGISTRY_FILE, 'utf-8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
}

async function writeRegistry(entries: TrialUsageEntry[]) {
    await ensureRegistryFile()
    await fs.writeFile(REGISTRY_FILE, JSON.stringify(entries, null, 2), 'utf-8')
}

export function normalizeTrialEmail(email: string): string {
    return String(email || '').trim().toLowerCase()
}

export async function hasAvailedTrial(email: string): Promise<boolean> {
    const normalized = normalizeTrialEmail(email)
    if (!normalized) return false
    const entries = await readRegistry()
    return entries.some((e) => normalizeTrialEmail(e.email) === normalized)
}

export async function markTrialAvailed(email: string, source: string = 'activation') {
    const normalized = normalizeTrialEmail(email)
    if (!normalized) return

    const entries = await readRegistry()
    const exists = entries.some((e) => normalizeTrialEmail(e.email) === normalized)
    if (exists) return

    entries.unshift({
        email: normalized,
        firstUsedAt: new Date().toISOString(),
        source,
    })
    await writeRegistry(entries)
}
