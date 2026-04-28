import { useRouter } from 'next/router'
import { useState } from 'react'
import PatientSelectionModal from './PatientSelectionModal'
import { useAuth } from '../contexts/AuthContext'

export default function FloatingPrescriptionButton() {
    const router = useRouter()
    const { user } = useAuth()
    const [showModal, setShowModal] = useState(false)
    const [showMenu, setShowMenu] = useState(false)
    const [showTokenSidebar, setShowTokenSidebar] = useState(false)

    // Don't show on profile, prescriptions, visits pages or the public landing page '/'
    if (
        router.pathname === '/' ||
        router.pathname === '/profile' ||
        router.pathname === '/prescriptions' ||
        router.pathname.startsWith('/visits')
    ) {
        return null
    }

    // Don't show for user role (patients)
    if (user?.role?.toLowerCase() === 'user') {
        return null
    }

    // Notify parent component to open token sidebar
    const handleOpenTokenSidebar = () => {
        setShowMenu(false)
        // Dispatch custom event to open sidebar
        window.dispatchEvent(new CustomEvent('open-token-sidebar'))
    }

    return (
        <>
            <div 
                className="fixed bottom-6 right-6 z-40 mobile-safe-fab mobile-safe-fab-primary"
                onMouseEnter={() => setShowMenu(true)}
                onMouseLeave={() => setShowMenu(false)}
            >
                {/* Futuristic Menu */}
                <div className={`absolute bottom-0 right-0 pb-20 transition-all duration-500 ease-out ${
                    showMenu ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
                }`}>
                    <div className="space-y-3 mb-3">
                        {/* Assign Token Option */}
                        <button
                            onClick={handleOpenTokenSidebar}
                            className="group flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-blue-500/90 to-sky-600/90 backdrop-blur-xl text-white rounded-full shadow-lg hover:shadow-2xl hover:from-blue-600 hover:to-sky-700 transition-all duration-300 transform hover:scale-105 border border-blue-400/30"
                            style={{
                                animation: showMenu ? 'slideInRight 0.4s ease-out 0.1s both' : 'none'
                            }}
                        >
                            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:bg-white/30 transition-all duration-300 group-hover:rotate-12">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                                </svg>
                            </div>
                            <div className="text-left pr-2">
                                <div className="font-semibold text-sm">Assign Token</div>
                                <div className="text-xs text-blue-100">Manage queue</div>
                            </div>
                            <div className="w-2 h-2 rounded-full bg-white/40 group-hover:bg-white/60 transition-all duration-300 group-hover:scale-150"></div>
                        </button>

                        {/* Create Prescription Option */}
                        <button
                            onClick={() => {
                                setShowMenu(false)
                                setShowModal(true)
                            }}
                            className="group flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-cyan-500/90 to-blue-600/90 backdrop-blur-xl text-white rounded-full shadow-lg hover:shadow-2xl hover:from-cyan-600 hover:to-blue-700 transition-all duration-300 transform hover:scale-105 border border-cyan-400/30"
                            style={{
                                animation: showMenu ? 'slideInRight 0.4s ease-out 0.2s both' : 'none'
                            }}
                        >
                            <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:bg-white/30 transition-all duration-300 group-hover:rotate-12">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                            </div>
                            <div className="text-left pr-2">
                                <div className="font-semibold text-sm">New Prescription</div>
                                <div className="text-xs text-cyan-100">Create visit</div>
                            </div>
                            <div className="w-2 h-2 rounded-full bg-white/40 group-hover:bg-white/60 transition-all duration-300 group-hover:scale-150"></div>
                        </button>
                    </div>
                </div>

                {/* Main Floating Button */}
                <button
                    className={`relative w-16 h-16 rounded-full shadow-2xl transition-all duration-500 ease-out overflow-hidden group ${
                        showMenu ? 'bg-gradient-to-br from-red-500 to-pink-600' : 'bg-gradient-to-br from-blue-500 to-sky-600'
                    }`}
                    aria-label="Quick Actions"
                >
                    {/* Animated Background */}
                    <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                    
                    {/* Glowing Effect */}
                    <div className={`absolute inset-0 rounded-full transition-all duration-500 ${
                        showMenu 
                            ? 'shadow-[0_0_30px_rgba(244,63,94,0.6),0_0_60px_rgba(244,63,94,0.3)]' 
                            : 'shadow-[0_0_30px_rgba(59,130,246,0.6),0_0_60px_rgba(59,130,246,0.3)] group-hover:shadow-[0_0_40px_rgba(59,130,246,0.8),0_0_80px_rgba(59,130,246,0.4)]'
                    }`}></div>

                    {/* Icon */}
                    <div className="relative w-full h-full flex items-center justify-center">
                        <svg 
                            className={`transition-all duration-500 ${
                                showMenu ? 'w-7 h-7 rotate-45' : 'w-8 h-8 rotate-0 group-hover:rotate-90'
                            }`}
                            fill="none" 
                            stroke="white" 
                            viewBox="0 0 24 24"
                            strokeWidth={2.5}
                        >
                            <path 
                                strokeLinecap="round" 
                                strokeLinejoin="round" 
                                d="M12 4v16m8-8H4" 
                            />
                        </svg>
                    </div>

                    {/* Ripple Effect */}
                    <div className={`absolute inset-0 rounded-full transition-all duration-1000 ${
                        showMenu ? 'scale-150 opacity-0' : 'scale-100 opacity-100'
                    }`}
                    style={{
                        background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)',
                        animation: showMenu ? 'none' : 'pulse 2s ease-in-out infinite'
                    }}></div>
                </button>
            </div>

            <PatientSelectionModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
            />

            <style jsx>{`
                @keyframes slideInRight {
                    from {
                        opacity: 0;
                        transform: translateX(20px) scale(0.8);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0) scale(1);
                    }
                }

                @keyframes pulse {
                    0%, 100% {
                        transform: scale(1);
                        opacity: 1;
                    }
                    50% {
                        transform: scale(1.1);
                        opacity: 0.8;
                    }
                }
            `}</style>
        </>
    )
}



