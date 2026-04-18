# 卡牌实现进度

基于 BGA 参考项目（`../bga-agricola`）的完整对比。本文档是**唯一**的卡牌实现进度追踪源，
所有需要关注的卡（简化、行为偏差、成本错位、刻意偏离、待实现）按"与 BGA 对齐情况"统一在 §2 分类。

> 配套文档：`docs/card_desc_audit.md` 仅做 BGA `$this->desc` 文案对齐审计；行为/实现差异统一在本文件追踪。
>
> **维护规则（见 `AGENTS.md`）**：每次改完卡牌相关代码（无论是新实现、修 bug、改简化、改 desc、改 AI behavior、调整 hook），都必须把对应条目更新到本文件，并写明日期 / 批次 / 变更摘要。

---

## 1. 总览

| Deck | BGA 总数 | 已实现 | BGA 也无逻辑（数据 only） | BGA 有逻辑我们漏实现 | 需核心扩展 |
|---|---|---|---|---|---|
| A | 180 | 158 | 4 | 0 | 0 |
| B | 180 | 159 | 0 | 0 | 0 |
| C | 182 | 157 | 0 | 0 | 0 |
| D | 181 | 159 | 1 | 1 | 0 |
| E | 169 | 159 | 0 | 2 | 1 |
| **总计** | **892** | **821** | **5** | **3** | **1** |

**截至 2026-04-18：821/892 = 92.0%。**

> Major Improvements (10 张) 单独实现，不计入上表，全部已落地。
> 5+ 人卡（169-180 号段，~48 张）BGA 自身 `isImplemented=false`，不计入 BGA 总数。
> 若干卡通过静态 `modifier`/`modifiers`/`exchanges`/`scoreRule` 字段实现，视为已实现（例：A14, A60, A88, A123, B32, B80, B104, B145, C13, C14, D59, E153 等）。

---

## 2. 卡牌与 BGA 对齐分类

按"我们的实现 vs BGA 行为/数值是否一致"对所有需要关注的卡分类。
~810 张完全对齐的卡不逐张列；下面只列**有差异、有 TODO 或需要 owner 关注的卡**。

| 状态 | 数量 | 含义 | 处理方式 |
|---|---|---|---|
| ✅ 完全对齐 | ~803 + §2.1 列举 23 张 | 行为 + 元数据均与 BGA 一致 | 不用动 |
| 🟡 简化实现（§2.2） | 9 张 | 主路径工作，分支未做；缺啥基础设施有写 | 已知简化，按需排期 |
| ⚠ 行为偏差待修（§2.3） | 3 张 | 行为与 BGA 偏差，是 bug | 排期修 |
| ❌ 数值/元数据待修（§2.4） | 0 张 | cost / prereq / vp 与 BGA 不同 | 全部清零（PR1/PR2/PR3） |
| 🔀 刻意偏离 BGA（§2.5） | 4 张 | owner 签字过的设计差异 | **不要当 bug 修**，先开 issue |
| ⏳ 待实现 / 待评估（§2.6） | 4 张 | 未实现或需核心扩展 | 见 §2.6 优先级 |

### 2.0 近期变更（changelog 入口）

> 任何卡牌相关 commit 必须在这里加一行（见 §6 文档维护规则）。

