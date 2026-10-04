import { applyReplayDelta, createReplayDelta, frameHash, type JsonValue, type ReplayDeltaOperation } from '../replay-codec'
import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { historyBranch, materializeHistoryBranch, recoveryRecordId, registerRecoveryRecordId, registerRestoredHistoryNode, historyStreamKeys, type HistoryNode, type HistoryRecordIdentity, type HistoryStreamKind } from '../../../shared/session/history-streams'
import type { PersistedSessionSnapshot } from '../../../shared/session/serialization'
import type { HistoryEntry, SessionPrivateCursor, SessionCommandCheckpoint } from '../../../shared/session/session-core'
import type { GameState } from '../../../shared/contract/types'
import { encodeRoomBody, parseRoomBody } from './room-body-codec'

type Reference = { kind: HistoryStreamKind; head: string | null; length: number; branch: string }
type StoredState = Record<string, unknown> & { historyStreams: Reference[] }
type StoredCursor = Omit<SessionPrivateCursor, 'history' | 'provisionalContinuationScopes'> & { undoHistory?: string[]; provisionalContinuationScopes?: Array<Omit<SessionPrivateCursor['provisionalContinuationScopes'][number], 'checkpoint'> & { checkpointRef: string }> }
type StoredSnapshot = { state: StoredState; rawFrameHash: string; sessionCursor: StoredCursor } & (
  | { roomHistoryVersion: 1; frameWithoutStreams: StoredState }
  | { roomHistoryVersion: 2; frameDelta: ReplayDeltaOperation[] }
)
type NodeRow = { node_id: string; kind: HistoryStreamKind; previous_id: string | null; length: number; record_json: string; identity_json: string; checksum: string }
export type RecoveryNode = { id: string; kind: 'undo' | 'checkpoint'; json: string }
export type PackedRoomSnapshot = { json: string; nodes: HistoryNode[]; recoveryNodes: RecoveryNode[] }
export class RoomHistoryCorruptionError extends Error {}
const checksum = (row: object): string => createHash('sha256').update(JSON.stringify(row)).digest('hex')

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
  prepare(roomId: string, snapshot: PersistedSessionSnapshot, expectedFrameHash?: string): PackedRoomSnapshot {
    if (!('state' in snapshot)) return { json: JSON.stringify(snapshot), nodes: [], recoveryNodes: [] }
    const nodes: HistoryNode[] = []
    const recoveryNodes: RecoveryNode[] = []
    const known = this.durable.get(roomId) ?? new Set<string>()
    const pending = new Set<string>()
    const packState = (state: Pick<GameState, 'log' | 'events' | 'publicEventArchive' | 'players'>): StoredState => {
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
      const id = recoveryRecordId(entry)
      if (!known.has(id) && !pending.has(id)) {
        pending.add(id)
        recoveryNodes.push({ id, kind: 'undo', json: encodeRoomBody(JSON.stringify({ ...entry, state: packState(entry.state) })) })
      }
      return id
    }
    const packCheckpoint = (checkpoint: SessionCommandCheckpoint): string => {
      const id = recoveryRecordId(checkpoint)
      if (!known.has(id) && !pending.has(id)) {
        pending.add(id)
        const { state, history, ...body } = checkpoint
        recoveryNodes.push({ id, kind: 'checkpoint', json: encodeRoomBody(JSON.stringify({ ...body, state: packState(state), undoHistory: history.map(packUndo) })) })
      }
      return id
    }
    const { history = [], provisionalContinuationScopes, ...runtime } = snapshot.sessionCursor
    const state = packState(snapshot.state)
    const frame = packState(snapshot.frame)
    // Both views retain their exact history references. Shared captured core values
    // stop delta traversal at Object.is; only the Frame's differences are repeated.
    const frameDelta = createReplayDelta(state as JsonValue, frame as JsonValue)
    const stored: StoredSnapshot = { roomHistoryVersion: 2, state, frameDelta, rawFrameHash: expectedFrameHash ?? frameHash(snapshot.frame as unknown as JsonValue), sessionCursor: {
      ...runtime,
      ...('history' in snapshot.sessionCursor ? { undoHistory: history.map(packUndo) } : {}),
      ...(provisionalContinuationScopes ? { provisionalContinuationScopes: provisionalContinuationScopes.map(({ checkpoint, ...scope }) => ({ ...scope, checkpointRef: packCheckpoint(checkpoint) })) } : {}),
    } }

    const lastFrame = snapshot.sessionCursor.engineStackCursor?.frames.at(-1)
    // The lobby reads only these turn fields directly with SQLite json_extract.
    // Recovery always uses the complete encoded body, never this query projection.
    const queryFields = {
      state: {
        phase: snapshot.state.phase,
        gameOver: snapshot.state.gameOver,
        currentPlayerIndex: snapshot.state.currentPlayerIndex,
      },
      sessionCursor: {
        engineStackCursor: {
          frames: lastFrame ? [{ ownerPlayerIndex: lastFrame.ownerPlayerIndex }] : [],
        },
      },
    }
    return { json: encodeRoomBody(JSON.stringify(stored), queryFields), nodes, recoveryNodes }
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
    try { return this.restoreRecords(roomId, json) } catch (error) {
      if (error instanceof RoomHistoryCorruptionError) throw error
      throw new RoomHistoryCorruptionError(`Invalid Room recovery for ${roomId}`, { cause: error })
    }
  }
  private restoreRecords(roomId: string, json: string): PersistedSessionSnapshot {
    const stored = parseRoomBody(json) as StoredSnapshot | PersistedSessionSnapshot
    if (!('roomHistoryVersion' in stored)) return stored
    if (stored.roomHistoryVersion !== 1 && stored.roomHistoryVersion !== 2) throw new RoomHistoryCorruptionError(`Unsupported Room history for ${roomId}`)
    const cache = new Map<string, HistoryNode>()
    const restoredRecovery: RecoveryNode[] = []
    const restoreState = (body: StoredState): PersistedSessionSnapshot['state'] => {
      const state = { ...body } as unknown as GameState & { historyStreams?: Reference[] }
      if (!Array.isArray(body.historyStreams)) throw new RoomHistoryCorruptionError(`Missing Room history references for ${roomId}`)
      if (Array.isArray(body.players) && body.players.length > 0 && body.historyStreams.length !== 3) throw new RoomHistoryCorruptionError(`Incomplete Room history for ${roomId}`)
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
            if ((previous && previous.kind !== row.kind) || row.length !== (previous?.length ?? 0) + 1) throw new RoomHistoryCorruptionError(`Mismatched Room history length for ${roomId}`)
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
    const undoCache = new Map<string, HistoryEntry>()
    const restoreUndo = (id: string): HistoryEntry => {
      const cached = undoCache.get(id)
      if (cached) return cached
      const row = this.selectRecovery.get(roomId, id) as { kind: string; body_json: string; checksum: string } | undefined
      if (!row || row.kind !== 'undo' || row.checksum !== checksum({ node_id: id, kind: row.kind, body_json: row.body_json })) throw new RoomHistoryCorruptionError(`Missing or corrupt Room undo ${roomId}/${id}`)
      const body = parseRoomBody(row.body_json) as Omit<HistoryEntry, 'state'> & { state: StoredState }
      const entry = { ...body, state: restoreState(body.state) } as HistoryEntry
      registerRecoveryRecordId(entry, id)
      undoCache.set(id, entry)
      restoredRecovery.push({ id, kind: 'undo', json: row.body_json })
      return entry
    }
    const checkpointCache = new Map<string, SessionCommandCheckpoint>()
    const restoreCheckpoint = (id: string): SessionCommandCheckpoint => {
      const cached = checkpointCache.get(id)
      if (cached) return cached
      const row = this.selectRecovery.get(roomId, id) as { kind: string; body_json: string; checksum: string } | undefined
      if (!row || row.kind !== 'checkpoint' || row.checksum !== checksum({ node_id: id, kind: row.kind, body_json: row.body_json })) throw new RoomHistoryCorruptionError(`Missing or corrupt Room checkpoint ${roomId}/${id}`)
      const { state, undoHistory, ...body } = parseRoomBody(row.body_json) as Omit<SessionCommandCheckpoint, 'state' | 'history'> & { state: StoredState; undoHistory: string[] }
      const checkpoint = { ...body, state: restoreState(state), history: undoHistory.map(restoreUndo) } as SessionCommandCheckpoint
      registerRecoveryRecordId(checkpoint, id)
      checkpointCache.set(id, checkpoint)
      restoredRecovery.push({ id, kind: 'checkpoint', json: row.body_json })
      return checkpoint
    }
    const { undoHistory, provisionalContinuationScopes, ...runtime } = stored.sessionCursor
    const frameBody = stored.roomHistoryVersion === 1
      ? stored.frameWithoutStreams
      : applyReplayDelta(stored.state as JsonValue, stored.frameDelta) as StoredState
    const frame = restoreState(frameBody) as unknown as PersistedSessionSnapshot['frame']
    if (frameHash(frame as unknown as JsonValue) !== stored.rawFrameHash) throw new RoomHistoryCorruptionError(`Room Frame hash mismatch for ${roomId}`)
    const snapshot = { state: restoreState(stored.state), frame, sessionCursor: {
      ...runtime,
      ...(undoHistory ? { history: undoHistory.map(restoreUndo) } : {}),
      ...(provisionalContinuationScopes ? { provisionalContinuationScopes: provisionalContinuationScopes.map(({ checkpointRef, ...scope }) => ({ ...scope, checkpoint: restoreCheckpoint(checkpointRef) })) } : {}),
    } as SessionPrivateCursor }

    this.accept(roomId, [...cache.values()], restoredRecovery)
    return snapshot
  }
}
