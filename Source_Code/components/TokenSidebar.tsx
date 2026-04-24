import { useState, useEffect } from 'react'
import ToastNotification from './ToastNotification'
import { useToast } from '../hooks/useToast'
import CustomSelect from './CustomSelect'
import { formatPatientId } from '../lib/utils'

interface TokenAssignment {
    id: number
    patientId: number
    tokenNumber: number
    date: string
    status: string
    createdAt: string
    patient: {
        id: number
        firstName: string
        lastName: string
        phone: string
        email: string
        opdNo: string
        imageUrl: string
        age: number
        gender: string
    }
}

interface TokenSidebarProps {
    isOpen: boolean
    onClose: () => void
}

export default function TokenSidebar({ isOpen, onClose }: TokenSidebarProps) {
    const [tokens, setTokens] = useState<TokenAssignment[]>([])
    const [patients, setPatients] = useState<any[]>([])
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isAnimating, setIsAnimating] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [sendingWhatsApp, setSendingWhatsApp] = useState<number | null>(null)
    const [confirmModal, setConfirmModal] = useState<{ open: boolean; id?: number; message?: string }>({ open: false })
    const [confirmModalAnimating, setConfirmModalAnimating] = useState(false)
    const [editingId, setEditingId] = useState<number | null>(null)
    const { toasts, removeToast, showSuccess, showError } = useToast()
    
    const emptyForm = { patientId: '', tokenNumber: '', status: 'waiting' }
    const [form, setForm] = useState(emptyForm)

    // Fetch tokens for today
    const fetchTokens = async () => {
        setLoading(true)
        const today = new Date().toISOString().split('T')[0]
        try {
            const res = await fetch(`/api/tokens?date=${today}`)
            const data = await res.json()
            setTokens(Array.isArray(data) ? data : [])
        } catch (error) {
        } finally {
            setLoading(false)
        }
    }

    // Fetch all patients
    useEffect(() => { 
        if (isOpen) {
            fetchTokens()
            fetch('/api/patients')
                .then(r => r.json())
                .then(data => {
                    setPatients(Array.isArray(data) ? data : [])
                })
                .catch(console.error)
        }
    }, [isOpen])

    // Listen for token updates to refresh cache
    useEffect(() => {
        const handleTokenUpdate = () => {
            if (isOpen) {
                fetchTokens()
            }
        }

        window.addEventListener('token-updated', handleTokenUpdate)
        return () => window.removeEventListener('token-updated', handleTokenUpdate)
    }, [isOpen])

    function openModal() {
        setIsModalOpen(true)
        setTimeout(() => setIsAnimating(true), 10)
    }

    function closeModal() {
        setIsAnimating(false)
        setTimeout(() => {
            setIsModalOpen(false)
            setEditingId(null)
            setForm(emptyForm)
        }, 300)
    }

    function editToken(token: TokenAssignment) {
        setEditingId(token.id)
        setForm({
            patientId: String(token.patientId),
            tokenNumber: String(token.tokenNumber),
            status: token.status || 'waiting'
        })
        openModal()
    }

    const sendWhatsAppMessage = async (phone: string, message: string, tokenId?: number) => {
        if (tokenId) setSendingWhatsApp(tokenId)
        
        try {
            const response = await fetch('/api/whatsapp/send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    phone,
                    message
                })
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Failed to send WhatsApp message')
            }

            if (data.simulatedSend) {
                showSuccess('WhatsApp API not configured. Message logged to console.')
            } else {
                showSuccess('WhatsApp message sent successfully!')
            }
        } catch (error: any) {
            showError(error.message || 'Failed to send WhatsApp message')
        } finally {
            if (tokenId) setSendingWhatsApp(null)
        }
    }

    async function submitToken(e: any) {
        e.preventDefault()
        
        if (!form.patientId || !form.tokenNumber) {
            showError('Please select a patient and enter a token number')
            return
        }

        // Get selected patient
        const selectedPatient = patients.find(p => String(p.id) === String(form.patientId))
        
        setSubmitting(true)
        try {
            const today = new Date().toISOString().split('T')[0]
            const payload = {
                patientId: Number(form.patientId),
                tokenNumber: Number(form.tokenNumber),
                status: form.status,
                date: today
            }

            const method = editingId ? 'PUT' : 'POST'
            const body = editingId ? { id: editingId, ...payload } : payload

            const res = await fetch('/api/tokens', {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            })

            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error || 'Failed to assign token')
            }

            // Refresh tokens list
            await fetchTokens()
            
            // Dispatch event to update cache in other components
            window.dispatchEvent(new CustomEvent('token-updated'))
            
            showSuccess(editingId ? 'Token updated successfully' : 'Token assigned successfully')
            
            // Send WhatsApp message if it's a new token assignment (not edit) and patient has phone
            if (!editingId && selectedPatient) {
                if (selectedPatient.phone) {
                    const message = `Hello ${(`${selectedPatient.firstName || ''} ${selectedPatient.lastName || ''}`).trim()},\n\nYour token number is *${form.tokenNumber}* for today's appointment.\n\nPlease wait for your turn. You will be notified when the doctor is ready to see you.\n\nThank you!`
                    await sendWhatsAppMessage(selectedPatient.phone, message)
                } else {
                    showError(`Token assigned but no phone number available for ${`${selectedPatient.firstName || ''} ${selectedPatient.lastName || ''}`.trim()}. Cannot send WhatsApp notification.`)
                }
            }
            
            closeModal()
        } catch (err: any) {
            showError(err?.message || 'Failed to assign token')
        } finally {
            setSubmitting(false)
        }
    }

    async function sendCallNotification(token: TokenAssignment) {
        if (!token.patient?.phone) {
            showError(`No phone number available for ${`${token.patient?.firstName || ''} ${token.patient?.lastName || ''}`.trim()}`)
            return
        }

        const message = `Hello ${(`${token.patient.firstName || ''} ${token.patient.lastName || ''}`).trim()},\n\n🩺 *The doctor is ready to see you now!*\n\nYour token number: *${token.tokenNumber}*\n\nPlease proceed to the consultation room.\n\nThank you!`
        
        await sendWhatsAppMessage(token.patient.phone, message, token.id)
    }

    async function deleteToken(id: number) {
        setConfirmModal({ open: true, id, message: 'Are you sure you want to remove this token assignment?' })
        setTimeout(() => setConfirmModalAnimating(true), 10)
    }

    function closeConfirmModal() {
        setConfirmModalAnimating(false)
        setTimeout(() => setConfirmModal({ open: false }), 300)
    }

    async function handleConfirmDelete(id?: number) {
        if (!id) {
            closeConfirmModal()
            return
        }
        setDeleting(true)
        try {
            const response = await fetch('/api/tokens', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            })
            if (response.ok) {
                await fetchTokens()
                // Dispatch event to update cache in other components
                window.dispatchEvent(new CustomEvent('token-updated'))
                showSuccess('Token removed successfully')
                closeConfirmModal()
            } else {
                showError('Failed to remove token')
            }
        } catch (error) {
            showError('Failed to remove token')
        } finally {
            setDeleting(false)
        }
    }

    // Filter logic
    const filteredTokens = tokens.filter(t => {
        if (!searchQuery) return true
        const search = searchQuery.toLowerCase()
        return (
            String(t.tokenNumber).includes(search) ||
            t.patient?.firstName?.toLowerCase().includes(search) ||
            t.patient?.lastName?.toLowerCase().includes(search) ||
            t.patient?.opdNo?.toLowerCase().includes(search) ||
            t.patient?.phone?.toLowerCase().includes(search)
        )
    })

    const getNextTokenNumber = () => {
        if (tokens.length === 0) return 1
        const maxToken = Math.max(...tokens.map(t => t.tokenNumber))
        return maxToken + 1
    }

    if (!isOpen) return null

    return (
        <>
            {/* Overlay with blue tint */}
            <div 
                className={`fixed inset-0 bg-gradient-to-br from-black/60 via-blue-950/30 to-black/60 backdrop-blur-sm transition-all duration-500 ease-out z-40 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                onClick={onClose}
            />

            {/* Sidebar with futuristic blue glow */}
            <div 
                className={`fixed top-0 right-0 h-full w-full sm:w-[500px] bg-gradient-to-br from-gray-900 via-gray-950 to-black shadow-2xl transform transition-all duration-500 ease-out z-50 ${isOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'} border-l-2 border-blue-500/30`}
                style={{
                    boxShadow: isOpen ? '-10px 0 50px rgba(59,130,246, 0.2), -5px 0 20px rgba(37,99,235, 0.3)' : 'none'
                }}
            >
                <ToastNotification toasts={toasts} removeToast={removeToast} />

                {/* Futuristic Header with blue glow */}
                <div className="sticky top-0 bg-gradient-to-r from-blue-950/90 via-gray-900/90 to-blue-950/90 backdrop-blur-xl border-b-2 border-blue-500/30 px-6 py-4 flex items-center justify-between z-10 shadow-lg shadow-blue-500/10">
                    <div>
                        <h2 className="text-lg font-bold bg-gradient-to-r from-blue-400 via-sky-400 to-blue-500 bg-clip-text text-transparent flex items-center gap-2">
                            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse shadow-lg shadow-blue-500/50"></span>
                            Token Queue
                        </h2>
                        <p className="text-xs text-blue-400/70 mt-0.5 font-medium">
                            {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="group p-2 rounded-full bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 transition-all duration-300 text-blue-400 hover:text-blue-300 hover:rotate-90 hover:scale-110"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="h-[calc(100%-73px)] overflow-y-auto px-6 py-4 space-y-4">
                    {/* Futuristic Stats with blue glow */}
                    <div className="grid grid-cols-4 gap-2">
                        <div className="text-center p-3 rounded-lg bg-gradient-to-br from-blue-500/10 to-sky-500/5 border border-blue-500/30 backdrop-blur-sm shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 transition-all duration-300 hover:scale-105">
                            <div className="text-xs text-blue-400/70 mb-1 font-medium">Total</div>
                            <div className="text-xl font-bold text-blue-400">{tokens.length}</div>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-gradient-to-br from-yellow-500/10 to-amber-500/5 border border-yellow-500/30 backdrop-blur-sm shadow-lg shadow-yellow-500/10 hover:shadow-yellow-500/20 transition-all duration-300 hover:scale-105">
                            <div className="text-xs text-yellow-400/70 mb-1 font-medium">Wait</div>
                            <div className="text-xl font-bold text-yellow-400">{tokens.filter(t => t.status === 'waiting').length}</div>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/30 backdrop-blur-sm shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 transition-all duration-300 hover:scale-105">
                            <div className="text-xs text-blue-400/70 mb-1 font-medium">Now</div>
                            <div className="text-xl font-bold text-blue-400">{tokens.filter(t => t.status === 'in-progress').length}</div>
                        </div>
                        <div className="text-center p-3 rounded-lg bg-gradient-to-br from-sky-500/10 to-blue-500/5 border border-sky-500/30 backdrop-blur-sm shadow-lg shadow-sky-500/10 hover:shadow-sky-500/20 transition-all duration-300 hover:scale-105">
                            <div className="text-xs text-sky-400/70 mb-1 font-medium">Done</div>
                            <div className="text-xl font-bold text-sky-400">{tokens.filter(t => t.status === 'completed').length}</div>
                        </div>
                    </div>

                    {/* Futuristic Assign Token Button */}
                    <button
                        onClick={() => {
                            setForm({ ...emptyForm, tokenNumber: String(getNextTokenNumber()) })
                            openModal()
                        }}
                        className="group relative w-full px-4 py-3 bg-gradient-to-r from-blue-500 via-sky-500 to-blue-600 hover:from-blue-400 hover:via-sky-400 hover:to-blue-500 text-white rounded-lg transition-all duration-300 font-bold text-sm shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-[1.02] flex items-center justify-center gap-2 border border-blue-400/50"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-lg"></div>
                        <svg className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="relative">Assign Token</span>
                    </button>

                    {/* Futuristic Search */}
                    <div className="relative group">
                        <input
                            type="text"
                            placeholder="Search tokens..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full px-4 py-2.5 pl-10 border-2 border-blue-500/30 rounded-lg bg-gray-900/50 backdrop-blur-sm text-sm text-gray-200 placeholder-blue-400/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all duration-300 group-hover:border-blue-500/50"
                        />
                        <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-blue-400/70 group-hover:text-blue-400 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>

                    {/* Futuristic Tokens List */}
                    <div className="space-y-2">
                        {loading ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="relative">
                                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500/20 border-t-blue-500"></div>
                                    <div className="absolute inset-0 animate-ping rounded-full h-12 w-12 border-4 border-blue-500/20"></div>
                                </div>
                            </div>
                        ) : filteredTokens.length === 0 ? (
                            <div className="text-center py-12 text-blue-400/50 text-sm font-medium">
                                {searchQuery ? 'No tokens found' : 'No tokens assigned yet'}
                            </div>
                        ) : (
                            filteredTokens.map((token, index) => (
                                <div 
                                    key={token.id} 
                                    className="group bg-gradient-to-br from-gray-900/80 via-gray-900/60 to-gray-900/80 border-2 border-blue-500/20 rounded-lg p-4 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-300 backdrop-blur-sm hover:scale-[1.02]"
                                    style={{
                                        animationDelay: `${index * 50}ms`,
                                        animation: isOpen ? 'slideInRight 0.3s ease-out forwards' : 'none'
                                    }}
                                >
                                    <div className="flex items-center gap-3">
                                        {/* Futuristic Token Badge */}
                                        <div className="relative flex-shrink-0 w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 via-sky-500 to-blue-600 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-blue-500/50 group-hover:scale-110 transition-transform duration-300">
                                            <div className="absolute inset-0 rounded-full bg-gradient-to-r from-blue-400 to-sky-400 opacity-0 group-hover:opacity-50 animate-pulse"></div>
                                            <span className="relative">{token.tokenNumber}</span>
                                        </div>

                                        {/* Patient Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-bold text-blue-100 text-sm truncate">
                                                    {[token.patient?.firstName, token.patient?.lastName].filter(Boolean).join(' ') || 'Unknown'}
                                                </h3>
                                                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                                                    token.status === 'waiting' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' :
                                                    token.status === 'in-progress' ? 'bg-blue-500/20 text-blue-400 border-blue-500/50' :
                                                    'bg-sky-500/20 text-sky-400 border-sky-500/50'
                                                }`}>
                                                    {token.status === 'in-progress' ? 'In Progress' : token.status.charAt(0).toUpperCase() + token.status.slice(1)}
                                                </span>
                                            </div>
                                            
                                            <div className="flex items-center gap-3 mt-1 text-xs text-blue-400/60">
                                                {token.patient?.opdNo && (
                                                    <span className="font-mono font-semibold">{token.patient.opdNo}</span>
                                                )}
                                                {token.patient?.phone && (
                                                    <span>{token.patient.phone}</span>
                                                )}
                                                <span className="ml-auto text-blue-400/70">{new Date(token.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Futuristic Action Buttons */}
                                    <div className="flex gap-2 mt-3 pt-3 border-t border-blue-500/20">
                                        {token.status !== 'completed' && (
                                            <button
                                                onClick={() => sendCallNotification(token)}
                                                disabled={sendingWhatsApp === token.id}
                                                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-blue-500 to-sky-500 hover:from-blue-400 hover:to-sky-400 text-white rounded-lg transition-all duration-300 text-xs font-bold disabled:opacity-50 shadow-md shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-105 border border-blue-400/50"
                                            >
                                                {sendingWhatsApp === token.id ? (
                                                    <>
                                                        <div className="animate-spin rounded-full h-3 w-3 border-2 border-white border-t-transparent"></div>
                                                        Sending...
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                                                        </svg>
                                                        Call
                                                    </>
                                                )}
                                            </button>
                                        )}
                                        <button
                                            onClick={() => editToken(token)}
                                            className="p-2 text-blue-400 hover:text-blue-400 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 hover:border-blue-400/50 rounded-lg transition-all duration-300 hover:scale-110"
                                            title="Edit"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                            </svg>
                                        </button>
                                        <button
                                            onClick={() => deleteToken(token.id)}
                                            className="p-2 text-blue-400 hover:text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-400/50 rounded-lg transition-all duration-300 hover:scale-110"
                                            title="Delete"
                                        >
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Modal */}
                {isModalOpen && (
                    <div className={`fixed inset-0 bg-black transition-opacity duration-300 z-[9999] ${isAnimating ? 'bg-opacity-50' : 'bg-opacity-0'}`} onClick={closeModal}>
                        <div className={`fixed inset-0 flex items-center justify-center p-4 z-[10000] transition-all duration-300 ${isAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                            <div className="rounded-lg border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-xl shadow-blue-500/10 backdrop-blur-sm max-w-md w-full overflow-hidden" onClick={e => e.stopPropagation()}>
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-lg"></div>
                                <div className="relative">
                                <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                                    <h2 className="text-xl font-semibold">{editingId ? 'Update Token' : 'Assign Token'}</h2>
                                    <button onClick={closeModal} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                                
                                <form onSubmit={submitToken} className="p-6 space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Select Patient <span className="text-red-600">*</span></label>
                                        <CustomSelect
                                            value={form.patientId}
                                            onChange={(val) => setForm({ ...form, patientId: val })}
                                            options={[
                                                { value: '', label: 'Select patient' },
                                                ...(() => {
                                                    // Helper to check if patient is from today
                                                    const isFromToday = (patient: any) => {
                                                        if (!patient.createdAt) return false
                                                        const createdDate = new Date(patient.createdAt).toDateString()
                                                        const today = new Date().toDateString()
                                                        return createdDate === today
                                                    }
                                                    
                                                    // Sort patients - new ones first
                                                    const sortedPatients = [...patients].sort((a, b) => {
                                                        const aIsNew = isFromToday(a)
                                                        const bIsNew = isFromToday(b)
                                                        if (aIsNew && !bIsNew) return -1
                                                        if (!aIsNew && bIsNew) return 1
                                                        return 0
                                                    })
                                                    
                                                    return sortedPatients.map(p => {
                                                        const baseLabel = (`${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Unknown')
                                                        const phoneLabel = p.phone ? ` · ${p.phone}` : ''
                                                        const isSuggested = isFromToday(p)
                                                        return {
                                                            value: String(p.id),
                                                            label: `${baseLabel}${phoneLabel}`,
                                                            badge: p.generatedPatientId || formatPatientId(p.date || p.createdAt),
                                                            subtitle: p.fatherHusbandGuardianName ? `in care of ${p.fatherHusbandGuardianName}` : undefined,
                                                            searchString: `${baseLabel} ${phoneLabel} ${p.generatedPatientId || formatPatientId(p.date || p.createdAt)} ${p.fatherHusbandGuardianName || ''}`,
                                                            ...(isSuggested && { description: 'SUGGESTED' }),
                                                            ...(p.phone ? { hasPhone: true } : { noPhone: true })
                                                        }
                                                    })
                                                })()
                                            ]}
                                            placeholder="Select patient"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-2">Token Number <span className="text-red-600">*</span></label>
                                        <input
                                            type="number"
                                            required
                                            min="1"
                                            placeholder="Enter token number"
                                            value={form.tokenNumber}
                                            onChange={e => setForm({ ...form, tokenNumber: e.target.value })}
                                            className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-lg"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium mb-2">Status</label>
                                        <CustomSelect
                                            value={form.status}
                                            onChange={(val) => setForm({ ...form, status: val })}
                                            options={[
                                                { value: 'waiting', label: 'Waiting' },
                                                { value: 'in-progress', label: 'In Progress' },
                                                { value: 'completed', label: 'Completed' }
                                            ]}
                                            placeholder="Select status"
                                        />
                                    </div>

                                    <div className="flex gap-3 pt-4">
                                        <button
                                            type="button"
                                            onClick={closeModal}
                                            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className="flex-1 px-4 py-2 bg-brand text-white rounded-lg hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                        >
                                            {submitting ? 'Saving...' : editingId ? 'Update' : 'Assign'}
                                        </button>
                                    </div>
                                </form>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Confirm Delete Modal */}
                {confirmModal.open && (
                    <div className={`fixed inset-0 bg-black transition-opacity duration-300 z-[9999] ${confirmModalAnimating ? 'bg-opacity-50' : 'bg-opacity-0'}`} onClick={closeConfirmModal}>
                        <div className={`fixed inset-0 flex items-center justify-center p-4 z-[10000] transition-all duration-300 ${confirmModalAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
                            <div className="rounded-lg border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-xl shadow-blue-500/10 backdrop-blur-sm max-w-md w-full p-6 overflow-hidden" onClick={e => e.stopPropagation()}>
                                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-lg"></div>
                                <div className="relative">
                                <h3 className="text-lg font-semibold mb-4">Confirm Deletion</h3>
                                <p className="text-gray-600 dark:text-gray-400 mb-6">{confirmModal.message}</p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={closeConfirmModal}
                                        disabled={deleting}
                                        className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => handleConfirmDelete(confirmModal.id)}
                                        disabled={deleting}
                                        className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {deleting ? 'Deleting...' : 'Delete'}
                                    </button>
                                </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    )
}



