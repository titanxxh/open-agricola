# Open Agricola

Open Agricola 是一个后端权威、WebSocket 实时多人同步的 Agricola 在线复刻。本文档定义项目共享语言，供 agent、issue、PRD、测试说明和重构讨论使用；具体实现以 `docs/ARCHITECTURE.md` 和当前代码为准。

## Language

**后端权威**:
规则裁定和 `GameState` 写入只发生在 `shared/` + `server/`。前端发命令，服务端校验、执行、落状态、广播快照。
_Avoid_: 前端裁定、客户端规则补丁

**三层架构**:
`shared/` 承载领域模型、行动、引擎、卡牌和协议；`server/` 承载 HTTP、WebSocket、房间、持久化和沙盒执行；`client/` 只渲染、收集输入、管理本地 UI 临时态。
_Avoid_: client 直接 import `shared/session`、`shared/engine`、卡牌实现

**Session**:
会话领域层，核心是 `shared/session/session-core.ts` 的 `GameCore`。它协调 `GameState`、`EngineStack`、history、阶段推进、交互构建、undo 和响应生成。
_Avoid_: WebSocket 连接层

**GameSession**:
服务端唯一游戏命令入口和 `GameState` owner。状态修改可由它驱动的 `GameCore` 和 action leaf 执行；HTTP、WebSocket 和 session 测试都必须通过该权威边界驱动规则。
_Avoid_: React session、本地 UI store、把唯一写入者理解为只有一个源文件可以赋值

**GameState**:
一局游戏的领域真相，包含玩家、行动格、回合、阶段、draft、公开事件、日志缓存、future meeple、收获摘要等可序列化状态。
_Avoid_: 房间连接、WebSocket version、React state

**Start Player Marker（起始玩家标记）**:
由一名玩家实时持有的起始玩家标记；取得 Meeting Place 会立即转移该标记，并用于冻结下一轮的 Round Work Order。
_Avoid_: 当前行动玩家、本轮已冻结顺序

**Round Work Order（本轮工作顺序）**:
Preparation 开始时按 Start Player Marker 冻结的本轮普通放人顺序。随后在 work phase 前发生的标记转移不改变该顺序；Roman Pot 等本轮顺序消费者必须读取同一冻结结果。唯一例外是 Snake Opening 在第 1 回合的反转。
_Avoid_: Start Player Marker、`currentPlayerIndex`、`roundActionOrder`

**Snake Opening（蛇形开局）**:
多人局可选的 Game Variant：每名玩家开局 3 食物（含起始玩家）；第 1 回合工作阶段的轮转从 Round Work Order 末位首次要绕回首位时反转，此后该回合剩余的全部放置按反向顺序进行，第 2 回合起恢复正向。单人局启用时不产生任何效果。
_Avoid_: 让子、每回合反转、只反转第二人后再恢复、把反转套用到 Before-Harvest Reaction Window 或其他非工作阶段顺序

**Work Placement Chronology（工作阶段放人时序）**:
当前 Work Phase 内实际发生的人员放置先后。起始玩家标记转移不会重排已发生的放置，额外或连续放置保留其真实位置；新 Work Phase 重新开始。
_Avoid_: Round Work Order、Start Player Marker

**Person Placement Order（人员放置序号）**:
Work Placement Chronology 中真正放下一名人员的先后顺序。同一人员在行动格间搬迁不推进序号；正常放置临时人员会推进序号，人员被召回后再次正常放置也会再次推进。牌面所说的“第 N 个人”使用此口径。
_Avoid_: 原始行动使用历史、不同人员身份计数、Round Work Order

**Rule Audit Lead（规则审计线索）**:
来自上游提交、issue 描述或静态代码阅读的待验证规则风险；必须先在当前 `main` 复现可观察错误，才能升级为 Rule Alignment Gap 或 Rule Flow Defect。
_Avoid_: 已确认缺陷、直接修复依据

**Rule Alignment Gap（规则对齐缺口）**:
适用的官方规则、牌面或裁定已确认 Open Agricola 的可达行动、合法选择或权威结果与之不一致。BGA 提交只能作为发现和复现证据；证据冲突由 maintainer 裁定。
_Avoid_: 规则修改、仅凭 BGA 提交确认

**Rule Flow Defect（规则流程缺陷）**:
规则语义与最终合法结果不变，但候选过滤或强制流程可能暴露必定失败的选项或无法完成。纯交互简化不属于该类。
_Avoid_: Rule Alignment Gap、纯视觉问题

**Game Variant（游戏变体）**:
创建一局游戏时启用的可选规则模块，会改变该局的设置、公开状态、行动格、阶段流程或计分口径。它不是普通卡牌来源，也不是前端显示偏好。
_Avoid_: Card Source、UI toggle、player count layout

**Farmers of the Moor**:
Agricola 的可选扩展名称。讨论该扩展时使用完整名称，不缩写为 Farmers；只有代码标识符可按既有命名使用 `FarmersOfTheMoor`。
_Avoid_: Farmers

**PlayerState**:
玩家的领域状态：资源、工人、房间、田地、动物、手牌、已打出卡、`cardStates`、supply token 消耗等。
_Avoid_: RoomPlayer、浏览器连接、登录用户

**Logical Field（逻辑田）**:
规则文本中非几何语义的 Field 身份，统一包含 Farmyard Field 与已打出且已注册的 Card Field；田地数量、空置/种植状态、作物、播种、生长、移除和收割默认使用该口径。
_Avoid_: `PlayerState.fields` 存储、农场坐标、只统计已有作物的虚拟槽

**Farmyard Field（农场田）**:
占据农场版图坐标、存储在玩家农场状态中的田地；只有犁地、围栏、相邻、占位、Field tile 等几何规则明确使用该口径。
_Avoid_: Card Field、所有规则文本中的 Field

**Card Field（卡牌田）**:
由已打出卡牌拥有、存储在 `cardStates` 且没有农场几何位置的 Logical Field；固定容量槽即使为空也保留稳定身份，多槽仍只算一块 Logical Field。
_Avoid_: Farmyard Field、把每个槽算成独立田、把卡牌状态搬入 `PlayerState.fields`

**Crop Layer（作物层）**:
同一播种槽内按上下顺序放置的一组同类作物。普通收获先取顶层，底层在上层耗尽后才能收获；增加作物层不增加 Logical Field 数量或播种槽容量。
_Avoid_: 新田、额外播种槽、独立收获次数

**Resource Commitment（资源承诺）**:
玩家为尚未完成的交易承诺保留的资源，仍在其库存中但不能被其他操作挪用。只有成交才转移资源，未成交参与者不付款；它不等同于已支付费用或 Continuation Guard。
_Avoid_: 预扣款、已成交、Continuation Guard

**Player Feeding Settlement（逐玩家喂养结算）**:
按收获顺序逐名玩家处理喂养支付、合法转换与缺食；尚未处理的玩家保有自己的库存，可响应当前交易。中途交互结束后继续同一喂养结算，不退还或重复扣除已付食物。
_Avoid_: 全员预扣食物、提前发乞讨、重新开始喂养

**Player Lookup Query**:
领域层把 `playerId` 解析为 `PlayerState` 或 `playerIndex` 的统一查询边界；规则、session 和 effect 代码通过它读取玩家身份映射。
_Avoid_: RoomPlayer seat/auth 查找、前端视角切换、本地 UI player 选择

**Room**:
单局多人游戏容器，持有一个 `GameSession`、座位连接、最大人数、房间状态和持久化元数据。`roomId` 同时是该局 Game Context 的永久标识；`newGame` 迁移人数、在线座位、custom cards 和已持久化变体开关到新 UUID，不复用旧 `roomId`。
_Avoid_: PlayerState

**Game Context**:
由 `roomId` 永久标识的一局游戏及其生命周期上下文，只可能处于活动、已完成、已过期或已下架状态。可恢复状态或回放内容消失后，其身份仍保留；从未存在的 `roomId` 不属于 Game Context。
_Avoid_: 可复用房间号、GameState、Room Invite

**Game Context Link**:
定位一个 Game Context 的永久链接，可额外固定 Bug Report Anchor 和 Replay Perspective。它不是邀请、座位凭据或活动对局的观看权限。
_Avoid_: Room Invite Link、登录回调、恢复令牌

**Active Game Recovery**:
已认证且已拥有座位的玩家返回仍处于活动状态的 Room，并从当前权威状态继续游戏。恢复身份来自玩家与座位的既有绑定，不来自链接参数。
_Avoid_: 加入空座位、活动局观战、回到历史步骤继续操作

**Expired Game Context**:
未正常完赛且已不能恢复的 Game Context；它永久保留 `roomId` 身份，但不提供活动 Room 或完整 Game Replay Archive。
_Avoid_: 未知 roomId、Replay Tombstone、正常完赛

**Durable Room Commit**:
一次玩家可感知的权威状态推进在对局参与者看见前成为可恢复事实的提交点；它同时固定 Room 快照和对应 Replay Step，失败时该 Room 不能继续推进。
_Avoid_: Room Persistence Checkpoint、延迟保存、WebSocket 广播

**Private Session Cursor（私有会话游标）**:
恢复同一交互、撤销范围与未完成后续所需的服务端私有会话进度，包括临时回滚位置和失败尝试记忆。它属于可恢复的权威状态，但不属于公开 Replay Frame。
_Avoid_: Replay Frame、客户端交互草稿、History Window 分页游标

