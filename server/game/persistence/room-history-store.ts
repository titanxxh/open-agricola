import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { historyBranch, materializeHistoryBranch, registerRestoredHistoryNode, historyStreamKeys, type HistoryNode, type HistoryRecordIdentity, type HistoryStreamKind } from '../../../shared/session/history-streams'
import type { PersistedSessionSnapshot } from '../../../shared/session/serialization'
import type { GameState } from '../../../shared/contract/types'

type Reference = { kind: HistoryStreamKind; head: string | null; length: number; branch: string }
type StoredState = Record<string, unknown> & { historyStreams: Reference[] }
type StoredSnapshot = { roomHistoryVersion: 1; state: StoredState; frame: PersistedSessionSnapshot['frame']; sessionCursor: PersistedSessionSnapshot['sessionCursor'] }
type NodeRow = { node_id: string; kind: HistoryStreamKind; previous_id: string | null; length: number; record_json: string; identity_json: string; checksum: string }
export class RoomHistoryCorruptionError extends Error {}
const checksum = (row: Omit<NodeRow, 'checksum'>): string => createHash('sha256').update(JSON.stringify(row)).digest('hex')

export const ROOM_HISTORY_SCHEMA = `CREATE TABLE room_history_nodes (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL, kind TEXT NOT NULL, previous_id TEXT,
  length INTEGER NOT NULL, record_json TEXT NOT NULL, identity_json TEXT NOT NULL,
  checksum TEXT NOT NULL, PRIMARY KEY (room_id, node_id)
);`

/** Only successful outer Room transactions admit nodes into the write cache. */
export class RoomHistoryStore {
  private readonly insert
  private readonly select
  private readonly durable = new Map<string, Set<string>>()
  constructor(db: Pick<Database.Database, 'prepare'>) {
    this.insert = db.prepare(`INSERT INTO room_history_nodes (room_id, node_id, kind, previous_id, length, record_json, identity_json, checksum)
      VALUES (@roomId, @node_id, @kind, @previous_id, @length, @record_json, @identity_json, @checksum) ON CONFLICT(room_id, node_id) DO NOTHING`)
    this.select = db.prepare('SELECT node_id, kind, previous_id, length, record_json, identity_json, checksum FROM room_history_nodes WHERE room_id = ? AND node_id = ?')
  }
  prepare(roomId: string, snapshot: PersistedSessionSnapshot): { json: string; nodes: HistoryNode[] } {
    if (!('state' in snapshot)) return { json: JSON.stringify(snapshot), nodes: [] }
    const nodes: HistoryNode[] = []
    const known = this.durable.get(roomId) ?? new Set<string>()
    const pending = new Set<string>()
    const references: Reference[] = []
    for (const kind of historyStreamKeys) {
      const values = snapshot.state[kind]
      if (!Array.isArray(values)) continue
      const branch = historyBranch(values, kind, snapshot.state)
      references.push({ kind, head: branch.head?.id ?? null, length: branch.length, branch: `${kind}:${branch.head?.id ?? 'empty'}` })
      const chain: HistoryNode[] = []
      for (let node = branch.head; node && !known.has(node.id) && !pending.has(node.id); node = node.previous) {
        chain.push(node)
        pending.add(node.id)
      }
      nodes.push(...chain.reverse())
    }
    const { log: _log, events: _events, publicEventArchive: _archive, ...body } = snapshot.state
    const stored: StoredSnapshot = { roomHistoryVersion: 1, state: { ...body, historyStreams: references }, frame: snapshot.frame, sessionCursor: snapshot.sessionCursor }
    return { json: JSON.stringify(stored), nodes }
  }
  write(roomId: string, nodes: HistoryNode[]): void {
    for (const node of nodes) {
      const row = { node_id: node.id, kind: node.kind, previous_id: node.previous?.id ?? null, length: node.length, record_json: JSON.stringify(node.value), identity_json: JSON.stringify(node.identity) }
      this.insert.run({ roomId, ...row, checksum: checksum(row) })
    }
  }
  accept(roomId: string, nodes: HistoryNode[]): void {
    const known = this.durable.get(roomId) ?? new Set<string>()
    nodes.forEach(node => known.add(node.id))
    this.durable.set(roomId, known)
  }
  forget(roomId: string): void { this.durable.delete(roomId) }
  restore(roomId: string, json: string): PersistedSessionSnapshot {
    const stored = JSON.parse(json) as StoredSnapshot | PersistedSessionSnapshot
    if (!('roomHistoryVersion' in stored)) return stored
    if (stored.roomHistoryVersion !== 1) throw new RoomHistoryCorruptionError(`Unsupported Room history for ${roomId}`)
    const cache = new Map<string, HistoryNode>()
    const state = { ...stored.state } as unknown as GameState & { historyStreams?: Reference[] }
    const references = stored.state.historyStreams
    if (!Array.isArray(references)) throw new RoomHistoryCorruptionError(`Missing Room history references for ${roomId}`)
    for (const reference of references) {
      if (!historyStreamKeys.includes(reference.kind) || reference.branch !== `${reference.kind}:${reference.head ?? 'empty'}` || !Number.isSafeInteger(reference.length) || reference.length < 0) throw new RoomHistoryCorruptionError(`Invalid Room history branch for ${roomId}`)
      let node = reference.head ? cache.get(reference.head) : undefined
      if (reference.head && !node) {
        const chain: NodeRow[] = []
        const seen = new Set<string>()
        let id: string | null = reference.head
        while (id && !cache.has(id)) {
          if (seen.has(id)) throw new RoomHistoryCorruptionError(`Cyclic Room history for ${roomId}`)
          seen.add(id)
          const row = this.select.get(roomId, id) as NodeRow | undefined
          if (!row) throw new RoomHistoryCorruptionError(`Missing Room history ${roomId}/${id}`)
          const { checksum: saved, ...body } = row
          if (row.kind !== reference.kind || checksum(body) !== saved) throw new RoomHistoryCorruptionError(`Corrupt Room history ${roomId}/${id}`)
          chain.push(row)
          id = row.previous_id
        }
        let previous = id ? cache.get(id)! : null
        for (const row of chain.reverse()) {
          if (row.length !== (previous?.length ?? 0) + 1) throw new RoomHistoryCorruptionError(`Mismatched Room history length for ${roomId}`)
          const restored: HistoryNode = { id: row.node_id, kind: row.kind, previous, length: row.length, value: JSON.parse(row.record_json) as object, identity: JSON.parse(row.identity_json) as HistoryRecordIdentity }
          registerRestoredHistoryNode(restored)
          cache.set(restored.id, restored)
          previous = restored
        }
        node = cache.get(reference.head)
      }
      if ((node?.length ?? 0) !== reference.length) throw new RoomHistoryCorruptionError(`Mismatched Room history reference for ${roomId}`)
      state[reference.kind] = materializeHistoryBranch({ kind: reference.kind, head: node ?? null, length: reference.length }) as never
    }
    delete state.historyStreams
    this.accept(roomId, [...cache.values()])
    return { state: state as PersistedSessionSnapshot['state'], frame: stored.frame, sessionCursor: stored.sessionCursor }
  }
}
