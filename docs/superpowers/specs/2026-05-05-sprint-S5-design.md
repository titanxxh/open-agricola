# Sprint S5 — RoomManager 拆 connection / persistence（设计）

> 目标态参考：[`docs/ENGINE_NEW_ARCHITECTURE.md`](../../ENGINE_NEW_ARCHITECTURE.md) §12.2、§15 S5、§15bis。

## 0. 摘要

`server/game/room-manager.ts`（1170 行）当前混合 6 件事：① WS server + 鉴权握手 + 心跳 ② 命令路由（22 种 `msg.type` 单 switch）③ 房间元数据 / 座位 / TTL 清理 / 固定 dev 房 ④ persistence（SQLite + JSON 双 backend）⑤ 广播 + viewer-mask ⑥ lobby summary。

S5 把它拆成 3 层、9 个新文件，引入 `RoomPersistence` 窄接口与 in-memory adapter，删除 `room-manager.ts`。

**行为零变化档位 = B（搬迁 + 适度收敛）**：允许把命令路由整理成函数式 dispatch table、ws-server 的 auth/连接生命周期与 router 的 msg 处理彻底分离；不变更协议、命令语义、persistence 字段、错误信息。

---

## 1. 目标拓扑

```text
server/
├─ index.ts                            HTTP server 入口（保留），启动时 new Registry + persistence + 注入
├─ game-router.ts                      HTTP 游戏路由（不在 S5 范围）
├─ auth.ts / db.ts / workshop.ts ...   不动
│
├─ connection/                         ◀─ 新建：WS / 路由 / 广播
│   ├─ ws-server.ts                      创建 WebSocketServer，处理连接生命周期 + auth 握手 + 心跳
│   ├─ room-router.ts                    函数式 dispatch table：22 handler，msg.type → handler
│   ├─ envelope-builder.ts               pure：(room, resp, viewerSeat, cause, requestId) → StateUpdateEnvelope
│   ├─ broadcaster.ts                    薄：遍历 seats → envelope-builder → ws.send
│   ├─ connection-ctx.ts                 ConnectionCtx 类型 + 创建 helper
│   └─ __tests__/
│       ├─ ws-server.test.ts             从 room-manager-ws-sync 迁
│       ├─ room-router.test.ts           新增：mock ctx + handler 单测
│       ├─ ws-seat-binding.test.ts       从原位迁
│       ├─ envelope-builder.test.ts      新增：pure → 直接断 envelope shape
│       └─ draft-handler.test.ts         从 room-manager-draft 迁
│
├─ game/                               ◀─ 现有目录扩充
│   ├─ authoritative-session.ts          不动（S5 owner 必须 freeze 这个文件）
│   ├─ room.ts                           Room type + 座位/TTL/dev-room/summarize 纯函数
│   ├─ room-registry.ts                  RoomRegistry class：持 Map + 暴露 get/set/delete/iter/touch
│   ├─ lobby.ts                          getRooms / dissolveRoomById（依赖 registry + persistence + broadcaster）
│   ├─ persistence/                       ◀─ 新建
│   │   ├─ room-persistence.ts            interface RoomPersistence + RoomMeta + RoomSnapshot 类型
│   │   ├─ sqlite-adapter.ts              SqliteRoomPersistence 实现（含 prune-then-list）
│   │   ├─ json-adapter.ts                JsonRoomPersistence 实现（save state only）
│   │   ├─ memory-adapter.ts              InMemoryRoomPersistence 实现（测试用）
│   │   └─ __tests__/
│   │       ├─ sqlite-adapter.test.ts     从 room-manager-stale-cleanup 迁 + 扩
│   │       ├─ memory-adapter.test.ts     新增：契约
│   │       └─ adapter-contract.test.ts   新增：3 adapter 跑同一份契约
│   └─ __tests__/
│       ├─ room.test.ts                   从 room-manager-seat 迁（座位/TTL/dev-room/summarize）
│       └─ lobby.test.ts                  新增：getRooms / dissolveRoomById
```

### 1.1 职责切线

| 层 | 知道什么 | 不知道什么 |
|---|---|---|
| `connection/ws-server.ts` | WebSocketServer / ConnectionCtx 生命周期 / auth 握手 / 心跳 / `ALLOW_ANONYMOUS_WS` | 任何 `msg.type` 业务（投给 router） |
| `connection/room-router.ts` | 22 个命令的语义 / `assertOwnSeat` `assertDevCommandAllowed` / 调用 session.takeAction 等 | WebSocket / SQLite |
| `connection/envelope-builder.ts` | `serializeStateForPlayer` / engineStack / `StateUpdateEnvelope` shape | WebSocket / persistence / registry |
| `connection/broadcaster.ts` | seats 遍历 / `ws.send` / 调 `persistence.save` | game state 字段含义 |
| `game/room.ts` | Room type / 座位解析 / TTL 计算 / 固定 dev 房 / lobby summary helper | persistence / WebSocket |
| `game/room-registry.ts` | `Map<id, Room>` / `roomLastActivity` / get/set/delete/iter/touch | persistence / WebSocket |
| `game/lobby.ts` | 综合 registry + persistence + broadcaster：`getRooms` / `dissolveRoomById` | WebSocket frame |
| `game/persistence/*` | SQLite / JSON / in-memory 存取 | WebSocket / Room runtime / GameSession |

