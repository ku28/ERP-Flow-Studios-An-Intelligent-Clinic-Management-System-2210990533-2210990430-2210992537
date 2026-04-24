import LandingHeader from '../components/LandingHeader'
import FooterSection from '../components/modern-landing/Footer'

export default function RefundPolicyPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-[#0a0a0a]">
      <LandingHeader />
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-3">Refund Policy</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Last updated: March 14, 2026</p>

        <div className="space-y-8 text-gray-700 dark:text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Subscription Payments</h2>
            <p>
              Subscription charges are billed based on the selected plan and billing period. Charges are processed through
              the configured payment gateway at checkout.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Refund Conditions</h2>
            <p>
              Refund requests are reviewed based on billing errors, duplicate payments, and service activation status.
              Requests should be raised promptly from the billing date for faster resolution.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Support Contact</h2>
            <p>
              For refund assistance, contact our support team with invoice details and your registered clinic account email.
            </p>
            <p className="mt-2">
              Email: <a href="mailto:erpflowstudios@gmail.com" className="text-brand hover:underline">erpflowstudios@gmail.com</a>
            </p>
          </section>
        </div>
      </section>
      <FooterSection />
    </main>
  )
}
