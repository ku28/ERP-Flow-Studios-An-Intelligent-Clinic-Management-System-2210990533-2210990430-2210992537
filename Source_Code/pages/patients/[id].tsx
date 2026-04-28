import { useRouter } from 'next/router'
import { useEffect, useState, useRef } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { formatQuantity } from '../../lib/utils'
import DateInput from '../../components/DateInput'
import { isBasicPlan } from '../../lib/subscription'
import StandardFeatureBadge from '../../components/StandardFeatureBadge'

export default function PatientDetail() {
    const router = useRouter()
    const { id } = router.query
    const [patient, setPatient] = useState<any>(null)
    const [visits, setVisits] = useState<any[]>([])
    const [showSchedule, setShowSchedule] = useState(false)
    const { user } = useAuth()
    const [apptDate, setApptDate] = useState('')
    const [apptTime, setApptTime] = useState('')
    const printRef = useRef<HTMLDivElement | null>(null)

    useEffect(() => { if (id) load() }, [id])

    async function load() {
        const p = await (await fetch('/api/patients')).json()
        const found = p.find((x: any) => String(x.id) === String(id))
        setPatient(found)
        // fetch visits for this patient directly
        const visitsData = await (await fetch(`/api/visits?patientId=${id}&includePrescriptions=false`)).json()
        const my = visitsData.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
        setVisits(my)
    }

    async function schedule(e: any) {
        e.preventDefault()
        const scheduled = apptDate && apptTime ? `${apptDate}T${apptTime}` : apptDate
        await fetch('/api/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ patientId: id, scheduled }) })
        setShowSchedule(false)
        setApptDate('')
        setApptTime('')
        load()
    }

    function exportCSV() {
        if (isBasicPlan(user?.clinic?.subscriptionPlan)) {
            router.push('/upgrade')
            return
        }

        const rows = []
        rows.push(['Visit Date', 'OPD No', 'Diagnoses', 'Prescriptions'])
        for (const v of visits) {
            const pres = (v.prescriptions || []).map((p: any) => `${p.treatment?.name || ''} (${p.dosage}) x${p.quantity}`).join(' | ')
            rows.push([new Date(v.date).toLocaleString(), v.opdNo || '', v.diagnoses || '', pres])
        }
        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url; a.download = `patient-${id}-visits.csv`; a.click(); URL.revokeObjectURL(url)
    }

    function printSummary() {
        if (!printRef.current) return
        const w = window.open('', '_blank')
        if (!w) return
        w.document.write('<html><head><title>Patient Summary</title></head><body>')
        w.document.write(printRef.current.innerHTML)
        w.document.write('</body></html>')
        w.document.close()
        w.print()
    }

    if (!patient) return <div>Loading...</div>

    return (
        <div>
            <h2 className="text-xl font-bold mb-4">Patient: {[patient.firstName, patient.lastName].filter(Boolean).join(' ') || 'Unknown'}</h2>

            <div className="flex gap-2 mb-4">
                <button onClick={() => setShowSchedule(true)} className="px-3 py-1 bg-blue-600 text-white rounded">Schedule Next Visit</button>
                <button onClick={exportCSV} className="relative px-3 py-1 bg-sky-600 text-white rounded">
                    Export CSV
                    {isBasicPlan(user?.clinic?.subscriptionPlan) && (
                        <>
                            <span className="hidden sm:block"><StandardFeatureBadge /></span>
                            <span className="sm:hidden"><StandardFeatureBadge mobile /></span>
                        </>
                    )}
                </button>
                <button onClick={printSummary} className="px-3 py-1 bg-gray-600 text-white rounded">Print Summary</button>
            </div>

            {showSchedule && (
                <form onSubmit={schedule} className="mb-4 bg-white p-4 rounded shadow flex gap-2">
                    <div className="flex-1">
                        <DateInput required type="date" placeholder="Select appointment date" value={apptDate} onChange={e => setApptDate(e.target.value)} className="p-2 border rounded w-full" />
                    </div>
                    <div className="flex-1">
                        <input required type="time" placeholder="Select time" value={apptTime} onChange={e => setApptTime(e.target.value)} className="p-2 border rounded w-full" />
                    </div>
                    <button className="px-3 py-1 bg-blue-600 text-white rounded">Schedule</button>
                    <button type="button" onClick={() => setShowSchedule(false)} className="ml-2 px-3 py-1 bg-gray-300 rounded">Cancel</button>
                </form>
            )}

            <div ref={printRef}>
                <div className="bg-white p-4 rounded shadow mb-4">
                    <h3 className="font-semibold">Patient Info</h3>
                    <div>Name: {[patient.firstName, patient.lastName].filter(Boolean).join(' ') || '-'}</div>
                    <div>OPD: {patient.opdNo ?? '-'}</div>
                    <div>DOB: {patient.dob ? new Date(patient.dob).toLocaleDateString() : '-'}</div>
                    <div>Age: {patient.age ?? '-'}</div>
                    <div>Address: {patient.address ?? '-'}</div>
                    <div>Gender: {patient.gender ?? '-'}</div>
                    <div>Phone: {patient.phone ?? '-'}</div>
                    <div>Next visit: {patient.nextVisit ? new Date(patient.nextVisit).toLocaleString() : '-'}</div>
                    <div>Occupation: {patient.occupation ?? '-'}</div>
                    <div>Pending payment: ₹{patient.pendingPaymentCents ? Number(patient.pendingPaymentCents).toLocaleString('en-IN') : '0'}</div>
                    <div>Height: {patient.height ?? '-'} Weight: {patient.weight ?? '-'}</div>
                </div>

                <div className="bg-white p-4 rounded shadow">
                    <h3 className="font-semibold mb-2">Visits</h3>
                    <ul>
                        {visits.map(v => (
                            <li key={v.id} className="p-2 border-b">
                                <div className="font-medium">{new Date(v.date).toLocaleString()} — OPD: {v.opdNo}</div>
                                <div className="text-sm">Diagnoses: {v.diagnoses}</div>
                                <div className="text-sm">Pending payment: ₹{v.pendingPaymentCents ? Number(v.pendingPaymentCents).toLocaleString('en-IN') : '0'}</div>
                                <div className="text-sm">Prescriptions:
                                    <ul>
                                        {(v.prescriptions || []).map((pr: any) => <li key={pr.id}>{pr.treatment?.name} · {pr.dosage} · Qty: {formatQuantity(pr.quantity)} · Dispensed: {pr.dispensed ? 'Yes' : 'No'}</li>)}
                                    </ul>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    )
}

