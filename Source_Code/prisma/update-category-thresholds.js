const prisma = require('./client');

// Default threshold values for each category
// You can adjust these values based on your business needs
const categoryThresholds = {
    'DROPS 30 ML': 200,
    'DROPS R24-R33': 200,
    'TABLETS': 200,
    'CAPSULES': 200,
    'SYRUPS 200 ML': 200,
    'SYRUPS 100 ML': 200,
    'ECO DROPS 30ML': 200,
    'OINTMENTS': 200,
    'E/E/N/DROPS': 200,
    'COSMETICS': 200,
    'OILS': 200,
    'SPECIAL DROPS': 200,
    'NEW SP DROPS': 200,
    'SPYGERIC D3/30': 200,
    'MISC': 200,
    'DILUTIONS': 200
};

async function updateCategoryThresholds() {
    console.log('🔄 Updating category thresholds...\n');

    let updated = 0;
    let failed = 0;

    for (const [name, reorderLevel] of Object.entries(categoryThresholds)) {
        try {
            const result = await prisma.category.updateMany({
                where: { name },
                data: { reorderLevel }
            });

            if (result.count > 0) {
                console.log(`✅ Updated ${name}: threshold = ${reorderLevel}`);
                updated++;
            } else {
                console.log(`⚠️  Category not found: ${name}`);
                failed++;
            }
        } catch (error) {
            console.error(`❌ Error updating ${name}:`, error.message);
            failed++;
        }
    }

    console.log(`\n📊 Summary: ${updated} updated, ${failed} failed`);
}

updateCategoryThresholds()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
