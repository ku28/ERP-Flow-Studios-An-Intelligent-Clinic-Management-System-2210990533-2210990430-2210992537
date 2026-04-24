import Link from 'next/link'
import LandingHeader from '../components/LandingHeader'
import Contact from '../components/modern-landing/Contact'
import FooterSection from '../components/modern-landing/Footer'
import PricingSection from '../components/modern-landing/Pricing'
import SEO from '../components/SEO'

export default function PricingPage() {
  return (
    <>
      <SEO
        canonicalPath="/pricing"
        description="Compare ERP Flow Studios pricing plans for clinics, from starter teams to advanced multi-user clinic ERP deployments."
        keywords={[
          'clinic management software pricing',
          'clinic ERP pricing India',
          'medical ERP system India',
          'small clinic software pricing',
          'clinic software plans',
        ]}
        openGraph={{
          description: 'Compare pricing plans for ERP Flow Studios and choose the clinic ERP package that fits your practice.',
        }}
      />
      <main className="min-h-screen bg-white dark:bg-[#0a0a0a]">
        <LandingHeader />
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-6 sm:pt-20">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">Pricing</p>
          <h1 className="mt-4 text-3xl sm:text-5xl font-bold text-gray-900 dark:text-white">
            Transparent Clinic ERP Pricing
          </h1>
          <p className="mt-5 max-w-3xl text-lg text-gray-600 dark:text-gray-400">
            Choose a plan that fits your clinic size, workflow complexity, and growth stage without hidden surprises.
          </p>
          <p className="mt-5 text-sm text-gray-600 dark:text-gray-400">
            After comparing plans, continue to{' '}
            <Link href="/contact" className="font-semibold text-brand hover:underline">contact</Link>
            {' '}for onboarding guidance or billing help.
          </p>
        </section>
        <PricingSection />
        <Contact />
        <FooterSection />
      </main>
    </>
  )
}
