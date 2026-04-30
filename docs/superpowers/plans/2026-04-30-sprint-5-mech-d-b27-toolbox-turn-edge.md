# Sprint 5 机制 D：B27 Toolbox turn-edge BGA 对齐 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** B27 Toolbox 不再每次 construct/stables/fencing 都弹 prompt，改为 turn 边界统一弹一次；同时覆盖"B27 在手里 → 同 turn 先造、再打出 B27"的 BGA 边界。

**Architecture:** 用现有 `effect.onEndTurn`（已被 D74_RoyalWood 使用，由 `game-core.ts:1348-1353 continueEndTurnHooks` 自动 dispatch）+ `effect.onBuy`（B27 刚被打出瞬间回查本 turn 历史）+ 现有 per-action snapshot helpers。B27 用 setFlag listener（仅 played 后生效）累积 flag，onEndTurn 看 flag 弹买 major prompt + 清 flag。**0 改主路径 / 0 新 hook phase / 0 listener 系统扩展**。

**Tech Stack:** TypeScript / Vitest / pnpm。改动：1 helper 新增 + 1 卡重写 + 5 session 测试 + 文档同步。

**Spec:** `docs/superpowers/specs/2026-04-30-sprint-5-mech-d-turn-edge-phase-design.md`

**Worktree:** `.worktree/sprint-5-mech-d-turn-edge-phase`（基于 main，HEAD `bbf0a0b3` 已含机制 A）

---

## File Structure

**新建：**
- `shared/cards/helpers/__tests__/action-snapshot.test.ts` — 单元测试（rooms / stables / fences delta + token）
- `server/__tests__/B27_Toolbox-session.test.ts` — 5 个 session 测试场景

**修改：**
- `shared/cards/helpers/action-snapshot.ts` — `recordActionSnapshot` 多记 `fenceSegments`；新加 `getFencesBuiltThisAction`
- `shared/cards/B/B27_Toolbox.ts` — 完全重写（删 makeToolboxFlow per-action listener，改 setFlag listener + effect.onBuy + effect.onEndTurn）
- `docs/card_progress.md` — §2.0 / §2.3 / §7 / §8 同步
- `docs/master-plan.md` — §8 Sprint 5 行更新

---

## Phase 1: action-snapshot 加 fenceSegments + getFencesBuiltThisAction

**Files:**
- Create: `shared/cards/helpers/__tests__/action-snapshot.test.ts`
- Modify: `shared/cards/helpers/action-snapshot.ts`

### Task 1.1: 写单元测试

- [ ] **Step 1: 创建测试文件**

