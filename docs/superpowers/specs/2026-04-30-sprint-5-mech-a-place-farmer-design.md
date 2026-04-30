# Sprint 5 机制 A：useActionSpace(other) 真二次落子设计

**日期**: 2026-04-30
**Sprint**: 5（机制 A 子项）
**涉及卡**: A129 Swagman / B130 FullPeasant / B150 LargeScaleFarmer / B152 JuniorArtist
**Worktree**: `.worktree/sprint-5-mech-a-place-farmer`

## 1. 背景与问题

四张卡共用同一个 BGA 模式：玩家在格 X 落子后，可选支付 1 食物把同一 farmer "跳"到格 Y，让 Y 触发完整 action flow。BGA 用 `useActionSpaceNode($space, $farmer)` 把 farmer 真的移到第二格。

我们当前实现都是"内联 leaf flow 模拟"：listener 返回手写的 leaf flow（A129 把 grain-seeds 模拟成 `gainLeaf({grain:1})`、把 farm-expansion 模拟成 `OR(construct, stables)`；B130/B150 类似；B152 还为 traveling-players 写了 `zeroSpaceListener` 手动清空累积资源）。问题：

1. **不真落子，第二格累积资源不回收** — B152 的 zeroSpaceListener 是这个补丁的具体表现
2. **不触发其他卡的 onPlaceFarmer** — BGA 串联触发链断
3. **flag 模型未落地** — A129 / B130 / B150 都没在 listener 里 `setCardFlag(true)`，`ONE_JUMP_PER_TURN` ruling 实际无效
4. **每张卡要为每个目标格手写 leaf flow** — 加新 action 或改动 effect 时四张卡不自动跟进

## 2. 设计目标

- **机制层面**：把"二次落子"做成 place-farmer effect 的 `viaCardJump` 模式，4 张卡复用
- **完全无状态**：防递归靠 `actionContext.jumpChain` 透传，不引入新的 `cardStates` 字段、不改 `cardStates.flagged` 语义
- **贴 BGA 语义**：farmer 物理移动（第一格 takenBy 清、第二格 takenBy 加）；第二格触发完整 listener dispatch（包括其他卡的 onPlaceFarmer 监听）
- **范围 ROI**：只改 place-farmer 主路径里的一个分支 + 一个新 helper + 4 张卡 listener 重写。CLAUDE.md "新增可复用的通用扩展机制" 豁免

## 3. 核心 API

### 3.1 actionContext 形状

卡 listener 返回的 jump leaf：

```ts
{
  type: 'leaf',
  actionId: 'place-farmer',
  sourceCard: 'B130_FullPeasant',
  actionContext: {
    viaCardJump: true,
    sourceCard: 'B130_FullPeasant',
    workerId: '1',                // 必传：要移动的 worker
    targetSpaceId: 'fencing',     // 必传：跳转目的格
    // jumpChain 由 effect 在 execute 时自动累加，listener 不需要传
  }
}
```

**为什么 workerId 必传，不只传 fromSpaceId**：`space.takenBy: WorkerRef[]`，一格可能多 worker（hollow-4、ParallelFarmer 等），单 spaceId 反推 worker 不唯一。workerId → spaceId 反推唯一。

### 3.2 helper（新文件 `shared/cards/helpers/jump-leaf.ts`）

```ts
import type { ActionFlow } from '../../game/types'
import type { CardListenerContext } from '../card-listeners'

export interface JumpLeafParams {
  sourceCard: string
  workerId: string
  targetSpaceId: string
}

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

export const isJumpChainContains = (
  context: CardListenerContext,
  cardId: string,
): boolean => {
  const chain = context.actionContext?.jumpChain
  return Array.isArray(chain) && chain.includes(cardId)
}
```

### 3.3 place-farmer effect 改造

`shared/actions/effects/place-farmer.ts` 的 `execute` 头部加 jump 分支：