**Game Result Archive**:
正常完赛后保留的标量摘要，包含 `roomId`、起止时间、回合数、人数、变体开关，以及按 `playerIndex` 对齐的游戏玩家 id、内部用户关联、显示名和最终得分。规则与得分字段不可变，用户关联和显示名可因数据删除而匿名化；归档不包含 `GameState`、手牌或其他隐藏信息。
_Avoid_: 可恢复房间快照、未完成房间、完整 GameState

**Game Replay Archive**:
正式录制上线后正常完赛并以 `roomId` 永久公开的逐步对局记录，可按任一座位视角或全开视角查看每个 Replay Step 的规则相关状态。它与 Game Result Archive 分离，不保存原始 Private Event payload、临时通知、生成溯源或可执行源码；上线前完成局只有 Game Result Archive。
_Avoid_: 活动 Room 快照、Public Event timeline、Game Result Archive

**Replay Step**:
回放中按 Room 全局串行编号的玩家可感知推进单位，对应服务端已接受且改变权威状态的 ClientCommand 或显式选择。多人同时提交时占用连续 Step；最后一份输入触发的自动结算属于该 Step，结果不得依赖提交到达顺序。
_Avoid_: Public Event、引擎节点、动画帧

**Replay Step Metadata**:
描述 Replay Step 的操作者座位和已接受游戏意图，用于定位与调试但不参与状态还原；它不包含传输凭据、站点用户身份或原始 ClientCommand。
_Avoid_: 回放真相、命令日志、原始 WebSocket 消息

**Replay Frame**:
紧随一个 Replay Step 固化的逻辑完整权威规则状态，是历史回放和 Bug 取证的播放真相。它从 Replay Segment 的完整 checkpoint 与 Replay State Delta 无损还原；ClientCommand 只作为步骤元数据保存。
_Avoid_: 命令日志重算、Game Sync Snapshot、undo history entry

**Replay State Delta**:
同一 Replay Segment 内从前一个 Replay Frame 到下一个 Replay Frame 的无损状态差异；应用 delta 不执行 ClientCommand、规则代码或自定义卡源码。
_Avoid_: 命令日志、Public Event、近似 UI patch

**Replay Segment**:
一个完整权威 checkpoint 加其后有界数量 Replay State Delta 组成的独立回放存储区段。随机定位和损坏恢复只依赖目标区段，不从整局初始状态重建。
_Avoid_: 无限 delta 链、回合、SQLite transaction

**Replay Viewer Build**:
Game Replay Archive 固定关联的不可变只读查看器版本，按对应归档结构展示 Replay Frame；它不裁定规则、不发送 ClientCommand，也不运行历史后端。
_Avoid_: 当前对局客户端、历史后端、命令重放

**Replay Participant**:
Game Replay Archive 中按 `playerIndex` 固定的座位身份，公开显示该局记录的显示名但不公开站点 `userId`。账号删除后保留座位并显示“已删除玩家（座位 N）”，同时清除内部用户关联。
_Avoid_: 当前登录用户、GitHub 作者、RoomPlayer 连接

**Replay Perspective**:
Game Replay Archive 的展示视角，可以是某个 Replay Participant 当时可见的信息，也可以是全部规则状态。它是公开归档的展示选择，不是访问权限或活动 Room 座位身份。
_Avoid_: Active Game Recovery 身份、独立座位归档、权限角色

**Replay Tombstone**:
回放因管理员、违规内容或法律删除而下架后，以原 `roomId` 永久保留的匿名占位记录。它只公开粗粒度下架原因，不包含回放 payload、玩家身份或被移除内容，且 `roomId` 永不复用。
_Avoid_: 404、可恢复软删除、Game Replay Archive payload

**Game Bug Reporter**:
在对局内提交现象说明的已登录、已入座站点用户；公开 Issue 固定记录其站点 `userId` 和 `playerIndex`，GitHub 作者可以是玩家本人或托管身份。邮箱和可变显示名不作为 Reporter 身份。
_Avoid_: GitHub Issue 作者、当前回合玩家、匿名访客

**Issue Submission Connection**:
Game Bug Reporter 为以本人 GitHub 身份提交公开 Issue 而单独建立的可撤销连接，绑定不可变的 GitHub 用户 id；它不承担站点登录或 Workshop 提案授权。
_Avoid_: 站点登录身份、Workshop GitHub OAuth、托管代提身份

**Hosted Issue Identity**:
没有可用 Issue Submission Connection 时，代表 Game Bug Reporter 创建公开 Issue 的站点服务身份；Issue 正文仍以站点 `userId` 和 `playerIndex` 标识实际 Reporter。
_Avoid_: Game Bug Reporter、个人维护者账号、匿名提交者

**Bug Report Draft**:
Game Bug Reporter 在站内保存、尚未对应到公开 Issue 的现象说明与 Bug Report Anchor；连接 GitHub、提交失败或等待对账时都保留同一份草稿。
_Avoid_: 浏览器临时表单、GitHub Issue、Workshop Design Draft

**Bug Report Anchor**:
Game Bug Reporter 提交现象时固定到特定 Replay Frame 的稳定引用，由 `roomId`、`stepNo` 和 Frame 指纹共同标识，不随房间继续推进或观看视角改变。
_Avoid_: 最新状态、可变播放位置、GitHub Issue 编号

**Reported Game Evidence**:
为已提交 Bug Report Anchor 暂时保留、足以只读还原该 Replay Frame 的取证记录。它不延长 Active Game Recovery，也不等同于正常完赛后的永久 Game Replay Archive。
_Avoid_: 活动 Room 快照、完整未完成局归档、永久 Replay

**RoomPlayer**:
房间里的连接席位，包含 `ws`、`playerIndex`、显示名和可选用户身份；不是规则层玩家状态。
_Avoid_: PlayerState

**Connection**:
WebSocket 连接和房间命令路由层，核心包括 `ws-server`、`room-router`、`broadcaster` 和 `envelope-builder`。
_Avoid_: 规则执行、直接写 GameState

**ClientCommand**:
浏览器通过 WebSocket 发给服务端的命令，如 `action`、`choice`、`commitSelection`、`anytime`、`roundEnd`、`undoStep`。
_Avoid_: 直接修改 state 的请求

**StateUpdateEnvelope**:
服务端广播或单播给客户端的同步包，携带 `GameSyncPayload`、`InteractionState`、分数、版本和 cause。当前同步语义是全量 snapshot。
_Avoid_: 局部 patch

**Game Sync Snapshot**:
`GameSession` 根据 `SessionResponse` 和 viewer 身份构造的同步视图，统一处理 state 序列化、InteractionState redaction、private events、public cancellation 和自定义卡定义。
_Avoid_: Connection 层直接拼 engine cursor、viewer redaction 或 private event 过滤

**Snapshot**:
服务端发出的完整可序列化状态视图。客户端收到后整体替换本地游戏状态。
_Avoid_: 乐观更新、增量 patch

**Services**:
客户端服务层，核心是 `client/services/gameTransport.ts` 的 `WsGameTransport`，负责连接、发送命令和接收状态更新。
_Avoid_: UI 组件内直接管理协议细节

**App**:
前端应用编排层，包含 `GameContainerApi`、action log timeline、replay feedback、public/private event UI 等。
_Avoid_: 规则裁定

**Solar Term Background Period（节气背景周期）**:
以固定公历月日表和 UTC+8 的 `00:00` 为边界，从一个二十四节气起始日到下一个节气起始日前结束的日期区间；中文界面在整个区间使用起始节气对应的背景，页面跨越边界时自动切换，无需刷新。
固定起始日：1/5 小寒、1/20 大寒、2/4 立春、2/19 雨水、3/5 惊蛰、3/20 春分、4/4 清明、4/20 谷雨、5/5 立夏、5/21 小满、6/5 芒种、6/21 夏至、7/7 小暑、7/23 大暑、8/7 立秋、8/23 处暑、9/7 白露、9/23 秋分、10/8 寒露、10/23 霜降、11/7 立冬、11/22 小雪、12/7 大雪、12/22 冬至。
显式 `?bg=` 调试覆盖优先于语言和日期规则。
_Avoid_: 精确天文交节时间、节气当日、农历月份、游戏内 Season

**InteractionState**:
前端唯一交互真相，只有 `idle`、`wait`、`gameover` 三类；`wait.request.kind` 决定 UI 展示选择、农场选择、喂食、动物整理、draft 等哪种交互。
_Avoid_: 前端从 DOM 或规则代码推断可操作性

**InteractionRequest**:
等待玩家输入的结构化请求，常见 kind 有 `choice`、`farm-select`、`selection`、`animal-reorg`、`feed`、`confirm-next-player`、`confirm-player-switch`、`card-draft`。
_Avoid_: 未类型化 pending blob

**Choice Availability（选项可用性）**:
玩家在当前规则状态下可合法提交的选择及其数量范围；资源、供给或资格变化后，可用性随之变化。它只约束当前选择，不承诺后续必需流程能够全部完成。
_Avoid_: 首次展示时的候选快照、未来完整流程保证、前端规则裁定

**Interaction Presentation**:
前端把服务端 `InteractionState` 映射为具体交互展示面和提交动作的边界。它只消费服务端交互真相，不做规则裁定。
_Avoid_: 后端规则裁定、Pending Envelope、DOM 状态推断

