import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../hooks/useToast'
import ToastNotification from '../components/ToastNotification'

type TabType = 'overview' | 'edit' | 'security' | 'account'

export default function SuperAdminProfilePage() {
    const router = useRouter()
    const { user: authUser, loading: authLoading } = useAuth()
    const { toasts, removeToast, showSuccess, showError, showWarning } = useToast()

    const [user, setUser] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<TabType>('overview')

    // Edit
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [saving, setSaving] = useState(false)

    // Password
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showCurrentPassword, setShowCurrentPassword] = useState(false)
    const [showNewPassword, setShowNewPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)

    // Photo
    const [profileImage, setProfileImage] = useState<string | null>(null)
    const [uploading, setUploading] = useState(false)
    const [loggingOut, setLoggingOut] = useState(false)

    useEffect(() => {
        fetchUser()
        const { tab } = router.query
        if (tab && ['overview', 'edit', 'security', 'account'].includes(tab as string)) {
            setActiveTab(tab as TabType)
        }
    }, [router.query])

    const fetchUser = async () => {
        try {
            // Use AuthContext user if available
            if (authUser) {
                if (authUser.role !== 'super_admin') {
                    router.push('/super-admin-login')
                    return
                }
                setUser(authUser)
                setName(authUser.name || '')
                setEmail(authUser.email || '')
                setProfileImage(authUser.profileImage || null)
                setLoading(false)
                return
            }

            // Fallback to API only if authUser is not available
            const res = await fetch('/api/auth/me')
            const data = await res.json()
            if (data.user) {
                if (data.user.role !== 'super_admin') {
                    router.push('/super-admin-login')
                    return
                }
                setUser(data.user)
                setName(data.user.name || '')
                setEmail(data.user.email || '')
                setProfileImage(data.user.profileImage || null)
            } else {
                router.push('/super-admin-login')
            }
        } catch {
            router.push('/super-admin-login')
        } finally {
            setLoading(false)
        }
    }

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) { showWarning('Name is required'); return }
        setSaving(true)
        try {
            const res = await fetch('/api/auth/update-profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name.trim(), email })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed to update')
            setUser((prev: any) => ({ ...prev, name: name.trim() }))
            showSuccess('Profile updated successfully')
        } catch (e: any) {
            showError(e.message || 'Failed to update profile')
        } finally {
            setSaving(false)
        }
    }

    const handleProfileImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        if (!file.type.startsWith('image/')) { showError('Please upload an image file'); return }
        if (file.size > 5 * 1024 * 1024) { showError('Image size should be less than 5MB'); return }
        setUploading(true)
        try {
            const formData = new FormData()
            formData.append('image', file)
            const res = await fetch('/api/auth/upload-profile-image', { method: 'POST', body: formData })
            const data = await res.json()
            if (res.ok) {
                setProfileImage(data.imageUrl)
                setUser((prev: any) => ({ ...prev, profileImage: data.imageUrl }))
                showSuccess('Profile picture updated')
            } else {
                showError(data.error || 'Failed to upload image')
            }
        } catch {
            showError('An error occurred while uploading image')
        } finally {
            setUploading(false)
        }
    }

    const handleRemoveProfileImage = async () => {
        setSaving(true)
        try {
            const res = await fetch('/api/auth/remove-profile-image', { method: 'DELETE' })
            const data = await res.json()
            if (res.ok) {
                setProfileImage(null)
                setUser((prev: any) => ({ ...prev, profileImage: null }))
                showSuccess('Profile picture removed')
            } else {
                showError(data.error || 'Failed to remove image')
            }
        } catch {
            showError('An error occurred while removing image')
        } finally {
            setSaving(false)
        }
    }

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!currentPassword) { showWarning('Current password is required'); return }
        if (!newPassword || newPassword.length < 6) { showWarning('New password must be at least 6 characters'); return }
        if (newPassword !== confirmPassword) { showWarning('Passwords do not match'); return }
        setSaving(true)
        try {
            const res = await fetch('/api/auth/change-password', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ currentPassword, newPassword })
            })
            const data = await res.json()
            if (res.ok) {
                setCurrentPassword('')
                setNewPassword('')
                setConfirmPassword('')
                showSuccess('Password changed successfully')
            } else {
                showError(data.error || 'Failed to change password')
            }
        } catch {
            showError('An error occurred while changing password')
        } finally {
            setSaving(false)
        }
    }

    const handleLogout = async () => {
        setLoggingOut(true)
        try { await fetch('/api/auth/logout', { method: 'POST' }) } catch {}
        sessionStorage.removeItem('currentUser')
        window.location.href = '/super-admin-login'
    }

    const sidebarItems = [
        {
            id: 'overview' as TabType, label: 'Overview',
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
        },
        {
            id: 'edit' as TabType, label: 'Edit Profile',
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
        },
        {
            id: 'security' as TabType, label: 'Security',
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
        },
        {
            id: 'account' as TabType, label: 'Account',
            icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
        }
    ]

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            </div>
        )
    }

    return (
        <>
            <ToastNotification toasts={toasts} removeToast={removeToast} />
            <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
                {/* Top bar */}
                <div className="bg-gradient-to-r from-purple-600 to-blue-600 shadow-lg shadow-purple-500/20">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-4">
                        <button
                            onClick={() => router.push('/super-admin')}
                            className="flex items-center gap-2 text-white/80 hover:text-white transition-colors group"
                        >
                            <svg className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                            <span className="text-sm font-medium">Back to Dashboard</span>
                        </button>
                        <div className="flex-1" />
                        <div className="flex items-center gap-3">
                            {profileImage ? (
                                <img src={profileImage} alt="avatar" className="w-9 h-9 rounded-xl object-cover border-2 border-white/30" />
                            ) : (
                                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-base font-bold text-white">
                                    {(user?.name || 'S').charAt(0).toUpperCase()}
                                </div>
                            )}
                            <div>
                                <p className="text-sm font-semibold text-white leading-tight">{user?.name || 'Super Admin'}</p>
                                <p className="text-xs text-purple-200 leading-tight">{user?.email}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
                    <h1 className="text-2xl sm:text-3xl font-bold mb-6 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                        Profile Settings
                    </h1>

                    {/* Mobile tabs */}
                    <div className="md:hidden mb-4">
                        <div className="bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-200 dark:border-gray-700 overflow-x-auto">
                            <div className="flex gap-1 p-2 min-w-max">
                                {sidebarItems.map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => setActiveTab(item.id)}
                                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all whitespace-nowrap text-sm ${
                                            activeTab === item.id
                                                ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-md'
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
                        {/* Desktop sidebar */}
                        <div className="hidden md:block w-64 flex-shrink-0">
                            <div className="rounded-xl border border-purple-200/30 dark:border-purple-700/30 bg-gradient-to-br from-white via-purple-50/20 to-blue-50/10 dark:from-gray-900 dark:via-purple-950/20 dark:to-gray-900 shadow-lg p-4 sticky top-6">
                                <nav className="space-y-1">
                                    {sidebarItems.map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => setActiveTab(item.id)}
                                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${
                                                activeTab === item.id
                                                    ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-lg shadow-purple-500/25 font-medium'
                                                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                            }`}
                                        >
                                            <span className={activeTab === item.id ? 'text-white' : 'text-gray-500 dark:text-gray-400'}>{item.icon}</span>
                                            <span>{item.label}</span>
                                        </button>
                                    ))}
                                </nav>
                            </div>
                        </div>

                        {/* Main content */}
                        <div className="flex-1 min-w-0">

                            {/* ── OVERVIEW ── */}
                            {activeTab === 'overview' && (
                                <div className="bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-6 sm:p-8">
                                    <h2 className="text-xl sm:text-2xl font-bold mb-6 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">Profile Overview</h2>

                                    <div className="flex flex-col sm:flex-row items-center gap-6 mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
                                        <div className="relative">
                                            {profileImage ? (
                                                <img src={profileImage} alt="Profile" className="w-32 h-32 rounded-2xl object-cover border-4 border-gray-200 dark:border-gray-700 shadow-xl" />
                                            ) : (
                                                <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center border-4 border-gray-200 dark:border-gray-700 shadow-xl">
                                                    <span className="text-5xl font-bold text-white">
                                                        {(user?.name || user?.email || 'S')[0].toUpperCase()}
                                                    </span>
                                                </div>
                                            )}
                                            <label
                                                htmlFor="profile-image-upload-overview"
                                                className="absolute bottom-0 right-0 w-10 h-10 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center cursor-pointer hover:from-purple-600 hover:to-blue-600 transition-all shadow-lg hover:shadow-xl transform hover:scale-110"
                                                title="Upload profile picture"
                                            >
                                                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                                </svg>
                                                <input
                                                    id="profile-image-upload-overview"
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleProfileImageUpload}
                                                    className="hidden"
                                                    disabled={uploading}
                                                />
                                            </label>
                                            {uploading && (
                                                <div className="absolute inset-0 bg-black/50 rounded-2xl flex items-center justify-center">
                                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white"></div>
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <h3 className="text-2xl font-bold mb-1">{user?.name || 'Super Admin'}</h3>
                                            <p className="text-gray-500 dark:text-gray-400 mb-3">{user?.email}</p>
                                            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium bg-gradient-to-r from-purple-100 to-blue-100 text-purple-800 dark:from-purple-900/40 dark:to-blue-900/40 dark:text-purple-200 border border-purple-300 dark:border-purple-700">
                                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                                Super Admin
                                            </span>
                                            {profileImage && (
                                                <div className="mt-3">
                                                    <button
                                                        onClick={handleRemoveProfileImage}
                                                        disabled={saving}
                                                        className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 hover:underline disabled:opacity-50"
                                                    >
                                                        Remove profile picture
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="p-5 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                                            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Full Name</h4>
                                            <p className="text-lg font-semibold">{user?.name || 'Not set'}</p>
                                        </div>
                                        <div className="p-5 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                                            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Email Address</h4>
                                            <p className="text-lg font-semibold break-all">{user?.email}</p>
                                        </div>
                                        <div className="p-5 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                                            <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Role</h4>
                                            <p className="text-lg font-semibold">Super Admin</p>
                                        </div>
                                        <div className="p-5 bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-xl border border-purple-200 dark:border-purple-700">
                                            <h4 className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-2">Account Status</h4>
                                            <p className="text-lg font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-2">
                                                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                                Active
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── EDIT PROFILE ── */}
                            {activeTab === 'edit' && (
                                <div className="relative rounded-xl border border-purple-200/30 dark:border-purple-700/30 bg-gradient-to-br from-white via-purple-50/20 dark:from-gray-900 dark:via-purple-950/20 dark:to-gray-900 shadow-lg p-6 sm:p-8 overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-br from-purple-400/5 via-transparent to-blue-500/5 pointer-events-none rounded-xl"></div>
                                    <div className="relative">
                                        <h2 className="text-xl sm:text-2xl font-bold mb-6 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">Edit Profile</h2>
                                        <form onSubmit={handleUpdateProfile} className="max-w-2xl space-y-5">
                                            <div>
                                                <label className="block text-sm font-semibold mb-2">Display Name <span className="text-red-500">*</span></label>
                                                <input
                                                    type="text"
                                                    value={name}
                                                    onChange={e => setName(e.target.value)}
                                                    className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-gray-800 transition-all"
                                                    placeholder="Enter your name"
                                                    required
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-semibold mb-2">Email Address</label>
                                                <input
                                                    type="email"
                                                    value={email}
                                                    disabled
                                                    className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 cursor-not-allowed"
                                                />
                                                <p className="text-xs text-gray-400 mt-1">Email address cannot be changed.</p>
                                            </div>

                                            {/* Profile photo section */}
                                            <div>
                                                <label className="block text-sm font-semibold mb-3">Profile Photo</label>
                                                <div className="flex items-center gap-4">
                                                    {profileImage ? (
                                                        <img src={profileImage} alt="Profile" className="w-16 h-16 rounded-xl object-cover border-2 border-purple-200 dark:border-purple-700" />
                                                    ) : (
                                                        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-purple-400 to-blue-500 flex items-center justify-center">
                                                            <span className="text-xl font-bold text-white">{(user?.name || 'S')[0].toUpperCase()}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex flex-col gap-2">
                                                        <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-purple-300 dark:border-purple-600 text-sm font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors">
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                                            {uploading ? 'Uploading…' : 'Upload Photo'}
                                                            <input type="file" accept="image/*" onChange={handleProfileImageUpload} className="hidden" disabled={uploading} />
                                                        </label>
                                                        {profileImage && (
                                                            <button
                                                                type="button"
                                                                onClick={handleRemoveProfileImage}
                                                                disabled={saving || uploading}
                                                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-red-300 dark:border-red-700 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                                Remove
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex gap-3 pt-2">
                                                <button
                                                    type="submit"
                                                    disabled={saving}
                                                    className="px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-xl hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 transition-all shadow-md hover:shadow-lg font-medium"
                                                >
                                                    {saving ? 'Saving…' : 'Save Changes'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setName(user?.name || '')}
                                                    className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-all font-medium"
                                                >
                                                    Reset
                                                </button>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            )}

                            {/* ── SECURITY ── */}
                            {activeTab === 'security' && (
                                <div className="relative rounded-xl border border-purple-200/30 dark:border-purple-700/30 bg-gradient-to-br from-white via-purple-50/20 dark:from-gray-900 dark:via-purple-950/20 dark:to-gray-900 shadow-lg p-6 sm:p-8 overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-br from-purple-400/5 via-transparent to-blue-500/5 pointer-events-none rounded-xl"></div>
                                    <div className="relative">
                                        <h2 className="text-xl sm:text-2xl font-bold mb-6 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">Security Settings</h2>
                                        <div className="max-w-2xl">
                                            <div className="mb-6 p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl">
                                                <h3 className="text-lg font-semibold mb-1 text-purple-800 dark:text-purple-200">🔒 Change Password</h3>
                                                <p className="text-sm text-purple-700 dark:text-purple-300">Keep your account secure with a strong password</p>
                                            </div>
                                            <form onSubmit={handleChangePassword} className="space-y-5">
                                                {[
                                                    { label: 'Current Password', value: currentPassword, setter: setCurrentPassword, show: showCurrentPassword, toggle: () => setShowCurrentPassword(v => !v), placeholder: 'Enter current password' },
                                                    { label: 'New Password', value: newPassword, setter: setNewPassword, show: showNewPassword, toggle: () => setShowNewPassword(v => !v), placeholder: 'Minimum 6 characters' },
                                                    { label: 'Confirm New Password', value: confirmPassword, setter: setConfirmPassword, show: showConfirmPassword, toggle: () => setShowConfirmPassword(v => !v), placeholder: 'Re-enter new password' },
                                                ].map(({ label, value, setter, show, toggle, placeholder }) => (
                                                    <div key={label}>
                                                        <label className="block text-sm font-semibold mb-2">{label}</label>
                                                        <div className="relative">
                                                            <input
                                                                type={show ? 'text' : 'password'}
                                                                value={value}
                                                                onChange={e => setter(e.target.value)}
                                                                className="w-full p-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent bg-white dark:bg-gray-800 transition-all"
                                                                placeholder={placeholder}
                                                            />
                                                            <button type="button" tabIndex={-1} onClick={toggle} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                                                {show
                                                                    ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                                                    : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                                                                }
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                                <button
                                                    type="submit"
                                                    disabled={saving}
                                                    className="px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-xl hover:from-purple-600 hover:to-blue-600 disabled:opacity-50 transition-all shadow-md hover:shadow-lg font-medium"
                                                >
                                                    {saving ? 'Changing…' : 'Change Password'}
                                                </button>
                                            </form>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── ACCOUNT ── */}
                            {activeTab === 'account' && (
                                <div className="relative rounded-xl border border-purple-200/30 dark:border-purple-700/30 bg-gradient-to-br from-white via-purple-50/20 dark:from-gray-900 dark:via-purple-950/20 dark:to-gray-900 shadow-lg p-6 sm:p-8 overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-br from-purple-400/5 via-transparent to-blue-500/5 pointer-events-none rounded-xl"></div>
                                    <div className="relative">
                                        <h2 className="text-xl sm:text-2xl font-bold mb-6 bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">Account Settings</h2>
                                        <div className="max-w-2xl space-y-4">
                                            <div className="p-6 bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 border-2 border-yellow-300 dark:border-yellow-700 rounded-xl">
                                                <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
                                                    <div>
                                                        <h3 className="font-bold text-yellow-900 dark:text-yellow-100 mb-1 flex items-center gap-2 text-lg">
                                                            <span>🚪</span> Logout
                                                        </h3>
                                                        <p className="text-sm text-yellow-700 dark:text-yellow-300">Sign out from your super admin session</p>
                                                    </div>
                                                    <button
                                                        onClick={handleLogout}
                                                        disabled={loggingOut}
                                                        className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-xl hover:from-yellow-600 hover:to-orange-600 transition-all shadow font-medium disabled:opacity-60 flex items-center justify-center gap-2"
                                                    >
                                                        {loggingOut && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                                                        {loggingOut ? 'Logging out...' : 'Logout'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
