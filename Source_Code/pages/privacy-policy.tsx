import LandingHeader from '../components/LandingHeader'
import FooterSection from '../components/modern-landing/Footer'

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-[#0a0a0a]">
      <LandingHeader />
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-3">Privacy Policy</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Last updated: March 26, 2026</p>

        <div className="space-y-8 text-gray-700 dark:text-gray-300 leading-relaxed">
          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Data Collection</h2>
            <p>
              ERP Flow Studios collects account details, clinic profile data, and operational data entered by authorized users
              to provide clinic management features.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Data We Access</h2>
            <p className="mb-3">
              When you sign in with Google, ERP Flow Studios accesses only the Google user data required for authentication and
              account setup, including your basic profile information:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Full name</li>
              <li>Email address</li>
              <li>Profile picture (avatar), if available</li>
              <li>Google account identifier needed to verify account ownership</li>
            </ul>
            <p className="mt-3">
              We do not access sensitive Google user data such as Contacts, Google Drive files, or Gmail content unless such
              access is explicitly enabled in a separate integration flow and clearly disclosed at that time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">How We Use Data</h2>
            <p className="mb-3">
              We use Google user data only for legitimate service functionality related to authentication and account
              management, including:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>Signing you in securely to ERP Flow Studios</li>
              <li>Creating and linking your user account to the correct clinic or business workspace</li>
              <li>Displaying basic profile details in your account (such as name and profile image)</li>
              <li>Protecting account security, preventing unauthorized access, and supporting login troubleshooting</li>
            </ul>
            <p className="mt-3">
              We do not use Google user data for advertising purposes.
            </p>
            <p className="mt-2">
              We do not transfer or sell Google user data to third parties.
            </p>
            <p className="mt-2">
              Google user data is accessible only to authorized systems and personnel on a limited, need-to-know basis, and is
              protected using reasonable technical and organizational safeguards, including encrypted transport and access
              controls.
            </p>
            <p className="mt-2">
              We may disclose data only where necessary to operate the service (for example, trusted infrastructure or
              processing providers under contractual controls) or to comply with applicable law, regulation, or lawful
              government requests.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Cookies</h2>
            <p>
              We use cookies and similar storage technologies to keep users signed in, preserve preferences, and improve
              session reliability across devices.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Analytics</h2>
            <p>
              Anonymous usage analytics may be used to understand product performance and improve user experience while
              minimizing personally identifiable information.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">User Accounts</h2>
            <p>
              Clinics manage role-based user accounts for admins, doctors, and staff. Each clinic is responsible for
              maintaining credential confidentiality and access permissions.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Data Protection</h2>
            <p>
              We apply technical and organizational safeguards, including transport encryption, access controls, and regular
              backups to protect platform data.
            </p>
          </section>
        </div>
      </section>
      <FooterSection />
    </main>
  )
}
