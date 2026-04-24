import Link from 'next/link'
import LandingHeader from '../components/LandingHeader'
import Benefits from '../components/modern-landing/Benefits'
import Contact from '../components/modern-landing/Contact'
import FooterSection from '../components/modern-landing/Footer'
import Services from '../components/modern-landing/Services'
import TrustSection from '../components/modern-landing/TrustSection'
import SEO from '../components/SEO'

export default function FeaturesPage() {
  return (
    <>
      <SEO
        canonicalPath="/features"
        description="Explore ERP Flow Studios features for patient management, billing, prescriptions, analytics, and secure clinic workflows."
        keywords={[
          'clinic software features',
          'clinic ERP India',
          'small clinic software',
          'medical ERP system India',
          'patient management software',
        ]}
        openGraph={{
          description: 'See how ERP Flow Studios helps clinics manage patients, staff, billing, and analytics from one secure platform.',
        }}
      />
      <main className="min-h-screen bg-white dark:bg-[#0a0a0a]">
        <LandingHeader />
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-10 sm:pt-20">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">Features</p>
          <h1 className="mt-4 text-3xl sm:text-5xl font-bold text-gray-900 dark:text-white">
            Clinic ERP Features Built for Daily Operations
          </h1>
          <p className="mt-5 max-w-3xl text-lg text-gray-600 dark:text-gray-400">
            ERP Flow Studios brings patient management, prescriptions, pharmacy operations, reports, and staff workflows into one system built for Indian clinics.
          </p>
          <p className="mt-5 text-sm text-gray-600 dark:text-gray-400">
            Review the platform capabilities below, then continue to{' '}
            <Link href="/pricing" className="font-semibold text-brand hover:underline">pricing</Link>
            {' '}or speak with us on the{' '}
            <Link href="/contact" className="font-semibold text-brand hover:underline">contact page</Link>.
          </p>
        </section>
        <Services />
        <Benefits />
        <TrustSection />
        <Contact />
        <FooterSection />
      </main>
    </>
  )
}
