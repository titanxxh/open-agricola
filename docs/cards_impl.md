# 卡牌实现示例与Hook覆盖清单

## 原子行动 Hook 覆盖矩阵

说明：每个原子行动在各 Hook 点至少给出一张卡牌示例；无示例则标记为“—”。

> 说明（2026-02-23 更新）：`src/actions/hook-matrix.ts` 与 `src/actions/__tests__/hook-matrix.test.ts` 已改为基于真实注册的 action hooks / card listeners 生成覆盖矩阵。本文表格保留为“人工索引视图”，以测试输出为准。

| 原子行动 | Before | During | ImmediatelyAfter | After | ComputeCosts | ComputeArgs | ComputeReplace | IsDoable |
|---|---|---|---|---|---|---|---|---|
| PlaceFarmer | — | Master Workman（实现状态：false） | Steam Machine（实现状态：false） | Firewood Collector（实现状态：false） | — | Master Workman（实现状态：false） | Huntsman's Hat（实现状态：false） | — |
| Collect | — | Boar Spear（实现状态：false） | Mushroom Collector（实现状态：false） | Reclamation Plow（实现状态：false） | — | — | — | — |
| Gain | — | Boar Spear（实现状态：false） | — | Claypipe（实现状态：false） | — | — | — | — |
| Construct | — | — | — | Roughcaster（实现状态：false） | Riparian Builder（实现状态：false） | — | — | — |
| Plow | — | — | — | Barrow Pusher（实现状态：false） | Dwelling Mound（实现状态：false） | — | — | — |
| FirstPlayer | — | — | — | — | — | — | — | — |
| Improvement | Wood Workshop（实现状态：false） | Junk Room（实现状态：false） | Merchant（实现状态：false） | Small Trader（实现状态：false） | — | — | Field Merchant（实现状态：false） | Wood Workshop（实现状态：false） |
| Sow | Seed Pellets（实现状态：false） | — | — | Garden Hoe（实现状态：false） | — | — | Lazy Sowman（实现状态：false） | Lazy Sowman（实现状态：false） |
| Stables | — | — | — | Stable Tree（实现状态：false） | Carpenter's Apprentice（实现状态：false） | — | — | — |
| Renovation | Hammer Crusher（实现状态：false） | — | Reed Roof Renovator（实现状态：false） | Bucksaw（实现状态：false） | Frame Builder（实现状态：false） | — | — | Hammer Crusher（实现状态：false） |
| Fencing | Ash Trees（实现状态：false） | — | Shepherd's Crook（实现状态：false） | Sequestrator（实现状态：false） | Hedge Keeper（实现状态：false） | — | — | Stock Protector（实现状态：false） |
| WishChildren | — | — | — | Godly Spouse（实现状态：false） | — | — | — | Overachiever（实现状态：false） |
| Pay | — | — | — | Grain Depot（实现状态：false） | — | — | — | — |
| Reorganize | — | — | — | Slurry Spreader（实现状态：false） | — | — | — | — |
| Exchange | Hand Truck（实现状态：false） | — | — | Claypipe（实现状态：false） | — | — | Freshman（实现状态：false） | Freshman（实现状态：false） |
| Occupation | Paper Maker（实现状态：false） | — | — | Clutterer（实现状态：false） | Forest School（实现状态：false） | — | — | Paper Maker（实现状态：false） |
| ActivateCard | — | — | — | — | — | — | — | — |
| SpecialEffect | Reclamation Plow（实现状态：false） | — | — | — | — | — | — | — |
| Receive | — | Boar Spear（实现状态：false） | — | Claypipe（实现状态：false） | — | — | — | — |
| Reap | — | — | — | Barley Mill（实现状态：false） | — | — | — | — |
| PlaceFutureMeeples | — | — | — | — | — | — | — | — |
| PlaceMeeplesFromSupply | — | — | — | — | — | — | — | — |

## 行动卡 Hook 示例

