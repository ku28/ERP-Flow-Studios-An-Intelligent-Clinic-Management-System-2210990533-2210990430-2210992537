import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { section } = req.query

    if (req.method === 'GET') {
        try {
            if (section === 'hero') {
                let hero = await prisma.landingHero.findFirst()
                
                // If no hero exists, create default
                if (!hero) {
                    hero = await prisma.landingHero.create({
                        data: {
                            badge: 'An Electrohomeopathy Centre',
                            heading: 'Welcome to ERP Flow Studios landing page',
                            tagline: 'We Care.',
                            imageUrl: 'https://res.cloudinary.com/dwgsflt8h/image/upload/v1749928246/banner_qf5r5l.png'
                        }
                    })
                }
                return res.status(200).json(hero)
            }

            if (section === 'benefits') {
                let benefits = await prisma.landingBenefit.findFirst()
                
                // If no benefits exist, create default
                if (!benefits) {
                    benefits = await prisma.landingBenefit.create({
                        data: {
                            title: 'Why Trust Us?',
                            description: `ERP Flow Studios Electrohomeopathy Centre is expertise in the medicinal world; it is one of the top growing Electrohomeopathy Centres in India; we have helped numerous patients from all over periphery & abroad as well with Electrohomeopathic treatment in our Electrohomeopathy Centre. And treated their chronic disorder without any side effects from their root cause. Electrohomeopathic treatment is very safe, and their medicines contain natural and herbal substances. We don't prescribe generic medication to our patients. Instead, provide the best Electrohomeopathic-based treatment with a proper guidance and a well-researched diet according to disease that can help patients. And also provides some facilities that cure patients physically and psychologically.`,
                            benefits: [
                                {
                                    icon: '💚',
                                    title: 'Consultation',
                                    description: 'Get a free consultation from ERP Flow Studios Electrohomeopathy Centre to understand and analyze issues regarding your health.'
                                },
                                {
                                    icon: '💓',
                                    title: 'Diagnosis',
                                    description: 'At ERP Flow Studios Electrohomeopathy Centre we try to differentiate the common symptoms of the disease and performs in-depth analysis for peculiar, uncommon characteristics.'
                                },
                                {
                                    icon: '🫶',
                                    title: 'Treatment',
                                    description: 'ERP Flow Studios Electrohomeopathy Centre helps to provide a customized Electrohomeopathic treatment plan and diet charts for more accurate outcomes.'
                                },
                                {
                                    icon: '📅',
                                    title: 'Enquire Now',
                                    description: 'Request Appointment Repeat the Medicine. Enquire Now.'
                                }
                            ]
                        }
                    })
                }
                return res.status(200).json(benefits)
            }

            if (section === 'videos') {
                let videos = await prisma.landingVideo.findMany({
                    orderBy: { order: 'asc' }
                })
                
                // If no videos exist, create defaults
                if (videos.length === 0) {
                    const defaultVideos = [
                        { embedUrl: 'https://www.youtube.com/embed/b0akJtrJb7c?si=ATmgLLyvBAr3OAck', title: 'YouTube video player', order: 0 },
                        { embedUrl: 'https://www.youtube.com/embed/JxqXi4JhWvg?si=vdo0EWvUxy426vhs', title: 'YouTube video player', order: 1 },
                        { embedUrl: 'https://www.youtube.com/embed/BE5v5OZPpMw?si=KoqkZmYW9fzB1oGp', title: 'YouTube video player', order: 2 },
                        { embedUrl: 'https://www.youtube.com/embed/-e8aabBBWN0?si=9DOmQ0wFQ14OgR9o', title: 'YouTube video player', order: 3 }
                    ]
                    
                    for (const video of defaultVideos) {
                        await prisma.landingVideo.create({ data: video })
                    }
                    
                    videos = await prisma.landingVideo.findMany({
                        orderBy: { order: 'asc' }
                    })
                }
                return res.status(200).json(videos)
            }

            if (section === 'specialists') {
                let specialists = await prisma.landingSpecialist.findFirst()
                
                // If no specialists content exists, create default
                if (!specialists) {
                    specialists = await prisma.landingSpecialist.create({
                        data: {
                            title: 'Our Specialists',
                            description: `ERP Flow Studios Electrohomeopathy Centre is one of the most prominent Electrohomeopathic Centres in area. Since 1965 Electohomeopathy has treated patients with well-experienced expertise and advanced Electrohomeopathic Methodology. We are offering our services to patients help them in the treatment of Kidney Diseases (like Chronic Kidney Disease, UTI, Diabetic Kidney Disease, Nephrotic syndrome, Renal cyst, Renal stone etc.), Neuralgias ( Trigeminal neuralgia, Glossopharyngeal neuralgia, Bell's Palsy etc.), Diabetes and other chronic diseases. This Electrohomeopathy Centre runs by doctor aiming to provide help for the best treatment to patients. In our Electrohomeopathy Centre, we provide help for customized treatment for each patient and follow up on their health conditions that can help cure them permanently. As a result, It is the only Electrohomeopathy Centre in Area that has built a reputation for its practical impact and evidence-based Electrohomeopathic Treatment guidance.`,
                            quote: '"Drugs are not always necessary. Belief in recovery always is." - Norman Cousins'
                        }
                    })
                }
                return res.status(200).json(specialists)
            }

            return res.status(400).json({ error: 'Invalid section' })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch landing content' })
        }
    }

    if (req.method === 'POST') {
        try {
            const { data } = req.body

            if (section === 'hero') {
                // Delete existing and create new (ensures only one record)
                await prisma.landingHero.deleteMany()
                const hero = await prisma.landingHero.create({ data })
                return res.status(200).json(hero)
            }

            if (section === 'benefits') {
                // Delete existing and create new (ensures only one record)
                await prisma.landingBenefit.deleteMany()
                const benefits = await prisma.landingBenefit.create({ data })
                return res.status(200).json(benefits)
            }

            if (section === 'videos') {
                // Delete all existing videos
                await prisma.landingVideo.deleteMany()
                
                // Create new videos with order
                const videos = await Promise.all(
                    data.map((video: any, index: number) =>
                        prisma.landingVideo.create({
                            data: {
                                embedUrl: video.embedUrl,
                                title: video.title,
                                order: index
                            }
                        })
                    )
                )
                return res.status(200).json(videos)
            }

            if (section === 'specialists') {
                // Delete existing and create new (ensures only one record)
                await prisma.landingSpecialist.deleteMany()
                const specialists = await prisma.landingSpecialist.create({ data })
                return res.status(200).json(specialists)
            }

            return res.status(400).json({ error: 'Invalid section' })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to save landing content' })
        }
    }

    res.status(405).json({ error: 'Method not allowed' })
}