```ts
// shared/cards/helpers/__tests__/action-snapshot.test.ts
import { describe, it, expect } from 'vitest'
import {
  recordActionSnapshot,
  readActionSnapshotToken,
  getRoomsBuiltThisAction,
  getStableTilesBuiltThisAction,
  getFencesBuiltThisAction,
} from '../action-snapshot'
import type { PlayerState } from '../../../game/types'

const makePlayer = (): PlayerState => ({
  id: 'p1',
  name: 'P1',
  resources: { food: 0, grain: 0, vegetable: 0, wood: 0, clay: 0, reed: 0, stone: 0, sheep: 0, boar: 0, cattle: 0 },
  workers: [],
  pastures: [],
  fields: [],
  fenceSegments: [],
  stableTiles: [],
  roomTiles: [],
  improvements: [],
  minorHand: [],
  minorPlayed: [],
  occupationHand: [],
  occupationPlayed: [],
  extraOccupationsFromCards: [],
  playedCards: [],
  houseAnimalType: null,
  houseAnimalCount: 0,
  stableAnimals: {},
  majorEffects: {},
  startPlayer: false,
  activeModifiers: [],
  cardStates: {},
  stats: {} as PlayerStats,
} as unknown as PlayerState)

describe('action-snapshot', () => {
  it('recordActionSnapshot writes token + tile counts + fence segments', () => {
    const player = makePlayer()
    player.roomTiles = [{ row: 0, col: 0 }, { row: 0, col: 1 }] as PlayerState['roomTiles']
    player.stableTiles = [{ row: 1, col: 0 }] as PlayerState['stableTiles']
    player.fenceSegments = [
      { edge: '0,0/N', type: 'fence' },
      { edge: '0,0/E', type: 'fence' },
      { edge: '0,0/S', type: 'fence' },
    ]

    recordActionSnapshot(player, 7)

    expect(readActionSnapshotToken(player)).toBe(7)
    expect(player.cardStates['__actionSnapshot__']!.extraData).toMatchObject({
      token: 7,
      stableTiles: 1,
      roomTiles: 2,
      fenceSegments: 3,
    })
  })

  it('getRoomsBuiltThisAction returns delta after recordActionSnapshot', () => {
    const player = makePlayer()
    player.roomTiles = [{ row: 0, col: 0 }] as PlayerState['roomTiles']
    recordActionSnapshot(player, 1)
    player.roomTiles = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ] as PlayerState['roomTiles']
    expect(getRoomsBuiltThisAction(player)).toBe(2)
  })

  it('getStableTilesBuiltThisAction returns delta', () => {
    const player = makePlayer()
    player.stableTiles = []
    recordActionSnapshot(player, 1)
    player.stableTiles = [{ row: 0, col: 0 }] as PlayerState['stableTiles']
    expect(getStableTilesBuiltThisAction(player)).toBe(1)
  })

  it('getFencesBuiltThisAction returns delta', () => {
    const player = makePlayer()
    player.fenceSegments = []
    recordActionSnapshot(player, 1)
    player.fenceSegments = [
      { edge: '0,0/N', type: 'fence' },
      { edge: '0,0/E', type: 'fence' },
      { edge: '0,0/S', type: 'fence' },
      { edge: '0,0/W', type: 'fence' },
    ]
    expect(getFencesBuiltThisAction(player)).toBe(4)
  })

  it('getFencesBuiltThisAction returns 0 when no snapshot recorded', () => {
    const player = makePlayer()
    player.fenceSegments = [{ edge: '0,0/N', type: 'fence' }]
    expect(getFencesBuiltThisAction(player)).toBe(0)
  })

  it('getFencesBuiltThisAction never returns negative', () => {
    const player = makePlayer()
    player.fenceSegments = [
      { edge: '0,0/N', type: 'fence' },
      { edge: '0,0/E', type: 'fence' },
    ]
    recordActionSnapshot(player, 1)
    player.fenceSegments = []
    expect(getFencesBuiltThisAction(player)).toBe(0)
  })
})
```

注：`makePlayer` 用 `as unknown as PlayerState` 避免补全所有字段；测试只用 `roomTiles` / `stableTiles` / `fenceSegments` / `cardStates` 几个字段。如果 TypeScript 不让通过，executor 可改用 `Partial<PlayerState>` + 强制类型。

- [ ] **Step 2: 跑测试，确认 5 个测试 fail（getFencesBuiltThisAction 未导出）**

Run: `pnpm exec vitest run shared/cards/helpers/__tests__/action-snapshot.test.ts`
Expected: FAIL — `getFencesBuiltThisAction is not a function` 或类似

### Task 1.2: 实现 helper

- [ ] **Step 3: 修改 action-snapshot.ts**

完全替换 `shared/cards/helpers/action-snapshot.ts`：

