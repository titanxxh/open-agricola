# 卡牌实现示例与Hook覆盖清单

## 原子行动 Hook 覆盖矩阵

说明：每个原子行动在各 Hook 点至少给出一张卡牌示例；无示例则标记为“—”。

| 原子行动 | Before | During | ImmediatelyAfter | After | ComputeCosts | ComputeArgs | ComputeReplace | IsDoable |
|---|---|---|---|---|---|---|---|---|
| PlaceFarmer | — | Master Workman（实现状态：false） | Steam Machine（实现状态：false） | Firewood Collector（实现状态：false） | — | Master Workman（实现状态：false） | — | — |
| Collect | — | Boar Spear（实现状态：false） | Mushroom Collector（实现状态：false） | Reclamation Plow（实现状态：false） | — | — | — | — |
| Gain | — | Boar Spear（实现状态：false） | — | Claypipe（实现状态：false） | — | — | — | — |
| Construct | — | — | — | Roughcaster（实现状态：false） | Riparian Builder（实现状态：false） | — | — | — |
| Plow | — | — | — | Barrow Pusher（实现状态：false） | Dwelling Mound（实现状态：false） | — | — | — |
| FirstPlayer | — | — | — | — | — | — | — | — |
| Improvement | Wood Workshop（实现状态：false） | Junk Room（实现状态：false） | Merchant（实现状态：false） | Small Trader（实现状态：false） | — | — | Field Merchant（实现状态：false） | Wood Workshop（实现状态：false） |
| Sow | Seed Pellets（实现状态：false） | — | — | Garden Hoe（实现状态：false） | — | — | Lazy Sowman（实现状态：false） | Lazy Sowman（实现状态：false） |
| Stables | — | — | — | Stable Tree（实现状态：false） | Carpenter's Apprentice（实现状态：false） | — | — | — |
| Renovation | Hammer Crusher（实现状态：false） | — | — | Bucksaw（实现状态：false） | Frame Builder（实现状态：false） | — | — | Hammer Crusher（实现状态：false） |
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

## 主路径特判卡牌清单（非Hook机制）

### Models

- 行动位占用规则：B151_LittlePeasant（实现状态：false）
- 动物摆放合法性：E33_BeaverColony（实现状态：false）、E36_HerbalGarden（实现状态：false）
- 犁地能力：C17_NewlyPlowedField（实现状态：false）
- 空田计分修正：Garden Designer（实现状态：false）
- 房间容量/额外房间：A10_WoodenShed（实现状态：false）、B10_Caravan（实现状态：false）、D85_Reader（实现状态：false）、C10_BunkBeds（实现状态：false）、A85_Homekeeper（实现状态：false）、Den Builder（实现状态：false）、Master Tanner（实现状态：false）、A127_Lodger（实现状态：false）
- 额外放置农夫来源：Guest Room（实现状态：false）
- 收获喂食与繁殖特判：E30_ChildsToy（实现状态：false）、E159_OldMiser（实现状态：false）
- 繁殖后强制整理白名单：E90_DungCollector（实现状态：false）、D115_FodderPlanter（实现状态：false）、Omnifarmer（实现状态：false）、E133_ChampionBreeder（实现状态：false）、C71_Slurry（实现状态：false）
- 繁殖猪触发特效：Boar Spear（实现状态：false）
- 潜在条件错误：E84_DollysMother（实现状态：false）

### Actions

- WishChildren 特判：E155_Visionary（实现状态：false）、E151_DeliveryNurse（实现状态：false）、E92_FieldDoctor（实现状态：false）、Child Ombudsman（实现状态：false）
- Reorganize 特判：Reclamation Plow（实现状态：false）、B34_SpecialFood（实现状态：false）、D164_PetGrower（实现状态：false）、E36_HerbalGarden（实现状态：false）、E33_BeaverColony（实现状态：false）
- Reorganize 收获繁殖特判：E84_DollysMother（实现状态：false）
- Renovation 特判：A87_Conservator（实现状态：false）、C13_WoodSlideHammer（实现状态：false）、Hammer Crusher（实现状态：false）
- Reap 特判：A106_SlurrySpreader（实现状态：false）
- Pay 特判：A41_VegetableSlicer（实现状态：false）
- Improvement 特判：C27_Blueprint（实现状态：false）、Carpenter's Yard（实现状态：false）、D131_CraftsmanshipPromoter（实现状态：false）、E91_PlowBuilder（实现状态：false）、E109_BraidMaker（实现状态：false）、E161_ElderBaker（实现状态：false）
- Improvement purchaseCondition 特判：A23_StoneCompany（实现状态：false）
- Fencing 特判：E16_BriarHedge（实现状态：false）、Ash Trees（实现状态：false）
- Fencing 约束名特判：B2_MiniPasture（实现状态：false）、B15_CarpentersBench（实现状态：false）、B149_OpenAirFarmer（实现状态：false）
- Exchange 特判：E124_MayorCandidate（实现状态：false）
- Construct 特判：A14_CarpentersHammer（实现状态：false）
- Gain 特判：C86_LivestockFeeder（实现状态：false）

### States

- TurnTrait 特判：Telegram（实现状态：false）、D53_TeaHouse（实现状态：false）、Work Permit（实现状态：false）、Guest Room（实现状态：false）、E62_SourDough（实现状态：false）、E93_Motivator（实现状态：false）
- HarvestTrait 特判：E153_StoneSculptor（实现状态：false）、A148_Woolgrower（实现状态：false）、B86_TruffleSearcher（实现状态：false）

### Managers

- Scores 特判：Hide Farmer（实现状态：false）、E159_OldMiser（实现状态：false）、C135_Constable（实现状态：false）、D100_LordoftheManor（实现状态：false）、C31_WritingChamber（实现状态：false）、Chapel（实现状态：false）

### Core

- Stats 特判：D36_BreedRegistry（实现状态：false）
