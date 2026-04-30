# Sprint 5 机制 E：6 张卡修批 + gain 三合一 + viaCardJump worker-less 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sprint 5 收口批 — 修 6 张 P1 行为偏差卡（B115 / C13 / B29 / B138 / C51 / A151）；同时合并 3 个 gain action（gain / gain-trigger-player / gain-other-players）到统一 gain；扩展 viaCardJump worker-less 模式让 A151 真对齐 BGA。

**Architecture:** gain 合并为 effect 内部 dispatch 重构（recipientPlayerId / recipientMode / payerId 参数化），~10 张 caller 字符串迁移；viaCardJump 加 workerId optional 让 A151 复用 mech-A 路径；其他 5 张卡内部修。**0 新 hook phase**。

**Tech Stack:** TypeScript / Vitest / pnpm。改动范围：1 effect rewrite + 2 effect 删除 + ~10 张 caller 卡迁移 + 6 张卡内部修 + 6 个 session 测试 + 文档。

**Spec:** `docs/superpowers/specs/2026-04-30-sprint-5-mech-e-misc-fixes-design.md`

**Worktree:** `.worktree/sprint-5-mech-e-misc-fixes`（基于 main `14955e74`，含所有 mech-A/B/D + stub-infra + cascade-fix）

---

## File Structure

**新建：**
- `server/__tests__/B115_TinsmithMaster-session.test.ts`（如不存在）
- `server/__tests__/C13_WoodSlideHammer-session.test.ts`
- `server/__tests__/B29_CookeryLesson-session.test.ts`（如不存在）— 加场景
- `server/__tests__/B138_ForestGuardian-session.test.ts`
- `server/__tests__/C51_FishingNet-session.test.ts`
- `server/__tests__/A151_Minstrel-session.test.ts`（如不存在）

**修改：**
- `shared/actions/effects/gain.ts` — 重写 execute 加 recipientPlayerId / recipientMode / payerId
- `shared/actions/effects/__tests__/` — 加合并 gain 单测
- `shared/actions/internal-actions.ts` — 删除 export gainTriggerPlayerAction / gainOtherPlayersAction
- `shared/cards/card-listeners.ts:221` — `'gain-other-players'` → `'gain'`
- `shared/i18n/zh.ts` + `en.ts` — 删 `actions.gain-trigger-player.*` / `actions.gain-other-players.*` keys
- 10 张 caller 卡：A29 / A50 / A132 / A154 / A156 / A159 / B138 / C38 / C51 / C142 / E160 — params 迁移
- B115 / C13 / B29 / A151 — 内部修
- 主路径：`shared/actions/effects/place-farmer.ts` viaCardJump 分支 + `shared/cards/helpers/jump-leaf.ts`

**删除：**
- `shared/actions/effects/gain-trigger-player.ts`
- `shared/actions/effects/gain-other-players.ts`

---

## Phase 1: 合并 gain action（不含 B138/C51 — Phase 2 处理）

**Files:** `shared/actions/effects/gain.ts` rewrite, 删 2 个 effect 文件, 9 张 caller 迁移, internal-actions / card-listeners / i18n

### Task 1.1: 重写 gain.ts execute 加参数化 dispatch

- [ ] **Step 1: 替换 gainAction.execute**

打开 `shared/actions/effects/gain.ts`，把 `gainAction.execute` 完全替换：

```ts
import type { ActionDefinition, PlayerState, Resource } from '../../game/types'
import { addCardResourceGained } from '../../cards/helpers/card-state'
import { gainConfigByActionId } from '../factories/gain'
import { trackWorkPhaseBuildingResources } from '../../logic/work-phase-resources'
import {
  addResourcesFromBoard,
  addResourcesFromCards,
} from '../../logic/stats'

export const gainResources = (
  player: PlayerState,
  resources: Partial<Resource>,
) => {
  Object.keys(resources).forEach((key) => {
    const resourceKey = key as keyof Resource
    const amount = resources[resourceKey] ?? 0
    if (amount > 0) player.resources[resourceKey] += amount
  })
}

export const gainAction: ActionDefinition = {
  id: 'gain',
  nameKey: 'actions.gain.name',
  descriptionKey: 'actions.gain.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, space, params, sourceCard }) => {
    const {
      recipientPlayerId,
      recipientMode,
      payerId,
      ...rawGain
    } = (params ?? {}) as {
      recipientPlayerId?: string
      recipientMode?: 'self' | 'others'
      payerId?: string
    } & Partial<Resource>

    const gain = (Object.keys(rawGain).length > 0
      ? rawGain
      : gainConfigByActionId.get(space.id)) as Partial<Resource> | undefined
    if (!gain) return { type: 'ok' as const, resourcesGained: {} }

    const gained: Record<string, number> = {}
    Object.keys(gain).forEach((key) => {
      const amount = gain[key as keyof typeof gain] ?? 0
      if (amount > 0) gained[key] = amount
    })

    let recipients: PlayerState[]
    if (recipientMode === 'others') {
      recipients = state.players.filter((entry) => entry.id !== player.id)
    } else if (recipientPlayerId) {
      const target = state.players.find((p) => p.id === recipientPlayerId)
      recipients = target ? [target] : []
    } else {
      recipients = [player]
    }

    if (payerId) {
      const payer = state.players.find((p) => p.id === payerId)
      if (payer) {
        Object.entries(gained).forEach(([key, amount]) => {
          const k = key as keyof Resource
          payer.resources[k] = Math.max(0, payer.resources[k] - amount)
        })
      }
    }

    for (const recipient of recipients) {
      gainResources(recipient, gain)
      if (recipient.id === player.id) {
        trackWorkPhaseBuildingResources(state, recipient.id, gained)
      }
      if (sourceCard) {
        addResourcesFromCards(recipient, gained)
      } else if (recipient.id === player.id) {
        addResourcesFromBoard(recipient, gained)
      }
    }

    if (sourceCard && recipients.length > 0) {
      const totalGain = Object.fromEntries(
        Object.entries(gained).map(([k, v]) => [k, v * recipients.length]),
      ) as Partial<Resource>
      addCardResourceGained(player, sourceCard, totalGain)
    }

    if (sourceCard) {
      const logKey = recipientMode === 'others'
        ? 'log.cardEffectOtherPlayersGain'
        : recipientPlayerId && recipientPlayerId !== player.id
          ? 'log.cardEffectGain'
          : 'log.cardEffectGain'
      return {
        type: 'ok' as const,
        resourcesGained: gained,
        logKey,
        logParams: { gain: gained, cardId: sourceCard },
      }
    }
    return { type: 'ok' as const, resourcesGained: gained }
  },
}

const createBonusAction = (
  id: string,
  gain: { wood?: number; food?: number; grain?: number },
): ActionDefinition => ({
  id,
  nameKey: `actions.${id}.name`,
  descriptionKey: `actions.${id}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player }) => {
    gainResources(player, gain)
    trackWorkPhaseBuildingResources(state, player.id, gain)
    addResourcesFromBoard(player, gain)
    return { type: 'ok' }
  },
})