| Hook 类型 | 示例卡牌 | 说明 |
|---|---|---|
| isActionCardEvent | Profiteering（实现状态：false） | 指定行动卡 ID 触发 |
| isActionCardEvent（多空间） | Royal Wood（实现状态：false） | 多个行动空间触发 |
| isActionCardTurnEvent | New Market（实现状态：false） | 指定回合区间的行动卡触发 |
| isActionCardTurnEvent（1-4轮） | Master Workman（实现状态：false） | 指定轮次范围触发 |
| isCollectEvent | Stone Axe（实现状态：false） | 累积格/收取事件触发 |

## SpecialEffect 卡牌清单

### 交互型（需 SpecialEffect.js 前端处理）

这些卡牌在前端交互层存在同名处理器：

- Paper Knife（实现状态：false）
- Illusionist（实现状态：false）
- Asparagus Knife（实现状态：false）
- Lifting Machine（实现状态：false）
- Changeover（实现状态：false）
- Silage（实现状态：false）
- Game Provider（实现状态：false）
- Roll-Over Plow（实现状态：false）
- D70_StrawManure（实现状态：false）
- Stable Manure（实现状态：false）
- Clearing Spade（实现状态：false）
- Scythe Worker（实现状态：false）
- Crudité（实现状态：false）
- Craft Brewery（实现状态：false）
- Collector（实现状态：false）
- Hide Farmer（实现状态：false）
- Trade Teacher（实现状态：false）
- Guest Room（实现状态：false）
- Drudgery Reeve（实现状态：false）
- Tinsmith Master（实现状态：false）
- Soldier（实现状态：false）
- Archway（实现状态：false）
- Sheep Inspector（实现状态：false）
- Sample Stable Maker（实现状态：false）
- Thunderbolt（实现状态：false）
- Straw Hat（实现状态：false）
- Cow Patty（实现状态：false）
- Scythe（实现状态：false）
- Lumber Pile（实现状态：false）
- Sleight of Hand（实现状态：false）
- Lazybones（实现状态：false）
- Ash Trees（实现状态：false）
- Grain Thief（实现状态：false）
- Master Tanner（实现状态：false）

### 自动型（Cards 内使用 SPECIAL_EFFECT）

#### A
- Adoptive Parents（实现状态：false）
- Stable Planner（实现状态：false）
- Silage（实现状态：false）
- Work Certificate（实现状态：false）
- Interim Storage（实现状态：false）
- Calcium Fertilizers（实现状态：false）
- Clearing Spade（实现状态：false）
- Lifting Machine（实现状态：false）
- Asparagus Knife（实现状态：false）
- Claypipe（实现状态：false）
- Potter's Yard（实现状态：false）
- Paper Knife（实现状态：false）
- Chapel（实现状态：false）
- Ale-Benches（实现状态：false）
- Telegram（实现状态：false）
- Reclamation Plow（实现状态：false）
- Pig Breeder（实现状态：false）
- Forest Tallyman（实现状态：false）
- Sequestrator（实现状态：false）
- Riverine Shepherd（实现状态：false）
- Drudgery Reeve（实现状态：false）
- Scythe Worker（实现状态：false）

#### B
- Handcart（实现状态：false）
- Ceilings（实现状态：false）
- Hand Truck（实现状态：false）
- Maintenance Premium（实现状态：false）
- Forest Stone（实现状态：false）
- Forest Inn（实现状态：false）
- Moonshine（实现状态：false）
- Final Scenario（实现状态：false）
- B21_HayloftBarn（实现状态：false）
- Moldboard Plow（实现状态：false）
- Game Provider（实现状态：false）
- Illusionist（实现状态：false）
- Trimmer（实现状态：false）
- Tinsmith Master（实现状态：false）

