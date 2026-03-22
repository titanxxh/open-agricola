# 卡牌实现进度追踪

本文追踪所有卡牌的实现状态，参考自 `../bga-agricola` 项目。

注：`A92_AdoptiveParents` 已更正为职业卡；若按卡牌类型排查行为，请以职业路径为准，不再按小改良归类。
注：最近一次工程同步中，固定 WS 持久化房间 `dev` 已改为按 URL 中的 `player=p1/p2` 绑定固定座位；该调整不改变本文件中的卡牌实现统计。
注：行动格开放性判定已新增一层 flow 自动合成能力。当前顶层 `or` / `xor` 复合行动格，以及一批安全 `seq` 包装行动格，会递归读取子行动的 `isDoable` 与其 hooks / listeners，减少行动卡文件中的重复可执行性条件。
注：与卡牌相关的 `card-choice`、播种/围栏/扩建等多步选择，现统一通过服务端 `interaction` 快照向前端暴露；前端不再本地推导这些卡牌/行动带来的可选目标。
注：`construct`、`stables`、`plow`、`fence` 这类农场选格动作的支付也继续向统一 payment pipeline 收口；若存在多种合法支付法，会追加同一类 `prompt.selectPayment` 选择，而不是在服务器提交阶段静态取首个方案。
注：`prompt.selectPayment` 中涉及返还/使用卡牌的选项文案，现已优先显示可读卡名，不再直接暴露 `Major_*` / 内部 card id。
注：可插入的 `anytime` 动作已接入 BGA 风格根前插 flow，像 `bake-bread`、`anytime-reorg` 这类中断动作执行后会回到原本的待完成交互。
注：小改良/行动卡的出牌可执行性现在会统一校验卡面 prerequisite。当前已接入 `occupationPrerequisites` 以及一批常见文本前提（如 `2 Fields`、`2 Major Improvements`、`Cooking Improvement`、`1 Baking Improvement`）；因此像 `E81_AlchemistsLab`、`A84_Silage` 这类卡会同时在“可选项展示”和“服务端最终提交”两层生效。
注：本轮仅同步“原子行动 Hook 覆盖矩阵”涉及卡牌的状态。对 `Harvest`、`StartOfTurn` 等更偏阶段性的格子，会在说明中标注当前是否已通过 `card-effects.ts` 接入；其中 `B70_NewPurchase`、`A166_Haydryer`、`D99_EarthenwarePotter` 已进一步切到服务端阶段 flow，不再是即时 imperative 结算。

## 图例

- ✅ 已实现 - 卡牌已在 open-agricola 中实现
- ⏳ 进行中 - 卡牌正在实现中
- ❌ 未实现 - 卡牌尚未实现
- 🔧 部分实现 - 卡牌已定义但缺少部分功能（如 Hook）

## 统计概览

| 类型 | 总数 | 已实现 | 部分实现 | 未实现 |
|------|------|--------|----------|--------|
| Major Improvements | 10 | 10 | 0 | 0 |
| A Deck | 180 | 27 | 22 | 131 |
| B Deck | 180 | 9 | 19 | 152 |
| C Deck | 180 | 13 | 29 | 138 |
| D Deck | 180 | 11 | 30 | 139 |
| E Deck | 168 | 8 | 38 | 122 |
| **总计** | **898** | **78** | **138** | **682** |

---

## Major Improvements (大改良) - 10/10 ✅

| ID | 名称 | 状态 |
|----|------|------|
| Major_Basket | Basket | ✅ |
| Major_ClayOven | Clay Oven | ✅ |
| Major_CookingHearth1 | Cooking Hearth (1) | ✅ |
| Major_CookingHearth2 | Cooking Hearth (2) | ✅ |
| Major_Fireplace1 | Fireplace (1) | ✅ |
| Major_Fireplace2 | Fireplace (2) | ✅ |
| Major_Joinery | Joinery | ✅ |
| Major_Pottery | Pottery | ✅ |
| Major_StoneOven | Stone Oven | ✅ |
| Major_Well | Well | ✅ |

