# server/ — 后端权威

[English](server.md) | [中文](server_zh.md)

> 本文件是中文翻译镜像；[server.md](server.md) 是唯一权威版本。

服务端负责连接、Room、持久提交、持久化与产品 HTTP API。`GameSession`（`server/game/authoritative-session.ts`）是服务端的规则命令与查询 seam，规则修改在它驱动的 `GameCore` 与 action leaf 中执行；连接、持久化与 HTTP 基础设施从不在它之外裁定规则。

`frontend-hosting.ts` 负责可选的同源 `/open-agricola/` 静态托管及其公开构建元数据。配置同站的独立前端时，仅旧应用入口跳转到前端，保留公开 Room/Replay 参数并清除认证 fragment。API、operations、metrics 和 Replay 命名空间保留原归属。`auth-cookies.ts` 经 `http-origin.ts` 使用 Public Suffix List 判断站点；同站子域使用 host-only HttpOnly Cookie，不依赖 CHIPS。测试见 `auth-cookies.test.ts`、`frontend-hosting.test.ts` 和 `hosted-password-login.spec.ts`，决策见 ADR 0035。


`community-qr.ts` 提供公开只读的微信和飞书群图片接口，每次请求读取通过原子替换更新的宿主机文件，响应禁用缓存。`deploy-operations.sh --wechat-qr` 或 `--feishu-qr` 调用 `operations/update-community-qr.mjs` 校验原图并经维护者 SSH 发布；应用只读挂载持久的社区目录。测试见 `wechat-community.test.ts` 和 `wechat-community.spec.ts`。


## server/connection/ — WebSocket 入口

```text
server/connection/
├── ws-server.ts      new WebSocketServer({ server, path: '/ws' })
├── room-router.ts    根据 ClientCommand.type 路由到 GameSession / Lobby
└── broadcaster.ts    StateUpdateEnvelope 扇出
```

- 一个 Room 恰好拥有一个 `GameSession`。WebSocket handler 通过 Room 与连接队列等待 `dispatch()`，Room 的 `ready | blocked` 闸门位于命令入口。
- `room-router` 校验命令、授权座位并调用 `GameSession`；它从不写 `GameState`。`payload-validation.ts` 是返回规范化值的纯校验。
- 返回 `ok=false` 且没有 `durableTransition` 的规则命令只回复发起连接，不产生版本或 Replay Step。持久拒绝会提交；只有它的错误仅发给发起者（[ADR 0015](../adr/0015-provisional-cross-player-continuation-resolution.md)）。

## server/game/ — Room 与 GameSession

```text
server/game/
├── room.ts                    Room { id, session, players, maxPlayers, startedAt }
├── room-registry.ts           RoomRegistry
├── lobby.ts                   大厅 / 房间列表 / 自动加入
├── room-persistence-checkpoint.ts  等待态 / 座位元数据异步写入和丢弃生命周期
├── authoritative-session.ts   GameSession extends GameCore — 命令执行中心
└── persistence/
    ├── room-persistence.ts    抽象接口
    ├── postgres-adapter.ts    PostgreSQL rooms.state_json
    └── memory-adapter.ts      测试注入
```