**Exchange Draft Presentation**:
Interaction Presentation 的一种本地草稿展示，覆盖 bake-bread、anytime exchange 和 harvest-feed 这类资源交换计数器、上限、汇总和提交 payload 派生。它只管理玩家尚未提交的前端草稿，不改变资源兑换规则。
_Avoid_: Payment Pipeline、规则执行、真实资源变更

**Farm Selection Draft Presentation**:
Interaction Presentation 的一种本地草稿展示，覆盖 fence、room、stable、plow、sow 和 farm-position 选择的前端暂存、错误展示、提交 draft 和 snapshot 后重置。它只管理尚未提交的本地选择，不做农场合法性裁定。
_Avoid_: Farm Board Projection、Moor Special Action tile routing、后端规则验证、真实 GameState 写入

**Farm Board Render Cell**:
`buildFarmBoardProjection` 输出给 `FarmBoard` 的单格渲染模型，聚合农场 tile 的占用、地形、地形标记、pending/selectable、播种候选和锁定状态。它隐藏 projection 内部的并行 Map/Set 组合细节。
_Avoid_: 后端农场规则校验、Farm Selection Draft Presentation、本地点击草稿

**Farm Interaction Projection**:
后端把 `PlayerState`、行动上下文和支付可行性派生成 `farm-select` / `farm-position` `InteractionRequest` payload 的领域投影边界。它只产生当前等待交互可展示、可选择的候选，不负责提交后的规则落子或前端本地 draft。
_Avoid_: Farmyard 规则校验、Farm Selection Draft Presentation、真实 GameState 写入

**Farm-position Selection**:
等待交互中玩家选择一个或多个农场坐标的领域选择口径，覆盖可选坐标、最小/最大数量、允许组合、terrain 选择模式和提交期合法性。它描述坐标选择的规则语义，不代表前端本地草稿，也不直接写入 `GameState`。
_Avoid_: Farm Selection Draft Presentation、Farm Board Render Cell、真实农场落子

**Animal Reorg Draft Presentation**:
Interaction Presentation 的一种本地草稿展示，覆盖 animal-reorg 的动物分配草稿、剩余/溢出展示、丢弃二次确认和提交 draft 派生。它只管理尚未提交的本地动物分配，不做容量合法性或动物规则裁定。
_Avoid_: Animal Zone Projection、后端容量验证、动物支付、真实 GameState 写入

**Interaction State Adapter**:
会话层把 `GameState`、`EngineStack`、`Pending Envelope` 和 request projection snapshot 派生成前端可见 `InteractionState` 的适配模块；viewer redaction 消费已完成的 `InteractionState`。它隐藏引擎恢复 cursor、host node metadata、具体 farm/selection/animal request builder 和旧兼容字段；前端只读取 `InteractionState.stateId` 与 `wait.request.kind` 下的结构化数据。
_Avoid_: 在前端或测试里读取 Pending Envelope metadata、把 farm/selection/animal builder 闭包散传进 adapter、在 `InteractionState.wait` 顶层复制 `request` 字段

**Interaction Command Policy**:
会话层把 `InteractionRequest.kind` 映射到公开 `allowedCommands` 和服务端提交入口的统一策略；它只回答当前等待交互应走 `resolveChoice`、`commitSelection` 还是无直接提交。
_Avoid_: payload 组装、ActionFlow 执行、前端本地草稿、Pending Envelope cursor

**Pending Command Resolution**:
会话层处理玩家提交等待交互的边界，负责根据当前 `InteractionRequest.kind` 路由 `resolveChoice` / `commitSelection`、校验提交玩家、有限选项值和提交 payload，再把合法提交交还给 Engine 或对应会话流程继续执行。
_Avoid_: 前端草稿状态、Payment Pipeline、重新定义 InteractionState

**Pending Envelope**:
引擎节点树里承载等待信息的 envelope，包含 `InteractionRequest`、source card、pending action、owner、上下文快照等；`InteractionState` 从它派生。
_Avoid_: 旧 `PendingAction` union、前端 pending 状态机

**Continuation**:
一次 pending 被玩家选择后继续执行的后续 flow 或阶段恢复。复杂卡牌的“下一步选择”应走显式 pending / continuation。
_Avoid_: 共享临时槽位、前端偷补流程

**Mandatory Continuation（强制续行）**:
玩家已接受或规则已承诺、不可再跳过的后续义务。它的动态后代 flow 必须继续保持 mandatory；无法执行时进入 undo-only blocked 或回退到规则定义的安全边界，不能静默完成。
_Avoid_: optional flow、Mandatory Saturation、Continuation Guard

**Provisional Continuation Scope（暂定 continuation 作用域）**:
Action Execution Scope 内，围绕尚未完成的 Mandatory Continuation 建立的暂定结果边界。它可以在 mandatory host 的前置链首次切换玩家或产生受保护观察时开启，也可以覆盖受保护观察已经发布后、由同一选择提交 host 但其 mandatory `afterHostCommit` 续行尚未完成的结算；后者只能回到观察之后的同一选择，不能重掷或假装忘记结果。真正嵌套的 mandatory host 形成子作用域；未受保证的作用域可以整体撤销，受保证后则约束后续结算不得再次破坏 host continuation。
_Avoid_: 数据库 Transaction、普通 Undo Scope、普通 optional after response、Interaction Presentation Draft

**Continuation Guard（continuation 保证）**:
对尚未执行本体但已经严格可执行的 mandatory host action 建立的持续规则义务；后续结算必须保持其严格可执行，直到 host action 进入本体执行。
_Avoid_: 单次 doability 检查、资源预留、玩家 Undo boundary

**Protected Observation（受保护观察）**:
玩家一旦看见便无法通过状态恢复消除的随机结果或新隐藏信息。它只有在所有祖先 continuation 均受保证后才能离开权威会话边界。
_Avoid_: 普通公开暂定状态、跨玩家询问本身、前端动画

**Turn（规则回合）**:
用于解释“在你的回合”和“同一回合”的规则结算单位；一个 Turn 可以包含多个 Rule Action。工作阶段轮转中的普通放工或沼泽特殊行动会开启 Turn；卡牌在轮转之外移动或放置人员并使用行动格时也可以开启 Turn，例如 D051 Archway 的移动和 E010 Straw Hat 移动的每个 worker 分别是独立 Turn，并按人员行动触发其回合结束时点。
_Avoid_: 轮转机会、单个 Rule Action、把所有阶段 / anytime 效果都算作 Turn

**Turn Scope（回合作用域）**:
一个 Turn 的身份和起点状态。该 Turn 内的所有 Rule Action 共用同一 Turn Scope；新的 Turn 使用新的作用域，并在该 Turn 的所有后置效果与回合结束 hook 结算完后结束。
_Avoid_: Action Execution Scope、跨 Turn 复用身份或起点状态

**Rule Action（规则行动）**:
一次完整使用行动格，或规则明确授予的一次命名行动。Rule Action 可以发生在 Turn 内，也可以在阶段或 anytime 窗口中脱离 Turn 执行；选择和 continuation 只是该行动的结算过程。
_Avoid_: Turn、ActionNode、单独的资源增减 / 支付 / 选择

**Anytime Availability（随时行动可用性）**:
玩家在当前规则窗口内可以合法开始一项随时行动或其前置效果的条件。当前必须支付的费用无法支付时，该行动不属于可用入口。
_Avoid_: 仅持有对应卡牌、无效尝试结束原行动

**Exchange Batch（兑换批次）**:
玩家一次确认执行的一组资源兑换，可以包含不同配方及各自的兑换次数。
_Avoid_: 一条兑换配方、单次资源变化

**Anytime Ability（随时行动能力）**:
规则授予玩家在适用时机可以主动发动的一项能力。支付哪种商品、选择哪个目标可以是同一能力的内部选择，不因此成为多项独立能力。
_Avoid_: 把每种商品或目标分别视作一项能力、一次具体发动

**Anytime Activation（随时行动的一次发动）**:
玩家在合法随时行动窗口发起的一次完整结算，包括前置效果、支付以及本次引发的选择、动物整理和后置响应。主体资源变化完成，不代表本次发动已经结束。
_Avoid_: 单个支付或资源增减、一次客户端命令、主体效果完成即视为整次发动完成

**Action Replacement（行动替换）**:
规则允许玩家在原行动开始前，选择用另一项效果替代该行动机会。替代效果是否构成命名行动、包含哪些必需或可选步骤，仍由对应规则决定。
_Avoid_: 额外获得原行动、支付成本替换、将所有替代效果视为相同行动

**Replacement Selection（替换选择）**:
玩家在适用的替代效果与不替换之间作出的明确选择；只有一个可执行替代也需要玩家选择。不替换保留原行动既有的可选性和义务，选择替代则承诺其必需步骤。
_Avoid_: 原行动的执行确认、自动使用唯一替代、通过拒绝替换跳过必需行动

**Action Execution Scope（行动执行作用域）**:
一项 Rule Action 的完整结算边界，覆盖该行动的选择、continuation、响应和后置效果。同一 Turn 内的多个 Rule Action 各自使用独立作用域，但共用 Turn Scope。
_Avoid_: 用 Turn Scope 代替、为单独的资源增减 / 支付 / 选择新建作用域

**Undo Step（撤销一步）**:
在允许的撤销边界内恢复到上一玩家操作之前；可连续撤销，但一步不等于整个可选效果或 Rule Action。
_Avoid_: 跳过未完成义务、仅返还资源、撤销其他玩家已确认的回应

