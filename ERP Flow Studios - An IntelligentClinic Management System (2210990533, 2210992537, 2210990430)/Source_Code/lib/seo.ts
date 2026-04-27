export const SITE_TITLE = 'ERP Flow Studios - An Intelligent Clinic Management System'
export const SITE_NAME = 'ERP Flow Studios'
export const SITE_DESCRIPTION = 'ERP Flow Studios is a modern clinic management ERP designed to help healthcare teams manage doctors, staff, billing, tasks, and workflows efficiently in one secure platform.'
export const SITE_OG_DESCRIPTION = 'Streamline clinic operations with ERP Flow Studios. Manage doctors, staff, tasks, and billing in one platform.'
export const DEFAULT_KEYWORDS = [
  'clinic management software',
  'healthcare ERP',
  'clinic ERP system',
  'hospital management software',
  'medical practice management',
  'ERP Flow Studios',
]

export function getSiteUrl() {
  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_URL ||
    'https://erpflowstudios.com'

  const withProtocol = configuredUrl.startsWith('http')
    ? configuredUrl
    : `https://${configuredUrl}`

  return withProtocol.replace(/\/+$/, '')
}

export function normalizePath(path = '/') {
  const [withoutHash] = path.split('#')
  const [withoutQuery] = withoutHash.split('?')
  const normalized = withoutQuery.replace(/\/{2,}/g, '/')

  if (!normalized || normalized === '/') return '/'
  return normalized.replace(/\/+$/, '')
}

export function buildCanonicalUrl(path = '/') {
  const normalizedPath = normalizePath(path)
  return `${getSiteUrl()}${normalizedPath === '/' ? '' : normalizedPath}`
}

export function toAbsoluteUrl(pathOrUrl: string) {
  if (!pathOrUrl) return `${getSiteUrl()}/og-image.png`
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  return `${getSiteUrl()}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`
}

export function buildKeywords(pageKeywords: string[] = []) {
  const seen = new Set<string>()
  const merged = [...DEFAULT_KEYWORDS, ...pageKeywords]

  return merged.filter((keyword) => {
    const normalized = keyword.trim().toLowerCase()
    if (!normalized || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

export function getSoftwareApplicationSchema(description = SITE_DESCRIPTION) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: SITE_NAME,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description,
    url: getSiteUrl(),
    image: toAbsoluteUrl('/og-image.png'),
    provider: {
      '@type': 'Organization',
      name: SITE_NAME,
      url: getSiteUrl(),
      email: 'erpflowstudios@gmail.com',
    },
  }
}