- `RoomPlayer { ws, playerIndex, name, userId? }` 是连接座位，不是 `PlayerState`。
- 普通多人局通过 `resolveJoinPlayerIndex` 为新玩家均匀随机分配空座；原有玩家恢复已提交座位。重开先准备新的身份绑定并保留名字、颜色，提交后在首份快照前向各连接发布座位。命令入口从采用后的 Room 刷新座位；开发房间、单人和热座沿用原有分配方式。覆盖：`server/connection/__tests__/room-router.test.ts`、`e2e-tests/draft-opening-order.spec.ts`。
- `room-access.ts` 负责邀请准入。创建默认公开，也可为其余每个座位指定一个可用账号 ID。`RoomMeta` 将权限存入 `rooms.invited_user_ids`，恢复与 `newGame` 保留该权限。大厅 SQL 在限制条数前按已认证用户过滤；定位、活动 Context 和直接 WS 加入分别校验准入，恢复原座位仍由已有座位归属控制。邀请名单不进入 GameState、Replay 或公开摘要，完赛 Replay 仍公开。`GET /api/lobby/players?prefix=` 要求登录，按用户名或显示名开头至少两个字符匹配，忽略大小写，排除本人及不可用账号，最多返回十个展示身份。测试：`server/__tests__/room-invitations.test.ts`、`e2e-tests/room-invitations.spec.ts`。
- `lobby-my-rooms.ts` 为 `/api/lobby/my-rooms` 读取已提交快照，不恢复 Session。共享 `MyActiveRoom` 契约公开已占用座位的显示名、颜色、创建与开局时间、启用的扩展、游戏回合或开局阶段，以及 pending frame 的所有者或当前玩家。同时轮抽的等待座位列表包含当前阶段尚未提交所需选牌的所有玩家，不返回私有状态、卡牌身份或账号 ID。快照无法解析时省略该房间从状态派生的详情。测试：`server/__tests__/lobby-my-rooms.test.ts`。
- 创建预检独立授权新的建局意图，不依赖连接之前显示的规则会话。离开非 active 的 Game Context 只移除其连接座位，不再通过旧 Room 的执行 stamp 或租约发布事件。
- 创建在持久提交回调中先采用新 Room，再分离原连接。旧房通知失败只记录故障，不回滚或释放已提交的新会话；初始化清理由提交边界决定。
- 正式单人通过 `createRoom(maxPlayers: 1)` 创建一个登录账号座位，Step 0 提交后才确认创建。进行中的单人 Room 不进入公开发现，原参与者仍沿用普通恢复授权。`createRoom(sourceGameContextId)` 经 `game-creation-store.ts` 读取不可变的已接受创建元数据，校验已完成来源的唯一参与者，不加载旧 Room 或 Replay 就能创建新局。首次事务同时提交 Room、Step 0、创建配置和命令回执，并再次校验来源及 Workshop 准入；显式卡源不可用时返回完整原选择和类型化差异。契约及测试见 `shared/contract/game-creation.ts`、`server/connection/__tests__/solo-room.test.ts`。
- `roomId` 恰好标识一局游戏（[ADR 0009](../adr/0009-room-id-identifies-one-game.md)）。`newGame` 创建新的 `GameSession` 与 UUID，从不复用旧 ID，并在退役旧局的同一事务中迁移在线座位、人数、自定义卡与变体开关。只有权威 `gameOver` 在一个事务中写入 Game Result Archive 并删除可恢复快照；归档写入失败会回滚并保留最终状态以便重试。闲置过期、取消等待房间与销毁清理把 Game Context 标为 `expired`，不产生结果；协商提前结束则保留独立的 `terminated` 归档。结果分数保留引擎原始数值，包括小数（[持久化测试](../../server/game/persistence/__tests__/postgres-replay.test.ts)）。
- 所有托管对局，包括工坊、热座与开发 Room，都使用 PostgreSQL 和强制录制。`RoomPersistenceCheckpoint` 持久确认创建、等待状态与座位。重启后普通存档按需加载，未加载存档由 `GameContextStore` 过期清理，并保护在线连接、准入预留与未完成保存。所有玩家断线后，普通 Room 在等待时保留 30 分钟、进行中保留 7 天；开发对局不会因闲置过期。在线启动不做旧数据清理，缺失录制数据会阻断恢复，而不是编造替代内容。
- 开发槽 `dev2`–`dev6` 映射到跨重启保持的永久对局身份；重开或重置会分配新身份，completed、expired 或 removed 的 context 从不复活。开发账号可以持有多个座位，开发恢复需要座位提示或唯一归属的座位；普通 Room 的座位由已认证的归属推导。客户端的 `devMode` 标志不授予任何开发权限。`room_players` 以 `(room_id, player_index)` 存储归属。
- 候场命令 `setPlayerColor` 只修改发送者自己的座位。已入座和保留座位独占颜色；选择空位颜色时交换两处颜色。`GameSession.updatePlayerColors` 同步更新隔离 Worker。Room 队列串行处理竞争请求，checkpoint 把颜色与命令回执一同持久化后再广播；开局后锁定颜色。
- 普通 Room 最后一个座位坐满后继续候场。`colorConfirmationPlayerIndex` 记录最后入场者，随 checkpoint 持久化、恢复并发送给候场客户端。只有该座位可提交 `confirmPlayerColor`，初始 Frame 与回执提交后才开始游戏。热座与开发 Room 保留自动开局。大厅状态取自 Room，不从占座人数推断。覆盖：`room-router.test.ts`、`room-invitations.spec.ts`。
- `room-queue.ts` 按 Room 串行化授权、规则、异步提交与发布；移动连接会同时占用两个 Room 队列与连接队列。关闭时停止输入、排空已接受的工作并关闭连接池。
- **分布式 Room**（[ADR 0022](../adr/0022-distributed-room-recovery.md)）：`RoomDirectory` 用 PostgreSQL 租约与单调 epoch 把每个 Room 分配给一个应用进程；提交与发布都校验 owner 与期望版本。`POST /api/rooms/locate` 返回由 `ingress.ts` 转发的 `/nodes/<instanceId>/ws` 路由。`CommandStore` 为每个命令预留内容指纹，并把回执与 Room 状态转换一同提交；重复的命令返回原回执。`InvalidationStore` 提交卡牌 / 用户屏障与按实例的任务，每次执行与发布都检查屏障；只有每个相关实例都确认或失去租约后操作才完成。
- **历史与恢复**（[ADR 0021](../adr/0021-room-owned-history-branches-and-recovery-snapshots.md)）：不可变的历史节点与恢复记录是 Room 拥有的行，随 Room transaction 写入。恢复会还原权威会话、撤销历史与暂定检查点，而不解码 Replay payload。查询失败原样向上抛出，供存储重试；只有已读取数据的解码与完整性失败才以 `RoomHistoryCorruptionError` 封闭失败。
- **快照所有权**：`serializeSessionSnapshot` 只捕获一次权威核心；`state` 与 `frame` 共享不可变值；`rehydrateState` 在规范化之前复制。`RoomCommitter` 持有已捕获的 Frame 与 payload，用于比较与重试。
- **历史窗口**：视角快照携带最近 20 个完整操作组，带稳定记录 ID、按视角绑定的分支 ID、`projectionHash` 锚点与更早一页的游标。`getHistory` / `historyPage` 使用活动座位授权与完整视角过滤；分支或投影变化时返回 `history_branch_changed` / `history_projection_changed`。读取从不写 Room。HTTP、本地与 debug payload 保持完整。

