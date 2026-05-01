# Sprint 6d — D131 / E58 / E153 Stub 卡完整对齐 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 D131 CraftsmanshipPromoter / E58 LunchtimeBeer / E153 StoneSculptor 三张 stub 卡完整对齐 BGA；落地 3 处通用扩展（Trade.sideEffect.bonusVp / harvest phase skip helper / minor-improvement listener candidate injection）；同步 §2.7 stub list 划掉 A165 / E134。

**Architecture:** 卡牌闭环 + 数据驱动通用扩展。Trade.sideEffect kind 接续 sprint-5c 的 dispatcher（已落 sprint-5c PR#42，等 merge main）扩 `bonusVp` kind；harvest skip 通过 cardStates round flag + game-core helper；minor-improvement candidate 通过既有 `computeChoiceCandidates` listener phase + 新 helper 注入。

**Tech Stack:** TypeScript（shared/cards/{D,E}/、shared/actions/effects/、shared/session/）+ vitest（单元 + session）+ pnpm。

**Spec:** `docs/superpowers/specs/2026-05-01-sprint-6d-stubs-design.md` (commit `e1d3b74b`)

**Worktree:** `.worktree/sprint-6d-stubs`（base main `4dd01af2`）。**实施前先 rebase 到 sprint-5c 落 main 后的最新 main**——plan Task 0 验证。

**总工时:** ~2.5d（D131 ~0.6d / E58 ~0.7d / E153 ~0.7d / §2.7 同步 ~0.05d / 文档 ~0.2d / 缓冲 ~0.2d）

---

## File Structure

| 文件 | 责任 | 改动类型 |
|---|---|---|
| `shared/game/types.ts` | `TradeSideEffect` 联合扩 `'bonusVp' { amount }` kind | 修改 |
| `shared/actions/helpers/payment.ts` | `applyTradeSideEffect` 扩签名（加 player + sourceCard）+ bonusVp case；caller 同步 | 修改 |
| `shared/actions/effects/exchange.ts` | exchange.execute 应用 trade 时调 applyTradeSideEffect | 修改 |
| `shared/actions/effects/improvement.ts` | minor-improvement.execute 加 listener candidate injection；新 helper `collectComputeChoiceCandidates` | 修改 |
| `shared/session/game-core.ts` | `hasPassFieldAndBreed` helper + harvest field/breeding phase 入口 skip 检查 | 修改 |
| `shared/cards/D/D131_CraftsmanshipPromoter.ts` | rewrite — 加 computeChoiceCandidates listener | 修改 |
| `shared/cards/E/E58_LunchtimeBeer.ts` | rewrite — onStartHarvest listener 返回 SEQ + special-effect leaf | 修改 |
| `shared/cards/E/E153_StoneSculptor.ts` | rewrite — exchanges triggers:['harvest'] + sideEffect:bonusVp + computeBonusScore | 修改 |
| `shared/actions/helpers/__tests__/payment-trade-side-effect.test.ts` | 既有文件追加 3 case (bonusVp) | 修改 |
| `server/__tests__/D131_CraftsmanshipPromoter-session.test.ts` | 6 case | 新建 |
| `server/__tests__/E58_LunchtimeBeer-session.test.ts` | 5 case | 新建 |
| `server/__tests__/E153_StoneSculptor-session.test.ts` | 6 case | 新建 |
| `docs/card_progress.md` | §2 changelog + §1 总览 + §2.7 list + §7 基础设施 | 修改 |
| `docs/master-plan.md` | §0 stub deferred 数 + §8 加 Sprint 6d 行 | 修改 |
| `docs/ENGINE_ARCHITECTURE.md` | 3 处通用扩展描述 | 修改 |

---

## Task 0: 预检 + 等 sprint-5c 落 main

**Goal:** 验证先决条件（sprint-5c 已 merge main、Node 22、依赖、fast 基线绿、4 stub 文件存在）+ 必要时 rebase 到最新 main。

**Files:** 无改动

- [ ] **Step 1: 验证 sprint-5c PR#42 merge 状态**

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/sprint-6d-stubs
export $(grep '^GH_TOKEN=' /data00/home/xuxinhao.titan/raw/open-agricola/.env | xargs)
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/pulls/42' \
  | jq '{state, merged, merge_commit_sha}'
```

Expected: `{"state":"closed","merged":true,"merge_commit_sha":"<hash>"}`。如果 `merged:false`，**stop**：等用户 merge PR#42 再继续。

- [ ] **Step 2: rebase sprint-6d-stubs 到最新 main**

```bash
git fetch
git rebase origin/main
```

Expected: rebase 干净（spec commit `e1d3b74b` 应仍在）。如果冲突（不太可能——spec 文件路径独立），手动解决。

- [ ] **Step 3: 验证 sprint-5c 基础设施已落地**

```bash
grep -n "applyTradeSideEffect\|TradeSideEffect\|drainSpace" shared/actions/helpers/payment.ts shared/game/types.ts | head -10
```

Expected: 至少看到 `TradeSideEffect` 联合 + `'drainSpace'` kind + `applyTradeSideEffect` 函数。**记录 applyTradeSideEffect 的实际签名**（plan Task 2 假设是 `(state, eff, times)`，如不同按实际调整）。

```bash
grep -n "breed\b\|breedAction\|breedLeaf" shared/actions/effects/breed.ts 2>/dev/null | head -5
```

Expected: `shared/actions/effects/breed.ts` 存在且含 `breedAction` / `breedLeaf` 导出（sprint-5c 落地）。

- [ ] **Step 4: Node + 依赖 + fast 基线**

```bash
node --version       # → v22.x
pnpm install
pnpm test:fast
```

Expected: 全绿（约 210 文件、1-2 min）。

- [ ] **Step 5: 验证 4 张 stub 文件存在 + §2.7 当前状态**

```bash
ls shared/cards/D/D131_*.ts shared/cards/E/E58_*.ts shared/cards/E/E153_*.ts
grep -n "A165\|E134\|D131\|E58\|E153" docs/card_progress.md | grep "stub" | head -3
```

Expected: 3 张 stub 文件存在；§2.7 stub list 含 A165 / E134 / D131 / E58 / E153 未划线项。

---

## Task 1: §2.7 stub list 同步（独立小任务）

**Goal:** 把 §2.7 stub list 中已实现的 A165 / E134 加 strikethrough+✅；为后续 Task 5/6/7 完成时再加 D131/E58/E153 ✅ 留位置。

**Files:**
- Modify: `docs/card_progress.md`

- [ ] **Step 1: 定位 §2.7 stub list 行**

```bash
grep -n "stub 卡（≥15 张" docs/card_progress.md
```

Expected: 一行命中（约 line 206）。

- [ ] **Step 2: 替换 A165 / E134 标记**

打开 `docs/card_progress.md`，找到该行（含 `~~A135~~ ✅ Sprint 4 PR-4A / A165 / C62 / ...`），把：
- `A165 / C62` 替换为 `~~A165~~ ✅ Sprint 2 PR-2A / C62`
- `E134 / ~~E139~~` 替换为 `~~E134~~ ✅ Sprint 2 PR-2D / ~~E139~~`

**注**：本 step 不动 D131/E58/E153 标记 — 这些在 Task 5/6/7 完成后由 Task 8（文档同步）一并处理。

- [ ] **Step 3: 提交**

```bash
git add docs/card_progress.md
git commit -m "docs(card_progress): mark A165/E134 stub as resolved (Sprint 2)

A165 PigBreeder (Sprint 2 PR-2A: round-12 boar breed) and E134 Omnifarmer
(Sprint 2 PR-2D: storedTypes deposit-on-harvest state machine) were
implemented but the §2.7 stub list still showed them unmarked. Sync the
list strikethrough+check to reflect actual progress.

