# 前端页面更新流程与后端状态 Debug 文档

## 一、前端页面更新完整流程

### 1.1 架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend                                │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │   UI组件     │   │  useGameSync │   │    useGameApi    │  │
│  │  (React)     │──▶│   (Hook)     │◀──│    (Hook)        │  │
│  └──────────────┘   └──────────────┘   └──────────────────┘  │
│          │                    │                    │         │
│          │                    │                    ▼         │
│          │                    │         ┌──────────────────┐  │
│          │                    │         │   HTTP请求 (REST)│  │
│          │                    │         └──────────────────┘  │
└──────────┼────────────────────┼────────────────────────────────┘
           │                    │
           ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Backend                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │ game-router  │──▶│  GameSession │──▶│   GameState      │  │
│  │  (HTTP API)  │   │  (Business)  │   │   (Data Store)   │  │
│  └──────────────┘   └──────────────┘   └──────────────────┘  │
│                                    │                           │
│                                    ▼                           │
│                           ┌──────────────────┐                │
│                           │  data/game-state │                │
│                           │     .json        │                │
│                           └──────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 玩家操作流程

#### 步骤 1: 玩家点击行动区
```typescript
// 文件: src/app/GameContainerApi.tsx (第165-168行)
const takeAction = useCallback((space: ActionSpace) => {
  if (!state || !isInteractive) return
  void applyAndSync(api.takeAction(state.currentPlayerIndex, space.id))
}, [state, api, applyAndSync, isInteractive])
```

#### 步骤 2: 前端发送 HTTP POST 请求
```typescript
// 文件: src/hooks/useGameApi.ts (第61-62行)
const takeAction = useCallback((playerIndex: number, spaceId: string) =>
  guard(() => post('/api/game/action', { playerIndex, spaceId })), [guard])

// POST /api/game/action
// Body: { playerIndex: number, spaceId: string }
```

#### 步骤 3: 后端接收请求并处理
```typescript
// 文件: server/game-router.ts (第61-70行)
if (req.method === 'POST' && req.url === '/api/game/action') {
  const body = JSON.parse(await readBody(req)) as { playerIndex?: number; spaceId?: string }
  if (typeof body.playerIndex !== 'number' || typeof body.spaceId !== 'string') {
    sendJson(res, 400, { ok: false, error: 'invalid payload' })
    return true
  }
  const resp = getSession().takeAction(body.playerIndex, body.spaceId)
  sendJson(res, resp.ok ? 200 : 400, { ...resp, state: stripFunctions(resp.state) })
  return true
}
```

#### 步骤 4: GameSession 处理行动逻辑
```typescript
// 文件: server/game-session.ts (第504-524行)
takeAction(playerIndex: number, spaceId: string): SessionResponse {
  if (this.state.gameOver) return this.respond(false, 'game is over')
  if (playerIndex !== this.state.currentPlayerIndex) return this.respond(false, 'not your turn')
  const player = this.state.players[playerIndex]
  if (!player || player.workersAvailable <= 0) return this.respond(false, 'no workers available')
  const space = this.state.actionSpaces.find((s) => s.id === spaceId)
  if (!space || space.takenBy) return this.respond(false, 'space unavailable')

  this.pushHistory(true)
  this.actionStartPlayerSnapshot = this.clonePlayer(player)
  this.usedBakeBreadThisAction = false
  space.takenBy = player.id
  player.workersAvailable -= 1
  this.state.log.unshift({ key: 'log.placeFarmer', params: { player: player.name, action: space.nameKey } })

  this.engine = this.createEngine(spaceId)
  this.activeSpaceId = spaceId
  this.activePlayerIndex = playerIndex
  this.runEngineSteps()
  return this.respond()
}
```

#### 步骤 5: 后端返回响应
```typescript
// 响应格式: SessionResponse
{
  ok: boolean,
  state: GameState,              // 完整的游戏状态
  pending: PendingAction,        // 待处理动作（选择、动物重组等）
  historyLength: number,         // 历史记录长度
  hasActionStartSnapshot: boolean,
  scores?: Record<string, unknown>,  // 游戏结束时的分数
  error?: string
}
```

#### 步骤 6: 前端接收响应并更新状态
```typescript
// 文件: src/hooks/useGameSync.ts (第37-46行)
const applyResponse = useCallback((resp: GameApiResponse) => {
  if (!mountedRef.current) return
  const hydrated = rehydrateState(resp.state)
  setState(hydrated)
  setPending(resp.pending)
  setScores(resp.scores ?? null)
  setError(resp.ok ? null : (resp.error ?? 'unknown error'))
  setHistoryLength(resp.historyLength ?? 0)
  setHasActionStartSnapshot(resp.hasActionStartSnapshot ?? false)
}, [])
```

