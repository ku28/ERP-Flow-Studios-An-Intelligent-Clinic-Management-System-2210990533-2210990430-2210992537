import { NextApiRequest, NextApiResponse } from 'next'
import formidable from 'formidable'
import fs from 'fs'

export const config = {
    api: {
        bodyParser: false,
    },
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    try {
        // Load pdf-parse dynamically
        const pdfParse = require('pdf-parse')
        
        const form = formidable({ multiples: false })
        
        const [fields, files] = await new Promise<[formidable.Fields, formidable.Files]>((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) reject(err)
                resolve([fields, files])
            })
        })

        const pdfFile = Array.isArray(files.pdf) ? files.pdf[0] : files.pdf
        
        if (!pdfFile) {
            return res.status(400).json({ error: 'No PDF file uploaded' })
        }

        const dataBuffer = fs.readFileSync(pdfFile.filepath)
        const pdfData = await pdfParse(dataBuffer)
        
        // Extract text from PDF
        const text = pdfData.text
        
        // Parse invoice data using regex patterns
        const extractedData = parseInvoiceText(text)
        
        // Clean up uploaded file
        fs.unlinkSync(pdfFile.filepath)
        
        return res.status(200).json(extractedData)
    } catch (error: any) {
        return res.status(500).json({ error: error.message || 'Failed to parse PDF' })
    }
}

function parseInvoiceText(text: string) {
    const data: any = {
        customerName: '',
        customerEmail: '',
        customerPhone: '',
        customerAddress: '',
        customerGSTIN: '',
        invoiceDate: '',
        dueDate: '',
        discount: '',
        notes: '',
        items: []
    }

    try {
        // Extract customer name - "ERP Flow Studios" format
        const nameLines = text.split(/[\n\r]+/)
        for (let i = 0; i < nameLines.length; i++) {
            const line = nameLines[i].trim()
            if (/^[A-Z\s'&]{10,}$/.test(line) && !/(GURU|PHARMA|INVOICE|DATE|GSTIN)/.test(line)) {
                data.customerName = line
                break
            }
        }

        // Extract email
        const emailMatch = text.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/)
        if (emailMatch) {
            data.customerEmail = emailMatch[1].trim()
        }

        // Extract phone - get first 10 digit number after customer name
        const phoneMatch = text.match(/Contact\s+No[^\d]*(\d{10})/) || 
                          text.match(/(\d{10})/)
        if (phoneMatch) {
            data.customerPhone = phoneMatch[1]
        }

        // Extract address
        const addressMatch = text.match(/ROAD[,\s]+([^\\n]+)/i)
        if (addressMatch) {
            data.customerAddress = addressMatch[1].trim()
        }

        // Extract GSTIN
        const gstinMatch = text.match(/GSTIN[\s:]*([A-Z0-9]{15})/i)
        if (gstinMatch) {
            data.customerGSTIN = gstinMatch[1].trim()
        }

        // Extract invoice date - DD-MM-YYYY
        const dateMatch = text.match(/DATE[\s:]*[\n\r]*(\d{2}-\d{2}-\d{4})/)
        if (dateMatch) {
            data.invoiceDate = parseDate(dateMatch[1])
        }

        // Extract discount
        const discountMatch = text.match(/Discount[\s\w]*(?:\₹)?[\s:]*(\d+\.?\d*)/)
        if (discountMatch) {
            data.discount = discountMatch[1]
        }

        // Extract line items
        const lines = text.split(/[\n\r]+/)
        let capturing = false
        
        for (const line of lines) {
            const trimmed = line.trim()
            
            if (/Description of Goods/i.test(trimmed)) {
                capturing = true
                continue
            }
            
            if (/Total Amount Before Tax|BANK NAME/i.test(trimmed)) {
                break
            }
            
            if (capturing && trimmed) {
                // Pattern: "1 ASHWAGAND 2 100ML 1 485.00 485.00"
                const match = trimmed.match(/^(\d+)\s+([A-Z][A-Z\s\d\.\/]+?)\s+(\d+)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)$/)
                
                if (match) {
                    const [, , desc, qty, price] = match
                    data.items.push({
                        productId: '',
                        description: desc.trim(),
                        quantity: qty,
                        unitPrice: price.replace(/,/g, ''),
                        taxRate: '',
                        discount: ''
                    })
                }
            }
        }

        if (data.items.length === 0) {
            data.items.push({
                productId: '',
                description: '',
                quantity: '1',
                unitPrice: '0',
                taxRate: '',
                discount: ''
            })
        }

    } catch (error) {
    }

    return data
}

function parseDate(dateStr: string): string {
    try {
        const parts = dateStr.split(/[\/-]/)
        
        if (parts.length === 3) {
            const day = parseInt(parts[0])
            const month = parseInt(parts[1])
            let year = parseInt(parts[2])

            if (year < 100) year += 2000

            return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        }
    } catch (error) {
    }
    
    return new Date().toISOString().split('T')[0]
}