测试：`server/game/__tests__/`、`server/__tests__/session-recovery-data.test.ts`。

协商终止（[ADR 0036](../adr/0036-consensual-game-termination.md)）是独立的 Room 生命周期转换。`game-end.ts` 定义同意规则；Room 元数据检查点持久化待处理提议，不受游戏撤销影响。`PostgresRoomPersistence.terminate()` 在同一事务中写入终止记录、保留录制回放、完成命令回执并退出活动恢复。它不写正常 Game Result，也不改变规则层的 `gameOver`。未完赛重开复用同一归档事务，并为所有原参与者保留新局座位，包括离线玩家。

## Durable Room Commit、Game Context、Replay 与 Bug Report

```text
server/game/
├── room-committer.ts          Durable Room Commit 的唯一外部 seam
├── replay-codec.ts            canonical JSON、delta、gzip、Frame Hash
├── game-context-store.ts      lifecycle resolver
├── replay-store.ts            公开 manifest、Segment、Anchor read model
├── replay-viewer-build.ts     Viewer Build 完整性校验
└── persistence/
    └── postgres-adapter.ts      Room + Replay + Result 的原子事务
server/game-context-routes.ts  lifecycle resolver
server/replay-routes.ts        manifest、Segment、Anchor、Viewer/Asset 静态读取
server/bug-report-routes.ts    draft、GitHub connection、submit/status、audit
server/bug-report/
├── bug-report-store.ts        PostgreSQL draft/attempt/claim 状态机
└── github-issue-client.ts     GitHub App 唯一外部 adapter
```

`RoomCommitter` 是具体的深 module，也是发布 seam（[ADR 0014](../adr/0014-durable-room-commit-is-the-publish-seam.md)）；不要为它加单一实现的 interface。它唯一的提交操作返回：

```ts
type RoomCommitResult =
  | { kind: 'committed'; roomVersion: number; stepNo: number; frameHash: string }
  | { kind: 'unchanged' }
  | { kind: 'blocked'; error: string }
```