```ts
execute: ({ state, player, actionContext }) => {
  // ── jump 分支 ──
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

    // 防御性二次校验：用普通落子同一套可达性判定（含 computeArgs listener hook 扩展）
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

    // stats：jump 也算一次 farmer placement（与 game-core.ts:1936 takeAction 入口对齐）
    incPlacedFarmers(player)

    // 跑第二格 effect（可能返回 flow，engine 接管）
    return targetSpace.execute({ state, player, space: targetSpace })
  }

  // ── 原 fromSupply 分支 ──
  if (actionContext?.fromSupply) { ... }

  // ── 原标准 choice 分支 ──
  ...
}
```

**关键不变量**：

- `actionContext` 为引用，effect mutate 后 engine 在 `hooks.after`（`engine.ts:1490-1494`）调 `buildListenerEvent` 时 spread 出的 chain 是新值
- jump 分支不消耗 family pool（worker 已经 active）
- jump 分支不进入 choice 分支（targetSpaceId 已定）
- 第二格被 `addWorkerRef` 后视为已占（`isSpaceOccupied`），落地 `LANDS_ON_SECOND_SPACE` ruling
- `ONE_JUMP_PER_TURN` ruling 由 jumpChain 自检自然保证（同 farmer 一次落子链不会重复触发同一卡）
- **可达性与普通落子完全一致**：listener handler（弹 prompt 前）与 effect jump 分支（farmer 移动前）**都**用 `computeAllowedPlacementSpaces(state, player)` 作为唯一判定源，不写"半套"自定义可达性检查。`computeArgs` phase 的 listener hook 扩展（如未来某卡允许"已占可选"格）自动对 jump 生效，无需机制 A 单独适配。`computeArgs` listener 与机制 A 的 `after` listener phase 不同，不会自递归

**stats 系统交互**：

- `incPlacedFarmers(player)`：jump 也算 farmer 一次 placement（farmer 物理移到第二格 = 第二次落子）。`game-core.ts:1936` 在 takeAction 入口处 +1（对应第一格落子），jump 分支补一次（对应第二格落子）。**未补的话玩家 4 步行动里若有 1 jump，stats.placedFarmers 只 +4 不 +5，影响最终 stats 报表与依赖此字段的卡牌效果**
- 资源类 stats（`addResourcesFromBoard` / `addResourcesFromCards` / `incHarvestedGrain` 等）由 gain / collect / receive effect 自身在 `targetSpace.execute()` 路径里调用，jump 自然记数 — **不需要在 jump 分支重复调**
- `incRoomsBuilt` / `incMajorBuilt` / `incMinorBuilt` / `incOccupationBuilt` 由 construct / improvement / play-occupation effect 调用 — 同上，jump 跑 targetSpace.execute 时自然触发

### 3.4 listener 防递归

每张机制 A 卡 listener 第一行：

```ts
if (isJumpChainContains(context, CARD_ID)) return
```

**A→A 自跳防护**：A129 跳 farm-expansion → grain-seeds 后，effect 把 'A129' 加进 chain；grain-seeds 上的 dispatch 让 A129 listener 再次触发，自检 `chain.includes('A129')=true` 跳过 ✓

**A→B→A 间接循环防护**：A 跳后 chain=['A']；B 监听 grain-seeds 触发，跳回 farm-expansion，chain 累加为 ['A','B']；farm-expansion dispatch 让 A 触发，自检 `chain.includes('A')=true` 跳过 ✓

完全无状态、防任意长度循环。

## 4. 4 张卡 listener 改造

### 4.1 通用模板（B130 示例）

