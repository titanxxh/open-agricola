# server/ — 后端权威

[English](server.md) | [中文](server_zh.md)

> 本文件是中文翻译镜像；[server.md](server.md) 是唯一权威版本。

服务端负责连接、Room、持久提交、持久化与产品 HTTP API。`GameSession`（`server/game/authoritative-session.ts`）是服务端的规则命令与查询 seam，规则修改在它驱动的 `GameCore` 与 action leaf 中执行；连接、持久化与 HTTP 基础设施从不在它之外裁定规则。

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
- `roomId` 恰好标识一局游戏（[ADR 0009](../adr/0009-room-id-identifies-one-game.md)）。`newGame` 创建新的 `GameSession` 与 UUID，从不复用旧 ID，并在退役旧局的同一事务中迁移在线座位、人数、自定义卡与变体开关。只有权威 `gameOver` 在一个事务中写入 Game Result Archive 并删除可恢复快照；归档写入失败会回滚并保留最终状态以便重试。过期、解散、删号与未完成的重开把 Game Context 标为 `expired`，不产生结果。
- 所有托管对局，包括工坊、热座与开发 Room，都使用 PostgreSQL 和强制录制。`RoomPersistenceCheckpoint` 持久确认创建、等待状态与座位。所有玩家断线后，普通 Room 在等待时保留 30 分钟、进行中保留 7 天；开发对局不会因闲置过期。在线启动不做旧数据清理，缺失录制数据会阻断恢复，而不是编造替代内容。
- 开发槽 `dev2`–`dev6` 映射到跨重启保持的永久对局身份；重开或重置会分配新身份，completed、expired 或 removed 的 context 从不复活。开发账号可以持有多个座位，开发恢复需要座位提示或唯一归属的座位；普通 Room 的座位由已认证的归属推导。客户端的 `devMode` 标志不授予任何开发权限。`room_players` 以 `(room_id, player_index)` 存储归属。
- `room-queue.ts` 按 Room 串行化授权、规则、异步提交与发布；移动连接会同时占用两个 Room 队列与连接队列。关闭时停止输入、排空已接受的工作并关闭连接池。
- **分布式 Room**（[ADR 0022](../adr/0022-distributed-room-recovery.md)）：`RoomDirectory` 用 PostgreSQL 租约与单调 epoch 把每个 Room 分配给一个应用进程；提交与发布都校验 owner 与期望版本。`POST /api/rooms/locate` 返回由 `ingress.ts` 转发的 `/nodes/<instanceId>/ws` 路由。`CommandStore` 为每个命令预留内容指纹，并把回执与 Room 状态转换一同提交；重复的命令返回原回执。`InvalidationStore` 提交卡牌 / 用户屏障与按实例的任务，每次执行与发布都检查屏障；只有每个相关实例都确认或失去租约后操作才完成。
- **历史与恢复**（[ADR 0021](../adr/0021-room-owned-history-branches-and-recovery-snapshots.md)）：不可变的历史节点与恢复记录是 Room 拥有的行，随 Room transaction 写入。恢复会还原权威会话、撤销历史与暂定检查点，而不解码 Replay payload。查询失败原样向上抛出，供存储重试；只有已读取数据的解码与完整性失败才以 `RoomHistoryCorruptionError` 封闭失败。
- **快照所有权**：`serializeSessionSnapshot` 只捕获一次权威核心；`state` 与 `frame` 共享不可变值；`rehydrateState` 在规范化之前复制。`RoomCommitter` 持有已捕获的 Frame 与 payload，用于比较与重试。
- **历史窗口**：视角快照携带最近 20 个完整操作组，带稳定记录 ID、按视角绑定的分支 ID、`projectionHash` 锚点与更早一页的游标。`getHistory` / `historyPage` 使用活动座位授权与完整视角过滤；分支或投影变化时返回 `history_branch_changed` / `history_projection_changed`。读取从不写 Room。HTTP、本地与 debug payload 保持完整。

测试：`server/game/__tests__/`、`server/__tests__/session-recovery-data.test.ts`。

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
- 单实例最多 30 个普通内存 Room（等待加进行中，不含开发 Room），以及由可执行工坊 Room、恢复的 Room 与 HTTP 沙盒共享的 15 个 Worker 槽。达到上限只拒绝需要另一个 Room 或 Worker 的操作，包括 `newGame`。
- Game Context 链接按生命周期解析（[ADR 0013](../adr/0013-lifecycle-routed-game-context-access.md)）：completed、expired、removed 以及公开 Replay 不需登录；活动描述、恢复、Bug Report、证据与维护者取证执行座位或管理员授权。错误使用 `{ ok:false, code, lifecycle?, message }`。
- 完成的 Replay 公开保留，直到被删除（[ADR 0010](../adr/0010-public-replay-retention-and-erasure.md)）。
- Bug Report（[ADR 0012](../adr/0012-github-issue-submission-identity-and-delivery.md)）是可恢复的 PostgreSQL 草稿，带稳定 `submissionId`、尝试记录与原子 claim。生产 GitHub App 客户端与测试 fake 是这一 seam 的两个 adapter。

测试：`server/game/__tests__/{room-committer,room-committer-private-cursor,replay-delta-shared-history}.test.ts`、`server/__tests__/{bug-report-routes,bug-report-store}.test.ts`、`e2e-tests/{replay-viewer,bug-report}.spec.ts`。

## server/custom-code/ — 隔离执行

