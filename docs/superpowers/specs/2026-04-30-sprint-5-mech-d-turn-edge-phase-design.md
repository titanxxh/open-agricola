# Sprint 5 机制 D：B27 Toolbox turn-edge BGA 对齐设计

**日期**: 2026-04-30
**Sprint**: 5（机制 D 子项）
**涉及卡**: B27 Toolbox（直接），间接受益的同类 wide-scan 卡未来可借鉴
**Worktree**: `.worktree/sprint-5-mech-d-turn-edge-phase`

## 1. 背景与问题

机制 D 最初设想为"新增 hook phase `'afterTurn'`"统一处理 turn 边界触发的卡。但探索现有代码后发现：

- **`CardEffectHook` 列表已含 `'onEndTurn'`**（`shared/cards/card-effects.ts:27,60`）
- **`game-core.ts:1348-1353` 的 `continueEndTurnHooks` 已经在每次 `takeAction` 真正结束时 dispatch onEndTurn**
- **`D74_RoyalWood`** 已经在用 `effect.onEndTurn`（每 turn 结束按本 turn 木头消耗返还），范例可参考

所以 spec 实际工作量从"新 hook phase + dispatch 改造 + once-per-token + listener 扩展"缩减为：**B27 单卡 BGA 对齐 + 1 个新 helper**。约 0.5 day。

### 1.1 B27 当前 bug

`shared/cards/B/B27_Toolbox.ts` 现状：listener 直接在 `'after'` phase + `actions=['construct', 'build-stables', 'fencing']` 的每个事件触发，每修一面墙、每放一格 stable、每段围栏都立刻弹"买 Joinery / Pottery / Basket"prompt。一次行动里多次干扰。

### 1.2 BGA 行为

`output/bga-agricola/.../B27_Toolbox.php`：

- `onStables` / `onConstruct` / `onFencing` 时只 `setFlag(true)`
- `onPlayerAfterPlaceFarmer` + `onOpponentAfterPlaceFarmer`（即下一次任意玩家落子边界）才检查 flag → 弹买 major prompt + `unflag`
- `onBuy`（B27 刚被打出瞬间）：检查 `numStablesBuiltThisTurn / hasBuiltFencesThisTurn / roomTypeBuiltThisTurn` — 已造过 → setFlag；未造过 → unflag（覆盖跨 turn 残留）

含义：本 turn 内造了 ≥1 房 / 围栏 / stable，turn 边界（下次落子前）合并弹一次。

## 2. 设计目标

- 用现有 `effect.onEndTurn` 替代每次 action 都触发的 prompt
- 用现有 `effect.onBuy` 处理 B27 在手里时玩家先造、再打出 B27 的 BGA 边界
- 复用现有 `actionToken` snapshot helper（`getRoomsBuiltThisAction` / `getStableTilesBuiltThisAction`）；新增 `getFencesBuiltThisAction`
- **不动主路径**：不新增 hook phase、不改 game-core、不改 engine、不改 listener 系统

## 3. 核心实现

### 3.1 `action-snapshot.ts` 加 fenceSegments 快照 + 新 helper

`shared/cards/helpers/action-snapshot.ts`：

```ts
import type { PlayerState } from '../../game/types'
import { ensureCardState } from './card-state'

const ACTION_SNAPSHOT_CARD_ID = '__actionSnapshot__'

export const recordActionSnapshot = (player: PlayerState, token: number) => {
  const cardState = ensureCardState(player, ACTION_SNAPSHOT_CARD_ID)
  cardState.extraData = {
    token,
    stableTiles: player.stableTiles.length,
    roomTiles: player.roomTiles.length,
    fenceSegments: player.fenceSegments.length,   // ← 新增
  }
}

// 现有 readActionSnapshotToken / getStableTilesBuiltThisAction / getRoomsBuiltThisAction 不变

export const getFencesBuiltThisAction = (player: PlayerState) => {        // ← 新 helper
  const before = player.cardStates?.[ACTION_SNAPSHOT_CARD_ID]?.extraData?.fenceSegments as number | undefined
  if (typeof before !== 'number') return 0
  return Math.max(0, player.fenceSegments.length - before)
}
```