---

## Hook 覆盖矩阵代表性卡牌

以下卡牌在 Hook 覆盖矩阵中被选为代表性示例；若某些效果当前通过 `card-effects.ts` 接入，也会在说明中注明。

### Before Hook
| 卡牌 | 行动 | 说明 | 状态 |
|------|------|------|------|
| B75_WoodWorkshop | Improvement | 打改良前通过 before flow 获得 1 木材，并通过 IsDoable 放宽改良行动可执行性 | ✅ |
| A65_SeedPellets | Sow | 播种前通过 before flow 获得 1 谷物 | ✅ |
| D14_HammerCrusher | Renovation | 泥屋翻修前通过 before flow 获得 2 黏土和 1 芦苇，并可追加一次可选建房 | ✅ |
| E74_AshTrees | Fencing | 打出时初始化免费围栏存量；围栏前通过 before flow 选择本次使用几段免费围栏，并由 `isDoable` 放宽可执行性 | ✅ |
| B67_HandTruck | BakeBread | 烤面包前按本轮占据的累积格人数，通过 before flow 获得等量谷物 | ✅ |
| A126_MasterWorkman | PlaceFarmer | 在 1-4 轮行动格放人前获得对应资源 | ✅ |
| E101_Blighter | Occupation | 打出时按剩余完整阶段给 bonus VP，之后封锁 `play-occupation` | ✅ |
| B34_SpecialFood | Collect | 动物累积格收取前后检测是否全部收容，兑现等量 bonus VP（一次性） | ✅ |
| A166_Haydryer | Harvest | 收获前效果，当前走 `onBeforeHarvest` 阶段 flow | ✅ |
| C133_Soldier | EndOfGame | 游戏结束时 | ❌ |
| B70_NewPurchase | StartOfTurn | 回合开始前结算购买效果，当前走 `onBeforeStartOfTurn` 阶段 flow | ✅ |

### During Hook
| 卡牌 | 行动 | 说明 | 状态 |
|------|------|------|------|
| E53_BoarSpear | Collect | 收取时交换资源 | ✅ |
| A55_JunkRoom | Improvement | 打改良时获得食物 | ✅ |
| E33_BeaverColony | Gain | 尚未实现；应在从行动格获得芦苇时追加 bonus VP，并处理带马厩牧场失效的持续约束 | ❌ |
| C120_AgriculturalLabourer | Receive | Gain / Receive / Reap 获得谷物后，从牌上取黏土；其中 Reap 分支现走 `onAfterReap` 阶段 flow | ✅ |

### ImmediatelyAfter Hook
| 卡牌 | 行动 | 说明 | 状态 |
|------|------|------|------|
| C25_SteamMachine | PlaceFarmer | 放置后立即烤面包 | ✅ |
| A108_MushroomCollector | Collect | 收取后立即交换 | ✅ |
| C52_HuntsmansHat | Collect | 猪市场收取后按猪数量获得食物 | ✅ |
| C96_Merchant | Improvement | 打改良后可付 1 食物追加一次改良行动，现已收敛为单段 flow | ✅ |
| A83_ShepherdsCrook | Fencing | 围栏后立即得羊；现已直接读取本次 fencing 的 `newPastures` delta | ✅ |

