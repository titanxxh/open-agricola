# Sprint 5b — P1 单卡 tail-fixes 设计

> 日期：2026-04-30
> Sprint：5b（5 收尾批）
> Worktree：`.worktree/sprint-5b-tail-fixes`
> 基于 main：`8e81ffa5`（含 mech-A/B/C/D/E + stub-test-infra + Sprint 6 partial + audit §5.7）
> 目标：5 张 P1 卡的 tail-fix（C23 / A38 / A1 / A22 / E16），单 spec / 单 plan / 单 push
> 工时估算：~1.8 day（详见 §8）

## 1. 范围与目标

Sprint 5 的 P1「单卡行为偏差」原 28 张，经 PR-5 + mech-A/B/C/D/E 已修 20 张。剩余 §2.3 deferred 中可立即修复的 5 张：

| 卡 | 简述 | 偏差类型 |
|---|---|---|
| C23 JobContract | 第 61 行 `occupationHand.length === 0 → return` 守卫错误，BGA 不检查 occupation 在手 | P1 行为 |
| A38 WoolBlankets | prereq 错（`Wooden House` 应是 `5 Sheep`），缺 sheep≥5 isBuyable 检查 | P1 metadata + 行为 |
| A1 Shelter | onBuy 给 stables leaf 但**无 1-size pasture 限定 + 无 wood:0 cost override** | P1 行为 |
| A22 Telegram | 缺 `hasFarmerInReserve` 检查；BGA `flagCardNode` vs 我方 `extraPlacement leaf` 语义偏差（保留为刻意偏离） | P1 守卫 + 刻意偏离登记 |
| E16 Briar Hedge | `canStartFencing` 入口硬编码 wood ≥ minFences，不考虑 fence discount，导致玩家 0 wood 时即使全造 border-edge fence 也进不了 fence action | P1 entry-guard |

**不在范围**（推 Sprint 6/7）：
- A165 PigBreeder：round 12 breeding 模块完整实现（~2d 新机制）
- B155 ArtTeacher：listener 从 lessons-only 扩到所有 occupation 入口（~0.5d 但实质改 listener model）
- 深度池 / wide-scan 其他 deferred 卡：见 `docs/card_desc_audit.md` §5.7（B 牌组 17 张 + E 牌组 20 张全部已 ✅ aligned，无残留）

**不动主路径** —— 5 张卡全部走现有扩展点：listener、effect helper、`registerPrerequisite`、`actionContext` 字段、effect hook 新增。

## 2. 实现细分

### 2.1 C23 JobContract — 删守卫

**位置**：`shared/cards/C/C23_JobContract.ts:61`。

**变更**：

```diff
-    // Check the player has at least one occupation in hand
-    // (otherwise the lessons trigger is wasted).
-    if (context.player.occupationHand.length === 0) return
```

**理由**：BGA `C23_JobContract.php` `legacy isDoable('ActionLessons')` 仅调 `$card->canBePlayed($player, null)`（检查 action 本身可执行性），不查 occupation 是否在手。即使玩家空手，BGA 仍 dispatch 含 `placeFakeFarmer + useActionSpaceNode('ActionLessons')` 的 SEQ，让 lessons space 物理被占（影响其他 lessons-listener 卡如 A113 / B155）。

**测试影响**：现有 `C23_JobContract*.test.ts` 中「occupationHand=0 → no flow」反向断言要翻转为「occupationHand=0 仍弹 SEQ optional → 玩家选 cancel 或在 play-occupation leaf 内自然 fail」+ 新增「empty hand 也插 fake worker 占 lessons」断言。

**工时**：~0.5h。

### 2.2 A38 WoolBlankets — prereq 修

**变更 1（metadata）**：`shared/cards/A/A38_WoolBlankets.ts`：

```diff
-  prerequisite: "Wooden House",
+  prerequisite: "5 Sheep",
```

**变更 2（prereq handler）**：用 `registerPrerequisite`：

```ts
import { registerPrerequisite } from '../helpers/prerequisite-registry'

registerPrerequisite('5 Sheep', (player) => getSheepOnFarm(player) >= 5)
```

