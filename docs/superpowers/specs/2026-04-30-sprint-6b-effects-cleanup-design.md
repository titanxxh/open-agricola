# Sprint 6b — effects/ 反模式清理 + 6a follow-up 设计

> 日期：2026-04-30
> Sprint：6b（effects/ 重构 + 6a 收尾）
> Worktree：`.worktree/sprint-6b-effects-cleanup`
> 基于 main：`8c74cfac`（含 6a 落地 + D157 类型修复 + catalog hot-fix）
> 目标：effects/ 从 63 → ~26-30 文件（对齐 BGA 22）；6a 留尾两项收尾
> 工时估算：~6.5-8 day

## 1. 范围与目标

Sprint 6a 完成后 effects/ 残留多个反模式：硬编码单卡专用 effect、card-state 操作冗余 leaf、helper 文件混在 effects/、6a 务实保留的兼容字段。Sprint 6b 一次性清理。

### 4 个 batch + 6a follow-up

**Batch A — dead code + helper 移位**（~1-1.5d，低风险纯结构）
- 删除 7 个候选 dead code（plan 阶段 grep verify，预期最终 1-3 个真 dead）
- 移 ~10 个 helper 文件到新建 `shared/actions/helpers/`：pay-helpers / cost-preview / room-payment / placement-availability / placement-constants / selection / selection-effect-registry / feed-family（如不是 ActionDefinition）

**Batch B — 卡内 ad-hoc ActionDefinition 注册**（~1.5-2d，新基础设施）
- 新增 `registerAdHocAction(def)` helper（参考 `registerAdHocMinorImprovement` / `registerPlayerActionSpace` 模式）
- id 强制 `card_` 前缀
- 整合到 action lookup fallback
- 8-10 张单卡专用 effect 内联到卡文件（grain-thief-protect / discard-from-hand / mark-card-observed / scythe-harvest-field / build-farmhand-room / first-player 等）
- 共用文件（move-farmer-to-space / swap-field-crop / store-on-card / take-from-card）plan 阶段决定移 helpers/ 还是拆 ad-hoc

**Batch C — special-effect 替换 5 个 leaf（51 张卡 caller）**（~2-2.5d）
- `flag-card`（39 卡）→ `special-effect kind:'set-flag'` flag:true
- `unflag-card`（8 卡）→ `special-effect kind:'set-flag'` flag:false
- `set-card-infobox`（~2 卡）→ `kind:'set-infobox'` text:...
- `clear-card-infobox`（~1 卡）→ `kind:'set-infobox'` text:''
- `write-card-extra-data`（~1 卡）→ `kind:'set-extra-data'`
- 删除 5 个 effects/ 文件 + i18n keys + internal-actions 注册清理

**Batch D — 4 张 mutation 卡 cleanup**（~1.2d，含 targetPlayerId 扩展）
- E149 MidnightFencer：resolveChoice 累加 owedFences 改 special-effect leaf
- E38 RodCollection：listener after-collect handler 累加 woodCount 改 special-effect leaf
- D134 OysterEater：listener handler 累加 skipNextPlacement 改 SEQ + special-effect with `targetPlayerId: owner.id`
- C104 Collector：PlayerActionCard execute 内 mutation 重构（execute 不立即 mutate；resolveChoice 内 SEQ + special-effect for used count + gain for begging/resources）
- **special-effect targetPlayerId 接口扩展**：`actionContext.targetPlayerId` 决定 mutation target（默认 actor，传入则 owner / 任意 player）

**6a follow-up①：trigger 单数 → triggers 数组统一**（~1h）
- 18 张已用 `trigger: 'harvest'/'anytime'` 单数的卡迁移到 `triggers: [...]`
- 删 `CardExchange.trigger` 字段（仅留 `triggers`）
- 删 `exchangeTriggers` 兼容 helper

**6a follow-up②：E53 triggers `[]` 对齐 BGA**（~30min）
- E53 metadata 改 `triggers: []`（仅 listener 触发，玩家不可主动）
- E53 listener 走 `getExchangesByTradeIds(player, ['E53_BoarSpear'])` 强制 include
- 现有 anytime exchange 测试翻转

### 不在范围

