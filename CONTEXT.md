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
服务端权威会话类，位于 `server/game/authoritative-session.ts`，继承 `GameCore` 并注入自定义卡沙盒运行时。HTTP、WebSocket 和 session 测试都通过它驱动规则。
_Avoid_: React session、本地 UI store

**GameState**:
一局游戏的领域真相，包含玩家、行动格、回合、阶段、draft、公开事件、日志缓存、future meeple、收获摘要等可序列化状态。
_Avoid_: 房间连接、WebSocket version、React state

**Game Variant（游戏变体）**:
创建一局游戏时启用的可选规则模块，会改变该局的设置、公开状态、行动格、阶段流程或计分口径。它不是普通卡牌来源，也不是前端显示偏好。
_Avoid_: Card Source、UI toggle、player count layout

**Farmers of the Moor**:
Agricola 的可选扩展名称。讨论该扩展时使用完整名称，不缩写为 Farmers；只有代码标识符可按既有命名使用 `FarmersOfTheMoor`。
_Avoid_: Farmers

**PlayerState**:
玩家的领域状态：资源、工人、房间、田地、动物、手牌、已打出卡、`cardStates`、supply token 消耗等。
_Avoid_: RoomPlayer、浏览器连接、登录用户

**Player Lookup Query**:
领域层把 `playerId` 解析为 `PlayerState` 或 `playerIndex` 的统一查询边界；规则、session 和 effect 代码通过它读取玩家身份映射。
_Avoid_: RoomPlayer seat/auth 查找、前端视角切换、本地 UI player 选择

**Room**:
多人对局容器，持有一个 `GameSession`、座位连接、最大人数、房间状态和持久化元数据。
_Avoid_: PlayerState

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

**InteractionState**:
前端唯一交互真相，只有 `idle`、`wait`、`gameover` 三类；`wait.request.kind` 决定 UI 展示选择、农场选择、喂食、动物整理、draft 等哪种交互。
_Avoid_: 前端从 DOM 或规则代码推断可操作性

**InteractionRequest**:
等待玩家输入的结构化请求，常见 kind 有 `choice`、`farm-select`、`selection`、`animal-reorg`、`feed`、`confirm-next-player`、`confirm-player-switch`、`card-draft`。
_Avoid_: 未类型化 pending blob

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

**Stage Dispatch**:
阶段推进时负责发现并触发卡牌阶段效果、阶段 reaction、before-end 玩家分发，并写入后续可恢复的阶段 continuation。
_Avoid_: Round/Harvest 业务顺序、响应生成、前端交互展示

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
会话层判断当前玩家是否能通过普通回合行动入口进入某个 Action Space 的统一查询边界；Session 可用性投影和 `takeAction` 入口校验共用它。
_Avoid_: Action Space mutation、卡牌购买可用性、RoomPlayer 席位校验、前端本地视角选择

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
候选闭包结果集的过滤规则：只保留不存在仍可应用的 mandatory 成本转换的候选；未饱和候选仅作为中间节点继续派生，不暴露给玩家。mandatory / optional 是每个成本转换的局部自描述语义（对照 BGA 卡面"costs less" vs "can pay instead"逐卡确定），不是卡牌间关系。
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

**Supply Token**:
玩家 supply 中的 fence / stable 组件也视为支付资源；支付 supply token 记录到 `player.supplyTokensConsumed`。
_Avoid_: 固定 15 fence / 4 stable 上限

**Family Token Limit（家庭成员 token 上限）**:
玩家可拥有或激活的家庭成员 token 总上限；通常来自玩家的 worker token supply，也可以被卡牌改变。它限制家庭成员总数，但不表示当前住房是否足够。
_Avoid_: 当前家庭成员数、当前可放工人数、有效住房容量

**Removed Family Token（已移除家庭成员 token）**:
被卡牌永久移出玩家 family token supply 的 worker token。它不再是可通过 family growth 激活的 inactive worker，也不计入家庭成员 token 上限。
_Avoid_: newborn、暂时在行动格或卡牌上的 worker、尚未出生的 inactive worker

**Effective Housing Capacity（有效住房容量）**:
玩家当前住房可以容纳的家庭成员数量，由房间和提供额外居住空间的卡牌共同决定。它用于判断需要住房的家庭增长是否有空间，和房间数量、家庭成员 token 上限都不是同一个概念。
_Avoid_: 房间数量、家庭成员 token supply

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
_Avoid_: dispatch 阶段直接 mutate state

**Reaction Hook**:
同一时机可能有多张卡可触发、且玩家应能决定触发顺序的卡牌反应。OA 用 `ParallelNode(mode='trigger-select')` 对齐 BGA `NODE_PARALLEL`：先显示可触发卡牌，玩家选择一张后执行该卡 activation，剩余同组 reaction 继续由引擎重算。
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

