import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { requireStaffOrAbove } from '../../../lib/auth'
import { getClinicAwareDoctorFilter } from '../../../lib/doctorUtils'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireStaffOrAbove(req, res)
    if (!user) return

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const { reset = false } = req.body || {}
        const clinicId = user.clinicId || user.clinic?.id
        if (!clinicId) {
            return res.status(400).json({ error: 'User must be associated with a clinic' })
        }

        const latestVersionResult = await prisma.defaultProduct.aggregate({
            _max: { version: true }
        })
        const latestVersion = latestVersionResult._max.version

        if (!latestVersion) {
            return res.status(404).json({ error: 'No default product templates found' })
        }

        if (!reset) {
            const alreadySynced = await prisma.clinicDefaultTemplateSync.findUnique({
                where: {
                    clinicId_templateType_version: {
                        clinicId,
                        templateType: 'product',
                        version: latestVersion
                    }
                }
            })

            if (alreadySynced) {
                return res.status(200).json({
                    success: true,
                    latestVersion,
                    alreadyPopulated: true,
                    created: 0,
                    updated: 0,
                    skipped: 0,
                    message: `Defaults for version ${latestVersion} were already populated for this clinic.`
                })
            }
        }

        const defaults = await prisma.defaultProduct.findMany({
            where: { version: latestVersion },
            orderBy: { id: 'asc' }
        })

        if (defaults.length === 0) {
            return res.status(404).json({ error: `No default products found for version ${latestVersion}` })
        }

        const whereClause = await getClinicAwareDoctorFilter(user, prisma)
        const allNames = defaults.map((d: any) => d.name).filter(Boolean)

        const existingProducts = allNames.length > 0
            ? await prisma.product.findMany({
                where: {
                    ...whereClause,
                    name: {
                        in: allNames,
                        mode: 'insensitive'
                    }
                },
                select: { id: true, name: true }
            })
            : []

        const existingByName = new Map<string, number>()
        existingProducts.forEach((p: any) => {
            existingByName.set(p.name.trim().toLowerCase(), p.id)
        })
        const actorUserId = Number(user.id)

        const categoryNames = Array.from<string>(
            new Set(
                defaults
                    .map((d: any) => (d.category || '').trim())
                    .filter((name: string) => Boolean(name))
            )
        )

        const categoryMap = new Map<string, number>()
        for (const categoryName of categoryNames) {
            const category = await prisma.category.upsert({
                where: {
                    name_doctorId: {
                        name: categoryName,
                        doctorId: actorUserId
                    }
                },
                create: {
                    name: categoryName,
                    doctorId: actorUserId
                },
                update: {}
            })
            categoryMap.set(categoryName.toLowerCase(), category.id)
        }

        let created = 0
        let updated = 0
        let skipped = 0
        const namesHandled = new Set<string>()

        for (const row of defaults as any[]) {
            const normalizedName = row.name.trim().toLowerCase()
            if (namesHandled.has(normalizedName)) continue
            namesHandled.add(normalizedName)

            const payload = {
                name: row.name,
                priceRupees: row.priceRupees,
                quantity: row.quantity,
                purchasePriceRupees: row.purchasePriceRupees,
                unit: row.unit,
                minStockLevel: row.minStockLevel,
                actualInventory: row.actualInventory,
                inventoryValue: row.inventoryValue,
                latestUpdate: row.latestUpdate,
                purchaseValue: row.purchaseValue,
                salesValue: row.salesValue,
                totalPurchased: row.totalPurchased,
                totalSales: row.totalSales,
                categoryId: row.category ? categoryMap.get(row.category.toLowerCase()) ?? null : null,
                doctorId: actorUserId
            }

            const existingId = existingByName.get(normalizedName)
            if (existingId && reset) {
                await prisma.product.update({ where: { id: existingId }, data: payload })
                updated += 1
                continue
            }

            if (existingId) {
                skipped += 1
                continue
            }

            await prisma.product.create({ data: payload })
            created += 1
        }

        if (reset) {
            await prisma.clinicDefaultTemplateSync.upsert({
                where: {
                    clinicId_templateType_version: {
                        clinicId,
                        templateType: 'product',
                        version: latestVersion
                    }
                },
                create: {
                    clinicId,
                    templateType: 'product',
                    version: latestVersion
                },
                update: {
                    populatedAt: new Date()
                }
            })
        } else {
            await prisma.clinicDefaultTemplateSync.create({
                data: {
                    clinicId,
                    templateType: 'product',
                    version: latestVersion
                }
            })
        }

        return res.status(200).json({
            success: true,
            latestVersion,
            alreadyPopulated: false,
            created,
            updated,
            skipped,
            message: reset
                ? `Reset and populated product defaults for version ${latestVersion}. Created ${created}, updated ${updated}, skipped ${skipped}.`
                : `Populated product defaults for version ${latestVersion}. Created ${created}, skipped ${skipped}.`
        })
    } catch (err: any) {
        return res.status(500).json({ error: String(err?.message || err) })
    }
}
