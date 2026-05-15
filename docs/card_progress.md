# 卡牌进度

> 本文只记录当前 BGA 对齐状态；已完成批次说明不在本文保留。

## 1. 当前快照

| 维度 | 当前状态 |
|---|---:|
| BGA canonical 卡牌数 | 888 |
| Open Agricola canonical 卡牌 bucket 数 | 888 |
| canonical 层面 BGA-only / OA-only | 0 / 0 |
| TypeScript 实体卡牌文件数 | 888 |
| BGA active implemented 但 OA 缺失 | 0 |
| 待修行为 / 注册差异 | 4 |
| metadata schema 上抬差异 | 4 |
| BGA 标 banned 但 OA 按策略保留 | 33 |
| 待 owner 确认队列 | 0 |

`C71` 已只保留 canonical `C71_Slurry`。BGA 里的 `C71_SlurrySpreader`
是 legacy wrong-name 且 `implemented=false`，OA 不再注册或展示该名称。
`STUB_BeforeBakeGainClay` 是 dev/test stub，不计入 canonical 卡牌统计或普通发牌池。

### 本轮变更记录（2026-05-15）

- `bake-bread` 核心 action 改为默认非空：不再暴露 `cancel`，`cancel` / 空 `bulk:` / 无效 source / 非正 count / 超出 source 上限 / 超出 grain 总量都会在后端失败，且 `bulk:` 失败保持原子性。
- `D66_PotterCeramics` 已按 BGA before-bake 语义对齐：以 `dispatchMode: 'select'` 暴露 1 clay -> 1 grain 的纯 flow；无 grain 但有 clay + baking source 时可进入 bake，trigger-select 中 D66 enabled、pass disabled，执行 D66 后进入非空 bake。
- 新增 `STUB_BeforeBakeGainClay` dev/test stub：可通过 devmode `devPlayCard` 加入玩家小改良，before bake 时作为 `dispatchMode: 'select'` trigger 获得 1 clay，用于 UI 复现“同批 before trigger 先拿 clay 再解锁 D66”的路径。
- `A24_ThreshingBoard` / `C25_SteamMachine` 的可选 bake 来源已迁到外层 `optional` flow，不再依赖 bake 内部 cancel 表达 skip。
- `C25_SteamMachine` 卡牌实现已改用 display 定义导出的 `CARD_ID`，避免在 listener 与 flow 中重复硬编码卡牌 id 字符串。
- `C60_SmallPottersOven` 已按 BGA 收敛：`isDoable` 只看玩家能否购买 `Major_ClayOven` / `Major_StoneOven`；before-bake 买炉子 flow 永远 optional，不再在卡牌文件中预演同批 before trigger 链路。
- `C60_SmallPottersOven` UI 成本区已对齐为只显示 `2 clay`；不再用 `returnCards` 表达返还炉子，改由卡牌 `onBuy` 归还 Clay / Stone Oven。
- bake UI 的 source rate 不再只硬编码 major improvement；`cards-manifest` 暴露 `exchanges` 后，`A60_OrientalFireplace` / `D59_EarthOven` / `E63_IronOven` 等卡牌 bake source 也能显示计数器并提交 `bulk:`。
- trigger-select 支持动态 enabled / disabled option：不可支付但结构适用的 trigger 仍展示为 disabled，服务器拒绝强行选择；同批 trigger 改变资源后会重新计算 option 状态。
- trigger-select 的 pass gate 已支持通用 replacement continuation：先检查跳过 before trigger 后原 action 是否可直接继续；不行时检查 `computeReplace` 返回的 `alternativeFlow` 是否有可启动分支，避免 B26 + D66 这类 fencing fallback 被误判为必须触发 D66。
- `computeReplace` decline 的替代 flow 若本身是 `xor`，引擎会把其 children 作为可选 replacement 分支展开；replacement 分支 leaf 只携带 `skipComputeReplaceListenerIds` 跳过来源 listener，不再携带 `checkedReplaceAction`，避免误伤真实替代分支里的普通 before / after listener。original fallback 分支仍携带 `checkedReplaceAction=true`。
- structured choice 允许列表从 interaction request metadata 读取；`bake-bread` / `exchange` 的 `bulk:` 不再靠 engine action-id 特判。
- `A148_Woolgrower` / `B86_TruffleSearcher` 改用全局 `state.completedFeedingPhases` 计入容量；`D13_Trowel` 暴露 wood->stone 翻修；`D15_ClaySupports` 改为可选 multi-key trade；`E5_NightLoot` 列出全部 `(space,type)` 选项、复用 `collect` partial-take，并补可区分的来源展示元数据。
- `collect` partial-take 在带 `spaceId` 时拒绝缺失 / 非正 `amount` 或缺失 `resource` 的 payload，避免错误回落到 full collect。

## 2. 待修行为 / 注册差异

这些卡牌当前实现和 BGA 运行时行为或注册语义不一致。它们是可执行的实现任务，不是 owner 策略问题。

