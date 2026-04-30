# Sprint 5 机制 C：anytime-exchange 重命名 + E53 BoarSpear 接入设计

**日期**: 2026-04-30
**Sprint**: 5（机制 C 子项 — 命名重构 + E53 单卡修）
**Worktree**: `.worktree/sprint-5-mech-c-meeple-id`

## 1. 背景与 scope 收敛

### 1.1 原计划与实际差异

原 spec 设想"meeple-id obtain tracking"基础设施：BGA E53 BoarSpear 用 `event.meeples[].id` 跨触发去重，触发时用 `payGainNode([PIG => i], [FOOD => i*4])` 转换。设想我们也建一套 obtainedMeeples 字段。

**架构差异发现**：我们模型下 `player.resources.boar: number` 是 counter，**不是 meeple 实例**。`gain.ts:18` 直接 `player.resources[key] += amount`，没有 meeple 创建。BGA 的"meeple-id"在我们模型下不适用。

**E53 现有实现的真实 bug**（`shared/cards/E/E53_BoarSpear.ts:75`）：

```ts
flow: { type: 'seq', children: [
  { type: 'leaf', actionId: 'exchange', ... }  // ← 'exchange' 不是有效 actionId
]}
```

actual action id 是 `'anytime-exchange'`（`exchange.ts:370`）。E53 的 flow 引用了**不存在的 action**，silently 失败 — 玩家选了"转 N 只"但实际什么都没发生。

### 1.2 实际工作

scope 从"建 meeple-id 基础设施 ~2-3 day"缩到 **3 件事**：

1. **`anytime-exchange` 重命名为 `exchange`**：`reorganize`（另一个 anytime action）没加前缀的事实证明前缀**不是规范**；前缀啰嗦，统一掉
2. **`exchange` action 加 `actionContext.tradeIds?` 限定**：让 E53 调用时只显示 boar→food 那条 trade
3. **E53 单卡重写**：注册 boar→food trade、obtain after listener 弹 SEQ optional → exchange leaf with tradeIds、用 `actionToken` 实现 per-action once 去重；E85 联动自动（监听 exchange action diff resources）

工作量约 **~1 day**。

## 2. 设计目标

- 命名统一：`anytime-exchange` → `exchange`（与 `reorganize` 一致，无前缀）
- 复用现有 cookery trade / payment / E85 listener 路径，**不引入 meeple-id 概念**
- E53 行为对齐 BGA：obtain 后立刻 prompt 转、可选转 N 只、breeding phase 排除、per-action once 去重
- E85 与 E53 自动联动：E53 走 exchange action → E85 现有 before/after exchange listener 看到 boar/cattle 资源变化 → 计 cooked 数

## 3. 核心实现

### 3.1 重命名 `anytime-exchange` → `exchange`

#### 3.1.1 改动文件清单

`grep -rn "anytime-exchange"` 结果（14 个非测试引用 / ~9 文件）：

- `shared/actions/effects/exchange.ts` — `anytimeExchangeAction.id`
- `shared/actions/effects/__tests__/exchange-effect-preview.test.ts`
- `shared/cards/E/E85_MasterTanner.ts` — listener `actions: ['anytime-exchange']`
- `shared/cards/C/C53_GypsysCrock.ts` — 同
- `shared/cards/B/B29_CookeryLesson.ts` — 同
- `shared/cards/A/A48_ShavingHorse.ts` — 同
- `shared/cards/D/D36_BreedRegistry.ts` — 同
- `shared/cards/D/D56_FatstockStretcher.ts` — 同
- `server/__tests__/D56_FatstockStretcher-session.test.ts` — actionId 字符串

#### 3.1.2 改动方式

