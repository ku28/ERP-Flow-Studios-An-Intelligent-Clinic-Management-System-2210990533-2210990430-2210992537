import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        try {
            let images = await prisma.achievementImage.findMany({
                orderBy: { order: 'asc' }
            });

            // Auto-initialize with default images if empty
            if (images.length === 0) {
                const defaultImages = [
                    { imageUrl: "https://res.cloudinary.com/dwgsflt8h/image/upload/v1750161802/achievement-1_sample.jpg", order: 0 },
                    { imageUrl: "https://res.cloudinary.com/dwgsflt8h/image/upload/v1750161802/achievement-2_sample.jpg", order: 1 },
                    { imageUrl: "https://res.cloudinary.com/dwgsflt8h/image/upload/v1750161802/achievement-3_sample.jpg", order: 2 },
                ];

                await prisma.achievementImage.createMany({
                    data: defaultImages
                });

                images = await prisma.achievementImage.findMany({
                    orderBy: { order: 'asc' }
                });
            }

            return res.status(200).json(images);
        } catch (error) {
            return res.status(500).json({ error: 'Failed to fetch achievement images' });
        }
    }

    if (req.method === 'POST') {
        try {
            // Extract data from the request body (it's wrapped in { data: [...] })
            const { data } = req.body;
            const achievementsData = data || req.body; // Fallback to req.body if data is not present

            // Validate that achievementsData is an array
            if (!Array.isArray(achievementsData)) {
                return res.status(400).json({ error: 'Invalid data format. Expected an array.' });
            }

            // Delete all existing images
            await prisma.achievementImage.deleteMany();

            // Create new images with proper order
            const imagesWithOrder = achievementsData.map((img: any, index: number) => ({
                imageUrl: img.imageUrl,
                order: index
            }));

            await prisma.achievementImage.createMany({
                data: imagesWithOrder
            });

            const updatedImages = await prisma.achievementImage.findMany({
                orderBy: { order: 'asc' }
            });

            return res.status(200).json(updatedImages);
        } catch (error) {
            return res.status(500).json({ error: 'Failed to update achievement images' });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
