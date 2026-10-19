# shared/domain/ — 领域聚合层

[English](domain.md) | [中文](domain_zh.md)

> 本文件是中文翻译镜像；[domain.md](domain.md) 是唯一权威版本。

派生视图与不变量检查放在这里。`PlayerState` 保持纯 JSON。玩家版图与农场查询（“这里能否犁地、播种或建造？”）经 `PlayerBoard`；其他领域谓词留在各自的聚合中，例如 `animal-zones.ts` 的 `canAccommodateAnimalTotals()`、`scoring-reserve.ts` 的 `canAddScoringReserve()` 与 `space.ts` 的 `canSpaceAcceptWorker()`。领域代码由主客户端、沙盒与服务端共用。

```text
shared/domain/
├── player-board.ts          PlayerBoard 与 playerBoard 工厂
├── farmyard.ts             农场规则校验与 normalizePlayerFarm
├── farmyard-interaction.ts farm-select 与 farm-position 的交互 payload 投影
├── farmyard-usage-core.ts  规范的已用 / 未用农场格
├── pasture.ts              派生的牧场面积、马厩数与基础容量
├── animal-zones.ts         动物区容量与容纳
├── animal-reorg.ts         动物重整自动补位
├── animal-payment.ts       动物支付顺序
├── animals.ts              动物模型
├── scoring.ts              计分与 PlayerScoreSummary
├── scoring-reserve.ts      终局 Scoring Reserve 的读取、汇总与计分副本扣减
├── farm.ts, field.ts, space.ts, farmyard-space-states.ts
└── index.ts
```

**PlayerBoard。** `PlayerBoard(player, state)` 暴露 `farmyard`（`canPlow`、`canSow`、`canBuildFence`、`canBuildRoom`、`canBuildStable` 等校验与查询）、`farmInteraction`（派生 `farm-select` / `farm-position` payload）与 `animals`（区域容量与容纳）。前端的农场草稿只消费服务端 payload。

**农场。**

- `farm-operations.ts` 将建房、建厩、犁地、围栏、牧场、地形、扩展、格子状态及作物方案提交到权威玩家状态。校验器只准备投影，由共同操作实际写入，包含移除厩和围栏。`FARM_LAYOUT_KEYS` 定义结构快照与写入边界；格子状态与扩展放置 helper 也经该 owner 提交，扩展初始地形和新增坐标为同一次操作。独立的 `FarmOperationResult` 捕获成功坐标及修改前后布局；新增已用格只包含操作前已存在的坐标。结果归属原行动宿主。游戏操作通过该宿主的事件 sink 为新增已用坐标发出 `farm.spacesUsed`；建局和恢复不派发反应。牧场转换续行可通过 `replacesTerrain` 携带原地形变化；操作将被替换坐标纳入临时已用基准，地形连续转牧场不会产生虚假的新增已用事实。独立的后续操作只读取当时几何。
- 已用 / 未用格只从 `farmyard-usage-core.ts` 读取，包含扩展、地形、封锁格与派生的牧场格；`farmyard-usage.ts` 与 `farm.ts` 只是兼容 facade。卡牌从不手动数格子。房间、地形、田地、马厩与牧场格始终计为已用；`farmyardSpaceStates` 中的条目只有带 `blocksPlacement` 时才计入。
- 牧场持久化身份、格子与动物安置。`getPastureSize()`、`getPastureStableCount()` 与 `getFencedStableCount()` 派生其余信息；`getPastureViews()` 返回独立视图；序列化的 `size` / `stables` 只用于展示，加载时剥离。
- 农场与行动格来源使用 source / type metadata：`FenceSegment.type/source`、`WorkerRef.synthetic`、`ActionSpace.blockedBy`、supply token helper、跨人数的行动格类别 helper、预留标记与附件。基础行动定义按 2–6 人过滤；5/6 人专属格单独建模。
- Farmers of the Moor 地形（[ADR 0007](../adr/0007-farmers-of-the-moor-variant-runtime.md)）是 `farmTerrain.kind` 的公开顶层，被覆盖的地形在 `covered`。`planTerrainOperation()` 无写入地验证整份有序选择；坐标、重复项、层、占用或相邻限制中任一非法项都会在选择状态变化前拒绝整批。selection leaf 与特殊行动都通过 `farm-operations.ts` 提交准备好的操作。`farm.terrainChanged` 记录可见层和覆盖层的前后变化及新生成的田；未来地形 token 复用 `futureMeeples` 条目。围起地形的相邻计算是纯 helper；一次性的相邻规则使用 `adjacencyPolicy` / `allowedTiles` / `fencePolicy`。只支持可见层与单层覆盖。整批拒绝、层身份、嵌套收据、恢复与撤销见 `server/__tests__/terrain-operation-session.test.ts`。
- Farmyard Extension 扩展共享几何；所有农场读取方都使用动态形状。

**动物。**