- `exchange.ts` 的 `anytimeExchangeAction.id` 字段从 `'anytime-exchange'` 改为 `'exchange'`；常量名 `anytimeExchangeAction` 可保留（避免影响 import 引用），仅改 id
- 6 张卡 + 1 测试的 listener actions 字段 / actionId 字符串全部 `'anytime-exchange'` → `'exchange'`
- i18n key（如 `actions.anytime-exchange.name` / `actions.anytime-exchange.description`）也按需重命名为 `actions.exchange.*`，对应 zh.ts / en.ts 同步
- 全局再 `grep -rn "anytime-exchange"` 验证 0 残留

### 3.2 `exchange` action 加 `actionContext.tradeIds` 限定

`exchange.ts` 的 `anytimeExchangeAction.execute`：

```ts
execute: ({ player, actionContext }) => {
  const allOptions = buildExchangeOptions(player)
  const filterIds = actionContext?.tradeIds as string[] | undefined
  const filtered = filterIds && filterIds.length > 0
    ? allOptions.filter((opt) => {
        // option.value 含 sourceId / source 信息；按 trade.sourceId 匹配
        // 如果 buildExchangeOptions 把 trade 序列化进 value 字符串，需在 build 时也输出 sourceId 字段
        return filterIds.some((id) => opt.value.includes(id) || opt.labelParams?.sourceId === id)
      })
    : allOptions

  if (filtered.length === 0) {
    return { type: 'fail' as const, logKey: 'log.actionNoExchange' }
  }

  return {
    type: 'choice',
    promptKey: 'ui.interactionExchangeChoice',
    options: filtered,
  }
}
```

注：option filter 的具体匹配逻辑取决于 `buildExchangeOptions` 现有 option.value 格式。plan 阶段需先看 actual format，可能要给 ActionChoiceOption 加 `sourceId` 字段或扩展 value 编码。

`canBeExecutedByPlayer` 也要按 `actionContext.tradeIds` 过滤 trade 池：

```ts
canBeExecutedByPlayer: (_, player, ctx) => {
  const filterIds = ctx?.actionContext?.tradeIds as string[] | undefined
  return hasAffordableCookeryTrade(player, filterIds)  // 扩展 helper 接受 filter
}
```

### 3.3 E53 注册 boar→food trade

在 `exchange.ts` 现有 cookery trades 数组（`Major_Fireplace1` / `Major_CookingHearth1` 所在地附近）加：

```ts
{ from: { boar: 1 }, to: { food: 4 }, sourceId: 'E53_BoarSpear' },
```

`hasAffordableCookeryTrade` / `buildExchangeOptions` 现有逻辑按 sourceId 自动过滤"玩家持有该 source 卡"才显示 trade。E53 trade 注册全局，但只对 E53 持有者可见。

### 3.4 E53 listener 重写

文件：`shared/cards/E/E53_BoarSpear.ts`，完全替换：

