import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../hooks/useToast'
import ToastNotification from '../components/ToastNotification'
import CustomSelect from '../components/CustomSelect'
import ThemedScrollArea from '../components/ThemedScrollArea'
import {
    CategoryFieldKey,
    CategoryFieldRulesMap,
    CATEGORY_RULE_FIELD_LABELS,
    CATEGORY_RULE_FIELD_ORDER,
    DEFAULT_CATEGORY_RULE_KEY,
    createCurrentCategoryFieldRulesBaseline,
    getCategoryFieldVisibility,
    getCategoryRuleAliases,
    getCategoryRuleDisplayLabel,
    groupCategoryNamesByRuleKey,
    normalizeCategoryFieldRules,
    normalizeCategoryRuleKey,
} from '../lib/categoryFieldRules'

interface Clinic {
    id: string
    clinicId: string
    name: string
    email: string
    status: string
    createdAt: string
    themeGradient?: string
    _count: {
        users: number
    }
}

// Theme gradient presets
const GRADIENT_PRESETS = [
    { key: 'blue',    label: 'Blue',    from: '#3B82F6', to: '#0EA5E9', brand: '#3B82F6', brandDark: '#60A5FA' },
    { key: 'purple',  label: 'Purple',  from: '#8B5CF6', to: '#6366F1', brand: '#8B5CF6', brandDark: '#A78BFA' },
    { key: 'emerald', label: 'Emerald', from: '#10B981', to: '#14B8A6', brand: '#10B981', brandDark: '#34D399' },
    { key: 'rose',    label: 'Rose',    from: '#F43F5E', to: '#FB923C', brand: '#F43F5E', brandDark: '#FB7185' },
    { key: 'teal',    label: 'Green',   from: '#22C55E', to: '#10B981', brand: '#22C55E', brandDark: '#4ADE80' },
]

interface User {
    id: string
    name: string
    email: string
    role: string
    createdAt: string
    clinic: {
        name: string
        clinicId: string
    } | null
}

interface SystemStats {
    totalClinics: number
    activeClinics: number
    pendingClinics: number
    totalUsers: number
    totalPatients: number
    totalPrescriptions: number
    totalProducts: number
    totalInvoices: number
    totalPurchaseOrders: number
}

interface PagePermission {
    page: string
    canAccess: boolean
    canWrite: boolean
}

interface RolePermissions {
    [role: string]: PagePermission[]
}

interface AuditLog {
    id: string
    action: string
    category: string
    severity: string      // 'ok' | 'warning' | 'critical'
    userId: string
    userName: string
    userRole: string
    clinicId: string | null
    clinicName: string | null
    details: any
    ipAddress: string | null
    userAgent: string | null
    location: string | null
    locationLat: number | null
    locationLng: number | null
    timestamp: string
}

interface Release {
    id: number
    version: string
    title: string
    description: string | null
    features: string[]
    releaseType: string
    platforms: string[]
    isActive: boolean
    createdAt: string
    createdBy: number | null
}

interface SessionEntry {
    id: number
    sessionToken: string
    userId: number
    userName: string
    userRole: string
    ipAddress: string | null
    location: string | null
    userAgent: string | null
    createdAt: string
    lastActive: string
    expiresAt: string | null
}

interface ClinicSessionGroup {
    clinicInternalId: string | null
    clinicId: string | null
    clinicName: string
    maxSessions: number
    userCount: number
    sessions: SessionEntry[]
}

interface AdminCoupon {
    code: string
    description?: string
    discountType: 'percent' | 'flat'
    discountValue: number
    minAmount?: number
    maxDiscount?: number
    appliesTo: string[]
    active: boolean
    expiresAt?: string | null
    usageLimit?: number | null
    usedCount?: number
}

interface GlobalDefaultPage {
    page: string
    label: string
    values: Record<string, any>
}

interface DefaultTemplateSummary {
    latestProductVersion: number
    latestTreatmentVersion: number
    latestProductRows: number
    latestTreatmentRows: number
    syncedProductClinics: number
    syncedTreatmentClinics: number
    totalClinics: number
    globalDefaults: GlobalDefaultPage[]
}

interface RestoreTableSummary {
    table: string
    status?: 'pending' | 'processing' | 'completed' | 'skipped'
    scannedRows: number
    insertedRows: number
    skippedRows: number
    errors: number
    note?: string
    startedAt?: string
    finishedAt?: string
}

interface RestoreJobView {
    id: string
    scope?: 'clinic' | 'whole'
    clinicId: string
    clinicCode: string
    clinicName: string
    status: 'running' | 'completed' | 'failed'
    phase: string
    percent: number
    message: string
    startedAt: string
    finishedAt?: string
    logs: string[]
    error?: string
    result?: {
        scannedRows: number
        insertedRows: number
        skippedRows: number
        tableSummaries: RestoreTableSummary[]
    }
}

const releaseTypes = [
    { value: 'major', label: 'Major Release', description: 'Shows a centered modal to all users' },
    { value: 'feature', label: 'New Feature', description: 'Shows a dismissible top banner' },
    { value: 'improvement', label: 'Improvement', description: 'Shows a dismissible top banner' },
    { value: 'bugfix', label: 'Bug Fix', description: 'Silent — logged in changelog only' },
    { value: 'security', label: 'Security', description: 'Silent — logged in changelog only' }
]

const releaseTypeStyles: Record<string, string> = {
    major: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    feature: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
    improvement: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    bugfix: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
    security: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
}

const subscriptionPlanOptions = [
    { value: 'basic', label: 'Basic' },
    { value: 'standard', label: 'Standard' },
    { value: 'basic_ai_ocr', label: 'Basic + AI OCR' },
    { value: 'standard_ai_ocr', label: 'Standard + AI OCR' },
    { value: 'pro', label: 'Pro' },
]

const subscriptionCycleOptions = [
    { value: 'monthly', label: '🔒 Monthly (Requires 1 Year Plan)' },
    { value: 'quarterly', label: '🔒 3 Months (Requires 1 Year Plan)' },
    { value: 'annual', label: 'Annual' },
    { value: 'fiveYear', label: '5-Year' },
]

const subscriptionStatusOptions = [
    { value: 'active', label: 'Active' },
    { value: 'trial', label: 'Trial' },
    { value: 'expired', label: 'Expired' },
    { value: 'cancelled', label: 'Cancelled' },
]

const trialToggleOptions = [
    { value: 'yes', label: 'On Trial' },
    { value: 'no', label: 'No Trial' },
]

const defaultCsvTypeOptions = [
    { value: 'product', label: 'Products CSV' },
    { value: 'treatment', label: 'Treatments CSV' },
]

const booleanSelectOptions = [
    { value: 'true', label: 'True' },
    { value: 'false', label: 'False' },
]

const couponTypeOptions = [
    { value: 'percent', label: 'Percent (%)' },
    { value: 'flat', label: 'Flat (Rs)' },
]

const couponContextOptions = [
    { value: 'register_plan', label: 'Register Plan' },
    { value: 'upgrade_plan', label: 'Upgrade Plan' },
    { value: 'ai_ocr_basic', label: 'AI OCR Basic' },
    { value: 'ai_ocr_standard', label: 'AI OCR Standard' },
]

const roleOptions = [
    { value: 'admin', label: 'Admin' },
    { value: 'doctor', label: 'Doctor' },
    { value: 'receptionist', label: 'Receptionist' },
    { value: 'staff', label: 'Staff' },
]

// Anomaly detection tag component
function SeverityTag({ severity }: { severity: string }) {
    if (severity === 'critical') {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-700 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                CRITICAL
            </span>
        )
    }
    if (severity === 'warning') {
        return (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border border-orange-300 dark:border-orange-700 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                COULD BE ANOMALY
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            OK
        </span>
    )
}

