import LandingHeader from '../components/LandingHeader'
import FooterSection from '../components/modern-landing/Footer'
import SEO from '../components/SEO'
import Link from 'next/link'

export default function ContactPage() {
  return (
    <>
      <SEO
        canonicalPath="/contact"
        description="Contact ERP Flow Studios for clinic ERP demos, onboarding help, pricing clarification, or billing support."
        keywords={[
          'contact clinic ERP provider',
          'clinic software support',
          'ERP Flow Studios contact',
          'clinic ERP demo India',
        ]}
        openGraph={{
          description: 'Get in touch with ERP Flow Studios for clinic ERP onboarding, demos, and billing support.',
        }}
      />
      <main className="min-h-screen bg-white dark:bg-[#0a0a0a]">
        <LandingHeader />
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">Contact</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Reach out for product guidance, onboarding support, or billing assistance.
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-10">
            Explore our{' '}
            <Link href="/features" className="font-semibold text-brand hover:underline">features</Link>
            {' '}or{' '}
            <Link href="/pricing" className="font-semibold text-brand hover:underline">pricing</Link>
            {' '}pages before you contact us.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-6 sm:p-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-5">Contact Details</h2>
              <div className="space-y-4 text-gray-700 dark:text-gray-300">
                <p>
                  <span className="font-medium text-gray-900 dark:text-white">Email:</span>{' '}
                  <a href="mailto:erpflowstudios@gmail.com" className="text-brand hover:underline">erpflowstudios@gmail.com</a>
                </p>
                <p>
                  <span className="font-medium text-gray-900 dark:text-white">Support Hours:</span>{' '}
                  Monday to Saturday, 10:00 AM to 7:00 PM IST
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 sm:p-8 shadow-sm">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-5">Send a Message</h2>
              <form className="space-y-4" onSubmit={(e) => e.preventDefault()} aria-label="Contact form">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Name</label>
                  <input id="name" type="text" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand" placeholder="Your full name" />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Email</label>
                  <input id="email" type="email" className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand" placeholder="name@clinic.com" />
                </div>
                <div>
                  <label htmlFor="message" className="block text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">Message</label>
                  <textarea id="message" rows={4} className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand" placeholder="How can we help?" />
                </div>
                <button type="submit" className="w-full rounded-lg bg-brand text-white font-semibold py-2.5 hover:opacity-95 transition-opacity">
                  Submit
                </button>
              </form>
            </div>
          </div>
        </section>
        <FooterSection />
      </main>
    </>
  )
}
