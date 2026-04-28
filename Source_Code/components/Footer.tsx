export default function Footer() {
  return (
    <footer className="mt-auto border-t border-gray-200 dark:border-gray-800 py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center text-sm text-muted">
          <p>© {new Date().getFullYear()} ERP Flow Studios. All rights reserved.</p>
        </div>
      </div>
    </footer>
  )
}