#### C
- Garden Designer（实现状态：false）
- Inner Districts Director（实现状态：false）
- Plant Fertilizer（实现状态：false）
- Mason（实现状态：false）
- Den Builder（实现状态：false）
- Perennial Rye（实现状态：false）
- Firewood（实现状态：false）
- Craft Brewery（实现状态：false）
- Crudité（实现状态：false）
- Fishing Net（实现状态：false）
- Beer Table（实现状态：false）
- Steam Machine（实现状态：false）
- Bed in the Grain Field（实现状态：false）
- Job Contract（实现状态：false）
- Overhaul（实现状态：false）
- Swing Plow（实现状态：false）
- Roll-Over Plow（实现状态：false）
- Animal Catcher（实现状态：false）
- Forest Owner（实现状态：false）
- Hoof Caregiver（实现状态：false）
- Mud Wallower（实现状态：false）
- Market Crier（实现状态：false）
- Soldier（实现状态：false）
- Outskirts Director（实现状态：false）
- Agricultural Labourer（实现状态：false）
- Sower（实现状态：false）
- Collector（实现状态：false）

#### D
- Transactor（实现状态：false）
- Henpecked Husband（实现状态：false）
- Sheep Inspector（实现状态：false）
- Child Ombudsman（实现状态：false）
- Royal Wood（实现状态：false）
- Stable Manure（实现状态：false）
- Changeover（实现状态：false）
- D70_StrawManure（实现状态：false）
- Potter Ceramics（实现状态：false）
- Archway（实现状态：false）
- Retraining（实现状态：false）
- Carpenter's Yard（实现状态：false）
- Pioneering Spirit（实现状态：false）
- Work Permit（实现状态：false）
- Turnwrest Plow（实现状态：false）
- Pure Breeder（实现状态：false）
- Bean Counter（实现状态：false）
- Party Organizer（实现状态：false）
- Godly Spouse（实现状态：false）
- Hammer Crusher（实现状态：false）
- Trade Teacher（实现状态：false）
- Oyster Eater（实现状态：false）
- Hide Farmer（实现状态：false）
- Hardworking Man（实现状态：false）
- Field Cultivator（实现状态：false）
- Emissary（实现状态：false）
- Tree Inspector（实现状态：false）
- Stork's Nest（实现状态：false）
- Bellfounder（实现状态：false）
- Canal Boatman（实现状态：false）
- Sample Stable Maker（实现状态：false）
- Sugar Baker（实现状态：false）

#### E
- Pen Builder（实现状态：false）
- Master Tanner（实现状态：false）
- Alchemists Lab（实现状态：false）
- Sleight of Hand（实现状态：false）
- Lumber Pile（实现状态：false）
- Ash Trees（实现状态：false）
- Scythe（实现状态：false）
- Cow Patty（实现状态：false）
- Night Loot（实现状态：false）
- Boar Spear（实现状态：false）
- Cubbyhole（实现状态：false）
- Whale Oil（实现状态：false）
- Thunderbolt（实现状态：false）
- Piggy Bank（实现状态：false）
- Guest Room（实现状态：false）
- Dairy Crier（实现状态：false）
- Roastmaster（实现状态：false）
- Entrepreneur（实现状态：false）
- Lazybones（实现状态：false）
- Omnifarmer（实现状态：false）
- Resource Hoarder（实现状态：false）
- Grain Thief（实现状态：false）
- Straw Hat（实现状态：false）
- Wolf（实现状态：false）

### SpecialEffect 分类细化（实现视角）

`SpecialEffect` 的分流逻辑在 [special-effect.ts](../src/actions/effects/special-effect.ts)：  
当前 open-agricola 仍以“占位 action + hook/listener 扩展”作为主实现，`SpecialEffect` 交互链路仍在持续补齐中。

- 自动执行型（无需额外交互）  
  - 典型：效果在 action/hook 中直接结算  
  - 示例：`A39_Chapel`、`E51_WhaleOil`、`D74_RoyalWood`（卡牌定义见 `src/actions/cards`）
