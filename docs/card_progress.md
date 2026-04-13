# 卡牌实现进度追踪

基于 BGA 参考项目 (`../bga-agricola`) 的完整对比。

## 总览

| | BGA 总数 | 有文件 | 已实现 Hook | 仅数据定义 | 无文件 | 5+人卡(BGA未实现) |
|---|---|---|---|---|---|---|
| A Deck | 180 | 68 | 36 | 32 | 112 | 12 |
| B Deck | 180 | 41 | 17 | 24 | 139 | 12 |
| C Deck | 182 | 55 | 23 | 32 | 127 | 12 |
| D Deck | 181 | 64 | 28 | 36 | 117 | 12 |
| E Deck | 169 | 66 | 28 | 38 | 103 | 0 |
| **总计** | **892** | **294** | **132** | **162** | **598** | **48** |

> Major Improvements (10张) 已全部实现，不计入上表。
> 截至 2026-04-13 更新。

## 状态说明

- ✅ 已实现 — `registerCardEffect` / `registerCardListener` 已注册，核心逻辑可运行
- 🔧 仅数据 — 有 `.ts` 文件（名称/描述/费用/VP），但未实现 BGA 逻辑
- ❌ 无文件 — BGA 有此卡但我们尚无 `.ts` 文件
- ⬜ BGA未实现 — BGA 自身也标记为 `implemented=false`（5+人卡，A169-180, B169-180, C169-180, D169-180）

---

## 缺失基础设施分析

### ✅ 1. PlayerActionCard 行动格 — 已完成

**现状**: `player-action-space.ts` 注册机制 + `syncDynamicActionSpaces()` + 前端 ActionBoard 渲染均已实现。11 张 PlayerActionCard 已全部注册（A39, B42, C104, C162, D23, D51, D116, D127, E81, E161, B100）。包含 owner 显示、meeple 渲染、multi-select UI (C104)。

### ✅ 2. 动物容量修改器 — 已完成

**现状**: `onComputeAnimalZones` hook 已在 `card-effects.ts` 中定义，`computeAnimalZones()` 在 `animals.ts` 中统一调用。A12_DrinkingTrough 已实现（+2 per pasture）。

**仍需实现的卡牌**: A86_AnimalTamer, E11_PettingZoo, E12_AnimalBedding, E86_PenBuilder — 只需编写 `onComputeAnimalZones` handler，基础设施已就绪。

### ✅ 3. 烹饪/交换改良注册 — 已完成

**现状**: `CardExchange` 类型 + `exchange-registry.ts` 已实现。卡牌通过 `exchanges` 属性声明兑换比率，`getPlayerBakeRates()` 动态收集。E63_IronOven、E64_SimpleOven 已接入。

**仍需实现的卡牌**: A60_OrientalFireplace, B80_HardPorcelain 及其他 ~10 张 BGA 有 `getExchanges()` 的卡 — 只需添加 `exchanges` 属性。

### ✅ 4. computeBonusScore 计分卡 — 已完成

**现状**: 45 张卡已实现 `computeBonusScore` hook，含 `computePostScore` 用于需要完整计分结果的卡牌。`ScoringContext.reserved` 支持资源去重。

### 🔧 5. Anytime 动作系统 — 未实现

**现状**: `bake-bread` 和 `anytime-reorg` 已硬编码，但卡牌级别的自定义 anytime action 尚未支持。BGA 中 43 张卡使用 `isAnytime()` 机制。

**BGA 阻塞卡牌**: A48, A71, A102, A153, B21, B35, B69, B83, B154, B157, C18, C46, C53, C57, C64, C69, C84, C85, C87, C94, C101, C115, C120, C143, C150, D13, D46, D56, D71, D87, D106, D114, D122, D124, D129, E13, E14, E27, E53, E85, E86, E91, E103

**复杂度**: 高 — 需要卡牌注册自定义 anytime action + UI 动态展示 + engine 支持 anytime flow 插入。

### 🔧 6. Holder Card 资源堆叠 — 未实现

**现状**: 部分卡牌用 `cardStates[cardId].extraData` 手动管理存储资源。BGA 有统一的 `getNextResource()`/`addResource()` 机制，17 张卡使用。

**BGA 阻塞卡牌**: A40, A102, A144, B21, B48, B55, B83, B137, C75, C81, C115, C120, D118, E40, E56, E103, E162

**复杂度**: 中等 — 需要统一的 card holder 存储模型（`cardStates` 中增加 `resources` 字段 + 自动累积/消费方法）。

### 🔧 7. 未来回合放置 (futureMeeples) — 部分实现

**现状**: A74_StableTree 使用 `place-future-meeples` action。BGA 中 75 张卡涉及 futureMeeple 放置（大部分是 round-card 资源追加类卡牌 A43-A47, B43-B47 等）。

**BGA 阻塞卡牌 (代表性)**: A43-A47, A69, B41, B43-B47, B60, B65, B66, B74, B76, B78, C43-C47, C64, C65, C74, C77-C79, D40-D47, D57, D67, D69, D78, E41-E47, E56, E104, E108, E119, E120, E139

**复杂度**: 复杂 — 需要扩展回合卡资源累积机制，允许卡牌在指定未来行动格上放置自定义资源。A74 仅为简单案例。

### 🔧 8. 对手交互机制 — 部分实现

**现状**: `card-listeners.ts` 已支持 `scope: 'opponent' | 'any'`，Engine 已有 `PlayerSwitchNode`。已实现 C144_ReedRoofRenovator（被动收益）和 A128_RiparianBuilder（授予行动）两张对手交互卡。BGA 中 52 张卡有对手交互。

**交互模式分类** (绝大多数不需要对手做选择):

| 模式 | 描述 | 对手决策 | 复杂度 | 约占比 |
|------|------|---------|--------|-------|
| 被动收益 | 对手执行某动作 → 卡主自动获资源 | 无 | 简单 | ~60% |
| 卡主可选 | 对手执行某动作 → 卡主决定是否触发效果 | 无（卡主选） | 简单 | ~15% |
| 授予行动 | 对手执行某动作 → 卡主获得额外行动机会 | 无（卡主选） | 中等 | ~15% |
| 强制支付 | 对手使用某行动格前必须支付资源给卡主 | 自动支付 | 中等 | ~5% |
| 元效果 | 对手行动后卡主获得使用同一行动格的权利 | 无（卡主选） | 复杂 | 仅 C150 |

**代表性卡牌**:
- 被动收益: C141_SheepProvider, D139_Chairman, E66_BarnShed, D134_OysterEater
- 卡主可选: A132_Publican, A156_Buyer
- 授予行动: A150_Stagehand, E95_Miller, A128_RiparianBuilder(✅), C144_ReedRoofRenovator(✅)
- 强制支付: C51_FishingNet
- 元效果: C150_ParrotBreeder

**复杂度**: 简单-中等 — 后端 `scope:'opponent'` + `PlayerSwitchNode` 已就绪，~90% 的卡只需写一个 opponent-scope listener（参考 C144/A128 模式），不需要对手做选择。

### 🔧 9. 交换卡未实现 — 需要数据补充

**现状**: BGA 中有 `getExchanges()` 方法但我们尚未创建文件的卡牌。

**缺失卡牌**: A61_WinnowingFan, B80_HardPorcelain, B101_FurnitureCarpenter, B104_SheepWalker, C50_StableYard, C62_CookeryExtension, C139_BasketmakersWife, D62_BeerTap, D82_HuntingTrophy, D162_ClayFirer

**复杂度**: 简单 — 创建文件 + 添加 `exchanges` 属性即可。

---

## 分批实现建议

### ✅ 第一批：纯计分卡 — 已完成

45 张卡已实现 `computeBonusScore` / `computePostScore` hook。

### ✅ 第二批：简单 onBuy / 阶段触发 — 大部分完成

已实现的代表性卡牌：A22, A23, A58, B48, B65, C24, D22, A85, A127, B55, A119, A148, B149 等。剩余简单阶段触发卡可直接实现。

### 第三批：行动触发 (listener) — 持续进行

约 100+ 张卡，需要 `registerCardListener` + 各种行动 phase hook。已实现 56 张 listener 卡。

剩余按行动类型分组：
- **Plow 犁地**: A71, A72, C18, C19, D20 等
- **Sow 播种**: A106, C115 等
- **Fencing 围栏**: A89, C85, E16 等
- **Collect 收取**: A70, B81, C57, D66 等
- **Improvement 改良**: A40, B86, C87, D26 等
- **Construct 建造**: A82, B21, D36 等
- **Renovation 翻新**: A87, B19, C27 等
- **Occupation 出牌**: A92, B23, C29, D27 等

### 第四批：需要新基础设施

| 基础设施 | 状态 | 阻塞卡牌 |
|----------|------|----------|
| Anytime 动作系统 | ❌ 未实现 | 43 张卡（见§5） |
| Holder Card 资源堆叠 | ❌ 未实现 | 17 张卡（见§6） |
| 未来回合放置 | 🔧 部分 | 75 张卡（见§7） |
| 交换卡数据补充 | 🔧 部分 | 10 张卡（见§9） |

### 第五批：对手交互卡

52 张卡，需要前端交互流（对手收到提示→选择→确认）。后端 `scope:'opponent'` + `PlayerSwitchNode` 已就绪。

代表性：A50, A128, A132, A142, A150, A154, A156, A158-A160, B27, B79, C48, C51, C141-C153, D14, D134, D139, E66, E95, E148, E154, E156, E160 等

### 第六批：5+人卡 (低优先级)

48 张 BGA 自身未实现的卡（`implemented=false`），分布在 A169-180、B169-180、C169-180、D169-180。可最后处理或跳过。

---

## A Deck 详细状态 (36✅ / 180)

A Deck: 小改良 1-80, 职业 81-168, 5+人 169-180

### ✅ 已实现 (25)