**Undo Action（撤销行动）**:
恢复当前 Rule Action 的起点；若 Protected Observation 之后的强制续行只能使用安全恢复点，则回到保留原观察结果的选择。
_Avoid_: 撤销整个 Turn、重掷或重新抽取、无条件越过撤销边界

**Undo History（撤销历史）**:
当前会话中供普通 Undo Step 和 Undo Action 恢复允许的先前状态的记录，受玩家确认与 Protected Observation 等撤销边界约束；Active Game Recovery 保留原有撤销范围。它不等同于永久 Game Replay Archive，也不代表 Provisional Continuation Scope 的系统回退权限。
_Avoid_: Replay Step、Public Event Archive、把普通撤销与暂定作用域回退混为一谈

**History Branch（历史分支）**:
活动会话在特定恢复点所对应的有序历史版本；撤销后重做可以共享此前记录，但后续历史属于不同分支。分支身份不等同于事件展示序号或历史条数。
_Avoid_: 用事件序号代表永久历史身份、仅按长度识别历史版本、Replay Segment

**Engine**:
节点树执行层，核心包括 `Engine`、`EngineStack`、`engineProceed`、`engineResolve`、`BaseNode`、`ActionNode`、`OrNode`、`XorNode`、`ParallelNode`。
_Avoid_: 新建并行状态机

**ActionFlow**:
卡牌、hook、listener 和行动返回的领域 flow 代数，只暴露 `leaf`、`seq`、`parallel`、`xor`、`or` 加 metadata。
_Avoid_: runtime-only node、为单卡新增 flow 类型

**ActionNode**:
runtime engine tree 的原子叶节点，按 `actionId` 调用 `ActionDefinition` 的执行和选择逻辑。
_Avoid_: Action Space

**EngineStack**:
引擎子流程栈，用于 top action、hook、anytime、动物整理、喂食、farm-select、confirm 等嵌套流程的 push / pop / resume。
_Avoid_: 直接改 pending

**Engine Frame Control**:
`EngineStack` 对当前执行帧的具名控制口径，覆盖替换当前 frame 的 Engine/source、设置或确认 deferred player switch、清空临时 switch 状态。
_Avoid_: 调用方直接写 EngineFrame 字段、另建一套执行栈

**Session Engine Driver**:
Session 推进当前 `EngineFrame` 时使用的执行口径，负责把下一步节点上下文、blocked pending 设置和当前 action pending 确认这类 engine 内部操作收在 engine 侧。Session 只提供玩家、行动格和状态后果处理，不直接检查 engine node 类或读取 engine 内部 tree。
_Avoid_: Session 直接调用 `_internals()`、Session 按 node class 分支、另建一套 EngineStack

**Stage Dispatch**:
阶段推进时负责发现并触发卡牌阶段效果、阶段 reaction、before-end 玩家分发，并写入后续可恢复的阶段 continuation。
_Avoid_: Round/Harvest 业务顺序、响应生成、前端交互展示

**Before-Harvest Reaction Window（收获前反应窗口）**:
每次 Harvest 开始前，按窗口开启时的 Start Player Marker 冻结顺时针玩家顺序，并让每名玩家决定其同时可用的卡牌反应结算顺序；mandatory 反应不能被 Pass，跳过本次 Harvest 不跳过该窗口。
_Avoid_: 固定座位序扫描、跨玩家 trigger-select、把 skip-harvest 当成 skip-before-harvest

**Sub-flow**:
由阶段、hook、anytime 或系统流程插入的嵌套执行帧，例如 `animal-reorg`、`harvest-feed`、`confirm-next-player`。
_Avoid_: 顶层游戏状态机

**Effects**:
行动效果层，覆盖 collect、construct、fencing、sow、bake-bread、exchange、breed 等公开行动和内部行动。
_Avoid_: 在 effect 文件里堆叠多卡特例

**Action Space**:
棋盘上的行动格，是可放工人的公开空间，包含行动定义、累积资源、占用工人等。
_Avoid_: ActionDefinition、ActionNode

**Action Space Query**:
领域层读取公开行动格的统一查询边界，覆盖按 id 查找、存在判断、按 id 集合保持棋盘顺序过滤、按 worker 定位所在行动格等共享语义。
_Avoid_: 行动格 mutation、卡牌特定行动选择规则、前端规则推断

**Action Entry Query**:
会话层判断当前玩家是否能通过普通回合行动入口进入某个 Action Space 的统一查询边界；Session 可用性投影和 `takeAction` 入口校验共用它。准入允许行动开始，不承诺后续选择和 Mandatory Continuation 已被证明能够全部完成。
_Avoid_: Action Space mutation、卡牌购买可用性、RoomPlayer 席位校验、前端本地视角选择

**Action Completion Reachability（行动完成可达性）**:
从当前规则状态出发，存在一条遵守触发时点、合法选择、费用和版图约束，并完成目标行动及其 Mandatory Continuation 的路径。它不保证玩家任意后续选择都会成功。
_Avoid_: 只判断行动能开始、只计算 before 的资源收益、保证所有选择都能完成

**Strict Action Entry（严格行动入口）**:
必须在可用性投影和权威 `takeAction` 入口同时满足自身可执行条件的 Action Space；卡牌创建的行动格默认属于此类，标准复合行动格仅在规则要求时显式启用。
_Avoid_: 只禁用 UI、把所有 OR Action Space 全局设为严格、执行后静默跳过

**Season Action Space（季节行动格）**:
Through the Seasons 变体中的四季行动格。四个季节行动格都属于公开 Action Space，但只有当前季节的行动格可进入；非当前季节格保持可见但不可执行。
_Avoid_: 前端按钮、虚拟卡牌、Blocked Action Space

**Season Variant Listener（季节变体监听器）**:
Through the Seasons 这类游戏变体注册的会话级规则监听器。它可复用 card-purchase Cost Candidate 管线或 Action Hook，但必须由 `GameState.enableThroughTheSeasons` / `currentSeason` 明确门控；它不是已打出的卡牌，也不应写入玩家 `cardStates`。
_Avoid_: Card Listener from played card、虚拟 source card、前端折扣

**Food Accumulation Space（食物累计格）**:
印有食物累积的行动格。卡牌提到从食物累计格拿食物时，只指从该类行动格本身取得的食物，不包括同一行动中来自卡牌、兑换或其他奖励来源的食物。
_Avoid_: 任意给食物的行动、卡牌奖励、兑换收益

**Blocked Action Space（被封锁行动格）**:
因 linked action space 规则在本轮暂时不可进入的行动格。它不是 occupied，没有实际工人在该格上，也不应被卡牌或行动逻辑当作占用工人读取。
_Avoid_: occupied Action Space、synthetic linked occupancy、phantom worker

**Blocked Farmyard Space（被阻塞农场格）**:
因卡牌或变体规则变成已使用且不可再放置房间、田、畜栏、围栏、地形或动物区的农场格。它是农场几何的一部分，但在规则上被永久或持续排除出后续放置候选。
_Avoid_: 前端隐藏格、普通 unused space、Action Space block

**Farmyard Space Goods Token（农场格货物标记）**:
由卡牌放在具体农场格上的资源标记；该格仍按卡面语义保留 unused 或其他状态，直到后续规则条件满足时领取这些资源。
_Avoid_: Field attachment、Action Space attachment、库存资源

**Field Goods Token（田地货物标记）**:
由卡牌放在已有田地上的资源标记；它不属于该田地的作物，不能在收获田地阶段收取，只能按卡牌指定条件领取。
_Avoid_: Field attachment、作物、库存资源

**Non-field Crop Space（非田作物格）**:
由卡牌授权、可承载 grain 或 vegetable 的非田农场格。它可以参与卡牌指定的播种或作物增长语义，但不计为 Field。
_Avoid_: Field、临时田、Field attachment

**Farmyard Extension（农场版图扩展）**:
由卡牌或变体规则添加到玩家农场版图边缘的新农场格。它扩展共享农场几何，新增格应被后续放置、占用、地形和计分规则当作正常农场格读取。
新增格属于同一个 Farmyard，不是附属区域。
_Avoid_: Farm board 扩展、UI 扩展格、临时格、外侧贴片

**Covered Farm Terrain（被覆盖农场地形）**:
被另一层森林或沼泽覆盖、暂时不作为 visible forest / visible moor 参与规则的农场地形。它仍属于该农场格，但只有移除覆盖层后才重新成为可见地形。
_Avoid_: stacked terrain、hidden terrain、删除的地形

**ActionDefinition**:
一个行动的规则定义，包含可执行性、费用预览、执行函数、选择解析和可选 inner flow。
_Avoid_: UI 按钮定义

**Payment Pipeline**:
统一支付管线，用 `ComplexCost`、`PaymentSolution`、cost modifier、统一支付求解入口和执行器处理建房、翻修、围栏、出牌、pay leaf 等成本。
_Avoid_: 每张卡手写支付分支

**Card-Provided Payment Resource（卡牌提供的支付资源）**:
由卡牌效果临时提供、只能用于支付管线的虚拟资源口径，例如用 Traveling Players 行动格上的食物支付职业成本。它有卡牌前缀稳定身份，不出现在成本候选行中，但会以自身身份出现在实际支付明细中；它可以声明自己能覆盖哪些成本资源，不表示玩家库存资源或通用资源类型。
_Avoid_: Payment Source、PlayerState.resources、真实资源兑换、成本候选行资源

