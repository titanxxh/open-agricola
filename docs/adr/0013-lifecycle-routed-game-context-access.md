# 13. Game Context access is routed by lifecycle and viewer authority

- Status: Accepted
- Date: 2026-07-27

## Context

ADR-0009 让一个 `roomId` 永久标识一局游戏，ADR-0010 固定正常完赛回放的公开与删除边界，ADR-0011 固定权威 Frame delta 链和版本化 Viewer。仍需一个永久 Game Context Link 把同一 `roomId` 安全地路由到活动局恢复、结束局回放、过期局说明或下架占位，并让 Bug Report Anchor 在对局继续、过期、完赛和回放损坏时都有明确结果。

现有 `joinRoom` 同时承担恢复和加入空座位，客户端全局登录门会挡住公开回放，活动 Room 过期后也会被物理删除。直接复用这些行为会让永久链接意外成为邀请、让 URL 座位参数参与授权，并让曾经存在的 `roomId` 与随机错误 id 都变成无法区分的 404。

## Decision

### Permanent link and lifecycle

1. 规范链接是 `${PUBLIC_APP_ORIGIN}?context=<roomId>`。只有固定具体 Replay Frame 时才同时增加 `step=<stepNo>&frame=<full-sha256>`；两者必须成对出现。`perspective=pN|open` 只记录结束局的展示选择。链接不包含 `transport`、`player`、站点 `userId` 或任何凭据。
2. 每个已创建 Room 都永久保留最小 Game Context Record。顶层生命周期只有 `active`、`completed`、`expired`、`removed`；`waiting` 和 `playing` 是 `active` 的 phase。从未创建过的 id 才是 `unknown_context`。
3. `waiting` Room 在全部离线后保留 30 分钟；`playing` Room 在最后一名玩家离线后保留 7 天。任一玩家恢复连接会清除当前到期时间，下一次全部离线重新计时。TTL、解散、删号和未完成 `newGame` 只删除可恢复快照并把 Game Context 置为 `expired`，不删除或复用 `roomId`。
4. 完成局解析为 `completed`；管理员、违规或法律删除 Replay payload 后解析为 `removed` 并沿用 ADR-0010 的 Replay Tombstone。旧 Room 永不重定向到 `newGame` 创建的新 Room。

### External HTTP and WebSocket contract

5. 前端先调用 `GET /api/v1/game-contexts/:roomId`，再按返回的判别式 descriptor 选择恢复页、回放页、过期页或下架页。这个 resolver 是所有永久链接的唯一入口，不用 HTTP 重定向猜测生命周期。
6. 现有多人 WebSocket 连接和 `joinRoom` 消息继续复用，但恢复必须发送 `{ type: "joinRoom", roomId, intent: "resume" }`。服务端只按已持久化的站点 `userId → playerIndex` 绑定恢复座位，忽略 URL 或客户端声明的座位；同一站点用户在同一 Room 最多拥有一个座位。Game Context Link 不能加入空座位，也不能进入活动局旁观；Room Invite 继续走独立加入流程。
7. 同一座位的新连接接管该座位，旧连接收到类型化的 `seat_replaced` 后失去命令权限。服务端不允许两个设备同时控制同一座位。
8. 完成局通过 HTTP 读取：
   - `GET /api/v1/game-contexts/:roomId/replay` 对正式归档返回 manifest，对上线前结果返回 `{ status: "legacy_no_replay" }`；
   - `GET /api/v1/game-contexts/:roomId/replay/segments/:checkpointStepNo` 返回从指定 checkpoint 开始的 Replay Segment。

   只有正式归档存在 manifest 和 Segment。Manifest 至少包含 `schemaVersion`、`viewerBuildId`、Replay Participant、Step 边界、完整性与损坏区间。Replay Viewer Build 由外层应用按 manifest 选择，并在不携带登录凭据的 `credentialless` iframe 中运行。
9. 活动局或已过期未完成局的精确 Anchor 通过 `GET /api/v1/game-contexts/:roomId/evidence/:stepNo?frame=<full-sha256>` 读取。它只接受已经保留的完整 Anchor，不提供按步枚举或任意历史浏览。已入座玩家只能得到自己座位遮蔽后的只读 Frame。
10. 维护者只能从已提交 Bug Report 进入取证：`POST /api/v1/bug-reports/:submissionId/evidence/inspect` 默认返回报告者座位视角。请求全开视角必须同时提交非空理由；每次访问都永久审计操作者、时间、Anchor、视角和理由。该入口不能浏览 Anchor 以外的活动步骤。

### Authentication and visibility

11. 活动局 resolver 与恢复要求站点登录。未登录返回 `401 login_required` 和原始 Game Context Link 作为 `returnTo`；已登录但未拥有该局座位返回 `403 not_participant`。服务端座位绑定是唯一授权事实，链接中的 `perspective` 对活动局无授权作用。
12. `completed`、`expired` 和 `removed` 的 resolver 必须在现有全局登录门之前执行，未登录访客也能打开。结束局 Replay Archive 的全部权威规则状态公开；座位视角只由 Replay Viewer Build 做展示遮蔽，不是安全边界，也不保存多份座位归档。
13. 活动玩家从当前权威状态继续操作，Anchor 只在单独的只读抽屉中展示；不能从历史 Anchor 继续出牌，也不能查看其他座位或全开视角。
14. 直接打开结束局且没有 `perspective` 时，必须在展示任何 Replay Frame 前选择座位视角或全开视角。Bug Issue 中的链接默认带报告者座位；选择值写回 `perspective=p1…pN|open`，但 `open` 永不作为默认值。

### Reported evidence and transition races

