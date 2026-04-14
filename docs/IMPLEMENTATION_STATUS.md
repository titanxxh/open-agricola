# 实现状态

## 1. 架构总览

WebSocket 房间对局 + 后端权威状态 + 前端被动订阅渲染。

注：`A92_AdoptiveParents` 已从小改良归类修正为职业卡，当前应经由职业注册与职业手牌/已打出区路径参与流程。

| 层 | 目录 | 职责 |
|---|---|---|
| 共享领域 | `shared/` | 引擎、行动、效果、Hook、卡牌定义、状态模型、计分、i18n、协议类型 |
| 后端 | `server/` | GameSession（权威状态入口）、HTTP API、WS 房间管理、校验 |
| 前端 | `src/` | React UI、GameTransport（HTTP/WS）、状态订阅与渲染 |

详细架构设计见 `docs/ENGINE_ARCHITECTURE.md`。

## 2. 后端

### 2.1 GameSession

`server/game-session.ts` — 唯一可写入 `GameState` 的入口。

- 命令式方法：`takeAction`、`resolveChoice`、`commitFarmChoice`、`confirmAnimalReorg`、`confirmHarvestFeed`、`confirmNextPlayer`、`performRoundEnd`、`undoStep`、`undoAction`、`loadState`。
- 新增 `takeAnytimeAction`：对当前引擎根节点做 BGA 风格前插 flow，中断完成后回到原交互。
- Dev 方法：`startDevFenceSelect`。
- 构造函数支持可选 `seed` 参数，用于可复现测试。
- 内部维护 `history` 快照栈 + `actionStartIndex` 用于撤销。
- 所有方法返回 `SessionResponse`（state + pending + interaction + scores + 元数据）。
- `commitFarmChoice('fence')` 现在会把 `validateFenceSelection/applyFarmChoice` 计算出的 `newPastures/newEdges` 挂到本次 `ActionExecutionResult.extraData`，供 `immediatelyAfter/after` listener 直接消费。
- `commitFarmChoice('room'|'stable'|'plow'|'fence')` 现在统一先走服务端 payment 求解；若存在多种合法支付法，会继续进入 `prompt.selectPayment`，而不是在提交农场选择时默认取第一个可支付方案。
- 行动位开放性与 `takeAction()` 现在统一接入 `canUseOccupied` 判定，避免在主路径里为 `A28_ForestSchool`、`E21_SheepRug`、`B151_LittlePeasant` 这类卡牌硬编码占位例外。

### 2.2 WS 房间管理

`server/room-manager.ts` — WebSocket 主链路。

- 每个房间持有独立 `GameSession` 实例。
- 支持 `ClientCommand`（共享类型）：`action`、`choice`、`anytime`、`reorg`、`feed`、`commitFarm`、`nextPlayer`、`roundEnd`、`undoStep`、`undoAction`、`newGame`（可选 seed）、`loadGame`、`devDrawCard`、`devPlayCard`、`devCreatePasture`、`getState`、`createRoom`、`joinRoom`。
- 状态变更后广播 `StateUpdateEnvelope`（含 version + cause）给房间内所有客户端。
- 连接断开时清理玩家；非固定房间在无人连接后会先保留在内存与 SQLite 中，允许分享链接后的短时断线/刷新重连，并由空房 TTL 统一回收。
- **固定持久化房间（dev）**：房间 ID 由 `PERSISTENT_ROOM_ID` 指定，默认 `dev`。后端启动时会先按 `PERSIST_ROOMS` 恢复该房间状态；当前代码默认使用 SQLite（`data/open-agricola.db` 的 `rooms.state_json`），若显式设为 `json` 则读写 `PERSISTED_ROOMS_DIR/<roomId>.json`（默认 `output/dev.json`）。固定房间仍兼容回退读取旧 `.persisted-room.json`。每次该房间状态变更后都会立即持久化；该房间在无人连接时也不销毁，便于重启后端后继续对局。固定房间的 WS 加入支持 `requestedPlayerIndex`，前端会把 `player=p1/p2` 固定映射到 0/1 号位，刷新重连时会替换旧连接而不是误占另一个空位。文档中的访问示例统一写作 `http://<host>:5173/...`；同机本地调试时 `<host>` 可视为 `localhost`，局域网场景请使用 `./restart-intranet.sh` 输出的地址。
- `./restart-intranet.sh` 现在使用当前仓库下的绝对路径 `node_modules/.bin/tsx` / `vite` 启动服务，并按同样的绝对路径精确停止旧进程，避免误杀别的 clone / worktree 中的 Vite 或后端进程。
- SQLite 房间恢复现在覆盖 `waiting` 与 `playing` 两种状态；等待中的房间在后端重启后也会回到内存，避免分享链接后出现 `room not found`。房间关联的 `custom_card_ids` 会随房间一起持久化，`newGame` 重开时也会继续带上这些自定义卡。

