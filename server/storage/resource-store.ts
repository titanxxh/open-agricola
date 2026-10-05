import { ErasureLedger } from './erasure-ledger'
import { randomUUID } from 'node:crypto'
import type { PostgresDatabase } from '../database/postgres'
import { ObjectConflictError, objectHash, S3ObjectStore, type StoredObject } from './s3-store'

export class ResourceIntegrityError extends Error {}

type ObjectRow = { object_key: string; content_hash: string; state: string; blocked: boolean; content_type: string }
const UPLOAD_RETENTION_MS = 24 * 60 * 60 * 1000
const GC_CLAIM_MS = 5 * 60 * 1000

/** Durable upload, reference and cleanup coordination shared by every instance. */
export class ResourceStore {
  readonly db: PostgresDatabase
  readonly objects: S3ObjectStore
  private readonly reads = new Map<string, Promise<StoredObject | null>>()
  readonly ledger: ErasureLedger
  private readonly now: () => number

  constructor(db: PostgresDatabase, objects: S3ObjectStore, now = Date.now) {
    this.db = db; this.objects = objects; this.now = now; this.ledger = new ErasureLedger(objects)
  }

  async stage(key: string, body: Buffer, contentType: string): Promise<string> {
    if (!/^(card-art|replay-assets|replay-viewers)\/[A-Za-z0-9._/-]+$/.test(key) || key.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Invalid resource key')
    const hash = objectHash(body)
    if (await this.ledger.isHashRemoved(hash)) throw new Error('Resource has been removed')
    // Commit the staging record before creating any object. Failed uploads and
    // abandoned preparations remain visible to another collector.
    await this.db.prepare(`INSERT INTO stored_objects(object_key, content_hash, content_type, size_bytes, state, retain_until, updated_at)
      VALUES (?, ?, ?, ?, 'staging', ?, ?) ON CONFLICT (object_key) DO NOTHING`).run(key, hash, contentType, body.length, this.now() + UPLOAD_RETENTION_MS, this.now())
    await this.db.transaction(async () => {
      const row = await this.db.prepare('SELECT * FROM stored_objects WHERE object_key = ? FOR UPDATE').get(key) as ObjectRow
      if (row.content_hash !== hash) throw new ObjectConflictError(`Resource identity conflict: ${key}`)
      if (row.blocked || row.state === 'removed' || row.state === 'deleting') throw new Error('Resource is unavailable')
      await this.objects.putImmutable(key, body, contentType)
      await this.db.prepare(`UPDATE stored_objects SET state = 'ready', retain_until = ?, updated_at = ? WHERE object_key = ?`).run(this.now() + UPLOAD_RETENTION_MS, this.now(), key)
    })()
    return hash
  }

  read(key: string): Promise<StoredObject | null> {
    let pending = this.reads.get(key)
    if (!pending) {
      pending = this.readVerified(key).finally(() => this.reads.delete(key))
      this.reads.set(key, pending)
    }
    return pending
  }

  private async readVerified(key: string): Promise<StoredObject | null> {
    const row = await this.db.prepare("SELECT * FROM stored_objects WHERE object_key = ? AND state = 'ready' AND NOT blocked").get(key) as ObjectRow | undefined
    if (!row || await this.ledger.isHashRemoved(row.content_hash)) return null
    const object = await this.objects.get(key)
    if (!object) return null
    if (objectHash(object.body) !== row.content_hash) throw new ResourceIntegrityError('Resource failed its integrity check')
    // Recheck after the network read: a concurrent takedown wins over the data.
    const ready = await this.db.prepare("SELECT 1 FROM stored_objects WHERE object_key = ? AND state = 'ready' AND NOT blocked").get(key)
    return ready && !await this.ledger.isHashRemoved(row.content_hash) ? { ...object, contentType: row.content_type } : null
  }

  async reference(kind: string, id: string, keys: string[]): Promise<void> {
    await this.db.transaction(async () => {
      for (const key of [...new Set(keys)].sort()) {
        await this.db.prepare(`INSERT INTO object_references(owner_kind, owner_id, object_key) VALUES (?, ?, ?)
          ON CONFLICT DO NOTHING`).run(kind, id, key)
      }
    })()
  }

  async release(kind: string, id: string): Promise<void> {
    await this.db.prepare('DELETE FROM object_references WHERE owner_kind = ? AND owner_id = ?').run(kind, id)
  }

  /** The caller persists its independent erasure ledger before establishing this barrier. */
  async blockHash(hash: string): Promise<void> {
    await this.db.prepare("UPDATE stored_objects SET state = 'removed', blocked = TRUE, claim_token = NULL, claim_until = NULL, updated_at = ? WHERE content_hash = ?").run(this.now(), hash)
  }

  async removeUnreferenced(keys: string[]): Promise<string[]> {
    const rows = await this.db.prepare("SELECT object_key FROM stored_objects WHERE object_key = ANY(?::text[]) AND state != 'deleted'").all(keys) as { object_key: string }[]
    await this.db.prepare('UPDATE stored_objects SET retain_until = ? WHERE object_key = ANY(?::text[])').run(this.now(), keys)
    await this.collect(keys.length, keys)
    const remaining = await this.db.prepare("SELECT object_key FROM stored_objects WHERE object_key = ANY(?::text[]) AND state != 'deleted'").all(keys) as { object_key: string }[]
    const kept = new Set(remaining.map(row => row.object_key))
    return rows.filter(row => !kept.has(row.object_key)).map(row => row.object_key)
  }

  async collect(limit = 20, keys: string[] | null = null): Promise<number> {
    let deleted = 0
    for (let index = 0; index < limit; index++) {
      const token = randomUUID()
      const row = await this.db.transaction(async () => {
        const candidate = await this.db.prepare(`SELECT o.object_key FROM stored_objects o
          WHERE (?::text[] IS NULL OR o.object_key = ANY(?::text[])) AND ((state IN ('staging', 'ready') AND retain_until <= ? AND NOT EXISTS (
            SELECT 1 FROM object_references r WHERE r.object_key = o.object_key))
            OR (state = 'deleting' AND claim_until <= ?) OR state = 'removed')
          ORDER BY updated_at LIMIT 1 FOR UPDATE SKIP LOCKED`).get(keys, keys, this.now(), this.now()) as { object_key: string } | undefined
        if (!candidate) return null
        await this.db.prepare("UPDATE stored_objects SET state = 'deleting', claim_token = ?, claim_until = ? WHERE object_key = ?").run(token, this.now() + GC_CLAIM_MS, candidate.object_key)
        return candidate
      })()
      if (!row) break
      await this.db.transaction(async () => {
        const claimed = await this.db.prepare("SELECT 1 FROM stored_objects WHERE object_key = ? AND state = 'deleting' AND claim_token = ? FOR UPDATE").get(row.object_key, token)
        if (!claimed) return
        await this.objects.delete(row.object_key)
        await this.db.prepare("UPDATE stored_objects SET state = 'deleted', claim_token = NULL, claim_until = NULL, updated_at = ? WHERE object_key = ?").run(this.now(), row.object_key)
        deleted++
      })()
    }
    return deleted
  }
}
