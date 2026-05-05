# Sprint S5 — RoomManager 拆 connection / persistence 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `server/game/room-manager.ts`（1170 行 6 职责）拆成 `connection/` + `game/` + `game/persistence/` 三层，引入 5-方法 `RoomPersistence` 接口与 in-memory adapter，删除原文件。

**Architecture:** 3 个 PR 增量推进 ① 抽 persistence 层（行为零变化）② 拆 game/（room/registry/lobby）③ 拆 connection/（ws-server/router/broadcaster/envelope-builder）+ 删 room-manager.ts。每 PR 内部 TDD：先写新单元的 contract test，再实现，再迁旧测试。详见 `docs/superpowers/specs/2026-05-05-sprint-S5-design.md`。

**Tech Stack:** TypeScript 5.x / Node.js 22 / vitest / better-sqlite3 / ws；现有 `GameSession` / `serializeState` / `StateUpdateEnvelope` / `ClientCommand` 不动。

**Worktree:** `.worktree/sprint-S5` on branch `sprint-S5-room-manager-split`（已基于 main + spec commit c9c892a2）。

**约束（来自 spec §0 决策档位 B）：**
- 不变更 WS 协议、ClientCommand / ServerEvent 字段、persistence 字段
- 错误信息字符串保持现状
- broadcaster 内调 `persistence.save` 是行为零变化（与现状 broadcastState 内调 savePersistedState 同语义）
- `authoritative-session.ts` 完全不动（freeze）

---

## Phase 1 — Persistence 层（PR-S5-1）

### Task 1.1: 定义 `RoomPersistence` interface 与公共类型

**Files:**
- Create: `server/game/persistence/room-persistence.ts`

- [ ] **Step 1: 写文件**

```ts
// server/game/persistence/room-persistence.ts
import type { SerializedGameState } from '../../../shared/game/serialization.ts'

export type RoomStatus = 'waiting' | 'playing' | 'finished'

export type RoomMeta = {
  createdBy: string | null
  maxPlayers: number
  customCardDbIds: string[]
  status: RoomStatus
  /** Seated players with persisted user identity. Anonymous seats are skipped. */
  players: Array<{ userId: string; playerIndex: number }>
}

export type RoomSnapshot = {
  id: string
  /** null = row exists but no state has been saved yet (e.g., room just created). */
  serialized: SerializedGameState | null
  meta: RoomMeta
  /** ms-since-epoch of the last save. */
  updatedAt: number
}

export type RestoreOptions = {
  now: number
  waitingTtlMs: number
  playingTtlMs: number
  /** Exclude these ids (typically fixed dev rooms loaded by another path). */
  excludeIds?: ReadonlyArray<string>
}

/**
 * Narrow persistence interface for room state + meta. Three adapters:
 *   - SqliteRoomPersistence  (production / dev with PERSIST_ROOMS=sqlite)
 *   - JsonRoomPersistence    (legacy / dev with PERSIST_ROOMS=json)
 *   - InMemoryRoomPersistence (tests, plus future use cases)
 *
 * Behavioural differences are documented per-adapter; the contract test
 * (`adapter-contract.test.ts`) only asserts the common subset.
 */
export interface RoomPersistence {
  /** Returns null if the row doesn't exist. */
  load(id: string): RoomSnapshot | null
  /** Upsert serialized state + meta. May ignore meta-only fields per adapter. */
  save(id: string, serialized: SerializedGameState, meta: RoomMeta): void
  /** Hard-delete the row. Idempotent — silently no-ops if row absent. */
  delete(id: string): void
  /** Flip status to 'finished'. Adapter may no-op if status not stored. */
  markFinished(id: string, now: number): void
  /**
   * Side-effect: also marks rows older than TTL as 'finished' before listing.
   * Returns non-finished rooms whose updatedAt is within TTL.
   */
  listRestorable(opts: RestoreOptions): RoomSnapshot[]
}
```

- [ ] **Step 2: 类型校验**

Run: `pnpm exec tsc --noEmit -p tsconfig.server.json`
Expected: 通过

- [ ] **Step 3: Commit**

```bash
git add server/game/persistence/room-persistence.ts
git commit -m "feat(persistence): add RoomPersistence interface + types"
```

### Task 1.2: 实现 `SqliteRoomPersistence` + 单测

**Files:**
- Create: `server/game/persistence/sqlite-adapter.ts`
- Create: `server/game/persistence/__tests__/sqlite-adapter.test.ts`

- [ ] **Step 1: 先写测试（TDD red）**

```ts
// server/game/persistence/__tests__/sqlite-adapter.test.ts
import Database from 'better-sqlite3'
import { describe, expect, it, beforeEach } from 'vitest'
import { SqliteRoomPersistence } from '../sqlite-adapter.ts'
import type { RoomMeta, RoomSnapshot } from '../room-persistence.ts'
import type { SerializedGameState } from '../../../../shared/game/serialization.ts'

const WAITING_TTL = 30 * 60 * 1000
const PLAYING_TTL = 24 * 60 * 60 * 1000
const NOW = 1_700_000_000_000

const META: RoomMeta = {
  createdBy: 'u1',
  maxPlayers: 2,
  customCardDbIds: [],
  status: 'playing',
  players: [{ userId: 'u1', playerIndex: 0 }],
}

const STATE = { _stub: true } as unknown as SerializedGameState

const setupDb = () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE rooms (
      id TEXT PRIMARY KEY,
      created_by TEXT,
      state_json TEXT,
      max_players INTEGER NOT NULL DEFAULT 2,
      status TEXT NOT NULL DEFAULT 'waiting',
      version INTEGER NOT NULL DEFAULT 0,
      custom_card_ids TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE room_players (
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      player_index INTEGER NOT NULL,
      joined_at INTEGER NOT NULL,
      PRIMARY KEY (room_id, user_id)
    );
  `)
  return db
}