| 卡牌ID | 名称 | 类型 | 实现的 Hooks |
|--------|------|------|-------------|
| A17 | ReclamationPlow | 小改良 | listener(after:Collect), before:Collect — 收取后 xor flow 决定是否犁地 |
| A28 | ForestSchool | 小改良 | listener(computeArgs), canUseOccupied, effect — 森林行动格可使用已占用格 |
| A29 | AleBenches | 小改良 | effect, onReturnHome — 回家阶段获食物 |
| A37 | Bucksaw | 小改良 | listener(after:Renovation) — 翻新后支付得收益 |
| A53 | Claypipe | 小改良 | effect, onBuy, onReturnHome — 支持回溯建材，回家阶段结算 |
| A55 | JunkRoom | 小改良 | listener(during/after:Improvement) — 打改良时获食物 |
| A64 | BarleyMill | 小改良 | effect — 烘焙增强 |
| A65 | SeedPellets | 小改良 | listener(before:Sow), isDoable, effect — 播种前获谷物 |
| A74 | StableTree | 小改良 | listener(after:Stables), effect, onBuy — 建马厩后排入 future meeples |
| A79 | GardenHoe | 小改良 | listener(after:Sow) — 播种后有蔬菜田则获黏土+石头 |
| A81 | InterimStorage | 小改良 | listener(before), effect, onRoundStart — 回合开始存储 |
| A83 | ShepherdsCrook | 小改良 | listener(immediatelyAfter/after:Fencing) — 围栏后得羊 |
| A84 | Silage | 小改良 | effect, onReturnHome — 回家阶段效果 |
| A88 | HedgeKeeper | 职业 | (注：用户提供数据标记为✅但脚本显示无hook，待核实) |
| A94 | LazySowman | 职业 | listener(computeArgs/computeReplace), isDoable, effect, onPlay — 简化播种 |
| A97 | Freshman | 职业 | listener(after/computeReplace), isDoable, onPlay — 替换行动效果 |
| A105 | BarrowPusher | 职业 | listener(after:Plow), onPlay — 犁地后效果 |
| A108 | MushroomCollector | 职业 | listener(immediatelyAfter/after:Collect), onPlay — 收取后交换 |
| A109 | SmallTrader | 职业 | listener(after:Improvement), onPlay — 打改良后效果 |
| A110 | Roughcaster | 职业 | listener(after:Construct/Renovation), onPlay — 建造/翻新后 |
| A112 | ScytheWorker | 职业 | effect, onBuy, onHarvest, onPlay — 收获阶段效果 |
| A126 | MasterWorkman | 职业 | listener(before:PlaceFarmer), isDoable — 1-4轮行动格放人前获资源 |
| A128 | RiparianBuilder | 职业 | listener(after/computeCosts) — 建造费用修改 |
| A136 | DrudgeryReeve | 职业 | computeBonusScore, before, effect, onBuy, onPlay — 预留资源计分 |
| A144 | Sequestrator | 职业 | listener(after), effect, onBuy, onPlay — 行动后效果 |
| A166 | Haydryer | 职业 | effect, onPlay — 收获前效果 |

### 🔧 仅数据定义 (34)

| 卡牌ID | 名称 | 类型 | BGA 逻辑 | 备注 |
|--------|------|------|---------|------|
| A1 | Shelter | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| A2 | ShiftingCultivation | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| A3 | PaperKnife | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| A4 | Baseboards | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| A5 | ClayEmbankment | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| A6 | StorageBarn | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| A7 | GardenersKnife | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| A8 | FoodBasket | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| A9 | YoungAnimalMarket | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| A10 | WoodenShed | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| A14 | CarpentersHammer | 小改良 | BGA: listener after Construct | 建造后效果，中等 |
| A22 | Telegram | 小改良 | BGA: onBuy | 购买时效果，简单 |
| A23 | StoneCompany | 小改良 | BGA: onBuy | 购买时效果，简单 |
| A39 | Chapel | 职业 | BGA: PlayerActionCard | 需要 PlayerActionCard 基础设施 |
| A40 | PottersYard | 小改良 | BGA: listener after Improvement | 打改良后效果，中等 |
| A41 | VegetableSlicer | 小改良 | BGA: listener | 中等 |
| A58 | AsparagusKnife | 小改良 | BGA: onBuy + effect | 购买时效果，简单 |
| A70 | LiftingMachine | 小改良 | BGA: listener after Collect | 收取后效果，中等 |
| A71 | ClearingSpade | 小改良 | BGA: listener after Plow | 犁地后效果，中等 |
| A72 | CalciumFertilizers | 小改良 | BGA: listener after Plow | 犁地后效果，中等 |
| A82 | WorkCertificate | 职业 | BGA: listener after Construct | 建造后效果，中等 |
| A85 | Homekeeper | 职业 | BGA: onReturnHome | 回家阶段，简单 |
| A87 | Conservator | 职业 | BGA: listener after Renovation | 翻新后，中等 |
| A89 | StablePlanner | 职业 | BGA: listener after Fencing | 围栏后，中等 |
| A92 | AdoptiveParents | 职业 | BGA: listener after GrowFamily | 生育后，中等 |
| A106 | SlurrySpreader | 小改良 | BGA: listener after Sow | 播种后效果，中等 |
| A119 | FirewoodCollector | 职业 | BGA: onRoundStart | 回合开始，简单 |
| A123 | FrameBuilder | 职业 | BGA: listener after Construct | 建造后，中等 |
| A127 | Lodger | 职业 | BGA: onRoundStart | 回合开始获食物，简单 |
| A137 | RiverineShepherd | 职业 | BGA: listener | 中等 |
| A148 | Woolgrower | 职业 | BGA: onHarvest | 收获阶段，简单 |
| A162 | ForestTallyman | 职业 | BGA: computeBonusScore + listener | 计分+行动触发，中等 |
| A165 | PigBreeder | 职业 | BGA: listener | 中等 |
| (A88) | HedgeKeeper | 职业 | BGA: listener after Fencing | 已标记✅但hook存疑，待核实 |

### ❌ 无文件但 BGA 有逻辑 (代表性)

以下列出 BGA 中有 listener/score/activate 方法的卡牌（不含纯数据和 5+人卡）：

