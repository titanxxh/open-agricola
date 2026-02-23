# Open Agricola 架构说明

## 1. 目标与边界

- 目标：以回合与行动卡为核心驱动的农场主桌游实现，后端为权威状态源，前端仅做渲染与输入收集。
- 扩展策略：通过 `Action Hook` 与 `Card Listener` 叠加卡牌效果。
- 多人支持：WebSocket 实时同步，房间管理，支持多客户端连接同一后端。

## 2. 分层结构

```text
shared/ (前后端共用，零 React 依赖)
  ├─ engine/          引擎核心（节点树、推进、snapshot）
  ├─ actions/         行动定义、效果、Hook、卡牌目录
  ├─ logic/           状态初始化/克隆、回合/收获、计分
  ├─ game/            GameState/PlayerState 等核心类型
  └─ i18n/            国际化

src/ (仅前端)
  ├─ app/             GameContainerApi（API 驱动）+ GameContainer（本地引擎 fallback）
  ├─ components/      React UI 组件
  ├─ hooks/           useGameApi / useGameSync / useActionEngine 等
  ├─ services/        后端 HTTP 调用
  └─ types/           UI 类型定义

server/ (仅后端)
  ├─ index.ts         HTTP 服务入口
  ├─ game-session.ts  权威 GameState + Engine 持有者
  ├─ game-router.ts   /api/game/* HTTP 端点
  ├─ room-manager.ts  WebSocket 房间管理与实时广播
  └─ *-validation.ts  围栏/犁地/播种等校验
```

## 3. 核心模块

### 3.1 后端 GameSession（权威状态源）

- `server/game-session.ts`
  - 持有唯一权威 `GameState` + `Engine` 实例。
  - 暴露命令式方法：`takeAction`、`resolveChoice`、`confirmAnimalReorg`、`confirmHarvestFeed`、`confirmNextPlayer`、`performRoundEnd`。
  - 所有游戏逻辑（引擎推进、Hook 触发、回合结算、收获流程）均在后端执行。

### 3.2 HTTP API（game-router）

- `server/game-router.ts`
  - `GET /api/game/state` — 获取完整状态快照
  - `POST /api/game/action` — 放置工人
  - `POST /api/game/choice` — 解决选择分支
  - `POST /api/game/reorg` — 确认动物重整
  - `POST /api/game/feed` — 确认收获喂食
  - `POST /api/game/validate` — 统合了围栏、房间、马厩、犁地、播种等前置校验
  - `POST /api/game/next-player` — 确认下一玩家
  - `POST /api/game/round-end` — 回合结束
  - `POST /api/game/new` — 新游戏
  - 统一响应：`{ ok, state, pending, scores?, error? }`

### 3.3 WebSocket 多人（room-manager）

- `server/room-manager.ts`
  - 客户端发送：`createRoom` / `joinRoom` / `action` / `choice` / `reorg` / `feed` / `nextPlayer` / `roundEnd`
  - 服务端广播：`stateUpdate` / `gameStarted` / `playerDisconnected`
  - 每个房间持有独立 `GameSession`。

### 3.4 共享引擎层

- `shared/engine/*`：节点树推进、flow 构建、snapshot/restore。
- `shared/actions/*`：行动定义、Hook 分发、原子效果、卡牌目录。
- `shared/logic/*`：状态管理、回合/收获、计分。

### 3.5 前端 UI 层

- `src/app/GameContainerApi.tsx`：API 驱动容器（默认模式），通过 `useGameApi` 发送命令、`useGameSync` 接收状态。
- `src/app/GameContainer.tsx`：本地引擎模式（`?mode=local` 切换），保留作为 fallback。
- `src/components/*`：纯渲染组件，不包含游戏逻辑。

## 4. 运行流程

### 4.1 API 模式

```text
用户点击行动格
  → useGameApi.takeAction(playerIndex, spaceId)
  → POST /api/game/action
  → GameSession.takeAction() 执行引擎
  → 返回 { state, pending }
  → useGameSync.applyResponse() 更新 React 状态
  → UI 重新渲染
```

### 4.2 WebSocket 多人模式

```text
玩家A点击行动格
  → ws.send({ type: 'action', spaceId })
  → RoomManager → GameSession.takeAction()
  → 广播 stateUpdate 给所有玩家
  → 玩家A/B 同时收到新状态并渲染
```

## 5. 测试覆盖

- `shared/engine/__tests__/*`：引擎推进与链式插入
- `shared/actions/__tests__/*`：Hook 矩阵、围栏、畜栏、动物
- `shared/logic/__tests__/*`：计分、收获、状态克隆
- `src/app/__tests__/*`：编排核心
- `server/__tests__/*`：后端校验

## 6. 运行方式

- 前端（API 模式）：`npm run dev` → `http://localhost:5173/`
- 前端（本地模式）：`http://localhost:5173/?mode=local`
- 后端：`npm run server` → HTTP `http://localhost:5175/` + WS `ws://localhost:5175/ws`