### After Hook
| 卡牌 | 行动 | 说明 | 状态 |
|------|------|------|------|
| C75_Firewood | Improvement | 打改良后以直接 xor flow 取卡上木材，并记录 cardEffectGain 日志 | ✅ |
| A17_ReclamationPlow | Collect | 收取前快照动物板面，收取后以 xor flow 决定是否触发犁地 | ✅ |
| A53_Claypipe | Gain/Receive | 获得/接收后交换 | ✅ |
| A110_Roughcaster | Construct/Renovation | 建造/翻新后 | ✅ |
| A105_BarrowPusher | Plow | 犁地后 | ✅ |
| A109_SmallTrader | Improvement | 打改良后 | ✅ |
| A79_GardenHoe | Sow | 播种后若场上存在蔬菜田，通过 after flow 获得 1 黏土和 1 石头 | ✅ |
| A74_StableTree | Stables / onBuy | 建马厩后，或在同一行动里先建畜栏再买入时，都会排入 future meeples | ✅ |
| A37_Bucksaw | Renovation | 翻新后支付得收益，已通过支付后跟进 helper 收敛 | ✅ |
| A144_Sequestrator | Fencing | `onBuy` 初始化卡上芦苇/黏土；达到条件后在围栏/犁地后通过 after flow 释放对应资源 | ✅ |
| D150_GodlySpouse | WishChildren | 生孩子后基于本轮放人顺序收回第一个工人 | ✅ |
| E130_Overachiever | WishChildren | 生孩子后可追加打改良 | ✅ |
| B65_GrainDepot | Pay | 打出时按木/黏土/石头支付路径，通过 `onBuy` 排入未来回合谷物收益 | ✅ |
| C71_SlurrySpreader | Reorganize | 收获繁殖导致的动物重组完成后，若本次至少繁殖出两种 newborn，则通过 `onEndHarvest` 阶段 flow 追加一次可选 `Sow` | ✅ |
| B100_Clutterer | Occupation | 仅已接入打出职业后的触发痕迹；核心“按后续带 accumulation 文本的卡牌计分”仍未实现 | 🔧 |
| A64_BarleyMill | Reap | 收割后，当前走 `onAfterReap` 阶段 flow，并按本次实际收割的谷物田数量结算 | ✅ |
| D99_EarthenwarePotter | Harvest | 收获后效果，当前走 `onAfterHarvest` 阶段 flow | ✅ |
| E128_Saddler | Receive | 接收后 | ✅ |
| E57_CheeseFondue | Exchange | 交易后 | ✅ |

### ComputeCosts Hook
| 卡牌 | 行动 | 说明 | 状态 |
|------|------|------|------|
| A128_RiparianBuilder | Construct | 芦苇河岸触发的建房折扣；可行性现由引擎预览 `computeCosts` 统一判定 | ✅ |
| C37_DwellingMound | Plow | 犁地成本增加(+1食物) | ✅ |
| C88_CarpentersApprentice | Construct | 木屋/畜栏减费已接入，13-15 段围栏免费改走 pending fence bonus | ✅ |
| A123_FrameBuilder | Renovation/Construct | 建房/翻修时的资源替换成本，含 construct/renovation 可行性放宽 | ✅ |
| A88_HedgeKeeper | Fencing | 围栏成本折扣 | ✅ |
| A28_ForestSchool | Occupation | 职业食物成本可用木材替代，并可无视 Lessons 占用 | ✅ |

### ComputeArgs Hook
| 卡牌 | 行动 | 说明 | 状态 |
|------|------|------|------|
| E21_SheepRug | PlaceFarmer | 修改放置参数 | ✅ |

### ComputeReplace Hook
| 卡牌 | 行动 | 说明 | 状态 |
|------|------|------|------|
| B103_FieldMerchant | Improvement | 拒绝改良替换分支 + 打出时 1 木 1 芦苇 | ✅ |
| A94_LazySowman | Sow | 替换播种行动 | ✅ |
| A97_Freshman | BakeBread | 替换烤面包行动 | ✅ |

### IsDoable Hook
| 卡牌 | 行动 | 说明 | 状态 |
|------|------|------|------|
| D49_Bookshelf | Occupation | 放宽打职业条件 | ✅ |
| C60_SmallPottersOven | BakeBread | 打出时通过统一支付选项返还 Clay/Stone Oven，并由 `onBuy` gain flow 单独获得 5 Food；烤面包前可先建 Clay/Stone Oven | ✅ |
| D152_Patron | Occupation | 放宽职业条件 | ✅ |
| B94_StockProtector | Fencing | 围栏前后效果 + `isDoable` 放宽已补齐 | ✅ |
| D119_WoodBarterer | Construct/Fencing | 放宽建造/围栏条件，并已收敛为直接 xor flow 分支 | ✅ |
| B109_PaperMaker | Occupation | 打职业前可付 1 木换食物，并放宽 Lessons 可行性 | ✅ |
| A94_LazySowman | Sow | 放宽播种条件并支持替代放人 | ✅ |

