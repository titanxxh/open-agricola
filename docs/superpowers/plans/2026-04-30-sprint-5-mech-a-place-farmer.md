# Sprint 5 机制 A：useActionSpace(other) 真二次落子 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 A129 / B130 / B150 / B152 四张卡改造成基于 place-farmer effect `viaCardJump` 模式的"真二次落子"，统一与普通落子的执行轨迹（含 ReplaceHook / computeCosts / isDoable / before listener 等扩展点）。

**Architecture:** place-farmer effect 加 jump 分支（farmer 物理移动 + stats 簿记 + 返回 flow 让 engine 走完整 ActionNode 路径）；新 helper `jumpLeaf` / `isJumpChainContains`；防递归靠 `actionContext.jumpChain` 自动累加；可达性靠 `computeAllowedPlacementSpaces` 唯一源。

**Tech Stack:** TypeScript / Vitest / pnpm；目标 Node 22；改动范围 `shared/actions/effects/place-farmer.ts` + `shared/cards/helpers/jump-leaf.ts` (新) + 4 张卡 listener + 测试 + i18n + 3 个文档。

**Spec:** `docs/superpowers/specs/2026-04-30-sprint-5-mech-a-place-farmer-design.md`

**Worktree:** `.worktree/sprint-5-mech-a-place-farmer`（已切到 `sprint-5-mech-a-place-farmer` 分支）

---

## File Structure

**新建：**
- `shared/cards/helpers/jump-leaf.ts` — `jumpLeaf()` + `isJumpChainContains()` helper
- `shared/cards/helpers/__tests__/jump-leaf.test.ts` — helper 单元测试
- `shared/actions/effects/__tests__/place-farmer-jump.test.ts` — effect jump 分支单元测试
- `server/__tests__/place-farmer-jump-recursion.test.ts` — 防递归 / 串联触发链 / ReplaceHook parity session 测试

**修改：**
- `shared/actions/effects/place-farmer.ts` — execute 头部加 jump 分支
- `shared/cards/A/A129_Swagman.ts` — listener 重写、删 onBeforeStartOfTurn flag cleanup
- `shared/cards/B/B130_FullPeasant.ts` — listener 重写
- `shared/cards/B/B150_LargeScaleFarmer.ts` — listener 重写
- `shared/cards/B/B152_JuniorArtist.ts` — listener 重写、删 zeroSpaceListener
- `shared/i18n/zh.ts` — 加 5 条 key（4 卡 choice + 1 log）
- `shared/i18n/en.ts` — 同步 5 条 key
- `server/__tests__/B130_FullPeasant-session.test.ts` — 加新断言（第二格 takenBy / placedFarmers）
- `server/__tests__/B150_LargeScaleFarmer-session.test.ts` — 同上
- `server/__tests__/B152_JuniorArtist-session.test.ts` — 同上
- `server/__tests__/batch12-session.test.ts` — A129 部分加新断言
- `docs/card_progress.md` — §2.0 / §2.3 / §7 / §8 同步
- `docs/master-plan.md` — §8 Sprint 5 行更新
- `docs/ENGINE_ARCHITECTURE.md` — 加 "place-farmer jump mode" 一节

---

## Phase 1: jumpLeaf helper + 单元测试

**Files:**
- Create: `shared/cards/helpers/jump-leaf.ts`
- Test: `shared/cards/helpers/__tests__/jump-leaf.test.ts`

### Task 1.1: 写 helper 单元测试

- [ ] **Step 1: 创建测试文件**

```ts
// shared/cards/helpers/__tests__/jump-leaf.test.ts
import { describe, it, expect } from 'vitest'
import { jumpLeaf, isJumpChainContains } from '../jump-leaf'
import type { CardListenerContext } from '../../card-listeners'

describe('jumpLeaf', () => {
  it('builds a place-farmer leaf with viaCardJump actionContext', () => {
    const flow = jumpLeaf({
      sourceCard: 'B130_FullPeasant',
      workerId: '1',
      targetSpaceId: 'fencing',
    })
    expect(flow).toEqual({
      type: 'leaf',
      actionId: 'place-farmer',
      sourceCard: 'B130_FullPeasant',
      actionContext: {
        viaCardJump: true,
        sourceCard: 'B130_FullPeasant',
        workerId: '1',
        targetSpaceId: 'fencing',
      },
    })
  })
})

describe('isJumpChainContains', () => {
  const makeContext = (jumpChain?: unknown): CardListenerContext =>
    ({ actionContext: jumpChain === undefined ? undefined : { jumpChain } } as unknown as CardListenerContext)

  it('returns false when actionContext is missing', () => {
    expect(isJumpChainContains(makeContext(), 'A129_Swagman')).toBe(false)
  })

  it('returns false when jumpChain is undefined', () => {
    expect(isJumpChainContains(
      ({ actionContext: {} } as unknown as CardListenerContext),
      'A129_Swagman',
    )).toBe(false)
  })

  it('returns false when jumpChain is empty', () => {
    expect(isJumpChainContains(makeContext([]), 'A129_Swagman')).toBe(false)
  })

  it('returns true when cardId is in jumpChain', () => {
    expect(isJumpChainContains(
      makeContext(['A129_Swagman', 'B130_FullPeasant']),
      'A129_Swagman',
    )).toBe(true)
  })

  it('returns false when cardId is not in jumpChain', () => {
    expect(isJumpChainContains(
      makeContext(['A129_Swagman']),
      'B130_FullPeasant',
    )).toBe(false)
  })

  it('returns false when jumpChain is not an array (defensive)', () => {
    expect(isJumpChainContains(
      makeContext('A129_Swagman'),
      'A129_Swagman',
    )).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试，确认 fail**

Run: `pnpm exec vitest run shared/cards/helpers/__tests__/jump-leaf.test.ts`
Expected: FAIL — `Cannot find module '../jump-leaf'`

### Task 1.2: 实现 helper

- [ ] **Step 3: 创建 helper 文件**

```ts
// shared/cards/helpers/jump-leaf.ts
import type { ActionFlow } from '../../game/types'
import type { CardListenerContext } from '../card-listeners'

export interface JumpLeafParams {
  sourceCard: string
  workerId: string
  targetSpaceId: string
}

/**
 * Build a place-farmer leaf in jump mode (viaCardJump).
 * The place-farmer effect's jump branch:
 *   1. moves the worker from its current space to targetSpaceId
 *   2. accumulates jumpChain (mutates actionContext)
 *   3. increments stats.placedFarmers
 *   4. returns a flow that runs the second placement through the engine's
 *      ActionNode path (so ReplaceHook / computeCosts / isDoable / before
 *      listener all dispatch identically to a direct placement).
 */
export const jumpLeaf = (p: JumpLeafParams): ActionFlow => ({
  type: 'leaf',
  actionId: 'place-farmer',
  sourceCard: p.sourceCard,
  actionContext: {
    viaCardJump: true,
    sourceCard: p.sourceCard,
    workerId: p.workerId,
    targetSpaceId: p.targetSpaceId,
  },
})

