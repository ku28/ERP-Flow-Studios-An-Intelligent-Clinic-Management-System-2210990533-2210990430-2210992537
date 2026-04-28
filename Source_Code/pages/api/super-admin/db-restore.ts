import type { NextApiRequest, NextApiResponse } from 'next'
import formidable, { type File as FormidableFile } from 'formidable'
import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { randomUUID } from 'crypto'
import { Client } from 'pg'
import prisma from '../../../lib/prisma'
import { verifySessionToken } from '../../../lib/auth'

const execFileAsync = promisify(execFile)

type RestoreJobStatus = 'running' | 'completed' | 'failed'
type RestoreScope = 'clinic' | 'whole'

interface TableMergeSummary {
    table: string
    status: 'pending' | 'processing' | 'completed' | 'skipped'
    scannedRows: number
    insertedRows: number
    skippedRows: number
    errors: number
    note?: string
    startedAt?: string
    finishedAt?: string
}

interface RestoreJob {
    id: string
    scope: RestoreScope
    clinicId: string
    clinicCode: string
    clinicName: string
    status: RestoreJobStatus
    phase: string
    percent: number
    message: string
    startedAt: string
    finishedAt?: string
    logs: string[]
    result?: {
        scannedRows: number
        insertedRows: number
        skippedRows: number
        tableSummaries: TableMergeSummary[]
    }
    error?: string
}

interface ScopeSets {
    userIds: number[]
    patientIds: number[]
    visitIds: number[]
    productIds: number[]
    treatmentIds: number[]
    supplierIds: number[]
    purchaseOrderIds: number[]
    productBatchIds: number[]
    customerInvoiceIds: number[]
}

interface TablePlan {
    table: string
    whereClause: string
    params: any[]
    batchSize?: number
}

const globalWithRestoreJobs = globalThis as typeof globalThis & {
    __clinicRestoreJobs?: Map<string, RestoreJob>
}

if (!globalWithRestoreJobs.__clinicRestoreJobs) {
    globalWithRestoreJobs.__clinicRestoreJobs = new Map<string, RestoreJob>()
}

const restoreJobs = globalWithRestoreJobs.__clinicRestoreJobs
const JOB_RETENTION_MS = 1000 * 60 * 60

export const config = {
    api: {
        bodyParser: false,
    },
}

function quoteIdent(identifier: string) {
    return `"${identifier.replace(/"/g, '""')}"`
}

function quotePublicTable(tableName: string) {
    return `${quoteIdent('public')}.${quoteIdent(tableName)}`
}

function getSingleField(fields: formidable.Fields<string>, key: string): string {
    const value = fields[key]
    if (Array.isArray(value)) return value[0] || ''
    return value || ''
}

function getSingleFile(files: formidable.Files<string>, key: string): FormidableFile | null {
    const value = files[key]
    if (!value) return null
    if (Array.isArray(value)) return value[0] || null
    return value
}

function getDbUrlForDatabase(dbUrl: string, databaseName: string) {
    const url = new URL(dbUrl)
    url.pathname = `/${databaseName}`
    return url.toString()
}

function getPgCliSafeDbUrl(dbUrl: string) {
    try {
        const url = new URL(dbUrl)
        const nonLibpqParams = ['pgbouncer', 'schema', 'connection_limit', 'pool_timeout']
        nonLibpqParams.forEach((key) => url.searchParams.delete(key))
        return url.toString()
    } catch {
        // Fallback for non-URL DSN formats.
        return dbUrl
    }
}

function getAdminDbUrl(dbUrl: string) {
    const adminDb = process.env.PG_ADMIN_DB || 'postgres'
    return getDbUrlForDatabase(dbUrl, adminDb)
}

function stripWrappingQuotes(value: string) {
    const trimmed = String(value || '').trim()
    if (!trimmed) return ''
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
        return trimmed.slice(1, -1)
    }
    return trimmed
}

function isExecutableFile(filePath: string) {
    try {
        return fs.statSync(filePath).isFile()
    } catch {
        return false
    }
}

function resolveCommandFromPath(commandValue: string) {
    const command = stripWrappingQuotes(commandValue)
    if (!command) return null

    const isWindows = process.platform === 'win32'
    const hasPathSeparator = command.includes('/') || command.includes('\\')
    const ext = path.extname(command)
    const pathEntries = String(process.env.PATH || '').split(path.delimiter).filter(Boolean)

    const commandVariants = (() => {
        if (!isWindows) return [command]
        if (ext) return [command]

        const envPathExt = String(process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
            .split(';')
            .map((value) => value.trim())
            .filter(Boolean)
        const pathExt = envPathExt.length > 0 ? envPathExt : ['.EXE', '.CMD', '.BAT', '.COM']
        return [command, ...pathExt.map((suffix) => `${command}${suffix}`)]
    })()

    const candidates: string[] = []
    if (hasPathSeparator || path.isAbsolute(command)) {
        candidates.push(...commandVariants)
    }

    pathEntries.forEach((dirPath) => {
        commandVariants.forEach((variant) => {
            candidates.push(path.join(dirPath, variant))
        })
    })

    for (const candidate of candidates) {
        if (isExecutableFile(candidate)) {
            return candidate
        }
    }

    return null
}

function discoverWindowsPostgresCommand(commandName: 'pg_restore' | 'psql') {
    const executableName = `${commandName}.exe`
    const roots = [
        process.env.ProgramFiles,
        process.env['ProgramFiles(x86)'],
        process.env.LOCALAPPDATA,
        'C:\\Program Files',
        'C:\\Program Files (x86)',
    ].filter((value): value is string => !!value)

    const postgresRootDirs = roots.map((root) => path.join(root, 'PostgreSQL'))

    for (const postgresRoot of postgresRootDirs) {
        if (!fs.existsSync(postgresRoot)) continue

        const directBinCandidate = path.join(postgresRoot, 'bin', executableName)
        if (isExecutableFile(directBinCandidate)) {
            return directBinCandidate
        }

        let versionDirs: string[] = []
        try {
            versionDirs = fs
                .readdirSync(postgresRoot, { withFileTypes: true })
                .filter((entry) => entry.isDirectory())
                .map((entry) => entry.name)
                .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }))
        } catch {
            versionDirs = []
        }

        for (const versionDir of versionDirs) {
            const candidate = path.join(postgresRoot, versionDir, 'bin', executableName)
            if (isExecutableFile(candidate)) {
                return candidate
            }
        }
    }

    return null
}

function discoverUnixPostgresCommand(commandName: 'pg_restore' | 'psql') {
    const commonCandidates = [
        `/usr/bin/${commandName}`,
        `/usr/local/bin/${commandName}`,
        `/opt/homebrew/bin/${commandName}`,
        `/opt/local/bin/${commandName}`,
    ]

    for (const candidate of commonCandidates) {
        if (isExecutableFile(candidate)) {
            return candidate
        }
    }

    const versionedRoot = '/usr/lib/postgresql'
    if (!fs.existsSync(versionedRoot)) {
        return null
    }

    let versionDirs: string[] = []
    try {
        versionDirs = fs
            .readdirSync(versionedRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }))
    } catch {
        versionDirs = []
    }

    for (const versionDir of versionDirs) {
        const candidate = path.join(versionedRoot, versionDir, 'bin', commandName)
        if (isExecutableFile(candidate)) {
            return candidate
        }
    }

    return null
}

function resolvePostgresClientCommand(commandName: 'pg_restore' | 'psql', envVarName: 'PG_RESTORE_COMMAND' | 'PSQL_COMMAND') {
    const configured = stripWrappingQuotes(String(process.env[envVarName] || ''))
    if (configured) {
        const resolvedConfigured = resolveCommandFromPath(configured)
        if (resolvedConfigured) {
            return resolvedConfigured
        }
        throw new Error(
            `${envVarName} is set but the executable was not found: ${configured}. ` +
            `Set ${envVarName} to a valid full path for ${commandName}.`
        )
    }

    const fromPath = resolveCommandFromPath(commandName)
    if (fromPath) {
        return fromPath
    }

    const discovered = process.platform === 'win32'
        ? discoverWindowsPostgresCommand(commandName)
        : discoverUnixPostgresCommand(commandName)

    if (discovered) {
        return discovered
    }

    throw new Error(
        `PostgreSQL client tool not found: ${commandName}. ` +
        `Install PostgreSQL client tools on this server or set ${envVarName} to the full executable path.`
    )
}

function isLikelyPlainSqlFile(filePath: string) {
    const inspectLength = 256
    const fileHandle = fs.openSync(filePath, 'r')

    try {
        const buffer = new Uint8Array(inspectLength)
        const bytesRead = fs.readSync(fileHandle, buffer, 0, inspectLength, 0)
        if (bytesRead <= 0) return false

        const header = Buffer.from(buffer.subarray(0, Math.min(bytesRead, 5))).toString('utf8')
        if (header === 'PGDMP') {
            // PostgreSQL custom/tar dump format signature.
            return false
        }

        for (let i = 0; i < bytesRead; i += 1) {
            if (buffer[i] === 0) {
                return false
            }
        }

        return true
    } finally {
        fs.closeSync(fileHandle)
    }
}

function pruneOldJobs() {
    const now = Date.now()
    for (const [jobId, job] of restoreJobs.entries()) {
        if (job.status === 'running') continue
        const finishedAt = job.finishedAt ? new Date(job.finishedAt).getTime() : 0
        if (!finishedAt) continue
        if (now - finishedAt > JOB_RETENTION_MS) {
            restoreJobs.delete(jobId)
        }
    }
}

function appendLog(jobId: string, message: string) {
    const job = restoreJobs.get(jobId)
    if (!job) return
    const timestamp = new Date().toISOString()
    job.logs = [...job.logs.slice(-149), `[${timestamp}] ${message}`]
}

function updateJob(jobId: string, patch: Partial<RestoreJob>) {
    const job = restoreJobs.get(jobId)
    if (!job) return
    restoreJobs.set(jobId, { ...job, ...patch })
}

function updateJobProgress(jobId: string, phase: string, percent: number, message: string) {
    updateJob(jobId, { phase, percent, message })
    appendLog(jobId, `${phase} (${percent}%): ${message}`)
}

function publishLiveResult(
    jobId: string,
    scannedRows: number,
    insertedRows: number,
    skippedRows: number,
    tableSummaries: TableMergeSummary[]
) {
    updateJob(jobId, {
        result: {
            scannedRows,
            insertedRows,
            skippedRows,
            tableSummaries,
        },
    })
}

async function requireSuperAdmin(req: NextApiRequest) {
    const token = req.cookies.session
    if (!token) return null

    const decoded = verifySessionToken(token) as { sub?: number } | null
    if (!decoded?.sub) return null

    const user = await prisma.user.findUnique({ where: { id: decoded.sub } })
    if (!user || user.role !== 'super_admin') return null

    return user
}

async function runRestoreCommand(filePath: string, dbUrl: string): Promise<{ stdout: string; stderr: string; command: string }> {
    const fileExt = path.extname(filePath).toLowerCase()
    const pgCliDbUrl = getPgCliSafeDbUrl(dbUrl)

    const runPsqlFileRestore = async () => {
        const psqlCommand = resolvePostgresClientCommand('psql', 'PSQL_COMMAND')
        const result = await execFileAsync(psqlCommand, [pgCliDbUrl, '-f', filePath], {
            timeout: 1000 * 60 * 30,
            maxBuffer: 1024 * 1024 * 20,
            env: process.env,
        })

        return {
            stdout: result.stdout,
            stderr: result.stderr,
            command: `${psqlCommand} <DATABASE_URL> -f ${filePath}`,
        }
    }

    if (fileExt === '.sql') {
        return runPsqlFileRestore()
    }

    // Some teams upload plain SQL files with .dump/.backup extension.
    if (isLikelyPlainSqlFile(filePath)) {
        return runPsqlFileRestore()
    }

    const pgRestoreCommand = resolvePostgresClientCommand('pg_restore', 'PG_RESTORE_COMMAND')
    const pgRestoreArgs = [
        '--clean',
        '--if-exists',
        '--no-owner',
        '--no-privileges',
        '--dbname',
        pgCliDbUrl,
        filePath,
    ]

    try {
        const result = await execFileAsync(pgRestoreCommand, pgRestoreArgs, {
            timeout: 1000 * 60 * 30,
            maxBuffer: 1024 * 1024 * 20,
            env: process.env,
        })

        return {
            stdout: result.stdout,
            stderr: result.stderr,
            command: `${pgRestoreCommand} --clean --if-exists --no-owner --no-privileges --dbname <DATABASE_URL> ${filePath}`,
        }
    } catch (error: any) {
        const stderr = String(error?.stderr || '')
        const stdout = String(error?.stdout || '')
        const isBenignPublicSchemaWarning =
            stderr.includes('schema "public" already exists') &&
            stderr.includes('errors ignored on restore: 1')

        if (isBenignPublicSchemaWarning) {
            return {
                stdout,
                stderr,
                command: `${pgRestoreCommand} --clean --if-exists --no-owner --no-privileges --dbname <DATABASE_URL> ${filePath}`,
            }
        }

        throw error
    }
}

