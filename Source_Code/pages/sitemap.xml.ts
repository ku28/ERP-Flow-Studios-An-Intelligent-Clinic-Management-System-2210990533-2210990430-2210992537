import type { GetServerSideProps } from 'next'
import { buildCanonicalUrl } from '../lib/seo'

const MAIN_ROUTES: Array<{ path: string; changefreq: string; priority: string }> = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/clinic-erp', changefreq: 'weekly', priority: '0.9' },
  { path: '/clinic-management-software-india', changefreq: 'weekly', priority: '0.9' },
  { path: '/features', changefreq: 'weekly', priority: '0.85' },
  { path: '/pricing', changefreq: 'weekly', priority: '0.85' },
  { path: '/contact', changefreq: 'monthly', priority: '0.75' },
]

function buildSitemap() {
  const lastmod = new Date().toISOString()
  const urls = MAIN_ROUTES.map((route) => {
    return `
    <url>
      <loc>${buildCanonicalUrl(route.path)}</loc>
      <lastmod>${lastmod}</lastmod>
      <changefreq>${route.changefreq}</changefreq>
      <priority>${route.priority}</priority>
    </url>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${urls}
  </urlset>`
}

export const getServerSideProps: GetServerSideProps = async ({ res }) => {
  res.setHeader('Content-Type', 'text/xml')
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
  res.write(buildSitemap())
  res.end()

  return {
    props: {},
  }
}

export default function SitemapXml() {
  return null
}
