import LandingHeader from '../components/LandingHeader'
import FooterSection from '../components/modern-landing/Footer'

export default function TermsPage() {
    return (
        <main className="min-h-screen bg-white dark:bg-[#0a0a0a]">
            <LandingHeader />
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-2">Terms of Service</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-10">Last updated: March 14, 2026</p>

                <div className="space-y-8 text-gray-700 dark:text-gray-300 leading-relaxed">

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Account Rules</h2>
                        <p>
                            Clinics must provide accurate registration information and maintain secure credentials for all user
                            accounts. Account owners are responsible for all activity performed using authorized logins.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Subscription Billing</h2>
                        <p>
                            Paid plans are billed according to the selected cycle. Taxes and payment processing terms apply
                            as shown at checkout. Non-payment may result in restricted access to paid features.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Acceptable Usage</h2>
                        <p>
                            Users must not attempt unauthorized access, misuse healthcare data, or disrupt platform operations.
                            Clinics are responsible for ensuring lawful handling of patient records.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Suspension Rights</h2>
                        <p>
                            ERP Flow Studios may suspend or restrict accounts that violate these terms, create security risk,
                            or involve fraudulent use. Access may be restored after successful review and remediation.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">Contact Us</h2>
                        <p>For questions about these Terms, please contact us at:</p>
                        <div className="mt-2 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
                            <p><strong>ERP Flow Studios</strong></p>
                            <p>Email: <a href="mailto:erpflowstudios@gmail.com" className="text-violet-600 dark:text-violet-400 hover:underline">erpflowstudios@gmail.com</a></p>
                            <p>Website: <a href="https://erpflowstudios.com" className="text-violet-600 dark:text-violet-400 hover:underline">erpflowstudios.com</a></p>
                        </div>
                    </section>

                </div>
            </div>
            <FooterSection />
        </main>
    )
}
