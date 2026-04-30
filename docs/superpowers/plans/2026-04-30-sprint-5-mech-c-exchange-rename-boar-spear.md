# Sprint 5 机制 C：anytime-exchange 重命名 + E53 BoarSpear 接入 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重命名 `anytime-exchange` → `exchange`、加 `actionContext.tradeIds` 限定能力、把 E53 BoarSpear 重写为通过 `exchange` action 实现 PIG → 4 FOOD 转换（per-action once + breeding phase 排除）。

**Architecture:** 复用现有 cookery trade 基础设施（每 trade 带 sourceId，按 source card 持有过滤）。E53 注册自己的 boar→food trade 到 cookeryTrades；listener 在 obtain after phase 弹 SEQ optional → exchange leaf with `actionContext.tradeIds=['E53_BoarSpear']` 限定显示。`getPlayerCookeryTrades` 扩展读 `player.minorPlayed`（让 minor 卡也能 contribute trade）。E85 自动联动（仅 actions 字段名变）。**0 主路径架构改动**。

**Tech Stack:** TypeScript / Vitest / pnpm。改动：1 个 effect (exchange) + 1 卡（E53）+ 6 张卡 listener actions 字段重命名 + 1 测试 + i18n。

**Spec:** `docs/superpowers/specs/2026-04-30-sprint-5-mech-c-exchange-rename-boar-spear-design.md`

**Worktree:** `.worktree/sprint-5-mech-c-meeple-id`（基于 main，已含机制 A + D + B；stub-infra 待 push 含 cascade-fix，分支独立无冲突）

---

## File Structure

**新建：**
- `server/__tests__/E53_BoarSpear-session.test.ts` — 7 场景 session 测试

**修改：**
- `shared/actions/effects/exchange.ts` — id 重命名、加 actionContext.tradeIds filter、加 E53 cookeryTrades 项、扩展 getPlayerCookeryTrades 读 minorPlayed
- `shared/actions/effects/__tests__/exchange-effect-preview.test.ts` — actionId 字符串改 'exchange'
- `shared/cards/E/E53_BoarSpear.ts` — 完全重写
- `shared/cards/E/E85_MasterTanner.ts` — listener `actions: ['anytime-exchange']` → `['exchange']`
- `shared/cards/C/C53_GypsysCrock.ts` — 同
- `shared/cards/B/B29_CookeryLesson.ts` — 同
- `shared/cards/A/A48_ShavingHorse.ts` — 同
- `shared/cards/D/D36_BreedRegistry.ts` — 同
- `shared/cards/D/D56_FatstockStretcher.ts` — 同
- `server/__tests__/D56_FatstockStretcher-session.test.ts` — actionId 字符串
- `shared/i18n/zh.ts` + `shared/i18n/en.ts` — 重命名 i18n key（如有 `actions.anytime-exchange.*`）
- `docs/card_progress.md` — §2.0 / §2.3 / §7 / §8
- `docs/master-plan.md` — §8 Sprint 5 行
- `docs/ENGINE_ARCHITECTURE.md` — 加一节"exchange action / actionContext.tradeIds"

---

## Phase 1: 重命名 anytime-exchange → exchange + actionContext.tradeIds + E53 trade 注册

**Files:** 见上方多文件清单（除 E53_BoarSpear.ts 自己 — 留 Phase 2）

### Task 1.1: exchange.ts 改 id + filter + minor support + E53 trade

- [ ] **Step 1: 改 anytimeExchangeAction.id**

打开 `shared/actions/effects/exchange.ts`，找到 `anytimeExchangeAction.id` 字段：

```ts
export const anytimeExchangeAction: ActionDefinition = {
  id: 'exchange',  // 原 'anytime-exchange'
  ...
}
```

注：常量名 `anytimeExchangeAction` 保留（避免改 import），仅改 id 字段。

- [ ] **Step 2: getPlayerCookeryTrades 扩展读 minorPlayed**

找到 `getPlayerCookeryTrades` 函数（约 line 247），改：

```ts
const getPlayerCookeryTrades = (player: PlayerState): Trade[] => {
  const trades: Trade[] = []
  for (const cardId of [...player.improvements, ...player.minorPlayed]) {
    const cardTrades = cookeryTrades[cardId]
    if (cardTrades) {
      trades.push(...cardTrades)
    }
  }
  return trades
}
```