```text
ClientCommand
  → room-router：验证座位与 payload
  → GameSession：内置卡同步产生 SessionResponse；可执行 Workshop 卡由会话 Worker 异步返回
  → RoomCommitter：序列化一次，原子写 Room snapshot + Replay Step
  → Broadcaster：提交成功后生成各座位遮蔽 envelope 并发送
```

- 只有公开 Frame Hash 与私有会话游标都未变化、且未设置 `durableTransition` 时才是 `unchanged`；只改变游标的转换也会持久化，并重复同一个 Frame。重连与补拉不产生 Step。
- Replay Step 有 Room 全局单调递增的 `stepNo`，与 `roomVersion` 无关；同时提交按连续 Step 串行化，自动结算属于最后一份触发输入，规则结果从不依赖到达顺序。Step 0 在第一个交互命令之前存在。终局 Frame 归档 `PlayerScoreSummary[]`。
- Replay Intent 由穷尽的协议 switch 白名单化；从不保存 `requestId`、token、站点 `userId` 或未校验 payload。
- Replay 归档使用有界的权威状态差量（[ADR 0011](../adr/0011-bounded-authoritative-state-delta-replays.md)）。
- 写入失败时冻结同一份 Frame 与 Intent，阻断 Room 并按退避重试；客户端等待，从不读取未提交状态。相同幂等 key 但 hash 不同会永久阻断并报警。
- 单实例最多准入 30 个有 OPEN 连接或有效 30 秒预留的普通 Room。`RoomDirectory` 原子检查新建和首次恢复，包括缓存 Room；激活不消耗预留，直到正数在线 presence 消耗它。离线存档和缓存 Room 保留 owner，不占在线配额。独立的 15 个 Worker 槽仍计入保留的可执行工坊 executor、恢复的 Room 与 HTTP 沙盒。满额在线 Room 可重连已有座位，并以 `newGame` 一换一替换。准入、重试中断线及冷恢复不变量由 `room-directory.test.ts` 和 `ws-server.test.ts` 验证。
- Game Context 链接按生命周期解析（[ADR 0013](../adr/0013-lifecycle-routed-game-context-access.md)）：completed、expired、removed 以及公开 Replay 不需登录；活动描述、恢复、Bug Report、证据与维护者取证执行座位或管理员授权。错误使用 `{ ok:false, code, lifecycle?, message }`。
- 完成的 Replay 公开保留，直到被删除（[ADR 0010](../adr/0010-public-replay-retention-and-erasure.md)）。
- Bug Report（[ADR 0012](../adr/0012-github-issue-submission-identity-and-delivery.md)）是可恢复的 PostgreSQL 草稿，带稳定 `submissionId`、尝试记录与原子 claim。生产 GitHub App 客户端与测试 fake 是这一 seam 的两个 adapter。

测试：`server/game/__tests__/{room-committer,room-committer-private-cursor,replay-delta-shared-history}.test.ts`、`server/__tests__/{bug-report-routes,bug-report-store}.test.ts`、`e2e-tests/{replay-viewer,bug-report}.spec.ts`。

## server/custom-code/ — 隔离执行

```text
server/custom-code/
├── runtime.ts           为共享 registrar 绑定隔离执行器
├── engine.ts            共享校验及 manifest 提取的 isolated-vm 执行边界
├── isolate-runner.ts    isolated-vm 隔离入口
├── executor-worker.ts   Worker Thread 入口
└── client.ts            主进程 → Worker Thread 同步调用客户端
```

- 后端只保存 `compiled_code + code_manifest`。非内置的可执行工坊卡在其 HTTP 沙盒或 WebSocket Room 中，把每个 `GameSession` 命令放进专用 Worker（`CustomSessionExecutor`）执行；同一 Room 按 FIFO 执行直至 Durable Commit，不同 Room 并行；同一连接之后的 Room 或座位变更不能改变进行中命令的 Room 或 Replay 行动者。
- 主线程只保留最后一次成功快照的非执行镜像，经不结算的恢复路径载入，因此从不重新探测续行。在 Worker 内，`client.ts` 同步调用 isolated-vm，因此 `Atomics.wait()` 从不阻塞 HTTP 或 WebSocket 事件循环。
- 每个命令前在内存中建立检查点，保留 pending 状态与撤销历史。hook 超时或运行时警告会恢复它并保留诊断；Worker 崩溃或整体超时会从最后快照重建。
- `built_in=1` 的卡使用内置实现，不创建 Worker。
- shared 源码常量拥有能力名称，`workshop-sandbox-contract.ts` 以 format-2 名称数组提供这些名称、运行时标识和限制。执行边界见 [`docs/CUSTOM_CARD_SANDBOX.md`](../CUSTOM_CARD_SANDBOX.md)。

