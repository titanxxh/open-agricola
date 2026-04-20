# Card Draft — Simultaneous Mode Design

**日期：** 2026-04-20
**作者：** @titanxxh + Claude
**状态：** Draft，待 review 后进实施计划

---

## 1. 目标

在游戏开始时，增加一个"卡牌 draft 阶段"——玩家不再一次拿到 7 occ + 7 minor 固定随机手牌，而是通过**并行轮传**的方式，每轮主动挑选自己要留的 1 个 occupation + 1 个 minor improvement，剩余池传给下家。经 7 轮后每人仍然拿到 7 occ + 7 minor，但每张卡都经过所有玩家过目，带来显著的竞技深度。

## 2. 范围

### Scope（PR-5 内）

- **Draft 模式**：`simultaneous`（合并池，每轮同时挑 1 occ + 1 minor）
- **并行玩家动作**：server 端 `DraftManager` 支持 N 个玩家同时提交，全员提交后原子推进
- **状态机**：`GameState.phase: 'draft' | 'playing'`，`draft: DraftState | null`
- **协议扩展**：`ClientCommand.draftSubmit`、`ServerEvent` 通过现有 `stateUpdate` 通道
- **Lobby 选项**：`draftMode: 'none' | 'simultaneous'`，默认 `'none'` 保持现有房间向后兼容
- **前端 UI**：draft overlay 组件——当前可选 pool、已挑卡、等待状态
- **持久化**：draft 阶段的中间状态（pool / picks / pendingPicks）序列化后能从 sqlite / JSON 恢复
- **2/3/4 人局支持**

### Not-in-scope（延后到后续 PR）