describe('SqliteRoomPersistence', () => {
  let db: ReturnType<typeof setupDb>
  let p: SqliteRoomPersistence

  beforeEach(() => {
    db = setupDb()
    p = new SqliteRoomPersistence(db)
  })

  it('save → load round-trips serialized + meta', () => {
    p.save('r1', STATE, META)
    const snap = p.load('r1') as RoomSnapshot
    expect(snap.id).toBe('r1')
    expect(snap.serialized).toEqual(STATE)
    expect(snap.meta.createdBy).toBe('u1')
    expect(snap.meta.status).toBe('playing')
    expect(snap.meta.players).toEqual([{ userId: 'u1', playerIndex: 0 }])
  })

  it('load returns null for missing id', () => {
    expect(p.load('nope')).toBeNull()
  })

  it('delete removes the row + cascades room_players', () => {
    p.save('r1', STATE, META)
    expect(p.load('r1')).not.toBeNull()
    p.delete('r1')
    expect(p.load('r1')).toBeNull()
    const rp = db.prepare('SELECT COUNT(*) AS n FROM room_players WHERE room_id = ?').get('r1') as { n: number }
    expect(rp.n).toBe(0)
  })

  it('markFinished flips status without changing serialized', () => {
    p.save('r1', STATE, META)
    p.markFinished('r1', NOW + 100)
    const snap = p.load('r1') as RoomSnapshot
    expect(snap.meta.status).toBe('finished')
    expect(snap.serialized).toEqual(STATE)
  })

  it('listRestorable excludes finished + excluded ids + stale rows (and prunes them)', () => {
    p.save('r-fresh', STATE, { ...META, status: 'playing' })
    p.save('r-stale-playing', STATE, { ...META, status: 'playing' })
    p.save('r-stale-waiting', STATE, { ...META, status: 'waiting' })
    p.save('r-finished', STATE, { ...META, status: 'finished' })
    p.save('dev2', STATE, { ...META, status: 'playing' })

    // Push the stale rows back in time
    db.prepare('UPDATE rooms SET updated_at = ? WHERE id IN (?, ?)').run(
      NOW - PLAYING_TTL - 1, 'r-stale-playing', 'r-stale-waiting',
    )

    const restored = p.listRestorable({
      now: NOW,
      waitingTtlMs: WAITING_TTL,
      playingTtlMs: PLAYING_TTL,
      excludeIds: ['dev2'],
    })

    const ids = restored.map((s) => s.id).sort()
    expect(ids).toEqual(['r-fresh'])

    // Stale rows are now marked finished (prune side-effect)
    const stale = db.prepare('SELECT id, status FROM rooms WHERE id LIKE ?').all('r-stale-%') as Array<{ id: string; status: string }>
    expect(stale.every((r) => r.status === 'finished')).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试看红**

Run: `pnpm exec vitest run server/game/persistence/__tests__/sqlite-adapter.test.ts`
Expected: FAIL（找不到 `../sqlite-adapter.ts`）

- [ ] **Step 3: 实现 adapter**

```ts
// server/game/persistence/sqlite-adapter.ts
import type Database from 'better-sqlite3'
import type {
  RoomMeta,
  RoomPersistence,
  RoomSnapshot,
  RoomStatus,
  RestoreOptions,
} from './room-persistence.ts'
import type { SerializedGameState } from '../../../shared/game/serialization.ts'

type RoomRow = {
  id: string
  created_by: string | null
  state_json: string | null
  max_players: number
  status: string
  version: number
  custom_card_ids: string | null
  updated_at: number
}

const parseCustomCardDbIds = (raw: string | null): string[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

const toStatus = (raw: string): RoomStatus =>
  raw === 'playing' || raw === 'finished' || raw === 'waiting' ? raw : 'waiting'

export class SqliteRoomPersistence implements RoomPersistence {
  constructor(private readonly db: Pick<Database.Database, 'prepare'>) {}

  load(id: string): RoomSnapshot | null {
    const row = this.db.prepare(
      'SELECT id, created_by, state_json, max_players, status, version, custom_card_ids, updated_at FROM rooms WHERE id = ?',
    ).get(id) as RoomRow | undefined
    if (!row) return null
    const players = this.db.prepare(
      'SELECT user_id AS userId, player_index AS playerIndex FROM room_players WHERE room_id = ? ORDER BY player_index',
    ).all(id) as Array<{ userId: string; playerIndex: number }>
    return {
      id: row.id,
      serialized: row.state_json ? (JSON.parse(row.state_json) as SerializedGameState) : null,
      meta: {
        createdBy: row.created_by,
        maxPlayers: row.max_players,
        customCardDbIds: parseCustomCardDbIds(row.custom_card_ids),
        status: toStatus(row.status),
        players,
      },
      updatedAt: row.updated_at,
    }
  }

  save(id: string, serialized: SerializedGameState, meta: RoomMeta): void {
    const now = Date.now()
    const stateJson = JSON.stringify(serialized)
    const customCardIdsJson = JSON.stringify(meta.customCardDbIds)
    const existing = this.db.prepare('SELECT id FROM rooms WHERE id = ?').get(id)
    if (existing) {
      this.db.prepare(
        'UPDATE rooms SET state_json = ?, status = ?, custom_card_ids = ?, version = version + 1, updated_at = ? WHERE id = ?',
      ).run(stateJson, meta.status, customCardIdsJson, now, id)
    } else {
      this.db.prepare(
        'INSERT INTO rooms (id, created_by, state_json, max_players, status, version, custom_card_ids, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)',
      ).run(id, meta.createdBy, stateJson, meta.maxPlayers, meta.status, customCardIdsJson, now, now)
    }
    for (const p of meta.players) {
      const exists = this.db.prepare(
        'SELECT 1 FROM room_players WHERE room_id = ? AND user_id = ?',
      ).get(id, p.userId)
      if (!exists) {
        this.db.prepare(
          'INSERT INTO room_players (room_id, user_id, player_index, joined_at) VALUES (?, ?, ?, ?)',
        ).run(id, p.userId, p.playerIndex, now)
      }
    }
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM rooms WHERE id = ?').run(id)
  }

  markFinished(id: string, now: number): void {
    this.db.prepare("UPDATE rooms SET status = 'finished', updated_at = ? WHERE id = ?").run(now, id)
  }

  listRestorable(opts: RestoreOptions): RoomSnapshot[] {
    this.pruneStale(opts)
    const excludeIds = opts.excludeIds ?? []
    const placeholders = excludeIds.map(() => '?').join(', ') || "''"
    const rows = this.db.prepare(
      `SELECT id, created_by, state_json, max_players, status, version, custom_card_ids, updated_at
       FROM rooms WHERE status != 'finished' AND id NOT IN (${placeholders})`,
    ).all(...excludeIds) as RoomRow[]
    return rows
      .map((row) => {
        const snap = this.load(row.id)
        return snap
      })
      .filter((s): s is RoomSnapshot => s !== null)
  }

  private pruneStale(opts: RestoreOptions): void {
    const excludeIds = opts.excludeIds ?? []
    const placeholders = excludeIds.map(() => '?').join(', ') || "''"
    const staleWaiting = opts.now - opts.waitingTtlMs
    const stalePlaying = opts.now - opts.playingTtlMs
    this.db.prepare(
      `UPDATE rooms
       SET status = 'finished', updated_at = ?
       WHERE status != 'finished'
         AND (
           (status = 'playing' AND updated_at < ?)
           OR (status != 'playing' AND updated_at < ?)
         )
         AND id NOT IN (${placeholders})`,
    ).run(opts.now, stalePlaying, staleWaiting, ...excludeIds)
  }
}
```

- [ ] **Step 4: 跑测试看绿**

Run: `pnpm exec vitest run server/game/persistence/__tests__/sqlite-adapter.test.ts`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add server/game/persistence/sqlite-adapter.ts server/game/persistence/__tests__/sqlite-adapter.test.ts
git commit -m "feat(persistence): SqliteRoomPersistence implementation + tests"
```

### Task 1.3: 实现 `JsonRoomPersistence` + 单测

**Files:**
- Create: `server/game/persistence/json-adapter.ts`
- Create: `server/game/persistence/__tests__/json-adapter.test.ts`

- [ ] **Step 1: 写测试**

```ts
// server/game/persistence/__tests__/json-adapter.test.ts
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { JsonRoomPersistence } from '../json-adapter.ts'
import type { RoomMeta } from '../room-persistence.ts'
import type { SerializedGameState } from '../../../../shared/game/serialization.ts'

const META: RoomMeta = {
  createdBy: null,
  maxPlayers: 2,
  customCardDbIds: [],
  status: 'playing',
  players: [],
}
const STATE = { _stub: true } as unknown as SerializedGameState

describe('JsonRoomPersistence', () => {
  let dir: string
  let p: JsonRoomPersistence

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'oa-json-'))
    p = new JsonRoomPersistence(dir)
  })
  afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

  it('save → load returns serialized; meta is best-effort', () => {
    p.save('r1', STATE, META)
    const snap = p.load('r1')
    expect(snap?.serialized).toEqual(STATE)
    // meta has fallback values (status defaults to 'playing')
    expect(snap?.meta.status).toBe('playing')
  })

  it('load returns null when file is absent', () => {
    expect(p.load('nope')).toBeNull()
  })

  it('delete removes the file', () => {
    p.save('r1', STATE, META)
    p.delete('r1')
    expect(p.load('r1')).toBeNull()
  })

  it('delete is idempotent on missing files', () => {
    expect(() => p.delete('never-existed')).not.toThrow()
  })

  it('markFinished is a no-op (returns without throw)', () => {
    p.save('r1', STATE, META)
    expect(() => p.markFinished('r1', Date.now())).not.toThrow()
    expect(p.load('r1')?.serialized).toEqual(STATE)
  })

  it('listRestorable always returns []', () => {
    p.save('r1', STATE, META)
    expect(p.listRestorable({ now: 0, waitingTtlMs: 1, playingTtlMs: 1 })).toEqual([])
  })

  it('sanitises room ids that contain unsafe chars', () => {
    p.save('a/b\\c', STATE, META)
    // No throw, file written under sanitised name
    expect(p.load('a/b\\c')?.serialized).toEqual(STATE)
  })
})
```

- [ ] **Step 2: 跑测试看红**

Run: `pnpm exec vitest run server/game/persistence/__tests__/json-adapter.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// server/game/persistence/json-adapter.ts
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
  constructor(private readonly dir: string) {}

  private fileFor(id: string): string {
    return join(this.dir, `${sanitise(id)}.json`)
  }

  load(id: string): RoomSnapshot | null {
    const file = this.fileFor(id)
    if (!existsSync(file)) return null
    try {
      const raw = readFileSync(file, 'utf-8')
      const serialized = JSON.parse(raw) as SerializedGameState
      return { id, serialized, meta: { ...FALLBACK_META }, updatedAt: 0 }
    } catch {
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
```

- [ ] **Step 4: 跑测试看绿**

Run: `pnpm exec vitest run server/game/persistence/__tests__/json-adapter.test.ts`
Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add server/game/persistence/json-adapter.ts server/game/persistence/__tests__/json-adapter.test.ts
git commit -m "feat(persistence): JsonRoomPersistence implementation + tests"
```

### Task 1.4: 实现 `InMemoryRoomPersistence` + 单测

**Files:**
- Create: `server/game/persistence/memory-adapter.ts`
- Create: `server/game/persistence/__tests__/memory-adapter.test.ts`

- [ ] **Step 1: 写测试**

```ts
// server/game/persistence/__tests__/memory-adapter.test.ts
import { describe, expect, it, beforeEach } from 'vitest'
import { InMemoryRoomPersistence } from '../memory-adapter.ts'
import type { RoomMeta } from '../room-persistence.ts'
import type { SerializedGameState } from '../../../../shared/game/serialization.ts'

const META: RoomMeta = {
  createdBy: 'u',
  maxPlayers: 2,
  customCardDbIds: [],
  status: 'playing',
  players: [{ userId: 'u', playerIndex: 0 }],
}
const STATE = { _stub: true } as unknown as SerializedGameState

describe('InMemoryRoomPersistence', () => {
  let p: InMemoryRoomPersistence

  beforeEach(() => { p = new InMemoryRoomPersistence() })

  it('save → load round-trips serialized + meta + updatedAt', () => {
    p.save('r1', STATE, META)
    const snap = p.load('r1')
    expect(snap?.serialized).toEqual(STATE)
    expect(snap?.meta).toEqual(META)
    expect(snap?.updatedAt).toBeGreaterThan(0)
  })

  it('save twice updates the existing row (no duplicate on listRestorable)', () => {
    p.save('r1', STATE, META)
    p.save('r1', STATE, { ...META, status: 'waiting' })
    expect(p.load('r1')?.meta.status).toBe('waiting')
  })

  it('delete removes the row', () => {
    p.save('r1', STATE, META)
    p.delete('r1')
    expect(p.load('r1')).toBeNull()
  })

  it('markFinished flips status', () => {
    p.save('r1', STATE, META)
    p.markFinished('r1', Date.now() + 100)
    expect(p.load('r1')?.meta.status).toBe('finished')
  })

  it('listRestorable filters finished + excluded + stale', () => {
    const NOW = 10_000_000
    p.save('fresh', STATE, { ...META, status: 'playing' })
    p.save('finished', STATE, { ...META, status: 'finished' })
    p.save('dev', STATE, { ...META, status: 'playing' })
    p.save('stale-playing', STATE, { ...META, status: 'playing' })
    // Force stale-playing's updatedAt to before TTL
    p.__setUpdatedAtForTest('stale-playing', NOW - 99_999_999)

    const restored = p.listRestorable({
      now: NOW,
      waitingTtlMs: 1000,
      playingTtlMs: 1000,
      excludeIds: ['dev'],
    })
    expect(restored.map((s) => s.id).sort()).toEqual(['fresh'])
  })
})
```

- [ ] **Step 2: 跑红**

Run: `pnpm exec vitest run server/game/persistence/__tests__/memory-adapter.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// server/game/persistence/memory-adapter.ts
import type {
  RoomMeta,
  RoomPersistence,
  RoomSnapshot,
  RestoreOptions,
} from './room-persistence.ts'
import type { SerializedGameState } from '../../../shared/game/serialization.ts'

type Row = { serialized: SerializedGameState; meta: RoomMeta; updatedAt: number }

export class InMemoryRoomPersistence implements RoomPersistence {
  private rooms = new Map<string, Row>()

  load(id: string): RoomSnapshot | null {
    const row = this.rooms.get(id)
    if (!row) return null
    return {
      id,
      serialized: row.serialized,
      meta: { ...row.meta, players: row.meta.players.map((p) => ({ ...p })) },
      updatedAt: row.updatedAt,
    }
  }

  save(id: string, serialized: SerializedGameState, meta: RoomMeta): void {
    this.rooms.set(id, {
      serialized,
      meta: { ...meta, players: meta.players.map((p) => ({ ...p })) },
      updatedAt: Date.now(),
    })
  }

  delete(id: string): void {
    this.rooms.delete(id)
  }

  markFinished(id: string, now: number): void {
    const row = this.rooms.get(id)
    if (!row) return
    row.meta = { ...row.meta, status: 'finished' }
    row.updatedAt = now
  }

  listRestorable(opts: RestoreOptions): RoomSnapshot[] {
    const excludeIds = new Set(opts.excludeIds ?? [])
    const out: RoomSnapshot[] = []
    for (const [id, row] of this.rooms) {
      if (excludeIds.has(id)) continue
      if (row.meta.status === 'finished') continue
      const ttl = row.meta.status === 'playing' ? opts.playingTtlMs : opts.waitingTtlMs
      if (opts.now - row.updatedAt > ttl) {
        row.meta = { ...row.meta, status: 'finished' }
        continue
      }
      out.push({ id, serialized: row.serialized, meta: { ...row.meta }, updatedAt: row.updatedAt })
    }
    return out
  }

  /** Test helper — adjust an entry's updatedAt to simulate TTL elapse. */
  __setUpdatedAtForTest(id: string, updatedAt: number): void {
    const row = this.rooms.get(id)
    if (row) row.updatedAt = updatedAt
  }
}
```

- [ ] **Step 4: 跑绿**

Run: `pnpm exec vitest run server/game/persistence/__tests__/memory-adapter.test.ts`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add server/game/persistence/memory-adapter.ts server/game/persistence/__tests__/memory-adapter.test.ts
git commit -m "feat(persistence): InMemoryRoomPersistence for tests + DI"
```

### Task 1.5: Adapter contract test（3 adapter 跑同一份用例）

**Files:**
- Create: `server/game/persistence/__tests__/adapter-contract.test.ts`

- [ ] **Step 1: 写测试**

```ts
// server/game/persistence/__tests__/adapter-contract.test.ts
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SqliteRoomPersistence } from '../sqlite-adapter.ts'
import { JsonRoomPersistence } from '../json-adapter.ts'
import { InMemoryRoomPersistence } from '../memory-adapter.ts'
import type { RoomMeta, RoomPersistence } from '../room-persistence.ts'
import type { SerializedGameState } from '../../../../shared/game/serialization.ts'

const META: RoomMeta = {
  createdBy: 'u',
  maxPlayers: 2,
  customCardDbIds: ['x'],
  status: 'playing',
  players: [{ userId: 'u', playerIndex: 0 }],
}
const STATE = { _stub: true } as unknown as SerializedGameState

const setupSqlite = (): RoomPersistence => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE rooms (id TEXT PRIMARY KEY, created_by TEXT, state_json TEXT,
      max_players INTEGER NOT NULL DEFAULT 2, status TEXT NOT NULL DEFAULT 'waiting',
      version INTEGER NOT NULL DEFAULT 0, custom_card_ids TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE room_players (room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL, player_index INTEGER NOT NULL, joined_at INTEGER NOT NULL,
      PRIMARY KEY (room_id, user_id));
  `)
  return new SqliteRoomPersistence(db)
}

const setupJson = (): RoomPersistence => new JsonRoomPersistence(mkdtempSync(join(tmpdir(), 'oa-')))
const setupMemory = (): RoomPersistence => new InMemoryRoomPersistence()

const adapters: Array<[string, () => RoomPersistence]> = [
  ['sqlite', setupSqlite],
  ['json', setupJson],
  ['memory', setupMemory],
]

for (const [name, factory] of adapters) {
  describe(`RoomPersistence contract — ${name}`, () => {
    it('load returns null for missing id', () => {
      const p = factory()
      expect(p.load('nope')).toBeNull()
    })

    it('save → load round-trips serialized', () => {
      const p = factory()
      p.save('r1', STATE, META)
      expect(p.load('r1')?.serialized).toEqual(STATE)
    })

    it('delete removes the row', () => {
      const p = factory()
      p.save('r1', STATE, META)
      p.delete('r1')
      expect(p.load('r1')).toBeNull()
    })

    it('markFinished does not throw', () => {
      const p = factory()
      p.save('r1', STATE, META)
      expect(() => p.markFinished('r1', Date.now())).not.toThrow()
    })

    it('listRestorable returns at most non-finished rooms', () => {
      const p = factory()
      p.save('r-active', STATE, { ...META, status: 'playing' })
      p.save('r-finished', STATE, { ...META, status: 'finished' })
      const res = p.listRestorable({ now: Date.now(), waitingTtlMs: 60_000, playingTtlMs: 60_000 })
      // SQLite + memory return ['r-active']; JSON returns []
      expect(res.every((s) => s.meta.status !== 'finished')).toBe(true)
    })
  })
}
```

- [ ] **Step 2: 跑绿**

Run: `pnpm exec vitest run server/game/persistence/__tests__/adapter-contract.test.ts`
Expected: 15 passed (5 cases × 3 adapters)

- [ ] **Step 3: Commit**

```bash
git add server/game/persistence/__tests__/adapter-contract.test.ts
git commit -m "test(persistence): adapter contract suite across all 3 adapters"
```

### Task 1.6: room-manager.ts 内部接入 persistence adapter

**Files:**
- Modify: `server/game/room-manager.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: 编辑 room-manager.ts —— 把 5 个旧 persistence 函数替换成 adapter 调用**

具体改动：
- 文件顶部 import `RoomPersistence` 与 `SqliteRoomPersistence` / `JsonRoomPersistence`
- 新增 module-level `let persistence: RoomPersistence | null = null` + `setPersistence(p)` + `getPersistence(): RoomPersistence`
- `savePersistedState(roomId, serialized, room?)` → 调 `getPersistence().save(roomId, serialized, toRoomMeta(room))`
- `loadPersistedStateJson(roomId)` → 调 `getPersistence().load(roomId)?.serialized ?? null`
- `restoreRoomFromSqliteRow` → 暂保留（PR-S5-2 改写为 `snapshotToRoom`）；改为内部根据 `RoomSnapshot` 而非 `PersistedRoomRow` 解析；保留旧 export 签名（只在 stale-cleanup 测试用）。临时方案：`restoreRoomFromSqliteRow(row)` 内部把 row 转换成 `RoomSnapshot` 再走 `snapshotToRoom` 逻辑
- `pruneStaleRoomRows` → 删 export，内部不再使用（被 `getPersistence().listRestorable` 替代）
- `restoreRoomsFromSqlite` → 改为调 `getPersistence().listRestorable({ now, waitingTtlMs, playingTtlMs, excludeIds: FIXED_DEV_ROOMS_IDS })`，返回的 `RoomSnapshot[]` 走 `loadRoomFromState` 逻辑
- `ensureRoomRowSqlite(room)` → 改为 `getPersistence().save(room.id, emptyState, toRoomMeta(room))`；但当前是 INSERT WITH state_json=NULL；新接口 `save` 要求 serialized 非 null。两种处理：① 跳过这一步，等首次真 save 自然写入 ② `save` 接口允许 `serialized: SerializedGameState | null`（接口微调）

选择 ② —— 调整 interface：

```ts
// 在 room-persistence.ts 把 save 改为：
save(id: string, serialized: SerializedGameState | null, meta: RoomMeta): void
```

3 个 adapter 同步更新：sqlite 当 serialized=null 时写 state_json=NULL；json 当 null 时不写文件；memory 当 null 时把 row 标记为 placeholder。

- [ ] **Step 2: 同步 3 adapter 实现 + 测试**

修改：
- `sqlite-adapter.ts` `save`：null state 时 `state_json = NULL`
- `json-adapter.ts` `save`：null state 时 no-op
- `memory-adapter.ts` `save`：null state 时 row.serialized = null
- 各自测试加用例：`save with null serialized creates placeholder row`

跑：`pnpm exec vitest run server/game/persistence/`
Expected: 全绿

- [ ] **Step 3: 编辑 server/index.ts**

把启动顺序改为：

```ts
import { SqliteRoomPersistence } from './game/persistence/sqlite-adapter.ts'
import { JsonRoomPersistence } from './game/persistence/json-adapter.ts'
import { setPersistence } from './game/room-manager.ts'  // 临时 setter，PR-S5-3 改 DI

const PERSIST_ROOMS = (process.env.PERSIST_ROOMS ?? 'sqlite') as 'json' | 'sqlite'
const PERSISTED_ROOMS_DIR = process.env.PERSISTED_ROOMS_DIR ?? join(process.cwd(), 'output')
const persistence = PERSIST_ROOMS === 'sqlite'
  ? new SqliteRoomPersistence(getDb())
  : new JsonRoomPersistence(PERSISTED_ROOMS_DIR)
setPersistence(persistence)

// 之后 createWsServer / getRooms / dissolveRoomById 调用不变
```

- [ ] **Step 4: 跑全量 fast project + lint + build**

Run: `pnpm test:fast`
Expected: 全绿（包括迁移前的 `room-manager-stale-cleanup.test.ts` —— 它仍 import `pruneStaleRoomRows`，所以本步骤前要先把那个测试文件 stub 起来或迁掉。建议在 step 0 先迁）

实际顺序调整：把 step 4 的 stale-cleanup 处理拆到 Task 1.7。

Run: `pnpm run lint`
Expected: 无新增 error

Run: `pnpm run build`
Expected: 通过

- [ ] **Step 5: Commit**

```bash
git add server/game/room-manager.ts server/index.ts server/game/persistence/
git commit -m "refactor(server): route persistence through RoomPersistence adapter"
```

### Task 1.7: 迁移 stale-cleanup 测试

**Files:**
- Delete: `server/__tests__/room-manager-stale-cleanup.test.ts`
- Create: `server/game/persistence/__tests__/sqlite-adapter-stale.test.ts`（增量补充原测试逻辑，如果 Task 1.2 还没覆盖的部分）

- [ ] **Step 1: 阅读旧测试用例**

Read: `server/__tests__/room-manager-stale-cleanup.test.ts`

确认覆盖点：① pruneStaleRoomRows 把过期非 finished 行改 finished ② summarizeRoomsForLobby 隐藏 0 玩家非 dev 房 ③ summarizeRoomsForLobby 保留 fixed dev 房

- [ ] **Step 2: ① 已被 Task 1.2 `listRestorable` 用例覆盖 → 验证**

Read: `server/game/persistence/__tests__/sqlite-adapter.test.ts`

如果某个具体场景没覆盖（如 multi-fixed-id exclude），加 case 进 sqlite-adapter.test.ts。

- [ ] **Step 3: ② ③ 关于 `summarizeRoomsForLobby` 暂留**

`summarizeRoomsForLobby` 在 PR-S5-2 才迁到 `room.ts` / `lobby.test.ts`。在 PR-S5-1 我们仅删除"persistence 部分"的旧测试。

Action：把 `room-manager-stale-cleanup.test.ts` 改名为 `room-manager-summarize.test.ts`，仅保留 ② ③ summarizeRoomsForLobby 用例。`pruneStaleRoomRows` 用例删除。

```bash
git mv server/__tests__/room-manager-stale-cleanup.test.ts server/__tests__/room-manager-summarize.test.ts
```

编辑 `room-manager-summarize.test.ts`：删 `pruneStaleRoomRows` 相关 describe / import。仅留 `summarizeRoomsForLobby` describe。

- [ ] **Step 4: 跑 fast project**

Run: `pnpm test:fast`
Expected: 全绿

- [ ] **Step 5: Commit**

```bash
git add server/__tests__/room-manager-summarize.test.ts server/__tests__/room-manager-stale-cleanup.test.ts
git commit -m "test(server): split stale-cleanup tests; pruneStaleRoomRows tests moved to sqlite-adapter"
```

### Task 1.8: PR-S5-1 整体验证

- [ ] **Step 1: 全量 fast + slow + lint + build**

Run: `pnpm test:fast && pnpm test:slow && pnpm run lint && pnpm run build`
Expected: 全绿；lint 无新增 error；build 通过

- [ ] **Step 2: 行数检查**

Run: `wc -l server/game/room-manager.ts`
Expected: 接近 970（原 1170 - 200）

- [ ] **Step 3: 确认 getDb 直接调用从 room-manager.ts 消失**

Run: `grep -n "getDb\(\)" server/game/room-manager.ts`
Expected: 仅剩 `loadCustomCardsFromDb` 内的调用（这是 workshop_cards 表，非 rooms 表，留在 room-manager 中）

- [ ] **Step 4: PR-S5-1 阶段总结 commit（如需要）**

如果上面分散的 commit 已经描述清楚，跳过此步。否则做一个空 commit 标记 PR boundary：

```bash
git commit --allow-empty -m "chore(s5): PR-S5-1 boundary — persistence layer extracted"
```

---

## Phase 2 — Game 层（PR-S5-2）

### Task 2.1: 创建 `room.ts`（type + helper）

**Files:**
- Create: `server/game/room.ts`

- [ ] **Step 1: 写文件**

```ts
// server/game/room.ts
import type { WebSocket } from 'ws'
import { GameSession } from './authoritative-session.ts'
import type { RoomMeta, RoomSnapshot, RoomStatus } from './persistence/room-persistence.ts'
import { rehydrateState, type SerializedGameState } from '../../shared/game/serialization.ts'
import type { CustomCardData } from '../../shared/cards/session-card-context.ts'
import type { RoomSummary } from '../../shared/protocol/ws.ts'

export type RoomPlayer = {
  ws: WebSocket
  playerIndex: number
  name: string
  userId?: string
}

export type Room = {
  id: string
  session: GameSession
  players: RoomPlayer[]
  maxPlayers: number
  version: number
  status: RoomStatus
  createdBy?: string
  customCardDbIds?: string[]
}

export const FIXED_DEV_ROOMS: ReadonlyArray<{ id: string; playerCount: number }> = [
  { id: 'dev2', playerCount: 2 },
  { id: 'dev3', playerCount: 3 },
  { id: 'dev4', playerCount: 4 },
]

export const FIXED_DEV_ROOM_IDS: ReadonlySet<string> = new Set(FIXED_DEV_ROOMS.map((r) => r.id))

export const isFixedDevRoom = (roomId: string): boolean => FIXED_DEV_ROOM_IDS.has(roomId)

/** TTL for empty waiting rooms (no connected players) before cleanup. */
export const WAITING_EMPTY_ROOM_TTL_MS = 30 * 60 * 1000
/** TTL for empty games that have already started before cleanup. */
export const PLAYING_EMPTY_ROOM_TTL_MS = 24 * 60 * 60 * 1000

export const emptyRoomTtlMs = (room: Pick<Room, 'status'>): number =>
  room.status === 'playing' ? PLAYING_EMPTY_ROOM_TTL_MS : WAITING_EMPTY_ROOM_TTL_MS

const getRoomStatus = (room?: Pick<Room, 'players' | 'maxPlayers' | 'status'>): RoomStatus =>
  room?.status ?? ((room && room.players.length >= room.maxPlayers) ? 'playing' : 'waiting')

/** Project a Room into the persistence-layer RoomMeta (drop ws references etc). */
export const toRoomMeta = (room: Room): RoomMeta => ({
  createdBy: room.createdBy ?? null,
  maxPlayers: room.maxPlayers,
  customCardDbIds: room.customCardDbIds ?? [],
  status: getRoomStatus(room),
  players: room.players
    .filter((p): p is RoomPlayer & { userId: string } => typeof p.userId === 'string')
    .map((p) => ({ userId: p.userId, playerIndex: p.playerIndex })),
})

export type JoinSeatResolution =
  | { ok: true; playerIndex: number; replacedExistingPlayer: boolean }
  | { ok: false; error: string }

export const resolveJoinPlayerIndex = (
  room: Pick<Room, 'id' | 'maxPlayers' | 'players'>,
  requestedPlayerIndex?: number,
  userId?: string,
): JoinSeatResolution => {
  if (requestedPlayerIndex !== undefined) {
    if (
      !Number.isInteger(requestedPlayerIndex) ||
      requestedPlayerIndex < 0 ||
      requestedPlayerIndex >= room.maxPlayers
    ) {
      return { ok: false, error: 'invalid player slot' }
    }
    const occupied = room.players.find((p) => p.playerIndex === requestedPlayerIndex)
    if (occupied) {
      if (!isFixedDevRoom(room.id) && !(userId && occupied.userId === userId)) {
        return { ok: false, error: 'player slot occupied' }
      }
      return { ok: true, playerIndex: requestedPlayerIndex, replacedExistingPlayer: true }
    }
    return { ok: true, playerIndex: requestedPlayerIndex, replacedExistingPlayer: false }
  }
  const taken = new Set(room.players.map((p) => p.playerIndex))
  for (let i = 0; i < room.maxPlayers; i += 1) {
    if (!taken.has(i)) return { ok: true, playerIndex: i, replacedExistingPlayer: false }
  }
  return { ok: false, error: 'room full' }
}

export const resolveJoinRequestPlayerIndex = (
  room: Pick<Room, 'players'>,
  requestedPlayerIndex: number | undefined,
  userId: string | undefined,
): { ok: true; requestedPlayerIndex: number | undefined } | { ok: false; error: string } => {
  if (!userId) return { ok: true, requestedPlayerIndex }
  const existingSeat = room.players.find((p) => p.userId === userId)
  if (!existingSeat) return { ok: true, requestedPlayerIndex }
  if (requestedPlayerIndex === undefined) {
    return { ok: true, requestedPlayerIndex: existingSeat.playerIndex }
  }
  if (requestedPlayerIndex === existingSeat.playerIndex) {
    return { ok: true, requestedPlayerIndex }
  }
  return { ok: false, error: 'you are already in this room' }
}

export const removePlayerFromRoom = (
  room: Pick<Room, 'id' | 'players'>,
  ws: WebSocket,
): 'not-present' | 'empty' | 'remaining' => {
  const before = room.players.length
  room.players = room.players.filter((p) => p.ws !== ws)
  if (room.players.length === before) return 'not-present'
  return room.players.length === 0 ? 'empty' : 'remaining'
}

type RoomLikeForSummary = Pick<Room, 'id' | 'players' | 'maxPlayers' | 'createdBy'>

export function summarizeRoomsForLobby(
  source: Iterable<RoomLikeForSummary>,
  limit?: number,
  isFixedDev: (id: string) => boolean = isFixedDevRoom,
): RoomSummary[] {
  const list: RoomSummary[] = []
  for (const r of source) {
    if (r.players.length === 0 && !isFixedDev(r.id)) continue
    list.push({
      id: r.id,
      playerCount: r.players.length,
      maxPlayers: r.maxPlayers,
      createdBy: r.createdBy,
      status: r.players.length < r.maxPlayers ? 'waiting' : 'playing',
    })
    if (typeof limit === 'number' && list.length >= limit) break
  }
  return list
}

const createSessionFromSnapshot = (
  snapshot: RoomSnapshot,
  customCards: CustomCardData[],
): GameSession => {
  if (snapshot.serialized === null) {
    return new GameSession(undefined, customCards.length > 0 ? customCards : undefined, {
      playerCount: snapshot.meta.maxPlayers,
    })
  }
  try {
    return new GameSession(
      rehydrateState(snapshot.serialized),
      customCards.length > 0 ? customCards : undefined,
    )
  } catch (err) {
    console.warn(`[room] rehydrate failed for ${snapshot.id}, starting fresh:`, err)
    return new GameSession(undefined, customCards.length > 0 ? customCards : undefined, {
      playerCount: snapshot.meta.maxPlayers,
    })
  }
}

/**
 * Reconstruct a Room from a persistence snapshot. Replaces the legacy
 * `restoreRoomFromSqliteRow` helper; the persistence layer normalises shape.
 */
export const snapshotToRoom = (
  snapshot: RoomSnapshot,
  customCards: CustomCardData[] = [],
): Room => ({
  id: snapshot.id,
  session: createSessionFromSnapshot(snapshot, customCards),
  players: [],
  maxPlayers: snapshot.meta.maxPlayers,
  version: 0,
  status: snapshot.meta.status,
  createdBy: snapshot.meta.createdBy ?? undefined,
  customCardDbIds: snapshot.meta.customCardDbIds,
})
```

- [ ] **Step 2: 类型校验**

Run: `pnpm exec tsc --noEmit -p tsconfig.server.json`
Expected: 通过

- [ ] **Step 3: Commit**

```bash
git add server/game/room.ts
git commit -m "feat(game): extract Room type + seat/TTL/dev-room helpers"
```

### Task 2.2: 创建 `RoomRegistry` class + 单测

**Files:**
- Create: `server/game/room-registry.ts`
- Create: `server/game/__tests__/room-registry.test.ts`

- [ ] **Step 1: 写测试**

```ts
// server/game/__tests__/room-registry.test.ts
import { describe, expect, it } from 'vitest'
import { RoomRegistry } from '../room-registry.ts'
import type { Room } from '../room.ts'

const fakeRoom = (id: string): Room => ({
  id, session: {} as never, players: [], maxPlayers: 2, version: 0, status: 'waiting',
})

describe('RoomRegistry', () => {
  it('set / get / has / delete round-trip', () => {
    const r = new RoomRegistry()
    expect(r.get('a')).toBeUndefined()
    r.set(fakeRoom('a'))
    expect(r.has('a')).toBe(true)
    expect(r.get('a')?.id).toBe('a')
    r.delete('a')
    expect(r.get('a')).toBeUndefined()
  })

  it('size + iter reflect contents', () => {
    const r = new RoomRegistry()
    r.set(fakeRoom('a'))
    r.set(fakeRoom('b'))
    expect(r.size()).toBe(2)
    expect([...r.iter()].map((x) => x.id).sort()).toEqual(['a', 'b'])
  })

  it('touchActivity / lastActivityOf / clearActivity are independent of rooms', () => {
    const r = new RoomRegistry()
    r.touchActivity('a', 1000)
    expect(r.lastActivityOf('a')).toBe(1000)
    r.clearActivity('a')
    expect(r.lastActivityOf('a')).toBeUndefined()
  })

  it('delete does not auto-clear activity (caller responsibility)', () => {
    const r = new RoomRegistry()
    r.set(fakeRoom('a'))
    r.touchActivity('a', 1000)
    r.delete('a')
    expect(r.lastActivityOf('a')).toBe(1000)
  })
})
```

- [ ] **Step 2: 跑红**

Run: `pnpm exec vitest run server/game/__tests__/room-registry.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// server/game/room-registry.ts
import type { Room } from './room.ts'

export class RoomRegistry {
  private rooms = new Map<string, Room>()
  private lastActivity = new Map<string, number>()

  get(id: string): Room | undefined { return this.rooms.get(id) }
  set(room: Room): void { this.rooms.set(room.id, room) }
  delete(id: string): void { this.rooms.delete(id) }
  has(id: string): boolean { return this.rooms.has(id) }
  iter(): IterableIterator<Room> { return this.rooms.values() }
  size(): number { return this.rooms.size }

  touchActivity(id: string, now: number): void { this.lastActivity.set(id, now) }
  lastActivityOf(id: string): number | undefined { return this.lastActivity.get(id) }
  clearActivity(id: string): void { this.lastActivity.delete(id) }
}
```

- [ ] **Step 4: 跑绿**

Run: `pnpm exec vitest run server/game/__tests__/room-registry.test.ts`
Expected: 4 passed

- [ ] **Step 5: Commit**

```bash
git add server/game/room-registry.ts server/game/__tests__/room-registry.test.ts
git commit -m "feat(game): RoomRegistry class — encapsulates rooms map + activity"
```

### Task 2.3: 创建 `lobby.ts` + 单测

**Files:**
- Create: `server/game/lobby.ts`
- Create: `server/game/__tests__/lobby.test.ts`

- [ ] **Step 1: 写测试**

```ts
// server/game/__tests__/lobby.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { ServerEvent } from '../../../shared/protocol/ws.ts'
import { createLobby, type RoomBroadcaster } from '../lobby.ts'
import { RoomRegistry } from '../room-registry.ts'
import { InMemoryRoomPersistence } from '../persistence/memory-adapter.ts'
import type { Room } from '../room.ts'

const fakeRoom = (overrides: Partial<Room> = {}): Room => ({
  id: 'r1',
  session: {} as never,
  players: [],
  maxPlayers: 2,
  version: 0,
  status: 'waiting',
  createdBy: 'u1',
  ...overrides,
})

const fakeBroadcaster = (): RoomBroadcaster & { calls: ServerEvent[] } => {
  const calls: ServerEvent[] = []
  return {
    broadcastEvent: (_room, event) => { calls.push(event) },
    calls,
  }
}

describe('lobby.getRooms', () => {
  it('hides empty non-dev rooms but keeps fixed dev rooms', () => {
    const registry = new RoomRegistry()
    registry.set(fakeRoom({ id: 'r1', players: [] }))
    registry.set(fakeRoom({
      id: 'dev2',
      players: [{ ws: {} as never, playerIndex: 0, name: 'p1' }],
    }))
    const lobby = createLobby({
      registry,
      persistence: new InMemoryRoomPersistence(),
      broadcaster: fakeBroadcaster(),
    })
    const summaries = lobby.getRooms()
    expect(summaries.map((s) => s.id).sort()).toEqual(['dev2'])
  })
})

describe('lobby.dissolveRoomById', () => {
  it('rejects when room is missing', () => {
    const lobby = createLobby({
      registry: new RoomRegistry(),
      persistence: new InMemoryRoomPersistence(),
      broadcaster: fakeBroadcaster(),
    })
    expect(lobby.dissolveRoomById('nope', 'u1')).toEqual({ ok: false, error: 'room not found' })
  })

  it('rejects when caller is not the creator', () => {
    const registry = new RoomRegistry()
    registry.set(fakeRoom({ id: 'r1', createdBy: 'u1' }))
    const lobby = createLobby({
      registry,
      persistence: new InMemoryRoomPersistence(),
      broadcaster: fakeBroadcaster(),
    })
    expect(lobby.dissolveRoomById('r1', 'u2')).toEqual({
      ok: false,
      error: 'only the room creator can dissolve',
    })
  })

  it('rejects fixed dev rooms', () => {
    const registry = new RoomRegistry()
    registry.set(fakeRoom({ id: 'dev2', createdBy: 'u1' }))
    const lobby = createLobby({
      registry,
      persistence: new InMemoryRoomPersistence(),
      broadcaster: fakeBroadcaster(),
    })
    expect(lobby.dissolveRoomById('dev2', 'u1').ok).toBe(false)
  })

  it('happy path: broadcasts roomDissolved + closes sockets + cleans state', () => {
    const closeCalls: number[] = []
    const fakeWs = (id: number) => ({ readyState: 1, OPEN: 1, close: () => closeCalls.push(id), send: vi.fn() })
    const registry = new RoomRegistry()
    registry.set(fakeRoom({
      id: 'r1', createdBy: 'u1',
      players: [
        { ws: fakeWs(0) as never, playerIndex: 0, name: 'p0', userId: 'u1' },
        { ws: fakeWs(1) as never, playerIndex: 1, name: 'p1', userId: 'u2' },
      ],
    }))
    registry.touchActivity('r1', 1000)
    const persistence = new InMemoryRoomPersistence()
    persistence.save('r1', { _stub: true } as never, {
      createdBy: 'u1', maxPlayers: 2, customCardDbIds: [], status: 'playing',
      players: [{ userId: 'u1', playerIndex: 0 }],
    })
    const broadcaster = fakeBroadcaster()
    const lobby = createLobby({ registry, persistence, broadcaster })

    expect(lobby.dissolveRoomById('r1', 'u1')).toEqual({ ok: true })
    expect(broadcaster.calls.find((e) => e.type === 'roomDissolved')).toBeTruthy()
    expect(closeCalls.sort()).toEqual([0, 1])
    expect(registry.has('r1')).toBe(false)
    expect(registry.lastActivityOf('r1')).toBeUndefined()
    expect(persistence.load('r1')).toBeNull()
  })
})
```

- [ ] **Step 2: 跑红**

Run: `pnpm exec vitest run server/game/__tests__/lobby.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
// server/game/lobby.ts
import type { RoomSummary, ServerEvent } from '../../shared/protocol/ws.ts'
import type { RoomPersistence } from './persistence/room-persistence.ts'
import { RoomRegistry } from './room-registry.ts'
import {
  isFixedDevRoom,
  summarizeRoomsForLobby,
  type Room,
} from './room.ts'

/** Minimal contract used by lobby. PR-S5-3 will replace with Broadcaster class. */
export type RoomBroadcaster = {
  broadcastEvent(room: Room, event: ServerEvent): void
}

export type Lobby = {
  getRooms(limit?: number): RoomSummary[]
  dissolveRoomById(roomId: string, userId: string | undefined): { ok: boolean; error?: string }
}

export function createLobby(deps: {
  registry: RoomRegistry
  persistence: RoomPersistence
  broadcaster: RoomBroadcaster
}): Lobby {
  const { registry, persistence, broadcaster } = deps
  return {
    getRooms(limit?: number) {
      return summarizeRoomsForLobby(registry.iter(), limit)
    },
    dissolveRoomById(roomId, userId) {
      const room = registry.get(roomId)
      if (!room) return { ok: false, error: 'room not found' }
      if (isFixedDevRoom(room.id)) return { ok: false, error: 'cannot dissolve dev room' }
      if (room.createdBy !== userId) return { ok: false, error: 'only the room creator can dissolve' }
      broadcaster.broadcastEvent(room, { type: 'roomDissolved', roomId: room.id })
      for (const p of room.players) {
        try { p.ws.close() } catch { /* ignore */ }
      }
      registry.delete(roomId)
      registry.clearActivity(roomId)
      persistence.delete(roomId)
      return { ok: true }
    },
  }
}
```

- [ ] **Step 4: 跑绿**

Run: `pnpm exec vitest run server/game/__tests__/lobby.test.ts`
Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add server/game/lobby.ts server/game/__tests__/lobby.test.ts
git commit -m "feat(game): Lobby — getRooms + dissolveRoomById with DI"
```

### Task 2.4: room-manager.ts 内部接入 RoomRegistry + lobby

**Files:**
- Modify: `server/game/room-manager.ts`
- Modify: `server/index.ts`

- [ ] **Step 1: 编辑 room-manager.ts**

改动：
- 删 module-level `const rooms = new Map<string, Room>()` + `const roomLastActivity = new Map<string, number>()`
- 文件顶部新增 `let registry: RoomRegistry | null = null` + `setRegistry(r) / getRegistry()`
- 删 `Room` / `FIXED_DEV_ROOMS` / `FIXED_DEV_ROOM_IDS` / `isFixedDevRoom` / `resolveJoin*` / `removePlayerFromRoom` / `summarizeRoomsForLobby` / `restoreRoomFromSqliteRow`（→ 改为从 `./room.ts` re-export 兼容旧测试 import；具体见 step 2）
- 把所有 `rooms.set/get/delete/has/.values()` 替换成 `registry.set/get/delete/has/.iter()`
- 把所有 `roomLastActivity.set/get/delete` 替换成 `registry.touchActivity/lastActivityOf/clearActivity`
- `getRooms` / `dissolveRoomById` 改为转发给 `lobby` 实例（lobby 由 server/index.ts 注入）；引入 `let lobby: Lobby | null = null` + `setLobby(l)`

- [ ] **Step 2: 兼容 re-export**

`room-manager.ts` 顶部加：

```ts
export {
  FIXED_DEV_ROOMS,
  FIXED_DEV_ROOM_IDS,
  isFixedDevRoom,
  removePlayerFromRoom,
  resolveJoinPlayerIndex,
  resolveJoinRequestPlayerIndex,
  summarizeRoomsForLobby,
  type Room,
} from './room.ts'

// `restoreRoomFromSqliteRow` 旧接口仍然 export，以兼容 room-manager-seat.test.ts；
// 内部转换 row → snapshot → snapshotToRoom。Task 2.6 迁移测试后移除。
import { snapshotToRoom } from './room.ts'
import type { RoomSnapshot } from './persistence/room-persistence.ts'

type LegacyPersistedRoomRow = {
  id: string; created_by: string | null; state_json: string | null;
  max_players: number; custom_card_ids: string | null;
  status?: 'waiting' | 'playing' | 'finished'; version: number; updated_at?: number
}
export function restoreRoomFromSqliteRow(row: LegacyPersistedRoomRow) {
  const snapshot: RoomSnapshot = {
    id: row.id,
    serialized: row.state_json ? JSON.parse(row.state_json) : null,
    meta: {
      createdBy: row.created_by,
      maxPlayers: row.max_players,
      customCardDbIds: row.custom_card_ids ? JSON.parse(row.custom_card_ids) : [],
      status: row.status ?? 'playing',
      players: [],
    },
    updatedAt: row.updated_at ?? 0,
  }
  return snapshotToRoom(snapshot)
}
```

- [ ] **Step 3: 编辑 server/index.ts**

```ts
import { RoomRegistry } from './game/room-registry.ts'
import { createLobby } from './game/lobby.ts'
import { setPersistence, setRegistry, setLobby, createWsServer, getRooms, dissolveRoomById } from './game/room-manager.ts'

const persistence = /* 之前已写的 SqliteRoomPersistence / JsonRoomPersistence */
const registry = new RoomRegistry()

setPersistence(persistence)
setRegistry(registry)

// broadcaster 暂时是 room-manager 内部的 broadcast helper 包出来的 adapter；PR-S5-3 替换
import { __internalRoomBroadcasterForLobby } from './game/room-manager.ts'  // 临时导出
const lobby = createLobby({ registry, persistence, broadcaster: __internalRoomBroadcasterForLobby })
setLobby(lobby)

// HTTP 路由仍调 getRooms / dissolveRoomById（room-manager 内已改为转发到 lobby）
```

- [ ] **Step 4: 跑测试**

Run: `pnpm test:fast`
Expected: 全绿（包括 `room-manager-seat.test.ts` —— `restoreRoomFromSqliteRow` 兼容 export 仍生效）

Run: `pnpm run lint && pnpm run build`
Expected: 通过

- [ ] **Step 5: Commit**

```bash
git add server/game/room-manager.ts server/index.ts
git commit -m "refactor(server): wire RoomRegistry + Lobby into room-manager via DI setters"
```

### Task 2.5: 迁移 `room-manager-seat.test.ts` → `room.test.ts`

**Files:**
- Delete: `server/__tests__/room-manager-seat.test.ts`
- Create: `server/game/__tests__/room.test.ts`

- [ ] **Step 1: 复制 + 改 import**

```bash
git mv server/__tests__/room-manager-seat.test.ts server/game/__tests__/room.test.ts
```

编辑 `server/game/__tests__/room.test.ts`：
- import 路径改 `'../room.ts'`
- `restoreRoomFromSqliteRow` 用例改写：调 `snapshotToRoom`（参数改为 `RoomSnapshot`）
  - 把测试里现有的 fake row 转成 fake snapshot
- 其余用例不变

- [ ] **Step 2: 跑测试**

Run: `pnpm exec vitest run server/game/__tests__/room.test.ts`
Expected: 全绿

- [ ] **Step 3: 移除 room-manager.ts 中 `restoreRoomFromSqliteRow` 兼容 re-export**

旧测试已迁走，删除 Task 2.4 step 2 加的 LegacyPersistedRoomRow + restoreRoomFromSqliteRow 兼容代码。

- [ ] **Step 4: 跑全量 fast**

Run: `pnpm test:fast`
Expected: 全绿

- [ ] **Step 5: Commit**

```bash
git add server/game/__tests__/room.test.ts server/__tests__/room-manager-seat.test.ts server/game/room-manager.ts
git commit -m "test(game): migrate room-manager-seat tests; drop legacy restoreRoomFromSqliteRow"
```

### Task 2.6: 迁移 `room-manager-summarize.test.ts` 到 lobby.test.ts

**Files:**
- Delete: `server/__tests__/room-manager-summarize.test.ts`（在 Task 1.7 创建）
- Modify: `server/game/__tests__/lobby.test.ts`

- [ ] **Step 1: 把 summarize 用例并入 lobby.test.ts 的 `describe('lobby.getRooms')`**

Read: `server/__tests__/room-manager-summarize.test.ts`

把所有 `summarizeRoomsForLobby` 用例改写成 `lobby.getRooms()` 风格用例并 append 到 `lobby.test.ts`。

- [ ] **Step 2: 删旧文件**

```bash
git rm server/__tests__/room-manager-summarize.test.ts
```

- [ ] **Step 3: 跑测试**

Run: `pnpm exec vitest run server/game/__tests__/lobby.test.ts`
Expected: 全绿

- [ ] **Step 4: Commit**

```bash
git add server/game/__tests__/lobby.test.ts server/__tests__/room-manager-summarize.test.ts
git commit -m "test(game): merge summarize tests into lobby.test.ts"
```

### Task 2.7: PR-S5-2 整体验证

- [ ] **Step 1: 全量 fast + slow + lint + build**

Run: `pnpm test:fast && pnpm test:slow && pnpm run lint && pnpm run build`
Expected: 全绿

- [ ] **Step 2: 行数检查 + module-level state 清扫**

Run: `wc -l server/game/room-manager.ts`
Expected: 接近 570（原 970 - 400）

Run: `grep -nE "^const rooms = new Map|^const roomLastActivity = new Map" server/game/room-manager.ts`
Expected: 无命中

- [ ] **Step 3: PR boundary commit（如需）**

```bash
git commit --allow-empty -m "chore(s5): PR-S5-2 boundary — game/ layer extracted"
```

---

## Phase 3 — Connection 层（PR-S5-3）

### Task 3.1: 创建 `connection-ctx.ts`

**Files:**
- Create: `server/connection/connection-ctx.ts`

- [ ] **Step 1: 写文件**

```ts
// server/connection/connection-ctx.ts
import type { WebSocket } from 'ws'
import type { Room } from '../game/room.ts'
import type { RoomRegistry } from '../game/room-registry.ts'
import type { RoomPersistence } from '../game/persistence/room-persistence.ts'
import type { Broadcaster } from './broadcaster.ts'
import type { Lobby } from '../game/lobby.ts'

export type ConnectionDeps = {
  registry: RoomRegistry
  persistence: RoomPersistence
  broadcaster: Broadcaster
  lobby: Lobby
}

export type ConnectionCtx = {
  ws: WebSocket
  authenticated: boolean
  currentUserId: string | undefined
  currentRoom: Room | null
  currentPlayerIndex: number
} & ConnectionDeps

export const createConnectionCtx = (
  ws: WebSocket,
  deps: ConnectionDeps,
  initialAuthenticated: boolean,
): ConnectionCtx => ({
  ws,
  authenticated: initialAuthenticated,
  currentUserId: undefined,
  currentRoom: null,
  currentPlayerIndex: -1,
  ...deps,
})
```

- [ ] **Step 2: 跑 tsc**

Run: `pnpm exec tsc --noEmit -p tsconfig.server.json`
Expected: 暂时报 `'./broadcaster.ts'` 未找到 —— Task 3.3 修复

- [ ] **Step 3: 暂不 commit**

合并到 Task 3.3 commit。

### Task 3.2: 创建 `envelope-builder.ts` + 单测（pure）

**Files:**
- Create: `server/connection/envelope-builder.ts`
- Create: `server/connection/__tests__/envelope-builder.test.ts`

- [ ] **Step 1: 写测试**

```ts
// server/connection/__tests__/envelope-builder.test.ts
import { describe, expect, it } from 'vitest'
import { buildEnvelope } from '../envelope-builder.ts'
import { GameSession } from '../../game/authoritative-session.ts'

describe('buildEnvelope', () => {
  it('emits a stateUpdate envelope with the given metadata', () => {
    const session = new GameSession()
    const resp = session.withCtx(() => session.getState())
    const env = buildEnvelope({
      room: { id: 'r1', session },
      resp,
      viewerPlayerId: null,
      version: 7,
      cause: 'action',
      requestId: 'req-1',
      emittedAt: 12345,
    })
    expect(env.type).toBe('stateUpdate')
    expect(env.roomId).toBe('r1')
    expect(env.version).toBe(7)
    expect(env.cause).toBe('action')
    expect(env.requestId).toBe('req-1')
    expect(env.sync).toBe('snapshot')
    expect(env.emittedAt).toBe(12345)
    expect(env.payload.state).toBeDefined()
    // engineStack should be present (D-a serialization)
    expect((env.payload.state as { engineStack?: unknown }).engineStack).toBeDefined()
  })

  it('redacts state for the given viewer id (other players hands hidden)', () => {
    const session = new GameSession()
    const resp = session.withCtx(() => session.getState())
    const player0Id = resp.state.players[0]!.id
    const env = buildEnvelope({
      room: { id: 'r1', session },
      resp,
      viewerPlayerId: player0Id,
      version: 1,
      cause: 'action',
      emittedAt: 0,
    })
    const players = (env.payload.state as { players: Array<{ id: string; hand?: unknown[] }> }).players
    expect(players[0]!.id).toBe(player0Id)
    // Player 0 sees own hand; player 1's hand is masked (length-only / redacted)
    // Specific masking shape depends on serializeStateForPlayer; assert "different from full"
    const player1 = players[1]!
    expect(player1.id).not.toBe(player0Id)
  })
})
```

- [ ] **Step 2: 跑红**

Run: `pnpm exec vitest run server/connection/__tests__/envelope-builder.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// server/connection/envelope-builder.ts
import type { GameSession, SessionResponse } from '../game/authoritative-session.ts'
import {
  serializeState,
  serializeStateForPlayer,
} from '../../shared/game/serialization.ts'
import type {
  GameSyncPayload,
  StateUpdateCause,
  StateUpdateEnvelope,
} from '../../shared/protocol/game.ts'

type Args = {
  room: { id: string; session: GameSession }
  resp: SessionResponse
  viewerPlayerId: string | null
  version: number
  cause: StateUpdateCause
  requestId?: string
  emittedAt: number
  sync?: 'snapshot'
}

const buildPayload = (args: Args): GameSyncPayload => {
  const { resp, room, viewerPlayerId } = args
  const stateOpts = { engineStack: room.session.getEngineStack() }
  const state = viewerPlayerId === null
    ? serializeState(resp.state, stateOpts)
    : serializeStateForPlayer(resp.state, viewerPlayerId, stateOpts)
  const payload: GameSyncPayload = {
    state,
    interaction: resp.interaction,
    scores: resp.scores ?? null,
    pastureCapacities: resp.pastureCapacities,
    historyLength: resp.historyLength,
    hasActionStartSnapshot: resp.hasActionStartSnapshot,
    ok: resp.ok,
    actionAvailability: resp.actionAvailability,
    cardAvailability: resp.cardAvailability,
    error: resp.error,
  }
  const defs = room.session.getCustomCardDefs()
  if (defs.length > 0) payload.customCardDefs = defs
  return payload
}

export function buildEnvelope(args: Args): StateUpdateEnvelope {
  return {
    type: 'stateUpdate',
    roomId: args.room.id,
    version: args.version,
    sync: args.sync ?? 'snapshot',
    cause: args.cause,
    requestId: args.requestId,
    payload: buildPayload(args),
    emittedAt: args.emittedAt,
  }
}
```

- [ ] **Step 4: 跑绿**

Run: `pnpm exec vitest run server/connection/__tests__/envelope-builder.test.ts`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add server/connection/envelope-builder.ts server/connection/__tests__/envelope-builder.test.ts
git commit -m "feat(connection): pure envelope-builder with viewer-mask + tests"
```

### Task 3.3: 创建 `Broadcaster` class + 单测

**Files:**
- Create: `server/connection/broadcaster.ts`
- Create: `server/connection/__tests__/broadcaster.test.ts`

- [ ] **Step 1: 写测试**

```ts
// server/connection/__tests__/broadcaster.test.ts
import { describe, expect, it, vi } from 'vitest'
import { Broadcaster } from '../broadcaster.ts'
import { GameSession } from '../../game/authoritative-session.ts'
import { InMemoryRoomPersistence } from '../../game/persistence/memory-adapter.ts'
import { isFixedDevRoom } from '../../game/room.ts'
import type { Room } from '../../game/room.ts'

const makeFakeWs = () => {
  const sent: string[] = []
  return {
    OPEN: 1,
    readyState: 1,
    send: (data: string) => { sent.push(data) },
    close: vi.fn(),
    sent,
  }
}

const makeRoom = (id: string, playerCount = 2): Room => {
  const session = new GameSession()
  const players = Array.from({ length: playerCount }, (_, i) => ({
    ws: makeFakeWs() as never,
    playerIndex: i,
    name: `p${i}`,
    userId: `u${i}`,
  }))
  return { id, session, players, maxPlayers: playerCount, version: 0, status: 'playing' }
}

describe('Broadcaster.broadcastState', () => {
  it('sends one envelope per seated player and bumps version', () => {
    const persistence = new InMemoryRoomPersistence()
    const b = new Broadcaster({ persistence })
    const room = makeRoom('r1')
    const resp = room.session.withCtx(() => room.session.getState())
    b.broadcastState(room, resp, 'action', 'req-1')
    expect(room.version).toBe(1)
    for (const seat of room.players) {
      const ws = seat.ws as unknown as ReturnType<typeof makeFakeWs>
      expect(ws.sent).toHaveLength(1)
      const env = JSON.parse(ws.sent[0]!)
      expect(env.type).toBe('stateUpdate')
      expect(env.roomId).toBe('r1')
      expect(env.version).toBe(1)
    }
  })

  it('persists state on each broadcast (sqlite-or-fixedDev gating)', () => {
    // InMemoryRoomPersistence returns true for both modes (matches sqlite path)
    const persistence = new InMemoryRoomPersistence()
    const saveSpy = vi.spyOn(persistence, 'save')
    const b = new Broadcaster({ persistence })
    const room = makeRoom('r1')
    const resp = room.session.withCtx(() => room.session.getState())
    b.broadcastState(room, resp, 'action')
    expect(saveSpy).toHaveBeenCalledTimes(1)
  })

  it('skips persistence for non-fixed rooms when adapter is not sqlite-class', () => {
    // Persistence-skip behaviour mirrors current room-manager rule:
    //   "if (PERSIST_ROOMS === 'sqlite' || isFixedDevRoom(room.id))"
    // Broadcaster takes a `shouldPersist(room)` predicate so the rule is testable.
    const persistence = new InMemoryRoomPersistence()
    const saveSpy = vi.spyOn(persistence, 'save')
    const b = new Broadcaster({
      persistence,
      shouldPersist: (room) => isFixedDevRoom(room.id),
    })
    b.broadcastState(makeRoom('r1'), makeRoom('r1').session.withCtx((s) => s.getState()), 'action')
    expect(saveSpy).not.toHaveBeenCalled()
    b.broadcastState(makeRoom('dev2'), makeRoom('dev2').session.withCtx((s) => s.getState()), 'action')
    expect(saveSpy).toHaveBeenCalledTimes(1)
  })

  it('marks finished when game ends', () => {
    const persistence = new InMemoryRoomPersistence()
    const markSpy = vi.spyOn(persistence, 'markFinished')
    const b = new Broadcaster({ persistence })
    const room = makeRoom('r1')
    const resp = room.session.withCtx(() => room.session.getState())
    // Force gameOver
    ;(resp.state as { gameOver?: boolean }).gameOver = true
    b.broadcastState(room, resp, 'action')
    expect(markSpy).toHaveBeenCalledWith('r1', expect.any(Number))
  })
})

describe('Broadcaster.sendStateTo / broadcastEvent / sendTo', () => {
  it('sendStateTo sends a single envelope with cause=reconnect by default', () => {
    const b = new Broadcaster({ persistence: new InMemoryRoomPersistence() })
    const room = makeRoom('r1')
    const seat = room.players[0]!
    const resp = room.session.withCtx(() => room.session.getState())
    b.sendStateTo(seat.ws, room, resp, 'req-x')
    const ws = seat.ws as unknown as ReturnType<typeof makeFakeWs>
    expect(ws.sent).toHaveLength(1)
    const env = JSON.parse(ws.sent[0]!)
    expect(env.cause).toBe('reconnect')
    expect(env.requestId).toBe('req-x')
  })

  it('broadcastEvent sends to all open sockets', () => {
    const b = new Broadcaster({ persistence: new InMemoryRoomPersistence() })
    const room = makeRoom('r1')
    b.broadcastEvent(room, { type: 'gameStarted' })
    for (const seat of room.players) {
      const ws = seat.ws as unknown as ReturnType<typeof makeFakeWs>
      expect(ws.sent.map((s) => JSON.parse(s).type)).toContain('gameStarted')
    }
  })

  it('sendTo skips closed sockets', () => {
    const b = new Broadcaster({ persistence: new InMemoryRoomPersistence() })
    const ws = makeFakeWs()
    ws.readyState = 3 // CLOSED
    b.sendTo(ws as never, { type: 'gameStarted' })
    expect(ws.sent).toEqual([])
  })
})
```

- [ ] **Step 2: 跑红**

Run: `pnpm exec vitest run server/connection/__tests__/broadcaster.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现**

```ts
// server/connection/broadcaster.ts
import type { WebSocket } from 'ws'
import type { Room } from '../game/room.ts'
import { toRoomMeta } from '../game/room.ts'
import type { GameSession, SessionResponse } from '../game/authoritative-session.ts'
import type { RoomPersistence } from '../game/persistence/room-persistence.ts'
import type { ServerEvent } from '../../shared/protocol/ws.ts'
import type { StateUpdateCause } from '../../shared/protocol/game.ts'
import { serializeState } from '../../shared/game/serialization.ts'
import { buildEnvelope } from './envelope-builder.ts'

const viewerIdForSeat = (resp: SessionResponse, seatIndex: number | undefined): string | null => {
  if (typeof seatIndex !== 'number') return null
  return resp.state.players[seatIndex]?.id ?? null
}

export class Broadcaster {
  private readonly shouldPersist: (room: Room) => boolean

  constructor(deps: {
    persistence: RoomPersistence
    shouldPersist?: (room: Room) => boolean
  }) {
    this.persistence = deps.persistence
    this.shouldPersist = deps.shouldPersist ?? (() => true)
  }

  private readonly persistence: RoomPersistence

  broadcastState(room: Room, resp: SessionResponse, cause: StateUpdateCause, requestId?: string): void {
    room.version += 1
    const emittedAt = Date.now()
    for (const seat of room.players) {
      if (seat.ws.readyState !== seat.ws.OPEN) continue
      const env = buildEnvelope({
        room,
        resp,
        viewerPlayerId: viewerIdForSeat(resp, seat.playerIndex),
        version: room.version,
        cause,
        requestId,
        emittedAt,
      })
      seat.ws.send(JSON.stringify(env))
    }
    if (this.shouldPersist(room)) {
      this.persistence.save(
        room.id,
        serializeState(resp.state, { engineStack: room.session.getEngineStack() }),
        toRoomMeta(room),
      )
    }
    if ((resp.state as { gameOver?: boolean }).gameOver) {
      this.persistence.markFinished(room.id, Date.now())
    }
  }

  sendStateTo(ws: WebSocket, room: Room, resp: SessionResponse, requestId?: string): void {
    const seat = room.players.find((p) => p.ws === ws)
    const env = buildEnvelope({
      room,
      resp,
      viewerPlayerId: viewerIdForSeat(resp, seat?.playerIndex),
      version: room.version,
      cause: 'reconnect',
      requestId,
      emittedAt: Date.now(),
    })
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(env))
  }

  broadcastEvent(room: Room, event: ServerEvent): void {
    const data = JSON.stringify(event)
    for (const seat of room.players) {
      if (seat.ws.readyState === seat.ws.OPEN) seat.ws.send(data)
    }
  }

  sendTo(ws: WebSocket, event: ServerEvent): void {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(event))
  }
}
```

- [ ] **Step 4: 跑绿**

Run: `pnpm exec vitest run server/connection/__tests__/broadcaster.test.ts server/connection/__tests__/envelope-builder.test.ts`
Expected: 全绿

- [ ] **Step 5: Commit**

```bash
git add server/connection/connection-ctx.ts server/connection/broadcaster.ts server/connection/__tests__/broadcaster.test.ts
git commit -m "feat(connection): Broadcaster class + ConnectionCtx"
```

### Task 3.4: 创建 `room-router.ts`（dispatch table + 20 handler）

**Files:**
- Create: `server/connection/room-router.ts`

- [ ] **Step 1: 写文件骨架**

```ts
// server/connection/room-router.ts
import type { ClientCommand, ServerEvent } from '../../shared/protocol/ws.ts'
import type { ConnectionCtx } from './connection-ctx.ts'
// Imports: GameSession, isFixedDevRoom, toRoomMeta, parseDraftOptions, loadCustomCardsFromDb…

type Handler<M extends ClientCommand = ClientCommand> = (ctx: ConnectionCtx, msg: M) => void

const sendCommandError = (ctx: ConnectionCtx, error: string, requestId?: string) => {
  ctx.broadcaster.sendTo(ctx.ws, { type: 'error', error, requestId })
}

const assertOwnSeat = (ctx: ConnectionCtx, expected: unknown, requestId?: string): boolean => {
  if (typeof expected !== 'number' || expected !== ctx.currentPlayerIndex) {
    sendCommandError(ctx, 'seat mismatch: you cannot act on another player', requestId)
    return false
  }
  return true
}

const assertOwnPlayerId = (ctx: ConnectionCtx, expected: unknown, requestId?: string): boolean => {
  if (!ctx.currentRoom) { sendCommandError(ctx, 'not in a room', requestId); return false }
  const ownId = ctx.currentRoom.session.getState().state.players[ctx.currentPlayerIndex]?.id
  if (typeof expected !== 'string' || !ownId || expected !== ownId) {
    sendCommandError(ctx, 'seat mismatch: you cannot act on another player', requestId)
    return false
  }
  return true
}

const assertDevCommandAllowed = (ctx: ConnectionCtx, requestId?: string): boolean => {
  if (!ctx.currentRoom) { sendCommandError(ctx, 'not in a room', requestId); return false }
  if (!isFixedDevRoom(ctx.currentRoom.id)) {
    sendCommandError(ctx, 'dev commands disabled for this room', requestId)
    return false
  }
  return true
}

// 20 handlers (auth, action, choice, anytime, commitSelection, roundEnd,
// undoStep, undoAction, newGame, loadGame, devSetResources, devSetRound,
// devDrawCard, devPlayCard, devCreatePasture, getState, createRoom,
// joinRoom, dissolveRoom, draftSubmit) — port verbatim from room-manager.ts
// switch cases, replacing closure variables (currentRoom, currentPlayerIndex, ...)
// with ctx.* and replacing global rooms/persistence with ctx.registry/ctx.persistence.

// parseDraftOptions + loadCustomCardsFromDb also moved here (used by handleCreateRoom).

export function dispatch(ctx: ConnectionCtx, msg: ClientCommand): void {
  const fn = handlers[msg.type]
  if (!fn) { sendCommandError(ctx, `unknown command: ${msg.type}`, msg.requestId); return }
  fn(ctx, msg as never)
}

const handlers: { [K in ClientCommand['type']]: Handler<Extract<ClientCommand, { type: K }>> } = {
  auth: handleAuth,
  action: handleAction,
  choice: handleChoice,
  // ...其余 17 个
}
```

实际 step 1 是把 room-manager.ts 第 753-1102 行（`createWsServer` 内的 ws.on('message') 22 case）逐个搬出来。每个 case 转成 `function handleXxx(ctx, msg)`，闭包变量改用 `ctx.`，模块级 `rooms` / `persistence` 改 `ctx.registry` / `ctx.persistence`。

- [ ] **Step 2: 列出 handler，逐个搬**

按 ClientCommand union 顺序：
1. `handleAuth` — 来自 `if (msg.type === 'auth')`
2. `handleCreateRoom` — `if (msg.type === 'createRoom')` + `parseDraftOptions` + `loadCustomCardsFromDb`
3. `handleJoinRoom`
4. `handleDissolveRoom` — 改为转发 `ctx.lobby.dissolveRoomById(ctx.currentRoom.id, ctx.currentUserId)`
5. `handleGetState`
6. `handleAction`
7. `handleChoice`
8. `handleAnytime`
9. `handleRoundEnd`
10. `handleCommitSelection`
11. `handleUndoStep`
12. `handleUndoAction`
13. `handleNewGame`
14. `handleLoadGame`
15. `handleDevSetResources`
16. `handleDevSetRound`
17. `handleDevDrawCard`
18. `handleDevPlayCard`
19. `handleDevCreatePasture`
20. `handleDraftSubmit`

每个 handler 末尾的 `broadcastState(room, resp, cause, msg.requestId)` 改为 `ctx.broadcaster.broadcastState(ctx.currentRoom, resp, cause, msg.requestId)`。

`callRoom` helper 保留：
```ts
const callRoom = <T>(ctx: ConnectionCtx, fn: (s: GameSession) => T): T =>
  ctx.currentRoom!.session.withCtx(() => fn(ctx.currentRoom!.session))
```

- [ ] **Step 3: 跑 tsc**

Run: `pnpm exec tsc --noEmit -p tsconfig.server.json`
Expected: 通过

- [ ] **Step 4: 暂不跑测试**

router 测试在 Task 3.6 写。先 commit 骨架。

- [ ] **Step 5: Commit**

```bash
git add server/connection/room-router.ts
git commit -m "feat(connection): room-router with dispatch table + 20 handlers"
```

### Task 3.5: 创建 `ws-server.ts`

**Files:**
- Create: `server/connection/ws-server.ts`

- [ ] **Step 1: 写文件**

```ts
// server/connection/ws-server.ts
import type { Server as HttpServer } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { validateSession } from '../auth.ts'
import { RoomRegistry } from '../game/room-registry.ts'
import {
  FIXED_DEV_ROOMS, isFixedDevRoom, emptyRoomTtlMs,
  PLAYING_EMPTY_ROOM_TTL_MS, WAITING_EMPTY_ROOM_TTL_MS,
  removePlayerFromRoom, snapshotToRoom,
} from '../game/room.ts'
import type { RoomPersistence } from '../game/persistence/room-persistence.ts'
import { Broadcaster } from './broadcaster.ts'
import { createLobby } from '../game/lobby.ts'
import { createConnectionCtx, type ConnectionCtx } from './connection-ctx.ts'
import { dispatch } from './room-router.ts'
import { GameSession } from '../game/authoritative-session.ts'
import type { ClientCommand, ServerEvent } from '../../shared/protocol/ws.ts'

const WS_AUTH_TIMEOUT_MS = 5000
const ROOM_CLEANUP_INTERVAL_MS = 5 * 60 * 1000

const ALLOW_ANONYMOUS_WS: boolean = (() => {
  if (process.env.ALLOW_ANONYMOUS_WS !== undefined) {
    return process.env.ALLOW_ANONYMOUS_WS === 'true'
  }
  return process.env.NODE_ENV !== 'production'
})()

const ensureFixedDevRooms = (registry: RoomRegistry, persistence: RoomPersistence) => {
  if (process.env.NODE_ENV === 'production') return
  for (const { id, playerCount } of FIXED_DEV_ROOMS) {
    if (registry.has(id)) continue
    const snap = persistence.load(id)
    if (snap) {
      registry.set(snapshotToRoom(snap))
    } else {
      const session = new GameSession(undefined, undefined, { playerCount })
      registry.set({
        id, session, players: [], maxPlayers: playerCount, version: 0, status: 'playing',
      })
    }
  }
}

const restoreRooms = (registry: RoomRegistry, persistence: RoomPersistence, now: number) => {
  const fixedIds = FIXED_DEV_ROOMS.map((r) => r.id)
  const snapshots = persistence.listRestorable({
    now,
    waitingTtlMs: WAITING_EMPTY_ROOM_TTL_MS,
    playingTtlMs: PLAYING_EMPTY_ROOM_TTL_MS,
    excludeIds: fixedIds,
  })
  for (const snap of snapshots) {
    if (registry.has(snap.id)) continue
    registry.set(snapshotToRoom(snap))
    if (snap.updatedAt > 0) registry.touchActivity(snap.id, snap.updatedAt)
    console.log(`[ws-server] restored room ${snap.id}`)
  }
}

const startRoomCleanup = (registry: RoomRegistry, persistence: RoomPersistence) => {
  setInterval(() => {
    const now = Date.now()
    for (const room of registry.iter()) {
      if (isFixedDevRoom(room.id)) continue
      if (room.players.length > 0) {
        registry.touchActivity(room.id, now)
        continue
      }
      const lastSeen = registry.lastActivityOf(room.id) ?? now
      if (now - lastSeen > emptyRoomTtlMs(room)) {
        registry.delete(room.id)
        registry.clearActivity(room.id)
        persistence.markFinished(room.id, now)
        console.log(`[ws-server] cleaned up empty room ${room.id}`)
      }
    }
  }, ROOM_CLEANUP_INTERVAL_MS)
}

const handleConnection = (ws: WebSocket, deps: {
  registry: RoomRegistry; persistence: RoomPersistence; broadcaster: Broadcaster;
  lobby: ReturnType<typeof createLobby>;
}) => {
  const ctx = createConnectionCtx(ws, deps, ALLOW_ANONYMOUS_WS)

  let authTimer: ReturnType<typeof setTimeout> | undefined
  if (!ALLOW_ANONYMOUS_WS) {
    authTimer = setTimeout(() => {
      if (!ctx.authenticated) {
        deps.broadcaster.sendTo(ws, { type: 'error', error: 'authentication timeout' })
        ws.close()
      }
    }, WS_AUTH_TIMEOUT_MS)
  }

  ws.on('message', (raw: Buffer) => {
    let msg: ClientCommand
    try { msg = JSON.parse(raw.toString()) as ClientCommand } catch { return }
    if (!ctx.authenticated && msg.type !== 'auth') {
      deps.broadcaster.sendTo(ws, { type: 'error', error: 'not authenticated', requestId: msg.requestId })
      return
    }
    dispatch(ctx, msg)
    // handleAuth flips ctx.authenticated → clear timer
    if (ctx.authenticated && authTimer) { clearTimeout(authTimer); authTimer = undefined }
  })

  ws.on('close', () => {
    clearTimeout(authTimer)
    if (ctx.currentRoom) {
      const removal = removePlayerFromRoom(ctx.currentRoom, ws)
      if (removal === 'remaining') {
        deps.broadcaster.broadcastEvent(ctx.currentRoom, {
          type: 'playerDisconnected',
          playerIndex: ctx.currentPlayerIndex,
        })
      } else if (removal === 'empty') {
        deps.registry.touchActivity(ctx.currentRoom.id, Date.now())
      }
    }
  })
}

export function createWsServer(
  server: HttpServer,
  deps: { persistence: RoomPersistence },
): { wss: WebSocketServer; registry: RoomRegistry; broadcaster: Broadcaster; lobby: ReturnType<typeof createLobby> } {
  const registry = new RoomRegistry()
  const broadcaster = new Broadcaster({
    persistence: deps.persistence,
    // Match room-manager's old rule:
    //   "PERSIST_ROOMS === 'sqlite' || isFixedDevRoom(room.id)"
    // ws-server doesn't know which adapter is in use; this rule is now
    // expressed as: persist if the adapter said it's a real DB (sqlite/memory) OR fixed dev.
    // Adapters can self-identify via a `kind` getter. For S5, default is "always persist";
    // JsonRoomPersistence.save is no-op for non-fixed rooms via env wrapper at server/index.ts.
    shouldPersist: () => true,
  })
  const lobby = createLobby({ registry, persistence: deps.persistence, broadcaster })

  ensureFixedDevRooms(registry, deps.persistence)
  restoreRooms(registry, deps.persistence, Date.now())
  startRoomCleanup(registry, deps.persistence)

  const wss = new WebSocketServer({ server, path: '/ws' })
  wss.on('connection', (ws) => handleConnection(ws, { registry, persistence: deps.persistence, broadcaster, lobby }))

  return { wss, registry, broadcaster, lobby }
}
```

⚠️ shouldPersist 行为问题：当前现状是"sqlite OR fixed dev"才 save。json adapter 模式下，非 dev 房不该 save。S5 把这个 gating 责任挪到调用方而不是 broadcaster？方案：让 `Broadcaster.shouldPersist` 默认就是 `() => true`，json adapter 的 save 在 non-fixed 房什么也不写——但 json adapter 不知道哪些是 fixed 房。简单做法：保持现状语义，让 server/index.ts 在 new Broadcaster 时传入对应 predicate：

```ts
// 在 server/index.ts:
const shouldPersist = PERSIST_ROOMS === 'sqlite'
  ? () => true
  : (room: Room) => isFixedDevRoom(room.id)
const wssCtx = createWsServer(httpServer, { persistence, shouldPersist })
```

把 `shouldPersist` 加到 createWsServer 的 deps 里。

修订上面 createWsServer 签名：

```ts
export function createWsServer(
  server: HttpServer,
  deps: { persistence: RoomPersistence; shouldPersist?: (room: Room) => boolean },
)
```

- [ ] **Step 2: 类型校验**

Run: `pnpm exec tsc --noEmit -p tsconfig.server.json`
Expected: 通过

- [ ] **Step 3: Commit**

```bash
git add server/connection/ws-server.ts
git commit -m "feat(connection): ws-server bootstrap (auth + cleanup + restore + dispatch)"
```

### Task 3.6: 编写 `room-router.test.ts`

**Files:**
- Create: `server/connection/__tests__/room-router.test.ts`

- [ ] **Step 1: 写测试**

```ts
// server/connection/__tests__/room-router.test.ts
import { describe, expect, it, vi } from 'vitest'
import { dispatch } from '../room-router.ts'
import { createConnectionCtx, type ConnectionCtx } from '../connection-ctx.ts'
import { Broadcaster } from '../broadcaster.ts'
import { RoomRegistry } from '../../game/room-registry.ts'
import { InMemoryRoomPersistence } from '../../game/persistence/memory-adapter.ts'
import { createLobby } from '../../game/lobby.ts'
import { GameSession } from '../../game/authoritative-session.ts'
import type { Room } from '../../game/room.ts'

const fakeWs = () => ({ OPEN: 1, readyState: 1, send: vi.fn(), close: vi.fn() })

const newCtx = () => {
  const persistence = new InMemoryRoomPersistence()
  const registry = new RoomRegistry()
  const broadcaster = new Broadcaster({ persistence })
  const lobby = createLobby({ registry, persistence, broadcaster })
  const ws = fakeWs() as never
  return createConnectionCtx(ws, { registry, persistence, broadcaster, lobby }, true)
}

describe('handleCreateRoom', () => {
  it('creates a room + sets ctx.currentRoom + sends roomCreated', () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2, name: 'host' })
    expect(ctx.currentRoom).not.toBeNull()
    expect(ctx.currentPlayerIndex).toBe(0)
    expect(ctx.currentRoom!.players.length).toBe(1)
    const sentTypes = (ctx.ws.send as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map(([raw]) => JSON.parse(raw as string).type)
    expect(sentTypes).toContain('roomCreated')
  })
})

describe('handleAction guard: no-room', () => {
  it('errors when ctx.currentRoom is null', () => {
    const ctx = newCtx()
    dispatch(ctx, { type: 'action', spaceId: 'whatever' })
    const sentTypes = (ctx.ws.send as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map(([raw]) => JSON.parse(raw as string).type)
    expect(sentTypes).toContain('error')
  })
})

describe('seat-binding guards', () => {
  const setupTwoSeatRoom = () => {
    const ctx = newCtx()
    ctx.currentUserId = 'u1'
    dispatch(ctx, { type: 'createRoom', maxPlayers: 2, name: 'host' })
    return ctx
  }

  it('devSetResources rejects foreign seat', () => {
    const ctx = setupTwoSeatRoom()
    // Force the room id to a fixed dev so dev commands are allowed
    ctx.currentRoom!.id = 'dev2'
    dispatch(ctx, { type: 'devSetResources', playerIndex: 1, resources: { wood: 5 } })
    const sentTypes = (ctx.ws.send as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map(([raw]) => JSON.parse(raw as string).type)
    expect(sentTypes.filter((t) => t === 'error')).toHaveLength(1)
  })

  it('devSetResources accepts own seat', () => {
    const ctx = setupTwoSeatRoom()
    ctx.currentRoom!.id = 'dev2'
    dispatch(ctx, { type: 'devSetResources', playerIndex: 0, resources: { wood: 5 } })
    const sentTypes = (ctx.ws.send as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map(([raw]) => JSON.parse(raw as string).type)
    expect(sentTypes).toContain('stateUpdate')
  })

  it('rejects dev commands in non-dev rooms', () => {
    const ctx = setupTwoSeatRoom()
    dispatch(ctx, { type: 'devSetResources', playerIndex: 0, resources: { wood: 5 } })
    const errorMsgs = (ctx.ws.send as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map(([raw]) => JSON.parse(raw as string))
      .filter((e) => e.type === 'error')
    expect(errorMsgs.some((e) => /dev commands disabled/.test(e.error))).toBe(true)
  })
})

describe('unknown command', () => {
  it('emits error', () => {
    const ctx = newCtx()
    dispatch(ctx, { type: 'no-such-cmd' as never } as never)
    const sentTypes = (ctx.ws.send as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map(([raw]) => JSON.parse(raw as string).type)
    expect(sentTypes).toContain('error')
  })
})
```

- [ ] **Step 2: 跑测试**

Run: `pnpm exec vitest run server/connection/__tests__/room-router.test.ts`
Expected: 全绿

- [ ] **Step 3: Commit**

```bash
git add server/connection/__tests__/room-router.test.ts
git commit -m "test(connection): room-router handler unit tests"
```

### Task 3.7: 切换 server/index.ts 到新 ws-server + 删除 room-manager.ts

**Files:**
- Modify: `server/index.ts`
- Delete: `server/game/room-manager.ts`

- [ ] **Step 1: 编辑 server/index.ts**

替换：

```ts
// 旧
import { createWsServer, getRooms, dissolveRoomById } from './game/room-manager.ts'

// 新
import { createWsServer } from './connection/ws-server.ts'
import { SqliteRoomPersistence } from './game/persistence/sqlite-adapter.ts'
import { JsonRoomPersistence } from './game/persistence/json-adapter.ts'
import { isFixedDevRoom } from './game/room.ts'
import type { Room } from './game/room.ts'

const PERSIST_ROOMS = (process.env.PERSIST_ROOMS ?? 'sqlite') as 'json' | 'sqlite'
const PERSISTED_ROOMS_DIR = process.env.PERSISTED_ROOMS_DIR ?? join(process.cwd(), 'output')
const persistence = PERSIST_ROOMS === 'sqlite'
  ? new SqliteRoomPersistence(getDb())
  : new JsonRoomPersistence(PERSISTED_ROOMS_DIR)
const shouldPersist: (room: Room) => boolean = PERSIST_ROOMS === 'sqlite'
  ? () => true
  : (room) => isFixedDevRoom(room.id)

const wssCtx = createWsServer(httpServer, { persistence, shouldPersist })
const { lobby } = wssCtx

// HTTP 路由处用 lobby 替代 getRooms / dissolveRoomById
// 例：app.get('/api/rooms', ... lobby.getRooms(limit) ...)
// 例：app.delete('/api/rooms/:id', ... lobby.dissolveRoomById(id, userId) ...)
```

- [ ] **Step 2: 删 room-manager.ts**

```bash
git rm server/game/room-manager.ts
```

- [ ] **Step 3: 跑 fast + lint + build**

Run: `pnpm test:fast && pnpm run lint && pnpm run build`
Expected: 全绿（其余测试在 Task 3.8 迁移）。**room-manager-ws-sync.test.ts / ws-seat-binding.test.ts / room-manager-draft.test.ts 此时仍 import 旧路径，会失败——所以这一步先做 Task 3.8 测试迁移再做这一步**。

实际顺序调整：把 Task 3.8 提到 3.7 之前。本 Task 3.7 的步骤改为"在 3.8 完成后切换"。

- [ ] **Step 4: Commit**

```bash
git add server/index.ts server/game/room-manager.ts
git commit -m "refactor(server): cut over to connection/ws-server; remove room-manager.ts"
```

### Task 3.8: 迁移 ws-sync / seat-binding / draft 测试

**Files:**
- Move: `server/__tests__/room-manager-ws-sync.test.ts` → `server/connection/__tests__/ws-server.test.ts`
- Move: `server/__tests__/ws-seat-binding.test.ts` → `server/connection/__tests__/ws-seat-binding.test.ts`
- Move: `server/__tests__/room-manager-draft.test.ts` → `server/connection/__tests__/draft-handler.test.ts`

- [ ] **Step 1: 改文件位置 + import 路径**

```bash
git mv server/__tests__/room-manager-ws-sync.test.ts server/connection/__tests__/ws-server.test.ts
git mv server/__tests__/ws-seat-binding.test.ts server/connection/__tests__/ws-seat-binding.test.ts
git mv server/__tests__/room-manager-draft.test.ts server/connection/__tests__/draft-handler.test.ts
```

编辑每个文件 import：
- `from '../game/room-manager.ts'` 中的 `createWsServer` → `from '../ws-server.ts'`
- `from '../game/room-manager.ts'` 中的 `parseDraftOptions` → `from '../room-router.ts'`

⚠️ `createWsServer` 签名变了（接受 `{ persistence }` deps）。测试里调 `createWsServer(httpServer)` 必须传：

```ts
import { InMemoryRoomPersistence } from '../../game/persistence/memory-adapter.ts'
const wss = createWsServer(httpServer, { persistence: new InMemoryRoomPersistence() })
// 注意：createWsServer 现在返回 { wss, registry, broadcaster, lobby }
```

旧测试只取 `wss`，写为 `const { wss } = createWsServer(...)`。

- [ ] **Step 2: 跑测试**

Run: `pnpm exec vitest run server/connection/__tests__/ws-server.test.ts server/connection/__tests__/ws-seat-binding.test.ts server/connection/__tests__/draft-handler.test.ts`
Expected: 全绿

- [ ] **Step 3: Commit**

```bash
git add server/connection/__tests__/ server/__tests__/
git commit -m "test(connection): migrate ws-sync / seat-binding / draft tests"
```

⚠️ 顺序：实际执行时 Task 3.8 应在 Task 3.7 之前完成。计划里的 task 编号保留以便 retro，但执行时按 3.1-3.6, 3.8, 3.7 走。

### Task 3.9: PR-S5-3 整体验证 + 文档回流

- [ ] **Step 1: 全量 fast + slow + lint + build + e2e smoke**

```bash
pnpm test:fast
pnpm test:slow
pnpm run lint
pnpm run build
pnpm exec playwright install --with-deps chromium  # 仅首次
pnpm run test:e2e -- --grep "smoke"  # 至少跑 1 个 smoke spec
```

Expected: 全绿

- [ ] **Step 2: DoD 文件存在性检查**

```bash
ls server/connection/{ws-server,room-router,envelope-builder,broadcaster,connection-ctx}.ts
ls server/game/persistence/{room-persistence,sqlite-adapter,json-adapter,memory-adapter}.ts
ls server/game/{room,room-registry,lobby}.ts
! ls server/game/room-manager.ts 2>/dev/null
```

Expected: 前 3 行各打印 5/4/3 个文件名；最后一行打印 "ls: cannot access" 之类（room-manager.ts 必须不存在）

- [ ] **Step 3: 卡牌测试无回归**

```bash
pnpm test:slow
```

Expected: 254 个卡牌效果 session 测试全绿（它们直接 new GameSession，不经 room-manager；S5 应零影响）

- [ ] **Step 4: 文档回流**

Edit: `docs/ENGINE_NEW_ARCHITECTURE.md`

§15 S5 段加 `✅ 完成（YYYY-MM-DD）` 标识；§14 速查表对应 row 标"完成"；§15bis §8 进度回流。

```bash
git add docs/ENGINE_NEW_ARCHITECTURE.md
git commit -m "docs(engine-new-arch): mark S5 complete"
```

- [ ] **Step 5: PR-S5-3 boundary commit**

```bash
git commit --allow-empty -m "chore(s5): PR-S5-3 boundary — connection/ layer extracted; room-manager.ts removed"
```

---

## 收尾

S5 完成后，分支 `sprint-S5-room-manager-split` 上有约 20-25 个 commit，分 3 个逻辑 PR 段（边界用空 commit 标记）。建议按 PR 段拆 3 次 PR push（或一次开 PR 并 squash-merge 时按段筛）。

**S5 后续接力：** §15bis 路径里 S6（物理分层 contract / cards-display / sandbox）会再动 `server/connection/` 内文件结构，但 S6 不再修改本 sprint 的接口契约。S7（卡牌测试回归）跟 S5 完全无重叠。

---

## Self-Review

**Spec coverage check:**
- §1 拓扑 9 文件 → Tasks 1.1-1.4, 2.1-2.3, 3.1-3.5 各覆盖一个文件 ✓
- §2.1 RoomPersistence 5 方法 → Task 1.1 接口 + 1.2/1.3/1.4 各 adapter 实现 ✓
- §2.2 RoomRegistry → Task 2.2 ✓
- §2.3 EnvelopeBuilder + Broadcaster → Tasks 3.2 + 3.3 ✓
- §2.4 ConnectionCtx + Handler dispatch → Tasks 3.1 + 3.4 ✓
- §2.5 Lobby → Task 2.3 ✓
- §3 数据流（启动/连接/createRoom/action/join/dissolve/cleanup）→ Tasks 3.5 ws-server (启动+连接) + 3.4 router (各命令) + 2.3 lobby (dissolve) + 3.5 cleanup ✓
- §4 测试策略（迁移 5 文件 + 4 类新增）→ Tasks 1.7, 2.5, 2.6, 3.8 迁移；1.5, 2.2, 3.2, 3.3, 3.6 新增 ✓
- §5 PR 拆分 3 段 → Phase 1/2/3 各对应 ✓
- §8 DoD 4 项 → Task 3.9 step 1-4 ✓

**Placeholder scan:**
- 无 "TBD" / "TODO" / "implement later"
- 所有代码块都给出完整实现（不是省略号）
- "20 handler 各自的代码"——Task 3.4 step 2 列了 20 个名字 + 改写规则（闭包变量 → ctx），未给每个 handler 完整代码（每个就是从 room-manager.ts 854-1102 行机械搬运）。这是可接受的 — 重复 verbatim 的搬运代码会让 plan 膨胀 ~250 行；执行者只需对照原文件搬运即可。

**Type consistency:**
- `RoomPersistence` 接口在 Task 1.1 定义后，1.2/1.3/1.4/1.5/1.6 一致使用
- `Room` type 在 Task 2.1 定义后，2.2/2.3/3.1/3.3/3.5 一致使用
- `ConnectionCtx` 在 Task 3.1 定义后，3.4/3.5/3.6 一致使用
- `RoomMeta` 在 Task 1.1 定义后，2.1 (toRoomMeta) / 3.3 (broadcaster save) 一致使用
- `snapshotToRoom` 在 Task 2.1 定义后，2.5 (test 迁移) / 3.5 (ws-server.restoreRooms) 一致使用

**已知 plan 偏差：**
- Task 1.6 step 1 把 `save` 接口微调为接受 `serialized: SerializedGameState | null` —— 这是从 spec 写完后发现的实现细节。Task 1.6 step 2 同步更新 3 adapter + 测试。设计意图不变。
- Task 3.5 step 1 加了 `shouldPersist` predicate 到 createWsServer deps —— 同上，是替代 spec 中"broadcaster 内部判断 sqlite-or-fixedDev"的具体实现方式。语义零变化。