`getSheepOnFarm(player)` 等价 BGA `countAnimalsOnBoard()[SHEEP]`：pasture / stable / house 上 sheep 总和（不含 supply）。**plan 阶段**确认我方有无现成 helper（如 `countAnimalsOnBoard` / `aggregateAnimals`）；若有直接复用，没有则 inline 算。

**cost** 维持 `{}`（BGA 也是默认空）；`extraVp: true` 已对 ✅。

**测试**：`A38_WoolBlankets-session.test.ts` 4 例：
- 4 sheep on board → not buyable
- 5 sheep on board → buyable
- 持卡 wood/clay/stone 房 → bonus VP 3/2/0

**工时**：~0.3d（含 helper 探查 + 测试编写）。

### 2.3 A1 Shelter — stables effect 扩展 + 1-size pasture 限定

#### 2.3.1 stables effect 通用扩展（基于现状的精确化）

**当前 stables 实际放置路径**（plan 阶段已读完确认）：
- `shared/actions/effects/stables.ts:stablesAction.execute` — 弹 choice prompt
- `shared/logic/farm/farm-interaction.ts:buildStableFarmInteraction(player, costOverride?)` — 计算 selectable tiles + payment
- `shared/session/game-core.ts:2780+` — 实际 commit、`scaleCost(costPerStable, stables.length)`
- `shared/actions/effects/fencing.ts:stableWoodCost = 2` — 全局默认 cost（对齐 BGA Standard Agricola；caller-传覆盖）

**已支持的 actionContext / param**：
- ✅ `costOverride: Partial<Resource>` — `buildStableFarmInteraction` + `game-core.ts:2789` 都识别（A1 直接传 `{}` 即免费）

**需新加的**：
- 🟡 **`max?: number`**：当前 `structuralMax = Math.min(selectableTiles.length, 4 - stableTiles.length)`，新加「读 actionContext.max 取 min」
- 🔴 **`zoneFilter?: 'pasture-1'`**（**唯一真正新接口**）：当前 `selectableTiles` 是「所有未占用 tile」，新加「按 zone filter 筛」
  - `'pasture-1'`：仅 1-size pasture 内的 tile（A1 用）
  - 留扩展余地（未来如有 `'pasture-any'` / `'stable-only'` 之类）；YAGNI 原则只先实现 `'pasture-1'`

**实现要点**：
- `buildStableFarmInteraction` 加可选 `zoneFilter` / `max` 参数
- `game-core.ts` stables 处理代码（约 line 2780+）透传 `actionContext.zoneFilter / max` 进 `buildStableFarmInteraction`
- `stablesAction.execute` 把 `actionContext` 透传到下游（`buildStableFarmInteraction` 已做大部分工作，主要透传链路）
- A1 onBuy 通过 leaf actionContext 调用，**不写任何独立 mini-flow**

**禁止 fallback inline**：A1 必须复用 stables effect。如果 zoneFilter 透传链路超预算，先把 `max + zoneFilter` 加到接口、A1 leaf 调；具体 zone filter 算法可在 `buildStableFarmInteraction` 内部 5 行内实现（filter `selectableTiles` 按 player.pastures 1-size 的 cells）。

**实际增量**：~15-25 行，跨 3 个文件（stables.ts / farm-interaction.ts / game-core.ts），通过 plan 阶段细分到 1-2 个独立步骤。

#### 2.3.2 A1.onBuy 调用更新

```ts
onBuy: () => ({
  type: 'leaf' as const,
  actionId: 'stables',
  sourceCard: CARD_ID,
  optional: true,
  actionContext: { max: 1, costOverride: {}, zoneFilter: 'pasture-1' },
})
```

**1-size pasture 判定**：farm.ts 现有 `player.pastures: Array<{size}>`，filter `size === 1`。如果**没有 size=1 pasture**，stables effect 应直接 fail（A1 这次 onBuy 等于浪费，BGA 同样语义）。

