import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../hooks/useToast'
import { useDoctor } from '../contexts/DoctorContext'
import ToastNotification from '../components/ToastNotification'

type TabType = 'overview' | 'edit' | 'security' | 'account'

export default function ProfilePage() {
    const router = useRouter()
    const { user: authUser, loading: authLoading } = useAuth()
    const [user, setUser] = useState<any>(null)
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState<TabType>('overview')
    const [name, setName] = useState('')
    const [email, setEmail] = useState('')
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showCurrentPassword, setShowCurrentPassword] = useState(false)
    const [showNewPassword, setShowNewPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [saving, setSaving] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [isClosingDialog, setIsClosingDialog] = useState(false)
    const [deleteConfirmText, setDeleteConfirmText] = useState('')
    const [deleting, setDeleting] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [loggingOut, setLoggingOut] = useState(false)
    const [profileImage, setProfileImage] = useState<string | null>(null)
    const { toasts, removeToast, showSuccess, showError, showWarning } = useToast()
    const { selectedDoctorId, setSelectedDoctorId, doctors, loading: doctorsLoading } = useDoctor()
    
    // Additional patient fields for user role
    const [phone, setPhone] = useState('')
    const [dob, setDob] = useState('')
    const [age, setAge] = useState('')
    const [address, setAddress] = useState('')
    const [gender, setGender] = useState('')
    const [occupation, setOccupation] = useState('')
    const [height, setHeight] = useState('')
    const [weight, setWeight] = useState('')
    const [fatherHusbandGuardianName, setFatherHusbandGuardianName] = useState('')

    useEffect(() => {
        fetchUser()
        
        // Check for tab query parameter
        const { tab } = router.query
        if (tab && ['overview', 'edit', 'security', 'account'].includes(tab as string)) {
            setActiveTab(tab as TabType)
        }
    }, [router.query])

    // Trigger data refresh when doctor selection changes
    useEffect(() => {
        if (user?.role === 'admin' && selectedDoctorId) {
            // Dispatch event to notify other components to refresh their data
            window.dispatchEvent(new CustomEvent('doctor-changed', { 
                detail: { doctorId: selectedDoctorId } 
            }))
        }
    }, [selectedDoctorId, user?.role])

    const fetchUser = async () => {
        try {
            // Use AuthContext user if available, avoiding an extra API call
            if (authUser) {
                setUser(authUser)
                setName(authUser.name || '')
                setEmail(authUser.email || '')
                setPhone(authUser.phone || '')
                setProfileImage(authUser.profileImage || null)
                
                if (authUser.role?.toLowerCase() === 'user') {
                    fetchPatientData(authUser.email, authUser.phone)
                }
                setLoading(false)
                return
            }

            // Fallback to API only if authUser is not available
            const res = await fetch('/api/auth/me')
            const data = await res.json()

            if (data.user) {
                setUser(data.user)
                setName(data.user.name || '')
                setEmail(data.user.email || '')
                setPhone(data.user.phone || '')
                setProfileImage(data.user.profileImage || null)
                
                if (data.user.role?.toLowerCase() === 'user') {
                    fetchPatientData(data.user.email, data.user.phone)
                }
            } else {
                router.push('/login')
            }
        } catch (err) {
            showError('Failed to load profile')
            router.push('/login')
        } finally {
            setLoading(false)
        }
    }

    const fetchPatientData = async (userEmail: string, userPhone: string) => {
        try {
            const res = await fetch('/api/patients')
            const patients = await res.json()
            
            // Find patient record matching user's email or phone
            const patientRecord = patients.find((p: any) => 
                p.email === userEmail || p.phone === userPhone
            )
            
            if (patientRecord) {
                setDob(patientRecord.dob ? new Date(patientRecord.dob).toISOString().split('T')[0] : '')
                setAge(patientRecord.age?.toString() || '')
                setAddress(patientRecord.address || '')
                setGender(patientRecord.gender || '')
                setOccupation(patientRecord.occupation || '')
                setHeight(patientRecord.height?.toString() || '')
                setWeight(patientRecord.weight?.toString() || '')
                setFatherHusbandGuardianName(patientRecord.fatherHusbandGuardianName || '')
            }
        } catch (err) {
        }
    }

    const calculateAge = (dob: string) => {
        if (!dob) return ''
        const birthDate = new Date(dob)
        const today = new Date()
        let age = today.getFullYear() - birthDate.getFullYear()
        const monthDiff = today.getMonth() - birthDate.getMonth()
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--
        }
        return age.toString()
    }

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!name.trim()) {
            showWarning('Name is required')
            return
        }

        setSaving(true)
        try {
            const isUserRole = user?.role?.toLowerCase() === 'user'
            
            // Update user account
            const userRes = await fetch('/api/auth/update-profile', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, phone })
            })

            const userData = await userRes.json()

            if (!userRes.ok) {
                showError(userData.error || 'Failed to update profile')
                setSaving(false)
                return
            }

            // Update local user and form fields with returned (saved) values
            const updatedUser = userData.user
            setUser(updatedUser)
            setName(updatedUser.name || '')
            setEmail(updatedUser.email || '')
            setPhone(updatedUser.phone || '')

            // If user role, also update or create patient record
            if (isUserRole) {
                const patientsRes = await fetch('/api/patients')
                const patients = await patientsRes.json()
                
                // Find existing patient record using updated user identifiers
                const existingPatient = patients.find((p: any) => 
                    p.email === updatedUser.email || p.phone === updatedUser.phone
                )

                const nameParts = name.split(' ')
                const firstName = nameParts[0] || ''
                const lastName = nameParts.slice(1).join(' ') || ''

                const patientData = {
                    firstName,
                    lastName,
                    phone: updatedUser.phone || phone,
                    email: updatedUser.email || email,
                    dob: dob || null,
                    age: age ? parseInt(age) : null,
                    address: address || null,
                    gender: gender || null,
                    occupation: occupation || null,
                    height: height ? parseFloat(height) : null,
                    weight: weight ? parseFloat(weight) : null,
                    fatherHusbandGuardianName: fatherHusbandGuardianName || null
                }

                if (existingPatient) {
                    // Update existing patient
                    const updateRes = await fetch('/api/patients', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            id: existingPatient.id,
                            ...patientData
                        })
                    })

                    if (!updateRes.ok) {
                        const updateData = await updateRes.json()
                        showError(updateData.error || 'Failed to update patient information')
                        setSaving(false)
                        return
                    }
                } else {
                    // Create new patient record
                    const createRes = await fetch('/api/patients', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(patientData)
                    })

                    if (!createRes.ok) {
                        const createData = await createRes.json()
                        showError(createData.error || 'Failed to create patient information')
                        setSaving(false)
                        return
                    }
                }
            }

            showSuccess('Profile updated successfully')
            // Trigger header refresh
            window.dispatchEvent(new Event('user-login'))
        } catch (err) {
            showError('An error occurred while updating profile')
        } finally {
            setSaving(false)
        }
    }

    const handleProfileImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Validate file type
        if (!file.type.startsWith('image/')) {
            showError('Please upload an image file')
            return
        }

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
            showError('Image size should be less than 5MB')
            return
        }

        setUploading(true)
        try {
            const formData = new FormData()
            formData.append('image', file)

            const res = await fetch('/api/auth/upload-profile-image', {
                method: 'POST',
                body: formData
            })

            const data = await res.json()

            if (res.ok) {
                setProfileImage(data.imageUrl)
                setUser({ ...user, profileImage: data.imageUrl })
                showSuccess('Profile picture updated successfully')
                // Trigger header refresh
                window.dispatchEvent(new Event('user-login'))
            } else {
                const errorMsg = data.details ? `${data.error}: ${data.details}` : data.error
                showError(errorMsg || 'Failed to upload image')
            }
        } catch (err) {
            showError('An error occurred while uploading image')
        } finally {
            setUploading(false)
        }
    }

    const handleRemoveProfileImage = async () => {
        setSaving(true)
        try {
            const res = await fetch('/api/auth/remove-profile-image', {
                method: 'DELETE'
            })

            const data = await res.json()

            if (res.ok) {
                setProfileImage(null)
                setUser({ ...user, profileImage: null })
                showSuccess('Profile picture removed')
                // Trigger header refresh
                window.dispatchEvent(new Event('user-login'))
            } else {
                showError(data.error || 'Failed to remove image')
            }
        } catch (err) {
            showError('An error occurred while removing image')
        } finally {
            setSaving(false)
        }
    }

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault()

        if (!currentPassword) {
            showWarning('Current password is required')
            return
        }

        if (!newPassword || newPassword.length < 6) {
            showWarning('New password must be at least 6 characters')
            return
        }

        if (newPassword !== confirmPassword) {
            showWarning('Passwords do not match')
            return
        }

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
        } catch (err) {
            showError('An error occurred while changing password')
        } finally {
            setSaving(false)
        }
    }

    const handleLogout = async () => {
        setLoggingOut(true)
        try {
            await fetch('/api/auth/logout', { method: 'POST' })
        } catch {}
        localStorage.removeItem('clinicId')
        localStorage.removeItem('clinicName')
        localStorage.removeItem('clinicIcon')
        sessionStorage.removeItem('currentUser')
        router.replace('/')
    }

    const handleClinicLogout = async () => {
        setLoggingOut(true)
        try {
            await fetch('/api/auth/logout', { method: 'POST' })
        } catch {}
        localStorage.removeItem('clinicId')
        localStorage.removeItem('clinicName')
        localStorage.removeItem('clinicIcon')
        sessionStorage.removeItem('currentUser')
        router.replace('/')
    }

    const handleDeleteAccount = async () => {
        if (deleteConfirmText !== 'DELETE') {
            showWarning('Please type DELETE to confirm')
            return
        }

        setDeleting(true)
        try {
            const res = await fetch('/api/auth/delete-account', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' }
            })

            const data = await res.json()

            if (res.ok) {
                showSuccess('Account deleted successfully. Redirecting...')
                setTimeout(() => {
                    router.push('/')
                }, 2000)
            } else {
                showError(data.error || 'Failed to delete account')
                setDeleting(false)
            }
        } catch (err) {
            showError('An error occurred while deleting account')
            setDeleting(false)
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

    const sidebarItems = [
        { id: 'overview' as TabType, label: 'Overview', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg> },
        { id: 'edit' as TabType, label: 'Edit Profile', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg> },
        { id: 'security' as TabType, label: 'Security', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg> },
        { id: 'account' as TabType, label: 'Account', icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> }
    ]

    if (loading) {
        return (
                <div className="flex justify-center items-center min-h-[60vh]">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
                </div>
        )
    }

    return (
        <>
            <ToastNotification toasts={toasts} removeToast={removeToast} />
                <div className="max-w-7xl mx-auto">
                    <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">Profile Settings</h1>

                    {/* Mobile Tabs */}
                    <div className="md:hidden mb-4">
                        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md border border-gray-200 dark:border-gray-700 overflow-x-auto">
                            <div className="flex gap-1 p-2 min-w-max">
                                {sidebarItems.map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() => setActiveTab(item.id)}
                                        className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-200 whitespace-nowrap text-sm ${
                                            activeTab === item.id
                                                ? 'bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-md'
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
                            <div className="rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-4 sticky top-24 overflow-hidden">
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                                <nav className="space-y-1">
                                    {sidebarItems.map((item) => (
                                        <button
                                            key={item.id}
                                            onClick={() => setActiveTab(item.id)}
                                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left ${
                                                activeTab === item.id
                                                    ? 'bg-gradient-to-r from-sky-500 to-sky-600 text-white shadow-lg shadow-sky-500/30 font-medium'
                                                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 hover:shadow-md'
                                            }`}
                                        >
                                            <span className={activeTab === item.id ? 'text-white' : 'text-gray-600 dark:text-gray-400'}>{item.icon}</span>
                                            <span>{item.label}</span>
                                        </button>
                                    ))}
                                </nav>
                                
                                {/* Doctor Switcher for Admin */}
                                {user?.role === 'admin' && (
                                    <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                                        <h3 className="px-4 mb-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                            View as Doctor
                                        </h3>
                                        {doctorsLoading ? (
                                            <div className="px-4 py-3 flex items-center justify-center">
                                                <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-500 border-t-transparent"></div>
                                            </div>
                                        ) : doctors.length > 0 ? (
                                            <div className="space-y-1 max-h-64 overflow-y-auto">
                                                {doctors.map(doctor => (
                                                    <button
                                                        key={doctor.id}
                                                        onClick={() => {
                                                            setSelectedDoctorId(doctor.id)
                                                            // Dispatch event to trigger data refresh
                                                            window.dispatchEvent(new CustomEvent('doctor-changed', { 
                                                                detail: { doctorId: doctor.id } 
                                                            }))
                                                        }}
                                                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left ${
                                                            selectedDoctorId === doctor.id
                                                                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium'
                                                                : 'hover:bg-gray-100 dark:hover:bg-gray-800 hover:shadow-md text-gray-700 dark:text-gray-300'
                                                        }`}
                                                    >
                                                        {doctor.profileImage ? (
                                                            <img 
                                                                src={doctor.profileImage} 
                                                                alt={doctor.name} 
                                                                className="w-8 h-8 rounded-full object-cover"
                                                            />
                                                        ) : (
                                                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-500 flex items-center justify-center flex-shrink-0">
                                                                <span className="text-xs font-bold text-white">
                                                                    {doctor.name?.[0]?.toUpperCase() || '👨‍⚕️'}
                                                                </span>
                                                            </div>
                                                        )}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="truncate text-sm">{doctor.name || 'Unnamed Doctor'}</div>
                                                            {doctor.email && (
                                                                <div className="truncate text-xs text-gray-500 dark:text-gray-400">{doctor.email}</div>
                                                            )}
                                                        </div>
                                                        {selectedDoctorId === doctor.id && (
                                                            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                        )}
                                                    </button>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                                No doctors found
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Main Content */}
                        <div className="flex-1 min-w-0">
                            {activeTab === 'overview' && (
                                <div className="bg-white dark:bg-gray-900 rounded-xl shadow-md p-4 sm:p-6 md:p-8 border border-gray-200 dark:border-gray-700">
                                    <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">Profile Overview</h2>
                                    
                                    <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 mb-6 sm:mb-8 pb-6 sm:pb-8 border-b border-gray-200 dark:border-gray-700">
                                        <div className="relative">
                                            {profileImage ? (
                                                <img 
                                                    src={profileImage} 
                                                    alt="Profile" 
                                                    className="w-32 h-32 rounded-2xl object-cover border-4 border-gray-200 dark:border-gray-700 shadow-xl"
                                                />
                                            ) : (
                                                <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-500 flex items-center justify-center border-4 border-gray-200 dark:border-gray-700 shadow-xl">
                                                    <span className="text-5xl font-bold text-white">
                                                        {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'U'}
                                                    </span>
                                                </div>
                                            )}
                                            <label 
                                                htmlFor="profile-image-upload-overview" 
                                                className="absolute bottom-0 right-0 w-10 h-10 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center cursor-pointer hover:from-blue-600 hover:to-blue-700 transition-all shadow-lg hover:shadow-xl transform hover:scale-110"
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
                                                <div className="absolute inset-0 bg-black bg-opacity-50 rounded-2xl flex items-center justify-center">
                                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white"></div>
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <h3 className="text-2xl font-bold mb-1">{user?.name || 'User'}</h3>
                                            <p className="text-muted mb-3">{user?.email}</p>
                                            <span className="inline-flex items-center px-4 py-1.5 rounded-full text-sm font-medium bg-gradient-to-r from-sky-100 to-sky-200 text-sky-800 dark:from-sky-900 dark:to-sky-800 dark:text-sky-200 border border-sky-300 dark:border-sky-700">
                                                {user?.role}
                                            </span>
                                            {profileImage && (
                                                <div className="mt-3">
                                                    <button
                                                        onClick={handleRemoveProfileImage}
                                                        disabled={saving}
                                                        className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50 hover:underline"
                                                    >
                                                        Remove profile picture
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                        <div className="p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                                            <h4 className="text-xs sm:text-sm font-medium text-muted mb-1 sm:mb-2">Full Name</h4>
                                            <p className="text-base sm:text-lg font-semibold break-words">{user?.name || 'Not set'}</p>
                                        </div>
                                        <div className="p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                                            <h4 className="text-xs sm:text-sm font-medium text-muted mb-1 sm:mb-2">Email Address</h4>
                                            <p className="text-base sm:text-lg font-semibold break-all">{user?.email}</p>
                                        </div>
                                        {phone && (
                                            <div className="p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                                                <h4 className="text-xs sm:text-sm font-medium text-muted mb-1 sm:mb-2">Phone Number</h4>
                                                <p className="text-base sm:text-lg font-semibold">{phone}</p>
                                            </div>
                                        )}
                                        <div className="p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                                            <h4 className="text-xs sm:text-sm font-medium text-muted mb-1 sm:mb-2">Role</h4>
                                            <p className="text-base sm:text-lg font-semibold capitalize">{user?.role}</p>
                                        </div>
                                        <div className="p-4 sm:p-5 bg-gradient-to-br from-sky-50 to-sky-100 dark:from-sky-900/20 dark:to-sky-800/20 rounded-xl border border-sky-200 dark:border-sky-700 shadow-sm hover:shadow-md transition-shadow">
                                            <h4 className="text-xs sm:text-sm font-medium text-sky-700 dark:text-sky-300 mb-1 sm:mb-2">Account Status</h4>
                                            <p className="text-lg font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-2">
                                                <span className="w-2 h-2 bg-sky-500 rounded-full animate-pulse"></span>
                                                Active
                                            </p>
                                        </div>
                                        
                                        {/* Patient-specific fields for user role */}
                                        {user?.role?.toLowerCase() === 'user' && (
                                            <>
                                                {dob && (
                                                    <div className="p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                                                        <h4 className="text-xs sm:text-sm font-medium text-muted mb-1 sm:mb-2">Date of Birth</h4>
                                                        <p className="text-base sm:text-lg font-semibold">{new Date(dob).toLocaleDateString()}</p>
                                                    </div>
                                                )}
                                                {age && (
                                                    <div className="p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                                                        <h4 className="text-xs sm:text-sm font-medium text-muted mb-1 sm:mb-2">Age</h4>
                                                        <p className="text-base sm:text-lg font-semibold">{age} years</p>
                                                    </div>
                                                )}
                                                {gender && (
                                                    <div className="p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                                                        <h4 className="text-xs sm:text-sm font-medium text-muted mb-1 sm:mb-2">Gender</h4>
                                                        <p className="text-base sm:text-lg font-semibold">{gender}</p>
                                                    </div>
                                                )}
                                                {occupation && (
                                                    <div className="p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                                                        <h4 className="text-xs sm:text-sm font-medium text-muted mb-1 sm:mb-2">Occupation</h4>
                                                        <p className="text-base sm:text-lg font-semibold">{occupation}</p>
                                                    </div>
                                                )}
                                                {fatherHusbandGuardianName && (
                                                    <div className="p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow sm:col-span-2">
                                                        <h4 className="text-xs sm:text-sm font-medium text-muted mb-1 sm:mb-2">Father/Husband/Guardian Name</h4>
                                                        <p className="text-base sm:text-lg font-semibold">{fatherHusbandGuardianName}</p>
                                                    </div>
                                                )}
                                                {address && (
                                                    <div className="p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow sm:col-span-2">
                                                        <h4 className="text-xs sm:text-sm font-medium text-muted mb-1 sm:mb-2">Address</h4>
                                                        <p className="text-base sm:text-lg font-semibold">{address}</p>
                                                    </div>
                                                )}
                                                {height && (
                                                    <div className="p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                                                        <h4 className="text-xs sm:text-sm font-medium text-muted mb-1 sm:mb-2">Height</h4>
                                                        <p className="text-base sm:text-lg font-semibold">{height} cm</p>
                                                    </div>
                                                )}
                                                {weight && (
                                                    <div className="p-4 sm:p-5 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                                                        <h4 className="text-xs sm:text-sm font-medium text-muted mb-1 sm:mb-2">Weight</h4>
                                                        <p className="text-base sm:text-lg font-semibold">{weight} kg</p>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'edit' && (
                                <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-4 sm:p-6 md:p-8 overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                                    <div className="relative">
                                    <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">Edit Profile</h2>
                                    
                                    {user?.role?.toLowerCase() === 'user' && (
                                        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                                            <p className="text-sm text-blue-700 dark:text-blue-300">
                                                <span className="font-semibold">Note:</span> Fields marked with an asterisk (<span className="text-red-600">*</span>) are required to book appointments.
                                            </p>
                                        </div>
                                    )}
                                    
                                    <form onSubmit={handleUpdateProfile} className="max-w-2xl space-y-4 sm:space-y-6">
                                        {/* Basic Information */}
                                        <div className="space-y-4">
                                            <h3 className="text-lg font-semibold border-b pb-2">Basic Information</h3>
                                            
                                            <div>
                                                <label className="block text-sm font-semibold mb-2">Full Name *</label>
                                                <input
                                                    type="text"
                                                    value={name}
                                                    onChange={(e) => setName(e.target.value)}
                                                    className="w-full p-2.5 sm:p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white dark:bg-gray-800 transition-all text-sm sm:text-base"
                                                    placeholder="Enter your full name"
                                                    required
                                                />
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <div>
                                                    <label className="block text-sm font-semibold mb-2">Email Address *</label>
                                                    <input
                                                        type="email"
                                                        value={email}
                                                        onChange={(e) => setEmail(e.target.value)}
                                                        className="w-full p-2.5 sm:p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white dark:bg-gray-800 transition-all text-sm sm:text-base"
                                                        placeholder="Enter your email"
                                                        required
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-sm font-semibold mb-2">Phone Number *</label>
                                                    <input
                                                        type="tel"
                                                        value={phone}
                                                        onChange={(e) => setPhone(e.target.value)}
                                                        className="w-full p-2.5 sm:p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white dark:bg-gray-800 transition-all text-sm sm:text-base"
                                                        placeholder="Enter your phone number"
                                                        required={user?.role?.toLowerCase() === 'user'}
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Patient-specific fields for user role */}
                                        {user?.role?.toLowerCase() === 'user' && (
                                            <>
                                                <div className="space-y-4 pt-4 border-t">
                                                    <h3 className="text-lg font-semibold border-b pb-2">Personal Details</h3>
                                                    
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-semibold mb-2">Date of Birth *</label>
                                                            <input
                                                                type="date"
                                                                value={dob}
                                                                onChange={(e) => {
                                                                    setDob(e.target.value)
                                                                    setAge(calculateAge(e.target.value))
                                                                }}
                                                                className="w-full p-2.5 sm:p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white dark:bg-gray-800 transition-all text-sm sm:text-base"
                                                                required
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="block text-sm font-semibold mb-2">Age *</label>
                                                            <input
                                                                type="number"
                                                                value={age}
                                                                onChange={(e) => setAge(e.target.value)}
                                                                className="w-full p-2.5 sm:p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white dark:bg-gray-800 transition-all text-sm sm:text-base"
                                                                placeholder="Age"
                                                                readOnly={!!dob}
                                                                required
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="block text-sm font-semibold mb-2">Gender *</label>
                                                            <select
                                                                value={gender}
                                                                onChange={(e) => setGender(e.target.value)}
                                                                className="w-full p-2.5 sm:p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white dark:bg-gray-800 transition-all text-sm sm:text-base"
                                                                required
                                                            >
                                                                <option value="">Select Gender</option>
                                                                <option value="Male">Male</option>
                                                                <option value="Female">Female</option>
                                                                <option value="Other">Other</option>
                                                            </select>
                                                        </div>

                                                        <div>
                                                            <label className="block text-sm font-semibold mb-2">Occupation</label>
                                                            <input
                                                                type="text"
                                                                value={occupation}
                                                                onChange={(e) => setOccupation(e.target.value)}
                                                                className="w-full p-2.5 sm:p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white dark:bg-gray-800 transition-all text-sm sm:text-base"
                                                                placeholder="Enter your occupation"
                                                            />
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-semibold mb-2">Father/Husband/Guardian Name</label>
                                                        <input
                                                            type="text"
                                                            value={fatherHusbandGuardianName}
                                                            onChange={(e) => setFatherHusbandGuardianName(e.target.value)}
                                                            className="w-full p-2.5 sm:p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white dark:bg-gray-800 transition-all text-sm sm:text-base"
                                                            placeholder="Enter F/H/G name"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-sm font-semibold mb-2">Address *</label>
                                                        <textarea
                                                            value={address}
                                                            onChange={(e) => setAddress(e.target.value)}
                                                            className="w-full p-2.5 sm:p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white dark:bg-gray-800 transition-all text-sm sm:text-base"
                                                            rows={3}
                                                            placeholder="Enter your address"
                                                            required
                                                        />
                                                    </div>

                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-semibold mb-2">Height (cm)</label>
                                                            <input
                                                                type="number"
                                                                step="0.1"
                                                                value={height}
                                                                onChange={(e) => setHeight(e.target.value)}
                                                                className="w-full p-2.5 sm:p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white dark:bg-gray-800 transition-all text-sm sm:text-base"
                                                                placeholder="Height in cm"
                                                            />
                                                        </div>

                                                        <div>
                                                            <label className="block text-sm font-semibold mb-2">Weight (kg)</label>
                                                            <input
                                                                type="number"
                                                                step="0.1"
                                                                value={weight}
                                                                onChange={(e) => setWeight(e.target.value)}
                                                                className="w-full p-2.5 sm:p-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white dark:bg-gray-800 transition-all text-sm sm:text-base"
                                                                placeholder="Weight in kg"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        )}

                                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2 sm:pt-4">
                                            <button
                                                type="submit"
                                                disabled={saving}
                                                className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-sky-500 to-sky-600 text-white rounded-xl hover:from-sky-600 hover:to-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg font-medium transform hover:scale-105 text-sm sm:text-base"
                                            >
                                                {saving ? 'Saving...' : 'Save Changes'}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setName(user?.name || '')
                                                    setEmail(user?.email || '')
                                                    setPhone(user?.phone || '')
                                                    // Re-fetch patient data
                                                    if (user?.role?.toLowerCase() === 'user') {
                                                        fetchPatientData(user.email, user.phone)
                                                    }
                                                }}
                                                className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-all shadow-md hover:shadow-lg font-medium text-sm sm:text-base"
                                            >
                                                Reset
                                            </button>
                                        </div>
                                    </form>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'security' && (
                                <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-4 sm:p-6 md:p-8 overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                                    <div className="relative">
                                    <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">Security Settings</h2>
                                    
                                    <div className="max-w-2xl">
                                        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-sm sm:text-base">
                                            <h3 className="text-lg font-semibold mb-2 text-blue-800 dark:text-blue-200">🔒 Change Password</h3>
                                            <p className="text-sm text-blue-700 dark:text-blue-300">Keep your account secure by using a strong password</p>
                                        </div>
                                        <form onSubmit={handleChangePassword} className="space-y-4 sm:space-y-6">
                                            <div>
                                                <label className="block text-sm font-semibold mb-2">Current Password</label>
                                                <div className="relative">
                                                    <input
                                                        type={showCurrentPassword ? 'text' : 'password'}
                                                        value={currentPassword}
                                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                                        className="w-full p-2.5 sm:p-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white dark:bg-gray-800 transition-all text-sm sm:text-base"
                                                        placeholder="Enter current password"
                                                    />
                                                    <button type="button" tabIndex={-1} onClick={() => setShowCurrentPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                                        {showCurrentPassword ? (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>) : (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>)}
                                                    </button>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-semibold mb-2">New Password</label>
                                                <div className="relative">
                                                    <input
                                                        type={showNewPassword ? 'text' : 'password'}
                                                        value={newPassword}
                                                        onChange={(e) => setNewPassword(e.target.value)}
                                                        className="w-full p-2.5 sm:p-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white dark:bg-gray-800 transition-all text-sm sm:text-base"
                                                        placeholder="Enter new password (min 6 characters)"
                                                    />
                                                    <button type="button" tabIndex={-1} onClick={() => setShowNewPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                                        {showNewPassword ? (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>) : (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>)}
                                                    </button>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-semibold mb-2">Confirm New Password</label>
                                                <div className="relative">
                                                    <input
                                                        type={showConfirmPassword ? 'text' : 'password'}
                                                        value={confirmPassword}
                                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                                        className="w-full p-2.5 sm:p-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white dark:bg-gray-800 transition-all text-sm sm:text-base"
                                                        placeholder="Confirm new password"
                                                    />
                                                    <button type="button" tabIndex={-1} onClick={() => setShowConfirmPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                                        {showConfirmPassword ? (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>) : (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>)}
                                                    </button>
                                                </div>
                                            </div>

                                            <button
                                                type="submit"
                                                disabled={saving}
                                                className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg font-medium transform hover:scale-105 text-sm sm:text-base"
                                            >
                                                {saving ? 'Changing...' : 'Change Password'}
                                            </button>
                                        </form>
                                    </div>
                                    </div>
                                </div>
                            )}

                            {activeTab === 'account' && (
                                <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-4 sm:p-6 md:p-8 overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                                    <div className="relative">
                                    <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6 bg-gradient-to-r from-sky-600 to-blue-600 bg-clip-text text-transparent">Account Settings</h2>
                                    
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
                                                    disabled={loggingOut}
                                                    className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 bg-gradient-to-r from-yellow-500 to-orange-500 text-white rounded-xl hover:from-yellow-600 hover:to-orange-600 transition-all shadow-md hover:shadow-lg font-medium transform hover:scale-105 text-sm sm:text-base disabled:opacity-60 disabled:transform-none flex items-center justify-center gap-2"
                                                >
                                                    {loggingOut && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                                                    {loggingOut ? 'Logging out...' : 'Logout'}
                                                </button>
                                            </div>
                                        </div>

                                        {user?.role !== 'super_admin' && (
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
                                                        disabled={loggingOut}
                                                        className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-xl hover:from-orange-600 hover:to-red-600 transition-all shadow-md hover:shadow-lg font-medium transform hover:scale-105 text-sm sm:text-base disabled:opacity-60 disabled:transform-none flex items-center justify-center gap-2"
                                                    >
                                                        {loggingOut && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                                                        {loggingOut ? 'Logging out...' : 'Logout from Clinic'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        <div className="p-4 sm:p-6 bg-gradient-to-br from-red-50 to-pink-50 dark:from-red-900/20 dark:to-pink-900/20 border-2 border-red-300 dark:border-red-700 rounded-xl shadow-md hover:shadow-lg transition-all">
                                            <div className="flex flex-col sm:flex-row items-start justify-between gap-3 sm:gap-0">
                                                <div className="flex-1">
                                                    <h3 className="font-bold text-red-900 dark:text-red-100 mb-2 flex items-center gap-2 text-base sm:text-lg">
                                                        <span className="text-xl">⚠️</span> Delete Account
                                                    </h3>
                                                    <p className="text-xs sm:text-sm text-red-700 dark:text-red-300">Permanently delete your account and all associated data. This action cannot be undone.</p>
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
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Delete Account Confirmation Dialog */}
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
                                    <h3 className="text-lg sm:text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-red-600 to-orange-600 dark:from-red-400 dark:to-orange-400">Delete Account</h3>
                                    <p className="text-xs sm:text-sm text-red-600 dark:text-red-400 font-medium">This action cannot be undone</p>
                                </div>
                            </div>

                            <div className="relative mb-4 sm:mb-6">
                                <p className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 mb-3 sm:mb-4 bg-gray-50 dark:bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                                    Are you sure you want to delete your account? This will permanently remove all your data and cannot be reversed.
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
                                    onClick={handleDeleteAccount}
                                    disabled={deleting || deleteConfirmText !== 'DELETE'}
                                    className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-xl hover:from-red-700 hover:to-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg font-semibold transform hover:scale-105 disabled:transform-none text-sm sm:text-base"
                                >
                                    {deleting ? 'Deleting...' : 'Delete Account'}
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