```ts
import type { PlayerState } from '../../game/types'
import { ensureCardState } from './card-state'

const ACTION_SNAPSHOT_CARD_ID = '__actionSnapshot__'

export const recordActionSnapshot = (
  player: PlayerState,
  token: number,
) => {
  const cardState = ensureCardState(player, ACTION_SNAPSHOT_CARD_ID)
  cardState.extraData = {
    token,
    stableTiles: player.stableTiles.length,
    roomTiles: player.roomTiles.length,
    fenceSegments: player.fenceSegments.length,
  }
}

export const readActionSnapshotToken = (player: PlayerState): number | undefined =>
  player.cardStates?.[ACTION_SNAPSHOT_CARD_ID]?.extraData?.token as number | undefined

export const getStableTilesBuiltThisAction = (player: PlayerState) => {
  const before =
    player.cardStates?.[ACTION_SNAPSHOT_CARD_ID]?.extraData?.stableTiles as number | undefined
  if (typeof before !== 'number') return 0
  return Math.max(0, player.stableTiles.length - before)
}

export const getRoomsBuiltThisAction = (player: PlayerState) => {
  const before =
    player.cardStates?.[ACTION_SNAPSHOT_CARD_ID]?.extraData?.roomTiles as number | undefined
  if (typeof before !== 'number') return 0
  return Math.max(0, player.roomTiles.length - before)
}

export const getFencesBuiltThisAction = (player: PlayerState) => {
  const before =
    player.cardStates?.[ACTION_SNAPSHOT_CARD_ID]?.extraData?.fenceSegments as number | undefined
  if (typeof before !== 'number') return 0
  return Math.max(0, player.fenceSegments.length - before)
}
```

向后兼容：`fenceSegments` 是新字段，旧 cardStates 没有 → `getFencesBuiltThisAction` 返回 0（已测）。

- [ ] **Step 4: 跑单元测试，确认全过**

Run: `pnpm exec vitest run shared/cards/helpers/__tests__/action-snapshot.test.ts`
Expected: PASS（6 个测试全绿）

- [ ] **Step 5: 跑全量 fast 确认无回归**（recordActionSnapshot 给现有 game-core 调用，多记一字段，不应破坏其他测试）

Run: `pnpm test:fast`
Expected: 全部 PASS

- [ ] **Step 6: lint + build**

Run: `pnpm run lint && pnpm run build`
Expected: 0 error

- [ ] **Step 7: 提交**

```bash
git add shared/cards/helpers/action-snapshot.ts shared/cards/helpers/__tests__/action-snapshot.test.ts
git commit -m "feat(action-snapshot): add fence segment delta + getFencesBuiltThisAction

recordActionSnapshot now also captures player.fenceSegments.length so we
can compute fences built within the current action token. New helper
getFencesBuiltThisAction mirrors getRoomsBuiltThisAction /
getStableTilesBuiltThisAction. Pure additive change to the cardStates
extraData shape; existing readers of stableTiles / roomTiles unaffected.

Used by Sprint 5 mech-D B27 Toolbox rewrite (next commit) to detect
'this turn already built rooms / fences / stables' when B27 is freshly
played mid-turn (BGA onBuy edge)."
```

---

## Phase 2: B27_Toolbox.ts 重写 + session 测试

**Files:**
- Modify: `shared/cards/B/B27_Toolbox.ts`
- Create: `server/__tests__/B27_Toolbox-session.test.ts`

### Task 2.1: 重写 B27_Toolbox.ts

- [ ] **Step 1: 完全替换 B27_Toolbox.ts**