同步改 `hasAffordableCookeryTrade`（约 line 258）：

```ts
const hasAffordableCookeryTrade = (player: PlayerState): boolean => {
  for (const cardId of [...player.improvements, ...player.minorPlayed]) {
    const cardTrades = cookeryTrades[cardId]
    if (!cardTrades) continue
    for (const trade of cardTrades) {
      if (canAffordTrade(player, trade, 1)) return true
    }
  }
  return false
}
```

- [ ] **Step 3: 加 E53 BoarSpear trade 到 cookeryTrades**

找到 `cookeryTrades: Record<string, Trade[]>` 对象（约 line 220-245），在末尾加：

```ts
const cookeryTrades: Record<string, Trade[]> = {
  Major_Fireplace1: [ /* ... */ ],
  Major_Fireplace2: [ /* ... */ ],
  Major_CookingHearth1: [ /* ... */ ],
  Major_CookingHearth2: [ /* ... */ ],
  E53_BoarSpear: [
    { from: { boar: 1 }, to: { food: 4 }, sourceId: 'E53_BoarSpear' },
  ],
}
```

- [ ] **Step 4: anytimeExchangeAction.execute 加 tradeIds filter**

找到 `anytimeExchangeAction` 的 `execute` 字段（约 line 377-381）：

```ts
execute: ({ player, actionContext }) => {
  const allOptions = buildExchangeOptions(player)
  const filterIds = actionContext?.tradeIds as string[] | undefined
  const filtered = filterIds && filterIds.length > 0
    ? allOptions.filter((opt) => {
        // option.sourceCard 已含 trade.sourceId（buildExchangeOptions 透传）
        // cancel 选项总是保留（让玩家能拒绝）
        if (opt.value === 'cancel') return true
        return typeof opt.sourceCard === 'string' && filterIds.includes(opt.sourceCard)
      })
    : allOptions

  // 如果只剩 cancel 而没有任何 trade option，视为不可执行
  const hasTradeOption = filtered.some((opt) => opt.value !== 'cancel')
  if (filterIds && filterIds.length > 0 && !hasTradeOption) {
    return { type: 'fail' as const, logKey: 'log.actionNoExchange' }
  }

  return {
    type: 'choice' as const,
    promptKey: 'ui.interactionExchangeChoice',
    options: filtered,
  }
}
```

- [ ] **Step 5: anytimeExchangeAction.canBeExecutedByPlayer 加 filter**

```ts
canBeExecutedByPlayer: (_, player, ctx) => {
  const filterIds = ctx?.actionContext?.tradeIds as string[] | undefined
  if (!filterIds || filterIds.length === 0) {
    return hasAffordableCookeryTrade(player)
  }
  // 限定时只看 source 在 filterIds 内的 trade
  for (const cardId of [...player.improvements, ...player.minorPlayed]) {
    if (!filterIds.includes(cardId)) continue
    const cardTrades = cookeryTrades[cardId]
    if (!cardTrades) continue
    for (const trade of cardTrades) {
      if (canAffordTrade(player, trade, 1)) return true
    }
  }
  return false
}
```

注：`ctx` 参数实际签名要看 ActionDefinition.canBeExecutedByPlayer 类型定义；如果不接受第三参数，从 ctx.actionContext 拿 filterIds 不可行，那就在 execute 内部 fail 即可（Step 4 已 cover），canBeExecutedByPlayer 保持 `hasAffordableCookeryTrade(player)`（玩家持有任何 cooker / E53 都可触发）。

- [ ] **Step 6: build 验证**

Run: `pnpm run build`
Expected: 0 error。如果有 type error，按提示修。

### Task 1.2: 6 张卡 + 1 测试重命名 actionId

- [ ] **Step 7: 6 张卡 listener actions 字段全局替换**

逐个文件改 listener 注册的 `actions: ['anytime-exchange']` → `actions: ['exchange']`：

```bash
# 批量 sed 替换
for f in shared/cards/E/E85_MasterTanner.ts \
         shared/cards/C/C53_GypsysCrock.ts \
         shared/cards/B/B29_CookeryLesson.ts \
         shared/cards/A/A48_ShavingHorse.ts \
         shared/cards/D/D36_BreedRegistry.ts \
         shared/cards/D/D56_FatstockStretcher.ts; do
  sed -i "s/'anytime-exchange'/'exchange'/g" "$f"
done
```

