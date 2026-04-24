import { NextApiRequest, NextApiResponse } from 'next';
import { requireAdmin, getClinicIdFromUser } from '../../../lib/auth';
import prisma from '../../../lib/prisma';
import { createCurrentCategoryFieldRulesBaseline } from '../../../lib/categoryFieldRules';

// Default values configuration structure
interface DefaultValueConfig {
    page: string;
    label: string;
    file?: string;
    values: Record<string, any>;
}

const DEFAULT_CONFIGS: DefaultValueConfig[] = [
    {
        page: 'treatments',
        label: 'Treatment Plans',
        values: {
            quantity: 15,
            bottleSize: '15',
            timing: 'AM',
            doseQuantity: '10',
            doseTiming: 'TDS',
            dilution: 'WATER',
            procedure: 'ORAL',
            presentation: 'DRP',
            categoryFieldRules: createCurrentCategoryFieldRulesBaseline()
        }
    },
    {
        page: 'prescriptions',
        label: 'Prescriptions',
        values: {
            quantity: 15,
            bottleSize: '15',
            timing: 'AM',
            doseQuantity: '10',
            doseTiming: 'TDS',
            dilution: 'WATER',
            procedure: 'ORAL',
            presentation: 'DRP',
            gstRate: 5,
            consultationFees: 200,
            allowKeywordLearning: true,
            categoryFieldRules: createCurrentCategoryFieldRulesBaseline()
        }
    },
    {
        page: 'products',
        label: 'Products',
        values: {
            minStockLevel: '200'
        }
    },
    {
        page: 'patients',
        label: 'Patients',
        values: {}
    },
    {
        page: 'suppliers',
        label: 'Suppliers',
        values: {}
    },
    {
        page: 'visits',
        label: 'Visits',
        values: {}
    },
    {
        page: 'purchaseOrders',
        label: 'Purchase Orders',
        values: {
            status: 'pending'
        }
    },
    {
        page: 'invoices',
        label: 'Analytics',
        values: {
            gstRate: 5,
            consultationFees: 200,
            manufacturer: '',
            batch: '',
            expiry: ''
        }
    }
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const user = await requireAdmin(req, res);
    if (!user) return;

    if (req.method === 'GET') {
        try {
            // Get default values from database for this clinic
            const clinicId = getClinicIdFromUser(user)
            const dbDefaults = await prisma.defaultValue.findMany({
                where: { clinicId }
            });
            
            // If database is empty, seed with DEFAULT_CONFIGS
            if (dbDefaults.length === 0) {
                await prisma.defaultValue.createMany({
                    data: DEFAULT_CONFIGS.map(config => ({
                        clinicId,
                        page: config.page,
                        label: config.label,
                        values: config.values as any
                    }))
                });
                
                // Fetch again after seeding
                const seededDefaults = await prisma.defaultValue.findMany({
                    where: { clinicId }
                });
                return res.status(200).json({ 
                    pages: seededDefaults.map((d: any) => ({
                        page: d.page,
                        label: d.label,
                        values: d.values
                    }))
                });
            }

            return res.status(200).json({ 
                pages: dbDefaults.map((d: any) => ({
                    page: d.page,
                    label: d.label,
                    values: d.values
                }))
            });
        } catch (error: any) {
            return res.status(500).json({ error: 'Failed to read default values' });
        }
    }

    if (req.method === 'PUT') {
        try {
            const { page, values } = req.body;

            if (!page || !values) {
                return res.status(400).json({ error: 'Page and values are required' });
            }

            const clinicId = getClinicIdFromUser(user)
            
            // Update or create in database for this clinic
            await prisma.defaultValue.upsert({
                where: { 
                    clinicId_page: { 
                        clinicId, 
                        page 
                    }
                },
                update: { values: values as any },
                create: {
                    clinicId,
                    page,
                    label: DEFAULT_CONFIGS.find(c => c.page === page)?.label || page,
                    values: values as any
                }
            });

            return res.status(200).json({ 
                message: 'Default values updated successfully',
                success: true
            });
        } catch (error: any) {
            return res.status(500).json({ error: 'Failed to update default values' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