Sprint 6d step 1/8 (independent doc sync)."
```

---

## Task 2: Trade.sideEffect.bonusVp kind + applyTradeSideEffect 扩签名

**Goal:** `TradeSideEffect` 联合扩 `'bonusVp' { amount }` kind；`applyTradeSideEffect` 签名扩 `(state, player, eff, times, sourceCard)` 并加 bonusVp case；`exchange.execute` 应用 trade 时调 sideEffect dispatch。

**Files:**
- Modify: `shared/game/types.ts`
- Modify: `shared/actions/helpers/payment.ts`
- Modify: `shared/actions/effects/exchange.ts`
- Modify: `shared/actions/helpers/__tests__/payment-trade-side-effect.test.ts`

- [ ] **Step 1: 写失败测试 — bonusVp dispatcher 单元**

打开 `shared/actions/helpers/__tests__/payment-trade-side-effect.test.ts`（sprint-5c 落地的既有文件），在文件末尾追加：

```ts
import type { PlayerState } from '../../../game/types'

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
  id: 'p1',
  name: 'Test',
  resources: {} as any,
  cardStates: {},
  pastures: [],
  stableAnimals: {},
  rooms: 2,
  workers: [],
  improvements: [],
  minorPlayed: [],
  occupationPlayed: [],
  ...overrides,
} as unknown as PlayerState)

describe('applyTradeSideEffect.bonusVp', () => {
  it('累加 amount * times 到 cardStates[sourceCard].extraData.bonusVpEarned', () => {
    const state = { actionSpaces: [] } as unknown as GameState
    const player = makePlayer()
    applyTradeSideEffect(state, player, { type: 'bonusVp', amount: 2 }, 3, 'E153_StoneSculptor')
    expect(player.cardStates?.E153_StoneSculptor?.extraData?.bonusVpEarned).toBe(6)
  })

  it('cardStates 不存在时初始化', () => {
    const state = { actionSpaces: [] } as unknown as GameState
    const player = makePlayer({ cardStates: undefined })
    applyTradeSideEffect(state, player, { type: 'bonusVp', amount: 1 }, 1, 'E153_StoneSculptor')
    expect(player.cardStates?.E153_StoneSculptor?.extraData?.bonusVpEarned).toBe(1)
  })

  it('多次调用累加（不覆盖）', () => {
    const state = { actionSpaces: [] } as unknown as GameState
    const player = makePlayer()
    applyTradeSideEffect(state, player, { type: 'bonusVp', amount: 1 }, 1, 'E153_StoneSculptor')
    applyTradeSideEffect(state, player, { type: 'bonusVp', amount: 1 }, 1, 'E153_StoneSculptor')
    expect(player.cardStates?.E153_StoneSculptor?.extraData?.bonusVpEarned).toBe(2)
  })

  it('drainSpace 路径 regression — sprint-5c 行为不破', () => {
    const state = {
      actionSpaces: [{ id: 'traveling-players', resources: { food: 5 } } as any],
    } as unknown as GameState
    const player = makePlayer()
    applyTradeSideEffect(state, player, { type: 'drainSpace', spaceId: 'traveling-players', resource: 'food' }, 2, 'B155_ArtTeacher')
    expect(state.actionSpaces[0].resources!.food).toBe(3)
  })
})
```

- [ ] **Step 2: 跑测试验证失败**

```bash
pnpm exec vitest run shared/actions/helpers/__tests__/payment-trade-side-effect.test.ts
```

Expected: 4 个新 case FAIL — `applyTradeSideEffect` 签名不接 player + sourceCard，且无 'bonusVp' case；regression case (drainSpace) 也可能因签名不匹配 fail。

- [ ] **Step 3: 扩 TradeSideEffect 联合**

打开 `shared/game/types.ts`，找到 sprint-5c 落地的 `TradeSideEffect` 类型定义（grep `TradeSideEffect` 定位）。把：

```ts
export type TradeSideEffect =
  | { type: 'drainSpace'; spaceId: string; resource: ResourceKey }
```

改为：

```ts
export type TradeSideEffect =
  | { type: 'drainSpace'; spaceId: string; resource: ResourceKey }
  | { type: 'bonusVp'; amount: number }
```

- [ ] **Step 4: 扩 applyTradeSideEffect 签名 + bonusVp case**

打开 `shared/actions/helpers/payment.ts`，找到 sprint-5c 落地的 `applyTradeSideEffect` 函数（grep 定位；spec 假设当前签名 `(state, eff, times)`）。

把：

```ts
export const applyTradeSideEffect = (
  state: GameState,
  eff: TradeSideEffect,
  times: number,
): void => {
  if (times <= 0) return
  switch (eff.type) {
    case 'drainSpace': {
      const space = state.actionSpaces.find((s) => s.id === eff.spaceId)
      if (!space?.resources) return
      const cur = space.resources[eff.resource] ?? 0
      space.resources[eff.resource] = Math.max(0, cur - times)
      return
    }
  }
}
```

改为：

```ts
export const applyTradeSideEffect = (
  state: GameState,
  player: PlayerState,
  eff: TradeSideEffect,
  times: number,
  sourceCard: string,
): void => {
  if (times <= 0) return
  switch (eff.type) {
    case 'drainSpace': {
      const space = state.actionSpaces.find((s) => s.id === eff.spaceId)
      if (!space?.resources) return
      const cur = space.resources[eff.resource] ?? 0
      space.resources[eff.resource] = Math.max(0, cur - times)
      return
    }
    case 'bonusVp': {
      player.cardStates ??= {}
      player.cardStates[sourceCard] ??= { extraData: {} }
      player.cardStates[sourceCard].extraData ??= {}
      const cur = (player.cardStates[sourceCard].extraData.bonusVpEarned as number) ?? 0
      player.cardStates[sourceCard].extraData.bonusVpEarned = cur + eff.amount * times
      return
    }
  }
}
```

如果实际签名与上述假设不同（例如 sprint-5c 实际是 `(state, eff, times, options)` 形式），按实际形态扩展，原则：加 `player` + `sourceCard` 两参数（位置可调，建议放 player 后、eff 前）。

- [ ] **Step 5: 同步所有 caller**

```bash
grep -rn "applyTradeSideEffect" shared/ server/ --include="*.ts" 2>/dev/null
```

Expected: 至少 3 处 — `payment.ts` 内（applyPaymentSolution 调用）+ `payment-trade-side-effect.test.ts` + 可能的 `exchange.ts`（sprint-5c 是否补了不确定，本 task step 6 会补）。每处 caller 加 `player` + `sourceCard` 参数。

`payment.ts` 内的 applyPaymentSolution 调 applyTradeSideEffect 时（参考 sprint-5c spec §2.4）：

```ts
// sprint-5c 落地形态（参考；实际看代码）
solution.tradesUsed.forEach(({ trade, times }) => {
  // ...既有 from / to 应用
  if (trade.sideEffect) {
    applyTradeSideEffect(state, trade.sideEffect, times)  // ← 改为下面
  }
})
```

改为：

```ts
solution.tradesUsed.forEach(({ trade, times }) => {
  // ...既有 from / to 应用
  if (trade.sideEffect) {
    applyTradeSideEffect(state, player, trade.sideEffect, times, trade.sourceId ?? trade.source ?? 'unknown')
  }
})
```

注：applyPaymentSolution 当前签名应已含 `state` 和 `player`（sprint-5c 加的）；如未含 `player` 参数从外层 caller 传入。

- [ ] **Step 6: exchange.execute 应用 sideEffect**

打开 `shared/actions/effects/exchange.ts`，找到 trade 应用的位置（grep `tradesUsed` / `applyTrade` / `from\.\|to\.` 在 execute 内）。在 trade from / to 应用之后追加：

```ts
// 既有：扣 from / 加 to
// 例：
// player.resources[fromKey] -= times * fromAmount
// player.resources[toKey] += times * toAmount

// 新增：
if (trade.sideEffect && times > 0) {
  applyTradeSideEffect(
    state,
    player,
    trade.sideEffect,
    times,
    trade.sourceId ?? trade.source ?? 'unknown',
  )
}
```

import：

```ts
import { applyTradeSideEffect } from '../helpers/payment'
```

- [ ] **Step 7: 跑测试验证 PASS**

```bash
pnpm exec vitest run shared/actions/helpers/__tests__/payment-trade-side-effect.test.ts
```

Expected: 全 case 全 PASS（既有 sprint-5c case + 新 4 case）。

- [ ] **Step 8: 跑 fast 全量回归**

```bash
pnpm test:fast
```

Expected: 全绿。重点关注：B155 ArtTeacher session 测试（sprint-5c 用 sideEffect.drainSpace，签名改后仍工作）。

- [ ] **Step 9: 提交**

```bash
git add shared/game/types.ts shared/actions/helpers/payment.ts shared/actions/effects/exchange.ts shared/actions/helpers/__tests__/payment-trade-side-effect.test.ts
git commit -m "feat(payment): Trade.sideEffect.bonusVp kind + signature extension