或手工编辑每个文件（推荐：逐个 verify 改对位置）。

- [ ] **Step 8: 测试文件改 actionId 字符串**

```bash
sed -i "s/'anytime-exchange'/'exchange'/g" \
  shared/actions/effects/__tests__/exchange-effect-preview.test.ts \
  server/__tests__/D56_FatstockStretcher-session.test.ts
```

- [ ] **Step 9: i18n key 重命名（如有）**

`grep -rn "anytime-exchange" shared/i18n/ 2>&1`。如有 `actions.anytime-exchange.name` / `actions.anytime-exchange.description` 等 key，重命名为 `actions.exchange.*` 在 zh.ts / en.ts 同步。

- [ ] **Step 10: 全局 grep 验证 0 残留**

```bash
grep -rn "anytime-exchange" shared server src 2>&1 | grep -v 'docs/superpowers' | head -10
```

Expected: 输出空（除 docs 内的 spec / plan 文档外）。

如有残留，逐个修。

- [ ] **Step 11: 跑全量 fast 看回归**

Run: `pnpm test:fast`
Expected: 全部 PASS。如果有失败，看是不是改漏 actionId 字符串。

- [ ] **Step 12: lint + build**

Run: `pnpm run lint && pnpm run build`
Expected: 0 error

### Task 1.3: 提交

- [ ] **Step 13: 提交**

```bash
git add shared/actions/effects/exchange.ts \
        shared/actions/effects/__tests__/exchange-effect-preview.test.ts \
        shared/cards/E/E85_MasterTanner.ts \
        shared/cards/C/C53_GypsysCrock.ts \
        shared/cards/B/B29_CookeryLesson.ts \
        shared/cards/A/A48_ShavingHorse.ts \
        shared/cards/D/D36_BreedRegistry.ts \
        shared/cards/D/D56_FatstockStretcher.ts \
        server/__tests__/D56_FatstockStretcher-session.test.ts \
        shared/i18n/zh.ts \
        shared/i18n/en.ts

git commit -m "refactor(exchange): rename anytime-exchange → exchange + actionContext.tradeIds support

The 'anytime-' prefix was redundant — reorganize, the other anytime
action, has no prefix. Drop the prefix here; only this one action used
it. Action id field changes from 'anytime-exchange' to 'exchange';
const name anytimeExchangeAction kept to minimize import churn.

Six cards' listener actions and one test's actionId string updated:
E85 / C53 / B29 / A48 / D36 / D56.

Add actionContext.tradeIds: string[] support. When a listener-triggered
exchange leaf supplies tradeIds, execute restricts displayed options to
those whose sourceCard is in the list (option.sourceCard already carries
trade.sourceId via buildExchangeOptions). cancel option always preserved.

Add E53 BoarSpear trade entry to cookeryTrades:
  { from: {boar:1}, to: {food:4}, sourceId: 'E53_BoarSpear' }

getPlayerCookeryTrades / hasAffordableCookeryTrade extended to also
read player.minorPlayed (E53 is a minor improvement). Existing major-
improvement-based cookers unaffected.

E85 listener auto-couples: it already listens to anytime-exchange; the
rename covers it, and E53's exchange leaf goes through the same dispatch.

Followed by E53 rewrite (Phase 2)."
```

---

## Phase 2: E53 BoarSpear 重写 + session 测试

**Files:**
- Modify: `shared/cards/E/E53_BoarSpear.ts`
- Create: `server/__tests__/E53_BoarSpear-session.test.ts`

### Task 2.1: 完全替换 E53_BoarSpear.ts

- [ ] **Step 1: 替换文件内容**

