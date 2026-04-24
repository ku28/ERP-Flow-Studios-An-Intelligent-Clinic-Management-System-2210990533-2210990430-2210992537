import Link from 'next/link'
import LandingHeader from '../components/LandingHeader'
import Contact from '../components/modern-landing/Contact'
import FooterSection from '../components/modern-landing/Footer'
import PricingSection from '../components/modern-landing/Pricing'
import Services from '../components/modern-landing/Services'
import TrustSection from '../components/modern-landing/TrustSection'
import SEO from '../components/SEO'

export default function ClinicErpPage() {
  return (
    <>
      <SEO
        canonicalPath="/clinic-erp"
        description="ERP Flow Studios is a clinic ERP platform that helps practices manage patients, pharmacy, billing, tasks, and reporting in one secure web application."
        keywords={[
          'clinic ERP',
          'clinic ERP India',
          'medical ERP system India',
          'healthcare ERP software',
          'clinic operations software',
        ]}
        openGraph={{
          description: 'Learn how ERP Flow Studios works as an intelligent clinic ERP for patient care, billing, and operations.',
        }}
      />
      <main className="min-h-screen bg-white dark:bg-[#0a0a0a]">
        <LandingHeader />
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-10 sm:pt-20">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">Clinic ERP</p>
          <h1 className="mt-4 text-3xl sm:text-5xl font-bold text-gray-900 dark:text-white">
            An Intelligent Clinic ERP for Modern Healthcare Teams
          </h1>
          <p className="mt-5 max-w-3xl text-lg text-gray-600 dark:text-gray-400">
            ERP Flow Studios centralizes appointments, prescriptions, billing, stock, and operational follow-ups so clinics can run faster with fewer manual handoffs.
          </p>
          <p className="mt-5 text-sm text-gray-600 dark:text-gray-400">
            Explore the platform below, review our{' '}
            <Link href="/features" className="font-semibold text-brand hover:underline">feature set</Link>,
            {' '}then compare{' '}
            <Link href="/pricing" className="font-semibold text-brand hover:underline">pricing</Link>
            {' '}or reach us via{' '}
            <Link href="/contact" className="font-semibold text-brand hover:underline">contact</Link>.
          </p>
        </section>
        <Services />
        <TrustSection />
        <PricingSection />
        <Contact />
        <FooterSection />
      </main>
    </>
  )
}