| 卡牌ID | 名称 | 类型 | BGA 逻辑 | 复杂度 |
|--------|------|------|---------|--------|
| A11 | Turnwrest Plow | 小改良 | listener after Plow | 简单 |
| A12 | Drinking Trough | 小改良 | animal capacity modifier | 中等(需基础设施) |
| A13 | Landing Net | 小改良 | listener after Collect | 简单 |
| A15 | Spindle | 小改良 | listener | 简单 |
| A16 | Grain Cart | 小改良 | listener after Collect | 简单 |
| A18 | Bucket | 小改良 | effect | 简单 |
| A19 | Brewery | 小改良 | cooking exchange | 中等(需基础设施) |
| A20 | Windmill | 小改良 | listener + score | 中等 |
| A21 | Herb Garden | 小改良 | onBuy | 简单 |
| A24 | Clay Mixer | 小改良 | listener after Collect | 简单 |
| A25 | Manger | 小改良 | onBuy + score | 简单 |
| A26 | Fish Trap | 小改良 | effect | 简单 |
| A27 | Sowing Machine | 小改良 | listener | 中等 |
| A30 | Dovecote | 小改良 | score | 简单 |
| A31 | Mansion | 小改良 | computeBonusScore | 简单 |
| A32 | Village Church | 小改良 | computeBonusScore | 简单 |
| A33 | Half-timbered House | 小改良 | computeBonusScore + listener | 中等 |
| A34 | Storehouse | 小改良 | listener + score | 中等 |
| A35 | Corn Scoop | 小改良 | listener after Sow | 简单 |
| A36 | Bean Field | 小改良 | onBuy + sow | 中等 |
| A38 | Corner Cupboard | 小改良 | computeBonusScore | 简单 |
| A42 | Shepherds Pipe | 小改良 | listener | 中等 |
| A43 | Cooking Corner | 小改良 | cooking exchange | 中等(需基础设施) |
| A44 | Clogs | 小改良 | listener | 简单 |
| A45 | Canoe | 小改良 | listener after Collect | 简单 |
| A46 | Reed Pond | 小改良 | listener | 简单 |
| A47 | Clay Supports | 小改良 | listener after Construct | 中等 |
| A48 | Shaving Horse | 小改良 | anytime action | 中等(需基础设施) |
| A49 | Broom | 小改良 | listener | 简单 |
| A50 | Animal Pen | 小改良 | opponent interaction | 复杂(需基础设施) |
| A51 | Water Mill | 小改良 | listener + score | 中等 |
| A52 | Market Cart | 小改良 | listener | 中等 |
| A54 | Wild Boar Trap | 小改良 | listener after Collect | 简单 |
| A56 | Clay Roof | 小改良 | listener after Construct | 中等 |
| A57 | Grape Press | 小改良 | listener | 中等 |
| A59 | Wooden Crane | 小改良 | listener | 中等 |
| A60 | Oriental Fireplace | 小改良 | cooking exchange | 中等(需基础设施) |
| A61 | Corn Storehouse | 小改良 | onHarvest + score | 中等 |
| A62 | Building Material | 小改良 | onBuy | 简单 |
| A63 | Wooden Hut Extension | 小改良 | listener after Construct | 中等 |
| A66 | Cattle Market | 小改良 | listener | 中等 |
| A67 | Milling Stone | 小改良 | effect | 简单 |
| A68 | Piecework | 小改良 | listener | 中等 |
| A69 | Harness | 小改良 | listener after Plow | 简单 |
| A73 | Millstone | 小改良 | listener + score | 中等 |
| A75 | Stablehand | 小改良 | listener | 中等 |
| A76 | Fruit Tree | 小改良 | onRoundStart + score | 中等 |
| A77 | Fence Delivery | 小改良 | listener after Fencing | 中等 |
| A78 | Yoke | 小改良 | listener after Plow | 简单 |
| A80 | Bottle | 小改良 | listener | 简单 |
| A86 | Animal Tamer | 职业 | animal capacity modifier | 中等(需基础设施) |
| A90 | Net Fisherman | 职业 | listener | 中等 |
| A91 | Harvest Helper | 职业 | onHarvest | 简单 |
| A93 | Manservant | 职业 | listener | 中等 |
| A95 | Fence Overseer | 职业 | listener after Fencing | 中等 |
| A96 | Hut Builder | 职业 | listener after Construct | 中等 |
| A98 | Farmer | 职业 | computeBonusScore | 简单 |
| A99 | Yeoman Farmer | 职业 | computeBonusScore | 简单 |
| A100 | Greengrocer | 职业 | computeBonusScore | 简单 |
| A101 | Patron | 职业 | computeBonusScore | 简单 |
| A102 | Grocer | 职业 | anytime action | 中等(需基础设施) |
| A103 | Clay Deliveryman | 职业 | listener after Collect | 简单 |
| A104 | Tutor | 职业 | listener | 中等 |
| A107 | Wood Distributor | 职业 | listener | 中等 |
| A111 | Baker | 职业 | listener | 中等 |
| A113 | Reed Buyer | 职业 | listener after Collect | 简单 |
| A114 | Bricklayer | 职业 | listener after Construct | 中等 |
| A115 | Stone Deliveryman | 职业 | listener after Collect | 简单 |
| A116 | Reeve | 职业 | listener | 中等 |
| A117 | Harvest Tradesman | 职业 | onHarvest | 简单 |
| A118 | Brush Maker | 职业 | listener | 中等 |
| A120 | Forester | 职业 | listener + score | 中等 |
| A121 | Stockman | 职业 | listener | 中等 |
| A122 | Renovator | 职业 | listener after Renovation | 中等 |
| A124 | Grump | 职业 | listener | 中等 |
| A125 | Groom | 职业 | listener | 中等 |
| A129 | Stone Breaker | 职业 | listener | 中等 |
| A130 | Animal Dealer | 职业 | listener | 中等 |
| A131 | Seasonal Worker | 职业 | listener | 中等 |
| A132 | Estate Manager | 职业 | opponent interaction | 复杂(需基础设施) |
| A133 | Head of the Family | 职业 | computeBonusScore | 简单 |
| A134 | Academic | 职业 | computeBonusScore | 简单 |
| A135 | Educator | 职业 | computeBonusScore | 简单 |
| A138 | Mushroom Picker | 职业 | listener | 中等 |
| A139 | Magician | 职业 | listener | 中等 |
| A140 | Berry Picker | 职业 | listener | 中等 |
| A141 | Pastor | 职业 | listener | 中等 |
| A142 | Ratcatcher | 职业 | opponent interaction | 复杂(需基础设施) |
| A143 | Consultant | 职业 | listener | 中等 |
| A145 | Shepherd | 职业 | listener | 中等 |
| A146 | Merchant | 职业 | listener | 中等 |
| A147 | Plowman | 职业 | listener | 中等 |
| A149 | Plow Driver | 职业 | listener | 中等 |
| A150 | Chief | 职业 | opponent interaction | 复杂(需基础设施) |
| A151 | Stonecutter | 职业 | listener | 中等 |
| A152 | Clay Worker | 职业 | listener | 中等 |
| A153 | Storehouse Keeper | 职业 | listener | 中等 |
| A154 | Tinsmith | 职业 | opponent interaction | 复杂(需基础设施) |
| A155 | Clay Mixer | 职业 | listener | 中等 |
| A156 | Buyer | 职业 | opponent interaction | 已实现 |
| A157 | Chamberlain | 职业 | listener | 中等 |
| A158 | Fence Builder | 职业 | opponent interaction | 复杂(需基础设施) |
| A159 | Field Watchman | 职业 | opponent interaction | 复杂(需基础设施) |
| A160 | Fence Deliveryman | 职业 | opponent interaction | 复杂(需基础设施) |
| A161 | Animal Keeper | 职业 | listener | 中等 |
| A163 | Wooden Hut Builder | 职业 | listener after Construct | 中等 |
| A164 | Cattle Whisperer | 职业 | listener | 中等 |
| A167 | Charcoal Burner | 职业 | listener | 中等 |
| A168 | Wood Cutter | 职业 | listener | 中等 |

---

## B Deck 详细状态 (17✅ / 180)

B Deck: 小改良 1-80, 职业 81-168, 5+人 169-180

### ✅ 已实现 (10)

| 卡牌ID | 名称 | 类型 | 实现的 Hooks |
|--------|------|------|-------------|
| B34 | SpecialFood | 小改良 | listener(before/after:Collect) — 动物收取前后检测全部收容，兑现 bonus VP |
| B65 | GrainDepot | 小改良 | effect, onBuy — 购买时获谷物 |
| B67 | HandTruck | 小改良 | listener(before:BakeBread), isDoable — 烤面包前按人数获谷物 |
| B70 | NewPurchase | 小改良 | effect — 回合开始前结算购买效果 |
| B75 | WoodWorkshop | 小改良 | listener(before:Improvement), isDoable, effect — 改良前获木材 |
| B94 | StockProtector | 职业 | listener(before/after), isDoable, effect, onPlay — 保护库存 |
| B100 | Clutterer | 职业 | listener(after), onPlay — 行动后效果 |
| B103 | FieldMerchant | 职业 | listener(after/computeReplace), isDoable, onPlay — 替换效果 |
| B109 | PaperMaker | 职业 | listener(before/after), isDoable, onPlay — 行动前后效果 |
| B151 | LittlePeasant | 职业 | listener(after/computeArgs), canUseOccupied, effect, onPlay — 小农民 |

### 🔧 仅数据定义 (25)

| 卡牌ID | 名称 | 类型 | BGA 逻辑 | 备注 |
|--------|------|------|---------|------|
| B1 | UpscaleLifestyle | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| B2 | MiniPasture | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| B3 | Moonshine | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| B4 | WoodPile | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| B5 | StoreofExperience | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| B6 | ExcursiontotheQuarry | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| B7 | Wage | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| B8 | MarketStall | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| B9 | BeatingRod | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| B10 | Caravan | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| B15 | CarpentersBench | 小改良 | BGA: onBuy + listener | 购买+行动触发，中等 |
| B19 | MoldboardPlow | 小改良 | BGA: listener after Renovation | 翻新后，中等 |
| B21 | HayloftBarn | 小改良 | BGA: listener after Construct | 建造后，中等 |
| B23 | FinalScenario | 小改良 | BGA: listener after Occupation | 出职业后，中等 |
| B42 | ForestInn | 职业 | BGA: PlayerActionCard | 需要 PlayerActionCard 基础设施 |
| B48 | ForestStone | 小改良 | BGA: onBuy | 购买时效果，简单 |
| B55 | MaintenancePremium | 小改良 | BGA: onRoundStart | 回合开始，简单 |
| B76 | Ceilings | 小改良 | BGA: onReturnHome | 回家阶段，简单 |
| B81 | Handcart | 小改良 | BGA: listener after Collect | 收取后，中等 |
| B86 | TruffleSearcher | 职业 | BGA: listener | 中等 |
| B115 | TinsmithMaster | 职业 | BGA: listener | 中等 |
| B124 | Trimmer | 职业 | BGA: listener | 中等 |
| B146 | Illusionist | 职业 | BGA: listener | 中等 |
| B149 | OpenAirFarmer | 职业 | BGA: onHarvest | 收获阶段，简单 |
| B165 | GameProvider | 职业 | BGA: listener | 中等 |

### ❌ 无文件但 BGA 有逻辑 (代表性)

