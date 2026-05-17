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
| 待修行为 / 注册差异 | 1 |
| metadata schema 上抬差异 | 4 |
| BGA 标 banned 但 OA 按策略保留 | 33 |
| 待 owner 确认队列 | 0 |

`C71` 已只保留 canonical `C71_Slurry`。BGA 里的 `C71_SlurrySpreader`
是 legacy wrong-name 且 `implemented=false`，OA 不再注册或展示该名称。
`STUB_BeforeBakeGainClay` 是 dev/test stub，不计入 canonical 卡牌统计或普通发牌池。

### 本轮变更记录（2026-05-15 ~ 2026-05-17）

- `bake-bread` 核心 action 改为默认非空：不再暴露 `cancel`，`cancel` / 空 `bulk:` / 无效 source / 非正 count / 超出 source 上限 / 超出 grain 总量都会在后端失败，且 `bulk:` 失败保持原子性。
- `D66_PotterCeramics` 已按 BGA before-bake 语义对齐：以 `dispatchMode: 'select'` 暴露 1 clay -> 1 grain 的纯 flow；无 grain 但有 clay + baking source 时可进入 bake，trigger-select 中 D66 enabled、pass disabled，执行 D66 后进入非空 bake。
- 新增 `STUB_BeforeBakeGainClay` dev/test stub：可通过 devmode `devPlayCard` 加入玩家小改良，before bake 时作为 `dispatchMode: 'select'` trigger 获得 1 clay，用于 UI 复现“同批 before trigger 先拿 clay 再解锁 D66”的路径。
- `A24_ThreshingBoard` / `C25_SteamMachine` 的可选 bake 来源已迁到外层 `optional` flow，不再依赖 bake 内部 cancel 表达 skip。
- `C25_SteamMachine` 卡牌实现已改用 display 定义导出的 `CARD_ID`，避免在 listener 与 flow 中重复硬编码卡牌 id 字符串。
- `C60_SmallPottersOven` 已按 BGA 收敛：`isDoable` 只看玩家能否购买 `Major_ClayOven` / `Major_StoneOven`；before-bake 买炉子 flow 永远 optional，不再在卡牌文件中预演同批 before trigger 链路。
- `C60_SmallPottersOven` UI 成本区已对齐为只显示 `2 clay`；不再用 `returnCards` 表达返还炉子，改由卡牌 `onBuy` 归还 Clay / Stone Oven。
- `C60_SmallPottersOven` before-bake 建炉已改用 BGA-style `trueAction=false` 标记；不再跳过 Clay / Stone Oven 自身的 `onBuy` optional bake。
- `B27_Toolbox` / `E130_Overachiever` / `E97_Beneficiary` 的附带 improvement flow 已补 `trueAction=false` 传播，避免触发真实 improvement action 专属监听 / 替换。
- `C140_PackagingArtist` / `D94_HenpeckedHusband` 已补 `trueAction=false` 过滤；`B87_Cottager` 只在 construct 子节点保留非真实 action 标记，renovation 子节点对齐 BGA。
- bake UI 的 source rate 不再只硬编码 major improvement；`cards-manifest` 暴露 `exchanges` 后，`A60_OrientalFireplace` / `D59_EarthOven` / `E63_IronOven` 等卡牌 bake source 也能显示计数器并提交 `bulk:`。
- trigger-select 支持动态 enabled / disabled option：不可支付但结构适用的 trigger 仍展示为 disabled，服务器拒绝强行选择；同批 trigger 改变资源后会重新计算 option 状态。
- trigger-select 的 pass gate 已支持通用 replacement continuation：先检查跳过 before trigger 后原 action 是否可直接继续；不行时检查 `computeReplace` 返回的 `alternativeFlow` 是否有可启动分支，避免 B26 + D66 这类 fencing fallback 被误判为必须触发 D66。
- `computeReplace` decline 的替代 flow 若本身是 `xor`，引擎会把其 children 作为可选 replacement 分支展开；replacement 分支 leaf 只携带 `skipComputeReplaceListenerIds` 跳过来源 listener，不再携带 `checkedReplaceAction`，避免误伤真实替代分支里的普通 before / after listener。original fallback 分支仍携带 `checkedReplaceAction=true`。
- structured choice 允许列表从 interaction request metadata 读取；`bake-bread` / `exchange` 的 `bulk:` 不再靠 engine action-id 特判。
- `A148_Woolgrower` / `B86_TruffleSearcher` 改用全局 `state.completedFeedingPhases` 计入容量；`D13_Trowel` 暴露 wood->stone 翻修；`D15_ClaySupports` 改为可选 multi-key trade；`E5_NightLoot` 列出全部 `(space,type)` 选项、复用 `collect` partial-take，并补可区分的来源展示元数据。
- `collect` partial-take 在带 `spaceId` 时拒绝缺失 / 非正 `amount` 或缺失 `resource` 的 payload，避免错误回落到 full collect。
- `C57_Crudite` 已按 BGA 对齐：anytime 多来源进入田地选择、单来源自动结算；收获田地阶段提供 optional 选择；非法来源选择在提交时失败并保留 pending。
- `C8_PlantFertilizer` 已按 BGA 对齐：onBuy 现在产出 NODE_SEQ + optional + SPECIAL_EFFECT 等效形状（`wrapOptional({type:'leaf', actionId:'special-effect', ...})`），在符合条件的 field 上加 1 个同类型 good（不再 `gain` 进资源池）。支持普通 field（grain/vegetable）、D75 Wood Field / E80 Rock Garden 的 logical group（按 `extraData.cardFieldStacks` 的 sum-of-remaining===1 判定），以及 B68/C70/D25/E68/E69/E70/E72 这类 `extraData.cardCrop` 单格卡牌田。
- 新增可复用 `special-effect` kind `plant-additional-good`：接收 `locations: PlantAdditionalGoodLocation[]`，每个 location 是 `{kind:'field', row, col}`、`{kind:'card-stacks', cardId}` 或 `{kind:'card-crop', cardId}`。Invariant 违反（field/stack/cardCrop 缺失）throw，不静默 no-op；多 location 先整体校验再写入，避免半更新。
- `B138_ForestGuardian` / `C51_FishingNet` 这类 opponent-pays-owner 的 `gain` flow 已补行动者维度的 action-detail delta：卡牌效果收益仍由专属日志记录，行动日志只记录行动者实际支付的成本和行动格收益。
- `cardField` 通用扩展点（`shared/cards/helpers/card-field.ts`）完成：声明式 `CardDefinition.cardField = { allowedCrops, capacity }` + 可选 `onReap` 回调；自动派生 `onComputeSowableFields` / `onSowExtraField` / `onHarvestFieldPhase` / `sow-isDoable` listener；虚拟 tile col 由 `deriveVirtualTileCol(cardId, slot) = deckOrdinal*1000 + cardNumber + slot` 派生跨 deck 不冲突。B68/D75/E80/C70/D25/E68/E69/E70/E72/B113/B141 共 11 张卡迁移到该 helper；B113/B141 顺带修复"4 crop 全允许 + 保留 onBuy"长期 bug。
- harvest reap log 修复：`harvestReapSummary` 初始化从 `continueHarvestReap` 提前到 `continueHarvestFieldStart`，让 `cardField` 在 `onHarvestFieldPhase` 内累加进 `summary.resources[crop]`，`log.harvestReapDetail` 现在包含 cardField 产出。
- `FarmBoard` 卡牌叠放显示已同步读取 `extraData.cardFieldStacks`，修复 D75 Wood Field / E80 Rock Garden 等 cardField 迁移后播种堆叠不显示的问题；旧 `extraData.stacks` 仍作为渲染兼容 fallback。