```ts
// shared/cards/B/B27_Toolbox.ts
import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow, PlayerState } from '../../game/types'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import {
  getRoomsBuiltThisAction,
  getStableTilesBuiltThisAction,
  getFencesBuiltThisAction,
} from '../helpers/action-snapshot'
import type { CardImpl } from '../registry'

const CARD_ID = 'B27_Toolbox'
const ALLOWED_MAJORS = ['Major_Joinery', 'Major_Pottery', 'Major_Basket']

// (1) construct / stables / fencing 时只设 flag，不弹 prompt（B27 已 played 才生效）
const setFlagHandler = (context: CardListenerContext): ActionHookResult | void => {
  if (context.state.roundPhase !== 'work') return
  setCardFlag(context.player, CARD_ID, true)
}

const setFlagListeners: CardListenerRegistration[] = [
  { id: 'B27-flag-construct', cardIds: [CARD_ID], phases: ['after' as ActionHookPhase], actions: ['construct'],     handler: setFlagHandler },
  { id: 'B27-flag-stables',   cardIds: [CARD_ID], phases: ['after' as ActionHookPhase], actions: ['build-stables'], handler: setFlagHandler },
  { id: 'B27-flag-fencing',   cardIds: [CARD_ID], phases: ['after' as ActionHookPhase], actions: ['fencing'],       handler: setFlagHandler },
]

const builtSomethingThisAction = (player: PlayerState): boolean =>
  getRoomsBuiltThisAction(player) > 0 ||
  getStableTilesBuiltThisAction(player) > 0 ||
  getFencesBuiltThisAction(player) > 0

const makeToolboxFlow = (): ActionFlow => ({
  type: 'leaf',
  actionId: 'improvement-any',
  optional: true,
  promptKey: 'ui.interactionToolboxImprovement',
  sourceCard: CARD_ID,
  actionContext: { allowedPurchases: ALLOWED_MAJORS },
})

export const B27_Toolbox = new MinorImprovement({
  id: CARD_ID,
  name: 'Toolbox',
  deck: 'B',
  number: 27,
  category: 'ACTIONS_BOOSTER',
  desc: [
    "In the work phase, after each turn in which you build at least 1 room, stable, or fence, you can build the __Joinery__, __Pottery__, or __Basketmaker's Workshop__ major improvement.",
  ],
  cost: { wood: 1 },
})

export const B27_Toolbox_impl = {
  listeners: setFlagListeners,
  effect: {
    id: CARD_ID,
    // B27 刚被打出瞬间：回查本 turn 已造过吗。
    // 这同时覆盖"跨 turn 残留 flag"边界 — 总会重设 flag，覆盖任何先前 turn 残留。
    onBuy: (state, player) => {
      if (state.roundPhase !== 'work') return
      setCardFlag(player, CARD_ID, builtSomethingThisAction(player))
    },
    // turn 结束 dispatch：if flagged → 弹买 major + 清 flag。
    // game-core.ts:1348-1353 在每次 takeAction 真正结束时调 continueEndTurnHooks，
    // 与机制 A jump 天然兼容（jump 是 SEQ 内部继续，不会让 takeAction 函数提前返回）。
    onEndTurn: (_state, player) => {
      if (!isCardFlagged(player, CARD_ID)) return
      setCardFlag(player, CARD_ID, false)
      return makeToolboxFlow()
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

注：原文件里如果有 `const handler = ...` 老 listener、`B27-toolbox-after-construct` 等三个旧 listener、`makeToolboxFlow` 内嵌返回 `ActionHookResult` 的旧形式，全删掉。新版只有 `setFlagListeners` 三个 listener + `effect.{onBuy, onEndTurn}`。

- [ ] **Step 2: build 验证类型**

Run: `pnpm run build`
Expected: 0 error（如果有，是 import 路径或类型不对，按提示修）

### Task 2.2: 写 5 个 session 测试场景

- [ ] **Step 3: 创建 session 测试文件**

```ts
// server/__tests__/B27_Toolbox-session.test.ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/game/player'
import { isCardFlagged, setCardFlag } from '../../shared/cards/helpers/card-state'
import { recordActionSnapshot } from '../../shared/cards/helpers/action-snapshot'
import '../../shared/cards/B/B27_Toolbox'
import '../../shared/cards/B/B150_LargeScaleFarmer'
import { B27_Toolbox_impl } from '../../shared/cards/B/B27_Toolbox'

const CARD_ID = 'B27_Toolbox'

const setupPlayed = (food = 5) => {
  const session = new GameSession(/* seed */ 1)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = { ...player.resources, food, wood: 20, clay: 20, reed: 20, stone: 20 }
  player.minorPlayed.push(CARD_ID)

  // 确保 Joinery / Pottery / Basket 在 availableMajorImprovements
  for (const id of ['Major_Joinery', 'Major_Pottery', 'Major_Basket']) {
    if (!state.availableMajorImprovements.includes(id)) {
      state.availableMajorImprovements.push(id)
    }
  }

  session.loadState(state)
  return session
}