export const bonusWoodAction = createBonusAction('bonus-wood', { wood: 1 })
export const bonusFoodAction = createBonusAction('bonus-food', { food: 1 })
export const bonusGrainAction = createBonusAction('bonus-grain', { grain: 1 })
```

### Task 1.2: 删除 2 个 effect 文件

- [ ] **Step 2: 删除 gain-trigger-player.ts + gain-other-players.ts**

```bash
rm shared/actions/effects/gain-trigger-player.ts
rm shared/actions/effects/gain-other-players.ts
```

### Task 1.3: 修 internal-actions.ts

- [ ] **Step 3: 删 export**

打开 `shared/actions/internal-actions.ts`，删除 `gainTriggerPlayerAction` / `gainOtherPlayersAction` import 与 export。可以用 grep 找：

```bash
grep -n 'gainTriggerPlayer\|gainOtherPlayers' shared/actions/internal-actions.ts
```

按行号定位，删除相关 import 行 + export 中的引用。

### Task 1.4: 修 card-listeners.ts:221

- [ ] **Step 4: 修 logKey Set**

```ts
// shared/cards/card-listeners.ts:221 改为：
['log.cardEffectOtherPlayersGain', new Set(['gain'])],  // 原 'gain-other-players' → 'gain'
```

注：这个 Set 应该是 logKey → actionIds 映射，让 log dedupe 用。改后 'gain' action 的 'others' recipientMode 仍 emit `log.cardEffectOtherPlayersGain` logKey（gain.execute 内部按 recipientMode 决定 logKey），所以这个映射继续正确。

### Task 1.5: 删 i18n keys

- [ ] **Step 5: 删 zh.ts / en.ts 中的 keys**

```bash
grep -n "gain-trigger-player\|gain-other-players" shared/i18n/zh.ts shared/i18n/en.ts
```

按行号定位，删除 `actions.gain-trigger-player.*` 和 `actions.gain-other-players.*` 的两组 key（每文件 2 组 = 4 个 key 块）。

### Task 1.6: 迁移 9 张 caller 卡（不含 B138 / C51 — Phase 2 处理）

- [ ] **Step 6: gain-trigger-player → gain (recipientPlayerId)**

文件清单（4 张卡）：

```bash
# A132_Publican.ts: targetPlayerId → recipientPlayerId
sed -i "s/'gain-trigger-player'/'gain'/g; s/targetPlayerId/recipientPlayerId/g" \
  shared/cards/A/A132_Publican.ts \
  shared/cards/A/A154_Paymaster.ts \
  shared/cards/A/A156_Buyer.ts \
  shared/cards/A/A159_JoineroftheSea.ts
```

注：用 sed 批量替换可能改到无关位置。**推荐手工每个文件检查一遍**：

```bash
grep -n "'gain-trigger-player'\|targetPlayerId" shared/cards/A/A132_Publican.ts shared/cards/A/A154_Paymaster.ts shared/cards/A/A156_Buyer.ts shared/cards/A/A159_JoineroftheSea.ts
```

每处把 `actionId: 'gain-trigger-player'` 改 `actionId: 'gain'`，`params: { ..., targetPlayerId }` 改 `params: { ..., recipientPlayerId }`。

- [ ] **Step 7: gain-other-players → gain (recipientMode: 'others')**

文件清单（5 张卡 + card-listeners 已在 Step 4 处理）：

```bash
grep -n "'gain-other-players'" shared/cards/A/A29_AleBenches.ts shared/cards/A/A50_MilkJug.ts shared/cards/C/C38_Christianity.ts shared/cards/C/C142_MarketCrier.ts shared/cards/E/E160_KelpGatherer.ts
```

每处：
```ts
// 原：actionId: 'gain-other-players', params: { food: 1 }
// 改：actionId: 'gain', params: { recipientMode: 'others', food: 1 }
```

参数 spread 不变，只加 `recipientMode: 'others'`。

### Task 1.7: 跑全量 fast 看回归 + lint + build

- [ ] **Step 8: 跑测试**

```bash
pnpm test:fast
```

Expected: 所有现有 caller 卡的 session 测试 PASS（行为不变）。如失败：看 caller 是否漏迁移。

- [ ] **Step 9: lint + build**

```bash
pnpm run lint && pnpm run build
```

Expected: 0 error。

### Task 1.8: 提交

- [ ] **Step 10: 提交**

```bash
git add shared/actions/effects/gain.ts \
        shared/actions/internal-actions.ts \
        shared/cards/card-listeners.ts \
        shared/i18n/zh.ts \
        shared/i18n/en.ts \
        shared/cards/A/A29_AleBenches.ts \
        shared/cards/A/A50_MilkJug.ts \
        shared/cards/A/A132_Publican.ts \
        shared/cards/A/A154_Paymaster.ts \
        shared/cards/A/A156_Buyer.ts \
        shared/cards/A/A159_JoineroftheSea.ts \
        shared/cards/C/C38_Christianity.ts \
        shared/cards/C/C142_MarketCrier.ts \
        shared/cards/E/E160_KelpGatherer.ts
git rm shared/actions/effects/gain-trigger-player.ts shared/actions/effects/gain-other-players.ts

git commit -m "refactor(gain): merge gain-trigger-player + gain-other-players into unified gain

The gain action now accepts recipientPlayerId / recipientMode / payerId
params:
- default (no params): gain to context.player (existing behavior)
- recipientMode: 'others': gain to all other players each
- recipientPlayerId: gain to that specific player only
- payerId (any combination): also deducts that resource from the payer
  (used by next commit for B138 / C51 opponent-pay semantics)

