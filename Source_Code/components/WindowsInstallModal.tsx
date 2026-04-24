import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface WindowsInstallModalProps {
    isOpen: boolean
    onClose: () => void
    downloadUrl: string
}

export default function WindowsInstallModal({ isOpen, onClose, downloadUrl }: WindowsInstallModalProps) {
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden'
        } else {
            document.body.style.overflow = 'unset'
        }
        return () => {
            document.body.style.overflow = 'unset'
        }
    }, [isOpen])

    if (!isOpen) return null

    const modal = (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-800">
                {/* Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand/10 to-purple-500/10 dark:from-brand/20 dark:to-purple-500/20 border border-brand/20 dark:border-brand/30 flex items-center justify-center">
                            <svg className="w-6 h-6 text-brand" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Windows Installation Guide</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Follow these steps to install on Windows 10/11</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        aria-label="Close modal"
                    >
                        <svg className="w-6 h-6 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Download Button */}
                    <div className="p-4 rounded-xl bg-gradient-to-r from-brand/5 to-purple-500/5 dark:from-brand/10 dark:to-purple-500/10 border border-brand/20 dark:border-brand/30">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white">Step 1: Download the Installer</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">File: ERPFlowStudios-Setup.exe</p>
                            </div>
                            <a
                                href={downloadUrl}
                                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-brand hover:bg-brand/90 text-white font-semibold transition-all transform hover:scale-105 shadow-lg shadow-brand/25 text-sm"
                                download
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Download .exe
                            </a>
                        </div>
                    </div>

                    {/* Step 2 */}
                    <div className="space-y-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand text-white text-sm font-bold">2</span>
                            Handle Windows SmartScreen Warning
                        </h3>
                        <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
                            <div className="flex gap-3">
                                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <div>
                                    <p className="font-semibold text-amber-900 dark:text-amber-200">You'll see "Windows protected your PC"</p>
                                    <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">This is normal! We're a new app without an expensive code signing certificate yet.</p>
                                </div>
                            </div>
                        </div>
                        
                        {/* Screenshot placeholder */}
                        <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                            <img 
                                src="/instructions/windows-smartscreen.png" 
                                alt="Windows SmartScreen warning"
                                className="w-full h-auto"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                }}
                            />
                            <div className="hidden p-8 text-center bg-gray-50 dark:bg-gray-800">
                                <svg className="w-12 h-12 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Screenshot: windows-smartscreen.png</p>
                            </div>
                        </div>

                        <div className="pl-8 space-y-2 text-sm text-gray-700 dark:text-gray-300">
                            <div className="flex items-start gap-2">
                                <span className="text-brand font-bold">→</span>
                                <p>Click <strong className="text-gray-900 dark:text-white">"More info"</strong></p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-brand font-bold">→</span>
                                <p>Then click <strong className="text-gray-900 dark:text-white">"Run anyway"</strong></p>
                            </div>
                        </div>

                        {/* Screenshot placeholder */}
                        <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                            <img 
                                src="/instructions/windows-run-anyway.png" 
                                alt="Click Run anyway"
                                className="w-full h-auto"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                }}
                            />
                            <div className="hidden p-8 text-center bg-gray-50 dark:bg-gray-800">
                                <svg className="w-12 h-12 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Screenshot: windows-run-anyway.png</p>
                            </div>
                        </div>
                    </div>

                    {/* Step 3 */}
                    <div className="space-y-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand text-white text-sm font-bold">3</span>
                            Follow the Installation Wizard
                        </h3>
                        <div className="pl-8 space-y-2 text-sm text-gray-700 dark:text-gray-300">
                            <div className="flex items-start gap-2">
                                <span className="text-brand font-bold">→</span>
                                <p>Choose installation location (default is recommended)</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-brand font-bold">→</span>
                                <p>Click "Install" and wait for completion</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-brand font-bold">→</span>
                                <p>Click "Finish" to launch ERP Flow Studios</p>
                            </div>
                        </div>

                        {/* Screenshot placeholder */}
                        <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                            <img 
                                src="/instructions/windows-installer.png" 
                                alt="Windows installer"
                                className="w-full h-auto"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                    (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                }}
                            />
                            <div className="hidden p-8 text-center bg-gray-50 dark:bg-gray-800">
                                <svg className="w-12 h-12 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Screenshot: windows-installer.png</p>
                            </div>
                        </div>
                    </div>

                    {/* Step 4 */}
                    <div className="space-y-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand text-white text-sm font-bold">4</span>
                            Launch &amp; Login
                        </h3>
                        <div className="pl-8 space-y-2 text-sm text-gray-700 dark:text-gray-300">
                            <div className="flex items-start gap-2">
                                <span className="text-brand font-bold">→</span>
                                <p>The app will open automatically, or find it in your Start Menu</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-brand font-bold">→</span>
                                <p>Login with your clinic account credentials</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-brand font-bold">→</span>
                                <p>The app will automatically check for updates on each launch</p>
                            </div>
                        </div>
                    </div>

                    {/* Security Notice */}
                    <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30">
                        <div className="flex gap-3">
                            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div className="space-y-2">
                                <p className="font-semibold text-blue-900 dark:text-blue-200">🔒 Is this safe?</p>
                                <p className="text-sm text-blue-800 dark:text-blue-300">
                                    Yes! The SmartScreen warning appears because we're a new application. As we're a new developer, Windows doesn't have established "reputation" data yet. Once we obtain a code signing certificate ($179-500/year) and build reputation through installs, this warning will disappear. 
                                </p>
                                <p className="text-sm text-blue-800 dark:text-blue-300">
                                    <strong>Always download only from</strong>: Official website or GitHub releases.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 p-6 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 backdrop-blur-sm">
                    <div className="flex items-center justify-between gap-4">
                        <a 
                            href="/SECURITY_VERIFICATION.md"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-brand hover:underline"
                        >
                            Read full security guide →
                        </a>
                        <button
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-lg bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white font-medium transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )

    return typeof document !== 'undefined' ? createPortal(modal, document.body) : null
}