- **2026-04-18 — D161 Cabbage Buyer 重实现 + isMajorImprovement 统一标志**：消除”固定 2 食物”偏离，改为 3/2/1 按实际打出改良的卡牌属性判定（`isEffectivelyMajor` helper）。新增基础设施 `isMajorImprovement` flag 标记 A60/D59/C60/D25 四张 minor-that-is-major 卡。D161 仅在 house-redevelopment 生效（farm-redev / standalone renovate 不触发），通过 tracker + `after:place-farmer` drain 延迟结算。
- **2026-04-18 — B132 EstateMaster 重实现 + 'reap' listener 基础设施**：用 `registerCardListener({actions:['reap']})` 替换原简化公式（每 3 格 +1 VP），对齐 BGA 规则——满格后每 harvest 的蔬菜 reap +1 VP。新增 `dispatchReapListener(state, player, crop, amount)` helper（`shared/actions/effects/reap.ts`）和 `'reap'` 合成 action；`reap()` 签名从 `(player)` 改为 `(state, player)`；D25/C70/E69/E70/E68/E72 六张额外 reap 卡各加一行 dispatch 调用。§2.5 移除 B132。
- **2026-04-18 — D161 CabbageBuyer 重实现 + session 测试**：从固定 2 food 简化改为 3-listener 追踪器（after:renovate-house 开 tracker、after:improvement-any 打标、after:place-farmer 清算报价）+ `isEffectivelyMajor` helper；已知限制：improvement-any OptionalNode 在 house-redevelopment 流程中始终 auto-skip，导致 hasMajor/hasMinor 无法被 tag，cost 实际恒为 3；8 个 session 测试全通过，T2/T3/T4 文档化此限制。§2.5 将 D161 改为”进行中/已知偏差”状态。
- **2026-04-18 — A113 Heresy Teacher 实现 + Field.stacks 多堆模型落地**：BGA 自身未实现；我们借机把 `Field.{crop, remaining}` 升级为 `Field.stacks: CropStack[]`（数组顺序 = 底→顶），让谷/菜混合田成为可能。新增 `shared/game/field.ts` 辅助函数统一访问。Sow 仍要求空田；Reap 只收顶堆（`remaining===0` 时 pop，下次收获暴露下一堆）；Scoring / prereq 改走 `fieldHasCrop`——混合田同时算谷田 + 菜田。A113 监听 Lessons 空间使用，对”有 ≥3 谷且无菜”的田 `unshift` 底堆 `{ kind: 'vegetable', remaining: 1 }`（当前唯一底堆插入的卡）。`rehydrateState` 加 legacy 迁移。~22 张 field-相关卡迁到新 helper；FarmBoard 前端按 stack 分段渲染。
- **2026-04-18 — `selection` / `farm-position` 抽象一步到位落地**：原先那条”提交一组选中农场位置后执行回调”的链路，已经从专用 `field-select` 动作彻底提升为通用 `selection` 动作族：`shared/actions/effects/selection.ts` 取代旧 `field-select.ts`，server / protocol / transport / UI 全链路改用 `ui.interactionSelection`、`InteractionSelection`、`commitSelection()`，卡牌 actionContext 统一改成 `selectionKind: 'farm-position'` + `positionFilter` / `selectableTiles`，持久化 key 统一从 `selectedFields` 改为 `selectedPositions`。这也让 D27 Retraining、D102 SampleStableMaker、E76 LumberPile 这类”并不真的只选田地”的交互终于有了语义正确的通道。
- **2026-04-18 — D60 / major return helper 收口到 `returnCardToBoard(player, cardId, state?)`**：`shared/actions/effects/pay.ts` 的 `returnCardToBoard` 现在可选接收 `state`，当归还的是玩家区里的 major improvement 时，会统一负责把该卡放回 `state.availableMajorImprovements` 且避免重复追加。`shared/actions/effects/improvement.ts` 的 major/minor 购买路径与 `shared/cards/D/D60_LargePottery.ts` 都改为复用这条 helper，不再各自手写 `availableMajorImprovements.push(...)`。`shared/actions/effects/__tests__/pay.test.ts` 新增”回板追加 / 不重复追加”覆盖。
- **2026-04-18 — D60 LargePottery 改回正确建模（删除 `returnCards`，走自定义 prerequisite + onBuy）**：上一版把 D60 建成 `returnCards: ['Major_Pottery']`，再靠 `PlayerCard.tsx` 特判把 UI 改成 prerequisite+cost 分离；这会把 BGA 的”Return the Pottery 是前置条件”误建模成”卡牌支付系统里的归还卡成本”。现改为：`shared/cards/D/D60_LargePottery.ts` 删除 `returnCards`，保留印刷 `prerequisite: 'Return the Pottery'`，并通过 `registerPrerequisite('Return the Pottery', ...)` 检查玩家是否已打出 `Major_Pottery`；购买后由 D60 自己的 `onBuy` 把 `Major_Pottery` 从玩家区退回到 `state.availableMajorImprovements`。`src/components/common/PlayerCard.tsx` 同步撤回上一版 UI 特判，恢复成只按真实 card data 渲染；`shared/cards/__tests__/D60_LargePottery.test.ts` 新增”无 Pottery 不能买 / 有 Pottery 才能买 / 买后 Pottery 被退回公牌区”覆盖。
- **2026-04-17 — D25 Witches' Dance Floor 多身份卡基础设施**：新增卡牌可同时提供多类身份（field + occupation + improvement）的能力；新基础设施 `providesField` / `providesOccupation` / `fireplaceIdentity` / `mustBePlayedViaMinorAction` / `extraOccupationsFromCards` 字段；`countFields` / `countOccupations` helper 聚合卡牌提供的虚拟身份；CookingHearth 返还代价扩展接受 `fireplaceIdentity`；新增 `cardMatchesCostList` helper 用于 fireplace 匹配；C70 LettucePatch 前置计数修正（虚拟田不计入终局田数计分，仅计入前置）。
- **2026-04-17 (PR3) — D60 LargePottery 完整对齐 + dual-type 基础设施落地**：新增 `CardType = 'major' | 'minor' | 'occupation'` 与 `CardDefinition.alsoCountsAs?: CardType[]`（对齐 BGA `getOtherCardTypes()`），新增 helper `cardCountsAs(cardId, asType)` + `collectCardsAs(player, asType)` 替代直接读 `player.improvements.length` / `player.minorPlayed.length`。D60 LargePottery 改 `cost: { clay:2 }→{ clay:1, stone:1 }`、`category: POINTS_PROVIDER→FOOD_PROVIDER`、补 `extraVp: true`、`evenMoreSet: true`、`returnCards: ['Major_Pottery']`（复用现有 complex-cost 基建——买 D60 强制归还 Major_Pottery）、`alsoCountsAs: ['major']`；D59 EarthOven 与 A60 OrientalFireplace 同步补 `alsoCountsAs: ['major']`。`prerequisites.ts` 的 `countMajorImprovements` / `countCookingImprovements` / `countBakingImprovements` 切到 `collectCardsAs(player, 'major')`；5 处 caller（A101 CookeryOutfitter、A31 DebtSecurity、D145 RoofExaminer、C5 Remodeling、B133 VillagePeasant）同步迁到 dual-type 计数。前端 `src/components/common/PlayerCard.tsx` 透传 `returnCards` + `alsoCountsAs` 到 `player-card-inner[data-also-counts-as]`，并让 minor 也能走”归还 `<major>` 或 `<cost>`” 渲染分支；`src/styles/card-sprite.css` 按属性选择器 `[data-also-counts-as~=”major”]` 为 dual-type minor 切换 `card_frame_major_minor.png` 与 `minor_major_costtext.png`（未来新增 dual-type minor 无需改 CSS）。新增测试：`shared/cards/helpers/__tests__/card-type.test.ts`（9 例 helper 覆盖）、`shared/cards/__tests__/D60_LargePottery.test.ts`（18 例：BGA 卡定义、scoresMap 全档、dual-type 自身、2-Major prereq）、`src/components/common/__tests__/PlayerCard.test.tsx`（5 例 dual-type 渲染）。`pnpm test` 361 files 1981 pass（D95/E109 两例与本 PR 无关的 pollution flake 在隔离运行下全绿）。详见 `docs/superpowers/plans/2026-04-17-PR3-D60-and-dual-type.md`。至此 §2.4 全部清零。
- **2026-04-17 (PR2) — §2.4 六张卡 cost/prereq 与 BGA 对齐**：B39 Loom `cost: { wood:1, reed:1 }→{ wood:2 }` + 新增 `2 Occupations` prereq；D31 Storeroom `cost: { reed:1 }→{ wood:1, stone:2 }`；D33 SummerHouse `cost: { wood:1, stone:1 }→{ wood:3, stone:1 }`；D34 LuxuriousHostel `cost: { stone:1, food:3 }→{ wood:1, clay:2 }`、删 `Stone House` 购买 prereq（`getStoneHouseBonusScore` 已内部判 `houseType === 'stone'` + `rooms > familySize`，wooden 时返回 0 不会漏给分）、新增 `extraVp: true` + `newSet: true`；D35 FodderChamber `cost: { wood:1, clay:1 }→{ stone:3, grain:3 }`；D38 MilkingStool 补 `2 Occupations` prereq（cost 本来就对齐）。新增 `shared/cards/__tests__/D34_LuxuriousHostel.test.ts`（5 个用例覆盖石屋/木屋、rooms≤family、未打出四种情形）。详见 `docs/superpowers/plans/2026-04-17-PR2-section-24-card-fixes.md`。D60 LargePottery 留给 PR3（需要 `returnCards` + dual-type 机制）。
- **2026-04-17 (PR1) — minor/occupation 印刷 `vp` 接入计分 + 16 张卡 vp 全量对齐 BGA**：`shared/logic/scoring.ts` 原先把所有 minor improvement 与 occupation 的 `score` 硬编码为 `0`，导致 `$this->vp` 对应的印刷分一直被静默吞掉（影响 ~110 张已实现卡）。现改为读取 `getRegisteredMinorImprovement(id).vp` / `getRegisteredOccupation(id).vp`；配套 `scripts/audit-card-vp.ts` 本地审计工具（不进 CI）一次性对齐 A25/B38/B39/C35/C59/D30/D31/D35/D60/E32/E38/E49/E52/E62/E71/E84 共 16 张 minor 的 `vp` 值（6+ 个 missing-ours 与 1 个 missing-bga 为 card-set scope 差异，已在 audit summary 里可见，留待后续）。PR1 仅改 `vp:` 字段；D31/D35/D60 的 `cost` 与 `returnCards`、B39/D38 的 `prerequisite` 留给 PR2/PR3。详见 `docs/superpowers/specs/2026-04-17-minor-vp-and-section-24-cards-design.md` PR1 节 + `docs/superpowers/plans/2026-04-17-PR1-minor-vp-scoring.md`。
- **2026-04-17 — A25 Bassinet 依照 Worker 身份模型重写**：完全对齐 BGA 的 canUseOccupied 语义（第一个非累积格 + 恰好 1 人，Meeting Place 显式排除）。新增 `countPeopleOnSpace` helper；修复 A25 listener 的 actions 过滤器 bug（与 canUseOccupied 的 actionId=space.id 分发约定不匹配，导致 handler 从未被触发）。
- **2026-04-17 — Worker 身份模型基建落地**：13 个子任务分 commit 推进；全仓 grep 替换聚合字段读点；新增 `shared/game/{player,space}.ts` helper。为 A25 Bassinet BGA 对齐打底。详见 `docs/ENGINE_ARCHITECTURE.md § 11.4.1`。
- **2026-04-17 — B30 Wood Palisades 完整实现**：按 segment 新增替代 fence 类型（2 wood / +1 VP / 不计入 `MAX_FENCES` 15 上限 / 不进入 fence-keyed 卡片统计）。`PlayerState.fences` 数值字段替换为 `FenceSegment[]` + 推导 helper `getFenceCount` / `getPalisadeCount`；`validateFenceSelection` 增加 `allowPalisades?` 选项；`ActionDetailEffects` 的 `fencing` / `palisading` 日志拆分；前端 `useFarmSelection` 增加模式切换。新增错误码 `EDGE_TYPE_CONFLICT`、`PALISADES_NOT_UNLOCKED`。跨卡迁移（A22 / A34 / A47 / A68 / B119 / C54 / C88 / E74 / E108，共 9 张 fence-keyed 卡）仅是数据访问面从 `player.fences` 切到 `getFenceCount(player)`——纯围栏场景下可观察行为未变；只有在 B30 打出后 palisade 才被相应排除。
- **2026-04-17 — A87 Conservator 完整实现**：`renovate-house` 重构为可参数化（`params.skipClayTier`），删除独立 `renovate-house-to-stone`；A87 加 `computeReplace` + `isDoable` 两个 listener；新增 i18n key `ui.interactionConservatorDirectStone`。renovation 折扣天然复用到 Conservator 分支：cost-type modifier `appliesTo: ['renovation']`（A143 Stonecutter / A123 FrameBuilder）经 `payTypedFlatCost` 与 actionId 无关；actionId-keyed `computeCosts` 监听器（D154 ChimneySweep）也命中该 branch，只是其自带 `houseType === 'clay'` 守卫（§2.3 独立 bug）当前阻止其在 wood→stone 上生效。
- **2026-04-17 — A87 Conservator UX 重构（route 3：`computeChoiceCandidates` opt-in choice flow）**：放弃 `computeReplace.decline + alternativeFlow` 的顶层 XOR 拆分（早前会显示成 `House Redevelopment` / `Renovate directly to stone (Conservator)` 两个并列按钮），改造引擎层增加 `computeChoiceCandidates` phase + `ActionDefinition.getBaseChoiceOptions / choicePromptKey / noChoiceLogKey` 三个新字段；引擎在 dispatch 时跳过 `execute()`，合并 base + extra 候选并按 `params.selectedOption` 跑 cost preview 过滤——0 候选 fail / 1 候选自动短路 / ≥2 候选才弹 prompt（详见 ENGINE_ARCHITECTURE §11.6.2）。`renovate-house` 用 `getBaseChoiceOptions` 提供 `clay` / `stone` 基础目标 + 新 `resolveChoice` 路径并删除 `params.skipClayTier`；`buildRenovationPlan(player, target)` 取代 `getRenovation(player, params)` 的隐式参数；A87 删 `computeReplace` listener，仅留一个 `computeChoiceCandidates` listener（wood 房屋时注入 stone 候选）+ 现有 `isDoable` listener（救回"只买得起 stone"场景的入口可见性）。i18n 拆 `actions.renovate-house.*` 与 `actions.house-redevelopment.*` 两套 key（前者命名为"住宅翻修 / Renovate House"），并新增 `ui.interactionChooseRenovationTarget` / `ui.interactionRenovateToClay` / `ui.interactionRenovateToStone`。`computeArgs.extraOptions` 与新 opt-in 路径互斥：当 action 声明 `getBaseChoiceOptions` 时，引擎不再把 `computeArgs` 的 `extraOptions` 合进结果。覆盖测试：`shared/engine/__tests__/engine-choice-candidates.test.ts`（5 cases：单候选短路 / 多候选 prompt / 0 候选 fail / 候选去重 / 按 `selectedOption` 过滤）+ `shared/actions/effects/__tests__/renovation.test.ts`（新增 `buildRenovationPlan` + `renovateHouseAction.resolveChoice` 直跑 case）+ `server/__tests__/A87_Conservator-session.test.ts`（重写为新 listener + 显式断言旧 `computeReplace` listener 已删除）。
- **2026-04-17 §6 24 张卡逐项复核完成**：原 §6 的 23 张"未复核"全部核对，按 ✅/⚠/❌ 重排进 §2.1–§2.4；C129/C137 卡名从 WetNurse/Baker 修正为 SecondSpouse/CharcoalBurner；E132 VeggieLover 从原 §5 "刻意不同"移除（其实是 3+ 卡且行为已对齐）。
- **2026-04-17 desc 对齐 / 命名修复**：全量 BGA `$this->desc` ↔ 我们 `desc` 审计 `895/902` 已对齐（详见 `docs/card_desc_audit.md`）；`A159_JoinerOfSea` → `A159_JoineroftheSea` 改名对齐 BGA。
- **2026-04-17 Wave 9 已补完（6 张）**：`A41_VegetableSlicer` · `A85_Homekeeper` · `A106_SlurrySpreader` · `D103_CanalBoatman` · `E68_CherryOrchard` · `E93_Motivator`。本轮明确延后：`A87_Conservator`、`E149_MidnightFencer`（见 §2.6）。
- **2026-04-18 — E125 DelayedWayfarer BGA 对齐**：新增 `onAllWorkersPlaced` hook phase（所有工人放完后、round end 前触发）；`place-farmer` 增加 `fromSupply` 模式（激活 supply worker）；E125 从简化（下轮开始）改为精确时序（本轮所有人放完后）；修复引擎 OptionalNode 路径漏传 `actionContext`/`sourceCard` 的 bug。