### 2.3 HTTP API

`server/game-router.ts` — 开发/调试/兼容通道。

- 端点：`/api/game/state`、`/api/game/action`、`/api/game/choice`、`/api/game/anytime`、`/api/game/commit-farm`、`/api/game/reorg`、`/api/game/feed`、`/api/game/next-player`、`/api/game/round-end`、`/api/game/undo`、`/api/game/undo-action`、`/api/game/new`（支持 seed）、`/api/game/load`、`/api/game/validate`（纯预检，主链已不依赖）。
- Dev 端点：`/api/game/dev/create-pasture`、`/api/game/dev/play-card`、`/api/game/dev/draw-card`、`/api/game/dev/set-space-taken`、`/api/game/dev/set-current-player`、`/api/game/dev/set-round`、`/api/game/dev/set-resources`。
- `/api/rooms` — 列出当前活跃房间。
- HTTP 使用“按用户分桶”的 `GameSession`（未登录时回退到匿名 session），仅用于单机调试/测试准备。多人对局走 WS；WS 房间内的开发者工具摸牌/打牌也直接走房间级命令，不再先改 HTTP session 再 `loadGame` 回房间。
- `/api/game/new-sandbox` 现在会创建单浏览器 hot-seat 沙盒局，支持 `playerCount`、`deckIds`、`customCardIds`，并使用固定 `playerA/playerB/...` 命名，而不是沿用登录名或 WS 房间座位语义。

### 2.4 Workshop / Sandbox / 自定义代码

- `server/workshop.ts` 的 `/api/workshop/sandbox` 现在返回两部分数据：`cards` + `settings`。其中 `settings` 持久化保存沙盒玩家人数与默认牌组（A/B/C/D/E）。
- Workshop 前端已改成“进入我的沙盒后统一开始”的 hot-seat 入口；`Reset Sandbox` 会一次性提交卡牌列表与配置，而不是逐张增删同步。
- 代码模式仍保留，但保存时会先通过隔离执行器校验/编译/抽取 `code_manifest`，主后端不再依赖把玩家代码写成 `.ts` 后动态 `import()` 执行。
- 运行时的自定义 `effect_code` 会注册为代理 hook / listener；真正的代码执行发生在 sidecar `custom-code-executor` 中，主后端只接收可序列化的 `ActionFlow` / `ActionHookResult` 结果。

### 2.5 共享协议

| 文件 | 内容 |
|---|---|
| `shared/protocol/game.ts` | `GameSyncPayload`、`StateUpdateCause`、`StateUpdateEnvelope`、`interaction` 快照 |
| `shared/protocol/ws.ts` | `ClientCommand`、`ServerEvent`、`RoomSummary` |
| `shared/game/serialization.ts` | `serializeState` / `rehydrateState` — 去函数序列化 |
| `shared/game/types.ts` | `GameState`、`PlayerState`、`ActionSpace`、`PendingAction`、`InteractionState`、`Resource` |

### 2.6 校验

独立校验模块：`server/validators.ts`、`server/fence-validation.ts`、`server/plow-validation.ts`、`server/sow-validation.ts`。打断了 index↔game-router 循环依赖。

其中 `server/fence-validation.ts` 现已额外产出本次围栏新增的 `newPastures` / `newEdges` delta；`server/farm-choice.ts` 与 `GameSession.commitFarmChoice()` 会把这组 delta 继续透传到引擎 result context，避免 `A83_ShepherdsCrook` 这类卡牌再手写累计 pasture 状态。

## 3. 前端

### 3.1 Transport 抽象

`src/services/gameTransport.ts` — 定义 `GameTransport` 接口。

| 实现 | 说明 |
|---|---|
| `HttpGameTransport` | 每次 HTTP 响应后通过 `onSnapshot` 回调通知 |
| `WsGameTransport` | WebSocket 长连接，接收服务端广播的 `StateUpdateEnvelope` |

WS 模式通过 URL 参数 `?transport=ws` 启用。

### 3.2 状态管理

