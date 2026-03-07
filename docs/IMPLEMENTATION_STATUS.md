# 实现状态

## 1. 架构总览

WebSocket 房间对局 + 后端权威状态 + 前端被动订阅渲染。

| 层 | 目录 | 职责 |
|---|---|---|
| 共享领域 | `shared/` | 引擎、行动、效果、Hook、卡牌定义、状态模型、计分、i18n、协议类型 |
| 后端 | `server/` | GameSession（权威状态入口）、HTTP API、WS 房间管理、校验 |
| 前端 | `src/` | React UI、GameTransport（HTTP/WS）、状态订阅与渲染 |

详细架构设计见 `docs/ENGINE_ARCHITECTURE.md`。

## 2. 后端

### 2.1 GameSession

`server/game-session.ts` — 唯一可写入 `GameState` 的入口。

- 命令式方法：`takeAction`、`resolveChoice`、`commitFarmChoice`、`confirmAnimalReorg`、`confirmHarvestFeed`、`confirmNextPlayer`、`performRoundEnd`、`undoStep`、`undoAction`、`loadState`。
- Dev 方法：`startDevFenceSelect`。
- 构造函数支持可选 `seed` 参数，用于可复现测试。
- 内部维护 `history` 快照栈 + `actionStartIndex` 用于撤销。
- 所有方法返回 `SessionResponse`（state + pending + scores + 元数据）。

### 2.2 WS 房间管理

`server/room-manager.ts` — WebSocket 主链路。

- 每个房间持有独立 `GameSession` 实例。
- 支持 `ClientCommand`（共享类型）：`action`、`choice`、`reorg`、`feed`、`commitFarm`、`nextPlayer`、`roundEnd`、`undoStep`、`undoAction`、`newGame`（可选 seed）、`loadGame`、`devCreatePasture`、`getState`、`createRoom`、`joinRoom`。
- 状态变更后广播 `StateUpdateEnvelope`（含 version + cause）给房间内所有客户端。
- 连接断开时清理玩家，空房间自动销毁。

### 2.3 HTTP API

`server/game-router.ts` — 开发/调试/兼容通道。

- 端点：`/api/game/state`、`/api/game/action`、`/api/game/choice`、`/api/game/commit-farm`、`/api/game/reorg`、`/api/game/feed`、`/api/game/next-player`、`/api/game/round-end`、`/api/game/undo`、`/api/game/undo-action`、`/api/game/new`（支持 seed）、`/api/game/load`、`/api/game/validate`（纯预检）。
- Dev 端点：`/api/game/dev/create-pasture`、`/api/game/dev/play-card`、`/api/game/dev/set-space-taken`、`/api/game/dev/set-current-player`、`/api/game/dev/set-round`、`/api/game/dev/set-resources`。
- `/api/rooms` — 列出当前活跃房间。
- HTTP 使用单例 `GameSession`，仅用于单机调试。多人对局走 WS。

### 2.4 共享协议

| 文件 | 内容 |
|---|---|
| `shared/protocol/game.ts` | `GameSyncPayload`、`StateUpdateCause`、`StateUpdateEnvelope` |
| `shared/protocol/ws.ts` | `ClientCommand`、`ServerEvent`、`RoomSummary` |
| `shared/game/serialization.ts` | `serializeState` / `rehydrateState` — 去函数序列化 |
| `shared/game/types.ts` | `GameState`、`PlayerState`、`ActionSpace`、`PendingAction`、`Resource` |

### 2.5 校验

独立校验模块：`server/validators.ts`、`server/fence-validation.ts`、`server/plow-validation.ts`、`server/sow-validation.ts`。打断了 index↔game-router 循环依赖。

## 3. 前端

### 3.1 Transport 抽象

`src/services/gameTransport.ts` — 定义 `GameTransport` 接口。

| 实现 | 说明 |
|---|---|
| `HttpGameTransport` | 每次 HTTP 响应后通过 `onSnapshot` 回调通知 |
| `WsGameTransport` | WebSocket 长连接，接收服务端广播的 `StateUpdateEnvelope` |

WS 模式通过 URL 参数 `?transport=ws` 启用。

### 3.2 状态管理

- `useGameSync` — 持有 `state`、`pending`、`historyLength`、`hasActionStartSnapshot`。通过 `applySnapshot(GameSyncPayload)` 统一消费快照。
- `GameContainerApi` — 主容器。通过 `useTransportSetup` 管理 WS 连接生命周期（创建/加入房间、等待对手、就绪）。所有操作（含 dev 操作）均通过 `transport` 发出，不直接调用 HTTP。

### 3.3 UI 组件