- A165 / B155 / C62 / D94 / E155 单卡新机制（推 Sprint 6c / 7）
- batch B 的「真共用 helper」如果 plan 阶段发现 store-on/take-from 实际多卡使用，移 helpers/ 而非 ad-hoc 注册

## 2. Batch A — dead code + helper 移位

### 2.1 Dead code 删除

agent 标 7 个候选：`push-card-stack / release-worker-from-card / write-card-extra-data / hold-worker-on-card / future-meeples / reorganize / animals`

**plan 阶段 grep verify** 每个真无 caller。预期：
- `future-meeples.ts` — **NOT dead**（E108/E119/E43/E45/E139 + 6a 都用 `queueFutureMeeples` import-by-symbol，agent 把 actionId vs import 混淆）
- `write-card-extra-data.ts` — 已被 6a special-effect 替代，可删（待 batch C 改完所有 caller 后）
- `hold-worker-on-card.ts` — C22 BasketChair 派生卡可能用，verify
- 其余每个独立 grep

**操作**：每个候选 grep verify → 真 dead 才删；预期最终 1-3 个真删。

### 2.2 Helper 移位（~10 个）

目标目录：新建 `shared/actions/helpers/`

```
shared/actions/effects/pay-helpers.ts            → shared/actions/helpers/pay-helpers.ts
shared/actions/effects/cost-preview.ts           → shared/actions/helpers/cost-preview.ts
shared/actions/effects/room-payment.ts           → shared/actions/helpers/room-payment.ts
shared/actions/effects/placement-availability.ts → shared/actions/helpers/placement-availability.ts
shared/actions/effects/placement-constants.ts    → shared/actions/helpers/placement-constants.ts
shared/actions/effects/selection.ts              → shared/actions/helpers/selection.ts
shared/actions/effects/selection-effect-registry.ts → shared/actions/helpers/selection-effect-registry.ts
shared/actions/effects/feed-family.ts (如果非 ActionDefinition) → shared/actions/helpers/feed-family.ts
```

**操作**：每文件移 + 全 caller `import` 路径改：`from '.../effects/X'` → `from '.../helpers/X'`。TS 编译验证。

### A 工时

| 项 | 工时 |
|---|---|
| Dead code grep verify + 真删 | ~30 min |
| helper 移位 + import path 改 + 测试回归 | ~1d |
| **A 合计** | **~1-1.5d** |

## 3. Batch B — 卡内 ad-hoc ActionDefinition 注册

### 3.1 新基础设施

```ts
// shared/actions/effects/registry.ts （新文件）
import type { ActionDefinition } from '../../game/types'

const adHocActions = new Map<string, ActionDefinition>()

export const registerAdHocAction = (def: ActionDefinition): void => {
  if (!def.id.startsWith('card_')) {
    throw new Error(`Ad-hoc action id must start with 'card_': ${def.id}`)
  }
  if (adHocActions.has(def.id)) {
    throw new Error(`Ad-hoc action already registered: ${def.id}`)
  }
  adHocActions.set(def.id, def)
}

export const getAdHocAction = (id: string): ActionDefinition | undefined => {
  return adHocActions.get(id)
}

export const getAllAdHocActions = (): ActionDefinition[] => {
  return [...adHocActions.values()]
}
```

整合到 action lookup（plan 阶段定位现有入口，可能在 `shared/actions/index.ts` 或 `internal-actions.ts` 导出的 lookup 函数）：

```ts
export const getActionDefinition = (id: string): ActionDefinition | undefined => {
  return staticActions.get(id) ?? getAdHocAction(id)
}
```

### 3.2 单卡迁移（以 E73 Scythe 为例）

**当前** `shared/actions/effects/scythe-harvest-field.ts`（独立文件）+ E73 listener 引用 `actionId: 'scythe-harvest-field'`。

**改造后** E73 卡内闭包：

```ts
// shared/cards/E/E73_Scythe.ts
import { registerAdHocAction } from '../../actions/effects/registry'

const scytheHarvestFieldAction: ActionDefinition = {
  id: 'card_E73_scythe-harvest',
  // ... execute 内 mutation 同原文件
}
registerAdHocAction(scytheHarvestFieldAction)

const listener: CardListenerRegistration = {
  // ...
  handler: (ctx) => ({
    flow: { type: 'leaf', actionId: 'card_E73_scythe-harvest', sourceCard: CARD_ID, params: {...} },
    sourceCard: CARD_ID,
  }),
}
```