| 卡牌ID | 名称 | 类型 | BGA 逻辑 | 复杂度 |
|--------|------|------|---------|--------|
| B11 | Cattle Feed | 小改良 | listener | 简单 |
| B12 | Water Trough | 小改良 | animal capacity | 中等(需基础设施) |
| B13 | Pelts | 小改良 | listener | 简单 |
| B14 | Clay Path | 小改良 | listener | 简单 |
| B16 | Riding Plow | 小改良 | listener after Plow | 简单 |
| B17 | Wooden Path | 小改良 | listener | 简单 |
| B18 | Corn Sheaf | 小改良 | onBuy | 简单 |
| B20 | Horse | 小改良 | listener | 中等 |
| B22 | Frame | 小改良 | listener after Construct | 中等 |
| B24 | Milling Stone | 小改良 | effect | 简单 |
| B25 | Outhouse | 小改良 | effect | 简单 |
| B26 | Loom | 小改良 | onHarvest + score | 中等 |
| B27 | Cattle Farm | 小改良 | listener + score | 中等 |
| B28 | Corn Chamber | 小改良 | onHarvest + score | 中等 |
| B29 | Clay Path | 小改良 | listener | 简单 |
| B30 | Village Well | 小改良 | computeBonusScore | 简单 |
| B31 | Quarry | 小改良 | onRoundStart | 简单 |
| B32 | Duck Pond | 小改良 | score | 简单 |
| B33 | Pig Pen | 小改良 | listener | 中等 |
| B35 | Half-timbered House | 小改良 | computeBonusScore | 简单 |
| B36 | Greenhouse | 小改良 | onHarvest + score | 中等 |
| B37 | Plow | 小改良 | effect | 简单 |
| B38 | Vegetable Garden | 小改良 | onBuy + score | 中等 |
| B39 | Animal Enclosure | 小改良 | listener | 中等 |
| B40 | Fish Pond | 小改良 | listener | 中等 |
| B41 | Wooden Storehouse | 小改良 | listener | 中等 |
| B43 | Shelter Workshop | 小改良 | listener | 中等 |
| B44 | Milking Stool | 小改良 | onHarvest | 简单 |
| B45 | Brewer | 小改良 | listener | 中等 |
| B46 | Mini Ranch | 小改良 | listener | 中等 |
| B47 | Goose Pond | 小改良 | listener | 中等 |
| B49 | Horse Plow | 小改良 | listener after Plow | 简单 |
| B50 | Sleeping Corner | 小改良 | listener after GrowFamily | 中等 |
| B51 | Straw Roof | 小改良 | listener after Construct | 中等 |
| B52 | Stone Trough | 小改良 | animal capacity | 中等(需基础设施) |
| B53 | Corn Sack | 小改良 | listener | 简单 |
| B54 | Wishing Well | 小改良 | listener | 中等 |
| B56 | Manure | 小改良 | listener after Sow | 简单 |
| B57 | Pottery Workshop | 小改良 | cooking exchange | 中等(需基础设施) |
| B58 | Pottery | 小改良 | effect | 简单 |
| B59 | Hedge | 小改良 | listener after Fencing | 中等 |
| B60 | Axe | 小改良 | listener | 简单 |
| B61 | Indoor Well | 小改良 | onRoundStart + score | 中等 |
| B62 | Reed Hut | 小改良 | listener after Construct | 中等 |
| B63 | Grain Elevator | 小改良 | listener | 中等 |
| B64 | Milling Machine | 小改良 | listener | 中等 |
| B66 | Fodder Beets | 小改良 | listener | 简单 |
| B68 | Stone Cart | 小改良 | listener after Collect | 简单 |
| B69 | Animal Market | 小改良 | listener | 中等 |
| B71 | Threshing Floor | 小改良 | listener | 中等 |
| B72 | Herd Animals | 小改良 | listener | 中等 |
| B73 | Slaughterhouse | 小改良 | cooking exchange | 中等(需基础设施) |
| B74 | Clay Plastering | 小改良 | listener after Construct | 中等 |
| B77 | Stone Extension | 小改良 | listener after Construct | 中等 |
| B78 | Garden Shed | 小改良 | listener | 中等 |
| B79 | Hay Rack | 小改良 | listener | 中等 |
| B80 | Hard Porcelain | 小改良 | cooking exchange | 中等(需基础设施) |
| B82 | Market Woman | 职业 | listener | 中等 |
| B83 | Reed Collector | 职业 | listener after Collect | 简单 |
| B84 | Tutor | 职业 | listener | 中等 |
| B85 | Brickworker | 职业 | listener | 中等 |
| B87 | Pigkeeper | 职业 | listener | 中等 |
| B88 | Well Builder | 职业 | listener | 中等 |
| B89 | Clay Seller | 职业 | listener | 中等 |
| B90 | Baker | 职业 | listener | 中等 |
| B91 | Horse Trainer | 职业 | listener | 中等 |
| B92 | Clay Hut Builder | 职业 | listener after Construct | 中等 |
| B93 | Overseer | 职业 | listener | 中等 |
| B95 | Animal Breeder | 职业 | listener | 中等 |
| B96 | Storyteller | 职业 | listener | 中等 |
| B97 | Stone Carrier | 职业 | listener | 中等 |
| B98 | Woodworker | 职业 | listener | 中等 |
| B99 | Grain Farmer | 职业 | listener | 中等 |
| B101 | Fence Deliveryman | 职业 | listener after Fencing | 中等 |
| B102 | Vegetable Farmer | 职业 | listener | 中等 |
| B104 | Animal Farmer | 职业 | listener | 中等 |
| B105 | Carpenter | 职业 | listener | 中等 |
| B106 | Toolmaker | 职业 | listener | 中等 |
| B107 | Milkmaid | 职业 | listener | 中等 |
| B108 | Pottery Seller | 职业 | listener | 中等 |
| B110 | Road Builder | 职业 | listener | 中等 |
| B111 | Country Doctor | 职业 | listener after GrowFamily | 中等 |
| B112 | Cook | 职业 | cooking exchange | 中等(需基础设施) |
| B113 | Ranch Hand | 职业 | listener | 中等 |
| B114 | Manservant | 职业 | listener | 中等 |
| B116 | Meat Seller | 职业 | listener | 中等 |
| B117 | Pieceworker | 职业 | listener | 中等 |
| B118 | Pig Catcher | 职业 | listener | 中等 |
| B119 | Hay Merchant | 职业 | listener | 中等 |
| B120 | Swineherd | 职业 | listener | 中等 |
| B121 | Grain Merchant | 职业 | listener | 中等 |
| B122 | Cattleman | 职业 | listener | 中等 |
| B123 | Stone Trader | 职业 | listener | 中等 |
| B125 | Wood Buyer | 职业 | listener | 中等 |
| B126 | Conjurer | 职业 | listener | 复杂 |
| B127 | Harvest Worker | 职业 | onHarvest | 简单 |
| B128 | Seasonal Worker | 职业 | listener | 中等 |
| B129 | Plumber | 职业 | listener | 中等 |
| B130 | Schnapps Distiller | 职业 | listener | 中等 |
| B131 | Clay Deliveryman | 职业 | listener after Collect | 简单 |
| B132 | Night Watchman | 职业 | listener | 中等 |
| B133 | Animal Handler | 职业 | listener | 中等 |
| B134 | Clay Seller | 职业 | listener | 中等 |
| B135 | Mushroom Gatherer | 职业 | listener | 中等 |
| B136 | Guildmaster | 职业 | computeBonusScore | 简单 |
| B137 | Hide Farmer | 职业 | listener | 中等 |
| B138 | Landlord | 职业 | computeBonusScore | 简单 |
| B139 | Bookkeeper | 职业 | listener | 中等 |
| B140 | Childminder | 职业 | listener | 中等 |
| B141 | Quarryman | 职业 | listener | 中等 |
| B142 | Clay Potter | 职业 | listener | 中等 |
| B143 | Pig Farmer | 职业 | listener | 中等 |
| B144 | Field Worker | 职业 | listener | 中等 |
| B145 | House Steward | 职业 | listener | 中等 |
| B147 | Field Guard | 职业 | listener | 中等 |
| B148 | Charcoal Burner | 职业 | listener | 中等 |
| B150 | Grain Hauler | 职业 | listener | 中等 |
| B152 | Fence Builder | 职业 | listener after Fencing | 中等 |
| B153 | Veterinarian | 职业 | listener | 中等 |
| B154 | Manor Lord | 职业 | listener | 中等 |
| B155 | Carpenter | 职业 | listener | 中等 |
| B156 | Shepherd | 职业 | listener | 中等 |
| B157 | Ox Driver | 职业 | listener | 中等 |
| B158 | Reed Merchant | 职业 | listener | 中等 |
| B159 | Scythe Maker | 职业 | listener | 中等 |
| B160 | Inspector | 职业 | listener | 中等 |
| B161 | Juggler | 职业 | listener | 中等 |
| B162 | Water Carrier | 职业 | listener | 中等 |
| B163 | Village Elder | 职业 | computeBonusScore | 简单 |
| B164 | Cattle Farmer | 职业 | listener | 中等 |
| B166 | Plowmaker | 职业 | listener | 中等 |
| B167 | Baker's Boy | 职业 | listener | 中等 |
| B168 | Fishmonger | 职业 | listener | 中等 |

---

## C Deck 详细状态 (23✅ / 182)

C Deck: 小改良 1-80, 职业 81-168, 5+人 169-182 (注意 C 有 182 张)

### ✅ 已实现 (13)

| 卡牌ID | 名称 | 类型 | 实现的 Hooks |
|--------|------|------|-------------|
| C24 | BedintheGrainField | 小改良 | effect, onBuy — 购买时效果 |
| C25 | SteamMachine | 小改良 | listener(immediatelyAfter/after:PlaceFarmer) — 放置后烤面包 |
| C37 | DwellingMound | 小改良 | listener(computeCosts) — 修改建造费用 |
| C52 | HuntsmansHat | 小改良 | listener(immediatelyAfter/after:Collect), effect — 猪市场收取后按猪获食物 |
| C60 | SmallPottersOven | 小改良 | listener(before), isDoable, effect, onBuy — 陶器烤炉效果 |
| C63 | CraftBrewery | 小改良 | effect, onHarvest — 收获阶段酿酒 |
| C71 | SlurrySpreader | 小改良 | effect — 泥浆撒布器 |
| C75 | Firewood | 小改良 | listener(after:Improvement), effect, onReturnHome — 改良后取木材 |
| C88 | CarpentersApprentice | 职业 | listener(before/after/computeCosts), isDoable, effect, onPlay — 木工学徒 |
| C96 | Merchant | 职业 | listener(immediatelyAfter/after:Improvement), onPlay — 改良后追加改良 |
| C120 | AgriculturalLabourer | 职业 | listener(after:Receive/Gain), effect, onPlay — 获谷物后从牌上取黏土 |
| C133 | Soldier | 职业 | computeBonusScore, after, effect, onPlay — 预留资源计分 |
| C144 | ReedRoofRenovator | 职业 | listener(immediatelyAfter/after:Renovation), effect, onBuy — 翻新后效果 |

### 🔧 仅数据定义 (36)