15. 提交 Bug Report 不延长 7 天 Active Game Recovery。对于未完成局，系统从报告时起保留足以重建 Anchor 的最小 Replay Segment 30 天；同一 Segment 被多个报告引用时共享保存。参与者只能按自己的座位视角读取，维护者遵守第 10 条；正常完赛后永久 Game Replay Archive 取代这份临时证据。30 天后只保留 Anchor 元数据，不再保留隐藏状态。
16. resolver 与 WebSocket 加入之间生命周期可能变化。服务端返回 `context_changed` 时，客户端自动重新 resolve 一次，并按最新生命周期进入完成回放或过期页；第二次仍变化才向用户显示冲突，不循环重试。

### Replay completeness and integrity

17. 回放功能正式上线后创建的新 Room 必须从真实 Step 0 开始，`missingPrefix=false`。迁移必须幂等回填既有 `rooms` 为 `active` Game Context，并在启动恢复时以当时完整 checkpoint 建立归档 Step 0、标记 `missingPrefix=true`，不伪造原始 Step 编号；既有 `game_results` 回填为 `completed`，若同一 `roomId` 仍有 Room 记录则完成结果优先。上线前已结束的结果标记 `legacy_no_replay`，不创建 Replay header、Frame、`schemaVersion` 或 `viewerBuildId`。只有两个既有来源都不存在的 id 才是 `unknown_context`。
18. `step` 与完整 Frame Hash 必须精确匹配；不匹配返回 `anchor_mismatch`，绝不静默移动到最近 Step。损坏 Segment 显示不可用区间，并允许从下一完整 checkpoint 继续；Viewer Build 缺失或损坏时仍展示 Game Result Archive 摘要。

### Public descriptors, errors, and retention states

19. `active` descriptor 只向已授权座位返回 `roomId`、`lifecycle`、`phase`、自己的 `playerIndex`、当前 `stepNo` 和可选 `expiresAt`。`completed` descriptor 可公开 Replay Participant 的历史显示名、座位、得分和变体，但不公开站点 `userId`；其 `replayStatus` 为 `available` 或 `legacy_no_replay`，只有 `available` 才附带 Step 边界、完整性、`schemaVersion` 和 `viewerBuildId`。`expired` 只公开 `roomId` 与生命周期；`removed` 另可公开 ADR-0010 允许的粗粒度原因。
20. `expired` 不向公众区分 TTL、解散、未完成 `newGame` 或删号，也不公开玩家名、站点 `userId` 或内部原因。只有持有完整 Anchor 的链接才能验证仍保留的 Anchor 元数据；不提供 expired Room、Anchor 或玩家的列表与搜索接口。
21. 错误统一为 `{ ok: false, code, lifecycle?, message }`：

   | HTTP | `code` |
   |---|---|
   | 400 | `invalid_context_link` |
   | 401 | `login_required` |
   | 403 | `not_participant` |
   | 404 | `unknown_context` |
   | 409 | `anchor_mismatch`, `context_changed` |
   | 410 | `context_expired`, `context_removed` |
   | 429 | `rate_limited` |
   | 503 | `replay_segment_unavailable`, `viewer_unavailable` |

   Resolver 本身对已知 `expired` 和 `removed` 返回 `200` descriptor；只有在这些生命周期上请求恢复、证据 payload 或 Replay payload 时返回 `410`。`missingPrefix`、损坏区间和 `legacy_no_replay` 是可展示的 `200` 状态，不伪装成传输错误。
22. 活动 descriptor、Reported Game Evidence 和维护者取证响应使用 `Cache-Control: no-store`。公开 descriptor、manifest 和 Replay Segment 使用 `Cache-Control: no-cache` 与 ETag，使下架或删除每次都能重新验证；只有按内容寻址的 Replay Viewer Build 可使用长期 `immutable`。普通访问日志不记录隐藏状态、Frame payload 或凭据；第 10 条的全开取证只写审计元数据。

## Consequences

- Game Context Record 必须与可删除的活动快照、Replay payload 和用户身份分离；ADR-0009 的 `discard` 此后只表示丢弃未完成局的可恢复内容，不再删除永久 `roomId` 身份。
- 当前客户端必须先解析公开 Game Context，再决定是否进入登录门；活动恢复仍复用现有 WebSocket 主链路，新增的 `intent: "resume"` 只收紧既有 `joinRoom` 语义。
- 完成 Replay 不需要服务端生成座位副本；公开全开数据只存一次，历史 Viewer 负责展示视角。
- 未完成局 Bug 取证会引入最长 30 天的隐藏状态保留，因此必须按座位过滤、限制到已提交 Anchor，并为维护者全开访问留下永久审计。
- 首次上线不迁移或伪造旧 Replay；正式上线后的格式变化继续依赖 `schemaVersion` 与不可变 Replay Viewer Build。

## Alternatives considered

- **让永久链接直接连接 WebSocket**：拒绝。链接无法先表达 completed、expired、removed 和 legacy 状态，也会把登录跳转与生命周期竞态散落到客户端。
- **继续让 `joinRoom` 同时恢复和占空座**：拒绝。永久上下文链接会意外变成邀请，URL 座位参数也容易被误当授权。
- **对结束局继续要求登录**：拒绝。已决定的 Game Replay Archive 是永久公开共享记录，登录门只应保护活动局和临时证据。
- **让报告延长活动局恢复期限**：拒绝。Bug 取证只需要固定 Anchor，不应让无人继续的 Room 永久占用活动状态。
- **为每个座位保存一份回放**：拒绝。结束局全开状态已公开，复制归档只增加存储和视角漂移风险。
- **过期或下架后返回 404**：拒绝。这会把永久 `roomId` 与从未存在的 id 混淆，也破坏 Issue 中的稳定链接。
- **Anchor Hash 不匹配时跳到最近 Step**：拒绝。Issue 取证必须定位精确 Frame，静默修复会展示错误现场。
