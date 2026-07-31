# 14. Durable Room Commit is the publish seam

- Status: Accepted
- Date: 2026-07-27

## Context

ADR-0010 至 ADR-0013 已固定公开回放、delta 链、GitHub 身份和 Game Context 访问契约，但当前连接层会先发送 `StateUpdateEnvelope`，再把 Room 标脏并延迟约一秒保存。这样无法保证玩家已经看到的步骤可在崩溃后恢复，也没有一个模块同时协调 Room 快照、Replay Step、结果归档和失败暂停。

代表性真实命令与 Replay 写入的 2 CPU / 2 GiB 探针中，30 Room 的 action p99 为 88.5ms、CPU 为 83.6%，35 Room 的 action p99 升至 371.6ms、CPU 为 96.1%。首发上限因此固定为 30，不增加 Worker 或房间分片。

## Decision

### Durable publish

1. `room-router` 继续同步调用唯一写入 `GameState` 的 `GameSession`。成功且改变权威 Frame 的响应随后只经过一个具体的 `RoomCommitter` 模块；它在同一 SQLite 事务内更新 Room 快照并追加 Replay Step，成功后才允许 `Broadcaster` 为 Room 内在线座位生成各自遮蔽后的 envelope。
2. `RoomCommitter` 的小接口返回 committed、unchanged 或 blocked 结果，内部隐藏序列化、delta、gzip、Hash、事务、完成归档、幂等和重试。它不增加单实现 interface 或 factory；现有生产、JSON 和内存持久化 adapter seam 继续用于真实的多 adapter 差异。
3. `resp.ok=false` 只回发起连接，不增加 `roomVersion` 或 `stepNo`。成功但 Frame Hash 未变化时也不产生 Replay Step，只向发起者确认当前状态。重连、补拉和心跳不经过 Durable Room Commit。
4. `roomVersion` 和 `stepNo` 独立递增。`roomVersion` 标识成功提交后对玩家可见的状态版本；`stepNo` 只标识改变权威 Frame 的全局 Room 顺序。多个玩家同时提交时仍按 Room 串行占用连续 Step；最后一份输入触发的自动结算属于该输入的 Step，而且结算结果不得依赖到达顺序。
5. Step 0 在权威初始状态能够接收第一个互动命令前建立。互动 draft、Parent Selection 和其他多人提交发生在 Step 0 之后，各自按服务端接受顺序记录；classic deal 已包含在 Step 0。
6. 写失败时冻结同一份待提交 Frame 和 Replay Intent，Room 拒绝所有新游戏命令并向在线玩家显示保存暂停。系统按 1、2、5、10、30 秒退避，之后每 30 秒重试；成功后广播并恢复。暂停期间的新连接等待成功后再接收快照。进程在成功前退出时，重启恢复最后已提交 Step，玩家重做从未看到成功的操作。
7. 相同 `roomId + stepNo + frameHash` 的重试是幂等成功；相同 `roomId + stepNo` 出现不同 Hash 时永久阻断该 Room 并报警，绝不覆盖。持久化整体异常时拒绝新建 Room，但已存在 Room 保留并继续重试。

### Capacity and process shape

8. 首发保持单进程、同步 SQLite 提交，不增加 Worker、房间分片、Redis 或通用异步命令队列。一个 `ready | blocked` 的 Room 写入状态门阻止重试与新命令交错。
9. 2 CPU / 2 GiB 单实例最多保留 30 个普通内存 Room，`waiting` 与 `playing` 都计数，固定 dev Room 不计数。达到上限只拒绝新建，恢复已有 Room 和净数量不变的 `newGame` 仍允许。实现完成后必须用同一 25/30/35 真实命令探针和 30 Room late-state 检查复验。

### Storage and delivery