### 1.2 外部 API 兼容

`server/index.ts` 仅有的 3 个旧 import 仍然可用，但语义改：

- `createWsServer(httpServer, { persistence }) → { wss, registry }` —— 来自 `./connection/ws-server.ts`
- `getRooms(limit?)` —— 来自 `./game/lobby.ts`，闭包持有 `registry`
- `dissolveRoomById(id, userId)` —— 来自 `./game/lobby.ts`，闭包持有 `registry + persistence + broadcaster`

---

## 2. 接口契约

### 2.1 `RoomPersistence`（窄接口，5 方法）

```ts
// server/game/persistence/room-persistence.ts

export type RoomMeta = {
  createdBy: string | null
  maxPlayers: number
  customCardDbIds: string[]
  status: RoomStatus           // 'waiting' | 'playing' | 'finished'
  players: Array<{ userId: string; playerIndex: number }>  // 已入座的有 userId 的玩家
}

export type RoomSnapshot = {
  id: string
  serialized: SerializedGameState | null   // null = 还没首次 save
  meta: RoomMeta
  updatedAt: number
}

export type RestoreOptions = {
  now: number
  waitingTtlMs: number
  playingTtlMs: number
  excludeIds?: ReadonlyArray<string>       // 固定 dev 房 id，listRestorable 跳过
}

export interface RoomPersistence {
  load(id: string): RoomSnapshot | null
  save(id: string, serialized: SerializedGameState, meta: RoomMeta): void
  delete(id: string): void
  markFinished(id: string, now: number): void
  listRestorable(opts: RestoreOptions): RoomSnapshot[]
}
```

`listRestorable` 同时负责 prune（保持当前 SQLite 行为）：① 把超 TTL 的非 finished 行批量改 `'finished'` ② 返回剩余非 finished 房间快照（含 `updatedAt` 给 caller seed `roomLastActivity`）。

3 个 adapter 行为差异：

| 方法 | SqliteRoomPersistence | JsonRoomPersistence | InMemoryRoomPersistence |
|---|---|---|---|
| `load` | rooms 表 SELECT + parse | 读 `output/<id>.json` | `Map.get` |
| `save` | rooms upsert + room_players upsert | 写 `output/<id>.json`（仅 state，meta 丢弃） | `Map.set` |
| `delete` | DELETE rooms（CASCADE 删 room_players） | unlink 文件 | `Map.delete` |
| `markFinished` | UPDATE rooms SET status='finished' | no-op（JSON 没 status） | 改 Map 内的 meta.status |
| `listRestorable` | prune-then-list | 返回空数组（JSON 不参与启动恢复） | 按 TTL 过滤后返回 Map 内容 |

JSON adapter 保留是为了 dev 兼容（fixed dev rooms 在 `PERSIST_ROOMS=json` 时仍走 JSON 文件）。

### 2.2 `RoomRegistry`

```ts
// server/game/room-registry.ts

export class RoomRegistry {
  private rooms = new Map<string, Room>()
  private lastActivity = new Map<string, number>()

  get(id: string): Room | undefined
  set(room: Room): void
  delete(id: string): void
  has(id: string): boolean
  iter(): IterableIterator<Room>
  size(): number

  /** 标记最后活动时间（玩家断线 / 重连 / 启动恢复 seed）。 */
  touchActivity(id: string, now: number): void
  lastActivityOf(id: string): number | undefined
  clearActivity(id: string): void
}
```

无 module-level singleton。`createWsServer` 内 `new RoomRegistry()`。测试每次 `new` 即可，不需要 `__resetForTest()`。

### 2.3 `EnvelopeBuilder` + `Broadcaster`

```ts
// server/connection/envelope-builder.ts （pure）
export function buildEnvelope(args: {
  room: Pick<Room, 'id' | 'session'>
  resp: SessionResponse
  viewerPlayerId: string | null
  version: number
  cause: StateUpdateCause
  requestId?: string
  emittedAt: number
  sync?: 'snapshot'
}): StateUpdateEnvelope

// server/connection/broadcaster.ts
export class Broadcaster {
  constructor(deps: { persistence: RoomPersistence })

  /** 全房广播，每个 seated player 各自的 viewerPlayerId 视角。version 由 room 自己管。 */
  broadcastState(room: Room, resp: SessionResponse, cause: StateUpdateCause, requestId?: string): void
  /** 单点回执（getState / 重连）。 */
  sendStateTo(ws: WebSocket, room: Room, resp: SessionResponse, requestId?: string): void
  /** 普通房间事件（playerJoined / roomDissolved / gameStarted / playerDisconnected）。 */
  broadcastEvent(room: Room, event: ServerEvent): void
  /** 单点 send。 */
  sendTo(ws: WebSocket, event: ServerEvent): void
}
```