#### 步骤 7: React 重新渲染 UI
```typescript
// 文件: src/app/GameContainerApi.tsx (第994行返回 JSX)
return (
  <div className="app">
    <GameHeader state={state} currentPlayer={currentPlayer} ... />
    <ActionBoard 
      baseActions={baseActions} 
      roundSlots={roundSlots} 
      canTakeAction={canTakeActionForBoard} 
      takeAction={takeAction}
      ... 
    />
    <FarmBoard 
      displayPlayer={displayPlayer}
      ... 
    />
    <LogPanel log={state.log} />
  </div>
)
```

### 1.3 状态流转流程图

```
玩家点击行动
     │
     ▼
┌────────────────┐
│ useGameApi     │  创建 POST 请求
│ takeAction()   │  /api/game/action
└────────┬───────┘
         │
         ▼
┌────────────────┐
│ server/        │  路由到 GameSession
│ game-router.ts │  takeAction()
└────────┬───────┘
         │
         ▼
┌────────────────┐
│ GameSession    │  1. 验证操作合法性
│                │  2. 更新 GameState
│                │  3. 运行 Action Engine
│                │  4. 生成 pending 状态
└────────┬───────┘
         │
         ▼
┌────────────────┐
│ 返回 JSON      │  { ok, state, pending, ... }
│ 响应           │
└────────┬───────┘
         │
         ▼
┌────────────────┐
│ useGameSync    │  1. rehydrateState()
│ applyResponse()│  2. setState()
│                │  3. setPending()
└────────┬───────┘
         │
         ▼
┌────────────────┐
│ React 重新     │  所有订阅 state 的
│ 渲染           │  组件自动更新
└────────────────┘
```

### 1.4 Pending 状态处理

当操作需要额外选择时，后端返回 `pending` 字段：

```typescript
// shared/game/types.ts (第190-194行)
export type ActionExecutionResult =
  | { type: 'ok'; logKey?: string; resourcesGained?: Partial<Resource>; logParams?: Record<string, unknown> }
  | { type: 'choice'; promptKey?: string; options: ActionChoiceOption[] }  // ← 需要选择
  | { type: 'fail'; logKey: string }
  | { type: 'flow'; flow: ActionFlow }
```

前端根据 `pending.type` 显示不同 UI：

```typescript
// server/game-session.ts (第42-47行)
type PendingAction =
  | { type: 'choice'; playerIndex: number; spaceId: string; options: ActionChoiceOption[]; promptKey?: string }
  | { type: 'animalReorg'; playerIndex: number; spaceId: string }
  | { type: 'harvestFeed'; playerIndex: number; remaining: number; feedQueue?: { index: number; remaining: number }[] }
  | { type: 'confirmNextPlayer'; nextPlayerIndex: number }
  | { type: 'none' }
```

前端显示对应交互组件：
- `choice` → 显示选择对话框 (InteractionBar)
- `animalReorg` → 显示动物重组界面 (FarmBoard 中的 reorg 模式)
- `harvestFeed` → 显示喂养界面
- `confirmNextPlayer` → 显示"下一个玩家"按钮

### 1.5 数据持久化

后端将状态保存到文件：

```typescript
// server/index.ts (第56-68行)
const dataDir = resolve(__dirname, '../data')
const dataFile = resolve(dataDir, 'game-state.json')

const readState = async (): Promise<GameState | null> => {
  try {
    const raw = await fs.readFile(dataFile, 'utf8')
    return JSON.parse(raw) as GameState
  } catch {
    return null
  }
}

const writeState = async (state: GameState) => {
  await ensureDataDir()
  await fs.writeFile(dataFile, JSON.stringify(state, null, 2), 'utf8')
}
```

---

## 二、后端 API 接口列表

### 2.1 游戏操作接口

| 接口 | 方法 | 路径 | 描述 |
|------|------|------|------|
| 获取状态 | GET | `/api/game/state` | 获取当前游戏状态 |
| 执行行动 | POST | `/api/game/action` | 玩家执行行动 |
| 解决选择 | POST | `/api/game/choice` | 提交选择结果 |
| 确认动物重组 | POST | `/api/game/reorg` | 提交动物重组 |
| 确认喂养 | POST | `/api/game/feed` | 提交喂养选择 |
| 下一玩家 | POST | `/api/game/next-player` | 确认切换到下一玩家 |
| 回合结束 | POST | `/api/game/round-end` | 执行回合结束逻辑 |
| 撤销步骤 | POST | `/api/game/undo` | 撤销一步 |
| 撤销行动 | POST | `/api/game/undo-action` | 撤销整个行动 |
| 新游戏 | POST | `/api/game/new` | 开始新游戏 |
| 加载游戏 | POST | `/api/game/load` | 加载指定状态 |