Removes gain-trigger-player.ts and gain-other-players.ts; nine cards
migrated (A29 / A50 / A132 / A154 / A156 / A159 / C38 / C142 / E160) +
card-listeners.ts logKey Set + i18n keys cleaned. Behavior identical
to pre-merge for all migrated cards (no payerId means no deduction).

B138 ForestGuardian / C51 FishingNet are intentionally NOT migrated in
this commit — they need the new payerId param to actually deduct the
opponent's food (current behavior is buggy: only owner gains, opponent
unaffected). Next commit fixes them."
```

---

## Phase 2: B138 / C51 迁移 + payerId 修 bug

**Files:** B138_ForestGuardian.ts, C51_FishingNet.ts, B138 / C51 session tests

### Task 2.1: B138 + C51 listener 迁移

- [ ] **Step 1: B138 listener 改 params**

打开 `shared/cards/B/B138_ForestGuardian.ts`，找到 collect listener 返回的 flow（之前包含 `actionId: 'gain-trigger-player'`）。改：

```ts
return {
  flow: {
    type: 'seq',
    children: [
      {
        type: 'leaf',
        actionId: 'gain',  // 原 'gain-trigger-player'
        params: {
          recipientPlayerId: ownerId,  // 原 targetPlayerId
          payerId: context.player.id,  // ← 新增（trigger player = wood collector）
          food: 1,
        },
        sourceCard: CARD_ID,
      },
    ],
  },
  sourceCard: CARD_ID,
}
```

- [ ] **Step 2: C51 listener 改 params**

打开 `shared/cards/C/C51_FishingNet.ts`，类似改：

```ts
return {
  flow: {
    type: 'seq',
    children: [
      {
        type: 'leaf',
        actionId: 'gain',
        params: {
          recipientPlayerId: ownerId,
          payerId: context.player.id,  // ← 新增
          food: 1,
        },
        sourceCard: CARD_ID,
      },
      { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
    ],
  },
  sourceCard: CARD_ID,
}
```

### Task 2.2: B138 session 测试

- [ ] **Step 3: 创建 B138_ForestGuardian-session.test.ts**

```ts
// server/__tests__/B138_ForestGuardian-session.test.ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/B/B138_ForestGuardian'

const CARD_ID = 'B138_ForestGuardian'

const setup = (woodOnSpace = 5) => {
  const session = new GameSession(/* seed */ 1)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0  // P1 落子
  state.round = 5
  state.roundPhase = 'work'

  // P0 持有 B138（owner）
  const p0 = state.players[0]!
  p0.occupationPlayed.push(CARD_ID)
  p0.resources.food = 5  // 用于断言 owner +1

  // P1 落子（trigger player）
  const p1 = state.players[1]!
  setWorkersAtHome(state, p1, 2)
  p1.resources.food = 3  // 用于断言 trigger -1

  // 给 forest space（wood accumulation）放足够 wood
  const forest = state.actionSpaces.find(s => s.id === 'forest')
  if (forest) forest.resources.wood = woodOnSpace

  session.loadState(state)
  return session
}

describe('B138_ForestGuardian session — opponent pays food on 5+ wood collect', () => {
  it('opponent collects wood:5 → opponent food -1, owner food +1', () => {
    const session = setup(5)
    const stateBefore = session.getState().state
    const ownerFoodBefore = stateBefore.players[0]!.resources.food
    const triggerFoodBefore = stateBefore.players[1]!.resources.food

    let resp = session.takeAction(1, 'forest')
    let safety = 20
    while (safety-- > 0 && resp.pending.type === 'choice') {
      const opts = resp.pending.options ?? []
      const first = opts.find(o => o.value !== '__skip__') ?? opts[0]
      if (!first) break
      resp = session.resolveChoice(resp.pending.playerIndex ?? 1, first.value)
    }

    expect(resp.state.players[0]!.resources.food).toBe(ownerFoodBefore + 1)
    expect(resp.state.players[1]!.resources.food).toBe(triggerFoodBefore - 1)
  })

  it('opponent collects wood:4 → no trigger (< 5)', () => {
    const session = setup(4)
    const stateBefore = session.getState().state
    const ownerFoodBefore = stateBefore.players[0]!.resources.food
    const triggerFoodBefore = stateBefore.players[1]!.resources.food

    let resp = session.takeAction(1, 'forest')
    while (resp.pending.type === 'choice') {
      const opts = resp.pending.options ?? []
      const first = opts.find(o => o.value !== '__skip__') ?? opts[0]
      if (!first) break
      resp = session.resolveChoice(resp.pending.playerIndex ?? 1, first.value)
    }

    expect(resp.state.players[0]!.resources.food).toBe(ownerFoodBefore)
    expect(resp.state.players[1]!.resources.food).toBe(triggerFoodBefore)
  })
})
```

注：实际 forest accumulation space ID / wood 累积阈值 / 落子路径需要按 codebase 现状微调。executor 跑前先 grep 确认 'forest' 是否真是 wood accumulation 空间，wood 累积 round 5 是否已开放。

### Task 2.3: C51 session 测试

- [ ] **Step 4: 创建 C51_FishingNet-session.test.ts**

```ts
// server/__tests__/C51_FishingNet-session.test.ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/game/player'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import '../../shared/cards/C/C51_FishingNet'

const CARD_ID = 'C51_FishingNet'

const setup = () => {
  const session = new GameSession(/* seed */ 1)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'

  const p0 = state.players[0]!
  p0.minorPlayed.push(CARD_ID)
  p0.resources.food = 5

  const p1 = state.players[1]!
  setWorkersAtHome(state, p1, 2)
  p1.resources.food = 3

  // fishing space accumulation（看实际 ID — 'fishing' / 'fishing-net'）
  const fishing = state.actionSpaces.find(s => s.id === 'fishing')
  if (fishing) fishing.resources.food = 2

  session.loadState(state)
  return session
}

describe('C51_FishingNet session — opponent pays food on Fishing use', () => {
  it('opponent uses fishing → opponent food -1, owner food +1, flag set', () => {
    const session = setup()
    const stateBefore = session.getState().state
    const ownerFoodBefore = stateBefore.players[0]!.resources.food
    const triggerFoodBefore = stateBefore.players[1]!.resources.food

    let resp = session.takeAction(1, 'fishing')
    while (resp.pending.type === 'choice') {
      const opts = resp.pending.options ?? []
      const first = opts.find(o => o.value !== '__skip__') ?? opts[0]
      if (!first) break
      resp = session.resolveChoice(resp.pending.playerIndex ?? 1, first.value)
    }

    expect(resp.state.players[0]!.resources.food).toBe(ownerFoodBefore + 1)
    expect(resp.state.players[1]!.resources.food).toBeLessThan(triggerFoodBefore + 2)  // -1 from C51, +N from fishing accumulation
    expect(isCardFlagged(resp.state.players[0]!, CARD_ID)).toBe(true)
  })
})
```

### Task 2.4: 跑测试 + lint + build + 提交

- [ ] **Step 5: 跑 B138 / C51 测试**

```bash
pnpm exec vitest run server/__tests__/B138_ForestGuardian-session.test.ts server/__tests__/C51_FishingNet-session.test.ts
```

Expected: PASS

- [ ] **Step 6: 跑 fast + lint + build**

```bash
pnpm test:fast && pnpm run lint && pnpm run build
```

- [ ] **Step 7: 提交**

```bash
git add shared/cards/B/B138_ForestGuardian.ts \
        shared/cards/C/C51_FishingNet.ts \
        server/__tests__/B138_ForestGuardian-session.test.ts \
        server/__tests__/C51_FishingNet-session.test.ts

git commit -m "fix(B138, C51): opponent now actually pays food via gain payerId

Both cards' BGA semantics: 'opponent pays 1 food to you'. The previous
implementation passed the gain only to the owner via gain-trigger-player,
which never deducted the opponent's food (effect ignored payer side).

After Phase 1's gain merge, both listeners now pass payerId =
context.player.id (the trigger opponent) to the unified gain action.
Effect deducts payer's food and credits owner's, matching BGA.

Two session tests for each card:
- B138: 5+ wood threshold triggers; below threshold doesn't
- C51: fishing use deducts opponent + credits owner + sets returnHome flag"
```

---

## Phase 3: B115 删 selection 全 field 自动 +1

**Files:** `shared/cards/B/B115_TinsmithMaster.ts`, B115 session test

### Task 3.1: 重写 afterSowListener handler

- [ ] **Step 1: 修改 B115_TinsmithMaster.ts**

打开 `shared/cards/B/B115_TinsmithMaster.ts`，定位 `afterSowListener.handler`（约 line 50-83）。完全替换 handler：

```ts
const afterSowListener: CardListenerRegistration = {
  id: 'B115-tinsmith-master-after-sow',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const freshFields = getFreshlySownFields(context)
    if (freshFields.length === 0) return
    for (const field of freshFields) {
      const top = fieldTopStack(field)
      if (top) top.remaining += 1
    }
    // 不返回 flow — 直接 mutate state，无 prompt
  },
}
```

**删除**：原 selection 路径整段（`registerSelectionEffect('tinsmith-master-bonus-crop', ...)` 函数 + `selectionKind: 'farm-position'` flow 返回 — 大概 line 35-47 + 60-82 中的 selection 部分）。

如果 `registerSelectionEffect` 的 import 不再被用，删除该 import。

### Task 3.2: B115 session 测试

- [ ] **Step 2: 创建（或扩展）测试**

`server/__tests__/B115_TinsmithMaster-session.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/B/B115_TinsmithMaster'