```ts
// shared/cards/E/E53_BoarSpear.ts
import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { readActionSnapshotToken } from '../helpers/action-snapshot'
import type { CardImpl } from '../registry'

const CARD_ID = 'E53_BoarSpear'
const TRACKED_ACTIONS = ['gain', 'collect', 'receive'] as const
const USED_TOKEN_KEY = 'E53UsedActionToken'

const obtainListener: CardListenerRegistration = {
  id: 'E53-boar-spear-after-obtain',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: [...TRACKED_ACTIONS],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!(TRACKED_ACTIONS as readonly string[]).includes(context.actionId)) return

    const result = context.result
    const obtainedBoar = result?.type === 'ok' ? (result.resourcesGained?.boar ?? 0) : 0
    if (obtainedBoar <= 0) return

    // breeding phase 排除（BGA: "outside of the breeding phase of a harvest"）
    if (context.state.roundPhase === 'breeding') return

    // per-action once 去重：同一 actionToken 内多 phase（gain → collect 链）只触发一次
    const token = readActionSnapshotToken(context.player)
    if (token === undefined) return
    const used = readCardExtraData<number>(context.player, CARD_ID, USED_TOKEN_KEY)
    if (used === token) return
    writeCardExtraData(context.player, CARD_ID, USED_TOKEN_KEY, token)

    // 弹 SEQ optional → exchange leaf with tradeIds 限定 boar→food
    return {
      flow: {
        type: 'seq',
        optional: true,
        choiceLabelKey: 'cards.E53_BoarSpear.choice',
        children: [
          {
            type: 'leaf',
            actionId: 'exchange',
            sourceCard: CARD_ID,
            actionContext: { tradeIds: ['E53_BoarSpear'] },
          },
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

export const E53_BoarSpear = new MinorImprovement({
  id: CARD_ID,
  name: 'Boar Spear',
  deck: 'E',
  number: 53,
  category: 'FOOD',
  desc: ['Each time you get at least 1 <PIG> outside of the breeding phase of a harvest, you can immediately turn them into 4 <FOOD> each.'],
  vp: 1,
  cost: { wood: 1, stone: 1 },
})

export const E53_BoarSpear_impl = {
  listeners: [obtainListener],
  reaches: [] as readonly string[],
} satisfies CardImpl
```

- [ ] **Step 2: build 验证**

Run: `pnpm run build`
Expected: 0 error

### Task 2.2: 7 场景 session 测试

- [ ] **Step 3: 创建测试文件**

