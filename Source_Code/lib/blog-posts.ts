export type BlogSection = {
  heading: string
  paragraphs: string[]
}

export type BlogPost = {
  slug: string
  title: string
  excerpt: string
  description: string
  publishedAt: string
  updatedAt?: string
  keywords: string[]
  ogImage?: string
  sections: BlogSection[]
}

export const blogPosts: BlogPost[] = []

export function getBlogSlugs() {
  return blogPosts.map((post) => post.slug)
}

export function getBlogPostBySlug(slug: string) {
  return blogPosts.find((post) => post.slug === slug)
}