**Payment Budget（支付预算）**:
一次行动或卡牌子流程对最终实际支付资源施加的上限约束。它不提供资源、不改变成本候选，只在折扣和支付求解完成后限制该流程最多能支付多少普通资源。
_Avoid_: Card-Provided Payment Resource、库存资源、成本折扣、段数上限

**ComputeCardCosts**:
购买 major / minor improvement 时对当前卡牌成本候选执行的卡牌成本变形语义。它包括拥有 `computeCosts.improvement` listener 的卡，也包括先选支付路径再把该路径送入同一成本变形语义的卡。
_Avoid_: 建房、翻修、围栏等非卡牌购买成本

**Cost Candidate（成本候选行）**:
一次支付中可选的 exact fee 候选，例如“付 2 wood”或“付 1 food”。它表示可选成本本身，不表示把一种资源兑换成另一种资源。
_Avoid_: Trade、资源兑换、支付替换器

**Cost Candidate List（成本候选列表）**:
购买卡牌时当前可支付成本候选行的集合。ComputeCardCosts 读取并返回这个列表；卡牌效果可以保留原候选、追加新候选、修改候选或替换候选。
_Avoid_: 单个 flat cost、PaymentSolution 列表、已枚举支付方案

**Candidate Closure（候选闭包）**:
对成本候选集合与一组卡牌成本转换求不动点：反复将每个未达使用上限的转换应用到每个候选，新候选去重后并入，直到不再产生新候选。结果与转换的注册顺序无关，等于所有应用顺序产物的并集。
_Avoid_: topo 排序、数字 order 优先级、卡牌间偏序

**Mandatory Saturation（强制饱和）**:
候选闭包结果集的过滤规则：只保留不存在仍可应用的 mandatory 成本转换的候选；未饱和候选仅作为中间节点继续派生，不暴露给玩家。mandatory / optional 是每个成本转换的局部自描述语义（对照卡面"costs less" vs "can pay instead"逐卡确定），不是卡牌间关系。
_Avoid_: 卡牌执行顺序、Pareto 剪枝、domination

**Payment Path（支付路径）**:
玩家在多个基础成本候选之间选择的路径身份；它可以影响后续卡牌效果，且不等同于最终实际支付掉的资源明细。
_Avoid_: PaymentSolution、实际扣减资源、Trade

**Cost Attribution（成本归因）**:
卡牌改变成本后，用于卡牌统计展示的 saved / paid 归因。它描述“这张卡让成本少付或额外多付了什么”，不表示这张卡拥有整笔支付，也不表示一次真实资源移动。
_Avoid_: Payment Path、resource.paid、整笔行动支付归属

**Scoring Reserve**:
终局计分选择中被声明为“已用于某张卡计分”的资源占用；它影响其他终局资源计分可读取的剩余资源，但不表示玩家真实资源被支付或移除。
_Avoid_: Payment Pipeline、真实资源支付、tiebreaker 资源扣减

**Pre-Scoring Payment（计分前支付）**:
Before-End Player Dispatch 中由玩家选择并实际移出供应的资源支付；被支付资源不会参加之后的基础类别、卡牌奖励或其他计分前效果。
_Avoid_: Scoring Reserve、只在计分副本中预留资源、自动最大化计分档位

**Card Bonus VP**:
由已打出卡牌产生的非印刷分数，包括主要改良资源计分、计分卡牌效果、卡牌局部状态累计分和 Scoring Reserve bonus；它和 Cards / 卡牌分（卡牌本身印刷 VP）分开统计。
统一 score category 是 `cardBonusVp`，不保留旧 `cardsBonus` / `cardStateBonusVp` / `cardBonus` shape。
_Avoid_: Improvement bonus、card state bonus、printed VP

**Major Improvement（主要改良）**:
主要改良包括供应区主要改良，以及卡面语义上同时视为主要改良的已打出小改良。
_Avoid_: 只统计供应区主要改良、忽略 dual-type improvement

**Major Improvement Purchase（主要改良购买）**:
通过主要改良购买路径取得供应区主要改良的行为。小改良即使卡面语义上同时视为主要改良，仍不是主要改良购买。
_Avoid_: dual-type minor purchase、按计数身份套用购买规则

**Major Improvement Supply Stack**:
主要设施供应区中同一类主要设施的实体卡叠放口径；只有当前可见的顶层实体卡可被购买，被覆盖的实体卡仍属于供应但不可直接选择。
_Avoid_: flat available major list、把 covered card 当作可购买卡、duplicate major alias

**Major Improvement Supply Family（主要改良供应堆家族）**:
主要改良在实体供应版图上的堆位归属；共享同一供应堆家族只表示这些卡属于同一堆位或行，不表示它们在卡牌规则中互为升级或等价。
_Avoid_: Improvement Identity、规则等价关系、按卡牌名称前缀归类

**Improvement Identity（改良身份）**:
卡面或规则赋予一个改良“视为某个命名改良或其升级”的等价口径；它独立于该卡在实体供应版图上的堆位归属。
_Avoid_: Major Improvement Supply Family、供应堆位置、按卡牌名称前缀推断

**Supply Token**:
玩家 supply 中的 fence / stable 组件也视为支付资源；支付 supply token 记录到 `player.supplyTokensConsumed`。
_Avoid_: 固定 15 fence / 4 stable 上限

**Family Token Limit（家庭成员 token 上限）**:
玩家可拥有或激活的家庭成员 token 总上限；通常来自玩家的 worker token supply，也可以被卡牌改变。它限制家庭成员总数，但不表示当前住房是否足够。
_Avoid_: 当前家庭成员数、当前可放工人数、有效住房容量

**Supply Person（供应人物）**:
由卡牌允许从玩家个人供应中取出并暂时使用的一个人物实体；这次使用不是家庭增长。
_Avoid_: 新生儿、永久家庭成员、无限生成的额外人物

**Reserved Supply Person（已预留供应人物）**:
因卡牌从个人供应中取出、被指定用途占用的那一个人物。预留期间不能被其他效果再次从供应中领取，也不能用于家庭增长。
_Avoid_: 仍在供应中的人物、已永久移出游戏的人物、卡牌持有的普通家庭成员

**Supply Placement Opportunity（供应人物放置机会）**:
卡牌授予在指定时机使用一名可用供应人物的资格；资格本身不预留人物。
_Avoid_: 已预留供应人物、永久家庭成员、尚未执行的家庭增长

**Removed Family Token（已移除家庭成员 token）**:
被卡牌永久移出玩家 family token supply 的 worker token。它不再是可通过 family growth 激活的 inactive worker，也不计入家庭成员 token 上限。
_Avoid_: newborn、暂时在行动格或卡牌上的 worker、尚未出生的 inactive worker

**Effective Housing Capacity（有效住房容量）**:
玩家当前住房可以容纳的家庭成员数量，由房间和提供额外居住空间的卡牌共同决定。它用于判断需要住房的家庭增长是否有空间，和房间数量、家庭成员 token 上限都不是同一个概念。
_Avoid_: 房间数量、家庭成员 token supply

**Renovation Prohibition（翻修禁令）**:
由已打出卡牌持续施加的玩家级规则能力，禁止该玩家执行任何 Renovate House 规则动作；行动格、卡牌授予动作、费用预览和权威执行必须读取同一能力。
_Avoid_: 只隐藏翻修按钮、只阻止某一个翻修行动格、卡牌 id 特判

**Farm Fence Segment Count（农场围栏段数）**:
当前玩家农场边上已经建出的围栏类边段数量，包含 own ordinary fence、borrowed fence 和 palisade。它描述农场版图上的围栏段展示与几何，不代表玩家自己的 ordinary fence supply。
_Avoid_: own ordinary fence reserve、own ordinary fence build max

**Effective Farm Fence Segment Limit（有效农场围栏段数上限）**:
玩家当前农场面板可展示的围栏类边段上限。它以玩家 own ordinary fence build max 为基础，并把已经建在该农场上的 borrowed fence、palisade 等非 own ordinary 边段提供的额外上限计入；它服务面板容量展示，不等同于 own ordinary fence supply。
_Avoid_: own ordinary fence reserve、donor 的 supply 上限

**Borrowed Fence**:
建在当前玩家农场、但来源属于其他玩家的普通 fence；仍参与当前农场的几何、牧场、动物规则、农场围栏段数和有效农场围栏段数上限，但不计入当前玩家 own ordinary fence supply。
_Avoid_: bonus VP、特殊 fence 类型

**Donor / Source Owner**:
提供 borrowed fence 组件的玩家；组件被借走后，donor 的 own ordinary fence reserve / build max 会减少。
_Avoid_: 当前行动执行玩家、农场 owner

**Stable Supply Usage（畜栏 supply 占用）**:
玩家 stable supply 中已经离开 reserve、但没有被永久支付或移除的畜栏组件占用。已建普通畜栏、行动或未来轮保留的畜栏、以及卡牌产生的特殊畜栏都属于占用；永久消耗会降低 stable supply 上限，不算占用。
_Avoid_: 卡牌口径 Stable、动物容量、永久消耗的 supply token

**卡牌口径 Stable**:
卡牌文本中“你拥有的 stable”“本次建造的 stable”“unfenced stable”使用的畜栏口径；包含普通畜栏和 Farm Hand stable 这类只参与卡牌统计的特殊畜栏。
_Avoid_: 动物容量、牧场容量、可安置动物的 stable

