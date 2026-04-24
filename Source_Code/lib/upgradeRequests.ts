import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'

export type UpgradeRequestStatus = 'pending' | 'approved' | 'rejected'
export type UpgradePaymentMethod = 'pay_online' | 'pay_to_owner'
export type UpgradePlan = 'standard' | 'pro'
export type UpgradeBillingCycle = 'annual' | 'fiveYear'

export interface UpgradeRequestEntry {
	token: string
	clinicId: string
	clinicCode: string
	clinicName: string
	adminEmail: string
	adminName?: string | null
	requestedPlan: UpgradePlan
	requestedCycle: UpgradeBillingCycle
	paymentMethod: UpgradePaymentMethod
	amount: number
	couponCode?: string | null
	razorpayPaymentId?: string | null
	status: UpgradeRequestStatus
	createdAt: string
	decidedAt?: string | null
	decidedBy?: string | null
	notes?: string | null
}

const REQUESTS_FILE = path.join(process.cwd(), 'data', 'upgrade-requests.json')

async function ensureRequestsFile() {
	try {
		await fs.access(REQUESTS_FILE)
	} catch {
		await fs.mkdir(path.dirname(REQUESTS_FILE), { recursive: true })
		await fs.writeFile(REQUESTS_FILE, '[]', 'utf-8')
	}
}

async function readRequests(): Promise<UpgradeRequestEntry[]> {
	await ensureRequestsFile()
	const raw = await fs.readFile(REQUESTS_FILE, 'utf-8')
	const parsed = JSON.parse(raw)
	return Array.isArray(parsed) ? parsed : []
}

async function writeRequests(entries: UpgradeRequestEntry[]) {
	await ensureRequestsFile()
	await fs.writeFile(REQUESTS_FILE, JSON.stringify(entries, null, 2), 'utf-8')
}

export function createUpgradeRequestToken(): string {
	return crypto.randomBytes(24).toString('hex')
}

export async function createUpgradeRequest(entry: Omit<UpgradeRequestEntry, 'token' | 'createdAt' | 'status'>) {
	const requests = await readRequests()
	const request: UpgradeRequestEntry = {
		...entry,
		token: createUpgradeRequestToken(),
		createdAt: new Date().toISOString(),
		status: 'pending',
	}
	requests.unshift(request)
	await writeRequests(requests)
	return request
}

export async function getUpgradeRequestByToken(token: string): Promise<UpgradeRequestEntry | null> {
	if (!token) return null
	const requests = await readRequests()
	return requests.find((r) => r.token === token) || null
}

export async function updateUpgradeRequestStatus(token: string, status: 'approved' | 'rejected', decidedBy?: string | null, notes?: string | null) {
	const requests = await readRequests()
	const idx = requests.findIndex((r) => r.token === token)
	if (idx < 0) return null

	const existing = requests[idx]
	const updated: UpgradeRequestEntry = {
		...existing,
		status,
		decidedAt: new Date().toISOString(),
		decidedBy: decidedBy || existing.decidedBy || null,
		notes: notes ?? existing.notes ?? null,
	}
	requests[idx] = updated
	await writeRequests(requests)
	return updated
}