---

## A Deck 卡牌进度 (27✅ + 22🔧 / 180)

| ID | Hook 覆盖 | 状态 |
|----|-----------|------|
| A10_WoodenShed | - | 🔧 |
| A14_CarpentersHammer | ComputeCosts(Construct) | ✅ |
| A17_ReclamationPlow | Before(Collect), After(Collect, Plow) | ✅ |
| A22_Telegram | - | 🔧 |
| A23_StoneCompany | - | 🔧 |
| A28_ForestSchool | ComputeCosts(Occupation), ComputeArgs(PlaceFarmer) | ✅ |
| A29_AleBenches | onReturnHome | ✅ |
| A37_Bucksaw | After(Renovation) | ✅ |
| A39_Chapel | - | 🔧 |
| A40_PottersYard | - | 🔧 |
| A41_VegetableSlicer | - | 🔧 |
| A53_Claypipe | After(Gain, Receive), ImmediatelyAfter(Obtain) | ✅ |
| A55_JunkRoom | During(Improvement) | ✅ |
| A64_BarleyMill | After(Reap) | ✅ |
| A65_SeedPellets | Before(Sow) | ✅ |
| A70_LiftingMachine | - | 🔧 |
| A71_ClearingSpade | - | 🔧 |
| A72_CalciumFertilizers | - | 🔧 |
| A74_StableTree | After(Stables), onBuy | ✅ |
| A79_GardenHoe | After(Sow) | ✅ |
| A81_InterimStorage | Before(Collect), onRoundStart | ✅ |
| A82_WorkCertificate | After(PlaceFarmer) | 🔧 |
| A83_ShepherdsCrook | ImmediatelyAfter(Fencing) | ✅ |
| A84_Silage | onReturnHome | ✅ |
| A85_Homekeeper | - | 🔧 |
| A87_Conservator | - | 🔧 |
| A88_HedgeKeeper | ComputeCosts(Fencing) | ✅ |
| A89_StablePlanner | - | 🔧 |
| A92_AdoptiveParents | After(PlaceFarmer) | 🔧 |
| A94_LazySowman | ComputeReplace(Sow), IsDoable(Sow) | ✅ |
| A97_Freshman | ComputeReplace(BakeBread) | ✅ |
| A105_BarrowPusher | After(Plow) | ✅ |
| A106_SlurrySpreader | - | 🔧 |
| A108_MushroomCollector | ImmediatelyAfter(Collect) | ✅ |
| A109_SmallTrader | After(Improvement) | ✅ |
| A110_Roughcaster | After(Construct, Renovation) | ✅ |
| A112_ScytheWorker | - | 🔧 |
| A119_FirewoodCollector | - | 🔧 |
| A123_FrameBuilder | TradeModifier(Construct, Renovation), IsDoable(Construct, Renovation) | ✅ |
| A126_MasterWorkman | Before(PlaceFarmer) | ✅ |
| A127_Lodger | - | 🔧 |
| A128_RiparianBuilder | After(opponent PlaceFarmer), ComputeCosts(Construct) | ✅ |
| A136_DrudgeryReeve | - | ✅ |
| A137_RiverineShepherd | - | 🔧 |
| A144_Sequestrator | After(Fencing) | ✅ |
| A148_Woolgrower | - | 🔧 |
| A162_ForestTallyman | - | 🔧 |
| A165_PigBreeder | - | 🔧 |
| A166_Haydryer | onBeforeHarvest | ✅ |

---

## B Deck 卡牌进度 (9✅ + 19🔧 / 180)