### 2.1 ✅ 完全对齐（已逐项核对的 25 张）

> ~800 张未列卡按 `shared/cards/catalog.ts` 注册即视为已实现；下表是 2026-04-17 复核中逐项核对过、明确标 ✅ 的 25 张（14 base + A25 + A87 + B30 + PR2 迁入 6 张 + PR3 迁入 D60 + A113 + D25）。

| Card | 复核要点 | 备注 |
|---|---|---|
| A101 CookeryOutfitter | 排除 Ovens | 用 `isCookery` 标志，Ovens 只有 `isBaking`，正确排除 |
| A134 FullFarmer | onBuy `1<WOOD>+1<CLAY>` + 满栏 pasture 计分 | 行为一致；def 中 `players: '1+'` ≠ BGA `'3+'`（仅元数据） |
| A142 Cordmaker | reed-bank 触发 + owner 强制 / opponent 可选 XOR | scope `any` + isOwner 判断正确 |
| A153 PigOwner | 首次 5 头猪触发，flag-once | anytime listener + `isCardFlagged` 一致 |
| B153 Housemaster | smallest-value-doubled + A60 OrientalFireplace 特例 | 包括 `min===1` 时才纳入 OrientalFireplace 的 BGA 特殊规则 |
| B159 LieutenantGeneral | round 14 用 grain；相邻判断 | 用 `triggerPlayer.fields.length >= 2` 启发式（依赖我们 plow 强制相邻规则） |
| C137 CharcoalBurner | 任意玩家打/造 bake 改良 → 1 wood + 1 food | scope `any` + `isBaking` 检测 |
| D29 MuckRake | unfenced stable 各动物 1 VP | 依赖 `stableAnimals` 仅含 unfenced 单格的现有数据约定 |
| D150 GodlySpouse | 第二个 farmer 打 family growth → 召回第一个 | `getRoundPlacementOrder().length === 2` 与 BGA `countPlacedFarmers()==2` 等价 |
| E101 Blighter | `14 - round` × scoreMap，且禁用后续 occupation | scoreMap 一致 + isDoable 阻断 |
| E144 WaresSalesman | "可把建材换 food 的卡"列表 | 4 类硬编码列表与 BGA 完全一致 |
| E154 Margrave | 任意玩家翻新 + 自己住石屋 → 2 food | 触发条件、计分一致 |
| E156 ClaypitOwner | 对手打/造印刷 clay 成本改良 → 1 food + 1 clay | 印刷成本检测覆盖 minor + major（含复合成本 fees） |
| A25 Bassinet | 首次使用非累积空间且格上恰好 1 人（含新生儿），可 canUseOccupied + family growth；Meeting Place 显式排除 | Worker 身份模型重写；`countPeopleOnSpace` helper + actions 过滤器 bug 已修（2026-04-17） |
| A87 Conservator | 木屋玩家进入 House Redevelopment 后，在 `Renovate House` 内部多一个 wood→stone 直跳目标（同 prompt 二选一，1 候选自动短路） | 引擎 `computeChoiceCandidates` opt-in 路径（详见 ENGINE_ARCHITECTURE §11.6.2）；A87 仅注入额外 `stone` 候选 + `isDoable` 救入口；A143/A123 cost-type modifier `appliesTo:['renovation']` 自动生效；D154 clay-only 守卫（§2.3）仍屏蔽 wood→stone |
| B30 WoodPalisades | 按 segment 替代 fence：2 wood、+1 VP、不计入 `MAX_FENCES`、不进入 fence-keyed 卡统计 | `FenceSegment[]` + `getFenceCount`/`getPalisadeCount` helper；`validateFenceSelection({ allowPalisades })`；`ActionDetailEffects.fencing` / `palisading` 拆分；9 张 fence-keyed 卡迁到 helper（见 §2.0 changelog） |
| A113 HeresyTeacher | Lessons 空间使用后，对"≥3 谷且无菜"的田底堆 unshift `{kind:'vegetable',remaining:1}` | BGA 自身未实现；借 Field.stacks 多堆模型落地，底堆 veg 在顶堆 grain 收完后才会被 reap（见 §3 新基建） |
| D25 WitchesDanceFloor | 多身份改良（同时提供 field + occupation + improvement）；虚拟田仅计入前置检查、不计入终局地皮数计分 | 多身份卡基础设施（见 §3）；`countFields` / `countOccupations` helper 聚合虚拟身份；`playMinorImprovement` 守卫 `mustBePlayedViaMinorAction`；`cardMatchesCostList` 用于 fireplace 身份匹配 |
| B39 Loom | cost/prereq 与 BGA 完全一致 | 2026-04-17 PR2：`cost: { wood: 2 }`、`prerequisite: '2 Occupations'`、`occupationPrerequisites: { min: 2 }`、`vp: 1` |
| D31 Storeroom | cost + vp 对齐 | 2026-04-17 PR2：`cost: { wood: 1, stone: 2 }`、`vp: 1`；`computeBonusScore` 原先已算 grain+veg 配对 |
| D33 SummerHouse | cost 对齐 | 2026-04-17 PR2：`cost: { wood: 3, stone: 1 }`、`prerequisite: 'Still in Wooden House'` 保留 |
| D34 LuxuriousHostel | 购买 prereq 从"Stone House" 改为无，新增 extraVp/newSet 标志，但计分依然受石屋限制 | 2026-04-17 PR2：`cost: { wood: 1, clay: 2 }`、删 `prerequisite: 'Stone House'`、加 `extraVp: true` + `newSet: true`；`getStoneHouseBonusScore` 内部 `houseType === 'stone'` + `rooms > familySize` 双守卫负责石屋独占性，wood 局面下返回 0 |
| D35 FodderChamber | cost + vp 对齐 | 2026-04-17 PR2：`cost: { stone: 3, grain: 3 }`、`vp: 2`；`computeBonusScore` 按人数分档（7/5/4/3 除数）对齐 BGA |
| D38 MilkingStool | 补 2-Occupations prereq | 2026-04-17 PR2：`cost: { wood: 1 }`（本来就对）、新增 `prerequisite: '2 Occupations'` + `occupationPrerequisites: { min: 2 }` |
| D60 LargePottery | dual-type（minor + alsoCountsAs major）+ prerequisite `Return the Pottery` + onBuy 退回 Major_Pottery + scoresMap 按 clay 3-4/5/6/7+ 给 1/2/3/4 | 2026-04-17 PR3：`cost: { clay: 1, stone: 1 }`、`category: 'FOOD_PROVIDER'`、`vp: 3` + `extraVp: true` + `evenMoreSet: true`、`alsoCountsAs: ['major']`；2026-04-18 修正建模：删除 `returnCards`，改为保留印刷 `prerequisite: 'Return the Pottery'` + custom prerequisite handler（需已打出 `Major_Pottery`）+ D60 `onBuy` 主动把 `Major_Pottery` 退回 `availableMajorImprovements`。`computeBonusScore` 原本已对（clay≥3/5/6/7 → 1/2/3/4）。注：D59 EarthOven / A60 OrientalFireplace 同步补 `alsoCountsAs: ['major']`——行为等价（之前就有 returnCards）但现在 2-Major prereq 与 B133 VillagePeasant / C5 Remodeling / A31 DebtSecurity / D145 RoofExaminer / A101 CookeryOutfitter 都会把它们计入 major 侧 |