`Broadcaster.broadcastState` 内部职责：① `room.version += 1` ② 对每个 seated 调 `buildEnvelope` 并 `ws.send` ③ 调 `persistence.save`（仅 sqlite 模式或 fixed dev 房）④ 检测 `gameOver` 时 `persistence.markFinished`。

`persistence.save` 在 broadcaster 内调用是为对齐当前"每次 broadcast 都自动 persist"的行为零变化保证。

### 2.4 `Handler` + `ConnectionCtx`

```ts
// server/connection/connection-ctx.ts
export type ConnectionCtx = {
  ws: WebSocket
  authenticated: boolean
  currentUserId: string | undefined
  currentRoom: Room | null
  currentPlayerIndex: number  // -1 未入座

  // 注入依赖（每个连接共享同一组实例）
  registry: RoomRegistry
  persistence: RoomPersistence
  broadcaster: Broadcaster
  lobby: Lobby
}

// server/connection/room-router.ts
type Handler<M extends ClientCommand = ClientCommand> = (ctx: ConnectionCtx, msg: M) => void

const handlers: { [K in ClientCommand['type']]: Handler<Extract<ClientCommand, { type: K }>> } = {
  auth: handleAuth,
  createRoom: handleCreateRoom,
  joinRoom: handleJoinRoom,
  // ... 22 个
}

export function dispatch(ctx: ConnectionCtx, msg: ClientCommand): void {
  const fn = handlers[msg.type] as Handler
  if (!fn) { sendError(ctx.ws, `unknown command: ${msg.type}`); return }
  fn(ctx, msg)
}
```

每个 handler 是**纯函数 + 可变 ctx**：拿 ctx，可能读 `ctx.registry` / `ctx.persistence` / `ctx.lobby`，最后改 ctx 的 `currentRoom / currentPlayerIndex` 并/或调 `ctx.broadcaster.broadcastState(...)`。

`assertOwnSeat` / `assertOwnPlayerId` / `assertDevCommandAllowed` 提取为 ctx-aware helper（在 room-router.ts 内）：

```ts
function assertOwnSeat(ctx: ConnectionCtx, expected: unknown, requestId?: string): boolean
function assertOwnPlayerId(ctx: ConnectionCtx, expected: unknown, requestId?: string): boolean
function assertDevCommandAllowed(ctx: ConnectionCtx, requestId?: string): boolean
```

### 2.5 `Lobby`

```ts
// server/game/lobby.ts
export type Lobby = {
  getRooms(limit?: number): RoomSummary[]
  dissolveRoomById(roomId: string, userId: string | undefined): { ok: boolean; error?: string }
}

export function createLobby(deps: {
  registry: RoomRegistry
  persistence: RoomPersistence
  broadcaster: Broadcaster
}): Lobby
```

HTTP 路由 (`server/index.ts`) 与 WS 命令 `handleDissolveRoom` 都走 `lobby.dissolveRoomById`，避免双份维护。

---

## 3. 数据流

### 3.1 Server 启动

```text
server/index.ts
  ├─ getDb()                                    建表
  ├─ persistence = pickPersistence(env)         'sqlite' → SqliteRoomPersistence(db)
  │                                             'json'   → JsonRoomPersistence(dir)
  ├─ wssCtx = createWsServer(httpServer, { persistence })
  │     │
  │     ├─ registry = new RoomRegistry()
  │     ├─ broadcaster = new Broadcaster({ persistence })
  │     ├─ lobby = createLobby({ registry, persistence, broadcaster })
  │     ├─ ensureFixedDevRooms(registry, persistence)         启动期，含 NODE_ENV !== 'production' 守卫
  │     ├─ restoreRooms(registry, persistence, now())          listRestorable + seed lastActivity
  │     ├─ startRoomCleanup(registry, persistence, intervalMs) setInterval, 用 lastActivityOf 判 TTL
  │     ├─ wss = new WebSocketServer({ server: httpServer, path: '/ws' })
  │     └─ wss.on('connection', ws => handleConnection(ws, { registry, persistence, broadcaster, lobby }))
  │
  └─ HTTP 路由：
      app.get('/api/rooms', → lobby.getRooms(limit))
      app.delete('/api/rooms/:id', → lobby.dissolveRoomById(id, userId))
```

`pickPersistence` 是 `server/index.ts` 私有的小工厂，读 `process.env.PERSIST_ROOMS`。

