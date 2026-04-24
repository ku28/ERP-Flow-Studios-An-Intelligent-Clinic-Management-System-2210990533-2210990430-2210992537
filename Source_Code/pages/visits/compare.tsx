import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { requireDoctorOrAdmin } from '../../lib/withAuth'
import LoadingModal from '../../components/LoadingModal'

function CompareVisitsPage() {
    const router = useRouter()
    const { patientId } = router.query
    const [visits, setVisits] = useState<any[]>([])
    const [selectedVisits, setSelectedVisits] = useState<any[]>([])
    const [compareCount, setCompareCount] = useState(2)
    const [loading, setLoading] = useState(true)
    const [patient, setPatient] = useState<any>(null)

    useEffect(() => {
        if (patientId) {
            // Fetch patient info and visits with prescriptions
            Promise.all([
                fetch(`/api/patients?id=${patientId}`).then(r => r.json()),
                fetch(`/api/visits?patientId=${patientId}&includePrescriptions=true`).then(r => r.json())
            ]).then(([patientData, visitsData]) => {
                setPatient(patientData)
                const visitsList = Array.isArray(visitsData) ? visitsData : []
                // Sort by date descending (most recent first)
                const sortedVisits = visitsList.sort((a: any, b: any) => 
                    new Date(b.date).getTime() - new Date(a.date).getTime()
                )
                setVisits(sortedVisits)
                // Select the last N visits
                setSelectedVisits(sortedVisits.slice(0, Math.min(compareCount, sortedVisits.length)))
                setLoading(false)
            }).catch(err => {
                setLoading(false)
            })
        }
    }, [patientId])

    useEffect(() => {
        // Update selected visits when compare count changes
        setSelectedVisits(visits.slice(0, Math.min(compareCount, visits.length)))
    }, [compareCount, visits])

    const handleUseVisitData = (visit: any) => {
        // Navigate to prescriptions page with visit data pre-filled
        router.push({
            pathname: '/prescriptions',
            query: {
                patientId: patientId,
                copyFromVisitId: visit.id,
                visitNumber: visits.length + 1
            }
        })
    }

    if (loading) {
        return <LoadingModal isOpen={true} message="Loading visits..." />
    }

    if (!patient) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
                <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-md">
                    <div className="mb-4">
                        <svg className="w-16 h-16 mx-auto text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Patient Not Found</h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">Unable to load patient information.</p>
                    <button 
                        onClick={() => router.back()} 
                        className="px-6 py-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white rounded-lg font-semibold transition-all"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        )
    }

    if (visits.length === 0) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
                <div className="text-center p-8 bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-md">
                    <div className="mb-4">
                        <svg className="w-16 h-16 mx-auto text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No Visits Found</h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-2">
                        <strong>{[patient.firstName, patient.lastName].filter(Boolean).join(' ') || 'Unknown'}</strong> has no visit records to compare.
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
                        At least 1 visit is required for comparison.
                    </p>
                    <button 
                        onClick={() => router.back()} 
                        className="px-6 py-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white rounded-lg font-semibold transition-all"
                    >
                        Go Back
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-3 sm:p-6">
            {/* Header */}
            <div className="mb-4 sm:mb-6">
                <button
                    onClick={() => router.back()}
                    className="mb-3 sm:mb-4 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white flex items-center gap-2 px-2 sm:px-0"
                    title="Go back"
                    aria-label="Go back"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                    </svg>
                    <span className="hidden sm:inline">Back</span>
                </button>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2">
                            Compare Previous Visits
                        </h1>
                        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                            Patient: <strong>{[patient.firstName, patient.lastName].filter(Boolean).join(' ') || 'Unknown'}</strong>
                            {patient.opdNo && <span className="ml-2">· OPD: {patient.opdNo}</span>}
                        </p>
                    </div>

                    {/* Compare Count Selector */}
                    <div className="flex items-center gap-3">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Compare:
                        </label>
                        <select
                            value={compareCount}
                            onChange={(e) => setCompareCount(parseInt(e.target.value))}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                            {[2, 3, 4].map(n => (
                                <option key={n} value={n} disabled={n > visits.length}>
                                    {n} Visits {n > visits.length ? '(not enough visits)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Comparison Grid */}
            <div className={`grid gap-4 sm:gap-6 ${
                compareCount === 2 ? 'grid-cols-1 lg:grid-cols-2' :
                compareCount === 3 ? 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3' :
                'grid-cols-1 lg:grid-cols-2 xl:grid-cols-4'
            }`}>
                {selectedVisits.map((visit, index) => (
                    <div key={visit.id} className="relative">
                        {/* Divider (except for last item) - hidden on mobile */}
                        {index < selectedVisits.length - 1 && (
                            <div className="hidden lg:block absolute -right-3 top-0 bottom-0 w-px bg-gradient-to-b from-blue-200 via-blue-300 to-blue-200 dark:from-blue-800 dark:via-blue-700 dark:to-blue-800 z-10"></div>
                        )}

                        {/* Visit Card */}
                        <div className="relative rounded-xl border border-blue-200/50 dark:border-blue-700/50 bg-gradient-to-br from-white via-blue-50 to-sky-50 dark:from-gray-900 dark:via-blue-950 dark:to-gray-900 shadow-lg shadow-blue-500/10 p-4 sm:p-6 h-full overflow-y-auto max-h-[600px] lg:max-h-[calc(100vh-200px)] transition-all hover:shadow-xl hover:shadow-blue-500/20">
                            {/* Visit Header */}
                            <div className="mb-4 pb-4 border-b-2 border-blue-200/50 dark:border-blue-700/50">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-2">
                                        <h3 className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                                            Visit #{visits.length - index}
                                        </h3>
                                        {index === 0 && (
                                            <span className="px-2 py-0.5 bg-gradient-to-r from-sky-500/20 to-blue-500/20 text-sky-700 dark:text-sky-300 text-xs font-semibold rounded-full border border-sky-400/30 dark:border-sky-600/30">
                                                Most Recent
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {new Date(visit.date).toLocaleDateString()}
                                    </span>
                                </div>
                                <button
                                    onClick={() => handleUseVisitData(visit)}
                                    className="w-full px-3 py-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 text-white rounded-lg text-sm font-semibold transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                    </svg>
                                    Use This Data
                                </button>
                            </div>

                            {/* Visit Details */}
                            <div className="space-y-3 sm:space-y-4 text-xs sm:text-sm">
                                {/* Basic Info */}
                                {visit.opdNo && (
                                    <div>
                                        <h4 className="font-semibold text-sky-700 dark:text-sky-400 mb-1">OPD Number</h4>
                                        <p className="text-gray-600 dark:text-gray-400 font-mono">{visit.opdNo}</p>
                                    </div>
                                )}

                                {visit.visitType && (
                                    <div>
                                        <h4 className="font-semibold text-sky-700 dark:text-sky-400 mb-1">Visit Type</h4>
                                        <p className="text-gray-600 dark:text-gray-400">{visit.visitType}</p>
                                    </div>
                                )}

                                {visit.complaint && (
                                    <div>
                                        <h4 className="font-semibold text-sky-700 dark:text-sky-400 mb-1">Complaint</h4>
                                        <p className="text-gray-600 dark:text-gray-400">{visit.complaint}</p>
                                    </div>
                                )}

                                {visit.diagnoses && (
                                    <div>
                                        <h4 className="font-semibold text-sky-700 dark:text-sky-400 mb-1">Diagnoses</h4>
                                        <p className="text-gray-600 dark:text-gray-400">{visit.diagnoses}</p>
                                    </div>
                                )}

                                {visit.temperament && (
                                    <div>
                                        <h4 className="font-semibold text-sky-700 dark:text-sky-400 mb-1">Temperament</h4>
                                        <p className="text-gray-600 dark:text-gray-400">{visit.temperament}</p>
                                    </div>
                                )}

                                {visit.pulseDiagnosis && (
                                    <div>
                                        <h4 className="font-semibold text-sky-700 dark:text-sky-400 mb-1">Pulse Diagnosis</h4>
                                        <p className="text-gray-600 dark:text-gray-400">{visit.pulseDiagnosis}</p>
                                    </div>
                                )}

                                {visit.pulseDiagnosis2 && (
                                    <div>
                                        <h4 className="font-semibold text-sky-700 dark:text-sky-400 mb-1">Pulse Diagnosis 2</h4>
                                        <p className="text-gray-600 dark:text-gray-400">{visit.pulseDiagnosis2}</p>
                                    </div>
                                )}

                                {visit.majorComplaints && (
                                    <div>
                                        <h4 className="font-semibold text-sky-700 dark:text-sky-400 mb-1">Major Complaints</h4>
                                        <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{visit.majorComplaints}</p>
                                    </div>
                                )}

                                {visit.historyReports && (
                                    <div>
                                        <h4 className="font-semibold text-sky-700 dark:text-sky-400 mb-1">History & Reports</h4>
                                        <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{visit.historyReports}</p>
                                    </div>
                                )}

                                {visit.investigations && (
                                    <div>
                                        <h4 className="font-semibold text-sky-700 dark:text-sky-400 mb-1">Investigations</h4>
                                        <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{visit.investigations}</p>
                                    </div>
                                )}

                                {visit.provisionalDiagnosis && (
                                    <div>
                                        <h4 className="font-semibold text-sky-700 dark:text-sky-400 mb-1">Provisional Diagnosis</h4>
                                        <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{visit.provisionalDiagnosis}</p>
                                    </div>
                                )}

                                {/* Prescriptions */}
                                {visit.prescriptions && visit.prescriptions.length > 0 && (
                                    <div>
                                        <h4 className="font-semibold text-sky-700 dark:text-sky-400 mb-2">Prescriptions ({visit.prescriptions.length})</h4>
                                        <div className="space-y-2">
                                            {visit.prescriptions.map((prescription: any, idx: number) => (
                                                <div key={prescription.id} className="p-3 bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm rounded-lg border border-blue-300/40 dark:border-blue-700/40 shadow-sm">
                                                    <div className="flex items-start justify-between mb-2">
                                                        <p className="font-medium text-gray-900 dark:text-white">
                                                            {idx + 1}. {prescription.product?.name || prescription.customMedicine || 'Medicine'}
                                                        </p>
                                                        {prescription.product?.category && (
                                                            <span className="text-xs px-2 py-0.5 bg-blue-500/20 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 rounded-full border border-blue-400/30 dark:border-blue-600/30 font-semibold">
                                                                {prescription.product.category}
                                                            </span>
                                                        )}
                                                    </div>
                                                    
                                                    {/* Compositions */}
                                                    {(prescription.spy1 || prescription.spy2 || prescription.spy3 || prescription.spy4 || prescription.spy5 || prescription.spy6) && (
                                                        <div className="mb-2 p-2 bg-blue-500/10 dark:bg-blue-500/5 rounded border border-blue-300/30 dark:border-blue-700/30">
                                                            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">SPY Components:</p>
                                                            <div className="grid grid-cols-3 gap-2 text-xs">
                                                                {prescription.spy1 && (
                                                                    <div className="p-1.5 bg-white/50 dark:bg-gray-800/50 rounded border border-blue-200/40 dark:border-blue-700/40">
                                                                        <span className="font-medium text-blue-600 dark:text-blue-400">SPY 1:</span>
                                                                        <div className="text-gray-700 dark:text-gray-300 mt-0.5">{prescription.spy1}</div>
                                                                    </div>
                                                                )}
                                                                {prescription.spy2 && (
                                                                    <div className="p-1.5 bg-white/50 dark:bg-gray-800/50 rounded border border-blue-200/40 dark:border-blue-700/40">
                                                                        <span className="font-medium text-blue-600 dark:text-blue-400">SPY 2:</span>
                                                                        <div className="text-gray-700 dark:text-gray-300 mt-0.5">{prescription.spy2}</div>
                                                                    </div>
                                                                )}
                                                                {prescription.spy3 && (
                                                                    <div className="p-1.5 bg-white/50 dark:bg-gray-800/50 rounded border border-blue-200/40 dark:border-blue-700/40">
                                                                        <span className="font-medium text-blue-600 dark:text-blue-400">SPY 3:</span>
                                                                        <div className="text-gray-700 dark:text-gray-300 mt-0.5">{prescription.spy3}</div>
                                                                    </div>
                                                                )}
                                                                {prescription.spy4 && (
                                                                    <div className="p-1.5 bg-white/50 dark:bg-gray-800/50 rounded border border-blue-200/40 dark:border-blue-700/40">
                                                                        <span className="font-medium text-blue-600 dark:text-blue-400">SPY 4:</span>
                                                                        <div className="text-gray-700 dark:text-gray-300 mt-0.5">{prescription.spy4}</div>
                                                                    </div>
                                                                )}
                                                                {prescription.spy5 && (
                                                                    <div className="p-1.5 bg-white/50 dark:bg-gray-800/50 rounded border border-blue-200/40 dark:border-blue-700/40">
                                                                        <span className="font-medium text-blue-600 dark:text-blue-400">SPY 5:</span>
                                                                        <div className="text-gray-700 dark:text-gray-300 mt-0.5">{prescription.spy5}</div>
                                                                    </div>
                                                                )}
                                                                {prescription.spy6 && (
                                                                    <div className="p-1.5 bg-white/50 dark:bg-gray-800/50 rounded border border-blue-200/40 dark:border-blue-700/40">
                                                                        <span className="font-medium text-blue-600 dark:text-blue-400">SPY 6:</span>
                                                                        <div className="text-gray-700 dark:text-gray-300 mt-0.5">{prescription.spy6}</div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Addition Components */}
                                                    {(prescription.addition1 || prescription.addition2 || prescription.addition3) && (
                                                        <div className="mb-2 p-2 bg-blue-500/10 dark:bg-blue-500/5 rounded border border-blue-300/30 dark:border-blue-700/30">
                                                            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Addition Components:</p>
                                                            <div className="grid grid-cols-3 gap-2 text-xs">
                                                                {prescription.addition1 && (
                                                                    <div className="p-1.5 bg-white/50 dark:bg-gray-800/50 rounded border border-blue-200/40 dark:border-blue-700/40">
                                                                        <span className="font-medium text-blue-600 dark:text-blue-400">Addition 1:</span>
                                                                        <div className="text-gray-700 dark:text-gray-300 mt-0.5">{prescription.addition1}</div>
                                                                    </div>
                                                                )}
                                                                {prescription.addition2 && (
                                                                    <div className="p-1.5 bg-white/50 dark:bg-gray-800/50 rounded border border-blue-200/40 dark:border-blue-700/40">
                                                                        <span className="font-medium text-blue-600 dark:text-blue-400">Addition 2:</span>
                                                                        <div className="text-gray-700 dark:text-gray-300 mt-0.5">{prescription.addition2}</div>
                                                                    </div>
                                                                )}
                                                                {prescription.addition3 && (
                                                                    <div className="p-1.5 bg-white/50 dark:bg-gray-800/50 rounded border border-blue-200/40 dark:border-blue-700/40">
                                                                        <span className="font-medium text-blue-600 dark:text-blue-400">Addition 3:</span>
                                                                        <div className="text-gray-700 dark:text-gray-300 mt-0.5">{prescription.addition3}</div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                    
                                                    {/* Details Grid */}
                                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                                        {prescription.dosage && (
                                                            <div>
                                                                <span className="text-gray-500 dark:text-gray-400">Dosage:</span>
                                                                <span className="ml-1 text-gray-900 dark:text-white font-medium">{prescription.dosage}</span>
                                                            </div>
                                                        )}
                                                        {prescription.timing && (
                                                            <div>
                                                                <span className="text-gray-500 dark:text-gray-400">Timing:</span>
                                                                <span className="ml-1 text-gray-900 dark:text-white font-medium">{prescription.timing}</span>
                                                            </div>
                                                        )}
                                                        {prescription.quantity && (
                                                            <div>
                                                                <span className="text-gray-500 dark:text-gray-400">Quantity:</span>
                                                                <span className="ml-1 text-gray-900 dark:text-white font-medium">{prescription.quantity}</span>
                                                            </div>
                                                        )}
                                                        {prescription.dilution && (
                                                            <div>
                                                                <span className="text-gray-500 dark:text-gray-400">Dilution:</span>
                                                                <span className="ml-1 text-gray-900 dark:text-white font-medium">{prescription.dilution}</span>
                                                            </div>
                                                        )}
                                                        {prescription.doseQuantity && (
                                                            <div>
                                                                <span className="text-gray-500 dark:text-gray-400">Dose Qty:</span>
                                                                <span className="ml-1 text-gray-900 dark:text-white font-medium">{prescription.doseQuantity}</span>
                                                            </div>
                                                        )}
                                                        {prescription.doseTiming && (
                                                            <div>
                                                                <span className="text-gray-500 dark:text-gray-400">Dose Timing:</span>
                                                                <span className="ml-1 text-gray-900 dark:text-white font-medium">{prescription.doseTiming}</span>
                                                            </div>
                                                        )}
                                                        {prescription.administration && (
                                                            <div>
                                                                <span className="text-gray-500 dark:text-gray-400">Administration:</span>
                                                                <span className="ml-1 text-gray-900 dark:text-white font-medium">{prescription.administration}</span>
                                                            </div>
                                                        )}
                                                        {prescription.procedure && (
                                                            <div className="col-span-2">
                                                                <span className="text-gray-500 dark:text-gray-400">Procedure:</span>
                                                                <span className="ml-1 text-gray-900 dark:text-white font-medium">{prescription.procedure}</span>
                                                            </div>
                                                        )}
                                                        {prescription.presentation && (
                                                            <div className="col-span-2">
                                                                <span className="text-gray-500 dark:text-gray-400">Presentation:</span>
                                                                <span className="ml-1 text-gray-900 dark:text-white font-medium">{prescription.presentation}</span>
                                                            </div>
                                                        )}
                                                        {prescription.droppersToday && (
                                                            <div>
                                                                <span className="text-gray-500 dark:text-gray-400">Droppers Today:</span>
                                                                <span className="ml-1 text-gray-900 dark:text-white font-medium">{prescription.droppersToday}</span>
                                                            </div>
                                                        )}
                                                        {prescription.medicineQuantity && (
                                                            <div>
                                                                <span className="text-gray-500 dark:text-gray-400">Medicine Qty:</span>
                                                                <span className="ml-1 text-gray-900 dark:text-white font-medium">{prescription.medicineQuantity}</span>
                                                            </div>
                                                        )}
                                                        {prescription.days && (
                                                            <div>
                                                                <span className="text-gray-500 dark:text-gray-400">Days:</span>
                                                                <span className="ml-1 text-gray-900 dark:text-white font-medium">{prescription.days}</span>
                                                            </div>
                                                        )}
                                                        {prescription.remarks && (
                                                            <div className="col-span-2">
                                                                <span className="text-gray-500 dark:text-gray-400">Remarks:</span>
                                                                <span className="ml-1 text-gray-900 dark:text-white font-medium">{prescription.remarks}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {visit.specialNote && (
                                    <div>
                                        <h4 className="font-semibold text-sky-700 dark:text-sky-400 mb-1">Special Note</h4>
                                        <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{visit.specialNote}</p>
                                    </div>
                                )}

                                {visit.improvements && (
                                    <div>
                                        <h4 className="font-semibold text-sky-700 dark:text-sky-400 mb-1">Improvements</h4>
                                        <p className="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{visit.improvements}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}

export default requireDoctorOrAdmin(CompareVisitsPage)