| 卡牌ID | 名称 | 类型 | BGA 逻辑 | 备注 |
|--------|------|------|---------|------|
| C1 | Overhaul | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| C2 | Stable | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| C3 | CarriageTrip | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| C4 | WritingBoards | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| C5 | Remodeling | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| C6 | StoneClearing | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| C7 | BladeShears | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| C8 | PlantFertilizer | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| C9 | AutomaticWaterTrough | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| C10 | BunkBeds | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| C13 | WoodSlideHammer | 小改良 | BGA: listener | 中等 |
| C17 | NewlyPlowedField | 小改良 | BGA: onBuy + plow | 购买时犁地，简单 |
| C18 | RollOverPlow | 小改良 | BGA: listener after Plow | 犁地后，中等 |
| C19 | SwingPlow | 小改良 | BGA: listener after Plow | 犁地后，中等 |
| C23 | JobContract | 小改良 | BGA: onBuy | 购买时效果，简单 |
| C27 | Blueprint | 小改良 | BGA: listener after Renovation | 翻新后，中等 |
| C29 | BeerTable | 小改良 | BGA: listener after Occupation | 出职业后，中等 |
| C31 | WritingChamber | 小改良 | BGA: onReturnHome | 回家阶段，简单 |
| C51 | FishingNet | 小改良 | BGA: opponent interaction | 复杂(需基础设施) |
| C57 | Crudite | 小改良 | BGA: listener after Collect | 收取后，中等 |
| C71 | Slurry | 小改良 | BGA: listener | (与 C71_SlurrySpreader 同ID，不同实现) |
| C84 | PerennialRye | 小改良 | BGA: onHarvest | 收获阶段，简单 |
| C85 | DenBuilder | 职业 | BGA: listener after Fencing | 围栏后，中等 |
| C86 | LivestockFeeder | 职业 | BGA: listener | 中等 |
| C87 | Mason | 职业 | BGA: listener after Improvement | 改良后，中等 |
| C93 | InnerDistrictsDirector | 职业 | BGA: listener | 中等 |
| C99 | GardenDesigner | 职业 | BGA: listener | 中等 |
| C104 | Collector | 职业 | BGA: PlayerActionCard | 需要 PlayerActionCard 基础设施 |
| C115 | Sower | 职业 | BGA: listener after Sow | 播种后，中等 |
| C130 | OutskirtsDirector | 小改良 | BGA: listener | 中等 |
| C135 | Constable | 职业 | BGA: listener | 中等 |
| C142 | MarketCrier | 职业 | BGA: listener | 中等 |
| C148 | MudWallower | 职业 | BGA: listener | 中等 |
| C156 | HoofCaregiver | 职业 | BGA: listener | 中等 |
| C162 | ForestOwner | 职业 | BGA: PlayerActionCard | 需要 PlayerActionCard 基础设施 |
| C168 | AnimalCatcher | 小改良 | BGA: listener | 中等 |

### ❌ 无文件但 BGA 有逻辑 (代表性)

| 卡牌ID | 名称 | 类型 | BGA 逻辑 | 复杂度 |
|--------|------|------|---------|--------|
| C11 | Fire Pit | 小改良 | cooking exchange | 中等(需基础设施) |
| C12 | Clay Oven | 小改良 | cooking exchange | 中等(需基础设施) |
| C14 | Loom | 小改良 | onHarvest + score | 中等 |
| C15 | Sawhorse | 小改良 | listener | 简单 |
| C16 | Corn Scoop | 小改良 | listener | 简单 |
| C20 | Millstone | 小改良 | effect | 简单 |
| C21 | Manger | 小改良 | onBuy + score | 简单 |
| C22 | Grain Cart | 小改良 | listener after Collect | 简单 |
| C26 | Horse | 小改良 | listener | 中等 |
| C28 | Dovecote | 小改良 | score | 简单 |
| C30 | Village Well | 小改良 | computeBonusScore | 简单 |
| C32 | Reed Hut | 小改良 | listener after Construct | 中等 |
| C33 | Mansion | 小改良 | computeBonusScore | 简单 |
| C34 | Clay Path | 小改良 | listener | 简单 |
| C35 | Corner Cupboard | 小改良 | computeBonusScore | 简单 |
| C36 | Barn | 小改良 | listener | 中等 |
| C38 | Corn Storehouse | 小改良 | onHarvest + score | 中等 |
| C39 | Straw Roof | 小改良 | listener after Construct | 中等 |
| C40 | Field | 小改良 | onBuy + plow | 中等 |
| C41 | Clay Supports | 小改良 | listener after Construct | 中等 |
| C42 | Animal Pen | 小改良 | listener | 中等 |
| C43 | Quarry | 小改良 | onRoundStart | 简单 |
| C44 | Cow Pasture | 小改良 | listener | 中等 |
| C45 | Grape Press | 小改良 | listener | 中等 |
| C46 | Reed Pond | 小改良 | listener | 简单 |
| C47 | Broom | 小改良 | listener | 简单 |
| C48 | Grain Elevator | 小改良 | listener | 中等 |
| C49 | Vegetable Garden | 小改良 | onBuy + score | 中等 |
| C50 | Windmill | 小改良 | listener + score | 中等 |
| C53 | Fruit Tree | 小改良 | onRoundStart + score | 中等 |
| C54 | Half-timbered House | 小改良 | computeBonusScore | 简单 |
| C55 | Indoor Well | 小改良 | onRoundStart + score | 中等 |
| C56 | Canoe | 小改良 | listener after Collect | 简单 |
| C58 | Market Cart | 小改良 | listener | 中等 |
| C59 | Storehouse | 小改良 | computeBonusScore | 简单 |
| C61 | Spindle | 小改良 | listener | 简单 |
| C62 | Clay Roof | 小改良 | listener after Construct | 中等 |
| C64 | Building Material | 小改良 | onBuy | 简单 |
| C65 | Herb Garden | 小改良 | onBuy | 简单 |
| C66 | Greenhouse | 小改良 | onHarvest + score | 中等 |
| C67 | Stone Extension | 小改良 | listener after Construct | 中等 |
| C68 | Wild Boar Trap | 小改良 | listener after Collect | 简单 |
| C69 | Fish Trap | 小改良 | effect | 简单 |
| C70 | Axe | 小改良 | listener | 简单 |
| C72 | Wooden Hut Extension | 小改良 | listener after Construct | 中等 |
| C73 | Yoke | 小改良 | listener after Plow | 简单 |
| C74 | Landing Net | 小改良 | listener after Collect | 简单 |
| C76 | Shepherd's Pipe | 小改良 | listener | 中等 |
| C77 | Duck Pond | 小改良 | score | 简单 |
| C78 | Clogs | 小改良 | listener | 简单 |
| C79 | Clay Extension | 小改良 | listener after Construct | 中等 |
| C80 | Bean Field | 小改良 | onBuy + sow | 中等 |
| C81 | Net Fisherman | 职业 | listener | 中等 |
| C82 | Clay Worker | 职业 | listener | 中等 |
| C83 | Harvest Helper | 职业 | onHarvest | 简单 |
| C89 | Animal Dealer | 职业 | listener | 中等 |
| C90 | Grocer | 职业 | anytime action | 中等(需基础设施) |
| C91 | Plowman | 职业 | listener | 中等 |
| C92 | Bricklayer | 职业 | listener | 中等 |
| C94 | Reeve | 职业 | listener | 中等 |
| C95 | Hut Builder | 职业 | listener after Construct | 中等 |
| C97 | Plow Driver | 职业 | listener | 中等 |
| C98 | Seasonal Worker | 职业 | listener | 中等 |
| C100 | Manservant | 职业 | listener | 中等 |
| C101 | Cattleman | 职业 | listener | 中等 |
| C102 | Forester | 职业 | listener + score | 中等 |
| C103 | Wood Distributor | 职业 | listener | 中等 |
| C105 | Renovator | 职业 | listener after Renovation | 中等 |
| C106 | Clay Deliveryman | 职业 | listener after Collect | 简单 |
| C107 | Mushroom Picker | 职业 | listener | 中等 |
| C108 | Stockman | 职业 | listener | 中等 |
| C109 | Baker | 职业 | listener | 中等 |
| C110 | Stone Deliveryman | 职业 | listener after Collect | 简单 |
| C111 | Harvest Tradesman | 职业 | onHarvest | 简单 |
| C112 | Reed Buyer | 职业 | listener after Collect | 简单 |
| C113 | Groom | 职业 | listener | 中等 |
| C114 | Brush Maker | 职业 | listener | 中等 |
| C116 | Stonecutter | 职业 | listener | 中等 |
| C117 | Stablehand | 职业 | listener | 中等 |
| C118 | Grump | 职业 | listener | 中等 |
| C119 | Fence Overseer | 职业 | listener after Fencing | 中等 |
| C121 | Stone Breaker | 职业 | listener | 中等 |
| C122 | Consultant | 职业 | listener | 中等 |
| C123 | Shepherd | 职业 | listener | 中等 |
| C124 | Animal Keeper | 职业 | listener | 中等 |
| C125 | Pastor | 职业 | listener | 中等 |
| C126 | Merchant | 职业 | listener | 中等 |
| C127 | Berry Picker | 职业 | listener | 中等 |
| C128 | Magician | 职业 | listener | 中等 |
| C129 | Tutor | 职业 | listener | 中等 |
| C131 | Woodworker | 职业 | listener | 中等 |
| C132 | Wooden Hut Builder | 职业 | listener after Construct | 中等 |
| C134 | Head of the Family | 职业 | computeBonusScore | 简单 |
| C136 | Yeoman Farmer | 职业 | computeBonusScore | 简单 |
| C137 | Greengrocer | 职业 | computeBonusScore | 简单 |
| C138 | Academic | 职业 | computeBonusScore | 简单 |
| C139 | Educator | 职业 | computeBonusScore | 简单 |
| C140 | Charcoal Burner | 职业 | listener | 中等 |
| C141 | Pig Breeder | 职业 | listener | 中等 |
| C143 | Cattle Whisperer | 职业 | listener | 中等 |
| C145 | Wood Cutter | 职业 | listener | 中等 |
| C146 | Chamberlain | 职业 | listener | 中等 |
| C147 | Storehouse Keeper | 职业 | listener | 中等 |
| C149 | Clay Mixer | 职业 | listener | 中等 |
| C150 | Ratcatcher | 职业 | opponent interaction | 复杂(需基础设施) |
| C151 | Taster | 职业 | opponent interaction | 复杂(需基础设施) |
| C152 | Field Watchman | 职业 | opponent interaction | 复杂(需基础设施) |
| C153 | Estate Manager | 职业 | opponent interaction | 复杂(需基础设施) |
| C154 | Fence Builder | 职业 | opponent interaction | 复杂(需基础设施) |
| C155 | Chief | 职业 | opponent interaction | 复杂(需基础设施) |
| C157 | Tinsmith | 职业 | opponent interaction | 复杂(需基础设施) |
| C158 | Fence Deliveryman | 职业 | opponent interaction | 复杂(需基础设施) |
| C159 | Merchant | 职业 | listener | 中等 |
| C160 | Mushroom Gatherer | 职业 | listener | 中等 |
| C161 | Night Watchman | 职业 | listener | 中等 |
| C163 | Slaughterer | 职业 | listener | 中等 |
| C164 | Animal Farmer | 职业 | listener | 中等 |
| C165 | Wool Merchant | 职业 | listener | 中等 |
| C166 | Pig Farmer | 职业 | listener | 中等 |
| C167 | Fieldworker | 职业 | listener | 中等 |

