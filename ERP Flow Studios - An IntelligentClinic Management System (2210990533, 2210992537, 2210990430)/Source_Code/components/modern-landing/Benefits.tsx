"use client";

const BENEFITS = [
    {
        title: "Data Security",
        description: "Your clinic's data is encrypted and stored securely in the cloud with daily backups.",
        icon: "🛡️"
    },
    {
        title: "24/7 Access",
        description: "Access your clinic management system from anywhere, anytime, on any device.",
        icon: "🌍"
    },
    {
        title: "Automated Workflows",
        description: "Reduce manual errors and save time with automated appointment reminders and billing.",
        icon: "⚡"
    },
    {
        title: "Patient Engagement",
        description: "Improve patient retention with integrated communication tools and easy follow-ups.",
        icon: "🤝"
    }
];

export default function Benefits() {
    return (
        <section id="benefits" className="py-24 bg-white dark:bg-[#0a0a0a]">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
                <div className="grid lg:grid-cols-2 gap-16 items-center">
                    <div>
                        <p className="text-brand font-semibold tracking-wider uppercase text-sm mb-3">Why Choose Us</p>
                        <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-6">
                            Constructed for Modern Healthcare Providers
                        </h2>
                        <p className="text-lg text-gray-600 dark:text-gray-400 mb-8 leading-relaxed">
                            We understand the unique challenges of managing a medical practice. Our solution is built to address your specific needs with precision and reliability.
                        </p>
                        
                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <span className="flex items-center justify-center w-12 h-12 rounded-full bg-brand/10 text-brand font-bold text-lg">99%</span>
                                <p className="text-gray-700 dark:text-gray-300 font-medium">Uptime Guarantee</p>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="flex items-center justify-center w-12 h-12 rounded-full bg-brand/10 text-brand font-bold text-lg">24/7</span>
                                <p className="text-gray-700 dark:text-gray-300 font-medium">Customer Support</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-6">
                        {BENEFITS.map((item, idx) => (
                            <div key={idx} className="p-6 rounded-2xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 hover:shadow-lg transition-all duration-300 group">
                                <div className="text-4xl mb-4 transform group-hover:scale-110 transition-transform duration-300">
                                    {item.icon}
                                </div>
                                <h4 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                                    {item.title}
                                </h4>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {item.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