### 3.2 单连接生命周期

```text
ws.on('connection') (in ws-server.ts)
  │
  ├─ ctx = createConnectionCtx({ ws, registry, persistence, broadcaster, lobby })
  │     初始 authenticated = ALLOW_ANONYMOUS_WS, currentRoom = null, currentPlayerIndex = -1
  │
  ├─ 启 auth timer（仅 prod，未 auth 超时关连接）
  │
  ├─ ws.on('message', raw => {
  │     msg = JSON.parse(...)
  │     // ws-server 完成 auth 守卫（auth 命令本身在 router 处理；非 auth 命令需 authenticated）
  │     if (!ctx.authenticated && msg.type !== 'auth') {
  │       ctx.broadcaster.sendTo(ws, { type: 'error', error: 'not authenticated', requestId: msg.requestId })
  │       return
  │     }
  │     dispatch(ctx, msg)              ← 投到 room-router
  │   })
  │
  └─ ws.on('close', → handleDisconnect(ctx))
        ├─ removePlayerFromRoom(currentRoom, ws, now)
        ├─ if remaining: broadcaster.broadcastEvent(room, { type: 'playerDisconnected', playerIndex })
        └─ if empty:    registry.touchActivity(roomId, now)
```

### 3.3 典型命令：`createRoom`

```text
handleCreateRoom(ctx, msg):
  parseDraftOptions(msg) → draftOpts | error
  loadCustomCardsFromDb(msg.customCardIds, ctx.currentUserId) → customCards
  session = new GameSession(undefined, customCards, { playerCount, enableCommunityDeck, ...draftOpts })
  room = { id: generateRoomId(), session, players: [], maxPlayers, version: 0,
           status: 'waiting', createdBy: ctx.currentUserId, customCardDbIds }
  ctx.registry.set(room)
  ctx.currentRoom = room
  ctx.currentPlayerIndex = 0
  room.players.push({ ws: ctx.ws, playerIndex: 0, name, userId: ctx.currentUserId })
  room.session.updatePlayerName(0, name)

  ctx.persistence.save(room.id,
    serializeState(room.session.getState().state, { engineStack: room.session.getEngineStack() }),
    toRoomMeta(room))

  ctx.broadcaster.sendTo(ctx.ws, { type: 'roomCreated', roomId, playerIndex: 0, maxPlayers })
```

`toRoomMeta(room)` 是 `server/game/room.ts` 的 pure helper：把 `Room` 投影成 `RoomMeta`。

`loadCustomCardsFromDb` 留在 room-router.ts（它读 `workshop_cards` 表，与 persistence 抽象正交）。

### 3.4 典型命令：`action` / `choice`

```text
handleAction(ctx, msg):
  if (!ctx.currentRoom) → error
  resp = ctx.currentRoom.session.withCtx(s => s.takeAction(ctx.currentPlayerIndex, msg.spaceId))
  ctx.broadcaster.broadcastState(ctx.currentRoom, resp, 'action', msg.requestId)
    │
    └─ Broadcaster.broadcastState:
        room.version += 1
        for seat in room.players:
          envelope = buildEnvelope({ ... viewerPlayerId: idOfSeat ... })
          ws.send(envelope)
        if (sqlite mode || isFixedDevRoom(room.id)):
          this.persistence.save(room.id, serializeState(...), toRoomMeta(room))
        if (sqlite mode && resp.state.gameOver):
          this.persistence.markFinished(room.id, Date.now())
```

### 3.5 重连：`joinRoom` 同 userId 同 seat

```text
handleJoinRoom(ctx, msg):
  room = ctx.registry.get(msg.roomId)
  if (!room) → error
  resolveJoinRequestPlayerIndex(room, msg.requestedPlayerIndex, ctx.currentUserId)
  resolveJoinPlayerIndex(room, requested, ctx.currentUserId)
    │
    └─ 如果 replacedExistingPlayer：旧 ws.close()（同 userId 重连场景）
  room.players.push({ ws: ctx.ws, playerIndex, name, userId })
  ctx.persistence.save(room.id, serializeState(...), toRoomMeta(room))   写入新 player 行
  ctx.broadcaster.sendTo(ctx.ws, { type: 'roomJoined', ... })
  ctx.broadcaster.broadcastEvent(room, { type: 'playerJoined', ... })
  if (room.players.length === room.maxPlayers):
    room.status = 'playing'
    resp = room.session.withCtx(s => s.getState())
    ctx.broadcaster.broadcastState(room, resp, 'reconnect')
    ctx.broadcaster.broadcastEvent(room, { type: 'gameStarted' })
```

### 3.6 解散：lobby 入口（HTTP + WS 共享）