---

## D Deck 详细状态 (28✅ / 181)

D Deck: 小改良 1-80, 职业 81-168, 5+人 169-181 (注意 D 有 181 张)

### ✅ 已实现 (10)

| 卡牌ID | 名称 | 类型 | 实现的 Hooks |
|--------|------|------|-------------|
| D14 | HammerCrusher | 小改良 | listener(before:Renovation), isDoable — 翻修前获黏土+芦苇 |
| D49 | Bookshelf | 小改良 | listener(before), isDoable — 行动前效果 |
| D51 | Archway | 职业 | before, effect, onBuy — 个人行动格(PlayerActionCard) |
| D99 | EarthenwarePotter | 职业 | effect, onBuy, onPlay, after — 陶器工效果 |
| D107 | Bellfounder | 职业 | effect, onPlay — 铸钟师 |
| D115 | FodderPlanter | 职业 | effect, onPlay — 饲料种植者 |
| D119 | WoodBarterer | 职业 | listener(before), isDoable, onPlay — 木材以物换物 |
| D150 | GodlySpouse | 职业 | listener(after), effect, onPlay — 虔诚配偶 |
| D152 | Patron | 职业 | listener(before), isDoable, onPlay — 赞助人 |
| D167 | PureBreeder | 职业 | effect, onBuy, onPlay — 纯种繁殖者 |

### 🔧 仅数据定义 (43)

| 卡牌ID | 名称 | 类型 | BGA 逻辑 | 备注 |
|--------|------|------|---------|------|
| D1 | ZigzagHarrow | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| D2 | DwellingPlan | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| D3 | Furrows | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| D4 | CrossCutWood | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| D5 | FieldClay | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| D6 | PetrifiedWood | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| D7 | Trident | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| D8 | FernSeeds | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| D9 | GameTrade | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| D10 | StorksNest | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| D20 | TurnwrestPlow | 小改良 | BGA: listener after Plow | 犁地后，中等 |
| D22 | WorkPermit | 小改良 | BGA: onBuy | 购买时效果，简单 |
| D23 | PioneeringSpirit | 职业 | BGA: PlayerActionCard | 需要 PlayerActionCard 基础设施 |
| D26 | CarpentersYard | 小改良 | BGA: listener after Improvement | 改良后，中等 |
| D27 | Retraining | 小改良 | BGA: listener after Occupation | 出职业后，中等 |
| D36 | BreedRegistry | 小改良 | BGA: listener | 中等 |
| D53 | TeaHouse | 小改良 | BGA: listener | 中等 |
| D55 | NewMarket | 小改良 | BGA: listener | 中等 |
| D66 | PotterCeramics | 小改良 | BGA: listener after Collect | 收取后，中等 |
| D70 | StrawManure | 小改良 | BGA: onHarvest | 收获阶段，简单 |
| D71 | Changeover | 小改良 | BGA: listener | 中等 |
| D72 | StableManure | 小改良 | BGA: listener | 中等 |
| D73 | (unnamed) | 小改良 | BGA: listener | 中等 |
| D74 | RoyalWood | 小改良 | BGA: listener | 中等 |
| D85 | Reader | 职业 | BGA: onRoundStart | 回合开始，简单 |
| D92 | ChildOmbudsman | 职业 | BGA: listener | 中等 |
| D93 | SheepInspector | 职业 | BGA: listener | 中等 |
| D94 | HenpeckedHusband | 职业 | BGA: listener | 中等 |
| D98 | Transactor | 职业 | BGA: listener | 中等 |
| D100 | LordoftheManor | 职业 | BGA: computeBonusScore | 简单 — 仅需加 hook |
| D101 | SugarBaker | 职业 | BGA: listener | 中等 |
| D102 | SampleStableMaker | 职业 | BGA: listener | 中等 |
| D103 | CanalBoatman | 职业 | BGA: listener | 中等 |
| D116 | TreeInspector | 职业 | BGA: PlayerActionCard | 需要 PlayerActionCard 基础设施 |
| D124 | Emissary | 职业 | BGA: listener | 中等 |
| D126 | FieldCultivator | 职业 | BGA: listener | 中等 |
| D127 | HardworkingMan | 职业 | BGA: PlayerActionCard | 需要 PlayerActionCard 基础设施 |
| D131 | CraftsmanshipPromoter | 职业 | BGA: listener | 中等 |
| D132 | HideFarmer | 职业 | BGA: listener | 中等 |
| D134 | OysterEater | 职业 | BGA: listener | 中等 |
| D137 | TradeTeacher | 职业 | BGA: listener | 中等 |
| D157 | PartyOrganizer | 职业 | BGA: listener | 中等 |
| D158 | BeanCounter | 职业 | BGA: listener | 中等 |
| D164 | PetGrower | 小改良 | BGA: listener | 中等 |

### ❌ 无文件但 BGA 有逻辑 (代表性)

| 卡牌ID | 名称 | 类型 | BGA 逻辑 | 复杂度 |
|--------|------|------|---------|--------|
| D11 | Riding Plow | 小改良 | listener after Plow | 简单 |
| D12 | Drinking Trough | 小改良 | animal capacity | 中等(需基础设施) |
| D13 | Landing Net | 小改良 | listener after Collect | 简单 |
| D15 | Corn Scoop | 小改良 | listener after Sow | 简单 |
| D16 | Clay Path | 小改良 | listener | 简单 |
| D17 | Wooden Path | 小改良 | listener | 简单 |
| D18 | Pelts | 小改良 | listener | 简单 |
| D19 | Spindle | 小改良 | listener | 简单 |
| D21 | Horse | 小改良 | listener | 中等 |
| D24 | Manger | 小改良 | onBuy + score | 简单 |
| D25 | Bucket | 小改良 | effect | 简单 |
| D28 | Cattle Feed | 小改良 | listener | 简单 |
| D29 | Loom | 小改良 | onHarvest + score | 中等 |
| D30 | Dovecote | 小改良 | score | 简单 |
| D31 | Village Well | 小改良 | computeBonusScore | 简单 |
| D32 | Duck Pond | 小改良 | score | 简单 |
| D33 | Greenhouse | 小改良 | onHarvest + score | 中等 |
| D34 | Corn Chamber | 小改良 | onHarvest + score | 中等 |
| D35 | Half-timbered House | 小改良 | computeBonusScore | 简单 |
| D37 | Vegetable Garden | 小改良 | onBuy + score | 中等 |
| D38 | Mansion | 小改良 | computeBonusScore | 简单 |
| D39 | Corner Cupboard | 小改良 | computeBonusScore | 简单 |
| D40 | Windmill | 小改良 | listener + score | 中等 |
| D41 | Storehouse | 小改良 | listener + score | 中等 |
| D42 | Quarry | 小改良 | onRoundStart | 简单 |
| D43 | Reed Pond | 小改良 | listener | 简单 |
| D44 | Fruit Tree | 小改良 | onRoundStart + score | 中等 |
| D45 | Indoor Well | 小改良 | onRoundStart + score | 中等 |
| D46 | Bean Field | 小改良 | onBuy + sow | 中等 |
| D47 | Corn Storehouse | 小改良 | onHarvest + score | 中等 |
| D48 | Frame | 小改良 | listener after Construct | 中等 |
| D50 | Herb Garden | 小改良 | onBuy | 简单 |
| D52 | Clay Mixer | 小改良 | listener after Collect | 简单 |
| D54 | Clay Oven | 小改良 | cooking exchange | 中等(需基础设施) |
| D56 | Grape Press | 小改良 | listener | 中等 |
| D57 | Straw Roof | 小改良 | listener after Construct | 中等 |
| D58 | Clay Roof | 小改良 | listener after Construct | 中等 |
| D59 | Clay Supports | 小改良 | listener after Construct | 中等 |
| D60 | Wild Boar Trap | 小改良 | listener after Collect | 简单 |
| D61 | Fish Trap | 小改良 | effect | 简单 |
| D62 | Cattle Market | 小改良 | listener | 中等 |
| D63 | Sowing Machine | 小改良 | listener | 中等 |
| D64 | Axe | 小改良 | listener | 简单 |
| D65 | Canoe | 小改良 | listener after Collect | 简单 |
| D67 | Animal Pen | 小改良 | listener | 中等 |
| D68 | Building Material | 小改良 | onBuy | 简单 |
| D69 | Broom | 小改良 | listener | 简单 |
| D75 | Shepherd's Pipe | 小改良 | listener | 中等 |
| D76 | Water Mill | 小改良 | listener + score | 中等 |
| D77 | Wooden Crane | 小改良 | listener | 中等 |
| D78 | Grain Cart | 小改良 | listener after Collect | 简单 |
| D79 | Piecework | 小改良 | listener | 中等 |
| D80 | Harness | 小改良 | listener after Plow | 简单 |
| D81 | Clay Mixer | 职业 | listener | 中等 |
| D82 | Net Fisherman | 职业 | listener | 中等 |
| D83 | Harvest Helper | 职业 | onHarvest | 简单 |
| D84 | Slaughterer | 职业 | listener | 中等 |
| D86 | Animal Tamer | 职业 | animal capacity modifier | 中等(需基础设施) |
| D87 | Plowman | 职业 | listener | 中等 |
| D88 | Hut Builder | 职业 | listener after Construct | 中等 |
| D89 | Renovator | 职业 | listener after Renovation | 中等 |
| D90 | Reeve | 职业 | listener | 中等 |
| D91 | Harvest Tradesman | 职业 | onHarvest | 简单 |
| D95 | Groom | 职业 | listener | 中等 |
| D96 | Fence Overseer | 职业 | listener after Fencing | 中等 |
| D97 | Stockman | 职业 | listener | 中等 |
| D104 | Bricklayer | 职业 | listener | 中等 |
| D105 | Baker | 职业 | listener | 中等 |
| D106 | Stone Deliveryman | 职业 | listener after Collect | 简单 |
| D108 | Mushroom Picker | 职业 | listener | 中等 |
| D109 | Forester | 职业 | listener + score | 中等 |
| D110 | Consultant | 职业 | listener | 中等 |
| D111 | Manservant | 职业 | listener | 中等 |
| D112 | Charcoal Burner | 职业 | listener | 中等 |
| D113 | Clay Deliveryman | 职业 | listener after Collect | 简单 |
| D114 | Reed Buyer | 职业 | listener after Collect | 简单 |
| D117 | Seasonal Worker | 职业 | listener | 中等 |
| D118 | Stone Breaker | 职业 | listener | 中等 |
| D119 | (see above) | 职业 | (已实现) | — |
| D120 | Brush Maker | 职业 | listener | 中等 |
| D121 | Shepherd | 职业 | listener | 中等 |
| D122 | Pastor | 职业 | listener | 中等 |
| D123 | Berry Picker | 职业 | listener | 中等 |
| D125 | Wood Distributor | 职业 | listener | 中等 |
| D128 | Stablehand | 职业 | listener | 中等 |
| D129 | Animal Keeper | 职业 | listener | 中等 |
| D130 | Grump | 职业 | listener | 中等 |
| D133 | Magician | 职业 | listener | 中等 |
| D135 | Patron | 职业 | computeBonusScore | 简单 |
| D136 | Academic | 职业 | computeBonusScore | 简单 |
| D138 | Farmer | 职业 | computeBonusScore | 简单 |
| D139 | Yeoman Farmer | 职业 | computeBonusScore | 简单 |
| D140 | Greengrocer | 职业 | computeBonusScore | 简单 |
| D141 | Educator | 职业 | computeBonusScore | 简单 |
| D142 | Head of the Family | 职业 | computeBonusScore | 简单 |
| D143 | Stonecutter | 职业 | listener | 中等 |
| D144 | Chamberlain | 职业 | listener | 中等 |
| D145 | Merchant | 职业 | listener | 中等 |
| D146 | Animal Dealer | 职业 | listener | 中等 |
| D147 | Clay Worker | 职业 | listener | 中等 |
| D148 | Storehouse Keeper | 职业 | listener | 中等 |
| D149 | Cattleman | 职业 | listener | 中等 |
| D151 | Cattle Whisperer | 职业 | listener | 中等 |
| D153 | Wood Cutter | 职业 | listener | 中等 |
| D154 | Woolgrower | 职业 | listener | 中等 |
| D155 | Pig Breeder | 职业 | listener | 中等 |
| D156 | Wooden Hut Builder | 职业 | listener after Construct | 中等 |
| D159 | Plow Driver | 职业 | listener | 中等 |
| D160 | Animal Farmer | 职业 | listener | 中等 |
| D161 | Ratcatcher | 职业 | opponent interaction | 复杂(需基础设施) |
| D162 | Field Watchman | 职业 | opponent interaction | 复杂(需基础设施) |
| D163 | Taster | 职业 | opponent interaction | 复杂(需基础设施) |
| D165 | Estate Manager | 职业 | opponent interaction | 复杂(需基础设施) |
| D166 | Chief | 职业 | opponent interaction | 复杂(需基础设施) |
| D168 | Tinsmith | 职业 | opponent interaction | 复杂(需基础设施) |

