"use client";

import Link from 'next/link'

export default function Contact() {
    return (
        <section id="contact" className="py-24 bg-gray-50 dark:bg-[#0f0f0f]">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
                <div className="grid lg:grid-cols-2 gap-16">
                    <div className="space-y-8">
                        <div>
                            <p className="text-brand font-semibold tracking-wider uppercase text-sm mb-3">Get in Touch</p>
                            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Connect With Us</h2>
                            <p className="mt-4 text-gray-600 dark:text-gray-400">
                                Have questions? We'd love to hear from you. Reach out to our team for support or sales inquiries.
                            </p>
                            <p className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                                You can also revisit our{' '}
                                <Link href="/features" className="font-semibold text-brand hover:underline">features</Link>
                                {' '}or{' '}
                                <Link href="/pricing" className="font-semibold text-brand hover:underline">pricing</Link>
                                {' '}pages before reaching out.
                            </p>
                        </div>

                        <div className="space-y-6">
                            <div className="flex gap-4 items-start">
                                <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center text-brand flex-shrink-0">
                                    ✉️
                                </div>
                                <div>
                                    <h4 className="font-bold text-gray-900 dark:text-white">Email Us</h4>
                                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                                        erpflowstudios@gmail.com
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-gray-900 p-8 rounded-3xl shadow-lg border border-gray-100 dark:border-gray-800">
                        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-900 dark:text-white">First Name</label>
                                    <input type="text" className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border-transparent focus:border-brand focus:bg-white dark:focus:bg-black focus:ring-0 transition-all" placeholder="John" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-900 dark:text-white">Last Name</label>
                                    <input type="text" className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border-transparent focus:border-brand focus:bg-white dark:focus:bg-black focus:ring-0 transition-all" placeholder="Doe" />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-900 dark:text-white">Email</label>
                                <input type="email" className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border-transparent focus:border-brand focus:bg-white dark:focus:bg-black focus:ring-0 transition-all" placeholder="john@example.com" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-900 dark:text-white">Phone</label>
                                <input type="tel" className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border-transparent focus:border-brand focus:bg-white dark:focus:bg-black focus:ring-0 transition-all" placeholder="+91..." />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-900 dark:text-white">Message</label>
                                <textarea rows={4} className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border-transparent focus:border-brand focus:bg-white dark:focus:bg-black focus:ring-0 transition-all" placeholder="How can we help?"></textarea>
                            </div>
                            <button className="w-full py-4 bg-brand text-white font-bold rounded-xl shadow-lg shadow-brand/25 hover:bg-brand/90 transition-all transform hover:scale-[1.02]">
                                Send Message via WhatsApp
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </section>
    );
}