| 卡牌 | 原始行为 | 当前 OA 行为 | BGA 差距 | 需要修复 |
|---|---|---|---|---|
| `B157_Salter` | 玩家可以腌制多种 / 多只动物，并按数量获得未来食物。 | 当前 flow 是 XOR，只能三选一且只能选 1 只动物。 | BGA 一次交互可选择 sheep / boar / cattle 的多个数量。 | 改成显式多类型计数选择，并按类型 / 数量发放 future food。 |
| `C8_PlantFertilizer` | 支持 grain / vegetable / wood / stone 等逻辑田组。 | 只处理物理 grain / vegetable field。 | BGA 可作用于后续卡牌创建的 wood / stone field 逻辑组。 | 田地查找改成 group-aware，并纳入已激活的 wood / stone 可播种组。 |
| `C57_Crudite` | 收获时可选触发，玩家选择移除哪个 vegetable 来源。 | harvest handler 直接移除第一个符合条件的 vegetable，效果上是强制触发。 | BGA 在多来源时给 optional choice。 | 改成显式 optional pending / flow，并让玩家选择来源。 |
| `C140_PackagingArtist` | 把 Major Improvement action 加入 replacement action pool。 | 实现了 minor replacement / `isDoable`，但没有把 Major Improvement 加进可替换 action pool。 | BGA 允许此卡扩展 replacement action 集合。 | 增加缺失的通用 action-pool 扩展点。 |

## 3. Metadata Schema 上抬差异

机械 metadata 审计发现 4 张卡：BGA 把 buyability 写在自定义 `isBuyable`
逻辑里，没有 plain prerequisite 字段；OA 为了 UI 清晰度把条件上抬成显式
prerequisite label / handler。当前没有证据表明运行时行为错误。

| 卡牌 | OA metadata | BGA metadata 差异 | 当前处理 |
|---|---|---|---|
| `A3_PaperKnife` | 显式 prerequisite label + handler。 | BGA 没有 plain prerequisite 字段，逻辑在 `isBuyable`。 | 保留为 schema-up metadata 差异。 |
| `B154_SheepKeeper` | 显式 prerequisite label + handler。 | 同上。 | 保留为 schema-up metadata 差异。 |
| `B56_Brook` | 显式 prerequisite label + handler。 | 同上。 | 保留为 schema-up metadata 差异。 |
| `B74_ThickForest` | 显式 prerequisite label + handler。 | 同上。 | 保留为 schema-up metadata 差异。 |

## 4. BGA-Banned 但 OA 保留

这些卡牌在 BGA metadata 中标为 banned 或非标准，但 OA 当前按产品策略保留。它们不是 BGA 行为 gap，除非同一张卡也出现在第 2 节。

| 卡牌 |
|---|
| `A131_GuestRoom`, `A133_ClappingArea`, `A14_CarpentersHammer`, `A33_RecycledBrick`, `A39_Smallholding`, `A48_StableDeliveryman`, `A82_Wintercrafter`, `A97_BreadCarrier` |
| `B10_ChickenCoop`, `B117_Mastermind`, `B132_FestivalManager`, `B151_Tradesperson`, `B15_Flail`, `B161_Trident`, `B21_FarmSchoolGraduate`, `B22_Punner` |
| `C102_SackCart`, `C125_Educator`, `C28_FishingNet`, `C31_ShepherdsPipe`, `C3_CarpentersBench`, `C60_CatLover`, `C63_GoatCatcher`, `C99_GardenDesigner` |
| `D137_Countryman`, `D19_DrinkerOfAbsinthe`, `D21_BrushwoodRoof`, `D33_MasterBreeder`, `D4_ChickenFeeder`, `D74_TenantFarmer`, `D92_SnackTime` |
| `D97_AutonomousPicker`, `E22_FieldWatchman` |

## 5. 已接受简化

这些是当前已接受的简化实现。除非产品决策变化，否则不要把它们放回待修队列。

| 卡牌 | 当前简化 | BGA 差异 |
|---|---|---|
| `B27_Toolbox` | 保留当前简化实现。 | BGA 处理更完整。 |
| `B33_Mantlepiece` | 保留当前简化实现。 | BGA 处理更完整。 |
| `B129_Seatmate` | 保留当前简化实现。 | BGA 处理更完整。 |
| `C24_BedintheGrainField` | 保留当前简化实现。 | BGA 处理更完整。 |
| `C25_SteamMachine` | 保留当前简化实现。 | BGA 处理更完整。 |
| `C42_RavenousHunger` | 保留当前简化实现。 | BGA 处理更完整。 |
| `C67_MineralFeeder` | 保留当前简化实现。 | BGA 处理更完整。 |
| `C69_LandConsolidation` | 保留当前简化实现。 | BGA 处理更完整。 |
| `C72_FestivalPlanning` | 保留当前简化实现。 | BGA 处理更完整。 |
| `C93_InnerDistrictsDirector` | 保留当前简化实现。 | BGA 处理更完整。 |
| `C120_AgriculturalLabourer` | 保留当前简化实现。 | BGA 处理更完整。 |
| `C154_TwinResearcher` | 保留当前简化实现。 | BGA 处理更完整。 |
| `D36_BreedRegistry` | 保留当前简化实现。 | BGA 处理更完整。 |
| `D101_SugarBaker` | 保留当前简化实现。 | BGA 处理更完整。 |
| `E112_GrainThief` | 保留当前简化实现。 | BGA 处理更完整。 |
| `C27_Blueprint` | 源码已注明的简化。 | BGA 有额外细节，OA 未镜像。 |
| `C52_HuntsmansHat` | 源码已注明的简化。 | BGA 有额外细节，OA 未镜像。 |
| `C146_WorkshopAssistant` | 源码已注明的简化。 | BGA 有额外细节，OA 未镜像。 |