---

## E Deck 详细状态 (28✅ / 169)

E Deck: 小改良 1-80, 职业 81-168, 无5+人卡 (169张)

### ✅ 已实现 (14)

| 卡牌ID | 名称 | 类型 | 实现的 Hooks |
|--------|------|------|-------------|
| E10 | StrawHat | 小改良 | effect — 草帽效果 |
| E21 | SheepRug | 小改良 | listener(canUseOccupied) — 允许使用已占用行动格 |
| E33 | BeaverColony | 小改良 | listener(immediatelyAfter/after:Collect/Gain), effect, onBuy — 芦苇收取追加VP，建马厩+动物重组 |
| E52 | Cubbyhole | 小改良 | listener(after), effect — 行动后效果 |
| E53 | BoarSpear | 小改良 | listener(during/after:Collect) — 收取时交换资源 |
| E57 | CheeseFondue | 小改良 | listener(after) — 行动后效果 |
| E73 | Scythe | 小改良 | effect — 镰刀效果 |
| E74 | AshTrees | 小改良 | listener(before/after:Fencing), isDoable, effect, onBuy — 免费围栏 |
| E84 | DollysMother | 小改良 | during, effect — 期间效果 |
| E101 | Blighter | 职业 | listener(after), isDoable, onPlay — 按阶段给VP后封锁出职业 |
| E112 | GrainThief | 职业 | effect, onHarvest, onPlay — 收获阶段偷谷物 |
| E128 | Saddler | 职业 | listener(after), onPlay — 行动后效果 |
| E130 | Overachiever | 职业 | listener(before/computeCosts), onPlay — 修改费用 |
| E133 | ChampionBreeder | 职业 | during, effect, onPlay — 冠军繁殖者 |

### 🔧 仅数据定义 (42)

| 卡牌ID | 名称 | 类型 | BGA 逻辑 | 备注 |
|--------|------|------|---------|------|
| E1 | PoleBarns | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| E2 | RenovationMaterials | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| E3 | TeaTime | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| E4 | Thunderbolt | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| E5 | NightLoot | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| E6 | Recount | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| E7 | Pumpernickel | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| E8 | FarmersMarket | 小改良 | BGA: 无逻辑 | 纯数据卡 |
| E16 | BriarHedge | 小改良 | BGA: listener after Fencing | 围栏后，中等 |
| E22 | GuestRoom | 小改良 | BGA: listener | 中等 |
| E27 | PiggyBank | 小改良 | BGA: listener | 中等 |
| E30 | ChildsToy | 小改良 | BGA: listener after GrowFamily | 中等 |
| E36 | HerbalGarden | 小改良 | BGA: onBuy | 购买时效果，简单 |
| E51 | WhaleOil | 小改良 | BGA: listener | 中等 |
| E62 | SourDough | 小改良 | BGA: listener | 中等 |
| E71 | CowPatty | 小改良 | BGA: listener | 中等 |
| E75 | StoneAxe | 小改良 | BGA: listener | 中等 |
| E76 | LumberPile | 小改良 | BGA: listener | 中等 |
| E78 | SleightofHand | 小改良 | BGA: listener | 中等 |
| E81 | AlchemistsLab | 职业 | BGA: PlayerActionCard | 需要 PlayerActionCard 基础设施 |
| E82 | Profiteering | 小改良 | BGA: listener | 中等 |
| E85 | MasterTanner | 职业 | BGA: listener | 中等 |
| E86 | PenBuilder | 职业 | BGA: animal capacity modifier | 需要 animal capacity 基础设施 |
| E90 | DungCollector | 职业 | BGA: listener | 中等 |
| E91 | PlowBuilder | 职业 | BGA: listener | 中等 |
| E92 | FieldDoctor | 职业 | BGA: listener | 中等 |
| E93 | Motivator | 职业 | BGA: listener | 中等 |
| E103 | Wolf | 职业 | BGA: listener | 中等 |
| E109 | BraidMaker | 职业 | BGA: listener | 中等 |
| E123 | ResourceHoarder | 职业 | BGA: listener | 中等 |
| E124 | MayorCandidate | 职业 | BGA: listener | 中等 |
| E134 | Omnifarmer | 职业 | BGA: computeBonusScore | 简单 |
| E148 | Lazybones | 职业 | BGA: listener | 中等 |
| E151 | DeliveryNurse | 职业 | BGA: listener | 中等 |
| E153 | StoneSculptor | 职业 | BGA: listener | 中等 |
| E155 | Visionary | 职业 | BGA: listener | 中等 |
| E159 | OldMiser | 职业 | BGA: listener | 中等 |
| E161 | ElderBaker | 职业 | BGA: PlayerActionCard | 需要 PlayerActionCard 基础设施 |
| E162 | Entrepreneur | 职业 | BGA: listener | 中等 |
| E166 | Roastmaster | 职业 | BGA: listener | 中等 |
| E167 | DairyCrier | 职业 | BGA: listener | 中等 |
| E9 | BarteringHut | 小改良 | BGA: listener | 中等 |

### ❌ 无文件但 BGA 有逻辑 (代表性)

