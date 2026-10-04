import { createHash, randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { historyBranch, materializeHistoryBranch, registerRestoredHistoryNode, historyStreamKeys, type HistoryNode, type HistoryRecordIdentity, type HistoryStreamKind } from '../../../shared/session/history-streams'
import type { PersistedSessionSnapshot } from '../../../shared/session/serialization'
import type { HistoryEntry, SessionPrivateCursor } from '../../../shared/session/session-core'
import type { GameState } from '../../../shared/contract/types'

type Reference = { kind: HistoryStreamKind; head: string | null; length: number; branch: string }
type StoredState = Record<string, unknown> & { historyStreams: Reference[] }
type StoredCursor = Omit<SessionPrivateCursor, 'history'> & { undoHistory?: string[] }
type StoredSnapshot = { roomHistoryVersion: 1; state: StoredState; frame: PersistedSessionSnapshot['frame']; sessionCursor: StoredCursor }
type NodeRow = { node_id: string; kind: HistoryStreamKind; previous_id: string | null; length: number; record_json: string; identity_json: string; checksum: string }
export type RecoveryNode = { id: string; kind: 'undo'; json: string }
export type PackedRoomSnapshot = { json: string; nodes: HistoryNode[]; recoveryNodes: RecoveryNode[] }
export class RoomHistoryCorruptionError extends Error {}
const checksum = (row: object): string => createHash('sha256').update(JSON.stringify(row)).digest('hex')
const recoveryIds = new WeakMap<object, string>()

export const ROOM_HISTORY_SCHEMA = `CREATE TABLE room_history_nodes (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL, kind TEXT NOT NULL, previous_id TEXT,
  length INTEGER NOT NULL, record_json TEXT NOT NULL, identity_json TEXT NOT NULL,
  checksum TEXT NOT NULL, PRIMARY KEY (room_id, node_id)
);`
export const ROOM_RECOVERY_SCHEMA = `CREATE TABLE room_recovery_nodes (
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL, kind TEXT NOT NULL, body_json TEXT NOT NULL,
  checksum TEXT NOT NULL, PRIMARY KEY (room_id, node_id)
);`

/** Only successful outer Room transactions admit records into the write cache. */
export class RoomHistoryStore {
  private readonly insert
  private readonly select
  private readonly insertRecovery
  private readonly selectRecovery
  private readonly durable = new Map<string, Set<string>>()
  constructor(db: Pick<Database.Database, 'prepare'>) {
    this.insert = db.prepare(`INSERT INTO room_history_nodes (room_id, node_id, kind, previous_id, length, record_json, identity_json, checksum)
      VALUES (@roomId, @node_id, @kind, @previous_id, @length, @record_json, @identity_json, @checksum) ON CONFLICT(room_id, node_id) DO NOTHING`)
    this.select = db.prepare('SELECT node_id, kind, previous_id, length, record_json, identity_json, checksum FROM room_history_nodes WHERE room_id = ? AND node_id = ?')
    this.insertRecovery = db.prepare(`INSERT INTO room_recovery_nodes (room_id, node_id, kind, body_json, checksum)
      VALUES (@roomId, @node_id, @kind, @body_json, @checksum) ON CONFLICT(room_id, node_id) DO NOTHING`)
    this.selectRecovery = db.prepare('SELECT kind, body_json, checksum FROM room_recovery_nodes WHERE room_id = ? AND node_id = ?')
  }
  prepare(roomId: string, snapshot: PersistedSessionSnapshot): PackedRoomSnapshot {
    if (!('state' in snapshot)) return { json: JSON.stringify(snapshot), nodes: [], recoveryNodes: [] }
    const nodes: HistoryNode[] = []
    const recoveryNodes: RecoveryNode[] = []
    const known = this.durable.get(roomId) ?? new Set<string>()
    const pending = new Set<string>()
    const packState = (state: PersistedSessionSnapshot['state']): StoredState => {
      const references: Reference[] = []
      for (const kind of historyStreamKeys) {
        const values = state[kind]
        if (!Array.isArray(values)) continue
        const branch = historyBranch(values, kind, state)
        references.push({ kind, head: branch.head?.id ?? null, length: branch.length, branch: `${kind}:${branch.head?.id ?? 'empty'}` })
        const chain: HistoryNode[] = []
        for (let node = branch.head; node && !known.has(node.id) && !pending.has(node.id); node = node.previous) {
          chain.push(node)
          pending.add(node.id)
        }
        nodes.push(...chain.reverse())
      }
      const { log: _log, events: _events, publicEventArchive: _archive, ...body } = state
      return { ...body, historyStreams: references }
    }
    const packUndo = (entry: HistoryEntry): string => {
      let id = recoveryIds.get(entry)
      if (!id) { id = randomUUID(); recoveryIds.set(entry, id) }
      if (!known.has(id) && !pending.has(id)) {
        pending.add(id)
        recoveryNodes.push({ id, kind: 'undo', json: JSON.stringify({ ...entry, state: packState(entry.state) }) })
      }
      return id
    }
    const { history = [], ...runtime } = snapshot.sessionCursor
    const stored: StoredSnapshot = { roomHistoryVersion: 1, state: packState(snapshot.state), frame: snapshot.frame, sessionCursor: { ...runtime, ...('history' in snapshot.sessionCursor ? { undoHistory: history.map(packUndo) } : {}) } }
    return { json: JSON.stringify(stored), nodes, recoveryNodes }
  }
  write(roomId: string, nodes: HistoryNode[], recoveryNodes: RecoveryNode[] = []): void {
    for (const node of nodes) {
      const row = { node_id: node.id, kind: node.kind, previous_id: node.previous?.id ?? null, length: node.length, record_json: JSON.stringify(node.value), identity_json: JSON.stringify(node.identity) }
      this.insert.run({ roomId, ...row, checksum: checksum(row) })
    }
    for (const node of recoveryNodes) {
      const row = { node_id: node.id, kind: node.kind, body_json: node.json }
      this.insertRecovery.run({ roomId, ...row, checksum: checksum(row) })
    }
  }
  accept(roomId: string, nodes: HistoryNode[], recoveryNodes: RecoveryNode[] = []): void {
    const known = this.durable.get(roomId) ?? new Set<string>()
    nodes.forEach(node => known.add(node.id))
    recoveryNodes.forEach(node => known.add(node.id))
    this.durable.set(roomId, known)
  }
  forget(roomId: string): void { this.durable.delete(roomId) }
  restore(roomId: string, json: string): PersistedSessionSnapshot {
    const stored = JSON.parse(json) as StoredSnapshot | PersistedSessionSnapshot
    if (!('roomHistoryVersion' in stored)) return stored
    if (stored.roomHistoryVersion !== 1) throw new RoomHistoryCorruptionError(`Unsupported Room history for ${roomId}`)
    const cache = new Map<string, HistoryNode>()
    const restoredRecovery: RecoveryNode[] = []
    const restoreState = (body: StoredState): PersistedSessionSnapshot['state'] => {
      const state = { ...body } as unknown as GameState & { historyStreams?: Reference[] }
      if (!Array.isArray(body.historyStreams)) throw new RoomHistoryCorruptionError(`Missing Room history references for ${roomId}`)
      const kinds = new Set<HistoryStreamKind>()
      for (const reference of body.historyStreams) {
        if (kinds.has(reference.kind) || !historyStreamKeys.includes(reference.kind) || reference.branch !== `${reference.kind}:${reference.head ?? 'empty'}` || !Number.isSafeInteger(reference.length) || reference.length < 0) throw new RoomHistoryCorruptionError(`Invalid Room history branch for ${roomId}`)
        kinds.add(reference.kind)
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
            const { checksum: saved, ...raw } = row
            if (row.kind !== reference.kind || checksum(raw) !== saved) throw new RoomHistoryCorruptionError(`Corrupt Room history ${roomId}/${id}`)
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
        if ((node?.length ?? 0) !== reference.length || (node && node.kind !== reference.kind)) throw new RoomHistoryCorruptionError(`Mismatched Room history reference for ${roomId}`)
        state[reference.kind] = materializeHistoryBranch({ kind: reference.kind, head: node ?? null, length: reference.length }) as never
      }
      delete state.historyStreams
      return state as PersistedSessionSnapshot['state']
    }
    const restoreUndo = (id: string): HistoryEntry => {
      const row = this.selectRecovery.get(roomId, id) as { kind: string; body_json: string; checksum: string } | undefined
      if (!row || row.kind !== 'undo' || row.checksum !== checksum({ node_id: id, kind: row.kind, body_json: row.body_json })) throw new RoomHistoryCorruptionError(`Missing or corrupt Room undo ${roomId}/${id}`)
      const body = JSON.parse(row.body_json) as Omit<HistoryEntry, 'state'> & { state: StoredState }
      const entry = { ...body, state: restoreState(body.state) } as HistoryEntry
      recoveryIds.set(entry, id)
      restoredRecovery.push({ id, kind: 'undo', json: row.body_json })
      return entry
    }
    const { undoHistory, ...runtime } = stored.sessionCursor
    const snapshot = { state: restoreState(stored.state), frame: stored.frame, sessionCursor: { ...runtime, ...(undoHistory ? { history: undoHistory.map(restoreUndo) } : {}) } as SessionPrivateCursor }
    this.accept(roomId, [...cache.values()], restoredRecovery)
    return snapshot
  }
}
