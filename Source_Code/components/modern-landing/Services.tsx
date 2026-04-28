"use client";

import Image from 'next/image'

const SERVICES = [
    {
        title: "Patient Management",
        tagline: "Efficient & Secure",
        description: "Keep track of patient history, appointments, and prescriptions in one secure place with easy access.",
        image: "https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?auto=format&fit=crop&q=80&w=800"
    },
    {
        title: "Smart Pharmacy",
        tagline: "Inventory Control",
        description: "Manage stock levels, expiry dates, and automated reordering to ensure you never run out of essential medicines.",
        image: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?auto=format&fit=crop&q=80&w=800"
    },
    {
        title: "Analytics & Reports",
        tagline: "Data Driven Decisions",
        description: "Comprehensive visual reports to help you understand your clinic's performance and growth opportunities.",
        image: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=800"
    }
];

export default function Services() {
    return (
        <section id="services" className="py-24 bg-gray-50 dark:bg-[#0f0f0f]">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
                <div className="text-center mb-16 px-4">
                    <p className="text-brand font-semibold tracking-wider uppercase text-sm mb-3">Our Services</p>
                    <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white">
                        Comprehensive Clinic Solutions
                    </h2>
                    <p className="mt-4 text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                        Everything you need to run your medical practice efficiently, from patient intake to billing and reporting.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                    {SERVICES.map((service, idx) => (
                        <div key={idx} className="group bg-white dark:bg-gray-900 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-800 transition-all duration-300 hover:shadow-xl hover:-translate-y-1">
                            <div className="relative h-48 overflow-hidden">
                                <Image
                                    src={service.image}
                                    alt={`${service.title} feature illustration`}
                                    fill
                                    loading="lazy"
                                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                                <div className="absolute bottom-4 left-4 text-white">
                                    <p className="text-xs font-medium bg-brand/90 px-2 py-1 rounded-md inline-block mb-1">
                                        {service.tagline}
                                    </p>
                                </div>
                            </div>
                            <div className="p-6">
                                <h4 className="text-xl font-bold text-gray-900 dark:text-white mb-2 group-hover:text-brand transition-colors">
                                    {service.title}
                                </h4>
                                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                                    {service.description}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