## 2. 待修行为 / 注册差异

这些卡牌当前实现和 BGA 运行时行为或注册语义不一致。它们是可执行的实现任务，不是 owner 策略问题。

| 卡牌 | 原始行为 | 当前 OA 行为 | BGA 差距 | 需要修复 |
|---|---|---|---|---|
| `B157_Salter` | 玩家可以腌制多种 / 多只动物，并按数量获得未来食物。 | 当前 flow 是 XOR，只能三选一且只能选 1 只动物。 | BGA 一次交互可选择 sheep / boar / cattle 的多个数量。 | 改成显式多类型计数选择，并按类型 / 数量发放 future food。 |

Follow-up：`C28_TeachersDesk`、`B59_FoodChest` 等仍走同一 BGA `computeArgsPlaceFarmer` 模式，可复用本次 `C140_PackagingArtist` 的 `improvement-any` listener-action 扩展手法（无需新基建）。

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
| `E72_ArtichokeField` | `cardField.allowedCrops=['grain','vegetable']`，每次 harvest +1 food（无 isLast 副作用）。 | BGA `constraints=null` 含 wood/stone。 | 保留 grain/vegetable，待独立 audit。 |
| `E70_CropRotationField` | `cardField.allowedCrops=['grain','vegetable']`，最后一颗触发 optional sow opposite。 | BGA `constraints=null` 含 wood/stone。 | 保留 grain/vegetable，待独立 audit。 |
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