```text
lobby.dissolveRoomById(roomId, userId):
  room = registry.get(roomId)
  if (!room) → { ok: false, error: 'room not found' }
  if (isFixedDevRoom(room.id)) → error
  if (room.createdBy !== userId) → error
  broadcaster.broadcastEvent(room, { type: 'roomDissolved', roomId })
  for p in room.players: p.ws.close()
  registry.delete(roomId)
  registry.clearActivity(roomId)
  persistence.delete(roomId)
  return { ok: true }

handleDissolveRoom(ctx, msg):
  if (!ctx.currentRoom) → error
  result = ctx.lobby.dissolveRoomById(ctx.currentRoom.id, ctx.currentUserId)
  if (!result.ok) → sendError
  ctx.currentRoom = null
```

### 3.7 TTL 清理循环

```text
startRoomCleanup(registry, persistence, intervalMs):
  setInterval(() => {
    now = Date.now()
    for room in registry.iter():
      if (isFixedDevRoom(room.id)) continue
      if (room.players.length > 0):
        registry.touchActivity(room.id, now); continue
      lastSeen = registry.lastActivityOf(room.id) ?? now
      if (now - lastSeen > emptyRoomTtlMs(room)):
        registry.delete(room.id)
        registry.clearActivity(room.id)
        persistence.markFinished(room.id, now)
  }, intervalMs)
```

---

## 4. 测试策略

### 4.1 测试归属总表（迁移与新增）

| 当前文件 | 去向 | 改动 |
|---|---|---|
| `server/__tests__/room-manager-seat.test.ts` | `server/game/__tests__/room.test.ts` | import 改 `../room.ts`；用例不变（座位/dev-room/`removePlayerFromRoom` / `restoreRoomFromSqliteRow`）；`restoreRoomFromSqliteRow` 改名 `snapshotToRoom` 并迁到 room.ts |
| `server/__tests__/room-manager-stale-cleanup.test.ts` | `server/game/persistence/__tests__/sqlite-adapter.test.ts` | 重写为 `new SqliteRoomPersistence(db)` + `listRestorable(opts)` 直接断结果；`pruneStaleRoomRows` 内化为 adapter 私有函数（不再 export） |
| `server/__tests__/room-manager-ws-sync.test.ts` | `server/connection/__tests__/ws-server.test.ts` | import 改 `../ws-server.ts` 的 `createWsServer`；用例不变 |
| `server/__tests__/ws-seat-binding.test.ts` | `server/connection/__tests__/ws-seat-binding.test.ts` | import 路径改新位置；用例不变 |
| `server/__tests__/room-manager-draft.test.ts` | `server/connection/__tests__/draft-handler.test.ts` | `parseDraftOptions` 从 room-router.ts 取；GameSession round-trip 部分保留 |
| `room-manager-seat.test.ts` 中 `summarizeRoomsForLobby` 用例 | `server/game/__tests__/lobby.test.ts`（新增） | 与 `getRooms` / `dissolveRoomById` 同卷 |

### 4.2 新增测试（S5 自带回归）

**(a) Persistence adapter 契约测试** —— `server/game/persistence/__tests__/adapter-contract.test.ts`

```ts
const adapters: Array<[string, () => RoomPersistence]> = [
  ['sqlite', () => new SqliteRoomPersistence(new Database(':memory:'))],
  ['json',   () => new JsonRoomPersistence(tmpDir())],
  ['memory', () => new InMemoryRoomPersistence()],
]

for (const [name, factory] of adapters) {
  describe(`RoomPersistence contract — ${name}`, () => {
    it('save → load round-trip preserves serialized + meta')
    it('delete removes the row')
    it('save with status=finished is durable')
    it('markFinished flips status without changing serialized')
    it('listRestorable excludes finished + excluded ids')
  })
}
```

JSON adapter 对 meta-only 字段（player rows / status）的契约**显式标注 expected-no-op**，测试断"no throw + load 仍能拿到 state"，不强制 meta 字段往返。

**(b) Router handler 单测** —— `server/connection/__tests__/room-router.test.ts`

每个 handler 一个 `describe`，构造 fake `ConnectionCtx`（registry / persistence / broadcaster 用 vitest mock），断 handler 调用后：

- ctx 字段变化（`currentRoom` / `currentPlayerIndex`）
- broadcaster method 被调过几次 + 参数
- persistence method 被调过几次 + 参数
- ws 收到的 ServerEvent

主要覆盖 `handleAuth` / `handleCreateRoom` / `handleJoinRoom` / `handleAction` / `handleChoice` / `handleDissolveRoom` / dev 系列守卫。

**(c) Envelope-builder pure 单测** —— `server/connection/__tests__/envelope-builder.test.ts`

构造 fake `Room` + `SessionResponse`，断 `buildEnvelope` 输出的 `version / cause / sync / payload.state` 字段。重点验证 viewer mask 工作（player 0 看不到 player 1 hand 字段）。

**(d) WS server 集成测试**

