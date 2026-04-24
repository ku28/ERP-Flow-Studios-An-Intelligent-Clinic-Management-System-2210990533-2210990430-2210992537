import Link from 'next/link'

const TRUST_POINTS = [
  'Secure authentication',
  'Role-based access control',
  'Encrypted patient data',
  'Cloud infrastructure',
  'Real-time backups',
]

export default function TrustSection() {
  return (
    <section id="features" className="py-20 bg-white dark:bg-[#0a0a0a]">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
        <div className="rounded-3xl border border-gray-200 dark:border-gray-800 bg-gradient-to-br from-white via-gray-50 to-white dark:from-gray-900 dark:via-gray-900/80 dark:to-black p-8 sm:p-10 lg:p-12 shadow-xl">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-4">
            Why Clinics Trust ERP Flow Studios
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-3xl">
            Built for healthcare teams that need reliability, security, and day-to-day operational confidence.
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-8 max-w-3xl">
            Next, compare plans on{' '}
            <Link href="/pricing" className="font-semibold text-brand hover:underline">pricing</Link>
            {' '}or get in touch through{' '}
            <Link href="/contact" className="font-semibold text-brand hover:underline">contact</Link>.
          </p>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5" aria-label="Trust and security highlights">
            {TRUST_POINTS.map((point) => (
              <li
                key={point}
                className="flex items-center gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white/90 dark:bg-gray-900/70 px-4 py-3"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand/15 text-brand" aria-hidden="true">
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.704 5.29a1 1 0 010 1.42l-7.2 7.2a1 1 0 01-1.415 0l-3.2-3.2a1 1 0 111.414-1.42l2.493 2.494 6.493-6.494a1 1 0 011.415 0z" clipRule="evenodd" />
                  </svg>
                </span>
                <span className="text-sm sm:text-base font-medium text-gray-800 dark:text-gray-200">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