async function createTempDatabase(mainDbUrl: string, tempDbName: string) {
    const adminClient = new Client({ connectionString: getAdminDbUrl(mainDbUrl) })
    await adminClient.connect()
    try {
        await adminClient.query(`CREATE DATABASE ${quoteIdent(tempDbName)}`)
    } finally {
        await adminClient.end()
    }
}

async function dropTempDatabase(mainDbUrl: string, tempDbName: string) {
    const adminClient = new Client({ connectionString: getAdminDbUrl(mainDbUrl) })
    await adminClient.connect()
    try {
        await adminClient.query(
            `SELECT pg_terminate_backend(pid)
             FROM pg_stat_activity
             WHERE datname = $1 AND pid <> pg_backend_pid()`,
            [tempDbName]
        )
        await adminClient.query(`DROP DATABASE IF EXISTS ${quoteIdent(tempDbName)}`)
    } finally {
        await adminClient.end()
    }
}

async function tableExists(client: Client, tableName: string) {
    const result = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = $1
        ) AS exists`,
        [tableName]
    )
    return !!result.rows[0]?.exists
}

async function getTableColumns(client: Client, tableName: string) {
    const result = await client.query<{ column_name: string }>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = $1
         ORDER BY ordinal_position`,
        [tableName]
    )
    return result.rows.map((row) => row.column_name)
}

const tableNameCache = new WeakMap<Client, string[]>()
const columnNameCache = new WeakMap<Client, Map<string, string[]>>()

