// Helper function to get the effective doctor ID for data filtering
// Returns the doctor ID that should be used to filter data based on user role

export function getEffectiveDoctorId(user: any, selectedDoctorId: number | null): number | null {
  if (!user) return null
  
  // Admin can view any doctor's data or all data
  if (user.role === 'admin') {
    return selectedDoctorId // Can be null to see all data, or specific doctor ID
  }
  
  // Doctor can only see their own data
  if (user.role === 'doctor') {
    return user.id
  }
  
  // Other roles (staff, reception, user) see all data (or no filtering)
  return null
}

// Check if user should filter by doctor
export function shouldFilterByDoctor(user: any): boolean {
  if (!user) return false
  return user.role === 'doctor' || user.role === 'admin'
}

// Get clinic-aware filter for models with clinicId field (like Patient)
// Use this for models that have clinicId directly
export function getClinicFilter(user: any): { clinicId: string } | {} {
  if (!user) return {}
  
  // Super admin sees all
  if (user.role === 'super_admin') {
    return {}
  }
  
  const clinicId = user.clinicId || user.clinic?.id
  if (!clinicId) {
    throw new Error('User must be associated with a clinic')
  }
  
  return { clinicId }
}

// Get doctor filter for Prisma queries
// Now includes ALL data types: patients, visits, products, suppliers, etc.
export function getDoctorFilter(user: any, selectedDoctorId: number | null): { doctorId?: number | null } | { OR?: any[] } {
  const effectiveDoctorId = getEffectiveDoctorId(user, selectedDoctorId)
  
  // If no doctor filtering needed (staff, reception), return empty object
  if (effectiveDoctorId === null && user?.role !== 'admin') {
    return {}
  }
  
  // For admin with no selected doctor, show all (no filter)
  if (user?.role === 'admin' && effectiveDoctorId === null) {
    return {}
  }
  
  // Strict isolation: never include null doctorId records as shared data.
  return { doctorId: effectiveDoctorId }
}

// Get doctorId for creating new records
export function getDoctorIdForCreate(user: any, providedDoctorId?: number | null): number | null {
  if (!user) return null
  
  // Doctor role: always use their own ID
  if (user.role === 'doctor') {
    return user.id
  }
  
  // Strict isolation: admin writes are always attributed to the authenticated admin.
  // This prevents cross-clinic assignment via crafted doctorId payloads.
  if (user.role === 'admin') {
    return user.id
  }
  
  // Other roles: no doctor assignment
  return null
}

// Get clinic-aware filter for models with doctorId (products, categories, etc.)
// Returns filter that includes all doctors in the user's clinic OR null doctorId
export async function getClinicAwareDoctorFilter(user: any, prisma: any): Promise<any> {
  if (!user) return {}
  
  // Super admin sees all
  if (user.role === 'super_admin') {
    return {}
  }
  
  const clinicId = user.clinicId || user.clinic?.id
  if (!clinicId) {
    throw new Error('User must be associated with a clinic')
  }
  
  // Get all users (doctors) in this clinic
  const clinicUsers = await prisma.user.findMany({
    where: { clinicId },
    select: { id: true }
  })
  
  const doctorIds = clinicUsers.map((u: any) => u.id)
  
  // Strict isolation: only records linked to users in the same clinic.
  // Null doctorId records are intentionally excluded.
  return {
    doctorId: { in: doctorIds.length > 0 ? doctorIds : [-1] }
  }
}