测试：`server/__tests__/{custom-code-executor,local-sandbox-parity}.test.ts`。

## HTTP 端点

HTTP 用于运维、测试与调试，不是实时同步链路。响应与 `SessionResponse` 一致，校验端点从不写权威状态。在 WebSocket Room 内，开发命令使用 `ClientCommand`。

- `GET /api/health`、`GET /api/rooms`、`GET /api/game/state`。
- `POST /api/game/new` 接受 `seed?` 与 WebSocket `createRoom` 的设置，经 `server/game/game-setup-options.ts` 映射。`POST /api/game/load`、`POST /api/game/dev/*` 与 `POST /api/game/new-sandbox` 是调试与工坊沙盒路径。
- `GET /cards-manifest.json` 向主 bundle 提供卡牌 metadata。
- OAuth 账号绑定：`POST /api/auth/oauth/:provider/start?intent=link`、`GET …/callback` 与 `POST …/complete`，使用 PKCE S256 与 fragment 交接，从不创建新的站点会话。
- OAuth 注册：`GET /api/auth/oauth/:provider/start` 将浏览器的 SHA-256 challenge 绑定到 OAuth state 和有效期十五分钟的一次性注册票据。回调用 fragment 交接票据，并设置 `no-store`、`no-referrer`；`POST /api/auth/onboarding/complete` 只在浏览器 verifier 匹配时接受显式票据。带有 challenge 的票据无论从正文还是 Cookie 传入，均须验证 verifier。未绑定的 Cookie 票据仍可按原方式完成注册，显式凭证失败时不会退回其他 Cookie 身份。账号创建、身份绑定、邀请码与票据消费共用同一事务。凭证缺失、无效与票据过期、已消费使用不同错误码。

认证测试：`server/__tests__/auth-routes.test.ts`、`server/oauth/__tests__/store.test.ts`、`e2e-tests/{oauth-onboarding,account-link,platform}.spec.ts`。

Game Context、Replay 与 Bug Report 是版本化的产品 API：

创建配置读取只授权已完成单人局的原参与者，始终使用 `no-store`；公开 completed descriptor 和无需凭证的 Viewer 不附带这份私有元数据。

```text
GET    /api/v1/game-contexts/:roomId
GET    /api/v1/game-contexts/:roomId/creation-configuration
GET    /api/v1/replays/:roomId/manifest
GET    /api/v1/replays/:roomId/segments/:checkpointStepNo
GET    /api/v1/replays/:roomId/anchors/:stepNo?frame=<sha256>
GET    /api/v1/game-contexts/:roomId/evidence/:stepNo?frame=<sha256>
GET    /replay-viewers/:viewerBuildId/*
GET    /replay-assets/:sha256
POST   /api/v1/game-contexts/:roomId/bug-reports
GET    /api/v1/bug-reports/:submissionId
PATCH  /api/v1/bug-reports/:submissionId
POST   /api/v1/bug-reports/:submissionId/submit
DELETE /api/v1/bug-reports/:submissionId
POST   /api/v1/bug-reports/:submissionId/evidence/inspect
GET    /api/v1/issue-submission-connection
DELETE /api/v1/issue-submission-connection
POST   /api/v1/issue-submission-connection/github/start
GET    /api/v1/issue-submission-connection/github/callback
POST   /api/v1/issue-submission-connection/github/complete
POST   /api/v1/github-app/webhook
```

公开 Replay API 返回版本化 JSON，从不暴露 PostgreSQL 编码。一个 Segment 最多展开一条 checkpoint 链，并校验每个 Frame Hash；Anchor 必须精确匹配 `stepNo + frameHash`。公开读取有按 IP 的配额与大小上限；需认证的证据与报告端点按账号限流。

