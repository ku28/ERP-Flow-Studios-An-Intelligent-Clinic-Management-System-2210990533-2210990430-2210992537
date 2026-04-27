// testEnvFull.ts
// Checks presence and actual functionality of critical environment variables
require('dotenv').config();

const requiredEnv = [
    'DATABASE_URL',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
    'ADMIN_EMAIL',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_FROM',
    'NEXT_PUBLIC_APP_URL',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
];

let hasError = false;
for (const key of requiredEnv) {
    const value = process.env[key];
    if (!value || value === '') {
        console.error(`❌ ENV ERROR: Missing or empty value for ${key}`);
        hasError = true;
    } else {
        console.log(`✅ ${key} is set.`);
    }
}

// 1. Test DATABASE_URL (Prisma)
async function testDatabase() {
    try {
        const { PrismaClient } = require('@prisma/client');
        const { PrismaPg } = require('@prisma/adapter-pg');
        const { Pool } = require('pg');
        const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;
        if (!dbUrl) {
            throw new Error('DATABASE_URL (or DIRECT_URL) is not set');
        }

        const pool = new Pool({ connectionString: dbUrl });
        const adapter = new PrismaPg(pool);
        const prisma = new PrismaClient({ adapter });
        await prisma.$connect();
        await prisma.$disconnect();
        console.log('✅ DATABASE_URL: Successfully connected to database.');
    } catch (err) {
        const msg = (err instanceof Error && err.message) ? err.message : String(err);
        console.error('❌ DATABASE_URL: Failed to connect to database:', msg);
        hasError = true;
    }
}



// 3. Test SMTP
async function testSMTP() {
    try {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT),
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASSWORD,
            },
        });
        await transporter.verify();
        console.log('✅ SMTP: Successfully connected to SMTP server.');
    } catch (err) {
        const msg = (err instanceof Error && err.message) ? err.message : String(err);
        console.error('❌ SMTP: Failed to connect to SMTP server:', msg);
        hasError = true;
    }
}

// 4. Test Twilio
async function testTwilio() {
    try {
        const twilio = require('twilio');
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
        console.log('✅ Twilio: Successfully authenticated with Twilio.');
    } catch (err) {
        const msg = (err instanceof Error && err.message) ? err.message : String(err);
        console.error('❌ Twilio: Failed to authenticate with Twilio:', msg);
        hasError = true;
    }
}

(async () => {
    await testDatabase();
    await testSMTP();
    await testTwilio();
    if (hasError) {
        console.error('Some environment variables are missing or not functional. Please check your .env and service credentials.');
        process.exit(1);
    } else {
        console.log('All required environment variables are set and functional.');
    }
})();