`shared/actions/effects/scythe-harvest-field.ts` → 删除。

### 3.3 候选清单

| 文件 | 处理 |
|---|---|
| `grain-thief-protect.ts` | 移卡内 ad-hoc |
| `discard-from-hand.ts` | 移卡内 ad-hoc |
| `mark-card-observed.ts` | 移卡内 ad-hoc |
| `scythe-harvest-field.ts` (E73) | 移卡内 ad-hoc |
| `build-farmhand-room.ts` | 移卡内 ad-hoc |
| `first-player.ts` | plan verify 是否单卡 |
| `swap-field-crop.ts` | plan verify 真共用？多卡 → helpers/，单卡 → ad-hoc |
| `move-farmer-to-space.ts` | 同上 |
| `store-on-card.ts` / `take-from-card.ts` | 同上 |

### 3.4 测试

- 新增 `shared/actions/effects/__tests__/ad-hoc-registry.test.ts` 4 例：
  - register + lookup 正确
  - id 必须 `card_` 前缀（违反抛错）
  - 重复注册抛错
  - getActionDefinition fallback 到 ad-hoc
- 8-10 张单卡现有 session 测试不能 break

### 3.5 LLM workshop / DSL runner 兼容

plan 阶段 verify ad-hoc registry 是否需要被 LLM workshop（custom-registry）/ DSL runner 看到。如果允许 LLM 用 ad-hoc action，需在 sandbox 文档说明 + ast-validator 放行。

### B 工时

| 项 | 工时 |
|---|---|
| `registerAdHocAction` 基础设施 + lookup fallback | ~30 min |
| 8-10 张单卡迁移 + 删 effects/ 文件 | ~2-3h |
| 共用文件评估（move-farmer-to-space / swap-field-crop / store-on/take-from） | ~30 min |
| 测试回归 + LLM workshop / DSL 验证 | ~30 min |
| **B 合计** | **~1.5-2d** |

## 4. Batch C — special-effect 替换 5 个 leaf（51 张卡 caller）

### 4.1 替换映射

| 现 leaf actionId | 卡数 | 改为 |
|---|---|---|
| `flag-card` | 39 | `special-effect` kind:`'set-flag'` flag:`true` |
| `unflag-card` | 8 | `special-effect` kind:`'set-flag'` flag:`false` |
| `set-card-infobox` | ~2 | `special-effect` kind:`'set-infobox'` text:`...` |
| `clear-card-infobox` | ~1 | `special-effect` kind:`'set-infobox'` text:`''` |
| `write-card-extra-data` | ~1 | `special-effect` kind:`'set-extra-data'` key/value |

合计 **51 张卡 caller** 改写。

### 4.2 改造模板

```ts
// 当前
{ type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID }

// 改造后
{ type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
  params: { kind: 'set-flag', flag: true } }
```

### 4.3 删除 5 个 effects/ 文件

完成所有 caller 改写后：
- 删 `flag-card.ts` / `unflag-card.ts` / `set-card-infobox.ts` / `clear-card-infobox.ts` / `write-card-extra-data.ts`
- 删 `internal-actions.ts` 中对应注册
- 删 i18n keys（`flag-card.name` 等）

### 4.4 测试

- 51 张卡现有 session 测试**全跑**不能 break（行为完全等价）
- 不需要新加测试（special-effect.test.ts 已覆盖）

### 4.5 操作粒度

按 deck 分组（每 deck 一个 commit），avoid 单 commit 改动面过大。

### C 工时

| 项 | 工时 |
|---|---|
| 51 caller 替换（按 deck 分组） | ~1.5d |
| 删除 5 个 effects/ 文件 + i18n / 注册清理 | ~30 min |
| 测试回归 | ~1h |
| **C 合计** | **~2-2.5d** |

## 5. Batch D — 4 张 mutation 卡 cleanup

### 5.1 special-effect targetPlayerId 接口扩展（前置）

