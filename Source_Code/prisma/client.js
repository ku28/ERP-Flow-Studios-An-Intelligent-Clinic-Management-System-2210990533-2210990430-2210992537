require('dotenv/config')

const { PrismaClient } = require('@prisma/client')
const { PrismaPg } = require('@prisma/adapter-pg')
const { Pool } = require('pg')

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL

if (!connectionString) {
  throw new Error('Missing DATABASE_URL (or DIRECT_URL) for Prisma client initialization')
}

const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)

const prisma = new PrismaClient({ adapter })

module.exports = prisma