- `useGameSync` — 持有 `state`、`pending`、`interaction`、`historyLength`、`hasActionStartSnapshot`。通过 `applySnapshot(GameSyncPayload)` 统一消费快照。
- `GameContainerApi` — 主容器。通过 `useTransportSetup` 管理 WS 连接生命周期（创建/加入房间、等待对手、就绪）。所有操作（含 dev 操作）均通过 `transport` 发出，不直接调用 HTTP；农场交互和 anytime 按服务端 `interaction` 渲染。

### 3.3 UI 组件

- `ActionBoard` — 完全还原 BGA 行动区。不论几人局始终显示全部 4 人局行动位（含左侧 6 个特殊行动）。卡牌采用 BGA 3 段式框架（header/desc/footer 分别切片 `action_frame.png`/`action_frame_s.png`）。使用 BGA 字体 Dominican + CalibriB。累积类行动卡体内显示每回合获取量（数字 + 资源图标 `.gain-display`），非累积行动显示文字描述。箭头通过 `action_frame_arrow.png` 伪元素显示方向（left/right/bottom），累积资源以 `.resource-holder` 显示在卡片外部，带橙色数量徽章。Round 行动 hover 显示 `actions.jpg` 大图 tooltip。侧边栏使用 `add_2p.png` 背景。14 个收获标记。ResizeObserver 响应式缩放。
- `FarmBoard` — 田地播种改为图标化交互：田内作物用堆叠 seed icon 显示，`sow` 选择器改为 grain / vegetable 图标按钮；收获喂养阶段若存在可转换资源，会自动弹出 exchange center 浮层并提交实际转换结果。
- Harvest log — 服务端在 `GameSession` 中权威记录 `reap / feed / breed` 三阶段日志，包括玩家收获、喂养转换、begging 与繁殖明细；顺序按起始玩家开始推进。
- `FarmBoard` — 农场格网、围栏、播种、马厩交互；可选格/边由服务端 `interaction.farm` 下发。
- `ResourceLine` — BGA meeple sprite 资源图标（`res-icon-*`）+ 数量。
- `LogPanel` — 结构化日志，卡牌引用显示 hover tooltip（名称 + 描述）。
- `GameControls` — 撤销/计分/Reset，seed 输入与 Reset 仅在 devMode 显示。
- `PlayerCard` — 卡牌渲染，BGA sprite 背景。Category 图标带中英文 tooltip、passing 卡标识。
- `GameHeader` — 回合/玩家信息。显示"轮到你了"/"等待对方"状态徽章，玩家身份标识，回合进度（N/14）。my-turn 时绿色高亮，not-my-turn 时 action 区域变暗并禁用交互。

## 4. 游戏引擎

### 4.1 Flow 节点树

| 节点 | 语义 |
|---|---|
| `leaf` | 单个效果（支持 `params` 传参给 action） |
| `seq` | 顺序执行 |
| `parallel` | 全部子节点 |
| `or` | 多选一（玩家选择） |
| `xor` | 条件互斥 |
| `optional` | 可跳过 |
| `activateCard` | 卡牌效果执行节点（ActivateCardNode） |

### 4.2 Hook 系统

9 个行动相位：`before`、`during`、`immediatelyAfter`、`after`、`computeCosts`、`computeArgs`、`computeReplace`（含 decline 替换）、`isDoable`、`canUseOccupied`。卡牌购买费用折扣统一通过 `computeCosts` 阶段实现（以 `actions` 字段区分目标）。

### 4.2.1 BGA 风格交互协议

- `GameSyncPayload` 现在同时广播 `pending` 与 `interaction`。
- `interaction` 是前端主消费对象，包含 `stateId`、`allowedCommands`、`anytimeActions`、以及 `farmSelect` 的 `selectableTiles/selectableEdges/selectableFields` 白名单。
- `pending` 仍保留，用于兼容旧测试、undo 历史与逐步迁移。
- `takeAction` 在存在未完成交互时会被协议层拒绝；只有 `allowedCommands` 与显式 `anytime` 能继续推进。
- `takeAnytimeAction` 通过 `Engine.prependFlow()` 把 flow 插到当前未完成节点之前，执行完成后自然回到原交互。
- 阶段型 `card-effects` 现已可复用同一套 `Engine` / `pending` / `interaction` 协议推进；`GameSession` 为阶段 flow 维护 resume cursor，使 `onBeforeHarvest`、`onAfterReap`、`onHarvest`、`onEndHarvest`、`onAfterHarvest`、`onBeforeStartOfTurn` 都可以像普通行动 flow 一样暂停与恢复。

