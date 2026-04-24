import Link from 'next/link'
import LandingHeader from '../components/LandingHeader'
import Benefits from '../components/modern-landing/Benefits'
import Contact from '../components/modern-landing/Contact'
import FooterSection from '../components/modern-landing/Footer'
import PricingSection from '../components/modern-landing/Pricing'
import TrustSection from '../components/modern-landing/TrustSection'
import SEO from '../components/SEO'

export default function ClinicManagementSoftwareIndiaPage() {
  return (
    <>
      <SEO
        canonicalPath="/clinic-management-software-india"
        description="Looking for clinic management software in India? ERP Flow Studios helps clinics handle patient records, billing, prescriptions, and staff workflows from one web-based platform."
        keywords={[
          'clinic management software India',
          'clinic ERP India',
          'small clinic software',
          'medical ERP system India',
          'doctor clinic software India',
        ]}
        openGraph={{
          description: 'ERP Flow Studios is clinic management software for Indian practices that need secure workflows, billing, and patient operations in one place.',
        }}
      />
      <main className="min-h-screen bg-white dark:bg-[#0a0a0a]">
        <LandingHeader />
        <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-10 sm:pt-20">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">India Focus</p>
          <h1 className="mt-4 text-3xl sm:text-5xl font-bold text-gray-900 dark:text-white">
            Clinic Management Software for Indian Practices
          </h1>
          <p className="mt-5 max-w-3xl text-lg text-gray-600 dark:text-gray-400">
            From daily patient flow to billing oversight, ERP Flow Studios gives clinics in India a practical, web-based ERP built around real front-desk and doctor workflows.
          </p>
          <p className="mt-5 text-sm text-gray-600 dark:text-gray-400">
            Start with the{' '}
            <Link href="/features" className="font-semibold text-brand hover:underline">features page</Link>,
            {' '}continue to{' '}
            <Link href="/pricing" className="font-semibold text-brand hover:underline">pricing</Link>,
            {' '}and use{' '}
            <Link href="/contact" className="font-semibold text-brand hover:underline">contact</Link>
            {' '}when you are ready to talk.
          </p>
        </section>
        <Benefits />
        <TrustSection />
        <PricingSection />
        <Contact />
        <FooterSection />
      </main>
    </>
  )
}