```text
server/custom-code/
├── runtime.ts           沙盒运行时
├── engine.ts            源码校验、编译与 manifest 提取
├── isolate-runner.ts    isolated-vm 隔离入口
├── executor-worker.ts   Worker Thread 入口
└── client.ts            主进程 → Worker Thread 同步调用客户端
```

- 后端只保存 `compiled_code + code_manifest`。非内置的可执行工坊卡在其 HTTP 沙盒或 WebSocket Room 中，把每个 `GameSession` 命令放进专用 Worker（`CustomSessionExecutor`）执行；同一 Room 按 FIFO 执行直至 Durable Commit，不同 Room 并行；同一连接之后的 Room 或座位变更不能改变进行中命令的 Room 或 Replay 行动者。
- 主线程只保留最后一次成功快照的非执行镜像，经不结算的恢复路径载入，因此从不重新探测续行。在 Worker 内，`client.ts` 同步调用 isolated-vm，因此 `Atomics.wait()` 从不阻塞 HTTP 或 WebSocket 事件循环。
- 每个命令前在内存中建立检查点，保留 pending 状态与撤销历史。hook 超时或运行时警告会恢复它并保留诊断；Worker 崩溃或整体超时会从最后快照重建。
- `built_in=1` 的卡使用内置实现，不创建 Worker。
- 沙盒约束只有一个权威来源 [`docs/CUSTOM_CARD_SANDBOX.md`](../CUSTOM_CARD_SANDBOX.md)，其 `prompt-sync` 块由 `pnpm run check:prompt-sync` 检查。

测试：`server/__tests__/{custom-code-executor,local-sandbox-parity}.test.ts`。

## HTTP 端点

HTTP 用于运维、测试与调试，不是实时同步链路。响应与 `SessionResponse` 一致，校验端点从不写权威状态。在 WebSocket Room 内，开发命令使用 `ClientCommand`。

- `GET /api/health`、`GET /api/rooms`、`GET /api/game/state`。
- `POST /api/game/new` 接受 `seed?` 与 WebSocket `createRoom` 的设置，经 `server/game/game-setup-options.ts` 映射。`POST /api/game/load`、`POST /api/game/dev/*` 与 `POST /api/game/new-sandbox` 是调试与工坊沙盒路径。
- `GET /cards-manifest.json` 向主 bundle 提供卡牌 metadata。
- OAuth 账号绑定：`POST /api/auth/oauth/:provider/start?intent=link`、`GET …/callback` 与 `POST …/complete`，使用 PKCE S256 与 fragment 交接，从不创建新的站点会话。

Game Context、Replay 与 Bug Report 是版本化的产品 API：

```text
GET    /api/v1/game-contexts/:roomId
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

## 工坊后端

`server/workshop.ts` 与 `server/workshop-pr/` 提供自定义卡上传、编译、沙盒与 PR 投递。完整产品流程见 [Platform design](../PLATFORM_DESIGN.md)。

- 沙盒设置（`sandbox_settings`、`sandbox_cards`）持久化人数、牌组与变体开关；`POST /api/game/new-sandbox` 把它们传给 `createInitialState()`。
- 审核与发布是 `server/workshop-status.ts` 中的两个维度：审核 `unsubmitted / in_review / approved / stale / merged`，发布 `live`。卡牌绑定一个基于 `main`、打开且非草稿的 PR，并固定其 head 与 Design Draft。只有有 push 权限的审核者对精确 head 的真实批准才能批准一个版本；发布时重新查询 GitHub，要求 head、审核 SHA、批准 SHA 与固定版本一致。任何不一致、关闭、转为草稿、改变 base 或撤销批准都会让卡牌进入 `stale·offline`，处理 webhook 或发布时 GitHub 查询失败也是如此。绑定后立即刷新若暂时失败，则保留 `in_review` 绑定、清除同步时间，作者可通过 `refresh-pr-status` 重试。
- 合入 `main` 的 PR 让已批准的卡牌毕业为只读的 `merged`。在批准之前观察到的合入会被记录（`github_pr_status='merged'`），只有在有权限的精确 head 批准被核对后才毕业；合入其他 base 的 PR 进入 `stale·offline`。在线的已合入卡牌继续提供其审核快照直到发布，之后启动时 `markBuiltInMergedCards` 让内置定义接管。
- 真实 Room 中的 `customCardIds` 只接受已批准、已上线的卡，并使用其审核过的快照；作者自己未上线的卡会以指引拒绝创建，其他无法加载的 ID 静默过滤。未审核的代码只在工坊沙盒中运行，从不进入多人 `GameSession`。
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
- 只允许回滚到支持所有活动 Room `schemaVersion` 的兼容录制构建。缺少 Viewer、持久化不可写或达到 Room 上限会让 readiness 降级，只拒绝新 Room。
- `server/observability/` 负责有界数值指标、采集、管理员网关与总览健康状态，从不写规则状态。指标不带 Room、账号、命令、卡牌、payload 或异常身份，指标失败不会改变对局结果。命令耗时覆盖从分发到本地发布；投影、编码与发送是独立阶段。
- 私有 Prometheus 采集器通过 bearer 认证的 ingress 发现实例；ingress 负责全局 Room 聚合与在线用户。Grafana 只在 `/ops/` 后读取聚合数据，每次请求都通过一次性交接 cookie 检查当前站点会话与 `ADMIN_USERS`。
- 浏览器发送抽样、限流的计时批次（命令 RTT、首个快照、快照到布局），服务端视为不可信的观测输入。