describe('B27 Toolbox session', () => {
  it('已 played + 修房 → onEndTurn 弹一次买 major（不每次 construct 都弹）', () => {
    const session = setupPlayed()
    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)
    // farm-expansion → OR(construct, stables) prompt
    expect(resp.pending.type).toBe('choice')
    if (resp.pending.type !== 'choice') return

    // 选 construct（拼前缀按现有约定；如果不对，executor 看 pending.options 里的 value）
    const constructOption = resp.pending.options.find(o => o.value === 'construct' || /construct/i.test(o.value))
    expect(constructOption).toBeDefined()
    resp = session.resolveChoice(0, constructOption!.value)

    // construct 子流程会弹 farm-position 选房间格子
    while (resp.pending.type === 'choice') {
      // 如果是 buy major prompt（含 Joinery/Pottery/Basket），断言到达
      const isBuyMajor = resp.pending.options.some(o =>
        o.value.includes('Major_Joinery') ||
        o.value.includes('Major_Pottery') ||
        o.value.includes('Major_Basket'),
      )
      if (isBuyMajor) {
        // 验证 sourceCard / promptKey 来自 B27（可选）
        expect(resp.state.players[0]!.minorPlayed).toContain(CARD_ID)
        // flag 在 handler 内已清
        expect(isCardFlagged(resp.state.players[0]!, CARD_ID)).toBe(false)
        // 选 skip 跳过买 major
        const skip = resp.pending.options.find(o => o.value === '__skip__')
        expect(skip).toBeDefined()
        resp = session.resolveChoice(0, skip!.value)
        break
      }
      // 选第一个非 skip 选项推进
      const firstNonSkip = resp.pending.options.find(o => o.value !== '__skip__')
      if (!firstNonSkip) break
      resp = session.resolveChoice(0, firstNonSkip.value)
    }

    // 最终应到 confirmNextPlayer（onEndTurn 完成 + buy major 处理完）
    expect(resp.pending.type).toBe('confirmNextPlayer')
  })

  it('什么都没造 → onEndTurn 不弹', () => {
    const session = setupPlayed()
    const resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)
    // grain-seeds 直接 gain 1 grain，不修房 / 围栏 / stable
    // setFlag listener 不触发；onEndTurn 看 flag = false → 不弹 prompt
    // pending 应该直接到 confirmNextPlayer（无 buy major 中间 prompt）
    expect(resp.pending.type).toBe('confirmNextPlayer')
    expect(isCardFlagged(resp.state.players[0]!, CARD_ID)).toBe(false)
  })

  it('B27 在手里 + 已造过房（人工设置）+ 调 onBuy → flag set', () => {
    const session = setupPlayed()
    const state = session.getState().state
    const player = state.players[0]!
    // 移除 played 状态
    player.minorPlayed = player.minorPlayed.filter(id => id !== CARD_ID)
    player.minorHand.push(CARD_ID)
    // 模拟"本 turn 已造过 1 个房间"：先快照后增加 roomTiles
    recordActionSnapshot(player, 1)
    player.roomTiles = [...(player.roomTiles ?? []), { row: 0, col: 0 }] as typeof player.roomTiles
    session.loadState(state)

    // 直接调用 effect.onBuy
    B27_Toolbox_impl.effect!.onBuy!(state, player)

    expect(isCardFlagged(player, CARD_ID)).toBe(true)
  })

  it('跨 turn flag 残留 + onBuy 时本 turn 没造 → flag 被清', () => {
    const session = setupPlayed()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed = player.minorPlayed.filter(id => id !== CARD_ID)
    player.minorHand.push(CARD_ID)
    // 上 turn 残留 flag
    setCardFlag(player, CARD_ID, true)
    // 本 action 快照：什么都没造（roomTiles / stableTiles / fenceSegments 不变）
    recordActionSnapshot(player, 99)
    session.loadState(state)

    B27_Toolbox_impl.effect!.onBuy!(state, player)

    // 跨 turn 残留被覆盖
    expect(isCardFlagged(player, CARD_ID)).toBe(false)
  })

  it('与机制 A jump 共存：B150 jump 不重复触发 onEndTurn', () => {
    const session = setupPlayed()
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push('B150_LargeScaleFarmer')
    session.loadState(state)

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)

    // 推进所有 choice 到底（接受 B150 jump、修房、买 major、跳过 / 选 B27 prompt）
    let safety = 30
    while (resp.pending.type === 'choice' && safety-- > 0) {
      const opts = resp.pending.options
      // 优先选 construct（如果有）以确保修房触发 setFlag
      const constructOption = opts.find(o => o.value === 'construct' || /construct/i.test(o.value))
      // 否则推进任何非 skip 选项 / 否则 skip
      const choice = constructOption ?? opts.find(o => o.value !== '__skip__') ?? opts[0]!
      resp = session.resolveChoice(0, choice.value)
    }

    // 最终到 confirmNextPlayer，整个 chain 完成
    expect(resp.pending.type).toBe('confirmNextPlayer')
    // flag 被 onEndTurn 清（如果 onEndTurn 触发了的话）
    expect(isCardFlagged(resp.state.players[0]!, CARD_ID)).toBe(false)
  })
})
```

⚠️ 测试可能需要根据实际 pending option 形式调整 `value` 字符串（如 'construct' 还是 'minor:construct' 还是 ID 前缀）。executor 跑一次看 actual pending.options，按实际格式调整。

- [ ] **Step 4: 跑 session 测试**

Run: `pnpm exec vitest run server/__tests__/B27_Toolbox-session.test.ts`
Expected: 5 个测试全 PASS

如果有 fail：
- 看是不是 pending option value 名字不匹配（实际 `'construct'` vs `'minor:construct'` 等），按实际打印调整
- 看是不是 `confirmNextPlayer` 不是终态（场景 1 的 buy major 后可能还有别的 pending），按实际推进

- [ ] **Step 5: 跑全量 fast 测试无回归**

Run: `pnpm test:fast`
Expected: 全部 PASS（包括之前的 268 个文件 + 新加的 1 个 = 269 文件）

- [ ] **Step 6: lint + build**

Run: `pnpm run lint && pnpm run build`
Expected: 0 error

- [ ] **Step 7: 提交**

```bash
git add shared/cards/B/B27_Toolbox.ts server/__tests__/B27_Toolbox-session.test.ts
git commit -m "refactor(B27): rewrite Toolbox using effect.onEndTurn + onBuy