### 2.2 🟡 简化实现（9 张）

> 简化原因写在各卡 `.ts` 文件顶部注释中。回归 BGA 完整规则需要的基础设施列在最后一列。

| 卡牌 | 简化内容 | 完整规则需要 |
|---|---|---|
| A3 PaperKnife | 跳过"选 3 再随机 1"中间步骤；onBuy 直接从整手随机选 1 免费打 | `select-N-from-hand` pending 类型 |
| A48 ShavingHorse | 只监听 `gain`（限 `copse`/`forest`/`grove`/`resource-market-4`）+ `collect`；缺 `receive`/`reap`/exchange-after 触发 | 通用 "wood-obtained" hook 或 `after:gain` 全资源监听 |
| B3 Moonshine | XOR 折叠为"买不起则 PASS"（自动抉择） | `select-N-from-hand` + pass-to-opponent action |
| C22 BasketChair | 每轮开始提供一次额外 place-farmer，不召回已放农民 | 新 farmer-recall-to-card 机制 |
| C150 ParrotBreeder | 仅保留 anytime 激活信号（付 1 谷 → 得 1 谷）；对手行动追踪未实现 | 跨玩家状态 + 动态 computeArgs-place-farmer |
| D95 SiteManager | 贪心：短缺时才用食物替换建材 | 支付路径支持组合选择（2^N trade combinations） |
| D102 / E76 | 跳过 FarmHand 分支 | B85 模型需独立 FarmHand 马厩 tile |
| E16 BriarHedge | 围栏前提已加，但"每边免木"未实现 | 重写 `fencing.ts` 支持按边计费 |
| E96 Elder | 回合 1 StartOfWork 额外打出职业未实现 | 新 `stStartOfTurn allowedCards` hook |