**Animal Payment Preference（动物支付偏好）**:
动物支付或动物兑换在多个可扣减动物区之间选择来源的局部约束，用于表达“优先扣这张卡上的动物”或“尽量保留这张卡上的动物”。它不引入全局动物身份，只在一次支付解析中约束 aggregate 动物资源从哪些区域扣减。
_Avoid_: 全局 animal id、普通资源支付顺序、动物容量规则

**Animal Assignment（动物安置布局）**:
玩家确认的各动物区最终安置结果；省略的区域为空，未分配的动物表示主动弃养。非法布局整体拒绝，不能由系统替玩家选择另一种布局。
_Avoid_: 增量移动指令、自动裁剪后的布局

**Placed Animal（已安置动物）**:
属于本人且已经安置到有效动物区的动物，包括本人合法牌上动物区和寄宿区中的动物；不包括待安置动物。动物数量归 Animal Owner，不能因承载卡属于另一名玩家而改变归属。
_Avoid_: 动物总库存、待安置动物、按 Card Owner 统计动物

**Farmyard Goods Placement（农场格货物放置）**:
把货物新放到本人农场格上的事实，包括播种作物和实际安置新动物；单纯调整已有货物的位置不算。房间、畜栏、围栏不是货物，卡牌田和纯牌上动物区也不是农场格。以 `farmPosition` 绑定本人实体农场格的动物区仍属于农场格，无论底层是否采用 card zone。
_Avoid_: 建造农场设施、旧动物重排、取得后直接烹饪而未安置

**Pending Reserve Animal（待安置动物）**:
玩家已取得但尚未安置到当前有效动物区的动物，包括因容量缩减而失去原位置的动物。它尚不属于已安置在农场上的动物。
_Avoid_: 已安置动物、已弃养动物

**Animal Reorg Prefill（动物重整自动补位）**:
为被动动物重整提供的安置草稿，在保持已有有效安置的前提下，把待安置动物补入兼容的剩余空间；未能补入的动物仍为待安置动物。草稿由玩家修改或确认，确认前不属于 Animal Assignment 或新的 Placed Animal。
_Avoid_: 自动重排已有动物、自动确认、自动弃养

**Placed Newborn Animal（成功安置的新生动物）**:
本次繁殖产生并在随后的动物重排完成时成功安置的新生动物；未能安置而弃掉的新生动物不计入繁殖奖励。
_Avoid_: 繁殖时临时增加的动物数量、家庭增长的 Newborn

**Hosted Card Animal Zone（寄宿卡牌动物区）**:
一张玩家拥有的卡牌为另一名玩家提供的动物区。承载卡归 Card Owner；动物归 Animal Owner；动物数量、支付、繁殖和整理按 Animal Owner 计算，但该动物区作为 Card Owner 的卡牌能力存在。
_Avoid_: 把动物复制到 Animal Owner 的卡牌状态、把寄宿动物计给 Card Owner、前端自推断别人卡上的可用动物区

**Card Owner / Animal Owner**:
Card Owner 是拥有或打出承载卡的玩家；Animal Owner 是某个动物区中动物实际归属的玩家。普通动物区两者通常相同；Hosted Card Animal Zone 中两者可以不同。
_Avoid_: 当前行动玩家、浏览器 viewer、RoomPlayer

**Internal Action**:
不直接暴露给玩家选择的内部执行叶子，例如 payment internal、future meeple、selection、return-to-space、recall worker。
_Avoid_: 玩家可直接选择的公开行动

**Future Receive**:
回合开始时玩家从 future meeple / round card 拿回先前放置资源的 receive 语义。它属于内部阶段流程，但对卡牌语义等同于一次 Receive，不等同于普通 Gain。
_Avoid_: Gain、Action Space collect、round growth accumulation

**Future Schedule（未来轮计划）**:
卡牌把资源、组件或后续行动绑定到尚未开始的真实轮次；计划只存在于第 1–14 轮，越界目标不会被改写到另一轮。
_Avoid_: Round Growth、把越界目标钳制到第 14 轮

**Exact Future Target（精确未来目标）**:
Future Schedule 中逐项指定的轮次；每项保持原轮次身份，只有满足 `current round < target <= 14` 时才进入计划。
_Avoid_: Future Prefix、越界合并、目标轮平移

**Future Prefix（未来连续前缀）**:
Future Schedule 中从指定起点开始、长度有限的一段连续轮次；游戏只保留其中仍真实存在且尚未开始的前缀。
_Avoid_: Exact Future Target、把缺失后缀堆到最后一轮

**Granted Rule Action（授予的规则动作）**:
卡牌效果直接授予的领域动作，例如 `family-growth`；它不自动包含同名 Action Space 的其他附带动作、占格或小改良机会。
_Avoid_: 展开整个 Action Space、模拟放置工人、继承行动格附带选择

**Action Hook**:
行动生命周期扩展点，如 `isDoable`、`computeReplace`、`computeCosts`、`before`、`during`、`after`、`anytime`。通常由卡牌注册。
_Avoid_: 前端规则补丁、核心路径单卡 if-else

**Card Effect Hook**:
卡牌在阶段或计分时被调用的 effect 字段，如 `onBuy`、`onRoundStart`、`onStartHarvestFieldPhase`、`onAfterReap`、`computeBonusScore`。
_Avoid_: listener phase

**Before-End Player Dispatch**:
终局计分前按 target player 座次触发 `onBeforeEndGame` card-effect activation 的阶段机制；owner-scope 卡只在自己 target step 触发，allPlayers 卡可在每个 target step 触发，同一 target step 内的 select trigger 复用 `ParallelNode(mode='trigger-select')`。
_Avoid_: 卡牌自己扫所有玩家、为单卡新增 custom turn-order

**Card Listener**:
监听 action / event phase 的卡牌反应。listener handler 必须是 state-pure flow builder：只能读 state / events 并返回 flow 或结构化结果。
_Avoid_: dispatch 阶段直接修改 `GameState`、`PlayerState` 或 `cardStates`

**Reaction Hook**:
同一时机可能有多张卡可触发、且玩家应能决定触发顺序的卡牌反应。OA 用 `ParallelNode(mode='trigger-select')`：先显示可触发卡牌，玩家选择一张后执行该卡 activation，剩余同组 reaction 继续由引擎重算。
_Avoid_: 固定卡牌扫描顺序、per-card 触发顺序开关

**Compute / Query Hook**:
只汇总数值、候选、费用、可达性或计分的 hook，例如 `computeCosts`、`isDoable`、`computeBonusScore`。这类 hook 不代表玩家可选择的反应顺序，仍按确定性顺序聚合。
_Avoid_: trigger-select、玩家排序选择、状态修改

**Cards**:
卡牌运行时领域，覆盖 `CardRegistry`、`SessionCardContext`、card effects、card listeners、display lookup 和自定义卡注册。
_Avoid_: 把单卡规则扩散到主路径

**Card Definition**:
Card Source 的 `meta` 部分，包含可序列化、前端可见、无运行时行为的卡牌定义字段，如 id、名称、描述、成本、类型、前置条件、reward、`cardField`。
_Avoid_: modifier、listener、effect、prerequisiteCheck、卡牌运行时局部状态

**Parent Card Definition**:
Parent Cards 扩展的独立结构化数据定义，描述 mother / father parent card 的卡号、规则原文、逻辑头像引用、逻辑卡背引用、mother 小数分值、mother 轮次奖励、father 任务条件和三档奖励；father 条件与奖励同时保留原文和机器可读结构。mother 小数分直接按规则印刷的小数存储。它只描述可验证数据，不执行规则。它不属于 `shared/cards` 的 Card Source / Card Definition / Card Display / Card Impl 投影，也不进入普通手牌、已打出卡、cards-manifest 或常规卡牌注册表。
_Avoid_: Card Definition、Card Source、MinorImprovement、Occupation、玩家手牌

**Parent Cards（父母卡扩展）**:
Consul Dirigens 的父母卡小扩展；启用时所有入座玩家各保留 1 张母亲卡和 1 张父亲卡，并把保留的父母卡作为公开的玩家侧边卡参与游戏。它不是让子变体，也不是普通 A-E / community 卡牌来源。
_Avoid_: ordinary card deck、community deck、handicapping、让子

**Parent Card Selection**:
Parent Cards 启用后的开局私有选牌阶段：每位玩家从自己的 mother / father 候选中各保留 1 张，未保留候选不公开，最终保留牌公开。
_Avoid_: ordinary card draft、玩家手牌、弃牌

**Mother Parent Card**:
Parent Cards 中提供轮次奖励和小数终局分的保留牌；其分值按卡面小数直接进入终局总分。
_Avoid_: printed VP、Card Bonus VP

**Father Parent Card**:
Parent Cards 中提供一次性 side quest 的保留牌；玩家选择一个已满足档位完成后，只获得该档奖励，并以公开完成标记表示完成。
_Avoid_: flipped face-down card、repeatable achievement

**Card Source**:
单卡作者编辑的唯一源，包含卡牌的 `meta` 和 `impl`；构建和运行时必须从它投影出前端可读的 Card Display 和服务端可用的 Card Impl。
_Avoid_: 让作者同时维护 display 文件和 impl 文件

**Card Impl**:
服务端和 sandbox 使用的卡牌运行时实现，包含 hook、listener、effect、modifier、prerequisiteCheck 和 helper 调用；modifier 属于 impl，不属于 Card Display。
_Avoid_: 前端主 bundle 可见

