import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { parseTreatmentKeywordsFromNotes } from './treatmentKeywords'

declare global {
  // eslint-disable-next-line no-var
  var prisma: any
}

/**
 * Build a connection URL that is safe for serverless / edge environments.
 *
 * Supabase (and similar providers) expose two URLs:
 *   DATABASE_URL  – the PgBouncer / connection-pooler URL (port 6543)
 *   DIRECT_URL    – a direct TCP connection (port 5432, used by migrations)
 *
 * Prisma's own internal pool defaults to 25 connections.  In a serverless
 * deployment (e.g. Vercel) every cold-start worker opens its own pool, so
 * you can rapidly exhaust the database's max connections.
 *
 * Setting `connection_limit=1` tells Prisma to hold only one connection per
 * worker process, which is the correct strategy for serverless functions.
 * `pool_timeout=20` gives each query up to 20 s to acquire a connection
 * (vs the default 10 s) so transient spikes don't immediately surface as
 * timeout errors.
 */
function buildDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw
  try {
    const url = new URL(raw)
    // Only add these params when they haven't already been set explicitly.
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', '1')
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '20')
    }
    return url.toString()
  } catch {
    // If the URL can't be parsed (unusual format) return as-is.
    return raw
  }
}

function createPrismaClient(): PrismaClient {
  const dbUrl = buildDatabaseUrl(process.env.DATABASE_URL || process.env.DIRECT_URL)
  if (!dbUrl) {
    throw new Error('Missing DATABASE_URL (or DIRECT_URL) for Prisma client initialization')
  }

  const pool = new Pool({ connectionString: dbUrl })
  // Avoid a false-positive TS mismatch when multiple @types/pg versions coexist.
  const adapter = new PrismaPg(pool as any)

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

const applyKeywordsFromNotes = (data: any, forceWhenMissingNotes = false) => {
  if (!data || typeof data !== 'object') return
  if (!Object.prototype.hasOwnProperty.call(data, 'notes')) {
    if (forceWhenMissingNotes && !Object.prototype.hasOwnProperty.call(data, 'keywords')) {
      data.keywords = []
    }
    return
  }
  data.keywords = parseTreatmentKeywordsFromNotes(data.notes)
}

function withTreatmentKeywordSync(client: PrismaClient): PrismaClient {
  const extended = client.$extends({
    query: {
      treatment: {
        async create({ args, query }) {
          if (args?.data) applyKeywordsFromNotes(args.data, true)
          return query(args)
        },
        async update({ args, query }) {
          if (args?.data) applyKeywordsFromNotes(args.data)
          return query(args)
        },
        async upsert({ args, query }) {
          if (args?.create) applyKeywordsFromNotes(args.create, true)
          if (args?.update) applyKeywordsFromNotes(args.update)
          return query(args)
        },
        async createMany({ args, query }) {
          const data = args?.data
          if (Array.isArray(data)) {
            data.forEach((item: any) => applyKeywordsFromNotes(item, true))
          } else if (data) {
            applyKeywordsFromNotes(data, true)
          }
          return query(args)
        },
        async updateMany({ args, query }) {
          if (args?.data) applyKeywordsFromNotes(args.data)
          return query(args)
        },
      },
    },
  })

  return extended as unknown as PrismaClient
}

// ── Singleton pattern ──────────────────────────────────────────────────────
// Always store in global so that:
//   • Development: Hot-module reloading doesn't create a new client on every
//     file save (the classic Next.js pattern).
//   • Production / serverless: Multiple top-level evaluations of this module
//     within the same worker process all share the same client and therefore
//     the same (small) connection pool.
const _prisma: PrismaClient = global.prisma ?? withTreatmentKeywordSync(createPrismaClient())
global.prisma = _prisma

// Graceful shutdown — only register once across HMR reloads by tracking a
// flag in global. Without this guard, every hot-reload re-evaluation adds
// another set of listeners, quickly exceeding Node's 10-listener limit.
if (typeof process !== 'undefined' && !(global as any).__prismaShutdownRegistered) {
  ;(global as any).__prismaShutdownRegistered = true
  const shutdown = async () => {
    try { await _prisma.$disconnect() } catch { /* ignore */ }
  }
  process.on('beforeExit', shutdown)
  process.on('SIGINT',  async () => { await shutdown(); process.exit(0) })
  process.on('SIGTERM', async () => { await shutdown(); process.exit(0) })
}

// Export as `any` to avoid transient TypeScript model-delegate mismatches
// during iterative development while preserving the runtime Prisma client.
const prisma: any = _prisma as any

export default prisma
