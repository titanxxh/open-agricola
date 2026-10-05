import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { S3ObjectStore, ObjectConflictError } from '../storage/s3-store'
import { testStorageEnvironment } from './_helpers/objects'

const prefix = `test/${randomUUID()}/`
let objects: S3ObjectStore
beforeAll(() => { objects = S3ObjectStore.fromEnv(testStorageEnvironment(), prefix) })
afterAll(async () => { await objects.clearPrefix(); objects.close() })

describe('real S3 protocol', () => {
  it('creates immutable objects and verifies duplicate bytes across clients', async () => {
    const peer = S3ObjectStore.fromEnv(testStorageEnvironment(), prefix)
    try {
      await Promise.all([objects.putImmutable('art/image', Buffer.from('image'), 'image/png'), peer.putImmutable('art/image', Buffer.from('image'), 'image/png')])
      expect((await peer.get('art/image'))?.body.toString()).toBe('image')
      await expect(peer.putImmutable('art/image', Buffer.from('different'), 'image/png')).rejects.toBeInstanceOf(ObjectConflictError)
      expect((await objects.get('art/image'))?.body.toString()).toBe('image')
    } finally { peer.close() }
  })
  it('enforces conditional replacement and deletion without public bucket access', async () => {
    const initial = await objects.replace('ledger', Buffer.from('v1'), null)
    await expect(objects.replace('ledger', Buffer.from('wrong'), null)).rejects.toBeInstanceOf(ObjectConflictError)
    const updated = await objects.replace('ledger', Buffer.from('v2'), initial)
    expect(updated).not.toBe(initial)
    await expect(objects.replace('ledger', Buffer.from('stale'), initial)).rejects.toBeInstanceOf(ObjectConflictError)
    expect((await objects.get('ledger'))?.body.toString()).toBe('v2')
    const env = testStorageEnvironment()
    const response = await fetch(`${env.S3_ENDPOINT}/${env.S3_BUCKET}/${prefix}ledger`)
    expect(response.status).toBe(403)
    await objects.delete('ledger')
    expect(await objects.get('ledger')).toBeNull()
  })
})
