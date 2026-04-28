/**
 * Semantic Versioning Utility
 * Provides proper SemVer comparison (not string comparison).
 * Follows the SemVer 2.0 specification for major.minor.patch format.
 */

export interface ParsedVersion {
    major: number
    minor: number
    patch: number
    raw: string
}

/**
 * Parse a version string into its components.
 * Supports formats: "1.2.3", "v1.2.3", "1.2", "1"
 */
export function parseVersion(version: string): ParsedVersion | null {
    if (!version) return null
    const cleaned = version.replace(/^v/i, '').trim()
    const parts = cleaned.split('.').map(Number)
    if (parts.some(isNaN)) return null
    return {
        major: parts[0] || 0,
        minor: parts[1] || 0,
        patch: parts[2] || 0,
        raw: cleaned
    }
}

/**
 * Compare two version strings.
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
export function compareVersions(a: string, b: string): number {
    const vA = parseVersion(a)
    const vB = parseVersion(b)
    if (!vA || !vB) return 0

    if (vA.major !== vB.major) return vA.major > vB.major ? 1 : -1
    if (vA.minor !== vB.minor) return vA.minor > vB.minor ? 1 : -1
    if (vA.patch !== vB.patch) return vA.patch > vB.patch ? 1 : -1
    return 0
}

/**
 * Check if version A is greater than version B.
 */
export function isNewerVersion(a: string, b: string): boolean {
    return compareVersions(a, b) > 0
}

/**
 * Check if the version bump is a major change (X.0.0).
 */
export function isMajorBump(newVersion: string, oldVersion: string): boolean {
    const vNew = parseVersion(newVersion)
    const vOld = parseVersion(oldVersion)
    if (!vNew || !vOld) return false
    return vNew.major > vOld.major
}

/**
 * Check if the version bump is a minor change (x.Y.0).
 */
export function isMinorBump(newVersion: string, oldVersion: string): boolean {
    const vNew = parseVersion(newVersion)
    const vOld = parseVersion(oldVersion)
    if (!vNew || !vOld) return false
    return vNew.major === vOld.major && vNew.minor > vOld.minor
}

/**
 * Check if the version bump is a patch change (x.y.Z).
 */
export function isPatchBump(newVersion: string, oldVersion: string): boolean {
    const vNew = parseVersion(newVersion)
    const vOld = parseVersion(oldVersion)
    if (!vNew || !vOld) return false
    return vNew.major === vOld.major && vNew.minor === vOld.minor && vNew.patch > vOld.patch
}

/**
 * Format a version to a standardized string.
 */
export function formatVersion(version: string): string {
    const parsed = parseVersion(version)
    if (!parsed) return version
    return `${parsed.major}.${parsed.minor}.${parsed.patch}`
}

/**
 * Determine the display behavior for a release based on its type.
 * - 'modal': Full-screen centered modal (major releases)
 * - 'banner': Dismissible top banner (feature/improvement releases)
 * - 'silent': No notification (bugfix/security/patch releases)
 */
export function getReleaseDisplayType(releaseType: string): 'modal' | 'banner' | 'silent' {
    switch (releaseType) {
        case 'major':
            return 'modal'
        case 'feature':
        case 'improvement':
            return 'banner'
        case 'bugfix':
        case 'security':
        default:
            return 'silent'
    }
}
