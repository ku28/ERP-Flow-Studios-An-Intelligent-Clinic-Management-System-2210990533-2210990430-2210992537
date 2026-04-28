const prisma = require('./client');

const categories = [
    'DROPS 30 ML',
    'DROPS R24-R33',
    'TABLETS',
    'CAPSULES',
    'SYRUPS 200 ML',
    'SYRUPS 100 ML',
    'ECO DROPS 30ML',
    'OINTMENTS',
    'E/E/N/DROPS',
    'COSMETICS',
    'OILS',
    'SPECIAL DROPS',
    'NEW SP DROPS',
    'SPYGERIC D3/30',
    'MISC',
    'DILUTIONS'
];

async function seedCategories() {
    console.log('🌱 Seeding categories...\n');

    let created = 0;
    let skipped = 0;

    for (const name of categories) {
        try {
            const existing = await prisma.category.findUnique({
                where: { name }
            });

            if (!existing) {
                await prisma.category.create({
                    data: { name }
                });
                console.log(`✅ Created: ${name}`);
                created++;
            } else {
                console.log(`⏭️  Skipped: ${name} (already exists)`);
                skipped++;
            }
        } catch (error) {
            console.error(`❌ Error creating ${name}:`, error.message);
        }
    }

    console.log(`\n📊 Summary: ${created} created, ${skipped} skipped`);
}

seedCategories()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