function normalizeSqlName(name: string) {
    return String(name || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

async function getPublicTableNames(client: Client) {
    const cached = tableNameCache.get(client)
    if (cached) return cached

    const result = await client.query<{ table_name: string }>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = 'public'`
    )
    const tables = result.rows.map((row) => row.table_name)
    tableNameCache.set(client, tables)
    return tables
}

async function getResolvedTableName(client: Client, logicalTableName: string) {
    const tables = await getPublicTableNames(client)
    const exact = tables.find((table) => table === logicalTableName)
    if (exact) return exact

    const normalized = normalizeSqlName(logicalTableName)
    const byNormalized = tables.find((table) => normalizeSqlName(table) === normalized)
    if (byNormalized) return byNormalized

    return null
}

async function getCachedTableColumns(client: Client, tableName: string) {
    const cache = columnNameCache.get(client) || new Map<string, string[]>()
    if (!columnNameCache.has(client)) {
        columnNameCache.set(client, cache)
    }

    const cached = cache.get(tableName)
    if (cached) return cached

    const columns = await getTableColumns(client, tableName)
    cache.set(tableName, columns)
    return columns
}

async function getResolvedColumnName(client: Client, tableName: string, logicalColumnName: string) {
    const columns = await getCachedTableColumns(client, tableName)
    const exact = columns.find((column) => column === logicalColumnName)
    if (exact) return exact

    const normalized = normalizeSqlName(logicalColumnName)
    const byNormalized = columns.find((column) => normalizeSqlName(column) === normalized)
    if (byNormalized) return byNormalized

    return logicalColumnName
}

function resolveWhereClauseIdentifiers(whereClause: string, availableColumns: string[]) {
    const columnByNormalized = new Map<string, string>()
    availableColumns.forEach((column) => {
        const key = normalizeSqlName(column)
        if (!columnByNormalized.has(key)) {
            columnByNormalized.set(key, column)
        }
    })

    return whereClause.replace(/"([^"]+)"/g, (_match, identifier: string) => {
        const resolved = columnByNormalized.get(normalizeSqlName(identifier)) || identifier
        return quoteIdent(resolved)
    })
}

interface ColumnPair {
    source: string
    target: string
}

interface ProductMergeResult {
    insertedRows: number
    skippedRows: number
    errors: number
    sourceToTargetProductId: Map<number, number>
    dedupedByNameRows: number
}

interface TreatmentMergeResult {
    insertedRows: number
    skippedRows: number
    errors: number
    sourceToTargetTreatmentId: Map<number, number>
    dedupedByIdentityRows: number
    restoredDeletedFlags: number
}

function getCommonColumnPairs(sourceColumns: string[], targetColumns: string[]): ColumnPair[] {
    const sourceByNormalized = new Map<string, string>()
    sourceColumns.forEach((column) => {
        const key = normalizeSqlName(column)
        if (!sourceByNormalized.has(key)) {
            sourceByNormalized.set(key, column)
        }
    })

    const pairs: ColumnPair[] = []
    targetColumns.forEach((targetColumn) => {
        const sourceColumn = sourceByNormalized.get(normalizeSqlName(targetColumn))
        if (sourceColumn) {
            pairs.push({ source: sourceColumn, target: targetColumn })
        }
    })

    return pairs
}

function chunkArray<T>(items: T[], size: number): T[][] {
    const output: T[][] = []
    for (let i = 0; i < items.length; i += size) {
        output.push(items.slice(i, i + size))
    }
    return output
}

function getRowKeyByLogicalName(row: Record<string, any>, logicalName: string) {
    const logical = normalizeSqlName(logicalName)
    return Object.keys(row).find((key) => normalizeSqlName(key) === logical) || null
}

function getRowValueByLogicalName(row: Record<string, any>, logicalName: string) {
    const key = getRowKeyByLogicalName(row, logicalName)
    return key ? row[key] : undefined
}

function toNullableInt(value: any): number | null {
    if (value === null || value === undefined || value === '') return null
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return null
    const rounded = Math.trunc(parsed)
    return Number.isInteger(rounded) ? rounded : null
}

function toNullableBoolean(value: any): boolean | null {
    if (value === null || value === undefined || value === '') return null
    if (typeof value === 'boolean') return value
    const normalized = String(value).trim().toLowerCase()
    if (normalized === 'true' || normalized === 't' || normalized === '1' || normalized === 'yes') return true
    if (normalized === 'false' || normalized === 'f' || normalized === '0' || normalized === 'no') return false
    return null
}

function normalizeProductName(name: any) {
    return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function normalizeTextValue(value: any) {
    return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function getProductMatchKey(doctorId: number | null, name: string) {
    return `${doctorId ?? 'null'}::${name}`
}

function getTreatmentMatchKey(
    doctorId: number | null,
    planNumber: any,
    provDiagnosis: any,
    treatmentPlan: any
) {
    const normalizedPlanNumber = normalizeTextValue(planNumber)
    const normalizedProvDiagnosis = normalizeTextValue(provDiagnosis)
    const normalizedTreatmentPlan = normalizeTextValue(treatmentPlan)

    if (normalizedPlanNumber || normalizedProvDiagnosis) {
        return `plan::${doctorId ?? 'null'}::${normalizedProvDiagnosis}::${normalizedPlanNumber}`
    }

    if (normalizedTreatmentPlan) {
        return `name::${doctorId ?? 'null'}::${normalizedTreatmentPlan}`
    }

    return null
}

function remapId(rawValue: any, idMap: Map<number, number>) {
    const numeric = toNullableInt(rawValue)
    if (numeric === null) return rawValue
    return idMap.get(numeric) ?? numeric
}

function remapProductIdJsonArray(rawValue: any, productIdMap: Map<number, number>) {
    if (rawValue === null || rawValue === undefined || rawValue === '') return rawValue

    let arrayValue: any[] | null = null
    if (Array.isArray(rawValue)) {
        arrayValue = rawValue
    } else {
        try {
            const parsed = JSON.parse(String(rawValue))
            if (Array.isArray(parsed)) {
                arrayValue = parsed
            }
        } catch {
            return rawValue
        }
    }

    if (!arrayValue) return rawValue

    const remapped = arrayValue.map((id) => {
        const numeric = toNullableInt(id)
        if (numeric === null) return null
        return String(productIdMap.get(numeric) ?? numeric)
    }).filter((id): id is string => !!id)

    if (remapped.length === 0) {
        return null
    }

    return JSON.stringify(remapped)
}

function remapProductReferencesInRows(rows: Record<string, any>[], productIdMap: Map<number, number>) {
    if (!rows.length || productIdMap.size === 0) return 0

    let changedCells = 0

    for (const row of rows) {
        const productIdKey = getRowKeyByLogicalName(row, 'productId')
        if (productIdKey) {
            const nextValue = remapId(row[productIdKey], productIdMap)
            if (nextValue !== row[productIdKey]) {
                row[productIdKey] = nextValue
                changedCells += 1
            }
        }

        const mappedProductIdKey = getRowKeyByLogicalName(row, 'mappedProductId')
        if (mappedProductIdKey) {
            const nextValue = remapId(row[mappedProductIdKey], productIdMap)
            if (nextValue !== row[mappedProductIdKey]) {
                row[mappedProductIdKey] = nextValue
                changedCells += 1
            }
        }

        const optionProductIdsKey = getRowKeyByLogicalName(row, 'optionProductIds')
        if (optionProductIdsKey) {
            const nextValue = remapProductIdJsonArray(row[optionProductIdsKey], productIdMap)
            if (nextValue !== row[optionProductIdsKey]) {
                row[optionProductIdsKey] = nextValue
                changedCells += 1
            }
        }
    }

    return changedCells
}

function remapTreatmentReferencesInRows(rows: Record<string, any>[], treatmentIdMap: Map<number, number>) {
    if (!rows.length || treatmentIdMap.size === 0) return 0

    let changedCells = 0

    for (const row of rows) {
        const treatmentIdKey = getRowKeyByLogicalName(row, 'treatmentId')
        if (!treatmentIdKey) continue

        const nextValue = remapId(row[treatmentIdKey], treatmentIdMap)
        if (nextValue !== row[treatmentIdKey]) {
            row[treatmentIdKey] = nextValue
            changedCells += 1
        }
    }

    return changedCells
}

function normalizeOptionProductIdsForKey(rawValue: any) {
    if (rawValue === null || rawValue === undefined || rawValue === '') return ''

    let arrayValue: any[] = []
    if (Array.isArray(rawValue)) {
        arrayValue = rawValue
    } else {
        try {
            const parsed = JSON.parse(String(rawValue))
            if (Array.isArray(parsed)) {
                arrayValue = parsed
            } else {
                return normalizeTextValue(rawValue)
            }
        } catch {
            return normalizeTextValue(rawValue)
        }
    }

    const normalized = Array.from(
        new Set(
            arrayValue
                .map((item) => {
                    const numeric = toNullableInt(item)
                    if (numeric !== null) return String(numeric)
                    return normalizeTextValue(item)
                })
                .filter((item) => Boolean(item))
        )
    ).sort()

    return normalized.join(',')
}

function buildPrescriptionBusinessKey(row: Record<string, any>) {
    const parts = [
        toNullableInt(getRowValueByLogicalName(row, 'visitId')) ?? '',
        toNullableInt(getRowValueByLogicalName(row, 'doctorId')) ?? '',
        toNullableInt(getRowValueByLogicalName(row, 'treatmentId')) ?? '',
        toNullableInt(getRowValueByLogicalName(row, 'productId')) ?? '',
        toNullableInt(getRowValueByLogicalName(row, 'quantity')) ?? '',
        normalizeTextValue(getRowValueByLogicalName(row, 'dosage')),
        normalizeTextValue(getRowValueByLogicalName(row, 'administration')),
        normalizeTextValue(getRowValueByLogicalName(row, 'timing')),
        normalizeTextValue(getRowValueByLogicalName(row, 'bottleSize')),
        normalizeTextValue(getRowValueByLogicalName(row, 'procedure')),
        normalizeTextValue(getRowValueByLogicalName(row, 'presentation')),
        normalizeTextValue(getRowValueByLogicalName(row, 'spy1')),
        normalizeTextValue(getRowValueByLogicalName(row, 'spy2')),
        normalizeTextValue(getRowValueByLogicalName(row, 'spy3')),
        normalizeTextValue(getRowValueByLogicalName(row, 'spy4')),
        normalizeTextValue(getRowValueByLogicalName(row, 'spy5')),
        normalizeTextValue(getRowValueByLogicalName(row, 'spy6')),
        normalizeTextValue(getRowValueByLogicalName(row, 'addition1')),
        normalizeTextValue(getRowValueByLogicalName(row, 'addition2')),
        normalizeTextValue(getRowValueByLogicalName(row, 'addition3')),
        String(toNullableBoolean(getRowValueByLogicalName(row, 'patientHasMedicine')) ?? ''),
        String(toNullableBoolean(getRowValueByLogicalName(row, 'includeLabelProduct')) ?? ''),
        String(toNullableBoolean(getRowValueByLogicalName(row, 'includeVrsProduct')) ?? ''),
        String(getRowValueByLogicalName(row, 'vrsQuantity') ?? ''),
        String(toNullableInt(getRowValueByLogicalName(row, 'activeOptionIndex')) ?? ''),
        normalizeOptionProductIdsForKey(getRowValueByLogicalName(row, 'optionProductIds')),
    ]

    return parts.join('|')
}

async function filterOutExistingPrescriptionDuplicates(
    targetClient: Client,
    targetTableName: string,
    sourceRows: Record<string, any>[]
) {
    if (!sourceRows.length) {
        return { rowsToInsert: [], skippedDuplicates: 0 }
    }

    const dedupedWithinSource: Record<string, any>[] = []
    const sourceKeys = new Set<string>()
    let skippedWithinSource = 0

    for (const row of sourceRows) {
        const key = buildPrescriptionBusinessKey(row)
        if (sourceKeys.has(key)) {
            skippedWithinSource += 1
            continue
        }
        sourceKeys.add(key)
        dedupedWithinSource.push(row)
    }

    const visitIds = Array.from(
        new Set(
            dedupedWithinSource
                .map((row) => toNullableInt(getRowValueByLogicalName(row, 'visitId')))
                .filter((id): id is number => id !== null)
        )
    )
    const doctorIds = Array.from(
        new Set(
            dedupedWithinSource
                .map((row) => toNullableInt(getRowValueByLogicalName(row, 'doctorId')))
                .filter((id): id is number => id !== null)
        )
    )

    if (!visitIds.length && !doctorIds.length) {
        return { rowsToInsert: dedupedWithinSource, skippedDuplicates: skippedWithinSource }
    }

    const visitIdColumn = await getResolvedColumnName(targetClient, targetTableName, 'visitId')
    const doctorIdColumn = await getResolvedColumnName(targetClient, targetTableName, 'doctorId')

    let existingRows: Record<string, any>[] = []
    if (visitIds.length && doctorIds.length) {
        const result = await targetClient.query(
            `SELECT *
             FROM ${quotePublicTable(targetTableName)}
             WHERE ${quoteIdent(visitIdColumn)} = ANY($1::int[])
                OR ${quoteIdent(doctorIdColumn)} = ANY($2::int[])`,
            [visitIds, doctorIds]
        )
        existingRows = result.rows
    } else if (visitIds.length) {
        const result = await targetClient.query(
            `SELECT *
             FROM ${quotePublicTable(targetTableName)}
             WHERE ${quoteIdent(visitIdColumn)} = ANY($1::int[])`,
            [visitIds]
        )
        existingRows = result.rows
    } else {
        const result = await targetClient.query(
            `SELECT *
             FROM ${quotePublicTable(targetTableName)}
             WHERE ${quoteIdent(doctorIdColumn)} = ANY($1::int[])`,
            [doctorIds]
        )
        existingRows = result.rows
    }

    const existingKeys = new Set(existingRows.map((row) => buildPrescriptionBusinessKey(row)))
    const rowsToInsert = dedupedWithinSource.filter((row) => !existingKeys.has(buildPrescriptionBusinessKey(row)))
    const skippedExisting = dedupedWithinSource.length - rowsToInsert.length

    return {
        rowsToInsert,
        skippedDuplicates: skippedWithinSource + skippedExisting,
    }
}

async function cleanupDuplicatePrescriptions(
    targetClient: Client,
    visitIds: number[],
    doctorIds: number[],
    jobId: string
) {
    const prescriptionTable = await getResolvedTableName(targetClient, 'Prescription')
    if (!prescriptionTable) return 0

    const idColumn = await getResolvedColumnName(targetClient, prescriptionTable, 'id')
    const visitIdColumn = await getResolvedColumnName(targetClient, prescriptionTable, 'visitId')
    const doctorIdColumn = await getResolvedColumnName(targetClient, prescriptionTable, 'doctorId')

    let rows: Record<string, any>[] = []
    if (visitIds.length && doctorIds.length) {
        const result = await targetClient.query(
            `SELECT *
             FROM ${quotePublicTable(prescriptionTable)}
             WHERE ${quoteIdent(visitIdColumn)} = ANY($1::int[])
                OR ${quoteIdent(doctorIdColumn)} = ANY($2::int[])`,
            [visitIds, doctorIds]
        )
        rows = result.rows
    } else if (visitIds.length) {
        const result = await targetClient.query(
            `SELECT *
             FROM ${quotePublicTable(prescriptionTable)}
             WHERE ${quoteIdent(visitIdColumn)} = ANY($1::int[])`,
            [visitIds]
        )
        rows = result.rows
    } else if (doctorIds.length) {
        const result = await targetClient.query(
            `SELECT *
             FROM ${quotePublicTable(prescriptionTable)}
             WHERE ${quoteIdent(doctorIdColumn)} = ANY($1::int[])`,
            [doctorIds]
        )
        rows = result.rows
    } else {
        return 0
    }

    const keepByKey = new Map<string, number>()
    const idsToDelete: number[] = []

    for (const row of rows) {
        const currentId = toNullableInt(getRowValueByLogicalName(row, idColumn))
        if (currentId === null) continue

        const key = buildPrescriptionBusinessKey(row)
        const keptId = keepByKey.get(key)
        if (!keptId) {
            keepByKey.set(key, currentId)
            continue
        }

        if (currentId < keptId) {
            idsToDelete.push(keptId)
            keepByKey.set(key, currentId)
        } else {
            idsToDelete.push(currentId)
        }
    }

    if (!idsToDelete.length) return 0

    const deleteResult = await targetClient.query(
        `DELETE FROM ${quotePublicTable(prescriptionTable)}
         WHERE ${quoteIdent(idColumn)} = ANY($1::int[])`,
        [idsToDelete]
    )

    const deletedCount = deleteResult.rowCount || 0
    if (deletedCount > 0) {
        appendLog(jobId, `Removed ${deletedCount} duplicate prescription row(s) from scoped visits`)
    }

    return deletedCount
}

async function mergeProductRowsWithDedupByName(
    targetClient: Client,
    targetTableName: string,
    rows: Record<string, any>[],
    columnPairs: ColumnPair[],
    batchSize: number
): Promise<ProductMergeResult> {
    if (!rows.length) {
        return {
            insertedRows: 0,
            skippedRows: 0,
            errors: 0,
            sourceToTargetProductId: new Map<number, number>(),
            dedupedByNameRows: 0,
        }
    }

    const sourceToTargetProductId = new Map<number, number>()

    const metas = rows.map((row) => ({
        row,
        sourceId: toNullableInt(getRowValueByLogicalName(row, 'id')),
        sourceDoctorId: toNullableInt(getRowValueByLogicalName(row, 'doctorId')),
        normalizedName: normalizeProductName(getRowValueByLogicalName(row, 'name')),
    }))

    const nameSet = new Set<string>()
    const doctorIdSet = new Set<number>()

    metas.forEach((meta) => {
        if (meta.normalizedName) {
            nameSet.add(meta.normalizedName)
        }
        if (meta.sourceDoctorId !== null) {
            doctorIdSet.add(meta.sourceDoctorId)
        }
    })

    const targetIdColumn = await getResolvedColumnName(targetClient, targetTableName, 'id')
    const targetNameColumn = await getResolvedColumnName(targetClient, targetTableName, 'name')
    const targetDoctorIdColumn = await getResolvedColumnName(targetClient, targetTableName, 'doctorId')

    const normalizedNames = Array.from(nameSet)
    const doctorIds = Array.from(doctorIdSet)

    let existingRows: Array<{ id: number; doctorId: number | null; name: string }> = []
    if (normalizedNames.length > 0) {
        if (doctorIds.length > 0) {
            const existingResult = await targetClient.query<{ id: number; doctorId: number | null; name: string }>(
                `SELECT ${quoteIdent(targetIdColumn)} AS id,
                        ${quoteIdent(targetDoctorIdColumn)} AS "doctorId",
                        ${quoteIdent(targetNameColumn)} AS name
                 FROM ${quotePublicTable(targetTableName)}
                 WHERE ${quoteIdent(targetDoctorIdColumn)} = ANY($1::int[])
                   AND LOWER(TRIM(${quoteIdent(targetNameColumn)})) = ANY($2::text[])`,
                [doctorIds, normalizedNames]
            )
            existingRows = existingResult.rows
        } else {
            const existingResult = await targetClient.query<{ id: number; doctorId: number | null; name: string }>(
                `SELECT ${quoteIdent(targetIdColumn)} AS id,
                        ${quoteIdent(targetDoctorIdColumn)} AS "doctorId",
                        ${quoteIdent(targetNameColumn)} AS name
                 FROM ${quotePublicTable(targetTableName)}
                 WHERE LOWER(TRIM(${quoteIdent(targetNameColumn)})) = ANY($1::text[])`,
                [normalizedNames]
            )
            existingRows = existingResult.rows
        }
    }

    const targetById = new Map<number, { id: number; doctorId: number | null; name: string }>()
    const existingByKey = new Map<string, { id: number; doctorId: number | null; name: string }>()

    existingRows.forEach((entry) => {
        targetById.set(entry.id, entry)
        const key = getProductMatchKey(entry.doctorId, normalizeProductName(entry.name))
        const current = existingByKey.get(key)
        if (!current || entry.id < current.id) {
            existingByKey.set(key, entry)
        }
    })

    const rowsToInsert: Record<string, any>[] = []
    let dedupedByNameRows = 0

    metas.forEach((meta) => {
        const key = getProductMatchKey(meta.sourceDoctorId, meta.normalizedName)
        const existing = meta.normalizedName ? existingByKey.get(key) : undefined

        if (meta.sourceId !== null && existing) {
            sourceToTargetProductId.set(meta.sourceId, existing.id)
            dedupedByNameRows += 1
            return
        }

        if (meta.sourceId !== null && targetById.has(meta.sourceId)) {
            sourceToTargetProductId.set(meta.sourceId, meta.sourceId)
            return
        }

        rowsToInsert.push(meta.row)
    })

    const insertResult = await insertRowsWithConflictIgnore(
        targetClient,
        targetTableName,
        rowsToInsert,
        columnPairs,
        batchSize
    )

    metas.forEach((meta) => {
        if (meta.sourceId !== null && !sourceToTargetProductId.has(meta.sourceId)) {
            sourceToTargetProductId.set(meta.sourceId, meta.sourceId)
        }
    })

    return {
        insertedRows: insertResult.insertedRows,
        skippedRows: insertResult.skippedRows + dedupedByNameRows,
        errors: insertResult.errors,
        sourceToTargetProductId,
        dedupedByNameRows,
    }
}

async function mergeTreatmentRowsWithDedupByIdentity(
    targetClient: Client,
    targetTableName: string,
    rows: Record<string, any>[],
    columnPairs: ColumnPair[],
    batchSize: number
): Promise<TreatmentMergeResult> {
    if (!rows.length) {
        return {
            insertedRows: 0,
            skippedRows: 0,
            errors: 0,
            sourceToTargetTreatmentId: new Map<number, number>(),
            dedupedByIdentityRows: 0,
            restoredDeletedFlags: 0,
        }
    }

    const metas = rows.map((row) => ({
        row,
        sourceId: toNullableInt(getRowValueByLogicalName(row, 'id')),
        sourceDoctorId: toNullableInt(getRowValueByLogicalName(row, 'doctorId')),
        sourcePlanNumber: getRowValueByLogicalName(row, 'planNumber'),
        sourceProvDiagnosis: getRowValueByLogicalName(row, 'provDiagnosis'),
        sourceTreatmentPlan: getRowValueByLogicalName(row, 'treatmentPlan'),
        sourceDeleted: toNullableBoolean(getRowValueByLogicalName(row, 'deleted')),
    }))

    const sourceToTargetTreatmentId = new Map<number, number>()

    const doctorIdSet = new Set<number>()
    let includesNullDoctor = false
    metas.forEach((meta) => {
        if (meta.sourceDoctorId === null) {
            includesNullDoctor = true
        } else {
            doctorIdSet.add(meta.sourceDoctorId)
        }
    })

    const targetIdColumn = await getResolvedColumnName(targetClient, targetTableName, 'id')
    const targetDoctorIdColumn = await getResolvedColumnName(targetClient, targetTableName, 'doctorId')
    const targetPlanNumberColumn = await getResolvedColumnName(targetClient, targetTableName, 'planNumber')
    const targetProvDiagnosisColumn = await getResolvedColumnName(targetClient, targetTableName, 'provDiagnosis')
    const targetTreatmentPlanColumn = await getResolvedColumnName(targetClient, targetTableName, 'treatmentPlan')
    const targetDeletedColumn = await getResolvedColumnName(targetClient, targetTableName, 'deleted')

    const targetDoctorIds = Array.from(doctorIdSet)
    let existingRows: Array<{
        id: number
        doctorId: number | null
        planNumber: string | null
        provDiagnosis: string | null
        treatmentPlan: string | null
        deleted: boolean | null
    }> = []

    if (targetDoctorIds.length || includesNullDoctor) {
        const existingResult = await targetClient.query<{
            id: number
            doctorId: number | null
            planNumber: string | null
            provDiagnosis: string | null
            treatmentPlan: string | null
            deleted: boolean | null
        }>(
            `SELECT ${quoteIdent(targetIdColumn)} AS id,
                    ${quoteIdent(targetDoctorIdColumn)} AS "doctorId",
                    ${quoteIdent(targetPlanNumberColumn)} AS "planNumber",
                    ${quoteIdent(targetProvDiagnosisColumn)} AS "provDiagnosis",
                    ${quoteIdent(targetTreatmentPlanColumn)} AS "treatmentPlan",
                    ${quoteIdent(targetDeletedColumn)} AS deleted
             FROM ${quotePublicTable(targetTableName)}
             WHERE (${targetDoctorIds.length > 0 ? `${quoteIdent(targetDoctorIdColumn)} = ANY($1::int[])` : 'false'})
                OR (${includesNullDoctor ? `${quoteIdent(targetDoctorIdColumn)} IS NULL` : 'false'})`,
            targetDoctorIds.length > 0 ? [targetDoctorIds] : []
        )
        existingRows = existingResult.rows
    }

    const targetById = new Map<number, {
        id: number
        doctorId: number | null
        planNumber: string | null
        provDiagnosis: string | null
        treatmentPlan: string | null
        deleted: boolean | null
    }>()
    const existingByIdentity = new Map<string, {
        id: number
        doctorId: number | null
        planNumber: string | null
        provDiagnosis: string | null
        treatmentPlan: string | null
        deleted: boolean | null
    }>()

    existingRows.forEach((entry) => {
        targetById.set(entry.id, entry)

        const identityKey = getTreatmentMatchKey(
            entry.doctorId,
            entry.planNumber,
            entry.provDiagnosis,
            entry.treatmentPlan
        )
        if (!identityKey) return

        const current = existingByIdentity.get(identityKey)
        if (!current) {
            existingByIdentity.set(identityKey, entry)
            return
        }

        const currentDeleted = toNullableBoolean(current.deleted)
        const entryDeleted = toNullableBoolean(entry.deleted)
        if ((currentDeleted === true && entryDeleted !== true) || (currentDeleted === entryDeleted && entry.id < current.id)) {
            existingByIdentity.set(identityKey, entry)
        }
    })

    const rowsToInsert: Record<string, any>[] = []
    const targetIdsToUndelete = new Set<number>()
    let dedupedByIdentityRows = 0

    metas.forEach((meta) => {
        const identityKey = getTreatmentMatchKey(
            meta.sourceDoctorId,
            meta.sourcePlanNumber,
            meta.sourceProvDiagnosis,
            meta.sourceTreatmentPlan
        )

        const existing = identityKey ? existingByIdentity.get(identityKey) : undefined
        if (meta.sourceId !== null && existing) {
            sourceToTargetTreatmentId.set(meta.sourceId, existing.id)
            dedupedByIdentityRows += 1
            if (meta.sourceDeleted !== true && toNullableBoolean(existing.deleted) === true) {
                targetIdsToUndelete.add(existing.id)
            }
            return
        }

        if (meta.sourceId !== null && targetById.has(meta.sourceId)) {
            sourceToTargetTreatmentId.set(meta.sourceId, meta.sourceId)
            const directMatch = targetById.get(meta.sourceId)
            if (meta.sourceDeleted !== true && toNullableBoolean(directMatch?.deleted) === true) {
                targetIdsToUndelete.add(meta.sourceId)
            }
            return
        }

        rowsToInsert.push(meta.row)
    })

    const insertResult = await insertRowsWithConflictIgnore(
        targetClient,
        targetTableName,
        rowsToInsert,
        columnPairs,
        batchSize
    )

    metas.forEach((meta) => {
        if (meta.sourceId !== null && !sourceToTargetTreatmentId.has(meta.sourceId)) {
            sourceToTargetTreatmentId.set(meta.sourceId, meta.sourceId)
        }
    })

    let restoredDeletedFlags = 0
    if (targetIdsToUndelete.size > 0) {
        const undeleteResult = await targetClient.query(
            `UPDATE ${quotePublicTable(targetTableName)}
             SET ${quoteIdent(targetDeletedColumn)} = false
             WHERE ${quoteIdent(targetIdColumn)} = ANY($1::int[])
               AND COALESCE(${quoteIdent(targetDeletedColumn)}, false) = true`,
            [Array.from(targetIdsToUndelete)]
        )
        restoredDeletedFlags = undeleteResult.rowCount || 0
    }

    return {
        insertedRows: insertResult.insertedRows,
        skippedRows: insertResult.skippedRows + dedupedByIdentityRows,
        errors: insertResult.errors,
        sourceToTargetTreatmentId,
        dedupedByIdentityRows,
        restoredDeletedFlags,
    }
}

async function repairExistingPrescriptionLinks(
    targetClient: Client,
    targetTableName: string,
    sourceRows: Record<string, any>[],
    productIdMap: Map<number, number>,
    treatmentIdMap: Map<number, number>
) {
    if (!sourceRows.length) {
        return { productIdFixedCount: 0, optionProductIdsFixedCount: 0, treatmentIdFixedCount: 0 }
    }

    const idColumn = await getResolvedColumnName(targetClient, targetTableName, 'id')
    const productIdColumn = await getResolvedColumnName(targetClient, targetTableName, 'productId')
    const treatmentIdColumn = await getResolvedColumnName(targetClient, targetTableName, 'treatmentId')
    const optionProductIdsColumn = await getResolvedColumnName(targetClient, targetTableName, 'optionProductIds')
    const treatmentTableName = await getResolvedTableName(targetClient, 'Treatment')
    const treatmentTableIdColumn = treatmentTableName
        ? await getResolvedColumnName(targetClient, treatmentTableName, 'id')
        : null
    const treatmentDeletedColumn = treatmentTableName
        ? await getResolvedColumnName(targetClient, treatmentTableName, 'deleted')
        : null

    let productIdFixedCount = 0
    let optionProductIdsFixedCount = 0
    let treatmentIdFixedCount = 0

    for (const row of sourceRows) {
        const prescriptionId = toNullableInt(getRowValueByLogicalName(row, 'id'))
        if (prescriptionId === null) continue

        const sourceProductId = toNullableInt(getRowValueByLogicalName(row, 'productId'))
        if (sourceProductId !== null && productIdMap.size > 0) {
            const targetProductId = productIdMap.get(sourceProductId) ?? sourceProductId
            const updated = await targetClient.query(
                `UPDATE ${quotePublicTable(targetTableName)}
                 SET ${quoteIdent(productIdColumn)} = $1
                 WHERE ${quoteIdent(idColumn)} = $2
                   AND ${quoteIdent(productIdColumn)} IS NULL`,
                [targetProductId, prescriptionId]
            )
            productIdFixedCount += updated.rowCount || 0
        }

        const sourceTreatmentId = toNullableInt(getRowValueByLogicalName(row, 'treatmentId'))
        if (sourceTreatmentId !== null && treatmentIdMap.size > 0) {
            const targetTreatmentId = treatmentIdMap.get(sourceTreatmentId) ?? sourceTreatmentId

            let updatedTreatment
            if (treatmentTableName && treatmentTableIdColumn && treatmentDeletedColumn) {
                updatedTreatment = await targetClient.query(
                    `UPDATE ${quotePublicTable(targetTableName)} AS p
                     SET ${quoteIdent(treatmentIdColumn)} = $1
                     WHERE p.${quoteIdent(idColumn)} = $2
                       AND (
                            p.${quoteIdent(treatmentIdColumn)} IS NULL
                            OR EXISTS (
                                SELECT 1
                                FROM ${quotePublicTable(treatmentTableName)} AS t
                                WHERE t.${quoteIdent(treatmentTableIdColumn)} = p.${quoteIdent(treatmentIdColumn)}
                                  AND COALESCE(t.${quoteIdent(treatmentDeletedColumn)}, false) = true
                            )
                       )`,
                    [targetTreatmentId, prescriptionId]
                )
            } else {
                updatedTreatment = await targetClient.query(
                    `UPDATE ${quotePublicTable(targetTableName)}
                     SET ${quoteIdent(treatmentIdColumn)} = $1
                     WHERE ${quoteIdent(idColumn)} = $2
                       AND ${quoteIdent(treatmentIdColumn)} IS NULL`,
                    [targetTreatmentId, prescriptionId]
                )
            }

            treatmentIdFixedCount += updatedTreatment.rowCount || 0
        }

        const optionRaw = getRowValueByLogicalName(row, 'optionProductIds')
        const remappedOptions = remapProductIdJsonArray(optionRaw, productIdMap)
        if (remappedOptions === null || remappedOptions === undefined || remappedOptions === '') {
            continue
        }

        const updatedOptions = await targetClient.query(
            `UPDATE ${quotePublicTable(targetTableName)}
             SET ${quoteIdent(optionProductIdsColumn)} = $1
             WHERE ${quoteIdent(idColumn)} = $2
               AND (${quoteIdent(optionProductIdsColumn)} IS NULL OR ${quoteIdent(optionProductIdsColumn)} = '')`,
            [remappedOptions, prescriptionId]
        )
        optionProductIdsFixedCount += updatedOptions.rowCount || 0
    }

    return { productIdFixedCount, optionProductIdsFixedCount, treatmentIdFixedCount }
}

async function repairDeletedTreatmentsFromSource(
    targetClient: Client,
    targetTableName: string,
    sourceRows: Record<string, any>[]
) {
    if (!sourceRows.length) {
        return { restoredDeletedFlags: 0 }
    }

    const idColumn = await getResolvedColumnName(targetClient, targetTableName, 'id')
    const deletedColumn = await getResolvedColumnName(targetClient, targetTableName, 'deleted')

    let restoredDeletedFlags = 0

    for (const row of sourceRows) {
        const sourceId = toNullableInt(getRowValueByLogicalName(row, 'id'))
        if (sourceId === null) continue

        const sourceDeleted = toNullableBoolean(getRowValueByLogicalName(row, 'deleted'))
        if (sourceDeleted === true) continue

        const updated = await targetClient.query(
            `UPDATE ${quotePublicTable(targetTableName)}
             SET ${quoteIdent(deletedColumn)} = false
             WHERE ${quoteIdent(idColumn)} = $1
               AND COALESCE(${quoteIdent(deletedColumn)}, false) = true`,
            [sourceId]
        )
        restoredDeletedFlags += updated.rowCount || 0
    }

    return { restoredDeletedFlags }
}

async function hasAnyProductReference(targetClient: Client, productId: number) {
    const productReferenceTargets = [
        { table: 'Prescription', column: 'productId' },
        { table: 'TreatmentProduct', column: 'productId' },
        { table: 'ProductBatch', column: 'productId' },
        { table: 'ProductOrder', column: 'productId' },
        { table: 'PurchaseOrderItem', column: 'productId' },
        { table: 'StockTransaction', column: 'productId' },
        { table: 'DemandForecast', column: 'productId' },
        { table: 'CustomerInvoiceItem', column: 'productId' },
        { table: 'BillProductMapping', column: 'mappedProductId' },
    ]

    for (const entry of productReferenceTargets) {
        const tableName = await getResolvedTableName(targetClient, entry.table)
        if (!tableName) continue

        const columnName = await getResolvedColumnName(targetClient, tableName, entry.column)
        const result = await targetClient.query(
            `SELECT 1
             FROM ${quotePublicTable(tableName)}
             WHERE ${quoteIdent(columnName)} = $1
             LIMIT 1`,
            [productId]
        )
        if (result.rows.length > 0) {
            return true
        }
    }

    return false
}

async function cleanupUnreferencedDuplicateProducts(
    targetClient: Client,
    doctorIds: number[],
    jobId: string
) {
    if (!doctorIds.length) return 0

    const productTable = await getResolvedTableName(targetClient, 'Product')
    if (!productTable) return 0

    const idColumn = await getResolvedColumnName(targetClient, productTable, 'id')
    const nameColumn = await getResolvedColumnName(targetClient, productTable, 'name')
    const doctorIdColumn = await getResolvedColumnName(targetClient, productTable, 'doctorId')

    const duplicates = await targetClient.query<{ ids: number[] }>(
        `SELECT ARRAY_AGG(${quoteIdent(idColumn)} ORDER BY ${quoteIdent(idColumn)}) AS ids
         FROM ${quotePublicTable(productTable)}
         WHERE ${quoteIdent(doctorIdColumn)} = ANY($1::int[])
         GROUP BY ${quoteIdent(doctorIdColumn)}, LOWER(TRIM(${quoteIdent(nameColumn)}))
         HAVING COUNT(*) > 1`,
        [doctorIds]
    )

    let deletedCount = 0

    for (const group of duplicates.rows) {
        const ids = (group.ids || []).map((value) => Number(value)).filter((value) => Number.isInteger(value))
        if (ids.length < 2) continue

        const duplicateIds = ids.slice(1)
        for (const duplicateId of duplicateIds) {
            const isReferenced = await hasAnyProductReference(targetClient, duplicateId)
            if (isReferenced) continue

            const deleted = await targetClient.query(
                `DELETE FROM ${quotePublicTable(productTable)}
                 WHERE ${quoteIdent(idColumn)} = $1`,
                [duplicateId]
            )
            if ((deleted.rowCount || 0) > 0) {
                deletedCount += deleted.rowCount || 0
            }
        }
    }

    if (deletedCount > 0) {
        appendLog(jobId, `Cleaned up ${deletedCount} unreferenced duplicate product row(s)`)
    }

    return deletedCount
}

async function insertRowsWithConflictIgnore(
    targetClient: Client,
    tableName: string,
    rows: Record<string, any>[],
    columnPairs: ColumnPair[],
    batchSize: number
) {
    let insertedRows = 0
    let skippedRows = 0
    let errors = 0

    if (rows.length === 0 || columnPairs.length === 0) {
        return { insertedRows, skippedRows, errors }
    }

    const quotedColumns = columnPairs.map((pair) => quoteIdent(pair.target)).join(', ')

    for (const batch of chunkArray(rows, batchSize)) {
        const values: any[] = []
        const placeholders: string[] = []

        batch.forEach((row, rowIndex) => {
            const rowPlaceholders = columnPairs.map((pair, columnIndex) => {
                const paramIndex = rowIndex * columnPairs.length + columnIndex + 1
                values.push(row[pair.source])
                return `$${paramIndex}`
            })
            placeholders.push(`(${rowPlaceholders.join(', ')})`)
        })

        try {
            const result = await targetClient.query(
                `INSERT INTO ${quotePublicTable(tableName)} (${quotedColumns})
                 VALUES ${placeholders.join(', ')}
                 ON CONFLICT DO NOTHING`,
                values
            )
            insertedRows += result.rowCount || 0
            skippedRows += batch.length - (result.rowCount || 0)
        } catch {
            // Retry row-by-row to preserve as much data as possible when a small subset fails FK checks.
            for (const row of batch) {
                const singleValues = columnPairs.map((pair) => row[pair.source])
                const singlePlaceholders = columnPairs.map((_, idx) => `$${idx + 1}`).join(', ')
                try {
                    const result = await targetClient.query(
                        `INSERT INTO ${quotePublicTable(tableName)} (${quotedColumns})
                         VALUES (${singlePlaceholders})
                         ON CONFLICT DO NOTHING`,
                        singleValues
                    )
                    insertedRows += result.rowCount || 0
                    skippedRows += 1 - (result.rowCount || 0)
                } catch {
                    errors += 1
                }
            }
        }
    }

    return { insertedRows, skippedRows, errors }
}

async function selectIds(client: Client, sql: string, params: any[] = []) {
    const result = await client.query<{ id: number }>(sql, params)
    return result.rows
        .map((row) => Number(row.id))
        .filter((id) => Number.isInteger(id))
}

async function buildScopeSets(sourceClient: Client, clinicInternalId: string): Promise<ScopeSets> {
    const userTable = await getResolvedTableName(sourceClient, 'User')
    const userIds = userTable
        ? await selectIds(
            sourceClient,
            `SELECT ${quoteIdent(await getResolvedColumnName(sourceClient, userTable, 'id'))} AS id
             FROM ${quotePublicTable(userTable)}
             WHERE ${quoteIdent(await getResolvedColumnName(sourceClient, userTable, 'clinicId'))} = $1`,
            [clinicInternalId]
        )
        : []

    const patientTable = await getResolvedTableName(sourceClient, 'Patient')
    const patientIds = patientTable
        ? await selectIds(
            sourceClient,
            `SELECT ${quoteIdent(await getResolvedColumnName(sourceClient, patientTable, 'id'))} AS id
             FROM ${quotePublicTable(patientTable)}
             WHERE ${quoteIdent(await getResolvedColumnName(sourceClient, patientTable, 'clinicId'))} = $1
                OR (array_length($2::int[], 1) IS NOT NULL AND ${quoteIdent(await getResolvedColumnName(sourceClient, patientTable, 'doctorId'))} = ANY($2::int[]))`,
            [clinicInternalId, userIds]
        )
        : []

    const visitTable = await getResolvedTableName(sourceClient, 'Visit')
    const visitIds = visitTable
        ? await selectIds(
            sourceClient,
            `SELECT ${quoteIdent(await getResolvedColumnName(sourceClient, visitTable, 'id'))} AS id
             FROM ${quotePublicTable(visitTable)}
             WHERE (array_length($1::int[], 1) IS NOT NULL AND ${quoteIdent(await getResolvedColumnName(sourceClient, visitTable, 'patientId'))} = ANY($1::int[]))
                OR (array_length($2::int[], 1) IS NOT NULL AND ${quoteIdent(await getResolvedColumnName(sourceClient, visitTable, 'doctorId'))} = ANY($2::int[]))`,
            [patientIds, userIds]
        )
        : []

    const productTable = await getResolvedTableName(sourceClient, 'Product')
    const productIds = productTable
        ? await selectIds(
            sourceClient,
            `SELECT ${quoteIdent(await getResolvedColumnName(sourceClient, productTable, 'id'))} AS id
             FROM ${quotePublicTable(productTable)}
             WHERE array_length($1::int[], 1) IS NOT NULL AND ${quoteIdent(await getResolvedColumnName(sourceClient, productTable, 'doctorId'))} = ANY($1::int[])`,
            [userIds]
        )
        : []

    const treatmentTable = await getResolvedTableName(sourceClient, 'Treatment')
    const treatmentIds = treatmentTable
        ? await selectIds(
            sourceClient,
            `SELECT ${quoteIdent(await getResolvedColumnName(sourceClient, treatmentTable, 'id'))} AS id
             FROM ${quotePublicTable(treatmentTable)}
             WHERE array_length($1::int[], 1) IS NOT NULL AND ${quoteIdent(await getResolvedColumnName(sourceClient, treatmentTable, 'doctorId'))} = ANY($1::int[])`,
            [userIds]
        )
        : []

    const supplierTable = await getResolvedTableName(sourceClient, 'Supplier')
    const supplierIds = supplierTable
        ? await selectIds(
            sourceClient,
            `SELECT ${quoteIdent(await getResolvedColumnName(sourceClient, supplierTable, 'id'))} AS id
             FROM ${quotePublicTable(supplierTable)}
             WHERE array_length($1::int[], 1) IS NOT NULL AND ${quoteIdent(await getResolvedColumnName(sourceClient, supplierTable, 'doctorId'))} = ANY($1::int[])`,
            [userIds]
        )
        : []

    const purchaseOrderTable = await getResolvedTableName(sourceClient, 'PurchaseOrder')
    const purchaseOrderIds = purchaseOrderTable
        ? await selectIds(
            sourceClient,
            `SELECT ${quoteIdent(await getResolvedColumnName(sourceClient, purchaseOrderTable, 'id'))} AS id
             FROM ${quotePublicTable(purchaseOrderTable)}
             WHERE (array_length($1::int[], 1) IS NOT NULL AND ${quoteIdent(await getResolvedColumnName(sourceClient, purchaseOrderTable, 'doctorId'))} = ANY($1::int[]))
                OR (array_length($2::int[], 1) IS NOT NULL AND ${quoteIdent(await getResolvedColumnName(sourceClient, purchaseOrderTable, 'supplierId'))} = ANY($2::int[]))`,
            [userIds, supplierIds]
        )
        : []

    const productBatchTable = await getResolvedTableName(sourceClient, 'ProductBatch')
    const productBatchIds = productBatchTable
        ? await selectIds(
            sourceClient,
            `SELECT ${quoteIdent(await getResolvedColumnName(sourceClient, productBatchTable, 'id'))} AS id
             FROM ${quotePublicTable(productBatchTable)}
             WHERE array_length($1::int[], 1) IS NOT NULL AND ${quoteIdent(await getResolvedColumnName(sourceClient, productBatchTable, 'productId'))} = ANY($1::int[])`,
            [productIds]
        )
        : []

    const customerInvoiceTable = await getResolvedTableName(sourceClient, 'CustomerInvoice')
    const customerInvoiceIds = customerInvoiceTable
        ? await selectIds(
            sourceClient,
            `SELECT ${quoteIdent(await getResolvedColumnName(sourceClient, customerInvoiceTable, 'id'))} AS id
                 FROM ${quotePublicTable(customerInvoiceTable)}
             WHERE ${quoteIdent(await getResolvedColumnName(sourceClient, customerInvoiceTable, 'clinicId'))} = $1
                OR (array_length($2::int[], 1) IS NOT NULL AND ${quoteIdent(await getResolvedColumnName(sourceClient, customerInvoiceTable, 'doctorId'))} = ANY($2::int[]))
                OR (array_length($3::int[], 1) IS NOT NULL AND ${quoteIdent(await getResolvedColumnName(sourceClient, customerInvoiceTable, 'patientId'))} = ANY($3::int[]))
                OR (array_length($4::int[], 1) IS NOT NULL AND ${quoteIdent(await getResolvedColumnName(sourceClient, customerInvoiceTable, 'visitId'))} = ANY($4::int[]))`,
            [clinicInternalId, userIds, patientIds, visitIds]
        )
        : []

    return {
        userIds,
        patientIds,
        visitIds,
        productIds,
        treatmentIds,
        supplierIds,
        purchaseOrderIds,
        productBatchIds,
        customerInvoiceIds,
    }
}

function buildTablePlans(clinicInternalId: string, scopes: ScopeSets): TablePlan[] {
    return [
        { table: 'Clinic', whereClause: '"id" = $1', params: [clinicInternalId] },
        { table: 'User', whereClause: '"clinicId" = $1', params: [clinicInternalId] },
        { table: 'DeviceToken', whereClause: 'array_length($1::int[], 1) IS NOT NULL AND "userId" = ANY($1::int[])', params: [scopes.userIds] },
        { table: 'SessionRecord', whereClause: '"clinicId" = $1', params: [clinicInternalId] },
        { table: 'ClinicLocation', whereClause: '"clinicId" = $1', params: [clinicInternalId] },
        { table: 'GeoAccessRequest', whereClause: '"clinicId" = $1', params: [clinicInternalId] },
        { table: 'EmailLog', whereClause: '"clinicId" = $1', params: [clinicInternalId] },
        { table: 'DefaultValue', whereClause: '"clinicId" = $1', params: [clinicInternalId] },
        { table: 'clinic_default_template_sync', whereClause: '"clinic_id" = $1', params: [clinicInternalId] },
        { table: 'Patient', whereClause: 'array_length($1::int[], 1) IS NOT NULL AND "id" = ANY($1::int[])', params: [scopes.patientIds] },
        { table: 'Category', whereClause: 'array_length($1::int[], 1) IS NOT NULL AND "doctorId" = ANY($1::int[])', params: [scopes.userIds] },
        { table: 'Product', whereClause: 'array_length($1::int[], 1) IS NOT NULL AND "id" = ANY($1::int[])', params: [scopes.productIds] },
        { table: 'Treatment', whereClause: 'array_length($1::int[], 1) IS NOT NULL AND "id" = ANY($1::int[])', params: [scopes.treatmentIds] },
        { table: 'Supplier', whereClause: 'array_length($1::int[], 1) IS NOT NULL AND "id" = ANY($1::int[])', params: [scopes.supplierIds] },
        { table: 'ProductBatch', whereClause: 'array_length($1::int[], 1) IS NOT NULL AND "id" = ANY($1::int[])', params: [scopes.productBatchIds] },
        { table: 'Visit', whereClause: 'array_length($1::int[], 1) IS NOT NULL AND "id" = ANY($1::int[])', params: [scopes.visitIds] },
        { table: 'Token', whereClause: 'array_length($1::int[], 1) IS NOT NULL AND "patientId" = ANY($1::int[])', params: [scopes.patientIds] },
        { table: 'Appointment', whereClause: 'array_length($1::int[], 1) IS NOT NULL AND "patientId" = ANY($1::int[])', params: [scopes.patientIds] },
        { table: 'Invoice', whereClause: 'array_length($1::int[], 1) IS NOT NULL AND "patientId" = ANY($1::int[])', params: [scopes.patientIds] },
        {
            table: 'TreatmentProduct',
            whereClause:
                '(array_length($1::int[], 1) IS NOT NULL AND "treatmentId" = ANY($1::int[])) OR (array_length($2::int[], 1) IS NOT NULL AND "productId" = ANY($2::int[]))',
            params: [scopes.treatmentIds, scopes.productIds],
        },
        {
            table: 'Prescription',
            whereClause:
                '(array_length($1::int[], 1) IS NOT NULL AND "visitId" = ANY($1::int[])) OR (array_length($2::int[], 1) IS NOT NULL AND "doctorId" = ANY($2::int[]))',
            params: [scopes.visitIds, scopes.userIds],
        },
        { table: 'ProductOrder', whereClause: 'array_length($1::int[], 1) IS NOT NULL AND "productId" = ANY($1::int[])', params: [scopes.productIds] },
        { table: 'PurchaseOrder', whereClause: 'array_length($1::int[], 1) IS NOT NULL AND "id" = ANY($1::int[])', params: [scopes.purchaseOrderIds] },
        {
            table: 'PurchaseOrderItem',
            whereClause:
                '(array_length($1::int[], 1) IS NOT NULL AND "purchaseOrderId" = ANY($1::int[])) OR (array_length($2::int[], 1) IS NOT NULL AND "productId" = ANY($2::int[]))',
            params: [scopes.purchaseOrderIds, scopes.productIds],
        },
        { table: 'Purchase', whereClause: 'array_length($1::int[], 1) IS NOT NULL AND "productBatchId" = ANY($1::int[])', params: [scopes.productBatchIds] },
        { table: 'Sale', whereClause: 'array_length($1::int[], 1) IS NOT NULL AND "productBatchId" = ANY($1::int[])', params: [scopes.productBatchIds] },
        { table: 'CustomerInvoice', whereClause: 'array_length($1::int[], 1) IS NOT NULL AND "id" = ANY($1::int[])', params: [scopes.customerInvoiceIds] },
        {
            table: 'CustomerInvoiceItem',
            whereClause:
                '(array_length($1::int[], 1) IS NOT NULL AND "customerInvoiceId" = ANY($1::int[])) OR (array_length($2::int[], 1) IS NOT NULL AND "productId" = ANY($2::int[]))',
            params: [scopes.customerInvoiceIds, scopes.productIds],
        },
        { table: 'Payment', whereClause: 'array_length($1::int[], 1) IS NOT NULL AND "referenceId" = ANY($1::int[])', params: [scopes.customerInvoiceIds] },
        { table: 'StockTransaction', whereClause: 'array_length($1::int[], 1) IS NOT NULL AND "productId" = ANY($1::int[])', params: [scopes.productIds] },
        { table: 'DemandForecast', whereClause: 'array_length($1::int[], 1) IS NOT NULL AND "productId" = ANY($1::int[])', params: [scopes.productIds] },
        { table: 'BillProductMapping', whereClause: 'array_length($1::int[], 1) IS NOT NULL AND "mappedProductId" = ANY($1::int[])', params: [scopes.productIds] },
        {
            table: 'Task',
            whereClause:
                '(array_length($1::int[], 1) IS NOT NULL AND "doctorId" = ANY($1::int[])) OR (array_length($2::int[], 1) IS NOT NULL AND "assignedTo" = ANY($2::int[])) OR (array_length($3::int[], 1) IS NOT NULL AND "assignedBy" = ANY($3::int[])) OR (array_length($4::int[], 1) IS NOT NULL AND "visitId" = ANY($4::int[]))',
            params: [scopes.userIds, scopes.userIds, scopes.userIds, scopes.visitIds],
        },
        { table: 'AuditLog', whereClause: '"clinicId" = $1', params: [clinicInternalId] },
    ]
}

async function syncSequenceIfNeeded(targetClient: Client, tableName: string) {
    const hasIdColumn = await targetClient.query<{ exists: boolean }>(
        `SELECT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'id'
        ) AS exists`,
        [tableName]
    )

    if (!hasIdColumn.rows[0]?.exists) return

    const sequenceResult = await targetClient.query<{ seq: string | null }>(
        `SELECT pg_get_serial_sequence($1, 'id') AS seq`,
        [`public.${quoteIdent(tableName)}`]
    )
    const sequenceName = sequenceResult.rows[0]?.seq
    if (!sequenceName) return

    await targetClient.query(
        `SELECT setval($1, COALESCE((SELECT MAX("id") FROM ${quotePublicTable(tableName)}), 1), true)`,
        [sequenceName]
    )
}

async function processClinicRestoreJob(jobId: string, uploadedFilePath: string, mainDbUrl: string) {
    const job = restoreJobs.get(jobId)
    if (!job) {
        return
    }

    const tempDbName = `restore_tmp_${Date.now()}_${Math.floor(Math.random() * 100000)}`
    const tempDbUrl = getDbUrlForDatabase(mainDbUrl, tempDbName)

    const sourceClient = new Client({ connectionString: tempDbUrl })
    const targetClient = new Client({ connectionString: mainDbUrl })

    let tableSummaries: TableMergeSummary[] = []
    let scannedRows = 0
    let insertedRows = 0
    let skippedRows = 0
    const productIdRemap = new Map<number, number>()
    const treatmentIdRemap = new Map<number, number>()

    try {
        updateJobProgress(jobId, 'validating', 5, `Preparing restore for clinic ${job.clinicCode} (${job.clinicName})`)

        updateJobProgress(jobId, 'restoring_dump', 15, 'Creating isolated temporary database')
        await createTempDatabase(mainDbUrl, tempDbName)

        updateJobProgress(jobId, 'restoring_dump', 30, 'Restoring dump file into temporary database')
        const restoreResult = await runRestoreCommand(uploadedFilePath, tempDbUrl)
        appendLog(jobId, `Restore command executed: ${restoreResult.command}`)

        updateJobProgress(jobId, 'scoping', 45, 'Computing clinic-specific scope from restored data')
        await sourceClient.connect()
        await targetClient.connect()

        const sourceClinicTable = await getResolvedTableName(sourceClient, 'Clinic')
        if (!sourceClinicTable) {
            throw new Error('Clinic table was not found in restored dump')
        }
        const clinicIdColumn = await getResolvedColumnName(sourceClient, sourceClinicTable, 'id')
        const clinicCodeColumn = await getResolvedColumnName(sourceClient, sourceClinicTable, 'clinicId')
        const clinicNameColumn = await getResolvedColumnName(sourceClient, sourceClinicTable, 'name')

        const sourceClinic = await sourceClient.query<{ id: string; clinicId: string; name: string }>(
            `SELECT ${quoteIdent(clinicIdColumn)} AS id,
                    ${quoteIdent(clinicCodeColumn)} AS "clinicId",
                    ${quoteIdent(clinicNameColumn)} AS name
             FROM ${quotePublicTable(sourceClinicTable)}
             WHERE ${quoteIdent(clinicIdColumn)} = $1`,
            [job.clinicId]
        )

        if (!sourceClinic.rows.length) {
            throw new Error('Selected clinic data was not found in the uploaded dump file')
        }

        const scopes = await buildScopeSets(sourceClient, job.clinicId)
        const tablePlans = buildTablePlans(job.clinicId, scopes)

        tableSummaries = tablePlans.map((plan) => ({
            table: plan.table,
            status: 'pending',
            scannedRows: 0,
            insertedRows: 0,
            skippedRows: 0,
            errors: 0,
            note: 'Waiting to process',
        }))
        publishLiveResult(jobId, scannedRows, insertedRows, skippedRows, tableSummaries)

        for (let index = 0; index < tablePlans.length; index += 1) {
            const plan = tablePlans[index]
            const mergePercent = 50 + Math.round(((index + 1) / tablePlans.length) * 42)
            updateJobProgress(jobId, 'merging', mergePercent, `Merging table ${plan.table}`)

            const summary = tableSummaries[index]
            summary.status = 'processing'
            summary.startedAt = new Date().toISOString()
            summary.note = 'Analyzing rows from dump for selected clinic'
            publishLiveResult(jobId, scannedRows, insertedRows, skippedRows, tableSummaries)

            const sourceTableName = await getResolvedTableName(sourceClient, plan.table)
            const targetTableName = await getResolvedTableName(targetClient, plan.table)
            if (!sourceTableName || !targetTableName) {
                summary.status = 'skipped'
                summary.finishedAt = new Date().toISOString()
                summary.note = 'Table not present in source or target schema; skipped'
                publishLiveResult(jobId, scannedRows, insertedRows, skippedRows, tableSummaries)
                continue
            }

            const sourceColumns = await getCachedTableColumns(sourceClient, sourceTableName)
            const resolvedWhereClause = resolveWhereClauseIdentifiers(plan.whereClause, sourceColumns)

            const sourceRows = await sourceClient.query(
                `SELECT * FROM ${quotePublicTable(sourceTableName)} WHERE ${resolvedWhereClause}`,
                plan.params
            )

            const targetColumns = await getCachedTableColumns(targetClient, targetTableName)
            const commonColumnPairs = getCommonColumnPairs(sourceColumns, targetColumns)

            scannedRows += sourceRows.rows.length

            const normalizedTableName = normalizeSqlName(plan.table)
            let insertResult: { insertedRows: number; skippedRows: number; errors: number }
            let noteSuffix = ''

            if (normalizedTableName === normalizeSqlName('Product')) {
                const productMergeResult = await mergeProductRowsWithDedupByName(
                    targetClient,
                    targetTableName,
                    sourceRows.rows,
                    commonColumnPairs,
                    plan.batchSize || 200
                )

                productMergeResult.sourceToTargetProductId.forEach((targetId, sourceId) => {
                    productIdRemap.set(sourceId, targetId)
                })

                const remappedProducts = Array.from(productMergeResult.sourceToTargetProductId.entries())
                    .filter(([sourceId, targetId]) => sourceId !== targetId).length

                if (remappedProducts > 0) {
                    noteSuffix = ` (${remappedProducts} product IDs mapped to existing records)`
                }

                insertResult = {
                    insertedRows: productMergeResult.insertedRows,
                    skippedRows: productMergeResult.skippedRows,
                    errors: productMergeResult.errors,
                }
            } else if (normalizedTableName === normalizeSqlName('Treatment')) {
                const treatmentMergeResult = await mergeTreatmentRowsWithDedupByIdentity(
                    targetClient,
                    targetTableName,
                    sourceRows.rows,
                    commonColumnPairs,
                    plan.batchSize || 200
                )

                treatmentMergeResult.sourceToTargetTreatmentId.forEach((targetId, sourceId) => {
                    treatmentIdRemap.set(sourceId, targetId)
                })

                const remappedTreatments = Array.from(treatmentMergeResult.sourceToTargetTreatmentId.entries())
                    .filter(([sourceId, targetId]) => sourceId !== targetId).length
                if (remappedTreatments > 0) {
                    noteSuffix = ` (${remappedTreatments} treatment IDs mapped to existing records)`
                }
                if (treatmentMergeResult.restoredDeletedFlags > 0) {
                    noteSuffix = `${noteSuffix} (restored ${treatmentMergeResult.restoredDeletedFlags} deleted treatment plan flags)`
                    appendLog(jobId, `Restored ${treatmentMergeResult.restoredDeletedFlags} deleted treatment plan flag(s) from dump`)
                }

                insertResult = {
                    insertedRows: treatmentMergeResult.insertedRows,
                    skippedRows: treatmentMergeResult.skippedRows,
                    errors: treatmentMergeResult.errors,
                }
            } else {
                if (productIdRemap.size > 0) {
                    const changedCells = remapProductReferencesInRows(sourceRows.rows, productIdRemap)
                    if (changedCells > 0) {
                        appendLog(jobId, `Re-mapped ${changedCells} product reference field(s) in ${plan.table} rows before merge`)
                    }
                }
                if (treatmentIdRemap.size > 0) {
                    const changedCells = remapTreatmentReferencesInRows(sourceRows.rows, treatmentIdRemap)
                    if (changedCells > 0) {
                        appendLog(jobId, `Re-mapped ${changedCells} treatment reference field(s) in ${plan.table} rows before merge`)
                    }
                }

                let rowsForInsert = sourceRows.rows
                let additionalSkipped = 0

                if (normalizedTableName === normalizeSqlName('Prescription')) {
                    const repaired = await repairExistingPrescriptionLinks(
                        targetClient,
                        targetTableName,
                        sourceRows.rows,
                        productIdRemap,
                        treatmentIdRemap
                    )

                    if (repaired.productIdFixedCount > 0 || repaired.optionProductIdsFixedCount > 0 || repaired.treatmentIdFixedCount > 0) {
                        noteSuffix = ` (repaired ${repaired.productIdFixedCount} product links, ${repaired.treatmentIdFixedCount} treatment links, ${repaired.optionProductIdsFixedCount} option lists)`
                        appendLog(
                            jobId,
                            `Repaired ${repaired.productIdFixedCount} prescription product links, ${repaired.treatmentIdFixedCount} treatment links and ${repaired.optionProductIdsFixedCount} option lists`
                        )
                    }

                    const dedupedPrescriptions = await filterOutExistingPrescriptionDuplicates(
                        targetClient,
                        targetTableName,
                        sourceRows.rows
                    )
                    rowsForInsert = dedupedPrescriptions.rowsToInsert
                    additionalSkipped = dedupedPrescriptions.skippedDuplicates
                    if (dedupedPrescriptions.skippedDuplicates > 0) {
                        noteSuffix = `${noteSuffix} (skipped ${dedupedPrescriptions.skippedDuplicates} duplicate prescription row(s))`
                    }
                }

                insertResult = await insertRowsWithConflictIgnore(
                    targetClient,
                    targetTableName,
                    rowsForInsert,
                    commonColumnPairs,
                    plan.batchSize || 200
                )
                if (additionalSkipped > 0) {
                    insertResult.skippedRows += additionalSkipped
                }
            }

            insertedRows += insertResult.insertedRows
            skippedRows += insertResult.skippedRows + insertResult.errors

            summary.status = 'completed'
            summary.finishedAt = new Date().toISOString()
            summary.scannedRows = sourceRows.rows.length
            summary.insertedRows = insertResult.insertedRows
            summary.skippedRows = insertResult.skippedRows
            summary.errors = insertResult.errors
            summary.note =
                insertResult.errors > 0
                    ? 'Some rows failed row-level insert and were skipped'
                    : insertResult.insertedRows > 0
                        ? 'Merged missing rows successfully'
                        : 'No new rows needed; existing records already present'
            if (noteSuffix) {
                summary.note = `${summary.note}${noteSuffix}`
            }

            publishLiveResult(jobId, scannedRows, insertedRows, skippedRows, tableSummaries)

            await syncSequenceIfNeeded(targetClient, targetTableName)
        }

        const duplicateProductsRemoved = await cleanupUnreferencedDuplicateProducts(targetClient, scopes.userIds, jobId)
        if (duplicateProductsRemoved > 0) {
            appendLog(jobId, `Removed ${duplicateProductsRemoved} unreferenced duplicate product row(s) after merge`)
        }

        await cleanupDuplicatePrescriptions(
            targetClient,
            scopes.visitIds,
            scopes.userIds,
            jobId
        )

        updateJobProgress(jobId, 'finalizing', 96, 'Finalizing clinic restore and cleaning temporary resources')

        updateJob(jobId, {
            status: 'completed',
            phase: 'completed',
            percent: 100,
            message: `Restore completed for clinic ${job.clinicName}`,
            finishedAt: new Date().toISOString(),
            result: {
                scannedRows,
                insertedRows,
                skippedRows,
                tableSummaries,
            },
        })
        appendLog(jobId, `Completed merge restore. Scanned ${scannedRows}, inserted ${insertedRows}, skipped ${skippedRows}`)
    } catch (error: any) {
        const details = String(error?.message || error)

        tableSummaries = tableSummaries.map((summary) => {
            if (summary.status === 'completed' || summary.status === 'skipped') return summary
            return {
                ...summary,
                status: 'skipped',
                finishedAt: new Date().toISOString(),
                note: summary.status === 'processing'
                    ? 'Processing interrupted due to restore failure'
                    : 'Not processed due to restore failure',
            }
        })

        updateJob(jobId, {
            status: 'failed',
            phase: 'failed',
            percent: 100,
            message: 'Clinic restore failed',
            finishedAt: new Date().toISOString(),
            error: details,
            result: {
                scannedRows,
                insertedRows,
                skippedRows,
                tableSummaries,
            },
        })
        appendLog(jobId, `Restore failed: ${details}`)
    } finally {
        try {
            await sourceClient.end()
        } catch {
        }
        try {
            await targetClient.end()
        } catch {
        }
        try {
            await dropTempDatabase(mainDbUrl, tempDbName)
        } catch {
        }
        if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
            fs.unlinkSync(uploadedFilePath)
        }
    }
}

async function processWholeDatabaseRestoreJob(jobId: string, uploadedFilePath: string, mainDbUrl: string) {
    const job = restoreJobs.get(jobId)
    if (!job) {
        return
    }

    const tempDbName = `restore_tmp_${Date.now()}_${Math.floor(Math.random() * 100000)}`
    const tempDbUrl = getDbUrlForDatabase(mainDbUrl, tempDbName)

    const sourceClient = new Client({ connectionString: tempDbUrl })
    const targetClient = new Client({ connectionString: mainDbUrl })

    let tableSummaries: TableMergeSummary[] = []
    let scannedRows = 0
    let insertedRows = 0
    let skippedRows = 0
    const productIdRemap = new Map<number, number>()
    const treatmentIdRemap = new Map<number, number>()

    try {
        updateJobProgress(jobId, 'validating', 5, 'Preparing whole-database restore')

        updateJobProgress(jobId, 'restoring_dump', 15, 'Creating isolated temporary database')
        await createTempDatabase(mainDbUrl, tempDbName)

        updateJobProgress(jobId, 'restoring_dump', 30, 'Restoring dump file into temporary database')
        const restoreResult = await runRestoreCommand(uploadedFilePath, tempDbUrl)
        appendLog(jobId, `Restore command executed: ${restoreResult.command}`)

        updateJobProgress(jobId, 'scoping', 45, 'Building whole-database merge plan')
        await sourceClient.connect()
        await targetClient.connect()

        const preferredOrder = buildTablePlans('__WHOLE__', {
            userIds: [],
            patientIds: [],
            visitIds: [],
            productIds: [],
            treatmentIds: [],
            supplierIds: [],
            purchaseOrderIds: [],
            productBatchIds: [],
            customerInvoiceIds: [],
        }).map((plan) => plan.table)

        const sourceTables = await getPublicTableNames(sourceClient)
        const targetTables = await getPublicTableNames(targetClient)

        const targetByNormalized = new Map<string, string>()
        targetTables.forEach((table) => {
            targetByNormalized.set(normalizeSqlName(table), table)
        })

        const intersectingTables: Array<{ source: string; target: string }> = sourceTables
            .map((sourceTable) => {
                const normalized = normalizeSqlName(sourceTable)
                const targetTable = targetByNormalized.get(normalized)
                if (!targetTable) return null
                return { source: sourceTable, target: targetTable }
            })
            .filter((entry): entry is { source: string; target: string } => !!entry)

        const orderMap = new Map<string, number>()
        preferredOrder.forEach((name, index) => {
            orderMap.set(normalizeSqlName(name), index)
        })

        intersectingTables.sort((a, b) => {
            const rankA = orderMap.get(normalizeSqlName(a.source))
            const rankB = orderMap.get(normalizeSqlName(b.source))
            if (typeof rankA === 'number' && typeof rankB === 'number') return rankA - rankB
            if (typeof rankA === 'number') return -1
            if (typeof rankB === 'number') return 1
            return a.source.localeCompare(b.source)
        })

        tableSummaries = intersectingTables.map(({ source }) => ({
            table: source,
            status: 'pending',
            scannedRows: 0,
            insertedRows: 0,
            skippedRows: 0,
            errors: 0,
            note: 'Waiting to process',
        }))
        publishLiveResult(jobId, scannedRows, insertedRows, skippedRows, tableSummaries)

        for (let index = 0; index < intersectingTables.length; index += 1) {
            const plan = intersectingTables[index]
            const mergePercent = 50 + Math.round(((index + 1) / Math.max(intersectingTables.length, 1)) * 42)
            updateJobProgress(jobId, 'merging', mergePercent, `Merging table ${plan.source}`)

            const summary = tableSummaries[index]
            summary.status = 'processing'
            summary.startedAt = new Date().toISOString()
            summary.note = 'Analyzing rows from dump for whole-database merge'
            publishLiveResult(jobId, scannedRows, insertedRows, skippedRows, tableSummaries)

            const sourceColumns = await getCachedTableColumns(sourceClient, plan.source)
            const targetColumns = await getCachedTableColumns(targetClient, plan.target)
            const commonColumnPairs = getCommonColumnPairs(sourceColumns, targetColumns)

            if (commonColumnPairs.length === 0) {
                summary.status = 'skipped'
                summary.finishedAt = new Date().toISOString()
                summary.note = 'No common columns found between source and target table'
                publishLiveResult(jobId, scannedRows, insertedRows, skippedRows, tableSummaries)
                continue
            }

            const sourceRows = await sourceClient.query(`SELECT * FROM ${quotePublicTable(plan.source)}`)
            scannedRows += sourceRows.rows.length

            const normalizedTableName = normalizeSqlName(plan.source)
            let insertResult: { insertedRows: number; skippedRows: number; errors: number }
            let noteSuffix = ''

            if (normalizedTableName === normalizeSqlName('Product')) {
                const productMergeResult = await mergeProductRowsWithDedupByName(
                    targetClient,
                    plan.target,
                    sourceRows.rows,
                    commonColumnPairs,
                    200
                )

                productMergeResult.sourceToTargetProductId.forEach((targetId, sourceId) => {
                    productIdRemap.set(sourceId, targetId)
                })

                const remappedProducts = Array.from(productMergeResult.sourceToTargetProductId.entries())
                    .filter(([sourceId, targetId]) => sourceId !== targetId).length
                if (remappedProducts > 0) {
                    noteSuffix = ` (${remappedProducts} product IDs mapped to existing records)`
                }

                insertResult = {
                    insertedRows: productMergeResult.insertedRows,
                    skippedRows: productMergeResult.skippedRows,
                    errors: productMergeResult.errors,
                }
            } else if (normalizedTableName === normalizeSqlName('Treatment')) {
                const treatmentMergeResult = await mergeTreatmentRowsWithDedupByIdentity(
                    targetClient,
                    plan.target,
                    sourceRows.rows,
                    commonColumnPairs,
                    200
                )

                treatmentMergeResult.sourceToTargetTreatmentId.forEach((targetId, sourceId) => {
                    treatmentIdRemap.set(sourceId, targetId)
                })

                const remappedTreatments = Array.from(treatmentMergeResult.sourceToTargetTreatmentId.entries())
                    .filter(([sourceId, targetId]) => sourceId !== targetId).length
                if (remappedTreatments > 0) {
                    noteSuffix = ` (${remappedTreatments} treatment IDs mapped to existing records)`
                }
                if (treatmentMergeResult.restoredDeletedFlags > 0) {
                    noteSuffix = `${noteSuffix} (restored ${treatmentMergeResult.restoredDeletedFlags} deleted treatment plan flags)`
                    appendLog(jobId, `Restored ${treatmentMergeResult.restoredDeletedFlags} deleted treatment plan flag(s) from dump`)
                }

                insertResult = {
                    insertedRows: treatmentMergeResult.insertedRows,
                    skippedRows: treatmentMergeResult.skippedRows,
                    errors: treatmentMergeResult.errors,
                }
            } else {
                if (productIdRemap.size > 0) {
                    remapProductReferencesInRows(sourceRows.rows, productIdRemap)
                }
                if (treatmentIdRemap.size > 0) {
                    remapTreatmentReferencesInRows(sourceRows.rows, treatmentIdRemap)
                }

                let rowsForInsert = sourceRows.rows
                let additionalSkipped = 0

                if (normalizedTableName === normalizeSqlName('Prescription')) {
                    const repaired = await repairExistingPrescriptionLinks(
                        targetClient,
                        plan.target,
                        sourceRows.rows,
                        productIdRemap,
                        treatmentIdRemap
                    )
                    if (repaired.productIdFixedCount > 0 || repaired.optionProductIdsFixedCount > 0 || repaired.treatmentIdFixedCount > 0) {
                        noteSuffix = ` (repaired ${repaired.productIdFixedCount} product links, ${repaired.treatmentIdFixedCount} treatment links, ${repaired.optionProductIdsFixedCount} option lists)`
                        appendLog(
                            jobId,
                            `Repaired ${repaired.productIdFixedCount} prescription product links, ${repaired.treatmentIdFixedCount} treatment links and ${repaired.optionProductIdsFixedCount} option lists`
                        )
                    }

                    const dedupedPrescriptions = await filterOutExistingPrescriptionDuplicates(
                        targetClient,
                        plan.target,
                        sourceRows.rows
                    )
                    rowsForInsert = dedupedPrescriptions.rowsToInsert
                    additionalSkipped = dedupedPrescriptions.skippedDuplicates
                    if (dedupedPrescriptions.skippedDuplicates > 0) {
                        noteSuffix = `${noteSuffix} (skipped ${dedupedPrescriptions.skippedDuplicates} duplicate prescription row(s))`
                    }
                }

                insertResult = await insertRowsWithConflictIgnore(
                    targetClient,
                    plan.target,
                    rowsForInsert,
                    commonColumnPairs,
                    200
                )
                if (additionalSkipped > 0) {
                    insertResult.skippedRows += additionalSkipped
                }
            }

            insertedRows += insertResult.insertedRows
            skippedRows += insertResult.skippedRows + insertResult.errors

            summary.status = 'completed'
            summary.finishedAt = new Date().toISOString()
            summary.scannedRows = sourceRows.rows.length
            summary.insertedRows = insertResult.insertedRows
            summary.skippedRows = insertResult.skippedRows
            summary.errors = insertResult.errors
            summary.note =
                insertResult.errors > 0
                    ? 'Some rows failed row-level insert and were skipped'
                    : insertResult.insertedRows > 0
                        ? 'Merged missing rows successfully'
                        : 'No new rows needed; existing records already present'
            if (noteSuffix) {
                summary.note = `${summary.note}${noteSuffix}`
            }

            publishLiveResult(jobId, scannedRows, insertedRows, skippedRows, tableSummaries)

            await syncSequenceIfNeeded(targetClient, plan.target)
        }

        const userTable = await getResolvedTableName(targetClient, 'User')
        if (userTable) {
            const userIdColumn = await getResolvedColumnName(targetClient, userTable, 'id')
            const allDoctorIdsResult = await targetClient.query<{ id: number }>(
                `SELECT ${quoteIdent(userIdColumn)} AS id
                 FROM ${quotePublicTable(userTable)}`
            )
            const allDoctorIds = allDoctorIdsResult.rows
                .map((row) => Number(row.id))
                .filter((id) => Number.isInteger(id))
            await cleanupUnreferencedDuplicateProducts(targetClient, allDoctorIds, jobId)
        }

        updateJobProgress(jobId, 'finalizing', 96, 'Finalizing whole-database restore and cleaning temporary resources')

        updateJob(jobId, {
            status: 'completed',
            phase: 'completed',
            percent: 100,
            message: 'Restore completed for whole database',
            finishedAt: new Date().toISOString(),
            result: {
                scannedRows,
                insertedRows,
                skippedRows,
                tableSummaries,
            },
        })
        appendLog(jobId, `Completed whole-database merge restore. Scanned ${scannedRows}, inserted ${insertedRows}, skipped ${skippedRows}`)
    } catch (error: any) {
        const details = String(error?.message || error)

        tableSummaries = tableSummaries.map((summary) => {
            if (summary.status === 'completed' || summary.status === 'skipped') return summary
            return {
                ...summary,
                status: 'skipped',
                finishedAt: new Date().toISOString(),
                note: summary.status === 'processing'
                    ? 'Processing interrupted due to restore failure'
                    : 'Not processed due to restore failure',
            }
        })

        updateJob(jobId, {
            status: 'failed',
            phase: 'failed',
            percent: 100,
            message: 'Whole-database restore failed',
            finishedAt: new Date().toISOString(),
            error: details,
            result: {
                scannedRows,
                insertedRows,
                skippedRows,
                tableSummaries,
            },
        })
        appendLog(jobId, `Restore failed: ${details}`)
    } finally {
        try {
            await sourceClient.end()
        } catch {
        }
        try {
            await targetClient.end()
        } catch {
        }
        try {
            await dropTempDatabase(mainDbUrl, tempDbName)
        } catch {
        }
        if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
            fs.unlinkSync(uploadedFilePath)
        }
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    pruneOldJobs()

    const user = await requireSuperAdmin(req)
    if (!user) {
        return res.status(403).json({ error: 'Access denied' })
    }

    if (req.method === 'GET') {
        const jobId = String(req.query.jobId || '').trim()
        if (!jobId) {
            return res.status(400).json({ error: 'jobId is required' })
        }

        const job = restoreJobs.get(jobId)
        if (!job) {
            return res.status(404).json({ error: 'Restore job not found' })
        }

        return res.status(200).json({ job })
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' })
    }

    const dbUrl = process.env.DATABASE_URL
    if (!dbUrl) {
        return res.status(500).json({ error: 'DATABASE_URL is not configured' })
    }

    const form = formidable({
        maxFileSize: 1024 * 1024 * 1024,
        keepExtensions: true,
        multiples: false,
    })

    try {
        const runningJob = Array.from(restoreJobs.values()).find((job) => job.status === 'running')
        if (runningJob) {
            return res.status(409).json({
                error:
                    runningJob.scope === 'whole'
                        ? 'Another whole-database restore is already running. Wait for completion before starting a new restore.'
                        : `Another restore is already running for clinic ${runningJob.clinicCode}. Wait for completion before starting a new restore.`,
            })
        }

        const [fields, files] = await form.parse(req)
        const file = getSingleFile(files, 'dumpFile')
        const confirmText = getSingleField(fields, 'confirmText').trim().toUpperCase()
        const restoreScopeRaw = getSingleField(fields, 'restoreScope').trim().toLowerCase()
        const restoreScope: RestoreScope = restoreScopeRaw === 'whole' ? 'whole' : 'clinic'
        const clinicId = getSingleField(fields, 'clinicId').trim()

        if (!file) {
            return res.status(400).json({ error: 'No dump file uploaded' })
        }

        if (restoreScope === 'clinic' && !clinicId) {
            return res.status(400).json({ error: 'clinicId is required' })
        }

        if (!['.dump', '.sql', '.backup'].includes(path.extname(file.originalFilename || '').toLowerCase())) {
            return res.status(400).json({ error: 'Only .dump, .backup, or .sql files are allowed' })
        }

        if (confirmText !== 'RESTORE') {
            return res.status(400).json({ error: 'Confirmation text must be RESTORE' })
        }

        let selectedClinic: { id: string; clinicId: string; name: string } | null = null
        if (restoreScope === 'clinic') {
            selectedClinic = await prisma.clinic.findUnique({
                where: { id: clinicId },
                select: { id: true, clinicId: true, name: true },
            })

            if (!selectedClinic) {
                return res.status(404).json({ error: 'Selected clinic was not found in the current database' })
            }
        }

        const jobId = randomUUID()
        const restoreJob: RestoreJob = {
            id: jobId,
            scope: restoreScope,
            clinicId: selectedClinic?.id || '__WHOLE__',
            clinicCode: selectedClinic?.clinicId || 'ALL',
            clinicName: selectedClinic?.name || 'Whole Database',
            status: 'running',
            phase: 'queued',
            percent: 0,
            message: 'Restore job queued',
            startedAt: new Date().toISOString(),
            logs: [],
        }

        restoreJobs.set(jobId, restoreJob)
        appendLog(
            jobId,
            restoreScope === 'clinic'
                ? `Job created for clinic ${selectedClinic?.clinicId} (${selectedClinic?.name})`
                : 'Job created for whole-database restore'
        )

        const uploadedFilePath = file.filepath
        if (restoreScope === 'whole') {
            void processWholeDatabaseRestoreJob(jobId, uploadedFilePath, dbUrl)
        } else {
            void processClinicRestoreJob(jobId, uploadedFilePath, dbUrl)
        }

        return res.status(202).json({
            success: true,
            jobId,
            message: restoreScope === 'clinic'
                ? `Restore job started for clinic ${selectedClinic?.name}`
                : 'Restore job started for whole database',
        })
    } catch (error: any) {
        const message = String(error?.message || error)

        if (
            message.includes('ENOENT') ||
            message.includes('not recognized') ||
            message.includes('PostgreSQL client tool not found') ||
            message.includes('PG_RESTORE_COMMAND is set but the executable was not found') ||
            message.includes('PSQL_COMMAND is set but the executable was not found')
        ) {
            return res.status(500).json({
                error: 'Restore command not found. Install PostgreSQL client tools (pg_restore/psql) on this server.',
                details: message,
            })
        }

        return res.status(500).json({
            error: 'Database restore failed',
            details: message,
        })
    }
}
