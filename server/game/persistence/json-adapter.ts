import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type {
  RoomMeta,
  RoomPersistence,
  RoomSnapshot,
  RestoreOptions,
} from './room-persistence.ts'
import type { SerializedGameState } from '../../../shared/game/serialization.ts'

const sanitise = (id: string) => id.replace(/[^a-zA-Z0-9._-]/g, '_')

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

  save(id: string, serialized: SerializedGameState, _meta: RoomMeta): void {
    try {
      mkdirSync(this.dir, { recursive: true })
      writeFileSync(this.fileFor(id), JSON.stringify(serialized, null, 0), 'utf-8')
    } catch (err) {
      console.warn('[json-adapter] save failed:', err)
    }
  }

  delete(id: string): void {
    try {
      const file = this.fileFor(id)
      if (existsSync(file)) unlinkSync(file)
    } catch (err) {
      console.warn('[json-adapter] delete failed:', err)
    }
  }

  markFinished(_id: string, _now: number): void {
    // JSON adapter doesn't track status; deliberate no-op.
  }

  listRestorable(_opts: RestoreOptions): RoomSnapshot[] {
    // JSON files are not enumerated for startup restore — fixed dev rooms
    // call `load(id)` directly. Returning empty preserves current behaviour.
    return []
  }
}
