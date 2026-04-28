const prisma = require('./client')

async function main() {
  // create or update super admin
  const bcrypt = require('bcryptjs')
  const superAdminHash = await bcrypt.hash('SuperAdmin@2026', 10)

  await prisma.user.upsert({
    where: { email: 'erpflowstudios@gmail.com' },
    update: { passwordHash: superAdminHash, role: 'super_admin', clinicId: null },
    create: { 
      email: 'erpflowstudios@gmail.com', 
      name: 'Super Admin', 
      role: 'super_admin', 
      passwordHash: superAdminHash,
      verified: true,
      clinicId: null
    }
  })

  console.log('✅ Super Admin created: erpflowstudios@gmail.com')
  console.log('   Password: SuperAdmin@2026')
  console.log('   Please change this password after first login!')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