| 卡牌ID | 名称 | 类型 | BGA 逻辑 | 复杂度 |
|--------|------|------|---------|--------|
| E9 | Bartering Hut | 小改良 | listener | 中等 |
| E11 | Petting Zoo | 小改良 | animal capacity modifier | 中等(需基础设施) |
| E12 | Animal Bedding | 小改良 | animal capacity modifier | 中等(需基础设施) |
| E13 | Stone House Reconstruction | 小改良 | anytime action | 中等(需基础设施) |
| E14 | Wood Saw | 小改良 | anytime action | 中等(需基础设施) |
| E15 | Pelts | 小改良 | listener | 简单 |
| E17 | Corn Sheaf | 小改良 | onBuy | 简单 |
| E18 | Clay Path | 小改良 | listener | 简单 |
| E19 | Wooden Path | 小改良 | listener | 简单 |
| E20 | Cattle Feed | 小改良 | listener | 简单 |
| E23 | Manger | 小改良 | onBuy + score | 简单 |
| E24 | Outhouse | 小改良 | effect | 简单 |
| E25 | Horse | 小改良 | listener | 中等 |
| E26 | Loom | 小改良 | onHarvest + score | 中等 |
| E28 | Future Planning | 小改良 | futureMeeples | 复杂(需基础设施) |
| E29 | Riding Plow | 小改良 | listener after Plow | 简单 |
| E31 | Dovecote | 小改良 | score | 简单 |
| E32 | Village Well | 小改良 | computeBonusScore | 简单 |
| E34 | Half-timbered House | 小改良 | computeBonusScore | 简单 |
| E35 | Corner Cupboard | 小改良 | computeBonusScore | 简单 |
| E37 | Mansion | 小改良 | computeBonusScore | 简单 |
| E38 | Storehouse | 小改良 | computeBonusScore | 简单 |
| E39 | Duck Pond | 小改良 | score | 简单 |
| E40 | Future Investment | 小改良 | futureMeeples | 复杂(需基础设施) |
| E41 | Future Harvest | 小改良 | futureMeeples | 复杂(需基础设施) |
| E42 | Future Fencing | 小改良 | futureMeeples | 复杂(需基础设施) |
| E43 | Future Building | 小改良 | futureMeeples | 复杂(需基础设施) |
| E44 | Future Sowing | 小改良 | futureMeeples | 复杂(需基础设施) |
| E45 | Future Renovation | 小改良 | futureMeeples | 复杂(需基础设施) |
| E46 | Future Growth | 小改良 | futureMeeples | 复杂(需基础设施) |
| E47 | Corn Storehouse | 小改良 | onHarvest + score | 中等 |
| E48 | Greenhouse | 小改良 | onHarvest + score | 中等 |
| E49 | Animal Pen | 小改良 | opponent interaction | 复杂(需基础设施) |
| E50 | Vegetable Garden | 小改良 | onBuy + score | 中等 |
| E54 | Grain Elevator | 小改良 | listener | 中等 |
| E55 | Windmill | 小改良 | listener + score | 中等 |
| E56 | Future Occupation | 小改良 | futureMeeples | 复杂(需基础设施) |
| E58 | Wild Boar Trap | 小改良 | listener after Collect | 简单 |
| E59 | Quarry | 小改良 | onRoundStart | 简单 |
| E60 | Building Material | 小改良 | onBuy | 简单 |
| E61 | Fruit Tree | 小改良 | onRoundStart + score | 中等 |
| E63 | Iron Oven | 小改良 | cooking exchange | 中等(需基础设施) |
| E64 | Simple Oven | 小改良 | cooking exchange | 中等(需基础设施) |
| E65 | Bean Field | 小改良 | onBuy + sow | 中等 |
| E66 | Reed Pond | 小改良 | listener | 简单 |
| E67 | Indoor Well | 小改良 | onRoundStart + score | 中等 |
| E68 | Herb Garden | 小改良 | onBuy | 简单 |
| E69 | Corn Scoop | 小改良 | listener after Sow | 简单 |
| E70 | Clay Mixer | 小改良 | listener after Collect | 简单 |
| E72 | Fish Trap | 小改良 | effect | 简单 |
| E77 | Market Cart | 小改良 | listener | 中等 |
| E79 | Grain Cart | 小改良 | listener after Collect | 简单 |
| E80 | Wooden Crane | 小改良 | listener | 中等 |
| E83 | Harvest Helper | 职业 | onHarvest | 简单 |
| E87 | Net Fisherman | 职业 | listener | 中等 |
| E88 | Plowman | 职业 | listener | 中等 |
| E89 | Hut Builder | 职业 | listener after Construct | 中等 |
| E94 | Clay Deliveryman | 职业 | listener after Collect | 简单 |
| E95 | Ratcatcher | 职业 | opponent interaction | 复杂(需基础设施) |
| E96 | Reeve | 职业 | listener | 中等 |
| E97 | Harvest Tradesman | 职业 | onHarvest | 简单 |
| E98 | Renovator | 职业 | listener after Renovation | 中等 |
| E99 | Stone Breaker | 职业 | listener | 中等 |
| E100 | Forester | 职业 | listener + score | 中等 |
| E102 | Mushroom Picker | 职业 | listener | 中等 |
| E104 | Brush Maker | 职业 | listener | 中等 |
| E105 | Seasonal Worker | 职业 | listener | 中等 |
| E106 | Stablehand | 职业 | listener | 中等 |
| E107 | Groom | 职业 | listener | 中等 |
| E108 | Shepherd | 职业 | listener | 中等 |
| E110 | Animal Keeper | 职业 | listener | 中等 |
| E111 | Manservant | 职业 | listener | 中等 |
| E113 | Stockman | 职业 | listener | 中等 |
| E114 | Consultant | 职业 | listener | 中等 |
| E115 | Reed Buyer | 职业 | listener after Collect | 简单 |
| E116 | Stone Deliveryman | 职业 | listener after Collect | 简单 |
| E117 | Grump | 职业 | listener | 中等 |
| E118 | Fence Overseer | 职业 | listener after Fencing | 中等 |
| E119 | Bricklayer | 职业 | listener | 中等 |
| E120 | Baker | 职业 | listener | 中等 |
| E121 | Wood Distributor | 职业 | listener | 中等 |
| E122 | Charcoal Burner | 职业 | listener | 中等 |
| E125 | Pastor | 职业 | listener | 中等 |
| E126 | Berry Picker | 职业 | listener | 中等 |
| E127 | Magician | 职业 | listener | 中等 |
| E129 | Cattleman | 职业 | listener | 中等 |
| E131 | Animal Dealer | 职业 | listener | 中等 |
| E132 | Clay Worker | 职业 | listener | 中等 |
| E135 | Merchant | 职业 | listener | 中等 |
| E136 | Greengrocer | 职业 | computeBonusScore | 简单 |
| E137 | Academic | 职业 | computeBonusScore | 简单 |
| E138 | Yeoman Farmer | 职业 | computeBonusScore | 简单 |
| E139 | Farmer | 职业 | computeBonusScore | 简单 |
| E140 | Educator | 职业 | computeBonusScore | 简单 |
| E141 | Head of the Family | 职业 | computeBonusScore | 简单 |
| E142 | Stonecutter | 职业 | listener | 中等 |
| E143 | Chamberlain | 职业 | listener | 中等 |
| E144 | Taster | 职业 | opponent interaction | 复杂(需基础设施) |
| E145 | Animal Farmer | 职业 | listener | 中等 |
| E146 | Storehouse Keeper | 职业 | listener | 中等 |
| E147 | Wooden Hut Builder | 职业 | listener after Construct | 中等 |
| E149 | Pig Breeder | 职业 | listener | 中等 |
| E150 | Wood Cutter | 职业 | listener | 中等 |
| E152 | Cattle Whisperer | 职业 | listener | 中等 |
| E154 | Estate Manager | 职业 | opponent interaction | 复杂(需基础设施) |
| E156 | Chief | 职业 | opponent interaction | 复杂(需基础设施) |
| E157 | Plow Driver | 职业 | listener | 中等 |
| E158 | Fence Builder | 职业 | listener after Fencing | 中等 |
| E160 | Tinsmith | 职业 | opponent interaction | 复杂(需基础设施) |
| E163 | Woolgrower | 职业 | listener | 中等 |
| E164 | Hide Farmer | 职业 | listener | 中等 |
| E165 | Night Watchman | 职业 | listener | 中等 |
| E166 | (see above) | 职业 | (已实现) | — |
| E168 | Fieldworker | 职业 | listener | 中等 |
| E169 | Pig Farmer | 职业 | listener | 中等 |

---

## 附录：已实现卡牌完整列表

### 全部 72 张已实现卡 (按 Deck 排列)

```
A: A17, A28, A29, A37, A53, A55, A64, A65, A74, A79, A81, A83, A84, A88,
   A94, A97, A105, A108, A109, A110, A112, A126, A128, A136, A144, A166
B: B34, B65, B67, B70, B75, B94, B100, B103, B109, B151
C: C24, C25, C37, C52, C60, C63, C71, C75, C88, C96, C120, C133, C144
D: D14, D49, D51, D99, D107, D115, D119, D150, D152, D167
E: E10, E21, E33, E52, E53, E57, E73, E74, E84, E101, E112, E128, E130, E133
```

### Hook 覆盖矩阵

| Hook 类型 | 使用的卡牌 |
|----------|-----------|
| before | A17, A65, A81, A126, B34, B67, B75, B94, B109, C60, C88, D14, D49, D51, D119, D152, E74, E101, E130 |
| during | A55, E53, E84, E133 |
| immediatelyAfter | A83, A108, C25, C52, C96, C144, E33 |
| after | A17, A37, A55, A74, A79, A83, A105, A108, A109, A110, A128, A144, B34, B94, B100, B103, B109, B151, C75, C88, C120, C133, C144, D99, D150, E33, E52, E57, E101, E128 |
| computeCosts | A128, C37, C88, E130 |
| computeArgs | A28, A94, B151 |
| computeReplace | A94, A97, B103 |
| computeBonusScore | A136, C133 |
| isDoable | A65, A94, A97, A126, B67, B75, B94, B103, B109, C60, C88, D14, D49, D119, D152, E74, E101 |
| canUseOccupied | A28, B151, E21 |
| onBuy | A53, A74, A112, A136, A144, B65, C24, C60, C144, D51, D99, D167, E33, E74 |
| onPlay | A94, A97, A105, A108, A109, A110, A112, A136, A144, A166, B94, B100, B103, B109, B151, C88, C96, C120, C133, D99, D107, D115, D119, D150, D152, D167, E101, E112, E128, E130, E133 |
| onReturnHome | A29, A53, A84, C75 |
| onRoundStart | A81 |
| onHarvest | A112, C63, E112 |
| effect | A28, A29, A53, A55, A64, A65, A74, A81, A84, A94, A112, A136, A144, A166, B65, B70, B75, B94, B151, C24, C60, C63, C71, C75, C88, C120, C133, C144, D49, D51, D99, D107, D115, D150, D167, E10, E33, E52, E73, E74, E84, E112, E133 |
