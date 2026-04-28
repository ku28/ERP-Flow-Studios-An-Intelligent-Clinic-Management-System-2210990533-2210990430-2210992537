import type { NextApiRequest, NextApiResponse } from 'next'
import { getSessionUser, getClinicIdFromUser } from '../../../lib/auth'
import { isFeatureAllowed } from '../../../lib/subscription'
import { getClinicAwareDoctorFilter } from '../../../lib/doctorUtils'
import prisma from '../../../lib/prisma'
import fs from 'fs'
import path from 'path'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const authUser = await getSessionUser(req)

    if (!authUser) {
        return res.status(401).json({ error: 'Not authenticated' })
    }

    if (authUser.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin role required.' })
    }

    if (!isFeatureAllowed(authUser?.clinic?.subscriptionPlan, 'admin_settings')) {
        return res.status(403).json({ error: 'Admin Settings is available in Standard plan.' })
    }

    if (req.method === 'GET') {
        try {
            const file = req.query.file as string
            if (!file || !file.endsWith('.json')) {
                return res.status(400).json({ error: 'Invalid file name' })
            }

            // Extract category name from filename
            const category = file.replace('.json', '')

            // Special handling for categories.json - fetch from Category table
            if (category === 'categories') {
                const doctorFilter = await getClinicAwareDoctorFilter(authUser, prisma)
                const categories = await prisma.category.findMany({
                    where: doctorFilter,
                    orderBy: { name: 'asc' }
                })
                
                const data = categories.map((cat : any) => ({
                    id: cat.id,
                    name: cat.name,
                    value: cat.name,
                    label: cat.name,
                    code: cat.code || ''
                }))
                
                return res.status(200).json({ data })
            }

            // Try to fetch options from database first
            const dbOptions = await prisma.dropdownOption.findMany({
                where: { category },
                orderBy: { order: 'asc' }
            })

            // If database has items, use them
            if (dbOptions.length > 0) {
                const data = dbOptions.map((opt: any) => {
                    const item: any = {
                        value: opt.value,
                        label: opt.label
                    }
                    // Include price field if it exists (for bottlePricing)
                    if (opt.price !== null && opt.price !== undefined) {
                        item.price = opt.price
                    }
                    return item
                })
                return res.status(200).json({ data })
            }

            // Otherwise, read from JSON file
            const filePath = path.join(process.cwd(), 'data', file)
            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'File not found' })
            }

            const fileContent = fs.readFileSync(filePath, 'utf-8')
            const jsonData = JSON.parse(fileContent)
            
            // Return the JSON data as-is (preserving all fields like price)
            return res.status(200).json({ data: Array.isArray(jsonData) ? jsonData : [] })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to read dropdown data' })
        }
    }

    if (req.method === 'POST') {
        try {
            const { file, item } = req.body
            
            if (!file || !file.endsWith('.json')) {
                return res.status(400).json({ error: 'Invalid file name' })
            }

            if (!item) {
                return res.status(400).json({ error: 'Item data is required' })
            }

            // Extract category name from filename
            const category = file.replace('.json', '')
            const filePath = path.join(process.cwd(), 'data', file)

            // Check if working with JSON file or database
            let data: any[] = []
            
            try {
                // Try database first
                const dbOptions = await prisma.dropdownOption.findMany({
                    where: { category }
                })

                if (dbOptions.length > 0) {
                    // Working with database
                    if (!item.value || !item.label) {
                        return res.status(400).json({ error: 'Item must have value and label' })
                    }

                    const existing = await prisma.dropdownOption.findUnique({
                        where: {
                            category_value: {
                                category,
                                value: item.value
                            }
                        }
                    })

                    if (existing) {
                        return res.status(400).json({ error: 'Item with this value already exists' })
                    }

                    const maxOrder = await prisma.dropdownOption.aggregate({
                        where: { category },
                        _max: { order: true }
                    })

                    await prisma.dropdownOption.create({
                        data: {
                            category,
                            value: item.value,
                            label: item.label,
                            price: item.price !== undefined ? Number(item.price) : null,
                            order: (maxOrder._max.order || 0) + 1
                        }
                    })

                    const updated = await prisma.dropdownOption.findMany({
                        where: { category },
                        orderBy: { order: 'asc' }
                    })

                    data = updated.map((opt: any) => {
                        const result: any = { value: opt.value, label: opt.label }
                        if (opt.price !== null && opt.price !== undefined) {
                            result.price = opt.price
                        }
                        return result
                    })
                } else {
                    // Working with JSON file
                    if (fs.existsSync(filePath)) {
                        const fileContent = fs.readFileSync(filePath, 'utf-8')
                        data = JSON.parse(fileContent)
                    }

                    // Check for duplicates
                    if (data.some((d: any) => d.value === item.value)) {
                        return res.status(400).json({ error: 'Item with this value already exists' })
                    }

                    data.push(item)
                    fs.writeFileSync(filePath, JSON.stringify(data, null, 4))
                }
            } catch (err) {
                // Fallback to JSON file
                if (fs.existsSync(filePath)) {
                    const fileContent = fs.readFileSync(filePath, 'utf-8')
                    data = JSON.parse(fileContent)
                }

                if (data.some((d: any) => d.value === item.value)) {
                    return res.status(400).json({ error: 'Item with this value already exists' })
                }

                data.push(item)
                fs.writeFileSync(filePath, JSON.stringify(data, null, 4))
            }

            return res.status(200).json({ message: 'Item added successfully', data })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to add dropdown item' })
        }
    }

    if (req.method === 'PUT') {
        try {
            const { file, item, oldValue } = req.body
            
            if (!file || !file.endsWith('.json')) {
                return res.status(400).json({ error: 'Invalid file name' })
            }

            if (!item) {
                return res.status(400).json({ error: 'Item data is required' })
            }

            // Extract category name from filename
            const category = file.replace('.json', '')
            const filePath = path.join(process.cwd(), 'data', file)

            let data: any[] = []

            try {
                // Try database first
                const dbOptions = await prisma.dropdownOption.findMany({
                    where: { category }
                })

                if (dbOptions.length > 0) {
                    // Working with database
                    if (!item.value || !item.label) {
                        return res.status(400).json({ error: 'Item must have value and label' })
                    }

                    const existing = await prisma.dropdownOption.findUnique({
                        where: {
                            category_value: {
                                category,
                                value: oldValue
                            }
                        }
                    })

                    if (!existing) {
                        return res.status(404).json({ error: 'Item not found' })
                    }

                    await prisma.dropdownOption.update({
                        where: {
                            category_value: {
                                category,
                                value: oldValue
                            }
                        },
                        data: {
                            value: item.value,
                            label: item.label,
                            price: item.price !== undefined ? Number(item.price) : null
                        }
                    })

                    const updated = await prisma.dropdownOption.findMany({
                        where: { category },
                        orderBy: { order: 'asc' }
                    })

                    data = updated.map((opt: any) => {
                        const result: any = { value: opt.value, label: opt.label }
                        if (opt.price !== null && opt.price !== undefined) {
                            result.price = opt.price
                        }
                        return result
                    })
                } else {
                    // Working with JSON file
                    if (!fs.existsSync(filePath)) {
                        return res.status(404).json({ error: 'File not found' })
                    }

                    const fileContent = fs.readFileSync(filePath, 'utf-8')
                    data = JSON.parse(fileContent)

                    const index = data.findIndex((d: any) => d.value === oldValue)
                    if (index === -1) {
                        return res.status(404).json({ error: 'Item not found' })
                    }

                    // Update the item while preserving all fields
                    data[index] = { ...data[index], ...item }
                    fs.writeFileSync(filePath, JSON.stringify(data, null, 4))
                }
            } catch (err) {
                // Fallback to JSON file
                if (!fs.existsSync(filePath)) {
                    return res.status(404).json({ error: 'File not found' })
                }

                const fileContent = fs.readFileSync(filePath, 'utf-8')
                data = JSON.parse(fileContent)

                const index = data.findIndex((d: any) => d.value === oldValue)
                if (index === -1) {
                    return res.status(404).json({ error: 'Item not found' })
                }

                data[index] = { ...data[index], ...item }
                fs.writeFileSync(filePath, JSON.stringify(data, null, 4))
            }

            return res.status(200).json({ message: 'Item updated successfully', data })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to update dropdown item' })
        }
    }

    if (req.method === 'DELETE') {
        try {
            const { file, value } = req.body
            
            if (!file || !file.endsWith('.json')) {
                return res.status(400).json({ error: 'Invalid file name' })
            }

            if (value === undefined || value === null || value === '') {
                return res.status(400).json({ error: 'Value is required to delete an item' })
            }

            // Extract category name from filename
            const category = file.replace('.json', '')
            const filePath = path.join(process.cwd(), 'data', file)

            let data: any[] = []

            // Special handling for categories.json - delete from Category table
            if (category === 'categories') {
                try {
                    const doctorFilter = await getClinicAwareDoctorFilter(authUser, prisma)
                    
                    // Find and delete the category by name
                    const existing = await prisma.category.findFirst({
                        where: { name: value, ...doctorFilter }
                    })
                    
                    if (!existing) {
                        return res.status(404).json({ error: 'Category not found' })
                    }

                    await prisma.category.delete({
                        where: { id: existing.id }
                    })

                    // Return updated list
                    const categories = await prisma.category.findMany({
                        where: doctorFilter,
                        orderBy: { name: 'asc' }
                    })
                    data = categories.map((cat: any) => ({
                        id: cat.id,
                        name: cat.name,
                        value: cat.name,
                        label: cat.name,
                        code: cat.code || ''
                    }))
                    return res.status(200).json({ message: 'Category deleted successfully', data })
                } catch (catErr: any) {
                    console.error('[Dropdown API] Category delete error:', catErr?.message || catErr)
                    // If category has products, it will fail with a foreign key constraint
                    if (catErr?.code === 'P2003') {
                        return res.status(400).json({ error: 'Cannot delete category that has products. Remove or reassign products first.' })
                    }
                    return res.status(500).json({ error: 'Failed to delete category: ' + (catErr?.message || 'Unknown error') })
                }
            }

            try {
                // Try database first
                const dbOptions = await prisma.dropdownOption.findMany({
                    where: { category }
                })

                if (dbOptions.length > 0) {
                    // Working with database
                    const existing = await prisma.dropdownOption.findUnique({
                        where: {
                            category_value: {
                                category,
                                value
                            }
                        }
                    })
                    
                    if (!existing) {
                        return res.status(404).json({ error: 'Item not found' })
                    }

                    await prisma.dropdownOption.delete({
                        where: {
                            category_value: {
                                category,
                                value
                            }
                        }
                    })

                    const updated = await prisma.dropdownOption.findMany({
                        where: { category },
                        orderBy: { order: 'asc' }
                    })

                    data = updated.map((opt: any) => {
                        const item: any = { value: opt.value, label: opt.label }
                        if (opt.price !== null && opt.price !== undefined) {
                            item.price = opt.price
                        }
                        return item
                    })
                } else {
                    // Working with JSON file
                    if (!fs.existsSync(filePath)) {
                        return res.status(404).json({ error: 'File not found' })
                    }

                    const fileContent = fs.readFileSync(filePath, 'utf-8')
                    data = JSON.parse(fileContent)

                    const index = data.findIndex((d: any) => d.value === value)
                    if (index === -1) {
                        return res.status(404).json({ error: 'Item not found' })
                    }

                    data.splice(index, 1)
                    fs.writeFileSync(filePath, JSON.stringify(data, null, 4))
                }
            } catch (err) {
                // Fallback to JSON file
                if (!fs.existsSync(filePath)) {
                    return res.status(404).json({ error: 'File not found' })
                }

                const fileContent = fs.readFileSync(filePath, 'utf-8')
                data = JSON.parse(fileContent)

                const index = data.findIndex((d: any) => d.value === value)
                if (index === -1) {
                    return res.status(404).json({ error: 'Item not found' })
                }

                data.splice(index, 1)
                fs.writeFileSync(filePath, JSON.stringify(data, null, 4))
            }

            return res.status(200).json({ message: 'Item deleted successfully', data })
        } catch (error) {
            return res.status(500).json({ error: 'Failed to delete dropdown item' })
        }
    }

    return res.status(405).json({ error: 'Method not allowed' })
}
