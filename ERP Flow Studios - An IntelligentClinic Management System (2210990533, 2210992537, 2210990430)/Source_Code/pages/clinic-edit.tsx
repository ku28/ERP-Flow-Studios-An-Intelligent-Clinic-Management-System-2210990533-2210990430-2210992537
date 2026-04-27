import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Layout from '../components/Layout'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../hooks/useToast'
import ToastNotification from '../components/ToastNotification'
import {
    normalizeTemplateCollection,
    type PrescriptionTemplateCollection,
    type SavedPrescriptionTemplate,
} from '../lib/prescriptionTemplate'
import { getPlanDisplayName, normalizeSubscriptionPlan } from '../lib/subscription'

interface ImageUpload {
    file: File | null
    preview: string
    uploading: boolean
    url: string
}

type TabType = 'overview' | 'branding' | 'settings' | 'integrations' | 'management' | 'subscription'

const GRADIENT_PRESETS = [
    { key: 'blue',    label: 'Blue',    from: '#3B82F6', to: '#0EA5E9', brand: '#3B82F6', brandDark: '#60A5FA' },
    { key: 'purple',  label: 'Purple',  from: '#8B5CF6', to: '#6366F1', brand: '#8B5CF6', brandDark: '#A78BFA' },
    { key: 'emerald', label: 'Emerald', from: '#10B981', to: '#14B8A6', brand: '#10B981', brandDark: '#34D399' },
    { key: 'rose',    label: 'Rose',    from: '#F43F5E', to: '#FB923C', brand: '#F43F5E', brandDark: '#FB7185' },
    { key: 'teal',    label: 'Green',   from: '#22C55E', to: '#10B981', brand: '#22C55E', brandDark: '#4ADE80' },
]