- 交互输入型（需要 UI 选择）  
  - 典型：通过 `pendingChoice` 与 `resolveChoice` 完成交互  
  - 入口：[GameContainer.tsx](../src/app/GameContainer.tsx)、[use-engine-flow.ts](../src/app/hooks/use-engine-flow.ts)  
  - 示例：`A71_ClearingSpade`、`C104_Collector`、`D137_TradeTeacher`、`E78_SleightofHand`
- 多阶段链式型（同一卡多步骤）  
  - 典型：`choice -> followUpActions -> reorg/finalize`  
  - 示例：`E76_LumberPile`、`D102_SampleStableMaker`、`C146_WorkshopAssistant`（未实现）
- 标记/状态机辅助型（流程控制而非直接收益）  
  - 典型：通过 hook phase 与容器状态推进流程  
  - 入口：[hooks.ts](../src/actions/hooks.ts)、[card-listeners.ts](../src/actions/cards/card-listeners.ts)
- 规则补丁型（与状态/行动联动）  
  - 典型：在特殊时机插入分支或改写 action  
  - 示例：`A22_Telegram`、`D22_WorkPermit`、`E53_BoarSpear`

## 主路径特判卡牌清单（遗漏补充）

现有“主路径特判”章节覆盖了大量点，下面补充与 open-agricola 对应的主路径入口。

### Models（补充）

- `Farm/Board`：`D75_WoodField`、`E80_RockGarden` 这类“田地变体”应关注 [farm.ts](../src/game/farm.ts)、[farm.ts](../src/logic/farm.ts)
- `Player`：`B85_FarmHand` 额外房间与放置容量链路可对照 [types.ts](../src/game/types.ts)、[house.ts](../src/actions/effects/house.ts)
- `PlayerActionCard`：`B151_LittlePeasant` 行动位占用绕过逻辑可对照 [types.ts](../src/actions/cards/types.ts)、[place-farmer.ts](../src/actions/effects/place-farmer.ts)

### Actions（补充）

- `Collect/Gain/Receive/Exchange`：`A53_Claypipe` 跨动作计数触发 [collect.ts](../src/actions/effects/collect.ts) [gain.ts](../src/actions/effects/gain.ts) [receive.ts](../src/actions/effects/receive.ts) [exchange.ts](../src/actions/effects/exchange.ts)
- `Sow`：`E17_SkimmerPlow`（未实现）可对照 [sow.ts](../src/actions/effects/sow.ts)
- `Pay`：`D60_LargePottery`（未实现）、`E123_ResourceHoarder` 的费用路径 [pay.ts](../src/actions/effects/pay.ts)
- `Stables`：`C88_CarpentersApprentice` 可建数量/成本分支 [stables.ts](../src/actions/effects/stables.ts)

### Managers / Core（补充）

- 回合与可放置农夫位统计：`A10/A127/B10/C85/D85/E85` 相关入口 [use-turn-flow.ts](../src/app/hooks/use-turn-flow.ts) [use-round-flow.ts](../src/app/hooks/use-round-flow.ts)
- 围栏/动物归属联动：`E149_MidnightFencer`（未实现）可对照 [fencing.ts](../src/actions/effects/fencing.ts) [animals.ts](../src/actions/effects/animals.ts)
- 特殊通知与日志：`A71_ClearingSpade`、`C51_FishingNet`、`E4_Thunderbolt` 相关入口 [GameContainer.tsx](../src/app/GameContainer.tsx)

## 可成为行动格的卡牌总结

“可成为行动格”建议按实现机制分两类维护：

### A. `PlayerActionCard`（核心实现，真正可被占用）

这些卡牌在 open-agricola 以 `PlayerActionCard` 语义建模（部分仍为数据层占位）：