```ts
const TRIGGER_PAIRS: Record<string, string> = {
  'grain-utilization': 'fencing',
  fencing: 'grain-utilization',
}

const listener: CardListenerRegistration = {
  id: 'B130-full-peasant-after-place-farmer',
  cardIds: [CARD_ID],
  phases: ['after'],
  actions: ['place-farmer'],
  handler: (context): ActionHookResult | void => {
    if (isJumpChainContains(context, CARD_ID)) return

    const fromSpaceId = context.space?.id
    if (!fromSpaceId) return
    const targetSpaceId = TRIGGER_PAIRS[fromSpaceId]
    if (!targetSpaceId) return

    // 唯一可达性判定源：与普通落子一致（含 computeArgs listener hook 扩展）
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
          jumpLeaf({ sourceCard: CARD_ID, workerId: myRef.workerId, targetSpaceId }),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}
```

### 4.2 各卡差异


| 卡                     | 触发格 → 目标格映射                                             | 付费     | 第二格                     |
| --------------------- | ------------------------------------------------------- | ------ | ----------------------- |
| A129 Swagman          | farm-expansion ↔ grain-seeds                            | 0      | targetSpace.execute（标准） |
| B130 FullPeasant      | grain-utilization ↔ fencing                             | 1 food | 标准                      |
| B150 LargeScaleFarmer | farm-expansion ↔ major-improvement                      | 1 food | 标准                      |
| B152 JuniorArtist     | day-laborer → {lessons-4 / lessons / traveling-players} | 1 food | 标准                      |


**B152 特殊点**：

- 三选一目标格 → SEQ children 是 `[payLeaf, XOR(jumpLeaf×3)]`（每个候选目标一个 jumpLeaf，filter 掉不可达的）
- **外层 SEQ optional**（玩家可拒绝整个跳转）；**XOR 不 optional**（接受 SEQ 后必选一个目标，对应 BGA `B152.php:59-70` 的 NODE_XOR 不带 optional）
- 如果只有 1 个目标候选可用，`children.length === 1` 时退化为单 jumpLeaf（不包 XOR）
- lessons / lessons-4 candidate 仍要算 cost override（保留现有 `getLessonsCostForSpace` 逻辑用于"玩家是否买得起 occupation"前置过滤；jump 后 lessons.execute 里走标准 occupation purchase pipeline，cost override 由那条路径处理）
- traveling-players candidate：jump 后 traveling-players.execute 自然把 TP food 转给玩家并清空 — **删除现有 zeroSpaceListener**

### 4.3 删除项

每张卡都要删：

- `setCardFlag` / `isCardFlagged` 防递归相关代码（A129 是 onBeforeStartOfTurn cleanup；B130/B150/B152 没设过 flag，无遗留）
- 各种 `buildXxxFlow()` 内联 leaf 模拟函数
- B152 的 `zeroSpaceListener`

### 4.4 行数估算


| 卡                     | 当前行数 | 改造后 |
| --------------------- | ---- | --- |
| A129 Swagman          | 91   | ~30 |
| B130 FullPeasant      | 104  | ~30 |
| B150 LargeScaleFarmer | 101  | ~30 |
| B152 JuniorArtist     | 144  | ~50 |


## 5. UI 影响面

### 5.1 farmer 移动渲染

第一格 `removeWorkerRef` + 第二格 `addWorkerRef` 后状态广播会让前端看到 farmer 在两个快照间瞬移。

**第一阶段**：不做动画，状态自然驱动渲染。**post-机制 A TODO**：前端检测同 turn 内 `(playerId, workerId)` 跨 space 的位移，加 CSS transition / Framer Motion 动画。本 spec 不实施动画。

### 5.2 跳转 prompt（optional choice）

`SEQ optional` 在引擎里产生 optional choice pending。前端 PendingPanel 已渲染（靠 `choiceLabelKey`）。新增 i18n key：

- `cards.A129_Swagman.choice` — Swagman: 跳到 {targetSpace}? (free)
- `cards.B130_FullPeasant.choice` — Full Peasant: 付 1 food 跳到 {targetSpace}?
- `cards.B150_LargeScaleFarmer.choice` — 同上
- `cards.B152_JuniorArtist.choice` — 同上（XOR 三候选时各自显示目标）
- `log.cardJumpedToSpace` — `{player} 用 {cardName} 把 {worker} 跳到 {targetSpace}`