### 2.2 Debug 接口

| 接口 | 方法 | 路径 | 描述 |
|------|------|------|------|
| 获取原始状态 | GET | `/api/state` | 获取原始游戏状态 |
| 保存状态 | POST | `/api/state` | 保存游戏状态 |
| 健康检查 | GET | `/api/health` | 服务健康检查 |
| 获取房间列表 | GET | `/api/rooms` | 获取 WebSocket 房间列表 |
| 增加资源 | POST | `/api/dev/add-resource` | 增加玩家资源 |

---

## 三、GameState 数据结构

### 3.1 完整 GameState 定义

```typescript
// shared/game/types.ts (第156-170行)
export type GameState = {
  round: number                           // 当前回合 (1-14)
  currentPlayerIndex: number              // 当前玩家索引
  players: PlayerState[]                  // 所有玩家状态
  actionSpaces: ActionSpace[]            // 行动区列表
  log: LogEntry[]                        // 游戏日志
  roundStartSnapshot: GameState | null   // 回合开始快照
  roundActionOrder: (string | null)[]    // 回合行动卡顺序
  gameSeed: number                       // 游戏随机种子
  availableMajorImprovements: string[]   // 可用主要升级
  futureMeeples: FutureMeeple[]          // 未来工人标记
  pendingFutureMeeples: FutureMeepleRequest[] // 待处理的未来工人
  gameOver: boolean                      // 游戏是否结束
  workPhaseObtainedResources: Record<string, Partial<Resource>> // 工作阶段获得资源
}
```

### 3.2 PlayerState 定义

```typescript
// shared/game/types.ts (第77-106行)
export type PlayerState = {
  id: string                              // 玩家ID
  name: string                            // 玩家名称
  color: 'red' | 'yellow' | 'blue' | 'black' // 玩家颜色
  resources: Resource                     // 资源
  familySize: number                      // 家庭规模
  workersAvailable: number                // 可用工人数量
  rooms: number                           // 房间数
  houseType: 'wood' | 'clay' | 'stone'    // 房屋类型
  fields: Field[]                         // 田地列表
  fences: number                          // 围栏数量
  roomTiles: FarmTilePosition[]           // 房间位置
  stableTiles: FarmTilePosition[]         // 马厩位置
  improvements: string[]                  // 主要升级
  minorHand: string[]                     // 手牌-小升级
  minorPlayed: string[]                   // 已打出小升级
  occupationHand: string[]                // 手牌-职业
  occupationPlayed: string[]              // 已打出职业
  playedCards: string[]                   // 所有已打出的卡
  houseAnimalType: 'sheep' | 'boar' | 'cattle' | null // 房屋内动物类型
  houseAnimalCount: number               // 房屋内动物数量
  stableAnimals: Record<string, 'sheep' | 'boar' | 'cattle' | null> // 马厩动物
  newbornCount: number                   // 新生动物数量
  pastures: Pasture[]                     // 牧场列表
  fenceSegments: string[]                 // 围栏段列表
  majorEffects: MajorEffectState          // 主要升级效果状态
  startPlayer: boolean                    // 是否起始玩家
  activeModifiers: CostModifier[]         // 活跃的费用修改器
  cardStates: CardStates                  // 卡牌状态
}
```

### 3.3 Resource 定义

```typescript
// shared/game/types.ts (第1-13行)
export type Resource = {
  wood: number
  clay: number
  reed: number
  stone: number
  food: number
  grain: number
  vegetable: number
  sheep: number
  boar: number
  cattle: number
  begging: number  // 乞讨标记
}
```

### 3.4 ActionSpace 定义

```typescript
// shared/game/types.ts (第220-223行)
export type ActionSpace = ActionDefinition & {
  resources: Resource     // 行动区上的累积资源
  takenBy: string | null  // 被哪个玩家占用
}

// shared/game/types.ts (第204-218行)
export type ActionDefinition = {
  id: string
  nameKey: string
  descriptionKey: string
  roundAvailable: number          // 第几回合可用
  gainPerRound: Partial<Resource> // 每回合累积资源
  players?: number[]              // 适用玩家数
  canBeExecutedByPlayer: CanBeExecutedByPlayer
  execute: (context: ActionExecutionContext) => ActionExecutionResult
  resolveChoice?: (context: ActionExecutionContext, choice: string) => ActionExecutionResult
  flow?: ActionFlow
}
```