**Parent Cards**:
Consul Dirigens 的父母牌小扩展；启用时所有入座玩家各保留 1 张 mother parent card 和 1 张 father parent card，并把保留的父母牌作为公开的玩家侧边牌参与游戏。它不是让子变体，也不是普通 A-E / community 卡牌来源。
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
一张已打出卡提供的虚拟田，可播种、收获并参与“田”的计数；通过 `CardDefinition.cardField` 和 card-field helper 声明。
_Avoid_: Harvest hook

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

**Public Event Presentation**:
从 **Public Event** 派生 transient 展示提示，包括 notification、highlight、resource animation、card pass animation 和 replay cue；只描述要展示什么，不处理 DOM 定位。
_Avoid_: 前端调用点各自解释 public event payload

**Private Event**:
只发给特定 viewer 的私有同步附加层，例如私有 prompt、手牌变化、draft 信息；不进入公共 replay 事件流。
_Avoid_: public event

**Action Log**:
`GameState.log` 是 UI 缓存，由 public events mapper 派生；规则代码不把它当事实来源。
_Avoid_: 业务代码直接写 log

**Workshop**:
自定义卡和 AI 卡牌设计区域，覆盖卡牌生成、LLM 服务、卡牌美术、工坊 PR 和自定义卡上传。
_Avoid_: 原版规则主路径

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

**Extra Turn（额外行动）**:
玩家普通工人耗尽后由卡牌贡献的一次额外放工机会；轮转不再提前跳过这类玩家。多张卡同时贡献时先进入 provider 级 `trigger-select`，选中某张卡后才展开该卡自己的额外行动 flow。skip / forced consume 按来源卡记录机会消耗，不用玩家级全局计数。对应 BGA `stLabor` 里 adoptive / Telegram / Work Permit 等并列的 supply-placement 选项。
_Avoid_: 连续放工（破坏交替）

**Forfeit（放弃额外行动）**:
玩家在额外行动选择窗口里选“不用”，退出本轮后续行动，避免轮转死循环；标记在每轮开始清空。
_Avoid_: 永久放弃、全局出局名单

## Relationships

- 一个 **Room** 持有一个 **GameSession**；一个 **GameSession** 持有并写入一个 **GameState**。
- 浏览器通过 **Services** 里的 `WsGameTransport` 发送 **ClientCommand**；**Connection** 层路由到 **GameSession**；**Broadcaster** 构造 **StateUpdateEnvelope** 并广播。
- **GameState** 描述游戏规则事实；**RoomPlayer** 描述连接席位；两者不要混用。
- **GameCore.buildInteraction** 从 **GameState**、**EngineStack**、当前 **Pending Envelope** 和 anytime policy 派生 **InteractionState**。
- **InteractionState** 是前端启用按钮和渲染交互的依据；前端不从规则代码推断可操作性。
- **ActionFlow** 编译成 runtime engine tree；`leaf` 变成 **ActionNode**，组合节点变成 sequence / parallel / or / xor runtime node。
- **EngineStack** 是 hook、anytime、喂食、动物整理、confirm、farm-select 等子流程的唯一嵌套机制。
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
- **Card Field** 在 Reap 时参与田地收获，但其副作用是否属于 Harvest 取决于触发上下文。
- 规则事实先写 **Public Event**，再派生 **Action Log**、notification、highlight、animation 和 replay。
- 私有手牌、私有 prompt 和 draft 选择通过 **Private Event** 或 viewer 过滤传输，不写入公共事件流。
- **Workshop** 生成或上传自定义卡；**Custom Code Sandbox** 校验、编译并隔离执行这些卡的 impl。
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
- “reap” 只是收作物动作，不等同于完整 **Harvest**。
- “snapshot” 是当前同步方式；不要假设存在增量 patch，除非架构文档明确变更。
- “log” 是 UI 缓存，不是规则事实来源；新增规则事实应先考虑 public event。
- “player” 可能指 **PlayerState**、`playerIndex`、`playerId`、**RoomPlayer** 或登录 user；跨层传参时必须明确。
- “可执行” 在不同层含义不同：行动入口可达性、支付可行性、pending option enabled、UI allowed command 都是不同判断。
- “前端可见” 不代表“规则允许”；前端显示应以服务端 **InteractionState** 和 `allowedCommands` 为准。
- “sandbox” 可能指浏览器内 `client/sandbox`，也可能指 server/custom-code 隔离执行；前者是调试 bundle，后者是自定义卡运行时隔离。
