import { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'
import bottlePricingJSON from '../../data/bottlePricing.json'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        // Delete existing bottle pricing data
        await prisma.dropdownOption.deleteMany({
            where: { category: 'bottlePricing' }
        })

        // Insert new data with prices
        const bottlePricingData = bottlePricingJSON.map((item, index) => ({
            category: 'bottlePricing',
            value: item.value,
            label: item.label,
            price: item.price,
            order: index
        }))

        await prisma.dropdownOption.createMany({
            data: bottlePricingData
        })

        res.status(200).json({ 
            message: 'Bottle pricing synced successfully',
            count: bottlePricingData.length 
        })
    } catch (error) {
        res.status(500).json({ error: 'Failed to sync bottle pricing' })
    }
}
