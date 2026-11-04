import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as pause } from 'node:timers/promises'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { createTestDatabase, databaseMaintenance, getTestDatabaseUrl } from '../../server/__tests__/_helpers/postgres'
import { testStorageEnvironment } from '../../server/__tests__/_helpers/objects'
import { PostgresDatabase } from '../../server/database/postgres'
import { ResourceStore } from '../../server/storage/resource-store'
import { S3ObjectStore } from '../../server/storage/s3-store'
import { cleanupBackupScratch, withBackupScratch } from '../backup-scratch'
import { exportStorageArchive } from '../storage-archive'

vi.setConfig({ testTimeout: 120_000, hookTimeout: 180_000 })

let root: string
let archive: string
let env: NodeJS.ProcessEnv
let source: PostgresDatabase
let objects: S3ObjectStore

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'agricola-backup-scratch-'))
  archive = join(root, 'archive')
  source = await createTestDatabase()
  const prefix = `test/source-${randomUUID()}/`
  env = { ...testStorageEnvironment(), DATABASE_URL: getTestDatabaseUrl(), S3_PREFIX: prefix }
  objects = S3ObjectStore.fromEnv(env)
  await new ResourceStore(source, objects).stage('card-art/private.png', Buffer.from('private validation bytes'), 'image/png')
  await exportStorageArchive({ connectionString: getTestDatabaseUrl(), db: source, objects,
    root: archive, sourceBuildId: 'scratch-test', mode: 'maintenance', signal: new AbortController().signal })
})

afterAll(async () => {
  await objects?.clearPrefix()
  objects?.close()
  await source?.close()
  if (root) await rm(root, { recursive: true, force: true })
})

async function waitFor<T>(read: () => Promise<T | undefined>): Promise<T> {
  for (let attempt = 0; attempt < 300; attempt++) {
    const value = await read()
    if (value !== undefined) return value
    await pause(100)
  }
  throw new Error('Scratch worker did not reach the controlled pause')
}

async function recordAt(directory: string) {
  const names = (await readdir(directory)).filter(name => name.endsWith('.json'))
  expect(names).toHaveLength(1)
  const bytes = await readFile(join(directory, names[0]!), 'utf8')
  const record: unknown = JSON.parse(bytes)
  if (!record || typeof record !== 'object' || !('token' in record) || typeof record.token !== 'string'
    || !('deadlineEpochMs' in record) || typeof record.deadlineEpochMs !== 'number') throw new Error('Scratch record not readable')
  return { token: record.token, deadline: record.deadlineEpochMs, bytes }
}

async function kill(worker: ChildProcess): Promise<void> {
  if (worker.exitCode !== null || worker.signalCode !== null) return
  const closed = new Promise<void>(done => worker.once('close', () => done()))
  worker.kill('SIGKILL')
  await closed
}

it('reclaims a SIGKILLed real validation database and S3 namespace from its durable record', async () => {
  const directory = join(root, 'killed-validation')
  const bin = join(root, 'pause-bin')
  const ready = join(root, 'restore-paused')
  await mkdir(directory)
  await mkdir(bin)
  await writeFile(join(bin, 'pg_restore'), '#!/bin/sh\necho $$ > "$BACKUP_TEST_PAUSED"\nexec sleep 120\n', { mode: 0o700 })
  const deadline = Date.now() + 60_000
  const worker = spawn(process.execPath, ['--import', 'tsx', 'scripts/storage-archive-cli.ts', 'validate', archive], {
    cwd: resolve('.'), env: { ...process.env, ...env, PG_CLIENT_MODE: 'local', PATH: `${bin}:${process.env.PATH}`,
      BACKUP_SCRATCH_DIRECTORY: directory, BACKUP_JOB_ID: `test-${randomUUID()}`,
      BACKUP_DEADLINE_EPOCH_MS: String(deadline), BACKUP_TEST_PAUSED: ready }, stdio: 'ignore',
  })
  let restorePid: number | undefined
  let record: Awaited<ReturnType<typeof recordAt>> | undefined
  try {
    restorePid = await waitFor(async () => {
      try { return Number(await readFile(ready, 'utf8')) } catch { return undefined }
    })
    record = await recordAt(directory)
    expect(record.bytes).not.toContain(new URL(getTestDatabaseUrl()).password)
    expect(record.bytes).not.toContain('postgresql://')
    expect(record.bytes).not.toContain(env.S3_SECRET_ACCESS_KEY)
    const scratch = S3ObjectStore.fromEnv(env, `test/backup-${record.token}/`)
    try { expect((await scratch.get('card-art/private.png'))?.body.toString()).toBe('private validation bytes') }
    finally { scratch.close() }
    await kill(worker)
    expect(await cleanupBackupScratch(directory, env, deadline - 1)).toBe(0)
    await expect(cleanupBackupScratch(directory, { ...env, S3_BUCKET: 'unrelated-environment' }, deadline + 1)).rejects.toThrow('different environment')
    expect(await readdir(directory)).toHaveLength(1)
    expect(await cleanupBackupScratch(directory, env, deadline + 1)).toBe(1)
    const admin = databaseMaintenance()
    try { expect(await admin.prepare('SELECT 1 FROM pg_database WHERE datname=?').get(`backup_${record.token}`)).toBeUndefined() }
    finally { await admin.close() }
    const reclaimed = S3ObjectStore.fromEnv(env, `test/backup-${record.token}/`)
    try { expect(await reclaimed.get('card-art/private.png')).toBeNull() } finally { reclaimed.close() }
    expect(await readdir(directory)).toEqual([])
  } finally {
    await kill(worker)
    if (restorePid) { try { process.kill(restorePid, 'SIGKILL') } catch { /* The worker may already have exited. */ } }
    if (record) await cleanupBackupScratch(directory, env, deadline + 1)
  }
})