**plan 阶段验证**：
- BGA `getPastureZonesBySize(1)` 是 cell-level 还是 pasture-zone-level？我方 `pasture.size === 1` 是 pasture-zone-level。
- 现有 stables effect 是否已有 `max / costOverride` 等价字段？读完才能决定 Layer 1 改多少。

**测试**：`A1_Shelter-session.test.ts` 3-4 例：
- 没有 size=1 pasture → 买 A1 后无 stable 落地（fail / skip）
- 有 size=1 pasture → 弹 stables choice 限定在那个 pasture，免费
- max=1 限制（不超过 1 个 stable）

**工时**：~0.5d。

### 2.4 A22 Telegram — hasFarmerInReserve 守卫 + 刻意偏离登记

#### 2.4.1 hasFarmerInReserve 守卫

**位置**：`shared/cards/A/A22_Telegram.ts` `onBeforeStartOfTurn`。

**变更**：

```diff
 onBeforeStartOfTurn: (state, player) => {
   const triggerRound = readCardExtraData<number>(player, CARD_ID, 'triggerRound')
   if (triggerRound === undefined || state.round !== triggerRound) return
   if (isCardFlagged(player, CARD_ID)) return
+  // BGA hasFarmerInReserve 等价检查：family pool 里至少还有一个未放置的 worker
+  if (!hasFarmerInReserve(player)) return
   setCardFlag(player, CARD_ID, true)
   return { /* 同前 */ }
 }
```

**`hasFarmerInReserve` 语义**：
```ts
const placedThisRound = player.placedFarmers ?? 0
const familySize = player.familySize ?? player.workersAvailable
return placedThisRound < familySize
```

实际语义在 plan 阶段读 `shared/game/player.ts` 的 helper 确认；可能已有 `hasUnplacedFarmer / countUnplacedWorkers` 之类。

#### 2.4.2 刻意偏离登记

我方用 `actionContext: { trueAction: false, extraPlacement: true }` 让玩家额外放一个 worker 而不消耗 family pool；BGA 用 `flagCardNode + insertAsChild` 让玩家「这一回合可以多放一次」。

两者**实际游戏效果几乎等价**（都让玩家多放一次 worker）。我方语义更紧凑（直接弹 SEQ + leaf），BGA 更通用（允许玩家选择何时放）。

`docs/card_progress.md` §2.5 加条目登记此偏差为刻意偏离：

> **A22 Telegram extraPlacement leaf 模拟 BGA flagCardNode**：BGA 用 `flagCardNode + insertAsChild($flow)` 让玩家这一回合可多放一次 worker（玩家自己选时机）；我方在 onBeforeStartOfTurn 直接弹 SEQ optional + place-farmer leaf with `actionContext.extraPlacement`，玩家立即响应。等价游戏效果，我方语义更紧凑；不影响动画 / 计分 / 跨卡交互。

**测试**：`A22_Telegram-session.test.ts` 3 例：
- 触发回合 reserve 已空（family 全在板上）→ A22 不触发，无 SEQ 弹出
- 触发回合 reserve 还有 → 弹 SEQ + 玩家可选 place-farmer 额外放
- 触发回合非当前 → 不触发

**工时**：~0.3d。

### 2.5 E16 Briar Hedge — fencing entry-guard 走 effect 链

#### 2.5.1 BGA 算法对照

**BGA `Fencing::isDoable`**（`Actions/Fencing.php:153-157`）：
```php
$nFences = self::getMaxBuildableFences($player, $ignoreResources);
return $player->board()->canCreateNewPasture($nFences);
```

**BGA `getMaxBuildableFences`**（同文件 163-200）：
1. `$maxBuyable = $player->maxBuyableAmount($costsModified)` — 用 wood 能买多少 fence
2. 持 E16 BriarHedge：`$maxBuyable += count($player->board()->getAvailableBorderFences())`
3. 持 C16 FieldFences：`$maxBuyable += count($player->board()->getAvailableFieldFences())`
4. 持 E74 AshTrees：加 `chooseFromE74InAdvance`
5. 持 C88 CarpentersApprentice：达到 12 后扩到 15

**关键**：BGA 用「**实际可用的 free fence edge 数**」上限，不是假设值。

#### 2.5.2 我方对齐