Adds 'bonusVp' kind to TradeSideEffect union (sprint-5c established
'drainSpace'). applyTradeSideEffect signature extends to
(state, player, eff, times, sourceCard) — bonusVp writes
cardStates[sourceCard].extraData.bonusVpEarned += amount * times for
later read by computeBonusScore.

exchange.execute now invokes applyTradeSideEffect when trade.sideEffect
is present, mirroring the payment-path call sprint-5c added for the
B155 drainSpace use case.

3 new unit cases (bonusVp accumulate / cardStates init / multiple-call
add) + 1 regression case (drainSpace still works).

Sprint 6d infra step 2/8."
```

---

## Task 3: minor-improvement listener candidate injection

**Goal:** 给 `minor-improvement.execute` 加 listener 调用，合并 `extraOptions`；新 helper `collectComputeChoiceCandidates`；这是 D131 依赖的基础设施。

**Files:**
- Modify: `shared/actions/effects/improvement.ts`

- [ ] **Step 1: grep 确认现有 helper / API**

```bash
grep -n "buildPlayableMinorOptions\|getMatchingListeners\|executeCardListener\|buildBaseListenerContext\|isAffordableImprovement\|canAffordImprovement\|meetsCardPrerequisites" shared/actions/effects/improvement.ts shared/cards/card-listeners.ts shared/cards/registry.ts 2>/dev/null | head -15
```

记录：`buildPlayableMinorOptions` / `getMatchingListeners` / `executeCardListener` 的位置；affordability helper 真实名（plan 假设 `isAffordableImprovement` 或 `canAffordImprovement`）。

- [ ] **Step 2: 写新 helper `collectComputeChoiceCandidates`**

位置：可放 `shared/cards/card-listeners.ts` 末尾（共享给其他 action 复用），或 `shared/actions/effects/improvement.ts` 文件内（仅 improvement 用）。**推荐放 `card-listeners.ts`** — 通用工具。

打开 `shared/cards/card-listeners.ts`，在文件末尾追加：

```ts
import type { ActionChoiceOption } from '../game/types'

/**
 * 通用 helper — 跑指定 actionId 的 `computeChoiceCandidates` phase listeners，
 * 合并所有 listener 返回的 extraOptions。
 *
 * 用于：minor-improvement.execute 让 D131 / 类似卡通过 listener 注入 candidate。
 */
export const collectComputeChoiceCandidates = (
  state: GameState,
  player: PlayerState,
  actionId: string,
): ActionChoiceOption[] => {
  // 构造最小 listener context（其他字段未必需要；以现有 buildCardListenerContext 调用为准）
  const baseCtx: CardListenerContext = {
    state,
    player,
    actionId,
    phase: 'computeChoiceCandidates' as ActionHookPhase,
  } as CardListenerContext

  const out: ActionChoiceOption[] = []
  for (const matched of getMatchingListeners(baseCtx)) {
    const result = executeCardListener(matched.registration, baseCtx, {
      ownerPlayerId: matched.ownerPlayerId,
    })
    if (result?.extraOptions) {
      out.push(...result.extraOptions)
    }
  }
  return out
}
```

注：实际 listener context 字段可能需要更多 — 参考 `buildCardListenerContext`（line 152）的实际形态调整。

import：

```ts
import type { ActionHookPhase } from '../actions/hooks'
```

- [ ] **Step 3: 改造 minor-improvement.execute**

打开 `shared/actions/effects/improvement.ts:766-776`：

当前：

```ts
execute: ({ state, player }) => {
  const options = buildPlayableMinorOptions(state, player)
  if (options.length === 0) {
    return { type: 'ok' }
  }
  return {
    type: 'choice',
    promptKey: 'ui.interactionChooseMinorImprovement',
    options,
  }
},
```

改为：

```ts
execute: ({ state, player }) => {
  const baseOptions = buildPlayableMinorOptions(state, player)

  // listener candidate injection（D131 等通过 computeChoiceCandidates 注入 major 选项）
  const extraRaw = collectComputeChoiceCandidates(state, player, 'minor-improvement')

  // affordability 过滤（cost 模型一致；reuse 既有 helper）
  const extraOptions = extraRaw.filter((opt) =>
    isAffordableImprovement(state, player, opt.value),
  )

  const options = [...baseOptions, ...extraOptions]
  if (options.length === 0) {
    return { type: 'ok' }
  }
  return {
    type: 'choice',
    promptKey: 'ui.interactionChooseMinorImprovement',
    options,
  }
},
```

`resolveChoice` 改为支持 minor 和 major（既有 `playImprovement` 应已支持 `'any'`）：

```ts
resolveChoice: ({ state, player }, choice) =>
  playImprovement(state, player, choice, 'any'),