行动格可执行性与 flow 推导已部分统一：顶层 `or` / `xor` 行动格，以及一批“顶层语义等于必选 child”的安全 `seq` 行动格，现在可以递归读取 `flow.children` 的原子行动 `isDoable` 结果，并继续应用子行动自己的 `isDoable` hook / CardListener，避免像 `grain-utilization`、`cultivation`、`farm-expansion`、`farmland`、`major-improvement` 这类行动格维护两套手写条件。

22 个阶段性 CardEffect Hook：`onBuy`、`onRoundStart`、`onHarvest`、`onRoundEnd`、`onReturnHome`、`onBeforeReturnHome`、`onStartReturnHome`、`onAfterRoundEnd`、`onBeforeHarvest`、`onStartHarvest`、`onStartHarvestFieldPhase`、`onHarvestFieldPhase`、`onEndHarvestFieldPhase`、`onAfterReap`、`onStartHarvestFeedingPhase`、`onHarvestFeedingPhase`、`onEndHarvestFeedingPhase`、`onBeforeFeed`、`onAfterFeed`、`onEndHarvest`、`onAfterHarvest`、`onBeforeStartOfTurn`。

ActivateCardNode 架构：CardListener 在引擎 pipeline 中匹配后创建引擎节点，延迟执行 handler。handler 返回的 flow 通过 buildFlowNode 插入引擎树继续执行。

卡牌糖衣层最近补了几组公共抽象，减少单卡重复流程代码：

- `shared/cards/helpers/pay-gain-node.ts`：`payGainFlow`、`payThenGainFlow`、`payThenActionFlow`、`returnToSpaceThenGainFlow`
- `shared/cards/helpers/stage-effects.ts`：统一阶段型标记、即时支付、bonus VP 与收获兑换
- `shared/cards/helpers/card-state.ts`、`round-placement.ts`：统一一次性卡牌标记与“本轮放人顺序”这类时序状态
- `shared/cards/helpers/action-snapshot.ts`：统一记录单次行动起点快照，供 `A74_StableTree` 这类“同一行动前后”卡复用
- `shared/actions/effects/mark-card-trigger.ts`：把阶段型触发计数收敛成可复用内部 action
- `shared/actions/effects/return-first-worker-home.ts`：支持通过分支 leaf 直接表达 BGA 风格“收回第一个工人”效果
- `flow` 叶子节点支持自定义 choice label：可直接表达 `xor/or` 分支文案，减少把卡牌选择额外包成 `card-choice`

252 个 A/B/C/D/E 牌文件，71 张已实现 hook 注册。详见 `docs/cards_impl.md` 和 `docs/card_progress.md`。

### 4.3 支付系统

- `ComplexCost`：fee / fees / trades / bonuses / cards。
- `computeAllBuyableCombinations`：穷举可用支付方案 + Pareto 过滤。
- LRU 缓存加速重复查询（复杂场景 100x+ 提升）。
- `prompt.selectPayment`：统一支付选项协议；涉及返还/使用卡牌的方案会优先展示可读卡名，而不是直接暴露内部 card id。
- `typed flat` 直付路径会先尝试同类型 `TradeModifier` 的等价抵扣，再回退原始 `baseCost`；因此 `payTypedFlatCost` 与 `computeAllBuyableCombinations` 在 A88 这类空 `from` trade 上保持一致。
- 小改良/行动卡出牌前提：`minor-improvement` / `improvement-any` 已接入统一 prerequisite 校验；当前覆盖结构化的 `occupationPrerequisites` / `improvementPrerequisites`，以及常见文本前提如 `2 Fields`、`2 Major Improvements`、`Cooking Improvement`、`1 Baking Improvement`。
- 改良日志：`log.playImprovement` / `log.playMinorImprovement` 现统一携带支付资源与返还卡牌；像 `C60_SmallPottersOven` 这类 `onBuy` 立即得资源效果，会额外产出独立的 `log.cardEffectGain`。当前实现卡牌中已无遗留 `reward:` 字段用法。
- 翻修成本已对齐 BGA：木屋/泥屋翻修分别为“每房间 1 Clay/Stone + 一次性 1 Reed”，`house-redevelopment` 可用性也按该规则判定。
- 工作阶段建材统计已下沉到通用资源获得动作；`A53_Claypipe` 现可回溯“本回合先获得建材、后打出卡牌”的 BGA 语义，并在回家阶段统一结算。
- `CostModifier` 系统：`TradeModifier` / `BonusModifier`，30+ 卡牌注册了支付修改器。