```ts
// shared/actions/effects/special-effect.ts execute 内
execute: ({ player, sourceCard, params, actionContext, state }) => {
  if (!sourceCard) return { type: 'fail', logKey: 'log.specialEffectFail' }
  
  const targetPlayerId = (actionContext as { targetPlayerId?: string } | undefined)?.targetPlayerId
  const target = targetPlayerId
    ? state.players.find(p => p.id === targetPlayerId) ?? player
    : player
  
  const p = params as SpecialEffectParams | undefined
  if (!p) return { type: 'fail', logKey: 'log.specialEffectFail' }
  switch (p.kind) {
    case 'increment-extra-data': {
      const current = readCardExtraData<number>(target, sourceCard, p.key) ?? 0
      writeCardExtraData(target, sourceCard, p.key, current + p.amount)
      return { type: 'ok' }
    }
    case 'set-extra-data':
      writeCardExtraData(target, sourceCard, p.key, p.value)
      return { type: 'ok' }
    case 'set-flag':
      setCardFlag(target, sourceCard, p.flag)
      return { type: 'ok' }
    case 'set-infobox':
      writeCardInfobox(target, sourceCard, p.text)
      return { type: 'ok' }
  }
}
```

**默认行为**（不传 `targetPlayerId`）：mutate `context.player`（actor），保持 D92 / D157 / 其他 owner = actor 卡的行为不变。

**plan 阶段确认**：
- `actionContext.targetPlayerId` 是否已被其他 effect 用 — 名字冲突 verify
- `bonus-vp` / 其他 leaf 是否也需类似扩展（D134 同时累 VP 给 owner — 如果 bonus-vp 已支持 player override 则无需改；否则 batch D 内一起扩展）

### 5.2 E149 MidnightFencer

**当前**（resolveChoice 内）：
```ts
writeCardExtraData(player, CARD_ID, KEY_OWED, readOwed(player) + k)
```

**改造**：resolveChoice 返回 SEQ flow 含 special-effect leaf：
```ts
resolveChoice: (...) => ({
  type: 'seq',
  children: [
    { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
      params: { kind: 'increment-extra-data', key: KEY_OWED, amount: k } },
  ],
})
```

### 5.3 E38 RodCollection

**当前**（after-collect listener）：
```ts
writeCardExtraData(context.player, CARD_ID, 'woodCount', current + 2)
```

**改造**：
```ts
handler: (context) => {
  if (context.space?.id !== 'fishing') return
  return {
    flow: { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
            params: { kind: 'increment-extra-data', key: 'woodCount', amount: 2 } },
    sourceCard: CARD_ID,
  }
}
```

### 5.4 D134 OysterEater

**当前**：
```ts
writeCardExtraData(owner, CARD_ID, 'skipNextPlacement', pending + 1)
return { flow: { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID }, ... }
```

**改造**（用 SEQ + special-effect with targetPlayerId for owner）：
```ts
handler: (context) => {
  if (context.space?.id !== 'fishing') return
  const owner = context.ownerPlayer ?? context.player
  return {
    flow: {
      type: 'seq',
      children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
          params: { kind: 'increment-extra-data', key: 'skipNextPlacement', amount: 1 },
          actionContext: { targetPlayerId: owner.id } },
        { type: 'leaf', actionId: 'bonus-vp', sourceCard: CARD_ID,
          actionContext: { targetPlayerId: owner.id } },   // 假设 bonus-vp 支持
      ],
    },
    sourceCard: CARD_ID,
  }
}
```

**plan 阶段验证**：bonus-vp leaf 是否支持 targetPlayerId / 已有 player override 接口；如未支持，本 batch 一起扩展。

### 5.5 C104 Collector — 最复杂

**当前**（PlayerActionCard.execute 内）：
```ts
execute: ({ player }) => {
  const useCount = (readCardExtraData<number>(player, CARD_ID, 'used') ?? 0) + 1
  writeCardExtraData(player, CARD_ID, 'used', useCount)   // 立即 mutate
  player.resources.begging += 1                          // 立即 mutate
  // 返回 choice
  return { type: 'choice', ... }
}
```