**Card Display**:
主前端可读的卡牌展示投影，只描述 UI metadata。
_Avoid_: 规则执行逻辑

**Card State**:
单卡局部状态，写在 `player.cardStates[cardId]`，用于计数、flag、infobox、stack、extraData 等。
_Avoid_: 为单卡新增 PlayerState / GameState 顶层字段

**Card Field**:
一张已打出卡提供的虚拟田，可包含多个播种 / 收获槽，并参与“田”的计数、播种、收获、作物选择与移除；具体规则仍负责筛选来源、作物与时机。
_Avoid_: 实体田、Sow Slot、Harvest Slot

**Logical Field**:
规则计数中的一块田。普通田各自是一块 Logical Field；同一 Card Field 的多个槽可以共享 `groupKey`，整体只算一块 Logical Field。
_Avoid_: Sow Slot、Harvest Slot

**Domain**:
领域聚合和派生视图层，覆盖农场、动物区、牧场容量、计分、`PlayerBoard` 等不变量校验。
_Avoid_: React UI 规则裁定

**Harvest**:
完整收获序列，可能包含田地阶段、喂食阶段、繁殖阶段和收获作用域卡牌效果。
_Avoid_: Private Field Phase

**Harvest Field Phase**:
完整 Harvest 内的田地阶段，会对适用玩家执行 Reap，并触发收获田地阶段作用域效果。
_Avoid_: Private Field Phase

**Private Field Phase**:
卡牌授予的私人田地阶段，只在某个玩家的农场上执行 Reap，不进入完整 Harvest。
_Avoid_: Harvest、Harvest Field Phase

**Private Breeding Phase**:
卡牌或游戏变体授予的私人繁殖阶段，只为某个玩家执行动物繁殖，不进入完整 Harvest。
_Avoid_: Harvest、Harvest Breeding Phase、完整收获繁殖阶段

**Reap**:
从普通田或 Card Field 顶堆收获作物到玩家 supply 的动作。
_Avoid_: Harvest

**Harvest Count**:
田地阶段中一块田本次 Reap 应产出的作物数量。普通田通常为 1，但收获阶段卡牌可能增加、减少或覆盖该数量。
_Avoid_: 资源总数、整次 Harvest 产量

**Events**:
事件和 replay 领域，覆盖 `EventStore`、public event archive、event mapping policy、log mapper、replay timeline 和 private event notification。
_Avoid_: 直接写 UI log 当规则事实

**Public Event**:
写入 `GameState.events` 的公开规则事实，用于派生日志、动画提示、审计和 replay。
_Avoid_: 直接写 state.log

**Public Event Archive（公开事件归档）**:
记录一局游戏中公开事件被提交和被取消的沿革，撤销或系统回退也保留相应记录，完整整局历史须可供玩家按需查阅。它不等同于当前仍有效的 Public Event 集合，也不是按 Replay Step 固定完整权威状态的 Game Replay Archive。
_Avoid_: 当前有效事件列表、Game Replay Archive、把归档视为全部事件正文的副本

**Public Event Presentation**:
从 **Public Event** 派生 transient 展示提示，包括 notification、highlight、resource animation、card pass animation 和 replay cue；只描述要展示什么，不处理 DOM 定位。
_Avoid_: 前端调用点各自解释 public event payload

**Private Event**:
只发给特定 viewer 的私有同步附加层，例如私有 prompt、手牌变化、draft 信息；不进入公共事件流或 Game Replay Archive。结束局回放从 Replay Step 和归档规则状态展示手牌、draft 与已接受选择，不复制 Private Event envelope。
_Avoid_: public event

**Game Seed（对局种子）**:
决定发牌、轮抽牌池、轮次行动卡顺序和卡牌随机结果的服务端私有值；普通牌堆和父母选择不由它决定。活动对局中它不属于任何座位或旁观者可见的信息，也不能由玩家可见的信息推算出来；它只随正常完赛的 Game Replay Archive 在全开视角下公开。
_Avoid_: 开局码、可分享种子、房间号

**Explicit Seed（指定种子）**:
测试、开发房或调试接口明确给出的数字 Game Seed，用于让同一局可重复。它可以被枚举，不提供隐藏信息保护，正式房间不接受它。
_Avoid_: 正式房间的 Game Seed、可分享种子

**Unrevealed Round Card（未翻开的轮次行动卡）**:
尚未到达其轮次、也没有被卡牌效果翻开的轮次行动卡。玩家知道每个阶段有哪些卡，但不知道阶段内的顺序；它在该轮开始时翻开，卡牌效果明确翻开的那一张从翻开起对所有人可见。
_Avoid_: Blocked Action Space、前端隐藏格、未解锁行动格

**Action Log**:
由 Public Event 派生的对局行动展示缓存，完整整局历史须可供玩家按需查阅；规则代码不把它当事实来源。
历史姓名按当局玩家身份展示：活动局使用当前显示名，完赛后使用该局 Replay Participant 的显示名，并遵循账号删除后的匿名化规则。
_Avoid_: 业务代码直接写 log

**History Window（历史展示窗口）**:
实时同步展示的近期完整操作组集合，具有有界大小；更早记录属于同一局的可按需查阅历史。展示窗口不决定规则、撤销或 Game Replay Archive 保留哪些事实。
_Avoid_: 裁剪权威规则历史、删除旧事件、把窗口边界当撤销边界

**Workshop**:
自定义卡和 AI 卡牌设计区域，覆盖卡牌生成、LLM 服务、卡牌美术、工坊 PR 和自定义卡上传。
_Avoid_: 原版规则主路径

**Workshop Card**:
Workshop 中由作者拥有、具有稳定身份的自定义卡设计聚合。它只有一个当前 Design Draft，并可产生 Draft Version 和 Published Card。
_Avoid_: Design Draft、游戏内卡牌定义

**Design Draft**:
Workshop Card 下作者私有、可变且可恢复的当前工作状态，包含已采用的卡牌内容，以及图片、能力各自最近一次完成生成的请求与结果；未发送输入和完整工作对话不属于服务端可恢复草稿。检查点只更新草稿，不代表创建版本或发布。
_Avoid_: Draft Version、Published Card、临时表单状态

**Generation Candidate**:
基于 Design Draft 某一目标分区生成、尚未采用的作者私有提案；图片和能力候选共享生命周期，但内容类型不同。同一分区可在当前会话比较最多三个候选，重新打开只恢复最近一次完成生成的候选；采用或丢弃后不作为第二份内容长期保留。
_Avoid_: Design Draft、Draft Version、已采用内容副本

**Generation Provenance（生成溯源）**:
描述候选生成来源的作者私有不可变事实，包括最终请求、provider、model、参考图标识和可用的 seed 或 request ID；它是来源证据，不承诺确定性复现。
_Avoid_: 可复现信息、API Key、模型凭据

**Draft Version**:
Design Draft 在采用候选或交接时形成的作者私有不可变快照，只包含已采用的卡牌内容及对应生成溯源；恢复版本只把其内容复制到当前 Design Draft，不改写历史或创建新版本。工作对话、未采用候选和普通检查点不属于版本。
_Avoid_: 自动保存历史、Design Draft、Published Card

**Published Card**:
固定引用某个 Draft Version 的公开卡牌投影，只公开最终卡牌定义、图片、能力源码和本地化。后续草稿修改保持私有，直到作者再次发布。
_Avoid_: 实时 Design Draft、生成记录、Generation Provenance

**Replay Card Snapshot**:
正式多人局把实际使用的自定义卡名称、说明、美术和规则参数固化进 Game Replay Archive，使回放不依赖后续 Workshop Card。它不包含 LLM prompt、编辑历史、Generation Provenance、能力源码或编译产物；未发布卡只有在开局前确认公开后才能进入正式多人局。
_Avoid_: Published Card、Draft Version、可执行卡牌实现

**Workshop Sandbox（工坊沙盒）**:
Workshop 中组合自定义卡、配置测试局并启动浏览器内热座游戏的界面与流程。中文界面统一使用“沙盒”；重新选择卡牌和配置称“重新配置沙盒”；启动动作称“开始沙盒测试”。
_Avoid_: 中文界面中的 Sandbox、Reset Sandbox、Custom Code Sandbox

**Custom Code Sandbox**:
自定义卡代码的校验、编译和隔离执行链路，服务端通过 `server/custom-code/` 和 executor-backed runtime 注入卡牌能力。
_Avoid_: 直接执行用户源码

**主 client bundle**:
线上 React 前端，只能使用协议、展示数据、安全领域 helper 和 i18n，不运行完整规则引擎。
_Avoid_: `shared/session`、`shared/engine`、`shared/cards` impl

**Sandbox client bundle**:
浏览器内离线 hot-seat / workshop sandbox，可直接运行完整 shared engine。
_Avoid_: 线上多人主链路

**Session Test**:
后端边界测试，直接实例化 `GameSession` 并断言 `state`、`pending`、`interaction`、`log`、`scores`。
_Avoid_: 用 DOM 断言规则正确性

**Newborn（后代）**:
family growth 当轮新增的工人。当轮不计入可放置工人，要到下一轮才回家可用；喂食阶段只需 1 食物（成人需 2）。
_Avoid_: 把 newborn 当普通可用工人

**Adoptive Available（后代可激活）**:
A92 Adoptive Parents 的触发条件：持有 A92、有未激活的后代、且本轮未放弃该效果。anytime grow 与轮转额外行动共用此单一判定。
_Avoid_: 每轮一次的标记