**位置**：`shared/actions/effects/fencing.ts` `canStartFencing`。

**新增 effect hook**：
```ts
// CardEffect 接口加：
computeFenceFreeAvailable?: (state: GameState, player: PlayerState) => number
```

**E16 实现**：
```ts
computeFenceFreeAvailable: (state, player) => {
  return countAvailableBorderEdges(player)
}
```
`countAvailableBorderEdges` 模仿 BGA `getAvailableBorderFences()`：返回未占用的 border edge 数。

**`canStartFencing` 改写**：
```ts
export const canStartFencing = (state: GameState, player: PlayerState) => {
  if (getTotalPastureCells(player) >= maxPastureCells) return false
  if (getFenceCount(player) + minimumFenceSegments > maxFences) return false
  
  // BGA-style getMaxBuildableFences
  const woodAffordable = Math.floor(player.resources.wood / 1)
  let maxBuildable = woodAffordable
  for (const cardId of [...player.improvements, ...player.minorPlayed]) {
    const impl = getCardImpl(cardId)
    if (impl?.effect?.computeFenceFreeAvailable) {
      maxBuildable += impl.effect.computeFenceFreeAvailable(state, player)
    }
  }
  if (maxBuildable < minimumFenceSegments) return false
  
  // 等价 BGA canCreateNewPasture(nFences)
  return canCreateAnyNewPasture(player, maxBuildable)
}
```

**`canCreateAnyNewPasture(player, n)`**：在「最多 n 个 fence」前提下，板子上是否还能合法围出至少一个新 pasture。复用现有 `canBuildPasture` 类似逻辑或新写一个简单求解器。

**`canStartFencing` 签名变化**：现在需要 `state` 参数（之前只 `player`）。所有 caller 同步更新：
- `B26 AgrarianFences`、`B94 StockProtector`、`C88 CarpentersApprentice`：现有调用点 `canStartFencing(player)` → `canStartFencing(state, player)`（plan 阶段精确列出 caller list）

#### 2.5.3 其他 fence-discount 卡

**C16 FieldFences / C88 CarpentersApprentice / E74 AshTrees** 等也都属于 BGA 的 `getMaxBuildableFences` 加成源。本 5b 范围**仅 E16**，但加 hook 后这些卡也可按需提供 `computeFenceFreeAvailable` 实现（follow-up 任务）。如果它们当前在我方实现里有自己的 entry-guard 路径或不需要 entry-guard，留独立 follow-up 不阻塞。

**测试**：`shared/actions/effects/__tests__/fencing-entry-guard.test.ts` 4 例：
- 无折扣卡 + 0 wood → false（保持原行为）
- 持 E16 + 0 wood + 有 border edges → true（新行为）
- 满版 pasture（pasture cells ≥ maxPastureCells）→ false
- 满 fence cap（fence count + min ≥ maxFences）→ false

**§5.7 audit doc 同步**：在 E16 🟡 simplified 旁边备注「2026-04-30 5b 修，entry-guard 已支持 fence discount effect」。

**工时**：~0.5d。

## 3. 提交粒度

6 个 commit：

1. `fix(C23): drop occupationHand guard so empty-hand path still triggers fake lessons`
2. `fix(A38): change prereq from Wooden House to 5 Sheep; register handler`
3. `feat(stables): zoneFilter + costOverride + max actionContext; fix(A1): use 1-size pasture only`
4. `fix(A22): add hasFarmerInReserve guard; document extraPlacement as deliberate divergence`
5. `feat(fencing): computeFenceFreeAvailable hook; fix(E16): entry-guard considers fence discount`
6. `docs: sync card_progress / master-plan / ENGINE_ARCHITECTURE / card_desc_audit for sprint-5b`

**不需要 rebase**：5b 各卡修法独立，commit 顺序无依赖。

## 4. 文档同步

### `docs/card_progress.md`