**改造**：execute 不立即 mutate；mutation 全在 resolveChoice 走 SEQ flow：

```ts
execute: ({ player }) => {
  // 仅 read：用 useCount 决定 needed
  const useCount = (readCardExtraData<number>(player, CARD_ID, 'used') ?? 0) + 1
  const needed = USES_TO_RESOURCES[useCount] ?? 6
  return {
    type: 'choice',
    promptKey: 'ui.interactionCollectorSelect',
    promptParams: { needed },
    options: RESOURCE_TYPES.map(r => ({ value: r, ... })),
  }
},
resolveChoice: ({ player }, choice) => {
  // 玩家选择确认后才 mutate（走 SEQ 内 leaf）
  const selections = choice.split(',').filter(...)
  const unique = [...new Set(selections)]
  const useCount = (readCardExtraData<number>(player, CARD_ID, 'used') ?? 0) + 1
  const needed = USES_TO_RESOURCES[useCount] ?? 6
  if (unique.length !== needed) {
    return { type: 'choice', /* 重新 prompt */ }
  }
  // 选齐，构造 SEQ flow with [special-effect 累加 used, gain 资源 + begging]
  const gainMap = Object.fromEntries(unique.map(r => [r, 1]))
  return {
    type: 'seq',
    children: [
      { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
        params: { kind: 'increment-extra-data', key: 'used', amount: 1 } },
      { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID,
        params: { ...gainMap, begging: 1 } },
    ],
  }
}
```

**plan 阶段验证**：
- PlayerActionCard 的 resolveChoice 接口是否支持返回 `type: 'seq'` flow（不仅 `type: 'ok'` / `'choice'`）
- gain 是否同时支持 `begging` 和资源 in 一次 leaf（mech-E gain merge 应该支持）

### 5.6 D 工时

| 项 | 工时 |
|---|---|
| special-effect targetPlayerId 扩展（含 bonus-vp 同步） | ~30 min |
| E149 / E38 SEQ + special-effect | ~30 min |
| D134 SEQ + special-effect targetPlayerId + 测试 | ~30 min |
| C104 PlayerActionCard 重构 + 测试 | ~30 min |
| 测试回归（4 张卡现有 session test） | ~30 min |
| **D 合计** | **~1.2d** |

## 6. 6a Follow-up

### 6.1 trigger 单数 → triggers 数组统一

**操作**：
- 18 张已用 `trigger: 'harvest'` / `trigger: 'anytime'` 的卡 metadata 改 `triggers: [...]`
- 删 `CardExchange.trigger?: ExchangeWindow` 字段（仅留 `triggers: ExchangeWindow[]`）
- 删 `exchangeTriggers(ex)` helper（不再需要）

**操作步骤**：
- grep `trigger:` 在 `shared/cards/` 全文件
- 每张卡 single replace
- TS 编译验证

**工时**：~1h

### 6.2 E53 triggers `[]`

**操作**：
- E53_BoarSpear.ts metadata 改 `triggers: []`
- E53 listener 走 `getExchangesByTradeIds(player, ['E53_BoarSpear'])`（已有 helper）
- 现有 anytime exchange test 翻转：玩家不能在 anytime exchange action 主动看到 E53 trade（仅 listener 时可见）

**工时**：~30 min

## 7. 测试 + 文档同步

### 7.1 测试边界

| Batch | 新增测试 | 现有测试回归 |
|---|---|---|
| A dead code + helper 移位 | — | 全测试不 break |
| B ad-hoc registry | `ad-hoc-registry.test.ts` 4 例 | 8-10 张单卡 session 不 break |
| C special-effect 51 caller | — | 51 张卡 session 不 break |
| D mutation cleanup | special-effect.test.ts 加 1 例 targetPlayerId | E149 / E38 / D134 / C104 现有 session test 改 / 重写 |
| 6a follow-up | — | 18 + 1 张卡现有测试不 break；E53 anytime exchange test 翻转 |

合计 **~10 例新增 + ~70 张卡现有测试回归**。

### 7.2 文档同步

#### `docs/card_progress.md`

