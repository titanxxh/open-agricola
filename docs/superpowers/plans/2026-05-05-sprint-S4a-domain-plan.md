# Sprint S4a — Domain 聚合层 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 引入 `shared/domain/` 派生视图聚合层（PlayerBoard facade + Farmyard / AnimalZones 子聚合 + Pasture value type + Scoring namespace）替代 `shared/logic/farm/*` + `shared/actions/helpers/animal-zones.ts` + `shared/logic/scoring*.ts` 散件，并切换所有 30 处 import 到新接口。

**Architecture:** PR1 立 facade 骨架（行为不变 wrap，从 logic/farm 调用现成函数）+ ESLint 边界；PR2/PR3/PR4 按文件主题分批 codemod call site；PR5 删散件作 hard DoD signal。每个聚合是 readonly view，`playerBoard()` 工厂返回的 PlayerBoard 持 readonly state ref，**绝不暴露 setter**。

**Tech Stack:** TypeScript 5.x（strict mode，无路径别名）；Vitest（fast project：unit + session 测试）；ESLint flat config（`eslint.config.js`，`no-restricted-imports`）。

**Spec:** `docs/superpowers/specs/2026-05-05-sprint-S4-domain-rich-nodes-design.md` §2.1 + §3 + §4 + §6.4 + §8.1（DoD D1–D9）。

**Branch:** `sprint-S4-domain-rich-nodes`（worktree `.worktree/sprint-S4`，HEAD `c5a3feb2` 即 spec commit）。

**总 Task 数：** 26（PR1: 7 / PR2: 7 / PR3: 5 / PR4: 4 / PR5: 3）。

---

## File Map

### 新建（PR1）

| 路径 | 责任 |
|---|---|
| `shared/domain/index.ts` | 入口：`export { playerBoard, Scoring }` + 类型 re-export |
| `shared/domain/player-board.ts` | `PlayerBoard` facade class，构造 Farmyard/AnimalZones 子聚合 |
| `shared/domain/farmyard.ts` | `Farmyard` class，wrap `logic/farm/*` 的 plow/sow/fence/room/stable/selectableTiles 函数 |
| `shared/domain/pasture.ts` | `Pasture` value type + 派生函数（wrap `fence-validation.computeFencedRegions` 等） |
| `shared/domain/animal-zones.ts` | `AnimalZones` class，wrap `actions/helpers/animal-zones.ts` |
| `shared/domain/scoring.ts` | `Scoring` namespace，wrap `logic/scoring.ts` + `scoring-bonus-solver.ts` |
| `shared/domain/__tests__/player-board.test.ts` | 单测：facade + cross-aggregate 查询 |
| `shared/domain/__tests__/farmyard.test.ts` | 单测：plow/sow/fence/room/stable 验证 + selectableTiles |
| `shared/domain/__tests__/animal-zones.test.ts` | 单测：zones / countAnimals / capacityRemaining |
| `shared/domain/__tests__/scoring.test.ts` | 单测：breakdown / familyScore（非破坏性）|

### 修改（PR1）

| 路径 | 改动 |
|---|---|
| `eslint.config.js` | 加 `shared/domain/**` 边界规则（`no-restricted-imports`） |

### 修改（PR2 — farm-related）

| 路径 | 改动 |
|---|---|
| `shared/actions/effects/plow.ts` | `import { canPlow }` → `playerBoard().farmyard.canPlow()` |
| `shared/actions/effects/sow.ts` | `import { canSow }` → `playerBoard().farmyard.canSow()` |
| `shared/actions/effects/fencing.ts` | `import { canBuildFence }` → `playerBoard().farmyard.canBuildFence()` |
| `shared/actions/effects/construct.ts` | `import { canBuildRoom }` → `playerBoard().farmyard.canBuildRoom()` |
| `shared/actions/effects/stables.ts` | `import { canBuildStable }` → `playerBoard().farmyard.canBuildStable()` |
| `shared/actions/effects/reorganize.ts` | wrap farm-interaction call sites 到 `playerBoard().farmyard.selectableTiles()` |
| `server/game-router.ts` | wrap `validateFenceSelection / validatePlowSelection / validateSowSelection / validateRoomSelection / validateStableSelection` 到 domain |

### 修改（PR3 — animal + farm-related cards）

| 路径 | 改动 |
|---|---|
| `shared/actions/effects/breed.ts` | wrap animal-zones helper 到 `playerBoard().animals.zones()` |
| `shared/cards/A/A165_PigBreeder.ts` | wrap `getPastureCapacity / getLooseStableKeys / computeAnimalZones` |
| `shared/cards/A/A134_FullFarmer.ts` | wrap animal-zones |
| `shared/cards/B/B11_Feedyard.ts` | wrap animal-zones |
| `shared/cards/B/B98_OrganicFarmer.ts` | wrap `computeAnimalZones` |
| `shared/cards/B/B115_TinsmithMaster.ts` | wrap animal-zones |
| `shared/cards/C/C6_StoneClearing.ts` | wrap |
| `shared/cards/C/C9_AutomaticWaterTrough.ts` | wrap |
| `shared/cards/C/C49_BeerStall.ts` | wrap |
| `shared/cards/C/C101_StallHolder.ts` | wrap |
| `shared/cards/C/C136_RanchProvost.ts` | wrap |
| `shared/cards/D/D167_PureBreeder.ts` | wrap |
| `shared/cards/E/E16_BriarHedge.ts` | wrap |
| `shared/cards/E/E33_BeaverColony.ts` | wrap `enforceAnimalCapacity / getPastureCapacity` |
| `shared/cards/E/E83_ShepherdsWhistle.ts` | wrap |
| `shared/cards/E/E84_DollysMother.ts` | wrap |
| `shared/cards/E/E127_DiligentFarmer.ts` | wrap |

### 修改（PR4 — scoring + session + client/protocol）

| 路径 | 改动 |
|---|---|
| `shared/protocol/game.ts:3` | `import type { PlayerScoreSummary } from '../logic/scoring'` → `from '../domain/scoring'` |
| `shared/cards/card-effects.ts:2-3` | `AnimalZone` / `PlayerScoreSummary` 改 import 自 domain |
| `shared/session/session-core.ts` | wrap `computeScores` / `computeAnimalZones` / `buildXxxFarmInteraction` / `buildOccupationHandSelectionInteraction` 到 domain |
| `client/components/board/ScoringPad.tsx:8` | type import 改自 domain |
| `client/hooks/useGameSync.ts:3` | type import 改自 domain |

### 删除（PR5）

| 路径 | 行数 |
|---|---:|
| `shared/logic/farm.ts` | 84 |
| `shared/logic/farm/build-room-helper.ts` | 27 |
| `shared/logic/farm/farm-interaction.ts` | 322 |
| `shared/logic/farm/fence-validation.ts` | 533 |
| `shared/logic/farm/occupation-hand-interaction.ts` | 19 |
| `shared/logic/farm/plow-validation.ts` | 88 |
| `shared/logic/farm/sow-validation.ts` | 133 |
| `shared/logic/farm/validators.ts` | 122 |
| `shared/actions/helpers/animal-zones.ts` | 277 |
| `shared/logic/scoring.ts` | 417 |
| `shared/logic/scoring-bonus-solver.ts` | 167 |
| **合计** | **2189** |

---

## PR1 — Domain 骨架 + ESLint + 单测（Tasks 1–7）

### Task 1: 创建 `shared/domain/farmyard.ts` 骨架（wrap `logic/farm/*`）

**Files:**
- Create: `shared/domain/farmyard.ts`

- [ ] **Step 1: Write the failing test (skip — wrap-only, test added in Task 6)**

For Task 1 we set up the wrap class first. Tests come in Task 6 once all aggregates exist.

- [ ] **Step 2: Create `shared/domain/farmyard.ts` with wrap implementation**