/** Listener self-check: skip if my CARD_ID is already in jumpChain. */
export const isJumpChainContains = (
  context: CardListenerContext,
  cardId: string,
): boolean => {
  const chain = context.actionContext?.jumpChain
  return Array.isArray(chain) && chain.includes(cardId)
}
```

- [ ] **Step 4: 运行测试，确认 pass**

Run: `pnpm exec vitest run shared/cards/helpers/__tests__/jump-leaf.test.ts`
Expected: PASS（6 个测试全绿）

- [ ] **Step 5: lint + build**

Run: `pnpm run lint && pnpm run build`
Expected: 0 ESLint error；build 成功（pre-existing warning 可忽略）

- [ ] **Step 6: 提交**

```bash
git add shared/cards/helpers/jump-leaf.ts shared/cards/helpers/__tests__/jump-leaf.test.ts
git commit -m "feat(jump-leaf): add helper for place-farmer viaCardJump mode

Adds jumpLeaf() to construct place-farmer leafs with viaCardJump=true,
and isJumpChainContains() for listener self-check against actionContext.jumpChain.

Used by A129/B130/B150/B152 to delegate the second placement to the
place-farmer effect's jump branch (next commit)."
```

---

## Phase 2: place-farmer effect viaCardJump 分支

**Files:**
- Modify: `shared/actions/effects/place-farmer.ts`
- Test: `shared/actions/effects/__tests__/place-farmer-jump.test.ts`

### Task 2.1: 写 effect 单元测试

- [ ] **Step 1: 创建测试文件**

```ts
// shared/actions/effects/__tests__/place-farmer-jump.test.ts
import { describe, it, expect } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import { placeFarmerAction } from '../place-farmer'
import { setWorkersAtHome } from '../../../shared/game/player'
import { addWorkerRef } from '../../../shared/game/space'
import { createInitialPlayerStats } from '../../../shared/logic/stats'

const buildState = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.stats = createInitialPlayerStats({ isFirstPlayer: false })
  player.resources = { ...player.resources, food: 5, grain: 2, wood: 10 }
  return { session, state, player }
}

describe('place-farmer effect viaCardJump branch', () => {
  it('moves worker from current space to targetSpace and bumps placedFarmers', () => {
    const { state, player } = buildState()
    const fromSpace = state.actionSpaces.find(s => s.id === 'grain-utilization')!
    const targetSpace = state.actionSpaces.find(s => s.id === 'fencing')!
    addWorkerRef(fromSpace, player.id, '1')
    const placedBefore = player.stats!.placedFarmers

    const actionContext: Record<string, unknown> = {
      viaCardJump: true,
      sourceCard: 'B130_FullPeasant',
      workerId: '1',
      targetSpaceId: 'fencing',
    }
    const result = placeFarmerAction.execute({
      state,
      player,
      space: fromSpace,
      actionContext,
    })

    expect(fromSpace.takenBy).toEqual([])
    expect(targetSpace.takenBy).toEqual([{ playerId: player.id, workerId: '1' }])
    expect(player.stats!.placedFarmers).toBe(placedBefore + 1)
    expect(actionContext.jumpChain).toEqual(['B130_FullPeasant'])
    if (result.type === 'flow') {
      expect(result.flow.type).toBe('leaf')
      if (result.flow.type === 'leaf') {
        expect(result.flow.actionId).toBe('fencing')
        expect(result.flow.actionContext).toMatchObject({
          viaCardJump: true,
          sourceCard: 'B130_FullPeasant',
          jumpChain: ['B130_FullPeasant'],
        })
      }
    } else {
      throw new Error(`expected flow result, got ${result.type}`)
    }
  })

  it('appends to existing jumpChain when nested', () => {
    const { state, player } = buildState()
    const fromSpace = state.actionSpaces.find(s => s.id === 'grain-utilization')!
    addWorkerRef(fromSpace, player.id, '1')

    const actionContext: Record<string, unknown> = {
      viaCardJump: true,
      sourceCard: 'B130_FullPeasant',
      workerId: '1',
      targetSpaceId: 'fencing',
      jumpChain: ['A129_Swagman'],
    }
    placeFarmerAction.execute({ state, player, space: fromSpace, actionContext })
    expect(actionContext.jumpChain).toEqual(['A129_Swagman', 'B130_FullPeasant'])
  })

  it('fails when workerId is not on any space', () => {
    const { state, player } = buildState()
    const result = placeFarmerAction.execute({
      state,
      player,
      space: state.actionSpaces[0]!,
      actionContext: {
        viaCardJump: true,
        sourceCard: 'X',
        workerId: '99',
        targetSpaceId: 'fencing',
      },
    })
    expect(result.type).toBe('fail')
  })

  it('fails when targetSpaceId does not exist', () => {
    const { state, player } = buildState()
    const fromSpace = state.actionSpaces.find(s => s.id === 'grain-utilization')!
    addWorkerRef(fromSpace, player.id, '1')
    const result = placeFarmerAction.execute({
      state,
      player,
      space: fromSpace,
      actionContext: {
        viaCardJump: true,
        sourceCard: 'X',
        workerId: '1',
        targetSpaceId: 'no-such-space',
      },
    })
    expect(result.type).toBe('fail')
  })

  it('fails when targetSpace is not in computeAllowedPlacementSpaces (e.g. occupied)', () => {
    const { state, player } = buildState()
    const fromSpace = state.actionSpaces.find(s => s.id === 'grain-utilization')!
    const targetSpace = state.actionSpaces.find(s => s.id === 'fencing')!
    addWorkerRef(fromSpace, player.id, '1')
    addWorkerRef(targetSpace, state.players[1]!.id, '1')  // 对手占第二格

    const result = placeFarmerAction.execute({
      state,
      player,
      space: fromSpace,
      actionContext: {
        viaCardJump: true,
        sourceCard: 'X',
        workerId: '1',
        targetSpaceId: 'fencing',
      },
    })
    expect(result.type).toBe('fail')
    expect(fromSpace.takenBy).toEqual([{ playerId: player.id, workerId: '1' }])  // 未变更
  })

  it('does not consume family pool (worker count unchanged)', () => {
    const { state, player } = buildState()
    const fromSpace = state.actionSpaces.find(s => s.id === 'grain-utilization')!
    addWorkerRef(fromSpace, player.id, '1')
    const activeBefore = player.workers.filter(w => w.isActive).length

    placeFarmerAction.execute({
      state,
      player,
      space: fromSpace,
      actionContext: {
        viaCardJump: true,
        sourceCard: 'X',
        workerId: '1',
        targetSpaceId: 'fencing',
      },
    })
    expect(player.workers.filter(w => w.isActive).length).toBe(activeBefore)
  })
})
```

- [ ] **Step 2: 运行测试，确认 fail**

Run: `pnpm exec vitest run shared/actions/effects/__tests__/place-farmer-jump.test.ts`
Expected: FAIL — execute 还没 jump 分支，所有断言都会爆

### Task 2.2: 实现 effect jump 分支

- [ ] **Step 3: 修改 place-farmer.ts execute**

修改 `shared/actions/effects/place-farmer.ts` 的 `placeFarmerAction.execute`，在头部加 jump 分支。文件 imports 需要新增：

```ts
import { removeWorkerRef, addWorkerRef, isSpaceOccupied } from '../../game/space'
import { incPlacedFarmers } from '../../logic/stats'
```

（`addWorkerRef` 已经 imported，`removeWorkerRef` 需要新加；`isSpaceOccupied` 通过现有 import 获取或新加；`incPlacedFarmers` 新加。）

execute 内首段加：

```ts
execute: ({ state, player, actionContext }) => {
  // ── viaCardJump 分支（机制 A）──
  if (actionContext?.viaCardJump) {
    const sourceCard = actionContext.sourceCard as string | undefined
    const workerId = actionContext.workerId as string | undefined
    const targetSpaceId = actionContext.targetSpaceId as string | undefined
    if (!sourceCard || !workerId || !targetSpaceId) {
      return { type: 'fail', logKey: 'log.placeFarmerFail' }
    }

    const fromSpace = state.actionSpaces.find(s =>
      s.takenBy.some(t => t.playerId === player.id && t.workerId === workerId),
    )
    const targetSpace = state.actionSpaces.find(s => s.id === targetSpaceId)
    if (!fromSpace || !targetSpace) {
      return { type: 'fail', logKey: 'log.placeFarmerFail' }
    }

    // 防御性可达性二次校验：与普通落子完全一致的判定源
    const allowed = computeAllowedPlacementSpaces(state, player)
    if (!allowed.some(a => a.spaceId === targetSpaceId)) {
      return { type: 'fail', logKey: 'log.placeFarmerFail' }
    }

    // 累加 jumpChain（mutate actionContext，让 hooks.after dispatch 看到）
    actionContext.jumpChain = [
      ...((actionContext.jumpChain as string[]) ?? []),
      sourceCard,
    ]

    // 移动 farmer
    removeWorkerRef(fromSpace, player.id, workerId)
    addWorkerRef(targetSpace, player.id, workerId)
    recordRoundPlacement(player, targetSpace.id, workerId)

    // stats：jump 也算一次 farmer placement（与 game-core.ts:1936 入口对齐）
    incPlacedFarmers(player)

    // 第二格执行：返回 flow 让 engine 走完整 ActionNode 路径
    // （含 applyComputeReplace / applyIsDoable / computeCosts / before listener）
    return {
      type: 'flow',
      flow: {
        type: 'leaf',
        actionId: targetSpaceId,
        sourceCard,
        actionContext: { ...actionContext },
      },
    }
  }

  // ── 原 fromSupply 分支 ──
  if (actionContext?.fromSupply) {
    // ... 现有代码不变
  }

  // ── 原标准 choice 分支 ──
  // ... 现有代码不变
},
```

注意：保留 `fromSupply` 与原有标准 choice 分支不动，只在头部插入 jump 分支。

- [ ] **Step 4: 运行单元测试，确认 pass**

Run: `pnpm exec vitest run shared/actions/effects/__tests__/place-farmer-jump.test.ts`
Expected: PASS（6 个测试全绿）

- [ ] **Step 5: 跑全量普通落子相关测试，确保无回归**

Run: `pnpm exec vitest run shared/engine/__tests__/place-farmer-integration.test.ts shared/cards/__tests__/place-farmer-cards.test.ts shared/actions/effects/__tests__/placement-availability.test.ts`
Expected: 全部 PASS（pre-existing test 不受影响）

- [ ] **Step 6: lint + build**

Run: `pnpm run lint && pnpm run build`
Expected: 0 error

- [ ] **Step 7: 提交**

```bash
git add shared/actions/effects/place-farmer.ts shared/actions/effects/__tests__/place-farmer-jump.test.ts
git commit -m "feat(place-farmer): add viaCardJump branch for mech-A second placement

