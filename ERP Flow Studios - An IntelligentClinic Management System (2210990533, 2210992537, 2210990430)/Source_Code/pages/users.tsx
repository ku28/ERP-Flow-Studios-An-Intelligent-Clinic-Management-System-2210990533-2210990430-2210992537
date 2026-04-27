import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useDataCache } from '../contexts/DataCacheContext'
import { canAssignRoleForBasicPlan, isBasicPlan } from '../lib/subscription'
import ThemedScrollArea from '../components/ThemedScrollArea'

export default function UsersPage() {
    const [users, setUsers] = useState<any[]>([])
    const { user } = useAuth()
    const { getCache, setCache } = useDataCache()
    const isBasicSubscription = isBasicPlan(user?.clinic?.subscriptionPlan)

    useEffect(() => {
        // Check cache first
        const cachedUsers = getCache<any[]>('users')
        if (cachedUsers) {
            setUsers(cachedUsers)
        }
        
        // Fetch users
        fetch('/api/users').then(r => r.json()).then(data => {
            setUsers(data)
            setCache('users', data)
        })
        
        // Cleanup on unmount
        return () => {
            setUsers([])
        }
    }, [])


    async function changeRole(id: any, role: string) {
        if (!user) return alert('Please login to change roles')

        if (isBasicSubscription) {
            const check = canAssignRoleForBasicPlan(role, users.map((u) => ({ id: u.id, role: u.role })), Number(id))
            if (!check.allowed) {
                alert(check.reason || 'Basic plan role limit reached')
                return
            }
        }

        await fetch('/api/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, role }) })
        const updatedUsers = await (await fetch('/api/users')).json()
        setUsers(updatedUsers)
        setCache('users', updatedUsers)
    }

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-sky-600 dark:from-blue-400 dark:to-sky-400">
                        User Management
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">Manage user roles and permissions</p>
                    {isBasicSubscription && (
                        <p className="text-xs text-cyan-700 dark:text-cyan-300 mt-2 font-medium">
                            Basic plan limit: 3 total users (1 Admin, 1 Doctor, 1 Staff)
                        </p>
                    )}
                </div>
            </div>
            <div className="relative rounded-xl border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-lg shadow-blue-500/5 backdrop-blur-sm p-4">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-xl"></div>
                <div className="relative">
                {!user && <div className="mb-2 text-sm text-gray-600">You must <a className="text-blue-600 underline hover:text-blue-700" href="/login">login</a> to change user roles.</div>}
                <ThemedScrollArea className="max-h-[44rem] pr-1">
                <ul>
                    {users.map(u => (
                        <li key={u.id} className="p-2 border-b border-blue-100 dark:border-blue-800 flex justify-between items-center">
                            <div>
                                <div className="font-medium">{u.name} · {u.email}</div>
                                <div className="text-sm text-gray-500">Role: {u.role}</div>
                            </div>
                            <div className="space-x-2">
                                <button
                                    onClick={() => changeRole(u.id, 'admin')}
                                    disabled={isBasicSubscription && !canAssignRoleForBasicPlan('admin', users.map((x) => ({ id: x.id, role: x.role })), Number(u.id)).allowed}
                                    className="px-2 py-1 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >Admin</button>
                                <button
                                    onClick={() => changeRole(u.id, 'doctor')}
                                    disabled={isBasicSubscription && !canAssignRoleForBasicPlan('doctor', users.map((x) => ({ id: x.id, role: x.role })), Number(u.id)).allowed}
                                    className="px-2 py-1 bg-gradient-to-r from-blue-500 to-sky-500 hover:from-blue-600 hover:to-sky-600 text-white rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >Doctor</button>
                                <button
                                    onClick={() => changeRole(u.id, 'staff')}
                                    disabled={isBasicSubscription && !canAssignRoleForBasicPlan('staff', users.map((x) => ({ id: x.id, role: x.role })), Number(u.id)).allowed}
                                    className="px-2 py-1 bg-gradient-to-r from-blue-400 to-sky-400 hover:from-blue-500 hover:to-sky-500 text-white rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >Staff</button>
                            </div>
                        </li>
                    ))}
                </ul>
                </ThemedScrollArea>
                </div>
            </div>
        </div>
    )
}