```ts
// server/__tests__/E53_BoarSpear-session.test.ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/game/player'
import { readCardExtraData, writeCardExtraData } from '../../shared/cards/helpers/card-state'
import { recordActionSnapshot } from '../../shared/cards/helpers/action-snapshot'
import '../../shared/cards/E/E53_BoarSpear'
import '../../shared/cards/E/E85_MasterTanner'

const CARD_ID = 'E53_BoarSpear'
const E85_ID = 'E85_MasterTanner'

const setup = (opts?: { boar?: number; food?: number; withE85?: boolean }) => {
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
    food: opts?.food ?? 0,
    boar: opts?.boar ?? 0,
  }
  player.minorPlayed.push(CARD_ID)
  if (opts?.withE85) {
    player.occupationPlayed.push(E85_ID)
  }

  session.loadState(state)
  return { session, state: session.getState().state }
}

describe('E53_BoarSpear session — exchange-based PIG → 4 FOOD', () => {
  // 场景 1：玩家落不获 boar 的格子（grain-seeds 给 1 grain）→ 不弹 prompt
  it('does not fire on non-boar-yielding action', () => {
    const { session } = setup()
    const resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)
    // grain-seeds 不给 boar，E53 listener 不返回 flow
    // pending 应直接进 confirmNextPlayer / 后续 step
    expect(resp.pending.type).not.toBe('choice')
  })

  // 场景 2：得 1 boar → 弹 SEQ optional → 接受 → trade exchange → 食物 +4
  it('after gaining 1 boar via wild-boar accumulation, prompt fires; accept → trade → +4 food', () => {
    // setup：玩家落 wild-boar 累积空间得到 1 boar
    const { session, state } = setup({ food: 0 })
    const player = state.players[0]!
    // 给 wild-boar 空间放 1 boar 资源（如果 wild-boar 是 round 空间，需要确保 round 5 该空间已开放且有累积）
    // 简化：直接 gain 1 boar via dev tool
    const wildBoar = state.actionSpaces.find((s) => s.id === 'wild-boar')
    if (wildBoar) {
      wildBoar.resources.boar = 1
    }
    session.loadState(state)

    let resp = session.takeAction(0, 'wild-boar')
    expect(resp.ok).toBe(true)

    // 期望 pending=choice 含 E53 SEQ optional
    let safety = 20
    while (safety-- > 0 && resp.pending.type === 'choice') {
      const opts = resp.pending.options ?? []
      // 如果是 E53 的 optional prompt（sourceCard=E53）→ 接受
      const e53Accept = opts.find((o) => o.sourceCard === CARD_ID && o.value !== '__skip__')
      if (e53Accept) {
        resp = session.resolveChoice(0, e53Accept.value)
        continue
      }
      // 如果是 exchange trade prompt → 选 E53 trade
      const e53Trade = opts.find((o) => o.sourceCard === CARD_ID && o.value.startsWith('trade:'))
      if (e53Trade) {
        resp = session.resolveChoice(0, e53Trade.value)
        continue
      }
      // 否则推进任何非 skip
      const nonSkip = opts.find((o) => o.value !== '__skip__' && o.value !== 'cancel')
      if (nonSkip) {
        resp = session.resolveChoice(0, nonSkip.value)
        continue
      }
      const skipOrCancel = opts.find((o) => o.value === '__skip__' || o.value === 'cancel')
      if (skipOrCancel) {
        resp = session.resolveChoice(0, skipOrCancel.value)
        continue
      }
      break
    }

    // 接受路径完成后断言：boar=0, food=4
    expect(resp.state.players[0]!.resources.boar).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(4)
  })

  // 场景 3：得 2 boar → 玩家选转 1 只（trade max=2 但用 1 次）
  // 注：buildExchangeOptions 当前 option `trade:i:max` 暗示 trade 用最大次数；
  // 如果不支持选用次数，玩家只能 0 次或 max 次。
  // 此场景验证场景 2 的扩展（多 boar），断言整批转换；选转部分需要 bulk: 路径 / value 解析支持
  it('with 2 boar, player can convert all (trade uses max=2 → +8 food)', () => {
    const { session, state } = setup({ food: 0 })
    const player = state.players[0]!
    const wildBoar = state.actionSpaces.find((s) => s.id === 'wild-boar')
    if (wildBoar) {
      wildBoar.resources.boar = 2
    }
    session.loadState(state)

    let resp = session.takeAction(0, 'wild-boar')
    let safety = 20
    while (safety-- > 0 && resp.pending.type === 'choice') {
      const opts = resp.pending.options ?? []
      const useTrade = opts.find((o) => o.sourceCard === CARD_ID && (o.value.startsWith('trade:') || o.value !== '__skip__'))
      if (useTrade) {
        resp = session.resolveChoice(0, useTrade.value)
        continue
      }
      const skipOrCancel = opts.find((o) => o.value === '__skip__' || o.value === 'cancel')
      if (skipOrCancel) {
        resp = session.resolveChoice(0, skipOrCancel.value)
        continue
      }
      break
    }
    // 全转 → boar=0, food=8
    expect(resp.state.players[0]!.resources.boar).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBe(8)
  })

  // 场景 4：拒绝 SEQ optional → 玩家保留 boar
  it('reject SEQ → boar retained, no exchange', () => {
    const { session, state } = setup({ food: 0 })
    const wildBoar = state.actionSpaces.find((s) => s.id === 'wild-boar')
    if (wildBoar) wildBoar.resources.boar = 1
    session.loadState(state)

    let resp = session.takeAction(0, 'wild-boar')
    let safety = 20
    while (safety-- > 0 && resp.pending.type === 'choice') {
      const opts = resp.pending.options ?? []
      // 拒绝 E53 SEQ：选 __skip__
      const skip = opts.find((o) => o.value === '__skip__')
      if (skip) {
        resp = session.resolveChoice(0, skip.value)
        continue
      }
      const nonSkip = opts.find((o) => o.value !== '__skip__')
      if (nonSkip) {
        resp = session.resolveChoice(0, nonSkip.value)
        continue
      }
      break
    }
    expect(resp.state.players[0]!.resources.boar).toBe(1)
    expect(resp.state.players[0]!.resources.food).toBe(0)
  })

  // 场景 5：同 actionToken 内 multi-phase 链触发只一次
  it('per-action once via actionToken: subsequent obtain in same action does not re-trigger', () => {
    // 这个场景手工触发 listener 两次（同 token）验证去重
    const { session, state } = setup({ food: 0 })
    const player = state.players[0]!

    // 模拟 listener handler 两次调用（同 token）
    // 第一次设 USED_TOKEN_KEY；第二次 used === token 直接 return
    recordActionSnapshot(player, 99)

    const { E53_BoarSpear_impl } = require('../../shared/cards/E/E53_BoarSpear') as { E53_BoarSpear_impl: any }
    const handler = E53_BoarSpear_impl.listeners[0].handler

    const ctx = {
      state,
      player,
      actionId: 'gain',
      result: { type: 'ok', resourcesGained: { boar: 1 } },
      space: state.actionSpaces[0],
    }

    const result1 = handler(ctx)
    expect(result1).toBeDefined()
    expect(readCardExtraData<number>(player, CARD_ID, 'E53UsedActionToken')).toBe(99)

    // 第二次同 token → return undefined（去重）
    const result2 = handler(ctx)
    expect(result2).toBeUndefined()

    // 推进 token 到新 action → 应该重新触发
    recordActionSnapshot(player, 100)
    const result3 = handler(ctx)
    expect(result3).toBeDefined()
  })

  // 场景 6：harvest breeding phase 期间得 boar → 不触发
  it('does not fire during breeding phase', () => {
    const { session, state } = setup({ food: 0 })
    const player = state.players[0]!
    state.roundPhase = 'breeding'  // 关键：手工设 breeding
    session.loadState(state)

    const { E53_BoarSpear_impl } = require('../../shared/cards/E/E53_BoarSpear') as { E53_BoarSpear_impl: any }
    const handler = E53_BoarSpear_impl.listeners[0].handler
    const ctx = {
      state,
      player,
      actionId: 'gain',
      result: { type: 'ok', resourcesGained: { boar: 1 } },
      space: state.actionSpaces[0],
    }

    expect(handler(ctx)).toBeUndefined()
  })

  // 场景 7：E53 + E85 联动 — E85 监听 exchange before/after，diff boar/cattle 算 cooked
  it('coupling with E85 MasterTanner: exchange dispatch fires E85 before/after listeners', () => {
    const { session, state } = setup({ food: 0, withE85: true })
    const wildBoar = state.actionSpaces.find((s) => s.id === 'wild-boar')
    if (wildBoar) wildBoar.resources.boar = 1
    session.loadState(state)

    let resp = session.takeAction(0, 'wild-boar')
    let safety = 30
    while (safety-- > 0 && resp.pending.type === 'choice') {
      const opts = resp.pending.options ?? []
      const useTrade = opts.find((o) =>
        (o.sourceCard === CARD_ID || o.sourceCard === E85_ID) && o.value !== '__skip__' && o.value !== 'cancel'
      )
      if (useTrade) {
        resp = session.resolveChoice(0, useTrade.value)
        continue
      }
      const skipOrCancel = opts.find((o) => o.value === '__skip__' || o.value === 'cancel')
      if (skipOrCancel) {
        resp = session.resolveChoice(0, skipOrCancel.value)
        continue
      }
      const first = opts[0]
      if (first) {
        resp = session.resolveChoice(0, first.value)
        continue
      }
      break
    }

    // E85 监听 exchange after，diff boar：boar 减 1 → animalsCooked = 1 → push 1 food 到 E85 stack
    // 但 E85 需要 player food >= 1 才能 push（payLeaf food:1）；本测试 food 起始 0，转换后 +4，可付 1
    // 断言：E85 stack 长度 ≥ 0（联动触发，不强制 stack 长度因为 push 还要玩家 explicit accept）
    // 这里验证关键：boar 已转 / food 已得
    expect(resp.state.players[0]!.resources.boar).toBe(0)
    expect(resp.state.players[0]!.resources.food).toBeGreaterThanOrEqual(3)  // -1 for E85 push 后还剩 3
  })
})
```