- **手牌隐私真修复**：已登记 issue [#7](https://github.com/titanxxh/open-agricola/issues/7)。PR-5 MVP 沿用现有"信任式"同步（broadcast full state，client 不渲染对手 pool）
- **BGA 其它 draft 模式**（PICK_N_OUT_OF_M、OCCUPATION_FIRST、LIVING_HAND 等）
- **方向交替**（当前 MVP 固定顺时针）
- **lobby UI 精细化**（当前 lobby 用简单 select 即可）
- **Draft 策略提示 / AI**

## 3. 机制（玩家视角）

### 3.1 开局

1. 玩家在 lobby 选 `draftMode: simultaneous`，开始房间
2. 服务器按玩家数量发牌：每人 7 张 occupation + 7 张 minor（deck 规则遵循现有 `dealHands`）
3. `phase` 设为 `'draft'`，`round` 设为 1（1-indexed，共 7 轮）
4. 每玩家看到自己的 14 张 pool，但不能看对手池
5. 游戏主流程（round counter、action spaces 等）**未启动**

### 3.2 Draft 每轮

一轮的原子流程：

1. 每玩家独立挑 **1 张 occupation + 1 张 minor**
2. 客户端 `draftSubmit` 提交给 server
3. Server 记录到 `draft.pendingPicks[playerId]`
4. 当所有玩家都提交后，server 原子执行：
   - 挑中的卡入玩家 `draft.kept[pid]`
   - Pool 剩余部分顺时针传给下家（座位顺序）
   - `round++`
   - `pendingPicks` 清空
   - 同步状态广播
5. 若 `round === 8`，执行"进入对局"流程（见 3.3）

### 3.3 进入对局

1. 把 `draft.kept[pid]` 写入 `player.occupationHand` / `player.minorHand`
2. `phase = 'playing'`，`draft = null`
3. 启动 round 1 正常流程

### 3.4 玩家交互

- **视觉**：Draft Overlay 模态覆盖在游戏板上方；关闭 overlay 后可看到未启动的游戏板背景
- **挑牌**：点击 occ 行中 1 张（高亮）+ 点击 minor 行中 1 张（高亮），下方"确认"按钮激活
- **已提交**：挑完确认后，overlay 进入"等待其他玩家"态，显示各玩家提交状态（✓ / pending）
- **进度**：顶部显示"Round N / 7"；下方有 draft 历史（自己已挑卡列表）

## 4. 架构

### 4.1 代码布局

```
shared/draft/
  types.ts             # DraftState、DraftMode、DraftPickPayload 等类型
  draft-manager.ts     # 纯函数：processSubmit(state, pid, pick) → {state, done}
  draft-serialization.ts  # (optional) 如果 GameState 序列化需要单独处理
shared/draft/__tests__/
  draft-manager.test.ts

server/game/
  authoritative-session.ts  # 扩展：接收 draftSubmit，调 draft-manager

server/game/__tests__/
  draft-session.test.ts

client/app/draft/
  DraftOverlay.tsx     # 主组件
  DraftPoolRow.tsx     # occ / minor 一行
  DraftHistoryPanel.tsx

client/app/PageRouter.tsx  # 检测 phase === 'draft' 渲染 overlay
```

**关键原则**：所有 draft 逻辑隔离在独立文件，主 `shared/actions/` 与 `shared/engine/` 零改动。风险点全部集中在 `shared/draft/` 和 `client/app/draft/` 两个新目录。

### 4.2 数据模型

```ts
// shared/draft/types.ts

export type DraftMode = 'none' | 'simultaneous'

export type DraftState = {
  mode: 'simultaneous'
  round: number               // 1..7
  totalRounds: number         // 7
  // 每个玩家当前手上的 pool（这轮开始时他看到的 N 张 occ + N 张 minor）
  pools: Record<string, {
    occ: string[]
    minor: string[]
  }>
  // 每个玩家已经留下的卡（累计）
  kept: Record<string, {
    occ: string[]
    minor: string[]
  }>
  // 当前轮每玩家的提交（null = 未提交）
  pendingPicks: Record<string, {
    occ: string | null
    minor: string | null
  }>
  // 座位顺序 playerId[]（顺时针传池用）
  seatOrder: string[]
}

export type DraftPickPayload = {
  occCardId: string
  minorCardId: string
}
```

`GameState` 扩展：

```ts
// shared/game/types.ts
type GameState = {
  // ... 现有字段
  phase: 'draft' | 'playing'  // 新字段，默认 'playing'
  draft: DraftState | null     // 新字段
}
```

**Backward compat**：所有现有 `createInitialState` 调用默认 `phase: 'playing'` + `draft: null`，现有 2280+ 测试零破坏。

### 4.3 协议扩展

```ts
// shared/protocol/ws.ts
type ClientCommand =
  | /* 现有 */
  | { type: 'draftSubmit'; occCardId: string; minorCardId: string }

// ServerEvent 复用现有 stateUpdate（payload 含完整 GameState）
```

HTTP `/api/game/draft-submit`（镜像 WS 的 draftSubmit），用于单机调试。

### 4.4 DraftManager 核心

```ts
// shared/draft/draft-manager.ts

export function initDraftState(
  seatOrder: string[],
  hands: Record<string, { occ: string[]; minor: string[] }>,
  totalRounds = 7,
): DraftState

export function processSubmit(
  draft: DraftState,
  pid: string,
  pick: DraftPickPayload,
): { draft: DraftState; error?: string }

/**
 * 如果本轮所有玩家都已提交，原子推进：移 picks 入 kept，旋转池，round++，清 pending。
 * 否则返回原 draft 不变。
 */
export function tryAdvanceRound(draft: DraftState): {
  draft: DraftState
  advanced: boolean
  finished: boolean
}

/**
 * Draft 完成时把结果写回 GameState。
 */
export function finalizeDraft(state: GameState): GameState
```

所有函数纯净、不 mutation（用 immer-style 或手动 clone），便于测试。

### 4.5 Session 集成

`server/game/authoritative-session.ts` 扩展：

```ts
class GameSession {
  submitDraftPick(playerId: string, pick: DraftPickPayload): SessionResponse {
    // 1. 校验 phase === 'draft'、pick 里两张卡都在该玩家当前池中
    // 2. draft-manager.processSubmit → 更新 draft state
    // 3. tryAdvanceRound
    //    - 未满：返回 ok，等其他玩家
    //    - 已满：移入 kept，旋转，round++
    //    - 7 轮满：finalizeDraft → phase='playing' → 启动 round 1
    // 4. 持久化（如需）
    // 5. 返回 SessionResponse { ok, state, pending, ... }
  }
}
```

### 4.6 Pending 模型

为了让 UI 知道"正在 draft"，`pending` 字段扩展：

```ts
type PendingAction =
  | /* 现有 none / choice / animalReorg / harvestFeed */
  | { type: 'cardDraft'; round: number; totalRounds: number; myPending: boolean }
```

- `myPending: true` = 当前查看的玩家本轮未提交
- `myPending: false` = 已提交，等其他玩家

`pending` 是对单个玩家视角的，和现有 `pending` 单玩家语义一致，不引入 "pendingByPlayer Map"。Server 在广播时为每玩家计算 `myPending`（因为 broadcast 目前是同 payload 给所有玩家，MVP 在 client 端用 `state.players[meId].hasSubmittedThisRound` 逻辑派生——具体实现见 4.7）。

**细节**：为避免 "同 state 派生 pending 因玩家不同"的复杂性，MVP 采用：
- `state.draft.pendingPicks[pid].occ !== null && minor !== null` 表示该玩家已提交
- Client 组件 render 时用 `state.draft.pendingPicks[meId]` 判 `myPending`
- 顶层 `pending` 字段仅表达"游戏处于 draft 模式"，具体"谁待提交"由 `draft.pendingPicks` 现场查

### 4.7 客户端视角

- `GameContainerApi` 收到 `state.phase === 'draft'` 时，渲染 `<DraftOverlay />` 覆盖层
- `DraftOverlay` 从 `state.draft.pools[meId]` 读自己 pool、从 `state.draft.kept[meId]` 读已挑卡
- 其他玩家的 pool：MVP 技术上能看到（issue #7），但 UI 不渲染
- 挑牌 UX：单击高亮，"确认"按钮同时发一个 `draftSubmit` 带 `(occCardId, minorCardId)`；发送后 UI 显示等待态；收到 state update 后若 `pendingPicks[meId].occ !== null` 则保持等待态
- 推进到下一轮：`state.draft.round` 增加，`pools[meId]` 变成新的 6 张（上轮剩余 + 从逆时针来的）；UI 重新激活挑选交互

### 4.8 房间生命周期

1. `createRoom` 带 `draftMode: 'simultaneous'` 选项
2. `startGame` 时：
   - 若 `draftMode === 'none'`：现有路径，直接 `phase='playing'`
   - 若 `draftMode === 'simultaneous'`：发牌到临时 pool 而非 hand，初始化 `draft`，`phase='draft'`
3. Draft 中 `dissolveRoom` / reconnect 走现有逻辑（state 持久化已含 draft，reconnect 直接恢复）

## 5. 协议与持久化

### 5.1 协议变更

- `ClientCommand` union 增加 `draftSubmit`
- `StateUpdateCause` 增加 `'draftSubmit'`（可选；复用 `'action'` 也行）
- `GameState` 序列化已经通过 `SerializedGameState` 自动覆盖 `phase` + `draft` 字段（都是纯数据，无 callback）

### 5.2 持久化

- `sqlite`：`serializeState` 产出已含 `draft`，`rehydrate` 自然 passthrough。无需 schema 改动
- `JSON`：同上

### 5.3 Transport 层

- `GameTransport.draftSubmit(playerId, occCardId, minorCardId): Promise<SessionResponse>` 新增
- `HttpGameTransport` / `WsGameTransport` 各自实现

## 6. 测试策略

### 6.1 Unit（`shared/draft/__tests__/`）

- `initDraftState` 基本形状
- `processSubmit` 正常 pick + 非法 pick（pool 中没有的卡）
- `tryAdvanceRound` 未全提交 → no-op；已全提交 → 旋转 + round++
- `finalizeDraft` 把 kept 灌入 hand，`phase='playing'`
- 2/3/4 人局旋转方向正确

### 6.2 Session（`server/game/__tests__/draft-session.test.ts`）

- 新 GameSession draft 模式：完整 7 轮 → phase='playing' → round 1 可正常 takeAction
- 并行提交：player1 先提交、player2 后提交，两次提交后一次性旋转
- 非法提交：已提交玩家二次提交被拒绝
- 非 draft phase 调 `submitDraftPick` 报错
- Reconnect：draft 中途重启 server，从持久化恢复状态不丢

### 6.3 E2E（`e2e-tests/draft.spec.ts`）

- 2 人局开启 draft：两个浏览器各自打开、挑牌、推进 7 轮、进入对局并能完成 round 1

### 6.4 现有测试

- 所有 2280+ 现有测试必须绿。由于 `phase: 'playing'` 是默认（`createInitialState` 没传 option 就 default），零破坏

## 7. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 并行提交 race（两玩家同一瞬间 WS 到达） | `submitDraftPick` 在 GameSession 里单线程处理（Node 单事件循环），processSubmit 原子 |
| 持久化中途 draft 状态复杂 | DraftState 纯数据，`serializeState` 自然覆盖 |
| Reconnect 丢自己 pool | pool 存 GameState，reconnect snapshot 恢复 |
| 主引擎回归 | Draft 完全隔离在独立模块；现有测试零破坏的设计能快速发现任何回归 |
| 2 人局传牌 = 和对手直接互换 | 符合规则（"传给下家"，下家就是对手），不需特殊处理 |
| 隐私信任式同步 | 遗留 issue #7，MVP 接受；UI 严格不渲染对手数据 |

## 8. 开放决策

| 决策点 | 默认 | 备选 | 最终 |
|---|---|---|---|
| Draft 轮数 | 7 | 10 | 7（BGA 标准） |
| 方向 | 顺时针 | 每轮交替 | 顺时针 |
| pool size | 7 + 7 | 8 + 8 | 7 + 7 |
| lobby toggle 默认 | `none` | `simultaneous` | `none`（向后兼容） |
| Draft 中途 dissolve | 允许 | 禁止 | 允许（复用现有 dissolve） |

## 9. 迁移 / 向后兼容

- **现有房间**：未指定 `draftMode` → 默认 `'none'` → 走老路径，行为不变
- **现有测试**：`createInitialState` 默认 `phase='playing'`，`draft: null`，无变化
- **API 消费者**：新字段 `phase`、`draft` 可选读取。不读的话等同现状

## 10. 文档同步

- `docs/ENGINE_ARCHITECTURE.md`：新增 "Draft Phase" 段落，说明 `phase` 字段、DraftManager 独立于 Engine
- `docs/card_progress.md §3`：登记 PR-5 落地条目

## 11. 待写实施计划

本 spec 通过后，进实施计划 `docs/superpowers/plans/2026-04-20-PR5-card-draft-simultaneous.md`。

初步 Task 分解：

1. 数据模型 + 类型（`shared/draft/types.ts` + `GameState.phase/draft`）
2. DraftManager 纯函数 + unit tests
3. GameSession `submitDraftPick` 集成
4. 协议扩展（ClientCommand、Transport）
5. 房间创建流程挂接 draftMode
6. Client DraftOverlay 组件
7. Lobby 房间创建 UI draftMode select
8. E2E + session 测试
9. 文档 + 最终验证

估计 9 个 task，~1500-2000 行代码。