- §2.0 changelog 加 sprint-6b 条目
- §3 基础设施清单加 4 条：
  1. `registerAdHocAction` ad-hoc registry
  2. `special-effect` 4 kind 全覆盖
  3. `special-effect` `actionContext.targetPlayerId`
  4. `CardExchange.triggers: ExchangeWindow[]` 数组化完成
- §6 follow-up：4 张 mutation 卡完成 + flag-card 重定向完成
- §8 时间线加 sprint-6b 行
- §1 总览 effects/ 数量（63 → ~26-30）

#### `docs/master-plan.md`

- §1 / §8 Sprint 6 进度（partial → full done after 6b）
- §8 加 sprint-6b 行

#### `docs/ENGINE_ARCHITECTURE.md`

接续 6a §15.11，加：
- **§15.12 ad-hoc action registry**：`registerAdHocAction(def)`，`card_` 前缀约定，integration with action lookup
- **§15.13 special-effect targetPlayerId**：`actionContext.targetPlayerId` 控制 mutation target

#### `docs/CUSTOM_CARD_SANDBOX.md`

- 加 `card_` 前缀的 ad-hoc action 注册说明（如允许 LLM 工坊用，plan 阶段决议）
- 加 `special-effect` 的 `targetPlayerId` 接口
- prompt-sync check 自动验证

### 7.3 Commit 粒度（9 个 commit）

```
1. refactor(effects): remove dead code + move helpers to shared/actions/helpers/
2. feat(action): registerAdHocAction infrastructure
3. refactor(card-effects): inline single-card actions to ad-hoc registry
4. feat(special-effect): targetPlayerId actionContext for cross-player mutation
5. refactor(card-state): migrate 51 callers (flag-card / unflag-card / write-extra-data / set/clear-infobox) to special-effect
6. refactor(effects): remove 5 redundant card-state action files
7. refactor(mutation cleanup): E149 / E38 / D134 / C104 listener mutate → special-effect leaf
8. refactor(exchange triggers): unify trigger array + E53 listener-only
9. docs: sync card_progress / master-plan / ENGINE_ARCHITECTURE / CUSTOM_CARD_SANDBOX for sprint-6b
```

## 8. 风险与回滚

### 关键风险

1. **batch C 51 张 caller 改写量大易遗漏**：plan 阶段 grep verify 全 caller 0 残留 `actionId: 'flag-card'` 等
2. **batch B ad-hoc registry 接入 lookup chain**：LLM workshop / DSL runner / engine action discovery 是否都看 ad-hoc map（plan 阶段验证）
3. **batch D special-effect targetPlayerId**：跟现有 actionContext 字段命名冲突（plan 阶段 grep verify）
4. **6a follow-up trigger 数组化**：删 `exchangeTriggers` helper 后所有 caller 改用 `ex.triggers.includes(window)` 直接比对
5. **C104 PlayerActionCard 重构**：execute 不立即 mutate 后，PlayerActionCard 接口语义可能要 verify（resolveChoice 是否支持返回 SEQ flow）

### 回滚

每个 commit 独立可 revert：
- commit 5（51 caller）revert 影响最大；commit 6（删文件）revert 后回到 6a 状态
- commit 7（mutation cleanup）单独可 revert
- 6a follow-up（commit 8）单独可 revert

## 9. DoD

- `pnpm test:fast` 全绿（~280 文件）
- `pnpm test:slow` 不回归
- `pnpm run lint` 0 error
- `pnpm run build` 成功
- `pnpm run check:prompt-sync` GREEN
- `pnpm run check:catalog-types` GREEN
- effects/ 文件数 63 → ~26-30
- 手测两人房：D92 / D157 / E149 / E38 / D134 / C104 各跑场景验证 mutation 经 special-effect 不破坏行为
- CI 三 run（CI / Deploy Backend / Deploy Pages）全 success
- 4 个 doc 同步完整

## 10. 工时合计

| 项 | 工时 |
|---|---|
| Batch A | ~1-1.5d |
| Batch B | ~1.5-2d |
| Batch C | ~2-2.5d |
| Batch D（含 targetPlayerId 扩展） | ~1.2d |
| 6a follow-up（trigger + E53） | ~1.5h |
| 测试 + 文档 | ~0.5d |
| **6b 合计** | **~6.5-8d** |
