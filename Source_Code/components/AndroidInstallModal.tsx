import { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface AndroidInstallModalProps {
    isOpen: boolean
    onClose: () => void
    downloadUrl: string
}

export default function AndroidInstallModal({ isOpen, onClose, downloadUrl }: AndroidInstallModalProps) {
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
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 dark:from-green-500/20 dark:to-emerald-500/20 border border-green-500/20 dark:border-green-400/30 flex items-center justify-center">
                            <svg className="w-6 h-6 text-green-500 dark:text-green-400" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M17.523 15.342a.641.641 0 01-.641.642.641.641 0 01-.642-.642V10.8a.641.641 0 01.642-.641.641.641 0 01.641.641v4.542zm-10.406 0a.641.641 0 01-.642.642.641.641 0 01-.641-.642V10.8a.641.641 0 01.641-.641.641.641 0 01.642.641v4.542zM8.29 4.645L7.117 2.458a.233.233 0 00-.315-.099.234.234 0 00-.099.316l1.189 2.21A7.207 7.207 0 004.8 9.882h14.4a7.207 7.207 0 00-3.093-4.997l1.189-2.21a.234.234 0 00-.1-.316.233.233 0 00-.314.099L15.71 4.645A7.13 7.13 0 0012 3.664a7.13 7.13 0 00-3.71.981zM9.6 7.682a.641.641 0 11-1.282 0 .641.641 0 011.282 0zm6.082 0a.641.641 0 11-1.283 0 .641.641 0 011.283 0zM5.282 10.764v7.618a1.282 1.282 0 001.282 1.282h.641v2.695a.962.962 0 001.923 0v-2.695h1.745v2.695a.962.962 0 001.923 0v-2.695h.641a1.282 1.282 0 001.282-1.282v-7.618H5.282z" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Android Installation Guide</h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Follow these steps to install on Android 8+</p>
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
                    <div className="p-4 rounded-xl bg-gradient-to-r from-green-500/5 to-emerald-500/5 dark:from-green-500/10 dark:to-emerald-500/10 border border-green-500/20 dark:border-green-400/30">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white">Step 1: Download the APK File</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">File: ERPFlowStudios.apk (~199 MB)</p>
                            </div>
                            <a
                                href={downloadUrl}
                                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-green-500 hover:bg-green-600 text-white font-semibold transition-all transform hover:scale-105 shadow-lg shadow-green-500/25 text-sm"
                                download
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Download .apk
                            </a>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                            <strong>Certificate Fingerprint:</strong> 3B:16:44:3E:AB:DD:AE:48:DA:4E:D9:64:50:DF:76:24:6E:B9:3A:0C:A6:55:4E:A1:0C:37:08:71:FA:AA:38:C0
                        </p>
                    </div>

                    {/* Step 2 */}
                    <div className="space-y-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-green-500 text-white text-sm font-bold">2</span>
                            Open the Downloaded APK
                        </h3>
                        <div className="pl-8 space-y-2 text-sm text-gray-700 dark:text-gray-300">
                            <div className="flex items-start gap-2">
                                <span className="text-green-500 font-bold">→</span>
                                <p>Find the APK in your Downloads folder or notification tray</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-green-500 font-bold">→</span>
                                <p>Tap on <strong className="text-gray-900 dark:text-white">ERPFlowStudios.apk</strong> to start installation</p>
                            </div>
                        </div>

                        {/* Screenshot placeholder */}
                        <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                            <img 
                                src="/instructions/android-download.png" 
                                alt="Android APK in downloads"
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
                                <p className="text-sm text-gray-500 dark:text-gray-400">Screenshot: android-download.png</p>
                            </div>
                        </div>
                    </div>

                    {/* Step 3 */}
                    <div className="space-y-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-green-500 text-white text-sm font-bold">3</span>
                            Allow Installation from Unknown Sources
                        </h3>
                        <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
                            <div className="flex gap-3">
                                <svg className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <div>
                                    <p className="font-semibold text-amber-900 dark:text-amber-200">You'll see "Install Unknown Apps" or "Unknown Sources"</p>
                                    <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">This is normal! Apps outside Google Play Store need this permission.</p>
                                </div>
                            </div>
                        </div>

                        {/* Screenshot placeholder */}
                        <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                            <img 
                                src="/instructions/android-unknown-sources.png" 
                                alt="Allow unknown sources prompt"
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
                                <p className="text-sm text-gray-500 dark:text-gray-400">Screenshot: android-unknown-sources.png</p>
                            </div>
                        </div>

                        <div className="pl-8 space-y-2 text-sm text-gray-700 dark:text-gray-300">
                            <div className="flex items-start gap-2">
                                <span className="text-green-500 font-bold">→</span>
                                <p>Tap <strong className="text-gray-900 dark:text-white">"Settings"</strong> when prompted</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-green-500 font-bold">→</span>
                                <p>Enable <strong className="text-gray-900 dark:text-white">"Allow from this source"</strong> for your browser/file manager</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-green-500 font-bold">→</span>
                                <p>Press the back button to return to the installer</p>
                            </div>
                        </div>

                        {/* Screenshot placeholder */}
                        <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                            <img 
                                src="/instructions/android-allow-source.png" 
                                alt="Enable allow from this source"
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
                                <p className="text-sm text-gray-500 dark:text-gray-400">Screenshot: android-allow-source.png</p>
                            </div>
                        </div>
                    </div>

                    {/* Step 4 */}
                    <div className="space-y-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-green-500 text-white text-sm font-bold">4</span>
                            Install the App
                        </h3>
                        <div className="pl-8 space-y-2 text-sm text-gray-700 dark:text-gray-300">
                            <div className="flex items-start gap-2">
                                <span className="text-green-500 font-bold">→</span>
                                <p>Review the permissions requested by the app</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-green-500 font-bold">→</span>
                                <p>Tap <strong className="text-gray-900 dark:text-white">"Install"</strong></p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-green-500 font-bold">→</span>
                                <p>Wait for installation to complete (~30 seconds)</p>
                            </div>
                        </div>

                        {/* Screenshot placeholder */}
                        <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                            <img 
                                src="/instructions/android-install.png" 
                                alt="Android app installer"
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
                                <p className="text-sm text-gray-500 dark:text-gray-400">Screenshot: android-install.png</p>
                            </div>
                        </div>
                    </div>

                    {/* Step 5 */}
                    <div className="space-y-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-green-500 text-white text-sm font-bold">5</span>
                            Open &amp; Login
                        </h3>
                        <div className="pl-8 space-y-2 text-sm text-gray-700 dark:text-gray-300">
                            <div className="flex items-start gap-2">
                                <span className="text-green-500 font-bold">→</span>
                                <p>Tap <strong className="text-gray-900 dark:text-white">"Open"</strong> after installation completes</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-green-500 font-bold">→</span>
                                <p>Or find the app icon on your home screen/app drawer</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-green-500 font-bold">→</span>
                                <p>Login with your clinic account credentials</p>
                            </div>
                            <div className="flex items-start gap-2">
                                <span className="text-green-500 font-bold">→</span>
                                <p>Grant permissions when prompted (camera, storage, etc.)</p>
                            </div>
                        </div>

                        {/* Screenshot placeholder */}
                        <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                            <img 
                                src="/instructions/android-app-icon.png" 
                                alt="App installed successfully"
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
                                <p className="text-sm text-gray-500 dark:text-gray-400">Screenshot: android-app-icon.png</p>
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
                                    Yes! The "unknown sources" warning appears for ALL apps installed outside Google Play Store. Our APK is properly signed with a certificate. You can verify the signature matches our published fingerprint (shown above).
                                </p>
                                <p className="text-sm text-blue-800 dark:text-blue-300">
                                    <strong>Always download only from</strong>: Official website or GitHub releases.
                                </p>
                                <p className="text-sm text-blue-800 dark:text-blue-300">
                                    <strong>After installation</strong>: You can disable "Unknown sources" again for security.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Optional: Disable Unknown Sources */}
                    <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                        <h4 className="font-semibold text-gray-900 dark:text-white mb-2">💡 Recommended: Disable Unknown Sources After Installation</h4>
                        <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300">
                            <p>For better security, disable "Allow from this source" after installing:</p>
                            <div className="pl-3 space-y-1">
                                <div className="flex items-start gap-2">
                                    <span className="text-gray-400">1.</span>
                                    <p>Go to Settings → Apps → Special app access</p>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="text-gray-400">2.</span>
                                    <p>Tap "Install unknown apps"</p>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="text-gray-400">3.</span>
                                    <p>Find your browser/file manager and disable it</p>
                                </div>
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
                            className="text-sm text-green-500 hover:underline"
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
