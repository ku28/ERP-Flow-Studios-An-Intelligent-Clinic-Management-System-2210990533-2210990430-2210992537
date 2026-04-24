import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../../../contexts/AuthContext'

export default function ClinicBrandingRedirectPage() {
    const router = useRouter()
    const { user: authUser, loading: authLoading } = useAuth()
    const clinicId = typeof router.query.clinicId === 'string' ? router.query.clinicId : ''

    useEffect(() => {
        if (!router.isReady || authLoading) return

        const currentClinicId = authUser?.clinic?.clinicId
        if (currentClinicId && clinicId && currentClinicId === clinicId) {
            router.replace('/clinic/branding-builder')
            return
        }

        if (clinicId) {
            router.replace(`/clinic-login?clinicId=${encodeURIComponent(clinicId)}`)
            return
        }

        router.replace('/clinic/branding-builder')
    }, [router.isReady, clinicId, authUser, authLoading])

    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Redirecting to Prescription Builder...</div>
}