- 2026-05-17 — `B157_Salter` 对齐 BGA — 多只混合 panel + futureMeeples：reserve=0 + on-board≥1 触发 anytime，新 `animal-quantity-select` interaction kind 允许一次提交 sheep/boar/cattle 任意计数；单只时 fast path 自动结算无需 panel；按动物类型走 3/5/7 turn `futureMeeples` 投递 food。
- 2026-05-17 — `B42_ForestInn` / `D119_WoodBarterer` 纯 gain / pay-gain 选项去除重复 `choiceLabelKey`，改由 `descriptionPreview` 自动渲染资源变化。
- 2026-05-16 — `B42_ForestInn` 对齐 BGA activate flow：非主人先支付 owner 1 food，随后进入 5/7/9 wood 的 XOR pay-gain 分支。
- 2026-05-16 — C60_SmallPottersOven mandatory bake continuation fixed: skipping Stone Oven onBuy bake after C60 before-bake build now reaches engine-blocked instead of ending the turn.
- 2026-05-15 — Engine-level mandatory bake alignment: client treats `engine-blocked` as a dedicated prompt-only pending state and hides choice/anytime actions while blocked.
- 2026-05-15 — Wave 1 cards (A148/B86/D15/D13/E5) aligned to BGA; 4 infra extensions
- 2026-05-15 — C60/B27/E130/E97 side improvement flows aligned to BGA `trueAction=false`; removed synthetic onBuy suppression from improvement/occupation apply leaves
- 2026-05-15 — C57_Crudite aligned to BGA field-vegetable selection semantics; added strict multi-field crop removal and selection bound validation.
- 2026-05-16 — C8_PlantFertilizer 对齐 BGA（NODE_SEQ + optional + SPECIAL_EFFECT 等效形状）；新增 `plant-additional-good` special-effect kind
- 2026-05-17 — `cardField` 基建落地 + 11 张"卡牌即田"卡（B68/D75/E80/D25/E72/C70/E68/E69/E70/B113/B141）统一迁移到声明式 helper；harvest reap log 时序修复使 cardField 产出进入 `log.harvestReapDetail`；B113/B141 顺带补完 4 crop 全允许的 sow/harvest 路径。
- 2026-05-17 — `C140_PackagingArtist`：补齐 `improvement-any` 监听（computeReplace + isDoable）+ `checkedReplaceAction` 防递归，对齐 BGA `computeArgsPlaceFarmer` 行为；移除 JSDoc 中"需要新扩展点"的误判注释。
- 2026-05-17 — `improvement` action 统一：合并 `minor-improvement` + `improvement-any` 两个 ActionDefinition → 单一 `'improvement'` action，参数 `types: ('major'|'minor')[]` 区分；50+ 张卡 listener `actions:` 从双 ID 简化为 `['improvement']`，Pattern B/C 加 `readImprovementTypes(ctx)` types-filter；4 个 wrapper（major-improvement / house-redevelopment / common-meeting-place / wish-children）leaf 同步迁移；helpers 文件从 `effects/improvement-options.ts` + `improvement-pool.ts` 合并到 `helpers/improvement-helpers.ts`；i18n key 合并为 `actions.improvement.*`；新增 ESLint `no-restricted-syntax` 守门禁 legacy 字面量。

## 10. 基础设施

通用扩展点（卡牌之间共享、登记在此以避免重复造轮子）：