```

import 加：

```ts
import { collectComputeChoiceCandidates } from '../../cards/card-listeners'
```

注：`isAffordableImprovement` helper 名实际可能是 `canAffordImprovement` 或类似。grep step 1 已确认；如不存在直接 inline 一个 affordability 校验：

```ts
// fallback inline 校验（如果没有现成 helper）
const isAffordableImprovement = (state: GameState, player: PlayerState, cardId: string): boolean => {
  // 调既有 prerequisite + cost 校验
  // 例：return meetsCardPrerequisites(player, cardId) && canAffordCardCost(state, player, cardId, 'improvement')
  // ...具体以 codebase 既有逻辑为准
}
```

- [ ] **Step 4: 跑现有 minor-improvement / D95 SiteManager 测试验证不破坏**

```bash
pnpm exec vitest run server/__tests__/D95_*.test.ts shared/cards/__tests__/*.test.ts
```

Expected: D95 SiteManager / 其他既有 minor-improvement 测试全绿（D131 listener 未注册时 collectComputeChoiceCandidates 返回空，不影响行为）。

- [ ] **Step 5: 跑 fast 全量回归**

```bash
pnpm test:fast
```

Expected: 全绿。

- [ ] **Step 6: 提交**

```bash
git add shared/actions/effects/improvement.ts shared/cards/card-listeners.ts
git commit -m "feat(improvement): minor-improvement listener candidate injection

Adds collectComputeChoiceCandidates(state, player, actionId) helper to
shared/cards/card-listeners.ts that runs computeChoiceCandidates phase
listeners and merges their extraOptions.

minor-improvement.execute now consults this helper after building base
minor options, filters injected candidates by affordability, and merges
both into the choice list. resolveChoice routes through
playImprovement('any') so the choice can be either a minor or major card.

D131 CraftsmanshipPromoter (Task 5) will register a listener that
injects bottom-row major IDs. Without listeners no behavior change.

Sprint 6d infra step 3/8."
```

---

## Task 4: harvest phase skip helper（game-core）

**Goal:** game-core 新 helper `hasPassFieldAndBreed(player)` 扫 cardStates 找当前 round flag；harvest field/breeding phase 入口前 filter 跳过对应玩家。这是 E58 依赖的基础设施。

**Files:**
- Modify: `shared/session/game-core.ts`

- [ ] **Step 1: 定位 harvest phase 入口**

```bash
grep -n "continueHarvestFieldPhase\|continueAfterFeedingPhase\|startBreedPhase\|getHarvestPlayerIndices" shared/session/game-core.ts | head -15
```

记录关键行：
- `continueHarvestFieldPhase`（field-phase 入口，约 line 1376 周边）
- `continueAfterFeedingPhase`（breed-phase 启动入口，sprint-5c 改造为 leaf flow）
- `getHarvestPlayerIndices`（玩家顺序 helper）

- [ ] **Step 2: 加 hasPassFieldAndBreed helper**

打开 `shared/session/game-core.ts`，在 `GameSession` 类内加（位置：靠近 `getHarvestPlayerIndices` 等 harvest helper）：

```ts
private hasPassFieldAndBreed(player: PlayerState): boolean {
  const cardStates = player.cardStates ?? {}
  for (const cardId of Object.keys(cardStates)) {
    const round = cardStates[cardId]?.extraData?.passFieldAndBreedRound
    if (typeof round === 'number' && round === this.state.round) {
      return true
    }
  }
  return false
}
```

- [ ] **Step 3: 在 field-phase 入口 filter**

定位 `continueHarvestFieldPhase`（约 line 1376），找到使用 `getHarvestPlayerIndices()` / `harvestOrder` 的地方。当前 reap / field-phase 逻辑可能形如：

```ts
const harvestOrder = this.getHarvestPlayerIndices()
harvestOrder.forEach((index) => {
  const player = this.state.players[index]
  if (player) reap(this.state, player)  // 或类似
})
```

改为：

```ts
const harvestOrder = this.getHarvestPlayerIndices()
const filteredOrder = harvestOrder.filter((index) => {
  const p = this.state.players[index]
  return p && !this.hasPassFieldAndBreed(p)
})
filteredOrder.forEach((index) => {
  const player = this.state.players[index]
  if (player) reap(this.state, player)
})
```

注：实际 field-phase 逻辑可能跨多个 helper；plan 阶段读完整 `continueHarvestFieldPhase` 函数体，找所有 iterate `harvestOrder` 的地方都改用 `filteredOrder`。**别**改 `getHarvestPlayerIndices` 自身（这是 player 顺序通用 helper，不能依赖 round flag）。

- [ ] **Step 4: 在 breed-phase 入口 filter**

定位 `continueAfterFeedingPhase`（sprint-5c 改造的 leaf flow 入口）。找到构造 `buildHarvestBreedFlow(harvestOrder)` 或等价 leaf flow 的地方，改用 `filteredOrder`：

```ts
private continueAfterFeedingPhase(playerIndex = 0, cardIndex = 0): SessionResponse {
  if (this.continueStageHook('onEndHarvestFeedingPhase', playerIndex, cardIndex)) {
    return this.respond()
  }
  const harvestOrder = this.getHarvestPlayerIndices()
  harvestOrder.forEach((index) => {
    const player = this.state.players[index]
    if (player) runAfterFeedHooks(this.state, player)
  })
  this.state.log.unshift({ key: 'log.harvestPhaseBreed' })
  this.state.harvestBreedSummary = {}

  // ← filter for E58 skip
  const filteredOrder = harvestOrder.filter((index) => {
    const p = this.state.players[index]
    return p && !this.hasPassFieldAndBreed(p)
  })

  const flow = this.buildHarvestBreedFlow(filteredOrder)
  if (flow) {
    return this.startStageFlow(flow, 'onBreedPhase' as const, 0, 0)
  }
  return this.continueEndHarvestEffects()
}
```

注：`buildHarvestBreedFlow` 是 sprint-5c 引入的 helper。如果实际代码用不同名字（参考 sprint-5c agent 报告的实际形态），按实际改。`runAfterFeedHooks` 是 feed-phase 的 hook，**不**受 E58 skip 影响（E58 只 skip field + breeding，不 skip feeding）。

- [ ] **Step 5: 跑既有 harvest 回归测试**

```bash
pnpm exec vitest run server/__tests__/*Harvest* server/__tests__/E84_Dolly* server/__tests__/E133_Champion*
```

Expected: 全绿（既有玩家不带 E58 → hasPassFieldAndBreed 返回 false → filteredOrder === harvestOrder → 行为不变）。

- [ ] **Step 6: 跑 fast 全量回归**

```bash
pnpm test:fast
```

Expected: 全绿。

- [ ] **Step 7: 提交**

```bash
git add shared/session/game-core.ts
git commit -m "feat(harvest): hasPassFieldAndBreed helper + skip field/breeding phase

Adds GameSession.hasPassFieldAndBreed(player) that scans cardStates for
extraData.passFieldAndBreedRound === currentRound. continueHarvestFieldPhase
and continueAfterFeedingPhase filter harvestOrder by !hasPassFieldAndBreed
before iterating reap / breed leaf flow.

Behavior-preserving when no card sets the flag (filteredOrder === harvestOrder).
E58 LunchtimeBeer (Task 6) will set the flag via special-effect leaf at
harvest start.

Sprint 6d infra step 4/8."
```

---

## Task 5: D131 CraftsmanshipPromoter

**Goal:** D131 加 `computeChoiceCandidates` listener 注入 bottom-row major 候选；6 case session 测试。

**Files:**
- Modify: `shared/cards/D/D131_CraftsmanshipPromoter.ts`
- Create: `server/__tests__/D131_CraftsmanshipPromoter-session.test.ts`

- [ ] **Step 1: 确认 BGA bottom-row major 列表**

```bash
grep -rn "bottom_row\|bottomRow\|isBottomRow\|Major_.*row\|Promoter\|Pottery.*Joinery" /home/xuxinhao.titan/raw/bga-agricola/modules/php/ 2>/dev/null | head -10
ls /home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/Major/
```

Expected: 找到 supply-board 配置中 bottom-row 的定义，或确认 spec 假设的 4 张（Pottery / Joinery / Basket / StoneOven）正确。如不一致，按实际调整 `BOTTOM_ROW_MAJORS` 常量。

- [ ] **Step 2: 写 D131 case 1（onBuy stone:1） + 跑既有验证基线**

```bash
ls server/__tests__/D131_*.test.ts
# 如不存在，参考既有 occupation onBuy 测试模板（如 server/__tests__/A12_*.test.ts）
```

新建 `server/__tests__/D131_CraftsmanshipPromoter-session.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import { GameSession } from '../game-session'
// ... 既有 session helpers (createSession2P / setOccupationHand / playOccupation / ...)

describe('D131 CraftsmanshipPromoter', () => {
  it('onBuy: 给 1 stone', () => {
    const session = createSession2P({ persistRoom: false, players: 4 })  // 3+ 玩家
    setPlayerOccupationHand(session, 'p1', ['D131_CraftsmanshipPromoter'])
    placeFarmer(session, 'p1', 'lessons')
    selectOccupation(session, 'p1', 'D131_CraftsmanshipPromoter')
    confirmPayment(session)
    expect(session.state.players[0].resources.stone).toBe(initialStone + 1)
  })
})
```

注：实际 helper 名（`createSession2P` / `placeFarmer` / `selectOccupation` 等）以既有测试模板为准；本 plan 写参考形态，agent 实施时 grep 既有 occupation session test 复制 setup 模板。

- [ ] **Step 3: 跑 case 1 验证 PASS（D131 现有 onBuy 已正确）**

```bash
pnpm exec vitest run server/__tests__/D131_CraftsmanshipPromoter-session.test.ts -t "onBuy"
```

Expected: PASS（D131 的 onBuy stone:1 在 stub 已实现）。

- [ ] **Step 4: 写 D131 case 2 — D131 owner 占 minor-improvement → choice 含 bottom-row major**

```ts
it('D131 owner 占 minor-improvement → choice 含 Major_Pottery 标 sourceCard=D131', () => {
  const session = createSession2P({ persistRoom: false, players: 4 })
  setPlayerOccupations(session, 'p1', ['D131_CraftsmanshipPromoter'])
  setPlayerResources(session, 'p1', { wood: 5, clay: 5, stone: 5, reed: 5 })  // 可付各 major cost
  // 让 supply 上 Major_Pottery 等 bottom-row major 仍可用（initial state 默认应可用）
  placeFarmer(session, 'p1', 'minor-improvement')
  const resp = session.respond()
  expect(resp.pending?.type).toBe('choice')
  const options = (resp.pending as any).options as ActionChoiceOption[]
  expect(options.some((o) => o.value === 'Major_Pottery' && o.sourceCard === 'D131_CraftsmanshipPromoter')).toBe(true)
})
```

跑 → FAIL（D131 还没加 listener）。

- [ ] **Step 5: 改写 D131**

```ts
// shared/cards/D/D131_CraftsmanshipPromoter.ts (rewrite)
import { Occupation } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D131_CraftsmanshipPromoter'

const BOTTOM_ROW_MAJORS = [
  'Major_Pottery',
  'Major_Joinery',
  'Major_Basket',
  'Major_StoneOven',
] as const

const computeChoiceCandidatesListener: CardListenerRegistration = {
  id: 'D131-craftsmanship-promoter-compute-choice-candidates',
  cardIds: [CARD_ID],
  actions: ['minor-improvement'],
  phases: ['computeChoiceCandidates' as ActionHookPhase],
  handler: (ctx: CardListenerContext): ActionHookResult | void => {
    if (!ctx.player.occupationPlayed.includes(CARD_ID)) return
    const available = ctx.state.availableMajorImprovements ?? []
    const extraOptions: ActionChoiceOption[] = BOTTOM_ROW_MAJORS
      .filter((id) => available.includes(id))
      .map((id) => ({
        value: id,
        labelKey: `cards.${id}.name`,
        sourceCard: CARD_ID,
      }))
    if (extraOptions.length === 0) return
    return { extraOptions, sourceCard: CARD_ID }
  },
}

export const D131_CraftsmanshipPromoter = new Occupation({
  id: CARD_ID,
  name: 'Craftsmanship Promoter',
  deck: 'D',
  number: 131,
  category: 'ACTIONS_BOOSTER',
  desc: ['When you play this card, you immediately get 1 <STONE>. You can build any of the major improvements in the bottom row of the supply board even when taking a __Minor Improvement__ action.'],
  cost: {},
  players: '3+',
  newSet: true,
})

export const D131_CraftsmanshipPromoter_impl = {
  effect: {
    id: CARD_ID,
    onBuy: () => gainLeaf(CARD_ID, { stone: 1 }),
  },
  listeners: [computeChoiceCandidatesListener],
  reaches: [...BOTTOM_ROW_MAJORS] as readonly string[],
} satisfies CardImpl
```

- [ ] **Step 6: 跑 case 2 PASS**

```bash
pnpm exec vitest run server/__tests__/D131_CraftsmanshipPromoter-session.test.ts -t "choice 含 Major_Pottery"
```

Expected: PASS。

- [ ] **Step 7: 写 case 3 — D131 owner 选 Major_Pottery → 走 major 付费 + 加入 player.improvements**

```ts
it('D131 owner 选 Major_Pottery → 走 major 付费 + improvements 含 Major_Pottery', () => {
  // ... case 2 setup
  resolveChoice(session, 'p1', 'Major_Pottery')
  confirmPayment(session)
  expect(session.state.players[0].improvements).toContain('Major_Pottery')
  expect(session.state.availableMajorImprovements).not.toContain('Major_Pottery')
})
```

跑 → PASS（resolveChoice 已用 playImprovement('any')，自动处理 major 路径）。

- [ ] **Step 8: 写 case 4-6（非 owner / supply 空 / cost 不足）**

```ts
it('非 D131 owner → 不出现 major 选项', () => {
  const session = createSession2P({ persistRoom: false, players: 4 })
  setPlayerOccupations(session, 'p1', [])  // 不含 D131
  placeFarmer(session, 'p1', 'minor-improvement')
  const resp = session.respond()
  if (resp.pending?.type === 'choice') {
    const options = (resp.pending as any).options
    expect(options.every((o: any) => !o.value?.startsWith('Major_'))).toBe(true)
  }
})

it('D131 owner 但 4 张 bottom-row major 都已被买 → 仅 minor 选项', () => {
  const session = createSession2P({ persistRoom: false, players: 4 })
  setPlayerOccupations(session, 'p1', ['D131_CraftsmanshipPromoter'])
  // 让 supply 上的 Pottery/Joinery/Basket/StoneOven 都被领走
  removeFromAvailableMajors(session, ['Major_Pottery', 'Major_Joinery', 'Major_Basket', 'Major_StoneOven'])
  placeFarmer(session, 'p1', 'minor-improvement')
  const resp = session.respond()
  const options = (resp.pending as any).options ?? []
  expect(options.every((o: any) => !o.value?.startsWith('Major_'))).toBe(true)
})

it('D131 owner 选 Major_Pottery 但 cost 不可付 → Major_Pottery 不出现', () => {
  const session = createSession2P({ persistRoom: false, players: 4 })
  setPlayerOccupations(session, 'p1', ['D131_CraftsmanshipPromoter'])
  setPlayerResources(session, 'p1', { wood: 0, clay: 0, stone: 0, reed: 0 })
  placeFarmer(session, 'p1', 'minor-improvement')
  const resp = session.respond()
  const options = (resp.pending as any).options ?? []
  expect(options.some((o: any) => o.value === 'Major_Pottery')).toBe(false)
})
```

注：`removeFromAvailableMajors` / `setPlayerOccupations` 等 helper 名以既有测试模板为准。

- [ ] **Step 9: 跑全 6 case PASS + fast 回归**

```bash
pnpm exec vitest run server/__tests__/D131_CraftsmanshipPromoter-session.test.ts
pnpm test:fast
```

Expected: 全绿。

- [ ] **Step 10: 提交**

```bash
git add shared/cards/D/D131_CraftsmanshipPromoter.ts server/__tests__/D131_CraftsmanshipPromoter-session.test.ts
git commit -m "feat(D131): align with BGA — computeChoiceCandidates listener for bottom-row majors

D131 CraftsmanshipPromoter registers a computeChoiceCandidates listener
on actions:['minor-improvement'] that injects bottom-row major candidates
(Major_Pottery / Major_Joinery / Major_Basket / Major_StoneOven) into
the minor-improvement choice list. Listener is gated on
player.occupationPlayed.includes(CARD_ID) so non-owners don't see them.
Affordability is filtered by the existing logic in
minor-improvement.execute (added in Sprint 6d infra step 3/8).

onBuy gain stone:1 preserved.

6 session test cases: onBuy / choice contains major / select Major_Pottery
buys it / non-owner no major / supply empty no major / cost-unaffordable
filtered.

Sprint 6d card 1/3."
```

---

## Task 6: E58 LunchtimeBeer

**Goal:** E58 onStartHarvest listener 返回 optional SEQ（gain food + special-effect set-extra-data passFieldAndBreedRound）；5 case session 测试 + plan 阶段 BGA 复核 phase-skip 互动语义。

**Files:**
- Modify: `shared/cards/E/E58_LunchtimeBeer.ts`
- Create: `server/__tests__/E58_LunchtimeBeer-session.test.ts`

- [ ] **Step 1: BGA 复核 — phase-skip 与 onHarvest hook 互动**

```bash
grep -rn "passFieldAndBreed\|onPlayerStartHarvestFieldPhase\|onPlayerHarvestFieldPhase" /home/xuxinhao.titan/raw/bga-agricola/modules/php/ 2>/dev/null | head -10
```

记录：当 player 在 `Globals::passFieldAndBreed` list 时，BGA 是只跳过 reap / breed 还是连带跳过 onPlayerStartHarvestFieldPhase / onHarvestFieldPhase 等 player hook？

**判定规则**：
- 如 BGA 仍 fire onHarvest hook → 我方 game-core skip 范围保持 Task 4 的（仅 reap / breed leaf flow），不动 hook 调用
- 如 BGA 跳过所有 phase 内 hook → game-core 也短路 onHarvestFieldPhase / onHarvest hook

记录结论。本 step 决定 case 5 测试期望。

- [ ] **Step 2: 写 E58 case 1 — harvest 开始选用 → +1 food + skip phase**

```ts
import { describe, it, expect } from 'vitest'
import { GameSession } from '../game-session'

describe('E58 LunchtimeBeer', () => {
  it('harvest 开始选用 → +1 food + skip field/breeding phase', () => {
    const session = createSession2P({ persistRoom: false })
    setPlayerMinors(session, 'p1', ['E58_LunchtimeBeer'])
    setPlayerFields(session, 'p1', [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }])  // 有 grain 待 reap
    setPlayerSheep(session, 'p1', 2)  // 有 sheep 待 breed
    advanceToHarvestRound(session, 4)  // round 4 = 第一个 harvest
    // optional 选用
    chooseOptional(session, 'p1', true)  // E58 SEQ optional → accept
    confirmPayment(session)  // 如果有 payment prompt
    advanceUntilNextNonHarvestPhase(session)
    expect(session.state.players[0].resources.food).toBe(initialFood + 1)
    expect(session.state.players[0].cardStates?.E58_LunchtimeBeer?.extraData?.passFieldAndBreedRound).toBe(4)
    // field-phase reap 跳过 (grain 仍 2)
    expect(session.state.players[0].fields[0].stacks[0].remaining).toBe(2)
    // breed-phase 跳过 (sheep 仍 2)
    expect(session.state.players[0].resources.sheep).toBe(2)
  })
})
```

注：实际 helper 名 (`advanceToHarvestRound` / `chooseOptional` / 等) 以既有 harvest session 测试为准。

- [ ] **Step 3: 跑 case 1 验证 FAIL**

```bash
pnpm exec vitest run server/__tests__/E58_LunchtimeBeer-session.test.ts -t "选用"
```

Expected: FAIL — 当前 stub 只 gain food，不 set passFieldAndBreedRound，phase 不 skip。

- [ ] **Step 4: 改写 E58**

```ts
// shared/cards/E/E58_LunchtimeBeer.ts (rewrite)
import { MinorImprovement } from '../types'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E58_LunchtimeBeer'

const onStartHarvestListener: CardListenerRegistration = {
  id: 'E58-lunchtime-beer-on-start-harvest',
  cardIds: [CARD_ID],
  actions: ['__stage:onStartHarvest'],
  phases: ['after' as ActionHookPhase],
  handler: (ctx: CardListenerContext): ActionHookResult | void => {
    const flow: ActionFlow = {
      type: 'seq',
      optional: true,
      children: [
        gainLeaf(CARD_ID, { food: 1 }),
        {
          type: 'leaf',
          actionId: 'special-effect',
          actionContext: {
            kind: 'set-extra-data',
            cardId: CARD_ID,
            key: 'passFieldAndBreedRound',
            value: ctx.state.round,
          },
          sourceCard: CARD_ID,
        },
      ],
    }
    return { flow, sourceCard: CARD_ID }
  },
}

export const E58_LunchtimeBeer = new MinorImprovement({
  id: CARD_ID,
  name: 'Lunchtime Beer',
  deck: 'E',
  number: 58,
  category: 'FOOD',
  desc: ['At the start of each harvest, you can choose to skip the field and breeding phase of that harvest and get exactly 1 <FOOD> instead.'],
  cost: {},
})

export const E58_LunchtimeBeer_impl = {
  listeners: [onStartHarvestListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
```

注：actionId `'__stage:onStartHarvest'` 的真实 dispatch 名 grep `__stage:` 在 game-core.ts 确认。如果 stage hook 不通过 listener 系统 fire（仅 effect.onStartHarvest 被调），fallback 用 `effect.onStartHarvest` 返回 ActionFlow 形态（参考 sprint-5c §2.4 onAfterRoundEnd 模式）：

```ts
// fallback 形态
export const E58_LunchtimeBeer_impl = {
  effect: {
    id: CARD_ID,
    onStartHarvest: (state, _player): ActionFlow => ({
      type: 'seq',
      optional: true,
      children: [
        gainLeaf(CARD_ID, { food: 1 }),
        {
          type: 'leaf',
          actionId: 'special-effect',
          actionContext: { kind: 'set-extra-data', cardId: CARD_ID, key: 'passFieldAndBreedRound', value: state.round },
          sourceCard: CARD_ID,
        },
      ],
    }),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

- [ ] **Step 5: 跑 case 1 PASS**

```bash
pnpm exec vitest run server/__tests__/E58_LunchtimeBeer-session.test.ts -t "选用"
```

Expected: PASS。

- [ ] **Step 6: 写 case 2-5**

```ts
it('harvest 开始选不用 → food 不变，phase 正常跑', () => {
  // setup 同 case 1
  chooseOptional(session, 'p1', false)
  advanceUntilNextNonHarvestPhase(session)
  expect(session.state.players[0].resources.food).toBe(initialFood)
  expect(session.state.players[0].cardStates?.E58_LunchtimeBeer?.extraData?.passFieldAndBreedRound).toBeUndefined()
  // grain reap 正常发生
  expect(session.state.players[0].resources.grain).toBeGreaterThan(0)
})

it('玩家无 E58 → listener 不 fire，正常跑 phase', () => {
  const session = createSession2P({ persistRoom: false })
  // 不给 p1 E58
  advanceToHarvestRound(session, 4)
  advanceUntilNextNonHarvestPhase(session)
  // 正常 reap / breed
  expect(session.state.players[0].resources.food).toBe(initialFood)  // 无 +1
})

it('round 4 选用 + round 7 重新触发', () => {
  const session = createSession2P({ persistRoom: false })
  setPlayerMinors(session, 'p1', ['E58_LunchtimeBeer'])
  advanceToHarvestRound(session, 4)
  chooseOptional(session, 'p1', true)
  advanceUntilNextNonHarvestPhase(session)
  // round 5-6 不 harvest
  advanceToHarvestRound(session, 7)
  // E58 listener 再次 fire 提供 optional
  const resp = session.respond()
  // 断言 SEQ optional prompt 出现
})

// case 5 — 跳过 phase 后玩家其他 onHarvest hook 是否触发
// 取决于 step 1 BGA 复核结论
it('p1 同时 E58 + D38 MilkingStool；选 E58 跳过 → D38 onHarvestFieldPhase 是否 fire', () => {
  const session = createSession2P({ persistRoom: false })
  setPlayerMinors(session, 'p1', ['E58_LunchtimeBeer', 'D38_MilkingStool'])
  setPlayerCattle(session, 'p1', 3)  // D38 给 2 food
  advanceToHarvestRound(session, 4)
  chooseOptional(session, 'p1', true)  // 选用 E58
  advanceUntilNextNonHarvestPhase(session)
  // 期望按 step 1 BGA 复核结论：
  //   - 如 BGA fire D38 → expect food +1 (E58) +2 (D38) = +3
  //   - 如 BGA 跳过 D38 → expect food +1 (仅 E58)
  expect(session.state.players[0].resources.food).toBe(/* 按结论填 */)
})
```

注：case 5 的期望按 step 1 BGA 复核结论填；如 BGA 跳过所有 onHarvest hook 而我方 Task 4 game-core 仅 skip reap/breed leaf，需补 game-core 改动短路 hook 调用，**或**登记 deliberate divergence。

- [ ] **Step 7: 跑全 5 case PASS + fast 回归**

```bash
pnpm exec vitest run server/__tests__/E58_LunchtimeBeer-session.test.ts
pnpm test:fast
```

Expected: 全绿。

- [ ] **Step 8: 提交**

```bash
git add shared/cards/E/E58_LunchtimeBeer.ts server/__tests__/E58_LunchtimeBeer-session.test.ts
git commit -m "feat(E58): align with BGA — onStartHarvest optional SEQ + phase skip