## 6. 刻意行为差异

这些非 banned 卡牌当前刻意不完全跟随 BGA。

| 卡牌 | 当前 OA 行为 | BGA 行为 | 当前决策 |
|---|---|---|---|
| `C22_BasketChair` | 简化 trigger / payment 行为。 | BGA 交互更完整。 | 保留简化。 |
| `D161_CabbageBuyer` | 简化购买 / 计分行为。 | BGA 处理更完整。 | 保留简化。 |
| `B85_FarmHand` | 简化 worker / action 行为。 | BGA 处理更完整。 | 保留简化。 |
| `A136_DrudgeryReeve` | 简化计分 / 条件处理。 | BGA 处理更完整。 | 保留简化。 |
| `C133_Soldier` | 简化交互。 | BGA 处理更完整。 | 保留简化。 |
| `D132_HideFarmer` | 简化 hide / farm 行为。 | BGA 处理更完整。 | 保留简化。 |
| `E149_MidnightFencer` | 简化 fencing 行为。 | BGA 处理更完整。 | 保留简化。 |
| `A22_Telegram` | 简化时序 / 交互行为。 | BGA 处理更完整。 | 保留简化。 |
| `E72_ArtichokeField` | 简化 field 行为。 | BGA 处理更完整。 | 保留简化。 |
| `C1_Overhaul` | 使用 OA 的 min:n 表示语义。 | BGA 表达方式不同。 | 保留当前表示。 |
| `C1_noWoodPalisades` | OA 阻止 wood palisade 交互。 | BGA 表达方式不同。 | 保留当前表示。 |
| `D1_ZigzagHarrow` | 简化 harrow 行为。 | BGA 处理更完整。 | 保留简化。 |

## 7. Legacy 名称与非缺失卡

| 条目 | 当前结论 |
|---|---|
| `D159_ReedSeller` | 不缺失。BGA 标记 `implemented=false`，OA 也只保留 data-only 定义。 |
| `E132_VeggieLover` | canonical 名下已实现并对齐。BGA legacy `E132_Shearer` 不是当前 active card。 |
| `C54_MarketBooth` | canonical 名；BGA legacy alias `MarketStall` 不应算作 OA 缺卡。 |
| `C71_Slurry` | canonical 名；BGA legacy `SlurrySpreader` wrong-name 条目已从 OA 删除。 |
| `D11_LawnFertilizer` | canonical 名；BGA legacy typo `LawnFertilzer` 不应算作 OA 缺卡。 |

## 8. 必跑检查

改卡牌 metadata 后运行机械审计：

```bash
pnpm exec tsx scripts/audit-bga-metadata-diff.ts
```

行为修复优先跑最小相关 slow / session case，再跑 fast suite：

```bash
pnpm exec vitest run <targeted-test-file>
pnpm test:fast
pnpm run lint
```

## 9. 当前轮次

- 2026-05-15 — Wave 1 cards (A148/B86/D15/D13/E5) aligned to BGA; 4 infra extensions

## 10. 基础设施

通用扩展点（卡牌之间共享、登记在此以避免重复造轮子）：

- `GameState.completedFeedingPhases` — 全局收获计数（A148/B86 共用，BGA Globals 同款）。
- `collect` action 统一 partial-take（接受 `actionContext: {spaceId, resource, amount}`），删除 `take-from-space`。
- `buildTradeFees` 支持多键 trade（D15 即时 clay trade 复用），把多 `to` key 编译到 PaymentSolver 期望的 cost 形状。
- `TradeModifier.conditions?: Record<string, number>` — D15 trade gated by `houseTypeClay`；其余 `houseTypeWood` / `houseTypeStone` / `minNumRooms` 同套机制。
- `onComputeAnimalZones` 签名加 `state: GameState` 入参（A148 / B86 读全局 feeding counter，避免再走玩家局部 state）。

## 11. 时间线

| 日期 | 批次 | 涉及卡牌 / 基建 |
|---|---|---|
| 2026-05-15 | Wave 1 | A148_Woolgrower / B86_TruffleSearcher / D15_ClaySupports / D13_Trowel / E5_NightLoot + 4 项基建（§10） |