保留现有 `room-manager-ws-sync.test.ts` 全套（迁到 ws-server.test.ts）—— 真起 WS server，验证 createRoom/joinRoom/action 全链路。本质是 §3 数据流的端到端回归。

### 4.3 in-memory adapter 在 session 测试的角色

§15 S5 DoD 写"引入 in-memory persistence adapter 给测试用"。具体用法分两类：

- **室级测试（router/ws-server）**：默认用 `InMemoryRoomPersistence`。比当前测试快、不依赖 `:memory:` SQLite、不写文件。
- **卡牌效果 session 测试（254 个）**：**完全不接触 persistence**——它们直接 `new GameSession()`，不经 RoomManager。S5 不影响这类测试的 import。

→ in-memory adapter 的实际 consumer 只是 `connection/__tests__/*` 和 `game/__tests__/lobby.test.ts`、`adapter-contract.test.ts`。规模小、契约清晰。

### 4.4 强制 green 子集

`docs/ENGINE_NEW_ARCHITECTURE.md` §13 "强制 green 子集" 列了 server-level 机制基线测试（`harvest-session.test.ts` 等），不含 room-manager-* 系列。S5 对这个子集**零影响**。

S5 自带的 4 类新测试（contract / handler / envelope / ws-server）会加入新的"强制 green 子集"，下个 sprint 起也必须保持绿。

### 4.5 跨 sprint 风险与缓解

§15bis 已识别"S4 ‖ S5 可能撞 `server/game/authoritative-session.ts` import"。S5 的具体改法：

- **完全不改** `authoritative-session.ts` 内容
- 仅在新建文件中 import `GameSession`（路径相对新位置）
- S4 owner 若动 `authoritative-session.ts` 内部，不会撞 S5

S5 owner freeze `authoritative-session.ts` 这个文件（不动它），rebase 风险≈0。

---

## 5. 迁移步骤（PR 拆分）

按 §15bis "S4 / S5 PR 拆细，每周 ≥ 2 PR" 拆 3 个 PR。

### PR-S5-1：抽出 persistence 层（行为零变化）

**touch**：
- `server/game/persistence/{room-persistence,sqlite-adapter,json-adapter,memory-adapter}.ts` 新建
- `server/game/room-manager.ts` 内部改用 adapter
- `server/__tests__/room-manager-stale-cleanup.test.ts` 重写为 `sqlite-adapter.test.ts` + `adapter-contract.test.ts`
- `server/index.ts` 启动时 `pickPersistence(env)` 注入

**步骤**：

1. 新建 `room-persistence.ts`：interface + `RoomMeta` + `RoomSnapshot` + `RestoreOptions`
2. 新建 `sqlite-adapter.ts`：`load / save / delete / markFinished / listRestorable`，把原 `savePersistedStateSqlite` / `ensureRoomRowSqlite` / `upsertRoomPlayer` / `restoreRoomFromSqliteRow` / `pruneStaleRoomRows` 内化为私有函数
3. 新建 `json-adapter.ts`：`load / save`（写文件）、`delete`（unlink）、`listRestorable`（返空）、`markFinished`（no-op）
4. 新建 `memory-adapter.ts`
5. `room-manager.ts` 增加内部 `const persistence: RoomPersistence = pickPersistence()`，所有 SQL/文件调用换成 adapter 调用。外部可见 export 保持：`createWsServer / getRooms / dissolveRoomById / parseDraftOptions / FIXED_DEV_ROOMS / FIXED_DEV_ROOM_IDS / isFixedDevRoom / removePlayerFromRoom / resolveJoin* / restoreRoomFromSqliteRow / summarizeRoomsForLobby`。`pruneStaleRoomRows` 内化为 sqlite-adapter 私有函数（不再 export，stale-cleanup 用例迁到 sqlite-adapter.test.ts 直接测 `listRestorable`）
6. 写 `adapter-contract.test.ts`（3 adapter 跑同一份契约）
7. `room-manager-stale-cleanup.test.ts` 拆为两份：① `sqlite-adapter.test.ts`（prune + listRestorable）② `summarizeRoomsForLobby` 用例暂留 `room-manager-seat.test.ts` 内（PR-S5-2 再迁到 lobby.test.ts）

**DoD**：
- 全量 `pnpm test:fast` + `pnpm run lint` + `pnpm run build` 绿
- `room-manager.ts` 行数 ≈ 现状 -200 行
- `getDb()` 直接调用从 room-manager.ts 消失（adapter 持有 db 引用）

### PR-S5-2：拆 `game/` 层（room / registry / lobby）

**touch**：
- `server/game/room.ts` 新建（type + 座位 helper + summarize + dev-room）
- `server/game/room-registry.ts` 新建
- `server/game/lobby.ts` 新建
- `server/__tests__/room-manager-seat.test.ts` 改名迁移为 `server/game/__tests__/room.test.ts`
- `server/index.ts` 改为从 `lobby.ts` 取 `getRooms` / `dissolveRoomById`
- `server/game/room-manager.ts` 改为只持有 `createWsServer` + 路由 switch

