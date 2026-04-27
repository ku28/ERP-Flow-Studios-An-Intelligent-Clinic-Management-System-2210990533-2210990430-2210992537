import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'

const defaultSpecialities = {
    title: 'Our Specialities',
    description: `ERP Flow Studios Electrohomeopathy Centre is one of the most prominent Electrohomeopathic Centres in area. Since 1965 Electohomeopathy has treated patients with well-experienced expertise and advanced Electrohomeopathic Methodology. We are offering our services to patients help them in the treatment of Kidney Diseases (like Chronic Kidney Disease, UTI, Diabetic Kidney Disease, Nephrotic syndrome, Renal cyst, Renal stone etc.), Neuralgias ( Trigeminal neuralgia, Glossopharyngeal neuralgia, Bell's Palsy etc.), Diabetes and other chronic diseases. This Electrohomeopathy Centre runs by doctor aiming to provide help for the best treatment to patients. In our Electrohomeopathy Centre, we provide help for customized treatment for each patient and follow up on their health conditions that can help cure them permanently. As a result, It is the only Electrohomeopathy Centre in Area that has built a reputation for its practical impact and evidence-based Electrohomeopathic Treatment guidance.`,
    quote: '"Drugs are not always necessary. Belief in recovery always is." - Norman Cousins'
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        try {
            let specialities = await prisma.landingSpecialist.findFirst()
            
            // If no content exists, create default
            if (!specialities) {
                specialities = await prisma.landingSpecialist.create({
                    data: defaultSpecialities
                })
            }
            return res.status(200).json(specialities)
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch specialities' })
        }
    }

    if (req.method === 'POST') {
        try {
            const { data } = req.body
            
            // Delete all existing records
            await prisma.landingSpecialist.deleteMany()
            
            // Create new record
            const specialities = await prisma.landingSpecialist.create({
                data: {
                    title: data.title,
                    description: data.description,
                    quote: data.quote
                }
            })
            
            return res.status(200).json(specialities)
        } catch (error) {
            return res.status(500).json({ error: 'Failed to save specialities' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