10. 下一可用数据库迁移一次性增加 Game Context、Replay 与 Bug Report 表；首个正式 Replay 格式使用 `schemaVersion=1`，不保留未上线实验格式兼容代码。迁移幂等回填既有 `rooms` 为 active Context、既有 `game_results` 为 completed Context，并让完成结果在冲突时优先；旧完成局标记 `legacy_no_replay`，不创建 Replay header 或 Frame。活动恢复继续使用 `rooms` / `room_players`，完成参与者继续使用 `game_results` / `game_result_players`，不复制这些事实。
11. Replay 只增加 header 与 Step 表，不增加 Segment 表；`checkpointStepNo` 表达逻辑 Segment。Reported Game Evidence 也不增加 payload 表，由 Bug Report 的保留期限保护对应 Segment。
12. `gameBuildId`、`schemaVersion` 和 `viewerBuildId` 在 Room 建立时锁定。标准卡展示逻辑随 Viewer Build 固定，BGA 图片与主站使用同一 CDN，不归档图片历史；自定义卡公开快照写入 Replay header，图片复制到内容寻址的持久资源目录，不归档可执行源码。
13. 完成 Replay 的存储 gzip/BLOB 不成为外部契约。公开 Replay API 返回判别式版本化 JSON；只有 `replayStatus=available` 返回 manifest 和 Segment，`legacy_no_replay` 只返回状态与 Game Result Archive 摘要。内容寻址的只读 Viewer Build 永久追加到后端持久卷，并在 `credentialless` iframe 内无 cookie 地直接读取公开 manifest 和 Segment。
14. 顶层客户端先解析 Game Context，再决定是否加载当前卡牌 manifest 与 `AuthProvider`。活动局进入现有登录和 WebSocket 恢复链路；completed、expired 和 removed 页面在登录门外可用。结束局仅允许经历史 `userId → playerIndex` 证明的原参赛者创建 Bug Report。

### GitHub and operations

15. GitHub 提交使用 SQLite 持久化草稿、稳定 `submissionId`、attempt 记录和单进程 claim 执行器，不增加外部队列。Issue Submission Connection 令牌使用 Node `crypto` 的 AES-256-GCM、每行独立 nonce 和 `keyId` 加密；PKCE state 复用扩展后的 `oauth_states`。
16. Issue 只包含清洗后的现象和已批准定位键；首版不上传截图、日志或状态附件。issues-only 仓库的自动化添加 `needs-triage`，通知依赖 GitHub 原生 watching。
17. 维护者全开取证复用现有管理员判定并永久审计。Replay 下架首版使用运维 CLI，删除 payload、保留 Tombstone，并追加数据库外删除 ledger；内容资源只有在没有其他未下架 Replay 引用时才删除，资源自身违规时先 Tombstone 所有引用局。旧备份恢复上线前重放该 ledger。
18. 上线使用 `REPLAY_NEW_ROOMS_ENABLED` 与 `BUG_REPORTS_ENABLED` 两个开关。Viewer Build 先发布，随后部署数据库与后端，再启用新 Room 录制、公开回放和 GitHub 报告。已有 Replay header 的 Room 不受关闭新录制开关影响，必须继续写完。
19. 首次启用前，恢复出的旧活动 Room 在接受命令前建立 `missingPrefix=true` 的 Step 0。启用录制后不得回滚到不认识该 Replay schema 的后端，只能回滚到兼容构建或向前修复。

## Consequences

- 已向玩家显示的成功状态一定有同事务的可恢复快照和 Replay Step；传输层不再决定持久化语义。
- 首发容量为代表性 Replay 工作负载下留有 CPU 余量的 30 个普通内存 Room。
- 当前一秒 debounce 仅可继续服务等待态元数据或旧 adapter；进行局成功步骤必须改走 Durable Room Commit。
- 永久 Viewer Build、内容资源、删除 ledger 和兼容回滚成为生产部署的一部分，而不是普通前端构建的临时产物。

## Alternatives considered

- **广播后异步保存**：拒绝。玩家看到的成功步骤可能在崩溃后消失。
- **为更高容量增加 Worker 或分片**：拒绝。首发没有对应产品需求。
- **按玩家建立 Replay 链**：拒绝。权威 Frame 只有一份，视角应在读取时遮蔽。
- **Redis 队列和独立提交 worker**：拒绝。当前单实例 SQLite 状态机已经能持久重试和对账。
- **把历史 Viewer 放进每次覆盖的 GitHub Pages 构建**：拒绝。旧 Replay 引用的不可变 Viewer 会随部署消失。