**步骤**：

1. 新建 `room.ts`：迁入 `Room` type / `FIXED_DEV_ROOMS` / `isFixedDevRoom` / `resolveJoin*` / `removePlayerFromRoom` / `summarizeRoomsForLobby` / `emptyRoomTtlMs` / `toRoomMeta(room): RoomMeta` / `snapshotToRoom(snapshot): Room`（替代 `restoreRoomFromSqliteRow`，但参数从 SQLite row 改为 `RoomSnapshot`）
2. 新建 `room-registry.ts`：`RoomRegistry` class
3. 新建 `lobby.ts`：`createLobby({ registry, persistence, broadcaster })` 返回 `{ getRooms, dissolveRoomById }`。注：此时 `Broadcaster` 还没拆出，临时定义 `RoomBroadcaster` interface（仅 `broadcastEvent(room, event)`），room-manager.ts 内现有的 `broadcast` 函数包一个 adapter 实现注入；PR-S5-3 时 `Broadcaster` class 实现同一 interface，逐字替换
4. `room-manager.ts` 内部用 registry 替代 module-level `rooms` map / `roomLastActivity` map
5. `server/index.ts` 顶层 `const lobby = createLobby({ registry, persistence, broadcaster })`，HTTP 处理器闭包持有 `lobby`
6. `room-manager-seat.test.ts` 拆 → `room.test.ts`（座位/dev-room/summarize）+ `lobby.test.ts`（解散）；用 in-memory persistence + fake broadcaster 单测
7. `server/index.ts` 的 `import { ..., getRooms, dissolveRoomById } from './game/room-manager.ts'` 改为 `from './game/lobby.ts'`

**DoD**：
- 全量 `pnpm test:fast` + lint + build 绿
- `server/game/room-manager.ts` 行数 ≈ 现状 -400 行
- `rooms` / `roomLastActivity` 不再是 module-level mutable state（grep `rooms.set` / `rooms.delete` / `rooms.get` 在 room-manager.ts 应该 0 命中）

### PR-S5-3：拆 `connection/` + 删 `room-manager.ts`

**touch**：
- `server/connection/{connection-ctx,envelope-builder,broadcaster,room-router,ws-server}.ts` 新建
- 测试迁移
- 删 `server/game/room-manager.ts`
- DoD 终验

**步骤**：

1. 新建 `connection-ctx.ts`：`ConnectionCtx` 类型 + `createConnectionCtx({ ws, deps })` helper
2. 新建 `envelope-builder.ts`：纯函数 `buildEnvelope`
3. 新建 `broadcaster.ts`：`Broadcaster` class（`broadcastState / sendStateTo / broadcastEvent / sendTo`），内部调 `persistence.save` / `persistence.markFinished`
4. 新建 `room-router.ts`：22 个 handler 函数 + `dispatch(ctx, msg)` + 共享 helper（`assertOwnSeat / assertOwnPlayerId / assertDevCommandAllowed / sendCommandError`）+ `parseDraftOptions` + `loadCustomCardsFromDb`
5. 新建 `ws-server.ts`：`createWsServer(httpServer, { persistence })` → `{ wss, registry }`，含 `ensureFixedDevRooms / restoreRooms / startRoomCleanup`，`wss.on('connection')` 创建 ctx + auth gate + `dispatch`
6. `server/index.ts`：`createWsServer` import 路径改 `./connection/ws-server.ts`，`createWsServer` 返回 `{ wss, registry }`，把 `registry` 传给 `createLobby`
7. 测试迁移：`room-manager-ws-sync.test.ts` → `connection/__tests__/ws-server.test.ts`；`ws-seat-binding.test.ts` → `connection/__tests__/ws-seat-binding.test.ts`；`room-manager-draft.test.ts` → `connection/__tests__/draft-handler.test.ts`
8. 新增 `room-router.test.ts` + `envelope-builder.test.ts`
9. **删 `server/game/room-manager.ts`**

**DoD**（也是 §15 S5 整体 DoD）：

- `server/game/room-manager.ts` 不复存在（`ls server/game/room-manager.ts` 必须 fail）
- `server/connection/{ws-server,room-router,envelope-builder,broadcaster,connection-ctx}.ts` 都存在
- `server/game/persistence/{room-persistence,sqlite-adapter,json-adapter,memory-adapter}.ts` 都存在
- `server/game/{room,room-registry,lobby}.ts` 都存在
- 全量 `pnpm test:fast` + `pnpm test:slow` + lint + build 全绿（slow 254 卡牌测试不应受影响——它们不经 room-manager）
- `pnpm run test:e2e` 至少 smoke 跑通（验证 WS 服务端没坏）
- `docs/ENGINE_NEW_ARCHITECTURE.md` §15 S5 状态打勾 + §8 / §15bis 状态回流

