"use client";
import { useRouter } from 'next/router';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';

export default function Hero() {
    const router = useRouter();
    const { user, loading } = useAuth();

    return (
        <section id="home" className="relative w-full overflow-hidden bg-white dark:bg-[#0a0a0a] pt-28 pb-20 lg:pt-38 lg:pb-32">
            {/* Background Gradients */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full max-w-7xl pointer-events-none">
                <div className="absolute top-20 left-10 w-72 h-72 bg-brand/10 rounded-full blur-3xl mix-blend-multiply dark:mix-blend-screen opacity-70 animate-blob"></div>
                <div className="absolute top-20 right-10 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl mix-blend-multiply dark:mix-blend-screen opacity-70 animate-blob animation-delay-2000"></div>
                <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-72 h-72 bg-pink-500/10 rounded-full blur-3xl mix-blend-multiply dark:mix-blend-screen opacity-70 animate-blob animation-delay-4000"></div>
            </div>

            <div className="container relative mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
                <div className="text-center max-w-4xl mx-auto space-y-8">
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-gray-200 dark:border-white/10 bg-white/50 dark:bg-white/5 backdrop-blur-sm">
                        <span className="px-2 py-0.5 rounded-full bg-brand text-white text-[10px] font-bold uppercase tracking-wide">New</span>
                        <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">Cloud-Based ERP Solution</span>
                    </div>

                    {/* Heading */}
                    <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-gray-900 dark:text-white leading-[1.1]">
                        Welcome to the future of <br className="hidden sm:block" />
                        clinic management with
                        <span className="block mt-2 text-transparent bg-clip-text bg-gradient-to-r from-brand to-purple-600">
                            ERP Flow Studios
                        </span>
                    </h1>

                    {/* Tagline */}
                    <p className="text-lg sm:text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto leading-relaxed">
                        Multi-tenant ERP system designed for modern clinics. Streamline your operations, manage patients, and grow your practice with our comprehensive solution.
                    </p>

                    {/* Buttons */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                        <button 
                            onClick={() => {
                                if ((user as any)?.clinic) {
                                    router.push('/dashboard')
                                } else {
                                    router.push('/register-clinic')
                                }
                            }}
                            disabled={loading}
                            className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-brand hover:bg-brand/90 text-white font-semibold transition-all transform hover:scale-105 shadow-lg shadow-brand/25 flex items-center justify-center gap-2 min-w-[160px]"
                        >
                            {loading ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    <span>Loading...</span>
                                </>
                            ) : (user as any)?.clinic ? (
                                <>
                                    {(user as any).clinic.iconUrl && (
                                        <img 
                                            src={(user as any).clinic.iconUrl} 
                                            alt="" 
                                            className="w-5 h-5 object-contain rounded-full bg-white/10" 
                                        />
                                    )}
                                    <span>Access {(user as any).clinic.name}</span>
                                </>
                            ) : (
                                "Get Started"
                            )}
                        </button>
                        <button  
                            onClick={() => router.push('#pricing')}
                            className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-white dark:bg-white/10 border border-gray-200 dark:border-white/10 text-gray-900 dark:text-white font-semibold hover:bg-gray-50 dark:hover:bg-white/20 transition-all"
                        >
                            View Pricing
                        </button>
                        <button
                            onClick={() => router.push('/download')}
                            className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-gradient-to-r from-brand to-purple-600 hover:opacity-90 text-white font-semibold transition-all transform hover:scale-105 shadow-lg shadow-brand/20 flex items-center justify-center gap-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Download App
                        </button>
                    </div>

                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Start with our{' '}
                        <Link href="/features" className="font-semibold text-brand hover:underline">features</Link>
                        {' '}page, compare{' '}
                        <Link href="/pricing" className="font-semibold text-brand hover:underline">pricing</Link>
                        {' '}, or reach us on the{' '}
                        <Link href="/contact" className="font-semibold text-brand hover:underline">contact page</Link>.
                    </p>

                    {/* Hero Image */}
                    <div className="relative mt-16 mx-auto w-full max-w-5xl rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 shadow-2xl overflow-hidden aspect-[16/9] group">
                        <div className="absolute inset-0 bg-gradient-to-t from-black/5 to-transparent z-10"></div>
                        <Image
                            src="/hero.png"
                            alt="ERP Flow Studios dashboard preview showing clinic operations"
                            fill
                            className="object-cover transition-transform duration-700 group-hover:scale-105"
                            sizes="(max-width: 1024px) 100vw, 960px"
                            priority
                        />
                    </div>
                </div>
            </div>
        </section>
    );
}