**Promote（提升后代）**:
把一个 newborn 转成普通可用工人；提升后该工人不再算 newborn（喂食按成人计、相关计分不再计入）。A92 让后代当轮行动的领域动作。
_Avoid_: 单纯增加工人计数

**Extra Turn（额外工作回合）**:
玩家普通工人耗尽后由卡牌贡献的一次额外轮转机会；轮转不再提前跳过这类玩家，且该机会会开启新的 Turn。新的 Turn 不一定是 Extra Turn：Archway、Straw Hat 这类轮转外行动不新增轮转机会。
_Avoid_: 把轮转外 Turn 算作 Extra Turn、连续放工（破坏交替）

**Forfeit（放弃额外行动）**:
玩家在额外行动选择窗口里选“不用”，退出本轮后续行动，避免轮转死循环；标记在每轮开始清空。
_Avoid_: 永久放弃、全局出局名单

## Relationships

- 一个 **Room** 只持有一局 **GameSession**；`newGame` 创建新 `roomId`。正式录制上线后的正常完赛局成为 **Game Result Archive** 和 **Game Replay Archive**，上线前完成局只有结果摘要，未完成局成为 **Expired Game Context**。
- **Game Context Link** 按 **Game Context** 生命周期解析为 **Active Game Recovery**、**Game Replay Archive**、**Expired Game Context** 或 **Replay Tombstone**，但不能替代 Room Invite。
- **GameSession** 产生的权威推进，包括需要保留失败记忆的拒绝结果，先经过 **Durable Room Commit**，成为可恢复的 Room 快照和 **Replay Step**，随后才按 **RoomPlayer** 视角发送。
- 浏览器通过 **Services** 里的 `WsGameTransport` 发送 **ClientCommand**；**Connection** 层路由到 **GameSession**；**Broadcaster** 构造 **StateUpdateEnvelope** 并广播。
- **GameState** 描述游戏规则事实；**RoomPlayer** 描述连接席位；两者不要混用。
- **GameCore.buildInteraction** 从 **GameState**、**EngineStack**、当前 **Pending Envelope** 和 anytime policy 派生 **InteractionState**。
- **InteractionState** 是前端启用按钮和渲染交互的依据；前端不从规则代码推断可操作性。
- **ActionFlow** 编译成 runtime engine tree；`leaf` 变成 **ActionNode**，组合节点变成 sequence / parallel / or / xor runtime node。
- **EngineStack** 是 hook、anytime、喂食、动物整理、confirm、farm-select 等子流程的唯一嵌套机制。
- **Extra Turn** 是轮转机会；**Turn Scope** 承载“你的回合 / 同一回合”身份；**Rule Action** 是规则行动单位。一个 Turn 可包含多个 Rule Action，Turn 外也可执行 Rule Action；每个 Rule Action 对应独立的 **Action Execution Scope**。
- **Action Space** 是棋盘空间；**ActionDefinition** 是行动规则；**ActionNode** 是 runtime 执行叶子。
- **Effects** 定义公开和内部行动；**Internal Action** 支撑支付、selection、future meeple、worker recall 等非玩家直选叶子。
- **Action Hook** 修改行动生命周期的可达性、成本、替代、候选或后续 flow；**Card Effect Hook** 处理阶段/计分；**Card Listener** 响应 action/event phase。
- **Card Listener** 可以构造 flow，但状态修改必须落到 action leaf 执行阶段。
- **Reaction Hook** 用 trigger-select 显式化同一时机的玩家顺序选择；**Compute / Query Hook** 只做确定性聚合。
- **Card Definition** 和 **Card Display** 可以被前端读取；**Card Impl** 只给 server / sandbox 执行规则。
- 持续计数、单次标记和单卡历史优先写入 **Card State**；只有跨卡通用事实才进入 `GameState` 或 `PlayerState` 顶层。
- **Domain** 提供农场、动物、牧场、计分等派生视图和不变量；规则路径可以复用，前端只能把它当安全派生 helper。
- **Harvest** 包含最多一个 **Harvest Field Phase**；**Private Field Phase** 可以执行 **Reap**，但不是 Harvest。
- **Harvest Field Phase** 可能触发 harvest-scoped card effects；**Private Field Phase** 和 **Private Breeding Phase** 不能触发这些效果，除非卡牌明确说明。
- **Card Field** 在 Reap 时参与田地收获；多个槽可以属于同一 **Logical Field**，其副作用是否属于 Harvest 取决于触发上下文。
- 规则事实先写 **Public Event**，再派生 **Action Log**、notification、highlight、animation 和 replay。
- 进行局的私有手牌、私有 prompt 和 draft 选择通过 **Private Event** 或 viewer 过滤传输；结束局的 **Game Replay Archive** 可按座位视角或全开视角展示归档规则状态，但不保存 Private Event envelope。
- **Game Replay Archive** 由 **Replay Step** 组织，用 **Replay Participant** 表达座位身份，并由 **Replay Perspective** 决定展示遮蔽；内容删除后原 `roomId` 只解析为 **Replay Tombstone**。
- **Game Bug Reporter** 可以用自己的 **Issue Submission Connection** 提交，也可以明确选择 **Hosted Issue Identity**；两者都从同一 **Bug Report Draft** 和 **Bug Report Anchor** 创建公开 Issue，未完成局可用 **Reported Game Evidence** 暂时还原该 Anchor。
- **Workshop** 生成或上传自定义卡；**Custom Code Sandbox** 校验、编译并隔离执行这些卡的 impl。
- 未发布 Workshop Card 进入正式多人局前必须确认其 **Replay Card Snapshot** 会永久公开；不同意时只允许在 **Workshop Sandbox** 使用。
- 主 client bundle 只渲染和发命令；sandbox client bundle 可以在浏览器内运行完整 shared engine。
- 规则正确性优先用 **Session Test**；前端视觉和多人连接行为再用 E2E。
- **Promote** 一个 **Newborn** 使其成为可放置工人，是 **Adoptive Available** 玩家把后代换成一次 **Extra Turn** 的前提；**Forfeit** 则让该玩家放弃 **Extra Turn** 并退出本轮后续行动。

## Example dialogue

> **Dev:** “我需要让一张卡在玩家选择行动格后给额外资源，要改 `client` 吗？”
> **Domain expert:** “不要。规则应在 `shared/actions` hook 或该卡的 `shared/cards` impl 中表达，前端只消费新的 `InteractionState` / snapshot。”

> **Dev:** “这个效果需要记住本卡本轮触发过一次，应该加 `PlayerState.hasUsedX` 吗？”
> **Domain expert:** “不要。单卡局部状态写 `player.cardStates[cardId]`，除非它已经是多卡共享领域事实。”

> **Dev:** “Festival Planning 触发 ‘in the field phase of each harvest’ 的卡吗？”
> **Domain expert:** “不触发。它给的是 Private Field Phase，会 Reap，但不是 Harvest Field Phase。”

## Flagged ambiguities

- “action” 可能指 **ClientCommand**、**Action Space**、**ActionDefinition** 或 **ActionNode**。讨论规则实现时要说明是哪一层。
- “pending” 可能指 engine 的 **Pending Envelope**、前端的 **InteractionState.wait**、旧测试里的兼容字段或业务上的等待流程。新设计应优先说 `InteractionRequest.kind`。
- “choice” 可能指 WS `choice` 命令、`InteractionRequest.kind='choice'`、ActionFlow 的 `or/xor` 分支或前端 UI 选择。需要精确到协议/引擎/界面层。
- “hook” 可能指 **Action Hook** 或 **Card Effect Hook**；“listener” 是另一套 action/event 反应机制，不要混称。
- “card” 可能指 **Card Definition**、**Card Display**、**Card Impl**、玩家手牌、已打出卡或 **Card State**。改规则时通常指 Card Impl；改 UI 文案时通常指 Card Display。
- “field phase” 可能指 **Harvest Field Phase** 或 **Private Field Phase**；卡牌文本写“this is not a harvest”时使用 Private Field Phase。
- “replay” 可能指活动状态中的 Public Event timeline，也可能指完赛后的 **Game Replay Archive**；涉及持久化、权限或删除时必须使用完整术语。
- “Game Context Link” 只负责定位既有 **Game Context**；需要让新玩家占座时应明确使用 Room Invite。
- “reap” 只是收作物动作，不等同于完整 **Harvest**。
- “seed” 可能指 **Game Seed**、**Explicit Seed**，也可能指普通牌堆、父母选择各自独立的私有种子；后者不由 Game Seed 派生，同一 Game Seed 下可以不同。
- “snapshot” 是当前同步方式；不要假设存在增量 patch，除非架构文档明确变更。
- “log” 是 UI 缓存，不是规则事实来源；新增规则事实应先考虑 public event。
- “player” 可能指 **PlayerState**、`playerIndex`、`playerId`、**RoomPlayer** 或登录 user；跨层传参时必须明确。
- “可执行” 在不同层含义不同：行动入口可达性、支付可行性、pending option enabled、UI allowed command 都是不同判断。
- “前端可见” 不代表“规则允许”；前端显示应以服务端 **InteractionState** 和 `allowedCommands` 为准。
- “sandbox” 可能指浏览器内 `client/sandbox`，也可能指 server/custom-code 隔离执行；前者是调试 bundle，后者是自定义卡运行时隔离。