## 5. 测试

### 5.1 单元测试

vitest；当前仓库内 `*.test.ts` 约 84 个文件，642+ 用例。

| 类别 | 文件 |
|---|---|
| 协议 | `tests/serialization.test.ts`、`tests/protocol-types.test.ts` |
| 会话契约 | `tests/game-session-contract.test.ts` |
| 状态管线 | `tests/game-sync-pipeline.test.ts` |
| Pending/Undo 回归 | `tests/pending-undo-regression.test.ts` |
| 支付系统 | `shared/actions/effects/__tests__/pay.test.ts`、`tests/pay-dp.test.ts`、`shared/actions/effects/__tests__/exchange.test.ts` |
| 引擎 Pipeline | `shared/engine/__tests__/engine-pipeline.test.ts` |
| Hook 分发 | `shared/engine/__tests__/hook-dispatch.test.ts` |
| Stub 卡牌 Hook 矩阵 | `shared/cards/__stubs__/__tests__/hook-coverage-matrix.test.ts` |
| Stub 新阶段 Hook | `shared/cards/__stubs__/__tests__/new-hooks.test.ts` |
| PayGainVp 机制 | `shared/cards/__stubs__/__tests__/pay-gain-vp.test.ts` |
| OnRoundEnd 机制 | `shared/cards/__stubs__/__tests__/on-round-end.test.ts` |
| 卡牌效果（批次 1-3） | `shared/cards/__tests__/batch1-cards.test.ts` 等 |
| C52/C75 卡牌 | `shared/cards/__tests__/C52_HuntsmansHat.test.ts`、`C75_Firewood.test.ts` |
| A37 Bucksaw | `shared/cards/__tests__/A37_Bucksaw.test.ts` |
| 阶段 hook flow 回归 | `server/__tests__/stage-hook-flow.test.ts` |
| A17/D150 时序卡回归 | `server/__tests__/card-flow-regressions.test.ts` |

### 5.2 E2E 测试

Playwright，`playwright.config.ts`（testDir `./e2e-tests`）。

- `ws-dual-player.spec.ts` — WS 双人对局：房间创建/加入、P1 行动→P2 同步、换人、P2 行动→P1 同步、undo。
- 其他 E2E：`round-end-flow.spec.ts`、卡牌效果 E2E。

```bash
npm test       # 单元测试
npm run test:e2e  # E2E 测试
```

## 6. 已删除的遗留代码

| 文件 | 原因 |
|---|---|
| `src/app/GameContainer.tsx` | 被 `GameContainerApi` 替代 |
| `src/hooks/useGameState.ts` | 仅被 `GameContainer` 引用 |
| `src/app/hooks/use-persistence.ts` | 无引用 |
| `src/hooks/useRoomConnection.ts` | 连接逻辑内联到 `GameContainerApi` |
| `src/hooks/useActionEngine.ts` | 引擎逻辑已迁至后端 `GameSession` |
| `src/hooks/useGameApi.ts` | HTTP 调用已由 `HttpGameTransport` 承担 |
| `src/app/hooks/use-engine-flow.ts` (runEngineStepsCore) | 前端引擎镜像代码，违反架构原则，已删除 |
| `src/app/__tests__/use-engine-flow.test.ts` | 前端镜像测试，已删除 |

## 7. 已知边界

- 252 个 A/B/C/D/E 牌文件中，当前有 69 张已接入 hook；仍有部分卡牌仅完成数据接入，复杂行为待补全。
- Modifier 系统已激活：`activeModifiers` 用于 improvement 支付路径；construct/fence 通过 `computeCosts` + `costOverride` 接入成本修改。`A88_HedgeKeeper` 使用与 BGA 一致的「空 `from` + `to: { wood: 1 }` + `max: 3`」`TradeModifier` 模拟围栏免木段数，而非单笔 `bonus` −3 Wood。
- PlayerSwitchNode 已实现：opponent 卡牌触发的玩家切换，前后插入 `PlayerSwitchNode`，含 `confirmPlayerSwitch` pending 和 undo boundary。
- D150_GodlySpouse（收回工人）和 E130_Overachiever（computeCosts 折扣）均已实现。
- 断线重连未实现（WS 断开后需刷新页面重连）。
- BGA sprite 图片依赖 `../bga-agricola/img` 目录，缺失时降级为纯色/文字。
- `npm run build` 存在测试文件的 TypeScript 严格模式报错，不影响 dev 模式。