### 5.3 第二格"被占"显示

第二格 takenBy 有 worker 后，前端按现有规则渲染"被占" + 同回合后续玩家在 PlacementPanel 看到不可选。**不需要前端代码改动**。

### 5.4 第二格执行的二级 prompt

B130 跳 fencing → 玩家选 fence 段（fence flow 自身的 pending，已有）；B152 跳 traveling-players → 直接 gain food 无二级 prompt。机制 A 不引入新二级 pending 类型。

## 6. 测试策略

### 6.1 单元测试 — `shared/actions/effects/__tests__/place-farmer-jump.test.ts`（新）

- worker 在 fromSpace 时，jump 后第一格 takenBy 清、第二格 takenBy 含 ref、recordRoundPlacement 多一条
- workerId 不存在 → fail
- targetSpaceId 不存在 → fail
- jumpChain 累加：从 undefined → ['CardX']
- jumpChain 累加：从 ['CardA'] → ['CardA','CardX']
- **stats**：jump 前 `player.stats.placedFarmers === N`，jump 后 `=== N+1`

### 6.2 helper 单元测试 — `shared/cards/helpers/__tests__/jump-leaf.test.ts`（新）

- `jumpLeaf({...})` 返回的 ActionFlow 形状 snapshot
- `isJumpChainContains` 各种 chain 状态返回值正确（undefined / [] / 含 / 不含）

### 6.3 Session 测试（每张卡，复用现有 spec 文件）

每张卡至少测：

1. **触发 + 接受**：第一格落子 → pending=choice (optional jump) → accept → 第一格 takenBy 空、第二格 takenBy 有该 worker、第二格效果资源正确到位、log 含 jump 条目、`player.stats.placedFarmers` 比第一格落子前 +2（一次入口 + 一次 jump）
2. **触发 + 拒绝**：accept 时选不跳 → 状态完全不变（食物不扣 / 第二格不动）；`stats.placedFarmers` 只 +1
3. **食物不够**（B130/B150/B152）：玩家 food=0 → pending=none，listener 不返回 flow；`stats.placedFarmers` +1
4. **第二格被占且不在 allowed 列表**：另一玩家先放第二格 → `computeAllowedPlacementSpaces` 不含第二格 → listener 不返回 flow，pending=none
5. **`canBeExecutedByPlayer` 拒绝**：B150 跳 major-improvement 玩家无任何 major 可买 → `computeAllowedPlacementSpaces` 不含 major-improvement → 不弹 prompt
6. **可达性扩展生效**（前向兼容验证）：注册 stub 卡 X 在 `computeArgs` phase 注入 `<TARGET>:<targetSpaceId>` 的 OCCUPIED extraOption（即使第二格已占），断言 jump listener 仍弹 prompt → effect 也接受跳转。本场景验证机制 A 与"已占可选"主路径扩展自动协同
7. **listener 进入时通过、jump 时被否决**（防御性二次校验）：构造 stub state 让 listener 进入后 state 改变（如对手在 hooks 中突然占用第二格 — 真实场景几乎不发生但要测 fail 路径），断言 effect 返回 fail 而非 partial state 污染

### 6.4 防递归 session 测试 — `server/__tests__/place-farmer-jump-recursion.test.ts`（新）

- **自跳防护**：玩家落 A129 触发格 → 接受跳转 → 第二格 dispatch 时 A129 不再触发（用 log 计数 / cardStates 痕迹断言只跳 1 次）
- **间接循环防护**：注册 1 张测试 stub 卡 X 监听 A129 的目标格、构造跳回 A129 的源格；玩家落子 → A 跳 → X 跳回 → A 检测 chain.includes('A129')=true 终止；断言总跳数 ≤ 2