- [E81_AlchemistsLab.ts](../src/actions/cards/E/E81_AlchemistsLab.ts)
- [E161_ElderBaker.ts](../src/actions/cards/E/E161_ElderBaker.ts)
- [D51_Archway.ts](../src/actions/cards/D/D51_Archway.ts)
- [D23_PioneeringSpirit.ts](../src/actions/cards/D/D23_PioneeringSpirit.ts)
- [D116_TreeInspector.ts](../src/actions/cards/D/D116_TreeInspector.ts)
- [C162_ForestOwner.ts](../src/actions/cards/C/C162_ForestOwner.ts)
- [C104_Collector.ts](../src/actions/cards/C/C104_Collector.ts)
- [B42_ForestInn.ts](../src/actions/cards/B/B42_ForestInn.ts)
- [A39_Chapel.ts](../src/actions/cards/A/A39_Chapel.ts)
- [A162_ForestTallyman.ts](../src/actions/cards/A/A162_ForestTallyman.ts)

### B. 行动格交互增强（不是新行动格本体）

- “从某行动格挪人再执行”类：`D51_Archway`、`E10_StrawHat`
- “在行动格上放置组件形成后续收益”类：`E148_Lazybones`
- “借行动格触发额外流程”类：`D151_SpinDoctor`（未实现）等

## 卡牌上有“堆叠/存放东西”的卡牌总结

建议按“数据承载方式”分为三类：

### 1) 实体资源堆叠（资源真实放在卡牌/区域语义）

代表：

- [E103_Wolf.ts](../src/actions/cards/E/E103_Wolf.ts)
- [E123_ResourceHoarder.ts](../src/actions/cards/E/E123_ResourceHoarder.ts)
- [D126_FieldCultivator.ts](../src/actions/cards/D/D126_FieldCultivator.ts)
- [B21_HayloftBarn.ts](../src/actions/cards/B/B21_HayloftBarn.ts)
- `A102_Grocer`（未实现）

### 2) 计数器型堆叠（状态计数，不一定放实体）

代表：

- [A53_Claypipe.ts](../src/actions/cards/A/A53_Claypipe.ts)
- [D74_RoyalWood.ts](../src/actions/cards/D/D74_RoyalWood.ts)
- [C148_MudWallower.ts](../src/actions/cards/C/C148_MudWallower.ts)
- [E85_MasterTanner.ts](../src/actions/cards/E/E85_MasterTanner.ts)
- [D132_HideFarmer.ts](../src/actions/cards/D/D132_HideFarmer.ts)

### 3) “卡即田地/卡即容器”型（location 语义扩展）

- 卡即田地：`D75_WoodField`、`E80_RockGarden`（未实现）
- 卡即动物容器：`B11_Feedyard`、`B148_PetBroker`、`D86_SheepAgent`、`E11_PettingZoo`（未实现）

## 主路径特判卡牌清单（非Hook机制）

### Models

- 行动位占用规则：`B151_LittlePeasant` [B151_LittlePeasant.ts](../src/actions/cards/B/B151_LittlePeasant.ts) [place-farmer.ts](../src/actions/effects/place-farmer.ts)
- 动物摆放合法性：`E33_BeaverColony`、`E36_HerbalGarden` [animals.ts](../src/actions/effects/animals.ts)
- 犁地能力：`C17_NewlyPlowedField` [plow.ts](../src/actions/effects/plow.ts)
- 空田计分修正：`C99_GardenDesigner` [scoring.ts](../src/logic/scoring.ts)
- 房间容量/额外房间：`A10_WoodenShed`、`B10_Caravan`、`D85_Reader`、`C10_BunkBeds`、`A85_Homekeeper`、`C85_DenBuilder`、`E85_MasterTanner`、`A127_Lodger` [types.ts](../src/game/types.ts) [house.ts](../src/actions/effects/house.ts)
- 额外放置农夫来源：`E22_GuestRoom` [E22_GuestRoom.ts](../src/actions/cards/E/E22_GuestRoom.ts)
- 收获喂食与繁殖特判：`E30_ChildsToy`、`E159_OldMiser` [use-harvest-flow.ts](../src/app/hooks/use-harvest-flow.ts)
- 繁殖后强制整理白名单：`E90_DungCollector`、`D115_FodderPlanter`、`E134_Omnifarmer`、`E133_ChampionBreeder`、`C71_Slurry` [use-harvest-flow.ts](../src/app/hooks/use-harvest-flow.ts)
- 繁殖猪触发特效：`E53_BoarSpear` [card-hooks.ts](../src/actions/hooks/card-hooks.ts)
- 潜在条件错误：`E84_DollysMother` [E84_DollysMother.ts](../src/actions/cards/E/E84_DollysMother.ts)