- `ActionBoard` — 完全还原 BGA 行动区。卡牌采用 BGA 3 段式框架（header/desc/footer 分别切片 `action_frame.png`/`action_frame_s.png`）。累积类行动通过 `action_frame_arrow.png` 伪元素显示方向箭头（left/right/bottom），累积资源以 `.resource-holder` 显示在卡片外部，带橙色数量徽章。Round 行动 hover 显示 `actions.jpg` 大图 tooltip。侧边栏使用 `add_2p.png` 背景。14 个收获标记。ResizeObserver 响应式缩放。
- `FarmBoard` — 农场格网、围栏、播种、马厩交互。
- `ResourceLine` — BGA meeple sprite 资源图标（`res-icon-*`）+ 数量。
- `LogPanel` — 结构化日志，卡牌引用显示 hover tooltip（名称 + 描述）。
- `GameControls` — 撤销/计分/Reset，seed 输入与 Reset 仅在 devMode 显示。
- `PlayerCard` — 卡牌渲染，BGA sprite 背景。Category 图标带中英文 tooltip、passing 卡标识。
- `GameHeader` — 回合/玩家信息。显示"轮到你了"/"等待对方"状态徽章，玩家身份标识，回合进度（N/14）。my-turn 时绿色高亮，not-my-turn 时 action 区域变暗并禁用交互。

## 4. 游戏引擎

### 4.1 Flow 节点树

| 节点 | 语义 |
|---|---|
| `leaf` | 单个效果 |
| `seq` | 顺序执行 |
| `parallel` | 全部子节点 |
| `or` | 多选一（玩家选择） |
| `xor` | 条件互斥 |
| `optional` | 可跳过 |

### 4.2 Hook 系统

8 个相位：`before`、`during`、`immediatelyAfter`、`after`、`computeCosts`、`computeArgs`、`computeReplace`、`isDoable`。

248 个卡牌定义（A/B/C/D/E 五个 deck），通过 Hook 注册效果。详见 `docs/cards_impl.md` 和 `docs/card_progress.md`。

### 4.3 支付系统

- `ComplexCost`：fee / fees / trades / bonuses / cards。
- `computeAllBuyableCombinations`：穷举可用支付方案 + Pareto 过滤。
- LRU 缓存加速重复查询（复杂场景 100x+ 提升）。
- `CostModifier` 系统：`TradeModifier` / `BonusModifier`，30+ 卡牌注册了支付修改器。

## 5. 测试

### 5.1 单元测试

vitest，41 文件 295 用例。

| 类别 | 文件 |
|---|---|
| 协议 | `tests/serialization.test.ts`、`tests/protocol-types.test.ts` |
| 会话契约 | `tests/game-session-contract.test.ts` |
| 状态管线 | `tests/game-sync-pipeline.test.ts` |
| Pending/Undo 回归 | `tests/pending-undo-regression.test.ts` |
| 支付系统 | `tests/pay.test.ts`、`tests/pay-dp.test.ts`、`tests/exchange.test.ts` |
| 卡牌效果 | `shared/cards/__tests__/*.test.ts` |

### 5.2 E2E 测试

Playwright，`playwright.config.ts`（testDir `./e2e-tests`）。

- `ws-dual-player.spec.ts` — WS 双人对局：房间创建/加入、P1 行动→P2 同步、换人、P2 行动→P1 同步、undo。
- 其他 E2E：`round-end-flow.spec.ts`、卡牌效果 E2E。

```bash
npm test       # 单元测试
npm run test:e2e  # E2E 测试
```

## 6. 已删除的遗留代码

| 文件 | 原因 |
|---|---|
| `src/app/GameContainer.tsx` | 被 `GameContainerApi` 替代 |
| `src/hooks/useGameState.ts` | 仅被 `GameContainer` 引用 |
| `src/app/hooks/use-persistence.ts` | 无引用 |
| `src/hooks/useRoomConnection.ts` | 连接逻辑内联到 `GameContainerApi` |
| `src/hooks/useActionEngine.ts` | 引擎逻辑已迁至后端 `GameSession` |
| `src/hooks/useGameApi.ts` | HTTP 调用已由 `HttpGameTransport` 承担 |
| `docs/FRONTEND_STATE_FLOW.md` | 内容严重过时，已覆盖在 `ENGINE_ARCHITECTURE.md` |

## 7. 已知边界

- 部分卡牌仅完成数据接入，复杂行为待补全（188/898 已实现）。
- 断线重连未实现（WS 断开后需刷新页面重连）。
- BGA sprite 图片依赖 `../bga-agricola/img` 目录，缺失时降级为纯色/文字。
- `npm run build` 存在测试文件的 TypeScript 严格模式报错，不影响 dev 模式。