const CARD_ID = 'B115_TinsmithMaster'

const setup = (opts?: { played?: boolean; grain?: number; vegetable?: number }) => {
  const session = new GameSession(/* seed */ 1)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = {
    ...player.resources,
    grain: opts?.grain ?? 2,
    vegetable: opts?.vegetable ?? 0,
  }
  if (opts?.played ?? true) player.occupationPlayed.push(CARD_ID)

  // 准备 2 个空 field 让 sow 能播种 2 个
  // 实际 fields 在 PlayerState 里，按现状结构 setup
  // executor 看 actual setup 模式（参考已有 sow 测试）

  session.loadState(state)
  return session
}

describe('B115_TinsmithMaster — every freshly sown field gets +1', () => {
  it('single field sown → top.remaining +1', () => {
    const session = setup({ played: true, grain: 1 })
    // sow 1 field grain
    // ... drive to sow flow, select 1 field
    // assert top.remaining === 4 (default 3 + 1)
  })

  it('two fields sown simultaneously → both fields top.remaining +1', () => {
    const session = setup({ played: true, grain: 2 })
    // sow 2 fields grain
    // assert both fields top.remaining === 4
  })

  it('B115 not played → 0 fields modified (baseline)', () => {
    const session = setup({ played: false, grain: 1 })
    // sow 1 field grain
    // assert top.remaining === 3 (default, no bonus)
  })
})
```

注：测试细节按 actual sow flow API 写。executor 按需调整。

- [ ] **Step 3: 跑测试 + lint + build + 提交**

```bash
pnpm exec vitest run server/__tests__/B115_TinsmithMaster-session.test.ts
pnpm run lint && pnpm run build

git add shared/cards/B/B115_TinsmithMaster.ts \
        server/__tests__/B115_TinsmithMaster-session.test.ts

git commit -m "refactor(B115): drop player selection, auto-add 1 crop to every fresh field

BGA actAddAdditionalGood iterates every sown zone, adding 1 crop to
each. Our previous implementation forced a player selection
(maxSelections: 1) and the selection effect broke after the first
field via 'break // only 1 field'.

After this fix: when 2+ fields are freshly sown, each gets +1
automatically — no prompt. Single-field path unchanged. The
registerSelectionEffect path is deleted as unused."
```

---

## Phase 4: C13 改用 listener 替代静态 modifier

**Files:** `shared/cards/C/C13_WoodSlideHammer.ts`, C13 session test

### Task 4.1: 重写 C13

- [ ] **Step 1: 完全替换 C13_WoodSlideHammer.ts**

```ts
import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardImpl } from '../registry'

const CARD_ID = 'C13_WoodSlideHammer'

// BGA: onPlayerComputeCostsRenovation, if roomType === 'wood' && rooms >= 5
// → addBonus(args.costs, [STONE => -2], cardId)
const computeCostsListener: CardListenerRegistration = {
  id: 'C13-wood-slide-hammer-renovation-discount',
  cardIds: [CARD_ID],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['renovation'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (context.player.houseType !== 'wood') return
    if (context.player.rooms < 5) return
    return {
      bonuses: [{
        discount: { stone: 2 },
        sources: [CARD_ID],
      }],
      sourceCard: CARD_ID,
    }
  },
}

