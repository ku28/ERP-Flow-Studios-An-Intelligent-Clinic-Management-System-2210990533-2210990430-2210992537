import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        try {
            let about = await prisma.aboutContent.findFirst()
            
            // If no about content exists, create default
            if (!about) {
                about = await prisma.aboutContent.create({
                    data: {
                        title: 'About Us',
                        description: `ERP Flow Studios is a leading Electrohomeopathic treatment centre all over the country. Doctors use Electrohomeopathic Treatment to cure the acute & chronic diseases since 1965. Electrohomeopathy have served numerous patients with chronic conditions with the help of natural substances and herbs/shurbs without any side effects. ERP Flow Studios Electrohomeopathy Centre gives you all forms of assurance for safe and effective treatment help. We have a team of experienced and well-equipped doctors at our back (E.D.M.A.) who help maintain a healthy lifestyle with proper guidance and well-researched diet chart as per patient's requirements. Our therapies focus more on patient's comfort to help them treat well both physically and psychologically. ERP Flow Studios Electrohomeopathy Centre provide expertise consultation and customized treatment help by understanding your health issues and help to cure them naturally with Electrohomeopathic remedies.`,
                        quote: '"Drugs are not always necessary. Belief in recovery always is." - Norman Cousins'
                    }
                })
            }
            return res.status(200).json(about)
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch about content' })
        }
    }

    if (req.method === 'POST') {
        try {
            const { data } = req.body
            
            // Delete existing and create new (ensures only one record)
            await prisma.aboutContent.deleteMany()
            const about = await prisma.aboutContent.create({ data })
            return res.status(200).json(about)
        } catch (error) {
            return res.status(500).json({ error: 'Failed to save about content' })
        }
    }

    res.status(405).json({ error: 'Method not allowed' })
}
