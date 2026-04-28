import { NextApiRequest, NextApiResponse } from 'next';
import prisma from '../../lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    try {
      let images = await prisma.galleryImage.findMany({
        orderBy: { order: 'asc' }
      });

      // Auto-initialize with default images if empty
      if (images.length === 0) {
        const defaultImages = [
          { imageUrl: "https://res.cloudinary.com/dwgsflt8h/image/upload/v1750161802/gallery-1_xdcbvv.jpg", order: 0 },
          { imageUrl: "https://res.cloudinary.com/dwgsflt8h/image/upload/v1750161802/gallery-2_ypttne.jpg", order: 1 },
          { imageUrl: "https://res.cloudinary.com/dwgsflt8h/image/upload/v1750161802/gallery-3_p2t03n.jpg", order: 2 },
          { imageUrl: "https://res.cloudinary.com/dwgsflt8h/image/upload/v1750161802/gallery-4_wnlcqr.jpg", order: 3 },
          { imageUrl: "https://res.cloudinary.com/dwgsflt8h/image/upload/v1750161802/gallery-5_nxbxu0.jpg", order: 4 },
          { imageUrl: "https://res.cloudinary.com/dwgsflt8h/image/upload/v1750161802/gallery-6_d5xnvu.jpg", order: 5 },
        ];

        await prisma.galleryImage.createMany({
          data: defaultImages
        });

        images = await prisma.galleryImage.findMany({
          orderBy: { order: 'asc' }
        });
      }

      return res.status(200).json(images);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch gallery images' });
    }
  }

  if (req.method === 'POST') {
    try {
      const galleryData = req.body; // Array of { imageUrl, order }

      // Delete all existing images
      await prisma.galleryImage.deleteMany();

      // Create new images with proper order
      const imagesWithOrder = galleryData.map((img: any, index: number) => ({
        imageUrl: img.imageUrl,
        order: index
      }));

      await prisma.galleryImage.createMany({
        data: imagesWithOrder
      });

      const updatedImages = await prisma.galleryImage.findMany({
        orderBy: { order: 'asc' }
      });

      return res.status(200).json(updatedImages);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to update gallery images' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
