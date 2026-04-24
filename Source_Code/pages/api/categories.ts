import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import { requireAuth } from '../../lib/auth'
import { getDoctorIdForCreate, getClinicAwareDoctorFilter } from '../../lib/doctorUtils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        const user = await requireAuth(req, res)
        if (!user) return
        
        try {
            // Filter categories by clinic
            const whereClause = await getClinicAwareDoctorFilter(user, prisma)
            
            let categories = await prisma.category.findMany({
                where: whereClause,
                orderBy: { name: 'asc' }
            })
            
            // Check for and remove TRUE duplicates from database (same name AND doctorId)
            // Since the unique constraint is @@unique([name, doctorId]), we must consider both fields
            const categoryKey = (cat: any) => `${cat.name}|${cat.doctorId}`
            const categoryKeyMap = new Map<string, any[]>()
            categories.forEach((cat: any) => {
                const key = categoryKey(cat)
                if (!categoryKeyMap.has(key)) {
                    categoryKeyMap.set(key, [])
                }
                categoryKeyMap.get(key)!.push(cat)
            })
            
            // Delete duplicates, keeping only the first occurrence for each name+doctorId combination
            const deletePromises: Promise<any>[] = []
            categoryKeyMap.forEach((cats, key) => {
                if (cats.length > 1) {
                    // Keep the first one, delete the rest
                    for (let i = 1; i < cats.length; i++) {
                        deletePromises.push(
                            prisma.category.delete({ where: { id: cats[i].id } })
                                .catch(() => {})
                        )
                    }
                }
            })
            
            if (deletePromises.length > 0) {
                await Promise.all(deletePromises)
                // Refetch after cleanup with clinic filter
                categories = await prisma.category.findMany({
                    where: whereClause,
                    orderBy: { name: 'asc' }
                })
            }
            
            return res.status(200).json(categories)
        } catch (err: any) {
            if (err?.code === 'P2021' || err?.code === 'P2022') return res.status(200).json([])
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    if (req.method === 'POST') {
        const user = await requireAuth(req, res)
        if (!user) return
        
        const { name, code, doctorId: providedDoctorId } = req.body
        const doctorId = getDoctorIdForCreate(user, providedDoctorId)
        
        try {
            // Check if category already exists with the same name
            const existing = await prisma.category.findFirst({
                where: { 
                    name,
                    doctorId
                }
            })
            
            if (existing) {
                return res.status(409).json({ error: 'Category with this name already exists' })
            }
            
            const category = await prisma.category.create({ 
                data: { name, code, doctorId } 
            })
            return res.status(201).json(category)
        } catch (err: any) {
            return res.status(500).json({ error: String(err?.message || err) })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