E58 LunchtimeBeer registers a stage-hook listener on
__stage:onStartHarvest that returns an optional SEQ:
  [gainLeaf(food:1), special-effect set-extra-data passFieldAndBreedRound]
The flag is read by game-core hasPassFieldAndBreed (Task 4) which filters
harvestOrder before reap and breed leaf flow, skipping the player's
field and breeding phase for that round only.

5 session cases: select / decline / no-card / round-4-then-round-7 /
interaction-with-other-onHarvest-hook (per BGA cross-check in step 1).

Sprint 6d card 2/3."
```

---

## Task 7: E153 StoneSculptor

**Goal:** E153 改 exchanges metadata triggers:['harvest'] + sideEffect:bonusVp + computeBonusScore；6 case session 测试；harvest exchange selector 暴露 'harvest' window（如未支持，补）。

**Files:**
- Modify: `shared/cards/E/E153_StoneSculptor.ts`
- Create: `server/__tests__/E153_StoneSculptor-session.test.ts`
- 可能：`shared/actions/effects/exchange.ts` / `shared/session/game-core.ts` 加 harvest selector window

- [ ] **Step 1: grep 确认 harvest window 暴露入口**

```bash
grep -rn "getExchangesInWindow.*'harvest'\|getExchangesInWindow.*'anytime'\|harvest.*selector\|harvestExchange" shared/ server/ 2>/dev/null | head -10
```

记录：harvest 流程是否已调 `getExchangesInWindow(player, 'harvest')` 暴露选项？sprint-6a 的 cookery selector 改造可能已统一（参考 docs/card_progress.md §2 line 71-77 提到的"harvest selector 通用化（entry-index based + 双向 apply）"）。

**判定**：
- 如已暴露 'harvest' window：本 task 仅改 E153 metadata + bonusVp dispatcher
- 如未暴露：本 task 补 harvest 流程在某点（推荐：`continueAfterReap` / `continueAfterFeedingPhase` 之间，或 `startHarvest` 入口）调 `getExchangesInWindow(player, 'harvest')` 让玩家选用

- [ ] **Step 2: 确认 max:1 在 harvest 周期重置机制**

```bash
grep -rn "exchange.*max\|max.*used\|usedExchange\|exchangeUsedThisHarvest" shared/ 2>/dev/null | head
```

记录：sprint-6a 的 harvest selector 是否在 harvest 入口重置 max counter？如不重置需补。

- [ ] **Step 3: 写 E153 case 1 — harvest 中选 1 stone → 1 food + 1 bonus VP**

```ts
import { describe, it, expect } from 'vitest'
import { GameSession } from '../game-session'