### Actions

- WishChildren 特判：`E155_Visionary`、`E151_DeliveryNurse`、`E92_FieldDoctor`、`D92_ChildOmbudsman` [round-wish-children.ts](../src/actions/cards/action/round-wish-children.ts)
- Reorganize 特判：`A17_ReclamationPlow`、`B34_SpecialFood`、`D164_PetGrower`、`E36_HerbalGarden`、`E33_BeaverColony` [reorganize.ts](../src/actions/effects/reorganize.ts)
- Reorganize 收获繁殖特判：`E84_DollysMother` [use-animal-reorg-flow.ts](../src/app/hooks/use-animal-reorg-flow.ts)
- Renovation 特判：`A87_Conservator`、`C13_WoodSlideHammer`、`D14_HammerCrusher` [renovation.ts](../src/actions/effects/renovation.ts)
- Reap 特判：`A106_SlurrySpreader` [reap.ts](../src/actions/effects/reap.ts)
- Pay 特判：`A41_VegetableSlicer` [pay.ts](../src/actions/effects/pay.ts)
- Improvement 特判：`C27_Blueprint`、`D26_CarpentersYard`、`D131_CraftsmanshipPromoter`、`E91_PlowBuilder`、`E109_BraidMaker`、`E161_ElderBaker` [improvement.ts](../src/actions/effects/improvement.ts)
- Improvement 指定 Major 列表特判 [round-major-improvement.ts](../src/actions/cards/action/round-major-improvement.ts)
- Improvement purchaseCondition 特判：`A23_StoneCompany` [A23_StoneCompany.ts](../src/actions/cards/A/A23_StoneCompany.ts)
- Fencing 特判：`E16_BriarHedge`、`E74_AshTrees` [fencing.ts](../src/actions/effects/fencing.ts)
- Fencing 约束名特判：`B2_MiniPasture`、`B15_CarpentersBench`、`B149_OpenAirFarmer` [fencing.ts](../src/actions/effects/fencing.ts)
- Exchange 特判：`E124_MayorCandidate` [exchange.ts](../src/actions/effects/exchange.ts)
- Construct 特判：`A14_CarpentersHammer` [house.ts](../src/actions/effects/house.ts)
- Gain 特判：`C86_LivestockFeeder` [gain.ts](../src/actions/effects/gain.ts)

### States

- TurnTrait 特判：`A22_Telegram`、`D53_TeaHouse`、`D22_WorkPermit`、`E22_GuestRoom`、`E62_SourDough`、`E93_Motivator` [use-round-flow.ts](../src/app/hooks/use-round-flow.ts) [GameContainer.tsx](../src/app/GameContainer.tsx)
- HarvestTrait 特判：`E153_StoneSculptor`、`A148_Woolgrower`、`B86_TruffleSearcher` [use-harvest-flow.ts](../src/app/hooks/use-harvest-flow.ts)

### Managers

- Scores 特判：`D132_HideFarmer`、`E159_OldMiser`、`C135_Constable`、`D100_LordoftheManor`、`C31_WritingChamber`、`A39_Chapel` [scoring.ts](../src/logic/scoring.ts)

### Core

- Stats 特判：`D36_BreedRegistry` [D36_BreedRegistry.ts](../src/actions/cards/D/D36_BreedRegistry.ts)
