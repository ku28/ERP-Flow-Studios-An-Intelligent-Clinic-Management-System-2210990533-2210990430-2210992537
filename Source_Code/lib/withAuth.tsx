import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../contexts/AuthContext'

// Higher-order component to protect pages - REQUIRES AUTHENTICATION
export function withAuth(Component: any, allowedRoles: string[] = []) {
    return function ProtectedPage(props: any) {
        const router = useRouter()
        const { user, loading } = useAuth()

        useEffect(() => {
            if (loading) return // Wait for auth check

            if (!user) {
                // Not logged in - redirect to login
                router.push('/login')
                return
            }

            // Check if user has required role (if roles specified)
            if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
                // Not authorized for this page
                alert(`Access Denied: This page requires ${allowedRoles.join(' or ')} role.`)
                router.push('/dashboard')
                return
            }
        }, [user, loading, router])

        // Don't show anything while checking auth or if no user
        if (loading || !user) {
            return null
        }

        return <Component {...props} user={user} />
    }
}

// Specific role requirements
export function requireAdmin(Component: any) {
    return withAuth(Component, ['admin'])
}

export function requireDoctorOrAdmin(Component: any) {
    return withAuth(Component, ['admin', 'doctor'])
}

export function requireStaffOrAbove(Component: any) {
    return withAuth(Component, ['admin', 'doctor', 'staff'])
}

// Check if user can access a route (client-side)
export function canAccessRoute(userRole: string, route: string): boolean {
    const restrictedRoutes: Record<string, string[]> = {
        '/treatments': ['admin', 'doctor', 'staff'],
        '/products': ['admin', 'doctor', 'staff'],
        '/suppliers': ['admin', 'staff'],
        '/purchase-orders': ['admin', 'staff'],
        '/stock-transactions': ['admin', 'staff'],
        '/analytics': ['admin', 'doctor', 'staff'],
        '/users': ['admin'],
    }

    const allowedRoles = restrictedRoutes[route]
    if (!allowedRoles) return true // No restriction
    
    return allowedRoles.includes(userRole)
}