- 每个真实房间拥有容量为一的 Room Animal Holder（`house:<positionKey>`）；`PlayerState.houseAnimals` 是唯一可写的房间安置（[ADR 0026](../adr/0026-each-room-is-an-animal-holder.md)）。`roomAnimalZones` 是加载时剥离的展示投影。占用组与 `occupiedZoneLimit`（普通房间 holder 共享上限一）通过纯查询 `shared/contract/animal-zone-occupancy.ts` 约束房间与卡牌区域中被占用的 holder 数。
- 无围栏马厩按农场位置保存 `{ animalType, animalCount }`（[ADR 0029](../adr/0029-loose-stables-retain-animal-species-and-count.md)）；空马厩没有条目，但仍在 `stableTiles` 中。动物数量规则累加数量；占用格、存在性与不同物种规则保持各自语义。
- 每个“能否容纳”的问题都使用 `canAccommodateAnimalTotals()` 或 `canAccommodateAllAnimals()`，它们搜索合法的最终安置（允许之后的系统 `reorganize`），并遵守 `occupiedZoneLimit` 与必空组（`requiredEmptyZoneGroupIds`：每组至少一个被标记区域为空）。卡牌从不在局部测试单个区域。会永久降低 holder 容量的候选按支付后的容量过滤。
- `onComputeAnimalZones(player, zones, state)` 添加区域；`computePastureCapacityModifiers(player, state)` 按打出顺序先返回替换再返回叠加 modifier；`onComputeSharedAnimalZones()` 贡献 Hosted Card Animal Zone，存于卡牌 owner 的 `animalCountsByZone`，但按 `animalOwnerPlayerId`（繁殖时按 `breedingOwnerPlayerId`）结算。每个 holder 写入方都持久化 `cardId`、`ownerPlayerId` 与 `animalOwnerPlayerId`；改写与跨玩家扣减只触及当前 Animal Owner 的条目。`computeAnimalZones` 为缺少 `cardId` 的卡牌区域补上它。固定物种用 `allowedAnimalType`；`animalType` 只表示当前占用。
- 由农场位置承载的区域声明 `farmPosition`、`countsFarmyardSpaceAsUnused` 与 `displaySource: 'farm-position'`；客户端只在该位置渲染服务端提供的区域。
- `isHouseAnimalZone()` / `countHouseAnimals()` 包含标记了 `houseAnimalZone` 的区域；`blocksHouseAnimalZones` 会移除它们。
- 动物统计与消耗（`getAssignedAnimalsByType()`、`subtractAnimalsFromBoard()`）同时读写旧 holder 字段与 `animalCountsByZone`。支付顺序在 `animal-payment.ts`：先卡牌局部的 `consumeAnimalPayment()`，再农场与 holder，最后是标记 `capacityCounterKey` / `capacityLossOnPayment` 的计数型 holder。`animalPaymentPreference.prefer` 指定的具体卡牌计数器最先扣，并关闭计数型 holder 的回退。系统移除通过 `onAnimalRemoved()` 通知卡牌。
- 动物整理在修改前校验身份、物种、数量、混放、容量、库存、互斥上限与必空组；非法输入返回可恢复的 `log.reorganizeFail` 且不改变任何东西。省略的区域为空；少分配表示主动弃养。进入整理时，从停用或缩小的卡牌存储中移出的动物回到待安置状态，总数不减少。
- 动物重整自动补位（`prefillAnimalZones()`）固定合法的现有占用，尽量补入待安置动物，确认前不写入安置；`actionContext.prefill=false` 可关闭。
- 仅限农场动物的兑换（`CardExchange.fromFarmyard` / `Trade.fromFarmyard`）在兑换与有序喂食路径中都只能用当前已安置的动物支付；feed 请求发布已安置余额，同批喂食中刚获得的动物仍算未安置。
- 只有启用 Farmers of the Moor 时 `animalKeysForState()` 才加入马。繁殖与计分调整使用 `computeBreedableAnimalCount()` 与 `computeAnimalScoreAdjustment()`。
- 特殊马厩使用卡牌效果三件套 `getSpecialStablePositions`、`applySpecialStable` 与 `getBuiltSpecialStables`；核心马厩代码不导入任何卡牌。只有 `actionContext.farmHand === true`（农场扩建的建马厩 leaf）时才通过协议字段 `farmHandPositions` 提供它们。已建成的特殊马厩投影到 `SerializedPlayerState.specialStables`（rehydrate 时剥离）；没有卡牌接受的位置会让整批提交被可恢复地拒绝。

**计分。**

- `cardBonusVp` 是卡牌产生的非印刷分数的唯一类别，按 `cardId` / `cardType` 归因；卡牌自身的印刷分数留在 `cards`；公开卡牌标记可以计负分。每个奖励来源只进入该类别一次：通用计分已读取 `cardStates[cardId].counters.bonusVp`，因此把分数存进该计数器的卡牌不能再从 `computeBonusScore` 返回它们。旧的 `cardsBonus` / `cardStateBonusVp` / `cardBonus` 形状已删除。
- Scoring Reserve 是终局计分预留，不是支付，通过 `special-effect` 的 `record-scoring-reserve-bonus` 记录。`computeScores()` 在有费用奖励求解之前从计分副本中扣除每个已选预留，基于资源的大改良计分读取该副本，组合付不起时整组失效。

**大改良供应**（[ADR 0006](../adr/0006-stack-aware-major-improvement-supply.md)、[ADR 0016](../adr/0016-separate-supply-family-from-improvement-identity.md)）：变体模板生成真实卡牌 ID 的供应堆；版图只暴露每堆顶部。购买、归还与交换走供应 helper，生产读取使用供应查询 helper。升级身份使用 `*Identity` metadata，从不使用供应堆的 `familyId`。复制卡保留各自的具体 ID 作为来源与归因。底行规则使用 `isBottomRowMajorImprovement()` / `getAvailableBottomRowMajorImprovementIds()`。

测试：`shared/domain/__tests__/`、`shared/actions/__tests__/animals.test.ts`、`shared/actions/effects/__tests__/reorganize-engine.test.ts`。

