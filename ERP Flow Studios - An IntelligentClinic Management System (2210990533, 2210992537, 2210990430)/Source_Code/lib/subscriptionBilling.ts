export const MIN_SUBSCRIPTION_MONTHS = 12

export const LOCKED_BILLING_CYCLES = ['monthly', 'quarterly'] as const

export const MINIMUM_SUBSCRIPTION_TOOLTIP =
  'Monthly and 3-month pricing are shown for reference. A minimum 1-year subscription is required.'

export function isBillingCycleLocked(cycle?: string | null): boolean {
  if (!cycle) return false
  return LOCKED_BILLING_CYCLES.includes(cycle as (typeof LOCKED_BILLING_CYCLES)[number])
}

export function normalizeBillingCycleWithMinimum(cycle?: string | null): 'annual' | 'fiveYear' {
  if (cycle === 'fiveYear') return 'fiveYear'
  return 'annual'
}
