import type { NextApiRequest, NextApiResponse } from 'next'
import prisma from '../../../lib/prisma'
import { verifySessionToken } from '../../../lib/auth'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'PUT') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        const token = req.cookies.session
        if (!token) {
            return res.status(401).json({ error: 'Unauthorized' })
        }

        const decoded = verifySessionToken(token)
        const user = await prisma.user.findUnique({
            where: { id: decoded.sub },
            include: { clinic: true }
        })

        if (!user || user.role !== 'admin' || !user.clinic) {
            return res.status(403).json({ error: 'Access denied. Only clinic admins can change integrations.' })
        }

        const { ocrProvider, geolocationProvider, apiGoogleMapsKey } = req.body

        // Google Vision OCR is pro-only
        if (ocrProvider === 'google_vision' && user.clinic.subscriptionPlan !== 'pro') {
            return res.status(403).json({ error: 'Google Vision OCR is a Pro feature. Please upgrade your plan.' })
        }

        if ((geolocationProvider === 'google_maps' || apiGoogleMapsKey) && user.clinic.subscriptionPlan !== 'pro') {
            return res.status(403).json({ error: 'Google Maps is a Pro feature. Please upgrade your plan.' })
        }

        const updateData: any = {}

        if (ocrProvider !== undefined) {
            if (!['tesseract', 'google_vision'].includes(ocrProvider)) {
                return res.status(400).json({ error: 'Invalid OCR provider' })
            }
            updateData.ocrProvider = ocrProvider
        }

        if (geolocationProvider !== undefined) {
            if (!['browser', 'google_maps'].includes(geolocationProvider)) {
                return res.status(400).json({ error: 'Invalid geolocation provider' })
            }
            updateData.geolocationProvider = geolocationProvider
        }

        if (apiGoogleMapsKey !== undefined) {
            updateData.apiGoogleMapsKey = apiGoogleMapsKey || null
        }

        const clinic = await prisma.clinic.update({
            where: { id: user.clinic.id },
            data: updateData
        })

        return res.status(200).json({
            message: 'Integration settings updated successfully',
            clinic: {
                ocrProvider: clinic.ocrProvider,
                geolocationProvider: clinic.geolocationProvider,
                hasGoogleMapsKey: !!clinic.apiGoogleMapsKey,
            }
        })
    } catch (error: any) {
        return res.status(500).json({ error: 'Failed to update integration settings' })
    }
}
