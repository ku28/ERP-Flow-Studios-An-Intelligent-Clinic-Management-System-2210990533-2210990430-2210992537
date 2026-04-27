import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'

const defaultServices = [
    {
        image: "https://res.cloudinary.com/dwgsflt8h/image/upload/v1750162752/trigeminal-neuralgia-2202_cnz7ri.jpg",
        name: "Trigeminal Neulalgia (TN) Treatment",
        tagline: "No more shocks to bear",
        info: "As indicated by Lambru G, et al. Practical Neurology 2021;21:392-402.",
        description: "Trigeminal neuralgia (TN) is characterised by recurrent, unilateral, brief (<1 s-2 min), very painful, electric shock-like pain episodes in the trigeminal distribution that are abrupt in onset and termination...",
        order: 0
    },
    {
        image: "https://res.cloudinary.com/dwgsflt8h/image/upload/v1750163029/physiotherapy-for-bells-palsy-calgary-nw_yjk4h3.jpg",
        name: "Bell's palsy Treatment",
        tagline: "Move with your intact expressions",
        info: "As evident in Eviston TJ, et al. Journal of Neurology, Neurosurgery and Psychiatry 2015;86:1356-1361.",
        description: "Bell's palsy is a common cranial neuropathy causing acute unilateral lower motor neuron facial paralysis...",
        order: 1
    },
    {
        image: "https://res.cloudinary.com/dwgsflt8h/image/upload/v1750163500/diabetes-treatment_sample.jpg",
        name: "Diabetes Mellitus Treatment",
        tagline: "Control your blood sugar naturally",
        info: "As per American Diabetes Association. Diabetes Care 2024;47(Supplement_1):S1-S321.",
        description: "Diabetes mellitus is a metabolic disorder characterized by chronic hyperglycemia. Our holistic approach combines natural remedies with lifestyle modifications to help manage blood sugar levels effectively and prevent complications...",
        order: 2
    },
    {
        image: "https://res.cloudinary.com/dwgsflt8h/image/upload/v1750163600/kidney-disease_sample.jpg",
        name: "Chronic Kidney Disease Treatment",
        tagline: "Restore and protect kidney function",
        info: "Based on KDIGO Clinical Practice Guideline for Chronic Kidney Disease 2024.",
        description: "Chronic kidney disease (CKD) is a progressive condition affecting kidney function. Our treatment focuses on slowing disease progression, managing symptoms, and supporting overall kidney health through natural therapeutic approaches...",
        order: 3
    },
    {
        image: "https://res.cloudinary.com/dwgsflt8h/image/upload/v1750163700/gallstone-treatment_sample.jpg",
        name: "Gallstone Treatment",
        tagline: "Dissolve stones, restore digestive health",
        info: "According to European Association for the Study of the Liver. Journal of Hepatology 2023.",
        description: "Gallstones are hardened deposits in the gallbladder that can cause significant discomfort. Our natural treatment approach aims to dissolve stones, reduce inflammation, and prevent recurrence without invasive procedures...",
        order: 4
    }
]

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        try {
            let services = await prisma.serviceCard.findMany({
                orderBy: { order: 'asc' }
            })
            
            // If no services exist, create defaults
            if (services.length === 0) {
                for (const service of defaultServices) {
                    await prisma.serviceCard.create({ data: service })
                }
                services = await prisma.serviceCard.findMany({
                    orderBy: { order: 'asc' }
                })
            }
            return res.status(200).json(services)
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch services' })
        }
    }

    if (req.method === 'POST') {
        try {
            const { data } = req.body
            
            // Delete all existing services
            await prisma.serviceCard.deleteMany()
            
            // Create new services with order
            const services = await Promise.all(
                data.map((service: any, index: number) =>
                    prisma.serviceCard.create({
                        data: {
                            image: service.image,
                            name: service.name,
                            tagline: service.tagline,
                            info: service.info,
                            description: service.description,
                            order: index
                        }
                    })
                )
            )
            return res.status(200).json(services)
        } catch (error) {
            return res.status(500).json({ error: 'Failed to save services' })
        }
    }

    res.status(405).json({ error: 'Method not allowed' })
}