Viewer 入口 HTML 重新验证响应策略；内容寻址的资源仍永久缓存。其 CSP 显式允许 `PUBLIC_API_BASE` 的来源（本地开发使用请求来源），供不透明来源的沙箱读取公开资源，脚本仍限于 `'self'`。覆盖：`replay-routes.test.ts` 与 `replay-viewer-csp.spec.ts`。

## 工坊后端

`server/workshop.ts` 与 `server/workshop-pr/` 提供自定义卡上传、编译、沙盒与 PR 投递。完整产品流程见 [Platform design](../PLATFORM_DESIGN.md)。

- 沙盒设置（`sandbox_settings`、`sandbox_cards`）持久化人数、牌组与变体开关；`POST /api/game/new-sandbox` 把它们传给 `createInitialState()`。
- 审核与发布是 `server/workshop-status.ts` 中的两个维度：审核 `unsubmitted / in_review / approved / stale / merged`，发布 `live`。卡牌绑定一个基于 `main`、打开且非草稿的 PR，并固定其 head 与 Design Draft。只有有 push 权限的审核者对精确 head 的真实批准才能批准一个版本；发布时重新查询 GitHub，要求 head、审核 SHA、批准 SHA 与固定版本一致。任何不一致、关闭、转为草稿、改变 base 或撤销批准都会让卡牌进入 `stale·offline`，处理 webhook 或发布时 GitHub 查询失败也是如此。绑定后立即刷新若暂时失败，则保留 `in_review` 绑定、清除同步时间，作者可通过 `refresh-pr-status` 重试。
- 合入 `main` 的 PR 让已批准的卡牌毕业为只读的 `merged`。在批准之前观察到的合入会被记录（`github_pr_status='merged'`），只有在有权限的精确 head 批准被核对后才毕业；合入其他 base 的 PR 进入 `stale·offline`。在线的已合入卡牌继续提供其审核快照直到发布，之后启动时 `markBuiltInMergedCards` 让内置定义接管。
- 真实 Room 中的 `customCardIds` 只接受已批准、已上线的卡，并使用其审核过的快照。正式单人保留全部显式选择，卡源不可用或来源变化时拒绝创建并返回配置调整；其他 Room 对作者自己未上线的卡给出指引，过滤其他无法加载的 ID。未审核的代码只在工坊沙盒中运行，从不进入多人 `GameSession`。
- 作者 `unpublish` 让已有对局继续完成；管理员下架会结束每个嵌入该卡的 Room，不计分也不产生 Replay。
- 投稿使用一个仓库范围的 GitHub App；`workshop_submissions` 在远端写入前冻结操作身份与 Draft Version，分支发布使用 expected-head CAS，不确定的 PR 创建会对账而不再盲目 POST，生成文件冲突会暂停投递。见 [GitHub App runbook](../operations/github-oauth-app-setup.md)。
- 工坊草稿错误暴露 `shared/contract/workshop.ts` 中的类型化 `code`；在线编辑守卫以 HTTP 409 返回 `live_edit_blocked`。

测试：`server/__tests__/{workshop-api,workshop-submissions}.test.ts`、`server/workshop-pr/__tests__/`。

## 数据库

- `server/db.ts` 通过 `pg` 持有异步 PostgreSQL 连接：transaction 跨 await 保持同一连接，嵌套 transaction 使用 savepoint，原生迁移在启动前于 advisory lock 下执行。运行时没有 SQLite 或 JSON 回退。
- `scripts/import-sqlite.ts` 通过精确比对导入停机的 schema-33 SQLite 数据库，遇到损坏的已录制对局会阻断，`data_imports` 让失败的导入停在启动屏障之后；`scripts/validate-backup.ts` 校验 PostgreSQL / S3 的恢复。
- 产品表：`game_contexts`、`game_context_participants`、`game_replays`、`game_replay_steps`、`issue_submission_connections`、`account_deletion_requests`、`github_grant_revocations`、`bug_reports`、`bug_report_attempts`、`bug_report_evidence_audit`；以及 `rooms`、`room_players`、`game_results`、`game_result_players`、`oauth_states` 和 Room 历史与恢复表。Segment 由 `checkpointStepNo` 表达；没有 Segment、证据 payload、配额或 webhook 投递表。
- 录制上线前完成的对局为 `legacy_no_replay`：保留结果摘要，但没有 Replay header 或 Frame。