it('cleans only the exclusively claimed schema of a killed provided-database worker', async () => {
  const directory = join(root, 'provided-validation')
  await mkdir(directory)
  const database = `scratch_provided_${randomUUID().replaceAll('-', '')}`
  const admin = databaseMaintenance()
  await admin.exec(`CREATE DATABASE "${database}"`)
  const url = new URL(getTestDatabaseUrl()); url.pathname = `/${database}`
  const provided = { ...env, VALIDATION_DATABASE_URL: url.toString() }
  const deadline = Date.now() + 60_000
  const code = `import { withBackupScratch } from ${JSON.stringify(resolve('scripts/backup-scratch.ts'))};
await withBackupScratch({ directory: process.env.SCRATCH_TEST_DIRECTORY, env: process.env, schema: 'public', deadlineEpochMs: Number(process.env.BACKUP_DEADLINE_EPOCH_MS), signal: new AbortController().signal }, async scratch => {
  await scratch.db.exec('CREATE TABLE private_validation(value text)');
  await scratch.objects.putImmutable('card-art/killed.png', Buffer.from('killed provided bytes'), 'image/png');
  process.send({ ready: true });
  await new Promise(() => {});
});`
  const worker = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], {
    env: { ...process.env, ...provided, SCRATCH_TEST_DIRECTORY: directory, BACKUP_JOB_ID: `test-${randomUUID()}`,
      BACKUP_DEADLINE_EPOCH_MS: String(deadline) }, stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
  })
  const target = new PostgresDatabase({ connectionString: url.toString() })
  try {
    await new Promise<void>((done, reject) => {
      worker.once('message', () => done())
      worker.once('exit', code => reject(new Error(`Scratch worker exited before its pause: ${code}`)))
    })
    await kill(worker)
    expect(await target.prepare("SELECT to_regclass('private_validation') AS name").get()).toEqual({ name: 'private_validation' })
    expect(await cleanupBackupScratch(directory, provided, deadline + 1)).toBe(1)
    expect(await target.prepare("SELECT to_regclass('private_validation') AS name").get()).toEqual({ name: null })
    expect(await target.prepare("SELECT 1 FROM pg_namespace WHERE nspname LIKE 'backup_guard_%'").get()).toBeUndefined()
    expect(await target.prepare("SELECT 1 FROM pg_namespace WHERE nspname='public'").get()).toBeDefined()
  } finally {
    await kill(worker)
    await target.close()
    await admin.exec(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
    await admin.close()
  }
})

it('leaves someone else\'s nonempty validation schema untouched when admission fails', async () => {
  const directory = join(root, 'occupied-validation')
  const database = `scratch_occupied_${randomUUID().replaceAll('-', '')}`
  const admin = databaseMaintenance()
  await admin.exec(`CREATE DATABASE "${database}"`)
  const url = new URL(getTestDatabaseUrl()); url.pathname = `/${database}`
  const target = new PostgresDatabase({ connectionString: url.toString() })
  const provided = { ...env, VALIDATION_DATABASE_URL: url.toString() }
  try {
    await target.exec("CREATE TABLE keep_me(value text); INSERT INTO keep_me VALUES ('belongs to somebody else')")
    await expect(withBackupScratch({ directory, env: provided, schema: 'public', deadlineEpochMs: Date.now() + 60_000,
      signal: new AbortController().signal }, async () => { throw new Error('must not run') })).rejects.toThrow('empty')
    expect(await target.prepare('SELECT value FROM keep_me').all()).toEqual([{ value: 'belongs to somebody else' }])
    expect(await readdir(directory)).toEqual([])
    await expect(withBackupScratch({ directory, env: { ...env, VALIDATION_DATABASE_URL: getTestDatabaseUrl() }, schema: 'public',
      deadlineEpochMs: Date.now() + 60_000, signal: new AbortController().signal }, async () => {})).rejects.toThrow('source database')
  } finally {
    await target.close()
    await admin.exec(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`)
    await admin.close()
  }
})