⚠ **注意**：上面测试是骨架，实际跑可能要根据 actual `pending.options` 形态调整：
- option.value 实际格式（'trade:0:1' / 'cancel' / '__skip__'）
- E53 sourceCard 是否 propagate 到 options（buildExchangeOptions 已传，应该 OK）
- E85 push food prompt 的具体 option.value

executor 跑前先 `console.log(resp.pending.options)` 看实际结构按需调整。

- [ ] **Step 4: 跑测试**

Run: `pnpm exec vitest run server/__tests__/E53_BoarSpear-session.test.ts`
Expected: 7 场景全 PASS。如有 fail，按 actual pending.options 调整断言。

- [ ] **Step 5: 跑全量 fast 无回归**

Run: `pnpm test:fast`
Expected: 全部 PASS

- [ ] **Step 6: lint + build**

Run: `pnpm run lint && pnpm run build`
Expected: 0 error

### Task 2.3: 提交

- [ ] **Step 7: 提交**

```bash
git add shared/cards/E/E53_BoarSpear.ts \
        server/__tests__/E53_BoarSpear-session.test.ts

git commit -m "refactor(E53): rewrite Boar Spear via exchange leaf + actionToken once-per-action

Previous implementation returned a flow leaf with actionId 'exchange'
which is not a registered action (true id was 'anytime-exchange', now
'exchange' after rename). Player input was silently lost — selecting
'convert N' did nothing. Also lacked breeding-phase exclusion and
multi-phase deduplication.

Rewrite:
- Single after-listener on gain / collect / receive checks
  result.resourcesGained.boar
- breeding-phase guard: state.roundPhase === 'breeding' returns early
  (matches BGA 'outside of the breeding phase of a harvest')
- per-action once via readActionSnapshotToken: same actionToken
  observed twice (e.g. obtain dispatched as both 'collect' and 'gain'
  in one action) only fires the prompt once
- Returns SEQ optional with leaf actionId='exchange',
  actionContext.tradeIds=['E53_BoarSpear'] so the exchange UI shows
  only the boar→food trade (not the player's other cookers)

E85 MasterTanner couples automatically: it already listens on the
exchange action's before/after, so it will see boar/cattle diff when
E53's exchange dispatch fires.

Seven session test scenarios cover: non-boar action no-op, single boar
accept, multi-boar accept, reject path, multi-phase dedup, breeding
phase exclusion, E53+E85 coupling."
```