| ID | Hook 覆盖 | 状态 |
|----|-----------|------|
| B2_MiniPasture | - | 🔧 |
| B3_Moonshine | - | 🔧 |
| B10_Caravan | - | 🔧 |
| B15_CarpentersBench | ComputeCosts(Fencing) | 🔧 |
| B19_MoldboardPlow | - | 🔧 |
| B21_HayloftBarn | - | 🔧 |
| B23_FinalScenario | - | 🔧 |
| B34_SpecialFood | Before(Collect), After(Collect) | ✅ |
| B42_ForestInn | - | 🔧 |
| B48_ForestStone | - | 🔧 |
| B55_MaintenancePremium | - | 🔧 |
| B65_GrainDepot | After(Pay) | ✅ |
| B67_HandTruck | Before(Exchange) | ✅ |
| B70_NewPurchase | onBeforeStartOfTurn | ✅ |
| B75_WoodWorkshop | Before(Improvement), IsDoable(Improvement) | ✅ |
| B76_Ceilings | - | 🔧 |
| B81_Handcart | - | 🔧 |
| B86_TruffleSearcher | - | 🔧 |
| B94_StockProtector | Before(Fencing), After(Fencing), IsDoable(Fencing) | ✅ |
| B100_Clutterer | After(Occupation) | ✅ |
| B103_FieldMerchant | After(Occupation), ComputeReplace(Improvement) | ✅ |
| B109_PaperMaker | Before(Occupation), IsDoable(Occupation) | ✅ |
| B115_TinsmithMaster | - | 🔧 |
| B124_Trimmer | - | 🔧 |
| B146_Illusionist | - | 🔧 |
| B149_OpenAirFarmer | - | 🔧 |
| B151_LittlePeasant | - | 🔧 |
| B165_GameProvider | - | 🔧 |

---

## C Deck 卡牌进度 (13✅ + 29🔧 / 180)

| ID | Hook 覆盖 | 状态 |
|----|-----------|------|
| C1_Overhaul | - | 🔧 |
| C8_PlantFertilizer | - | 🔧 |
| C10_BunkBeds | - | 🔧 |
| C13_WoodSlideHammer | ComputeCosts(Renovation) | 🔧 |
| C17_NewlyPlowedField | - | 🔧 |
| C18_RollOverPlow | - | 🔧 |
| C19_SwingPlow | - | 🔧 |
| C23_JobContract | - | 🔧 |
| C24_BedintheGrainField | - | 🔧 |
| C25_SteamMachine | ImmediatelyAfter(PlaceFarmer) | ✅ |
| C27_Blueprint | - | 🔧 |
| C29_BeerTable | - | 🔧 |
| C31_WritingChamber | - | ✅ |
| C37_DwellingMound | ComputeCosts(Plow) | ✅ |
| C51_FishingNet | - | 🔧 |
| C52_HuntsmansHat | ImmediatelyAfter(Collect) | ✅ |
| C57_Crudite | - | 🔧 |
| C60_SmallPottersOven | Before(BakeBread), IsDoable(BakeBread), ReturnCards(onBuy) | ✅ |
| C63_CraftBrewery | - | 🔧 |
| C71_Slurry | - | 🔧 |
| C71_SlurrySpreader | After(Reorganize) | 🔧 |
| C75_Firewood | After(Improvement) | ✅ |
| C84_PerennialRye | - | 🔧 |
| C85_DenBuilder | - | 🔧 |
| C86_LivestockFeeder | - | 🔧 |
| C87_Mason | - | 🔧 |
| C88_CarpentersApprentice | Before(Fencing), After(Fencing), ComputeCosts(Construct, Stables), IsDoable(Fencing) | ✅ |
| C93_InnerDistrictsDirector | - | 🔧 |
| C96_Merchant | ImmediatelyAfter(Improvement) | ✅ |
| C99_GardenDesigner | - | ✅ |
| C104_Collector | - | 🔧 |
| C115_Sower | - | 🔧 |
| C120_AgriculturalLabourer | After(Occupation, Gain, Receive), onAfterReap | ✅ |
| C130_OutskirtsDirector | - | 🔧 |
| C133_Soldier | - | ✅ |
| C135_Constable | - | ✅ |
| C142_MarketCrier | - | 🔧 |
| C144_ReedRoofRenovator | - | ✅ |
| C148_MudWallower | - | 🔧 |
| C156_HoofCaregiver | - | 🔧 |
| C162_ForestOwner | - | 🔧 |
| C168_AnimalCatcher | - | 🔧 |