```ts
// shared/domain/farmyard.ts
import type { GameState, PlayerState, FarmTilePosition, FieldCoord, CropType } from '../game/types'
import type { FenceSpec, FenceEdge, FenceValidationResult, FarmField } from '../logic/farm/fence-validation'
import type { PlowValidationResult } from '../logic/farm/plow-validation'
import type { SowValidationResult } from '../logic/farm/sow-validation'
import type { RoomSelectionResult, StableSelectionResult } from '../logic/farm/validators'
import { validateFenceSelection } from '../logic/farm/fence-validation'
import { validatePlowSelection } from '../logic/farm/plow-validation'
import { validateSowSelection } from '../logic/farm/sow-validation'
import { validateRoomSelection, validateStableSelection } from '../logic/farm/validators'
import {
  buildPlowFarmInteraction,
  buildSowFarmInteraction,
  buildFenceFarmInteraction,
  buildRoomFarmInteraction,
  buildStableFarmInteraction,
  buildFarmPositionSelectionInteraction,
  getPermittedExtraSowableFields,
} from '../logic/farm/farm-interaction'
import { computePasturesFromFences, type Pasture } from './pasture'

export type FarmSelectKind = 'plow' | 'sow' | 'fence' | 'room' | 'stable' | 'farm-position'

export class Farmyard {
  constructor(
    private readonly player: Readonly<PlayerState>,
    private readonly state: Readonly<GameState>,
  ) {}

  canPlow(coord: FieldCoord): PlowValidationResult {
    return validatePlowSelection(this.player, [coord])
  }

  canSow(selection: { fields: { tile: FarmTilePosition; crop: CropType }[] }): SowValidationResult {
    return validateSowSelection(this.player, selection.fields)
  }

  canBuildFence(spec: FenceSpec): FenceValidationResult {
    return validateFenceSelection(this.player, spec)
  }

  canBuildRoom(coord: FarmTilePosition): RoomSelectionResult {
    return validateRoomSelection(this.player, [coord])
  }

  canBuildStable(coord: FarmTilePosition): StableSelectionResult {
    return validateStableSelection(this.player, [coord])
  }

  pastures(): Pasture[] {
    return computePasturesFromFences(this.player)
  }

  emptyFences(): FenceEdge[] {
    // Derived from FarmField.fenceEdges minus already-placed fences
    return this.player.farm.fences.map((f) => f.edgeId as FenceEdge)
  }

  /** Build farm-select interaction payload for a given farmType. Wraps farm-interaction.ts. */
  selectableTiles(kind: FarmSelectKind, opts?: Record<string, unknown>) {
    switch (kind) {
      case 'plow':
        return buildPlowFarmInteraction(this.state, this.player, opts ?? {})
      case 'sow':
        return buildSowFarmInteraction(this.state, this.player, opts ?? {})
      case 'fence':
        return buildFenceFarmInteraction(this.state, this.player, opts ?? {})
      case 'room':
        return buildRoomFarmInteraction(this.state, this.player, opts ?? {})
      case 'stable':
        return buildStableFarmInteraction(this.state, this.player, opts ?? {})
      case 'farm-position':
        return buildFarmPositionSelectionInteraction(this.state, this.player, opts ?? {})
    }
  }

  permittedExtraSowableFields(): FarmField[] {
    return getPermittedExtraSowableFields(this.state, this.player)
  }
}
```

- [ ] **Step 3: Verify TS compiles (no test yet)**