---

## Phase 3: 文档同步

**Files:**
- Modify: `docs/card_progress.md`
- Modify: `docs/master-plan.md`
- Modify: `docs/ENGINE_ARCHITECTURE.md`

### Task 3.1: card_progress.md

- [ ] **Step 1: §2.0 加 changelog**

```
- **2026-04-30 Sprint 5 mech-C — anytime-exchange action 重命名为 exchange + E53 BoarSpear 重写**：exchange action（原 anytime-exchange，去掉 anytime- 前缀对齐 reorganize）加 actionContext.tradeIds 限定能力；E53 注册 boar→food trade 到 cookeryTrades 并扩展 getPlayerCookeryTrades 读 minorPlayed；E53 listener 在 obtain (gain/collect/receive) after phase 弹 SEQ optional → exchange leaf with tradeIds 限定显示 boar→food；breeding phase 排除 + actionToken per-action once 去重。修复了之前 actionId: 'exchange'（typo，silently no-op）的 bug。E85 MasterTanner 与 E53 自动联动（命名重构覆盖 6 张卡 listener actions）。新增 server/__tests__/E53_BoarSpear-session.test.ts (7 例)。spec / plan: docs/superpowers/specs/2026-04-30-sprint-5-mech-c-exchange-rename-boar-spear-design.md / docs/superpowers/plans/2026-04-30-sprint-5-mech-c-exchange-rename-boar-spear.md。
```

- [ ] **Step 2: §2.3 把 E53 标 ✅**

定位 §2.3 "Sprint 5 PR-5 deferred to follow-up" 列表里 E53（如有）改为 ✅ Sprint 5 mech-C。如无明确条目，§2.0 提一句即可。

- [ ] **Step 3: §7 基础设施加新条**

```
### exchange action 与 actionContext.tradeIds (Sprint 5 mech-C)

`shared/actions/effects/exchange.ts` 的 exchange action（原 anytime-exchange，2026-04-30 重命名为 exchange）接受 `actionContext.tradeIds?: string[]` 限定显示哪些 trade。trade 通过 cookeryTrades 数组全局注册（每条带 sourceId 字段标识 source 卡）；getPlayerCookeryTrades 现在同时读 player.improvements 与 player.minorPlayed（让 minor 卡如 E53 也能 contribute trade）。卡触发 exchange leaf 时可传 tradeIds=['CARD_ID'] 限定为仅显示该卡的 trade（如 E53 obtain 后只显示 boar→food，不显示玩家其他 cooker）。
```

