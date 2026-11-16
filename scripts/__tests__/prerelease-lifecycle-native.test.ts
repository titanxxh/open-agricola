import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { Worker } from 'node:worker_threads'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CreateBucketCommand, DeleteBucketCommand, DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3'
import WebSocket, { WebSocketServer } from 'ws'
import { afterEach, expect, it, vi } from 'vitest'
import { databaseMaintenance, getTestDatabaseUrl } from '../../server/__tests__/_helpers/postgres'
import { testStorageEnvironment } from '../../server/__tests__/_helpers/objects'
import { scopedObjectAccount } from '../../server/__tests__/_helpers/scoped-object-account'
import { releaseQueue } from '../../server/__tests__/_helpers/release-all'
import { PostgresDatabase } from '../../server/database/postgres'
import { migratePostgres } from '../../server/database/migrations'
import { S3ObjectStore } from '../../server/storage/s3-store'
import { ErasureLedger } from '../../server/storage/erasure-ledger'
import { FormalPrereleaseIdentityClient } from '../../server/prerelease-identity-client'
import { PrereleaseIdentityLifecycle } from '../../server/prerelease-identity-lifecycle'
import * as sessions from '../../server/prerelease-sessions'
import { prereleaseCommandAllowed, prereleaseRequestAdmission, trackPrereleaseSocket } from '../../server/prerelease-access'
import { RoomDirectory } from '../../server/game/room-directory'
import { BROWSER_AUTH_HEADER, BROWSER_AUTH_VERSION, BROWSER_WS_PROTOCOL } from '../../shared/contract/browser-auth'
import { PRERELEASE_BUILD_PROTOCOL_PREFIX, PRERELEASE_GENERATION_PROTOCOL_PREFIX } from '../../shared/contract/prerelease-runtime'
import { canonicalJson } from '../../shared/contract/authoritative-command'
import { parsePrereleaseTarget } from '../prerelease/config'
import { operatePrereleaseStorage } from '../prerelease/storage'

vi.setConfig({ testTimeout: 120000, hookTimeout: 180000 })
const cleanup = releaseQueue()
afterEach(async () => { try { await cleanup.release() } finally { vi.restoreAllMocks(); vi.unstubAllEnvs() } })

