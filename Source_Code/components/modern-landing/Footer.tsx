import Image from "next/image";
import Link from "next/link";

export default function FooterSection() {
    return (
        <footer id="footer" className="w-full py-24 sm:py-32">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
                <div className="p-8 md:p-10 lg:p-12 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-lg">
                    <nav className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12" aria-label="Footer navigation">
                        <div className="sm:col-span-2 lg:col-span-1 flex flex-col items-center sm:items-start">
                            <Link href="/" className="flex font-bold items-center group">
                                <Image
                                    src="/favicon.png"
                                    alt="ERP Flow Studios logo"
                                    width={48}
                                    height={48}
                                    className="mr-3 rounded-lg border-2 border-gray-300 dark:border-gray-700 group-hover:border-brand transition-colors"
                                    loading="lazy"
                                />
                                <h3 className="text-2xl md:text-3xl text-gray-900 dark:text-white group-hover:text-brand transition-colors">
                                    ERP Flow Studios
                                </h3>
                            </Link>
                            <p className="mt-4 text-gray-600 dark:text-gray-400 text-center sm:text-left text-sm">
                                Modern clinic operations platform for doctors, staff, billing, and workflows.
                            </p>
                        </div>

                        <div className="flex flex-col gap-3 items-center sm:items-start">
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">Product</h3>
                            <Link href="/features" className="text-gray-600 dark:text-gray-400 hover:text-brand dark:hover:text-brand transition-colors text-sm">Features</Link>
                            <Link href="/pricing" className="text-gray-600 dark:text-gray-400 hover:text-brand dark:hover:text-brand transition-colors text-sm">Pricing</Link>
                            <Link href="/clinic-erp" className="text-gray-600 dark:text-gray-400 hover:text-brand dark:hover:text-brand transition-colors text-sm">Clinic ERP</Link>
                            <Link href="/download" className="text-gray-600 dark:text-gray-400 hover:text-brand dark:hover:text-brand transition-colors text-sm">Updates</Link>
                        </div>

                        <div className="flex flex-col gap-3 items-center sm:items-start">
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">Company</h3>
                            <Link href="/" className="text-gray-600 dark:text-gray-400 hover:text-brand dark:hover:text-brand transition-colors text-sm">About</Link>
                            <Link href="/clinic-management-software-india" className="text-gray-600 dark:text-gray-400 hover:text-brand dark:hover:text-brand transition-colors text-sm">India Clinic Software</Link>
                            <Link href="/contact" className="text-gray-600 dark:text-gray-400 hover:text-brand dark:hover:text-brand transition-colors text-sm">Contact</Link>
                            <a href="mailto:erpflowstudios@gmail.com" className="text-gray-600 dark:text-gray-400 hover:text-brand dark:hover:text-brand transition-colors text-sm">Support</a>
                        </div>

                        <div className="flex flex-col gap-3 items-center sm:items-start">
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-2">Legal</h3>
                            <Link href="/privacy-policy" className="text-gray-600 dark:text-gray-400 hover:text-brand dark:hover:text-brand transition-colors text-sm">Privacy Policy</Link>
                            <Link href="/terms" className="text-gray-600 dark:text-gray-400 hover:text-brand dark:hover:text-brand transition-colors text-sm">Terms of Service</Link>
                            <Link href="/refund-policy" className="text-gray-600 dark:text-gray-400 hover:text-brand dark:hover:text-brand transition-colors text-sm">Refund Policy</Link>
                        </div>
                    </nav>

                    <div className="my-8 border-t border-gray-300 dark:border-gray-700"></div>

                    <section className="text-center space-y-2">
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                            © 2026 ERP Flow Studios. All rights reserved.
                        </p>
                    </section>
                </div>
            </div>
        </footer>
    );
}
