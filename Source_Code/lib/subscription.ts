export type SubscriptionPlan = 'basic' | 'standard' | 'basic_ai_ocr' | 'standard_ai_ocr' | 'pro'

export type SubscriptionFeature =
	| 'export'
	| 'admin_settings'
	| 'upload_bill'
	| 'aadhaar_scanning'

type PlanPolicy = {
	id: SubscriptionPlan
	label: string
	tokenTtlSeconds: number
	userLimitTotal?: number
	roleLimits?: Partial<Record<'admin' | 'doctor' | 'staff', number>>
	trialDays?: number
	blockedFeatures?: SubscriptionFeature[]
}

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60
const SIX_HOURS_SECONDS = 6 * 60 * 60

export const PLAN_POLICIES: Record<SubscriptionPlan, PlanPolicy> = {
	basic: {
		id: 'basic',
		label: 'Basic',
		tokenTtlSeconds: SIX_HOURS_SECONDS,
		trialDays: 14,
		userLimitTotal: 3,
		roleLimits: {
			admin: 1,
			doctor: 1,
			staff: 1,
		},
		blockedFeatures: ['export', 'admin_settings', 'upload_bill', 'aadhaar_scanning'],
	},
	standard: {
		id: 'standard',
		label: 'Standard',
		tokenTtlSeconds: THIRTY_DAYS_SECONDS,
		trialDays: 14,
	},
	basic_ai_ocr: {
		id: 'basic_ai_ocr',
		label: 'Basic + AI OCR',
		tokenTtlSeconds: THIRTY_DAYS_SECONDS,
		trialDays: 14,
	},
	standard_ai_ocr: {
		id: 'standard_ai_ocr',
		label: 'Standard + AI OCR',
		tokenTtlSeconds: THIRTY_DAYS_SECONDS,
		trialDays: 14,
	},
	pro: {
		id: 'pro',
		label: 'Pro',
		tokenTtlSeconds: THIRTY_DAYS_SECONDS,
		trialDays: 7,
	},
}

export function normalizeSubscriptionPlan(plan?: string | null): SubscriptionPlan {
	if (!plan) return 'standard'
	if (plan === 'basic' || plan === 'standard' || plan === 'basic_ai_ocr' || plan === 'standard_ai_ocr' || plan === 'pro') return plan
	return 'standard'
}

export function getPlanPolicy(plan?: string | null): PlanPolicy {
	const normalized = normalizeSubscriptionPlan(plan)
	return PLAN_POLICIES[normalized]
}

export function isBasicPlan(plan?: string | null): boolean {
	return normalizeSubscriptionPlan(plan) === 'basic'
}

export function getSessionTtlSeconds(plan?: string | null): number {
	return getPlanPolicy(plan).tokenTtlSeconds
}

export function getPlanDisplayName(plan?: string | null): string {
	return getPlanPolicy(plan).label
}

export function isFeatureAllowed(plan: string | null | undefined, feature: SubscriptionFeature): boolean {
	const policy = getPlanPolicy(plan)
	return !(policy.blockedFeatures || []).includes(feature)
}

export function getPlanUserLimits(plan?: string | null) {
	const policy = getPlanPolicy(plan)
	return {
		total: policy.userLimitTotal,
		roleLimits: policy.roleLimits || {},
	}
}

export function getTrialEndsAtFromNow(plan?: string | null): Date | null {
	const days = getPlanPolicy(plan).trialDays
	if (!days) return null
	return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

export function canAssignRoleForBasicPlan(
	role: string,
	currentUsers: Array<{ id: number; role: string }>,
	excludeUserId?: number
): { allowed: boolean; reason?: string } {
	const trackedRoles = new Set(['admin', 'doctor', 'staff'])
	if (!trackedRoles.has(role)) {
		return { allowed: false, reason: 'Basic plan supports only admin, doctor, and staff roles.' }
	}

	const users = currentUsers.filter((u) => u.id !== excludeUserId)
	if (users.length >= 3) {
		return { allowed: false, reason: 'Basic plan allows a maximum of 3 users.' }
	}

	const roleCount = users.filter((u) => u.role === role).length
	if (roleCount >= 1) {
		return { allowed: false, reason: `Basic plan allows only one ${role}.` }
	}

	return { allowed: true }
}