```ts
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

    // breeding phase 排除（harvest 期间不触发）
    if (context.state.roundPhase === 'feeding' || context.state.roundPhase === 'breeding') return

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

注：`roundPhase` 实际取值需要 plan 阶段 grep `state.roundPhase === ` 确认 harvest sub-phase 命名（可能是 `'feeding'` / `'breeding'` / `'harvest'` 等）。

### 3.5 E85 联动（自动）

E85_MasterTanner 现有 listener（`E85_MasterTanner.ts:13-53`）监听 `actions: ['anytime-exchange']` before / after，diff `player.resources.boar / cattle` 算 cooked 数。重命名为 `'exchange'` 后路径不变，E53 走 exchange action 时 E85 自动触发：
- before exchange：snapshot boar / cattle
- after exchange：diff，按 cooked 数 push food 到 E85 stack（玩家可选放食物到卡上）

**0 E85 业务逻辑改动**（仅 actions 字段名 anytime-exchange → exchange）。

### 3.6 关键不变量

- **per-action once 去重靠 `actionToken`**：`readActionSnapshotToken(player)` 返回当前 action 的 token；E53 cardStates 记 `usedActionToken`，比对避免同一 action 多 phase 重复触发
- **breeding phase 排除靠 `roundPhase`**：harvest 内的 feeding / breeding sub-phase 不弹 prompt
- **E53 不引入 meeple-id 概念**：玩家选"转 N 只"通过 exchange 的 trade.max 机制（玩家在 exchange prompt 里选用 trade 的次数）
- **E85 联动 0 改动**：因为命名重构后 E85 listener 仍监听 exchange action，E53 走的就是这个 action

## 4. 测试策略

### 4.1 重命名测试更新

- 6 张卡 + 1 测试的 actionId 字符串改完后，跑各自现有测试无回归
- `D56_FatstockStretcher-session.test.ts` 等 anytime-exchange 测试改完后跑过

### 4.2 新建 `server/__tests__/E53_BoarSpear-session.test.ts`

setup：玩家持 E53 (`minorPlayed`)，配合一个能给 boar 的 action（如 wild-boar accumulation 空间或 gain leaf）。

**场景 1：不获 boar action → 不弹 prompt**
玩家落不获 boar 的格子（如 forest），断言 pending 直接进 confirmNextPlayer / 后续 step，无 E53 choice prompt。

**场景 2：获 1 boar → 弹 SEQ optional → 接受 → 转 4 food**
得 1 boar 后 pending=choice，玩家接受，再选 trade exchange option。断言 player.resources.boar=0, food += 4。

**场景 3：获 2 boar → 玩家选转 1 只（trade 用 1 次）**
得 2 boar，玩家在 exchange prompt 里选用 trade 1 次（实际 trade.max 机制 — 看 buildExchangeOptions 是否生成"次数"选项；若仅有"用 1 次 / 用 2 次"两条 option，断言玩家选 1 次后 boar=1, food=4）。

**场景 4：拒绝 SEQ → 玩家保留 boar**
SEQ optional skip → 玩家 boar 不变，no exchange occurs。

**场景 5：同 action 多 phase 链 → 仅触发 1 次**
构造 stub action 发出 gain → collect 链（如 wild-boar 空间内含 collect 动作 + 下游 gain），断言 E53 listener 只触发一次（断言 cardStates.usedActionToken 不变 / pending 只 1 次出现）。

**场景 6：harvest breeding phase 期间得 boar → 不触发**
手工设 `state.roundPhase = 'breeding'` 之类，让玩家得 boar，断言 E53 不弹 prompt（roundPhase guard 生效）。

**场景 7：E53 + E85 联动**
玩家持 E53 + E85，得 boar → E53 弹 prompt → 接受 → exchange before/after dispatch → E85 监听 exchange after → diff 后给"放 1 food 到 E85 stack" prompt 链。断言 E85 stack 收到 food。

### 4.3 fast / slow 项目分配

- E53 session 测试 → `slow`（沿用单卡 session 测试惯例）
- 重命名 + actionContext.tradeIds 单元测试（如有）→ `fast`

## 5. 范围与排除项

### 5.1 范围内

- exchange.ts 重命名 id + actionContext.tradeIds 限定 + E53 trade 注册
- 6 张卡 + 1 测试的 actionId 字符串重命名
- E53_BoarSpear.ts 完全重写
- 新建 E53 session 测试 + 现有 anytime-exchange 测试更新
- i18n key 重命名（actions.anytime-exchange.* → actions.exchange.*）
- 文档同步：card_progress §2.0 / §2.3 / §7 / §8、master-plan §8、ENGINE_ARCHITECTURE 加一节 "actionContext.tradeIds 协议"

### 5.2 明确排除

- **meeple-id obtain tracking 基础设施**：我们模型 boar 是 counter 不是 meeple 实例；用 actionToken per-action once 替代 meeple-id 跨触发去重
- **其他 PIG / CATTLE → FOOD 卡**：BGA 还有别的食物转换卡，但本 spec 只覆盖 E53；其他按需各自 spec
- **anytime-bake-bread 等 anytime action 的命名重构**：本 spec 只重命名 anytime-exchange 一个；reorganize 已无前缀，bake-bread 也无前缀，无需统一重构

### 5.3 风险点

| 假设 | 验证方式 |
|---|---|
| `roundPhase` 取值含 `'breeding'` / `'feeding'` 之类 harvest sub-phase | grep `state.roundPhase === ` 确认；session 测试场景 6 |
| `buildExchangeOptions` 的 option.value / labelParams 含 sourceId 信息可用于 tradeIds 过滤 | 看 exchange.ts 实现；如果不直接含，加一道 trade.sourceId → option 字段透传 |
| `hasAffordableCookeryTrade` 可接受 filterIds 参数 | 看现有签名；如果不接受，改造或在 canBeExecutedByPlayer 里手工过滤 |
| 重命名漏掉某处 | grep `anytime-exchange` 全局确认 0 残留 |
| E85 actions 字段重命名后 listener 行为不变 | E85 现有 session 测试跑过；E53 + E85 联动测试场景 7 |
| 现有 anytime-exchange 测试不依赖 actionId 字面量 `'anytime-exchange'` 别处（如硬编码 i18n） | grep 检查 |
| E53 obtain 后弹 SEQ optional 时 player 在 round 进度上还能继续推进 | session 测试场景 4（拒绝路径） |

## 6. 文档同步

### 6.1 `docs/card_progress.md`

- §2.0 加：`2026-04-30 Sprint 5 mech-C — anytime-exchange action 重命名为 exchange + E53 BoarSpear 重写。exchange action 加 actionContext.tradeIds 限定能力，E53 注册 boar→food trade 并在 obtain after phase 弹 SEQ optional → exchange leaf 限定 trade。E85 MasterTanner 与 E53 自动联动（命名重构覆盖了 6 张卡的 listener actions）。详见 docs/superpowers/specs/2026-04-30-sprint-5-mech-c-exchange-rename-boar-spear-design.md。`
- §2.3 把 E53 从待修列表移除，标 ✅ Sprint 5 mech-C
- §7 加：`exchange action（原 anytime-exchange）支持 actionContext.tradeIds 限定 trade 显示。配合 cookery trades 全局注册（按 sourceId 过滤玩家持有源卡），让卡牌（如 E53）触发 obtain prompt 时只显示自己注册的 trade，避免污染玩家平时主动 exchange 的全部选项。`
- §8 时间线加新行

### 6.2 `docs/master-plan.md` §8

- Sprint 5 行加 `+ ~1 day (mech-C)`；spec / plan 列加新路径

### 6.3 `docs/ENGINE_ARCHITECTURE.md`

加一段（在 Hook 系统附近）：

```
### exchange action 与 actionContext.tradeIds

`shared/actions/effects/exchange.ts` 的 exchange action（原 anytime-exchange，2026-04-30 重命名为 exchange）接受 actionContext.tradeIds?: string[] 限定显示哪些 trade。trade 通过 cookery trades 数组全局注册（每条带 sourceId 字段标识 source 卡）。玩家主动触发 exchange 时全部注册 trade（按持有过滤）；卡触发 exchange leaf 时可传 tradeIds 限定为仅显示该卡的 trade（如 E53 obtain 后只显示 boar→food，不显示玩家其他 cooker）。
```

## 7. 提交粒度

- commit 1: `refactor(exchange)`: rename anytime-exchange to exchange + actionContext.tradeIds support（exchange.ts + 6 cards + 1 test + i18n）
- commit 2: `refactor(E53)`: rewrite Boar Spear using exchange leaf + actionToken per-action once（含新建 E53_BoarSpear-session.test.ts）
- commit 3: `docs`: sync mech-C across card_progress / master-plan / ENGINE_ARCHITECTURE

每 commit 单独跑 `pnpm test:fast` + `pnpm run lint` + `pnpm run build` 全绿才下一步。