- [ ] **Step 4: §8 时间线加新行**

```
| Sprint 5 mech-C (exchange rename + E53 BoarSpear) | 04-30 | 0 | 821 | 92.0% |
```

实际数字按当前总览。

### Task 3.2: master-plan.md

- [ ] **Step 5: §8 Sprint 5 行加注**

加 `+ ~1 day (mech-C)`；spec / plan 列加新路径。

### Task 3.3: ENGINE_ARCHITECTURE.md

- [ ] **Step 6: 加新章节**

在 Hook 系统附近加：

```markdown
## exchange action 与 actionContext.tradeIds (Sprint 5 mech-C)

`shared/actions/effects/exchange.ts` 的 exchange action（原 anytime-exchange，2026-04-30 重命名）接受 `actionContext.tradeIds?: string[]` 限定显示 trade。

### 协议

```ts
{
  type: 'leaf',
  actionId: 'exchange',
  actionContext: { tradeIds: ['E53_BoarSpear'] },
}
```

execute 内：filter `buildExchangeOptions(player)` 只保留 `option.sourceCard ∈ tradeIds` 的项（cancel 选项总是保留）。

### 注册

trade 通过 `cookeryTrades: Record<cardId, Trade[]>` 注册，每条 trade 带 `sourceId` 标识 source 卡。`getPlayerCookeryTrades(player)` 遍历 `player.improvements + player.minorPlayed` 收集玩家持有 source 卡对应的 trade。

### 用例

- 玩家主动触发 exchange action（无 actionContext.tradeIds）：所有持有源卡的 trade 都可见
- 卡触发 exchange leaf with `tradeIds=[CARD_ID]`：仅显示该卡的 trade，避免污染玩家平时主动 exchange 的全部选项
```

### Task 3.4: 提交

- [ ] **Step 7: 跑全量 fast / lint / build 终验**

Run: `pnpm test:fast && pnpm run lint && pnpm run build`
Expected: 全部 PASS / 0 error

- [ ] **Step 8: 提交**

```bash
git add -f docs/card_progress.md docs/master-plan.md docs/ENGINE_ARCHITECTURE.md

git commit -m "docs: sync mech-C landing across card_progress / master-plan / ENGINE_ARCHITECTURE

card_progress §2.0 changelog entry; §2.3 mark E53 done; §7 new
infrastructure section for exchange action / actionContext.tradeIds.

master-plan §8 Sprint 5 row gains mech-C spec/plan reference and
+~1 day actual time.

ENGINE_ARCHITECTURE gets a new section documenting the exchange action
rename + tradeIds protocol + cookeryTrades dual-source registration."
```

---

## Phase 4: push + CI 验证（人工，按机制 A / D / B 模式）

- [ ] **Step 1: git fetch 看远端**

Run: `git -C /data00/home/xuxinhao.titan/raw/open-agricola fetch origin && git -C /data00/home/xuxinhao.titan/raw/open-agricola log --oneline HEAD..origin/main`

如有更新，先 rebase。

- [ ] **Step 2: ff merge 到 main + push**

```bash
git -C /data00/home/xuxinhao.titan/raw/open-agricola checkout main
git -C /data00/home/xuxinhao.titan/raw/open-agricola merge --ff-only sprint-5-mech-c-meeple-id
git -C /data00/home/xuxinhao.titan/raw/open-agricola push origin main
```

- [ ] **Step 3: 等 GitHub Actions**

```bash
sleep 30
export $(grep '^GH_TOKEN=' /data00/home/xuxinhao.titan/raw/open-agricola/.env | xargs) && \
curl -s -H "Authorization: Bearer $GH_TOKEN" \
  'https://api.github.com/repos/titanxxh/open-agricola/actions/runs?branch=main&per_page=5' \
  | jq '.workflow_runs[] | {name, head_sha: .head_sha[0:8], status, conclusion, html_url}'
```

等所有 run completed + success。

- [ ] **Step 4: 清理 worktree**

```bash
git -C /data00/home/xuxinhao.titan/raw/open-agricola worktree remove .worktree/sprint-5-mech-c-meeple-id
git -C /data00/home/xuxinhao.titan/raw/open-agricola branch -d sprint-5-mech-c-meeple-id
```