export default function ClinicEdit() {
    const router = useRouter()
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [clinic, setClinic] = useState<any>(null)
    const [activeTab, setActiveTab] = useState<TabType>('overview')
    const [themeSaving, setThemeSaving] = useState(false)
    const { toasts, removeToast, showSuccess, showError, showWarning } = useToast()
    const { user: authUser } = useAuth()
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [isClosingDialog, setIsClosingDialog] = useState(false)
    const [deleteConfirmText, setDeleteConfirmText] = useState('')
    const [deleting, setDeleting] = useState(false)
    const [cancellingSubscription, setCancellingSubscription] = useState(false)
    const [brandingMode, setBrandingMode] = useState<'upload' | 'design'>('upload')
    const [templateLibrary, setTemplateLibrary] = useState<PrescriptionTemplateCollection>({ activeTemplateId: null, templates: [] })
    const [templateLibraryLoading, setTemplateLibraryLoading] = useState(false)
    const [templateVariantFilter, setTemplateVariantFilter] = useState<'non-pro' | 'pro'>('non-pro')

    // Locations management
    const [locations, setLocations] = useState<Array<{id: string; name: string | null; lat: number; lng: number; radius: number}>>([]) 
    const [locationDetecting, setLocationDetecting] = useState(false)
    const [locationDetectError, setLocationDetectError] = useState('')
    const [newLocationRadius, setNewLocationRadius] = useState(300)
    const [locationSaving, setLocationSaving] = useState(false)
    // Manual address search
    const [locationAddMode, setLocationAddMode] = useState<'auto' | 'manual'>('auto')
    const [locationSearch, setLocationSearch] = useState('')
    const [locationSearchLoading, setLocationSearchLoading] = useState(false)
    const [locationSearchResults, setLocationSearchResults] = useState<Array<{display_name: string; lat: string; lon: string}>>([])
    const [showLocationResults, setShowLocationResults] = useState(false)

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        address: '',
        city: '',
        state: ''
    })

    // Access code editing
    const [editingAccessCode, setEditingAccessCode] = useState(false)
    const [newAccessSuffix, setNewAccessSuffix] = useState('')
    const [accessCodeError, setAccessCodeError] = useState('')
    const [accessCodeSaving, setAccessCodeSaving] = useState(false)

    // Integrations
    const [ocrProvider, setOcrProvider] = useState('tesseract')
    const [geolocationProvider, setGeolocationProvider] = useState('browser')
    const [apiGoogleMapsKey, setApiGoogleMapsKey] = useState('')
    const [showMapsKey, setShowMapsKey] = useState(false)
    const [integrationsSaving, setIntegrationsSaving] = useState(false)
    const [visionUsage, setVisionUsage] = useState<{ used: number; limit: number; safeLimit: number } | null>(null)

    // Email integration
    const [emailProvider, setEmailProvider] = useState<'system' | 'smtp' | 'gmail'>('system')
    const [smtpHost, setSmtpHost] = useState('')
    const [smtpPort, setSmtpPort] = useState('587')
    const [smtpEmail, setSmtpEmail] = useState('')
    const [smtpPassword, setSmtpPassword] = useState('')
    const [smtpSecure, setSmtpSecure] = useState(false)
    const [showSmtpPassword, setShowSmtpPassword] = useState(false)
    const [emailSaving, setEmailSaving] = useState(false)
    const [emailTesting, setEmailTesting] = useState(false)
    const [gmailEmail, setGmailEmail] = useState('')
    const [gmailConnected, setGmailConnected] = useState(false)
    const [gmailConnecting, setGmailConnecting] = useState(false)
    const [gmailDisconnecting, setGmailDisconnecting] = useState(false)
    const [integrationsSubTab, setIntegrationsSubTab] = useState<'email' | 'logs' | 'ocr'>('email')
    const [emailLogs, setEmailLogs] = useState<any[]>([])
    const [emailLogsTotal, setEmailLogsTotal] = useState(0)
    const [emailLogsPage, setEmailLogsPage] = useState(1)
    const [emailLogsLoading, setEmailLogsLoading] = useState(false)

    const [images, setImages] = useState<{
        icon: ImageUpload
        header: ImageUpload
        footer: ImageUpload
        signature: ImageUpload
        watermark: ImageUpload
    }>({
        icon: { file: null, preview: '', uploading: false, url: '' },
        header: { file: null, preview: '', uploading: false, url: '' },
        footer: { file: null, preview: '', uploading: false, url: '' },
        signature: { file: null, preview: '', uploading: false, url: '' },
        watermark: { file: null, preview: '', uploading: false, url: '' }
    })

    useEffect(() => {
        checkClinicAccess()

        // Check for tab query parameter
        const { tab, gmail, gmailEmail: gmailEmailFromQuery } = router.query
        if (tab && ['overview', 'branding', 'settings', 'integrations', 'management', 'subscription'].includes(tab as string)) {
            setActiveTab(tab as TabType)
        }
        if (gmail === 'success') {
            setActiveTab('integrations')
            setIntegrationsSubTab('email')
            setEmailProvider('gmail')
            setGmailConnected(true)
            if (typeof gmailEmailFromQuery === 'string' && gmailEmailFromQuery.trim()) {
                setGmailEmail(gmailEmailFromQuery)
            }
            checkClinicAccess()
            showSuccess('Gmail connected successfully!')
            router.replace('/clinic-edit?tab=integrations', undefined, { shallow: true })
        } else if (gmail === 'error') {
            setActiveTab('integrations')
            setIntegrationsSubTab('email')
            showError('Failed to connect Gmail. Please try again.')
            router.replace('/clinic-edit?tab=integrations', undefined, { shallow: true })
        }
    }, [router.query])

    const checkClinicAccess = async () => {
        try {
            // Use AuthContext user first to avoid redundant /api/auth/me call
            if (authUser) {
                if (authUser.role !== 'admin') {
                    router.push('/dashboard')
                    return
                }
                if (authUser.clinic) {
                    loadClinicData(authUser.clinic)
                    fetchLocations(authUser.clinic.clinicId)
                } else {
                    router.push('/dashboard')
                }
                return
            }

            // Fallback to API for cases where authUser is not available yet
            const response = await fetch('/api/auth/me', { cache: 'no-store' })
            if (response.ok) {
                const data = await response.json()
                if (data.user?.role !== 'admin') {
                    router.push('/dashboard')
                    return
                }
                if (data.user?.clinic) {
                    loadClinicData(data.user.clinic)
                    fetchLocations(data.user.clinic.clinicId)
                } else {
                    router.push('/dashboard')
                }
            } else {
                router.push('/dashboard')
            }
        } catch (e) {
            router.push('/dashboard')
        }
    }

    const loadClinicData = (clinicData: any) => {
        setClinic(clinicData)
        setFormData({
            name: clinicData.name || '',
            email: clinicData.email || '',
            address: clinicData.address || '',
            city: clinicData.city || '',
            state: clinicData.state || ''
        })
        setImages({
            icon: { file: null, preview: clinicData.iconUrl || '', uploading: false, url: clinicData.iconUrl || '' },
            header: { file: null, preview: clinicData.prescriptionHeaderUrl || '', uploading: false, url: clinicData.prescriptionHeaderUrl || '' },
            footer: { file: null, preview: clinicData.prescriptionFooterUrl || '', uploading: false, url: clinicData.prescriptionFooterUrl || '' },
            signature: { file: null, preview: clinicData.prescriptionSignatureUrl || '', uploading: false, url: clinicData.prescriptionSignatureUrl || '' },
            watermark: { file: null, preview: clinicData.prescriptionWatermarkUrl || '', uploading: false, url: clinicData.prescriptionWatermarkUrl || '' }
        })
        // Load integrations
        setOcrProvider(clinicData.ocrProvider || 'tesseract')
        setGeolocationProvider(clinicData.geolocationProvider || 'browser')
        // Load email integration
        setEmailProvider(clinicData.emailProvider || 'system')
        setSmtpHost(clinicData.smtpHost || '')
        setSmtpPort(String(clinicData.smtpPort || 587))
        setSmtpEmail(clinicData.smtpEmail || '')
        setSmtpSecure(clinicData.smtpSecure || false)
        setGmailEmail(clinicData.gmailEmail || '')
        setGmailConnected(Boolean(clinicData.gmailConnected || clinicData.emailProvider === 'gmail'))
        // Fetch Vision usage
        fetch('/api/vision-usage').then(r => r.ok ? r.json() : null).then(data => {
            if (data) setVisionUsage(data)
        }).catch(() => {})
        void loadTemplateLibrary()
        setLoading(false)
    }

    const loadTemplateLibrary = async () => {
        setTemplateLibraryLoading(true)
        try {
            const response = await fetch('/api/clinic/prescription-template', { cache: 'no-store' })
            if (!response.ok) {
                return
            }
            const data = await response.json()
            setTemplateLibrary(normalizeTemplateCollection(data.collection || data))
        } catch {
        } finally {
            setTemplateLibraryLoading(false)
        }
    }

    const handleSelectActiveTemplate = async (templateId: string) => {
        try {
            const response = await fetch('/api/clinic/prescription-template', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'setActiveTemplate',
                    templateId,
                }),
            })

            const data = await response.json().catch(() => ({}))
            if (!response.ok) {
                showError(data?.error || 'Failed to set active template')
                return
            }

            setTemplateLibrary(normalizeTemplateCollection(data.collection || data))
            showSuccess('Active template updated')
        } catch {
            showError('Failed to set active template')
        }
    }

    const handleDeleteTemplate = async (templateId: string) => {
        const confirmed = confirm('Delete this template?')
        if (!confirmed) return

        try {
            const response = await fetch('/api/clinic/prescription-template', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'deleteTemplate',
                    templateId,
                }),
            })

            const data = await response.json().catch(() => ({}))
            if (!response.ok) {
                showError(data?.error || 'Failed to delete template')
                return
            }

            setTemplateLibrary(normalizeTemplateCollection(data.collection || data))
            showSuccess('Template deleted')
        } catch {
            showError('Failed to delete template')
        }
    }

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        })
    }

    // Location management functions
    const fetchLocations = async (clinicPublicId: string) => {
        try {
            const res = await fetch(`/api/clinic/locations?clinicId=${clinicPublicId}`)
            if (res.ok) {
                const data = await res.json()
                setLocations(data.locations || [])
            }
        } catch {}
    }

    const handleDetectAndAddLocation = () => {
        if (!navigator.geolocation) {
            setLocationDetectError('Geolocation not supported by your browser.')
            return
        }
        setLocationDetecting(true)
        setLocationDetectError('')

        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude
                const lng = pos.coords.longitude
                // Reverse geocode via Nominatim
                let name = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
                try {
                    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, { headers: { 'Accept-Language': 'en' } })
                    const d = await r.json()
                    name = d.display_name || name
                } catch {}

                setLocationSaving(true)
                try {
                    const res = await fetch('/api/clinic/locations', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ clinicId: clinic.clinicId, lat, lng, name, radius: newLocationRadius })
                    })
                    if (res.ok) {
                        const data = await res.json()
                        setLocations(prev => [...prev, data.location])
                        showSuccess('Location added successfully')
                    } else {
                        const d = await res.json()
                        showError(d.error || 'Failed to add location')
                    }
                } finally {
                    setLocationSaving(false)
                    setLocationDetecting(false)
                }
            },
            () => {
                setLocationDetectError('Could not detect location. Please allow location access in your browser.')
                setLocationDetecting(false)
            },
            { enableHighAccuracy: true, timeout: 10000 }
        )
    }

    const handleRemoveLocation = async (locationId: string) => {
        if (!confirm('Remove this location?')) return
        try {
            const res = await fetch(`/api/clinic/locations?id=${locationId}`, { method: 'DELETE' })
            if (res.ok) {
                setLocations(prev => prev.filter(l => l.id !== locationId))
                showSuccess('Location removed')
            } else {
                showError('Failed to remove location')
            }
        } catch {
            showError('Failed to remove location')
        }
    }

    const handleSearchAndAddLocation = async () => {
        if (!locationSearch.trim()) return
        setLocationSearchLoading(true)
        setLocationDetectError('')
        setShowLocationResults(false)
        try {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationSearch)}&limit=5`,
                { headers: { 'Accept-Language': 'en' } }
            )
            const results = await res.json()
            setLocationSearchResults(results || [])
            setShowLocationResults(true)
            if (!results.length) setLocationDetectError('No results found. Try a more specific address.')
        } catch {
            setLocationDetectError('Search failed. Please try again.')
        } finally {
            setLocationSearchLoading(false)
        }
    }

    const handleSelectAndSaveLocation = async (result: { display_name: string; lat: string; lon: string }) => {
        setShowLocationResults(false)
        setLocationSaving(true)
        setLocationDetectError('')
        try {
            const res = await fetch('/api/clinic/locations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clinicId: clinic.clinicId,
                    lat: parseFloat(result.lat),
                    lng: parseFloat(result.lon),
                    name: result.display_name,
                    radius: newLocationRadius,
                })
            })
            if (res.ok) {
                const data = await res.json()
                setLocations(prev => [...prev, data.location])
                showSuccess('Location added')
                setLocationSearch('')
                setLocationSearchResults([])
            } else {
                const d = await res.json()
                showError(d.error || 'Failed to add location')
            }
        } finally {
            setLocationSaving(false)
        }
    }

    const handleImageSelect = (type: keyof typeof images, e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            // Validate file type
            if (!file.type.startsWith('image/')) {
                showError('Please select a valid image file')
                return
            }

            // Validate file size (max 10MB)
            if (file.size > 10 * 1024 * 1024) {
                showError('Image size should be less than 10MB')
                return
            }

            const reader = new FileReader()
            reader.onloadend = () => {
                setImages(prev => ({
                    ...prev,
                    [type]: {
                        ...prev[type],
                        file,
                        preview: reader.result as string
                    }
                }))
            }
            reader.readAsDataURL(file)
        }
    }

    const handleDownloadImage = (url: string, fallbackName: string) => {
        if (!url) return

        const params = new URLSearchParams({
            url,
            filename: fallbackName,
        })

        const link = document.createElement('a')
        link.href = `/api/clinic/download-image?${params.toString()}`
        link.download = fallbackName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
    }

    const uploadImage = async (type: keyof typeof images): Promise<string> => {
        const imageData = images[type]
        if (!imageData.file) return imageData.url

        setImages(prev => ({
            ...prev,
            [type]: { ...prev[type], uploading: true }
        }))

        try {
            // Create canvas to maintain quality
            const img = await createImageBitmap(imageData.file)
            const canvas = document.createElement('canvas')
            canvas.width = img.width
            canvas.height = img.height

            const ctx = canvas.getContext('2d')
            if (!ctx) throw new Error('Failed to get canvas context')

            // Draw image at full resolution with high quality
            ctx.imageSmoothingEnabled = true
            ctx.imageSmoothingQuality = 'high'
            ctx.drawImage(img, 0, 0)

            // Convert to blob with maximum quality
            const blob = await new Promise<Blob>((resolve, reject) => {
                canvas.toBlob(
                    (blob) => {
                        if (blob) resolve(blob)
                        else reject(new Error('Failed to create blob'))
                    },
                    imageData.file!.type,
                    1.0 // Maximum quality
                )
            })

            // Convert blob to base64
            const reader = new FileReader()
            const base64Promise = new Promise<string>((resolve) => {
                reader.onloadend = () => resolve(reader.result as string)
                reader.readAsDataURL(blob)
            })
            const base64 = await base64Promise

            const response = await fetch('/api/upload-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: base64,
                    folder: 'clinics'
                })
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Upload failed')
            }

            setImages(prev => ({
                ...prev,
                [type]: { ...prev[type], uploading: false, url: data.url }
            }))

            return data.url
        } catch (err: any) {
            setImages(prev => ({
                ...prev,
                [type]: { ...prev[type], uploading: false }
            }))
            throw new Error(`Failed to upload ${type}: ${err.message}`)
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)

        try {
            // Upload images that were changed
            const iconUrl = images.icon.file ? await uploadImage('icon') : images.icon.url
            const headerUrl = images.header.file ? await uploadImage('header') : images.header.url
            const footerUrl = images.footer.file ? await uploadImage('footer') : images.footer.url
            const signatureUrl = images.signature.file ? await uploadImage('signature') : images.signature.url
            const watermarkUrl = images.watermark.file ? await uploadImage('watermark') : images.watermark.url

            // Update clinic data
            const response = await fetch('/api/clinic/update', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clinicId: clinic.clinicId,
                    name: formData.name,
                    email: formData.email,
                    address: formData.address,
                    city: formData.city,
                    state: formData.state,
                    iconUrl,
                    prescriptionHeaderUrl: headerUrl,
                    prescriptionFooterUrl: footerUrl,
                    prescriptionSignatureUrl: signatureUrl,
                    prescriptionWatermarkUrl: watermarkUrl
                })
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to update clinic')
            }

            // When branding uploads are saved, revert prescription rendering to the default layout.
            if (activeTab === 'branding' && brandingMode === 'upload') {
                await fetch('/api/clinic/prescription-template', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'setActiveTemplate',
                        templateId: null,
                    }),
                }).catch(() => null)
            }

            showSuccess('Clinic details updated successfully')

            // Reload clinic data and trigger page refresh to update header
            loadClinicData(data.clinic)
            window.location.reload()

            // Clear file inputs
            setImages(prev => ({
                icon: { ...prev.icon, file: null },
                header: { ...prev.header, file: null },
                footer: { ...prev.footer, file: null },
                signature: { ...prev.signature, file: null },
                watermark: { ...prev.watermark, file: null }
            }))
        } catch (err: any) {
            showError(err.message || 'Failed to update clinic details')
        } finally {
            setSaving(false)
        }
    }

    const handleLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' })
        } catch {}
        localStorage.removeItem('clinicId')
        localStorage.removeItem('clinicName')
        localStorage.removeItem('clinicIcon')
        sessionStorage.removeItem('currentUser')
        const cap = (window as any).Capacitor
        const isNativeCapacitor = !!cap && (
            (typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) ||
            (typeof cap.getPlatform === 'function' && cap.getPlatform() !== 'web')
        )
        const isApp = !!(window as any).electronAPI || isNativeCapacitor
        if (isApp) {
            router.replace('/login')
            return
        }
        window.location.href = '/'
    }

    const handleClinicLogout = async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' })
        } catch {}
        localStorage.removeItem('clinicId')
        localStorage.removeItem('clinicName')
        localStorage.removeItem('clinicIcon')
        sessionStorage.removeItem('currentUser')
        const cap = (window as any).Capacitor
        const isNativeCapacitor = !!cap && (
            (typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) ||
            (typeof cap.getPlatform === 'function' && cap.getPlatform() !== 'web')
        )
        const isApp = !!(window as any).electronAPI || isNativeCapacitor
        if (isApp) {
            router.replace('/login')
            return
        }
        window.location.href = '/'
    }

    const handleDeleteClinic = async () => {
        if (deleteConfirmText !== 'DELETE') {
            showWarning('Please type DELETE to confirm')
            return
        }

        setDeleting(true)
        try {
            const res = await fetch('/api/clinic/delete', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clinicId: clinic.clinicId })
            })

            const data = await res.json()

            if (res.ok) {
                showSuccess('Clinic deleted successfully. Redirecting...')
                localStorage.removeItem('clinicId')
                localStorage.removeItem('clinicName')
                setTimeout(() => {
                    router.push('/clinic-login')
                }, 2000)
            } else {
                showError(data.error || 'Failed to delete clinic')
                setDeleting(false)
            }
        } catch (err) {
            showError('An error occurred while deleting clinic')
            setDeleting(false)
        }
    }

    const handleCancelSubscription = async () => {
        const confirmed = confirm('Cancel subscription and disable clinic access now? Access will remain disabled until payment/upgrade is restored.')
        if (!confirmed) return

        setCancellingSubscription(true)
        try {
            const res = await fetch('/api/clinic/cancel-subscription', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            })
            const data = await res.json()
            if (!res.ok) {
                throw new Error(data.error || 'Failed to cancel subscription')
            }

            setClinic((prev: any) => ({ ...prev, ...data.clinic }))
            showWarning(`Subscription cancelled. Data deletion is scheduled for ${new Date(data.dataDeletionDate).toLocaleDateString()}.`)
            router.push('/upgrade?reason=subscription_cancelled')
        } catch (err: any) {
            showError(err.message || 'Failed to cancel subscription')
        } finally {
            setCancellingSubscription(false)
        }
    }

    const closeDeleteDialog = () => {
        setIsClosingDialog(true)
        document.body.style.overflow = 'unset'
        setTimeout(() => {
            setShowDeleteDialog(false)
            setIsClosingDialog(false)
            setDeleteConfirmText('')
        }, 200)
    }

    const normalizedPlan = normalizeSubscriptionPlan(clinic?.subscriptionPlan)
    const currentPlanName = getPlanDisplayName(clinic?.subscriptionPlan)
    const isPro = normalizedPlan === 'pro'
    const filteredTemplates = templateLibrary.templates.filter((item) =>
        templateVariantFilter === 'pro' ? item.variant === 'pro' : item.variant !== 'pro'
    )

    const getTemplateTitle = (template: SavedPrescriptionTemplate, index: number) => {
        const title = template.title?.trim()
        return title || `Template ${index + 1}`
    }

    const handleThemeChange = async (themeGradient: string) => {
        setThemeSaving(true)
        try {
            const res = await fetch('/api/clinic/update-theme', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ themeGradient })
            })
            if (res.ok) {
                setClinic((prev: any) => ({ ...prev, themeGradient }))
                showSuccess(`Theme updated to ${themeGradient}`)
            } else {
                const data = await res.json()
                showError(data.error || 'Failed to update theme')
            }
        } catch {
            showError('Failed to update theme')
        } finally {
            setThemeSaving(false)
        }
    }

    const handleSaveIntegrations = async () => {
        setIntegrationsSaving(true)
        try {
            const res = await fetch('/api/clinic/update-integrations', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ocrProvider,
                    geolocationProvider,
                    apiGoogleMapsKey: apiGoogleMapsKey || undefined,
                })
            })
            if (res.ok) {
                setClinic((prev: any) => ({ ...prev, ocrProvider, geolocationProvider }))
                showSuccess('Integration settings saved successfully')
                setApiGoogleMapsKey('')
            } else {
                const data = await res.json()
                showError(data.error || 'Failed to save integration settings')
            }
        } catch {
            showError('Failed to save integration settings')
        } finally {
            setIntegrationsSaving(false)
        }
    }

    const handleSaveEmailSettings = async () => {
        setEmailSaving(true)
        try {
            const body: any = { emailProvider }
            if (emailProvider === 'smtp') {
                if (!smtpHost || !smtpEmail || !smtpPassword) {
                    showError('Please fill in all SMTP fields')
                    setEmailSaving(false)
                    return
                }
                body.smtpHost = smtpHost
                body.smtpPort = parseInt(smtpPort) || 587
                body.smtpEmail = smtpEmail
                body.smtpPassword = smtpPassword
                body.smtpSecure = smtpSecure
            }
            const res = await fetch('/api/clinic/update-email', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })
            if (res.ok) {
                showSuccess('Email settings saved successfully')
                setSmtpPassword('')
            } else {
                const data = await res.json()
                showError(data.error || 'Failed to save email settings')
            }
        } catch {
            showError('Failed to save email settings')
        } finally {
            setEmailSaving(false)
        }
    }

    const handleTestEmail = async () => {
        setEmailTesting(true)
        try {
            const res = await fetch('/api/clinic/test-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            })
            const data = await res.json()
            if (res.ok) {
                showSuccess(data.message || 'Test email sent successfully!')
            } else {
                showError(data.error || 'Email test failed')
            }
        } catch {
            showError('Failed to test email')
        } finally {
            setEmailTesting(false)
        }
    }

    const handleConnectGmail = async () => {
        setGmailConnecting(true)
        try {
            const res = await fetch('/api/clinic/gmail-connect')
            const data = await res.json().catch(() => ({}))
            const redirectUrl = data.url || data.authUrl
            if (res.ok && redirectUrl) {
                window.location.href = redirectUrl
            } else {
                showError(data.error || 'Failed to start Gmail connection. Please check Gmail OAuth settings.')
                setGmailConnecting(false)
            }
        } catch {
            showError('Failed to connect Gmail')
            setGmailConnecting(false)
        }
    }

    const handleDisconnectGmail = async () => {
        if (!confirm('Disconnect Gmail? Emails will be sent via the system default.')) return
        setGmailDisconnecting(true)
        try {
            const res = await fetch('/api/clinic/gmail-disconnect', { method: 'POST' })
            if (res.ok) {
                setEmailProvider('system')
                setGmailEmail('')
                setGmailConnected(false)
                showSuccess('Gmail disconnected')
            } else {
                const data = await res.json()
                showError(data.error || 'Failed to disconnect Gmail')
            }
        } catch {
            showError('Failed to disconnect Gmail')
        } finally {
            setGmailDisconnecting(false)
        }
    }

    const fetchEmailLogs = async (page = 1) => {
        setEmailLogsLoading(true)
        try {
            const res = await fetch(`/api/clinic/email-logs?page=${page}&limit=20`)
            if (res.ok) {
                const data = await res.json()
                setEmailLogs(data.logs)
                setEmailLogsTotal(data.total)
                setEmailLogsPage(page)
            }
        } catch {
            // silent
        } finally {
            setEmailLogsLoading(false)
        }
    }

    const handleSaveAccessCode = async () => {
        setAccessCodeError('')
        if (!/^[A-Z0-9]{3}$/i.test(newAccessSuffix)) {
            setAccessCodeError('Must be exactly 3 alphanumeric characters (letters or digits).')
            return
        }
        setAccessCodeSaving(true)
        try {
            const res = await fetch('/api/clinic/update', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clinicId: clinic.clinicId,
                    name: formData.name,
                    email: formData.email,
                    address: formData.address,
                    city: formData.city,
                    state: formData.state,
                    iconUrl: images.icon.url,
                    prescriptionHeaderUrl: images.header.url,
                    prescriptionFooterUrl: images.footer.url,
                    prescriptionSignatureUrl: images.signature.url,
                    prescriptionWatermarkUrl: images.watermark.url,
                    newAccessCodeSuffix: newAccessSuffix.toUpperCase()
                })
            })
            const data = await res.json()
            if (res.ok) {
                setClinic((prev: any) => ({ ...prev, clinicId: data.clinic.clinicId }))
                setEditingAccessCode(false)
                setNewAccessSuffix('')
                showSuccess(`Access code updated to ${data.clinic.clinicId}`)
            } else {
                setAccessCodeError(data.error || 'Failed to update access code')
            }
        } catch {
            setAccessCodeError('Failed to update access code')
        } finally {
            setAccessCodeSaving(false)
        }
    }

    const sidebarItems = [
        { id: 'overview' as TabType, label: 'Overview', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> },
        { id: 'branding' as TabType, label: 'Branding', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg> },
        { id: 'settings' as TabType, label: 'Settings', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
        { id: 'management' as TabType, label: 'Management', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg> },
        { id: 'integrations' as TabType, label: 'Integrations', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> },
        { id: 'subscription' as TabType, label: 'Manage Subscription', icon: isPro
            ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
            : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
        }
    ]

    // Loading state
    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Loading clinic details...</p>
                </div>
            </div>
        )
    }

    // Clinic edit form
    return (
        <>
            <ToastNotification toasts={toasts} removeToast={removeToast} />
            <Head>
                <title>Edit Clinic Details | ERP Flow Studios</title>
            </Head>
            <div className="max-w-7xl mx-auto">
                <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">Clinic Settings</h1>

                {/* Mobile Tabs */}
                <div className="md:hidden mb-4">
                    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 overflow-x-auto">
                        <div className="flex gap-1 p-2 min-w-max">
                            {sidebarItems.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveTab(item.id)}
                                    className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-200 whitespace-nowrap text-sm ${activeTab === item.id
                                        ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-md'
                                        : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                        }`}
                                >
                                    <span className={activeTab === item.id ? 'text-white' : 'text-gray-600 dark:text-gray-400'}>{item.icon}</span>
                                    <span className="font-medium">{item.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="flex gap-6">
                    {/* Desktop Sidebar */}
                    <div className="hidden md:block w-64 flex-shrink-0">
                        <div className="rounded-xl border border-purple-200/30 dark:border-purple-700/30 bg-gradient-to-br from-white via-purple-50/30 to-pink-50/20 dark:from-gray-900 dark:via-purple-950/20 dark:to-gray-900 shadow-lg shadow-purple-500/5 backdrop-blur-sm p-4 sticky top-24 overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-br from-purple-400/5 via-transparent to-pink-500/5 pointer-events-none rounded-xl"></div>
                            <nav className="space-y-1">
                                {sidebarItems.map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => setActiveTab(item.id)}
                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left ${activeTab === item.id
                                            ? 'bg-gradient-to-r from-purple-500 to-pink-600 text-white shadow-lg shadow-purple-500/30 font-medium'
                                            : 'hover:bg-gray-100 dark:hover:bg-gray-800 hover:shadow-md'
                                            }`}
                                    >
                                        <span className={activeTab === item.id ? 'text-white' : 'text-gray-600 dark:text-gray-400'}>{item.icon}</span>
                                        <span>{item.label}</span>
                                    </button>
                                ))}
                            </nav>
                        </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0">
                        {activeTab === 'overview' && (
                            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-4 sm:p-6 md:p-8 border border-gray-200 dark:border-gray-700">
                                <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Clinic Overview</h2>

                                <div className="space-y-6">
                                    {/* Clinic Logo */}
                                    <div className="flex justify-center">
                                        <div className="relative">
                                        {images.icon.preview ? (
                                            <img
                                                src={images.icon.preview}
                                                alt="Clinic Logo"
                                                className="w-32 h-32 rounded-full object-cover border-4 border-purple-200 dark:border-purple-800 shadow-lg"
                                            />
                                        ) : (
                                            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900 flex items-center justify-center border-4 border-purple-200 dark:border-purple-800">
                                                <svg className="w-16 h-16 text-purple-400 dark:text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                </svg>
                                            </div>
                                        )}
                                        {/* PRO Badge */}
                                        {isPro && (
                                            <span className="absolute -top-1 -right-1 px-2 py-0.5 text-[10px] font-black tracking-wider rounded-full shadow-lg border border-amber-300 dark:border-amber-500" style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706, #B45309)', color: '#FFF' }}>
                                                PRO
                                            </span>
                                        )}
                                        </div>
                                    </div>

                                    {/* Clinic Info */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg border border-purple-200/30 dark:border-purple-700/30">
                                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Clinic Name</div>
                                            <div className="text-lg font-semibold text-gray-900 dark:text-white">{clinic.name}</div>
                                        </div>
                                        <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg border border-purple-200/30 dark:border-purple-700/30">
                                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Access Code</div>
                                            <div className="text-lg font-mono font-semibold text-gray-900 dark:text-white tracking-widest">{clinic.clinicId}</div>
                                        </div>
                                        <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg border border-purple-200/30 dark:border-purple-700/30 sm:col-span-2">
                                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Email</div>
                                            <div className="text-lg font-semibold text-gray-900 dark:text-white">{clinic.email}</div>
                                        </div>
                                    </div>

                                    {/* Theme Customization Card */}
                                    <div className={`p-4 rounded-lg border ${isPro ? 'bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-purple-200/30 dark:border-purple-700/30' : 'bg-gray-50 dark:bg-gray-800/50 border-gray-200/50 dark:border-gray-700/50'}`}>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-2">
                                                <svg className={`w-5 h-5 ${isPro ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400 dark:text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                                                </svg>
                                                <h4 className={`text-sm font-semibold ${isPro ? 'text-gray-900 dark:text-white' : 'text-gray-500 dark:text-gray-400'}`}>Theme Customization</h4>
                                                {!isPro && (
                                                    <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-700">PRO</span>
                                                )}
                                            </div>
                                            {themeSaving && <span className="text-xs text-purple-500 animate-pulse">Saving...</span>}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className={`text-xs ${isPro ? 'text-gray-500 dark:text-gray-400' : 'text-gray-400 dark:text-gray-500'} mr-1`}>Theme:</span>
                                            {GRADIENT_PRESETS.map(preset => (
                                                <button
                                                    key={preset.key}
                                                    onClick={() => {
                                                        if (isPro) {
                                                            handleThemeChange(preset.key)
                                                        } else {
                                                            setActiveTab('subscription')
                                                        }
                                                    }}
                                                    disabled={themeSaving}
                                                    className={`w-8 h-8 rounded-full transition-all duration-200 border-2 ${
                                                        isPro
                                                            ? `hover:scale-110 ${(clinic.themeGradient || 'blue') === preset.key
                                                                ? 'border-gray-900 dark:border-white scale-110 shadow-lg'
                                                                : 'border-transparent hover:border-gray-300 dark:hover:border-gray-500'}`
                                                            : 'opacity-50 cursor-pointer border-transparent grayscale'
                                                    }`}
                                                    style={{ background: `linear-gradient(135deg, ${preset.from}, ${preset.to})` }}
                                                    title={isPro ? preset.label : 'Upgrade to Pro to customize theme'}
                                                />
                                            ))}
                                        </div>
                                        {!isPro && (
                                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                                                Upgrade to Pro to unlock custom theme colors.
                                            </p>
                                        )}
                                    </div>

                                    {/* Quick Info */}
                                    <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200/30 dark:border-blue-700/30">
                                        <div className="flex items-start gap-3">
                                            <svg className="w-6 h-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            <div>
                                                <div className="font-medium text-gray-900 dark:text-white mb-1">Clinic Information</div>
                                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                                    Your clinic access code is permanent and cannot be changed. Share it with staff members who need access to your clinic&apos;s ERP system.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    {/* ===== Geo-Location Management ===== */}
                                    <div className="border-2 border-blue-200 dark:border-blue-700 rounded-xl p-5 space-y-3 bg-blue-50/40 dark:bg-blue-900/10">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Geo-Restriction Locations</h4>
                                            </div>
                                            <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2.5 py-1 rounded-full font-medium">
                                                {locations.length} location{locations.length !== 1 ? 's' : ''}
                                            </span>
                                        </div>

                                        {locations.length === 0 ? (
                                            <p className="text-xs text-amber-600 dark:text-amber-400 italic">
                                                No locations set — geo-restriction is disabled. Staff can login from anywhere.
                                            </p>
                                        ) : (
                                            <div className="space-y-2">
                                                {locations.map(loc => (
                                                    <div key={loc.id} className="flex items-start gap-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-medium text-gray-800 dark:text-white truncate">
                                                                {loc.name || `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`}
                                                            </p>
                                                            <a
                                                                href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`}
                                                                target="_blank" rel="noreferrer"
                                                                className="text-xs text-blue-500 hover:underline"
                                                            >
                                                                {loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}
                                                            </a>
                                                            <span className="ml-2 text-xs text-gray-400">• {loc.radius}m radius</span>
                                                        </div>
                                                        <button
                                                            onClick={() => handleRemoveLocation(loc.id)}
                                                            className="text-gray-300 hover:text-red-500 transition-colors p-1 flex-shrink-0"
                                                            title="Remove"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Radius selector */}
                                        <div className="flex items-center gap-3">
                                            <label className="text-xs font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">New location radius:</label>
                                            <input
                                                type="range" min={50} max={2000} step={50}
                                                value={newLocationRadius}
                                                onChange={e => setNewLocationRadius(parseInt(e.target.value))}
                                                className="flex-1 h-2 bg-blue-200 dark:bg-blue-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                            />
                                            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 min-w-[3rem]">{newLocationRadius}m</span>
                                        </div>

                                        {/* Mode toggle */}
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => { setLocationAddMode('auto'); setLocationDetectError(''); setShowLocationResults(false) }}
                                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                                                    locationAddMode === 'auto'
                                                        ? 'border-blue-500 bg-blue-600 text-white'
                                                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                                                }`}
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                                                Add Current Location
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { setLocationAddMode('manual'); setLocationDetectError('') }}
                                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                                                    locationAddMode === 'manual'
                                                        ? 'border-blue-500 bg-blue-600 text-white'
                                                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                                                }`}
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                                Search Address
                                            </button>
                                        </div>

                                        {locationAddMode === 'auto' ? (
                                            <button
                                                type="button"
                                                onClick={handleDetectAndAddLocation}
                                                disabled={locationDetecting || locationSaving}
                                                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
                                            >
                                                {(locationDetecting || locationSaving) ? (
                                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                                ) : (
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                                                )}
                                                {locationDetecting ? 'Detecting GPS…' : locationSaving ? 'Saving…' : 'Detect & Add My Location'}
                                            </button>
                                        ) : (
                                            /* Manual search */
                                            <div className="space-y-2">
                                                <div className="flex gap-2">
                                                    <input
                                                        type="text"
                                                        value={locationSearch}
                                                        onChange={e => { setLocationSearch(e.target.value); setShowLocationResults(false) }}
                                                        onKeyDown={e => e.key === 'Enter' && handleSearchAndAddLocation()}
                                                        placeholder="e.g. 123 Main Street, Mumbai"
                                                        className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={handleSearchAndAddLocation}
                                                        disabled={locationSearchLoading || !locationSearch.trim()}
                                                        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
                                                    >
                                                        {locationSearchLoading ? (
                                                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                                        ) : (
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                                                        )}
                                                        Search
                                                    </button>
                                                </div>
                                                {showLocationResults && locationSearchResults.length > 0 && (
                                                    <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden shadow-lg bg-white dark:bg-gray-800">
                                                        {locationSearchResults.map((r, i) => (
                                                            <button
                                                                key={i}
                                                                type="button"
                                                                onClick={() => handleSelectAndSaveLocation(r)}
                                                                disabled={locationSaving}
                                                                className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b border-gray-100 dark:border-gray-700 last:border-0 text-gray-800 dark:text-gray-200 transition-colors disabled:opacity-60"
                                                            >
                                                                <div className="flex items-start gap-2">
                                                                    <svg className="w-3.5 h-3.5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                                    <span className="break-words">{r.display_name}</span>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {locationDetectError && (
                                            <p className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                                                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
                                                {locationDetectError}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'branding' && (
                            <div className="space-y-4">
                                <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-2 border border-gray-200 dark:border-gray-700 flex gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setBrandingMode('upload')}
                                        className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${brandingMode === 'upload' ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}
                                    >
                                        Upload Images
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setBrandingMode('design')}
                                        className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${brandingMode === 'design' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}
                                    >
                                        Design Layout
                                    </button>
                                </div>

                                {brandingMode === 'upload' && (
                                    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-4 sm:p-6 md:p-8 border border-gray-200 dark:border-gray-700">
                                <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Clinic Branding</h2>

                                <div className="space-y-6">
                                    {/* Clinic Logo */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                            Clinic Logo
                                        </label>
                                        <div className="flex flex-col sm:flex-row items-center gap-4">
                                            {images.icon.preview && (
                                                <div className="relative">
                                                    <img
                                                        src={images.icon.preview}
                                                        alt="Clinic Logo"
                                                        className="w-24 h-24 rounded-full object-cover border-2 border-gray-300 dark:border-gray-600"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDownloadImage(images.icon.url || images.icon.preview, 'clinic-logo')}
                                                        className="absolute -bottom-2 -right-2 p-2 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-purple-600 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                                                        title="Download original image"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            )}
                                            <label className="flex-1 cursor-pointer">
                                                <div className="px-4 py-3 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors text-center border border-purple-200/50 dark:border-purple-700/50">
                                                    {images.icon.uploading ? 'Uploading...' : images.icon.file ? 'Change Logo' : 'Choose Logo'}
                                                </div>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={(e) => handleImageSelect('icon', e)}
                                                    className="hidden"
                                                    disabled={images.icon.uploading}
                                                />
                                            </label>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                            Recommended: Square image, at least 200x200px. Maximum file size: 10MB
                                        </p>
                                    </div>

                                    {/* Prescription Header */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                            Prescription Header Image
                                        </label>
                                        <div className="space-y-3">
                                            {images.header.preview && (
                                                <div className="relative">
                                                    <img
                                                        src={images.header.preview}
                                                        alt="Header"
                                                        className="w-full max-h-32 object-contain border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 p-2"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDownloadImage(images.header.url || images.header.preview, 'prescription-header')}
                                                        className="absolute top-2 right-2 p-2 rounded-lg bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 text-purple-600 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                                                        title="Download original image"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            )}
                                            <label className="cursor-pointer block">
                                                <div className="px-4 py-3 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors text-center border border-purple-200/50 dark:border-purple-700/50">
                                                    {images.header.uploading ? 'Uploading...' : images.header.file ? 'Change Header' : 'Choose Header'}
                                                </div>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={(e) => handleImageSelect('header', e)}
                                                    className="hidden"
                                                    disabled={images.header.uploading}
                                                />
                                            </label>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                            This will appear at the top of prescription PDFs
                                        </p>
                                    </div>

                                    {/* Prescription Footer */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                            Prescription Footer Image
                                        </label>
                                        <div className="space-y-3">
                                            {images.footer.preview && (
                                                <div className="relative">
                                                    <img
                                                        src={images.footer.preview}
                                                        alt="Footer"
                                                        className="w-full max-h-32 object-contain border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 p-2"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDownloadImage(images.footer.url || images.footer.preview, 'prescription-footer')}
                                                        className="absolute top-2 right-2 p-2 rounded-lg bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 text-purple-600 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                                                        title="Download original image"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            )}
                                            <label className="cursor-pointer block">
                                                <div className="px-4 py-3 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors text-center border border-purple-200/50 dark:border-purple-700/50">
                                                    {images.footer.uploading ? 'Uploading...' : images.footer.file ? 'Change Footer' : 'Choose Footer'}
                                                </div>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={(e) => handleImageSelect('footer', e)}
                                                    className="hidden"
                                                    disabled={images.footer.uploading}
                                                />
                                            </label>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                            This will appear at the bottom of prescription PDFs
                                        </p>
                                    </div>

                                    {/* Doctor Signature */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                            Doctor Signature
                                        </label>
                                        <div className="space-y-3">
                                            {images.signature.preview && (
                                                <div className="relative">
                                                    <img
                                                        src={images.signature.preview}
                                                        alt="Signature"
                                                        className="w-full max-h-24 object-contain border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 p-2"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDownloadImage(images.signature.url || images.signature.preview, 'doctor-signature')}
                                                        className="absolute top-2 right-2 p-2 rounded-lg bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 text-purple-600 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                                                        title="Download original image"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            )}
                                            <label className="cursor-pointer block">
                                                <div className="px-4 py-3 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors text-center border border-purple-200/50 dark:border-purple-700/50">
                                                    {images.signature.uploading ? 'Uploading...' : images.signature.file ? 'Change Signature' : 'Choose Signature'}
                                                </div>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={(e) => handleImageSelect('signature', e)}
                                                    className="hidden"
                                                    disabled={images.signature.uploading}
                                                />
                                            </label>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                            Doctor's signature for prescriptions
                                        </p>
                                    </div>

                                    {/* Prescription Watermark */}
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                            Prescription Watermark
                                        </label>
                                        <div className="space-y-3">
                                            {images.watermark.preview && (
                                                <div className="relative">
                                                    <img
                                                        src={images.watermark.preview}
                                                        alt="Watermark"
                                                        className="w-full max-h-40 object-contain border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800 p-2"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => handleDownloadImage(images.watermark.url || images.watermark.preview, 'prescription-watermark')}
                                                        className="absolute top-2 right-2 p-2 rounded-lg bg-white/90 dark:bg-gray-800/90 border border-gray-200 dark:border-gray-700 text-purple-600 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                                                        title="Download original image"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            )}
                                            <label className="cursor-pointer block">
                                                <div className="px-4 py-3 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors text-center border border-purple-200/50 dark:border-purple-700/50">
                                                    {images.watermark.uploading ? 'Uploading...' : images.watermark.file ? 'Change Watermark' : 'Choose Watermark'}
                                                </div>
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={(e) => handleImageSelect('watermark', e)}
                                                    className="hidden"
                                                    disabled={images.watermark.uploading}
                                                />
                                            </label>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                            Background watermark for prescriptions (recommended: transparent PNG)
                                        </p>
                                    </div>

                                    {/* Submit Button */}
                                    <div className="flex gap-3 pt-4">
                                        <button
                                            type="submit"
                                            disabled={saving || Object.values(images).some(img => img.uploading)}
                                            className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
                                        >
                                            {saving ? 'Saving...' : 'Save Changes'}
                                        </button>
                                    </div>
                                </div>
                                    </form>
                                )}

                                {brandingMode === 'design' && (
                                    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-4 sm:p-6 border border-gray-200 dark:border-gray-700">
                                        <h2 className="text-xl sm:text-2xl font-bold mb-4 bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">Prescription Template Builder</h2>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                            Create templates in the realtime builder, then activate any template from this library. The active template is used for patient copy rendering.
                                        </p>

                                        <div className="mb-4 flex flex-wrap items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={() => router.push('/clinic/branding-builder?templateId=new')}
                                                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"
                                            >
                                                Open Realtime Builder Page
                                            </button>
                                            <button
                                                type="button"
                                                onClick={loadTemplateLibrary}
                                                className="px-3 py-2 rounded-lg border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 text-sm font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/20"
                                            >
                                                Refresh Templates
                                            </button>
                                        </div>

                                        {isPro && (
                                            <div className="mb-4 inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                                                <button
                                                    type="button"
                                                    onClick={() => setTemplateVariantFilter('non-pro')}
                                                    className={`px-3 py-1.5 text-xs font-semibold ${templateVariantFilter === 'non-pro' ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300'}`}
                                                >
                                                    Non-Pro Templates
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setTemplateVariantFilter('pro')}
                                                    className={`px-3 py-1.5 text-xs font-semibold border-l border-gray-200 dark:border-gray-700 ${templateVariantFilter === 'pro' ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300'}`}
                                                >
                                                    Pro Templates
                                                </button>
                                            </div>
                                        )}

                                        {templateLibraryLoading ? (
                                            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                                                Loading templates...
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                                <div className="rounded-xl border border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/60 dark:bg-blue-900/20 p-3">
                                                    <div className="aspect-[0.7] rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-900 p-3">
                                                        <div className="h-3 bg-blue-200 dark:bg-blue-800 rounded mb-2" />
                                                        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded mb-1" />
                                                        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded mb-1" />
                                                        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3" />
                                                        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded mb-1" />
                                                        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded mb-1" />
                                                        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                                                    </div>
                                                    <div className="mt-3">
                                                        <div className="text-sm font-semibold text-blue-800 dark:text-blue-300">Default Layout</div>
                                                        <div className="text-xs text-blue-700/80 dark:text-blue-300/80">Start from the base builder layout.</div>
                                                    </div>
                                                </div>

                                                {filteredTemplates.map((template, index) => {
                                                    const title = getTemplateTitle(template, index)
                                                    const enabledSections = template.template.sections.filter((section) => section.enabled).slice(0, 5)
                                                    const isActive = templateLibrary.activeTemplateId === template.id

                                                    return (
                                                        <div key={template.id} className={`rounded-xl border p-3 ${isActive ? 'border-emerald-400 bg-emerald-50/40 dark:border-emerald-700 dark:bg-emerald-900/10' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900'}`}>
                                                            <div className="aspect-[0.7] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950 p-3 overflow-hidden">
                                                                <div className="h-3 rounded bg-gray-300 dark:bg-gray-700 mb-2" />
                                                                {enabledSections.map((section) => (
                                                                    <div key={section.id} className="mb-1 h-2 rounded bg-gray-200 dark:bg-gray-800" />
                                                                ))}
                                                                <div className="mt-2 text-[10px] text-gray-500 dark:text-gray-400">
                                                                    {template.template.layoutId}
                                                                </div>
                                                            </div>

                                                            <div className="mt-3 flex items-start justify-between gap-2">
                                                                <div>
                                                                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</div>
                                                                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                                                                        Updated {new Date(template.updatedAt).toLocaleDateString()}
                                                                    </div>
                                                                </div>
                                                                {isActive && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300">ACTIVE</span>}
                                                            </div>

                                                            <div className="mt-3 flex items-center gap-2">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleSelectActiveTemplate(template.id)}
                                                                    className="px-2.5 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white"
                                                                >
                                                                    Select
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => router.push(`/clinic/branding-builder?templateId=${template.id}`)}
                                                                    className="px-2.5 py-1.5 rounded-md text-xs font-semibold border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
                                                                    title="Edit template"
                                                                >
                                                                    Edit
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleDeleteTemplate(template.id)}
                                                                    className="px-2.5 py-1.5 rounded-md text-xs font-semibold border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300"
                                                                    title="Delete template"
                                                                >
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'settings' && (
                            <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-4 sm:p-6 md:p-8 border border-gray-200 dark:border-gray-700">
                                <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Clinic Settings</h2>

                                <div className="space-y-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Clinic Name *
                                        </label>
                                        <input
                                            type="text"
                                            name="name"
                                            value={formData.name}
                                            onChange={handleInputChange}
                                            required
                                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Email *
                                        </label>
                                        <input
                                            type="email"
                                            name="email"
                                            value={formData.email}
                                            onChange={handleInputChange}
                                            required
                                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Clinic Address
                                        </label>
                                        <input
                                            type="text"
                                            name="address"
                                            value={formData.address}
                                            onChange={handleInputChange}
                                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                                            placeholder="e.g., 123 Main Street, Building 5"
                                        />
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                City
                                            </label>
                                            <input
                                                type="text"
                                                name="city"
                                                value={formData.city}
                                                onChange={handleInputChange}
                                                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                                                placeholder="e.g., Mumbai"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                State
                                            </label>
                                            <input
                                                type="text"
                                                name="state"
                                                value={formData.state}
                                                onChange={handleInputChange}
                                                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-800 dark:text-white"
                                                placeholder="e.g., Maharashtra"
                                            />
                                        </div>
                                    </div>

                                    {/* ===== Locations Management ===== */}
                                    <div className="border-2 border-blue-200 dark:border-blue-700 rounded-xl p-5 space-y-4 bg-blue-50/40 dark:bg-blue-900/10">
                                        <div className="flex items-center gap-2">
                                            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Clinic Locations</h4>
                                            <span className="ml-auto text-xs text-gray-400">{locations.length} location{locations.length !== 1 ? 's' : ''}</span>
                                        </div>

                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Staff can only log in from within the radius of <strong>any</strong> listed location. You can add multiple locations (e.g. multiple branches). If no locations are set, anyone with the access code can log in from anywhere.
                                        </p>

                                        {/* Existing Locations */}
                                        {locations.length > 0 ? (
                                            <div className="space-y-2">
                                                {locations.map(loc => (
                                                    <div key={loc.id} className="flex items-start gap-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2.5">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-medium text-gray-800 dark:text-white truncate">{loc.name || `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`}</p>
                                                            <p className="text-xs text-gray-400 mt-0.5">GPS: {loc.lat.toFixed(6)}, {loc.lng.toFixed(6)} • Radius: {loc.radius}m</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveLocation(loc.id)}
                                                            className="flex-shrink-0 text-gray-300 hover:text-red-500 transition-colors p-1"
                                                            title="Remove location"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-amber-600 dark:text-amber-400 italic">No locations set — geo-restriction is disabled.</p>
                                        )}

                                        {/* Radius for new location */}
                                        <div>
                                            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                                Radius for new location: <span className="text-blue-600 font-bold">{newLocationRadius}m</span>
                                            </label>
                                            <input
                                                type="range" min={50} max={2000} step={50}
                                                value={newLocationRadius}
                                                onChange={e => setNewLocationRadius(parseInt(e.target.value))}
                                                className="w-full h-2 bg-blue-200 dark:bg-blue-800 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                            />
                                            <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>50m</span><span>1km</span><span>2km</span></div>
                                        </div>

                                        {locationDetectError && (
                                            <p className="text-xs text-red-600 dark:text-red-400">{locationDetectError}</p>
                                        )}

                                        <button
                                            type="button"
                                            onClick={handleDetectAndAddLocation}
                                            disabled={locationDetecting || locationSaving}
                                            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 shadow-sm"
                                        >
                                            {(locationDetecting || locationSaving) ? (
                                                <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                </svg>
                                            ) : (
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                </svg>
                                            )}
                                            {locationDetecting ? 'Detecting…' : locationSaving ? 'Saving…' : 'Add Current Location'}
                                        </button>
                                    </div>

                                    {/* Access Code Section */}
                                    <div className="border-2 border-indigo-200 dark:border-indigo-700 rounded-xl p-5 space-y-3 bg-indigo-50/40 dark:bg-indigo-900/10">
                                        <div className="flex items-center gap-2">
                                            <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                            </svg>
                                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Clinic Access Code</h4>
                                        </div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">Share this code with staff so they can log in to your clinic. Pro users can customise the last 3 characters.</p>
                                        <div className="flex items-center gap-3">
                                            <span className="flex-1 text-center font-mono tracking-[0.35em] text-2xl font-bold text-indigo-700 dark:text-indigo-300 bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-600 rounded-lg py-3 px-4 select-all">
                                                {clinic?.clinicId}
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => { navigator.clipboard?.writeText(clinic?.clinicId || ''); showSuccess('Access code copied!') }}
                                                className="p-3 bg-indigo-100 dark:bg-indigo-800 hover:bg-indigo-200 dark:hover:bg-indigo-700 text-indigo-700 dark:text-indigo-300 rounded-lg transition-colors"
                                                title="Copy to clipboard"
                                            >
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                            </button>
                                        </div>
                                        {isPro ? (
                                            editingAccessCode ? (
                                                <div className="space-y-2">
                                                    <p className="text-xs text-gray-600 dark:text-gray-400">
                                                        First 3 chars are fixed: <strong className="font-mono">{clinic?.clinicId?.slice(0, 3)}</strong> — enter your preferred last 3 characters:
                                                    </p>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-mono font-bold text-lg text-gray-500 dark:text-gray-400">{clinic?.clinicId?.slice(0, 3)}</span>
                                                        <input
                                                            type="text"
                                                            maxLength={3}
                                                            value={newAccessSuffix}
                                                            onChange={e => { setNewAccessSuffix(e.target.value.toUpperCase()); setAccessCodeError('') }}
                                                            placeholder="X X X"
                                                            className="w-24 text-center font-mono tracking-widest text-lg font-bold uppercase border-2 border-indigo-400 dark:border-indigo-500 rounded-lg py-2 px-3 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                    </div>
                                                    {accessCodeError && <p className="text-xs text-red-600 dark:text-red-400">{accessCodeError}</p>}
                                                    <div className="flex gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={handleSaveAccessCode}
                                                            disabled={accessCodeSaving || !newAccessSuffix}
                                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                                                        >
                                                            {accessCodeSaving ? 'Saving…' : 'Save Code'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => { setEditingAccessCode(false); setNewAccessSuffix(''); setAccessCodeError('') }}
                                                            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => { setEditingAccessCode(true); setNewAccessSuffix(clinic?.clinicId?.slice(3) || '') }}
                                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                    Edit Last 3 Digits
                                                </button>
                                            )
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => router.push('/clinic-edit?tab=subscription')}
                                                className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                                                ✨ Upgrade to Edit
                                            </button>
                                        )}
                                    </div>

                                    {/* Submit Button */}
                                    <div className="flex gap-3 pt-4">
                                        <button
                                            type="submit"
                                            disabled={saving}
                                            className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
                                        >
                                            {saving ? 'Saving...' : 'Save Changes'}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        )}

                        {activeTab === 'integrations' && (
                            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-4 sm:p-6 md:p-8 border border-gray-200 dark:border-gray-700 space-y-6">
                                <h2 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">Integrations &amp; API Settings</h2>

                                {/* Sub-tabs */}
                                <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
                                    {([
                                        { key: 'email', label: 'Email' },
                                        { key: 'logs', label: 'Email Logs' },
                                        { key: 'ocr', label: 'OCR & Geo' },
                                    ] as const).map(st => (
                                        <button
                                            key={st.key}
                                            type="button"
                                            onClick={() => {
                                                setIntegrationsSubTab(st.key)
                                                if (st.key === 'logs') fetchEmailLogs(1)
                                            }}
                                            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${integrationsSubTab === st.key ? 'bg-white dark:bg-gray-700 text-violet-700 dark:text-violet-300 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
                                        >
                                            {st.label}
                                        </button>
                                    ))}
                                </div>

                                {/* ── Email Integration Sub-tab ── */}
                                {integrationsSubTab === 'email' && (
                                    <div className="space-y-6">
                                        {/* Provider selection */}
                                        <div className="border-2 border-emerald-200 dark:border-emerald-700 rounded-xl p-5 space-y-4 bg-emerald-50/40 dark:bg-emerald-900/10">
                                            <div className="flex items-center gap-2">
                                                <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                </svg>
                                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Email Provider</h4>
                                                <span className="text-xs text-gray-400">for sending PO emails, notifications, etc.</span>
                                            </div>

                                            <div className="space-y-2">
                                                <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${emailProvider === 'system' ? 'border-emerald-400 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
                                                    <input type="radio" name="emailProvider" value="system" checked={emailProvider === 'system'} onChange={() => setEmailProvider('system')} className="mt-0.5 accent-emerald-600" />
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-800 dark:text-white">System Default</p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">Uses the platform's built-in email. No setup needed.</p>
                                                    </div>
                                                </label>

                                                <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${emailProvider === 'smtp' ? 'border-emerald-400 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
                                                    <input type="radio" name="emailProvider" value="smtp" checked={emailProvider === 'smtp'} onChange={() => setEmailProvider('smtp')} className="mt-0.5 accent-emerald-600" />
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-800 dark:text-white">Custom SMTP</p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">Use your own SMTP server (e.g., Zoho, Outlook, SendGrid).</p>
                                                    </div>
                                                </label>

                                                <label className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${emailProvider === 'gmail' ? 'border-emerald-400 dark:border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'}`}>
                                                    <input type="radio" name="emailProvider" value="gmail" checked={emailProvider === 'gmail'} onChange={() => setEmailProvider('gmail')} className="mt-0.5 accent-emerald-600" />
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-800 dark:text-white">Gmail (OAuth)</p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">Connect your Gmail account. Emails sent from your address.</p>
                                                    </div>
                                                </label>
                                            </div>
                                        </div>

                                        {/* SMTP Config */}
                                        {emailProvider === 'smtp' && (
                                            <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4 bg-gray-50/40 dark:bg-gray-800/30">
                                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">SMTP Configuration</h4>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">SMTP Host</label>
                                                        <input type="text" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} placeholder="smtp.zoho.com" className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Port</label>
                                                        <input type="number" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} placeholder="587" className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email Address</label>
                                                        <input type="email" value={smtpEmail} onChange={e => setSmtpEmail(e.target.value)} placeholder="clinic@example.com" className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Password / App Password</label>
                                                        <div className="relative">
                                                            <input type={showSmtpPassword ? 'text' : 'password'} value={smtpPassword} onChange={e => setSmtpPassword(e.target.value)} placeholder="••••••••" className="w-full px-3 py-2 pr-10 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent" />
                                                            <button type="button" onClick={() => setShowSmtpPassword(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                                                {showSmtpPassword ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                                                            </button>
                                                        </div>
                                                        <p className="text-xs text-gray-400 mt-1">Leave blank to keep existing password.</p>
                                                    </div>
                                                </div>
                                                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                                                    <input type="checkbox" checked={smtpSecure} onChange={e => setSmtpSecure(e.target.checked)} className="accent-emerald-600" />
                                                    Use SSL/TLS (port 465)
                                                </label>
                                            </div>
                                        )}

                                        {/* Gmail Config */}
                                        {emailProvider === 'gmail' && (
                                            <div className="border-2 border-red-200 dark:border-red-700 rounded-xl p-5 space-y-4 bg-red-50/40 dark:bg-red-900/10">
                                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Gmail Connection</h4>
                                                {gmailConnected ? (
                                                    <div className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-green-200 dark:border-green-700">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-8 h-8 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center">
                                                                <svg className="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-medium text-gray-800 dark:text-white">Connected</p>
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">{gmailEmail || 'Gmail account connected'}</p>
                                                            </div>
                                                        </div>
                                                        <button type="button" onClick={handleDisconnectGmail} disabled={gmailDisconnecting} className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 border border-red-300 dark:border-red-700 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50">
                                                            {gmailDisconnecting ? 'Disconnecting…' : 'Disconnect'}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button type="button" onClick={handleConnectGmail} disabled={gmailConnecting} className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50">
                                                        <svg className="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                                                        {gmailConnecting ? 'Connecting…' : 'Connect Gmail Account'}
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {/* Save & Test buttons */}
                                        <div className="flex flex-wrap gap-3 justify-end">
                                            {emailProvider !== 'gmail' && (
                                                <button type="button" onClick={handleSaveEmailSettings} disabled={emailSaving} className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold rounded-lg disabled:opacity-50 transition-all shadow-lg hover:shadow-xl">
                                                    {emailSaving ? 'Saving…' : 'Save Email Settings'}
                                                </button>
                                            )}
                                            <button type="button" onClick={handleTestEmail} disabled={emailTesting} className="px-5 py-2.5 border-2 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 font-medium rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-900/30 disabled:opacity-50 transition-colors">
                                                {emailTesting ? 'Sending Test…' : 'Send Test Email'}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {/* ── Email Logs Sub-tab ── */}
                                {integrationsSubTab === 'logs' && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Email Logs</h4>
                                            <button type="button" onClick={() => fetchEmailLogs(emailLogsPage)} className="text-xs text-violet-600 dark:text-violet-400 hover:underline">Refresh</button>
                                        </div>

                                        {emailLogsLoading ? (
                                            <div className="text-center py-8 text-gray-400 text-sm">Loading…</div>
                                        ) : emailLogs.length === 0 ? (
                                            <div className="text-center py-8 text-gray-400 text-sm">No emails sent yet.</div>
                                        ) : (
                                            <>
                                                <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                                                    <table className="w-full text-sm">
                                                        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs uppercase">
                                                            <tr>
                                                                <th className="px-4 py-2 text-left">Date</th>
                                                                <th className="px-4 py-2 text-left">To</th>
                                                                <th className="px-4 py-2 text-left">Subject</th>
                                                                <th className="px-4 py-2 text-left">Provider</th>
                                                                <th className="px-4 py-2 text-left">Status</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                            {emailLogs.map((log: any) => (
                                                                <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                                                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{new Date(log.sentAt).toLocaleString()}</td>
                                                                    <td className="px-4 py-2 text-gray-800 dark:text-gray-200 max-w-[200px] truncate">{log.recipient}</td>
                                                                    <td className="px-4 py-2 text-gray-800 dark:text-gray-200 max-w-[250px] truncate">{log.subject}</td>
                                                                    <td className="px-4 py-2">
                                                                        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${log.provider === 'gmail' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' : log.provider === 'smtp' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                                                                            {log.provider}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-4 py-2">
                                                                        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${log.status === 'sent' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
                                                                            {log.status}
                                                                        </span>
                                                                        {log.error && <p className="text-xs text-red-500 mt-0.5 truncate max-w-[200px]" title={log.error}>{log.error}</p>}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                {/* Pagination */}
                                                {emailLogsTotal > 20 && (
                                                    <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                                                        <span>Showing {((emailLogsPage - 1) * 20) + 1}–{Math.min(emailLogsPage * 20, emailLogsTotal)} of {emailLogsTotal}</span>
                                                        <div className="flex gap-2">
                                                            <button type="button" disabled={emailLogsPage <= 1} onClick={() => fetchEmailLogs(emailLogsPage - 1)} className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800">Prev</button>
                                                            <button type="button" disabled={emailLogsPage * 20 >= emailLogsTotal} onClick={() => fetchEmailLogs(emailLogsPage + 1)} className="px-3 py-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800">Next</button>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* ── OCR & Geo Sub-tab ── */}
                                {integrationsSubTab === 'ocr' && (
                                    <div className="space-y-8">
                                        {/* OCR Section */}
                                        <div className="border-2 border-violet-200 dark:border-violet-700 rounded-xl p-5 space-y-4 bg-violet-50/40 dark:bg-violet-900/10">
                                            <div className="flex items-center gap-2">
                                                <svg className="w-5 h-5 text-violet-600 dark:text-violet-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">OCR Provider</h4>
                                                <span className="text-xs text-gray-400">for Aadhaar scanning &amp; document reading</span>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors border-violet-300 dark:border-violet-600 bg-white dark:bg-gray-800">
                                                    <input type="radio" name="ocrProvider" value="tesseract" checked={ocrProvider === 'tesseract'} onChange={() => setOcrProvider('tesseract')} className="mt-0.5 accent-violet-600" />
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-800 dark:text-white">Tesseract (Built-in)</p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">Free, runs locally in the browser. No credits used.</p>
                                                    </div>
                                                </label>

                                                <label className={`flex items-start gap-3 p-3 rounded-lg border-2 transition-colors ${isPro ? 'cursor-pointer border-violet-300 dark:border-violet-600 bg-white dark:bg-gray-800' : 'cursor-not-allowed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60'}`}>
                                                    <input type="radio" name="ocrProvider" value="google_vision" checked={ocrProvider === 'google_vision'} onChange={() => isPro && setOcrProvider('google_vision')} disabled={!isPro} className="mt-0.5 accent-violet-600" />
                                                    <div className="flex-1">
                                                        <p className="text-sm font-medium text-gray-800 dark:text-white flex items-center gap-2">
                                                            Google Vision API
                                                            {!isPro && <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">Pro Only</span>}
                                                        </p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">Higher accuracy, cloud-based. Credentials configured via server environment.</p>
                                                    </div>
                                                </label>
                                            </div>

                                            {isPro && visionUsage && (
                                                <div className="space-y-1.5 p-3 rounded-lg bg-white dark:bg-gray-800 border border-violet-200 dark:border-violet-700">
                                                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                                                        <span className="font-medium text-gray-700 dark:text-gray-300">Monthly Vision OCR Usage</span>
                                                        <span className={`font-bold ${visionUsage.used >= visionUsage.safeLimit ? 'text-red-600 dark:text-red-400' : visionUsage.used >= visionUsage.limit * 0.7 ? 'text-amber-600 dark:text-amber-400' : 'text-violet-600 dark:text-violet-400'}`}>
                                                            {visionUsage.used} / {visionUsage.limit}
                                                        </span>
                                                    </div>
                                                    <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all duration-500 ${visionUsage.used >= visionUsage.safeLimit ? 'bg-red-500' : visionUsage.used >= visionUsage.limit * 0.7 ? 'bg-amber-500' : 'bg-violet-500'}`}
                                                            style={{ width: `${Math.min(100, (visionUsage.used / visionUsage.limit) * 100)}%` }}
                                                        />
                                                    </div>
                                                    <p className="text-xs text-gray-400">
                                                        {visionUsage.used >= visionUsage.safeLimit
                                                            ? 'Limit reached — Vision OCR paused until the 1st of next month.'
                                                            : `${visionUsage.limit - visionUsage.used} requests remaining this month. Resets on the 1st.`}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Geolocation Section */}
                                        <div className="border-2 border-cyan-200 dark:border-cyan-700 rounded-xl p-5 space-y-4 bg-cyan-50/40 dark:bg-cyan-900/10">
                                            <div className="flex items-center gap-2">
                                                <svg className="w-5 h-5 text-cyan-600 dark:text-cyan-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Geolocation Provider</h4>
                                                <span className="text-xs text-gray-400">for clinic location check-ins &amp; address search</span>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors border-cyan-300 dark:border-cyan-600 bg-white dark:bg-gray-800">
                                                    <input type="radio" name="geolocationProvider" value="browser" checked={geolocationProvider === 'browser'} onChange={() => setGeolocationProvider('browser')} className="mt-0.5 accent-cyan-600" />
                                                    <div>
                                                        <p className="text-sm font-medium text-gray-800 dark:text-white">Browser Geolocation (Default)</p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">Uses the browser's built-in GPS. Free, no API key needed.</p>
                                                    </div>
                                                </label>

                                                <label className={`flex items-start gap-3 p-3 rounded-lg border-2 transition-colors ${isPro ? 'cursor-pointer border-cyan-300 dark:border-cyan-600 bg-white dark:bg-gray-800' : 'cursor-not-allowed border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 opacity-60'}`}>
                                                    <input type="radio" name="geolocationProvider" value="google_maps" checked={geolocationProvider === 'google_maps'} onChange={() => isPro && setGeolocationProvider('google_maps')} disabled={!isPro} className="mt-0.5 accent-cyan-600" />
                                                    <div className="flex-1">
                                                        <p className="text-sm font-medium text-gray-800 dark:text-white flex items-center gap-2">
                                                            Google Maps API
                                                            {!isPro && <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">Pro Only</span>}
                                                        </p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">More accurate reverse geocoding and address search. Requires your own Google Maps API key.</p>
                                                    </div>
                                                </label>
                                            </div>

                                            {geolocationProvider === 'google_maps' && isPro && (
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Google Maps API Key</label>
                                                    <div className="flex gap-2">
                                                        <input type={showMapsKey ? 'text' : 'password'} value={apiGoogleMapsKey} onChange={e => setApiGoogleMapsKey(e.target.value)} placeholder={clinic?.hasGoogleMapsKey ? '••••••••••••• (key saved)' : 'Enter API key…'} className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-cyan-500 focus:border-transparent" />
                                                        <button type="button" onClick={() => setShowMapsKey(v => !v)} className="px-3 py-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800">
                                                            {showMapsKey ? <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
                                                        </button>
                                                    </div>
                                                    <p className="text-xs text-gray-400 mt-1">Leave blank to keep the existing key unchanged.</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Save Button */}
                                        <div className="flex justify-end">
                                            <button type="button" onClick={handleSaveIntegrations} disabled={integrationsSaving} className="px-6 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl">
                                                {integrationsSaving ? 'Saving…' : 'Save Integration Settings'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'management' && (
                            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-4 sm:p-6 md:p-8 border border-gray-200 dark:border-gray-700">
                                <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Clinic Management</h2>
                                
                                <div className="space-y-3 sm:space-y-4 max-w-2xl">
                                    <div className="p-4 sm:p-6 bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border-2 border-yellow-300 dark:border-yellow-700 rounded-xl shadow-md hover:shadow-lg transition-all">
                                        <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-0">
                                            <div className="flex-1">
                                                <h3 className="font-bold text-yellow-900 dark:text-yellow-100 mb-2 flex items-center gap-2 text-base sm:text-lg">
                                                    <span className="text-xl">🚪</span> Logout
                                                </h3>
                                                <p className="text-xs sm:text-sm text-yellow-700 dark:text-yellow-300">Sign out from your account (clinic session remains active)</p>
                                            </div>
                                            <button
                                                onClick={handleLogout}
                                                className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-xl hover:from-yellow-600 hover:to-orange-600 transition-all shadow-md hover:shadow-lg font-medium transform hover:scale-105 text-sm sm:text-base"
                                            >
                                                Logout
                                            </button>
                                        </div>
                                    </div>

                                    <div className="p-4 sm:p-6 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-900/20 dark:to-red-900/20 border-2 border-orange-300 dark:border-orange-700 rounded-xl shadow-md hover:shadow-lg transition-all">
                                        <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-0">
                                            <div className="flex-1">
                                                <h3 className="font-bold text-orange-900 dark:text-orange-100 mb-2 flex items-center gap-2 text-base sm:text-lg">
                                                    <span className="text-xl">🏥</span> Logout from Clinic
                                                </h3>
                                                <p className="text-xs sm:text-sm text-orange-700 dark:text-orange-300">Sign out from both your account and clinic session</p>
                                            </div>
                                            <button
                                                onClick={handleClinicLogout}
                                                className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl hover:from-orange-600 hover:to-red-600 transition-all shadow-md hover:shadow-lg font-medium transform hover:scale-105 text-sm sm:text-base"
                                            >
                                                Logout from Clinic
                                            </button>
                                        </div>
                                    </div>

                                    <div className="p-4 sm:p-6 bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 border-2 border-red-300 dark:border-red-700 rounded-xl shadow-md hover:shadow-lg transition-all">
                                        <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-0">
                                            <div className="flex-1">
                                                <h3 className="font-bold text-red-900 dark:text-red-100 mb-2 flex items-center gap-2 text-base sm:text-lg">
                                                    <span className="text-xl">⚠️</span> Delete Clinic
                                                </h3>
                                                <p className="text-xs sm:text-sm text-red-700 dark:text-red-300">Permanently delete this clinic and all associated data. This action cannot be undone.</p>
                                            </div>
                                            <button
                                                onClick={() => { setShowDeleteDialog(true); document.body.style.overflow = 'hidden' }}
                                                className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-xl hover:from-red-600 hover:to-red-700 transition-all shadow-md hover:shadow-lg font-medium transform hover:scale-105 text-sm sm:text-base"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Subscription / Upgrade Tab */}
                        {activeTab === 'subscription' && (
                            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-4 sm:p-6 md:p-8 border border-gray-200 dark:border-gray-700">
                                {isPro ? (
                                    <>
                                        <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">Manage Subscription</h2>

                                        {/* Active Plan Card */}
                                        <div className="p-5 sm:p-6 bg-gradient-to-br from-purple-50 via-pink-50 to-amber-50 dark:from-purple-900/20 dark:via-pink-900/20 dark:to-amber-900/10 rounded-xl border border-purple-200/40 dark:border-purple-700/40 mb-6">
                                            <div className="flex items-center gap-3 mb-4">
                                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
                                                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">{currentPlanName} Plan</h3>
                                                        <span className="px-2 py-0.5 text-[10px] font-black tracking-wider rounded-full shadow-sm border border-amber-300 dark:border-amber-500" style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706, #B45309)', color: '#FFF' }}>ACTIVE</span>
                                                    </div>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400">Premium features unlocked</p>
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                                <div className="bg-white/60 dark:bg-gray-800/40 rounded-lg p-3">
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Billing Cycle</div>
                                                    <div className="text-sm font-semibold text-gray-900 dark:text-white capitalize">{clinic.subscriptionCycle || 'monthly'}</div>
                                                </div>
                                                <div className="bg-white/60 dark:bg-gray-800/40 rounded-lg p-3">
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Status</div>
                                                    <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                                                        clinic.subscriptionStatus === 'active' ? 'text-green-600 dark:text-green-400' :
                                                        clinic.subscriptionStatus === 'expired' ? 'text-red-600 dark:text-red-400' :
                                                        'text-gray-600 dark:text-gray-400'
                                                    }`}>
                                                        <span className={`w-2 h-2 rounded-full ring-2 ring-offset-1 ring-offset-white dark:ring-offset-gray-800 ${
                                                            clinic.subscriptionStatus === 'active' ? 'bg-green-500 ring-green-300 animate-pulse' :
                                                            clinic.subscriptionStatus === 'expired' ? 'bg-red-500 ring-red-300' : 'bg-gray-400 ring-gray-300'
                                                        }`}></span>
                                                        {(clinic.subscriptionStatus || 'active').charAt(0).toUpperCase() + (clinic.subscriptionStatus || 'active').slice(1)}
                                                    </span>
                                                </div>
                                                <div className="bg-white/60 dark:bg-gray-800/40 rounded-lg p-3">
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Expires</div>
                                                    <div className="text-sm font-semibold text-gray-900 dark:text-white">
                                                        {clinic.subscriptionCycle === 'lifetime' || clinic.subscriptionCycle === 'fiveYear'
                                                            ? (clinic.subscriptionEnd ? new Date(clinic.subscriptionEnd).toLocaleDateString() : 'Never')
                                                            : clinic.subscriptionEnd
                                                            ? new Date(clinic.subscriptionEnd).toLocaleDateString()
                                                            : '\u2014'}
                                                    </div>
                                                </div>
                                                <div className="bg-white/60 dark:bg-gray-800/40 rounded-lg p-3">
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Plan</div>
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                                                        {currentPlanName}
                                                    </span>
                                                </div>
                                            </div>
                                            {typeof clinic.trialDaysLeft === 'number' && (
                                                <p className="mt-3 text-xs text-cyan-700 dark:text-cyan-300">Trial days left: {clinic.trialDaysLeft}</p>
                                            )}
                                        </div>

                                        {/* Pro Features */}
                                        <div className="mb-6">
                                            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 uppercase tracking-wider">Your Pro Features</h3>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {[
                                                    { icon: '\uD83D\uDC65', text: 'Up to 15 Users' },
                                                    { icon: '\uD83E\uDD16', text: 'AI-Powered Insights' },
                                                    { icon: '\uD83C\uDFA8', text: 'Custom Branding & Themes' },
                                                    { icon: '\uD83D\uDCF2', text: 'WhatsApp / SMS Automation' },
                                                    { icon: '\uD83C\uDFE2', text: 'Multi-Branch Management' },
                                                    { icon: '\uD83E\uDDFE', text: 'Custom Invoice Templates' },
                                                    { icon: '\uD83E\uDDEC', text: 'Enhanced AI Model Access' },
                                                    { icon: '\u26A1', text: 'Priority Processing' },
                                                    { icon: '\uD83D\uDCAC', text: 'Dedicated Priority Support' },
                                                ].map((feature, i) => (
                                                    <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50/50 dark:bg-purple-900/10 border border-purple-100/50 dark:border-purple-800/30">
                                                        <span className="text-base">{feature.icon}</span>
                                                        <span className="text-sm text-gray-700 dark:text-gray-300">{feature.text}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Theme Management */}
                                        <div className="p-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl border border-purple-200/30 dark:border-purple-700/30">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                                                    </svg>
                                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Clinic Theme</h4>
                                                </div>
                                                {themeSaving && <span className="text-xs text-purple-500 animate-pulse">Saving...</span>}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                {GRADIENT_PRESETS.map(preset => (
                                                    <button
                                                        key={preset.key}
                                                        onClick={() => handleThemeChange(preset.key)}
                                                        disabled={themeSaving}
                                                        className={`w-9 h-9 rounded-full transition-all duration-200 hover:scale-110 border-2 ${
                                                            (clinic.themeGradient || 'blue') === preset.key
                                                                ? 'border-gray-900 dark:border-white scale-110 shadow-lg'
                                                                : 'border-transparent hover:border-gray-300 dark:hover:border-gray-500'
                                                        }`}
                                                        style={{ background: `linear-gradient(135deg, ${preset.from}, ${preset.to})` }}
                                                        title={preset.label}
                                                    />
                                                ))}
                                            </div>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Choose a theme gradient for your clinic&apos;s interface.</p>
                                        </div>

                                        <div className="mt-6 p-4 sm:p-5 rounded-xl border-2 border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/10">
                                            <h3 className="text-sm font-bold text-red-800 dark:text-red-300 mb-1">Cancel Subscription</h3>
                                            <p className="text-xs text-red-700 dark:text-red-400 mb-3">
                                                Cancelling will immediately disable clinic access. If payment is not restored, all accounts and clinic data are deleted after 30 days.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={handleCancelSubscription}
                                                disabled={cancellingSubscription}
                                                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                                            >
                                                {cancellingSubscription ? 'Cancelling...' : 'Cancel Subscription'}
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <h2 className="text-xl sm:text-2xl font-bold mb-2 bg-gradient-to-r from-amber-500 to-orange-500 bg-clip-text text-transparent">Upgrade to Pro</h2>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Unlock advanced features and take your clinic to the next level.</p>

                                        {/* Current Plan */}
                                        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 mb-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                                                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                                </div>
                                                <div>
                                                    <div className="text-sm font-semibold text-gray-900 dark:text-white">Current Plan: {currentPlanName}</div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400">Limited features</div>
                                                    {typeof clinic?.trialDaysLeft === 'number' && (
                                                        <div className="text-xs text-cyan-700 dark:text-cyan-300 mt-1">Trial days left: {clinic.trialDaysLeft}</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Pro Benefits Preview */}
                                        <div className="p-5 bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 dark:from-amber-900/15 dark:via-orange-900/15 dark:to-yellow-900/10 rounded-xl border border-amber-200/40 dark:border-amber-700/30 mb-6">
                                            <div className="flex items-center gap-2 mb-4">
                                                <span className="px-2 py-0.5 text-[10px] font-black tracking-wider rounded-full shadow-sm border border-amber-300 dark:border-amber-500" style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706, #B45309)', color: '#FFF' }}>PRO</span>
                                                <h3 className="text-base font-bold text-gray-900 dark:text-white">What you&apos;ll get</h3>
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {[
                                                    { icon: '\uD83D\uDC65', text: 'Up to 15 Users' },
                                                    { icon: '\uD83E\uDD16', text: 'AI-Powered Insights & Smart Suggestions' },
                                                    { icon: '\uD83C\uDFA8', text: 'Custom Branding & AI Custom Themes' },
                                                    { icon: '\uD83D\uDCF2', text: 'WhatsApp / SMS Appointment Automation' },
                                                    { icon: '\uD83C\uDFE2', text: 'Multi-Branch Management' },
                                                    { icon: '\uD83E\uDDFE', text: 'Custom Invoice Templates' },
                                                    { icon: '\uD83E\uDDEC', text: 'Enhanced AI Model Access' },
                                                    { icon: '\u26A1', text: 'Priority AI Processing' },
                                                    { icon: '\uD83D\uDCAC', text: 'Dedicated Priority Support' },
                                                ].map((feature, i) => (
                                                    <div key={i} className="flex items-center gap-2 py-1.5">
                                                        <span className="text-base">{feature.icon}</span>
                                                        <span className="text-sm text-gray-700 dark:text-gray-300">{feature.text}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Upgrade Button */}
                                        <button
                                            onClick={() => router.push('/upgrade')}
                                            className="w-full sm:w-auto px-8 py-3 rounded-xl font-bold text-white shadow-lg hover:shadow-xl transition-all transform hover:scale-105 text-sm sm:text-base"
                                            style={{ background: 'linear-gradient(135deg, #F59E0B, #D97706, #B45309)' }}
                                        >
                                            <span className="flex items-center justify-center gap-2">
                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                                                Upgrade to Pro
                                            </span>
                                        </button>

                                        <div className="mt-6 p-4 sm:p-5 rounded-xl border-2 border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/10">
                                            <h3 className="text-sm font-bold text-red-800 dark:text-red-300 mb-1">Cancel Subscription</h3>
                                            <p className="text-xs text-red-700 dark:text-red-400 mb-3">
                                                Cancelling will immediately disable clinic access. If payment is not restored, all accounts and clinic data are deleted after 30 days.
                                            </p>
                                            <button
                                                type="button"
                                                onClick={handleCancelSubscription}
                                                disabled={cancellingSubscription}
                                                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                                            >
                                                {cancellingSubscription ? 'Cancelling...' : 'Cancel Subscription'}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Delete Clinic Confirmation Dialog */}
            {showDeleteDialog && (
                <div 
                    className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 ${
                        isClosingDialog ? 'dialog-overlay-exit' : 'dialog-overlay-enter'
                    }`}
                    style={{ zIndex: 9999 }}
                    onClick={closeDeleteDialog}
                >
                    <div 
                        className={`relative overflow-hidden rounded-2xl border border-red-200/30 dark:border-red-700/30 bg-gradient-to-br from-white via-red-50/30 to-orange-50/20 dark:from-gray-900 dark:via-red-950/20 dark:to-gray-900 shadow-lg shadow-red-500/20 backdrop-blur-sm max-w-md w-full mx-4 p-6 sm:p-8 ${
                            isClosingDialog ? 'dialog-content-exit' : 'dialog-content-enter'
                        }`}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-red-400/5 via-transparent to-orange-500/5 pointer-events-none"></div>
                        <div className="relative flex items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
                            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-br from-red-100 to-red-200 dark:from-red-900/30 dark:to-red-800/30 flex items-center justify-center border-2 border-red-300 dark:border-red-700 flex-shrink-0">
                                <svg className="w-6 h-6 sm:w-7 sm:h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div>
                                <h3 className="text-lg sm:text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600 dark:from-red-400 dark:to-orange-400">Delete Clinic</h3>
                                <p className="text-xs sm:text-sm text-red-600 dark:text-red-400 font-medium">This action cannot be undone</p>
                            </div>
                        </div>

                        <div className="relative mb-4 sm:mb-6">
                            <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 mb-3 sm:mb-4 bg-gray-50 dark:bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                                Are you sure you want to delete this clinic? This will permanently remove all clinic data, users, patients, and records. This action cannot be reversed.
                            </p>
                            <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 mb-2 sm:mb-3 font-semibold">
                                Type <span className="px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded font-mono">DELETE</span> to confirm:
                            </p>
                            <input
                                type="text"
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                className="w-full p-2.5 sm:p-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white dark:bg-gray-800 transition-all text-sm sm:text-base"
                                placeholder="Type DELETE"
                                autoFocus
                            />
                        </div>

                        <div className="relative flex flex-col sm:flex-row gap-2 sm:gap-3">
                            <button
                                onClick={handleDeleteClinic}
                                disabled={deleting || deleteConfirmText !== 'DELETE'}
                                className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-xl hover:from-red-700 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg font-semibold transform hover:scale-105 disabled:transform-none text-sm sm:text-base"
                            >
                                {deleting ? 'Deleting...' : 'Delete Clinic'}
                            </button>
                            <button
                                onClick={closeDeleteDialog}
                                disabled={deleting}
                                className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50 transition-all shadow-md hover:shadow-lg font-semibold text-sm sm:text-base"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