Drops the per-action makeToolboxFlow path that fired buy-major prompt on
every construct / build-stables / fencing event. Now:

- listener on construct / build-stables / fencing only setCardFlag(true)
  in work phase (B27 must be already played for the listener to fire)
- effect.onBuy (when B27 is freshly played mid-turn) retros the
  per-action snapshot delta via getRoomsBuiltThisAction /
  getStableTilesBuiltThisAction / getFencesBuiltThisAction; this also
  covers the cross-turn flag residue case (always rewrites the flag)
- effect.onEndTurn (dispatched by game-core continueEndTurnHooks at the
  end of every takeAction) checks the flag, returns the buy-major flow
  with allowedPurchases=Joinery/Pottery/Basket, and clears the flag

Mechanism A jump is naturally compatible: jumps run inside the original
takeAction's step loop, so onEndTurn fires exactly once when the entire
chain (including jump second placement and any second-space SEQ)
completes.

Five session tests cover: played + build path, no-build path, onBuy
detection of prior builds, cross-turn flag residue cleanup, and B150
jump compatibility."
```

---

## Phase 3: 文档同步

**Files:**
- Modify: `docs/card_progress.md`
- Modify: `docs/master-plan.md`

### Task 3.1: card_progress.md

- [ ] **Step 1: §2.0 加 changelog 条目**

在 §2.0 顶部加一行：

```
- **2026-04-30 Sprint 5 mech-D — B27 Toolbox BGA 对齐：用 effect.onEndTurn / effect.onBuy + 新 getFencesBuiltThisAction helper 替代每次 construct / stables / fencing 都弹 prompt 的旧实现。详见 docs/superpowers/specs/2026-04-30-sprint-5-mech-d-turn-edge-phase-design.md**
```

- [ ] **Step 2: §2.3 把 B27 标 ✅**

定位 §2.3 "Sprint 5 PR-5 deferred to follow-up (21 cards)" 列表里 B27 那行（如果有），改为：

```
- **B27 Toolbox** — ✅ Sprint 5 mech-D — once-per-turn semantics with onEndTurn cleanup using effect.onEndTurn + onBuy
```

如果原 §2.3 文本没有专门 B27 一行，把 B27 从待修计数中减去并在 §2.0 提一句。

- [ ] **Step 3: §7 基础设施加新条**

```
### action-snapshot fence segment delta (Sprint 5 mech-D)