it('purges real isolated storage before owner retirement and rejects old HTTP, WebSocket and owner leases in the new generation', async () => {
  const id = randomBytes(6).toString('hex'), appRole = `oa_prerelease_${id}_app`, backupRole = `oa_prerelease_${id}_backup`
  const preName = `oa_prerelease_${id}`, formalName = `${preName}_formal`, password = randomBytes(24).toString('hex')
  const admin = databaseMaintenance()
  cleanup.register(() => admin.close())
  for (const role of [appRole, backupRole]) {
    await admin.exec(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 4`)
    cleanup.register(() => admin.exec(`DROP ROLE IF EXISTS "${role}"`))
  }
  const createDatabase = async (name: string, owner?: string) => {
    await admin.exec(`CREATE DATABASE "${name}"${owner ? ` OWNER "${owner}"` : ''}`)
    cleanup.register(() => admin.exec(`DROP DATABASE IF EXISTS "${name}"`))
    await admin.exec(`REVOKE CONNECT ON DATABASE "${name}" FROM PUBLIC`)
    const url = new URL(getTestDatabaseUrl()); url.pathname = `/${name}`
    if (owner) { url.username = owner; url.password = password }
    const db = new PostgresDatabase({ connectionString: url.toString(), max: 2 })
    const close = db.close.bind(db)
    let closing: Promise<void> | undefined
    db.close = () => closing ??= close()
    cleanup.register(() => db.close())
    await migratePostgres(db)
    return { db, url }
  }
  const formal = await createDatabase(formalName), pre = await createDatabase(preName, appRole)
  const root = await mkdtemp(join(tmpdir(), 'oa-pre-native-lifecycle-'))
  cleanup.register(() => rm(root, { recursive: true, force: true }))
  const objectEnv = testStorageEnvironment()
  const rootClient = new S3Client({ endpoint: objectEnv.S3_ENDPOINT, region: objectEnv.S3_REGION, forcePathStyle: true,
    credentials: { accessKeyId: objectEnv.S3_ACCESS_KEY_ID!, secretAccessKey: objectEnv.S3_SECRET_ACCESS_KEY! } })
  cleanup.register(() => rootClient.destroy())
  const preBucket = `oa-prerelease-test-${id}`, formalBucket = `oa-prerelease-formal-test-${id}`
  for (const bucket of [preBucket, formalBucket]) {
    await rootClient.send(new CreateBucketCommand({ Bucket: bucket }))
    cleanup.register(async () => {
      const listing = await rootClient.send(new ListObjectsV2Command({ Bucket: bucket }))
      if (listing.IsTruncated) throw new Error('Unexpected native fixture object count')
      for (const entry of listing.Contents ?? []) if (entry.Key) await rootClient.send(new DeleteObjectCommand({ Bucket: bucket, Key: entry.Key }))
      await rootClient.send(new DeleteBucketCommand({ Bucket: bucket }))
    })
  }
  const preObjects = S3ObjectStore.fromEnv({ ...objectEnv, S3_BUCKET: preBucket }, 'live/')
  const formalObjects = S3ObjectStore.fromEnv({ ...objectEnv, S3_BUCKET: formalBucket }, '')
  cleanup.register(() => preObjects.close())
  cleanup.register(() => formalObjects.close())
  const account = await scopedObjectAccount(objectEnv, preBucket, 'live/')
  cleanup.register(account.release)
  const appUrl = new URL(pre.url); appUrl.username = appRole; appUrl.password = password
  const template: unknown = JSON.parse(await readFile('deploy/prerelease-target.example.json', 'utf8'))
  if (!template || typeof template !== 'object') throw new Error('Missing target template')
  const target = parsePrereleaseTarget({ ...template, directory: join(root, 'open-agricola-prerelease-main'),
    database: { name: preName, appRole, backupRole, host: appUrl.hostname, port: Number(appUrl.port || 5432) },
    validationDatabase: { name: `${preName}_validation`, role: `${preName}_validator`, host: appUrl.hostname, port: Number(appUrl.port || 5432) },
    objects: { bucket: preBucket, prefix: 'live/', appKeyId: account.env.S3_ACCESS_KEY_ID, backupKeyId: 'unused-test-backup-key', endpoint: objectEnv.S3_ENDPOINT },
    formal: { project: 'open-agricola', directory: join(root, 'formal'), appOrigin: 'https://formal.example.test', apiOrigin: 'https://formal-api.example.test',
      database: formalName, bucket: formalBucket, offsiteDirectory: join(root, 'formal-backups') } })
  const ledgerPath = join(root, 'current-ledger.json')
  await writeFile(ledgerPath, JSON.stringify({ version: 1, batches: [] }), { mode: 0o600 })
  const storageEnv = { ...account.env, RELEASE_CHANNEL: 'prerelease', DATABASE_URL: appUrl.toString(), DATABASE_SCHEMA: 'public',
    APPLICATIONS_STOPPED: '1', CURRENT_ERASURE_LEDGER: ledgerPath, PRERELEASE_SOURCE_BUILD_ID: 'a'.repeat(40), PRERELEASE_OPERATION_ID: randomUUID() }
  expect(await operatePrereleaseStorage(target, 'inspect', storageEnv)).toMatchObject({ formalDatabaseDenied: true, formalBucketDenied: true })

  await formal.db.prepare(`INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES ('same-formal-id','formal_farmer','Formal sentinel','private-hash',1)`).run()
  await formal.db.prepare(`INSERT INTO sessions(token,user_id,created_at,expires_at,auth_policy_version) VALUES ('formal-source','same-formal-id',1,?,2)`).run(Date.now() + 86_400_000)
  await formal.db.prepare(`INSERT INTO beta_access(user_id,granted_at) VALUES ('same-formal-id',1)`).run()
  await formalObjects.putImmutable('sentinel', Buffer.from('formal bucket sentinel'), 'text/plain')
  const lifecycle = new PrereleaseIdentityLifecycle(formal.db)
  const generation1 = randomUUID(), generation2 = randomUUID(), buildId = 'a'.repeat(40)
  let service: sessions.PrereleaseSessions
  const server = createServer((req, res) => { void prereleaseRequestAdmission(req).then(admission => {
    res.writeHead(admission.ok ? 200 : admission.status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(admission))
  }) })
  const wss = new WebSocketServer({ noServer: true })
  cleanup.register(async () => { for (const ws of wss.clients) ws.terminate(); await new Promise<void>(resolve => wss.close(() => resolve())) })
  server.on('upgrade', (req, socket, head) => { void prereleaseRequestAdmission(req, true).then(admission => {
    if (!admission.ok) { socket.end(`HTTP/1.1 ${admission.status} Rejected\r\nConnection: close\r\n\r\n`); return }
    wss.handleUpgrade(req, socket, head, ws => {
      trackPrereleaseSocket(ws, req)
      ws.on('message', () => { void prereleaseCommandAllowed(ws).then(allowed => { if (allowed) ws.send('accepted') }) })
    })
  }) })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  cleanup.register(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing native HTTP port')
  const origin = `https://127.0.0.1:${address.port}`, base = `http://127.0.0.1:${address.port}`
  target.origin = origin
  const authorityTarget = { sourceOrigin: target.formal.appOrigin, targetOrigin: origin, entryEnabled: true, serviceKey: randomBytes(32).toString('hex') }
  const formalWorker = new Worker(new URL('./fixtures/prerelease-formal-http-worker.mjs', import.meta.url), {
    workerData: { connectionString: formal.url.toString() }, env: { ...process.env, RELEASE_CHANNEL: 'stable', NODE_ENV: 'production',
      PUBLIC_APP_ORIGIN: target.formal.appOrigin, PUBLIC_API_BASE: target.formal.apiOrigin, PRERELEASE_APP_ORIGIN: origin,
      PRERELEASE_ENTRY_ENABLED: 'true', PRERELEASE_IDENTITY_SERVICE_KEY: authorityTarget.serviceKey },
  })
  cleanup.register(async () => { await formalWorker.terminate() })
  const formalBase = await new Promise<string>((resolve, reject) => {
    formalWorker.once('error', reject)
    formalWorker.once('message', (message: unknown) => {
      if (message && typeof message === 'object' && 'base' in message && typeof message.base === 'string') resolve(message.base)
      else reject(new Error('Formal HTTP worker did not start'))
    })
  })
  const formalFetch: typeof fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.origin !== target.formal.apiOrigin) throw new Error('Unexpected formal protocol destination')
    const headers = new Headers(init?.headers); headers.set('host', new URL(target.formal.apiOrigin).host)
    return fetch(formalBase + url.pathname, { ...init, headers })
  }
  const owner = async (generationId: string, previous: string | null) => {
    await lifecycle.apply({ action: 'prepare', generationId, operationId: randomUUID(), targetOrigin: origin, targetId: target.targetId, expectedPreviousGenerationId: previous }, origin)
    const auditOperationId = randomUUID()
    await lifecycle.apply({ action: 'audit-complete', generationId, operationId: auditOperationId, targetOrigin: origin,
      identityManifestSha256: createHash('sha256').update('[]').digest('hex'), identityCount: 0, verificationReceiptSha256: 'b'.repeat(64) }, origin)
    await lifecycle.apply({ action: 'activate', generationId, operationId: randomUUID(), targetOrigin: origin, auditOperationId }, origin)
  }
  const consumer = (generationId: string) => {
    for (const [key, value] of Object.entries({ RELEASE_CHANNEL: 'prerelease', GAME_BUILD_ID: buildId, PUBLIC_APP_ORIGIN: origin, PUBLIC_API_BASE: origin,
      FORMAL_APP_ORIGIN: target.formal.appOrigin, FORMAL_API_BASE: target.formal.apiOrigin, PRERELEASE_DATA_GENERATION: generationId,
      PRERELEASE_TARGET_ID: target.targetId, PRERELEASE_IDENTITY_SERVICE_KEY: authorityTarget.serviceKey })) vi.stubEnv(key, value)
    const runtime = { appOrigin: origin, formalAppOrigin: target.formal.appOrigin, formalApiBase: target.formal.apiOrigin, generationId, buildId, targetId: target.targetId }
    const next = new sessions.PrereleaseSessions({ db: pre.db, runtime,
      authority: new FormalPrereleaseIdentityClient(runtime, authorityTarget.serviceKey, formalFetch) })
    cleanup.register(() => next.close())
    return next
  }
  const enter = async () => {
    const start = await service.beginHandoff(), fragment = new URLSearchParams(new URL(start.formalUrl).hash.slice(1))
    const state = fragment.get('state'), browserChallenge = fragment.get('browserChallenge')
    if (!state || !browserChallenge) throw new Error('Missing browser binding')
    const issue = once(formalWorker, 'message')
    formalWorker.postMessage({ kind: 'issue', token: 'formal-source', input: { browserChallenge, returnTo: `${target.formal.appOrigin}/` } })
    const [issued]: unknown[] = await issue
    if (!issued || typeof issued !== 'object' || !('code' in issued) || typeof issued.code !== 'string') throw new Error('Missing formal handoff')
    return service.exchangeHandoff(start.cookie, { protocolVersion: 1, code: issued.code, state, browserChallenge, returnTo: `${target.formal.appOrigin}/` })
  }
  const headers = (generationId: string, token: string) => ({ origin, [BROWSER_AUTH_HEADER]: String(BROWSER_AUTH_VERSION),
    'x-oa-pre-build': buildId, 'x-oa-pre-generation': generationId, cookie: `__Host-oa-pre-session=${token}` })
  await owner(generation1, null)
  service = consumer(generation1)
  vi.spyOn(sessions, 'getPrereleaseSessions').mockImplementation(() => service)
  const first = await enter()
  expect((await fetch(base + '/api/game/state', { headers: headers(generation1, first.token) })).status).toBe(200)
  const protocols = (generation: string) => [BROWSER_WS_PROTOCOL, PRERELEASE_BUILD_PROTOCOL_PREFIX + buildId, PRERELEASE_GENERATION_PROTOCOL_PREFIX + generation]
  const ws = new WebSocket(base.replace('http:', 'ws:'), protocols(generation1), { headers: { origin, cookie: `__Host-oa-pre-session=${first.token}` } })
  cleanup.register(() => ws.terminate())
  await once(ws, 'open')
  ws.send('command'); expect(String((await once(ws, 'message'))[0])).toBe('accepted')
  const directory = new RoomDirectory(pre.db)
  await directory.register('old-native-instance', base, buildId); await directory.activate('old-native-instance')
  const oldOwner = await directory.claim('old-native-room', 'old-native-instance')
  await pre.db.prepare("INSERT INTO rooms(id,status,state_json,created_at,updated_at) VALUES ('old-native-room','waiting',?,1,1)")
    .run(JSON.stringify({ confirmed: 'preserve during maintenance' }))
  await preObjects.putImmutable('private-archive', Buffer.from('old generation archive'), 'text/plain')
  const ledger = new ErasureLedger(preObjects)
  await ledger.append({ version: 1, entries: [{ version: 1, roomId: 'expired-before-reset', reason: 'removed',
    removedAt: Date.now(), assetHashes: [], eraseResult: true }], assetTakedowns: [] })
  const independentLedger = await preObjects.get('erasure/ledger.json')
  await writeFile(ledgerPath, JSON.stringify({ version: 1, batches: await ledger.read() }), { mode: 0o600 })
  await expect(operatePrereleaseStorage(target, 'reset', { ...storageEnv, PRERELEASE_OLD_GENERATION: generation1 })).rejects.toThrow('Stop every prerelease writer')
  await lifecycle.apply({ action: 'close', generationId: generation1, operationId: randomUUID(), targetOrigin: origin }, origin)
  const oldSocketClosed = once(ws, 'close')
  service.close()
  expect((await fetch(base + '/api/game/state', { headers: headers(generation1, first.token) })).status).not.toBe(200)
  expect(await pre.db.prepare("SELECT state_json FROM rooms WHERE id='old-native-room'").get())
    .toEqual({ state_json: JSON.stringify({ confirmed: 'preserve during maintenance' }) })
  expect((await preObjects.get('private-archive'))?.body.toString()).toBe('old generation archive')
  await pre.db.prepare("UPDATE app_instances SET status='stopped',lease_until=0").run()
  await pre.db.close()
  const purge = await operatePrereleaseStorage(target, 'reset', { ...storageEnv, PRERELEASE_OLD_GENERATION: generation1 })
  expect(purge).toMatchObject({ generationId: generation1, database: preName, bucket: preBucket, prefix: 'live/' })
  pre.db = new PostgresDatabase({ connectionString: pre.url.toString(), max: 2 })
  cleanup.register(() => pre.db.close())
  expect(await pre.db.prepare("SELECT tablename FROM pg_tables WHERE schemaname='public'").all()).toEqual([])
  expect(await preObjects.get('private-archive')).toBeNull()
  expect((await preObjects.get('erasure/ledger.json'))?.body).toEqual(independentLedger?.body)
  await lifecycle.apply({ action: 'retire', generationId: generation1, operationId: randomUUID(), targetOrigin: origin,
    purgeReceiptSha256: createHash('sha256').update(canonicalJson(purge)).digest('hex') }, origin)
  await migratePostgres(pre.db)
  await expect(new RoomDirectory(pre.db).assertOwner('old-native-room', oldOwner.owner)).rejects.toThrow()
  await expect(new RoomDirectory(pre.db).assertInstance('old-native-instance')).rejects.toThrow()
  await owner(generation2, generation1)
  service = consumer(generation2)
  await oldSocketClosed
  expect(await service.resolve(first.token)).toBeNull()
  expect((await fetch(base + '/api/game/state', { headers: headers(generation1, first.token) })).status).toBe(426)
  expect((await fetch(base + '/api/game/state', { headers: headers(generation2, first.token) })).status).not.toBe(200)
  const fresh = await enter()
  expect(fresh.user.id).toBe(first.user.id)
  expect((await fetch(base + '/api/game/state', { headers: headers(generation2, fresh.token) })).status).toBe(200)
  const denied = new WebSocket(base.replace('http:', 'ws:'), protocols(generation1), { headers: { origin, cookie: `__Host-oa-pre-session=${fresh.token}` } })
  cleanup.register(() => denied.terminate())
  const rejected = new Promise<number>((resolve, reject) => {
    denied.once('unexpected-response', (_req, res) => { res.resume(); denied.terminate(); resolve(res.statusCode ?? 0) })
    denied.once('open', () => reject(new Error('Old generation WebSocket was admitted')))
    denied.on('error', () => {})
  })
  expect(await rejected).toBe(426)
  expect(await pre.db.prepare('SELECT user_id,generation_id FROM prerelease_sessions').all()).toEqual([{ user_id: 'same-formal-id', generation_id: generation2 }])
  expect(await formal.db.prepare("SELECT display_name,password_hash FROM users WHERE id='same-formal-id'").get()).toEqual({ display_name: 'Formal sentinel', password_hash: 'private-hash' })
  expect((await formalObjects.get('sentinel'))?.body.toString()).toBe('formal bucket sentinel')
})