### 2.3 ⚠ 行为偏差待修（3 张）

> 不是设计取舍，是 bug——只是修起来需要动一点架构 / action-space 配置。

| Card | 偏差 | 影响 | 建议 |
|---|---|---|---|
| B143 ClayWarden | 只监听 `hollow-4`（仅 4 人空间）；3 人版 `hollow` action 空间在我们项目里整个缺失 | 3 人局：B143 永不触发（且整局没 Hollow 空间） | 新增 `hollow` 3 人版 action 空间；B143 listener 同步加 `hollow` |
| C129 SecondSpouse | 我们只检查"对方占用"；BGA 还要求"占用者是其本人**第一个**放的 farmer 且占用人数 ≤2" | 我们更宽松——对方第二/三人占的也允许抢；轻微规则违规 | listener handler 加占用者来源判断（需要 `placedFarmers` 顺序信息） |
| D154 ChimneySweep | 我们限制 `houseType === 'clay'` 才减 2 stone；BGA 不区分 | wood→stone 直接跳级翻新（A87 Conservator 等卡）减免不生效 | 去掉 `houseType` 条件；保持 `costs: { stone: -2 }` 始终返回 |

### 2.4 ❌ 数值/元数据待修（0 张）

> 卡牌**入场成本**、**前置条件**或**基础 vp** 与 BGA 不同——直接影响经济与可玩性，优先级最高。
>
> 2026-04-17：本节已全部清零。PR1 统一接入印刷 `vp` 计分 + 16 张 minor vp 对齐；PR2 把 B39/D31/D33/D34/D35/D38 共 6 张的 cost/prereq 对齐；PR3 完成 D60 LargePottery 的 cost/category/alsoCountsAs + dual-type 基建（`CardType`、`alsoCountsAs`、`cardCountsAs`、`collectCardsAs`）。2026-04-18 再把 D60 的“返还 Pottery”从 `returnCards` 建模修正为 custom prerequisite + `onBuy` return。全部迁入 §2.1。
>
> 后续若再出现 cost/prereq/vp 偏差，重新在本节登记并走同样流程：`scripts/audit-card-vp.ts` 本地审计 + 对应 caller 迁移。

