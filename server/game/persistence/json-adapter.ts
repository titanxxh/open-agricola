import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
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

/**
 * Fallback metadata returned by `load`. JSON files only persist the serialized
 * state; meta fields are reconstructed with safe defaults. Status defaults to
 * `'playing'` because the JSON adapter does not participate in startup restore
 * (`listRestorable` returns `[]`), so this value is informational only.
 */
const FALLBACK_META: RoomMeta = {
  createdBy: null,
  maxPlayers: 2,
  customCardDbIds: [],
  status: 'playing',
  players: [],
}

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
      return { id, serialized, meta: { ...FALLBACK_META }, updatedAt: 0 }
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

  listRestorable(_opts: RestoreOptions): RoomSnapshot[] {
    // JSON files are not enumerated for startup restore — fixed dev rooms
    // call `load(id)` directly. Returning empty preserves current behaviour.
    return []
  }
}
