import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { requireAuth, getClinicIdFromUser } from '../../lib/auth'
import { getDoctorFilter } from '../../lib/doctorUtils'
import { formatPatientId, formatPatientIdWithSequence } from '../../lib/utils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    const user = await requireAuth(req, res)
    if (!user) return
    
    try {
      // Filter by clinicId for multi-tenant isolation
      let whereClause: any = {}
      
      // Super admin can see all patients, others must be filtered by clinic
      if (user.role === 'super_admin') {
        // No filter - super admin sees all
      } else {
        const clinicId = user.clinicId || user.clinic?.id
        
        if (!clinicId) {
          return res.status(403).json({ error: 'No clinic association. Please contact administrator.' })
        }
        
        // CRITICAL: Apply clinic filter for data isolation
        whereClause.clinicId = clinicId
      }

      // Pagination support (optional — omit page/limit for backward compat)
      const page = req.query.page ? Math.max(1, Number(req.query.page)) : null
      const limit = req.query.limit ? Math.min(200, Math.max(1, Number(req.query.limit))) : null
      const skip = page && limit ? (page - 1) * limit : undefined
      const take = limit || undefined

      // Search support
      if (req.query.search) {
        const search = String(req.query.search)
        whereClause.OR = [
          { fullName: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search } },
        ]
      }

      const [patients, total] = await Promise.all([
        prisma.patient.findMany({ 
          where: whereClause,
          orderBy: { createdAt: 'desc' },
          skip,
          take,
          include: { 
            visits: { orderBy: { date: 'desc' }, take: 1 },
            doctor: { select: { id: true, name: true, email: true } }
          } 
        }),
        // Only count when paginating
        page ? prisma.patient.count({ where: whereClause }) : Promise.resolve(0),
      ])

      // Build a deterministic per-day sequence so patient IDs remain unique as YYMMDD NN.
      const sortedForId = [...patients].sort((a: any, b: any) => {
        const aDate = new Date(a.date || a.createdAt).getTime()
        const bDate = new Date(b.date || b.createdAt).getTime()
        if (aDate !== bDate) return aDate - bDate

        const aCreated = new Date(a.createdAt).getTime()
        const bCreated = new Date(b.createdAt).getTime()
        if (aCreated !== bCreated) return aCreated - bCreated

        return Number(a.id) - Number(b.id)
      })

      const dayCounters = new Map<string, number>()
      const generatedIdByPatient = new Map<number, string>()

      for (const p of sortedForId) {
        const baseDate = p.date || p.createdAt
        const baseId = formatPatientId(baseDate)
        const clinicScope = String(p.clinicId || 'global')
        const dayKey = `${clinicScope}:${baseId}`
        const nextSeq = (dayCounters.get(dayKey) || 0) + 1
        dayCounters.set(dayKey, nextSeq)
        generatedIdByPatient.set(p.id, formatPatientIdWithSequence(baseDate, nextSeq))
      }

      // Compute pending from all visit balances so old records stay accurate.
      const patientIds = patients.map((p: any) => p.id)
      let pendingMap = new Map<number, number>()

      if (patientIds.length > 0) {
        const allVisits = await prisma.visit.findMany({
          where: { patientId: { in: patientIds } },
          select: { patientId: true, balance: true }
        })

        for (const v of allVisits) {
          const current = pendingMap.get(v.patientId) || 0
          pendingMap.set(v.patientId, current + Number(v.balance || 0))
        }
      }

      const patientsWithComputedPending = patients.map((p: any) => ({
        ...p,
        pendingPaymentCents: Math.max(0, Math.round(pendingMap.get(p.id) || 0)),
        generatedPatientId: generatedIdByPatient.get(p.id) || formatPatientId(p.date || p.createdAt)
      }))
      
      // Return paginated response if page param was provided
      if (page && limit) {
        return res.status(200).json({
          data: patientsWithComputedPending,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        })
      }
      
      return res.status(200).json(patientsWithComputedPending)
    } catch (err: any) {
      if (err?.code === 'P2021' || err?.code === 'P2022') return res.status(200).json([])
      return res.status(500).json({ error: String(err?.message || err) })
    }
  }

  if (req.method === 'POST') {
    const user = await requireAuth(req, res)
    if(!user) return
    
    const { fullName, firstName: rawFirstName, lastName, phone, email, dob, date, age, address, gender, nextVisit, imageUrl, fatherHusbandGuardianName, weight, height, doctorId: providedDoctorId } = req.body
    // Resolve canonical names — frontend sends fullName; keep firstName for backward compat
    const resolvedFullName = fullName || `${rawFirstName || ''} ${lastName || ''}`.trim() || null
    const firstName = resolvedFullName
    // Get clinicId for multi-tenant isolation - MUST be set for non-super_admin
    let clinicId: string | null = null
    
    if (user.role === 'super_admin') {
      // Super admin can create patients without clinic (legacy support)
      clinicId = null
    } else {
      clinicId = user.clinicId || user.clinic?.id || null
      
      if (!clinicId) {
        return res.status(403).json({ error: 'No clinic association. Cannot create patient.' })
      }
    }
    
    // Determine doctorId: doctor role uses their own ID, admin/receptionist can specify if same clinic
    let doctorId = null
    if (user.role === 'doctor') {
      doctorId = user.id
    } else if ((user.role === 'admin' || user.role === 'receptionist') && providedDoctorId) {
      const doctorUser = await prisma.user.findFirst({
        where: {
          id: Number(providedDoctorId),
          clinicId: clinicId || undefined
        },
        select: { id: true }
      })
      if (!doctorUser) {
        return res.status(400).json({ error: 'Invalid doctor selection for this clinic' })
      }
      doctorId = doctorUser.id
    }
    
    try {
      const patient = await prisma.patient.create({ 
        data: { 
          fullName: resolvedFullName,
          firstName, 
          lastName: lastName || null,
          phone, 
          email, 
          dob: dob ? new Date(dob) : null, 
          date: date ? new Date(date) : undefined, 
          age: age ? Number(age) : undefined, 
          address, 
          gender, 
          nextVisit: nextVisit ? new Date(nextVisit) : undefined, 
          imageUrl,
          fatherHusbandGuardianName,
          weight: weight ? Number(weight) : undefined,
          height: height ? Number(height) : undefined,
          doctorId,
          clinicId: clinicId || undefined
        } 
      })
      
      return res.status(201).json(patient)
    } catch (err: any) {
      return res.status(400).json({ error: err.message })
    }
  }

  if (req.method === 'PUT') {
    const user = await requireAuth(req, res)
    if(!user) return
    
    const { id, fullName: rawFullNamePut, firstName: rawFirstNamePut, lastName, phone, email, dob, date, age, address, gender, nextVisit, imageUrl, fatherHusbandGuardianName, weight, height, doctorId: providedDoctorId, pendingPaymentCents } = req.body
    const resolvedFullNamePut = rawFullNamePut || `${rawFirstNamePut || ''} ${lastName || ''}`.trim() || null
    const firstNamePut = resolvedFullNamePut
    
    // Determine doctorId for update
    let doctorId = undefined
    if (user.role === 'doctor') {
      doctorId = user.id
    } else if ((user.role === 'admin' || user.role === 'receptionist') && providedDoctorId !== undefined) {
      const clinicId = user.role === 'super_admin' ? null : (user.clinicId || user.clinic?.id || null)
      const doctorUser = await prisma.user.findFirst({
        where: {
          id: Number(providedDoctorId),
          clinicId: clinicId || undefined
        },
        select: { id: true }
      })
      if (!doctorUser) {
        return res.status(400).json({ error: 'Invalid doctor selection for this clinic' })
      }
      doctorId = doctorUser.id
    }
    
    try {
      // Verify patient belongs to user's clinic before updating
      if (user.role !== 'super_admin') {
        const clinicId = user.clinicId || user.clinic?.id
        if (!clinicId) {
          return res.status(403).json({ error: 'No clinic association. Cannot update patient.' })
        }
        const existingPatient = await prisma.patient.findFirst({
          where: { id: Number(id), clinicId },
          select: { id: true }
        })
        if (!existingPatient) {
          return res.status(404).json({ error: 'Patient not found or access denied' })
        }
      }

      const updateData: any = { 
        fullName: resolvedFullNamePut,
        firstName: firstNamePut, 
        lastName: lastName || null,
        phone, 
        email, 
        dob: dob ? new Date(dob) : null, 
        date: date ? new Date(date) : undefined, 
        age: age ? Number(age) : undefined, 
        address, 
        gender, 
        nextVisit: nextVisit ? new Date(nextVisit) : undefined, 
        imageUrl,
        fatherHusbandGuardianName,
        weight: weight ? Number(weight) : undefined,
        height: height ? Number(height) : undefined,
        ...(pendingPaymentCents !== undefined ? { pendingPaymentCents: Math.round(Number(pendingPaymentCents)) } : {})
      }
      
      if (doctorId !== undefined) {
        updateData.doctorId = doctorId
      }
      
      const p = await prisma.patient.update({ 
        where: { id: Number(id) }, 
        data: updateData
      })
      return res.status(200).json(p)
    } catch (err: any) { return res.status(500).json({ error: String(err?.message || err) }) }
  }

  if (req.method === 'DELETE') {
    const user = await requireAuth(req, res)
    if(!user) return
    const { id } = req.body
    const idNum = Number(id)
    if (!id || !Number.isInteger(idNum) || idNum <= 0) {
      return res.status(400).json({ error: 'Invalid or missing id for delete' })
    }
    try {
      // Verify patient belongs to user's clinic before deleting
      if (user.role !== 'super_admin') {
        const clinicId = user.clinicId || user.clinic?.id
        
        if (!clinicId) {
          return res.status(403).json({ error: 'No clinic association. Cannot delete patient.' })
        }
        
        const patient = await prisma.patient.findFirst({
          where: { id: idNum, clinicId }
        })
        
        if (!patient) {
          return res.status(404).json({ error: 'Patient not found or access denied' })
        }
      }
      
      // Delete dependent records in correct order to satisfy FK constraints.
      // Prescriptions reference visits, so remove them first. Then delete visits,
      // appointments and invoices for this patient, finally delete the patient.
      await prisma.$transaction([
        prisma.prescription.deleteMany({ where: { visit: { patientId: idNum } } }),
        prisma.visit.deleteMany({ where: { patientId: idNum } }),
        prisma.appointment.deleteMany({ where: { patientId: idNum } }),
        prisma.invoice.deleteMany({ where: { patientId: idNum } }),
        prisma.patient.delete({ where: { id: idNum } }),
      ])

      return res.status(200).json({ ok: true })
    } catch (err: any) {
      // Return the Prisma error message to the client to aid debugging
      return res.status(500).json({ error: String(err?.message || err) })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