---

## 四、Debug 后端游戏状态

### 4.1 使用 HTTP 接口获取状态

#### 获取完整游戏状态
```bash
curl http://localhost:5175/api/game/state
```

返回示例：
```json
{
  "ok": true,
  "state": {
    "round": 3,
    "currentPlayerIndex": 0,
    "players": [...],
    "actionSpaces": [...],
    "log": [...],
    ...
  },
  "pending": { "type": "none" },
  "historyLength": 5,
  "hasActionStartSnapshot": false
}
```

#### 获取原始状态
```bash
curl http://localhost:5175/api/state
```

#### 健康检查
```bash
curl http://localhost:5175/api/health
```

### 4.2 在代码中 Debug

#### 在前端查看状态
```typescript
// 在 GameContainerApi.tsx 中访问
const { state, pending, scores } = useGameSync()
console.log('Current State:', state)
console.log('Pending Action:', pending)
```

#### 在后端添加日志
```typescript
// server/game-session.ts
console.log('[Debug] Current state:', JSON.stringify(this.state, null, 2))
console.log('[Debug] Active player:', this.state.players[this.state.currentPlayerIndex])
```

### 4.3 使用 DevPanel 调试

前端界面右上角有开发模式面板，可以：
1. 修改玩家资源
2. 跳转到指定回合
3. 打出指定卡牌
4. 保存/加载游戏状态

### 4.4 状态保存/加载

#### 保存状态到文件
```bash
curl -X POST http://localhost:5175/api/state \
  -H "Content-Type: application/json" \
  -d '{"state": {...}}'
```

状态文件位置：`data/game-state.json`

---

## 五、WebSocket 模式（多人在线）

### 5.1 WebSocket 消息类型

当使用多人模式时，后端使用 WebSocket 广播状态更新：

```typescript
// server/room-manager.ts (第44-51行)
const broadcastState = (room: Room, resp: SessionResponse) => {
  broadcast(room, {
    type: 'stateUpdate',
    state: stripFunctions(resp.state),
    pending: resp.pending,
    scores: resp.scores ?? null,
  })
}
```

### 5.2 WebSocket 连接
```
ws://localhost:5175/ws
```

消息格式：
```typescript
// 客户端 → 服务器
{ type: 'action', spaceId: string }
{ type: 'choice', value: string }
{ type: 'reorg', zones: [...] }
{ type: 'feed', selections: [...] }
{ type: 'nextPlayer' }
{ type: 'roundEnd' }

// 服务器 → 客户端
{ type: 'stateUpdate', state: {...}, pending: {...}, scores: {...} }
{ type: 'roomCreated', roomId: string, playerIndex: number }
{ type: 'roomJoined', roomId: string, playerIndex: number }
{ type: 'gameStarted' }
{ type: 'playerDisconnected', playerIndex: number }
```

---

## 六、关键文件路径总结

### 前端
- `src/hooks/useGameApi.ts` - HTTP API 封装
- `src/hooks/useGameSync.ts` - 状态同步
- `src/app/GameContainerApi.tsx` - 主游戏容器
- `src/services/api.ts` - 底层 API 请求

### 后端
- `server/index.ts` - 服务器入口
- `server/game-router.ts` - HTTP 路由
- `server/game-session.ts` - 游戏逻辑核心
- `server/room-manager.ts` - WebSocket 房间管理
- `shared/game/types.ts` - 类型定义

### 数据
- `data/game-state.json` - 状态持久化文件

---

## 七、常见问题 Debug

### 7.1 状态不同步
1. 检查前端是否正确调用了 `applyResponse()`
2. 检查后端返回的 `state` 是否完整
3. 检查 `stripFunctions()` 是否移除了必要字段

### 7.2 行动无法执行
1. 检查 `currentPlayerIndex` 是否正确
2. 检查 `workersAvailable` 是否 > 0
3. 检查 `actionSpace.takenBy` 是否为 null

### 7.3 Pending 状态不显示
1. 检查后端是否正确返回了 `pending` 字段
2. 检查前端 `useGameSync` 中的 `setPending()` 是否被调用
3. 检查 UI 组件是否正确订阅了 `pending` 状态
