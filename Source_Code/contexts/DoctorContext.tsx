import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

interface Doctor {
    id: number
    name: string
    email: string | null
    profileImage: string | null
}

interface DoctorContextType {
    selectedDoctorId: number | null
    setSelectedDoctorId: (id: number | null) => void
    doctors: Doctor[]
    loading: boolean
    refreshDoctors: () => Promise<void>
}

const DoctorContext = createContext<DoctorContextType | undefined>(undefined)

export function DoctorProvider({ children }: { children: ReactNode }) {
    const [selectedDoctorId, setSelectedDoctorIdState] = useState<number | null>(null)
    const [doctors, setDoctors] = useState<Doctor[]>([])
    const [loading, setLoading] = useState(true)

    const setSelectedDoctorId = (id: number | null) => {
        setSelectedDoctorIdState(id)
        if (id !== null) {
            localStorage.setItem('selectedDoctorId', id.toString())
        } else {
            localStorage.removeItem('selectedDoctorId')
        }
    }

    const fetchDoctors = async () => {
        try {
            setLoading(true)
            const res = await fetch('/api/doctors/list')
            if (res.ok) {
                const data = await res.json()
                setDoctors(data.doctors || [])
                
                // Restore selected doctor from localStorage or set to first doctor
                const storedId = localStorage.getItem('selectedDoctorId')
                if (storedId && data.doctors.some((d: Doctor) => d.id === parseInt(storedId))) {
                    setSelectedDoctorIdState(parseInt(storedId))
                } else if (data.doctors.length > 0) {
                    setSelectedDoctorIdState(data.doctors[0].id)
                }
            }
        } catch (error) {
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchDoctors()
    }, [])

    return (
        <DoctorContext.Provider value={{ 
            selectedDoctorId, 
            setSelectedDoctorId, 
            doctors, 
            loading,
            refreshDoctors: fetchDoctors
        }}>
            {children}
        </DoctorContext.Provider>
    )
}

export function useDoctor() {
    const context = useContext(DoctorContext)
    if (context === undefined) {
        throw new Error('useDoctor must be used within a DoctorProvider')
    }
    return context
}