向后兼容：纯增字段；现有读 `stableTiles` / `roomTiles` 的代码完全不受影响。

### 3.2 B27_Toolbox.ts 完整重写

```ts
import { MinorImprovement } from '../types'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../game/types'
import { isCardFlagged, setCardFlag } from '../helpers/card-state'
import {
  getRoomsBuiltThisAction,
  getStableTilesBuiltThisAction,
  getFencesBuiltThisAction,
} from '../helpers/action-snapshot'
import type { CardImpl } from '../registry'

const CARD_ID = 'B27_Toolbox'
const ALLOWED_MAJORS = ['Major_Joinery', 'Major_Pottery', 'Major_Basket']

const setFlagHandler = (context: CardListenerContext): ActionHookResult | void => {
  if (context.state.roundPhase !== 'work') return
  setCardFlag(context.player, CARD_ID, true)
}

const setFlagListeners: CardListenerRegistration[] = [
  { id:'B27-flag-construct', cardIds:[CARD_ID], phases:['after' as ActionHookPhase], actions:['construct'],     handler: setFlagHandler },
  { id:'B27-flag-stables',   cardIds:[CARD_ID], phases:['after' as ActionHookPhase], actions:['build-stables'], handler: setFlagHandler },
  { id:'B27-flag-fencing',   cardIds:[CARD_ID], phases:['after' as ActionHookPhase], actions:['fencing'],       handler: setFlagHandler },
]

const builtSomethingThisAction = (player: import('../../game/types').PlayerState): boolean =>
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

### 3.3 关键不变量

- **flag 在 onEndTurn handler 内立即清**：`setCardFlag(player, CARD_ID, false)` 写在 return flow 之前，防御 effect.onEndTurn 万一被多次 dispatch（即使 game-core 已经保证一次性，更显式更稳）
- **work phase guard 放在 setFlag handler + onBuy**：onEndTurn 不需要再检查（game-core 只在 work phase 跑 takeAction → onEndTurn 自然只在 work phase 触发；但如果未来 dispatch 时机变化，多一道防御无害，可选加）
- **跨 turn flag 残留**由 onBuy 总重设覆盖：玩家在 turn 1 已造过、设了 flag、但没打出 B27；turn 2 玩家打出 B27 时 onBuy 检查的是**当前 action token 的快照差**，差量 = 0（本 takeAction 没造） → 调 setCardFlag(player, false) 清掉残留 ✓
- **机制 A jump 不重复触发**：jump 是 SEQ 内部继续，takeAction 函数没返回；onEndTurn 仅在 takeAction 真正完成才 dispatch（一次行动一次 onEndTurn，含 jump 后的全部 SEQ 跑完）

### 3.4 与机制 A jump 的交互

机制 A jump（`actionContext.viaCardJump`）让 farmer 移到第二格、跑第二格完整 ActionNode 路径，这一切都在原 takeAction 的 step loop 内。`continueEndTurnHooks` 只在 step loop 真正完成后调。所以：

| 场景 | onEndTurn 触发 |
|---|---|
| takeAction(farm-expansion) → 修房 → SEQ 完成 | 1 次（看 flag → 弹 prompt） |
| takeAction(farm-expansion) → 修房 → B150 jump 到 major-improvement → 玩家买 major | 1 次（jump 不打断 step loop） |
| takeAction(grain-seeds) → A129 jump 到 farm-expansion → 修房 → SEQ 完成 | 1 次（jump 后造的房也算"本 takeAction 内造的"，setFlag listener 在 jump 第二格的 dispatch 里照常触发 → flag set → onEndTurn 弹 prompt） |

## 4. 测试策略

### 4.1 Session 测试 — `server/__tests__/B27_Toolbox-session.test.ts`（新文件）

setup helper：

```ts
const setup = (opts?: { played?: boolean; food?: number; round?: number }) => {
  const session = new GameSession(/* seed */ 1)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = opts?.round ?? 5
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.resources = { ...player.resources, food: opts?.food ?? 5, wood: 20, clay: 20, reed: 20, stone: 20 }
  if (opts?.played ?? true) player.minorPlayed.push(CARD_ID)
  else player.minorHand = [CARD_ID]
  session.loadState(state)
  return session
}
```

**场景 1：已 played + 修房 → onEndTurn 弹一次买 major**

- setup({ played: true })
- takeAction(0, 'farm-expansion') → 选 construct → 选房间位置
- 期望：整个 SEQ 完成、onEndTurn dispatch → pending = choice (含 Major_Joinery / Pottery / Basket + skip)
- 断言 `cardStates['B27_Toolbox'].flagged === false`（onEndTurn handler 已清）
- **断言 prompt 不在 SEQ 中间出现**（确认 listener 不再每次 construct 都弹）

**场景 2：B27 未 played + 通过 lessons 链式打出（人工构造 onBuy）**

- setup({ played: false })
- 直接调 `B27_Toolbox_impl.effect.onBuy!(state, player)` 测试两个分支：
  - **2a 跨 turn 残留覆盖**：手工设 `cardStates['B27_Toolbox'].flagged = true`、recordActionSnapshot 让本 action 差量 = 0 → 调 onBuy → 断言 flagged === false
  - **2b 本 turn 已造过**：手工 recordActionSnapshot 后增加 player.roomTiles.length（模拟"已造过"），调 onBuy → 断言 flagged === true

**场景 3：什么都没造 → onEndTurn 不弹**

- setup({ played: true })
- takeAction(0, 'grain-seeds')（gain 1 grain，不修房 / 围栏 / stable）
- 断言 setFlag listener 没触发 → flagged === false → onEndTurn 不返回 flow → pending != choice with major options

**场景 4：跨 turn flag 不残留**

- turn 1：takeAction(0, 'farm-expansion') → construct → onEndTurn 弹 prompt → 选 skip → flag 清
- 推进 turn（confirmNextPlayer + 下一玩家 + 回到 player 0）
- turn 2：takeAction(0, 'grain-seeds') → 断言 onEndTurn 不弹（flag 是 false）

**场景 5：机制 A jump + B27 共存**

- setup({ played: true }) + 持有 B150_LargeScaleFarmer played
- takeAction(0, 'farm-expansion') → construct（修房）→ B150 jump 到 major-improvement → 玩家买一个 major
- 整个 SEQ 完成 → onEndTurn 弹 B27 买 major prompt
- 关键断言：onEndTurn 仅触发 1 次（不会被 jump 中间状态误触发）；玩家最终能选两个 major（一个 B150 路径买的、一个 B27 onEndTurn 弹的）

### 4.2 单元测试更新

- `shared/cards/helpers/__tests__/action-snapshot.test.ts`（如已存在）加 `getFencesBuiltThisAction` 测试：
  - 0 段围栏起始 → fenceSegments.length 增加 N → 返回 N
  - 没记快照（before === undefined） → 返回 0
- recordActionSnapshot 多记 fenceSegments 字段，向后兼容（其他测试不需要改）

### 4.3 fast / slow 项目分配

- B27_Toolbox-session.test.ts → `slow` project（沿用现有单卡 session 测试惯例）
- action-snapshot.test.ts → `fast`

## 5. 范围与排除项

### 5.1 范围内

- `action-snapshot.ts` 加 fenceSegments 字段 + `getFencesBuiltThisAction` helper
- `B27_Toolbox.ts` 重写（删原 4 个 makeToolboxFlow listener，改 setFlag listener + effect.onBuy + effect.onEndTurn）
- 5 个 session 测试场景
- helper 单元测试
- 文档同步：`card_progress.md` §2.0 / §2.3 / §7

### 5.2 明确排除

- **新 hook phase `'afterTurn'`**：复用现有 `effect.onEndTurn`，不需要新 phase
- **listener 系统 `triggerInHand` 扩展**：B27 用 `effect.onBuy` 回查即可（BGA 同款）；listener 系统不改
- **`handHooks` opt-in for onEndTurn**：B27 不需要在手里时 dispatch onEndTurn（弹买 major prompt 在 B27 未 played 时无意义）
- **wide-scan 类似 BGA `onPlayerAfterPlaceFarmer` 卡的 turn-edge 化**：那些卡大部分是"每次 farmer 落子都响应"语义（不是 turn-edge 合并），用现有 listener `actions:['place-farmer']` 即可；不在本 spec 范围
- **跨 turn 残留 flag 的 actionToken-based 防护**：onBuy 总重设 flag 已经覆盖此场景

### 5.3 风险点

| 假设 | 验证方式 |
|---|---|
| `effect.onEndTurn` 在每次 takeAction 末尾必触发（不只 D74 那种"自己玩家 own action"） | 看 `continueEndTurnHooks` 调用路径；session 测试场景 3 "无操作 turn" 验证 |
| `effect.onEndTurn` handler 返回 flow 后引擎正确把 flow 拼到当前 takeAction 响应（玩家立刻看到 prompt） | session 测试场景 1 |
| `fenceSegments.length` 是 BGA `hasBuiltFencesThisTurn` 的等价信号（≥ 1 段算"造过围栏"） | 围栏构建路径（fence effect）的端到端测试已经覆盖；本 spec 测试通过 `getFencesBuiltThisAction(player) > 0` 等价判断 |
| `recordActionSnapshot` 现有调用点（`game-core.ts:1930`）多记一字段无副作用 | 加 fenceSegments 是纯增字段；未读取它的代码完全不受影响 |
| 机制 A jump 与 B27 共存时 onEndTurn 不在 jump 中间触发 | session 测试场景 5 |

## 6. 文档同步

### 6.1 `docs/card_progress.md`

- §2.0 加一行：`2026-04-30 Sprint 5 mech-D — B27 Toolbox BGA 对齐：用 effect.onEndTurn / effect.onBuy + 新 getFencesBuiltThisAction helper 替代每次 construct/stables/fencing 都弹 prompt 的旧实现`
- §2.3 把 B27 从 "Sprint 5 PR-5 deferred (21 cards)" 移除，标 ✅ Sprint 5 mech-D
- §7 基础设施加一条：`getFencesBuiltThisAction (action-snapshot per-action 围栏增量) + recordActionSnapshot 含 fenceSegments 字段`
- §8 时间线加新行（实现数 / Tier 数变化按 §1 总览数字更新）

### 6.2 `docs/master-plan.md` §8

- Sprint 5 行 "partially done (11/28; PR-5 + mech-A)" 更新为 "partially done (12/28; PR-5 + mech-A + mech-D)"
- PR/Commit 列加新分支 `sprint-5-mech-d-turn-edge-phase` 或 PR 号

### 6.3 不需要改 `docs/ENGINE_ARCHITECTURE.md`

机制 D 不引入新架构概念（用现有 effect.onEndTurn / handHooks），不需要文档同步。

## 7. 提交粒度

- commit 1: `feat(action-snapshot)`: 加 fenceSegments 快照 + getFencesBuiltThisAction helper（含单元测试）
- commit 2: `refactor(B27)`: 用 effect.onBuy + onEndTurn 替代 per-action prompt（含 session 测试 5 场景）
- commit 3: `docs`: card_progress / master-plan 同步

每 commit 单独跑 `pnpm test:fast` + `pnpm run lint` + `pnpm run build` 全绿才下一步。push 到 main 走 fast-forward（如果工作树干净）。