## GitHub 投递、安全与删除

Bug Report 投递遵循 [ADR 0012](../adr/0012-github-issue-submission-identity-and-delivery.md)：

- 草稿在确认报告者拥有原始座位后冻结 `roomId + stepNo + frameHash`；每个用户最多保留五份未投递的报告。公开 Issue 带清洗过的标题，正文不含截图、日志、Frame payload、其他玩家身份或隐藏信息。
- 生产 `github-issue-client` 只接受服务端配置的仓库与安装 ID，并通过稳定的正文标记对账不确定的响应，只接受由所配置 App 在本次尝试之后创建、且以该标记唯一结尾的 Issue。客户端只轮询站内状态，从不直接访问 GitHub。本人提交使用加密的 GitHub App 用户 token（AES-256-GCM 加 `keyId`），并需要确认 GitHub 身份会保持公开；Hosted Issue Identity 使用安装 token。连接失效时从不自动切换作者。
- 删号时持久化 `deletion_pending`、登出所有会话，并通过安装 adapter 编辑已知 Issue 正文，持续重试直到 GitHub 确认站点用户 ID 已消失。
- 维护者读取证据需要填写理由，永久审计、限流，并重新应用当前参与者的 tombstone 投影。
- 删除（[ADR 0010](../adr/0010-public-replay-retention-and-erasure.md)）：`server/game/replay-removal.ts` 在删除 payload 前，用 ETag CAS 把每个批次追加到私有 S3 中独立的 `erasure/ledger.json`；启动与恢复会幂等应用它，格式错误的 ledger 会阻断恢复，资源读取与上传会查询其永久哈希拒绝规则。日志从不包含 token、Frame payload、现象文字或原始 GitHub 响应。

## 部署、回滚与观测

部署命令与指标目录见 [`HOW_TO_DEPLOY.md`](../HOW_TO_DEPLOY.md)。

- PostgreSQL 保存平台数据与共享资源目录；私有 S3 保存 `card-art/`、`replay-viewers/<viewerBuildId>/`、`replay-assets/<sha256>` 与 `erasure/ledger.json`。`server/storage/` 负责暂存上传、引用、完整性检查与清理 claim；写入前先持久化上传意图，新上传有 24 小时未引用宽限期，同一对象只有一个 claim 者删除。
- Durable Room Commit 需要 PostgreSQL、共享资源、`REPLAY_VIEWER_BUILD_ID` 与 `GAME_BUILD_ID`。创建 Room 时锁定两个 Build ID 与自定义卡运行时快照。Viewer Build ID 是其完整 manifest 的 SHA-256；版图美术、卡牌美术与字体来自 `public-assets.ref` 固定的素材站。Build 校验失败时创建 Room 失败，等待中的 Room 在 Step 0 存在之前拒绝对局写入。
- 只允许回滚到支持所有活动 Room `schemaVersion` 的兼容录制构建。缺少 Viewer 或持久化不可写会让 readiness 降级。在线 Room 容量只拒绝新准入，离线保留存档不降低 readiness。
- `operations/` 管理独立发布的监控 Compose project 和受限账户采集器。`deploy-operations.sh` 只固定发布运维源码并保留游戏容器身份；游戏部署只管理 app/Caddy。账户采集器统计现存账户及 UTC+8 自然日、滚动时间窗口的新增，不导入游戏初始化或运行迁移。
- `server/observability/` 负责有界数值指标、采集、管理员网关与总览健康状态，从不写规则状态。指标不带 Room、账号、命令、卡牌、payload 或异常身份，指标失败不会改变对局结果。命令耗时覆盖从分发到本地发布；投影、编码与发送是独立阶段。
- 私有 Prometheus 采集器通过 bearer 认证的 ingress 发现实例；ingress 负责全局 Room 聚合与在线用户。Grafana 只在 `/ops/` 后读取聚合数据，每次请求都通过一次性交接 cookie 检查当前站点会话与 `ADMIN_USERS`。
- 浏览器发送抽样、限流的计时批次（命令 RTT、首个快照、快照到布局），服务端视为不可信的观测输入。