### 6.5 串联触发链 session 测试

注册测试 stub 卡 `__test_grain_seeds_observer_`_，监听 `place-farmer after` + `space.id='grain-seeds'`，handler 写痕迹到 cardStates。

- 玩家直接落 grain-seeds → 痕迹被设
- 玩家落 farm-expansion → A129 跳过去 → 痕迹**也**被设（验证 second-place dispatch 跑了，"Y 选项" 落地）

### 6.6 现有测试更新

`shared/cards/__tests__/place-farmer-cards.test.ts` 等含这 4 张卡的测试要重新跑 + 调整断言（旧测试断言"虚拟跳转"语义；新机制下加"farmer 物理移动"断言）。

### 6.7 fast / slow 项目分配

- 单元测试（jump effect / helper）→ `fast`
- 卡 session 测试 → `slow`（沿用现有）
- 防递归 + 串联触发链测试 → `slow`

## 7. 风险点 / 待验证假设


| 假设                                                                                                                                                                                    | 验证方式                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `actionContext` 是 plain object 且 mutate 安全（不被 engine 序列化/克隆掉）                                                                                                                         | 单测：execute 内 mutate 后，hooks.after 看到的 ctx.actionContext.jumpChain 为新数组                                                            |
| `targetSpace.execute()` 返回 flow 时被 engine 正确 insertAfter 当前 leaf                                                                                                                      | session 测：B150 跳 major-improvement，玩家收到买 major 的 pending                                                                          |
| `workerId` 在玩家内全局唯一                                                                                                                                                                   | 看 `smallestAvailableWorker` 实现（已确认）                                                                                               |
| `recordRoundPlacement` 第二次调用不破坏数据结构                                                                                                                                                   | 单测                                                                                                                                |
| jump 期间引擎中断（玩家选 cancel 整个 SEQ）状态一致                                                                                                                                                    | session 测：optional SEQ 拒绝时第一格 takenBy 不变                                                                                          |
| `actionContext` 可能被引擎 clone 进 pendingChoiceContext（engine.ts:1457-1462 / 1576-1581 / 1586-1591）— 若是浅 clone，mutate 仍生效；若深 clone 则 jumpChain 累加丢失                                       | 单测：B130 接受 optional 跳转后，jumpChain 累加可见于第二格 listener                                                                               |
| jump leaf execute 后 `hooks.after` dispatch 时，listener 收到的 `context.space` 指向第一格还是 targetSpace？若仍指向第一格，listener 内 `context.space?.id === '<targetSpaceId>'` 检查会失败，串联触发链（§3.4 选项 Y）落不了地 | 串联触发链 session 测试（§6.5）即在验证此假设；若失败，需在 jump leaf execute 内显式构造新 executionContext.space 或在 buildListenerEvent 增加跨 leaf space 透传      |
| `recordRoundPlacement(player, targetSpace.id, workerId)` 同 workerId 在同一回合记录两次：`getRoundPlacementOrder` / `getRoundPlacementOrderEntries` 是否假设 workerId 唯一不重复？若有此假设，jump 后会破坏数据结构      | 看 `shared/cards/helpers/round-placement.ts` 实现；单测：jump 后 `getRoundPlacementOrder(player)` 返回 `[firstSpaceId, targetSpaceId]` 顺序正确 |
| 其他依赖 `stats.placedFarmers` 的下游（卡牌效果 / 评分 / 报表）是否对"jump 算第二次 placement"的语义有意见？BGA 把 jump 算入 farmer count，我们对齐 BGA 即可，但要验证我们仓库内没有"按 placedFarmers 等于落子轮数"的代码假设         | grep `stats.placedFarmers` 所有引用，若有"等于实际行动数"的依赖要重新评估；目前 §6.1 / §6.3 的 stats 断言会暴露任何下游 bug                              |
| `computeAllowedPlacementSpaces` 在 jump 场景被调用两次（listener 进入 + effect 二次校验），每次都会跑 `computeArgs` phase 全部 listener hook —— 性能开销与潜在副作用（hook 内不该有 side effect 但可能有） | 单测：mock listener 计数器，断言 jump 一次跳转最多触发 N 次 computeArgs（接受场景 = listener 进入 1 次 + effect 1 次 = 2 次，可接受） |


