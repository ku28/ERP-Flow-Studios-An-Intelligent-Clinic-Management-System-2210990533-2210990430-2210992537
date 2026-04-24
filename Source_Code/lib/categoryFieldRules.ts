export type CategoryFieldKey =
    | 'spagyricComponents'
    | 'additions'
    | 'bottleSize'
    | 'dropper'
    | 'quantity'
    | 'timing'
    | 'doseQuantity'
    | 'doseTiming'
    | 'dilution'
    | 'procedure'
    | 'presentation'
    | 'administration'

export type CategoryFieldVisibility = Record<CategoryFieldKey, boolean>
export type CategoryFieldRulesMap = Record<string, CategoryFieldVisibility>
export interface CategoryRuleGroup {
    key: string
    aliases: string[]
}

export const DEFAULT_CATEGORY_RULE_KEY = 'DEFAULT'

export const CATEGORY_RULE_FIELD_ORDER: CategoryFieldKey[] = [
    'spagyricComponents',
    'additions',
    'bottleSize',
    'dropper',
    'quantity',
    'timing',
    'doseQuantity',
    'doseTiming',
    'dilution',
    'procedure',
    'presentation',
    'administration',
]

export const CATEGORY_RULE_FIELD_LABELS: Record<CategoryFieldKey, string> = {
    spagyricComponents: 'SPY Components',
    additions: 'Additions',
    bottleSize: 'Bottle Size',
    dropper: 'Dropper',
    quantity: 'Quantity',
    timing: 'Timing',
    doseQuantity: 'Dose Qty',
    doseTiming: 'Frequency',
    dilution: 'Along With',
    procedure: 'Instruction',
    presentation: 'Presentation',
    administration: 'Site',
}

const NO_BOTTLE_CATEGORIES = [
    'TABLET',
    'TABLETS',
    'TAB',
    'TABS',
    'CAPSULE',
    'CAPSULES',
    'CAP',
    'CAPS',
    'OIL',
    'OILS',
    'SOAP',
    'SOAPS',
    'SHAMPOO',
    'SHAMPOOS',
    'OINTMENT',
    'OINTMENTS',
    'OINT',
]

const LEGACY_DROPPER_CATEGORIES = [
    'DROPS',
    'DROPS30ML',
    'DROPSR24R33',
    'ECODROPS30ML',
    'EENDROPS',
    'SPECIALDROPS',
    'NEWSPDROPS',
]

const EXPLICIT_CATEGORY_KEYS = [
    ...NO_BOTTLE_CATEGORIES,
    ...LEGACY_DROPPER_CATEGORIES,
    'DILUTIONS',
    'SYRUPS100ML',
    'SYRUPS200ML',
]

const CATEGORY_ALIAS_GROUPS: Array<{ canonicalKey: string; aliases: string[]; label: string }> = [
    {
        canonicalKey: 'DILUTIONS',
        aliases: ['DILUTION', 'DILUTIONS'],
        label: 'Dilutions',
    },
    {
        canonicalKey: 'TABLETS',
        aliases: ['TABLET', 'TABLETS', 'TAB', 'TABS'],
        label: 'Tablets / Tabs',
    },
    {
        canonicalKey: 'CAPSULES',
        aliases: ['CAPSULE', 'CAPSULES', 'CAP', 'CAPS'],
        label: 'Capsules',
    },
    {
        canonicalKey: 'OILS',
        aliases: ['OIL', 'OILS'],
        label: 'Oil',
    },
    {
        canonicalKey: 'SOAPS',
        aliases: ['SOAP', 'SOAPS'],
        label: 'Soap',
    },
    {
        canonicalKey: 'SHAMPOOS',
        aliases: ['SHAMPOO', 'SHAMPOOS'],
        label: 'Shampoo',
    },
    {
        canonicalKey: 'OINTMENTS',
        aliases: ['OINTMENT', 'OINTMENTS', 'OINT'],
        label: 'Ointment',
    },
]