### 2.5 🔀 刻意偏离 BGA（3 张）

> 这些卡 desc 与 BGA 一致，但实现选择刻意偏离 BGA 行为。每张都需写明**为什么不同**和**回归 BGA 的代价**。
>
> **不要**把这些当作 bug 修。改这些之前先开 issue / 跟 owner 确认。

| 卡牌 | BGA 行为 | 我们的行为 | 偏离原因 | 回归 BGA 的代价 |
|---|---|---|---|---|
| B38 FutureBuildingSite | 在所有其它格子用完前，禁用紧贴房屋的正交相邻格 | 故意简化：未做"邻接禁用" | 需要 placement 阶段全局可用性裁定，影响 `place-farmer` 的 `isDoable` | `isDoable` 加一个 placement 几何裁定 hook |

| D161 CabbageBuyer | 按改良类型 3/2/1 售价 | 3/2/1 按打出改良的实际属性；仅在 house-redevelopment 生效 | 仅在 house-redevelopment 生效；farm-redev / 卡触发 renovate 不 offer | 给 farm-redev / standalone renovate 各加一条 offer 3 食物分支 |

> **历史记录**：~~E132 VeggieLover~~ 之前被误标为"刻意不同"。实际上它是 BGA 3+ 人卡（不是 5+），desc 与行为（harvest 1G+1V→6F、scoring 1/2/3 stack→2/4/6 VP）都已与 BGA 对齐。2026-04-17 移除。

### 2.6 ⏳ 待实现 / 待评估（3 张）

#### Tier 1 — BGA 自身无逻辑，我们也无逻辑（数据 only）

| Card | 类型 | BGA 状态 | 我们的处理 | 优先级 |
|---|---|---|---|---|
| D159 Reed Seller | Occupation | `isImplemented=false` | 需要"可阻止行动 + 拍卖式选择"系统 | LOW |

> **A113 Heresy Teacher**（2026-04-18）已从此处迁出至 §2.1：BGA 自身仍 `isImplemented=false`，我们借 Field.stacks 多堆模型实现。
> **D25 Witches' Dance Floor**（2026-04-17）已从此处迁出至 §2.1：多身份卡基础设施已落地（见 §3）。

#### Tier 2 — BGA 有完整实现，我们仍缺

| Card | 类型 | BGA 关键点 | 我们的状态 | 优先级 |
|---|---|---|---|---|
| E149 Midnight Fencer | Occupation | `StartHarvest` listener，第 14 轮跨玩家拿围栏，可超过 15 上限 | 未做；最复杂剩余 | MED-HIGH |

> `D155_Ebonist`、`D103_CanalBoatman`、`E93_Motivator` 已于 2026-04-17 收口。

---

## 3. 基础设施清单（已落地）

