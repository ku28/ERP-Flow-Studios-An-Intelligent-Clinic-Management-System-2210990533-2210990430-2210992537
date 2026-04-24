import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { createPortal } from 'react-dom'
import CustomSelect from './CustomSelect'
import { formatPatientId } from '../lib/utils'

interface PatientSelectionModalProps {
    isOpen: boolean
    onClose: () => void
}

export default function PatientSelectionModal({ isOpen, onClose }: PatientSelectionModalProps) {
    const router = useRouter()
    const [patients, setPatients] = useState<any[]>([])
    const [selectedPatientId, setSelectedPatientId] = useState('')
    const [visitCount, setVisitCount] = useState<number>(0)
    const [initialLoading, setInitialLoading] = useState(false)

    useEffect(() => {
        if (isOpen) {
            // Fetch patients
            setInitialLoading(true)
            fetch('/api/patients')
                .then(r => r.json())
                .then(data => {
                    setPatients(Array.isArray(data) ? data : [])
                    setInitialLoading(false)
                })
                .catch(err => {
                    setInitialLoading(false)
                })
        }
    }, [isOpen])

    useEffect(() => {
        if (selectedPatientId) {
            // Fetch visit count for selected patient
            fetch(`/api/visits?patientId=${selectedPatientId}`)
                .then(r => r.json())
                .then(data => {
                    const visits = Array.isArray(data) ? data : []
                    setVisitCount(visits.length)
                })
                .catch(err => {
                    setVisitCount(0)
                })
        } else {
            setVisitCount(0)
        }
    }, [selectedPatientId])

    const handleCreateVisit = () => {
        if (!selectedPatientId) return
        router.push(`/prescriptions?patientId=${selectedPatientId}&visitNumber=${visitCount + 1}`)
        onClose()
    }

    const handleComparePrevious = () => {
        if (!selectedPatientId) return
        router.push(`/visits/compare?patientId=${selectedPatientId}`)
        onClose()
    }

    if (!isOpen) return null

    const selectedPatient = patients.find(p => String(p.id) === String(selectedPatientId))

    const modal = (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4">
            <div className="rounded-lg border border-blue-200/30 dark:border-blue-700/30 bg-gradient-to-br from-white via-blue-50/30 to-sky-50/20 dark:from-gray-900 dark:via-blue-950/20 dark:to-gray-900 shadow-xl shadow-blue-500/10 backdrop-blur-sm max-w-md w-full p-4 sm:p-6 overflow-hidden max-h-[90vh] overflow-y-auto">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/5 via-transparent to-sky-500/5 pointer-events-none rounded-lg"></div>
                <div className="relative">
                {/* Header */}
                <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                        Create Visit & Prescription
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Loading State */}
                {initialLoading ? (
                    <div className="flex flex-col items-center justify-center py-12">
                        <div className="relative w-16 h-16 mb-4">
                            <div className="absolute inset-0 border-4 border-blue-200 dark:border-blue-900 rounded-full"></div>
                            <div className="absolute inset-0 border-4 border-transparent border-t-blue-600 dark:border-t-blue-400 rounded-full animate-spin"></div>
                        </div>
                        <p className="text-gray-600 dark:text-gray-400 font-medium">Loading patients...</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Patient Selection */}
                        <div>
                            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                                Select Patient <span className="text-red-600">*</span>
                            </label>
                            <CustomSelect
                                value={selectedPatientId}
                                onChange={(value) => setSelectedPatientId(value)}
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
                                            const isSuggested = isFromToday(p)
                                            return {
                                                value: String(p.id),
                                                label: baseLabel,
                                                badge: p.generatedPatientId || formatPatientId(p.date || p.createdAt),
                                                subtitle: p.fatherHusbandGuardianName ? `in care of ${p.fatherHusbandGuardianName}` : undefined,
                                                searchString: `${baseLabel} ${p.generatedPatientId || formatPatientId(p.date || p.createdAt)} ${p.fatherHusbandGuardianName || ''}`,
                                                // We'll handle the SUGGESTED badge in CustomSelect styling
                                                ...(isSuggested && { description: 'SUGGESTED' })
                                            }
                                        })
                                    })()
                                ]}
                                placeholder="Select patient"
                            />
                        </div>

                        {/* Visit Information */}
                        {selectedPatientId && (
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                <div className="flex items-center gap-3 mb-2">
                                    {selectedPatient?.imageUrl && (
                                        <img
                                            src={selectedPatient.imageUrl}
                                            alt="Patient"
                                            className="w-12 h-12 rounded-full object-cover"
                                        />
                                    )}
                                    <div>
                                        <p className="font-semibold text-gray-900 dark:text-white">
                                            {[selectedPatient?.firstName, selectedPatient?.lastName].filter(Boolean).join(' ') || ''}
                                        </p>
                                        {selectedPatient?.opdNo && (
                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                OPD: {selectedPatient.opdNo}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 mt-3">
                                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                        Previous Visits: <strong>{visitCount}</strong>
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 mt-2">
                                    <svg className="w-5 h-5 text-sky-600 dark:text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                    </svg>
                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                        Next Visit Number: <strong>{visitCount + 1}</strong>
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Action Buttons */}
                        <div className="flex gap-2 sm:gap-3 pt-4">
                            <button
                                onClick={handleCreateVisit}
                                disabled={!selectedPatientId}
                                className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
                            >
                                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                                </svg>
                                <span className="hidden sm:inline">Create Visit/Prescription</span>
                                <span className="sm:hidden">Create Visit</span>
                            </button>
                        </div>

                        {/* Always show compare button if patient is selected */}
                        {selectedPatientId && (
                            <button
                                onClick={handleComparePrevious}
                                disabled={visitCount === 0}
                                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                            >
                                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
                                </svg>
                                {visitCount === 0 ? 'No Previous Visits' : `Compare Previous Visits (${visitCount})`}
                            </button>
                        )}
                    </div>
                )}
            </div>
            </div>
        </div>
    )

    return typeof document !== 'undefined' ? createPortal(modal, document.body) : null
}