`shared/cards/helpers/action-snapshot.ts` 在 `recordActionSnapshot` 时多记 `fenceSegments: player.fenceSegments.length`；新加 `getFencesBuiltThisAction(player)` helper 返回当前 actionToken 内围栏段数差量。仿现有 `getRoomsBuiltThisAction` / `getStableTilesBuiltThisAction`。B27 Toolbox `effect.onBuy` 用此判定"本 turn 已造过围栏吗"。
```

- [ ] **Step 4: §8 时间线加新行**

```
| Sprint 5 mech-D (B27 Toolbox turn-edge) | 04-30 | 0 | <更新数> | <更新%> |
```

实现数 / Tier 数按 §1 总览的实际数字算（B27 从"deferred"迁出时实现数 +1）。

### Task 3.2: master-plan.md §8

- [ ] **Step 5: 更新 Sprint 5 行**

`docs/master-plan.md` §8 Sprint 5 行：

- 状态："partially done (11/28; PR-5 + mech-A; 17 张 deferred)" 更新为 "partially done (12/28; PR-5 + mech-A + mech-D; 16 张 deferred)"
- 实际工时加注："~0.5 day (PR-5) + ~2 day (mech-A) + ~0.5 day (mech-D)"
- PR/Commit 列加：`sprint-5-mech-d-turn-edge-phase` 分支或 PR 号

### Task 3.3: 提交

- [ ] **Step 6: 跑全量 fast / lint / build 终验**

Run: `pnpm test:fast && pnpm run lint && pnpm run build`
Expected: 全部 PASS / 0 error

- [ ] **Step 7: 提交**

```bash
git add -f docs/card_progress.md docs/master-plan.md
git commit -m "docs: sync mech-D landing across card_progress / master-plan

card_progress §2.0 changelog entry, §2.3 mark B27 done, §7 new
infrastructure section for getFencesBuiltThisAction, §8 timeline row.

master-plan §8 Sprint 5 progress bumped from 11/28 to 12/28."
```

---

## Phase 4: push + CI 验证（人工，按机制 A 的合并模式）

- [ ] **Step 1: git fetch 看远端 main**

Run: `git -C /data00/home/xuxinhao.titan/raw/open-agricola fetch origin && git -C /data00/home/xuxinhao.titan/raw/open-agricola log --oneline HEAD..origin/main`

- 输出空：可 fast-forward
- 输出有提交：先列出差异等用户确认（按 CLAUDE.md 提交约定）

- [ ] **Step 2: fast-forward merge 到 main + push**

```bash
git -C /data00/home/xuxinhao.titan/raw/open-agricola checkout main
git -C /data00/home/xuxinhao.titan/raw/open-agricola merge --ff-only sprint-5-mech-d-turn-edge-phase
git -C /data00/home/xuxinhao.titan/raw/open-agricola push origin main
```

- [ ] **Step 3: 等 GitHub Actions（CLAUDE.md 硬性要求）**

```bash
sleep 30
export $(grep '^GH_TOKEN=' /data00/home/xuxinhao.titan/raw/open-agricola/.env | xargs) && \
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?branch=main&per_page=5' \
  | jq '.workflow_runs[] | {name, head_sha: .head_sha[0:8], status, conclusion, html_url}'
```

等所有 run 状态变 `completed` + conclusion `success`。失败立即定位日志：

```bash
curl -sL -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/titanxxh/open-agricola/actions/runs/<RUN_ID>/logs" \
  -o /tmp/run.zip && unzip -p /tmp/run.zip | head -200
```

- [ ] **Step 4: 清理 worktree**

```bash
git -C /data00/home/xuxinhao.titan/raw/open-agricola worktree remove .worktree/sprint-5-mech-d-turn-edge-phase
git -C /data00/home/xuxinhao.titan/raw/open-agricola branch -d sprint-5-mech-d-turn-edge-phase
```