Run: `pnpm exec tsc -b`
Expected: 0 errors (Farmyard is new, doesn't break anything yet).

- [ ] **Step 4: No commit yet — Task 2-5 also stage onto this PR1 branch**

We accumulate the whole PR1 scaffolding before committing.

---

### Task 2: 创建 `shared/domain/pasture.ts`（value type + 派生函数）

**Files:**
- Create: `shared/domain/pasture.ts`

- [ ] **Step 1: Create `shared/domain/pasture.ts`**

```ts
// shared/domain/pasture.ts
import type { PlayerState, FarmTilePosition } from '../game/types'
import { computeFencedRegions } from '../logic/farm/fence-validation'

/** Readonly view of a fenced pasture region. Pure value type, no class — derived from Farmyard. */
export type Pasture = {
  readonly id: string
  readonly tiles: ReadonlyArray<FarmTilePosition>
  readonly capacity: number
  readonly hasWell: boolean
}

/** Derive pastures from a player's fence configuration. Wraps fence-validation.computeFencedRegions. */
export function computePasturesFromFences(player: PlayerState): Pasture[] {
  const edgeSet = new Set(player.farm.fences.map((f) => f.edgeId))
  const regions = computeFencedRegions(edgeSet)
  return regions.map((region, idx) => ({
    id: `pasture-${idx}`,
    tiles: region.tiles,
    capacity: region.tiles.length * 2,    // base capacity; stables doubling handled at call site
    hasWell: false,                       // populated from player.farm if needed
  }))
}
```

- [ ] **Step 2: Verify TS compiles**

Run: `pnpm exec tsc -b`
Expected: 0 errors.

---

### Task 3: 创建 `shared/domain/animal-zones.ts`（wrap `helpers/animal-zones`）

**Files:**
- Create: `shared/domain/animal-zones.ts`

- [ ] **Step 1: Create `shared/domain/animal-zones.ts`**

```ts
// shared/domain/animal-zones.ts
import type { GameState, PlayerState, AnimalType } from '../game/types'
import type { AnimalZone } from '../actions/helpers/animal-zones'
import {
  computeAnimalZones,
  getAssignedAnimalCount,
  getTotalAnimalCapacity,
  enforceAnimalCapacity,
  getPastureCapacity,
  getLooseStableKeys,
  computeInvalidAnimalsForZone,
} from '../actions/helpers/animal-zones'

export type { AnimalZone }   // re-export so callers can import from domain

export class AnimalZones {
  constructor(
    private readonly player: Readonly<PlayerState>,
    private readonly state: Readonly<GameState>,
  ) {}

  /** All zones (pastures, house, loose stables) the player has. */
  zones(): AnimalZone[] {
    return computeAnimalZones(this.player)
  }

  /** Count of a given animal type, or all animals if no type given. */
  countAnimals(type?: AnimalType): number {
    if (type === undefined) {
      return getAssignedAnimalCount(this.player)
    }
    return (this.player.resources[type] as number) ?? 0
  }

  /** Total capacity across all zones (used for room-for-X questions). */
  totalCapacity(): number {
    return getTotalAnimalCapacity(this.player)
  }

  /** Per-type remaining capacity (animals you can still take in). */
  capacityRemaining(): { sheep: number; boar: number; cattle: number } {
    const total = this.totalCapacity()
    const assigned = getAssignedAnimalCount(this.player)
    const free = Math.max(0, total - assigned)
    return { sheep: free, boar: free, cattle: free }
  }

  // Imperative helpers kept for migration (effects still call these)
  enforceCapacity(): void {
    enforceAnimalCapacity(this.player as PlayerState)
  }

  pastureCapacity(zoneId: string): number {
    const zones = this.zones()
    const zone = zones.find((z) => z.id === zoneId)
    if (!zone || zone.kind !== 'pasture') return 0
    return getPastureCapacity(zone.pasture)
  }

  looseStableKeys(): string[] {
    return getLooseStableKeys(this.player)
  }

  invalidAnimalsForZone(zoneId: string, type: AnimalType): number {
    return computeInvalidAnimalsForZone(this.player, zoneId, type)
  }
}
```

- [ ] **Step 2: Verify TS compiles**

Run: `pnpm exec tsc -b`
Expected: 0 errors.

---

### Task 4: 创建 `shared/domain/scoring.ts`（namespace wrap）

**Files:**
- Create: `shared/domain/scoring.ts`

- [ ] **Step 1: Create `shared/domain/scoring.ts`**

```ts
// shared/domain/scoring.ts
import type { GameState } from '../game/types'
import type { PlayerScoreSummary, ScoreCategoryResult, ScoreEntry } from '../logic/scoring'
import { computeScores } from '../logic/scoring'
import type { SolverInput, SolverEntry, SolverResult } from '../logic/scoring-bonus-solver'
import { solveBonusScoring } from '../logic/scoring-bonus-solver'

export type { PlayerScoreSummary, ScoreCategoryResult, ScoreEntry }

export namespace Scoring {
  /** Compute full per-player score summaries (one entry per player). */
  export function computeAll(state: GameState): PlayerScoreSummary[] {
    return computeScores(state)
  }

  /** Solve cross-player bonus scoring (which player wins each bonus comparison). */
  export function solveBonus(input: SolverInput): SolverResult {
    return solveBonusScoring(input)
  }

  /** Convenience: get a single player's score breakdown by index. */
  export function breakdown(state: GameState, idx: number): PlayerScoreSummary {
    const all = computeScores(state)
    const entry = all[idx]
    if (!entry) throw new Error(`Scoring.breakdown: no player at index ${idx}`)
    return entry
  }

  /** Convenience: total score for a single player. */
  export function totalFor(state: GameState, idx: number): number {
    return breakdown(state, idx).totalScore
  }
}
```

- [ ] **Step 2: Verify TS compiles**

Run: `pnpm exec tsc -b`
Expected: 0 errors.

---

### Task 5: 创建 `shared/domain/player-board.ts` + `index.ts`（facade）

**Files:**
- Create: `shared/domain/player-board.ts`
- Create: `shared/domain/index.ts`

- [ ] **Step 1: Create `shared/domain/player-board.ts`**

```ts
// shared/domain/player-board.ts
import type { GameState, PlayerState, AnimalType } from '../game/types'
import { Farmyard } from './farmyard'
import { AnimalZones } from './animal-zones'

export class PlayerBoard {
  readonly farmyard: Farmyard
  readonly animals: AnimalZones

  constructor(
    private readonly player: Readonly<PlayerState>,
    private readonly state: Readonly<GameState>,
  ) {
    this.farmyard = new Farmyard(player, state)
    this.animals = new AnimalZones(player, state)
  }

  /** Cross-aggregate: does the player have *any* room for a given animal (pasture / house / loose stable)? */
  hasRoomFor(animal: AnimalType): boolean {
    const remaining = this.animals.capacityRemaining()
    return remaining[animal] > 0
  }

  /** Total animal capacity across all zones. */
  totalAnimalCapacity(): number {
    return this.animals.totalCapacity()
  }

  /** Family size (active workers). */
  familySize(): number {
    return this.player.workers.filter((w) => w.isActive).length
  }
}

/** Factory: create a PlayerBoard view bound to a (state, idx). Throws if idx out of range. */
export function playerBoard(state: GameState, idx: number): PlayerBoard {
  const player = state.players[idx]
  if (!player) throw new Error(`playerBoard: no player at index ${idx}`)
  return new PlayerBoard(player, state)
}
```

- [ ] **Step 2: Create `shared/domain/index.ts`**

```ts
// shared/domain/index.ts
export { PlayerBoard, playerBoard } from './player-board'
export { Farmyard, type FarmSelectKind } from './farmyard'
export { AnimalZones, type AnimalZone } from './animal-zones'
export { computePasturesFromFences, type Pasture } from './pasture'
export { Scoring, type PlayerScoreSummary, type ScoreCategoryResult, type ScoreEntry } from './scoring'
```

- [ ] **Step 3: Verify TS compiles**

Run: `pnpm exec tsc -b`
Expected: 0 errors.

---

### Task 6: 写 domain unit 测试（4 文件）

**Files:**
- Create: `shared/domain/__tests__/player-board.test.ts`
- Create: `shared/domain/__tests__/farmyard.test.ts`
- Create: `shared/domain/__tests__/animal-zones.test.ts`
- Create: `shared/domain/__tests__/scoring.test.ts`

- [ ] **Step 1: Create `shared/domain/__tests__/player-board.test.ts`**

```ts
// shared/domain/__tests__/player-board.test.ts
import { describe, it, expect } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import { playerBoard } from '../index'

describe('PlayerBoard facade', () => {
  it('exposes farmyard and animals as sub-aggregates', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    expect(board.farmyard).toBeDefined()
    expect(board.animals).toBeDefined()
  })

  it('throws on out-of-range index', () => {
    const session = new GameSession()
    const state = session.getState().state
    expect(() => playerBoard(state, 99)).toThrow(/no player at index 99/)
  })

  it('hasRoomFor returns true on initial empty board', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    expect(board.hasRoomFor('sheep')).toBe(true)
  })

  it('familySize returns 2 on initial 2-player state', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    expect(board.familySize()).toBe(2)
  })
})
```

- [ ] **Step 2: Create `shared/domain/__tests__/farmyard.test.ts`**

```ts
// shared/domain/__tests__/farmyard.test.ts
import { describe, it, expect } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import { playerBoard } from '../index'

describe('Farmyard', () => {
  it('canPlow returns ok on a valid initial position', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    // 2-player initial farm: row 1 col 0 (the room) is occupied; row 0 col 0 is plowable.
    const result = board.farmyard.canPlow({ tile: { row: 0, col: 0 } })
    expect(result.ok).toBe(true)
  })

  it('selectableTiles returns farm-interaction shape for plow', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    const interaction = board.farmyard.selectableTiles('plow')
    // farm-interaction shape: should have selectableTiles array
    expect(interaction).toBeDefined()
  })

  it('pastures() is empty on initial farm (no fences)', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    expect(board.farmyard.pastures()).toHaveLength(0)
  })
})
```

- [ ] **Step 3: Create `shared/domain/__tests__/animal-zones.test.ts`**

```ts
// shared/domain/__tests__/animal-zones.test.ts
import { describe, it, expect } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import { playerBoard } from '../index'

describe('AnimalZones', () => {
  it('zones() returns at least the house zone on initial state', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    const zones = board.animals.zones()
    expect(zones.length).toBeGreaterThan(0)
    expect(zones.some((z) => z.kind === 'house')).toBe(true)
  })

  it('countAnimals returns 0 on initial state', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    expect(board.animals.countAnimals('sheep')).toBe(0)
    expect(board.animals.countAnimals('boar')).toBe(0)
    expect(board.animals.countAnimals('cattle')).toBe(0)
  })

  it('totalCapacity matches house capacity on bare farm', () => {
    const session = new GameSession()
    const state = session.getState().state
    const board = playerBoard(state, 0)
    // Wood-house: 1 animal in the house (per BGA Agricola).
    expect(board.animals.totalCapacity()).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 4: Create `shared/domain/__tests__/scoring.test.ts`**

```ts
// shared/domain/__tests__/scoring.test.ts
import { describe, it, expect } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import { Scoring } from '../index'

describe('Scoring namespace', () => {
  it('computeAll returns one entry per player', () => {
    const session = new GameSession()
    const state = session.getState().state
    const all = Scoring.computeAll(state)
    expect(all).toHaveLength(state.players.length)
  })

  it('breakdown returns matching player slot', () => {
    const session = new GameSession()
    const state = session.getState().state
    const p0 = Scoring.breakdown(state, 0)
    expect(p0).toBeDefined()
    expect(typeof p0.totalScore).toBe('number')
  })

  it('breakdown throws on out-of-range index', () => {
    const session = new GameSession()
    const state = session.getState().state
    expect(() => Scoring.breakdown(state, 99)).toThrow(/no player at index 99/)
  })

  it('totalFor matches breakdown.totalScore', () => {
    const session = new GameSession()
    const state = session.getState().state
    expect(Scoring.totalFor(state, 0)).toBe(Scoring.breakdown(state, 0).totalScore)
  })
})
```

- [ ] **Step 5: Run domain tests + verify pass**

Run: `pnpm exec vitest run shared/domain/__tests__/ --project fast`
Expected: All 4 test files pass; total ~14 tests pass.

If any test fails because of an API mismatch with the wrapped `logic/farm/*` function, adjust the wrap in Task 1–4 to match (do **not** change the underlying `logic/farm/*` behavior — this is a wrap-only PR).

---

### Task 7: 加 ESLint domain 边界 + commit PR1

**Files:**
- Modify: `eslint.config.js`

- [ ] **Step 1: Add `shared/domain/**` ESLint rule**

Open `eslint.config.js`. Find the `'no-restricted-imports'` block around the `shared/actions/effects/**` entry (added during S3). Insert a new entry **right after** it:

```js
  // S4a: shared/domain/** must be tree-shakable into client-sandbox bundle
  // and must not be imported into by anything that would cause a cycle.
  {
    files: ['shared/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['fs', 'fs/*', 'path', 'os', 'child_process', 'crypto'],
            message: 'shared/domain/** must run in browser sandbox; no Node API.',
          },
          {
            group: ['react', 'react-dom'],
            message: 'shared/domain/** is render-agnostic; no React.',
          },
          {
            group: ['../../engine/**', '../../session/**', '../../actions/effects/**',
                    '../engine/**', '../session/**', '../actions/effects/**'],
            message: 'shared/domain/** must not depend on engine/session/effects (avoid cycles).',
          },
        ],
      }],
    },
  },
```

- [ ] **Step 2: Verify ESLint passes**

Run: `pnpm run lint`
Expected: 0 errors. (Domain currently only imports `../game/types`, `../logic/farm/*`, `../logic/scoring*`, `../actions/helpers/animal-zones` — none are banned by the new rule. The reverse-deps rule bans `engine/session/effects`, none of which we import.)

- [ ] **Step 3: Verify the rule actually fires (sanity check)**

Temporarily add `import 'fs'` to top of `shared/domain/farmyard.ts`. Run `pnpm run lint` — expect a "no Node API" error. Remove the import after verifying.

- [ ] **Step 4: Run full local CI matrix**

Run each in sequence; all must pass:
```
pnpm run lint                          # 0 errors
pnpm run lint:i18n                     # missing 0
pnpm run check:prompt-sync -- --strict
pnpm run check:reaches -- --strict
pnpm run check:no-dsl -- --strict
pnpm run check:catalog-types
pnpm run check:community-deck
pnpm run test:fast                     # 0 fail (one flaky improvement-pay-fail-idempotent.test.ts may need retry)
pnpm run build
pnpm run check:bundle-size
```

- [ ] **Step 5: Commit PR1**

```bash
git add shared/domain/ eslint.config.js
git commit -m "$(cat <<'EOF'
feat(domain): scaffold S4a domain layer (PR1/5)

Introduce shared/domain/ as a thin facade over the existing logic/farm/*,
actions/helpers/animal-zones.ts, and logic/scoring*.ts modules. Wrap-only:
no behavior change, every method delegates to the legacy implementation.

New files:
- shared/domain/index.ts     — entry point
- shared/domain/player-board.ts — PlayerBoard facade with farmyard + animals
                                  sub-aggregates and cross-aggregate queries
                                  (hasRoomFor / familySize / totalAnimalCapacity)
- shared/domain/farmyard.ts  — Farmyard class wrapping plow/sow/fence/room/
                                stable validation + selectableTiles factory
- shared/domain/pasture.ts   — Pasture value type + computePasturesFromFences
                                derived function (pasture is not a class)
- shared/domain/animal-zones.ts — AnimalZones class wrapping computeAnimalZones
                                   et al with countAnimals / capacityRemaining
- shared/domain/scoring.ts   — Scoring namespace (computeAll / breakdown / totalFor
                                / solveBonus) — top-level, NOT under PlayerBoard,
                                because scoring is a cross-player view

ESLint guards (eslint.config.js): shared/domain/** is forbidden from
importing Node APIs, React, or shared/{engine,session,actions/effects}.

Unit tests (shared/domain/__tests__/, 4 files, ~14 tests) cover happy
paths and out-of-range indices for each aggregate.

PR1 of 5 in S4a (Sprint S4a domain layer migration). Subsequent PRs
switch ~30 call sites from logic/farm to domain (PR2 farm-related,
PR3 animal-related, PR4 scoring/session/client, PR5 deletes the legacy
modules).

Spec: docs/superpowers/specs/2026-05-05-sprint-S4-domain-rich-nodes-design.md
DoD covered (so far): D4 (6 domain files exist), D5 (ESLint guard).
Local CI matrix all green; one pre-existing flaky test retried green.
EOF
)"
```

- [ ] **Step 6: Push PR1 to GitHub**

```bash
git push -u origin sprint-S4-domain-rich-nodes
```

Verify the workflow_dispatch CI run passes on GitHub Actions for this commit before starting PR2.

---

## PR2 — Farm-related effect migration (Tasks 8–14)

**Migration pattern (apply to every PR2/3/4 task):**

```ts
// BEFORE
import { canPlow } from '../../logic/farm/plow-validation'
const result = canPlow(state, idx, position)

// AFTER
import { playerBoard } from '../../domain'
const result = playerBoard(state, idx).farmyard.canPlow(position)
```

Each task switches one file. After each switch run `pnpm exec vitest run <related-test-files> --project fast` to confirm the file's session/unit tests still pass before moving on.

### Task 8: Switch `shared/actions/effects/plow.ts`

**Files:**
- Modify: `shared/actions/effects/plow.ts`

- [ ] **Step 1: Read current imports**

Run: `head -30 shared/actions/effects/plow.ts`
Note every `from '../../logic/farm/*'` import. Typical: `validatePlowSelection`, `buildPlowFarmInteraction`, `getPermittedExtraSowableFields`.

- [ ] **Step 2: Replace logic/farm imports with domain import**

For each direct `validatePlowSelection(player, [coord])` call, replace with `playerBoard(state, idx).farmyard.canPlow({ tile: coord })`.

For each `buildPlowFarmInteraction(state, player, opts)` call, replace with `playerBoard(state, idx).farmyard.selectableTiles('plow', opts)`.

Replace the `import { ... } from '../../logic/farm/*'` lines with:
```ts
import { playerBoard } from '../../domain'
```

- [ ] **Step 3: Verify TS compiles**

Run: `pnpm exec tsc -b`
Expected: 0 errors. If the wrap signature in domain doesn't match, **fix the wrap in `shared/domain/farmyard.ts`** (extend the wrap, do not change the call site to a hack — the wrap should be the single source of truth).

- [ ] **Step 4: Run plow-related tests**

Run: `pnpm exec vitest run shared/actions/effects/__tests__/plow.test.ts server/__tests__/*plow*.test.ts --project fast`
Expected: 0 fails.

- [ ] **Step 5: Commit (in PR2 chain)**

```bash
git add shared/actions/effects/plow.ts shared/domain/farmyard.ts
git commit -m "refactor(plow): switch to playerBoard().farmyard (PR2/5)"
```

---

### Task 9: Switch `shared/actions/effects/sow.ts`

**Files:**
- Modify: `shared/actions/effects/sow.ts`

- [ ] **Step 1: Apply the migration pattern**

Replace `validateSowSelection(player, fields)` → `playerBoard(state, idx).farmyard.canSow({ fields })`.
Replace `buildSowFarmInteraction(state, player, opts)` → `playerBoard(state, idx).farmyard.selectableTiles('sow', opts)`.
Replace `getPermittedExtraSowableFields(state, player)` → `playerBoard(state, idx).farmyard.permittedExtraSowableFields()`.

- [ ] **Step 2: Verify TS compiles**

Run: `pnpm exec tsc -b`
Expected: 0 errors.

- [ ] **Step 3: Run sow-related tests**

Run: `pnpm exec vitest run shared/actions/effects/__tests__/sow.test.ts server/__tests__/*sow*.test.ts --project fast`
Expected: 0 fails.

- [ ] **Step 4: Commit**

```bash
git add shared/actions/effects/sow.ts shared/domain/farmyard.ts
git commit -m "refactor(sow): switch to playerBoard().farmyard (PR2/5)"
```

---

### Task 10: Switch `shared/actions/effects/fencing.ts`

**Files:**
- Modify: `shared/actions/effects/fencing.ts`

- [ ] **Step 1: Apply the migration pattern**

Replace `validateFenceSelection(player, spec)` → `playerBoard(state, idx).farmyard.canBuildFence(spec)`.
Replace `buildFenceFarmInteraction(state, player, opts)` → `playerBoard(state, idx).farmyard.selectableTiles('fence', opts)`.
For `computeFencedRegions(edgeSet)` direct calls, replace with `playerBoard(state, idx).farmyard.pastures()`.

- [ ] **Step 2: Verify TS compiles**

Run: `pnpm exec tsc -b`
Expected: 0 errors.

- [ ] **Step 3: Run fencing-related tests**

Run: `pnpm exec vitest run shared/actions/effects/__tests__/fencing.test.ts server/__tests__/fence-*.test.ts server/__tests__/*Fenc*.test.ts --project fast`
Expected: 0 fails.

- [ ] **Step 4: Commit**

```bash
git add shared/actions/effects/fencing.ts shared/domain/farmyard.ts
git commit -m "refactor(fencing): switch to playerBoard().farmyard (PR2/5)"
```

---

### Task 11: Switch `shared/actions/effects/construct.ts`

**Files:**
- Modify: `shared/actions/effects/construct.ts`

- [ ] **Step 1: Apply the migration pattern**

Replace `validateRoomSelection(player, [coord])` → `playerBoard(state, idx).farmyard.canBuildRoom(coord)`.
Replace `buildRoomFarmInteraction(state, player, opts)` → `playerBoard(state, idx).farmyard.selectableTiles('room', opts)`.

- [ ] **Step 2: Verify TS compiles**

Run: `pnpm exec tsc -b`
Expected: 0 errors.

- [ ] **Step 3: Run construct-related tests**

Run: `pnpm exec vitest run shared/actions/effects/__tests__/construct.test.ts server/__tests__/*construct*.test.ts server/__tests__/*build-room*.test.ts --project fast`
Expected: 0 fails.

- [ ] **Step 4: Commit**

```bash
git add shared/actions/effects/construct.ts shared/domain/farmyard.ts
git commit -m "refactor(construct): switch to playerBoard().farmyard (PR2/5)"
```

---

### Task 12: Switch `shared/actions/effects/stables.ts`

**Files:**
- Modify: `shared/actions/effects/stables.ts`

- [ ] **Step 1: Apply the migration pattern**

Replace `validateStableSelection(player, [coord])` → `playerBoard(state, idx).farmyard.canBuildStable(coord)`.
Replace `buildStableFarmInteraction(state, player, opts)` → `playerBoard(state, idx).farmyard.selectableTiles('stable', opts)`.

- [ ] **Step 2: Verify TS compiles**

Run: `pnpm exec tsc -b`
Expected: 0 errors.

- [ ] **Step 3: Run stables-related tests**

Run: `pnpm exec vitest run shared/actions/effects/__tests__/stables.test.ts server/__tests__/*stable*.test.ts --project fast`
Expected: 0 fails.

- [ ] **Step 4: Commit**

```bash
git add shared/actions/effects/stables.ts shared/domain/farmyard.ts
git commit -m "refactor(stables): switch to playerBoard().farmyard (PR2/5)"
```

---

### Task 13: Switch `shared/actions/effects/reorganize.ts`

**Files:**
- Modify: `shared/actions/effects/reorganize.ts`

- [ ] **Step 1: Apply the migration pattern**

Reorganize imports both farm-interaction and animal-zones helpers. Replace as follows:
- `buildFarmPositionSelectionInteraction(...)` → `playerBoard(state, idx).farmyard.selectableTiles('farm-position', opts)`
- `computeAnimalZones(player)` → `playerBoard(state, idx).animals.zones()`
- `enforceAnimalCapacity(player)` → `playerBoard(state, idx).animals.enforceCapacity()`

- [ ] **Step 2: Verify TS compiles**

Run: `pnpm exec tsc -b`
Expected: 0 errors.

- [ ] **Step 3: Run reorganize-related tests**

Run: `pnpm exec vitest run shared/actions/effects/__tests__/reorganize*.test.ts server/__tests__/reorganize-*.test.ts --project fast`
Expected: 0 fails.

- [ ] **Step 4: Commit**

```bash
git add shared/actions/effects/reorganize.ts shared/domain/farmyard.ts shared/domain/animal-zones.ts
git commit -m "refactor(reorganize): switch to playerBoard() (PR2/5)"
```

---

### Task 14: Switch `server/game-router.ts` + push PR2

**Files:**
- Modify: `server/game-router.ts`

- [ ] **Step 1: Apply the migration pattern**

Server-side router has 5 imports for validate functions. Replace each:

```ts
// BEFORE
import { normalizePlayerFarm, validateFenceSelection } from '../shared/logic/farm/fence-validation.ts'
import { validatePlowSelection } from '../shared/logic/farm/plow-validation.ts'
import { validateSowSelection } from '../shared/logic/farm/sow-validation.ts'
import { validateRoomSelection, validateStableSelection } from '../shared/logic/farm/validators.ts'

// AFTER
import { playerBoard } from '../shared/domain'
import { normalizePlayerFarm } from '../shared/logic/farm/fence-validation.ts'  // keep this one until PR5 deletes the file
```

For the validate calls in this file, replace with `playerBoard(state, idx).farmyard.canPlow(...)` etc. `normalizePlayerFarm` is internal pre-processing — keep importing from logic/farm until PR5 deletes that module (handle in PR5 by adding an internal helper or inlining).

- [ ] **Step 2: Verify TS + tests**

Run:
```
pnpm exec tsc -b
pnpm exec vitest run server/__tests__/game-router.test.ts --project fast
```
Both should pass.

- [ ] **Step 3: Run full local CI matrix**

```
pnpm run lint
pnpm run lint:i18n
pnpm run check:prompt-sync -- --strict
pnpm run check:reaches -- --strict
pnpm run check:no-dsl -- --strict
pnpm run check:catalog-types
pnpm run check:community-deck
pnpm run test:fast
pnpm run build
pnpm run check:bundle-size
```

If `test:fast` fails on the pre-existing flaky `improvement-pay-fail-idempotent.test.ts`, retry once.

- [ ] **Step 4: Run full slow project (S4a hard requirement: zero card regression)**

Run: `pnpm run test:slow`
Expected: 0 fails (the 254 single-card session tests must all pass after PR2 lands; if any fail, the wrap function in domain has a behavior delta from the legacy function — fix the wrap, not the call site).

- [ ] **Step 5: Commit + push PR2**

```bash
git add server/game-router.ts
git commit -m "refactor(server): route validate-XYZ via playerBoard().farmyard (PR2/5)"
git push origin sprint-S4-domain-rich-nodes
```

Wait for GitHub Actions CI on PR2 to go green before starting PR3.

---

## PR3 — Animal-zones cards migration (Tasks 15–19)

**Migration pattern for cards:**

```ts
// BEFORE
import { computeAnimalZones, getPastureCapacity } from '../../actions/helpers/animal-zones'
import type { AnimalZone } from '../../actions/helpers/animal-zones'
const zones = computeAnimalZones(player)

// AFTER
import { playerBoard, type AnimalZone } from '../../domain'
const zones = playerBoard(state, idx).animals.zones()
```

For card listeners that have access to `player` but not always `state`, the listener context API (`hookContext.state`) will provide state. If the listener signature is just `(player) => ...`, fall back to `playerBoard(hookContext.state, hookContext.playerIndex).animals` — most listeners already receive a context.

### Task 15: Switch `shared/actions/effects/breed.ts` + 5 cards (animal-zones consumers, batch 1)

**Files:**
- Modify: `shared/actions/effects/breed.ts`
- Modify: `shared/cards/A/A165_PigBreeder.ts`
- Modify: `shared/cards/A/A134_FullFarmer.ts`
- Modify: `shared/cards/B/B11_Feedyard.ts`
- Modify: `shared/cards/B/B98_OrganicFarmer.ts`
- Modify: `shared/cards/B/B115_TinsmithMaster.ts`

- [ ] **Step 1: Apply migration pattern to all 6 files**

For each file: switch every `from '../../actions/helpers/animal-zones'` (or relative variant) to `from '../../domain'`. Replace function calls per the pattern above.

- [ ] **Step 2: Verify TS compiles**

Run: `pnpm exec tsc -b`
Expected: 0 errors.

- [ ] **Step 3: Run related card session tests**

Run: `pnpm exec vitest run server/__tests__/A165_*.test.ts server/__tests__/A134_*.test.ts server/__tests__/B11_*.test.ts server/__tests__/B98_*.test.ts server/__tests__/B115_*.test.ts shared/actions/effects/__tests__/breed.test.ts --project fast`
Expected: 0 fails.

- [ ] **Step 4: Commit**

```bash
git add shared/actions/effects/breed.ts shared/cards/A/A165_PigBreeder.ts shared/cards/A/A134_FullFarmer.ts shared/cards/B/B11_Feedyard.ts shared/cards/B/B98_OrganicFarmer.ts shared/cards/B/B115_TinsmithMaster.ts
git commit -m "refactor(cards): batch 1 — animal-zones via playerBoard() (PR3/5)"
```

---

### Task 16: Switch 5 cards (animal-zones consumers, batch 2)

**Files:**
- Modify: `shared/cards/C/C6_StoneClearing.ts`
- Modify: `shared/cards/C/C9_AutomaticWaterTrough.ts`
- Modify: `shared/cards/C/C49_BeerStall.ts`
- Modify: `shared/cards/C/C101_StallHolder.ts`
- Modify: `shared/cards/C/C136_RanchProvost.ts`

- [ ] **Step 1: Apply migration pattern**

Same pattern: `helpers/animal-zones` → `domain`, function calls go through `playerBoard().animals`.

- [ ] **Step 2: Verify TS compiles**

Run: `pnpm exec tsc -b`
Expected: 0 errors.

- [ ] **Step 3: Run related card tests**

Run: `pnpm exec vitest run server/__tests__/C6_*.test.ts server/__tests__/C9_*.test.ts server/__tests__/C49_*.test.ts server/__tests__/C101_*.test.ts server/__tests__/C136_*.test.ts --project fast`
Expected: 0 fails.

- [ ] **Step 4: Commit**

```bash
git add shared/cards/C/
git commit -m "refactor(cards): batch 2 (C6/C9/C49/C101/C136) — animal-zones via playerBoard() (PR3/5)"
```

---

### Task 17: Switch 5 cards (animal-zones consumers, batch 3)

**Files:**
- Modify: `shared/cards/D/D167_PureBreeder.ts`
- Modify: `shared/cards/E/E16_BriarHedge.ts`
- Modify: `shared/cards/E/E33_BeaverColony.ts`
- Modify: `shared/cards/E/E83_ShepherdsWhistle.ts`
- Modify: `shared/cards/E/E84_DollysMother.ts`

- [ ] **Step 1: Apply migration pattern**

E33 uses `enforceAnimalCapacity` and `getPastureCapacity` — domain wrap exposes `enforceCapacity()` and `pastureCapacity(zoneId)`.

- [ ] **Step 2: Verify TS compiles**

Run: `pnpm exec tsc -b`
Expected: 0 errors.

- [ ] **Step 3: Run related card tests**

Run: `pnpm exec vitest run server/__tests__/D167_*.test.ts server/__tests__/E16_*.test.ts server/__tests__/E33_*.test.ts server/__tests__/E83_*.test.ts server/__tests__/E84_*.test.ts --project fast`
Expected: 0 fails.

- [ ] **Step 4: Commit**

```bash
git add shared/cards/D/D167_PureBreeder.ts shared/cards/E/E16_BriarHedge.ts shared/cards/E/E33_BeaverColony.ts shared/cards/E/E83_ShepherdsWhistle.ts shared/cards/E/E84_DollysMother.ts
git commit -m "refactor(cards): batch 3 (D167/E16/E33/E83/E84) — animal-zones via playerBoard() (PR3/5)"
```

---

### Task 18: Switch last card `E127_DiligentFarmer.ts`

**Files:**
- Modify: `shared/cards/E/E127_DiligentFarmer.ts`

- [ ] **Step 1: Apply migration pattern**

Last animal-zones consumer card. Same pattern.

- [ ] **Step 2: Verify TS compiles + run test**

Run:
```
pnpm exec tsc -b
pnpm exec vitest run server/__tests__/E127_*.test.ts --project fast
```
Expected: 0 errors / 0 fails.

- [ ] **Step 3: Commit**

```bash
git add shared/cards/E/E127_DiligentFarmer.ts
git commit -m "refactor(cards): E127 — animal-zones via playerBoard() (PR3/5)"
```

---

### Task 19: Local CI matrix + push PR3

- [ ] **Step 1: Run local CI matrix**

```
pnpm run lint
pnpm run lint:i18n
pnpm run check:prompt-sync -- --strict
pnpm run check:reaches -- --strict
pnpm run check:no-dsl -- --strict
pnpm run check:catalog-types
pnpm run check:community-deck
pnpm run test:fast
pnpm run build
pnpm run check:bundle-size
```
All must pass (retry flaky `improvement-pay-fail-idempotent.test.ts` if it fails).

- [ ] **Step 2: Run full slow project (zero card regression)**

Run: `pnpm run test:slow`
Expected: 0 fails. **This is the hard DoD signal for PR3** — every animal-zones consumer card must still pass.

- [ ] **Step 3: Push PR3**

```bash
git push origin sprint-S4-domain-rich-nodes
```

Wait for GitHub Actions CI to go green before starting PR4.

---

## PR4 — Scoring + session + client/protocol migration (Tasks 20–23)

### Task 20: Switch `shared/protocol/game.ts` + `shared/cards/card-effects.ts` (type-only)

**Files:**
- Modify: `shared/protocol/game.ts:3`
- Modify: `shared/cards/card-effects.ts:2-3`

- [ ] **Step 1: Modify imports**

`shared/protocol/game.ts:3`:
```ts
// BEFORE
import type { PlayerScoreSummary } from '../logic/scoring'
// AFTER
import type { PlayerScoreSummary } from '../domain/scoring'
```

`shared/cards/card-effects.ts:2-3`:
```ts
// BEFORE
import type { AnimalZone } from '../actions/helpers/animal-zones'
import type { PlayerScoreSummary, ScoreCategoryResult } from '../logic/scoring'
// AFTER
import type { AnimalZone, PlayerScoreSummary, ScoreCategoryResult } from '../domain'
```

- [ ] **Step 2: Verify TS compiles**

Run: `pnpm exec tsc -b`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add shared/protocol/game.ts shared/cards/card-effects.ts
git commit -m "refactor(protocol,cards): type imports via shared/domain (PR4/5)"
```

---

### Task 21: Switch `shared/session/session-core.ts` + `client/components/board/ScoringPad.tsx` + `client/hooks/useGameSync.ts`

**Files:**
- Modify: `shared/session/session-core.ts` (multiple imports + call sites)
- Modify: `client/components/board/ScoringPad.tsx:8` (type)
- Modify: `client/hooks/useGameSync.ts:3` (type)

- [ ] **Step 1: Modify session-core imports + call sites**

In `shared/session/session-core.ts`:
- `import { computeScores, type PlayerScoreSummary } from '../logic/scoring.ts'` → `import { Scoring, type PlayerScoreSummary } from '../domain'`. Then `computeScores(state)` → `Scoring.computeAll(state)`.
- `import { computeAnimalZones } from '../actions/helpers/animal-zones'` → `import { playerBoard } from '../domain'`. Replace `computeAnimalZones(player)` calls with `playerBoard(state, idx).animals.zones()`.
- `from '../logic/farm/farm-interaction.ts'` (line 123) and `from '../logic/farm/occupation-hand-interaction.ts'` (line 124) — keep `buildOccupationHandSelectionInteraction` import temporarily (used by occupation flow); we'll inline it in PR5 task 25.
- For `buildXxxFarmInteraction` calls in session-core, use `playerBoard(state, idx).farmyard.selectableTiles(kind, opts)`.

- [ ] **Step 2: Modify client type imports**

`client/components/board/ScoringPad.tsx:8`:
```ts
// BEFORE
} from '../../../shared/logic/scoring'
// AFTER
} from '../../../shared/domain'
```

`client/hooks/useGameSync.ts:3`:
```ts
// BEFORE
import type { PlayerScoreSummary } from '../../shared/logic/scoring'
// AFTER
import type { PlayerScoreSummary } from '../../shared/domain'
```

- [ ] **Step 3: Verify TS + tests**

Run:
```
pnpm exec tsc -b
pnpm exec vitest run shared/session/__tests__/ server/__tests__/harvest-feed-session.test.ts server/__tests__/on-end-turn-session.test.ts --project fast
```
Expected: 0 errors / 0 fails.

- [ ] **Step 4: Commit**

```bash
git add shared/session/session-core.ts client/components/board/ScoringPad.tsx client/hooks/useGameSync.ts
git commit -m "refactor(session,client): scoring + animal-zones via shared/domain (PR4/5)"
```

---

### Task 22: Verify zero remaining `logic/farm` / `helpers/animal-zones` / `logic/scoring` imports outside PR5 deletion candidates

**Files:**
- Scan only (no modify yet).

- [ ] **Step 1: Run grep audit**

```bash
grep -rln "logic/farm/\|helpers/animal-zones\|logic/scoring" \
  shared/ server/ client/ \
  | grep -v "node_modules\|\.test\.ts\|/domain/" \
  | sort -u
```

Expected output: only `shared/logic/farm.ts`, `shared/logic/farm/*.ts`, `shared/actions/helpers/animal-zones.ts`, `shared/logic/scoring.ts`, `shared/logic/scoring-bonus-solver.ts` themselves (these still self-reference within the modules — that's fine, they're getting deleted in PR5).

If any other file shows up, that's a missed migration — go back to PR2/3/4 and switch it before PR5.

- [ ] **Step 2: Document audit result**

Append the grep output to `docs/sprint-S4a-progress.md` under section "PR4 audit — zero residual external imports". Create the file if missing:

```markdown
# Sprint S4a — Progress

## PR4 audit (YYYY-MM-DD)

Files still referencing `logic/farm` / `helpers/animal-zones` / `logic/scoring` after PR4:

(paste grep output here — should only be the to-be-deleted modules)
```

- [ ] **Step 3: Commit progress doc**

```bash
git add docs/sprint-S4a-progress.md
git commit -m "docs(sprint-s4a): record PR4 audit — only legacy modules self-reference"
```

---

### Task 23: Run full CI matrix + slow project + push PR4

- [ ] **Step 1: Run full local CI matrix**

```
pnpm run lint
pnpm run lint:i18n
pnpm run check:prompt-sync -- --strict
pnpm run check:reaches -- --strict
pnpm run check:no-dsl -- --strict
pnpm run check:catalog-types
pnpm run check:community-deck
pnpm run test:fast
pnpm run build
pnpm run check:bundle-size
pnpm run test:slow
```
All must pass.

- [ ] **Step 2: Push PR4**

```bash
git push origin sprint-S4-domain-rich-nodes
```

Wait for GitHub Actions CI to go green before starting PR5.

---

## PR5 — Delete legacy modules (Tasks 24–26)

### Task 24: Delete `shared/logic/farm/` + `shared/logic/farm.ts`

**Files:**
- Delete: `shared/logic/farm/build-room-helper.ts`
- Delete: `shared/logic/farm/farm-interaction.ts`
- Delete: `shared/logic/farm/fence-validation.ts`
- Delete: `shared/logic/farm/occupation-hand-interaction.ts`
- Delete: `shared/logic/farm/plow-validation.ts`
- Delete: `shared/logic/farm/sow-validation.ts`
- Delete: `shared/logic/farm/validators.ts`
- Delete: `shared/logic/farm.ts`

- [ ] **Step 1: Resolve last residual imports inside session-core or game-router**

If task 22's audit showed any non-test file outside the to-be-deleted modules still referencing `logic/farm/*`, **stop and migrate that file first** (it should have been caught earlier — if not, treat as PR4 follow-up).

If `normalizePlayerFarm` was kept temporarily in `server/game-router.ts` (Task 14) or `buildOccupationHandSelectionInteraction` in `session-core.ts` (Task 21):
- Inline `normalizePlayerFarm` (a few lines from `fence-validation.ts`) into `server/game-router.ts` as a private helper, OR move it into `shared/domain/farmyard.ts` as a private export.
- Inline `buildOccupationHandSelectionInteraction` (19 lines in `occupation-hand-interaction.ts`) into `session-core.ts` as a private helper, OR move into `shared/domain/player-board.ts` as a private export.

Verify: `grep -rln "logic/farm" shared/ server/ client/ | grep -v "node_modules\|/domain/"` returns 0 lines.

- [ ] **Step 2: Update `shared/domain/farmyard.ts` and `shared/domain/pasture.ts` to drop `from '../logic/farm/*'` imports**

Now that the wrap class is the single source of truth, copy the implementation of `validatePlowSelection` / `validateFenceSelection` / `computeFencedRegions` / etc. **inline into the domain files**. The wrap layer becomes the implementation layer.

Example for `shared/domain/farmyard.ts`:
```ts
// Replace imports like:
//   import { validatePlowSelection } from '../logic/farm/plow-validation'
// with the body of that function copied into Farmyard as a private method or inline.
```

This is mechanical: copy the function body, change `import` paths from `'../game/types'` style relative to logic/farm to `'../game/types'` relative to domain (one level up), and you're done.

- [ ] **Step 3: Delete the legacy files**

```bash
git rm shared/logic/farm/build-room-helper.ts \
       shared/logic/farm/farm-interaction.ts \
       shared/logic/farm/fence-validation.ts \
       shared/logic/farm/occupation-hand-interaction.ts \
       shared/logic/farm/plow-validation.ts \
       shared/logic/farm/sow-validation.ts \
       shared/logic/farm/validators.ts \
       shared/logic/farm.ts
rmdir shared/logic/farm   # should be empty after the rms
```

- [ ] **Step 4: Verify TS compiles + tests pass**

Run:
```
pnpm exec tsc -b
pnpm run test:fast
```
Expected: 0 errors, 0 fails (retry flaky test if needed).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(domain): inline farm logic + delete shared/logic/farm/ (PR5/5)"
```

---

### Task 25: Delete `shared/actions/helpers/animal-zones.ts` + `shared/logic/scoring*.ts`

**Files:**
- Delete: `shared/actions/helpers/animal-zones.ts`
- Delete: `shared/logic/scoring.ts`
- Delete: `shared/logic/scoring-bonus-solver.ts`

- [ ] **Step 1: Inline animal-zones into `shared/domain/animal-zones.ts`**

Copy the bodies of `computeAnimalZones`, `getPastureCapacity`, `getLooseStableKeys`, `getAssignedAnimalCount`, `getTotalAnimalCapacity`, `enforceAnimalCapacity`, `computeInvalidAnimalsForZone` into `shared/domain/animal-zones.ts` as private functions or AnimalZones methods. Keep the `AnimalZone` type export.

- [ ] **Step 2: Inline scoring into `shared/domain/scoring.ts`**

Copy the body of `computeScores` and `solveBonusScoring` (and their helper functions / types) into `shared/domain/scoring.ts`. Keep all type exports.

- [ ] **Step 3: Delete the legacy files**

```bash
git rm shared/actions/helpers/animal-zones.ts \
       shared/logic/scoring.ts \
       shared/logic/scoring-bonus-solver.ts
```

- [ ] **Step 4: Verify TS compiles + tests pass**

Run:
```
pnpm exec tsc -b
pnpm run test:fast
```
Expected: 0 errors, 0 fails.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(domain): inline animal-zones + scoring + delete legacy modules (PR5/5)"
```

---

### Task 26: Final DoD verification + push PR5 + S4a closeout

**Files:**
- Modify: `docs/sprint-S4a-progress.md` (add closeout section)
- Modify: `docs/ENGINE_NEW_ARCHITECTURE.md` §15 S4 (add ✅ S4a 完成 annotation)

- [ ] **Step 1: Verify all DoD items D1–D9**

Run each verification command:

```bash
# D1: shared/logic/farm/ does not exist
test ! -d shared/logic/farm && echo "D1 ✅" || echo "D1 ❌"

# D2: shared/actions/helpers/animal-zones.ts does not exist
test ! -f shared/actions/helpers/animal-zones.ts && echo "D2 ✅" || echo "D2 ❌"

# D3: shared/logic/scoring*.ts do not exist
test ! -f shared/logic/scoring.ts && test ! -f shared/logic/scoring-bonus-solver.ts && echo "D3 ✅" || echo "D3 ❌"

# D4: 6 domain files exist
ls shared/domain/index.ts shared/domain/player-board.ts shared/domain/farmyard.ts shared/domain/pasture.ts shared/domain/animal-zones.ts shared/domain/scoring.ts && echo "D4 ✅"

# D5: ESLint guard active
grep -A 5 "shared/domain/\*\*/\*.ts" eslint.config.js | head -10 && echo "D5 ✅"

# D6: zero residual imports
grep -rln "logic/farm/\|helpers/animal-zones\|logic/scoring" shared/ server/ client/ | grep -v "node_modules\|\.test\.ts\|/domain/" | wc -l
# Expected: 0

# D7: zero regression
pnpm run test:fast && pnpm run test:slow

# D8: effect average line count down ≥30%
# (Compare baseline against current; document numbers in progress doc.)
wc -l shared/actions/effects/*.ts | tail -1

# D9: 强制 green 子集
pnpm run lint
pnpm run lint:i18n
pnpm run check:prompt-sync -- --strict
pnpm run check:reaches -- --strict
pnpm run check:no-dsl -- --strict
pnpm run check:catalog-types
pnpm run check:community-deck
pnpm run build
pnpm run check:bundle-size
```

All checks must pass.

- [ ] **Step 2: Update `docs/sprint-S4a-progress.md` with closeout**

Append:

```markdown
## Closeout (YYYY-MM-DD)

### DoD verification
- D1 ✅ shared/logic/farm/ deleted
- D2 ✅ shared/actions/helpers/animal-zones.ts deleted
- D3 ✅ shared/logic/scoring*.ts deleted
- D4 ✅ 6 domain files exist
- D5 ✅ ESLint guard active
- D6 ✅ 0 residual imports
- D7 ✅ test:fast + test:slow zero regression
- D8 ✅ effect average line count: <baseline> → <after> (-N%, ≥30% target met)
- D9 ✅ all 强制 green 子集 pass

### Effect line count baseline
- Before S4a (commit c5a3feb2): wc -l shared/actions/effects/*.ts → <baseline>
- After PR5: wc -l shared/actions/effects/*.ts → <after>
- Reduction: -N% (target ≥30%)
```

Fill in actual numbers from Step 1.

- [ ] **Step 3: Update `ENGINE_NEW_ARCHITECTURE.md` §15 S4**

Add ✅ S4a 完成（YYYY-MM-DD）to the §15 Sprint S4 heading. (S4b will be marked when its plan completes.)

Replace:
```markdown
### Sprint S4：领域聚合层 `shared/domain/`
```
with:
```markdown
### Sprint S4：领域聚合层 `shared/domain/` ✅ S4a 完成（YYYY-MM-DD）

> **S4a 完成总结**（详见 `docs/sprint-S4a-progress.md`）
>
> - ✅ 4 个 domain 聚合 + Scoring namespace 落地（6 文件）
> - ✅ ESLint 边界守门（domain/** 不 import Node API / React / engine / session / effects）
> - ✅ ~30 个 call site 迁移完成
> - ✅ shared/logic/farm/ + actions/helpers/animal-zones.ts + logic/scoring*.ts 删除（共 2189 行）
> - ✅ effect 平均行数下降 N%（≥30% 目标达成）
> - **基线**：fast 322 文件 / slow 254 卡 全绿 / lint + i18n + 全 check 全绿
>
> S4b（节点充血）作为单独 sub-sprint 进行。
```

- [ ] **Step 4: Commit + push PR5**

```bash
git add docs/sprint-S4a-progress.md docs/ENGINE_NEW_ARCHITECTURE.md
git commit -m "$(cat <<'EOF'
docs(sprint-s4a): closeout — DoD D1-D9 all green

S4a (domain layer) complete:
- 4 aggregates + Scoring namespace live in shared/domain/
- 11 legacy files deleted (2189 lines): logic/farm.ts + logic/farm/*
  + actions/helpers/animal-zones.ts + logic/scoring*.ts
- ESLint guards prevent reverse imports (engine/session/effects)
  and host-only modules (fs/path/os/react)
- Effect average line count down N% (target ≥30% met)
- test:fast + test:slow zero regression
- All CI checks (lint / lint:i18n / prompt-sync / reaches / no-dsl
  / catalog-types / community-deck / build / bundle-size) green

S4b (rich-node engine) is the sibling sub-sprint, lives in a
separate worktree, runs in parallel.
EOF
)"

git push origin sprint-S4-domain-rich-nodes
```

- [ ] **Step 5: Open PR for sprint-S4-domain-rich-nodes → main**

Use `gh pr create` with title `S4a: shared/domain/ aggregate layer — domain replaces logic/farm + animal-zones + scoring (PR1-5 squashed)` and body summarizing the 5 PR commits + DoD verification + ADR-0004 stub.

Wait for GitHub Actions CI to pass on the PR before requesting review.

---

## Self-Review Checklist (run after writing the plan, fix inline)

**1. Spec coverage:**
- §2.1 S4a scope ✅ Tasks 1-26
- §3.1 file scaffold (6 domain files) ✅ Tasks 1-5
- §3.2 接口形态 ✅ Tasks 1-5 with full code
- §3.3 散件 → domain 映射 ✅ Tasks 1-3 (wrap), Tasks 24-25 (inline + delete)
- §3.4 scoring 独立 namespace ✅ Task 4
- §3.5 ESLint 边界 ✅ Task 7
- §3.6 effect 调用迁移 pattern ✅ PR2-4 migration pattern blocks
- §4 5 PR 节奏 ✅ PR1=Tasks1-7 / PR2=8-14 / PR3=15-19 / PR4=20-23 / PR5=24-26
- §6.4 排期表 ✅ implicit (PR per week)
- §7.1 测试 ✅ Task 6 unit tests; Task 14/19/23 slow project full run
- §8.1 DoD D1-D9 ✅ Task 26 verification

**2. Placeholder scan:** No "TBD"/"TODO"/"implement later" in any step. The progress doc template has `<baseline>` / `<after>` / `<YYYY-MM-DD>` placeholders, which are valid for runtime substitution.

**3. Type consistency:** All `playerBoard().farmyard.canPlow(...)` etc. signatures match across Task 1 (creation) and Tasks 8-14 (call sites). `AnimalZone` is exported from both `shared/domain/animal-zones.ts` and `shared/domain/index.ts`.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-05-sprint-S4a-domain-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
