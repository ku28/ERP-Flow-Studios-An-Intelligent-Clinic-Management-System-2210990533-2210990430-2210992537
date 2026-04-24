import type { GetStaticPaths, GetStaticProps } from 'next'
import LandingHeader from '../../components/LandingHeader'
import FooterSection from '../../components/modern-landing/Footer'
import SEO from '../../components/SEO'
import { BlogPost, getBlogPostBySlug, getBlogSlugs } from '../../lib/blog-posts'
import { buildCanonicalUrl, SITE_NAME, toAbsoluteUrl } from '../../lib/seo'

type BlogPostPageProps = {
  post: BlogPost
}

export default function BlogPostPage({ post }: BlogPostPageProps) {
  const canonicalPath = `/blog/${post.slug}`

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt || post.publishedAt,
    mainEntityOfPage: buildCanonicalUrl(canonicalPath),
    image: toAbsoluteUrl(post.ogImage || '/og-image.png'),
    author: {
      '@type': 'Organization',
      name: SITE_NAME,
    },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: {
        '@type': 'ImageObject',
        url: toAbsoluteUrl('/favicon.png'),
      },
    },
  }

  return (
    <>
      <SEO
        canonicalPath={canonicalPath}
        description={post.description}
        keywords={post.keywords}
        openGraph={{
          title: post.title,
          description: post.description,
          image: post.ogImage,
          type: 'article',
        }}
        schema={[articleSchema]}
      />
      <main className="min-h-screen bg-white dark:bg-[#0a0a0a]">
        <LandingHeader />
        <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">ERP Flow Studios Blog</p>
          <h1 className="mt-4 text-3xl sm:text-5xl font-bold text-gray-900 dark:text-white">{post.title}</h1>
          <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">{post.excerpt}</p>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
            Published {new Date(post.publishedAt).toLocaleDateString()}
          </p>

          <div className="mt-10 space-y-10">
            {post.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">{section.heading}</h2>
                <div className="mt-4 space-y-4 text-gray-700 dark:text-gray-300 leading-7">
                  {section.paragraphs.map((paragraph, index) => (
                    <p key={`${section.heading}-${index}`}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </article>
        <FooterSection />
      </main>
    </>
  )
}

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: getBlogSlugs().map((slug) => ({ params: { slug } })),
    fallback: 'blocking',
  }
}

export const getStaticProps: GetStaticProps<BlogPostPageProps> = async ({ params }) => {
  const slug = typeof params?.slug === 'string' ? params.slug : ''
  const post = getBlogPostBySlug(slug)

  if (!post) {
    return {
      notFound: true,
    }
  }

  return {
    props: {
      post,
    },
  }
}
