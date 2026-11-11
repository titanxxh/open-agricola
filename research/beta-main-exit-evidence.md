# 既有 Beta 业务迁出 main 的事实依据

本记录回答 [既有 Beta 功能迁出主干前，正式发布与保留局有哪些约束？](https://github.com/titanxxh/open-agricola/issues/1649)，供 [现有 Beta 业务功能如何迁出 main，并兼容已保留的对局？](https://github.com/titanxxh/open-agricola/issues/1650) 使用。它不决定迁出、排空、隔离承载或迁移策略，也不执行发布及数据变更。

## 固定上下文

- 源码为 2026-11-11 本次 `git fetch origin main` 读回的 `53b8a0ccf5649ce3bb7084303f0677e46c1d20e7`。
- 研究分支为 `research/beta-main-exit-evidence`，独立 checkout 为 `/home/xxh/open-agricola/.worktree/beta-main-exit-research`。
- [开始调查的 context pointer](https://github.com/titanxxh/open-agricola/issues/1649#issuecomment-6784812311) 固定了上述范围。
- 以下源码链接均固定到该 SHA。线上核心存量聚合时间为 2026-11-11 10:04:48 Asia/Singapore，其余统计来自本次调查邻近的只读事务。多个事务各自一致，不代表整个观察窗口的原子快照。

## Beta 业务范围

当前 [registry](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/shared/contract/experimental-features.ts) 只有两个条目，均为 `beta`。

| 条目 | 业务与主要实现 | 迁出调查涉及的契约与持久化 |
| --- | --- | --- |
| `team-modes` | Team 和 Multihand 创建、等待成员、排座、共享或私有队友视角、多自有座位控制、四种队伍计分 | `TeamConfiguration`、`GameState.team`、`teamConfig`、`startTeamGame`、`setTeam`、`teamRoomWaiting`，以及队伍结果归档 |
| `team-cooperation-rules` | Team/Multihand 内可选的 Marketplace 和 Partner Build，默认不开启 | `cooperationRules`、`marketplace` action、`marketplace-select` interaction、转移提交、Target Farm 建造选择及后续建造流程；另有 `team-cooperation-v1` 客户端 capability |

入口与实现依据如下。

- [Team 契约](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/shared/contract/team.ts) 定义 2 或 3 座位的队伍、4 或 6 人配置、`team`/`multihand`、座位安排、队友可见性和 `sum`、`product`、`category-min`、`total-min` 计分。[WS 契约](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/shared/contract/protocol/ws.ts) 包含创建、等待、排队和开局消息。
- [server 架构](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/docs/architecture/server.md) 定位 `server/game/team-room.ts`、`server/connection/room-router.ts`、`room-viewer.ts`、`lobby-my-rooms.ts` 和 `shared/domain/team-scoring.ts`。这些承担成员、排座、命令、权限、列表与结算。Team/Multihand 的 rematch/newGame 还会重排或保留等待成员。
- [client 架构](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/docs/architecture/client.md) 定位 `LobbyPage`、`TeamSetupFields`、`TeamWaitingRoom`、`MultihandSeatControls`、`GameContainerApi`、`FarmBoardView`、`ScoringPad`、`ArchivedTeamResults`。后两者覆盖实时队伍结算与历史归档展示。
- [ADR 0043](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/docs/adr/0043-team-cooperation-rules-partner-builds.md) 定义 Marketplace、Target Farm、建造者与农场主、费用及卡牌反应。[Marketplace action](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/shared/actions/effects/marketplace.ts)、[协作行动格](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/shared/team/action-spaces.ts)、[Target Farm helper](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/shared/actions/helpers/target-farm.ts) 连接 `construct`、`stables`、`fencing`、支付和动物重排。它不是只在 Lobby 中出现的开关。
- [capability 契约](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/docs/architecture/contract.md#client-capabilities) 将 `team-cooperation-v1` 与账号资格分开。协作局的创建、进入、恢复、观战和操作都检查客户端支持，WS 每条连接声明，HTTP 每请求用 header 声明。缺失支持返回 `client_refresh_required`，资格不足返回另一种拒绝。

除 registry 外，本次还搜索了 `client` 内非测试 TSX 的 `BetaBadge`、`beta.*`、`experimental` 引用。业务标记落在 Team 创建、配置摘要、实时/归档队伍成绩；设置页另有 Beta 身份和管理员管理入口。没有找到第三项未登记的当前 Beta 业务入口。此结论来自源码搜索，不是对任意历史文字中“Beta”一词的产品分类。[Lobby](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/client/app/LobbyPage.tsx)、[归档展示](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/client/components/board/ArchivedTeamResults.tsx)、[设置页](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/client/app/SettingsPage.tsx) 是对应依据。

## 业务代码与共用基础设施的边界

账号、登录、管理员资格、Beta grant 与撤销不属于 Team 规则。[资格服务](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/server/experimental-features.ts) 通过账号实时计算可用性；[migration 036](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/server/database/036-beta-access.sql) 单独存储 `beta_access`。这些与用户要求正式站保留身份和资格管理相符。当前源码尚未实现本地图要求的新 prerelease 入口，不能把既有 Team 创建入口当作它。

`targetPlayerId`、显式 ActionFlow/pending、建造事实、支付求解、持久命令回执、Replay 框架和可控座位集合不能仅因出现在协作 PR 中就整体视作 Beta。比如 [receive effect](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/shared/actions/effects/receive.ts) 已用 `targetPlayerId` 向其他玩家给付及记录建造事件；[客户端架构](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/docs/architecture/client.md) 明确 Hotseat 也使用座位控制和私有可见性。移除业务时仍须逐调用者区分正式消费者；本研究不裁定最终保留哪些签名。

## main、Release 与实际部署是四项分别读回的证据

| 对象 | 本次读回 |
| --- | --- |
| `origin/main` | `53b8a0ccf5649ce3bb7084303f0677e46c1d20e7`，包含上述两个 Beta 条目与业务实现 |
| 最新正式 Release | [v0.12.8](https://github.com/titanxxh/open-agricola/releases/tag/v0.12.8)，`isPrerelease=false`，2026-11-10 17:59:55 UTC 发布；tag API 指向上述 commit |
| 实际后端 | 在经核对的 owner SSH target 和 Compose 工作目录内，运行 app 的 `GAME_BUILD_ID` 为上述 commit；Node 为 `v24.22.2`，`PUBLIC_API_BASE` 匹配正式 API origin |
| 实际前端 | [正式 frontend-build.json](https://open-agricola.titanxxh.com/frontend-build.json) 的 `gameBuildId` 为上述 commit；正式 API `/api/health` 返回 `ok=true` |

owner target 经 `ssh -G`、远端工作目录、运行中的 Compose app 标签和公开 API origin 交叉核对，未把部署文档默认 target 单独当作事实。[部署文档](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/docs/HOW_TO_DEPLOY.md) 仍要求 owner 本机部署，GitHub Release/Pages 与后端部署各有独立证据。[该 SHA 的 Pages run](https://github.com/titanxxh/open-agricola/actions/runs/42870654747) 已成功；本研究没有重新执行发布验证。

## 生产聚合盘点

所有数据库读取均在 app 容器内用原有 `DATABASE_URL` 创建独立 `pg.Client`，未导入应用或数据库初始化模块。先读 `information_schema.columns` 核对字段，再执行 `BEGIN ... REPEATABLE READ READ ONLY`、8 秒 statement timeout，结束用 `ROLLBACK`。查询读回了 `transaction_read_only=on` 与 `repeatable read`。原始行只存在远端进程内存中，工具输出及本文件只保留聚合；未写本地 raw 文件。

| 对象 | 总量与格式 | 本次发现的 Beta 影响量 |
| --- | --- | --- |
| 保留 Room | 137，waiting 2、playing 135 | Team/Multihand 0，协作 0；`team_members_json` 非空成员 0 |
| Room body | 全部 `gzip-base64-v1`；解压后 `roomHistoryVersion=2` | 无 Team 配置或协作开关 |
| Room 内部阶段 | playing 119、parent-selection 1、solo-hand-selection 15、draft 2 | 上述阶段均无 Beta 配置；Room 状态与内部阶段是不同维度 |
| Game Result Archive | 177 | `team_mode`、`team_scores` 非空各 0 |
| Game Replay Archive | 663，schema_version 1；recording 137、completed 526 | 扫描全部首次可用 checkpoint，Team/Multihand 0、协作 0、解压失败 0 |
| Step 0 例外 | 662 个 Replay 有 Step 0；另 1 个从后续 checkpoint 开始 | 该例外已纳入扫描，没有仅查 Step 0 后漏掉它 |
| 冻结 Viewer | `replay_viewer_builds` 52；现存 Replay 引用其中 17；缺失 registry 行 0 | Beta Replay 引用 0 |
| Viewer 对象目录 | `owner_kind='viewer'` 引用 1642；关联对象目录缺行 0；ready 且未 blocked 1642 | 这里只检查数据库目录，未读取 S3 bytes |
| Game creation configuration | 747，均为带 `configuration` 和 `resolvedWorkshopSources` 的记录 | 未含 Team/Multihand/协作字段。此表当前只表达正式 solo 配置，不能单独用它识别 Team 存量 |
| 迁出涉及的参与者 | 以识别出的受影响 Room/Replay 为集合，对 room_players、结果参与者关联账号资格 | 集合为空，参与者对 0、无 Beta 资格对 0、无法解析账号对 0 |

资格判定使用当前 `users` 存在、`beta_access` grant 或运行 app 的 `ADMIN_USERS` 精确用户名匹配，复用了 [isAdmin 的大小写与分隔语义](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/server/auth.ts)。未把 grant 缺行等同于无资格。由于受影响集合为空，本次不能提供“非 Beta 旧参与者实际存在”的样本，也不能保证未来不会产生此类存量。

实际 PostgreSQL migration ledger 为 `postgres_schema_migrations`，版本 1 至 36 全部存在。旧 `schema_version` 表的最高值 33 不是当前 migration 完成度。[migrations.ts](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/server/database/migrations.ts) 是该区别的源码依据。[034](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/server/database/034-team-result-archive.sql) 增加结果队伍模式/计分/得分与玩家 team_index，[035](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/server/database/035-team-room-members.sql) 增加等待成员 JSON。协作配置本身在 `GameState.team.configuration` 中，feature ID、stage 和 capability 声明不进入存档。

### 可复核的查询范围

研究使用如下只读查询形状。所有细节行均由容器内程序归并后才输出，不能直接把查询原始结果打印到公共日志。

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '8s';
SELECT current_setting('transaction_read_only'), current_setting('transaction_isolation');
SELECT status, count(*) FROM rooms GROUP BY status;
SELECT team_mode, count(*) FROM game_results GROUP BY team_mode;
SELECT schema_version, status, count(*) FROM game_replays GROUP BY 1, 2;
SELECT min(version), max(version), count(*) FROM postgres_schema_migrations;
SELECT count(*) FROM replay_viewer_builds;
ROLLBACK;
```

实际影响识别还读取 `rooms.state_json` 和 `team_members_json`，按 [room-body-codec](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/server/game/persistence/room-body-codec.ts) 解压，并检查完整 body 的 Team 模式与协作值。没有只读 envelope 的少量 query projection。`room-history-store.ts` 将完整 authoritative state 与 `frameDelta` 保存为 v2 body，恢复时仍需要这些字段、历史记录及 cursor。[源码](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/server/game/persistence/room-history-store.ts)

Replay 扫描以 `DISTINCT ON (room_id)` 加 `payload_kind='checkpoint' ORDER BY room_id, step_no` 取得每条 Replay 的首次可用 checkpoint，在容器内 gunzip/JSON parse，核对总量与 `game_replays` 总量相等，检查 Team 模式与协作值。Team 配置是开局时确定且 newGame 分配新 Room 的配置，因此首次可用完整 Frame 是当前识别依据；本研究没有逐条重放全部 delta 或恢复 Session。[Team 契约](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/docs/architecture/contract.md)、[server 生命周期](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/docs/architecture/server.md)

## 已存在的兼容与授权约束

- [保留局升级兼容](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/docs/HOW_TO_DEPLOY.md#compatibility-of-retained-games) 覆盖全部保留 Room，包括离线、开局中间态与 gameplay。若新代码不能读取实际格式，必须显式、版本化、幂等迁移；保留座位、已确认选择、资源、私密状态、pending、undo 和 command receipts。恢复后下一条真实命令、发布快照及重连都必须可用，仅能 load JSON 不够。
- 删除 Marketplace action、`marketplace-select`、Target Farm 流程或相关 cursor 处理时，需要核对当时实际存量及仍被支持的浏览器输入。客户端 capability 声明不等同于业务存在，也不能代替保存格式的兼容。当前零存量只消除了本次观察时点的这类实际样本，不是未来清理授权。
- [ADR 0042](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/docs/adr/0042-experimental-feature-availability.md) 的现行入口门禁只拦创建/公开发现/rematch 提议者/newGame 发起者；邀请、直链和既有局延续原授权，不要求每名参与者都有 Beta。历史 Replay、结果和个人列表仍按普通策略可读。新地图要求所有进入 prerelease 的人拥有 Beta，与现行语义不同，需要在对应决策票明确变更，不能当作源码已实现。
- [ADR 0039](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/docs/adr/0039-runtime-room-retention-policy.md) 把离线周期的绝对到期时间冻结在 Game Context。本次读回策略为等待 3 天、进行 7 天；策略更新、加载和反复查询不会改写既有 deadline，在线、准入中、待 durable save 的 Room 受保护。不能从这两个天数推断所有旧局已排空。
- [ADR 0010](https://github.com/titanxxh/open-agricola/blob/53b8a0ccf5649ce3bb7084303f0677e46c1d20e7/docs/adr/0010-public-replay-retention-and-erasure.md) 与部署文档要求保留历史 Frame、hash 和冻结 Viewer。历史播放不执行当前规则，Viewer 和结果解释与继续承载可玩的 Beta 业务是不同对象。Replay 默认保留至明确 erasure；数据删除与保留局退役须单独授权，不能作为此次迁出的隐含步骤。

## 验证边界与仍需决定的事项

本次确认没有受影响的保留局、结果或 Replay，生产访问也没有受阻。研究可以结束，迁出策略、所有准入者的新授权规则、资格撤销时的当前局处理，以及 main 清理与 prerelease rebase 的提交顺序仍由相应决策票决定。

Viewer 盘点只证明 registry 与对象目录关系，不证明每个历史对象当前均可下载、校验或在真实浏览器播放。本次没有读取全部 S3 bytes、恢复生产 Session、驱动任何生产命令，也没有从备份中还原已删除数据。迁出发布前仍须执行正式的同 SHA 门禁、目标构建恢复验证及新的只读盘点；本研究分支不是该发布回执。

研究只新增本文件，未运行应用、测试或构建；用固定源码链接、diff 检查和只读数据库读回验证记录。没有部署、重启、维护模式、迁移执行、创建局、改资格、写数据库或写生产主机文件。
