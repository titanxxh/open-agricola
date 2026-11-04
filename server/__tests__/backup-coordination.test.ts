import { randomUUID } from 'node:crypto'
import { afterEach, expect, it, vi } from 'vitest'
import { createTestDatabase, getTestDatabaseUrl } from './_helpers/postgres'
import { testStorageEnvironment } from './_helpers/objects'
import { S3ObjectStore } from '../storage/s3-store'
import { ResourceStore } from '../storage/resource-store'
import { withResourceCapture } from '../storage/backup-coordination'
import { releaseAll } from './_helpers/release-all'

const releases: Array<() => unknown> = []
afterEach(async () => { vi.restoreAllMocks(); await releaseAll(releases.splice(0).reverse()) })

async function fixture() {
  const db = await createTestDatabase()
  releases.push(() => db.close())
  const objects = S3ObjectStore.fromEnv(testStorageEnvironment(), `test/${randomUUID()}/`)
  releases.push(() => objects.close(), () => objects.clearPrefix())
  let now = Date.now()
  const resources = new ResourceStore(db, objects, () => now)
  const { schema } = (await db.prepare('SELECT current_schema() AS schema').get<{ schema: string }>())!
  return { db, objects, resources, expire: () => { now += 2 * 86400000 },
    source: { connectionString: getTestDatabaseUrl(), schema, buildId: 'backup-test',
      deadlineEpochMs: Date.now() + 20_000, signal: new AbortController().signal } }
}

it('defers collection while uploads, commits and immediate logical takedowns continue', async () => {
  const { db, objects, resources, source, expire } = await fixture()
  const body = Buffer.from('snapshot artwork')
  const hash = await resources.stage('card-art/snapshot.png', body, 'image/png')
  expire()
  const entered = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>()
  const capture = withResourceCapture(source, async view => { entered.resolve(); await finish.promise; return view })
  releases.push(() => { finish.resolve(); return capture.catch(() => {}) })
  await entered.promise
  await resources.stage('card-art/new.png', Buffer.from('new upload'), 'image/png')
  expect(await resources.collect()).toBe(0)
  expect(await db.prepare("SELECT state FROM stored_objects WHERE object_key='card-art/snapshot.png'").get()).toEqual({ state: 'ready' })
  await resources.stage('card-art/snapshot.png', body, 'image/png')
  await db.prepare("INSERT INTO users(id,username,display_name,password_hash,created_at) VALUES ('online','online','Online','hash',1)").run()
  await resources.ledger.append({ version: 1, entries: [], assetTakedowns: [{ hash, reason: 'moderation', removedAt: Date.now() }] })
  await resources.blockHash(hash)
  expect(await resources.read('card-art/snapshot.png')).toBeNull()
  expect((await objects.get('card-art/snapshot.png'))?.body).toEqual(body)
  expect(await resources.collect()).toBe(0)
  finish.resolve()
  const view = await capture
  expect(view.resources.map(item => item.object_key)).toEqual(['card-art/snapshot.png'])
  expect(await resources.collect()).toBe(1)
  expect(await objects.get('card-art/snapshot.png')).toBeNull()
  expect((await resources.read('card-art/new.png'))?.body.toString()).toBe('new upload')
})

it('drains an already running physical deletion before taking the snapshot', async () => {
  const { db, objects, resources, source, expire } = await fixture()
  await resources.stage('card-art/old.png', Buffer.from('old'), 'image/png')
  expire()
  const deleting = Promise.withResolvers<void>(), finish = Promise.withResolvers<void>()
  const remove = objects.delete.bind(objects)
  vi.spyOn(objects, 'delete').mockImplementation(async key => { deleting.resolve(); await finish.promise; await remove(key) })
  const collection = resources.collect()
  releases.push(() => { finish.resolve(); return collection.catch(() => {}) })
  await deleting.promise
  let snapshotStarted = false
  const capture = withResourceCapture(source, async view => { snapshotStarted = true; return view })
  releases.push(() => { finish.resolve(); return capture.catch(() => {}) })
  await vi.waitFor(async () => {
    expect(await db.prepare("SELECT 1 FROM pg_stat_activity WHERE application_name=? AND wait_event_type='Lock'")
      .get(`agricola-capture-${source.schema}`)).toBeDefined()
  })
  expect(snapshotStarted).toBe(false)
  finish.resolve()
  expect(await collection).toBe(1)
  expect((await capture).resources).toEqual([])
})

it('releases protection on cancellation without needing the capture callback to finish', async () => {
  const { resources, source, expire } = await fixture()
  await resources.stage('card-art/cancelled.png', Buffer.from('cancelled'), 'image/png')
  expire()
  const controller = new AbortController(), entered = Promise.withResolvers<void>()
  const capture = withResourceCapture({ ...source, signal: controller.signal }, () => {
    entered.resolve(); return new Promise<never>(() => {})
  })
  releases.push(() => { controller.abort(new Error('test cleanup')); return capture.catch(() => {}) })
  const rejected = expect(capture).rejects.toThrow('cancel capture')
  await entered.promise
  controller.abort(new Error('cancel capture'))
  await rejected
  expect(await resources.collect()).toBe(1)
})

it('releases the real server lock when the transaction deadline expires without caller cleanup', async () => {
  const { resources, source, expire } = await fixture()
  await resources.stage('card-art/deadline.png', Buffer.from('deadline'), 'image/png')
  expire()
  const entered = Promise.withResolvers<void>()
  const capture = withResourceCapture({ ...source, deadlineEpochMs: Date.now() + 1000 }, () => {
    entered.resolve(); return new Promise<never>(() => {})
  })
  const rejected = expect(capture).rejects.toThrow(/transaction timeout|terminated|Connection terminated/i)
  await entered.promise
  expect(await resources.collect()).toBe(0)
  await rejected
  expect(await resources.collect()).toBe(1)
})
