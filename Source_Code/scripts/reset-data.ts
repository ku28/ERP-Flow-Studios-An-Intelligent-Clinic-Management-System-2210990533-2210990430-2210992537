import prisma from '../lib/prisma'

async function main() {
    console.log('🗑️  Starting database reset (preserving users and landing pages)...')

    try {
        // Delete all ERP data in correct order (respecting foreign keys)
        
        // Tasks
        console.log('Deleting tasks...')
        await prisma.task.deleteMany({})
        
        // Payments
        console.log('Deleting payments...')
        await prisma.payment.deleteMany({})
        
        // Customer Invoice Items and Invoices
        console.log('Deleting customer invoice items...')
        await prisma.customerInvoiceItem.deleteMany({})
        
        console.log('Deleting customer invoices...')
        await prisma.customerInvoice.deleteMany({})
        
        // Prescriptions
        console.log('Deleting prescriptions...')
        await prisma.prescription.deleteMany({})
        
        // Visits
        console.log('Deleting visits...')
        await prisma.visit.deleteMany({})
        
        // Treatment Products and Treatments
        console.log('Deleting treatment products...')
        await prisma.treatmentProduct.deleteMany({})
        
        console.log('Deleting treatments...')
        await prisma.treatment.deleteMany({})
        
        // Demand Forecasts
        console.log('Deleting demand forecasts...')
        await prisma.demandForecast.deleteMany({})
        
        // Stock Transactions
        console.log('Deleting stock transactions...')
        await prisma.stockTransaction.deleteMany({})
        
        // Purchase Order Items and Purchase Orders
        console.log('Deleting purchase order items...')
        await prisma.purchaseOrderItem.deleteMany({})
        
        console.log('Deleting purchase orders...')
        await prisma.purchaseOrder.deleteMany({})
        
        // Product Orders
        console.log('Deleting product orders...')
        await prisma.productOrder.deleteMany({})
        
        // Sales and Purchases
        console.log('Deleting sales...')
        await prisma.sale.deleteMany({})
        
        console.log('Deleting purchases...')
        await prisma.purchase.deleteMany({})
        
        // Product Batches
        console.log('Deleting product batches...')
        await prisma.productBatch.deleteMany({})
        
        // Products
        console.log('Deleting products...')
        await prisma.product.deleteMany({})
        
        // Categories
        console.log('Deleting categories...')
        await prisma.category.deleteMany({})
        
        // Suppliers
        console.log('Deleting suppliers...')
        await prisma.supplier.deleteMany({})
        
        // Tokens
        console.log('Deleting tokens...')
        await prisma.token.deleteMany({})
        
        // Appointments and Appointment Requests
        console.log('Deleting appointments...')
        await prisma.appointment.deleteMany({})
        
        // Invoices
        console.log('Deleting invoices...')
        await prisma.invoice.deleteMany({})
        
        // Patients
        console.log('Deleting patients...')
        await prisma.patient.deleteMany({})

        console.log('✅ Database reset complete!')
        console.log('✅ Preserved data:')
        console.log('   - Users (User, PendingUser, OTP)')
        console.log('   - Landing page content (Hero, Benefits, Videos, Specialists, etc.)')
        console.log('   - About page content')
        console.log('   - Services')
        console.log('   - Gallery and Achievements')
        console.log('   - Contact information')
        
    } catch (error) {
        console.error('❌ Error resetting database:', error)
        throw error
    } finally {
        await prisma.$disconnect()
    }
}

main()
    .catch((e) => {
        console.error(e)
        process.exit(1)
    })
