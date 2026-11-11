import { WorkshopSubmissionInProgressError } from './database/errors'
import { randomUUID } from 'node:crypto'
import type { PostgresDatabase } from './database/postgres'
import { ExecutionAccess } from './game/execution-access'
export type InvalidationOperation = { id: string; kind: 'card' | 'user'; subjectId: string; roomIds: string[]; cardIds: string[] }
export type InvalidationStatus = InvalidationOperation & { pending: boolean }
type Row = { id: string; kind: 'card' | 'user'; subject_id: string; room_ids: string; card_ids: string }
const decode = (row: Row): InvalidationOperation => ({ id: row.id, kind: row.kind, subjectId: row.subject_id, roomIds: JSON.parse(row.room_ids), cardIds: JSON.parse(row.card_ids) })

/** Durable fan-out: notifications may accelerate this, but cannot replace acks. */
export class InvalidationStore {
  readonly db: PostgresDatabase
  readonly access: ExecutionAccess
  constructor(db: PostgresDatabase) { this.db = db; this.access = new ExecutionAccess(db) }
  private async now(): Promise<number> { return (await this.db.prepare('SELECT (extract(epoch FROM clock_timestamp())*1000)::bigint AS now').get<{ now: number }>())!.now }

  async begin(kind: 'card' | 'user', subjectId: string, mutate: () => Promise<void>): Promise<InvalidationOperation> {
    return this.db.transaction(async () => {
      // Same ordering as authoritative writes: shared barrier, then owner rows,
      // then platform rows. No Room can reappear across the invalidation.
      await this.db.exec('SELECT pg_advisory_xact_lock(975)')
      const previous = await this.db.prepare('SELECT * FROM invalidation_operations WHERE kind=? AND subject_id=? ORDER BY created_at DESC LIMIT 1').get<Row>(kind, subjectId)
      if (previous && (await this.status(previous.id))?.pending) return decode(previous)
      const cards = kind === 'card' ? [subjectId] : (await this.db.prepare('SELECT id FROM workshop_cards WHERE author_id=?').all<{ id: string }>(subjectId)).map(row => row.id)
      if (await this.db.prepare(`SELECT 1 FROM workshop_submissions
        WHERE card_id=ANY(?::text[]) AND (state='pending' OR lease_owner IS NOT NULL
          OR (state='blocked' AND payload::jsonb @> '{"createAttempted":true}'
            AND COALESCE(payload::jsonb->'pr','null'::jsonb) = 'null'::jsonb)) LIMIT 1`).get(cards)) {
        throw new WorkshopSubmissionInProgressError()
      }
      const rooms = await this.db.prepare(`SELECT r.id FROM rooms r WHERE
        (?!='card' AND (r.created_by=? OR EXISTS(SELECT 1 FROM room_players p WHERE p.room_id=r.id AND p.user_id=?)))
        OR EXISTS(SELECT 1 FROM json_array_elements_text(r.custom_card_ids::json) c(value) WHERE c.value=ANY(?::text[])) ORDER BY r.id`).all<{ id: string }>(kind, subjectId, subjectId, cards)
      const roomIds = rooms.map(room => room.id)
      await this.db.prepare('SELECT room_id FROM room_ownership WHERE room_id=ANY(?::text[]) ORDER BY room_id FOR UPDATE').all(roomIds)
      const subjects = [...cards.map(id => ({ kind: 'card', id })), ...(kind === 'user' ? [{ kind: 'user', id: subjectId }] : [])]
      for (const subject of subjects) await this.db.prepare(`INSERT INTO execution_epochs(kind, subject_id, epoch) VALUES (?, ?, 1)
        ON CONFLICT(kind, subject_id) DO UPDATE SET epoch=execution_epochs.epoch+1`).run(subject.kind, subject.id)
      await this.db.prepare("UPDATE room_ownership SET status='retired', lease_until=0 WHERE room_id=ANY(?::text[])").run(roomIds)
      await mutate()
      await this.db.prepare('DELETE FROM rooms WHERE id=ANY(?::text[])').run(roomIds)
      if (kind === 'user') await this.db.prepare('UPDATE workshop_cards SET live=0 WHERE id=ANY(?::text[])').run(cards)
      const id = randomUUID(), now = await this.now()
      await this.db.prepare('INSERT INTO invalidation_operations(id,kind,subject_id,room_ids,card_ids,created_at) VALUES (?,?,?,?,?,?)').run(id, kind, subjectId, JSON.stringify(roomIds), JSON.stringify(cards), now)
      await this.db.prepare(`INSERT INTO invalidation_tasks(operation_id,instance_id) SELECT ?,instance_id FROM app_instances WHERE status IN ('starting','ready') AND lease_until>?`).run(id, now)
      return { id, kind, subjectId, roomIds, cardIds: cards }
    })()
  }

  async status(id: string): Promise<InvalidationStatus | null> {
    const operation = await this.db.prepare('SELECT * FROM invalidation_operations WHERE id=?').get<Row>(id)
    if (!operation) return null
    const pending = !!await this.db.prepare(`SELECT 1 FROM invalidation_tasks t JOIN app_instances i USING(instance_id)
      WHERE t.operation_id=? AND t.completed_at IS NULL AND i.lease_until>? AND i.status!='stopped' LIMIT 1`).get(id, await this.now())
    return { ...decode(operation), pending }
  }

  async latest(kind: 'card' | 'user', subjectId: string): Promise<InvalidationStatus | null> {
    const row = await this.db.prepare('SELECT id FROM invalidation_operations WHERE kind=? AND subject_id=? ORDER BY created_at DESC LIMIT 1').get<{ id: string }>(kind, subjectId)
    return row ? this.status(row.id) : null
  }

  async drain(instanceId: string, execute: (operation: InvalidationOperation) => Promise<void>): Promise<void> {
    for (let count = 0; count < 20; count++) {
      const token = randomUUID()
      const claimed = await this.db.transaction(async () => {
        const now = await this.now()
        const row = await this.db.prepare(`SELECT o.* FROM invalidation_tasks t JOIN invalidation_operations o ON o.id=t.operation_id
          WHERE t.instance_id=? AND t.completed_at IS NULL AND (t.claim_until IS NULL OR t.claim_until<=?)
          ORDER BY o.created_at FOR UPDATE OF t SKIP LOCKED LIMIT 1`).get<Row>(instanceId, now)
        if (!row) return null
        await this.db.prepare('UPDATE invalidation_tasks SET claim_token=?, claim_until=? WHERE operation_id=? AND instance_id=?').run(token, now + 30000, row.id, instanceId)
        return decode(row)
      })()
      if (!claimed) return
      try {
        await execute(claimed)
        await this.db.prepare('UPDATE invalidation_tasks SET completed_at=?, claim_until=NULL WHERE operation_id=? AND instance_id=? AND claim_token=?').run(await this.now(), claimed.id, instanceId, token)
      } catch (error) {
        await this.db.prepare('UPDATE invalidation_tasks SET claim_token=NULL, claim_until=NULL WHERE operation_id=? AND instance_id=? AND claim_token=?').run(claimed.id, instanceId, token)
        throw error
      }
    }
  }
}