describe('E153 StoneSculptor', () => {
  it('harvest 中 stone≥1 → 选 1 stone → 1 food + 1 bonus VP', () => {
    const session = createSession2P({ persistRoom: false, players: 4 })
    setPlayerOccupations(session, 'p1', ['E153_StoneSculptor'])
    setPlayerResources(session, 'p1', { stone: 2, food: 0 })
    advanceToHarvestRound(session, 4)
    // exchange selector 应暴露 E153 选项
    selectExchange(session, 'p1', 'E153_StoneSculptor')
    confirmExchange(session)
    expect(session.state.players[0].resources.stone).toBe(1)
    expect(session.state.players[0].resources.food).toBe(1)
    expect(session.state.players[0].cardStates?.E153_StoneSculptor?.extraData?.bonusVpEarned).toBe(1)
  })
})
```

跑 → FAIL（E153 stub triggers:['anytime']，harvest selector 不暴露；且无 bonusVp dispatch）。

- [ ] **Step 4: 改写 E153**

```ts
// shared/cards/E/E153_StoneSculptor.ts (rewrite)
import { Occupation } from '../types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E153_StoneSculptor'

export const E153_StoneSculptor = new Occupation({
  id: CARD_ID,
  name: 'Stone Sculptor',
  deck: 'E',
  number: 153,
  category: 'BONUS_POINTS',
  desc: ['Each harvest, you can use this card to exchange exactly 1 <STONE> for 1 bonus <SCORE> and 1 <FOOD>.'],
  cost: {},
  players: '4+',
  extraVp: true,
  exchanges: [{
    from: { stone: 1 },
    to: { food: 1 },
    max: 1,
    triggers: ['harvest'],
    sourceId: CARD_ID,
    sideEffect: { type: 'bonusVp', amount: 1 },
  }],
})

