import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'
import EditLayout from '../components/EditLayout'
import ConfirmModal from '../components/ConfirmModal'
import StatusModal from '../components/StatusModal'

interface ServiceCard {
    image: string
    name: string
    tagline: string
    info: string
    description: string
}

export default function EditServicesPage() {
    const router = useRouter()
    const { user } = useAuth()
    const [loading, setLoading] = useState(true)
    const [services, setServices] = useState<ServiceCard[]>([])
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [deleteIndex, setDeleteIndex] = useState<number | null>(null)
    
    // Status modal states
    const [statusModal, setStatusModal] = useState({
        isOpen: false,
        status: 'loading' as 'loading' | 'success' | 'error',
        message: ''
    })

    useEffect(() => {
        if (!user) return
        if (user.role !== 'admin') {
            router.push('/')
            return
        }
        loadServices()
    }, [user])

    const loadServices = async () => {
        try {
            const res = await fetch('/api/services-content')
            if (res.ok) {
                const data = await res.json()
                setServices(data)
            } else {
                throw new Error('Failed to load services')
            }
            setLoading(false)
        } catch (error) {
            setStatusModal({ 
                isOpen: true, 
                status: 'error', 
                message: 'Failed to load services. Please refresh the page.' 
            })
            setLoading(false)
        }
    }

    const handleSave = async () => {
        try {
            const res = await fetch('/api/services-content', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: services })
            })

            if (res.ok) {
                setStatusModal({ 
                    isOpen: true, 
                    status: 'success', 
                    message: 'Services saved successfully!' 
                })
            } else {
                const errorData = await res.json().catch(() => ({}))
                throw new Error(errorData.error || 'Failed to save services')
            }
        } catch (error: any) {
            setStatusModal({ 
                isOpen: true, 
                status: 'error', 
                message: error.message || 'Failed to save services. Please try again.' 
            })
        }
    }

    const handleImageUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        setStatusModal({ isOpen: true, status: 'loading', message: 'Uploading image...' })
        try {
            const reader = new FileReader()
            reader.readAsDataURL(file)
            reader.onload = async () => {
                const base64 = reader.result as string

                const res = await fetch('/api/upload-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ image: base64, folder: 'services' })
                })

                const data = await res.json()
                if (data.url) {
                    const updated = [...services]
                    updated[index].image = data.url
                    setServices(updated)
                    setStatusModal({ 
                        isOpen: true, 
                        status: 'success', 
                        message: 'Image uploaded successfully!' 
                    })
                } else {
                    throw new Error(data.error || 'Upload failed')
                }
            }
        } catch (error: any) {
            setStatusModal({ 
                isOpen: true, 
                status: 'error', 
                message: error.message || 'Failed to upload image. Please try again.' 
            })
        }
    }

    const addService = () => {
        setServices([...services, {
            image: '',
            name: '',
            tagline: '',
            info: '',
            description: ''
        }])
    }

    const deleteService = (index: number) => {
        setDeleteIndex(index)
        setShowDeleteConfirm(true)
    }

    const confirmDelete = () => {
        if (deleteIndex !== null) {
            setServices(services.filter((_, i) => i !== deleteIndex))
        }
        setShowDeleteConfirm(false)
        setDeleteIndex(null)
    }

    const updateService = (index: number, field: keyof ServiceCard, value: string) => {
        const updated = [...services]
        updated[index][field] = value
        setServices(updated)
    }

    return (
        <EditLayout>
            <div className="max-w-6xl mx-auto p-6">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold mb-2">Edit Services</h1>
                    <p className="text-gray-600 dark:text-gray-400">Manage service cards that appear on the Services page. Numbers are auto-calculated.</p>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mb-4"></div>
                        <p className="text-gray-600 dark:text-gray-400">Loading services...</p>
                    </div>
                ) : (
                <>
                <div className="space-y-6">
                    {services.map((service, index) => (
                        <div key={index} className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-4 sm:p-6 overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                            <div className="relative">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-lg sm:text-xl font-bold text-sky-600">Service #{index + 1}</h3>
                                <button
                                    onClick={() => deleteService(index)}
                                    className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                    title="Delete service"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Service Image</label>
                                        {service.image ? (
                                            <div className="relative group">
                                                <img src={service.image} alt="Service" className="w-full h-48 object-cover rounded-lg border border-gray-300 dark:border-gray-600" />
                                                <button
                                                    onClick={() => {
                                                        const input = document.createElement('input')
                                                        input.type = 'file'
                                                        input.accept = 'image/*'
                                                        input.onchange = (e: any) => handleImageUpload(index, e)
                                                        input.click()
                                                    }}
                                                    className="absolute top-2 right-2 p-2 bg-blue-600 text-white rounded-full opacity-0 group-hover:opacity-100 hover:bg-blue-700 transition-all"
                                                    title="Change image"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                    </svg>
                                                </button>
                                            </div>
                                        ) : (
                                            <label className="flex items-center justify-center w-full px-4 py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-sky-500 transition-all bg-gray-50 dark:bg-gray-800/50">
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={(e) => handleImageUpload(index, e)}
                                                    className="hidden"
                                                />
                                                <div className="text-center">
                                                    <svg className="mx-auto h-12 w-12 text-gray-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
                                                        <path d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                    </svg>
                                                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                                                        Upload image
                                                    </p>
                                                </div>
                                            </label>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-2">Service Name</label>
                                        <input
                                            type="text"
                                            value={service.name}
                                            onChange={(e) => updateService(index, 'name', e.target.value)}
                                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                                            placeholder="e.g., Trigeminal Neuralgia Treatment"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-2">Tagline</label>
                                        <input
                                            type="text"
                                            value={service.tagline}
                                            onChange={(e) => updateService(index, 'tagline', e.target.value)}
                                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                                            placeholder="e.g., No more shocks to bear"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Info/Source</label>
                                        <input
                                            type="text"
                                            value={service.info}
                                            onChange={(e) => updateService(index, 'info', e.target.value)}
                                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                                            placeholder="e.g., As indicated by..."
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-2">Description</label>
                                        <textarea
                                            value={service.description}
                                            onChange={(e) => updateService(index, 'description', e.target.value)}
                                            rows={10}
                                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-sky-500 focus:border-transparent resize-none"
                                            placeholder="Enter detailed description..."
                                        />
                                    </div>
                                </div>
                            </div>
                            </div>
                        </div>
                    ))}

                    <button
                        onClick={addService}
                        className="w-full py-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-sky-500 dark:hover:border-sky-500 transition-colors flex items-center justify-center gap-2 text-gray-600 dark:text-gray-400 hover:text-sky-600 dark:hover:text-sky-400"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        Add New Service
                    </button>

                    <div className="flex flex-col sm:flex-row justify-end gap-3 sm:gap-4 pt-4">
                        <button
                            onClick={() => router.push('/services')}
                            className="px-4 sm:px-6 py-2.5 sm:py-3 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-sm sm:text-base"
                        >
                            Preview
                        </button>
                        <button
                            onClick={handleSave}
                            className="px-4 sm:px-6 py-2.5 sm:py-3 bg-sky-600 hover:bg-sky-700 text-white rounded-lg font-medium transition-colors text-sm sm:text-base"
                        >
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
            <ConfirmModal
                isOpen={showDeleteConfirm}
                title="Delete Service"
                message="Are you sure you want to delete this service? This action cannot be undone."
                confirmText="Delete"
                cancelText="Cancel"
                variant="danger"
                onConfirm={confirmDelete}
                onCancel={() => setShowDeleteConfirm(false)}
            />
        </EditLayout>
    )
}