- §2.0 changelog：加 sprint-5b 条目（每个 commit 简要描述）
- §2.3：移走 C23 / A38 / A1 / A22 / E16 → ✅ done；保留 B155 + A165
- §2.5：加「A22 Telegram extraPlacement leaf」条目
- §7：加 stables `actionContext.zoneFilter / costOverride / max` + fencing `computeFenceFreeAvailable` hook 条目
- §8 时间线：加 sprint-5b 行
- §1 总览：进度数 +5

### `docs/master-plan.md`

- §1 deferred 列表清理（C23 / A38 / A1 / A22 / E16 移出）
- §8 Sprint 5 行进度更新（25/28 done after 5b）

### `docs/ENGINE_ARCHITECTURE.md`

- §15.6（接 mech-E §15.5）：`actionContext.zoneFilter / costOverride / max` for stables effect
- §15.7：`computeFenceFreeAvailable` hook for fencing entry-guard

### `docs/card_desc_audit.md`

- §5.7 E16 旁注：「2026-04-30 5b 修，entry-guard 已支持 fence discount effect」

## 5. 测试策略

总计新增 / 修改测试 ~17 例（分布于 5 个 session test 文件 + 1 个 unit test 文件）：

- `C23_JobContract*.test.ts`：补 1 例 + 翻 1-2 反向断言
- `A38_WoolBlankets-session.test.ts`：4 例（新建）
- `A1_Shelter-session.test.ts`：3-4 例（新建）
- `A22_Telegram-session.test.ts`：3 例（新建）
- `fencing-entry-guard.test.ts`：4 例（新建 unit test）

**测试边界**：
- session 测试针对 GameSession 入口，断言 `state` / `pending` / `log` / `scores`
- entry-guard unit test 直接调 `canStartFencing(state, player)` mock state
- 不写 DOM 测试

## 6. 风险与回滚

**风险点**：
1. **A1 stables effect 扩展**：plan 阶段已确认现状（§2.3.1）— `costOverride` 已支持，仅需新加 `max + zoneFilter` 透传，~15-25 行增量。9 张其他卡（E89/C94/C2/B16/B89/A150/A89/A15）已用 `actionId:'stables'`，需保证它们不传 `zoneFilter` 时维持现有行为（默认全 tile），smoke test 至少 1 张回归。**禁止 fallback inline**：A1 必须复用 stables effect。
2. **E16 `canStartFencing` 签名变化**：新加 `state` 参数，所有 caller 需同步。**plan 阶段精确列出 caller list**，编译错误一目了然，但不要漏。
3. **A22 hasFarmerInReserve helper 不存在**：plan 阶段读 player.ts 决定 inline 算还是新加 helper。

**回滚**：每个 commit 独立可 revert。最坏情况 commit 3 / commit 5 影响最大（涉及 effect / shared helper），revert 后回退仅影响 A1 / E16；其他 3 张卡 commit 1/2/4 完全独立。

## 7. 验证 / DoD

- `pnpm test:fast` 全绿（fast project 271 → 272 文件，约 +5-7 个新测试文件）
- `pnpm run lint`：0 error（warning 不增）
- `pnpm run build`：成功
- `pnpm test:slow` 不回归（mech-E 的 6 张 session 测试不动）
- 手测：开两人房，每张卡走一遍正向 / 反向场景（C23 空手、A38 4 vs 5 sheep、A1 1-size pasture / 无 1-size pasture、A22 reserve 满 / 空、E16 0 wood entry-guard 通过）
- CI 三 run（CI / Deploy Backend / Deploy Pages）全 success
- card_progress / master-plan / ENGINE_ARCHITECTURE / card_desc_audit 4 个 doc 同步完整

## 8. 工时合计

| 项 | 工时 |
|---|---|
| C23 修守卫 + 测试 | ~0.5h |
| A38 metadata + prereq + 测试 | ~0.3d |
| A1 stables effect 扩展 + 1-size pasture + 测试 | ~0.5d |
| A22 reserve guard + 刻意偏离登记 + 测试 | ~0.3d |
| E16 entry-guard hook + 测试 | ~0.5d |
| 文档同步 | ~0.2d |
| **合计** | **~1.8d** |

略高于初估的 1.5d，主要因 A1 stables effect 扩展可能涉及现有接口探查（plan 阶段精确化）。