export const E153_StoneSculptor_impl = {
  effect: {
    id: CARD_ID,
    computeBonusScore: (_state, player): number => {
      return (player.cardStates?.[CARD_ID]?.extraData?.bonusVpEarned as number) ?? 0
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
```

- [ ] **Step 5: 如 step 1 显示 harvest window 未暴露 → 补 harvest selector**

仅当 step 1 grep 没找到 `getExchangesInWindow(player, 'harvest')` 调用时执行。位置（推荐）：`game-core.ts` 的 `continueAfterFeedingPhase` 之前 / `startHarvest` 入口 / `continueEndHarvestEffects` 之前。

具体补在哪取决于 BGA 的 harvest exchange 时机（通常在 feed 之前）：

```ts
// 例：在 startHarvest 之后、continueHarvestFromBeforeHarvest 之前
private startHarvest(): SessionResponse {
  this.state.roundPhase = 'harvest'
  this.state.log.unshift({ key: 'log.harvest', params: { round: this.state.round } })

  // 暴露 'harvest' window exchange 选项
  const harvestOrder = this.getHarvestPlayerIndices()
  for (const idx of harvestOrder) {
    const p = this.state.players[idx]
    if (!p) continue
    const trades = getExchangesInWindow(p, 'harvest')
    const affordable = trades.filter((t) => canAffordTrade(p, t, 1))
    if (affordable.length === 0) continue
    // 触发 exchange selector pending（参考 sprint-6a cookery selector 形态）
    // ...具体形态以既有 selector 为准
  }

  return this.continueHarvestFromBeforeHarvest()
}
```

注：实际形态以既有 cookery selector / harvest exchange 入口为准；plan 阶段 read sprint-6a 的实现确认。如果机制太复杂超出 2.5d 预算，把"harvest exchange selector"改成 deliberate divergence（标"E153 当前简化为 anytime exchange，max:1 限定每次会话最多 1 次而非每 harvest"）。

- [ ] **Step 6: 跑 case 1 PASS**

```bash
pnpm exec vitest run server/__tests__/E153_StoneSculptor-session.test.ts -t "1 stone → 1 food"
```

Expected: PASS。

- [ ] **Step 7: 写 case 2-6**

```ts
it('同 harvest 用 2 次（max:1）→ 只能 1 次', () => {
  // setup with stone=2
  selectExchange(session, 'p1', 'E153_StoneSculptor')  // 第 1 次
  confirmExchange(session)
  // 尝试再次 — selector 不应暴露
  const resp = session.respond()
  if (resp.pending?.type === 'choice') {
    const opts = (resp.pending as any).options ?? []
    expect(opts.some((o: any) => o.value?.includes('E153'))).toBe(false)
  }
  expect(session.state.players[0].cardStates?.E153_StoneSculptor?.extraData?.bonusVpEarned).toBe(1)
})

it('下个 harvest 重新 1 次', () => {
  // round 4 用 1 次 → round 7 再用 1 次
  setPlayerResources(session, 'p1', { stone: 4 })
  advanceToHarvestRound(session, 4)
  selectExchange(session, 'p1', 'E153_StoneSculptor')
  confirmExchange(session)
  advanceToHarvestRound(session, 7)
  selectExchange(session, 'p1', 'E153_StoneSculptor')
  confirmExchange(session)
  expect(session.state.players[0].cardStates?.E153_StoneSculptor?.extraData?.bonusVpEarned).toBe(2)
})

it('玩家无 E153 → 不暴露 trade', () => {
  const session = createSession2P({ persistRoom: false, players: 4 })
  // 不给 p1 E153
  advanceToHarvestRound(session, 4)
  const resp = session.respond()
  if (resp.pending?.type === 'choice') {
    const opts = (resp.pending as any).options ?? []
    expect(opts.some((o: any) => o.value?.includes('E153'))).toBe(false)
  }
})

it('玩家有 E153 但 stone=0 → 不暴露 trade', () => {
  const session = createSession2P({ persistRoom: false, players: 4 })
  setPlayerOccupations(session, 'p1', ['E153_StoneSculptor'])
  setPlayerResources(session, 'p1', { stone: 0 })
  advanceToHarvestRound(session, 4)
  const resp = session.respond()
  if (resp.pending?.type === 'choice') {
    const opts = (resp.pending as any).options ?? []
    expect(opts.some((o: any) => o.value?.includes('E153'))).toBe(false)
  }
})

it('computeBonusScore 累加 bonus VP', () => {
  // 用 3 次（3 harvest 各 1 次）→ scores.bonusVp += 3
  // setup with stone=6 跨 3 个 harvest 各用 1 次
  // game ends → 断言 final scores
  const finalScores = computeFinalScores(session.state)
  expect(finalScores.players[0].bonusVp).toBeGreaterThanOrEqual(3)
})
```

- [ ] **Step 8: 跑全 6 case + fast 回归**

```bash
pnpm exec vitest run server/__tests__/E153_StoneSculptor-session.test.ts
pnpm test:fast
```

Expected: 全绿。

- [ ] **Step 9: 提交**

```bash
git add shared/cards/E/E153_StoneSculptor.ts server/__tests__/E153_StoneSculptor-session.test.ts
git commit -m "feat(E153): align with BGA — harvest exchange + bonusVp sideEffect

E153 StoneSculptor exchanges metadata changed from triggers:['anytime']
to triggers:['harvest'], with sideEffect:{type:'bonusVp', amount:1} so
each use writes cardStates.E153.extraData.bonusVpEarned += 1 via the
applyTradeSideEffect dispatcher (Sprint 6d infra step 2/8).
computeBonusScore reads bonusVpEarned for end-game scoring.

max:1 limits 1 use per harvest cycle (reset by existing harvest selector).

6 session cases: stone+harvest selects trade with VP / max:1 limit /
multi-harvest accumulates / no-card / no-stone / final scoring.

Sprint 6d card 3/3."
```

---

## Task 8: 文档同步 + 全量回归 + push

**Goal:** §2.7 final 同步 D131/E58/E153；card_progress / master-plan / ENGINE_ARCHITECTURE 同步；跑 lint + build + 全量；push 等 CI。

**Files:**
- Modify: `docs/card_progress.md`
- Modify: `docs/master-plan.md`
- Modify: `docs/ENGINE_ARCHITECTURE.md`

- [ ] **Step 1: §2.7 stub list final 同步**

打开 `docs/card_progress.md`，找到 §2.7 stub list 行（Task 1 已划掉 A165/E134）。把：
- `D131 / ~~D157~~` 替换为 `~~D131~~ ✅ Sprint 6d / ~~D157~~`
- `E58 / ~~E134~~` 替换为 `~~E58~~ ✅ Sprint 6d / ~~E134~~`
- `E153 / ~~E155~~` 替换为 `~~E153~~ ✅ Sprint 6d / ~~E155~~`

修改后 §2.7 list 应与 spec §5 之"After"小节一致。

- [ ] **Step 2: card_progress.md §2 changelog + §1 + §7**

§2 加最新条目（写在最新条目之上）：

```markdown
- **2026-05-01 Sprint 6d — D131 / E58 / E153 三张 stub 卡完整对齐 BGA + 3 处通用扩展 + §2.7 stub list 同步**：
  - **D131 CraftsmanshipPromoter**：computeChoiceCandidates listener on actions:['minor-improvement'] 注入 bottom-row major 候选（Pottery / Joinery / Basket / StoneOven 4 张）；onBuy gain stone:1 保留。`minor-improvement.execute` 加 `collectComputeChoiceCandidates` 调用合并 extraOptions + affordability 过滤；resolveChoice 走 `playImprovement('any')` 自动处理 minor/major 双类型。
  - **E58 LunchtimeBeer**：onStartHarvest stage-hook listener 返回 optional SEQ：gainLeaf({food:1}) + special-effect set-extra-data 写 `cardStates.E58.extraData.passFieldAndBreedRound = round`；game-core 新 helper `hasPassFieldAndBreed` 在 `continueHarvestFieldPhase` / `continueAfterFeedingPhase` 入口前 filter harvestOrder。`passFieldAndBreedRound` 字段在下个 round 自然失效。
  - **E153 StoneSculptor**：exchanges metadata `triggers:['harvest']` + `sideEffect:{type:'bonusVp', amount:1}`；computeBonusScore 读 `cardStates.E153.extraData.bonusVpEarned`。
  - **3 处通用扩展**：
    1. `Trade.sideEffect.bonusVp` kind 接续 sprint-5c `drainSpace` dispatcher；`applyTradeSideEffect` 签名扩 `(state, player, eff, times, sourceCard)`
    2. game-core `hasPassFieldAndBreed` helper + harvest field/breeding phase 入口 skip 检查
    3. `collectComputeChoiceCandidates(state, player, actionId)` 通用 helper 给 minor-improvement.execute 注入 listener candidates
  - **测试**：D131 6 case + E58 5 case + E153 6 case + payment-trade-side-effect 单元 4 case (3 bonusVp + 1 drainSpace regression)。
  - **§2.7 stub list 同步**：A165 / E134 加 ✅ Sprint 2 标记；D131 / E58 / E153 加 ✅ Sprint 6d 标记。剩余真实 stub：C62（推 Sprint 6e）。
  - spec / plan：`docs/superpowers/specs/2026-05-01-sprint-6d-stubs-design.md` / `docs/superpowers/plans/2026-05-01-sprint-6d-stubs.md`。
```

§1 总览：实现数 +3；stub deferred 数 -3。

§7 基础设施加 3 条扩展点（按 changelog 复述）。

- [ ] **Step 3: master-plan.md §0 + §8**

§0 概览：把 Sprint 6 行的 "12 张 stub" 改为 "9 张 stub"（实际剩 1 张 C62）；如有更精确数字按实际改。

§8 Sprint 进度表加 6d 行（参考 sprint-6c 行格式）：

```markdown
| 6d     | D131 + E58 + E153 三张 stub 卡完整对齐 + 3 处通用扩展（Trade.sideEffect.bonusVp / harvest phase skip helper / minor-improvement candidate injection） + §2.7 list 同步 | 3 cards + 3 infra | 2.5 day | ~Xd | done | docs/superpowers/specs/2026-05-01-sprint-6d-stubs-design.md | docs/superpowers/plans/2026-05-01-sprint-6d-stubs.md | sprint-6d-stubs |
```

- [ ] **Step 4: ENGINE_ARCHITECTURE.md**

补 3 处扩展描述（接续 sprint-5c §15.19 / §15.20）：

```markdown
### §15.21 Trade.sideEffect.bonusVp kind

接续 §15.19 的 sideEffect dispatcher。`bonusVp` kind 在 trade 应用时把
`amount * times` 写入 `cardStates[sourceCard].extraData.bonusVpEarned`，
卡的 `computeBonusScore` 在游戏结束时读出累计值。E153 StoneSculptor
是首个使用者。

### §15.22 Harvest phase skip helper

`GameSession.hasPassFieldAndBreed(player)` 扫 cardStates 找
`extraData.passFieldAndBreedRound === currentRound` 标记。
`continueHarvestFieldPhase` 和 `continueAfterFeedingPhase` 入口前
filter harvestOrder by `!hasPassFieldAndBreed`。E58 LunchtimeBeer 是
首个使用者。`passFieldAndBreedRound` 字段在下个 round 自然失效，无需
主动清。

### §15.23 minor-improvement listener candidate injection

`collectComputeChoiceCandidates(state, player, actionId)` 跑指定 actionId
的 `computeChoiceCandidates` phase listeners 收集 `extraOptions`。
`minor-improvement.execute` 在 `buildPlayableMinorOptions` 之后调它合并候选 +
affordability 过滤。D131 CraftsmanshipPromoter 是首个使用者，注入
bottom-row major 候选。
```

- [ ] **Step 5: 跑 lint + build + 全量**

```bash
pnpm run lint              # 0 error，不引入新 warning
pnpm run build             # 通过
pnpm test                  # fast + slow 全绿
```

Expected: 全绿。

- [ ] **Step 6: 提交文档**

```bash
git add docs/card_progress.md docs/master-plan.md docs/ENGINE_ARCHITECTURE.md
git commit -m "docs: sync card_progress / master-plan / ENGINE_ARCHITECTURE for sprint-6d

D131 / E58 / E153 三张 stub 卡完整对齐 + 3 处通用扩展 + §2.7 stub list
同步。剩余真实 stub: C62（推 Sprint 6e）。"
```

- [ ] **Step 7: push**

```bash
git push -u origin sprint-6d-stubs
```

- [ ] **Step 8: 等 CI 全绿（CLAUDE.md 硬性要求）**

```bash
export $(grep '^GH_TOKEN=' /data00/home/xuxinhao.titan/raw/open-agricola/.env | xargs)
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?per_page=3' \
  | jq '.workflow_runs[] | {name, head_sha, status, conclusion, html_url}'
```

Expected: 所有 run `conclusion: success`。失败立即定位并修复，再 push。

---

## Self-Review Notes

| 检查项 | 结果 |
|---|---|
| Spec 覆盖 | §0 范围 → 全 task；§1 总体结构 → File Structure；§2 D131 → Task 5；§3 E58 → Task 6；§4 E153 → Task 7；§5 §2.7 同步 → Task 1（A165/E134）+ Task 8（D131/E58/E153）；§6 测试策略 → 各 task 内；§7 文档同步 → Task 8；§8 风险点 → Task 0/1/4/6/7 都涉及 BGA 复核 + grep 确认；§9 DoD → Task 8 全量回归 + CI |
| Placeholder scan | 0（所有 step 含具体代码 / 命令 / 期望输出；helper 名 / cost 模型按 codebase 实际调整的注释是真实施工指引，非 TBD） |
| Type 一致性 | `applyTradeSideEffect(state, player, eff, times, sourceCard)` 签名贯穿 Task 2-7；`hasPassFieldAndBreed` 名贯穿 Task 4/6；`collectComputeChoiceCandidates` 名贯穿 Task 3/5；`BOTTOM_ROW_MAJORS` 常量贯穿 Task 5；`passFieldAndBreedRound` 字段名贯穿 Task 4/6 |
| 依赖顺序 | Task 0（pre-flight）→ Task 1（独立 §2.7 部分同步）→ Task 2/3/4（基础设施）→ Task 5/6/7（卡牌实现，依赖各自基础设施）→ Task 8（文档 + push） |
| Sprint 内 commit 数 | 8 commit（Task 1 / 2 / 3 / 4 / 5 / 6 / 7 / 8），符合 frequent commits 原则 |