---

## D Deck 卡牌进度 (11✅ + 30🔧 / 180)

| ID | Hook 覆盖 | 状态 |
|----|-----------|------|
| D10_StorksNest | - | 🔧 |
| D14_HammerCrusher | Before(Renovation), IsDoable(Renovation) | ✅ |
| D20_TurnwrestPlow | - | 🔧 |
| D22_WorkPermit | - | 🔧 |
| D23_PioneeringSpirit | - | 🔧 |
| D27_Retraining | - | 🔧 |
| D36_BreedRegistry | - | ✅ |
| D49_Bookshelf | Before(Occupation), IsDoable(Occupation) | ✅ |
| D51_Archway | Before(ReturnHome) | 🔧 |
| D53_TeaHouse | - | 🔧 |
| D55_NewMarket | - | 🔧 |
| D70_StrawManure | - | 🔧 |
| D71_Changeover | - | 🔧 |
| D72_StableManure | - | 🔧 |
| D74_RoyalWood | - | 🔧 |
| D85_Reader | - | 🔧 |
| D92_ChildOmbudsman | - | 🔧 |
| D93_SheepInspector | - | 🔧 |
| D94_HenpeckedHusband | - | 🔧 |
| D98_Transactor | Before(Harvest) | 🔧 |
| D99_EarthenwarePotter | onBuy, onAfterHarvest | ✅ |
| D100_LordoftheManor | - | ✅ |
| D101_SugarBaker | - | 🔧 |
| D102_SampleStableMaker | - | 🔧 |
| D103_CanalBoatman | - | 🔧 |
| D115_FodderPlanter | EndHarvest | ✅ |
| D116_TreeInspector | - | 🔧 |
| D119_WoodBarterer | Before(Construct, Fencing), IsDoable(Construct, Fencing) | ✅ |
| D124_Emissary | - | 🔧 |
| D126_FieldCultivator | - | 🔧 |
| D127_HardworkingMan | - | 🔧 |
| D131_CraftsmanshipPromoter | - | 🔧 |
| D132_HideFarmer | Before(EndOfGame) | ✅ |
| D134_OysterEater | - | 🔧 |
| D137_TradeTeacher | - | 🔧 |
| D150_GodlySpouse | After(WishChildren), onBeforeStartOfTurn | ✅ |
| D152_Patron | Before(Occupation), IsDoable(Occupation) | ✅ |
| D157_PartyOrganizer | - | ✅ |
| D158_BeanCounter | - | 🔧 |
| D164_PetGrower | - | 🔧 |
| D167_PureBreeder | - | 🔧 |

---

## E Deck 卡牌进度 (8✅ + 38🔧 / 168)

