import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'
import EditLayout from '../components/EditLayout'
import StatusModal from '../components/StatusModal'

export default function EditAboutPage() {
    const router = useRouter()
    const { user, loading: authLoading } = useAuth()
    const [loading, setLoading] = useState(true)

    const [content, setContent] = useState({
        title: 'About Us',
        description: '',
        quote: ''
    })

    // Status modal states
    const [statusModal, setStatusModal] = useState({
        isOpen: false,
        status: 'loading' as 'loading' | 'success' | 'error',
        message: ''
    })

    useEffect(() => {
        if (authLoading) return
        if (!user || user.role !== 'admin') {
            router.push('/')
            return
        }
        loadContent()
    }, [user, authLoading])

    const loadContent = async () => {
        try {
            const res = await fetch('/api/about-content')
            if (res.ok) {
                const data = await res.json()
                setContent({
                    title: data.title,
                    description: data.description,
                    quote: data.quote
                })
            }
            setLoading(false)
        } catch (error) {
            setLoading(false)
            setStatusModal({ 
                isOpen: true, 
                status: 'error', 
                message: 'Failed to load about content. Please try again.' 
            })
        }
    }

    const handleSave = async () => {
        try {
            const res = await fetch('/api/about-content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: content })
            })

            if (res.ok) {
                setStatusModal({ 
                    isOpen: true, 
                    status: 'success', 
                    message: 'About content saved successfully!' 
                })
            } else {
                const errorData = await res.json().catch(() => ({}))
                throw new Error(errorData.error || 'Failed to save about content')
            }
        } catch (error: any) {
            setStatusModal({ 
                isOpen: true, 
                status: 'error', 
                message: error.message || 'Failed to save content. Please try again.' 
            })
        }
    }

    return (
        <EditLayout>
            <div className="max-w-5xl mx-auto px-4 pb-20">
                <div className="mb-6">
                    <h1 className="text-2xl sm:text-3xl font-bold mb-2">Edit About Page</h1>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Customize testimonials and team sections</p>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mb-4"></div>
                        <p className="text-gray-600 dark:text-gray-400">Loading about content...</p>
                    </div>
                ) : (
                <>
                <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
                    <div>
                        <label className="block text-sm font-medium mb-2">Title</label>
                        <input
                            type="text"
                            value={content.title}
                            onChange={(e) => setContent({ ...content, title: e.target.value })}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="About Us"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">Description</label>
                        <textarea
                            value={content.description}
                            onChange={(e) => setContent({ ...content, description: e.target.value })}
                            rows={8}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Enter the main description..."
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">Quote</label>
                        <textarea
                            value={content.quote}
                            onChange={(e) => setContent({ ...content, quote: e.target.value })}
                            rows={3}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Enter an inspiring quote..."
                        />
                    </div>

                    <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
                        <button
                            onClick={() => router.push('/about')}
                            className="px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center gap-2 font-medium text-gray-700 dark:text-gray-300"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            Preview Page
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-6 py-3 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white rounded-lg font-semibold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Save Changes
                        </button>
                    </div>
                </div>
                </>
                )}
            </div>

            <StatusModal
                isOpen={statusModal.isOpen}
                status={statusModal.status}
                message={statusModal.message}
                onClose={() => setStatusModal({ ...statusModal, isOpen: false })}
            />
        </EditLayout>
    )
}