export default function SuperAdminDashboard() {
    const router = useRouter()
    
    // Active tab state
    const [activeTab, setActiveTab] = useState('clinics')
    
    // Loading states
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    
    // Current user
    const [currentUser, setCurrentUser] = useState<any>(null)
    
    // Clinics tab states
    const [clinics, setClinics] = useState<Clinic[]>([])
    const [pendingClinics, setPendingClinics] = useState<Clinic[]>([])
    const [searchTerm, setSearchTerm] = useState('')
    const [expandedClinicId, setExpandedClinicId] = useState<string | null>(null)
    const [clinicUsers, setClinicUsers] = useState<{ [clinicId: string]: User[] }>({})
    const [clinicLocations, setClinicLocations] = useState<{ [clinicId: string]: Array<{id: string; name: string | null; lat: number; lng: number; radius: number}> }>({})
    const [locationDetecting, setLocationDetecting] = useState<{ [clinicId: string]: boolean }>({})
    const [newLocationRadius, setNewLocationRadius] = useState<{ [clinicId: string]: number }>({})
    
    // System Stats tab states
    const [systemStats, setSystemStats] = useState<SystemStats | null>(null)
    
    // Role Permissions tab states
    const [rolePermissions, setRolePermissions] = useState<RolePermissions>({})
    const [availablePages, setAvailablePages] = useState<string[]>([])
    
    // Audit Logs tab states
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
    const [auditFilter, setAuditFilter] = useState('all')
    const [auditSearchTerm, setAuditSearchTerm] = useState('')
    const [auditSeverityFilter, setAuditSeverityFilter] = useState('all')
    
    // Release Manager tab states
    const [releases, setReleases] = useState<Release[]>([])

    // Sessions tab states
    const [sessionGroups, setSessionGroups] = useState<ClinicSessionGroup[]>([])
    const [totalActiveSessions, setTotalActiveSessions] = useState(0)
    const [sessionsLoading, setSessionsLoading] = useState(false)
    const [clearingScope, setClearingScope] = useState<string | null>(null)

    // Subscriptions tab states
    const [subClinics, setSubClinics] = useState<any[]>([])
    const [subSearch, setSubSearch] = useState('')
    const [subSaving, setSubSaving] = useState<string | null>(null)
    const [trialEditValues, setTrialEditValues] = useState<{ [clinicId: string]: string }>({})
    const [countdownNow, setCountdownNow] = useState<number>(Date.now())

    const [coupons, setCoupons] = useState<AdminCoupon[]>([])
    const [couponCode, setCouponCode] = useState('')
    const [couponType, setCouponType] = useState<'percent' | 'flat'>('percent')
    const [couponValue, setCouponValue] = useState<number>(10)
    const [couponContexts, setCouponContexts] = useState<string[]>(['register_plan'])
    const [couponContextPicker, setCouponContextPicker] = useState('register_plan')

    const [defaultTemplateSummary, setDefaultTemplateSummary] = useState<DefaultTemplateSummary | null>(null)
    const [defaultCsvType, setDefaultCsvType] = useState<'product' | 'treatment'>('product')
    const [defaultCsvFile, setDefaultCsvFile] = useState<File | null>(null)
    const [defaultUploadLoading, setDefaultUploadLoading] = useState(false)
    const [globalDefaults, setGlobalDefaults] = useState<GlobalDefaultPage[]>([])
    const [selectedDefaultPage, setSelectedDefaultPage] = useState('')
    const [defaultValues, setDefaultValues] = useState<Record<string, any>>({})
    const [editingDefaultValues, setEditingDefaultValues] = useState<Record<string, any>>({})
    const [defaultCsvInputKey, setDefaultCsvInputKey] = useState(0)
    const [savingGlobalDefault, setSavingGlobalDefault] = useState(false)
    const [savingImportPulseToggle, setSavingImportPulseToggle] = useState(false)
    const [savingKeywordLearningToggle, setSavingKeywordLearningToggle] = useState(false)
    const [resettingTreatmentKeywords, setResettingTreatmentKeywords] = useState(false)
    const [categoryFieldRulesEditor, setCategoryFieldRulesEditor] = useState<CategoryFieldRulesMap>(createCurrentCategoryFieldRulesBaseline())
    const [savingCategoryFieldRules, setSavingCategoryFieldRules] = useState(false)
    const [categoryNamesFromDb, setCategoryNamesFromDb] = useState<string[]>([])
    const [loadingCategoryNames, setLoadingCategoryNames] = useState(false)

    const [restoreFile, setRestoreFile] = useState<File | null>(null)
    const [restoreFileInputKey, setRestoreFileInputKey] = useState(0)
    const [restoreScope, setRestoreScope] = useState<'clinic' | 'whole'>('clinic')
    const [selectedRestoreClinicId, setSelectedRestoreClinicId] = useState('')
    const [restoreConfirmText, setRestoreConfirmText] = useState('')
    const [restoreLoading, setRestoreLoading] = useState(false)
    const [restoreOutput, setRestoreOutput] = useState('')
    const [restoreJobId, setRestoreJobId] = useState<string | null>(null)
    const [restoreJob, setRestoreJob] = useState<RestoreJobView | null>(null)
    const [showRestoreProgressModal, setShowRestoreProgressModal] = useState(false)
    const [showOnlyChangedRestoreTables, setShowOnlyChangedRestoreTables] = useState(false)

    const [showReleaseForm, setShowReleaseForm] = useState(false)
    const [editingRelease, setEditingRelease] = useState<Release | null>(null)
    const [releaseVersion, setReleaseVersion] = useState('')
    const [releaseTitle, setReleaseTitle] = useState('')
    const [releaseDescription, setReleaseDescription] = useState('')
    const [releaseType, setReleaseType] = useState('improvement')
    const [releasePlatforms, setReleasePlatforms] = useState<string[]>(['all'])
    const [releaseFeatures, setReleaseFeatures] = useState<string[]>([''])
    const [savingRelease, setSavingRelease] = useState(false)
    const [deleteReleaseId, setDeleteReleaseId] = useState<number | null>(null)
    const [releaseDeleteStep, setReleaseDeleteStep] = useState<1 | 2>(1)
    
    // Modal states
    const [showEditAccessCodeModal, setShowEditAccessCodeModal] = useState(false)
    const [selectedClinic, setSelectedClinic] = useState<Clinic | null>(null)
    const [newAccessCode, setNewAccessCode] = useState('')
    
    const [showResetPasswordModal, setShowResetPasswordModal] = useState(false)
    const [showDeleteUserModal, setShowDeleteUserModal] = useState(false)
    const [showChangeRoleModal, setShowChangeRoleModal] = useState(false)
    const [selectedUser, setSelectedUser] = useState<User | null>(null)
    const [newRole, setNewRole] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [showResetPassword, setShowResetPassword] = useState(false)
    const [deleteConfirmText, setDeleteConfirmText] = useState('')
    
    // Toast notifications
    const { toasts, removeToast, showSuccess, showError } = useToast()

    const { user: authUser, loading: authLoading } = useAuth()

    useEffect(() => {
        if (authLoading) return
        // Clear clinic branding from localStorage immediately
        localStorage.removeItem('clinicName')
        localStorage.removeItem('clinicIcon')
        
        if (!authUser || authUser.role !== 'super_admin') {
            router.push('/super-admin-login')
            return
        }
        setCurrentUser(authUser)
        setLoading(false)
    }, [authUser, authLoading])

    useEffect(() => {
        const timer = setInterval(() => setCountdownNow(Date.now()), 1000)
        return () => clearInterval(timer)
    }, [])

    useEffect(() => {
        if (!globalDefaults.length) return

        const selected = globalDefaults.find((item) => item.page === selectedDefaultPage) || globalDefaults[0]
        if (!selected) return

        if (!selectedDefaultPage) {
            setSelectedDefaultPage(selected.page)
        }
        setDefaultValues(selected.values || {})
        setEditingDefaultValues(selected.values || {})
    }, [globalDefaults, selectedDefaultPage])

    useEffect(() => {
        if (!restoreJobId) return

        let disposed = false

        const formatSummary = (job: RestoreJobView) => {
            const result = job.result
            const lines: string[] = [job.message || 'Restore finished']

            if (result) {
                lines.push(`Scanned rows: ${result.scannedRows}`)
                lines.push(`Inserted rows: ${result.insertedRows}`)
                lines.push(`Skipped rows: ${result.skippedRows}`)
            }

            if (job.error) {
                lines.push(`Error: ${job.error}`)
            }

            if (job.logs?.length) {
                lines.push('')
                lines.push('Restore Logs:')
                lines.push(...job.logs.slice(-30))
            }

            return lines.join('\n')
        }

        const pollRestoreJob = async () => {
            try {
                const response = await fetch(`/api/super-admin/db-restore?jobId=${encodeURIComponent(restoreJobId)}`)
                const data = await response.json()

                if (!response.ok) {
                    if (!disposed) {
                        setRestoreLoading(false)
                        setRestoreJobId(null)
                        showError(data.error || 'Failed to fetch restore progress')
                    }
                    return
                }

                const nextJob = data.job as RestoreJobView
                if (disposed) return

                setRestoreJob(nextJob)

                if (nextJob.status === 'running') {
                    return
                }

                setRestoreLoading(false)
                setRestoreOutput(formatSummary(nextJob))
                setRestoreJobId(null)

                if (nextJob.status === 'completed') {
                    showSuccess(
                        nextJob.scope === 'whole'
                            ? 'Whole-database restore completed'
                            : `Clinic restore completed for ${nextJob.clinicName}`
                    )
                    setRestoreFile(null)
                    setRestoreFileInputKey((prev) => prev + 1)
                    setRestoreConfirmText('')
                } else {
                    showError(nextJob.error || (nextJob.scope === 'whole' ? 'Whole-database restore failed' : 'Clinic restore failed'))
                }
            } catch {
                if (!disposed) {
                    setRestoreLoading(false)
                    setRestoreJobId(null)
                    showError('Failed to fetch restore progress')
                }
            }
        }

        void pollRestoreJob()
        const intervalId = setInterval(() => {
            void pollRestoreJob()
        }, 1500)

        return () => {
            disposed = true
            clearInterval(intervalId)
        }
    }, [restoreJobId, showError, showSuccess])

    const selectedGlobalDefault = globalDefaults.find((item) => item.page === selectedDefaultPage) || null
    const prescriptionsGlobalDefault = globalDefaults.find((item) => item.page === 'prescriptions') || null
    const treatmentsGlobalDefault = globalDefaults.find((item) => item.page === 'treatments') || null
    const productsGlobalDefault = globalDefaults.find((item) => item.page === 'products') || null
    const keywordLearningEnabled = (prescriptionsGlobalDefault?.values?.allowKeywordLearning as boolean | undefined) !== false
    const productsImportPulseEnabled = (productsGlobalDefault?.values?.showImportPulseForNewDefaults as boolean | undefined) !== false
    const treatmentsImportPulseEnabled = (treatmentsGlobalDefault?.values?.showImportPulseForNewDefaults as boolean | undefined) !== false
    const importPulseToggleState = productsImportPulseEnabled === treatmentsImportPulseEnabled
        ? (productsImportPulseEnabled ? 'on' : 'off')
        : 'mixed'

    const savedCategoryFieldRules = useMemo(() => {
        const source = prescriptionsGlobalDefault?.values?.categoryFieldRules || treatmentsGlobalDefault?.values?.categoryFieldRules
        return normalizeCategoryFieldRules(source)
    }, [prescriptionsGlobalDefault?.values?.categoryFieldRules, treatmentsGlobalDefault?.values?.categoryFieldRules])

    const dbCategoryRuleGroups = useMemo(() => {
        return groupCategoryNamesByRuleKey(categoryNamesFromDb)
    }, [categoryNamesFromDb])

    const dbAliasesByRuleKey = useMemo(() => {
        const mapping: Record<string, string[]> = {}
        dbCategoryRuleGroups.forEach((group) => {
            mapping[group.key] = group.aliases
        })
        return mapping
    }, [dbCategoryRuleGroups])

    const categoryRuleRows = useMemo(() => {
        return dbCategoryRuleGroups.map((group) => group.key).sort((a, b) => a.localeCompare(b))
    }, [dbCategoryRuleGroups])

    const formatCategoryRuleLabel = (key: string) => {
        return getCategoryRuleDisplayLabel(key)
    }

    useEffect(() => {
        setCategoryFieldRulesEditor(savedCategoryFieldRules)
    }, [savedCategoryFieldRules])

    const formatDefaultFieldLabel = (field: string) =>
        field
            .replace(/([A-Z])/g, ' $1')
            .replace(/[_-]/g, ' ')
            .replace(/^./, (s) => s.toUpperCase())
            .trim()

    const formatRemainingTime = (targetDate?: string | null) => {
        if (!targetDate) return '0d 0h 0m 0s'
        const diffMs = new Date(targetDate).getTime() - countdownNow
        if (!Number.isFinite(diffMs) || diffMs <= 0) return '0d 0h 0m 0s'
        const totalSeconds = Math.floor(diffMs / 1000)
        const days = Math.floor(totalSeconds / 86400)
        const hours = Math.floor((totalSeconds % 86400) / 3600)
        const minutes = Math.floor((totalSeconds % 3600) / 60)
        const seconds = totalSeconds % 60
        return `${days}d ${hours}h ${minutes}m ${seconds}s`
    }

    const toDateTimeLocal = (value?: string | null) => {
        if (!value) return ''
        const d = new Date(value)
        if (Number.isNaN(d.getTime())) return ''
        const pad = (n: number) => String(n).padStart(2, '0')
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    }

    const checkAuth = async () => {
        // Auth is now handled by useAuth() hook above.
        // This function is kept as a no-op for any remaining references.
    }

    // Fetch data based on active tab
    useEffect(() => {
        if (!currentUser) return
        
        switch (activeTab) {
            case 'clinics':
                fetchClinics()
                fetchPendingClinics()
                break
            case 'stats':
                fetchSystemStats()
                break
            case 'permissions':
                fetchRolePermissions()
                break
            case 'audit':
                fetchAuditLogs()
                break
            case 'releases':
                fetchReleases()
                break
            case 'sessions':
                fetchSessions()
                break
            case 'subscriptions':
                fetchSubClinics()
                break
            case 'coupons':
                fetchCoupons()
                break
            case 'categoryRules':
                fetchDefaultTemplateSummary()
                fetchCategoriesForCategoryRules()
                break
            case 'defaults':
                fetchDefaultTemplateSummary()
                break
            case 'dbrestore':
                fetchClinics()
                break
        }
    }, [activeTab, currentUser])

    const fetchClinics = async () => {
        setRefreshing(true)
        try {
            const response = await fetch('/api/super-admin/clinics')
            const data = await response.json()

            if (response.ok) {
                setClinics(data.clinics || [])
            } else {
                showError(data.error || 'Failed to fetch clinics')
            }
        } catch (err: any) {
            showError('Failed to load clinics')
        } finally {
            setRefreshing(false)
        }
    }

    const fetchPendingClinics = async () => {
        try {
            const response = await fetch('/api/super-admin/pending-clinics')
            const data = await response.json()

            if (response.ok) {
                setPendingClinics(data.clinics || [])
            }
        } catch (err: any) {
        }
    }

    const fetchSubClinics = async () => {
        setRefreshing(true)
        try {
            const response = await fetch('/api/super-admin/subscriptions')
            const data = await response.json()
            if (response.ok) {
                setSubClinics(data.clinics || [])
            } else {
                showError(data.error || 'Failed to fetch subscriptions')
            }
        } catch (err: any) {
            showError('Failed to load subscriptions')
        } finally {
            setRefreshing(false)
        }
    }

    const updateSubClinic = async (clinicId: string, patch: { subscriptionPlan?: string; subscriptionCycle?: string; subscriptionStatus?: string; trialActive?: boolean; trialEndsAt?: string }) => {
        setSubSaving(clinicId)
        try {
            const response = await fetch('/api/super-admin/subscriptions', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clinicId, ...patch }),
            })
            const data = await response.json()
            if (response.ok) {
                setSubClinics(prev => prev.map(c => c.id === clinicId ? { ...c, ...data.clinic } : c))
                fetchSubClinics()
                showSuccess('Subscription updated')
            } else {
                showError(data.error || 'Failed to update subscription')
            }
        } catch {
            showError('Failed to update subscription')
        } finally {
            setSubSaving(null)
        }
    }

    const fetchCoupons = async () => {
        try {
            const response = await fetch('/api/super-admin/coupons')
            const data = await response.json()
            if (response.ok) {
                setCoupons(data.coupons || [])
            }
        } catch {
            showError('Failed to load coupons')
        }
    }

    const createCoupon = async () => {
        if (!couponCode.trim()) {
            showError('Coupon code is required')
            return
        }
        try {
            const response = await fetch('/api/super-admin/coupons', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: couponCode,
                    discountType: couponType,
                    discountValue: couponValue,
                    appliesTo: couponContexts,
                    active: true,
                })
            })
            const data = await response.json()
            if (!response.ok) {
                showError(data.error || 'Failed to create coupon')
                return
            }
            setCouponCode('')
            setCouponValue(10)
            setCouponContexts(['register_plan'])
            setCouponContextPicker('register_plan')
            await fetchCoupons()
            showSuccess('Coupon created')
        } catch {
            showError('Failed to create coupon')
        }
    }

    const toggleCoupon = async (code: string, active: boolean) => {
        try {
            const response = await fetch('/api/super-admin/coupons', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, active })
            })
            const data = await response.json()
            if (!response.ok) {
                showError(data.error || 'Failed to update coupon')
                return
            }
            await fetchCoupons()
            showSuccess('Coupon updated')
        } catch {
            showError('Failed to update coupon')
        }
    }

    const removeCoupon = async (code: string) => {
        try {
            const response = await fetch('/api/super-admin/coupons', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code })
            })
            const data = await response.json()
            if (!response.ok) {
                showError(data.error || 'Failed to delete coupon')
                return
            }
            await fetchCoupons()
            showSuccess('Coupon deleted')
        } catch {
            showError('Failed to delete coupon')
        }
    }

    const fetchDefaultTemplateSummary = async () => {
        setRefreshing(true)
        try {
            const response = await fetch('/api/super-admin/default-templates')
            const data = await response.json()
            if (!response.ok) {
                showError(data.error || 'Failed to load default template summary')
                return
            }

            setDefaultTemplateSummary(data)
            setGlobalDefaults(data.globalDefaults || [])

            setSelectedDefaultPage((prev) => {
                const pages = Array.isArray(data.globalDefaults) ? data.globalDefaults : []
                if (pages.length === 0) return ''
                if (prev && pages.some((page: any) => page.page === prev)) return prev
                return pages[0].page
            })
        } catch {
            showError('Failed to load default template summary')
        } finally {
            setRefreshing(false)
        }
    }

    const fetchCategoriesForCategoryRules = async () => {
        setLoadingCategoryNames(true)
        try {
            const response = await fetch('/api/categories')
            const data = await response.json()

            if (!response.ok) {
                showError(data.error || 'Failed to load categories for category rules')
                return
            }

            const names = Array.isArray(data)
                ? data
                    .map((item: any) => String(item?.name || '').trim())
                    .filter((name: string) => Boolean(name))
                : []

            const uniqueNames = Array.from(new Set(names)).sort((a, b) => a.localeCompare(b))
            setCategoryNamesFromDb(uniqueNames)
        } catch {
            showError('Failed to load categories for category rules')
        } finally {
            setLoadingCategoryNames(false)
        }
    }

    const handleSelectGlobalDefaultPage = (page: string) => {
        setSelectedDefaultPage(page)
        const found = globalDefaults.find((g) => g.page === page)
        if (found) {
            setDefaultValues(found.values || {})
            setEditingDefaultValues(found.values || {})
        }
    }

    const updateGlobalPrescriptionKeywordLearning = async (enabled: boolean) => {
        const page = 'prescriptions'
        const existing = globalDefaults.find((g) => g.page === page)
        const nextValues = {
            ...(existing?.values || {}),
            allowKeywordLearning: enabled,
        }

        setSavingKeywordLearningToggle(true)
        try {
            const response = await fetch('/api/super-admin/default-templates', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    page,
                    label: existing?.label || 'Prescriptions',
                    values: nextValues,
                }),
            })
            const data = await response.json()
            if (!response.ok) {
                showError(data.error || 'Failed to update keyword learning setting')
                return
            }

            showSuccess(enabled ? 'Keyword learning enabled globally' : 'Keyword learning disabled globally')
            await fetchDefaultTemplateSummary()
        } catch {
            showError('Failed to update keyword learning setting')
        } finally {
            setSavingKeywordLearningToggle(false)
        }
    }

    const resetAllTreatmentKeywords = async () => {
        if (!confirm('Reset all treatment keywords across all clinics? This cannot be undone.')) return

        setResettingTreatmentKeywords(true)
        try {
            const response = await fetch('/api/super-admin/treatment-keywords', {
                method: 'DELETE',
            })
            const data = await response.json()
            if (!response.ok) {
                showError(data.error || 'Failed to reset treatment keywords')
                return
            }
            showSuccess(`Reset keywords for ${data.updated || 0} treatment plan(s)`)
        } catch {
            showError('Failed to reset treatment keywords')
        } finally {
            setResettingTreatmentKeywords(false)
        }
    }

    const uploadDefaultCsv = async () => {
        if (!defaultCsvFile) {
            showError('Choose a CSV file first')
            return
        }

        setDefaultUploadLoading(true)
        try {
            const csvText = await defaultCsvFile.text()
            const response = await fetch('/api/super-admin/default-templates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ templateType: defaultCsvType, csvText }),
            })
            const data = await response.json()
            if (!response.ok) {
                showError(data.error || 'Failed to upload CSV')
                return
            }

            showSuccess(data.message || 'Defaults imported successfully')
            setDefaultCsvFile(null)
            setDefaultCsvInputKey((prev) => prev + 1)
            fetchDefaultTemplateSummary()
        } catch {
            showError('Failed to upload CSV defaults')
        } finally {
            setDefaultUploadLoading(false)
        }
    }

    const saveGlobalDefaultValues = async () => {
        if (!selectedDefaultPage) {
            showError('Select a page to edit')
            return
        }

        const selected = globalDefaults.find((g) => g.page === selectedDefaultPage)
        setSavingGlobalDefault(true)
        try {
            const response = await fetch('/api/super-admin/default-templates', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    page: selectedDefaultPage,
                    label: selected?.label || selectedDefaultPage,
                    values: editingDefaultValues,
                }),
            })
            const data = await response.json()
            if (!response.ok) {
                showError(data.error || 'Failed to save global defaults')
                return
            }

            showSuccess(data.message || 'Global defaults updated')
            fetchDefaultTemplateSummary()
        } catch {
            showError('Failed to save global defaults')
        } finally {
            setSavingGlobalDefault(false)
        }
    }

    const updateImportPulsePolicy = async (enabled: boolean) => {
        const pagesToUpdate = ['products', 'treatments']
            .map((page) => globalDefaults.find((item) => item.page === page))
            .filter(Boolean) as GlobalDefaultPage[]

        if (pagesToUpdate.length === 0) {
            showError('Products and treatments defaults are not available yet')
            return
        }

        setSavingImportPulseToggle(true)
        try {
            for (const pageConfig of pagesToUpdate) {
                const response = await fetch('/api/super-admin/default-templates', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        page: pageConfig.page,
                        label: pageConfig.label,
                        values: {
                            ...(pageConfig.values || {}),
                            showImportPulseForNewDefaults: enabled,
                        },
                    }),
                })

                const data = await response.json()
                if (!response.ok) {
                    showError(data.error || `Failed to update import pulse policy for ${pageConfig.page}`)
                    return
                }
            }

            showSuccess(enabled ? 'Import pulse animation enabled for products and treatments' : 'Import pulse animation disabled for products and treatments')
            await fetchDefaultTemplateSummary()
        } catch {
            showError('Failed to update import pulse policy')
        } finally {
            setSavingImportPulseToggle(false)
        }
    }

    const updateCategoryFieldRule = (categoryKey: string, field: CategoryFieldKey, enabled: boolean) => {
        const normalizedKey = normalizeCategoryRuleKey(categoryKey)
        if (!normalizedKey) return

        setCategoryFieldRulesEditor((prev) => {
            const existing = getCategoryFieldVisibility(prev, normalizedKey)
            return {
                ...prev,
                [normalizedKey]: {
                    ...existing,
                    [field]: enabled,
                },
            }
        })
    }

    const setCategoryRuleAllFields = (categoryKey: string, enabled: boolean) => {
        const normalizedKey = normalizeCategoryRuleKey(categoryKey)
        if (!normalizedKey) return

        setCategoryFieldRulesEditor((prev) => {
            const existing = getCategoryFieldVisibility(prev, normalizedKey)
            const next = { ...existing }
            CATEGORY_RULE_FIELD_ORDER.forEach((field) => {
                next[field] = enabled
            })

            return {
                ...prev,
                [normalizedKey]: next,
            }
        })
    }

    const resetCategoryRuleRow = (categoryKey: string) => {
        const normalizedKey = normalizeCategoryRuleKey(categoryKey)
        if (!normalizedKey) return

        setCategoryFieldRulesEditor((prev) => ({
            ...prev,
            [normalizedKey]: getCategoryFieldVisibility(savedCategoryFieldRules, normalizedKey),
        }))
    }

    const saveCategoryFieldRules = async () => {
        const normalizedRules = normalizeCategoryFieldRules(categoryFieldRulesEditor)
        const dynamicOnlyRules: CategoryFieldRulesMap = {
            [DEFAULT_CATEGORY_RULE_KEY]: getCategoryFieldVisibility(normalizedRules, DEFAULT_CATEGORY_RULE_KEY),
        }

        categoryRuleRows.forEach((ruleKey) => {
            dynamicOnlyRules[ruleKey] = getCategoryFieldVisibility(normalizedRules, ruleKey)
        })

        const pagesToUpdate = [
            {
                page: 'prescriptions',
                label: prescriptionsGlobalDefault?.label || 'Prescriptions',
                values: {
                    ...(prescriptionsGlobalDefault?.values || {}),
                    categoryFieldRules: dynamicOnlyRules,
                },
            },
            {
                page: 'treatments',
                label: treatmentsGlobalDefault?.label || 'Treatment Plans',
                values: {
                    ...(treatmentsGlobalDefault?.values || {}),
                    categoryFieldRules: dynamicOnlyRules,
                },
            },
        ]

        setSavingCategoryFieldRules(true)
        try {
            for (const item of pagesToUpdate) {
                const response = await fetch('/api/super-admin/default-templates', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(item),
                })
                const data = await response.json()

                if (!response.ok) {
                    showError(data.error || `Failed to save category rules for ${item.page}`)
                    return
                }
            }

            showSuccess('Category field rules saved for prescriptions and treatments')
            await fetchDefaultTemplateSummary()
        } catch {
            showError('Failed to save category field rules')
        } finally {
            setSavingCategoryFieldRules(false)
        }
    }

    const restoreDatabaseFromDump = async () => {
        if (!restoreFile) {
            showError('Select a .dump or .sql file first')
            return
        }

        if (restoreScope === 'clinic' && !selectedRestoreClinicId) {
            showError('Select a clinic card to restore data for that clinic only')
            return
        }

        if (restoreConfirmText.trim().toUpperCase() !== 'RESTORE') {
            showError('Type RESTORE to confirm database restore')
            return
        }

        setRestoreLoading(true)
        setRestoreOutput('')
        setRestoreJob(null)
        setShowRestoreProgressModal(true)
        setShowOnlyChangedRestoreTables(false)
        try {
            const formData = new FormData()
            formData.append('dumpFile', restoreFile)
            formData.append('confirmText', restoreConfirmText)
            formData.append('restoreScope', restoreScope)
            if (restoreScope === 'clinic') {
                formData.append('clinicId', selectedRestoreClinicId)
            }

            const response = await fetch('/api/super-admin/db-restore', {
                method: 'POST',
                body: formData,
            })
            const data = await response.json()

            if (!response.ok) {
                const detail = data.details || data.error || 'Restore failed'
                setRestoreOutput(String(detail))
                showError(data.error || 'Database restore failed to start')
                setRestoreLoading(false)
                return
            }

            const startedJobId = String(data.jobId || '')
            if (!startedJobId) {
                setRestoreLoading(false)
                showError('Restore started but no job id was returned')
                return
            }

            setRestoreOutput(data.message || 'Restore job started')
            setRestoreJobId(startedJobId)
        } catch {
            showError('Database restore failed')
            setRestoreLoading(false)
        }
    }

    const fetchClinicUsers = async (clinicId: string) => {
        try {
            const response = await fetch(`/api/super-admin/users?clinicId=${clinicId}`)
            const data = await response.json()

            if (response.ok) {
                setClinicUsers(prev => ({ ...prev, [clinicId]: data.users || [] }))
            }
        } catch (err: any) {
        }
    }

    const fetchSystemStats = async () => {
        setRefreshing(true)
        try {
            const response = await fetch('/api/super-admin/stats')
            const data = await response.json()

            if (response.ok) {
                setSystemStats(data.stats)
            } else {
                showError(data.error || 'Failed to fetch system statistics')
            }
        } catch (err: any) {
            showError('Failed to load system statistics')
        } finally {
            setRefreshing(false)
        }
    }

    const fetchRolePermissions = async () => {
        setRefreshing(true)
        try {
            const response = await fetch('/api/super-admin/role-permissions')
            const data = await response.json()

            if (response.ok) {
                setRolePermissions(data.permissions || {})
                setAvailablePages(data.availablePages || [])
            } else {
                showError(data.error || 'Failed to fetch role permissions')
            }
        } catch (err: any) {
            showError('Failed to load role permissions')
        } finally {
            setRefreshing(false)
        }
    }

    const fetchAuditLogs = async () => {
        setRefreshing(true)
        try {
            const params = new URLSearchParams()
            if (auditFilter !== 'all') params.append('category', auditFilter)
            if (auditSearchTerm) params.append('search', auditSearchTerm)
            if (auditSeverityFilter !== 'all') params.append('severity', auditSeverityFilter)

            const response = await fetch(`/api/super-admin/audit-logs?${params.toString()}`)
            const data = await response.json()

            if (response.ok) {
                setAuditLogs(data.logs || [])
            } else {
                showError(data.error || 'Failed to fetch audit logs')
            }
        } catch (err: any) {
            showError('Failed to load audit logs')
        } finally {
            setRefreshing(false)
        }
    }

    // ===== Release Manager Functions =====
    const fetchReleases = async () => {
        setRefreshing(true)
        try {
            const res = await fetch('/api/releases?all=true')
            if (res.ok) {
                const data = await res.json()
                setReleases(data)
            }
        } catch (error) {
        } finally {
            setRefreshing(false)
        }
    }

    const fetchSessions = async () => {
        setSessionsLoading(true)
        try {
            const res = await fetch('/api/super-admin/sessions')
            const data = await res.json()
            if (res.ok) {
                setSessionGroups(data.grouped || [])
                setTotalActiveSessions(data.totalActive || 0)
            } else {
                showError(data.error || 'Failed to fetch sessions')
            }
        } catch {
            showError('Failed to fetch sessions')
        } finally {
            setSessionsLoading(false)
        }
    }

    const clearSessions = async (scope: 'all' | 'clinic' | 'session', clinicInternalId?: string, sessionId?: number) => {
        const label = scope === 'all' ? 'ALL sessions everywhere' : scope === 'clinic' ? 'all sessions for this clinic' : 'this session'
        if (!confirm(`Clear ${label}? Affected users will be logged out on their next request.`)) return
        setClearingScope(scope === 'session' ? `session-${sessionId}` : scope === 'clinic' ? `clinic-${clinicInternalId}` : 'all')
        try {
            const res = await fetch('/api/super-admin/sessions', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scope, clinicInternalId, sessionId }),
            })
            const data = await res.json()
            if (res.ok) {
                showSuccess(`Cleared ${data.cleared} session(s)`)
                fetchSessions()
            } else {
                showError(data.error || 'Failed to clear sessions')
            }
        } catch {
            showError('Failed to clear sessions')
        } finally {
            setClearingScope(null)
        }
    }

    const resetReleaseForm = () => {
        setReleaseVersion('')
        setReleaseTitle('')
        setReleaseDescription('')
        setReleaseType('improvement')
        setReleasePlatforms(['all'])
        setReleaseFeatures([''])
        setEditingRelease(null)
        setShowReleaseForm(false)
    }

    const openEditReleaseForm = (release: Release) => {
        setEditingRelease(release)
        setReleaseVersion(release.version)
        setReleaseTitle(release.title)
        setReleaseDescription(release.description || '')
        setReleaseType(release.releaseType)
        setReleasePlatforms(release.platforms && release.platforms.length > 0 ? release.platforms : ['all'])
        const feats = Array.isArray(release.features) ? release.features : []
        setReleaseFeatures(feats.length > 0 ? feats as string[] : [''])
        setShowReleaseForm(true)
    }

    const openNewReleaseForm = () => {
        resetReleaseForm()
        setShowReleaseForm(true)
    }

    const addReleaseFeature = () => setReleaseFeatures([...releaseFeatures, ''])

    const removeReleaseFeature = (index: number) => {
        if (releaseFeatures.length <= 1) return
        setReleaseFeatures(releaseFeatures.filter((_, i) => i !== index))
    }

    const updateReleaseFeature = (index: number, value: string) => {
        const updated = [...releaseFeatures]
        updated[index] = value
        setReleaseFeatures(updated)
    }

    const handleReleaseSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!releaseVersion || !releaseTitle) {
            showError('Version and title are required')
            return
        }

        const versionRegex = /^\d+\.\d+\.\d+$/
        if (!versionRegex.test(releaseVersion)) {
            showError('Version must follow SemVer format (e.g., 1.2.3)')
            return
        }

        const cleanedFeatures = releaseFeatures.filter(f => f.trim() !== '')

        setSavingRelease(true)
        try {
            const body = {
                ...(editingRelease ? { id: editingRelease.id } : {}),
                version: releaseVersion,
                title: releaseTitle,
                description: releaseDescription || null,
                features: cleanedFeatures,
                releaseType,
                platforms: releasePlatforms
            }

            const res = await fetch('/api/releases', {
                method: editingRelease ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })

            if (res.ok) {
                showSuccess(editingRelease ? 'Release updated successfully!' : 'Release created successfully!')
                resetReleaseForm()
                fetchReleases()
            } else {
                const err = await res.json()
                showError(err.error || 'Failed to save release')
            }
        } catch (error) {
            showError('Failed to save release')
        } finally {
            setSavingRelease(false)
        }
    }

    const toggleReleaseActive = async (release: Release) => {
        try {
            const res = await fetch('/api/releases', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: release.id, isActive: !release.isActive })
            })
            if (res.ok) {
                showSuccess(`Release ${release.isActive ? 'deactivated' : 'activated'}`)
                fetchReleases()
            }
        } catch (error) {
            showError('Failed to update release')
        }
    }

    const handleDeleteRelease = async () => {
        if (!deleteReleaseId) return
        try {
            const res = await fetch('/api/releases', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: deleteReleaseId })
            })
            if (res.ok) {
                showSuccess('Release deleted')
                setDeleteReleaseId(null)
                setReleaseDeleteStep(1)
                fetchReleases()
            }
        } catch (error) {
            showError('Failed to delete release')
        }
    }

    const formatReleaseDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const approveClinic = async (clinicId: string) => {
        try {
            const response = await fetch('/api/clinic/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clinicId })
            })

            const data = await response.json()

            if (response.ok) {
                showSuccess('Clinic approved successfully')
                fetchClinics()
                fetchPendingClinics()
            } else {
                showError(data.error || 'Failed to approve clinic')
            }
        } catch (err: any) {
            showError('Failed to approve clinic')
        }
    }

    const handleClinicClick = (clinicId: string) => {
        if (expandedClinicId === clinicId) {
            setExpandedClinicId(null)
        } else {
            setExpandedClinicId(clinicId)
            if (!clinicUsers[clinicId]) {
                fetchClinicUsers(clinicId)
            }
            // Fetch locations if not cached
            if (!clinicLocations[clinicId]) {
                const clinic = clinics.find(c => c.id === clinicId)
                if (clinic) {
                    fetch(`/api/clinic/locations?clinicId=${clinic.clinicId}`)
                        .then(r => r.json())
                        .then(data => {
                            if (data.locations) {
                                setClinicLocations(prev => ({ ...prev, [clinicId]: data.locations }))
                            }
                        })
                        .catch(() => {})
                }
            }
        }
    }

    const handleThemeChange = async (clinicId: string, themeGradient: string) => {
        try {
            const res = await fetch('/api/super-admin/clinic-theme', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clinicId, themeGradient })
            })
            if (res.ok) {
                setClinics(prev => prev.map(c => c.id === clinicId ? { ...c, themeGradient } : c))
                showSuccess(`Theme updated to ${themeGradient}`)
            } else {
                const data = await res.json()
                showError(data.error || 'Failed to update theme')
            }
        } catch {
            showError('Failed to update theme')
        }
    }

    const handleEditAccessCode = (clinic: Clinic, e: React.MouseEvent) => {
        e.stopPropagation()
        setSelectedClinic(clinic)
        setNewAccessCode(clinic.clinicId)
        setShowEditAccessCodeModal(true)
    }

    const updateClinicAccessCode = async () => {
        if (!selectedClinic || !newAccessCode || newAccessCode.length !== 6) {
            showError('Access code must be exactly 6 characters')
            return
        }

        try {
            const response = await fetch('/api/super-admin/update-clinic-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clinicId: selectedClinic.id, newCode: newAccessCode })
            })

            const data = await response.json()

            if (response.ok) {
                showSuccess('Clinic access code updated successfully')
                setShowEditAccessCodeModal(false)
                setSelectedClinic(null)
                setNewAccessCode('')
                fetchClinics()
            } else {
                showError(data.error || 'Failed to update access code')
            }
        } catch (err: any) {
            showError('Failed to update access code')
        }
    }

    const handleResetPassword = (user: User, e: React.MouseEvent) => {
        e.stopPropagation()
        setSelectedUser(user)
        setNewPassword('')
        setShowResetPasswordModal(true)
    }

    const resetUserPassword = async () => {
        if (!selectedUser || !newPassword || newPassword.length < 6) {
            showError('Password must be at least 6 characters')
            return
        }

        try {
            const response = await fetch('/api/super-admin/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: selectedUser.id, newPassword })
            })

            const data = await response.json()

            if (response.ok) {
                showSuccess('Password reset successfully')
                setShowResetPasswordModal(false)
                setSelectedUser(null)
                setNewPassword('')
            } else {
                showError(data.error || 'Failed to reset password')
            }
        } catch (err: any) {
            showError('Failed to reset password')
        }
    }

    const handleDeleteUser = (user: User, e: React.MouseEvent) => {
        e.stopPropagation()
        setSelectedUser(user)
        setDeleteConfirmText('')
        setShowDeleteUserModal(true)
    }

    const deleteUser = async () => {
        if (!selectedUser || deleteConfirmText !== 'DELETE') {
            showError('Please type DELETE to confirm')
            return
        }

        try {
            const response = await fetch('/api/super-admin/delete-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: selectedUser.id })
            })

            const data = await response.json()

            if (response.ok) {
                showSuccess('User deleted successfully')
                setShowDeleteUserModal(false)
                setSelectedUser(null)
                setDeleteConfirmText('')
                // Refresh clinic users
                if (selectedUser.clinic?.clinicId) {
                    const clinic = clinics.find(c => c.clinicId === selectedUser.clinic?.clinicId)
                    if (clinic) fetchClinicUsers(clinic.id)
                }
            } else {
                showError(data.error || 'Failed to delete user')
            }
        } catch (err: any) {
            showError('Failed to delete user')
        }
    }

    const handleChangeRole = (user: User, e: React.MouseEvent) => {
        e.stopPropagation()
        setSelectedUser(user)
        setNewRole(user.role)
        setShowChangeRoleModal(true)
    }

    const changeUserRole = async () => {
        if (!selectedUser || !newRole) {
            showError('Please select a role')
            return
        }

        try {
            const response = await fetch('/api/super-admin/change-role', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: selectedUser.id, newRole })
            })

            const data = await response.json()

            if (response.ok) {
                showSuccess('User role changed successfully')
                setShowChangeRoleModal(false)
                setSelectedUser(null)
                setNewRole('')
                // Refresh clinic users
                if (selectedUser.clinic?.clinicId) {
                    const clinic = clinics.find(c => c.clinicId === selectedUser.clinic?.clinicId)
                    if (clinic) fetchClinicUsers(clinic.id)
                }
            } else {
                showError(data.error || 'Failed to change role')
            }
        } catch (err: any) {
            showError('Failed to change role')
        }
    }

    const updatePagePermission = async (role: string, page: string, field: 'canAccess' | 'canWrite', value: boolean) => {
        try {
            const response = await fetch('/api/super-admin/update-page-permission', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role, page, field, value })
            })

            const data = await response.json()

            if (response.ok) {
                showSuccess('Permission updated successfully')
                fetchRolePermissions()
            } else {
                showError(data.error || 'Failed to update permission')
            }
        } catch (err: any) {
            showError('Failed to update permission')
        }
    }

    const filteredClinics = clinics.filter(clinic =>
        clinic.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        clinic.clinicId.includes(searchTerm) ||
        clinic.email.toLowerCase().includes(searchTerm.toLowerCase())
    )

    const restoreTableSummaries = restoreJob?.result?.tableSummaries || []
    const restoreProcessedTables = restoreTableSummaries.filter((table) => table.status && table.status !== 'pending').length
    const restoreChangedTables = restoreTableSummaries.filter((table) => table.insertedRows > 0).length
    const restoreErrorTables = restoreTableSummaries.filter((table) => table.errors > 0).length
    const restoreSkippedTables = restoreTableSummaries.filter((table) => table.status === 'skipped').length
    const restorePreviewRows = showOnlyChangedRestoreTables
        ? restoreTableSummaries.filter((table) => table.insertedRows > 0 || table.errors > 0)
        : restoreTableSummaries

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen">
                <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-purple-600 border-r-transparent mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400 font-medium">Loading super admin dashboard...</p>
            </div>
        )
    }

    if (!currentUser || currentUser.role !== 'super_admin') {
        return null
    }

    return (
        <>
            <ToastNotification toasts={toasts} removeToast={removeToast} />
            
            {/* Full Width Header with Tabs */}
            <div className="sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-purple-200/30 dark:border-purple-700/30">
                <div className="container mx-auto px-3 sm:px-4 py-3 sm:py-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-3 sm:mb-4">
                        <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                            Super Admin Dashboard
                        </h1>
                        <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                            <button
                                onClick={() => router.push('/super-admin-profile')}
                                title="View Profile"
                                className="flex items-center gap-2 px-2 sm:px-3 py-1.5 sm:py-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex-1 sm:flex-none hover:bg-purple-200 dark:hover:bg-purple-800/50 transition-colors"
                            >
                                {currentUser?.profileImage ? (
                                    <img src={currentUser.profileImage} alt="avatar" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                                ) : (
                                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse flex-shrink-0"></div>
                                )}
                                <span className="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{currentUser.name}</span>
                            </button>
                            <button
                                onClick={() => router.push('/super-admin-profile')}
                                title="Profile & Settings"
                                className="p-1.5 sm:p-2 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors flex-shrink-0"
                            >
                                <svg className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </button>
                        </div>
                    </div>
                    
                    {/* Navigation Tabs */}
                    <ThemedScrollArea axis="both" className="-mx-3 sm:mx-0 px-3 sm:px-0 pb-1">
                        <div className="flex gap-1.5 sm:gap-2 min-w-max">
                            {[
                                { id: 'clinics', label: 'Clinics', icon: '🏥' },
                                { id: 'stats', label: 'Statistics', icon: '📊' },
                                { id: 'permissions', label: 'Permissions', icon: '🔐' },
                                { id: 'audit', label: 'Audit Logs', icon: '📝' },
                                { id: 'releases', label: 'Releases', icon: '🚀' },
                                { id: 'sessions', label: 'Sessions', icon: '🔑' },
                                { id: 'subscriptions', label: 'Subscriptions', icon: '💳' },
                                { id: 'coupons', label: 'Coupons', icon: '🏷️' },
                                { id: 'categoryRules', label: 'Category Fields', icon: '🧩' },
                                { id: 'defaults', label: 'Template Defaults', icon: '📁' },
                                { id: 'dbrestore', label: 'DB Restore', icon: '🛠️' }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg transition-all duration-200 whitespace-nowrap font-medium text-xs sm:text-base flex-shrink-0 ${
                                        activeTab === tab.id
                                            ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-lg shadow-purple-500/30'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    <span className="text-base sm:text-lg">{tab.icon}</span>
                                    <span>{tab.label}</span>
                                </button>
                            ))}
                        </div>
                    </ThemedScrollArea>
                </div>
            </div>

            {/* Main Content */}
            <div className="min-h-screen">
                <div className="container mx-auto px-4 py-8">
                    
                    {/* Clinics Tab */}
                    {activeTab === 'clinics' && (
                        <div className="space-y-6">
                            {/* Search Bar */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                                <div className="flex-1 relative">
                                    <svg className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    <input
                                        type="text"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        placeholder="Search clinics by name, ID, or email..."
                                        className="w-full pl-10 sm:pl-12 pr-4 py-3 sm:py-4 border border-purple-200 dark:border-purple-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-800 dark:text-white shadow-lg text-sm sm:text-base"
                                    />
                                </div>
                                <button
                                    onClick={() => { fetchClinics(); fetchPendingClinics(); }}
                                    disabled={refreshing}
                                    className="bg-gradient-to-r from-purple-500 to-purple-600 text-white px-4 sm:px-6 py-3 sm:py-4 rounded-xl hover:shadow-lg shadow-purple-500/30 transition-all disabled:opacity-50 flex items-center justify-center gap-2 font-medium text-sm sm:text-base"
                                >
                                    <svg className={`w-4 h-4 sm:w-5 sm:h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    <span>Refresh</span>
                                </button>
                            </div>

                            {/* Pending Clinics */}
                            {pendingClinics.length > 0 && (
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                        <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                                        Pending Approval ({pendingClinics.length})
                                    </h2>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
                                        {pendingClinics.map(clinic => (
                                            <div key={clinic.id} className="group relative bg-white dark:bg-gray-800 rounded-2xl p-4 sm:p-6 shadow-lg hover:shadow-2xl transition-all duration-300 border-2 border-yellow-200 dark:border-yellow-700">
                                                <div className="absolute top-3 sm:top-4 right-3 sm:right-4">
                                                    <span className="px-2 sm:px-3 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                                                        Pending
                                                    </span>
                                                </div>
                                                <div className="mb-4">
                                                    <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl flex items-center justify-center mb-3 sm:mb-4">
                                                        <span className="text-2xl sm:text-3xl">🏥</span>
                                                    </div>
                                                    <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-2 truncate pr-16">{clinic.name}</h3>
                                                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-mono mb-1">{clinic.clinicId}</p>
                                                    <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">{clinic.email}</p>
                                                </div>
                                                <button
                                                    onClick={() => approveClinic(clinic.id)}
                                                    className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white px-4 py-2.5 sm:py-3 rounded-xl font-medium transition-all shadow-lg hover:shadow-xl text-sm"
                                                >
                                                    Approve Clinic
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Active Clinics */}
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                    Active Clinics ({filteredClinics.filter(c => c.status === 'active').length})
                                </h2>
                                {filteredClinics.filter(c => c.status === 'active').length === 0 ? (
                                    <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl shadow-lg">
                                        <div className="text-6xl mb-4">🔍</div>
                                        <p className="text-gray-500 dark:text-gray-400 text-lg">No active clinics found</p>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        {filteredClinics.filter(c => c.status === 'active').map(clinic => (
                                            <div key={clinic.id} className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden border border-gray-200 dark:border-gray-700">
                                                {/* Clinic Header Card */}
                                                <div 
                                                    className={`p-4 sm:p-6 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                                                        expandedClinicId === clinic.id ? 'bg-purple-50 dark:bg-purple-900/20' : ''
                                                    }`}
                                                    onClick={() => handleClinicClick(clinic.id)}
                                                >
                                                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                                        {/* Clinic Info */}
                                                        <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                                                            <div 
                                                                className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform"
                                                                style={{ background: `linear-gradient(135deg, ${(GRADIENT_PRESETS.find(p => p.key === (clinic.themeGradient || 'blue')) || GRADIENT_PRESETS[0]).from}, ${(GRADIENT_PRESETS.find(p => p.key === (clinic.themeGradient || 'blue')) || GRADIENT_PRESETS[0]).to})` }}
                                                            >
                                                                <span className="text-2xl sm:text-3xl">🏥</span>
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white mb-1 truncate">
                                                                    {clinic.name}
                                                                </h3>
                                                                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 font-mono font-semibold mb-1">
                                                                    {clinic.clinicId}
                                                                </p>
                                                                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate mb-2">
                                                                    {clinic.email}
                                                                </p>
                                                                <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm">
                                                                    <span className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                                                                        </svg>
                                                                        {clinic._count?.users || 0} Users
                                                                    </span>
                                                                    <span className="flex items-center gap-1 text-gray-400 dark:text-gray-500">
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                                        </svg>
                                                                        {new Date(clinic.createdAt).toLocaleDateString()}
                                                                    </span>
                                                                </div>
                                                                {/* Theme Gradient Circles */}
                                                                <div className="flex items-center gap-2 mt-2">
                                                                    <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">Theme:</span>
                                                                    {GRADIENT_PRESETS.map(preset => (
                                                                        <button
                                                                            key={preset.key}
                                                                            onClick={(e) => {
                                                                                e.stopPropagation()
                                                                                handleThemeChange(clinic.id, preset.key)
                                                                            }}
                                                                            className={`w-7 h-7 rounded-full transition-all duration-200 hover:scale-110 border-2 ${
                                                                                (clinic.themeGradient || 'blue') === preset.key
                                                                                    ? 'border-gray-900 dark:border-white scale-110 shadow-lg'
                                                                                    : 'border-transparent hover:border-gray-300 dark:hover:border-gray-500'
                                                                            }`}
                                                                            style={{ background: `linear-gradient(135deg, ${preset.from}, ${preset.to})` }}
                                                                            title={preset.label}
                                                                        />
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        
                                                        {/* Actions */}
                                                        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 w-full sm:w-auto">
                                                            <button
                                                                onClick={(e) => handleEditAccessCode(clinic, e)}
                                                                className="flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors text-purple-700 dark:text-purple-300 font-medium text-xs sm:text-sm flex items-center justify-center gap-2"
                                                                title="Edit Access Code"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                                </svg>
                                                                <span className="hidden sm:inline">Edit Code</span>
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); handleClinicClick(clinic.id); }}
                                                                className={`flex-1 sm:flex-none px-3 sm:px-4 py-2 rounded-lg transition-all font-medium text-xs sm:text-sm flex items-center justify-center gap-2 ${
                                                                    expandedClinicId === clinic.id
                                                                        ? 'bg-purple-600 hover:bg-purple-700 text-white'
                                                                        : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'
                                                                }`}
                                                            >
                                                                <span>{expandedClinicId === clinic.id ? 'Hide' : 'Show'} Users</span>
                                                                <svg className={`w-4 h-4 transition-transform duration-200 ${expandedClinicId === clinic.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Expanded User List */}
                                                {expandedClinicId === clinic.id && (
                                                    <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                                                        {/* ===== Locations Section ===== */}
                                                        <div className="p-4 sm:p-6 border-b border-gray-200 dark:border-gray-700">
                                                            <div className="flex items-center justify-between mb-3">
                                                                <h4 className="text-sm font-bold text-gray-800 dark:text-white flex items-center gap-2">
                                                                    <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                    </svg>
                                                                    Geo Locations ({(clinicLocations[clinic.id] || []).length})
                                                                </h4>
                                                            </div>

                                                            {(clinicLocations[clinic.id] || []).length === 0 ? (
                                                                <p className="text-xs text-amber-600 dark:text-amber-400 italic">No locations — geo-restriction disabled for this clinic.</p>
                                                            ) : (
                                                                <div className="space-y-2 mb-3">
                                                                    {(clinicLocations[clinic.id] || []).map(loc => (
                                                                        <div key={loc.id} className="flex items-start gap-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-2">
                                                                            <div className="flex-1 min-w-0">
                                                                                <p className="text-xs font-medium text-gray-800 dark:text-white truncate">{loc.name || `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`}</p>
                                                                                <a href={`https://www.google.com/maps?q=${loc.lat},${loc.lng}`} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline">
                                                                                    {loc.lat.toFixed(6)}, {loc.lng.toFixed(6)}
                                                                                </a>
                                                                                <span className="ml-2 text-xs text-gray-400">• {loc.radius}m radius</span>
                                                                            </div>
                                                                            <button
                                                                                onClick={async () => {
                                                                                    if (!confirm('Remove this location?')) return
                                                                                    const res = await fetch(`/api/clinic/locations?id=${loc.id}`, { method: 'DELETE' })
                                                                                    if (res.ok) {
                                                                                        setClinicLocations(prev => ({ ...prev, [clinic.id]: (prev[clinic.id] || []).filter(l => l.id !== loc.id) }))
                                                                                        showSuccess('Location removed')
                                                                                    }
                                                                                }}
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

                                                            {/* Add Location */}
                                                            <div className="flex items-center gap-3 flex-wrap">
                                                                <div className="flex items-center gap-2">
                                                                    <label className="text-xs text-gray-500">Radius:</label>
                                                                    <input
                                                                        type="number" min={50} max={2000} step={50}
                                                                        value={newLocationRadius[clinic.id] || 300}
                                                                        onChange={e => setNewLocationRadius(prev => ({ ...prev, [clinic.id]: parseInt(e.target.value) }))}
                                                                        className="w-20 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                                                                    />
                                                                    <span className="text-xs text-gray-400">m</span>
                                                                </div>
                                                                <button
                                                                    onClick={async () => {
                                                                        if (!navigator.geolocation) { showError('Geolocation not available'); return }
                                                                        setLocationDetecting(prev => ({ ...prev, [clinic.id]: true }))
                                                                        navigator.geolocation.getCurrentPosition(
                                                                            async (pos) => {
                                                                                const lat = pos.coords.latitude; const lng = pos.coords.longitude
                                                                                let name = `${lat.toFixed(5)}, ${lng.toFixed(5)}`
                                                                                try {
                                                                                    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, { headers: { 'Accept-Language': 'en' } })
                                                                                    const d = await r.json(); name = d.display_name || name
                                                                                } catch {}
                                                                                const res = await fetch('/api/clinic/locations', {
                                                                                    method: 'POST',
                                                                                    headers: { 'Content-Type': 'application/json' },
                                                                                    body: JSON.stringify({ clinicId: clinic.clinicId, lat, lng, name, radius: newLocationRadius[clinic.id] || 300 })
                                                                                })
                                                                                if (res.ok) {
                                                                                    const data = await res.json()
                                                                                    setClinicLocations(prev => ({ ...prev, [clinic.id]: [...(prev[clinic.id] || []), data.location] }))
                                                                                    showSuccess('Location added')
                                                                                } else { showError('Failed to add location') }
                                                                                setLocationDetecting(prev => ({ ...prev, [clinic.id]: false }))
                                                                            },
                                                                            () => { showError('Location permission denied'); setLocationDetecting(prev => ({ ...prev, [clinic.id]: false })) },
                                                                            { enableHighAccuracy: true, timeout: 10000 }
                                                                        )
                                                                    }}
                                                                    disabled={locationDetecting[clinic.id]}
                                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60"
                                                                >
                                                                    {locationDetecting[clinic.id] ? (
                                                                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                                                    ) : (
                                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                                                    )}
                                                                    Add My Current Location
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {!clinicUsers[clinic.id] ? (
                                                            <div className="p-8 text-center">
                                                                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-purple-600 border-r-transparent"></div>
                                                                <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Loading users...</p>
                                                            </div>
                                                        ) : clinicUsers[clinic.id].length === 0 ? (
                                                            <div className="p-8 text-center">
                                                                <svg className="w-12 h-12 mx-auto text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                                                </svg>
                                                                <p className="text-gray-500 dark:text-gray-400">No users found</p>
                                                            </div>
                                                        ) : (
                                                            <div className="p-4 sm:p-6">
                                                                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
                                                                    {clinicUsers[clinic.id].map(user => (
                                                                        <div 
                                                                            key={user.id} 
                                                                            className="bg-white dark:bg-gray-800 rounded-xl p-3 sm:p-4 shadow-sm hover:shadow-md transition-all border border-gray-200 dark:border-gray-700"
                                                                        >
                                                                            <div className="flex items-start gap-3 mb-3">
                                                                                <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-purple-400 to-blue-400 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                                                                                    {user.name.charAt(0).toUpperCase()}
                                                                                </div>
                                                                                <div className="flex-1 min-w-0">
                                                                                    <h4 className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                                                                                        {user.name}
                                                                                    </h4>
                                                                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                                                        {user.email}
                                                                                    </p>
                                                                                    <span className="inline-block mt-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 capitalize">
                                                                                        {user.role}
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                            <div className="flex gap-2">
                                                                                <button
                                                                                    onClick={(e) => handleResetPassword(user, e)}
                                                                                    className="flex-1 bg-blue-500 hover:bg-blue-600 text-white px-2 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1"
                                                                                    title="Reset Password"
                                                                                >
                                                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                                                                    </svg>
                                                                                    <span>Reset</span>
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => handleChangeRole(user, e)}
                                                                                    className="flex-1 bg-purple-500 hover:bg-purple-600 text-white px-2 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1"
                                                                                    title="Change Role"
                                                                                >
                                                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                                                    </svg>
                                                                                    <span>Role</span>
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => handleDeleteUser(user, e)}
                                                                                    className="flex-1 bg-red-500 hover:bg-red-600 text-white px-2 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1"
                                                                                    title="Delete User"
                                                                                >
                                                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                                    </svg>
                                                                                    <span>Delete</span>
                                                                                </button>
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Statistics Tab - Continuing in next message due to length */}
                    {activeTab === 'stats' && (
                        <div>
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">System Statistics</h2>
                                <button
                                    onClick={fetchSystemStats}
                                    disabled={refreshing}
                                    className="bg-gradient-to-r from-purple-500 to-purple-600 text-white px-6 py-3 rounded-xl hover:shadow-lg shadow-purple-500/30 transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                    <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                </button>
                            </div>

                            {systemStats && (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                                    {[
                                        { label: 'Total Clinics', value: systemStats.totalClinics, icon: '🏥', color: 'from-purple-500 to-purple-600' },
                                        { label: 'Active Clinics', value: systemStats.activeClinics, icon: '✅', color: 'from-green-500 to-green-600' },
                                        { label: 'Pending Clinics', value: systemStats.pendingClinics, icon: '⏳', color: 'from-yellow-500 to-yellow-600' },
                                        { label: 'Total Users', value: systemStats.totalUsers, icon: '👥', color: 'from-blue-500 to-blue-600' },
                                        { label: 'Total Patients', value: systemStats.totalPatients, icon: '🏥', color: 'from-indigo-500 to-indigo-600' },
                                        { label: 'Total Prescriptions', value: systemStats.totalPrescriptions, icon: '💊', color: 'from-pink-500 to-pink-600' },
                                        { label: 'Total Products', value: systemStats.totalProducts, icon: '📦', color: 'from-orange-500 to-orange-600' },
                                        { label: 'Total Invoices', value: systemStats.totalInvoices, icon: '🧾', color: 'from-teal-500 to-teal-600' },
                                        { label: 'Purchase Orders', value: systemStats.totalPurchaseOrders, icon: '📋', color: 'from-cyan-500 to-cyan-600' }
                                    ].map((stat, index) => (
                                        <div key={index} className="group bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg hover:shadow-2xl transition-all duration-300">
                                            <div className={`w-14 h-14 bg-gradient-to-br ${stat.color} rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                                                <span className="text-3xl">{stat.icon}</span>
                                            </div>
                                            <div className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">{stat.label}</div>
                                            <div className={`text-4xl font-bold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>
                                                {stat.value.toLocaleString()}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Permissions Tab */}
                    {activeTab === 'permissions' && (
                        <div>
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Page-Level Permissions</h2>
                                <button
                                    onClick={fetchRolePermissions}
                                    disabled={refreshing}
                                    className="bg-gradient-to-r from-purple-500 to-purple-600 text-white px-6 py-3 rounded-xl hover:shadow-lg shadow-purple-500/30 transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                    <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                </button>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {Object.entries(rolePermissions).map(([role, permissions]) => (
                                    <div key={role} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-lg">
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6 capitalize flex items-center gap-3">
                                            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center text-white font-bold">
                                                {role.charAt(0).toUpperCase()}
                                            </div>
                                            {role} Role
                                        </h3>
                                        <div className="space-y-3">
                                            {availablePages.map(page => {
                                                const permission = permissions.find(p => p.page === page)
                                                return (
                                                    <div key={page} className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
                                                        <span className="font-medium text-gray-700 dark:text-gray-300 capitalize">
                                                            {page.replace(/-/g, ' ')}
                                                        </span>
                                                        <div className="flex items-center gap-4">
                                                            <label className="flex items-center gap-2 cursor-pointer">
                                                                <span className="text-xs text-gray-600 dark:text-gray-400">Access</span>
                                                                <div className="relative">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={permission?.canAccess || false}
                                                                        onChange={(e) => updatePagePermission(role, page, 'canAccess', e.target.checked)}
                                                                        className="peer sr-only"
                                                                    />
                                                                    <div className="w-5 h-5 bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 rounded transition-all duration-300 
                                                                        peer-checked:bg-gradient-to-r peer-checked:from-purple-500 peer-checked:to-blue-500 
                                                                        peer-checked:border-transparent peer-checked:shadow-lg peer-checked:shadow-purple-500/30 
                                                                        peer-checked:scale-110 cursor-pointer hover:border-purple-400">
                                                                    </div>
                                                                    <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                </div>
                                                            </label>
                                                            <label className="flex items-center gap-2 cursor-pointer">
                                                                <span className="text-xs text-gray-600 dark:text-gray-400">Write</span>
                                                                <div className="relative">
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={permission?.canWrite || false}
                                                                        onChange={(e) => updatePagePermission(role, page, 'canWrite', e.target.checked)}
                                                                        disabled={!permission?.canAccess}
                                                                        className="peer sr-only"
                                                                    />
                                                                    <div className={`w-5 h-5 bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 rounded transition-all duration-300 
                                                                        peer-checked:bg-gradient-to-r peer-checked:from-purple-500 peer-checked:to-blue-500 
                                                                        peer-checked:border-transparent peer-checked:shadow-lg peer-checked:shadow-purple-500/30 
                                                                        peer-checked:scale-110 hover:border-purple-400
                                                                        ${!permission?.canAccess ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                                                                    </div>
                                                                    <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                                    </svg>
                                                                </div>
                                                            </label>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Audit Logs Tab */}
                    {activeTab === 'audit' && (
                        <div>
                            <div className="flex justify-between items-center mb-6">
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Audit Logs</h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                        All login, logout and management events — tagged by anomaly severity
                                    </p>
                                </div>
                                <button
                                    onClick={fetchAuditLogs}
                                    disabled={refreshing}
                                    className="bg-gradient-to-r from-purple-500 to-purple-600 text-white px-6 py-3 rounded-xl hover:shadow-lg shadow-purple-500/30 transition-all disabled:opacity-50 flex items-center gap-2"
                                >
                                    <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    Refresh
                                </button>
                            </div>

                            {/* Filters */}
                            <div className="mb-6 space-y-4">
                                <input
                                    type="text"
                                    value={auditSearchTerm}
                                    onChange={(e) => setAuditSearchTerm(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && fetchAuditLogs()}
                                    placeholder="Search by user, action, clinic, location..."
                                    className="w-full px-4 py-3 border border-purple-200 dark:border-purple-700 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-800 dark:text-white shadow-lg"
                                />

                                {/* Category Filters */}
                                <div className="flex gap-2 flex-wrap">
                                    {['all', 'authentication', 'user_management', 'data_import', 'data_export', 'admin_settings', 'clinic_management', 'offline_sync'].map(category => (
                                        <button
                                            key={category}
                                            onClick={() => { setAuditFilter(category); }}
                                            className={`px-4 py-2 rounded-lg font-medium transition-all text-sm ${auditFilter === category
                                                    ? 'bg-purple-500 text-white shadow-lg'
                                                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:border-purple-500'
                                                }`}
                                        >
                                            {category.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                                        </button>
                                    ))}
                                </div>

                                {/* Severity / Anomaly Filters */}
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Security Status:</span>
                                    <div className="flex gap-2 flex-wrap">
                                        {[
                                            { value: 'all', label: 'All', cls: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600' },
                                            { value: 'ok', label: '✅ OK', cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700' },
                                            { value: 'warning', label: '⚠️ Warning', cls: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700' },
                                            { value: 'critical', label: '🔴 Critical', cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700' },
                                        ].map(opt => (
                                            <button
                                                key={opt.value}
                                                onClick={() => setAuditSeverityFilter(opt.value)}
                                                className={`px-3 py-1.5 rounded-lg border font-medium text-sm transition-all ${opt.cls} ${auditSeverityFilter === opt.value ? 'ring-2 ring-offset-1 ring-purple-500' : 'opacity-70 hover:opacity-100'}`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                    <button
                                        onClick={fetchAuditLogs}
                                        className="ml-auto px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg text-sm font-medium hover:bg-purple-200 dark:hover:bg-purple-800/50 transition-colors"
                                    >
                                        Apply Filters
                                    </button>
                                </div>
                            </div>

                            {/* Audit Log Cards */}
                            {auditLogs.length === 0 ? (
                                <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-2xl">
                                    <div className="text-6xl mb-4">📝</div>
                                    <p className="text-gray-500 dark:text-gray-400 text-lg">No audit logs found</p>
                                    <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">Audit logs will appear here as users log in and perform actions</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {auditLogs.map(log => (
                                        <div
                                            key={log.id}
                                            className={`bg-white dark:bg-gray-800 rounded-xl p-5 shadow-md hover:shadow-lg transition-shadow border-l-4 ${
                                                log.severity === 'critical' ? 'border-l-red-500' :
                                                log.severity === 'warning' ? 'border-l-orange-400' :
                                                'border-l-green-400'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between mb-3 gap-3">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ${
                                                        log.severity === 'critical' ? 'bg-gradient-to-br from-red-500 to-red-700' :
                                                        log.severity === 'warning' ? 'bg-gradient-to-br from-orange-400 to-orange-600' :
                                                        'bg-gradient-to-br from-purple-500 to-blue-500'
                                                    }`}>
                                                        {log.userName.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <h4 className="font-bold text-gray-900 dark:text-white truncate">{log.userName}</h4>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{log.userRole}{log.clinicName ? ` · ${log.clinicName}` : ''}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 flex-shrink-0">
                                                    <SeverityTag severity={log.severity || 'ok'} />
                                                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                                                        log.category === 'authentication' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400' :
                                                        log.category === 'user_management' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400' :
                                                        log.category === 'data_import' ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400' :
                                                        log.category === 'data_export' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400' :
                                                        log.category === 'admin_settings' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400' :
                                                        'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
                                                    }`}>
                                                        {log.category.replace(/_/g, ' ')}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="mb-3">
                                                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">{log.action}</h3>
                                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs text-gray-600 dark:text-gray-400">
                                                    <div className="flex items-center gap-1">
                                                        <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        </svg>
                                                        <span className={log.location ? 'text-gray-900 dark:text-white' : 'italic'}>{log.location || 'Location unknown'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2" />
                                                        </svg>
                                                        <span className={`font-mono ${log.ipAddress ? 'text-gray-900 dark:text-white' : 'italic'}`}>{log.ipAddress || 'IP unknown'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1 col-span-2 md:col-span-1">
                                                        <svg className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        <span>{new Date(log.timestamp).toLocaleString()}</span>
                                                    </div>
                                                    {log.locationLat && log.locationLng && (
                                                        <div className="col-span-2 md:col-span-3 flex items-center gap-1">
                                                            <svg className="w-3.5 h-3.5 flex-shrink-0 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                                                            </svg>
                                                            <a
                                                                href={`https://www.google.com/maps?q=${log.locationLat},${log.locationLng}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-blue-600 dark:text-blue-400 hover:underline"
                                                            >
                                                                GPS: {log.locationLat.toFixed(5)}, {log.locationLng.toFixed(5)} (view on map)
                                                            </a>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {log.details && Object.keys(log.details).length > 0 && (
                                                <details className="mt-2">
                                                    <summary className="text-xs text-purple-600 dark:text-purple-400 cursor-pointer hover:text-purple-700 font-medium">
                                                        View details
                                                    </summary>
                                                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 mt-2">
                                                        <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto">
                                                            {JSON.stringify(log.details, null, 2)}
                                                        </pre>
                                                    </div>
                                                </details>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Releases Tab */}
                    {activeTab === 'releases' && (
                        <div>
                            {/* Delete Release Confirmation Modal */}
                            {deleteReleaseId && (
                                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] p-4">
                                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-sm w-full p-6">
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{releaseDeleteStep === 1 ? 'Delete Release' : 'Final Confirmation'}</h3>
                                        <p className="text-gray-600 dark:text-gray-400 mb-6">
                                            {releaseDeleteStep === 1
                                                ? 'Are you sure you want to permanently delete this release? This cannot be undone.'
                                                : 'This action is irreversible and will permanently remove this release record. Do you want to continue?'}
                                        </p>
                                        <div className="flex gap-3">
                                            <button onClick={() => { setDeleteReleaseId(null); setReleaseDeleteStep(1) }} className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
                                                Cancel
                                            </button>
                                            <button onClick={() => {
                                                if (releaseDeleteStep === 1) {
                                                    setReleaseDeleteStep(2)
                                                    return
                                                }
                                                handleDeleteRelease()
                                            }} className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors">
                                                {releaseDeleteStep === 1 ? 'Review Impact' : 'Delete'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Header */}
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Release Manager</h2>
                                    <p className="text-gray-600 dark:text-gray-400 mt-1">Create and manage app releases and changelogs</p>
                                </div>
                                <div className="flex gap-3">
                                    <Link href="/updates" className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors">
                                        View Changelog
                                    </Link>
                                    <button
                                        onClick={openNewReleaseForm}
                                        className="px-4 py-2 bg-gradient-to-r from-purple-500 to-blue-500 text-white rounded-xl hover:shadow-lg shadow-purple-500/30 transition-all font-medium"
                                    >
                                        + New Release
                                    </button>
                                </div>
                            </div>

                            {/* Create/Edit Form */}
                            {showReleaseForm && (
                                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 mb-6 border border-purple-200/50 dark:border-purple-700/50">
                                    <div className="flex items-center justify-between mb-6">
                                        <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                                            {editingRelease ? `Edit Release v${editingRelease.version}` : 'Create New Release'}
                                        </h3>
                                        <button onClick={resetReleaseForm} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>

                                    <form onSubmit={handleReleaseSubmit} className="space-y-5">
                                        {/* Version + Title Row */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium mb-1.5">Version <span className="text-red-500">*</span></label>
                                                <input
                                                    type="text"
                                                    value={releaseVersion}
                                                    onChange={(e) => setReleaseVersion(e.target.value)}
                                                    placeholder="1.2.0"
                                                    className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 focus:outline-none font-mono"
                                                    required
                                                />
                                                <p className="text-xs text-gray-400 mt-1">SemVer format: major.minor.patch</p>
                                            </div>
                                            <div className="md:col-span-2">
                                                <label className="block text-sm font-medium mb-1.5">Title <span className="text-red-500">*</span></label>
                                                <input
                                                    type="text"
                                                    value={releaseTitle}
                                                    onChange={(e) => setReleaseTitle(e.target.value)}
                                                    placeholder="Treatment Enhancements & Bug Fixes"
                                                    className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                                                    required
                                                />
                                            </div>
                                        </div>

                                        {/* Release Type */}
                                        <div>
                                            <label className="block text-sm font-medium mb-2">Release Type</label>
                                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                                                {releaseTypes.map(type => (
                                                    <button
                                                        key={type.value}
                                                        type="button"
                                                        onClick={() => setReleaseType(type.value)}
                                                        className={`p-3 rounded-lg border-2 text-center transition-all duration-200 ${
                                                            releaseType === type.value
                                                                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 shadow-md'
                                                                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                                        }`}
                                                    >
                                                        <div className="text-sm font-bold">{type.label}</div>
                                                        <div className="text-xs text-gray-400 mt-0.5 hidden sm:block">{type.description}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Target Platforms */}
                                        <div>
                                            <label className="block text-sm font-medium mb-2">Target Platforms</label>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                {[
                                                    { value: 'all', label: 'All Platforms', icon: '🌐' },
                                                    { value: 'windows', label: 'Windows', icon: '🪟' },
                                                    { value: 'android', label: 'Android', icon: '🤖' },
                                                    { value: 'ios', label: 'iOS', icon: '🍎' }
                                                ].map(platform => {
                                                    const isSelected = releasePlatforms.includes(platform.value)
                                                    const isAll = platform.value === 'all'
                                                    const allSelected = releasePlatforms.includes('all')
                                                    
                                                    return (
                                                        <button
                                                            key={platform.value}
                                                            type="button"
                                                            onClick={() => {
                                                                if (isAll) {
                                                                    // If clicking "All", select only "All"
                                                                    setReleasePlatforms(['all'])
                                                                } else {
                                                                    // If clicking specific platform
                                                                    if (isSelected) {
                                                                        // Deselect it
                                                                        const updated = releasePlatforms.filter(p => p !== platform.value)
                                                                        // If nothing left, default to "all"
                                                                        setReleasePlatforms(updated.length === 0 ? ['all'] : updated)
                                                                    } else {
                                                                        // Select it and remove "all"
                                                                        const updated = releasePlatforms.filter(p => p !== 'all')
                                                                        setReleasePlatforms([...updated, platform.value])
                                                                    }
                                                                }
                                                            }}
                                                            disabled={!isAll && allSelected}
                                                            className={`p-3 rounded-lg border-2 text-center transition-all duration-200 ${
                                                                isSelected || (allSelected && !isAll)
                                                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-md'
                                                                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                                                            } ${!isAll && allSelected ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                        >
                                                            <div className="text-lg mb-1">{platform.icon}</div>
                                                            <div className="text-sm font-medium">{platform.label}</div>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                            <p className="text-xs text-gray-400 mt-2">Select which platforms will receive this release notification. "All Platforms" sends to everyone.</p>
                                        </div>

                                        {/* Description */}
                                        <div>
                                            <label className="block text-sm font-medium mb-1.5">Description</label>
                                            <textarea
                                                value={releaseDescription}
                                                onChange={(e) => setReleaseDescription(e.target.value)}
                                                placeholder="A brief summary of what this release includes..."
                                                rows={2}
                                                className="w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 focus:outline-none resize-none"
                                            />
                                        </div>

                                        {/* Features */}
                                        <div>
                                            <label className="block text-sm font-medium mb-2">Features / Changes</label>
                                            <div className="space-y-2">
                                                {releaseFeatures.map((feature, index) => (
                                                    <div key={index} className="flex gap-2">
                                                        <input
                                                            type="text"
                                                            value={feature}
                                                            onChange={(e) => updateReleaseFeature(index, e.target.value)}
                                                            placeholder={`Feature ${index + 1}...`}
                                                            className="flex-1 p-3 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                                                        />
                                                        {releaseFeatures.length > 1 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => removeReleaseFeature(index)}
                                                                className="p-3 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                            >
                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                </svg>
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                                <button
                                                    type="button"
                                                    onClick={addReleaseFeature}
                                                    className="text-sm text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                                    </svg>
                                                    Add another feature
                                                </button>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-3 pt-2">
                                            <button
                                                type="button"
                                                onClick={resetReleaseForm}
                                                className="px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                disabled={savingRelease}
                                                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white font-semibold rounded-lg shadow-lg shadow-purple-500/30 transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
                                            >
                                                {savingRelease && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                                                {editingRelease ? 'Update Release' : 'Publish Release'}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )}

                            {/* Releases List */}
                            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-4 border border-purple-200/50 dark:border-purple-700/50">
                                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                    All Releases
                                    <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-400 rounded-full text-xs font-bold">
                                        {releases.length}
                                    </span>
                                </h3>

                                {refreshing ? (
                                    <div className="flex items-center justify-center py-12">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                                    </div>
                                ) : releases.length === 0 ? (
                                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                                        <div className="text-5xl mb-3">🚀</div>
                                        <p className="text-lg font-medium">No releases yet</p>
                                        <p className="text-sm mt-1">Create your first release to get started</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {releases.map(release => {
                                            const features = Array.isArray(release.features) ? release.features : []
                                            const typeStyle = releaseTypeStyles[release.releaseType] || releaseTypeStyles.improvement

                                            return (
                                                <div
                                                    key={release.id}
                                                    className={`rounded-xl border p-4 transition-all duration-200 ${
                                                        release.isActive
                                                            ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50'
                                                            : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 opacity-60'
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between gap-4">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                                                                <span className={`px-2 py-0.5 ${typeStyle} rounded-full text-xs font-bold uppercase tracking-wider`}>
                                                                    {release.releaseType}
                                                                </span>
                                                                <span className="font-mono text-sm font-bold text-gray-700 dark:text-gray-300">
                                                                    v{release.version}
                                                                </span>
                                                                {!release.isActive && (
                                                                    <span className="px-2 py-0.5 bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded-full text-xs font-bold">
                                                                        Inactive
                                                                    </span>
                                                                )}
                                                                {/* Platform badges */}
                                                                {release.platforms && release.platforms.length > 0 && (
                                                                    release.platforms.includes('all') ? (
                                                                        <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-medium">
                                                                            🌐 All Platforms
                                                                        </span>
                                                                    ) : (
                                                                        release.platforms.map(platform => {
                                                                            const platformIcons: Record<string, string> = {
                                                                                windows: '🪟',
                                                                                android: '🤖',
                                                                                ios: '🍎'
                                                                            }
                                                                            const platformNames: Record<string, string> = {
                                                                                windows: 'Windows',
                                                                                android: 'Android',
                                                                                ios: 'iOS'
                                                                            }
                                                                            return (
                                                                                <span key={platform} className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-full text-xs font-medium">
                                                                                    {platformIcons[platform]} {platformNames[platform]}
                                                                                </span>
                                                                            )
                                                                        })
                                                                    )
                                                                )}
                                                            </div>
                                                            <h4 className="font-semibold text-gray-900 dark:text-white">{release.title}</h4>
                                                            {release.description && (
                                                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{release.description}</p>
                                                            )}
                                                            {features.length > 0 && (
                                                                <div className="mt-2 flex flex-wrap gap-1">
                                                                    {features.slice(0, 3).map((f: string, i: number) => (
                                                                        <span key={i} className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">
                                                                            {f.length > 50 ? f.substring(0, 50) + '...' : f}
                                                                        </span>
                                                                    ))}
                                                                    {features.length > 3 && (
                                                                        <span className="text-xs text-gray-400">+{features.length - 3} more</span>
                                                                    )}
                                                                </div>
                                                            )}
                                                            <div className="text-xs text-gray-400 mt-2">{formatReleaseDate(release.createdAt)}</div>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                                            <button
                                                                onClick={() => toggleReleaseActive(release)}
                                                                className={`p-2 rounded-lg transition-colors ${
                                                                    release.isActive
                                                                        ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                                                                        : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                                                }`}
                                                                title={release.isActive ? 'Deactivate' : 'Activate'}
                                                            >
                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    {release.isActive ? (
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                                    ) : (
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                                                                    )}
                                                                </svg>
                                                            </button>
                                                            <button
                                                                onClick={() => openEditReleaseForm(release)}
                                                                className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                                                title="Edit"
                                                            >
                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setDeleteReleaseId(release.id)
                                                                    setReleaseDeleteStep(1)
                                                                }}
                                                                className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                                title="Delete"
                                                            >
                                                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Sessions Tab */}
                    {activeTab === 'sessions' && (
                        <div className="space-y-6">
                            {/* Header row */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        <span className="text-2xl">🔑</span> Active Sessions
                                    </h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                        {totalActiveSessions} session{totalActiveSessions !== 1 ? 's' : ''} currently active across all clinics
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={fetchSessions}
                                        disabled={sessionsLoading}
                                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl transition-colors text-sm font-medium disabled:opacity-50"
                                    >
                                        <svg className={`w-4 h-4 ${sessionsLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                        Refresh
                                    </button>
                                    <button
                                        onClick={() => clearSessions('all')}
                                        disabled={clearingScope === 'all' || totalActiveSessions === 0}
                                        className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-sm shadow-red-500/20"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Clear All
                                    </button>
                                </div>
                            </div>

                            {/* Stats cards */}
                            {!sessionsLoading && sessionGroups.length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                    {[
                                        { label: 'Total Sessions', value: totalActiveSessions, icon: '🔐', color: 'from-purple-500 to-violet-500' },
                                        { label: 'Clinics Active', value: sessionGroups.length, icon: '🏥', color: 'from-blue-500 to-cyan-500' },
                                        { label: 'Active Users', value: sessionGroups.reduce((sum, g) => sum + g.userCount, 0), icon: '👥', color: 'from-green-500 to-emerald-500' },
                                        { label: 'Over Limit', value: sessionGroups.filter(g => g.sessions.length > g.maxSessions).length, icon: '⚠️', color: 'from-red-500 to-rose-500' },
                                    ].map((stat, i) => (
                                        <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-2xl">{stat.icon}</span>
                                                <span className={`text-2xl font-extrabold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>{stat.value}</span>
                                            </div>
                                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{stat.label}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {sessionsLoading ? (
                                <div className="flex items-center justify-center py-16">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500"></div>
                                </div>
                            ) : sessionGroups.length === 0 ? (
                                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
                                    <div className="text-4xl mb-3">🔑</div>
                                    <p className="text-gray-500 dark:text-gray-400 font-medium">No active sessions found</p>
                                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">All users are currently logged out</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {sessionGroups.map(group => {
                                        const overLimit = group.sessions.length > group.maxSessions
                                        const usagePercent = Math.min(100, (group.sessions.length / group.maxSessions) * 100)
                                        return (
                                            <div key={group.clinicInternalId || 'no-clinic'} className={`bg-white dark:bg-gray-800 rounded-2xl shadow-sm border-2 overflow-hidden transition-all ${overLimit ? 'border-red-300 dark:border-red-700' : 'border-gray-200 dark:border-gray-700'}`}>
                                                {/* Clinic header */}
                                                <div className={`px-5 py-4 ${overLimit ? 'bg-red-50/50 dark:bg-red-900/10' : 'bg-gray-50/50 dark:bg-gray-800/50'}`}>
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${overLimit ? 'bg-gradient-to-br from-red-400 to-rose-500' : 'bg-gradient-to-br from-purple-400 to-violet-500'} text-white`}>
                                                                <span className="text-sm font-black">{group.clinicName?.charAt(0)?.toUpperCase() || '?'}</span>
                                                            </div>
                                                            <div>
                                                                <div className="flex items-center gap-2 flex-wrap">
                                                                    <h3 className="font-semibold text-gray-900 dark:text-white">{group.clinicName}</h3>
                                                                    {group.clinicId && (
                                                                        <span className="text-xs font-mono px-2 py-0.5 bg-gray-200 dark:bg-gray-600 text-gray-500 dark:text-gray-400 rounded-lg">{group.clinicId}</span>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-3 mt-1.5">
                                                                    {/* Usage bar */}
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-28 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                                                                            <div
                                                                                className={`h-full rounded-full transition-all duration-500 ${overLimit ? 'bg-red-500' : usagePercent > 70 ? 'bg-amber-400' : 'bg-green-500'}`}
                                                                                style={{ width: `${usagePercent}%` }}
                                                                            />
                                                                        </div>
                                                                        <span className={`text-xs font-semibold ${overLimit ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                                                            {group.sessions.length}/{group.maxSessions}
                                                                        </span>
                                                                    </div>
                                                                    {overLimit && (
                                                                        <span className="text-xs font-semibold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
                                                                            +{group.sessions.length - group.maxSessions} over
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {group.clinicInternalId && (
                                                            <button
                                                                onClick={() => clearSessions('clinic', group.clinicInternalId!)}
                                                                disabled={clearingScope === `clinic-${group.clinicInternalId}`}
                                                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 rounded-xl transition-colors disabled:opacity-50"
                                                            >
                                                                {clearingScope === `clinic-${group.clinicInternalId}` ? (
                                                                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                                ) : (
                                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                                )}
                                                                Clear All
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Sessions list */}
                                                <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
                                                    {group.sessions.map(s => {
                                                        const lastActiveDate = new Date(s.lastActive)
                                                        const createdDate = new Date(s.createdAt)
                                                        const minutesIdle = Math.floor((Date.now() - lastActiveDate.getTime()) / 60000)
                                                        const idleLabel = minutesIdle < 60
                                                            ? `${minutesIdle}m ago`
                                                            : minutesIdle < 1440
                                                            ? `${Math.floor(minutesIdle / 60)}h ago`
                                                            : `${Math.floor(minutesIdle / 1440)}d ago`
                                                        const isStale = minutesIdle > 120

                                                        return (
                                                            <div key={s.id} className={`flex items-center justify-between px-5 py-3 transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-700/20 ${isStale ? 'opacity-50' : ''}`}>
                                                                <div className="flex items-center gap-3 min-w-0">
                                                                    <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ring-2 ${isStale ? 'bg-gray-400 ring-gray-200 dark:ring-gray-600' : 'bg-green-500 ring-green-200 dark:ring-green-900 animate-pulse'}`} />
                                                                    <div className="min-w-0">
                                                                        <div className="flex items-center gap-2 flex-wrap">
                                                                            <span className="font-medium text-sm text-gray-900 dark:text-white">{s.userName}</span>
                                                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                                                                                s.userRole === 'admin' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300' :
                                                                                s.userRole === 'doctor' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' :
                                                                                s.userRole === 'staff' ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300' :
                                                                                s.userRole === 'receptionist' ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300' :
                                                                                'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                                                            }`}>{s.userRole}</span>
                                                                            {isStale && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-medium">idle</span>}
                                                                        </div>
                                                                        <div className="flex items-center gap-2.5 mt-1 text-[11px] text-gray-400 dark:text-gray-500 flex-wrap">
                                                                            {s.ipAddress && (
                                                                                <span className="flex items-center gap-1">
                                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                                                    {s.ipAddress}
                                                                                </span>
                                                                            )}
                                                                            {s.location && (
                                                                                <span className="flex items-center gap-1">
                                                                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" /></svg>
                                                                                    {s.location}
                                                                                </span>
                                                                            )}
                                                                            <span className="flex items-center gap-1">
                                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                                                {idleLabel}
                                                                            </span>
                                                                            <span className="flex items-center gap-1">
                                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" /></svg>
                                                                                {createdDate.toLocaleDateString()} {createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    onClick={() => clearSessions('session', undefined, s.id)}
                                                                    disabled={clearingScope === `session-${s.id}`}
                                                                    title="Force logout this session"
                                                                    className="ml-3 flex-shrink-0 p-2 text-red-400 hover:text-white hover:bg-red-500 rounded-xl transition-all disabled:opacity-50"
                                                                >
                                                                    {clearingScope === `session-${s.id}` ? (
                                                                        <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                                    ) : (
                                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                                    )}
                                                                </button>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Subscriptions Tab */}
                    {activeTab === 'subscriptions' && (
                        <div className="space-y-6">
                            {/* Header */}
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-2xl border border-purple-100 dark:border-purple-900 bg-gradient-to-r from-white to-purple-50 dark:from-gray-800 dark:to-gray-900 p-4 sm:p-5 shadow-sm">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        <span className="text-2xl">💳</span> Subscription Management
                                    </h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                        {subClinics.length} clinic{subClinics.length !== 1 ? 's' : ''} registered
                                    </p>
                                    <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">Minimum subscription: 1 Year</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={fetchSubClinics} className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl transition-colors text-sm font-medium">
                                        <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                        Refresh
                                    </button>
                                </div>
                            </div>

                            {/* Search */}
                            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 sm:p-4 shadow-sm">
                                <div className="relative">
                                    <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    <input
                                        type="text"
                                        value={subSearch}
                                        onChange={(e) => setSubSearch(e.target.value)}
                                        placeholder="Search by clinic name or code..."
                                        className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm text-gray-900 dark:text-white"
                                    />
                                </div>
                                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">Showing {subClinics.filter(c => !subSearch || c.name?.toLowerCase().includes(subSearch.toLowerCase()) || c.clinicId?.includes(subSearch)).length} result(s)</p>
                            </div>

                            {/* Stats row */}
                            {!refreshing && subClinics.length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                                    {[
                                        { label: 'Total Clinics', value: subClinics.length, icon: '🏥', color: 'from-blue-500 to-cyan-500' },
                                        { label: 'Active', value: subClinics.filter(c => c.subscriptionStatus === 'active' || !c.subscriptionStatus).length, icon: '✅', color: 'from-green-500 to-emerald-500' },
                                        { label: 'Basic Plan', value: subClinics.filter(c => c.subscriptionPlan === 'basic').length, icon: '📦', color: 'from-cyan-500 to-blue-500' },
                                        { label: 'Standard Plan', value: subClinics.filter(c => !c.subscriptionPlan || c.subscriptionPlan === 'standard').length, icon: '🏷️', color: 'from-purple-500 to-violet-500' },
                                        { label: 'AI OCR', value: subClinics.filter(c => c.subscriptionPlan === 'basic_ai_ocr' || c.subscriptionPlan === 'standard_ai_ocr').length, icon: '🤖', color: 'from-indigo-500 to-violet-500' },
                                        { label: 'Pro Plan', value: subClinics.filter(c => c.subscriptionPlan === 'pro').length, icon: '⭐', color: 'from-amber-500 to-orange-500' },
                                    ].map((stat, i) => (
                                        <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm hover:shadow-md transition-shadow">
                                            <div className="flex items-center justify-between mb-2">
                                                <span className="text-2xl">{stat.icon}</span>
                                                <span className={`text-2xl font-extrabold bg-gradient-to-r ${stat.color} bg-clip-text text-transparent`}>{stat.value}</span>
                                            </div>
                                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{stat.label}</p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {!refreshing && (() => {
                                const pendingDeletionClinics = subClinics.filter((c) => {
                                    const status = String(c.subscriptionStatus || '').toLowerCase()
                                    const isInactive = String(c.status || '').toLowerCase() === 'inactive' || status === 'expired' || status === 'cancelled'
                                    const hasDeletionTarget = Boolean(c.subscriptionEnd || c.trialEndsAt)
                                    return isInactive && hasDeletionTarget
                                })
                                if (pendingDeletionClinics.length === 0) return null

                                return (
                                    <div className="bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-700 rounded-2xl p-4">
                                        <div className="flex items-center justify-between gap-3 mb-3">
                                            <h3 className="text-sm font-bold text-red-800 dark:text-red-300">Inactive Pending Deletion</h3>
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 font-semibold">
                                                {pendingDeletionClinics.length} clinic{pendingDeletionClinics.length !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                        <div className="space-y-2">
                                            {pendingDeletionClinics.slice(0, 6).map((c) => {
                                                const baseDate = c.subscriptionEnd || c.trialEndsAt
                                                const deletionAt = baseDate ? new Date(new Date(baseDate).getTime() + 30 * 24 * 60 * 60 * 1000) : null
                                                return (
                                                    <div key={`pending-del-${c.id}`} className="flex items-center justify-between text-xs bg-white dark:bg-gray-800 border border-red-100 dark:border-red-800 rounded-xl px-3 py-2">
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-gray-900 dark:text-white truncate">{c.name}</p>
                                                            <p className="text-gray-500 dark:text-gray-400">{c.clinicId} • {c.subscriptionStatus || 'inactive'}</p>
                                                        </div>
                                                        <div className="text-right">
                                                            <p className="font-semibold text-red-700 dark:text-red-300">{deletionAt ? formatRemainingTime(deletionAt.toISOString()) : 'N/A'}</p>
                                                            <p className="text-gray-500 dark:text-gray-400">to deletion</p>
                                                        </div>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })()}

                            {/* Clinic cards */}
                            {refreshing ? (
                                <div className="flex items-center justify-center py-16">
                                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-500"></div>
                                </div>
                            ) : subClinics.length === 0 ? (
                                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
                                    <div className="text-4xl mb-3">💳</div>
                                    <p className="text-gray-500 dark:text-gray-400 font-medium">No clinics found</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {subClinics
                                        .filter(c => !subSearch || c.name?.toLowerCase().includes(subSearch.toLowerCase()) || c.clinicId?.includes(subSearch))
                                        .map(c => {
                                            const isSaving = subSaving === c.id
                                            const isPro = c.subscriptionPlan === 'pro'
                                            const isBasic = c.subscriptionPlan === 'basic'
                                            const isStandard = !c.subscriptionPlan || c.subscriptionPlan === 'standard'
                                            const isAiOcr = c.subscriptionPlan === 'basic_ai_ocr' || c.subscriptionPlan === 'standard_ai_ocr'
                                            const isStandardAiOcr = c.subscriptionPlan === 'standard_ai_ocr'
                                            const isActive = c.subscriptionStatus === 'active' || !c.subscriptionStatus
                                            const isExpired = c.subscriptionStatus === 'expired'
                                            const isTrial = c.subscriptionStatus === 'trial'

                                            return (
                                                <div key={c.id} className={`bg-white dark:bg-gray-800 rounded-2xl border-2 overflow-hidden transition-all hover:shadow-md ${
                                                    isSaving ? 'opacity-60 pointer-events-none' : ''
                                                } ${isPro ? 'border-amber-200 dark:border-amber-700' : isAiOcr ? 'border-indigo-200 dark:border-indigo-700' : isBasic ? 'border-cyan-200 dark:border-cyan-700' : isStandard ? 'border-violet-200 dark:border-violet-700' : 'border-gray-200 dark:border-gray-700'}`}>
                                                    <div className="px-5 py-4">
                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                                            {/* Clinic identity */}
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isPro ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white' : isAiOcr ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white' : isBasic ? 'bg-gradient-to-br from-cyan-500 to-blue-600 text-white' : isStandard ? 'bg-gradient-to-br from-violet-500 to-purple-600 text-white' : 'bg-gradient-to-br from-blue-400 to-cyan-500 text-white'}`}>
                                                                    <span className="text-sm font-black">{c.name?.charAt(0)?.toUpperCase() || '?'}</span>
                                                                </div>
                                                                <div className="min-w-0">
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <h3 className="font-semibold text-gray-900 dark:text-white truncate">{c.name}</h3>
                                                                        {isPro && (
                                                                            <span className="px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-amber-400 to-orange-500 text-white rounded-md leading-none">PRO</span>
                                                                        )}
                                                                        {isBasic && (
                                                                            <span className="px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-md leading-none">BASIC</span>
                                                                        )}
                                                                        {isStandard && (
                                                                            <span className="px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-violet-500 to-purple-600 text-white rounded-md leading-none">STANDARD</span>
                                                                        )}
                                                                        {isAiOcr && (
                                                                            <span className="px-1.5 py-0.5 text-[10px] font-black uppercase tracking-wider bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-md leading-none">{isStandardAiOcr ? 'STANDARD + AI OCR' : 'BASIC + AI OCR'}</span>
                                                                        )}
                                                                    </div>
                                                                    <div className="flex items-center gap-2 mt-0.5">
                                                                        <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{c.clinicId}</span>
                                                                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                                                                            isActive ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                                                                            isTrial ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300' :
                                                                            isExpired ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                                                                            'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                                                        }`}>
                                                                            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : isTrial ? 'bg-cyan-500' : isExpired ? 'bg-red-500' : 'bg-gray-400'}`} />
                                                                            {c.subscriptionStatus || 'active'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Controls */}
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                {/* Plan selector */}
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">Plan</span>
                                                                    <CustomSelect
                                                                        value={c.subscriptionPlan || 'standard'}
                                                                        onChange={(value) => updateSubClinic(c.id, { subscriptionPlan: value })}
                                                                        options={subscriptionPlanOptions}
                                                                        placeholder="Select plan"
                                                                        disabled={isSaving}
                                                                        className={`min-w-[150px] text-xs ${
                                                                            isPro
                                                                                ? 'border-amber-300 dark:border-amber-600 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                                                                                : isAiOcr
                                                                                    ? 'border-indigo-300 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                                                                                    : isBasic
                                                                                        ? 'border-cyan-300 dark:border-cyan-600 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300'
                                                                                        : 'border-violet-300 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300'
                                                                        }`}
                                                                    />
                                                                </div>

                                                                {/* Cycle selector */}
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">Cycle</span>
                                                                    <CustomSelect
                                                                        value={c.subscriptionCycle || 'annual'}
                                                                        onChange={(value) => {
                                                                            if (value === 'monthly' || value === 'quarterly') {
                                                                                showError('Minimum subscription is 1 Year. Monthly and quarterly cycles are locked.')
                                                                                return
                                                                            }
                                                                            updateSubClinic(c.id, { subscriptionCycle: value })
                                                                        }}
                                                                        options={subscriptionCycleOptions}
                                                                        placeholder="Select cycle"
                                                                        disabled={isSaving}
                                                                        className="min-w-[190px] text-xs"
                                                                    />
                                                                </div>

                                                                {/* Status selector */}
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">Status</span>
                                                                    <CustomSelect
                                                                        value={c.subscriptionStatus || 'active'}
                                                                        onChange={(value) => updateSubClinic(c.id, { subscriptionStatus: value })}
                                                                        options={subscriptionStatusOptions}
                                                                        placeholder="Select status"
                                                                        disabled={isSaving}
                                                                        className={`min-w-[135px] text-xs ${
                                                                            isActive
                                                                                ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                                                                                : isTrial
                                                                                    ? 'border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300'
                                                                                    : isExpired
                                                                                        ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                                                                                        : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
                                                                        }`}
                                                                    />
                                                                </div>

                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">Trial</span>
                                                                    <CustomSelect
                                                                        value={c.trialActive ? 'yes' : 'no'}
                                                                        onChange={(value) => updateSubClinic(c.id, { trialActive: value === 'yes' })}
                                                                        options={trialToggleOptions}
                                                                        placeholder="Trial"
                                                                        disabled={isSaving}
                                                                        className="min-w-[120px] text-xs border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300"
                                                                    />
                                                                </div>

                                                                {/* Expiry */}
                                                                <div className="text-xs text-gray-500 dark:text-gray-400 pl-1">
                                                                    {c.subscriptionCycle === 'fiveYear' || c.subscriptionCycle === 'lifetime'
                                                                        ? <span className="text-emerald-600 dark:text-emerald-400 font-semibold">No expiry</span>
                                                                        : c.subscriptionEnd
                                                                        ? <>Exp: <span className="font-medium text-gray-700 dark:text-gray-300">{new Date(c.subscriptionEnd).toLocaleDateString()}</span></>
                                                                        : <span className="text-gray-400">—</span>}
                                                                </div>

                                                                <div className="text-xs text-gray-500 dark:text-gray-400 pl-1">
                                                                    {c.trialActive
                                                                        ? <span className="text-cyan-700 dark:text-cyan-300 font-semibold">Trial active • {formatRemainingTime(c.trialEndsAt)} left</span>
                                                                        : <span>Trial: {c.trialEndsAt ? new Date(c.trialEndsAt).toLocaleDateString() : '—'}</span>}
                                                                </div>

                                                                <div className="flex items-center gap-1.5">
                                                                    <input
                                                                        type="datetime-local"
                                                                        value={trialEditValues[c.id] ?? toDateTimeLocal(c.trialEndsAt)}
                                                                        onChange={(e) => setTrialEditValues(prev => ({ ...prev, [c.id]: e.target.value }))}
                                                                        disabled={isSaving}
                                                                        className="px-2 py-1 text-xs rounded-lg border border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300"
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        disabled={isSaving || !(trialEditValues[c.id] ?? toDateTimeLocal(c.trialEndsAt))}
                                                                        onClick={() => {
                                                                            const localValue = trialEditValues[c.id] ?? toDateTimeLocal(c.trialEndsAt)
                                                                            if (!localValue) return
                                                                            const iso = new Date(localValue).toISOString()
                                                                            updateSubClinic(c.id, { trialEndsAt: iso })
                                                                        }}
                                                                        className="px-2 py-1 text-xs rounded-lg border border-cyan-300 dark:border-cyan-700 bg-white dark:bg-gray-800 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/20 disabled:opacity-50"
                                                                    >
                                                                        Set Trial End
                                                                    </button>
                                                                </div>

                                                                <div className="text-xs text-gray-500 dark:text-gray-400 pl-1">
                                                                    Limit: {c.planLimits?.totalUsers ? `${c.planLimits.totalUsers} users` : 'No fixed cap'}
                                                                </div>

                                                                <div className="text-xs text-gray-500 dark:text-gray-400 pl-1">
                                                                    Token: {c.tokenPolicy?.label || 'Default duration'}
                                                                </div>

                                                                {isSaving && (
                                                                    <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'categoryRules' && (
                        <div className="space-y-6">
                            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        <span className="text-2xl">🧩</span> Product Category Field Rules
                                    </h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                        Configure which fields are visible per product category for Prescriptions Tab 5 and Treatments Add/Edit.
                                    </p>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={fetchCategoriesForCategoryRules}
                                        disabled={savingCategoryFieldRules || loadingCategoryNames}
                                        className="px-4 py-2 bg-sky-100 dark:bg-sky-900/30 hover:bg-sky-200 dark:hover:bg-sky-800/40 text-sky-800 dark:text-sky-200 rounded-xl text-sm font-medium disabled:opacity-50"
                                    >
                                        {loadingCategoryNames ? 'Loading...' : 'Refresh Categories'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCategoryFieldRulesEditor(createCurrentCategoryFieldRulesBaseline())}
                                        disabled={savingCategoryFieldRules}
                                        className="px-4 py-2 bg-amber-100 dark:bg-amber-900/30 hover:bg-amber-200 dark:hover:bg-amber-800/40 text-amber-800 dark:text-amber-200 rounded-xl text-sm font-medium disabled:opacity-50"
                                    >
                                        Reset To Current Rule Set
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCategoryFieldRulesEditor(savedCategoryFieldRules)}
                                        disabled={savingCategoryFieldRules}
                                        className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-medium disabled:opacity-50"
                                    >
                                        Revert Unsaved
                                    </button>
                                    <button
                                        type="button"
                                        onClick={saveCategoryFieldRules}
                                        disabled={savingCategoryFieldRules}
                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium disabled:opacity-50"
                                    >
                                        {savingCategoryFieldRules ? 'Saving...' : 'Save Rules'}
                                    </button>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5 space-y-3">
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Categories are loaded dynamically from the database and normalized into grouped keys (for example CAP, CAPS, CAPSULE to CAPSULES).
                                </p>
                                <div className="text-xs font-medium text-gray-600 dark:text-gray-300">
                                    {loadingCategoryNames
                                        ? 'Loading categories from database...'
                                        : `Loaded ${categoryNamesFromDb.length} category name(s), grouped into ${dbCategoryRuleGroups.length} rule key(s).`}
                                </div>
                            </div>

                            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="min-w-[1200px] w-full text-xs">
                                        <thead className="bg-gray-50 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-700">
                                            <tr>
                                                <th className="text-left px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Category</th>
                                                {CATEGORY_RULE_FIELD_ORDER.map((field) => (
                                                    <th key={field} className="text-center px-2 py-2 font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                                        {CATEGORY_RULE_FIELD_LABELS[field]}
                                                    </th>
                                                ))}
                                                <th className="text-center px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {categoryRuleRows.map((categoryKey) => {
                                                const rule = getCategoryFieldVisibility(categoryFieldRulesEditor, categoryKey)
                                                const aliasesFromDb = dbAliasesByRuleKey[categoryKey] || []
                                                const groupedAliases = Array.from(new Set([
                                                    ...aliasesFromDb,
                                                    ...getCategoryRuleAliases(categoryKey),
                                                ])).sort((a, b) => a.localeCompare(b))

                                                return (
                                                    <tr key={categoryKey} className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
                                                        <td className="px-3 py-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-semibold text-gray-800 dark:text-gray-200">
                                                                    {formatCategoryRuleLabel(categoryKey)}
                                                                </span>
                                                                <span className="px-1.5 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-[10px] font-semibold">
                                                                    dynamic
                                                                </span>
                                                            </div>
                                                            <div className="mt-0.5 space-y-1">
                                                                <p className="text-[10px] text-gray-500 dark:text-gray-400">Rule key: {categoryKey}</p>
                                                                <p className="text-[10px] text-blue-600 dark:text-blue-300">
                                                                    Grouped aliases: {groupedAliases.join(', ')}
                                                                </p>
                                                            </div>
                                                        </td>
                                                        {CATEGORY_RULE_FIELD_ORDER.map((field) => (
                                                            <td key={`${categoryKey}-${field}`} className="px-2 py-2 text-center">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={rule[field]}
                                                                    onChange={(e) => updateCategoryFieldRule(categoryKey, field, e.target.checked)}
                                                                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                                />
                                                            </td>
                                                        ))}
                                                        <td className="px-3 py-2">
                                                            <div className="flex items-center justify-center gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setCategoryRuleAllFields(categoryKey, true)}
                                                                    className="px-2 py-1 rounded-md text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-800/40"
                                                                >
                                                                    All
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setCategoryRuleAllFields(categoryKey, false)}
                                                                    className="px-2 py-1 rounded-md text-[10px] font-semibold bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 hover:bg-rose-200 dark:hover:bg-rose-800/40"
                                                                >
                                                                    None
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => resetCategoryRuleRow(categoryKey)}
                                                                    className="px-2 py-1 rounded-md text-[10px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                                                                >
                                                                    Reset
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'defaults' && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        <span className="text-2xl">📁</span> Default Template Manager
                                    </h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                        Upload products/treatments CSV files with auto versioning and manage global default values.
                                    </p>
                                </div>
                                <button
                                    onClick={fetchDefaultTemplateSummary}
                                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl transition-colors text-sm font-medium"
                                >
                                    Refresh
                                </button>
                            </div>

                            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5 space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <div>
                                        <h3 className="text-base font-semibold text-gray-900 dark:text-white">Prescription Keyword Learning Policy</h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                            Control whether users can teach new treatment keywords from prescriptions.
                                        </p>
                                    </div>
                                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-xs font-medium">
                                        <span className={keywordLearningEnabled ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-600 dark:text-gray-300'}>
                                            {keywordLearningEnabled ? 'Enabled' : 'Disabled'}
                                        </span>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    <button
                                        type="button"
                                        onClick={() => updateGlobalPrescriptionKeywordLearning(!keywordLearningEnabled)}
                                        disabled={savingKeywordLearningToggle}
                                        className={`px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 ${keywordLearningEnabled ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                                    >
                                        {savingKeywordLearningToggle ? 'Saving...' : keywordLearningEnabled ? 'Turn Off Learning' : 'Turn On Learning'}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={resetAllTreatmentKeywords}
                                        disabled={resettingTreatmentKeywords}
                                        className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                                    >
                                        {resettingTreatmentKeywords ? 'Resetting...' : 'Reset Keywords'}
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Product Default Version</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{defaultTemplateSummary?.latestProductVersion || 0}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Rows: {defaultTemplateSummary?.latestProductRows || 0}</p>
                                </div>
                                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Treatment Default Version</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{defaultTemplateSummary?.latestTreatmentVersion || 0}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Rows: {defaultTemplateSummary?.latestTreatmentRows || 0}</p>
                                </div>
                                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Clinics Synced (Products)</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{defaultTemplateSummary?.syncedProductClinics || 0}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total clinics: {defaultTemplateSummary?.totalClinics || 0}</p>
                                </div>
                                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Clinics Synced (Treatments)</p>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{defaultTemplateSummary?.syncedTreatmentClinics || 0}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Total clinics: {defaultTemplateSummary?.totalClinics || 0}</p>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5 space-y-4">
                                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Upload New CSV Defaults</h3>
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/10 px-3 py-3">
                                    <div>
                                        <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Import Button Pulse Animation</p>
                                        <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                                            Controls pulse highlight on Products and Treatments import buttons when new defaults are available.
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                                            {importPulseToggleState === 'mixed'
                                                ? 'Mixed'
                                                : importPulseToggleState === 'on'
                                                    ? 'ON'
                                                    : 'OFF'}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => updateImportPulsePolicy(importPulseToggleState !== 'on')}
                                            disabled={savingImportPulseToggle}
                                            className={`px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 ${importPulseToggleState === 'on' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-600 hover:bg-slate-700'}`}
                                        >
                                            {savingImportPulseToggle
                                                ? 'Saving...'
                                                : importPulseToggleState === 'on'
                                                    ? 'Turn Off'
                                                    : 'Turn On'}
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <CustomSelect
                                        value={defaultCsvType}
                                        onChange={(value) => setDefaultCsvType(value as 'product' | 'treatment')}
                                        options={defaultCsvTypeOptions}
                                        placeholder="Select CSV type"
                                        className="text-sm"
                                    />
                                    <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 flex items-center gap-3">
                                        <input
                                            key={defaultCsvInputKey}
                                            id="default-csv-file-input"
                                            type="file"
                                            accept=".csv,text/csv"
                                            onChange={(e) => setDefaultCsvFile(e.target.files?.[0] || null)}
                                            className="hidden"
                                        />
                                        <label
                                            htmlFor="default-csv-file-input"
                                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white text-xs font-semibold cursor-pointer transition-colors"
                                        >
                                            Choose File
                                        </label>
                                        <span className="text-xs text-gray-600 dark:text-gray-300 truncate">
                                            {defaultCsvFile?.name || 'No file selected'}
                                        </span>
                                    </div>
                                    <button
                                        onClick={uploadDefaultCsv}
                                        disabled={defaultUploadLoading || !defaultCsvFile}
                                        className="px-4 py-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 text-white rounded-xl text-sm font-medium disabled:opacity-50"
                                    >
                                        {defaultUploadLoading ? 'Uploading...' : 'Upload & Create New Version'}
                                    </button>
                                </div>
                                {defaultCsvFile && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Selected file: {defaultCsvFile.name}
                                    </p>
                                )}
                            </div>

                            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5 space-y-4">
                                <h3 className="text-base font-semibold text-gray-900 dark:text-white">Global Page Defaults</h3>
                                <p className="text-xs text-amber-700 dark:text-amber-300">
                                    Clinics that already customized their defaults are preserved. Clinics still matching old global defaults are auto-updated.
                                </p>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                    <div className="lg:col-span-1">
                                        {globalDefaults.length === 0 ? (
                                            <p className="text-sm text-gray-500 dark:text-gray-400">No global defaults found.</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {globalDefaults.map((item) => (
                                                    <button
                                                        key={item.page}
                                                        onClick={() => handleSelectGlobalDefaultPage(item.page)}
                                                        className={`w-full text-left p-3 rounded-xl border transition-all ${
                                                            selectedDefaultPage === item.page
                                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-sm'
                                                                : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900/40'
                                                        }`}
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <p className={`text-sm font-semibold ${selectedDefaultPage === item.page ? 'text-blue-700 dark:text-blue-300' : 'text-gray-800 dark:text-gray-200'}`}>
                                                                {item.label}
                                                            </p>
                                                            <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                                                {Object.keys(item.values || {}).length} fields
                                                            </span>
                                                        </div>
                                                        <p className="text-xs opacity-75 mt-1 text-gray-600 dark:text-gray-400">{item.page}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="lg:col-span-2 space-y-3">
                                        {!selectedGlobalDefault ? (
                                            <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 px-4 py-6 text-sm text-gray-500 dark:text-gray-400">
                                                Select a page to edit its global default values.
                                            </div>
                                        ) : (
                                            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/40 p-4 space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{selectedGlobalDefault.label}</h4>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">Page key: {selectedGlobalDefault.page}</p>
                                                    </div>
                                                </div>

                                                {Object.entries(editingDefaultValues).length === 0 ? (
                                                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-sm text-gray-500 dark:text-gray-400">
                                                        This page has no structured default fields yet.
                                                    </div>
                                                ) : (
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                        {Object.entries(editingDefaultValues).map(([key, value]) => {
                                                            const originalValue = defaultValues[key]
                                                            const isNumberField = typeof originalValue === 'number' || typeof value === 'number'
                                                            const isBooleanField = typeof originalValue === 'boolean' || typeof value === 'boolean'
                                                            return (
                                                                <div key={key}>
                                                                    <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                                                                        {formatDefaultFieldLabel(key)}
                                                                    </label>
                                                                    {isBooleanField ? (
                                                                        <CustomSelect
                                                                            value={editingDefaultValues[key] ? 'true' : 'false'}
                                                                            onChange={(nextValue) => {
                                                                                setEditingDefaultValues((prev) => ({ ...prev, [key]: nextValue === 'true' }))
                                                                            }}
                                                                            options={booleanSelectOptions}
                                                                            placeholder="Select value"
                                                                            className="w-full text-sm"
                                                                        />
                                                                    ) : (
                                                                        <input
                                                                            type={isNumberField ? 'number' : 'text'}
                                                                            value={editingDefaultValues[key] ?? ''}
                                                                            onChange={(e) => {
                                                                                const nextValue = isNumberField
                                                                                    ? (e.target.value === '' ? '' : Number(e.target.value))
                                                                                    : e.target.value
                                                                                setEditingDefaultValues((prev) => ({ ...prev, [key]: nextValue }))
                                                                            }}
                                                                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200"
                                                                        />
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}

                                                <div className="flex items-center justify-end gap-2 pt-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingDefaultValues({ ...(defaultValues || {}) })}
                                                        disabled={savingGlobalDefault || !selectedDefaultPage}
                                                        className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-medium disabled:opacity-50"
                                                    >
                                                        Reset
                                                    </button>
                                                    <button
                                                        onClick={saveGlobalDefaultValues}
                                                        disabled={savingGlobalDefault || !selectedDefaultPage}
                                                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium disabled:opacity-50"
                                                    >
                                                        {savingGlobalDefault ? 'Saving...' : 'Save Global Defaults'}
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'dbrestore' && (
                        <div className="space-y-6">
                            <div>
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <span className="text-2xl">🛠️</span> Database Restore
                                </h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                    Restore from a PostgreSQL .dump, .backup, or .sql file with non-destructive merge behavior.
                                </p>
                            </div>

                            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-red-200 dark:border-red-700 p-4 sm:p-5 space-y-4">
                                <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 p-3">
                                    <p className="text-sm font-semibold text-red-700 dark:text-red-300">Critical Operation</p>
                                    <p className="text-xs text-red-600 dark:text-red-300 mt-1">
                                        Existing rows are not overwritten; duplicates are skipped, and missing rows are inserted.
                                    </p>
                                </div>

                                <div>
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Restore Scope</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setRestoreScope('clinic')}
                                            className={`text-left rounded-xl border p-3 transition-colors ${
                                                restoreScope === 'clinic'
                                                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/25'
                                                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 hover:border-blue-400 dark:hover:border-blue-600'
                                            }`}
                                        >
                                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Restore Selected Clinic</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Restore records scoped to one clinic only.</p>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setRestoreScope('whole')}
                                            className={`text-left rounded-xl border p-3 transition-colors ${
                                                restoreScope === 'whole'
                                                    ? 'border-red-500 bg-red-50 dark:bg-red-900/25'
                                                    : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 hover:border-red-400 dark:hover:border-red-600'
                                            }`}
                                        >
                                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Restore Whole Database</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Merge all clinics and shared data from the dump.</p>
                                        </button>
                                    </div>
                                </div>

                                {restoreScope === 'clinic' && (
                                <div>
                                    <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Select Clinic</p>
                                    {clinics.length === 0 ? (
                                        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-3 py-4 text-xs text-gray-500 dark:text-gray-400">
                                            {refreshing ? 'Loading clinics...' : 'No clinics available for restore.'}
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                                            {clinics.map((clinic) => {
                                                const isSelected = selectedRestoreClinicId === clinic.id
                                                return (
                                                    <button
                                                        key={clinic.id}
                                                        type="button"
                                                        onClick={() => setSelectedRestoreClinicId(clinic.id)}
                                                        className={`text-left rounded-xl border p-3 transition-colors ${
                                                            isSelected
                                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/25'
                                                                : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 hover:border-blue-400 dark:hover:border-blue-600'
                                                        }`}
                                                    >
                                                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{clinic.name}</p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Clinic Code: {clinic.clinicId}</p>
                                                        <div className="mt-2 flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
                                                            <span>Status: {clinic.status}</span>
                                                            <span>Users: {clinic._count?.users || 0}</span>
                                                        </div>
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div className="rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 flex items-center gap-3">
                                        <input
                                            key={restoreFileInputKey}
                                            id="db-restore-file-input"
                                            type="file"
                                            accept=".dump,.backup,.sql,application/sql"
                                            onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                                            className="hidden"
                                        />
                                        <label
                                            htmlFor="db-restore-file-input"
                                            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white text-xs font-semibold cursor-pointer transition-colors"
                                        >
                                            Choose File
                                        </label>
                                        <span className="text-xs text-gray-600 dark:text-gray-300 truncate">
                                            {restoreFile?.name || 'No file selected'}
                                        </span>
                                    </div>
                                    <input
                                        type="text"
                                        value={restoreConfirmText}
                                        onChange={(e) => setRestoreConfirmText(e.target.value)}
                                        placeholder={restoreScope === 'whole' ? 'Type RESTORE to confirm whole database restore' : 'Type RESTORE to confirm clinic restore'}
                                        className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-sm"
                                    />
                                </div>

                                {restoreScope === 'clinic' && selectedRestoreClinicId && (
                                    <div className="rounded-xl border border-blue-200 dark:border-blue-700 bg-blue-50/70 dark:bg-blue-900/20 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
                                        Selected clinic: {clinics.find((clinic) => clinic.id === selectedRestoreClinicId)?.name || 'Unknown'}
                                        {' '}({clinics.find((clinic) => clinic.id === selectedRestoreClinicId)?.clinicId || 'N/A'})
                                    </div>
                                )}

                                {restoreScope === 'whole' && (
                                    <div className="rounded-xl border border-red-200 dark:border-red-700 bg-red-50/70 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                                        Whole database mode selected: restore will attempt to merge all dump tables into current database.
                                    </div>
                                )}

                                <div className="flex flex-wrap items-center justify-end gap-2">
                                    {(restoreLoading || !!restoreJob || !!restoreJobId) && (
                                        <button
                                            type="button"
                                            onClick={() => setShowRestoreProgressModal(true)}
                                            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl text-sm font-medium"
                                        >
                                            Track Progress
                                        </button>
                                    )}
                                    <button
                                        onClick={restoreDatabaseFromDump}
                                        disabled={restoreLoading || !restoreFile || (restoreScope === 'clinic' && !selectedRestoreClinicId)}
                                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium disabled:opacity-50"
                                    >
                                        {restoreLoading
                                            ? 'Starting Restore...'
                                            : (restoreScope === 'whole' ? 'Restore Whole Database' : 'Restore Selected Clinic')}
                                    </button>
                                </div>

                                {restoreFile && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">Selected file: {restoreFile.name}</p>
                                )}

                                {restoreOutput && (
                                    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3">
                                        <p className="text-xs font-semibold text-gray-600 dark:text-gray-300 mb-2">Restore Output</p>
                                        <pre className="text-xs whitespace-pre-wrap text-gray-700 dark:text-gray-300">{restoreOutput}</pre>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'coupons' && (
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                        <span className="text-2xl">🏷️</span> Coupon Policies
                                    </h2>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Create and manage discount coupons for registration, upgrades, and AI OCR add-ons.</p>
                                </div>
                                <button onClick={fetchCoupons} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl transition-colors text-sm font-medium">Refresh</button>
                            </div>

                            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 sm:p-5 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
                                <input
                                    type="text"
                                    value={couponCode}
                                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                                    placeholder="Coupon code"
                                    className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-sm"
                                />
                                <CustomSelect
                                    value={couponType}
                                    onChange={(value) => setCouponType(value as 'percent' | 'flat')}
                                    options={couponTypeOptions}
                                    placeholder="Coupon type"
                                    className="text-sm"
                                />
                                <input
                                    type="number"
                                    min={1}
                                    value={couponValue}
                                    onChange={(e) => setCouponValue(Number(e.target.value || 0))}
                                    placeholder="Discount"
                                    className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-sm"
                                />
                                <div className="space-y-2">
                                    <CustomSelect
                                        value={couponContextPicker}
                                        onChange={(value) => {
                                            setCouponContextPicker(value)
                                            setCouponContexts((prev) => (prev.includes(value) ? prev : [...prev, value]))
                                        }}
                                        options={couponContextOptions}
                                        placeholder="Add coupon context"
                                        className="text-sm"
                                    />
                                    <div className="flex flex-wrap gap-1.5">
                                        {couponContexts.map((context) => {
                                            const matched = couponContextOptions.find((option) => option.value === context)
                                            return (
                                                <button
                                                    key={context}
                                                    type="button"
                                                    onClick={() => {
                                                        setCouponContexts((prev) => {
                                                            if (prev.length <= 1) return prev
                                                            return prev.filter((item) => item !== context)
                                                        })
                                                    }}
                                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700"
                                                    title="Click to remove context"
                                                >
                                                    <span>{matched?.label || context}</span>
                                                    {couponContexts.length > 1 && <span>×</span>}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                                <button onClick={createCoupon} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-medium">Create Coupon</button>
                            </div>

                            <div className="space-y-2">
                                {coupons.length === 0 ? (
                                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-8 text-center text-sm text-gray-500 dark:text-gray-400">No coupons configured yet.</div>
                                ) : coupons.map((coupon) => (
                                    <div key={coupon.code} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div>
                                            <p className="font-semibold text-gray-900 dark:text-white">{coupon.code}</p>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                {coupon.discountType === 'percent' ? `${coupon.discountValue}%` : `Rs ${coupon.discountValue}`} • {coupon.appliesTo.join(', ')} • Used: {coupon.usedCount || 0}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => toggleCoupon(coupon.code, !coupon.active)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${coupon.active ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                                            >
                                                {coupon.active ? 'Active' : 'Inactive'}
                                            </button>
                                            <button onClick={() => removeCoupon(coupon.code)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">Delete</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            {showRestoreProgressModal && (restoreLoading || !!restoreJob || !!restoreJobId) && (
                <div className="fixed inset-0 bg-black/55 backdrop-blur-sm flex items-center justify-center p-4 z-[10000]">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-6xl w-full p-6 max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                                    {restoreJob?.scope === 'whole' ? 'Whole Database Restore Progress & Table Preview' : 'Clinic Restore Progress & Table Preview'}
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    {restoreJob
                                        ? (restoreJob.scope === 'whole'
                                            ? 'Whole database merge'
                                            : `${restoreJob.clinicName} (${restoreJob.clinicCode})`)
                                        : 'Starting restore job...'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowRestoreProgressModal(false)}
                                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                Close
                            </button>
                        </div>

                        <div className="mt-4 grid grid-cols-1 xl:grid-cols-3 gap-4 overflow-hidden flex-1">
                            <div className="xl:col-span-1 space-y-3 overflow-y-auto pr-1">
                                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 space-y-3">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold text-gray-700 dark:text-gray-300">
                                            {restoreJob?.message || 'Initializing restore job...'}
                                        </span>
                                        <span
                                            className={`px-2 py-0.5 rounded-full font-semibold ${
                                                restoreJob?.status === 'failed'
                                                    ? 'bg-red-100 dark:bg-red-900/25 text-red-700 dark:text-red-300'
                                                    : restoreJob?.status === 'completed'
                                                        ? 'bg-green-100 dark:bg-green-900/25 text-green-700 dark:text-green-300'
                                                        : 'bg-blue-100 dark:bg-blue-900/25 text-blue-700 dark:text-blue-300'
                                            }`}
                                        >
                                            {(restoreJob?.status || 'running').toUpperCase()}
                                        </span>
                                    </div>

                                    <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-300 ${restoreJob?.status === 'failed' ? 'bg-red-500' : 'bg-blue-600'}`}
                                            style={{ width: `${Math.max(0, Math.min(100, Number(restoreJob?.percent ?? (restoreLoading ? 5 : 0))))}%` }}
                                        />
                                    </div>

                                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                                        Phase: {restoreJob?.phase || 'queued'} • Progress: {Math.max(0, Math.min(100, Number(restoreJob?.percent ?? (restoreLoading ? 5 : 0))))}%
                                    </div>
                                </div>

                                {!!restoreJob?.result && (
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div className="rounded-lg bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 px-3 py-2">
                                            <p className="text-gray-500 dark:text-gray-400">Scanned Rows</p>
                                            <p className="font-semibold text-gray-900 dark:text-white">{restoreJob.result.scannedRows}</p>
                                        </div>
                                        <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 px-3 py-2">
                                            <p className="text-green-700 dark:text-green-300">Inserted Rows</p>
                                            <p className="font-semibold text-green-800 dark:text-green-200">{restoreJob.result.insertedRows}</p>
                                        </div>
                                        <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-2">
                                            <p className="text-amber-700 dark:text-amber-300">Skipped Rows</p>
                                            <p className="font-semibold text-amber-800 dark:text-amber-200">{restoreJob.result.skippedRows}</p>
                                        </div>
                                        <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 px-3 py-2">
                                            <p className="text-blue-700 dark:text-blue-300">Tables Done</p>
                                            <p className="font-semibold text-blue-800 dark:text-blue-200">{restoreProcessedTables}/{restoreTableSummaries.length || 0}</p>
                                        </div>
                                        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 px-3 py-2">
                                            <p className="text-emerald-700 dark:text-emerald-300">Tables Changed</p>
                                            <p className="font-semibold text-emerald-800 dark:text-emerald-200">{restoreChangedTables}</p>
                                        </div>
                                        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 px-3 py-2">
                                            <p className="text-red-700 dark:text-red-300">Tables With Errors</p>
                                            <p className="font-semibold text-red-800 dark:text-red-200">{restoreErrorTables}</p>
                                        </div>
                                    </div>
                                )}

                                <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-3 max-h-56 overflow-y-auto">
                                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Progress Log</p>
                                    <pre className="text-[11px] whitespace-pre-wrap text-gray-600 dark:text-gray-300">
                                        {restoreJob?.logs?.length ? restoreJob.logs.join('\n') : 'Waiting for updates...'}
                                    </pre>
                                </div>

                                {restoreJob?.error && (
                                    <div className="rounded-lg border border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                                        {restoreJob.error}
                                    </div>
                                )}
                            </div>

                            <div className="xl:col-span-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/30 p-3 flex flex-col overflow-hidden">
                                <div className="flex items-center justify-between gap-3 mb-3">
                                    <div>
                                        <p className="text-sm font-semibold text-gray-900 dark:text-white">Per-Table Preview & Review</p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            Review table-level impact before completion and audit final changes after restore.
                                        </p>
                                    </div>
                                    <label className="inline-flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                                        <input
                                            type="checkbox"
                                            checked={showOnlyChangedRestoreTables}
                                            onChange={(e) => setShowOnlyChangedRestoreTables(e.target.checked)}
                                            className="rounded border-gray-300 dark:border-gray-600"
                                        />
                                        Show changed/error tables only
                                    </label>
                                </div>

                                <div className="flex-1 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
                                    {restorePreviewRows.length === 0 ? (
                                        <div className="p-4 text-xs text-gray-500 dark:text-gray-400">
                                            {showOnlyChangedRestoreTables
                                                ? 'No changed/error tables yet. Disable the filter to see all tables.'
                                                : 'No table preview available yet. This appears after scoping starts.'}
                                        </div>
                                    ) : (
                                        <table className="min-w-full text-xs">
                                            <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
                                                <tr>
                                                    <th className="text-left px-3 py-2 font-semibold">Table</th>
                                                    <th className="text-left px-3 py-2 font-semibold">Status</th>
                                                    <th className="text-right px-3 py-2 font-semibold">Scanned</th>
                                                    <th className="text-right px-3 py-2 font-semibold">Inserted</th>
                                                    <th className="text-right px-3 py-2 font-semibold">Skipped</th>
                                                    <th className="text-right px-3 py-2 font-semibold">Errors</th>
                                                    <th className="text-left px-3 py-2 font-semibold">Timing</th>
                                                    <th className="text-left px-3 py-2 font-semibold">Review Note</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {restorePreviewRows.map((table) => {
                                                    const status = table.status || 'pending'
                                                    const statusClass =
                                                        status === 'completed'
                                                            ? 'bg-green-100 dark:bg-green-900/25 text-green-700 dark:text-green-300'
                                                            : status === 'processing'
                                                                ? 'bg-blue-100 dark:bg-blue-900/25 text-blue-700 dark:text-blue-300'
                                                                : status === 'skipped'
                                                                    ? 'bg-amber-100 dark:bg-amber-900/25 text-amber-700 dark:text-amber-300'
                                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'

                                                    const timingText = table.startedAt
                                                        ? `${new Date(table.startedAt).toLocaleTimeString()}${table.finishedAt ? ` -> ${new Date(table.finishedAt).toLocaleTimeString()}` : ''}`
                                                        : '-'

                                                    return (
                                                        <tr key={table.table} className="border-t border-gray-100 dark:border-gray-800">
                                                            <td className="px-3 py-2 font-semibold text-gray-900 dark:text-white">{table.table}</td>
                                                            <td className="px-3 py-2">
                                                                <span className={`px-2 py-0.5 rounded-full font-medium ${statusClass}`}>
                                                                    {status.toUpperCase()}
                                                                </span>
                                                            </td>
                                                            <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">{table.scannedRows}</td>
                                                            <td className="px-3 py-2 text-right font-semibold text-green-700 dark:text-green-300">{table.insertedRows}</td>
                                                            <td className="px-3 py-2 text-right text-amber-700 dark:text-amber-300">{table.skippedRows}</td>
                                                            <td className="px-3 py-2 text-right text-red-700 dark:text-red-300">{table.errors}</td>
                                                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">{timingText}</td>
                                                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{table.note || '-'}</td>
                                                        </tr>
                                                    )
                                                })}
                                            </tbody>
                                        </table>
                                    )}
                                </div>

                                {!!restoreTableSummaries.length && (
                                    <div className="mt-2 text-[11px] text-gray-500 dark:text-gray-400">
                                        Review totals: {restoreTableSummaries.length} table(s) • Changed: {restoreChangedTables} • Skipped: {restoreSkippedTables} • Error tables: {restoreErrorTables}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showEditAccessCodeModal && selectedClinic && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                            Edit Access Code
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">
                            Clinic: <span className="font-semibold">{selectedClinic.name}</span>
                        </p>
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                New Access Code (6 characters)
                            </label>
                            <input
                                type="text"
                                value={newAccessCode}
                                onChange={(e) => setNewAccessCode(e.target.value.slice(0, 6).toUpperCase())}
                                maxLength={6}
                                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white font-mono text-lg"
                                placeholder="ABC123"
                            />
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => {
                                    setShowEditAccessCodeModal(false)
                                    setSelectedClinic(null)
                                    setNewAccessCode('')
                                }}
                                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={updateClinicAccessCode}
                                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl transition-colors"
                            >
                                Update Code
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showResetPasswordModal && selectedUser && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                            Reset Password
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-2">
                            User: <span className="font-semibold">{selectedUser.name}</span>
                        </p>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">
                            Email: <span className="font-semibold">{selectedUser.email}</span>
                        </p>
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                New Password (min 6 characters)
                            </label>
                            <div className="relative">
                                <input
                                    type={showResetPassword ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-4 py-3 pr-12 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-purple-500 dark:bg-gray-700 dark:text-white"
                                    placeholder="Enter new password"
                                />
                                <button type="button" tabIndex={-1} onClick={() => setShowResetPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                                    {showResetPassword ? (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>) : (<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>)}
                                </button>
                            </div>
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => {
                                    setShowResetPasswordModal(false)
                                    setSelectedUser(null)
                                    setNewPassword('')
                                }}
                                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={resetUserPassword}
                                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors"
                            >
                                Reset Password
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showDeleteUserModal && selectedUser && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
                        <h3 className="text-xl font-bold text-red-600 dark:text-red-500 mb-4">
                            Delete User
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-2">
                            User: <span className="font-semibold">{selectedUser.name}</span>
                        </p>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">
                            Email: <span className="font-semibold">{selectedUser.email}</span>
                        </p>
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4 mb-4">
                            <p className="text-red-800 dark:text-red-400 text-sm font-medium mb-2">
                                ⚠️ Warning: This action cannot be undone!
                            </p>
                            <p className="text-red-700 dark:text-red-500 text-sm">
                                All data associated with this user will be permanently deleted.
                            </p>
                        </div>
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Type <span className="font-mono font-bold">DELETE</span> to confirm
                            </label>
                            <input
                                type="text"
                                value={deleteConfirmText}
                                onChange={(e) => setDeleteConfirmText(e.target.value)}
                                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-red-500 dark:bg-gray-700 dark:text-white"
                                placeholder="DELETE"
                            />
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => {
                                    setShowDeleteUserModal(false)
                                    setSelectedUser(null)
                                    setDeleteConfirmText('')
                                }}
                                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={deleteUser}
                                disabled={deleteConfirmText !== 'DELETE'}
                                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Delete User
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showChangeRoleModal && selectedUser && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                            Change User Role
                        </h3>
                        <p className="text-gray-600 dark:text-gray-400 mb-2">
                            User: <span className="font-semibold">{selectedUser.name}</span>
                        </p>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">
                            Current Role: <span className="font-semibold capitalize">{selectedUser.role}</span>
                        </p>
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                New Role
                            </label>
                            <CustomSelect
                                value={newRole}
                                onChange={setNewRole}
                                options={roleOptions}
                                placeholder="Select role"
                                className="w-full"
                            />
                        </div>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => {
                                    setShowChangeRoleModal(false)
                                    setSelectedUser(null)
                                    setNewRole('')
                                }}
                                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={changeUserRole}
                                className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl transition-colors"
                            >
                                Change Role
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

