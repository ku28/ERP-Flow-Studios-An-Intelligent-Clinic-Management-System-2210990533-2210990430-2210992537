import { NextApiRequest, NextApiResponse } from 'next'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const { phone, message } = req.body

    if (!phone || !message) {
        return res.status(400).json({ error: 'Phone number and message are required' })
    }

    try {
        // Format phone number (remove spaces, dashes, and add country code if needed)
        let formattedPhone = phone.replace(/[\s\-\(\)]/g, '')
        
        // If phone doesn't start with country code, assume +91 (India)
        if (!formattedPhone.startsWith('+')) {
            formattedPhone = '+91' + formattedPhone
        }

        // Remove the + for the API
        const phoneNumber = formattedPhone.replace('+', '')

        // Check if WhatsApp API credentials are configured
        const apiKey = process.env.WHATSAPP_API_KEY
        const apiUrl = process.env.WHATSAPP_API_URL

        if (!apiKey || !apiUrl) {
            console.warn('WhatsApp API not configured. Message would be sent to:', phoneNumber)
            console.warn('Message:', message)
            
            // For development/testing without API, just return success
            return res.status(200).json({ 
                success: true, 
                message: 'WhatsApp API not configured. Message logged to console.',
                phone: phoneNumber,
                simulatedSend: true
            })
        }

        // Send WhatsApp message using your preferred API service
        // Example for common WhatsApp Business API providers:
        
        // Option 1: Twilio
        // const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
        //     method: 'POST',
        //     headers: {
        //         'Authorization': 'Basic ' + Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64'),
        //         'Content-Type': 'application/x-www-form-urlencoded',
        //     },
        //     body: new URLSearchParams({
        //         From: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        //         To: `whatsapp:${formattedPhone}`,
        //         Body: message
        //     })
        // })

        // Option 2: WhatsApp Business API (Meta)
        // const response = await fetch(`${apiUrl}/messages`, {
        //     method: 'POST',
        //     headers: {
        //         'Authorization': `Bearer ${apiKey}`,
        //         'Content-Type': 'application/json',
        //     },
        //     body: JSON.stringify({
        //         messaging_product: 'whatsapp',
        //         to: phoneNumber,
        //         type: 'text',
        //         text: { body: message }
        //     })
        // })

        // Option 3: Generic WhatsApp API Gateway
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                phone: phoneNumber,
                message: message
            })
        })

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.error || 'Failed to send WhatsApp message')
        }

        const data = await response.json()

        return res.status(200).json({ 
            success: true, 
            message: 'WhatsApp message sent successfully',
            data 
        })

    } catch (error: any) {
        return res.status(500).json({ 
            error: error.message || 'Failed to send WhatsApp message',
            details: error.toString()
        })
    }
}