const CATEGORY_ALIAS_LABEL_BY_CANONICAL = new Map<string, string>(
    CATEGORY_ALIAS_GROUPS.map((group) => [group.canonicalKey, group.label])
)

const CATEGORY_ALIAS_VALUES_BY_CANONICAL = new Map<string, string>(
    CATEGORY_ALIAS_GROUPS.map((group) => {
        const canonical = normalizeCategoryRuleToken(group.canonicalKey)
        const aliases = Array.from(
            new Set([
                group.canonicalKey,
                ...group.aliases,
            ].map((value) => normalizeCategoryRuleToken(value)).filter(Boolean))
        )
        return [canonical, aliases.join(',')]
    })
)

function normalizeCategoryRuleToken(value: string): string {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

const CATEGORY_ALIAS_LOOKUP = (() => {
    const lookup = new Map<string, string>()
    CATEGORY_ALIAS_GROUPS.forEach((group) => {
        const canonical = normalizeCategoryRuleToken(group.canonicalKey)
        lookup.set(canonical, canonical)
        group.aliases.forEach((alias) => {
            lookup.set(normalizeCategoryRuleToken(alias), canonical)
        })
    })
    return lookup
})()

export const CATEGORY_RULE_PRESET_KEYS = Array.from(
    new Set(EXPLICIT_CATEGORY_KEYS.map((key) => normalizeCategoryRuleKey(key)))
)

const NO_BOTTLE_CATEGORY_SET = new Set(NO_BOTTLE_CATEGORIES.map((key) => normalizeCategoryRuleKey(key)))
const LEGACY_DROPPER_CATEGORY_SET = new Set(LEGACY_DROPPER_CATEGORIES.map((key) => normalizeCategoryRuleKey(key)))

const DEFAULT_CATEGORY_VISIBILITY: CategoryFieldVisibility = {
    spagyricComponents: true,
    additions: true,
    bottleSize: true,
    dropper: false,
    quantity: true,
    timing: true,
    doseQuantity: true,
    doseTiming: true,
    dilution: true,
    procedure: true,
    presentation: true,
    administration: true,
}

function cloneVisibility(visibility: CategoryFieldVisibility): CategoryFieldVisibility {
    return {
        spagyricComponents: visibility.spagyricComponents,
        additions: visibility.additions,
        bottleSize: visibility.bottleSize,
        dropper: visibility.dropper,
        quantity: visibility.quantity,
        timing: visibility.timing,
        doseQuantity: visibility.doseQuantity,
        doseTiming: visibility.doseTiming,
        dilution: visibility.dilution,
        procedure: visibility.procedure,
        presentation: visibility.presentation,
        administration: visibility.administration,
    }
}

export function normalizeCategoryRuleKey(value: string): string {
    const normalized = normalizeCategoryRuleToken(value)
    return CATEGORY_ALIAS_LOOKUP.get(normalized) || normalized
}

export function getCategoryRuleDisplayLabel(key: string): string {
    const normalized = normalizeCategoryRuleKey(key)
    if (!normalized) return ''
    if (normalized === DEFAULT_CATEGORY_RULE_KEY) return 'Default (all other categories)'
    return CATEGORY_ALIAS_LABEL_BY_CANONICAL.get(normalized) || normalized
}

export function getCategoryRuleAliases(key: string): string[] {
    const normalized = normalizeCategoryRuleKey(key)
    const serialized = CATEGORY_ALIAS_VALUES_BY_CANONICAL.get(normalized)
    if (!serialized) return []
    return serialized.split(',').filter(Boolean)
}

export function groupCategoryNamesByRuleKey(categoryNames: string[]): CategoryRuleGroup[] {
    const grouped = new Map<string, Set<string>>()

    categoryNames.forEach((rawName) => {
        const trimmedName = String(rawName || '').trim()
        if (!trimmedName) return

        const key = normalizeCategoryRuleKey(trimmedName)
        if (!key || key === DEFAULT_CATEGORY_RULE_KEY) return

        if (!grouped.has(key)) {
            grouped.set(key, new Set<string>())
        }
        grouped.get(key)?.add(trimmedName)
    })

    return Array.from(grouped.entries())
        .map(([key, aliases]) => ({
            key,
            aliases: Array.from(aliases).sort((a, b) => a.localeCompare(b)),
        }))
        .sort((a, b) => a.key.localeCompare(b.key))
}

function normalizeVisibility(
    rawVisibility: unknown,
    fallback: CategoryFieldVisibility
): CategoryFieldVisibility {
    const normalized = cloneVisibility(fallback)
    if (!rawVisibility || typeof rawVisibility !== 'object' || Array.isArray(rawVisibility)) {
        return normalized
    }

    const typedRaw = rawVisibility as Partial<Record<CategoryFieldKey, unknown>>
    CATEGORY_RULE_FIELD_ORDER.forEach((field) => {
        if (typeof typedRaw[field] === 'boolean') {
            normalized[field] = typedRaw[field] as boolean
        }
    })

    return normalized
}

export function createCurrentCategoryFieldRulesBaseline(): CategoryFieldRulesMap {
    const rules: CategoryFieldRulesMap = {
        [DEFAULT_CATEGORY_RULE_KEY]: cloneVisibility(DEFAULT_CATEGORY_VISIBILITY),
    }

    CATEGORY_RULE_PRESET_KEYS.forEach((categoryKey) => {
        const rule = cloneVisibility(DEFAULT_CATEGORY_VISIBILITY)
        if (NO_BOTTLE_CATEGORY_SET.has(categoryKey)) {
            rule.bottleSize = false
        }
        if (LEGACY_DROPPER_CATEGORY_SET.has(categoryKey)) {
            rule.dropper = true
        }
        rules[categoryKey] = rule
    })

    return rules
}

export function normalizeCategoryFieldRules(rawRules: unknown): CategoryFieldRulesMap {
    const baseline = createCurrentCategoryFieldRulesBaseline()

    if (!rawRules || typeof rawRules !== 'object' || Array.isArray(rawRules)) {
        return baseline
    }

    const typedRules = rawRules as Record<string, unknown>

    Object.entries(typedRules).forEach(([rawCategoryKey, rawVisibility]) => {
        const categoryKey = normalizeCategoryRuleKey(rawCategoryKey)
        if (!categoryKey) return
        const fallback = baseline[categoryKey] || baseline[DEFAULT_CATEGORY_RULE_KEY]
        baseline[categoryKey] = normalizeVisibility(rawVisibility, fallback)
    })

    return baseline
}

export function hasCategoryFieldRule(rawRules: unknown, categoryKey: string): boolean {
    if (!rawRules || typeof rawRules !== 'object' || Array.isArray(rawRules)) {
        return false
    }

    const normalizedCategory = normalizeCategoryRuleKey(categoryKey)
    if (!normalizedCategory) return false

    return Object.keys(rawRules as Record<string, unknown>).some(
        (key) => normalizeCategoryRuleKey(key) === normalizedCategory
    )
}

export function getCategoryFieldVisibility(
    rawRules: unknown,
    categoryKey: string
): CategoryFieldVisibility {
    const normalizedRules = normalizeCategoryFieldRules(rawRules)
    const normalizedCategory = normalizeCategoryRuleKey(categoryKey)

    if (normalizedCategory && normalizedRules[normalizedCategory]) {
        return cloneVisibility(normalizedRules[normalizedCategory])
    }

    const fallback = cloneVisibility(normalizedRules[DEFAULT_CATEGORY_RULE_KEY])

    // Preserve existing behavior for not-explicitly-configured categories.
    if (normalizedCategory.includes('DROPS')) {
        fallback.dropper = true
    }
    if (NO_BOTTLE_CATEGORY_SET.has(normalizedCategory)) {
        fallback.bottleSize = false
    }

    return fallback
}