| 设施 | 状态 | 说明 |
|---|---|---|
| PlayerActionCard 行动格 | ✅ | 11 张卡，含 owner 显示、meeple 渲染 |
| `onComputeAnimalZones` | ✅ | 动物容量修改器 |
| `CardExchange` + `exchange-registry` | ✅ | 烹饪/交换改良 |
| `computeBonusScore` | ✅ | 45+ 张计分卡 |
| Anytime 动作系统 | ✅ | CardListener `phases: ['anytime']` |
| Holder / Counter / Stack | ✅ | 资源堆叠两种模式 |
| `queueFutureMeeplesFlow` | ✅ | Future meeples 两种形式 + remove |
| 对手交互 (`scope: 'opponent'`) | ✅ | 8 张卡覆盖 4 种模式 |
| `selection` / `InteractionSelection` | ✅ | 2026-04-18：原先专用于“选位置后回调”的 `field-select` 链路已独立成通用 `selection` interaction；当前 concrete subtype 为 `farm-position`，支持 `positionFilter` 与显式 `selectableTiles` 两种来源。 |
| PlayerSwitch in ActionFlow | ✅ | `deferredPlayerSwitch` |
| `resourcesPaid` 追踪 | ✅ | `pay-resources` 返回实际支付 |
| `computeReplace` + decline | ✅ | day-laborer / A94 / D21 等 |
| `onGainResource` (after:gain) | ✅ | E103_Wolf 等 |
| `onEndTurn` 阶段 hook | ✅ | person-action turn 收束点 |
| `PrerequisiteHandler(player, state?)` | ✅ | 2026-04-17 扩展了 state 参数（C32 全局检查需要） |
| `returnCardToBoard(player, cardId, state?)` | ✅ | 2026-04-18：helper 现在可选接收 `state`，统一负责“从 `player.improvements` / `player.minorPlayed` 移除卡”以及“若归还的是 major，则回收到 `state.availableMajorImprovements` 且不重复追加”。消费者：major/minor improvement 支付路径、D60 LargePottery。 |
| `selectionEffect` / `selection-effect-registry` | ✅ | 2026-04-18：原 `fieldEffect` / `field-effect-registry` 更名，并在同日完成与 `selection` action 对齐。语义是“selection 提交后执行一个注册回调”，不再把这类“选择提交后的副作用”误称为 field effect。消费者：A58/A70/A71/B115/B165/C18/D27/D70/D71/D72/D102/E4/E71/E76。 |
| `stable-removal` helper | ✅ | D102 / E76 |
| `recall-placed-worker` action | ✅ | D93（通用农民回收） |
| `discard-from-hand` action | ✅ | B146（通用弃手牌） |
| **Worker 身份模型**（2026-04-17） | ✅ | `PlayerState.workers[]`（5 槽，isActive/isNewborn）+ `ActionSpace.takenBy: WorkerRef[]` + `__roundPlacement__` 升级为 `{spaceId, workerId}[]`。删除聚合字段 familySize / newbornCount / workersAvailable，全部走 `shared/game/player.ts` helper。消费者：A25 Bassinet、B4 WoodPile（TODO 可接）、A92 AdoptiveParents（从盲减升级为精确取回）。 |
| **`countPeopleOnSpace` helper**（2026-04-17） | ✅ | `shared/cards/helpers/space-occupancy.ts`：返回某行动格上当前物理占位的人数（含新生儿）。依赖 Worker 身份模型——等于 `space.takenBy.length`。消费者：A25 Bassinet；B4 WoodPile 原 TODO 可顺带消化。 |
| `FenceSegment[]` + `getFenceCount` / `getPalisadeCount` | ✅ | B30：`PlayerState.fences` 由数值字段改为类型化 segment 数组；所有旧 `player.fences` 读取迁到 helper（`shared/game/types.ts` + `shared/actions/effects/fencing.ts`） |
| `validateFenceSelection({ allowPalisades })` | ✅ | B30：围栏选择校验支持 palisade 模式，新增错误码 `EDGE_TYPE_CONFLICT` / `PALISADES_NOT_UNLOCKED` |
| `ActionDetailEffects` fencing / palisading 拆分 | ✅ | B30：effects 日志区分围栏与木栅两种建造 |
| `useFarmSelection` 围栏/木栅模式切换 | ✅ | B30 前端：同一 farm selection 可切换 fence / palisade 目标 |
| **Field.stacks 多堆模型 + `shared/game/field.ts` helper**（2026-04-18） | ✅ | `Field.{crop, remaining}` → `Field.stacks: CropStack[]`（数组顺序 = 底→顶）。Helpers：`fieldIsEmpty` / `fieldTopStack` / `fieldBottomStack` / `fieldHasCrop` / `fieldTotalRemaining` / `fieldPopIfDepleted` / `fieldDecrementTop` / `fieldFindStackOfKind` / `countFieldsWithCrop` / `countEmptyFields`。**口径**：(a) 任一 stack 含作物即算该田含该作物（scoring / prereq 都走 `fieldHasCrop`——混合田同时算谷田+菜田）；(b) reap 只收顶堆，`remaining===0` 时 pop，下次收获暴露下一堆；(c) sow 仍要求空田（`fieldIsEmpty`）；(d) 单卡（当前仅 A113 Heresy Teacher）可 `unshift` 到底堆。`rehydrateState` 加 legacy `{crop, remaining}` → `stacks` 迁移。消费者：~22 张 field-相关卡 + sow/reap/scythe-harvest-field/swap-field-crop/plow/pay-grain-any/grain-thief-protect/scoring/prerequisites；前端 `FarmBoard` 按 stack 分段竖向渲染（底在下、顶在上）。 |
| **`providesField` 标志 + `countFields` helper**（2026-04-17） | ✅ | D25：次要改良卡可标记 `providesField: true` 提供虚拟田；`countFields(player)` helper 聚合农民自有田地 + 卡牌虚拟田。虚拟田仅计入前置条件检查（如 `prerequisite: { fields: 2 }`），不计入终局田数计分（计分仅看 `player.fields.length`）。 |
| **`providesOccupation` 标志 + `extraOccupationsFromCards` 字段 + `countOccupations` helper**（2026-04-17） | ✅ | D25：次要改良卡可标记 `providesOccupation: true` 提供虚拟职业；`PlayerState.extraOccupationsFromCards` 记录从卡牌获得的额外职业数（打出卡时累加）；`countOccupations(player)` helper 返回已放农民数 + 虚拟职业数的总和。前置条件（如 `prerequisite: { occupations: 2 }`）与终局计分（`E101 Blighter` 等）都走 helper 计数。 |
| **`fireplaceIdentity` 标志 + `cardMatchesCostList` helper**（2026-04-17） | ✅ | D25：次要改良卡可标记 `fireplaceIdentity: true` 作为"可返还 Fireplace"代价；`cardMatchesCostList(card, costList)` helper 用于 `CookingHearth` / `A60_OrientalFireplace` 等卡检测代价卡是否匹配（支持 `subtype` / `id` / `providedFields` / `providedOccupations` / `fireplaceIdentity` 等多种匹配模式）。 |
| **`mustBePlayedViaMinorAction` 标志**（2026-04-17） | ✅ | D25：次要改良卡可标记 `mustBePlayedViaMinorAction: true` 强制仅能通过"次要改良"行动打出；`playMinorImprovement` action 的 `isDoable` listener 检查此标志，防止其他路径打出。 |
| **`isMajorImprovement` flag + `isEffectivelyMajor` helper**（2026-04-18） | ✅ | `CardDefinition.isMajorImprovement?: boolean` 标记"本质是 major 的 minor"（A60/D59/C60/D25 四张）。`shared/cards/helpers/card-identity.ts` 导出 `isEffectivelyMajor(cardId)` 统一判定入口（先查 major pool，再查 minor 的 flag）。消费者：D161 CabbageBuyer。 |
| **minor / occupation 印刷 `vp` 接入计分**（2026-04-17, PR1） | ✅ | `shared/logic/scoring.ts:287-293` 通过 `getRegisteredMinorImprovement(id).vp` / `getRegisteredOccupation(id).vp` 把印刷 VP 计入 `cardEntries`；之前硬编码 `score: 0`。配套本地审计脚本 `scripts/audit-card-vp.ts`（`npx tsx scripts/audit-card-vp.ts [--strict]`）对齐 BGA minor/occupation `vp` 字段；**不进 CI**，只作本地 gate。 |
| **Dual-type cards (`CardDefinition.alsoCountsAs`)**（2026-04-17, PR3） | ✅ | 新增 `CardType = 'major' \| 'minor' \| 'occupation'` + `CardBase.alsoCountsAs?: CardType[]`（对齐 BGA `getOtherCardTypes()`）。`shared/cards/helpers/card-type.ts` 提供 `cardCountsAs(cardId, asType)` 与 `collectCardsAs(player, asType)`；`prerequisites.ts` 的 3 个 count 函数 + 5 处 caller（A101/A31/D145/C5/B133）全部切到 dual-type 计数。落地卡：D60/D59/A60 均 `alsoCountsAs: ['major']`。前端 `PlayerCard` + `card-sprite.css` 走 `data-also-counts-as` 属性选择器切换 `card_frame_major_minor.png` + `minor_major_costtext.png`——未来新增 dual-type minor 零改动即可正确渲染。 |