### 5.1 风险登记

| 风险 | 缓解 |
|---|---|
| `gameOver` / 解散 / cleanup 路径中的 SQL 错误码兼容性（如 FK CASCADE） | adapter-contract 测试覆盖 `delete` 后 `room_players` 是否清空 |
| `ensurePersistentRooms`（fixed dev room）在 `PERSIST_ROOMS=json` 时仍走 JSON 文件 | json-adapter `load(devRoomId)` 读文件返回 snapshot；`ensureFixedDevRooms` 调 `persistence.load`，不区分 backend |
| `restoreRoomsFromSqlite` 的 `roomLastActivity` seed 行为 | `RoomSnapshot.updatedAt` 字段存在；`restoreRooms` 调用 `registry.touchActivity(id, snapshot.updatedAt)` |
| broadcaster 内部 persistence.save 的写放大（每次 broadcast 一次 SQL） | 行为零变化（与现状一致），不优化。后续如果有性能问题再说 |
| `parseDraftOptions` 从 room-manager.ts 移到 room-router.ts 后 import 路径变化 | 测试 `draft-handler.test.ts` 改 import；外部无其他 import |
| S4 ‖ S5 并行时撞 `server/game/authoritative-session.ts` | S5 owner freeze 这个文件（完全不改它内容） |

---

## 6. 不在范围

- HTTP `server/game-router.ts`（per-user GameSession map + TTL 清理）—— 不在 S5 范围
- WS 协议字段、ClientCommand / ServerEvent 类型 —— 不动
- GameSession / authoritative-session.ts —— 不动
- 卡牌效果测试 254 个 —— 不动（它们不经 room-manager）
- 性能优化（broadcaster 内的 persistence.save 写放大） —— 行为零变化优先
- 自定义卡牌 / workshop / DSL —— 不动

---

## 7. 决策溯源

| 决策点 | 选择 | 备选 | 理由 |
|---|---|---|---|
| 行为零变化档位 | B（搬迁 + 适度收敛） | A 纯搬迁 / C 收敛 dev | A 太保守（搬完仍单文件大）；C 偏向行为收敛会扩散到 §7 协议层范围 |
| RoomPersistence 接口粒度 | 5 方法（窄） | 7-8 方法 / 双接口分层 | 深 module 思路（参考 S3 PaymentSolver ADR-0006）；in-memory adapter 实现简单 |
| broadcaster 内 viewer-mask | 拆 envelope-builder + broadcaster 两文件 | broadcaster 全包 / broadcaster 仅扇出 | envelope-builder 是 pure function，可独立单测；broadcaster 极薄 |
| Room 形态 + rooms map | plain type + RoomRegistry class（无 module 单例） | Room class / 单独 rooms-registry singleton | 彻底无 module-level mutable state；S5 不兼做 Room 行为充血（那是 §6 思路） |
| dispatch table 形态 | 函数式 handler 表 | 闭包 class / 命令对象 | handler 单测最简单（mock ctx + 调函数）；与 persistence 接口风格一致 |
| Adapter selection | `createWsServer({ persistence })` 显式注入 | env-based 模块级常量 | env-based + module reset 在 vitest 下脆弱；DI 让测试 new in-memory 直接用 |
| Lobby 入口归属 | `server/game/lobby.ts` | `room.ts` 内 / `connection/lobby-handlers.ts` | dissolve 同时需要 registry + persistence + broadcaster，IO 依赖汇在 lobby 最自然 |
| 测试 import 迁移 | A1 一次性改 | A2 保留 re-export shim | DoD 写明 room-manager.ts 不复存在；shim 形式上违反 DoD |
| HTTP game-router.ts | 不在 S5 范围 | 顺便重整 | §12 §15 都没列；HTTP 是辅助通道，重整动机弱 |

---

## 8. DoD 总结（S5 完成判据）

- ✅ `server/game/room-manager.ts` 不复存在
- ✅ `server/connection/{ws-server,room-router,envelope-builder,broadcaster,connection-ctx}.ts` 存在
- ✅ `server/game/persistence/{room-persistence,sqlite-adapter,json-adapter,memory-adapter}.ts` 存在
- ✅ `server/game/{room,room-registry,lobby}.ts` 存在
- ✅ `pnpm test:fast` + `pnpm test:slow` + `pnpm run lint` + `pnpm run build` 全绿
- ✅ `pnpm run test:e2e` smoke 通过
- ✅ `RoomPersistence` 5 方法接口 + 3 adapter（sqlite / json / memory）+ 契约测试 3 adapter 跑同一份用例
- ✅ `docs/ENGINE_NEW_ARCHITECTURE.md` §15 S5 / §8 / §15bis 状态回流