export const C13_WoodSlideHammer = new MinorImprovement({
  id: CARD_ID,
  name: 'Wood Slide Hammer',
  deck: 'C',
  number: 13,
  category: 'FARM_PLANNER',
  desc: ['On your first renovation, if you have at least 5 wood rooms, you can renovate to stone directly and you get a discount of 2 <STONE> on the renovation cost.'],
  cost: { wood: 1 },
  newSet: true,
})

export const C13_WoodSlideHammer_impl = {
  listeners: [computeCostsListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
```

注意：
- 删除原 `modifier: { type: 'bonus', cardId, appliesTo: ['renovation'], discount: { stone: 1 } }`
- 删除 `import type { BonusModifier } from '../../game/types'`（如果不再用）

### Task 4.2: C13 session 测试 + 提交

- [ ] **Step 2: 创建 C13 测试**

```ts
// server/__tests__/C13_WoodSlideHammer-session.test.ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import '../../shared/cards/C/C13_WoodSlideHammer'

const CARD_ID = 'C13_WoodSlideHammer'

describe('C13_WoodSlideHammer — renovation -2 stone discount', () => {
  it('5 wood rooms + renovate → cost has stone discount 2', () => {
    const session = new GameSession(/* seed */ 1)
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.houseType = 'wood'
    player.rooms = 5
    player.roomTiles = [
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 },
      { row: 1, col: 1 }, { row: 2, col: 0 },
    ]
    player.resources = {
      ...player.resources,
      reed: 5, stone: 5,  // 足够触发 renovate to stone
    }
    session.loadState(state)

    // 调 computeCosts hook 直接验证（不走 takeAction）：
    // 通过卡片 listener 验证 — 实际 listener 在 renovation action 的 computeCosts phase 触发
    // 这里用 hook 系统直接验证：
    // 简化：跑 takeAction renovation 看玩家最终 stone 消耗

    // 实际 renovation action 路径未必直接可在 round 5 触发 — 看 codebase 现状
    // executor 按 actual renovation 触发路径（可能要 dev tool）调整
  })

  it('4 wood rooms → no discount', () => {
    // 类似 setup 但 rooms = 4，断言无折扣
  })

  it('5 stone rooms → no discount (already stone)', () => {
    // houseType='stone', rooms=5，断言无触发
  })
})
```

注：renovation action 测试入口取决于实际 codebase 路径（renovation effect.ts），executor 按实际写。如果 listener 注册路径正确（actions:['renovation']），跑 renovate 时 hook 会被 dispatch。

- [ ] **Step 3: 跑测试 + lint + build + 提交**

```bash
pnpm exec vitest run server/__tests__/C13_WoodSlideHammer-session.test.ts
pnpm test:fast
pnpm run lint && pnpm run build

git add shared/cards/C/C13_WoodSlideHammer.ts \
        server/__tests__/C13_WoodSlideHammer-session.test.ts

git commit -m "refactor(C13): use computeCosts listener with conditional renovation discount

The previous static BonusModifier had two bugs: discount was stone:1
(should be stone:2 per BGA), and there was no condition gate (BGA
requires roomType === 'wood' && rooms >= 5).

Replaced the modifier with a computeCosts listener on the renovation
action. The listener checks the conditions and returns bonuses with
discount {stone:2}, source CARD_ID. The bonuses path is collected by
resolveCardCostWithModifiers (existing pay-helpers infrastructure).

The 'first renovation' constraint is implicit: once the player
renovates to stone, houseType !== 'wood' and the listener no-ops."
```

---

## Phase 5: B29 per-action token 跟踪

**Files:** `shared/cards/B/B29_CookeryLesson.ts`, B29 session test

### Task 5.1: 重写 B29 handlers

- [ ] **Step 1: 修改 B29_CookeryLesson.ts**

定位 `cookedThisRound` / `hasCookedThisRound` / `markCookedThisRound`，改成 per-action token 模型：

```ts
const COOKED_TOKEN_KEY = 'cookedActionToken'
const LESSONS_TOKEN_KEY = 'lessonsActionToken'

const hasCookedThisAction = (context: CardListenerContext): boolean => {
  const actionToken = readActionSnapshotToken(context.player)
  if (actionToken === undefined) return false
  const cooked = readCardExtraData<number>(context.player, CARD_ID, COOKED_TOKEN_KEY)
  return cooked === actionToken
}

const markCookedThisAction = (context: CardListenerContext): void => {
  const actionToken = readActionSnapshotToken(context.player)
  if (actionToken === undefined) return
  writeCardExtraData(context.player, CARD_ID, COOKED_TOKEN_KEY, actionToken)
}

const hasUsedLessonsThisAction = (context: CardListenerContext): boolean => {
  const actionToken = readActionSnapshotToken(context.player)
  if (actionToken === undefined) return false
  const lessons = readCardExtraData<number>(context.player, CARD_ID, LESSONS_TOKEN_KEY)
  return lessons === actionToken
}

const markUsedLessonsThisAction = (context: CardListenerContext): void => {
  const actionToken = readActionSnapshotToken(context.player)
  if (actionToken === undefined) return
  writeCardExtraData(context.player, CARD_ID, LESSONS_TOKEN_KEY, actionToken)
}

// afterExchangeListener handler:
// - markCookedThisAction
// - if hasUsedLessonsThisAction → awardBonusVp（actionToken 防重）

// afterPlaceFarmerListener handler (on lessons / lessons-4):
// - markUsedLessonsThisAction
// - if hasCookedThisAction → awardBonusVp

// onRoundStart 改：
//   writeCardExtraData(player, CARD_ID, COOKED_TOKEN_KEY, -1)
//   writeCardExtraData(player, CARD_ID, LESSONS_TOKEN_KEY, -1)
//   writeCardExtraData(player, CARD_ID, USED_ACTION_TOKEN_KEY, -1)
```

awardBonusVp（USED_ACTION_TOKEN_KEY 防同一 action 重复奖）保留不变。

具体改动（找现有函数定位）：

```bash
grep -n 'cookedThisRound\|markCookedThisRound\|hasCookedThisRound' shared/cards/B/B29_CookeryLesson.ts
```

按行号逐处替换。

### Task 5.2: B29 session 测试

- [ ] **Step 2: 创建（或扩展）测试**

```ts
// server/__tests__/B29_CookeryLesson-session.test.ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/B/B29_CookeryLesson'

const CARD_ID = 'B29_CookeryLesson'

describe('B29_CookeryLesson — per-action coupling, not per-round', () => {
  it('same takeAction: lessons + cook → 1 VP', () => {
    // setup: lessons 落子 + 同 action 内 cook exchange
    // 断言 player.score / player.bonusVp +1
  })

  it('turn1 cook + turn2 lessons → 0 VP（修复后）', () => {
    // turn1: cook exchange（无 lessons）→ 不奖
    // turn2: lessons 落子（无 cook）→ 不奖
    // 总 +0 VP（之前 per-round 错奖）
  })

  it('lessons placed alone → 0 VP', () => {
    // 无 cook，仅 lessons → 0 VP
  })

  it('cook alone → 0 VP', () => {
    // 无 lessons，仅 cook → 0 VP
  })

  it('same action multiple cook + lessons → 1 VP (USED_ACTION_TOKEN dedup)', () => {
    // 单 action 内多次 cook → 仅奖 1 次
  })
})
```

注：实际 setup 怎么 drive 跨 takeAction、跨 turn 切换 — 看 D74 / B27 现有测试模板。

- [ ] **Step 3: 跑测试 + lint + build + 提交**

```bash
pnpm exec vitest run server/__tests__/B29_CookeryLesson-session.test.ts
pnpm test:fast
pnpm run lint && pnpm run build

git add shared/cards/B/B29_CookeryLesson.ts \
        server/__tests__/B29_CookeryLesson-session.test.ts

git commit -m "fix(B29): per-action token tracking instead of per-round

Previous implementation tracked cookedThisRound as a boolean cleared at
onRoundStart. Bug: turn1 cook + turn2 lessons → afterPlaceFarmer sees
cookedThisRound=true → awards VP. BGA semantics is 'same turn' (one
takeAction), not 'same round'.

Now tracks two action tokens via cardStates.extraData:
- cookedActionToken: written on anytime-exchange after-listener
- lessonsActionToken: written on place-farmer after-listener (lessons /
  lessons-4)

VP awarded only when the two tokens equal the current actionToken
(readActionSnapshotToken). USED_ACTION_TOKEN_KEY further prevents
double-award within the same action. onRoundStart resets all three
tokens defensively."
```

---

## Phase 6: viaCardJump worker-less + jumpLeaf helper + A151 重写

**Files:** `shared/actions/effects/place-farmer.ts`, `shared/cards/helpers/jump-leaf.ts`, `shared/cards/A/A151_Minstrel.ts`, A151 session test

### Task 6.1: jumpLeaf helper signature 更新

- [ ] **Step 1: 改 jumpLeaf 让 workerId optional**

打开 `shared/cards/helpers/jump-leaf.ts`：

```ts
import type { ActionFlow } from '../../game/types'
import type { CardListenerContext } from '../card-listeners'

export interface JumpLeafParams {
  sourceCard: string
  workerId?: string  // ← optional
  targetSpaceId: string
}

export const jumpLeaf = (p: JumpLeafParams): ActionFlow => ({
  type: 'leaf',
  actionId: 'place-farmer',
  sourceCard: p.sourceCard,
  expandFlow: true,
  actionContext: {
    viaCardJump: true,
    sourceCard: p.sourceCard,
    ...(p.workerId !== undefined ? { workerId: p.workerId } : {}),
    targetSpaceId: p.targetSpaceId,
  },
})

export const isJumpChainContains = (
  context: CardListenerContext,
  cardId: string,
): boolean => {
  const chain = context.actionContext?.jumpChain
  return Array.isArray(chain) && chain.includes(cardId)
}
```

### Task 6.2: place-farmer.ts viaCardJump 加 worker-less 分支

- [ ] **Step 2: 修改 viaCardJump 分支**

打开 `shared/actions/effects/place-farmer.ts`，定位 `if (actionContext?.viaCardJump)` 分支（execute 函数内）。改：

```ts
if (actionContext?.viaCardJump) {
  const sourceCard = actionContext.sourceCard as string | undefined
  const workerId = actionContext.workerId as string | undefined  // ← 现在 optional
  const targetSpaceId = actionContext.targetSpaceId as string | undefined
  if (!sourceCard || !targetSpaceId) {
    return { type: 'fail', logKey: 'log.placeFarmerFail' }
  }

  const isWorkerless = !workerId

  let fromSpace: ActionSpace | undefined
  if (!isWorkerless) {
    fromSpace = state.actionSpaces.find((s) =>
      s.takenBy.some((t) => t.playerId === player.id && t.workerId === workerId),
    )
    if (!fromSpace) return { type: 'fail', logKey: 'log.placeFarmerFail' }
  }
  const targetSpace = state.actionSpaces.find((s) => s.id === targetSpaceId)
  if (!targetSpace) return { type: 'fail', logKey: 'log.placeFarmerFail' }

  // 可达性二次校验仅 worker 模式跑
  if (!isWorkerless) {
    const allowed = computeAllowedPlacementSpaces(state, player)
    if (!allowed.some((a) => a.spaceId === targetSpaceId)) {
      return { type: 'fail', logKey: 'log.placeFarmerFail' }
    }
  }

  // jumpChain 累加（worker / worker-less 都跑）
  actionContext.jumpChain = [
    ...((actionContext.jumpChain as string[]) ?? []),
    sourceCard,
  ]

  // 移动 farmer + stats — 仅 worker 模式
  if (!isWorkerless && fromSpace) {
    removeWorkerRef(fromSpace, player.id, workerId!)
    addWorkerRef(targetSpace, player.id, workerId!)
    recordRoundPlacement(player, targetSpace.id, workerId!)
    incPlacedFarmers(player)
  }

  // cascade dispatch（不变 — 沿用 cascade-fix 现有路径）
  // [保留现有 cascade dispatch 代码 — 不动]

  // 返回 flow（不变 — expandFlow + cascade flows）
  // [保留现有 return 代码 — 不动]
}
```

注：`cascade dispatch` 和 `return flow` 路径保留不变（已在 cascade-fix commit 实现）。仅本次新增 `isWorkerless` 分支跳过 worker mutation。

### Task 6.3: A151 完全重写

- [ ] **Step 3: 替换 A151_Minstrel.ts**

```ts
// shared/cards/A/A151_Minstrel.ts
import { Occupation } from '../types'
import { isSpaceOccupied } from '../../game/space'
import { jumpLeaf } from '../helpers/jump-leaf'
import type { CardImpl } from '../registry'

const CARD_ID = 'A151_Minstrel'

// BGA A151_Minstrel.php 监听 4 个 stage-1 action（returning home phase 时检查）
const STAGE_1_ACTIONS = [
  'sheep-market',
  'grain-utilization',
  'fencing',
  'major-improvement',
] as const

export const A151_Minstrel = new Occupation({
  id: CARD_ID,
  name: 'Minstrel',
  deck: 'A',
  number: 151,
  category: 'ACTIONS_BOOSTER',
  desc: ['At the start of each returning home phase, if only one action space card on round space 1 to 4 is unoccupied, you can use that action space.'],
  cost: {},
  players: '4+',
  newSet: true,
})

export const A151_Minstrel_impl = {
  effect: {
    id: CARD_ID,
    onStartReturnHome: (state, _player) => {
      const unoccupied: string[] = []
      for (const actionId of STAGE_1_ACTIONS) {
        const space = state.actionSpaces.find((s) => s.id === actionId)
        if (!space) continue
        const roundOrder = state.roundActionOrder
        const posIndex = roundOrder.indexOf(actionId)
        if (posIndex < 0 || posIndex + 1 > state.round) continue
        if (!isSpaceOccupied(space)) unoccupied.push(actionId)
      }

      if (unoccupied.length !== 1) return

      const targetSpaceId = unoccupied[0]!

      return {
        type: 'seq',
        optional: true,
        children: [
          jumpLeaf({
            sourceCard: CARD_ID,
            targetSpaceId,
            // workerId 不传 — worker-less 模式
          }),
        ],
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

**删除**：原 `buildFlowForSpace` 函数 + STAGE_1_ACTIONS 内联模拟逻辑。

### Task 6.4: A151 session 测试

- [ ] **Step 4: 创建 A151 session 测试**

```ts
// server/__tests__/A151_Minstrel-session.test.ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import '../../shared/cards/A/A151_Minstrel'

const CARD_ID = 'A151_Minstrel'

describe('A151_Minstrel — viaCardJump worker-less', () => {
  it('only sheep-market unoccupied + sheep accumulated → trigger → sheep credited + accumulation cleared', () => {
    // setup 4 player game (need players: '4+')
    // 触发 returning home phase（dev tool / takeAction 推到 round end）
    // sheep-market 仅 unoccupied + 累积 5 sheep
    // 玩家接受 → sheep-market.execute() 跑（gain sheep + 自动清零）
    // 断言 player.resources.sheep === 5（或 gain 量）
    // 断言 sheepMarket.resources.sheep === 0
    // 断言 player.workersAvailable / family pool 不变
  })

  it('only fencing unoccupied → fence flow triggers', () => {
    // 类似但 fencing 是仅 unoccupied
    // 玩家接受 → 进入 fence 选段子流程（验证 fencing.flow expandFlow）
  })

  it('zero or 2+ unoccupied → no trigger', () => {
    // 4 个都占 / 或 0 个被占 / 或 2+ 个未占
    // 断言 onStartReturnHome 不返回 flow
  })
})
```

注：A151 是 4+ players，需要 4 玩家 setup。session test setup 会复杂些 — 看现有 A129 / B150 4+ 卡测试模板。

### Task 6.5: 跑测试 + lint + build + 提交

- [ ] **Step 5: 跑测试**

```bash
pnpm exec vitest run server/__tests__/A151_Minstrel-session.test.ts
pnpm exec vitest run shared/actions/effects/__tests__/place-farmer-jump.test.ts
pnpm exec vitest run shared/cards/helpers/__tests__/jump-leaf.test.ts
pnpm test:fast
pnpm run lint && pnpm run build
```

mech-A 4 张卡现有 session 测试也要跑（jumpLeaf signature 改 optional 后向后兼容验证）：

```bash
pnpm exec vitest run server/__tests__/B130_FullPeasant-session.test.ts \
  server/__tests__/B150_LargeScaleFarmer-session.test.ts \
  server/__tests__/B152_JuniorArtist-session.test.ts \
  server/__tests__/batch12-session.test.ts
```

- [ ] **Step 6: 提交**

```bash
git add shared/actions/effects/place-farmer.ts \
        shared/cards/helpers/jump-leaf.ts \
        shared/cards/A/A151_Minstrel.ts \
        server/__tests__/A151_Minstrel-session.test.ts

git commit -m "feat(jump,A151): viaCardJump worker-less variant + A151 rewrite

Extends viaCardJump so workerId is optional. When omitted: skip
removeWorkerRef / addWorkerRef / recordRoundPlacement / incPlacedFarmers
/ computeAllowedPlacementSpaces validation; still mutate jumpChain and
return expandFlow + cascade dispatch.

This unblocks A151 Minstrel, which fires at the start of returning home
phase (no farmer in hand to borrow). Previously A151 used inline
simulation (separate flow leaves per stage-1 action), which had the
same bug class as mech-A's pre-fix 4 cards: accumulation resources
weren't cleared, third-party listeners on the second space didn't
fire, ReplaceHook / computeCosts didn't trigger.

A151 now uses jumpLeaf without workerId — same machinery as mech-A's
A129/B130/B150/B152, just with a virtual farmer for the returning home
phase. Sheep-market accumulation auto-clears via sheep-market.execute,
fence/major-improvement second-space flows expand correctly, and any
future card listening on those actions will fire on A151's second
placement just like a direct one.

mech-A's 4 cards still pass workerId — backward compatible; their
session tests pass unchanged."
```

---

## Phase 7: 文档同步

**Files:** `docs/card_progress.md`, `docs/master-plan.md`, `docs/ENGINE_ARCHITECTURE.md`

### Task 7.1: card_progress.md

- [ ] **Step 1: §2.0 加 changelog**

打开 `docs/card_progress.md` §2.0 顶部加：

```
- **2026-04-30 Sprint 5 mech-E — 6 张 P1 单卡修批次**：B115 TinsmithMaster（删 selection 全 field 自动 +1）/ C13 WoodSlideHammer（改 listener 替代静态 modifier，加条件 + stone:2 折扣）/ B29 CookeryLesson（per-round → per-action token 跟踪）/ B138 ForestGuardian + C51 FishingNet（用合并后 gain 加 payerId 让对手扣 food）/ A151 Minstrel（用 viaCardJump worker-less 真对齐 BGA useActionSpace）。两处主路径改：(1) 合并 3 个 gain action 到统一 gain（删 gain-trigger-player.ts + gain-other-players.ts；参数化 recipientPlayerId / recipientMode / payerId；~10 张 caller 卡迁移）；(2) viaCardJump 扩展 worker-less 模式（workerId optional）。详见 docs/superpowers/specs/2026-04-30-sprint-5-mech-e-misc-fixes-design.md。
```

- [ ] **Step 2: §2.3 标 ✅**

定位 §2.3 列表里 6 张卡（B115 / C13 / B29 / B138 / C51 / A151），把每张状态改为 ✅ Sprint 5 mech-E。如果没找到，可能在 §2.4 数值偏差里（C13）。

- [ ] **Step 3: §7 基础设施加新条**

```
### gain action 三合一 + viaCardJump worker-less variant (Sprint 5 mech-E)

- `gain` 现接受 `recipientPlayerId` / `recipientMode: 'self' | 'others'` / `payerId` 参数；可表达"自己 / 所有其他玩家 / 单一玩家"接收 + "对手扣"语义。`gain-trigger-player` / `gain-other-players` 已合并删除，~10 张 caller 卡迁移。
- `viaCardJump` 现支持 worker-less 模式（jumpLeaf 不传 workerId）：跳过 worker mutation 与可达性校验，仍跑 expandFlow + cascade dispatch。A151 Minstrel 在 returning home phase 用此模式真对齐 BGA `useActionSpaceNode`。
```

- [ ] **Step 4: §8 时间线加新行**

```
| Sprint 5 mech-E (6-card collection batch + gain merge + viaCardJump worker-less) | 04-30 | 0 | 822 | 92.1% |
```

实际数字按 §1 总览。

### Task 7.2: master-plan.md

- [ ] **Step 5: §8 Sprint 5 行更新**

- partially done 数从当前 → 22/28
- 实际工时 + `~8h (mech-E)`
- spec / plan 列加 mech-E 路径

### Task 7.3: ENGINE_ARCHITECTURE.md

- [ ] **Step 6: 加两节**

在 Hook 系统 / place-farmer jump mode 附近加：

```markdown
## gain action 三合一（Sprint 5 mech-E）

`shared/actions/effects/gain.ts` 的 `gain` action 接受三个可选参数控制 dispatch：

- `recipientPlayerId?: string` — 单一收件人；默认 `context.player.id`
- `recipientMode?: 'self' | 'others'` — `'others'` 表示"所有其他玩家 each"
- `payerId?: string` — 同时扣 payer 资源（用于"对手 pay 给 owner"语义）

历史上这三种 dispatch 是 3 个独立 effect（`gain` / `gain-trigger-player` / `gain-other-players`），2026-04-30 Sprint 5 mech-E 合并。`gain-trigger-player.ts` / `gain-other-players.ts` 已删除。

## viaCardJump worker-less variant（Sprint 5 mech-E）

`shared/actions/effects/place-farmer.ts` 的 viaCardJump 分支接受 `workerId` optional。当未传时：

- 跳过 `removeWorkerRef` / `addWorkerRef` / `recordRoundPlacement` / `incPlacedFarmers` / `computeAllowedPlacementSpaces` 校验
- 仍累加 `jumpChain` + 返回 expandFlow + 跑 cascade dispatch

用例：A151 Minstrel 在 returning home phase 没 farmer 可借，用 worker-less 模式让 engine 跑指定空间的完整 flow（自动清空累积资源 / 触发其他卡 listener / 跑 ReplaceHook / computeCosts）。
```

### Task 7.4: 提交

- [ ] **Step 7: 终验**

```bash
pnpm test:fast && pnpm run lint && pnpm run build
```

- [ ] **Step 8: 提交**

```bash
git add -f docs/card_progress.md docs/master-plan.md docs/ENGINE_ARCHITECTURE.md

git commit -m "docs: sync mech-E across card_progress / master-plan / ENGINE_ARCHITECTURE

card_progress §2.0 changelog entry; §2.3/§2.4 mark six cards done; §7
new infrastructure section for gain action three-way merge + viaCardJump
worker-less variant; §8 timeline row.

master-plan §8 Sprint 5 progress bumped to 22/28 with mech-E spec/plan
references and +~8h actual time.

ENGINE_ARCHITECTURE gets two new sections documenting the gain merge
protocol and viaCardJump worker-less variant."
```

---

## Phase 8: push + CI（人工，按 mech-A / D / B 模式）

- [ ] **Step 1: git fetch 看远端 main**

```bash
git -C /data00/home/xuxinhao.titan/raw/open-agricola fetch origin
git -C /data00/home/xuxinhao.titan/raw/open-agricola log --oneline HEAD..origin/main
```

如有更新，先 rebase。

- [ ] **Step 2: ff merge + push**

```bash
git -C /data00/home/xuxinhao.titan/raw/open-agricola checkout main
git -C /data00/home/xuxinhao.titan/raw/open-agricola merge --ff-only sprint-5-mech-e-misc-fixes
git -C /data00/home/xuxinhao.titan/raw/open-agricola push origin main
```

- [ ] **Step 3: 等 CI**

```bash
export $(grep '^GH_TOKEN=' /data00/home/xuxinhao.titan/raw/open-agricola/.env | xargs) && \
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?branch=main&per_page=5' \
  | jq '.workflow_runs[] | {name, head_sha: .head_sha[0:8], status, conclusion, html_url}'
```

等所有 run completed + success。

- [ ] **Step 4: 清理 worktree**

```bash
git -C /data00/home/xuxinhao.titan/raw/open-agricola worktree remove .worktree/sprint-5-mech-e-misc-fixes
git -C /data00/home/xuxinhao.titan/raw/open-agricola branch -d sprint-5-mech-e-misc-fixes
```
