import Head from 'next/head'
import { useRouter } from 'next/router'
import {
  SITE_DESCRIPTION,
  SITE_OG_DESCRIPTION,
  SITE_TITLE,
  buildCanonicalUrl,
  buildKeywords,
  getSoftwareApplicationSchema,
  normalizePath,
  toAbsoluteUrl,
} from '../lib/seo'

type SEOProps = {
  description?: string
  keywords?: string[]
  canonicalPath?: string
  robots?: string
  openGraph?: {
    title?: string
    description?: string
    image?: string
    type?: 'website' | 'article'
    url?: string
  }
  twitter?: {
    description?: string
    image?: string
  }
  schema?: Array<Record<string, unknown>>
}

export default function SEO({
  description = SITE_DESCRIPTION,
  keywords = [],
  canonicalPath,
  robots = 'index, follow',
  openGraph,
  twitter,
  schema = [],
}: SEOProps) {
  const router = useRouter()
  const canonical = buildCanonicalUrl(canonicalPath || normalizePath(router.asPath || '/'))
  const ogImage = toAbsoluteUrl(openGraph?.image || twitter?.image || '/og-image.png')
  const ogUrl = openGraph?.url ? buildCanonicalUrl(openGraph.url) : canonical
  const resolvedKeywords = buildKeywords(keywords).join(', ')
  const schemaPayload = [getSoftwareApplicationSchema(description), ...schema]

  return (
    <Head>
      <meta name="description" content={description} key="description" />
      <meta name="keywords" content={resolvedKeywords} key="keywords" />
      <meta name="robots" content={robots} key="robots" />
      <link rel="canonical" href={canonical} key="canonical" />

      <meta property="og:title" content={openGraph?.title || SITE_TITLE} key="og:title" />
      <meta property="og:description" content={openGraph?.description || description || SITE_OG_DESCRIPTION} key="og:description" />
      <meta property="og:image" content={ogImage} key="og:image" />
      <meta property="og:url" content={ogUrl} key="og:url" />
      <meta property="og:type" content={openGraph?.type || 'website'} key="og:type" />
      <meta property="og:site_name" content="ERP Flow Studios" key="og:site_name" />

      <meta name="twitter:card" content="summary_large_image" key="twitter:card" />
      <meta name="twitter:title" content={openGraph?.title || SITE_TITLE} key="twitter:title" />
      <meta name="twitter:description" content={twitter?.description || openGraph?.description || description} key="twitter:description" />
      <meta name="twitter:image" content={twitter?.image ? toAbsoluteUrl(twitter.image) : ogImage} key="twitter:image" />

      {schemaPayload.map((entry, index) => (
        <script
          key={`jsonld-${index}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(entry) }}
        />
      ))}
    </Head>
  )
}