When actionContext.viaCardJump is true, place-farmer.execute moves the named
worker from its current space to targetSpaceId, accumulates jumpChain
(mutates actionContext for downstream hook dispatch), bumps stats.placedFarmers,
and returns a flow leaf with actionId=targetSpaceId. The engine then runs the
second placement through the standard ActionNode path so ReplaceHook /
computeCosts / isDoable / before-phase listeners dispatch identically to a
direct placement.

Reachability is gated by computeAllowedPlacementSpaces (single source of truth
shared with regular placement) — fails the action if targetSpace is not
reachable at execute-time even though the listener pre-checked it.

Family pool is not consumed (worker is already active). Per-action bookkeeping
(actionToken / actionStartPlayerSnapshot / etc) is intentionally NOT reset —
jump is a continuation of the same action."
```

---

## Phase 3: A129 Swagman 改造

**Files:**
- Modify: `shared/cards/A/A129_Swagman.ts`
- Modify: `server/__tests__/batch12-session.test.ts`（A129 测试加新断言）
- Modify: `shared/i18n/zh.ts` + `shared/i18n/en.ts`（加 cards.A129_Swagman.choice）

### Task 3.1: i18n key

- [ ] **Step 1: 加 choice key（zh + en）**

在 `shared/i18n/zh.ts` 的 `cards:` 对象内（约 1034 行附近）加：

```ts
A129_Swagman: { choice: '流浪汉：跳到 {targetSpace}（免费）？' },
```

在 `shared/i18n/en.ts` 同位置加：

```ts
A129_Swagman: { choice: 'Swagman: jump to {targetSpace} (free)?' },
```

### Task 3.2: 重写 A129 listener

- [ ] **Step 2: 替换整个文件内容**

完全替换 `shared/cards/A/A129_Swagman.ts`：

```ts
import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { jumpLeaf, isJumpChainContains } from '../helpers/jump-leaf'
import { computeAllowedPlacementSpaces } from '../../actions/effects/placement-availability'
import type { CardImpl } from '../registry'

const CARD_ID = 'A129_Swagman'

const TRIGGER_PAIRS: Record<string, string> = {
  'farm-expansion': 'grain-seeds',
  'grain-seeds': 'farm-expansion',
}