## 8. 范围与排除项

### 8.1 范围内

- jump leaf helper 新文件
- place-farmer effect jump 分支
- 4 张卡 listener 重写、删 zeroSpaceListener / setCardFlag 残余
- 新增 5 条 i18n key（zh-CN + en）
- 单元 / session / 防递归 / 串联触发链测试
- 文档同步：`docs/card_progress.md` §2.0 / §2.3 / §7 / §8、`docs/master-plan.md` §8、`docs/ENGINE_ARCHITECTURE.md` 加一节

### 8.2 明确排除

- **farmer 移动动画**：登记成 TODO，后续 PR 处理
- **机制 B / C / D**：alternative-cost trades / meeple-id obtain / turn-edge phase — 各自独立 sprint
- `**countAsUse` 行为模型**：BGA 用来标记"该 farmer 已行动完毕"，影响某些卡判定；4 张机制 A 卡都不依赖这个标记，未来发现某卡需要再补
- **未参与机制 A 但监听 place-farmer 的卡**：不需要改，它们看到 second-place dispatch 时 actionContext.jumpChain 字段对它们的 listener handler 没有副作用

## 9. 文档同步具体内容

### 9.1 `docs/card_progress.md`

- §2.0 加一行：`2026-04-30 Sprint 5 mech-A — A129/B130/B150/B152 改用真二次落子机制 + place-farmer jump 模式 (actionContext.viaCardJump + jumpChain 自动累加)`
- §2.3 把 4 张卡从 `useActionSpace(other) semantic` 待修列表移除，标 ✅ Sprint 5 mech-A
- §7 基础设施加一条：`place-farmer jump mode (actionContext.viaCardJump + jumpChain 累加防递归 + LANDS_ON_SECOND_SPACE ruling 落地)`
- §8 时间线加新行（日期 + Tier 数 + 实现数变化）

### 9.2 `docs/master-plan.md` §8

- Sprint 5 行 "partial done (7/28)" 更新为 "partial done (11/28; PR-5 + mech-A)"
- PR/Commit 列加新分支 `sprint-5-mech-a-place-farmer` 或 PR 号

### 9.3 `docs/ENGINE_ARCHITECTURE.md`

加一小节（在 hooks 协议附近）：

- 标题：`place-farmer jump mode`
- 内容：`actionContext.viaCardJump=true` 时 place-farmer effect 进入 jump 分支；必传 `sourceCard` / `workerId` / `targetSpaceId`；effect 自动累加 `jumpChain` 数组（mutate actionContext）；listener 用 `isJumpChainContains(context, CARD_ID)` 自检防递归；语义对应 BGA `useActionSpaceNode($space, $farmer)`（farmer 物理移动 + LANDS_ON_SECOND_SPACE + ONE_JUMP_PER_TURN）

## 10. 提交粒度

- commit 1: place-farmer effect jump 分支 + jumpLeaf helper + 单元测试
- commit 2: A129 改造 + session 测试更新
- commit 3: B130 改造 + session 测试更新
- commit 4: B150 改造 + session 测试更新
- commit 5: B152 改造（含删 zeroSpaceListener）+ session 测试更新
- commit 6: 防递归 / 串联触发链测试 + i18n
- commit 7: 文档同步（card_progress + master-plan + ENGINE_ARCHITECTURE）

每 commit 单独跑 `pnpm test:fast` + `pnpm run lint` + `pnpm run build`，全绿才 push。push 后等 GitHub Actions 通过。