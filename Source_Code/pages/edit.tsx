import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'
import EditLayout from '../components/EditLayout'
import StatusModal from '../components/StatusModal'
import ConfirmModal from '../components/ConfirmModal'
import Image from 'next/image'

type TabType = 'hero' | 'benefits' | 'videos' | 'achievements' | 'specialities'

interface AchievementImage {
    imageUrl: string
    order: number
}

export default function EditHomePage() {
    const router = useRouter()
    const { user } = useAuth()
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<TabType>('hero')

    // Status modal states
    const [statusModal, setStatusModal] = useState({
        isOpen: false,
        status: 'loading' as 'loading' | 'success' | 'error',
        message: ''
    })

    // Achievements states
    const [achievements, setAchievements] = useState<AchievementImage[]>([])
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [deleteIndex, setDeleteIndex] = useState<number | null>(null)
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
    const [selectedAchievements, setSelectedAchievements] = useState<Set<number>>(new Set())
    const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false)

    // Hero Section Content
    const [heroContent, setHeroContent] = useState({
        badge: 'An Electrohomeopathy Centre',
        heading: 'Welcome to ERP Flow Studios landing page',
        headingGreen: 'ERP Flow Studios',
        tagline: 'We Care.',
        imageUrl: 'https://res.cloudinary.com/dwgsflt8h/image/upload/v1749928246/banner_qf5r5l.png'
    })

    // Benefits Section Content
    const [benefitsContent, setBenefitsContent] = useState({
        title: 'Why Trust Us?',
        description: `ERP Flow Studios Electrohomeopathy Centre is expertise in the medicinal world; it is one of the top growing Electrohomeopathy Centres in India; we have helped numerous patients from all over periphery & abroad as well with Electrohomeopathic treatment in our Electrohomeopathy Centre. And treated their chronic disorder without any side effects from their root cause. Electrohomeopathic treatment is very safe, and their medicines contain natural and herbal substances. We don't prescribe generic medication to our patients. Instead, provide the best Electrohomeopathic-based treatment with a proper guidance and a well-researched diet according to disease that can help patients. And also provides some facilities that cure patients physically and psychologically.`,
        benefits: [
            {
                icon: '💚',
                title: 'Consultation',
                description: 'Get a free consultation from ERP Flow Studios Electrohomeopathy Centre to understand and analyze issues regarding your health.'
            },
            {
                icon: '💓',
                title: 'Diagnosis',
                description: 'At ERP Flow Studios Electrohomeopathy Centre we try to differentiate the common symptoms of the disease and performs in-depth analysis for peculiar, uncommon characteristics.'
            },
            {
                icon: '🫶',
                title: 'Treatment',
                description: 'ERP Flow Studios Electrohomeopathy Centre helps to provide a customized Electrohomeopathic treatment plan and diet charts for more accurate outcomes.'
            },
            {
                icon: '📅',
                title: 'Enquire Now',
                description: 'Request Appointment Repeat the Medicine. Enquire Now.'
            }
        ]
    })

    // Videos Section Content
    const [videos, setVideos] = useState([
        {
            embedUrl: 'https://www.youtube.com/embed/b0akJtrJb7c?si=ATmgLLyvBAr3OAck',
            title: 'YouTube video player'
        },
        {
            embedUrl: 'https://www.youtube.com/embed/JxqXi4JhWvg?si=vdo0EWvUxy426vhs',
            title: 'YouTube video player'
        },
        {
            embedUrl: 'https://www.youtube.com/embed/BE5v5OZPpMw?si=KoqkZmYW9fzB1oGp',
            title: 'YouTube video player'
        },
        {
            embedUrl: 'https://www.youtube.com/embed/-e8aabBBWN0?si=9DOmQ0wFQ14OgR9o',
            title: 'YouTube video player'
        }
    ])

    // Specialities Section Content
    const [specialitiesContent, setSpecialitiesContent] = useState({
        title: 'Our Specialities',
        description: `ERP Flow Studios Electrohomeopathy Centre is one of the most prominent Electrohomeopathic Centres in area. Since 1965 Electohomeopathy has treated patients with well-experienced expertise and advanced Electrohomeopathic Methodology. We are offering our services to patients help them in the treatment of Kidney Diseases (like Chronic Kidney Disease, UTI, Diabetic Kidney Disease, Nephrotic syndrome, Renal cyst, Renal stone etc.), Neuralgias ( Trigeminal neuralgia, Glossopharyngeal neuralgia, Bell's Palsy etc.), Diabetes and other chronic diseases. This Electrohomeopathy Centre runs by doctor aiming to provide help for the best treatment to patients. In our Electrohomeopathy Centre, we provide help for customized treatment for each patient and follow up on their health conditions that can help cure them permanently. As a result, It is the only Electrohomeopathy Centre in Area that has built a reputation for its practical impact and evidence-based Electrohomeopathic Treatment guidance.`,
        quote: '"Drugs are not always necessary. Belief in recovery always is." - Norman Cousins'
    })

    useEffect(() => {
        if (!user) return
        if (user.role !== 'admin') {
            router.push('/')
            return
        }
        loadContent()
    }, [user])

    const loadContent = async () => {
        try {
            // Load hero
            const heroRes = await fetch('/api/landing/hero')
            if (heroRes.ok) {
                const heroData = await heroRes.json()
                setHeroContent({
                    badge: heroData.badge,
                    heading: heroData.heading,
                    headingGreen: heroData.headingGreen || 'ERP Flow Studios',
                    tagline: heroData.tagline,
                    imageUrl: heroData.imageUrl
                })
            }

            // Load benefits
            const benefitsRes = await fetch('/api/landing/benefits')
            if (benefitsRes.ok) {
                const benefitsData = await benefitsRes.json()
                setBenefitsContent({
                    title: benefitsData.title,
                    description: benefitsData.description,
                    benefits: benefitsData.benefits
                })
            }

            // Load videos
            const videosRes = await fetch('/api/landing/videos')
            if (videosRes.ok) {
                const videosData = await videosRes.json()
                setVideos(videosData)
            }

            // Load achievements
            const achievementsRes = await fetch('/api/achievements-content')
            if (achievementsRes.ok) {
                const achievementsData = await achievementsRes.json()
                setAchievements(achievementsData)
            }

            // Load specialities
            const specialitiesRes = await fetch('/api/landing/specialities')
            if (specialitiesRes.ok) {
                const specialitiesData = await specialitiesRes.json()
                setSpecialitiesContent({
                    title: specialitiesData.title,
                    description: specialitiesData.description,
                    quote: specialitiesData.quote
                })
            }

            setLoading(false)
        } catch (error) {
            setLoading(false)
            setStatusModal({
                isOpen: true,
                status: 'error',
                message: 'Failed to load content. Please try again.'
            })
        }
    }

    const sidebarItems = [
        { id: 'hero' as TabType, label: 'Hero Section', icon: '🏠' },
        { id: 'benefits' as TabType, label: 'Benefits', icon: '✨' },
        { id: 'videos' as TabType, label: 'Our Videos', icon: '🎥' },
        { id: 'achievements' as TabType, label: 'Achievements', icon: '🏆' },
        { id: 'specialities' as TabType, label: 'Specialities', icon: '⭐' }
    ]

    const handleSave = async () => {
        setStatusModal({
            isOpen: true,
            status: 'loading',
            message: `Saving ${sidebarItems.find(s => s.id === activeTab)?.label}...`
        })
        try {
            let endpoint = ''
            let data: any = null

            switch (activeTab) {
                case 'hero':
                    endpoint = '/api/landing/hero'
                    data = heroContent
                    break
                case 'benefits':
                    endpoint = '/api/landing/benefits'
                    data = benefitsContent
                    break
                case 'videos':
                    endpoint = '/api/landing/videos'
                    data = videos
                    break
                case 'achievements':
                    endpoint = '/api/achievements-content'
                    data = achievements
                    break
                case 'specialities':
                    endpoint = '/api/landing/specialities'
                    data = specialitiesContent
                    break
            }

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data })
            })

            if (res.ok) {
                setStatusModal({
                    isOpen: true,
                    status: 'success',
                    message: `${sidebarItems.find(s => s.id === activeTab)?.label} saved successfully!`
                })
            } else {
                const errorData = await res.json().catch(() => ({}))
                throw new Error(errorData.error || 'Failed to save content')
            }
        } catch (error: any) {
            setStatusModal({
                isOpen: true,
                status: 'error',
                message: error.message || 'Failed to save content. Please try again.'
            })
        }
    }

    const handleImageUpload = () => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.onchange = async (e: any) => {
            const file = e.target.files?.[0]
            if (!file) return

            try {
                // Convert to base64
                const reader = new FileReader()
                reader.readAsDataURL(file)
                reader.onload = async () => {
                    const base64 = reader.result as string

                    // Upload to Cloudinary
                    const res = await fetch('/api/upload-image', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ image: base64, folder: 'landing' })
                    })

                    const data = await res.json()
                    if (data.url) {
                        setHeroContent({ ...heroContent, imageUrl: data.url })
                        setStatusModal({
                            isOpen: true,
                            status: 'success',
                            message: 'Hero image uploaded successfully!'
                        })
                    } else {
                        throw new Error('Upload failed')
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
        input.click()
    }

    const addVideo = () => {
        setVideos([...videos, { embedUrl: '', title: 'YouTube video player' }])
    }

    const deleteVideo = (index: number) => {
        setVideos(videos.filter((_, i) => i !== index))
    }

    const updateVideo = (index: number, embedUrl: string) => {
        const updated = [...videos]
        updated[index].embedUrl = embedUrl
        setVideos(updated)
    }

    // Achievement handlers
    const handleAchievementUpload = () => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.multiple = true // Allow multiple file selection
        input.onchange = async (e: any) => {
            const files = Array.from(e.target.files || []) as File[]
            if (files.length === 0) return

            try {
                let uploadedCount = 0
                const newAchievements: AchievementImage[] = []

                for (const file of files) {
                    const reader = new FileReader()
                    await new Promise((resolve, reject) => {
                        reader.onloadend = async () => {
                            try {
                                const base64 = reader.result as string
                                const uploadRes = await fetch('/api/upload-image', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({
                                        image: base64,
                                        folder: 'achievements'
                                    })
                                })
                                const uploadData = await uploadRes.json()

                                if (uploadData.url) {
                                    newAchievements.push({ imageUrl: uploadData.url, order: achievements.length + newAchievements.length })
                                    uploadedCount++
                                    resolve(uploadData.url)
                                } else {
                                    reject(new Error(uploadData.error || 'Upload failed'))
                                }
                            } catch (error) {
                                reject(error)
                            }
                        }
                        reader.onerror = reject
                        reader.readAsDataURL(file)
                    })
                }

                setAchievements([...achievements, ...newAchievements])
                setStatusModal({
                    isOpen: true,
                    status: 'success',
                    message: `${uploadedCount} achievement(s) uploaded successfully!`
                })
            } catch (error: any) {
                setStatusModal({
                    isOpen: true,
                    status: 'error',
                    message: error.message || 'Failed to upload some achievements. Please try again.'
                })
            }
        }
        input.click()
    }

    const handleAchievementEdit = (index: number) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.onchange = async (e: any) => {
            const file = e.target.files[0]
            if (!file) return

            try {
                const reader = new FileReader()
                reader.readAsDataURL(file)
                reader.onloadend = async () => {
                    const base64 = reader.result as string
                    const uploadRes = await fetch('/api/upload-image', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            image: base64,
                            folder: 'achievements'
                        })
                    })
                    const uploadData = await uploadRes.json()

                    if (uploadData.url) {
                        const updatedAchievements = [...achievements]
                        updatedAchievements[index].imageUrl = uploadData.url
                        setAchievements(updatedAchievements)
                        setStatusModal({
                            isOpen: true,
                            status: 'success',
                            message: 'Achievement image replaced successfully!'
                        })
                    } else {
                        throw new Error(uploadData.error || 'Upload failed')
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
        input.click()
    }

    const deleteAchievement = (index: number) => {
        setDeleteIndex(index)
        setShowDeleteConfirm(true)
    }

    const confirmDeleteAchievement = () => {
        if (deleteIndex !== null) {
            const newAchievements = achievements.filter((_, i) => i !== deleteIndex)
            // Reorder after deletion
            const reordered = newAchievements.map((img, i) => ({ ...img, order: i }))
            setAchievements(reordered)
            // Remove from selected if it was selected
            const newSelected = new Set(selectedAchievements)
            newSelected.delete(deleteIndex)
            // Adjust indices for items after deleted one
            const adjustedSelected = new Set<number>()
            newSelected.forEach(idx => {
                if (idx > deleteIndex) {
                    adjustedSelected.add(idx - 1)
                } else if (idx < deleteIndex) {
                    adjustedSelected.add(idx)
                }
            })
            setSelectedAchievements(adjustedSelected)
        }
        setShowDeleteConfirm(false)
        setDeleteIndex(null)
    }

    const toggleAchievementSelection = (index: number) => {
        const newSelected = new Set(selectedAchievements)
        if (newSelected.has(index)) {
            newSelected.delete(index)
        } else {
            newSelected.add(index)
        }
        setSelectedAchievements(newSelected)
    }

    const selectAllAchievements = () => {
        if (selectedAchievements.size === achievements.length) {
            setSelectedAchievements(new Set())
        } else {
            setSelectedAchievements(new Set(achievements.map((_, i) => i)))
        }
    }

    const bulkDeleteAchievements = () => {
        if (selectedAchievements.size > 0) {
            setShowBulkDeleteConfirm(true)
        }
    }

    const confirmBulkDeleteAchievements = () => {
        const indicesToDelete = Array.from(selectedAchievements).sort((a, b) => b - a)
        let newAchievements = [...achievements]

        indicesToDelete.forEach(index => {
            newAchievements = newAchievements.filter((_, i) => i !== index)
        })

        // Reorder after deletion
        const reordered = newAchievements.map((img, i) => ({ ...img, order: i }))
        setAchievements(reordered)
        setSelectedAchievements(new Set())
        setShowBulkDeleteConfirm(false)
    }

    const handleDragStart = (index: number) => {
        setDraggedIndex(index)
    }

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault()
        if (draggedIndex === null || draggedIndex === index) return

        const newAchievements = [...achievements]
        const draggedAchievement = newAchievements[draggedIndex]
        newAchievements.splice(draggedIndex, 1)
        newAchievements.splice(index, 0, draggedAchievement)

        // Update order
        newAchievements.forEach((img, idx) => {
            img.order = idx
        })

        setAchievements(newAchievements)
        setDraggedIndex(index)
    }

    const handleDragEnd = () => {
        setDraggedIndex(null)
    }

    const renderEditor = () => {
        switch (activeTab) {
            case 'hero':
                return (
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium mb-2">Badge Text</label>
                            <input
                                type="text"
                                value={heroContent.badge}
                                onChange={(e) => setHeroContent({ ...heroContent, badge: e.target.value })}
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                                placeholder="e.g., An Electrohomeopathy Centre"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Main Heading</label>
                            <input
                                type="text"
                                value={heroContent.heading}
                                onChange={(e) => setHeroContent({ ...heroContent, heading: e.target.value })}
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                                placeholder="e.g., Welcome to ERP Flow Studios landing page"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Heading (Green Highlight)</label>
                            <input
                                type="text"
                                value={heroContent.headingGreen}
                                onChange={(e) => setHeroContent({ ...heroContent, headingGreen: e.target.value })}
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                                placeholder="e.g., ERP Flow Studios"
                            />
                            <p className="mt-1 text-xs text-gray-500">This text will be highlighted in blue within the main heading</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Tagline</label>
                            <input
                                type="text"
                                value={heroContent.tagline}
                                onChange={(e) => setHeroContent({ ...heroContent, tagline: e.target.value })}
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                                placeholder="e.g., We Care."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Hero Image</label>
                            <div className="space-y-3">
                                {heroContent.imageUrl && (
                                    <div className="relative group">
                                        <img src={heroContent.imageUrl} alt="Hero preview" className="w-full max-w-md rounded-lg border border-gray-300 dark:border-gray-600" />
                                        <button
                                            onClick={handleImageUpload}
                                            className="absolute top-2 right-2 p-2 bg-blue-600 text-white rounded-full opacity-0 group-hover:opacity-100 hover:bg-blue-700 transition-all"
                                            title="Change image"
                                        >
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                            </svg>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )

            case 'benefits':
                return (
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium mb-2">Section Title</label>
                            <input
                                type="text"
                                value={benefitsContent.title}
                                onChange={(e) => setBenefitsContent({ ...benefitsContent, title: e.target.value })}
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Description</label>
                            <textarea
                                rows={8}
                                value={benefitsContent.description}
                                onChange={(e) => setBenefitsContent({ ...benefitsContent, description: e.target.value })}
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                            />
                        </div>

                        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                            <h3 className="text-lg font-semibold mb-4">Benefit Cards</h3>
                            {benefitsContent.benefits.map((benefit, index) => (
                                <div key={index} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 mb-4">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div>
                                            <label className="block text-xs font-medium mb-1">Icon</label>
                                            <input
                                                type="text"
                                                value={benefit.icon}
                                                onChange={(e) => {
                                                    const updated = [...benefitsContent.benefits]
                                                    updated[index].icon = e.target.value
                                                    setBenefitsContent({ ...benefitsContent, benefits: updated })
                                                }}
                                                className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                                            />
                                        </div>
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-medium mb-1">Title</label>
                                            <input
                                                type="text"
                                                value={benefit.title}
                                                onChange={(e) => {
                                                    const updated = [...benefitsContent.benefits]
                                                    updated[index].title = e.target.value
                                                    setBenefitsContent({ ...benefitsContent, benefits: updated })
                                                }}
                                                className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                                            />
                                        </div>
                                        <div className="md:col-span-3">
                                            <label className="block text-xs font-medium mb-1">Description</label>
                                            <textarea
                                                rows={2}
                                                value={benefit.description}
                                                onChange={(e) => {
                                                    const updated = [...benefitsContent.benefits]
                                                    updated[index].description = e.target.value
                                                    setBenefitsContent({ ...benefitsContent, benefits: updated })
                                                }}
                                                className="w-full p-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )

            case 'videos':
                return (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between">
                            <h3 className="text-base sm:text-lg font-semibold">YouTube Video URLs</h3>
                            <button
                                onClick={addVideo}
                                className="flex items-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs sm:text-sm font-medium transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                <span className="hidden sm:inline">Add Video</span>
                                <span className="sm:hidden">Add</span>
                            </button>
                        </div>

                        {videos.map((video, index) => (
                            <div key={index} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4">
                                <div className="flex items-start gap-3">
                                    <div className="flex-1">
                                        <label className="block text-sm font-medium mb-2">Video #{index + 1} Embed URL</label>
                                        <input
                                            type="text"
                                            value={video.embedUrl}
                                            onChange={(e) => updateVideo(index, e.target.value)}
                                            className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                                            placeholder="https://www.youtube.com/embed/..."
                                        />
                                    </div>
                                    <button
                                        onClick={() => deleteVideo(index)}
                                        className="mt-8 p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                        title="Delete video"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )

            case 'achievements':
                return (
                    <div className="space-y-6">
                        {/* Bulk Actions Bar */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-4 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2 sm:gap-3">
                                <button
                                    onClick={selectAllAchievements}
                                    className="flex items-center gap-2 px-3 py-2 text-xs sm:text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                >
                                    <div className={`w-4 h-4 sm:w-5 sm:h-5 border-2 border-sky-400 dark:border-sky-600 rounded bg-white dark:bg-gray-700 transition-all duration-200 flex items-center justify-center shadow-sm ${
                                        selectedAchievements.size === achievements.length && achievements.length > 0 
                                        ? 'bg-gradient-to-br from-sky-500 to-blue-600 border-sky-500 shadow-lg shadow-sky-500/50' 
                                        : ''
                                    }`}>
                                        <svg className={`w-3 h-3 text-white transition-opacity duration-200 ${
                                            selectedAchievements.size === achievements.length && achievements.length > 0 
                                            ? 'opacity-100' 
                                            : 'opacity-0'
                                        }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <span className="hidden sm:inline">Select All</span>
                                    <span className="sm:hidden">All</span>
                                </button>

                                {selectedAchievements.size > 0 && (
                                    <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                                        {selectedAchievements.size} selected
                                    </span>
                                )}
                            </div>

                            {selectedAchievements.size > 0 && (
                                <button
                                    onClick={bulkDeleteAchievements}
                                    className="flex items-center justify-center gap-1 sm:gap-2 px-3 sm:px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs sm:text-sm font-medium transition-colors"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    <span className="hidden sm:inline">Delete Selected ({selectedAchievements.size})</span>
                                    <span className="sm:hidden">Delete ({selectedAchievements.size})</span>
                                </button>
                            )}
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 sm:gap-4">
                            {achievements.map((img, index) => (
                                <div
                                    key={index}
                                    className={`relative group border-2 ${selectedAchievements.has(index)
                                        ? 'border-sky-500 ring-2 ring-sky-500'
                                        : draggedIndex === index
                                            ? 'border-sky-500 scale-105'
                                            : 'border-gray-300 dark:border-gray-600'
                                        } rounded-lg overflow-hidden cursor-move transition-all`}
                                    draggable
                                    onDragStart={() => handleDragStart(index)}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDragEnd={handleDragEnd}
                                >
                                    {/* Selection Checkbox */}
                                    <div className="absolute top-2 left-2 z-10">
                                        <label className="relative cursor-pointer group/checkbox">
                                            <input
                                                type="checkbox"
                                                checked={selectedAchievements.has(index)}
                                                onChange={() => toggleAchievementSelection(index)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="peer sr-only"
                                            />
                                            <div className="w-6 h-6 border-2 border-sky-400 dark:border-sky-600 rounded-md bg-white dark:bg-gray-700 peer-checked:bg-gradient-to-br peer-checked:from-sky-500 peer-checked:to-blue-600 peer-checked:border-sky-500 transition-all duration-200 flex items-center justify-center shadow-sm peer-checked:shadow-lg peer-checked:shadow-sky-500/50 group-hover/checkbox:border-sky-500 group-hover/checkbox:scale-110">
                                                <svg className="w-4 h-4 text-white opacity-0 peer-checked:opacity-100 transition-opacity duration-200 drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                            <div className="absolute inset-0 rounded-md bg-sky-400 opacity-0 peer-checked:opacity-20 blur-md transition-opacity duration-200 pointer-events-none"></div>
                                        </label>
                                    </div>

                                    <Image
                                        src={img.imageUrl}
                                        alt={`Achievement ${index + 1}`}
                                        width={300}
                                        height={300}
                                        className="w-full h-48 object-cover"
                                    />
                                    <div className="absolute top-2 right-2 flex gap-1">
                                        <button
                                            onClick={() => handleAchievementEdit(index)}
                                            className="bg-blue-600 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-blue-700"
                                            title="Replace image"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => deleteAchievement(index)}
                                            className="bg-red-600 text-white p-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-700"
                                            title="Delete image"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                    </div>
                                    <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white px-2 py-1 rounded text-sm flex items-center gap-1">
                                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                                        </svg>
                                        #{index + 1}
                                    </div>
                                </div>
                            ))}

                            {/* Add Achievement Image Button */}
                            <button
                                onClick={handleAchievementUpload}
                                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg h-48 flex flex-col items-center justify-center hover:border-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400 dark:text-gray-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                                <span className="text-gray-600 dark:text-gray-400">Add Achievements</span>
                                <span className="text-xs text-gray-500 dark:text-gray-500 mt-1">(multiple)</span>
                            </button>
                        </div>

                        <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <div>
                                    <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">Achievement Management Tips</h3>
                                    <ul className="text-sm text-blue-800 dark:text-blue-200 mt-1 space-y-1">
                                        <li>• Click &quot;Add Achievements&quot; to upload multiple achievement images at once</li>
                                        <li>• Use checkboxes to select multiple images for bulk deletion</li>
                                        <li>• Click &quot;Select All&quot; to select/deselect all images</li>
                                        <li>• Drag and drop images to reorder them</li>
                                        <li>• Hover over an image and click the blue edit icon to replace it</li>
                                        <li>• Hover over an image and click the red trash icon to delete a single image</li>
                                        <li>• Images are automatically numbered based on their order</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                )

            case 'specialities':
                return (
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium mb-2">Section Title</label>
                            <input
                                type="text"
                                value={specialitiesContent.title}
                                onChange={(e) => setSpecialitiesContent({ ...specialitiesContent, title: e.target.value })}
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all"
                                placeholder="e.g., Our Specialities"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Description</label>
                            <textarea
                                value={specialitiesContent.description}
                                onChange={(e) => setSpecialitiesContent({ ...specialitiesContent, description: e.target.value })}
                                rows={10}
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all resize-none"
                                placeholder="Enter the main description about your specialities..."
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium mb-2">Inspirational Quote</label>
                            <textarea
                                value={specialitiesContent.quote}
                                onChange={(e) => setSpecialitiesContent({ ...specialitiesContent, quote: e.target.value })}
                                rows={3}
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-all resize-none"
                                placeholder='e.g., "Drugs are not always necessary. Belief in recovery always is." - Norman Cousins'
                            />
                        </div>
                    </div>
                )
        }
    }

    return (
        <EditLayout>
            <div className="max-w-7xl mx-auto px-4 pb-20">
                <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">Edit Home Page</h1>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600 mb-4"></div>
                        <p className="text-gray-600 dark:text-gray-400">Loading home page content...</p>
                    </div>
                ) : (
                    <>
                        {/* Mobile Tabs */}
                        <div className="md:hidden mb-4">
                            <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                                <div className="relative flex gap-1 p-2 min-w-max overflow-x-auto">
                                    {sidebarItems.map((item) => (
                                        <button
                                            key={item.id}
                                            onClick={() => setActiveTab(item.id)}
                                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-200 whitespace-nowrap text-sm ${activeTab === item.id
                                                ? 'bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-md'
                                                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                                }`}
                                        >
                                            <span>{item.icon}</span>
                                            <span className="font-medium">{item.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-6">
                            {/* Desktop Sidebar */}
                            <div className="hidden md:block w-64 flex-shrink-0">
                                <div className="rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-4 sticky top-24 overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                                    <nav className="space-y-1">
                                        {sidebarItems.map((item) => (
                                            <button
                                                key={item.id}
                                                onClick={() => setActiveTab(item.id)}
                                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left ${activeTab === item.id
                                                    ? 'bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-lg shadow-sky-500/30 font-medium'
                                                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 hover:shadow-md'
                                                    }`}
                                            >
                                                <span className="text-xl">{item.icon}</span>
                                                <span>{item.label}</span>
                                            </button>
                                        ))}
                                    </nav>
                                </div>
                            </div>

                            {/* Main Content */}
                            <div className="flex-1 min-w-0">
                                <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-4 sm:p-6 md:p-8 overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                                    <div className="relative">
                                        <div className="flex items-center justify-between mb-6">
                                            <div>
                                                <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">
                                                    {sidebarItems.find(s => s.id === activeTab)?.label}
                                                </h2>
                                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                                    Edit the content for this section
                                                </p>
                                            </div>
                                            <button
                                                onClick={handleSave}
                                                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-600 hover:to-sky-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg font-medium"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                </svg>
                                                Save Changes
                                            </button>
                                        </div>

                                        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
                                            {renderEditor()}
                                        </div>
                                    </div>
                                </div>

                                {/* Info Card */}
                                <div className="mt-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                    <div className="flex items-start gap-3">
                                        <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <div>
                                            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100">Preview Changes</h3>
                                            <p className="text-sm text-blue-800 dark:text-blue-200 mt-1">
                                                Changes are saved locally. Click "Save Changes" to persist them to the database. Visit the landing page to see your changes live.
                                            </p>
                                        </div>
                                    </div>
                                </div>
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
                title="Delete Achievement"
                message="Are you sure you want to delete this achievement image? This action cannot be undone."
                onConfirm={confirmDeleteAchievement}
                onCancel={() => setShowDeleteConfirm(false)}
            />

            <ConfirmModal
                isOpen={showBulkDeleteConfirm}
                title="Delete Selected Achievements"
                message={`Are you sure you want to delete ${selectedAchievements.size} achievement(s)? This action cannot be undone.`}
                confirmText="Delete All"
                cancelText="Cancel"
                variant="danger"
                onConfirm={confirmBulkDeleteAchievements}
                onCancel={() => setShowBulkDeleteConfirm(false)}
            />
        </EditLayout>
    )
}