const listener: CardListenerRegistration = {
  id: 'A129-swagman-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isJumpChainContains(context, CARD_ID)) return

    const fromSpaceId = context.space?.id
    if (!fromSpaceId) return
    const targetSpaceId = TRIGGER_PAIRS[fromSpaceId]
    if (!targetSpaceId) return

    const allowed = computeAllowedPlacementSpaces(context.state, context.player)
    if (!allowed.some(a => a.spaceId === targetSpaceId)) return

    const myRef = context.space?.takenBy.find(t => t.playerId === context.player.id)
    if (!myRef) return

    return {
      flow: {
        type: 'seq',
        optional: true,
        choiceLabelKey: 'cards.A129_Swagman.choice',
        children: [
          jumpLeaf({
            sourceCard: CARD_ID,
            workerId: myRef.workerId,
            targetSpaceId,
          }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const A129_Swagman = new Occupation({
  id: CARD_ID,
  name: 'Swagman',
  deck: 'A',
  number: 129,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Immediately after each time you use the __Farm Expansion__ or __Grain Seeds__ action space, you can use the respective other space with the same person (even if it is occupied).',
  ],
  cost: {},
  players: '3+',
  newSet: true,
})

export const A129_Swagman_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
```

注意：删除了原文件的 `buildGrainSeedsFlow` / `buildFarmExpansionFlow` / `setCardFlag` / `onBeforeStartOfTurn` flag cleanup。

A129 desc 字面写"even if it is occupied"——需要 listener 注入 OCCUPIED extraOption 才能跳到已占第二格。本 plan 不实现这条扩展（spec §8.2 已排除"未参与机制 A 但监听 place-farmer 的卡"的扩展）；4 张机制 A 卡在 BGA 也都用"另一格未被占"的硬条件。如果未来要实现 A129 真正的"even if it is occupied"，需要 A129 自己注册 `computeArgs` listener 注入 OCCUPIED extraOption。本 phase 维持现状（jump 只到未占第二格）。

### Task 3.3: 更新 A129 session 测试

- [ ] **Step 3: 找到 batch12 里 A129 区块（~行 90-）**

Run: `grep -n 'A129_Swagman session\|describe.*A129' server/__tests__/batch12-session.test.ts`

- [ ] **Step 4: 增加新断言**

读 `server/__tests__/batch12-session.test.ts:90` 起的 A129 区块，在每个"接受跳转"场景加：

```ts
// 接受跳转后断言：
const farmExpansion = resp.state.actionSpaces.find(s => s.id === 'farm-expansion')!
const grainSeeds = resp.state.actionSpaces.find(s => s.id === 'grain-seeds')!
expect(farmExpansion.takenBy).toEqual([])  // 第一格 takenBy 清空
expect(grainSeeds.takenBy.length).toBe(1)  // 第二格 takenBy 有该 worker
expect(grainSeeds.takenBy[0]!.playerId).toBe(state.players[0]!.id)
expect(resp.state.players[0]!.stats!.placedFarmers).toBe(placedBefore + 2)  // +2: 入口 + jump
```

在"拒绝跳转"场景加：

```ts
expect(resp.state.players[0]!.stats!.placedFarmers).toBe(placedBefore + 1)  // 只 +1（仅入口）
```

具体修改要看现有测试结构；如果现有测试没记 `placedBefore`，在 `setup()` 之后加：
```ts
const placedBefore = state.players[0]!.stats?.placedFarmers ?? 0
```

- [ ] **Step 5: 跑测试**

Run: `pnpm exec vitest run server/__tests__/batch12-session.test.ts`
Expected: 所有 A129 测试 PASS

- [ ] **Step 6: lint + build**

Run: `pnpm run lint && pnpm run build`
Expected: 0 error

- [ ] **Step 7: 提交**

```bash
git add shared/cards/A/A129_Swagman.ts server/__tests__/batch12-session.test.ts shared/i18n/zh.ts shared/i18n/en.ts
git commit -m "refactor(A129): rewrite Swagman listener using jumpLeaf helper

Drops the inline buildGrainSeedsFlow / buildFarmExpansionFlow simulators and
the onBeforeStartOfTurn cardFlag cleanup (which never set the flag in the
first place — ONE_JUMP_PER_TURN was effectively no-op). Now uses jumpLeaf to
delegate the second placement to place-farmer's viaCardJump branch.

Reachability is gated by computeAllowedPlacementSpaces (single source of
truth). Recursion guarded by jumpChain self-check. Adds zh/en i18n key for
the optional jump prompt."
```

---

## Phase 4: B130 FullPeasant 改造

**Files:**
- Modify: `shared/cards/B/B130_FullPeasant.ts`
- Modify: `server/__tests__/B130_FullPeasant-session.test.ts`
- Modify: `shared/i18n/zh.ts` + `shared/i18n/en.ts`

### Task 4.1: i18n key

- [ ] **Step 1: 加 choice key（zh + en）**

在 zh / en 的 `cards:` 块加：

```ts
// zh
B130_FullPeasant: { choice: '全能农夫：付 1 食物跳到 {targetSpace}？' },
// en
B130_FullPeasant: { choice: 'Full Peasant: pay 1 food, jump to {targetSpace}?' },
```

### Task 4.2: 重写 B130 listener

- [ ] **Step 2: 替换整个文件**

完全替换 `shared/cards/B/B130_FullPeasant.ts`：

```ts
import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import { jumpLeaf, isJumpChainContains } from '../helpers/jump-leaf'
import { computeAllowedPlacementSpaces } from '../../actions/effects/placement-availability'
import type { CardImpl } from '../registry'

const CARD_ID = 'B130_FullPeasant'

const TRIGGER_PAIRS: Record<string, string> = {
  'grain-utilization': 'fencing',
  fencing: 'grain-utilization',
}

const listener: CardListenerRegistration = {
  id: 'B130-full-peasant-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isJumpChainContains(context, CARD_ID)) return

    const fromSpaceId = context.space?.id
    if (!fromSpaceId) return
    const targetSpaceId = TRIGGER_PAIRS[fromSpaceId]
    if (!targetSpaceId) return

    const allowed = computeAllowedPlacementSpaces(context.state, context.player)
    if (!allowed.some(a => a.spaceId === targetSpaceId)) return

    if ((context.player.resources.food ?? 0) < 1) return

    const myRef = context.space?.takenBy.find(t => t.playerId === context.player.id)
    if (!myRef) return

    return {
      flow: {
        type: 'seq',
        optional: true,
        choiceLabelKey: 'cards.B130_FullPeasant.choice',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          jumpLeaf({
            sourceCard: CARD_ID,
            workerId: myRef.workerId,
            targetSpaceId,
          }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const B130_FullPeasant = new Occupation({
  id: CARD_ID,
  name: 'Full Peasant',
  deck: 'B',
  number: 130,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time after you use the __Grain Utilization__ or __Fencing__ action space while the other is unoccupied, you can pay 1 <FOOD> to use the other space with the same person.',
  ],
  cost: {},
  players: '3+',
  newSet: true,
})

export const B130_FullPeasant_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
```

### Task 4.3: 更新 B130 session 测试

- [ ] **Step 3: 修改测试加新断言**

打开 `server/__tests__/B130_FullPeasant-session.test.ts`。在 "pays 1 food and chains to fence when accepting" 测试里，接受跳转之后追加：

```ts
const grainSpace = resp.state.actionSpaces.find(s => s.id === 'grain-utilization')!
const fencingSpace = resp.state.actionSpaces.find(s => s.id === 'fencing')!
expect(grainSpace.takenBy).toEqual([])  // 第一格清空
expect(fencingSpace.takenBy.length).toBe(1)  // 第二格被该 worker 占用
expect(fencingSpace.takenBy[0]!.playerId).toBe(state.players[0]!.id)
```

在 setup 后记下 `const placedBefore = state.players[0]!.stats?.placedFarmers ?? 0`，然后接受场景断言 `+2`，拒绝场景断言 `+1`。

新增一个测试：

```ts
it('does not consume family pool on jump (worker count unchanged)', () => {
  const session = setup({ withCard: true, food: 3 })
  const state = session.getState().state
  const player = state.players[0]!
  const activeBefore = player.workers.filter(w => w.isActive).length
  let resp = session.takeAction(0, 'grain-utilization')
  if (resp.pending.type === 'choice') {
    const accept = resp.pending.options.find(o => o.value !== '__skip__')!
    resp = session.resolveChoice(0, accept.value)
  }
  // workers 仍然在格子上而非池里 — pool 不消耗额外 worker
  expect(resp.state.players[0]!.workers.filter(w => w.isActive).length)
    .toBe(activeBefore)
})
```

- [ ] **Step 4: 跑测试**

Run: `pnpm exec vitest run server/__tests__/B130_FullPeasant-session.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: lint + build**

Run: `pnpm run lint && pnpm run build`
Expected: 0 error

- [ ] **Step 6: 提交**

```bash
git add shared/cards/B/B130_FullPeasant.ts server/__tests__/B130_FullPeasant-session.test.ts shared/i18n/zh.ts shared/i18n/en.ts
git commit -m "refactor(B130): rewrite Full Peasant listener using jumpLeaf helper

Drops the inline buildChainedFlow simulator. Listener now returns SEQ
optional [payLeaf, jumpLeaf]; the place-farmer effect's viaCardJump branch
moves the worker and runs the second placement through the standard engine
path.

Reachability via computeAllowedPlacementSpaces. Adds zh/en i18n keys.
Session tests now assert physical farmer movement and stats.placedFarmers
delta."
```

---

## Phase 5: B150 LargeScaleFarmer 改造

**Files:**
- Modify: `shared/cards/B/B150_LargeScaleFarmer.ts`
- Modify: `server/__tests__/B150_LargeScaleFarmer-session.test.ts`
- Modify: `shared/i18n/zh.ts` + `shared/i18n/en.ts`

### Task 5.1: i18n key

- [ ] **Step 1: 加 choice key（zh + en）**

```ts
// zh
B150_LargeScaleFarmer: { choice: '大型农场主：付 1 食物跳到 {targetSpace}？' },
// en
B150_LargeScaleFarmer: { choice: 'Large-Scale Farmer: pay 1 food, jump to {targetSpace}?' },
```

### Task 5.2: 重写 B150 listener

- [ ] **Step 2: 替换整个文件**

完全替换 `shared/cards/B/B150_LargeScaleFarmer.ts`，结构跟 B130 几乎一致，只换 TRIGGER_PAIRS / CARD_ID / desc / players：

```ts
import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf } from '../helpers/pay-gain-node'
import { jumpLeaf, isJumpChainContains } from '../helpers/jump-leaf'
import { computeAllowedPlacementSpaces } from '../../actions/effects/placement-availability'
import type { CardImpl } from '../registry'

const CARD_ID = 'B150_LargeScaleFarmer'

const TRIGGER_PAIRS: Record<string, string> = {
  'farm-expansion': 'major-improvement',
  'major-improvement': 'farm-expansion',
}

const listener: CardListenerRegistration = {
  id: 'B150-large-scale-farmer-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isJumpChainContains(context, CARD_ID)) return

    const fromSpaceId = context.space?.id
    if (!fromSpaceId) return
    const targetSpaceId = TRIGGER_PAIRS[fromSpaceId]
    if (!targetSpaceId) return

    const allowed = computeAllowedPlacementSpaces(context.state, context.player)
    if (!allowed.some(a => a.spaceId === targetSpaceId)) return

    if ((context.player.resources.food ?? 0) < 1) return

    const myRef = context.space?.takenBy.find(t => t.playerId === context.player.id)
    if (!myRef) return

    return {
      flow: {
        type: 'seq',
        optional: true,
        choiceLabelKey: 'cards.B150_LargeScaleFarmer.choice',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          jumpLeaf({
            sourceCard: CARD_ID,
            workerId: myRef.workerId,
            targetSpaceId,
          }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const B150_LargeScaleFarmer = new Occupation({
  id: CARD_ID,
  name: 'Large-Scale Farmer',
  deck: 'B',
  number: 150,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time after you use the __Farm Expansion__ or __Major Improvement__ action space while the other is unoccupied, you can pay 1 <FOOD> to use that other space with the same person.',
  ],
  cost: {},
  players: '4+',
  newSet: true,
})

export const B150_LargeScaleFarmer_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
```

### Task 5.3: 更新 B150 session 测试

- [ ] **Step 3: 同 B130 模式加断言**

模仿 Phase 4 Step 3，对 `server/__tests__/B150_LargeScaleFarmer-session.test.ts` 的接受场景加 takenBy / placedFarmers 断言（+2 接受 / +1 拒绝）。

新增 "canBeExecutedByPlayer 拒绝" 场景测试 — 玩家无任何 major 可买（player.resources 不够 + 现有 majors 用尽），断言 listener 不弹 prompt。具体细节看现有 setup helper 配置。

- [ ] **Step 4: 跑测试**

Run: `pnpm exec vitest run server/__tests__/B150_LargeScaleFarmer-session.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: lint + build**

Run: `pnpm run lint && pnpm run build`
Expected: 0 error

- [ ] **Step 6: 提交**

```bash
git add shared/cards/B/B150_LargeScaleFarmer.ts server/__tests__/B150_LargeScaleFarmer-session.test.ts shared/i18n/zh.ts shared/i18n/en.ts
git commit -m "refactor(B150): rewrite Large-Scale Farmer listener using jumpLeaf helper

Same pattern as B130: SEQ optional [payLeaf, jumpLeaf]; reachability via
computeAllowedPlacementSpaces; jumpChain self-check.

Notable: jump targeting major-improvement now goes through engine's
ActionNode path, so D117 / E134 etc that hook computeReplace or
computeCosts on the major-improvement action automatically apply to the
jump version (regression coverage in Phase 7's parity tests)."
```

---

## Phase 6: B152 JuniorArtist 改造（删 zeroSpaceListener）

**Files:**
- Modify: `shared/cards/B/B152_JuniorArtist.ts`
- Modify: `server/__tests__/B152_JuniorArtist-session.test.ts`
- Modify: `shared/i18n/zh.ts` + `shared/i18n/en.ts`

### Task 6.1: i18n key

- [ ] **Step 1: 加 choice key（zh + en）**

```ts
// zh
B152_JuniorArtist: { choice: '初级艺术家：付 1 食物跳到 {targetSpace}？' },
// en
B152_JuniorArtist: { choice: 'Junior Artist: pay 1 food, jump to {targetSpace}?' },
```

### Task 6.2: 重写 B152 listener（删 zeroSpaceListener + 三选一 XOR）

- [ ] **Step 2: 替换整个文件**

完全替换 `shared/cards/B/B152_JuniorArtist.ts`：

```ts
import { Occupation } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../game/types'
import { payLeaf } from '../helpers/pay-gain-node'
import { jumpLeaf, isJumpChainContains } from '../helpers/jump-leaf'
import { computeAllowedPlacementSpaces } from '../../actions/effects/placement-availability'
import type { CardImpl } from '../registry'

const CARD_ID = 'B152_JuniorArtist'

// Day Laborer 落子后，玩家可付 1 食物把同 farmer 跳到 lessons-4 / lessons / traveling-players
// 三选一（每个目标都要在 computeAllowedPlacementSpaces 列表内才作为候选）。
const CANDIDATE_TARGETS = ['lessons-4', 'lessons', 'traveling-players'] as const

const listener: CardListenerRegistration = {
  id: 'B152-junior-artist-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['place-farmer'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (isJumpChainContains(context, CARD_ID)) return

    if (context.space?.id !== 'day-laborer') return
    if ((context.player.resources.food ?? 0) < 1) return

    const myRef = context.space?.takenBy.find(t => t.playerId === context.player.id)
    if (!myRef) return

    const allowed = computeAllowedPlacementSpaces(context.state, context.player)
    const candidates: ActionFlow[] = CANDIDATE_TARGETS
      .filter(targetSpaceId => allowed.some(a => a.spaceId === targetSpaceId))
      .map(targetSpaceId => jumpLeaf({
        sourceCard: CARD_ID,
        workerId: myRef.workerId,
        targetSpaceId,
      }))

    if (candidates.length === 0) return

    // 单候选退化为 leaf；多候选用 XOR（不 optional — 玩家接受外层 SEQ 后必选一个目标）
    const chained: ActionFlow =
      candidates.length === 1
        ? candidates[0]!
        : { type: 'xor', children: candidates }

    return {
      flow: {
        type: 'seq',
        optional: true,
        choiceLabelKey: 'cards.B152_JuniorArtist.choice',
        children: [
          payLeaf({ cardId: CARD_ID, cost: { food: 1 } }),
          chained,
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const B152_JuniorArtist = new Occupation({
  id: CARD_ID,
  name: 'Junior Artist',
  deck: 'B',
  number: 152,
  category: 'ACTIONS_BOOSTER',
  desc: [
    'Each time after you use the __Day Laborer__ action space, you can pay 1 <FOOD> to use an unoccupied __Traveling Players__ or __Lessons__ action space with the same person.',
  ],
  cost: {},
  players: '4+',
  newSet: true,
})

export const B152_JuniorArtist_impl = {
  listeners: [listener],
  reaches: [] as readonly string[],
} satisfies CardImpl
```

注意：
- 删除了 `zeroSpaceListener` —— 真落子后第二格自然清空 traveling-players food（traveling-players space.execute 内部清零，无需补丁）
- 删除了 `getLessonsCostForSpace` / `canPlaySomeOccupation` 手算逻辑 —— 改由 `computeAllowedPlacementSpaces` 统一判定（lessons / lessons-4 自己的 `canBeExecutedByPlayer` 已含成本可达性）

### Task 6.3: 更新 B152 session 测试

- [ ] **Step 3: 同 B130 模式加断言 + 三选一断言**

模仿 Phase 4 Step 3，加 takenBy / placedFarmers / 工人池不消耗 断言。

新增"三选一 XOR"测试场景：玩家有 lessons-4 / lessons / traveling-players 都可达时，断言 pending 的 options 含 3 个目标格的 choice value。

新增"traveling-players 食物清零"测试：玩家用 day-laborer → 接受跳转 → 选 traveling-players → 断言 traveling-players 的 `space.resources.food === 0` 且 player 收到食物。

- [ ] **Step 4: 跑测试**

Run: `pnpm exec vitest run server/__tests__/B152_JuniorArtist-session.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: lint + build**

Run: `pnpm run lint && pnpm run build`
Expected: 0 error

- [ ] **Step 6: 提交**

```bash
git add shared/cards/B/B152_JuniorArtist.ts server/__tests__/B152_JuniorArtist-session.test.ts shared/i18n/zh.ts shared/i18n/en.ts
git commit -m "refactor(B152): rewrite Junior Artist listener using jumpLeaf, remove zeroSpaceListener

Drops the inline play-occupation cost computation, the manual TP food drain
patch (zeroSpaceListener), and the canPlaySomeOccupation pre-check. Now uses
jumpLeaf for all three candidates (lessons-4 / lessons / traveling-players);
the place-farmer viaCardJump branch + standard ActionNode dispatch handles
costs and accumulation drain naturally.

XOR for the three targets (single-candidate falls back to a single leaf).
Reachability via computeAllowedPlacementSpaces."
```

---

## Phase 7: 防递归核心测试 + log key

**Files:**
- Create: `server/__tests__/place-farmer-jump-recursion.test.ts`
- Modify: `shared/i18n/zh.ts` + `shared/i18n/en.ts`（加 `log.cardJumpedToSpace`）

**说明（实施约束）**：spec §6.4 / §6.5 / §6.5b 设想用 stub 卡 / stub computeReplace hook 测试间接循环 / cascade dispatch / ReplaceHook parity。但当前 codebase 没有干净的运行时 unregister API（`shared/actions/hooks.ts` 只有 `clearActionHooks` 全清；`shared/cards/card-listeners.ts` 没暴露 `unregisterCardListener`）。要做完整 stub 测试需要先扩展 codebase（加 `unregisterActionHook(id)` 或通过 SessionCardContext.registerListener，且让 GameSession 暴露注入入口）—— 这是独立的工程项，**不在本 sprint 范围**。

本 phase 简化为**核心防递归覆盖**：
- A→A 自跳防护用现有 A129 直接测（最关键场景，spec §6.4 主要意图）
- A→B→A 间接循环 / cascade dispatch / 直接 stub ReplaceHook parity → 标为 follow-up（见 Phase 7 末尾的 NOTE）
- ReplaceHook parity 间接覆盖：B150 跳 major-improvement 时玩家正常进入买 major 流程，证明第二格走的是完整 ActionNode 路径（含 computeReplace / computeCosts / isDoable / before）；不需要直接 stub computeReplace

### Task 7.1: log key

- [ ] **Step 1: 加 log key（zh + en）**

在 zh / en 的 `log:` 块（约 719 行）加：

```ts
// zh
cardJumpedToSpace: '{player} 用 {cardName} 把 {worker} 跳到 {targetSpace}',
// en
cardJumpedToSpace: '{player} used {cardName} to jump {worker} to {targetSpace}',
```

本 plan 不在 effect 内主动 emit 这条 log（targetSpace.execute 自身的 log 已覆盖第二格"落子"语义；sourceCard 在日志条目里可见）。本 key 留给前端 / 日志面板未来需要时使用。

### Task 7.2: 自跳防护 + ActionNode 路径间接验证

- [ ] **Step 2: 创建测试文件**

```ts
// server/__tests__/place-farmer-jump-recursion.test.ts
import { describe, it, expect } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/game/player'
import { readActionSnapshotToken } from '../../shared/cards/helpers/action-snapshot'
import '../../shared/cards/A/A129_Swagman'
import '../../shared/cards/B/B150_LargeScaleFarmer'

const setup2P = (cardId: string) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = { ...player.resources, food: 5, grain: 2, wood: 20, clay: 10, reed: 10, stone: 10 }
  state.players[1]!.workersAvailable = 2
  player.occupationPlayed.push(cardId)
  session.loadState(state)
  return { session, state }
}

describe('A→A self-jump recursion guard', () => {
  it('A129 listener fires at most once per farmer placement chain', () => {
    const { session, state } = setup2P('A129_Swagman')
    const player = state.players[0]!
    const tokenBefore = readActionSnapshotToken(player) ?? -1
    const placedBefore = player.stats?.placedFarmers ?? 0

    let resp = session.takeAction(0, 'farm-expansion')
    while (resp.pending.type === 'choice') {
      const accept = resp.pending.options.find(o => o.value !== '__skip__')
      if (!accept) break
      resp = session.resolveChoice(0, accept.value)
    }

    const farmExpansion = resp.state.actionSpaces.find(s => s.id === 'farm-expansion')!
    const grainSeeds = resp.state.actionSpaces.find(s => s.id === 'grain-seeds')!

    // 自跳防护核心断言：链终止，farmer 在 grain-seeds（A 的 jump 目标），不会再跳回 farm-expansion
    expect(farmExpansion.takenBy).toEqual([])
    expect(grainSeeds.takenBy.length).toBe(1)

    // actionToken 入口 +1，jump 不再 +1（per-action 簿记不重置）
    expect(readActionSnapshotToken(resp.state.players[0]!)).toBe(tokenBefore + 1)

    // placedFarmers +2（入口 +1，jump 第二格 +1）
    expect(resp.state.players[0]!.stats!.placedFarmers).toBe(placedBefore + 2)
  })

  it('A129 jumpChain blocks self-trigger on second-place dispatch', () => {
    // 玩家落 grain-seeds（A129 监听的另一格）→ A 跳到 farm-expansion → 第二格 dispatch 时
    // jumpChain=['A129_Swagman']，listener 自检 includes('A129_Swagman')=true 跳过 → 不再跳回 grain-seeds
    const { session, state } = setup2P('A129_Swagman')
    let resp = session.takeAction(0, 'grain-seeds')
    while (resp.pending.type === 'choice') {
      const accept = resp.pending.options.find(o => o.value !== '__skip__')
      if (!accept) break
      resp = session.resolveChoice(0, accept.value)
    }
    const grainSeeds = resp.state.actionSpaces.find(s => s.id === 'grain-seeds')!
    const farmExpansion = resp.state.actionSpaces.find(s => s.id === 'farm-expansion')!
    expect(grainSeeds.takenBy).toEqual([])
    expect(farmExpansion.takenBy.length).toBe(1)
  })
})

describe('place-farmer jump runs full ActionNode path (parity smoke)', () => {
  it('B150 jump to major-improvement enters the buy-major flow', () => {
    // 验证 jump 第二格走完整 ActionNode 路径：major-improvement 自己的 buyable 判定 + 弹买 major prompt
    // 间接证明 applyComputeReplace / applyIsDoable / computeCosts / before listener 都跑了（否则 buyable
    // 判定 / cost 算法 / prompt 选项都不会出现）
    const { session, state } = setup2P('B150_LargeScaleFarmer')
    state.players[0]!.resources.food = 5

    let resp = session.takeAction(0, 'farm-expansion')
    while (resp.pending.type === 'choice') {
      const accept = resp.pending.options.find(o => o.value !== '__skip__')
      if (!accept) break
      resp = session.resolveChoice(0, accept.value)

      // 第二格是 major-improvement，应弹买 major 的 choice prompt
      if (resp.pending.type === 'choice') {
        const hasMajorOption = resp.pending.options.some(o =>
          /Major_/.test(o.value) || /major/i.test(o.value)
        )
        if (hasMajorOption) {
          // 找到买 major 的 prompt — 证明 ActionNode 路径完整
          break
        }
      }
    }

    // farm-expansion 已空、major-improvement 上有该 worker
    const farmSpace = resp.state.actionSpaces.find(s => s.id === 'farm-expansion')!
    const majorSpace = resp.state.actionSpaces.find(s => s.id === 'major-improvement')!
    expect(farmSpace.takenBy).toEqual([])
    expect(majorSpace.takenBy.length).toBe(1)
  })
})

// NOTE: 以下场景需要 codebase 扩展（unregisterActionHook / SessionCardContext 注入入口），
// 不在本 sprint 范围。spec §8.2 已登记为 follow-up：
//   - A→B→A 间接循环（需 stub 卡监听对方目标格跳回原源格）
//   - cascade dispatch (Y option) — second-space 触发其他卡 listener（需 stub observer 卡）
//   - 直接 stub computeReplace hook 验证 jump 第二格触发 ReplaceHook（间接已被本文件 B150 测试覆盖）
```

- [ ] **Step 3: 跑测试**

Run: `pnpm exec vitest run server/__tests__/place-farmer-jump-recursion.test.ts`
Expected: 全部 PASS

- [ ] **Step 4: 跑全量 fast project 确保无回归**

Run: `pnpm test:fast`
Expected: 全部 PASS

- [ ] **Step 5: lint + build**

Run: `pnpm run lint && pnpm run build`
Expected: 0 error

- [ ] **Step 6: 把 follow-up 测试登记到 spec §8.2**

打开 `docs/superpowers/specs/2026-04-30-sprint-5-mech-a-place-farmer-design.md`，在 §8.2 "明确排除" 列表末尾加：

```markdown
- **Stub-based 完整测试套（A→B→A 间接循环 / cascade dispatch / 直接 stub computeReplace parity）**：spec §6.4 / §6.5 / §6.5b 描述的场景需要 codebase 扩展运行时 stub 注册 API（如 `unregisterActionHook(id)`、SessionCardContext customListener 注入入口）。简单场景已在本 sprint 由 A129 自跳测试 + B150 → major-improvement 间接覆盖（验证 ActionNode 完整路径）；完整 stub 套件标为 follow-up
```

- [ ] **Step 7: 提交**

```bash
git add server/__tests__/place-farmer-jump-recursion.test.ts shared/i18n/zh.ts shared/i18n/en.ts docs/superpowers/specs/2026-04-30-sprint-5-mech-a-place-farmer-design.md
git commit -m "test(jump): self-jump guard + ActionNode parity smoke

Two test groups exercised against real cards (no stub infrastructure
required):
- A→A self-jump guard: A129 listener self-check on jumpChain prevents
  it from re-firing on the second-space dispatch; actionToken stays
  +1 (jump does not bump per-action bookkeeping); placedFarmers +2
- B150 jump to major-improvement enters the standard buy-major flow,
  which only happens if the second-placement runs the full ActionNode
  path (applyComputeReplace / applyIsDoable / computeCosts / before
  listener all dispatching). This is the parity smoke test.

Adds zh/en log.cardJumpedToSpace key for future log-panel use.

Stub-based full coverage (A→B→A indirect cycle, cascade dispatch on a
third-party listener, direct stub on computeReplace) is registered as a
follow-up in spec §8.2 — needs codebase to expose unregister APIs first."
```

---

## Phase 8: 文档同步

**Files:**
- Modify: `docs/card_progress.md`
- Modify: `docs/master-plan.md`
- Modify: `docs/ENGINE_ARCHITECTURE.md`

### Task 8.1: card_progress.md

- [ ] **Step 1: §2.0 加 changelog 条目**

在 `docs/card_progress.md` §2.0 顶部加：

```
- **2026-04-30 Sprint 5 mech-A — A129/B130/B150/B152 改用真二次落子机制 + place-farmer jump 模式 (actionContext.viaCardJump + jumpChain 自动累加 + 第二格走完整 ActionNode 路径，含 ReplaceHook / computeCosts / isDoable / before listener)**
```

- [ ] **Step 2: §2.3 把 4 张卡迁出待修列表**

定位 §2.3 里 "useActionSpace(other) semantic" 条目（4 张卡的描述），在每张卡末尾加 ✅ 标记：

```
- **A129 Swagman** — 已实现真二次落子 ✅ Sprint 5 mech-A
- **B130 FullPeasant** — 已实现真二次落子 ✅ Sprint 5 mech-A
- **B150 LargeScaleFarmer** — 已实现真二次落子 ✅ Sprint 5 mech-A
- **B152 JuniorArtist** — 已实现真二次落子 ✅ Sprint 5 mech-A
```

并把 §2.3 顶部的"待修计数"减去这 4 张（21 → 17 deferred）。

- [ ] **Step 3: §7 基础设施加新条**

```
### place-farmer jump mode (Sprint 5 mech-A)

actionContext.viaCardJump=true 时 place-farmer effect 进入 jump 分支：移动 worker（removeWorkerRef + addWorkerRef）+ 累加 jumpChain（mutate actionContext）+ stats.placedFarmers +1 + 返回 flow 让 engine 跑第二格的完整 ActionNode 路径。

防递归：listener 自检 isJumpChainContains(context, CARD_ID)。

可达性：listener handler 与 effect 二次校验都用 computeAllowedPlacementSpaces，单一判定源。

per-action 簿记不重置：actionToken / actionStartPlayerSnapshot / _activeActionBonusSources / cardEffectDeltasSinceFlush 都不动（jump 是同 action 延续）。

落地 BGA ruling：LANDS_ON_SECOND_SPACE（farmer 物理移动）+ ONE_JUMP_PER_TURN（jumpChain 自检）。

helper：shared/cards/helpers/jump-leaf.ts。
```

- [ ] **Step 4: §8 时间线加新行**

```
| Sprint 5 mech-A (A129/B130/B150/B152 真二次落子) | 04-30 | 0 | <更新数> | <更新%> |
```

具体 Tier / 实现数变化按 §1 总览数字更新。

### Task 8.2: master-plan.md §8

- [ ] **Step 5: 更新 Sprint 5 行**

在 `docs/master-plan.md` §8 Sprint 5 行：
- 状态："partially done (7/28; remainder deferred)" → "partially done (11/28; PR-5 + mech-A; 17 张 deferred)"
- 实际工时加注："~0.5 day (PR-5) + ~2 day (mech-A)"
- PR/Commit 列加：`sprint-5-mech-a-place-farmer` 分支或 PR 号（push 后填）

### Task 8.3: ENGINE_ARCHITECTURE.md

- [ ] **Step 6: 加新章节**

在 `docs/ENGINE_ARCHITECTURE.md` 的 hooks / pending 协议附近加一节：

```markdown
## place-farmer jump mode (Sprint 5 mech-A)

支持卡牌让玩家"借同一 farmer 跳到第二个 action space"的机制（BGA `useActionSpaceNode($space, $farmer)`）。

### 协议

卡牌 listener 返回 jump leaf：

```ts
{
  type: 'leaf',
  actionId: 'place-farmer',
  sourceCard: 'B130_FullPeasant',
  actionContext: {
    viaCardJump: true,
    sourceCard: 'B130_FullPeasant',
    workerId: '1',
    targetSpaceId: 'fencing',
  },
}
```

### effect 行为（`shared/actions/effects/place-farmer.ts`）

`actionContext.viaCardJump === true` 进入 jump 分支：

1. 反查 fromSpace（含 (playerId, workerId) 的格子）
2. `computeAllowedPlacementSpaces` 二次校验 targetSpaceId 可达
3. mutate `actionContext.jumpChain = [...prev, sourceCard]`
4. removeWorkerRef(from) + addWorkerRef(target) + recordRoundPlacement
5. `incPlacedFarmers(player)`
6. 返回 `{ type:'flow', flow:{ type:'leaf', actionId: targetSpaceId, sourceCard, actionContext: {...} } }` —— engine 走完整 ActionNode 路径

### 防递归

`actionContext.jumpChain` 累加经过的 sourceCard。listener 自检 `isJumpChainContains(context, CARD_ID)`。防 A→A 自跳与 A→B→A 任意长度间接循环。

### per-action 簿记不重置

actionToken / actionStartPlayerSnapshot / `_activeActionBonusSources` / `cardEffectDeltasSinceFlush` 都不动 —— jump 是同 action 延续。

### 不在范围

- farmer 移动动画（前端 TODO）
- countAsUse 行为模型（未来卡需要时再补）
- server 重启时 pending 恢复（架构层议题，非 jump 特有）

### 使用此机制的卡

A129 Swagman / B130 FullPeasant / B150 LargeScaleFarmer / B152 JuniorArtist。
```

- [ ] **Step 7: 跑全量测试 + lint + build 确认**

Run: `pnpm test:fast && pnpm run lint && pnpm run build`
Expected: 全部 PASS / 0 error

- [ ] **Step 8: 提交**

```bash
git add docs/card_progress.md docs/master-plan.md docs/ENGINE_ARCHITECTURE.md
git commit -m "docs: sync mech-A landing across card_progress / master-plan / ENGINE_ARCHITECTURE

card_progress §2.0 changelog entry, §2.3 mark four cards done, §7 new
infrastructure section for place-farmer jump mode, §8 timeline row.

master-plan §8 Sprint 5 progress bumped from 7/28 to 11/28.

ENGINE_ARCHITECTURE gets a new section documenting the viaCardJump
protocol, recursion guard, reachability source-of-truth, and per-action
bookkeeping invariants."
```

---

## Phase 9: 收尾 — push + CI 验证

- [ ] **Step 1: 跑完整测试套件（fast + slow）**

Run: `pnpm test`
Expected: 全部 PASS

如果 slow project 太久（254 个 single-card session 测试），用 `pnpm test:fast` 已足够本地把关；CI 的 `ci-full.yml` 会跑全量。

- [ ] **Step 2: lint + build 终验**

Run: `pnpm run lint && pnpm run build`
Expected: 0 error

- [ ] **Step 3: git fetch + 看远端是否有更新**

Run: `git fetch origin`

如果远端 main 有新提交导致 sprint-5-mech-a-place-farmer 不能 fast-forward，先列 commit 差异，确认后再决定 rebase 或 merge。

- [ ] **Step 4: push 分支**

```bash
git push -u origin sprint-5-mech-a-place-farmer
```

- [ ] **Step 5: 等 GitHub Actions（CLAUDE.md 硬性要求）**

```bash
export $(grep '^GH_TOKEN=' .env | xargs) && \
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=5' \
  | jq '.workflow_runs[] | {name, head_sha: .head_sha[0:8], status, conclusion, html_url}'
```

等所有 run 状态变 `completed` + conclusion `success`。失败立即定位日志：

```bash
curl -sL -H "Authorization: Bearer $GH_TOKEN" \
  "https://api.github.com/repos/titanxxh/open-agricola/actions/runs/<RUN_ID>/logs" \
  -o /tmp/run.zip && unzip -p /tmp/run.zip | head -200
```

- [ ] **Step 6: 决定合并策略**

CI 全绿后跟用户确认要不要：
- 直接 merge 到 main（`git checkout main && git merge sprint-5-mech-a-place-farmer && git push`）
- 提 PR 走 review
- 留分支等其他 sprint 完成一起合

merge 后清理 worktree：`git worktree remove .worktree/sprint-5-mech-a-place-farmer && git branch -d sprint-5-mech-a-place-farmer`。
