import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import type {
  GameResult,
  RoomCompletionResult,
  RoomMeta,
  RoomPersistence,
  RoomSnapshot,
  RestoreOptions,
} from './room-persistence.ts'
import type { SerializedGameState } from '../../../shared/session/serialization.ts'

const sanitise = (id: string) => id.replace(/[^a-zA-Z0-9._-]/g, '_')

const fallbackMeta = (serialized: SerializedGameState): RoomMeta => ({
  createdBy: null,
  maxPlayers: Array.isArray(serialized.players) ? serialized.players.length : 2,
  customCardDbIds: [],
  status: 'playing',
  players: [],
})

export class JsonRoomPersistence implements RoomPersistence {
  private readonly dir: string

  constructor(dir: string) {
    this.dir = dir
  }

  private fileFor(id: string): string {
    return join(this.dir, `${sanitise(id)}.json`)
  }

  load(id: string): RoomSnapshot | null {
    try {
      const file = this.fileFor(id)
      if (!existsSync(file)) return null
      const raw = readFileSync(file, 'utf-8')
      const serialized = JSON.parse(raw) as SerializedGameState
      const updatedAt = statSync(file).mtimeMs
      return {
        id,
        serialized,
        meta: { ...fallbackMeta(serialized), startedAt: updatedAt },
        updatedAt,
      }
    } catch (err) {
      console.warn('[json-adapter] load failed:', err)
      return null
    }
  }

  /**
   * Save the serialized state only. The `_meta` parameter is intentionally
   * ignored — the JSON backend is state-only by design (see RoomPersistence
   * interface JSDoc). Callers that need round-tripped meta must use the
   * sqlite or memory adapter.
   *
   * When `serialized` is null (placeholder row), this is a no-op — the JSON
   * adapter does not track placeholder rows.
   */
  save(id: string, serialized: SerializedGameState | null, _meta: RoomMeta): void {
    if (serialized === null) return
    try {
      mkdirSync(this.dir, { recursive: true })
      writeFileSync(this.fileFor(id), JSON.stringify(serialized, null, 0), 'utf-8')
    } catch (err) {
      console.warn('[json-adapter] save failed:', err)
    }
  }

  discard(id: string): void {
    try {
      const file = this.fileFor(id)
      if (existsSync(file)) unlinkSync(file)
    } catch (err) {
      console.warn('[json-adapter] discard failed:', err)
    }
  }

  complete(result: GameResult): RoomCompletionResult {
    try {
      const file = this.fileFor(result.roomId)
      if (existsSync(file)) unlinkSync(file)
      return { ok: true, archived: false }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  hasRoomId(id: string): boolean {
    return existsSync(this.fileFor(id))
  }

  listRestorable(opts: RestoreOptions): RoomSnapshot[] {
    if (!existsSync(this.dir)) return []
    const excludeIds = new Set(opts.excludeIds ?? [])
    const snapshots: RoomSnapshot[] = []
    for (const entry of readdirSync(this.dir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue
      const id = entry.name.slice(0, -'.json'.length)
      if (excludeIds.has(id)) continue
      const snapshot = this.load(id)
      if (!snapshot) continue
      const ttl = snapshot.meta.status === 'playing'
        ? opts.playingTtlMs
        : opts.waitingTtlMs
      if (opts.now - snapshot.updatedAt > ttl) {
        this.discard(id)
        continue
      }
      snapshots.push(snapshot)
    }
    return snapshots
  }
}