| ID | Hook 覆盖 | 状态 |
|----|-----------|------|
| E4_Thunderbolt | - | 🔧 |
| E5_NightLoot | - | 🔧 |
| E10_StrawHat | - | 🔧 |
| E16_BriarHedge | - | 🔧 |
| E21_SheepRug | ComputeArgs(PlaceFarmer) | ✅ |
| E22_GuestRoom | - | 🔧 |
| E27_PiggyBank | - | 🔧 |
| E30_ChildsToy | - | 🔧 |
| E33_BeaverColony | During(Gain, Collect) | 🔧 |
| E36_HerbalGarden | - | 🔧 |
| E51_WhaleOil | Before(Occupation), IsDoable(Occupation) | 🔧 |
| E52_Cubbyhole | After(Construct), onStartHarvestFeedingPhase | ✅ |
| E53_BoarSpear | During(Collect, Gain, Receive), After(Collect) | ✅ |
| E62_SourDough | - | 🔧 |
| E71_CowPatty | - | 🔧 |
| E73_Scythe | - | 🔧 |
| E74_AshTrees | Before(Fencing) | ✅ |
| E75_StoneAxe | - | 🔧 |
| E76_LumberPile | - | 🔧 |
| E78_SleightofHand | - | 🔧 |
| E82_Profiteering | - | 🔧 |
| E84_DollysMother | - | 🔧 |
| E85_MasterTanner | - | 🔧 |
| E86_PenBuilder | - | 🔧 |
| E90_DungCollector | - | 🔧 |
| E91_PlowBuilder | - | 🔧 |
| E92_FieldDoctor | - | 🔧 |
| E93_Motivator | - | 🔧 |
| E101_Blighter | After(Occupation), Before(Occupation), IsDoable(Occupation) | ✅ |
| E103_Wolf | After(Obtain, Gain, Receive, Reap, Collect) | 🔧 |
| E109_BraidMaker | - | 🔧 |
| E112_GrainThief | - | 🔧 |
| E123_ResourceHoarder | ComputeCosts(Renovation, Construct) | 🔧 |
| E124_MayorCandidate | - | ✅ |
| E130_Overachiever | After(WishChildren), ComputeCardCosts(Improvement) | ✅ |
| E133_ChampionBreeder | - | 🔧 |
| E134_Omnifarmer | - | 🔧 |
| E148_Lazybones | - | 🔧 |
| E151_DeliveryNurse | - | 🔧 |
| E153_StoneSculptor | - | 🔧 |
| E155_Visionary | - | 🔧 |
| E159_OldMiser | - | ✅ |
| E161_ElderBaker | - | 🔧 |
| E162_Entrepreneur | - | 🔧 |
| E166_Roastmaster | - | 🔧 |
| E167_DairyCrier | - | 🔧 |

---

## 原子行动 Hook 矩阵卡牌排期

以下顺序只考虑 `docs/cards_impl.md` 的“原子行动 Hook 覆盖矩阵”里出现过的示例卡牌。

### 第一批：纯 Modifier / 低交互 Hook
2. `A128_RiparianBuilder`
3. `C88_CarpentersApprentice`
4. `A88_HedgeKeeper`
5. `A94_LazySowman`
6. `A97_Freshman`
7. `B103_FieldMerchant`
8. `A28_ForestSchool`
9. `D49_Bookshelf`
10. `D152_Patron`

### 第二批：复用现有动作树的 Before / After / ImmediatelyAfter
1. `A65_SeedPellets`
2. `A79_GardenHoe`
3. `A105_BarrowPusher`
4. `A109_SmallTrader`
5. `A110_Roughcaster`
6. `A37_Bucksaw`
7. `A74_StableTree`
8. `A83_ShepherdsCrook`
9. `A144_Sequestrator`
10. `B75_WoodWorkshop`
11. `A55_JunkRoom`
12. `C96_Merchant`
13. `E53_BoarSpear`
14. `A108_MushroomCollector`
15. `A17_ReclamationPlow`
16. `A53_Claypipe`
17. `B65_GrainDepot`
18. `C71_SlurrySpreader`
19. `E57_CheeseFondue`
20. `E128_Saddler`

### 第三批：参数改写、条件放宽或带选择流程
1. `A126_MasterWorkman`
2. `E21_SheepRug`
3. `B94_StockProtector`
4. `D119_WoodBarterer`
5. `E101_Blighter`
6. `B109_PaperMaker`

### 最后处理：时序或协议更重的矩阵卡
2. `A166_Haydryer`
3. `D99_EarthenwarePotter`
4. `C133_Soldier`
5. `B70_NewPurchase`