---

## 4. 实现进度时间线

| 批次 | 日期 | 新增 hooks | 累计 | 累计率 |
|---|---|---|---|---|
| 1+2 | 04-15 | +134 | 325 | 36.4% |
| 3 | 04-15 | +72 | 397 | 44.5% |
| 4 | 04-15 | +56 | 453 | 50.8% |
| 5 | 04-15 | +34 | 487 | 54.6% |
| 6 | 04-15 | +39 | 526 | 59.0% |
| 7 | 04-15 | +24 | 550 | 61.7% |
| 8 | 04-15 | +15 | 565 | 63.3% |
| 9 | 04-15 | +22 | 587 | 65.8% |
| 10 | 04-16 | +10 | 597 | 66.9% |
| 11 | 04-16 | +18 | 615 | 68.9% |
| 12 | 04-16 | +15 | 630 | 70.6% |
| 13 | 04-16 | +71 | 701 | 78.6% |
| 14 | 04-16 | +5 | 706 | 79.1% |
| 15 | 04-16 | +23 | 729 | 81.7% |
| 16 w1 | 04-16 | +13 | 742 | 83.2% |
| misc + A19/A89 | 04-16/17 | +17 | 759 | 85.1% |
| Wave 1 listener | 04-17 | +21 | 780 | 87.4% |
| Wave 2 modifier/prereq | 04-17 | +9 | 789 | 88.5% |
| Wave 3 compute-cost | 04-17 | +5 | 794 | 89.0% |
| Wave 4 chain-action | 04-17 | +3 | 797 | 89.4% |
| Wave 5 tier-2 low | 04-17 | +6 | 803 | 90.0% |
| Wave 6 farmer-recall + goods | 04-17 | +2 | 805 | 90.2% |
| Wave 7 card-select | 04-17 | +2 | 807 | 90.5% |
| Wave 8 high-complexity | 04-17 | +3 | 810 | 90.8% |
| D155 exchanges fixup | 04-17 | +1 | 811 | 90.9% |
| Wave 9 + desc align | 04-17 | +6 | 817 | 91.6% |
| A87 Conservator | 04-17 | +1 | 818 | 91.7% |
| B30 Wood Palisades | 04-17 | +1 | 819 | 91.8% |
| D25 多身份卡基础设施 | 04-17 | +1 | 820 | 91.9% |
| A113 Heresy Teacher + Field.stacks | 04-18 | +1 | 821 | 92.0% |

### 2026-04-17 Wave 1-9 明细

- **Wave 1 (+21):** A42 · A43 · A111 · A124 · B18 · B51 · B63 · B120 · B121 · B122 · B156 · B161 · C26 · C28 · C117 · C140 · C154 · C160 · D21 · D134 · E3
- **Wave 2 (+9):** A10 · C10 · C32 · D11 · D37 · D85 · E16 · E29 · E96
- **Wave 3 (+5):** A27 · B155 · C95 · D95 · E109
- **Wave 4 (+3):** B130 · B150 · B152
- **Wave 5 (+6):** C23 · D22 · D27 · D102 · E76 · B3
- **Wave 6 (+2):** D93 · D137
- **Wave 7 (+2):** A3 · B146
- **Wave 8 (+3):** C22 · C150 · E125
- **Wave 9 (+6):** A41 · A85 · A106 · D103 · E68 · E93

---

## 5. 状态符号

§2 分类表使用以下符号：

- ✅ **完全对齐** — 行为与元数据均与 BGA 一致（§2.1）
- 🟡 **简化实现** — 主路径工作，分支未做；缺啥基础设施有写明（§2.2）
- ⚠ **行为偏差待修** — 不是设计取舍，是 bug，只是修起来要动架构（§2.3）
- ❌ **数值/元数据待修** — cost / prereq / vp 与 BGA 不同（§2.4）
- 🔀 **刻意偏离 BGA** — owner 签字过的设计差异，**不要当 bug 修**（§2.5）
- ⏳ **待实现 / 待评估** — 数据-only 或核心扩展（§2.6）

实现清单以 `shared/cards/catalog.ts` 的 `minorImprovementCards` / `occupationCards` 数组为准；
具体 hook 注册在各 `shared/cards/{Deck}/{CardId}_{Name}.ts` 文件内。

---

## 6. 文档维护规则

- **本文件是卡牌实现进度的唯一权威来源。** 不要再创建 `cards_impl.md` / `IMPLEMENTATION_STATUS.md` 等并行文档。
- 任何卡牌相关 commit（包括但不限于：实现新卡、改 desc、调 hook、删/改测试、改通用机制并影响某类卡）都必须**同步**改本文件，至少：
  - 在 §2.0 加一行说明本次变更
  - 把对应卡片在 §2.1–§2.6 之间迁出 / 迁入 / 更新状态
  - 必要时更新 §1 总览数字
  - 必要时把新加的通用机制加进 §3 基础设施
- desc 文案级的对齐审计走 `docs/card_desc_audit.md`，不在本文件展开。
