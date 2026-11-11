import { createHash } from 'node:crypto'
import { canonicalJson } from '../../shared/contract/authoritative-command'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import { PostgresDatabase } from '../../server/database/postgres'
import { S3ObjectStore } from '../../server/storage/s3-store'
import { ErasureLedger } from '../../server/storage/erasure-ledger'
import { decodeLedger, mergeLedger } from '../storage-archive'
import { parsePrereleaseTarget, targetFingerprint, type PrereleaseTarget } from './config'
import { readRetainedIdentityManifest } from './identity-manifest'

/** Runs from sanitized trusted-main source, not the candidate application tree. */
export async function operatePrereleaseStorage(target: PrereleaseTarget, operation: string, env: NodeJS.ProcessEnv = process.env) {
  const source = env.DATABASE_URL && new URL(env.DATABASE_URL)
  if (env.RELEASE_CHANNEL !== 'prerelease' || !source || decodeURIComponent(source.pathname.slice(1)) !== target.database.name
    || ![target.database.appRole, target.database.backupRole].includes(decodeURIComponent(source.username))
    || env.S3_BUCKET !== target.objects.bucket || env.S3_PREFIX !== target.objects.prefix || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY
    || !env.S3_REGION || !env.S3_ENDPOINT || env.DATABASE_SCHEMA && env.DATABASE_SCHEMA !== 'public') throw new Error('Storage operation is outside the sealed prerelease environment')
  const db = new PostgresDatabase({ connectionString: source.toString(), schema: 'public', max: 1 })
  const client = new S3Client({ endpoint: env.S3_ENDPOINT, region: env.S3_REGION, forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY }, maxAttempts: 1,
    requestHandler: { connectionTimeout: 5000, requestTimeout: 15000 } })
  const objects = S3ObjectStore.fromEnv(env)
  try {
    const identity = await db.prepare(`SELECT current_database() AS database, current_user AS role,
      r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolreplication, r.rolbypassrls, r.rolconnlimit,
      has_database_privilege(current_user,?,'CONNECT') AS formal_connect
      FROM pg_roles r WHERE r.rolname=current_user`).get<{
        database: string; role: string; rolsuper: boolean; rolcreatedb: boolean; rolcreaterole: boolean;
        rolreplication: boolean; rolbypassrls: boolean; rolconnlimit: number; formal_connect: boolean
      }>(target.formal.database)
    if (!identity || identity.database !== target.database.name || identity.role !== decodeURIComponent(source.username)
      || identity.rolsuper || identity.rolcreatedb || identity.rolcreaterole || identity.rolreplication || identity.rolbypassrls
      || identity.formal_connect || identity.rolconnlimit < 1 || identity.rolconnlimit > 40) throw new Error('Database permissions or connection budget cross the prerelease boundary')
    const backupRole = identity.role === target.database.backupRole
    if (backupRole) {
      const writable = await db.prepare(`SELECT has_schema_privilege(current_user,'public','CREATE')
        OR has_database_privilege(current_user,current_database(),'CREATE')
        OR EXISTS(SELECT 1 FROM pg_tables WHERE schemaname='public' AND
          (tableowner=current_user OR has_table_privilege(current_user,quote_ident(schemaname)||'.'||quote_ident(tablename),'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER'))) AS value`).get<{ value: boolean }>()
      if (writable?.value !== false || !env.VALIDATION_DATABASE_URL) throw new Error('Backup source role must be read-only and use a separate validator')
      const validator = new PostgresDatabase({ connectionString: env.VALIDATION_DATABASE_URL, max: 1 })
      try {
        const role = await validator.prepare(`SELECT current_database() AS database,current_user AS role,
          r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls AS elevated,
          r.rolconnlimit, has_database_privilege(current_user,?,'CONNECT') OR has_database_privilege(current_user,?,'CONNECT') AS outside
          FROM pg_roles r WHERE rolname=current_user`).get<{ database: string; role: string; elevated: boolean; rolconnlimit: number; outside: boolean }>(target.database.name, target.formal.database)
        if (!role || role.database !== target.validationDatabase.name || role.role !== target.validationDatabase.role || role.elevated
          || role.outside || role.rolconnlimit < 1 || role.rolconnlimit > 40) throw new Error('Validator permissions cross the scratch database boundary')
      } finally { await validator.close() }
    }
    let denied = false
    try { await client.send(new ListObjectsV2Command({ Bucket: target.formal.bucket, MaxKeys: 1 })) }
    catch (error) {
      if (error && typeof error === 'object' && '$metadata' in error && error.$metadata && typeof error.$metadata === 'object'
        && 'httpStatusCode' in error.$metadata && error.$metadata.httpStatusCode === 403) denied = true
      else throw error
    }
    if (!denied) throw new Error('Object credentials can access the formal bucket')
    if (!backupRole) {
      let scratchDenied = false
      try { await client.send(new ListObjectsV2Command({ Bucket: target.objects.bucket, Prefix: 'test/', MaxKeys: 1 })) }
      catch (error) { if (error && typeof error === 'object' && '$metadata' in error && error.$metadata && typeof error.$metadata === 'object' && 'httpStatusCode' in error.$metadata && error.$metadata.httpStatusCode === 403) scratchDenied = true; else throw error }
      if (!scratchDenied) throw new Error('Application object credentials can access validation scratch')
    }
    if (operation === 'identities') return readRetainedIdentityManifest(db)
    const keys: Array<{ key: string; bytes: number }> = []
    let token: string | undefined
    do {
      const page = await client.send(new ListObjectsV2Command({ Bucket: target.objects.bucket, Prefix: target.objects.prefix, ContinuationToken: token }))
      for (const entry of page.Contents ?? []) if (entry.Key) keys.push({ key: entry.Key, bytes: entry.Size ?? 0 })
      token = page.NextContinuationToken
    } while (token)
    const size = await db.prepare('SELECT pg_database_size(current_database()) AS bytes').get<{ bytes: number }>()
    const usage = { databaseBytes: size?.bytes ?? 0, objectBytes: keys.reduce((sum, entry) => sum + entry.bytes, 0) }
    if (operation === 'inspect' || operation === 'budget') return { ...usage, database: identity.database, role: identity.role, formalDatabaseDenied: true, formalBucketDenied: true }
    const active = await db.prepare("SELECT to_regclass('app_instances') AS name").get<{ name: string | null }>()
    if (active?.name && await db.prepare("SELECT 1 FROM app_instances WHERE status!='stopped' AND lease_until>(extract(epoch FROM clock_timestamp())*1000)::bigint LIMIT 1").get()) throw new Error('Stop every prerelease writer before changing storage')
    if (operation === 'empty') {
      const tables = await db.prepare("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('postgres_schema_migrations','data_imports')").all<{ tablename: string }>()
      for (const { tablename } of tables) {
        if (!/^[a-z_][a-z0-9_]*$/.test(tablename) || await db.prepare(`SELECT 1 FROM "${tablename}" LIMIT 1`).get()) throw new Error('Initial deployment requires an explicitly empty prerelease database')
      }
      if (keys.some(entry => entry.key !== `${target.objects.prefix}erasure/ledger.json`)) throw new Error('Initial deployment requires an explicitly empty prerelease object prefix')
      await new ErasureLedger(objects).read()
      return { empty: true, ...usage }
    }
    if (operation !== 'reset' || env.APPLICATIONS_STOPPED !== '1' || !env.CURRENT_ERASURE_LEDGER
      || !/^[a-f0-9-]{36}$/.test(env.PRERELEASE_OLD_GENERATION ?? '') || !/^[a-f0-9-]{36}$/.test(env.PRERELEASE_OPERATION_ID ?? '') || !/^[a-f0-9]{40}$/.test(env.PRERELEASE_SOURCE_BUILD_ID ?? '')) throw new Error('Explicit stopped-generation reset authorization is required')
    await mergeLedger(objects, decodeLedger(await readFile(env.CURRENT_ERASURE_LEDGER, 'utf8')))
    const ledger = await new ErasureLedger(objects).read()
    for (const { key } of keys) if (key !== `${target.objects.prefix}erasure/ledger.json`) await client.send(new DeleteObjectCommand({ Bucket: target.objects.bucket, Key: key }))
    await db.exec(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
      GRANT USAGE ON SCHEMA public TO "${target.database.backupRole}";
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO "${target.database.backupRole}";
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON SEQUENCES TO "${target.database.backupRole}"`)
    const remaining = await client.send(new ListObjectsV2Command({ Bucket: target.objects.bucket, Prefix: target.objects.prefix, MaxKeys: 2 }))
    if ((remaining.Contents ?? []).some(entry => entry.Key !== `${target.objects.prefix}erasure/ledger.json`) || remaining.IsTruncated
      || await db.prepare("SELECT 1 FROM pg_tables WHERE schemaname='public' LIMIT 1").get()) throw new Error('Generation purge did not verify empty native storage')
    if (!/^[a-f0-9]{40}$/.test(env.PRERELEASE_SOURCE_BUILD_ID ?? '')) throw new Error('Purge source build identity is required')
    return { format: 1, channel: 'prerelease', targetId: target.targetId, targetOrigin: target.origin, targetFingerprint: targetFingerprint(target),
      generationId: env.PRERELEASE_OLD_GENERATION, sourceBuildId: env.PRERELEASE_SOURCE_BUILD_ID, erasureLedgerSha256: createHash('sha256').update(canonicalJson(ledger)).digest('hex'), operationId: env.PRERELEASE_OPERATION_ID, purgedAt: Date.now(), database: target.database.name,
      bucket: target.objects.bucket, prefix: target.objects.prefix, retainedErasureBatches: ledger.length }
  } finally { objects.close(); client.destroy(); await db.close() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const target = parsePrereleaseTarget(JSON.parse(await readFile('/target.json', 'utf8')))
    process.stdout.write(JSON.stringify(await operatePrereleaseStorage(target, process.argv[2])) + '\n')
  } catch { console.error('Isolated prerelease storage check failed'); process.exitCode = 1 }
}