- `GameState.completedFeedingPhases` — 全局收获计数（A148/B86 共用，BGA Globals 同款）。
- `collect` action 统一 partial-take（接受 `actionContext: {spaceId, resource, amount}`），删除 `take-from-space`。
- `buildTradeFees` 支持多键 trade（D15 即时 clay trade 复用），把多 `to` key 编译到 PaymentSolver 期望的 cost 形状。
- `TradeModifier.conditions?: Record<string, number>` — D15 trade gated by `houseTypeClay`；其余 `houseTypeWood` / `houseTypeStone` / `minNumRooms` 同套机制。
- `onComputeAnimalZones` 签名加 `state: GameState` 入参（A148 / B86 读全局 feeding counter，避免再走玩家局部 state）。
- `improvement-any` 的 `params.trueAction=false` 会传播到生成的 `pay` / `apply-improvement` leaf `actionContext`，用于 BGA-style 非真实 action 过滤，但不抑制所购卡牌 `onBuy`。
- 已执行过 before phase 的 continuation node 在后续 `isDoable` 判定中携带 `skipBeforeTriggers`，避免 C60 这类 before-reachability listener 把原始 mandatory bake 再次判成可执行。
- `special-effect.remove-field-crops` — 按坐标严格校验多块田顶层作物后原子扣除，供 C57 这类多来源 field crop 选择复用。
- `commitSelectionChoice` 会拒绝不在 `actionContext.selectableTiles` 内的 farm-position 提交，避免非法选择消费 pending flow。
- `special-effect` 新增 `plant-additional-good` kind — 在玩家 field、cardStates 的 `extraData.stacks` 或 `extraData.cardCrop` 上把 lone good remaining +1。当前 C8_PlantFertilizer 使用；写入前先整体校验所有 location。
- `cardField` 通用机制（`shared/cards/helpers/card-field.ts:makeCardFieldImpl`）— 声明 `CardDefinition.cardField = { allowedCrops, capacity }` + 可选 `onReap(ctx: { state, player, crop, isLast })`，工厂派生 sow / harvest / isDoable listener。`isLast` 语义 = 该卡上该 crop 经本次扣减后总 remaining === 0；多 crop 各调一次。虚拟 tile col：`deriveVirtualTileCol(cardId, slot) = deckOrdinal*1000 + cardNumber + slot`，跨 deck 不冲突。对齐 BGA `$this->field = true` + `getFieldDetails()` + `onPlayerAfterReap`。
- `harvestReapSummary` 初始化时机：从 `continueHarvestReap` 提前到 `continueHarvestFieldStart`，让 `onHarvestFieldPhase` 内的 cardField 累加能进入同一份 summary，最终 `log.harvestReapDetail` 完整覆盖普通田 + cardField。
- `payGainActionFlow` / `payThenGainActionFlow` 不再把完整 resource-exchange preview 挂到 pay leaf；pay leaf 交给引擎生成 payment preview，gain leaf 生成 gain preview，避免描述重复。
- Replace-listener 重入防护当前为 listener 端责任：`buildReplaceChoiceFlow` 只对 alternative 分支标 `skipComputeReplaceListenerIds`，原 leaf 仅得 `checkedReplaceAction: true`。每张 replace-style 卡 handler 必须自检 `actionContext.checkedReplaceAction`（参考 B103 / C140）。未来重构可考虑由引擎统一兜底。
- `animal-quantity-select` interaction kind（`shared/protocol`）+ `subtractAnimalsFromBoard` helper（`shared/domain/animals.ts`）：通用多动物计数选择 + 按 pasture → house → stable → resource pool 顺序从场上扣除给定数量动物，供 B157_Salter 这类"按 on-board 数量结算"的卡牌复用。前端 `AnimalQuantitySelectPanel` 配套展示 sheep/boar/cattle 计数器并提交 `{ animalCounts }`。
- `readImprovementTypes(ctx)` 通用 helper（`shared/actions/effects/improvement.ts`）—— 读 `params.types ?? actionContext.types`，默认 `['major','minor']`，过滤 unknown / dedupe / 非数组容错。所有 improvement listener 通过它做 BGA `types in args` 等价过滤。`collectComputeChoiceCandidates(state, player, actionId, actionContext?)` 支持把 types 传到 `computeChoiceCandidates` phase 的 listener context。ESLint `no-restricted-syntax` 守门禁止 legacy `'minor-improvement'` / `'improvement-any'` 字面量。

## 11. 时间线

| 日期 | 批次 | 涉及卡牌 / 基建 |
|---|---|---|
| 2026-05-17 | B157 BGA alignment | B157_Salter + `animal-quantity-select` interaction kind + `subtractAnimalsFromBoard` helper + `AnimalQuantitySelectPanel` |
| 2026-05-17 | pay-gain option rendering | B42_ForestInn / D119_WoodBarterer + pay-gain helper preview |
| 2026-05-16 | B42 flow alignment | B42_ForestInn |
| 2026-05-16 | C60 mandatory bake continuation | C60_SmallPottersOven + before-resolved continuation `skipBeforeTriggers` |
| 2026-05-15 | C57 selection alignment | C57_Crudite + `remove-field-crops` / farm-position selectableTiles validation |
| 2026-05-15 | trueAction follow-up | C60_SmallPottersOven / B27_Toolbox / E130_Overachiever / E97_Beneficiary + improvement-any/minor-improvement `trueAction=false` propagation |
| 2026-05-15 | Wave 1 | A148_Woolgrower / B86_TruffleSearcher / D15_ClaySupports / D13_Trowel / E5_NightLoot + 4 项基建（§10） |
| 2026-05-16 | C8 alignment | C8_PlantFertilizer + `plant-additional-good` special-effect kind |
| 2026-05-17 | cardField infra + 11-card migration | `card-field.ts` helper + B68/D75/E80/D25/E72/C70/E68/E69/E70/B113/B141 + harvestReapSummary 时序修复 |
