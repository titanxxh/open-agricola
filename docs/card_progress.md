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

**截至 2026-04-25：821/892 = 92.0%。**（2026-04-19 多项重构 / 对齐变更未新增已实现卡数：E16 BriarHedge border-fence、行动格按人数过滤、`canUseOccupied` → `computeArgs` 统一、E96 Elder + handHooks、C22 BasketChair + card-held-workers、D154 ChimneySweep wood→stone、C129 SecondSpouse 首置条件、A48/B143 对齐 BGA、卡池按人数过滤 + C39 StudioBoat BGA 对齐。）

> Major Improvements (10 张) 单独实现，不计入上表，全部已落地。
> 5+ 人卡（169-180 号段，~48 张）BGA 自身 `isImplemented=false`，不计入 BGA 总数。
> 若干卡通过静态 `modifier`/`modifiers`/`exchanges`/`scoreRule` 字段实现，视为已实现（例：A14, A60, A88, A123, B32, B80, B104, B145, C13, C14, D59, E153 等）。

---

## 2. 卡牌与 BGA 对齐分类

按"我们的实现 vs BGA 行为/数值是否一致"对所有需要关注的卡分类。
~810 张完全对齐的卡不逐张列；下面只列**有差异、有 TODO 或需要 owner 关注的卡**。

| 状态 | 数量 | 含义 | 处理方式 |
|---|---|---|---|
| ✅ 完全对齐 | 587 张（含深度池 64 + wide-scan 475 + 数据 only 48） | 行为 + 元数据均与 BGA 一致 | 不用动 |
| 🟡 简化实现（§2.2） | 130 张（2026-04-28 深度 40 + 2026-04-29 wide 90） | 主路径工作，分支未做；缺啥基础设施有写 | 已知简化，按需排期 |
| ⚠ 行为偏差待修（§2.3） | 38 张（原 44；Sprint 2 已修 6 张：B116 / A165 / B133 / B14 / D138 / E134） | 行为与 BGA 偏差，是 bug | 排期修 |
| ❌ 数值/元数据待修（§2.4） | 55 张（原 83；Sprint 1 PR-1A 修 10 张 players + Sprint 1 PR-1B 修 16 张 cost/vp + Sprint 2 PR-2A 修 1 张 D60 reserved.clay + 2026-04-30 A14 banned 迁入 §2.5——含 ~50 张 category 字段批量不齐 + 0 张 players 字段错残留） | cost / prereq / vp / players / category 与 BGA 不同 | 排期修 |
| 🔀 刻意偏离 BGA（§2.5） | 11 张（2026-04-28 复核 4 张 + Sprint 2.5 登记 5 张 BeforeEndOfGame interactive + Sprint 3 E149 + 2026-04-30 A14 banned） | owner 签字过的设计差异 | **不要当 bug 修**，先开 issue |
| ⏳ 待实现 / 待评估（§2.6） | 1 张（深度池 D159；E149 已 Sprint 3 实现并迁入 §2.5；wide-scan 新发现 ~15 张 stub/TODO，详见 §2.7 + audit 报告 §3.5）| 未实现或需核心扩展 | 见 §2.6 优先级 |
| 🔍 待 owner 确认（§2.7 新增）| 14 张（深度池 1 + wide-scan 13） | BGA 自身有歧义、或需 game-design 知识判断 | 见 §2.7 |

### 2.0 近期变更（changelog 入口）

> 任何卡牌相关 commit 必须在这里加一行（见 §6 文档维护规则）。

- **2026-04-30 Sprint 5 mech-B — A4 Baseboards / D83 Pigswill / D117 WoodExpert 接入现有 alt-cost 基础设施**：A4 / D83 cost 改 `altCosts:[{food:2},{grain:1}]`（BGA OR-ed payment）；D117 computeCosts 改返回 `trades:[{from:{food:1}, to:{wood:2}, max:1}]`，让玩家可选用替代付法（pay 主路径自然枚举多 PaymentSolution + selectPayment choice prompt）。`getImprovementWoodCost` 扩展扫 `altCosts`，使 D117 helper 也识别含 wood 的 altCosts 形态 minor。基础设施 100% 已存在（`ComplexCost.fees` / `Trade` / `computeAllBuyableCombinations` / `resolvePaymentSolutionSelection`），本批纯单卡接入，0 主路径改动。新增 `server/__tests__/A4_Baseboards-session.test.ts` (4 例) / `D83_Pigswill-session.test.ts` (4 例) / `D117_WoodExpert-session.test.ts` (6 例)。**~~已知偏离~~ ✅ 2026-04-30 后续修复（pay-helpers commit `e529b103`）**：`resolveCardPreviewCost` 短路逻辑已修；`resolveCardCostWithModifiers` 现接受 ComplexCost 输入，listener 收集到的 `trades` / `bonuses` 会 append 进 ComplexCost.trades / bonuses；`result.costs` patch 仍只走 flat 路径（ComplexCost 上 patch 哪个 fee 语义不明，留作 follow-up）。D117 trade 现已对 altCosts-form minor（如 B43 Chophouse）生效，`D117_WoodExpert-session.test.ts` 场景 5/6 改回 spec 原意：B43 食物=10 wood=2 clay=2 时 ≥3 个 PaymentSolution（wood-base + wood-trade + clay-base），clay=0 时 ≥2 个（wood-base + wood-trade，clay-alt 不可付）。spec / plan: `docs/superpowers/specs/2026-04-30-sprint-5-mech-b-alternative-cost-trades-design.md` / `docs/superpowers/plans/2026-04-30-sprint-5-mech-b-alternative-cost-trades.md`。
- **2026-04-30 Sprint 5 mech-D — B27 Toolbox BGA 对齐**：用 `effect.onEndTurn` / `effect.onBuy` + 新 `getFencesBuiltThisAction` helper 替代每次 construct / stables / fencing 都弹 prompt 的旧实现。B27 现在每个 work-phase turn 内若至少建过 1 个房间 / 围栏 / 牲畜栏，仅在 turn 末通过 `effect.onEndTurn`（由 `game-core.ts` `continueEndTurnHooks` dispatch）弹一次买 Joinery / Pottery / Basketmaker's Workshop 的 optional prompt；同时 `effect.onBuy` 覆盖"B27 在手 → 同 turn 先造、再打出 B27"的 BGA onBuy 边界（基于 per-action snapshot delta）。listener 仍然用 `phase: after` 但只 `setCardFlag`，不再每次返回 ActionFlow。三个 listener 也修正了 `actions: ['build-stables']` → `actions: ['stables']` 的 actionId 拼写 bug（之前从未匹配）。机制 A jump 天然兼容：jump 在原 takeAction step loop 内推进，`onEndTurn` 在整个 chain（含跳转后第二格 SEQ）完成后只 fire 一次。新增 `shared/cards/helpers/__tests__/action-snapshot.test.ts`（6 例）+ `server/__tests__/B27_Toolbox-session.test.ts`（5 例）。spec / plan：`docs/superpowers/specs/2026-04-30-sprint-5-mech-d-turn-edge-phase-design.md` / `docs/superpowers/plans/2026-04-30-sprint-5-mech-d-b27-toolbox-turn-edge.md`。
- **2026-04-30 Sprint 5 mech-A — A129/B130/B150/B152 改用真二次落子机制 + place-farmer jump 模式**：新增 `shared/cards/helpers/jump-leaf.ts`（`jumpLeaf()` 构造 viaCardJump leaf；`isJumpChainContains()` listener 自检）。`shared/actions/effects/place-farmer.ts.execute` 新增 `viaCardJump` 分支：物理移动 farmer（`removeWorkerRef` + `addWorkerRef`）→ `actionContext.jumpChain` 累加 sourceCard（mutate）→ `incPlacedFarmers(player)` → 返回 `{type:'flow', flow}`，flow 取自 target action 的 `flow` 字段（如 major-improvement → improvement-any、fencing → fence、grain-utilization → or(sow, bake-bread)），fallback 单 leaf。jump 第二格走完整 ActionNode 路径，自然继承 `applyComputeReplace` / `applyIsDoable` / `computeCosts` / before listener；防递归靠 `isJumpChainContains(context, CARD_ID)`。可达性单一源 = `computeAllowedPlacementSpaces`（含 occupied-space extra option）。per-action 簿记不重置（actionToken / actionStartPlayerSnapshot / `_activeActionBonusSources` / `cardEffectDeltasSinceFlush` 都不动）。**架构落地**：engine 加 `ActionFlow` leaf `expandFlow` 字段，buildFlowNode 在 expandFlow 时把 leaf 展开成 action.flow 子树（`mergeContextIntoFlow` 透传 outer actionContext + sourceCard）；与 createEngine 路径对齐。**4 张卡改造**：A129 删 `buildGrainSeedsFlow`/`buildFarmExpansionFlow`/`onBeforeStartOfTurn` flag cleanup（原 ONE_JUMP_PER_TURN 实际是 no-op）；B130 删 inline `buildChainedFlow`；B150 同 B130；B152 删 `zeroSpaceListener`（traveling-players food drain 改靠原 action.execute 自然清零）+ `getLessonsCostForSpace` / `canPlaySomeOccupation` 手算（改为 `computeAllowedPlacementSpaces` 判定 lessons / lessons-4 自身可达性，含 cost）。**新基础设施 i18n**：5 条 key（4 卡 choice prompt + 1 log.cardJumpedToSpace）双语补齐。**测试**：`shared/cards/helpers/__tests__/jump-leaf.test.ts`（7 例）+ `shared/actions/effects/__tests__/place-farmer-jump.test.ts`（6 例：移动 / jumpChain 累加 / 三类 fail / family pool 不消耗）+ `server/__tests__/place-farmer-jump-recursion.test.ts`（A129 自跳防护 + B150 → major-improvement parity smoke）+ A129 / B130 / B150 / B152 各自 session test 加新断言（takenBy 物理移动 / placedFarmers +2 接受 / +1 拒绝 / family pool 不变）。**Stub-based 完整测试套（A→B→A 间接循环 / cascade dispatch / stub computeReplace parity）** 标 follow-up（需 codebase 扩展 unregister API）。spec：`docs/superpowers/specs/2026-04-30-sprint-5-mech-a-place-farmer-design.md` / plan：`docs/superpowers/plans/2026-04-30-sprint-5-mech-a-place-farmer.md`。
- **2026-04-30 — i18n 卡内 key 缺失补齐**：73 张卡引用的 74 个 i18n key 在 `shared/i18n/zh.ts` 和 `shared/i18n/en.ts` 双缺，本次全部补齐双语翻译。audit script S12 信号 73 → 0。同步修复 `scripts/audit-card-architecture.ts`：i18n 文件路径从 `client/i18n/` 更正为 `shared/i18n/`，正则改为支持嵌套对象中的叶节点 key 匹配。BGA `clienttranslate` 437 strings（系统日志 / PHP 端文案，与我们 TS frontend i18n 不映射）保持 deferred。spec：`docs/superpowers/specs/2026-04-30-i18n-card-keys-backfill-design.md`。
- **2026-04-30 — Bonus scoring hook 双轨合并到求解器架构**：删除 `CardEffect.computePostScore` / `CardEffect.scoringPriority` / `ScoringContext.reserved` / `ScoringContext` / `BonusScoreResult` / `collectBonusScores` 全套 deprecated 类型与函数；新增 `computeCostedBonus: (state, player, ctx) => BonusScoreLevel[]` hook + `solveBonusScoring()` Pareto 求解器（`shared/logic/scoring-bonus-solver.ts`）。5 张 costed bonus 卡（A136 / C133 / E132 / C99 / D132）改为申报 levels[]，求解器枚举笛卡尔积找最优组合后扣 `playerForBonus.resources`（clone，保持 `computeScores` 纯函数）。50 张 free bonus 卡（含 4 张迁入：D100 / C31 / C135 / E159；以及 D60 LargePottery 删除 `ctx.reserved` 改读 `player.resources.clay`）保持单值返回 `(state, player, ctx) => number`。`computeSharedPostScore` 不动（A135 / C136 跨玩家分数调整，签名不同）。Cleanup: ast-validator 删 `'scoringPriority'` allow-list，`tests/llm-card-gen/session-helpers.ts` 加 `runBonusSolver` shim 替代 `collectBonusScores`，influence-zone 文档（llmPrompts / CUSTOM_CARD_SANDBOX / CARD_DESIGN_PROMPT / M4 fixture / llm-card-gen test doc）全部同步。spec / plan：`docs/superpowers/specs/2026-04-30-bonus-score-merge-design.md` / `docs/superpowers/plans/2026-04-30-bonus-score-merge.md`。
- **2026-04-30 — A14 Carpenter's Hammer banned 字段决议不做**：BGA `banned=true` 的语义是"卡池过滤"（不发到玩家手里）。当前 A14 通过 4-modifier 实现折扣效果（reed/wood/clay/stone in min 2 rooms），保留在卡池中可被抽到。**owner 决议（2026-04-30）：不实施 banned schema + dealHands 过滤**——加 schema 字段、dealHands 过滤、UI 标识属于独立工作，与 A14 本身的折扣实现无冲突。A14 从 §2.4 deferred 迁入 §2.5 deliberate divergence；§1 总览 §2.4 / §2.5 数量同步；master-plan.md §1 / §8 deferred 列表同步清理。无代码改动，doc-only commit。
- **2026-04-29 Sprint 6 partial done — 21 metadata fixes (A-deck extraVp) + 2 behavior fixes (E30 ChildsToy non-destructive isNewborn mutation, D12 ↔ D148 mutual exclusion). Metadata: A29/A30/A31/A32/A34/A35/A37/A38/A39/A58/A62/A98/A99/A100/A101/A132/A133/A134/A136/A153/A154 all gained `extraVp: true` (display-only field; matches BGA's 24 extraVp cards now that A33/A36/A135 already had it). E30: replaced destructive `w.isNewborn = false` with snapshot/restore via `cardStates[CARD_ID].extraData.suppressedNewbornIds` — onBeforeFeed clears + records, onAfterFeed restores so post-feed listeners (A35 SwimmingClass, A92 AdoptiveParents) still see correct state. D12 ↔ D148: D148 onComputeAnimalZones early-returns when `D12_MilkingPlace` is in minorPlayed (mirrors BGA `NEGATED_BY_MILKING_PLACE` ruling); D12 also splices `card:D148_DomesticianExpert` zone defensively. Deferred to follow-up: A14 banned field (no `banned` schema field yet — needs owner decision + types.ts + dealHands filter), i18n 71+437 keys, 14 stub cards. Each behavior fix: red test → green fix; reaches updated. lint/build/check:reaches/check:prompt-sync all green. — see branch sprint-6-batch**
- **2026-04-29 Sprint 5 PR-5 partial done — 7 P1 behavior bugs fixed (high-ROI subset); remaining 21 deferred to follow-up (need wider mechanism work or >1h fix each, tracked in §2.3). Cards fixed: A150 Stagehand (drop maxRooms cap + players 4+), A139 HollowWarden (match both hollow / hollow-4 spaces), D18 SteamPlow (drop sow leaf), D160 Midwife (first-farmer guard), B42 ForestInn (maxRound: 6), B4 WoodPile (gain wood per accumulation space with my farmer), C39 StudioBoat (occupationPrerequisites: { min: 1 } enforce). Each fix: red test → green fix commit pair; lint + build + reaches + prompt-sync all green; fast/slow tests 264+262 files passing. — see branch sprint-5-batch**
- **2026-04-29 Sprint 4 done — PR-4A A135/C136 sharedScoring + PR-4B 178 cards category alignment + PR-4C skipped (audit premise wrong: `player.resources.{animal}` already aggregates board+supply, no helper needed). Total ~1 day actual vs 5 day estimate. — see master-plan.md §8**
- **2026-04-29 Sprint 4 PR-4B done — 178 cards' `category` field aligned to BGA naming (UI grouping only, no behavior). Major rename groups: `RESOURCE_*` → `BUILDING_RESOURCE_PROVIDER` / `BUILDING_RESOURCES_-_*`; `ANIMAL_HANDLER` / `ANIMAL_FARMER` → `LIVESTOCK_PROVIDER` (or per-card `ANIMALS_-_*`); `FOOD_MISC` → `FOOD_PROVIDER` / `FOOD` / `GOODS_-_GET`; `ACTION_ENHANCER` / `ACTION_SPACE_EXTENDER` → `ACTIONS_BOOSTER` / `ACTION_-_*`; `BONUS_POINT_GENERATOR` / `BONUS_POINTS_GET` → `BONUS_POINTS_-_GET`; `FARM_BUILDER` → `FARM_PLANNER` / `PASSING_-_FARMYARD`; CROPS / FOOD_GRAIN sub-bucket renames per BGA. Each card matched against its BGA `$this->category` literal; the alignment test exhaustively covers all 178 IDs. — see branch sprint-pr-4b**
- **2026-04-29 Sprint 4 PR-4A — A135 AnimalReeve + C136 RanchProvost sharedScoring via existing `computeSharedPostScore` hook (no framework changes)**: A135 awards 0/1/3/5 VP per player based on `min(sheep, boar, cattle, 4)` set count (BGA `[0,0,1,3,5]` map); C136 awards 3 VP to every player tied for max pasture capacity (computed via `computeAnimalZones` filter on `pasture` zoneType). Both apply to every player including the owner. Tests in `server/__tests__/Sprint4-sharedScoring.test.ts` (12 cases). §2.3 wide-scan A135 sharedScoring entry resolved. — see commit on branch sprint-pr-4a
- **2026-04-29 Sprint 3 done — E149 MidnightFencer implemented as deliberate divergence — onStartHarvest at round 14 offers 0..2×(N−1) midnight fences, each = +1 raw VP via cardStates.owedFences. BGA's fence-segment placement deferred to fence-system rewrite. — see commit on branch sprint-3-e149**
- **2026-04-29 Sprint 2.5 skipped — 5 BeforeEndOfGame interactive cards (A136/C133/C99/D132/E132) registered as deliberate divergence in §2.5 — auto-max in TS is mathematically equivalent to BGA player optimum (resources reserved at scoring time have no other use). Saves ~4 day for Sprint 3-6 work. — see master-plan.md §8 Sprint 2.5 row**
- **2026-04-29 Sprint 2 done — total 7 cards (B116/A165/B133/D60/B14/D138/E134) + 2 mechanism extensions (onBeforeEndGame hook + future-meeples roomType) — see master-plan.md §8**
- **2026-04-29 Sprint 2 PR-2D done — E134 Omnifarmer — implemented full deposit-on-harvest state machine via existing `onAfterReap` / `onHarvestFeedingPhase` / `onAfterHarvest` effect hooks + `resolveChoice` returning follow-up `payLeaf`; storedGoods stored in `cardStates[CARD_ID].extraData`, `usedThisHarvest` enforces once-per-harvest; computeBonusScore vpMap[2..5]=3/5/7/9 — see commit on branch sprint-2-pr-2d**
- **2026-04-29 Sprint 2 PR-2C done — D138 PetLover — switched from `before` listener (which left original collect running, double-take bug) to `computeReplace` on `'collect'` action; engine's `buildReplaceChoiceFlow` auto-wraps the bonus branch into XOR(bonus, retry-default-with-sentinel), mirroring B26 AgrarianFences — see commit on branch sprint-2-pr-2c**
- **2026-04-29 Sprint 2 PR-2B done — B14 Hawktower + future-meeples roomType extension — onBuy queues `{round:12, roomType:'stone'}`; `applyFutureMeeples` consumes roomType entries and calls `tryAddRoomTile` if `houseType` matches, silent skip otherwise — see commit on branch sprint-2-pr-2b**
- **2026-04-29 Sprint 2 PR-2A done — 4 cards (B116/A165/B133/D60) + onBeforeEndGame hook — B116 reed-bank guard, A165 round-12 boar breed, B133 onBeforeEndGame +N vegetable, D60 reserved.clay subtraction — see commit on branch sprint-2-pr-2a**
- **2026-04-29 Sprint 1 done — total 30 cards (10 players + 16 cost/vp + 5 D-prereq, D39 overlap −1) — see master-plan.md §8**
- **2026-04-29 Sprint 1 PR-1C done — 5 D-deck cards (D7/D8/D39/D53/D58) — prerequisite handlers registered to fix "buy without enforcement" bug; whole-string registry lookup added to prerequisites helper — see commit on branch sprint-1-pr-1c**
- **2026-04-29 Sprint 1 PR-1B done — 16 cards (A38/B4/B42/C3/C30/C33/C35/C39/C48/C59/D24/D29/D39/E32/E34/E95) — cost/vp metadata aligned to BGA — see commit on branch sprint-1-pr-1b**
- **2026-04-29 Sprint 1 PR-1A done — 10 cards (A154/A158/A160/C134/C151/C152/C153/C158/C163/E154) — players field corrected to BGA values — see commit on branch sprint-1-pr-1a**
- **2026-04-29 — 卡牌实现 vs BGA Wide-Scan（非深度池 741 张续审）**：5 个 sub-agent 并行扫剩余 ~746 张未进入 2026-04-28 深度池的卡。详见 `docs/card_desc_audit.md`。Verdict 分布：475 ✅ / 48 ⚪（数据 only）/ 90 🟡 / 26 ⚠ / 70 ❌ / 1 🔀 / 13 🔍。**严重新发现（P0）**：(a) **5 张行为完全错** — B116 Shoreforester（每轮给 wood 而非 reed bank 填充时）、B14 Hawktower（给资源而非建房）、B133 VillagePeasant（给 VP 而非 vegetable）、D138 PetLover（noop xor 不取消 collect 玩家拿双倍）、E134 Omnifarmer（computeBonusScore 读未写入字段，永远不计分）；(b) **A4 Baseboards cost 模型错**（BGA 是择一，TS 强迫同时付）；(c) **A38 / A165 / A135 严重缺实现**（cost+prereq 错 / round 12 breeding 缺 / sharedScoring 没写）；(d) **prerequisite 注册系统性缺失**（D7/D8/D39/D53/D58 等 5+ 张 buyable 条件仅在字符串未注册 handler，玩家"白买"扣费无效果）；(e) **12+ 张 cost/players 错**（A4/A38、C3/C13/C33/C35/C48、D24/D29/D39、E32/E34；A154/E154/C134/C158 重复确认与上轮 §2.4 7 张同模式）。**系统性问题**：(1) ~50 张 category 字段命名不齐（B/C/D），是 schema 级问题非单卡 bug；(2) sharedScoring 机制不完备（A135/C136）；(3) `getExchangeResources` 系统性简化（D35/D38/D45/D84 等只看 supply 不看场上动物）；(4) 15+ 张 stub/TODO（含 A135/A165/C62/C105/C109/C136/D62/D94/D108/D131/D157/E58/E134/E139/E153/E155）。**两轮合计**（深度+wide）verdict 分布：587 ✅ / 130 🟡 / 44 ⚠ / 83 ❌ / 5 🔀 / 14 🔍 = 881 张；按宽口径（✅+🟡）通过率约 81%，严格 ✅ 通过率约 67%。**Wide-scan 精度局限**：紧凑流程每张卡 ≤60s，未做完整 5 维度比对，建议 owner 对 ⚠/❌ 各抽 5-10 张做完整重审。同样未实施任何修复——按 spec 修复另起 brainstorming。冻结 SHA 同上轮（我方 `2b5ddee6`、BGA `3082e4d3`）。
- **2026-04-28 — 卡牌实现 vs BGA 全量审查（外部复核）**：跑了 887 张卡 vs BGA PHP 的全量对比，详见 `docs/card_desc_audit.md`。深度池 140 张 verdict 分布：64 ✅ / 40 🟡 / 18 ⚠ / 13 ❌ / 4 🔀 / 1 🔍。**关键发现**：(a) §2.3 自报 0 张行为偏差实际 18 张（A129/A139/A150/A151、B27/B29/B115/B130/B138/B150/B152/B155、C23/C51、D18/D117/D160、E53）；(b) §2.4 自报 0 张数值偏差实际 13 张——**最严重**：A154/A158/A160 + C151/C152/C153/C163 共 7 张 `players: '3+'` 应为 `'4+'`，破坏 2026-04-25 落地的卡池按人数过滤逻辑；其余 cost/prereq 错：A14（banned 字段）、B4 WoodPile（gain 硬编码 + cost 错）、B42 ForestInn（缺 vp + 守卫）、C30/C39/C59、E95 Miller（多 food:1）；(c) §2.5 4 张刻意偏离全部通过复核——B85/C22/D161/E16 取舍今天仍成立；(d) E149 MidnightFencer 确认是 stub-only（与 §2.6 自报一致）；(e) 架构纪律保持良好——0 跨层 import、0 §3 未登记扩展、0 测试 DOM 规则裁定、12 处 client cardId 分支均合法；(f) i18n 缺口 71 + 437 项（不阻塞）。脚本：`scripts/audit-card-architecture.ts`（可重跑）+ 4 A agent + 5 B agent。本 changelog 不展开个卡，详细按卡迁移见 §2.3 / §2.4 / §2.2 各节。冻结 SHA：我方 `2b5ddee6`、BGA `3082e4d3`。**未实施任何修复**——按 spec 修复另起 brainstorming，按 P0/P1/P2 优先级见 audit 报告 §7。
- **2026-04-28 — Per-card 6-field stats + infobox（Stats × BGA Track 1）**：`CardResourceStats` 从 2 字段（paid / gained）扩成 6 字段（used / gained / paid / saved / receivedPayment / paidToOthers），`gained` 接受新 `CardStatGained = Partial<Resource> & PseudoResourceMap` 类型容纳 BGA 风格伪资源 `occupation` / `field` / `roomWood` / `roomClay` / `roomStone` / `stable`（运行时 helpers 见 `shared/game/resource-keys.ts`）。新写入点：`shared/engine/engine.ts ActivateCardNode` + `shared/session/game-core.ts runPlaceFarmerAfterHooks` 在 listener 真正返回 result 时 `incCardUsed`；`playOccupationAction.resolveChoice` 在 sourceCard 触发链式 play-occupation 时记 `gained.occupation`；`commitFarmChoice` 的 plow / room / stable 分支在 sourceCard 存在时记 `gained.field` / `gained.roomWood|Clay|Stone` / `gained.stable`；`executePaymentSolution` 接 `recordPaymentStats(player, solution)`（`shared/cards/helpers/payment-stats.ts`）按 `tradesUsed[].trade.sourceId` 摊算 `paid` / `saved`，新增 `trackStats: false` opt-out。前端：新 `client/components/common/cardStatsFormat.ts.formatCardStatsLines` 输出 6 类 BGA 顺序 line，FarmBoard tooltip 替换原 paid/gained 双段渲染；新 i18n keys `ui.cardStats.{used,gained,gainedOccupation,gainedField,builtRoom,builtStable,receivedFrom,paid,paidToOthers,saved}`（zh/en）。Infobox：D36_BreedRegistry（`n / 2`）、E74_AshTrees（`n / 5`）、E27_PiggyBank（`n / 6`）三张 progress 卡补 `writeCardInfobox`；C148_MudWallower / A53_Claypipe 之前已有 infobox 不动。新增/更新测试：`shared/game/__tests__/resource-pseudo-keys.test.ts`、`shared/cards/helpers/__tests__/card-state.test.ts`、`shared/cards/helpers/__tests__/payment-stats.test.ts`、`client/components/common/__tests__/cardStatsFormat.test.ts`、`server/__tests__/stats-card-used-session.test.ts`、`server/__tests__/stats-gained-pseudo-session.test.ts`、`server/__tests__/stats-payment-saved-session.test.ts`、`shared/cards/__tests__/D36_BreedRegistry.test.ts`、`shared/cards/__tests__/E74_AshTrees-infobox.test.ts`、`shared/cards/__tests__/E27_PiggyBank-infobox.test.ts`；A37/A29/A83/B70/A166/D99/A64 七张已有测试的 toEqual 改 toMatchObject 容纳新字段；A128_RiparianBuilder 测试断言 owner 端 `cardStates.A128.extraData.resourceStats.used:1` 已写入。**刻意偏离**：跨玩家 transfer（`receivedPayment` / `paidToOthers`）helper 已实现但写入点未发现真正的"player A 付 player B"路径，此场景 fields 留空，待后续有此类卡时补入。设计 / 计划：`docs/superpowers/specs/2026-04-28-stats-bga-alignment-track1-per-card-design.md` + `docs/superpowers/plans/2026-04-28-stats-bga-alignment-track1-per-card.md`。
- **2026-04-25 — 卡池按人数过滤 + C39 StudioBoat 行为对齐 BGA**：新增 `shared/cards/player-count-filter.ts` 的 `cardAllowedForPlayerCount(playersField, playerCount)` 解析器，识别 `'N+'` / `'N-M'` / `'N'` / `undefined`，未知格式 fail-open。`dealHands`（`shared/logic/state.ts`）三类卡池来源（内置 / community deck / `extraMinorIds`+`extraOccupationIds` 即 workshop & `customCards=`）全部按 `playerCount` 过滤；workshop / 内置 / ad-hoc 通过新增的内联 `lookupPlayersField` 多源查找（custom-registry → ad-hoc registry → 内置）拿到 `players` 字段，查不到 fail-open。Dev 通道（`devDrawCard` / `devPlayCard`）绕过卡池构造、不受影响。`PlayerActionSpaceConfig` 新增可选 `shouldRegister?(state)` 门，由 `createPlayerActionSpaces` 在循环中检查（位置：`if (!config) continue` 之后、duplicate-id 检查之前）。C39 StudioBoat：BGA 的 PHP 卡定义不带 `players` 限制——我们之前的 `players: '1-3'` 是错的，本次移除；通过 `shouldRegister: (state) => state.players.length < 4` 让 C39 行动格只在 1-3p 注册（4p 已有全局 Traveling Players 行动格 `players: [4]`，不再重复）；`execute()` 中 +1 VP 只在 `player.id === ownerId` 时给（BGA "Each time you use"）——修正了之前"任何人用都给 owner +1 VP"的偏差；`onRoundStart` 在 4p 早退；新增 `travelingPlayersOwnerVp` listener（默认 `scope: 'player'`，监听 `place-farmer` / `traveling-players`）路由到现有 `bonus-vp` action，VP 归属同一 `cardStates[CARD_ID].counters.bonusVp` counter。1-3p 该 listener 因 traveling-players 行动格不存在自然 dormant，4p 才生效，两路径互斥不会重复计分。新增/更新测试：`shared/cards/__tests__/player-count-filter.test.ts`（6 例）、`shared/cards/__tests__/player-action-space-should-register.test.ts`（2 例）、`shared/logic/__tests__/deal-hands-player-count.test.ts`（4 内置 + 3 extra-id）、`shared/cards/__tests__/C39_StudioBoat.test.ts`（execute 块重写为 4 BGA-合规用例 + 新 player-count gating 块 3 例）、`server/__tests__/C39_StudioBoat-traveling-players-listener-session.test.ts`（4 例）。设计文档：`docs/superpowers/specs/2026-04-25-card-pool-by-player-count-design.md`（worktree 本地）。
- **2026-04-24 — D95 SiteManager 日志归因修正**：`log.playOccupation` 不再在 action 结束时用整段 delta 倒推成本，而是在 `playOccupation` 子步骤支付成功后立刻固化自己的 `costResources` / `bonusSources`；若职业 `onBuy` 继续接 flow（如 D95 立即触发 `improvement-any`），则通过 `extraData.occupationLog` 把这份 payload 带到 `GameCore` 立刻落日志，避免把后续大改良支付误记进职业日志。新增 `server/__tests__/D95_SiteManager-session.test.ts` 回归：第二张职业走 `lessons`（应只记 1 food）后再买 `Major_Fireplace1`，断言 `log.playOccupation.costResources === { food: 1 }` 且 `bonusSources` 为空。
- **2026-04-24 — C150 ParrotBreeder + B85 FarmHand 模型 + D102/E76 FarmHand 分支 BGA 对齐**：C150 从占位实现（花 1 谷然后立刻还 1 谷）重写为真实效果——`after:place-farmer` scope `player`/`opponent` 跟踪右邻 seat 的上一次 place-farmer 到 `cardStates.C150.extraData.right`；`anytime` 支付 1 谷并 flag；`computeArgs:place-farmer` scope `player` 注入 `OCCUPIED_SPACE_CHOICE_PREFIX` extra option 让 tracked 空间即使被占用也可落子（自动跳过 Meeting Place）。seat order = `state.players` 数组顺序，右邻 = `(owner − 1 + n) mod n`。B85 FarmHand stable tile 模型重写：存 `cardStates.B85_FarmHand.extraData.position`（2×2 top-left），复用通用 `computeExtraRoomCapacity` hook（同 A10/A85/A127/C10/D85/E85 风格）给 `getExtraRoomCapacity` + `wish-children.ts` 的 `effectiveRooms` 贡献 +1 容量；`cardStates.B85_FarmHand.flagged` 作为 once-per-game sentinel 在 D102/E76 返还后仍为真。`anytime` 守卫 `ctx.space?.id === 'stables'` 严格限定 Build Stables，对齐 BGA rulings（排除 Lazybones E148 / Stable Planner A089 等）。`shared/cards/helpers/stable-removal.ts` 扩成"可归还 stable" 抽象层：`listReturnableStableTiles(player)` + `removeStableOrFarmHandAtTile(player, tile)`；D102 / E76 走这组 helper，完全不触碰 FarmHand 储存字段——`cardStates.B85_FarmHand.extraData.position` 只在 B85 本卡 + stable-removal helper 里出现（spec §3.5.1 封装规则）。**刻意简化**：BGA "返还 FarmHand 时占用者搬回其他房间"不做显式搬人 UI，`familySize` 不变 + 容量 −1 → 下一次 family growth 天然阻塞。**刻意偏离**：BGA `orderComputeCardCosts` 不实现（见 memory "no listener ordering"）。新增 `server/__tests__/C150_ParrotBreeder-session.test.ts`（10 例）+ `server/__tests__/B85_FarmHand-session.test.ts` 重写（10 例覆盖守卫 / housing hook / once-per-game / 2×2 候选检测）+ D102 / E76 session tests 加 FarmHand 返还用例。§2.2 的 C150 + D102/E76 行清空。§2.1 新增 4 条。设计文档：`docs/superpowers/specs/2026-04-24-c150-and-farmhand-model-design.md`。
- **2026-04-23 — D95 SiteManager 对齐 BGA（2⁴ 食物替换组合）**：把 `computeCosts` listener 从贪心 `{ costs: delta }` 改成返回 4 条 optional `Bonus`（wood/clay/stone/reed 各 1 条，`discount: { <res>: 1, food: -1 }`）。通用支付求解器自然把 4 条 optional 累乘为 2⁴ = 16 条费用变体，`keepOnlyOptimals` Pareto 剪枝掉"基础费用没该类资源却花 food 换"的支配解；剩余 Pareto 并集由 `buildPaymentChoiceResult` 作为 `prompt.selectPayment` 弹出，每个走 D95 的选项自动显示 "via Site Manager" 归因（复用 2026-04-23 早些时候落地的 payment `sourceCards` UI）。清理：去掉 listener 里死分支 `actions: ['minor-improvement']`（BGA 只给 MAJOR，onBuy 强制 `types: ['major']`），去掉 `getMajorCardEffect / getMinorImprovement / Resource` 导入，文件从 125 行缩到 ~75 行（比 BGA 92 行更短）。**刻意偏离**：BGA `orderComputeCardCosts`（D95 < A143 / C27 / B95）未实现——我们没有 listener 排序机制；bonus 展开产出的 Pareto 并集是所有顺序的超集，比单一顺序更完整。新增 `server/__tests__/D95_SiteManager-session.test.ts` 的"多选支付弹窗"用例（Joinery `{ wood:2, stone:2 }` + 充足资源 → 3 条 Pareto 不可比路径 skip / swap-wood / swap-stone，各自 `sourceCards` 如期）。§2.2 移除 D95，迁入 §2.1。设计文档：`docs/superpowers/specs/2026-04-23-d95-site-manager-design.md`。
- **2026-04-23 — `renovate-house` 支付路径走 `resolveCostPaymentSelection` 两阶段 choice**：修复 `payTypedFlatCost` 在直接支付分支里把 `BonusModifier` 短路的 bug——当玩家可同时走直接支付与 bonus 折扣两条路径时（例如 A123 FrameBuilder 下持有 2 clay + 1 reed + 4 wood 的木屋翻修），现在会弹出 `prompt.selectPayment` 让玩家二选一，而不是静默地走直接支付。`renovateHouseAction.resolveChoice` 重构：选定翻修目标后调用 `resolveCostPaymentSelection(..., costType: 'renovation')`，多解时返回 `{ type: 'choice' }`，单解时直接 `executeResolvedTypedFlatPayment`；payment-choice 的 option value 走 `pay:renovate:<target>:<idx>` 前缀，把目标编码进去以跨 choice 回合保留（不依赖 `params.selectedOption` 被第二次 resolveChoice 覆盖）。新增 `server/__tests__/A123_FrameBuilder-renovate-choice-repro.test.ts`。既有 log 归因 / A87 Conservator / B107 Manservant / B55 MaintenancePremium / shared renovation 单测全部保持通过。
- **2026-04-23 — `log.actionDetail` 增加 `bonusSources` 字段**：当某次 action 的支付路径走了 `BonusModifier.sources`（如 A123 FrameBuilder 的 `-2 clay / +1 wood` 替换）时，`ActionDetailParts.bonusSources` 现在记录触发卡 id；前端 log 面板渲染为“via {card}”尾缀（i18n: `log.bonusSources`），card link 可 hover 预览。实现：`PlayerState` 新增 session-transient `_activeActionBonusSources?: string[]` 标记（`shared/game/types.ts`），`GameCore` 在 action 开始 / leaf flush / finalize 三处各自 init / reset / delete；`executePaymentSolution`（`shared/actions/effects/pay.ts`）在完成扣资源后把 `PaymentSolution.bonusUsed` 的 source 写入该 scratchpad；`buildActionDetailParts` 把 scratchpad 拷进 `detailParts.bonusSources`。保留在 `shared/` 层——renovate / construct / 任何未来走 `payTypedFlatCost` / `payCardPreviewCost` 的 action 自动受益。新增 `server/__tests__/A123_FrameBuilder-renovate-log-session.test.ts`（2 例：走 bonus 路径时归因、直接支付时不归因）。
- **2026-04-20 — A123 FrameBuilder 迁移到 `bonus.choices` + `room-payment.ts` 扩展 `choices` 语义**：把 A123 的 4 条独立 `TradeModifier`（construct × clay/stone + renovation × clay/stone）重写为 2 条 `BonusModifier`（construct + renovation），每条携带 `choices: [{wood:-1, clay:2}, {wood:-1, stone:2}]` + `optional:true`，对齐 BGA `addBonusChoices(..., optional:true)` 语义——同一次 action 至多触发一次资源替换（clay / stone 二选一）。旧实现允许同一 action 同时触发 clay 替换和 stone 替换（4 clay + 4 stone → 2 wood），是实现偏差，本次纠正。配套扩展 `shared/actions/effects/room-payment.ts` 的 `buildRoomCostPerUnit` 与 `applyRoomCountBonuses` 处理 `modifier.choices`：每条 choice 展开为独立 fee 候选（per-room 与 total 两条路径都覆盖），与 BGA 每个 room 独立决策的语义一致。新增 `shared/cards/__tests__/A123_FrameBuilder.test.ts`（4 例：注册形状、互斥不可叠加、clay 单选、renovation 单选；A123 无 pending 交互，故置于单元测试层）。
- **2026-04-19 — A3 + B3 BGA 对齐**：A3 PaperKnife 改为"展示手牌 → 玩家选 3 → 引擎随机从 3 中取 1 免费打出"（不再整手随机直接打出）；B3 Moonshine 改为"服务端随机选 1 张手牌 → 玩家选 play/pass 二选一"（不再自动 XOR 折叠）。新基础设施：`CardEffect.resolveChoice` hook、`rollAndCacheCardPick` + `state.rngTick`（`shared/cards/helpers/card-random.ts`）、`state.pendingUndoBoundary`（`server/game-session.ts` 的 `pushHistory` 消费）、`InteractionSelection.kind: 'occupation-hand'` + `buildOccupationHandSelectionInteraction`（`server/occupation-hand-interaction.ts`）、`ActionChoiceOption.disabled / .disabledReasonKey`（server 拒绝 disabled 选项）、`passOccupationToNextPlayer`（`shared/cards/helpers/pass-occupation.ts`）、`emit-choice` action（`shared/actions/effects/emit-choice.ts`）。§2.2 移除 A3 和 B3 条目。
- **2026-04-19 — C22 BasketChair BGA 对齐**：引入 `card-held-workers` 原语（`shared/cards/helpers/card-held-workers.ts`），允许卡牌通过 `player.cardStates[cardId].extraData.heldWorkerId` 持有一个工人；`workersAvailable` 排除被卡持有的工人；回家阶段（`server/game-session.ts` returnHome）在清空行动格 `takenBy` 之后以 for 循环遍历所有玩家 cardStates，对每个 cardId 调用 `releaseWorkerFromCard(p, cardId)` 释放持有工人；`recall-placed-worker` 新增 `forceFirst` 与 `targetCardHold` 参数。C22 从简化实现（额外 place-farmer）重写为：`onBuy` hook 在本工作阶段已有首置 farmer 且首置格不是 Meeting Place 时，(a) 用 `recall-placed-worker forceFirst+targetCardHold` 把该工人从行动格撤回到卡持有态，(b) 再提供一次额外 `place-farmer` 让玩家补放另一个在家工人——净消耗 2 个在家工人，释放 1 个格位。若当时尚未放过 farmer 或首置格是 Meeting Place，onBuy seq 直接跳过。回家时工人随 for 循环释放。刻意偏离：(a) 不支持同轮再激活，(b) JobContract 的假人 meeple 清理未实现。新增 `server/__tests__/C22_BasketChair-session.test.ts`。
- **2026-04-19 — A48 ShavingHorse + B143 ClayWarden BGA 对齐**：A48 删除 `WOOD_SPACES` 过滤（BGA 不按空间过滤），合并为两个 `after` listener——`gain/collect/receive` + `anytime-exchange`——复用同一 `checkAndExchange(context)` 检查木头净获得与当前总量；cost 从 `{}` 改为 `{ wood: 1 }` 与 BGA 对齐。B143 `HOLLOW_SPACES` 加入 `'hollow'`（3 人版空间），在 3 人局也能触发 opponent 钩子。新增 `server/__tests__/A48_ShavingHorse-session.test.ts`（7 例）、扩展 `server/__tests__/B143_ClayWarden-session.test.ts`（+1 例 3P）。
- **2026-04-19 — E96 Elder BGA 对齐 + `handHooks` 通用手牌 hook 机制 + 批量移除冗余 played-includes 守卫**：新增 `CardEffect.handHooks` 字段，声明哪些 hook 在卡牌还在手牌时也应触发；`continueStageHook` 在遍历已打出卡后额外遍历手牌中声明了当前 hook 的卡。E96 Elder 通过此机制实现回合 1 免费打出自身（`onBeforeStartOfTurn` + `allowedCards` 过滤）。同时批量移除 756 处冗余的 `player.xxxPlayed.includes(CARD_ID)` 守卫——框架已在调用侧保证卡牌已打出，卡牌文件内无需重复检查。
- **2026-04-19 — 行动格按人数过滤，对齐 BGA 2-3 人局配置**：`createActionSpaces(playerCount?)` 按 `players` 字段过滤行动格。新增 3P 变体：`hollow`（1 黏土/轮）、`resource-market`（XOR 芦苇+食/石+食）、`lessons-3`（固定 2 食）。7 个全人数通用行动格补 `players: [2,3,4]`。前端坐标表补 3P 条目。2P=10 主行动格、3P=14、4P=16。不改卡牌实现数。
- **2026-04-19 — C129 SecondSpouse BGA 对齐**：加"占用者是对方首置 farmer + 上限≤2"判定，移除运行时 `players.length < 3` 检查（由牌组配置保证）。
- **2026-04-19 — choice/farmSelect/selection 统一透传 `sourceCard` + InteractionBar 显示触发来源卡名**：`PendingAction` / `InteractionState` / 前端 `PendingChoice` 新增可选 `sourceCard`，`OptionalNode` 在弹出 `ui.interactionOptionalAction` 时也会把来源卡写入 `pendingChoiceContext`，因此像 `D161 CabbageBuyer` 这类卡牌触发的 optional offer 终于能在交互栏副标题统一显示“由某卡触发”。规则行为不变：若效果已触发但资源不足（例如 D161 在 `no improvement = 3 food` 时付不起），依旧不会额外显示一个不可执行的 choice。
- **2026-04-19 — repo-wide `sourceCard` 补漏 + `ChoiceEffectPreview` / hybrid button UI 落地**：`ActionChoiceOption` / `ActionFlow.leaf` 新增 `effectPreview`，并把 option 级 `sourceCard` 扩到 `computeArgs` / `computeChoiceCandidates` / PlayerActionCard direct choice 全链路；引擎补上 hook flow/follow-up `sourceCard` 兜底、`OR/XOR` 首屏 prompt 的 `pendingChoiceContext.sourceCard`、以及 `seq(pay-resources, gain[, bonus-vp])` 的 preview 聚合。显性补漏卡包括 `Major_ClayOven` / `Major_StoneOven`、`E73_Scythe`、`E74_AshTrees`、`E53_BoarSpear`、`D23_PioneeringSpirit`、`C104_Collector`、`B42_ForestInn` 及一批 occupied-space extra option 卡（`A26/A28/A87/A94/A130/B129/B151/C129/D24/D112/E129/E150`）。`InteractionBar` 现按 `hybrid_dual` 渲染：按钮主文案显示真实效果（如 `food -> vegetable` / 具体 payment），按钮次文案显示动作类型，顶部副标题继续显示来源卡；新增 sourceCard/effectPreview 回归 45+ focused tests。
- **2026-04-19 — `sourceCard` contract follow-up：修正 `computeReplace` 非 decline 链路与 mixed prompt 归因**：`HookDispatcher.applyComputeReplace()` 现在会保留 listener 返回的 `sourceCard`，因此像 `E24_Ambition` 这类 `minor-improvement -> improvement-any` 替换在进入真实改良选择时不再退回匿名 prompt。与此同时，pending 级 `sourceCard` 的判定收紧为“所有 option 都显式带同一个来源卡”才成立，避免 `A87_Conservator` / `A94_LazySowman` 这类“基础选项 + 卡牌额外选项”的混合 prompt 被误标成整段都由卡牌触发；对应 session 回归已补。
- **2026-04-19 — `C18_RollOverPlow` / `A128_RiparianBuilder` sourceCard session 加固测试**：补两条跨阶段回归：`C18_RollOverPlow` 断言 `selection -> plow farmSelect` 两段交互都带 `sourceCard`；`A128_RiparianBuilder + A123_FrameBuilder` 断言赠送的建房动作进入 `prompt.selectPayment` 后仍保留 `sourceCard`，防止 `choice / farmSelect / payment-choice` 链路后退成匿名提示。
- **2026-04-19 — house-redevelopment / wish-children optional-tail 引擎修复**：修复 `resolveChoice` leaf 在单候选 auto-resolve 分支遗留占位 `ChoiceNode` 的 bug；此前这会让 `house-redevelopment` 在翻修后提前结束，跳过可选 `improvement-any`，并把 D161 CabbageBuyer 的报价错误锁死在 3 food。修复后 D161 的 `no/minor/major = 3/2/1 food` 报价重新生效；session 回归测试已改为覆盖 `T1/T2/T3/T4` 的无改良 / minor / major / self-trigger 分支。顺带确认 `wish-children` + A92 AdoptiveParents 的 optional tail 也复用同一引擎路径，相关 session 测试改为按 prompt 语义而不是随机手牌阶段判断。
- **2026-04-18 — D161 Cabbage Buyer 重实现 + isMajorImprovement 统一标志**：消除”固定 2 食物”偏离，改为 3/2/1 按实际打出改良的卡牌属性判定（`isEffectivelyMajor` helper）。新增基础设施 `isMajorImprovement` flag 标记 A60/D59/C60/D25 四张 minor-that-is-major 卡。D161 仅在 house-redevelopment 生效（farm-redev / standalone renovate 不触发），通过 tracker + `after:place-farmer` drain 延迟结算。
- **2026-04-18 — B132 EstateMaster 重实现 + 'reap' listener 基础设施**：用 `registerCardListener({actions:['reap']})` 替换原简化公式（每 3 格 +1 VP），对齐 BGA 规则——满格后每 harvest 的蔬菜 reap +1 VP。新增 `dispatchReapListener(state, player, crop, amount)` helper（`shared/actions/effects/reap.ts`）和 `'reap'` 合成 action；`reap()` 签名从 `(player)` 改为 `(state, player)`；D25/C70/E69/E70/E68/E72 六张额外 reap 卡各加一行 dispatch 调用。§2.5 移除 B132。
- **2026-04-18 — B38 FutureBuildingSite — 完全重写：移除错误的 future meeples，对齐 BGA（3VP + maxRound 4 + 农场空间锁定）**
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
- **2026-04-19 — D154 ChimneySweep 对齐 BGA**：renovate 费用 hook 去掉 `houseType === 'clay'` 守卫，无条件返回 `{ costs: { stone: -2 } }`——clay→stone 与 wood→stone（A87 Conservator 直升）都减 2 石；wood→clay 依靠 `applyCostOverride` 的 `Math.max(0, …)` clamp 保持 0（stone 不在基础 cost 中，无副作用）。`players: '3+' → '4+'` 修正元数据。§2.3 移除 D154、§2.1 补入。BGA `$this->extraVp = true` 仅是卡面 UI 小图标（`card-extra-score` div），不影响规则，我们卡牌定义目前无对应字段，不在本次范围。新增 `server/__tests__/D154_ChimneySweep-session.test.ts`（9 用例：players 元数据、UC1 clay→stone 减 2 石、UC2 无卡对照、UC3 A87+D154 wood→stone 减 2 石、UC4 wood→clay clamp 验证、UC5a/b/c 结算 bonus 分、无卡时 bonus 为 0）。
- **2026-04-19 — 架构统一：所有放置入口改走 `computeAllowedPlacementSpaces`，退役 `canUseOccupied` hook**：8 张相关卡（A25/A28/A130/B151/C129/D24/E21/E150）迁移到纯 `computeArgs`（`OCCUPIED_SPACE_CHOICE_PREFIX`）；`isActionSpaceAvailableToPlayer` / `takeAction` / `place-farmer` / `move-farmer-to-space` 三入口统一走 `computeAllowedPlacementSpaces`；`ActionHookPhase` 删除 `canUseOccupied`、`HookDispatcher.applyCanUseOccupied` 方法删除、`placement-availability.ts` 中 canUseOccupied bridge 循环删除。
- **2026-04-19 — E16 BriarHedge + B30 WoodPalisades border-fence 对齐 BGA**：`isBorderEdge(edgeId)` helper（`shared/game/farm.ts`）检测农场边缘格；新增 `CardEffect.computeFenceDiscount` hook + `collectFenceDiscount(state, player, ctx)` 聚合器（`shared/cards/card-effects.ts`）；E16 注册 `computeFenceDiscount`，按每条 border edge 抵扣 1 wood（最多抵 4）；B30 palisade 限制仅能放 border edge（新增 `PALISADE_NOT_ON_BORDER` 错误码，`server/fence-validation.ts`）；前端 palisade 模式自动过滤内部边缘（`useFarmSelection` hook early-return + gray-out）；5 个 session 测试场景覆盖折扣 + B30 共存；§2.2 移除 E16 简化条目，迁入 §2.1。已知偏离：`canStartFencing` 仍要求 wood ≥ 4，见 §2.5。
- **2026-04-18 — E125 DelayedWayfarer BGA 对齐**：新增 `onAllWorkersPlaced` hook phase（所有工人放完后、round end 前触发）；`place-farmer` 增加 `fromSupply` 模式（激活 supply worker）；E125 从简化（下轮开始）改为精确时序（本轮所有人放完后）；修复引擎 OptionalNode 路径漏传 `actionContext`/`sourceCard` 的 bug。

### 2.1 ✅ 完全对齐（已逐项核对的 32 张）

> ~800 张未列卡按 `shared/cards/catalog.ts` 注册即视为已实现；下表是 2026-04-17 复核中逐项核对过、明确标 ✅ 的 32 张（14 base + A25 + A87 + B30 + PR2 迁入 6 张 + PR3 迁入 D60 + A113 + D25 + E16 + D154 迁入 2026-04-19 + D95 迁入 2026-04-23 + C150 + B85 + D102 + E76 迁入 2026-04-24）。

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
| A87 Conservator | 木屋玩家进入 House Redevelopment 后，在 `Renovate House` 内部多一个 wood→stone 直跳目标（同 prompt 二选一，1 候选自动短路） | 引擎 `computeChoiceCandidates` opt-in 路径（详见 ENGINE_ARCHITECTURE §11.6.2）；A87 仅注入额外 `stone` 候选 + `isDoable` 救入口；A143/A123 cost-type modifier `appliesTo:['renovation']` 自动生效；D154 ChimneySweep 的 2-stone 折扣在 2026-04-19 对齐后也覆盖 wood→stone 直升 |
| B30 WoodPalisades | 按 segment 替代 fence：2 wood、+1 VP、不计入 `MAX_FENCES`、不进入 fence-keyed 卡统计；palisade 仅能放 border edge（2026-04-19 对齐 BGA） | `FenceSegment[]` + `getFenceCount`/`getPalisadeCount` helper；`validateFenceSelection({ allowPalisades })`；`ActionDetailEffects.fencing` / `palisading` 拆分；9 张 fence-keyed 卡迁到 helper；`PALISADE_NOT_ON_BORDER` 错误码（见 §2.0 changelog） |
| E16 BriarHedge | 打出后，围栏时每条 border edge 抵扣 1 wood（最多 4），`computeFenceDiscount` hook；`canStartFencing` 仍要求 wood ≥ 4（见 §2.5） | `isBorderEdge` helper + `computeFenceDiscount` + `collectFenceDiscount` 聚合器（2026-04-19） |
| A113 HeresyTeacher | Lessons 空间使用后，对"≥3 谷且无菜"的田底堆 unshift `{kind:'vegetable',remaining:1}` | BGA 自身未实现；借 Field.stacks 多堆模型落地，底堆 veg 在顶堆 grain 收完后才会被 reap（见 §3 新基建） |
| D25 WitchesDanceFloor | 多身份改良（同时提供 field + occupation + improvement）；虚拟田仅计入前置检查、不计入终局地皮数计分 | 多身份卡基础设施（见 §3）；`countFields` / `countOccupations` helper 聚合虚拟身份；`playMinorImprovement` 守卫 `mustBePlayedViaMinorAction`；`cardMatchesCostList` 用于 fireplace 身份匹配 |
| B39 Loom | cost/prereq 与 BGA 完全一致 | 2026-04-17 PR2：`cost: { wood: 2 }`、`prerequisite: '2 Occupations'`、`occupationPrerequisites: { min: 2 }`、`vp: 1` |
| D31 Storeroom | cost + vp 对齐 | 2026-04-17 PR2：`cost: { wood: 1, stone: 2 }`、`vp: 1`；`computeBonusScore` 原先已算 grain+veg 配对 |
| D33 SummerHouse | cost 对齐 | 2026-04-17 PR2：`cost: { wood: 3, stone: 1 }`、`prerequisite: 'Still in Wooden House'` 保留 |
| D34 LuxuriousHostel | 购买 prereq 从"Stone House" 改为无，新增 extraVp/newSet 标志，但计分依然受石屋限制 | 2026-04-17 PR2：`cost: { wood: 1, clay: 2 }`、删 `prerequisite: 'Stone House'`、加 `extraVp: true` + `newSet: true`；`getStoneHouseBonusScore` 内部 `houseType === 'stone'` + `rooms > familySize` 双守卫负责石屋独占性，wood 局面下返回 0 |
| D35 FodderChamber | cost + vp 对齐 | 2026-04-17 PR2：`cost: { stone: 3, grain: 3 }`、`vp: 2`；`computeBonusScore` 按人数分档（7/5/4/3 除数）对齐 BGA |
| D38 MilkingStool | 补 2-Occupations prereq | 2026-04-17 PR2：`cost: { wood: 1 }`（本来就对）、新增 `prerequisite: '2 Occupations'` + `occupationPrerequisites: { min: 2 }` |
| D60 LargePottery | dual-type（minor + alsoCountsAs major）+ prerequisite `Return the Pottery` + onBuy 退回 Major_Pottery + scoresMap 按 clay 3-4/5/6/7+ 给 1/2/3/4 | 2026-04-17 PR3：`cost: { clay: 1, stone: 1 }`、`category: 'FOOD_PROVIDER'`、`vp: 3` + `extraVp: true` + `evenMoreSet: true`、`alsoCountsAs: ['major']`；2026-04-18 修正建模：删除 `returnCards`，改为保留印刷 `prerequisite: 'Return the Pottery'` + custom prerequisite handler（需已打出 `Major_Pottery`）+ D60 `onBuy` 主动把 `Major_Pottery` 退回 `availableMajorImprovements`。`computeBonusScore` 原本已对（clay≥3/5/6/7 → 1/2/3/4）。注：D59 EarthOven / A60 OrientalFireplace 同步补 `alsoCountsAs: ['major']`——行为等价（之前就有 returnCards）但现在 2-Major prereq 与 B133 VillagePeasant / C5 Remodeling / A31 DebtSecurity / D145 RoofExaminer / A101 CookeryOutfitter 都会把它们计入 major 侧 |
| D154 ChimneySweep | `renovate-house` computeCosts hook 无条件返回 `{ costs: { stone: -2 } }`——clay→stone 与 wood→stone（A87 Conservator 直升）都减 2 石；结算时每名其他玩家住石屋 +1 bonus VP | 2026-04-19：去掉 `houseType === 'clay'` 守卫、`players: '3+' → '4+'`；wood→clay 由 `applyCostOverride` 的 `Math.max(0, …)` clamp 处理——stone 不在基础 cost 中，负数不产生副作用；BGA `extraVp = true` 仅卡面 UI 标记，规则无影响 |
| D95 SiteManager | onBuy 免费起一张 MAJOR（optional `improvement-any, types: ['major']`）；付费时为 wood/clay/stone/reed 各注入 1 条 optional `Bonus`（`discount: { <res>: 1, food: -1 }`），通用支付求解器 2⁴ 展开 + Pareto 剪枝 → `prompt.selectPayment` 让玩家在 skip / 任意子集替换中选一条 | 2026-04-23：复用 Bonus.optional + `computeAllBuyableCombinations` + `keepOnlyOptimals` + payment-choice prompt + `sourceCards` 归因。2026-04-24：`log.playOccupation` 改为在 `playOccupation` 子步骤支付成功后立刻固化 payload；若 `onBuy` 接 flow，则经 `extraData.occupationLog` 立即落日志，不再把后续大改良支付误计入职业本身。刻意偏离 BGA `orderComputeCardCosts`（见 §2.5 下方说明）；文件 ~75 行 / BGA 92 行 |
| C150 ParrotBreeder | 4+ 人局；双 listener 跟踪右邻 seat 的上一次 place-farmer 到 `cardStates.C150.extraData.right`；`anytime` 付 1 谷 + flag；`computeArgs:place-farmer` 注入 `OCCUPIED_SPACE_CHOICE_PREFIX` 让被占的 tracked 空间仍可落子（自动跳过 `meeting-place`） | 2026-04-24：seat order = `state.players` 数组顺序；右邻 = `(owner−1+n) mod n`；复用现有 `OCCUPIED_SPACE_CHOICE_PREFIX` 机制（~8 张卡共用）；不实现 BGA `orderComputeCardCosts` |
| B85 FarmHand | 只在 `stables` action 内触发（BGA rulings 明确排除 Lazybones / Stable Planner 等）；付 1 wood + 2×2 top-left selection；`cardStates.B85.extraData.position` 存位置，`flagged` 作为 once-per-game sentinel；housing +1 通过通用 `computeExtraRoomCapacity` hook（不改 `player.rooms`，不进 `stableTiles`，动物容量不变） | 2026-04-24：复用 A10/A85/A127/C10/D85/E85 风格的 housing hook；D102/E76 返还 FarmHand 时仅清位置、`flagged` 保留，once-per-game 依旧生效；BGA "occupant moves to other rooms" 简化为"capacity −1 自然阻塞 family growth"（见 §2.5） |
| D102 SampleStableMaker | return-home 阶段 optional：归还 1 个 stable（普通或 FarmHand）→ 1 wood + 1 grain + 1 food + optional minor improvement | 2026-04-24：复用 `shared/cards/helpers/stable-removal.ts` 的 `listReturnableStableTiles` + `removeStableOrFarmHandAtTile`；FarmHand 归还时只清 `cardStates.B85.extraData.position`，`flagged` 保留 |
| E76 LumberPile | onBuy optional：归还至多 3 个 stable（普通或 FarmHand），每个 +3 wood | 2026-04-24：同上，走 `stable-removal` 共享 helper；"per returned stable" 语义对 FarmHand 同样适用 |

### 2.2 🟡 简化实现（130 张：2026-04-28 深度 40 + 2026-04-29 wide-scan 90）

> 完整 verdict 段见 `docs/card_desc_audit.md` §4.6 + `docs/card_desc_audit.md` §3 + `output/tmp/audit-agent-b{1..10}.md`。

> **2026-04-29 wide-scan 新增 90 张**（按 deck）：A=3 / B=17 / C=22 / D=35 / E=13。详见各 deck audit-agent-b{6..10}.md 的 🟡 节。
>
> **系统性简化（多张共享同一根因）**：
> - **D 牌组 getExchangeResources 简化（≥4 张：D35/D38/D45/D84）** — 只看 `player.resources.{animal}` 忽略场上动物（pasture/stable）。BGA 含场上+supply。**修复路线：建一个共享 helper `getEffectiveExchangeAnimals(player, kind)`**
> - **C 牌组跨卡协作机制缺失（多张：C18/C25/C27/C49/C75/C84/C130）** — sharedScoring / forceSkip / computeReplace / farm-hand stable / Wolf 联动 / reorganize / hollow 二人版等机制
>
> **stub 卡（≥15 张，含进 §2.6）**：~~A135~~ ✅ Sprint 4 PR-4A / A165 / C62 / C105 / C109 / ~~C136~~ ✅ Sprint 4 PR-4A / D62 / D94 / D108 / D131 / D157 / E58 / E134 / E139 / E153 / E155（A135 sharedScoring + C136 sharedScoring 已实现，A165 Sprint 2 PR-2A 已修，E134 Sprint 2 PR-2D 已修）
>
> **2026-04-28 深度池 40 张**（保留以下）：

**按 deck 分组**（2026-04-28 审查）：

| Deck | 张数 | 卡列表 |
|---|---|---|
| A | 2 | A132 Publican（缺 deferred feasibility check）、A19 Handplow（缺 round-track field token 可视化） |
| B | 7 | B103 / B128 / B151 / B152 / B26 / B163 / B75 |
| C | 9 | C71 / C117 / C120 / C135 / C145 / C146 / C70 / C88 / C89 / C164 |
| D | 10 | D12 / D21 / D36 / D63 / D77 / D82 / D87 / D128 / D134 / D148 |
| E | 12 | E30 / E36 / E49 / E66 / E72 / E73 / E91 / E112 / E118 / E132 / E148 / E161 |

> **历史记录**（已迁入 §2.1）：

| 卡牌 | 简化内容 | 完整规则需要 |
|---|---|---|
| ~~E96 Elder~~ | ~~回合 1 StartOfWork 额外打出职业未实现~~ | 已实现（2026-04-19），通过 `handHooks` 机制 |
| ~~D95 SiteManager~~ | ~~贪心：短缺时才用食物替换建材~~ | 已实现（2026-04-23）——用 4 条 optional `Bonus`（wood/clay/stone/reed → food）由通用 `computeAllBuyableCombinations` + `keepOnlyOptimals` 自动展开 |
| ~~C150 ParrotBreeder~~ | ~~占位：付 1 谷 + 归还 1 谷，没有跟踪右邻~~ | 已实现（2026-04-24）——双 listener 跟踪右邻 place-farmer + `computeArgs:place-farmer` 注入 occupied-override option |
| ~~D102 / E76~~ | ~~跳过 FarmHand 分支~~ | 已实现（2026-04-24）——`shared/cards/helpers/stable-removal.ts` 抽象"可归还 stable"层；消费者无感知 FarmHand 储存 |

### 2.3 ⚠ 行为偏差待修（44 张：2026-04-28 深度 18 + 2026-04-29 wide-scan 26）

> 完整证据链见 `docs/card_desc_audit.md` §4.3 + `docs/card_desc_audit.md` §3 + `output/tmp/audit-agent-b{1..10}.md`。

> **2026-04-29 wide-scan 新增 26 张**（紧凑审查未做完整 5 维度对比，需抽样复核）：
>
> **Top 5 P0 严重玩法 bug**：
> - **B116 Shoreforester** — BGA reed bank 准备阶段填充时给 1 wood；TS 每个 round 开始无条件给 1 wood — ✅ Sprint 2 PR-2A on branch sprint-2-pr-2a
> - **B14 Hawktower** — BGA round 12 预约一个石屋间（条件性建造）；TS 写成 +1 stone 资源 — ✅ Sprint 2 PR-2B on branch sprint-2-pr-2b
> - **B133 VillagePeasant** — BGA 给 N 个 vegetable 资源；TS 用 computePostScore 给 N VP — ✅ Sprint 2 PR-2A on branch sprint-2-pr-2a
> - **D138 PetLover** — `noop` xor 选项不取消原始 collect → 玩家同时拿空间动物 + 1 动物 + 3 food + 1 grain bonus（`shared/cards/D/D138_PetLover.ts:42-62`）— ✅ Sprint 2 PR-2C on branch sprint-2-pr-2c
> - **E134 Omnifarmer** — `computeBonusScore` 读 `storedTypes`，但代码无 listener/effect 写入此字段——分数永远不触发 — ✅ Sprint 2 PR-2D on branch sprint-2-pr-2d
>
> **A 牌组（5 张）**：A38 WoolBlankets（cost 多收+prereq 错）、A165 PigBreeder（round 12 breeding 完全未实现） — ✅ Sprint 2 PR-2A on branch sprint-2-pr-2a、A135 AnimalReeve（sharedScoring 没写）— ✅ Sprint 4 PR-4A on branch sprint-pr-4a、A1 Shelter（缺 pasture-size-1）、A22 Telegram（extraPlacement 模拟需 owner 确认）
>
> **B 牌组其余（11 张）**：B7-B 中除 B14/B116/B133 外的 11 张行为偏差，包括元数据驱动行为偏离的 holder/field 缺失等，详见 `output/tmp/audit-agent-b7.md`
>
> **D 牌组（1 张）**：D138 PetLover（已列上）
>
> **E 牌组（5 张）**：E134 Omnifarmer + 4 张待详细列（详见 `output/tmp/audit-agent-b10.md`）
>
> **2026-04-28 深度池 18 张**：

| 卡牌 | 关键发现 | 优先级 |
|---|---|---|
| **A129 Swagman** | ✅ Sprint 5 mech-A — 改用 jumpLeaf + place-farmer.viaCardJump 真二次落子（farmer 物理移动 farm-expansion ↔ grain-seeds），防递归靠 jumpChain 自检 | P1 |
| **A139 Hollow Warden** | 仅匹配 `hollow-4`，3+人模式下其它 hollow 累积格漏触发 — ✅ Sprint 5 PR-5 (listener now matches { hollow, hollow-4 }; +3p session test) | P1 |
| **A150 Stagehand** | construct 硬编码 `maxRooms:1`，BGA 不限制 — ✅ Sprint 5 PR-5 (drop maxRooms cap + players: '4+'; test asserts maxSelections > 1) | P1 |
| **A151 Minstrel** | sheep-market gain 未清累积；grain-utilization 用 OR 而 BGA 是 SEQ 允许同时 sow+bake | P1 |
| **B27 Toolbox** | 每次构建都触发，未实现"turn 末一次性"语义 — ✅ Sprint 5 mech-D (effect.onEndTurn + onBuy + setFlag listeners; fixed `'build-stables'` → `'stables'` actionId; new `getFencesBuiltThisAction` helper) | P1 |
| **B29 CookeryLesson** | "same turn" 被错误扩展成 "same round" | P1 |
| **B115 Tinsmith** | 多 field 时只允许选 1 个，BGA 给每 field 各加 1 | P1 |
| **B130 / B150 / B152** | ✅ Sprint 5 mech-A — 三张卡都改用 jumpLeaf + place-farmer.viaCardJump（B130: grain-utilization ↔ fencing；B150: farm-expansion ↔ major-improvement；B152: day-laborer → lessons-4 / lessons / traveling-players XOR），farmer 物理移动 + 第二格走完整 ActionNode 路径含 ReplaceHook / computeCosts / isDoable | P1 |
| **B138 ForestGuardian** | 用 `gain-trigger-player` 可能没真扣对手食物（须确认） | P1 |
| **B155 ArtTeacher** | 抽 TP food 仅在 lessons 入口，遗漏其他 occupation play 路径 | P1 |
| **C23** | 触发条件偏差 | P1 |
| **C51 FishingNet** | 没真正从 trigger player 扣 food | P1 |
| **D18 SteamPlow** | 多了 sow 节点，BGA 仅 plow（`shared/cards/D/D18_SteamPlow.ts:30-37` vs `Cards/Actions/ActionFarmland.php:15-17`）— ✅ Sprint 5 PR-5 (drop sow leaf; seq now pay + plow only) | P1 |
| **D117 WoodExpert** | ✅ Sprint 5 mech-B — computeCosts 改返回 `trades:[{from:{food:1}, to:{wood:2}, max:1}]`，pay 主路径自然枚举 use-trade / no-trade 两条 PaymentSolution，玩家弹 selectPayment choice 选；后续修复（pay-helpers `e529b103`）让 ComplexCost 输入也跑 listener，trade 现已覆盖 B43 等 altCosts 形态 minor | P1 |
| **D160 Midwife** | 缺"对手本轮首个 farmer"守卫，违反 desc 文本 — ✅ Sprint 5 PR-5 (listener checks `getRoundPlacementOrder(opponent).length === 1` in 'after' phase) | P1 |
| **E53** | 缺 E85 联动 + meeple-id 跟踪 | P1 |
| **E149 MidnightFencer** | stub-only（文件存在但 effect/listener 全无；与 §2.6 自报一致）— ✅ Sprint 3 done (rechecked: full onStartHarvest offer-flow + cardStates owedFences + computeBonusScore already in place; was misclassified as stub) | P0 |

**连带 finding**（不在深度池但 agent 顺带报）：
- **D12 ↔ D148 互斥** ✅ **Sprint 6 已修**：BGA `NEGATED_BY_MILKING_PLACE` 落地——D148 onComputeAnimalZones 检测 `minorPlayed.includes('D12_MilkingPlace')` 早退；D12 防御性 splice `card:D148_DomesticianExpert` zone（reaches 双向声明）

**Sprint 1 PR-1B 残留 behavior（cost/vp 已修，但行为分支待 Sprint 5）**：
- **B4 WoodPile** — gain 仍硬编码 `wood: 3`，应改为"累积格上 farmer 数"；cost 字段已对齐 ✅ PR-1B — ✅ Sprint 5 PR-5 (onBuy now scans state.actionSpaces, filters gainPerRound non-empty, counts spaces with my farmer)
- **B42 ForestInn** — round ≤ 6 的 `isBuyable` 守卫未实现；vp 元数据已补 ✅ PR-1B — ✅ Sprint 5 PR-5 (added `maxRound: 6`, picked up by existing meetsCardPrerequisites pipeline)
- **C39 StudioBoat** — `prerequisite` enforce（"Build a fishing pond/wooden hut etc."） 未注册 handler；cost 已对齐 ✅ PR-1B — ✅ Sprint 5 PR-5 (added `prerequisite: '1 Occupation'` + `occupationPrerequisites: { min: 1 }`; BGA's printed text is "1 Occupation", not the fishing-pond text mentioned in audit)

**Sprint 5 PR-5 + mech-A + mech-D + mech-B deferred to follow-up (15 cards remaining; 4 mech-A + 1 mech-D + 1 mech-B resolved)**:

The following cards remain in §2.3 unfixed after Sprint 5 PR-5. Each needs > 1 hour of work or wider mechanism changes; tracked here so a future PR can pick them up:

- ~~**A129 Swagman** — needs SEQ semantics + once-per-turn flag covering both spaces~~ — ✅ **Sprint 5 mech-A** done (jumpLeaf + place-farmer.viaCardJump; jumpChain self-check)
- **A151 Minstrel** — sheep-market accumulation clearance + grain-utilization SEQ-vs-OR re-check (audit's claim of OR-vs-SEQ contradicts BGA `ActionGrainUtilization` which is also `NODE_OR + forcePassAfterOne`); needs second pass to either close as already-correct or implement accumulation clearing
- **B27 Toolbox** — ✅ Sprint 5 mech-D — once-per-turn semantics implemented via `effect.onEndTurn` + `effect.onBuy` + setFlag listeners (no longer fires on every construct / stables / fencing)
- **B29 CookeryLesson** — needs `turnId` (per-placement) tracking instead of `cookedThisRound` (per-round) — requires per-action-token state machine extension
- **B115 Tinsmith** — multi-field: "+1 to each field" requires per-field iteration in the listener
- ~~**B130 / B150 / B152** — `useActionSpace(other)` semantic — wider mechanism~~ — ✅ **Sprint 5 mech-A** done (jumpLeaf helper + place-farmer.viaCardJump; second-space dispatch runs full ActionNode path)
- **B138 ForestGuardian** — verify `gain-trigger-player` actually deducts opponent food (audit flagged as "must confirm")
- **B155 ArtTeacher** — extend listener from lessons-only to all occupation play paths
- **C23** — triggering condition deviation (need re-read of BGA file to identify)
- **C51 FishingNet** — actually deduct trigger-player food
- ~~**D117 WoodExpert** — switch from forced -1 wood / +1 food substitute to optional alternative trade via `Bonus.optional` so players can choose; current implementation always applies the trade~~ — ✅ **Sprint 5 mech-B** done (computeCosts returns `trades` instead of forced cost patch; pay main path enumerates use-trade / no-trade solutions, player picks via standard selectPayment prompt); altCosts-form minors (B43 etc.) covered after pay-helpers `e529b103` (ComplexCost input now runs `computeCosts` listeners, trades/bonuses appended into ComplexCost arrays).
- **E53** — needs E85 cross-card linkage + meeple-id tracking — cross-card mechanism work
- **B 牌组 wide-scan 11 张** (audit-agent-b7.md) — holder/field metadata-driven behavior offsets, individual cases need re-read
- **A1 Shelter, A22 Telegram, A38 WoolBlankets, A165 PigBreeder** wide-scan items — already partially fixed in Sprint 2 PR-2A; remaining tail not in this PR's scope
- **E 牌组 wide-scan 4 张** (audit-agent-b10.md) — pending detailed listing; aggregated under "E 牌组其余 4 张待详细列"

These are all **bugs** (not deliberate divergences). Suggested next: pick a 4-day batch of medium-complexity items (B29 / B115) for a follow-up Sprint 5b.

**Sprint 1 PR-1C 已修（prerequisite 注册系统性缺失，wide-scan P0 类 d）**：
- **D7 Trident / D8 FernSeeds / D39 TruffleSlicer / D53 TeaHouse / D58 Gritter** — 五张卡 prerequisite 字符串已注册 handler，购买时按 BGA 条件强制校验；同时 `meetsTextPrerequisite` 增加 whole-string 自定义查找（D8 含 `" and "`）— ✅ Sprint 1 PR-1C on branch sprint-1-pr-1c

> **历史记录**：D154 ChimneySweep（renovate -2 stone 在 wood→stone 直升时漏减、`players` 字段）已于 2026-04-19 修复，迁入 §2.1。C129 SecondSpouse 已于 2026-04-19 对齐 BGA（首置 farmer + ≤2 占用），迁入 §2.1。B143 ClayWarden 已于 2026-04-19 补 `hollow` 3 人版空间并确认 listener 已覆盖（见 §2.0）。

### 2.4 ❌ 数值/元数据待修（原 83 张：2026-04-28 深度 13 + 2026-04-29 wide-scan 70；PR-1A 已修 10 张 players + PR-1B 已修 16 张 cost/vp → 实际剩 57 张）

> 完整证据链见 `docs/card_desc_audit.md` §4.4 + `docs/card_desc_audit.md` §3。

> **2026-04-29 wide-scan 新增 70 张**（紧凑审查；优先抽样复核）：
>
> **系统性问题（最大头）**：
> - ~~**~50 张 category 字段批量不齐**~~ — ✅ **Sprint 4 PR-4B done**（实际 178 张，覆盖 A/B/C/D/E 全副）。BGA→ours 映射机械迁移完成，每张卡的 `category` 字段现在等于 BGA `$this->category` 字面量。覆盖测试 `shared/cards/__tests__/category-bga-alignment.test.ts` 178/178 绿。仅 UI 分组对齐，无任何行为/规则改动。详见 branch `sprint-pr-4b`。
>
> **P0 cost 偏差（12 张）** — A4 / D83 / C13 / D30 残留，其余 11 张 cost/prereq 字段已由 PR-1B 修复：
> - **A4 Baseboards** — BGA `costs=[[food:2],[grain:1]]` 是择一，我方 `cost:{food:2, grain:1}` 强迫同时付（玩家加成本）— ✅ Sprint 5 mech-B (改 altCosts:[{food:2},{grain:1}])
> - **A38 WoolBlankets** — cost 已清空 ✅ PR-1B；prerequisite 写"Wooden House"（BGA 是"5 Sheep on farm"）— prereq 不在本 PR 范围
> - **C3** 多 food:3 ✅ PR-1B / **C13** discount 应 stone:2 写成 stone:1（待 Sprint 5 isBuyable discount） / **C33** 缺 food:3 ✅ PR-1B / **C35** wood:1 写成 clay:1 ✅ PR-1B / **C48** 多 wood/clay ✅ PR-1B
> - **D24** 缺 food:1 ✅ PR-1B / **D29** 缺 wood:1 ✅ PR-1B / **D39** 缺 wood:1 ✅ PR-1B / **D83** 缺 altCosts grain:1 — ✅ Sprint 5 mech-B (改 altCosts:[{food:2},{grain:1}]) / **D30** 缺 prerequisite "3 Occupations"（prereq 不在本 PR 范围）
> - **E32** cost 类型错（BGA `STONE=>2,REED=>1`，TS 原 `clay:2, reed:1`） ✅ PR-1B / **E34** 缺 cost（BGA `WOOD=>1`） ✅ PR-1B
>
> **Sprint 1 PR-1B 注脚**：A4 / D83（alternative-cost 机制）已 ✅ Sprint 5 mech-B / C13（isBuyable discount）超出 cost-field PR 范围，待 follow-up。
>
> **P0 players 字段错（4 张，与上轮 7 张同模式）**：A154 应 4+ / E154 应 4+ / C134 应 3+ / C158 应 4+ — ✅ 全部已修，Sprint 1 PR-1A on branch sprint-1-pr-1a
>
> **A 牌组次要（22 张）extraVp 元数据**：✅ Sprint 6 已批量补 21 张（A29/A30/A31/A32/A34/A35/A37/A38/A39/A58/A62/A98/A99/A100/A101/A132/A133/A134/A136/A153/A154）。本仓库 A 牌组现共 24 张 `extraVp: true`（含此前 A33/A36/A135），与 BGA 24 张完全对齐。仅展示字段，不影响规则。
>
> **2026-04-28 深度池 13 张**（保留以下）：

> **最严重子类（P0）**：A154/A158/A160 + C151/C152/C153/C163 共 7 张 `players: '3+'` 应为 `'4+'`——这些卡会进 3 人局卡池但 BGA 限定 4+，破坏 2026-04-25 落地的"卡池按人数过滤"逻辑。✅ **已修复（Sprint 1 PR-1A on branch sprint-1-pr-1a）**。

| 卡牌 | 偏差 | 优先级 |
|---|---|---|
| **A154 / A158 / A160** | `players` 元数据应为 '4+'，代码写 '3+' — ✅ Sprint 1 PR-1A on branch sprint-1-pr-1a | **P0** |
| **B4 WoodPile** | cost: food:2 已清空 ✅ PR-1B；硬编码 gain wood=3 行为偏差（BGA 是"累计格 farmer 数"）— 残留 behavior，转 Sprint 5（见 §2.3） | **P0** |
| **B42 ForestInn** | `vp:1` 已补 ✅ PR-1B；round ≤ 6 的 isBuyable 守卫残留 behavior，转 Sprint 5（见 §2.3） | P1 |
| **C30** | cost 错 ✅ PR-1B | **P0** |
| **C39** | cost 已修 ✅ PR-1B；prerequisite enforce 残留 behavior，转 Sprint 5（见 §2.3） | **P0** |
| **C59** | cost 错 ✅ PR-1B | **P0** |
| **C151 / C152 / C153 / C163** | `players='3+'` 应 `'4+'`（影响 3p 卡池） — ✅ Sprint 1 PR-1A on branch sprint-1-pr-1a | **P0** |
| **E95 Miller** | Occupation 卡多了 `cost: { food: 1 }`，BGA 端没有该字段 — ✅ Sprint 1 PR-1B on branch sprint-1-pr-1b | **P0** |

> **历史记录**：2026-04-17 PR1/PR2/PR3 把上一轮 §2.4 全部清零（minor `vp` 计分接入、6 张 cost/prereq 对齐、D60 LargePottery dual-type）。本次审查重新发现 13 张——主要是上次审查后新写的卡或当时漏检的。
>
> 后续修复流程：`scripts/audit-card-architecture.ts` 本地审计 + 对应 caller 迁移。

### 2.5 🔀 刻意偏离 BGA（11 张；2026-04-28 复核 4 张 + Sprint 2.5 登记 5 张 + Sprint 3 E149 + 2026-04-30 A14 banned）

> 这些卡 desc 与 BGA 一致，但实现选择刻意偏离 BGA 行为。每张都需写明**为什么不同**和**回归 BGA 的代价**。
>
> **不要**把这些当作 bug 修。改这些之前先开 issue / 跟 owner 确认。
>
> **2026-04-28 审查复核**：4 张全部通过——B85 / C22 / D161 / E16 当初 owner 签字的取舍今天仍然合理，无需重新讨论。详见 `docs/card_desc_audit.md` §4.5。

| 卡牌 | BGA 行为 | 我们的行为 | 偏离原因 | 回归 BGA 的代价 |
|---|---|---|---|---|
| C22 BasketChair | `onBuy` 时若本工作阶段已首置 farmer 于非 Meeting Place 格，则把该工人撤回到卡持有态，再给予额外 `place-farmer`（净消耗 2 个在家工人，释放 1 个格位）；BGA 允许 JobContract 伪人 meeple 互动、同轮工人用完后再激活 | (a) 不支持同轮再激活（heldWorker 用完即止）；(b) JobContract 的假人 meeple 清理未实现 | (a) 影响极少：需同轮两次 place-farmer + JobContract 共存；(b) JobContract 未实现，无实际影响 | (a) `onEndTurn` 监听放人计数，用完后重新激活一次；(b) 等 JobContract 实现后再处理假人清理 |
| D161 CabbageBuyer | 按改良类型 3/2/1 售价 | 3/2/1 按打出改良的实际属性；仅在 house-redevelopment 生效 | 仅在 house-redevelopment 生效；farm-redev / 卡触发 renovate 不 offer | 给 farm-redev / standalone renovate 各加一条 offer 3 食物分支 |
| E16 BriarHedge + `canStartFencing` | BGA `actFencing` 中 `maxBuyable = wood + borderFreePotential`，因此有 2–3 wood 时 E16 可让玩家进入围栏流程 | 我们 `canStartFencing` 仍要求 wood ≥ 4；E16 的折扣只在边 edge 选定后才被 `collectFenceDiscount` 应用，无法提前拉低入口门槛 | 入口守卫与折扣聚合解耦，改动范围最小；实际影响极小（仅在 2–3 wood 且 E16 已打出的特定边角场景） | `canStartFencing` 读 `collectFenceDiscount` 计算潜在折扣，动态降低最低 wood 要求 |
| B85 FarmHand（返还占用者搬人） | D102 / E76 返还 FarmHand 时，BGA 显式把占用的 farmer "搬回其他房间"；若其他房间不够则拒绝返还 | 我们不跑显式搬人 UI——`familySize` 不变、capacity 通过 `computeExtraRoomCapacity` drops 1 → 下一次 family growth 天然阻塞；返还始终被允许 | 没有"哪个 farmer 住在哪个 tile" 的细粒度模型；加一条 UI 流程代价偏大 | 引入 farmer-to-tile 的 "housing assignments" 模型，D102 / E76 返还时带检查 + 可选迁移交互 |
| A136 DrudgeryReeve（2026-04-29 Sprint 2.5 skip） | BGA `onPlayerBeforeEndOfGame` 弹 prompt：玩家选 0..min(W,C,S,R,3) 组（每组各 1 木 1 黏 1 石 1 苇 → 1/3/5 VP）| `computeBonusScore` auto-max — 取 `min(W,C,S,R,3)` 组并 `ctx.reserved` 预留资源 | scoring 阶段 food/wood/clay/stone/reed 不进其他 category 计分（resources 直接计数）；玩家最优策略 = max（每多一组都增加 VP，资源在 scoring 后无其他用途）；auto-max 与 BGA 玩家行为数学等价 | 加 scoring-phase pending choice 流（机制级，仅服务 5 张 interactive），并接入前端 prompt UI |
| C133 Soldier（2026-04-29 Sprint 2.5 skip） | BGA 玩家选 0..min(wood, stone) 对（每对 → 1 VP） | auto-max — `min(wood, stone)` 对 + `ctx.reserved` | 同上：scoring 单调最优，auto-max 与玩家行为等价 | 同上 |
| C99 GardenDesigner（2026-04-29 Sprint 2.5 skip） | 每空 field 玩家选 1F/4F/7F → 1/2/3 VP | auto-max 贪心 7→4→1 跨空 fields | scoring 单调最优；可能在某些 food 数量精确分配场景与 BGA 玩家略不同（玩家可选偏好次优解），影响 ≤ 1-2 VP | 加 per-field XOR pending prompt |
| D132 HideFarmer（2026-04-29 Sprint 2.5 skip） | 玩家选 hide 几个未用 farmyard（付等量 food，抵扣等量 -1 VP penalty）| `computePostScore` auto-max — `min(food, penalty)` 全 hide | scoring 阶段 food 已无其他用途；hide N 个 = 净 +N VP - 0 effective food cost；auto-max 严格最优 | 加 hide-N-spaces pending prompt |
| E132 VeggieLover（2026-04-29 Sprint 2.5 skip） | 玩家选 0/1/2/3 套 (1G+1V→2 / 2G+2V→4 / 3G+3V→6 VP) | auto-max — `min(grain, veg, 3)` 套 + `ctx.reserved` | grain/vegetable 在 scoring 单独 category 计分（每个 1 VP up to 4），换 2VP 套相比保留 grain/veg 的 raw VP 几乎总不亏（每套 +2VP - 2 raw VP 资源 = 0 净；3 套 +6 - 6 = 0）；多数情况无差异 | 加 1/2/3 套 XOR pending prompt |
| E149 MidnightFencer（2026-04-29 Sprint 3） | 第 14 轮 StartHarvest 触发 fencing flow，让玩家从对手 unbuilt fences 中拿最多 2 段免费放在自己农场（可超过 15 段上限），围出新 pasture 拿 VP | onStartHarvest 弹 choice 0..2×(numPlayers−1)，每选 K 在 `cardStates.E149.extraData.owedFences` 累加 K，`computeBonusScore` 直接 +K 原始 VP；`offered` 标记防止重触发 | 端的 fencing action 是 UI stub（`shared/actions/effects/fencing.ts:65-72`），fence 系统不模型化"每玩家围栏储备"；要复刻 BGA 玩家选边放置流程需要 fence 系统重写（≥1 周），远超 master-plan §8 Sprint 3 的 3 day 估算；数量级合理（4p max +6 VP ≈ BGA 1-2 pastures × 1-3 VP = 1-6 VP；略高估但在范围内） | 重写 fence 系统：引入"reserve fences per player"模型 + fencing flow 支持"midnight 模式跳付费 + 跨玩家 source"，再把 E149 切回 BGA 行为 |
| A14 Carpenter's Hammer（2026-04-30 owner 决议） | BGA 标 `banned=true`：卡池过滤，不发到玩家手里 | 不实现 banned 字段，A14 保留在卡池中可被玩家抽到；A14 自身的 4-modifier 折扣效果（reed/wood/clay/stone in min 2 rooms）已与 BGA 对齐 | banned 是独立的 schema/dealHands 工作量（types.ts 加字段 + dealHands 过滤 + UI 标识），与 A14 折扣实现无冲突；owner 决议优先简化 schema，不引入 banned 概念 | 在 `shared/cards/types.ts` 加 `banned?: boolean`、`shared/game/deal-cards.ts` 在发牌时过滤 banned=true 的卡、UI 在卡池预览中标灰，再把 A14 标 banned |

> **Sprint 2.5 集体决策（2026-04-29）**：5 张 BeforeEndOfGame interactive 卡 BGA 行为是"玩家选 N 组/对/套"，TS 当前 auto-max。深度分析后发现这 5 张的选择空间都是**单调最优**——每多取一份选项都至少不亏 VP，且 reserved 资源在 scoring 阶段无其他用途。auto-max 与 BGA 玩家最优策略**数学等价**（C99 极少 ≤2 VP 偏差除外）。实施 interactive flow 需要 scoring-phase pending choice 机制扩展（仅服务这 5 张），ROI 远低于 Sprint 3-6 的真正必要修复。**owner 决策：登记刻意偏离，不实施**。详见 master-plan.md §8 Sprint 2.5 行。

> **历史记录**：~~E132 VeggieLover~~ 之前被误标为"刻意不同"。实际上它是 BGA 3+ 人卡（不是 5+），desc 与行为（harvest 1G+1V→6F、scoring 1/2/3 stack→2/4/6 VP）都已与 BGA 对齐。2026-04-17 移除。

### 2.6 ⏳ 待实现 / 待评估（1 张）

#### Tier 1 — BGA 自身无逻辑，我们也无逻辑（数据 only）

| Card | 类型 | BGA 状态 | 我们的处理 | 优先级 |
|---|---|---|---|---|
| D159 Reed Seller | Occupation | `isImplemented=false` | 需要"可阻止行动 + 拍卖式选择"系统 | LOW |

> **A113 Heresy Teacher**（2026-04-18）已从此处迁出至 §2.1：BGA 自身仍 `isImplemented=false`，我们借 Field.stacks 多堆模型实现。
> **D25 Witches' Dance Floor**（2026-04-17）已从此处迁出至 §2.1：多身份卡基础设施已落地（见 §3）。

#### Tier 2 — BGA 有完整实现，我们仍缺

（暂无）

> `D155_Ebonist`、`D103_CanalBoatman`、`E93_Motivator` 已于 2026-04-17 收口。
> `E96 Elder` 已于 2026-04-19 通过新增的 `handHooks` 机制实现回合 1 免费打出自身。
> `E125 DelayedWayfarer` 已于 2026-04-18 通过新增的 `onAllWorkersPlaced` 阶段 hook + `place-farmer fromSupply` 模式对齐 BGA 时序。
> `E149 MidnightFencer`（2026-04-29 Sprint 3）已迁出至 §2.5：实现为刻意偏离（onStartHarvest 给 K 个 owedFences = +K raw VP），BGA 围栏放置流程待 fence 系统重写后回归。

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
| **Per-card 6-field stats + infobox（2026-04-28）** | ✅ | `CardResourceStats` 6 字段（used/gained/paid/saved/receivedPayment/paidToOthers）+ `CardStatGained = Partial<Resource> & PseudoResourceMap` 容纳伪资源 occupation/field/roomWood/roomClay/roomStone/stable（`shared/game/resource-keys.ts`）。Helpers：`incCardUsed` / `addCardResourceSaved` / `addCardResourceReceivedPayment` / `addCardResourcePaidToOthers`（`shared/cards/helpers/card-state.ts`），中心 `recordPaymentStats(player, solution, bonusReductions?)`（`shared/cards/helpers/payment-stats.ts`）按 `Trade.sourceId` 摊算 paid/saved；`executePaymentSolution` 默认 `trackStats: true`、可 opt-out。写入点：`ActivateCardNode` + `runPlaceFarmerAfterHooks`（used）、`playOccupationAction.resolveChoice`（gained.occupation）、`commitFarmChoice` plow/room/stable（gained.field / gained.roomWood\|Clay\|Stone / gained.stable）。前端：`formatCardStatsLines`（`client/components/common/cardStatsFormat.ts`）+ FarmBoard tooltip + 10 个 `ui.cardStats.*` i18n key。Infobox 消费者：D36_BreedRegistry / E74_AshTrees / E27_PiggyBank（C148 / A53 之前已有不动）。 |
| `computeReplace` + decline | ✅ | day-laborer / A94 / D21 等 |
| `onGainResource` (after:gain) | ✅ | E103_Wolf 等 |
| `onEndTurn` 阶段 hook | ✅ | person-action turn 收束点 |
| `PrerequisiteHandler(player, state?)` | ✅ | 2026-04-17 扩展了 state 参数（C32 全局检查需要） |
| `returnCardToBoard(player, cardId, state?)` | ✅ | 2026-04-18：helper 现在可选接收 `state`，统一负责“从 `player.improvements` / `player.minorPlayed` 移除卡”以及“若归还的是 major，则回收到 `state.availableMajorImprovements` 且不重复追加”。消费者：major/minor improvement 支付路径、D60 LargePottery。 |
| `selectionEffect` / `selection-effect-registry` | ✅ | 2026-04-18：原 `fieldEffect` / `field-effect-registry` 更名，并在同日完成与 `selection` action 对齐。语义是“selection 提交后执行一个注册回调”，不再把这类“选择提交后的副作用”误称为 field effect。消费者：A58/A70/A71/B115/B165/C18/D27/D70/D71/D72/D102/E4/E71/E76。 |
| `stable-removal` helper | ✅ | D102 / E76；2026-04-24 扩为"可归还 stable 抽象层"，加 `listReturnableStableTiles(player)` + `removeStableOrFarmHandAtTile(player, tile)`，把 B85 FarmHand tile 和普通 stable 一视同仁；`cardStates.B85_FarmHand.extraData.position` 的读/写只在 B85 本卡 + 本 helper 里出现（spec §3.5.1 封装规则） |
| `recall-placed-worker` action | ✅ | D93（通用农民回收）；2026-04-19 新增 `forceFirst`（强制回收最先放置的工人）与 `targetCardHold`（回收后将工人持有到指定卡的 cardStates.extraData.heldWorkerId）参数 |
| **Card-held workers（2026-04-19）** | ✅ | `shared/cards/helpers/card-held-workers.ts`：`holdWorkerOnCard(player, cardId, workerId)` / `getWorkerHeldOnCard(player, cardId): string \| undefined` / `releaseWorkerFromCard(player, cardId): string \| undefined` / `getCardHeldWorkerIds(player): Set<string>` 原语。持有的工人存于 `player.cardStates[cardId].extraData.heldWorkerId`；`workersAvailable(state, p)` 已排除被卡持有的工人（不在任何 `takenBy` 也不在家）；回家阶段（`GameSession.returnHome`）在清空行动格 `takenBy` 之后，以 for 循环遍历每个玩家的所有 cardStates key，对每个 cardId 调用 `releaseWorkerFromCard(p, cardId)` 释放持有工人（无单独的 releaseAll 辅助函数）。首个消费者：C22 BasketChair。 |
| `discard-from-hand` action | ✅ | B146（通用弃手牌） |
| **Worker 身份模型**（2026-04-17） | ✅ | `PlayerState.workers[]`（5 槽，isActive/isNewborn）+ `ActionSpace.takenBy: WorkerRef[]` + `__roundPlacement__` 升级为 `{spaceId, workerId}[]`。删除聚合字段 familySize / newbornCount / workersAvailable，全部走 `shared/game/player.ts` helper。消费者：A25 Bassinet、B4 WoodPile（TODO 可接）、A92 AdoptiveParents（从盲减升级为精确取回）。 |
| **`countPeopleOnSpace` helper**（2026-04-17） | ✅ | `shared/cards/helpers/space-occupancy.ts`：返回某行动格上当前物理占位的人数（含新生儿）。依赖 Worker 身份模型——等于 `space.takenBy.length`。消费者：A25 Bassinet；B4 WoodPile 原 TODO 可顺带消化。 |
| `FenceSegment[]` + `getFenceCount` / `getPalisadeCount` | ✅ | B30：`PlayerState.fences` 由数值字段改为类型化 segment 数组；所有旧 `player.fences` 读取迁到 helper（`shared/game/types.ts` + `shared/actions/effects/fencing.ts`） |
| `validateFenceSelection({ allowPalisades })` | ✅ | B30：围栏选择校验支持 palisade 模式，新增错误码 `EDGE_TYPE_CONFLICT` / `PALISADES_NOT_UNLOCKED` |
| `ActionDetailEffects` fencing / palisading 拆分 | ✅ | B30：effects 日志区分围栏与木栅两种建造 |
| `useFarmSelection` 围栏/木栅模式切换 | ✅ | B30 前端：同一 farm selection 可切换 fence / palisade 目标 |
| `createActionSpaces(playerCount?)` 人数过滤 | ✅ | 2026-04-19：行动格按 `players` 字段过滤；`normalizeState` 从 `players.length` 推导；3P 新增 hollow/resource-market/lessons-3 变体 |
| `isBorderEdge(edgeId)` | ✅ | `shared/game/farm.ts`：检测农场边缘格（farmyard 外边缘），供 E16 折扣与 B30 限制复用 |
| `CardEffect.computeFenceDiscount` hook + `collectFenceDiscount(state, player, ctx)` | ✅ | `shared/cards/card-effects.ts`：围栏支付时调用，卡牌可按边数返回免费 segment 数；E16 BriarHedge 消费者 |
| `PALISADE_NOT_ON_BORDER` 错误码 | ✅ | `server/fence-validation.ts`：palisade 模式下不允许选内部 edge，对齐 BGA B30 限制 |
| **Field.stacks 多堆模型 + `shared/game/field.ts` helper**（2026-04-18） | ✅ | `Field.{crop, remaining}` → `Field.stacks: CropStack[]`（数组顺序 = 底→顶）。Helpers：`fieldIsEmpty` / `fieldTopStack` / `fieldBottomStack` / `fieldHasCrop` / `fieldTotalRemaining` / `fieldPopIfDepleted` / `fieldDecrementTop` / `fieldFindStackOfKind` / `countFieldsWithCrop` / `countEmptyFields`。**口径**：(a) 任一 stack 含作物即算该田含该作物（scoring / prereq 都走 `fieldHasCrop`——混合田同时算谷田+菜田）；(b) reap 只收顶堆，`remaining===0` 时 pop，下次收获暴露下一堆；(c) sow 仍要求空田（`fieldIsEmpty`）；(d) 单卡（当前仅 A113 Heresy Teacher）可 `unshift` 到底堆。`rehydrateState` 加 legacy `{crop, remaining}` → `stacks` 迁移。消费者：~22 张 field-相关卡 + sow/reap/scythe-harvest-field/swap-field-crop/plow/pay-grain-any/grain-thief-protect/scoring/prerequisites；前端 `FarmBoard` 按 stack 分段竖向渲染（底在下、顶在上）。 |
| **`providesField` 标志 + `countFields` helper**（2026-04-17） | ✅ | D25：次要改良卡可标记 `providesField: true` 提供虚拟田；`countFields(player)` helper 聚合农民自有田地 + 卡牌虚拟田。虚拟田仅计入前置条件检查（如 `prerequisite: { fields: 2 }`），不计入终局田数计分（计分仅看 `player.fields.length`）。 |
| **`providesOccupation` 标志 + `extraOccupationsFromCards` 字段 + `countOccupations` helper**（2026-04-17） | ✅ | D25：次要改良卡可标记 `providesOccupation: true` 提供虚拟职业；`PlayerState.extraOccupationsFromCards` 记录从卡牌获得的额外职业数（打出卡时累加）；`countOccupations(player)` helper 返回已放农民数 + 虚拟职业数的总和。前置条件（如 `prerequisite: { occupations: 2 }`）与终局计分（`E101 Blighter` 等）都走 helper 计数。 |
| **`fireplaceIdentity` 标志 + `cardMatchesCostList` helper**（2026-04-17） | ✅ | D25：次要改良卡可标记 `fireplaceIdentity: true` 作为"可返还 Fireplace"代价；`cardMatchesCostList(card, costList)` helper 用于 `CookingHearth` / `A60_OrientalFireplace` 等卡检测代价卡是否匹配（支持 `subtype` / `id` / `providedFields` / `providedOccupations` / `fireplaceIdentity` 等多种匹配模式）。 |
| **`mustBePlayedViaMinorAction` 标志**（2026-04-17） | ✅ | D25：次要改良卡可标记 `mustBePlayedViaMinorAction: true` 强制仅能通过"次要改良"行动打出；`playMinorImprovement` action 的 `isDoable` listener 检查此标志，防止其他路径打出。 |
| **`isMajorImprovement` flag + `isEffectivelyMajor` helper**（2026-04-18） | ✅ | `CardDefinition.isMajorImprovement?: boolean` 标记"本质是 major 的 minor"（A60/D59/C60/D25 四张）。`shared/cards/helpers/card-identity.ts` 导出 `isEffectivelyMajor(cardId)` 统一判定入口（先查 major pool，再查 minor 的 flag）。消费者：D161 CabbageBuyer。 |
| **choice / farmSelect / selection 统一 `sourceCard` 元数据**（2026-04-19） | ✅ | `PendingAction`、`InteractionState`、前端 `PendingChoice` 统一新增可选 `sourceCard`。`shared/engine/engine.ts` 的 `OptionalNode` 在弹出 `ui.interactionOptionalAction` 时会把来源卡写入 `pendingChoiceContext`；`server/game-session.ts` 再把它透传到 `pending` / `interaction`。消费者：`InteractionBar` 统一副标题“由 {card} 触发”，当前直接受益卡：D161 CabbageBuyer。 |
| **`computeAllowedPlacementSpaces`**（2026-04-19） | ✅ | `shared/actions/effects/placement-availability.ts`：单一允许集 helper，由 `takeAction` / `place-farmer` / `move-farmer-to-space` 三入口共用。替代已删除的 `canUseOccupied` hook phase。卡牌通过 `computeArgs` + `OCCUPIED_SPACE_CHOICE_PREFIX` 注入额外可用的已占用空间。消费者：A25/A28/A130/B151/C129/D24/E21/E150。 |
| **`CardEffect.computeLockedFarmTiles`**（2026-04-18） | ✅ | 通用农场格锁定扩展点，卡牌可声明动态锁定的格子，验证层和交互层自动过滤。消费者：B38 FutureBuildingSite。 |
| **minor / occupation 印刷 `vp` 接入计分**（2026-04-17, PR1） | ✅ | `shared/logic/scoring.ts:287-293` 通过 `getRegisteredMinorImprovement(id).vp` / `getRegisteredOccupation(id).vp` 把印刷 VP 计入 `cardEntries`；之前硬编码 `score: 0`。配套本地审计脚本 `scripts/audit-card-vp.ts`（`npx tsx scripts/audit-card-vp.ts [--strict]`）对齐 BGA minor/occupation `vp` 字段；**不进 CI**，只作本地 gate。 |
| **`CardEffect.handHooks` 手牌 hook 机制**（2026-04-19） | ✅ | `CardEffect.handHooks?: CardEffectHook[]`：声明哪些 hook 在卡牌还在手牌时也应触发。`continueStageHook` 在遍历已打出卡后额外遍历手牌中声明了当前 hook 的卡。框架保证 handHooks 只遍历手牌——一旦卡被打出（移入 `xxxPlayed`），只走正常路径。消费者：E96 Elder。 |
| **`play-occupation` `allowedCards` 参数**（2026-04-19） | ✅ | `play-occupation` action 的 execute/resolveChoice 支持 `params.allowedCards?: string[]` 过滤可选职业。消费者：E96 Elder。 |
| **`CardEffect.resolveChoice` hook**（2026-04-19） | ✅ | `shared/cards/card-effects.ts`：卡牌在 choice prompt 返回后可声明此 hook 接管结果（例：A3 用它实现"从玩家选中的 3 张中随机取 1"）。 |
| **`rollAndCacheCardPick` + `state.rngTick`**（2026-04-19） | ✅ | `shared/cards/helpers/card-random.ts`：确定性 RNG helper，`state.rngTick` 作为单调递增种子，保证同一 state 快照回放结果一致。消费者：A3 PaperKnife。 |
| **`state.pendingUndoBoundary` flag**（2026-04-19） | ✅ | `server/game-session.ts` 的 `pushHistory` 消费：当 flag 为 true 时阻止 undo 越过当前状态边界（防止玩家看到随机结果后撤销重抽）。消费者：A3 PaperKnife。 |
| **`InteractionSelection.kind: 'occupation-hand'` + `buildOccupationHandSelectionInteraction`**（2026-04-19） | ✅ | `server/occupation-hand-interaction.ts`：在 `InteractionSelection` 通用 selection 框架下新增"从手牌选职业"子类型，前端按此 kind 渲染手牌选择面板。消费者：A3 PaperKnife、B3 Moonshine。 |
| **`ActionChoiceOption.disabled` / `.disabledReasonKey`**（2026-04-19） | ✅ | 选项可标记为 disabled + 提供 i18n reason key；server 校验时拒绝玩家选中 disabled 选项（防止前端绕过禁用直接提交）。 |
| **`passOccupationToNextPlayer`**（2026-04-19） | ✅ | `shared/cards/helpers/pass-occupation.ts`：把一组手牌传给下一位玩家并等待其选择；实现"传牌"语义。消费者：B3 Moonshine。 |
| **`emit-choice` action**（2026-04-19） | ✅ | `shared/actions/effects/emit-choice.ts`：在 ActionFlow 中发出一个 choice prompt 并等待玩家回应，作为通用的"弹出选择后继续"叶节点。 |
| **Dual-type cards (`CardDefinition.alsoCountsAs`)**（2026-04-17, PR3） | ✅ | 新增 `CardType = 'major' \| 'minor' \| 'occupation'` + `CardBase.alsoCountsAs?: CardType[]`（对齐 BGA `getOtherCardTypes()`）。`shared/cards/helpers/card-type.ts` 提供 `cardCountsAs(cardId, asType)` 与 `collectCardsAs(player, asType)`；`prerequisites.ts` 的 3 个 count 函数 + 5 处 caller（A101/A31/D145/C5/B133）全部切到 dual-type 计数。落地卡：D60/D59/A60 均 `alsoCountsAs: ['major']`。前端 `PlayerCard` + `card-sprite.css` 走 `data-also-counts-as` 属性选择器切换 `card_frame_major_minor.png` + `minor_major_costtext.png`——未来新增 dual-type minor 零改动即可正确渲染。 |
| **`onAllWorkersPlaced` 阶段 hook + 阶段 flow**（2026-04-18） | ✅ | `CardEffect.onAllWorkersPlaced?: CardEffectHook`：在所有玩家本轮在家工人都用完之后、`performRoundEnd` 之前触发；可返回 `ActionFlow` 走与普通行动一致的引擎链路（`continueAllWorkersPlacedHooks` 维护 stage resume cursor）。首个消费者：`E125 DelayedWayfarer`（本轮所有人放完后，从 supply 激活并放置一个 worker，对齐 BGA 时序）。 |
| **`place-farmer` `fromSupply` 模式**（2026-04-18） | ✅ | `place-farmer` 接受 `params.fromSupply: true`：在执行前从 `player.workers` 里激活一个 inactive supply worker（标记 `isActive=true`），再走标准放置流程；专为 `onAllWorkersPlaced` 阶段“现激活、现放置”的卡牌（E125 DelayedWayfarer）服务，不影响普通工作阶段路径。 |
| **`dispatchReapListener` + `'reap'` 合成 action**（2026-04-18） | ✅ | `shared/actions/effects/reap.ts` 导出 `dispatchReapListener(state, player, crop, amount)`：每次 base reap 与额外 reap 卡（D25/C70/E69/E70/E68/E72）产出作物后调用，分发 `'reap'` 合成 action 事件（`extraData = { crop: 'grain'\|'vegetable', amount }`）。卡牌可通过 `registerCardListener({actions: ['reap'], phases: ['immediatelyAfter']})` 订阅。首个消费者：B132 EstateMaster（满栏后每次蔬菜 reap +1 VP）。 |
| **`ActionDetailParts.bonusSources` + `PlayerState._activeActionBonusSources` scratchpad**（2026-04-23） | ✅ | `shared/protocol/game.ts` 的 `ActionDetailParts` 新增 `bonusSources?: string[]`；`PlayerState` 新增 session-transient `_activeActionBonusSources?: string[]`，由 `GameCore` 在 action 生命周期（start / leaf flush / finalize）维护；`executePaymentSolution` 把 `PaymentSolution.bonusUsed` 的 source id 写入 scratchpad。前端 `client/components/board/log-rendering.tsx` 把 `detailParts.bonusSources` 渲染为 log 尾缀“via {cards}”（i18n：`log.bonusSources`）。消费者：所有走 `payTypedFlatCost` / `computeAllBuyableCombinations` 的 action（renovate / construct / play-improvement 等），无需单卡适配。 |
| **`Bonus.choices` + `BonusModifier.choices` + bonus accumulation 修正**（2026-04-20） | ✅ | `shared/game/types.ts` 在 `Bonus` / `BonusModifier` 新增 `choices?: BonusChoice[]` 字段，表达"一组互斥折扣，按 optional 展开为选用/跳过 + 每条 choice 各一个候选"。`computeAllBuyableCombinations` 的 bonus iteration 重写为 BGA 风格（非 optional 累积、optional 展开、`choices` 展开为多个候选）。`shared/actions/effects/room-payment.ts` 的 `buildRoomCostPerUnit` 与 `applyRoomCountBonuses` 同步处理 `modifier.choices`（per-room 与 total 两条路径都覆盖）。修正了原本把多 bonus 误当互斥的 bug。首个消费者：A123 FrameBuilder（迁移自 4 条独立 TradeModifier，见 §2.0 2026-04-20 条目）。 |
| **`cardAllowedForPlayerCount` + `dealHands` 卡池按人数过滤**（2026-04-25） | ✅ | `shared/cards/player-count-filter.ts` 提供 `cardAllowedForPlayerCount(playersField, playerCount)` 解析器（识别 `'N+'` / `'N-M'` / `'N'` / undefined，fail-open on unknown）。`dealHands`（`shared/logic/state.ts`）的三类来源——内置 (`implementedMinorImprovementCards` / `implementedOccupationCards`)、community deck (`implementedCommunityMinors` / `implementedCommunityOccupations`)、extra IDs (`extraMinorIds` / `extraOccupationIds` 即 workshop + `customCards=`)——全部按 `playerCount` 过滤；extra IDs 通过 `lookupPlayersField` 内联多源回退（custom-registry → ad-hoc registry → 内置 lookup）。dev 通道（`devDrawCard` / `devPlayCard`）绕过卡池构造、不受影响。BGA 的"哪些卡只在某些人数下出现"语义现在生效（`E166_Roastmaster` / `E149_MidnightFencer` 等 `4+` 卡不再进 2/3p 手牌；C39 不再被错误打上 `players: '1-3'`）。 |
| **`PlayerActionSpaceConfig.shouldRegister?(state)`**（2026-04-25） | ✅ | `shared/cards/player-action-space.ts`：可选 gate 决定是否在 `createPlayerActionSpaces` 中创建该卡的行动格。`createPlayerActionSpaces` 循环中位置：`if (!config) continue` 之后、duplicate-id 检查之前。首个消费者：C39 StudioBoat（`shouldRegister: (state) => state.players.length < 4` —— 4p 已有全局 Traveling Players 行动格，不再重复注册 C39 自己的复制品）。 |
| **`meetsTextPrerequisite` whole-string 自定义查找**（2026-04-29, Sprint 1 PR-1C） | ✅ | `shared/cards/helpers/prerequisites.ts`：`meetsTextPrerequisite` 现在先用整串调用 `checkCustomPrerequisite`，命中即返回；未命中再回退到原有按 `" and "` 分句逐 clause 校验。新增能力让 D8 FernSeeds（`'1 Empty and 2 Planted Fields'`）这类含 "and" 的复合 prereq 也能整串注册一个 handler；原有单 clause 注册路径完全向后兼容。消费者：D7 Trident / D8 FernSeeds / D39 TruffleSlicer / D53 TeaHouse / D58 Gritter。 |
| **`onBeforeEndGame` 阶段 hook**（2026-04-29, Sprint 2 PR-2A） | ✅ | `CardEffect.onBeforeEndGame?: EffectHandler`（`shared/cards/card-effects.ts:151`）：在 scoring 启动前、所有 categories 计算之前触发；用于 mutate state（如 B133 给 vegetable 资源），让标准计分自然把这些资源算进 VP，避免再走 legacy `computePostScore` 直接返 raw VP。dispatch 入口在 `shared/session/game-core.ts:2440`（`continueAfterRoundEnd` round>14 分支，gameOver 转换前），整局只触发一次。首个消费者：B133 VillagePeasant（之前 `computePostScore` 直接返 N VP，现改为 `onBeforeEndGame` 给 N vegetable）。BGA 对应事件：`onPlayerBeforeEndOfGame`。 |
| **`FutureMeepleEntry.roomType?` + `tryAddRoomTile` helper**（2026-04-29, Sprint 2 PR-2B） | ✅ | `shared/game/types.ts` 在 `FutureMeepleEntry` / entries-mode request 加 `roomType?: 'wood' \| 'clay' \| 'stone'`，资源 entry / room-placement entry 二选一。`shared/logic/state-constants.ts:applyFutureMeeples`（round-start 消费入口）现在同时处理 `entry.resources`（原资源派发）和 `entry.roomType`（按 BGA 行为：`player.houseType` 匹配则免费建房，否则 silent skip）。新 helper `shared/logic/farm/build-room-helper.ts:tryAddRoomTile(player, type)`：扫 used-set（room/stable/field/pasture tiles）找首个空 farmyard 位置，push 到 `roomTiles` 并 `rooms +=1`，full board 返回 false。首个消费者：B14 Hawktower（onBuy 入队 `{ round:12, roomType:'stone' }`，round-12 round-start 自动触发）。BGA 对应：`futureMeeplesNode(['roomStone' => 1], [12])`。 |
| **`getFencesBuiltThisAction` + action-snapshot fence delta**（2026-04-30, Sprint 5 mech-D） | ✅ | `shared/cards/helpers/action-snapshot.ts`：`recordActionSnapshot` 在原 `stableTiles` / `roomTiles` 计数基础上多记 `fenceSegments: player.fenceSegments.length`；新加 `getFencesBuiltThisAction(player)` helper 返回当前 actionToken 内围栏段数差量（仿现有 `getRoomsBuiltThisAction` / `getStableTilesBuiltThisAction`）。向后兼容：旧 cardStates 没 `fenceSegments` 字段时 helper 返回 0。首个消费者：B27 Toolbox `effect.onBuy`（"B27 在手 → 同 turn 已造过房 / 围栏 / stable → 立即 set flag" BGA 边界）。 |
| **`solveBonusScoring` Pareto 求解器 + `computeCostedBonus` hook**（2026-04-30） | ✅ | `shared/logic/scoring-bonus-solver.ts`：Cartesian-product 枚举所有 costed bonus 卡的 `BonusScoreLevel[]` 笛卡尔积，过滤超资源组合，找最优总分（costed + free）后从 `playerForBonus.resources -= totalCost`。`shared/logic/scoring.ts` 调用前先 shallow clone player 保持纯函数，clone 共用给下游 Major scoring + free handlers。卡分两路：`computeCostedBonus: (state, player, ctx) => BonusScoreLevel[]`（5 张：A136/C133/E132/C99/D132）+ `computeBonusScore: (state, player, ctx) => number`（50 张 free，含 D60 resource-aware 与 4 张迁入的 D100/C31/C135/E159）。完全替代旧的 `scoringPriority` 全局排序 + `ctx.reserved` 协议（已删除）。`computeSharedPostScore`（A135/C136 跨玩家分调）不动。Helper `shared/cards/helpers/pareto-bonus.ts` 给 C99 这类需要枚举多 cost 候选的卡做 dedup。LLM card-gen 测试 `tests/llm-card-gen/session-helpers.ts:runBonusSolver` 替代旧 `collectBonusScores` shim 入口。BGA 对应：`onPlayerBeforeEndOfGame` + per-card `getEndOfGameVP()`。 |

### 目录重组（PR-3）

- 2026-04-20 PR-3 目录重组落地：
  - src/ → client/
  - server/custom-code/ 集中自定义代码执行链（compiler + runtime + engine + isolate + client + worker）
  - server/game/ 集中对局链（authoritative-session + room-manager）
  - 删除 PR-1 遗留的 7 个 farm re-export + ast-validator + custom-code-types 兼容 stub
  - package.json.sideEffects 声明完成（主 bundle 基线 ~834KB / gzip ~234KB，PR-4 继续缩减）
  - ESLint no-restricted-imports 三层边界（warn）已启用，零跨界违反

### PR-3 Task 10 审计遗留（待未来 PR 处理）

- TODO(PR-future): `collectLockedFarmTileKeys` in `shared/cards/card-effects.ts` 是 rule-ish（遍历 `getCardEffect` mutable 注册表、调用卡牌 `computeLockedFarmTiles` handler，主要消费者在 `shared/session/game-core.ts` / `shared/logic/farm/farm-interaction.ts` / `shared/logic/farm/farm-choice.ts` 规则路径上，`client/components/board/FarmBoard.tsx` 只是顺带复用）。不适合迁到 `shared/cards/view-helpers/`；evaluate 在后续 PR 中将前端使用的那份改为消费 server 预先计算的 `lockedTileKeys` 快照字段，或包成显式输入的 shared helper。Tracked during PR-3 Task 10 audit.
- TODO(PR-future): `applyMajorEffectsToAllPlayers` in `shared/cards/major/index.ts` 是 rule-ish（遍历所有玩家触发 major hook 并返回 `ActionFlow`），`client/app/hooks/use-round-flow.ts` 在前端调用本就越线；evaluate 在后续 PR 中将 `onRoundStart` 合入 server 权威流程（让 `GameSession` 先跑 hook，前端只消费结果）或包成 explicit-inputs 的 shared helper。Tracked during PR-3 Task 10 audit.

### 客户端 bundle 懒加载（PR-4）

- 2026-04-20 PR-4 懒加载 + 路由切分落地：
  - 主 bundle 834KB → ~472KB raw (-43%) / 234KB → ~143KB gzip (-39%)
  - 客户端走 `/cards-manifest.json` 运行时获取元数据（`client/services/card-meta.ts`），不再静态 import `shared/cards/catalog`
  - 客户端专用轻量 rehydrate（`client/services/rehydrate.ts`），不再触发 `shared/game/serialization` 的 actions/catalog 依赖链
  - `shared/logic/state.ts` 拆出 `state-constants.ts`（客户端安全常量层）
  - `scripts/build-cards-manifest.ts` 新增对 `PlayerActionCard` + major 字面量卡的覆盖（875 → 897 entries）
  - `CardRegistry` 新增 `loadByIds(ids, lookup)` / `unload(id)` API（PR-5 draft 玩法基建）
  - `scripts/check-bundle-size.ts` 默认 strict（main ≤ 550KB raw / ≤ 170KB gzip，当前 buffer ~17%）
  - `scripts/check-reaches.ts` 已 strict（PR-1 遗留，PR-4 CI 一并收紧）

### 卡牌 draft 玩法（PR-5）

- 2026-04-20 PR-5 卡牌 draft（Simultaneous）落地：
  - 新增 `GameState.phase: 'draft' | 'playing'` 与 `GameState.draft: DraftState | null`（默认 `playing`/`null`，向后兼容）
  - DraftManager 纯函数（`shared/draft/`）+ 27 unit tests
  - GameSession `submitDraftPick` + 13 session tests；2/3/4 人局、partial submit、持久化 round-trip
  - 协议 `ClientCommand.draftSubmit` + HTTP `/api/game/draft-submit` + WS 路由
  - 房间创建接受 `draftMode`/`draftPoolSize`（默认 `none`；存量房间零破坏）
  - Client `DraftOverlay` + `DraftPoolRow` + `DraftHistoryPanel`；当 `phase='draft'` 覆盖游戏板
  - Lobby URL 参数支持 `draftMode` + `draftPoolSize`
  - E2E Playwright 双浏览器 7 轮全流程，~6.4s 确定性
  - 主 bundle 477KB raw / 145KB gzip（仍在 550KB / 170KB 预算内）
  - 隐私信任式（issue #7 单独跟进）

### 协议层安全（PR-6）

- 2026-04-20 PR-6 协议层安全落地：
  - Issue #7 手牌隐私修复：`serializeStateForPlayer` per-viewer filter + per-connection broadcast；对手手牌与 draft 池以 `'?'` 占位
  - WS 命令 seat binding：防止认证用户伪装为其他玩家（`assertOwnSeat` / `assertOwnPlayerId`）
  - HTTP `/api/game/*` opt-in filter via `X-Viewer-Player`；认证用户 playerIndex 校验
  - A73 flaky 测试登记 issue #9（retry 标记保留）
  - 新增测试：serialization-filter (9) + privacy-broadcast (4) + privacy-http (10) + ws-seat-binding (7) = 30 新测试
  - 详见 `docs/ENGINE_ARCHITECTURE.md §15 Hand Privacy & Seat Binding`

### place-farmer jump mode (Sprint 5 mech-A, 2026-04-30)

`actionContext.viaCardJump=true` 时 `place-farmer` effect 进入 jump 分支：移动 worker（`removeWorkerRef` + `addWorkerRef`）+ 累加 `actionContext.jumpChain`（mutate）+ `incPlacedFarmers(player)` + 返回 `{type:'flow', flow}`，flow 取自 target action 的 `flow` 字段（如 `major-improvement → improvement-any` / `fencing → fence` / `grain-utilization → or(sow, bake-bread)`），fallback 单 leaf。第二格走完整 ActionNode 路径自然继承 `applyComputeReplace` / `applyIsDoable` / `computeCosts` / before listener。

防递归：listener 自检 `isJumpChainContains(context, CARD_ID)`（`shared/cards/helpers/jump-leaf.ts`）。

可达性单一源：`computeAllowedPlacementSpaces`（含 occupied-space extra option）。

per-action 簿记不重置：actionToken / actionStartPlayerSnapshot / `_activeActionBonusSources` / `cardEffectDeltasSinceFlush` 都不动 — jump 是同 action 延续。

落地 BGA ruling：`LANDS_ON_SECOND_SPACE`（farmer 物理移动）+ `ONE_JUMP_PER_TURN`（jumpChain 自检）。

实现：`shared/actions/effects/place-farmer.ts` viaCardJump 分支 + `shared/cards/helpers/jump-leaf.ts`（`jumpLeaf()` / `isJumpChainContains()`）+ `shared/actions/index.ts` `registerJumpActionLookup` 注入 lookup（避开循环依赖）。

消费者：A129 Swagman / B130 FullPeasant / B150 LargeScaleFarmer / B152 JuniorArtist。

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
| E16 BriarHedge + B30 border-only | 04-19 | 0 | 821 | 92.0% |
| 行动格按人数过滤 (2-3P) | 04-19 | 0 | 821 | 92.0% |
| canUseOccupied → computeArgs 统一 | 04-19 | 0 | 821 | 92.0% |
| E96 Elder BGA 对齐 + handHooks 机制 | 04-19 | 0 | 821 | 92.0% |
| C22 BasketChair BGA 对齐 + card-held-workers 原语 | 04-19 | 0 | 821 | 92.0% |
| A3+B3 BGA 对齐 via hand-picker infra | 04-19 | 0 | 821 | 92.0% |
| A123 FrameBuilder → bonus.choices + pay 系统 Bonus.choices 能力 | 04-20 | 0 | 821 | 92.0% |
| 卡池按人数过滤 + C39 StudioBoat BGA 对齐 | 04-25 | 0 | 821 | 92.0% |
| Sprint 6 partial (A-deck extraVp ×21 + E30 mutation fix + D12↔D148) | 04-29 | 0 | 821 | 92.0% |
| Sprint 5 mech-A (A129/B130/B150/B152 真二次落子 + place-farmer jump 模式) | 04-30 | 0 | 821 | 92.0% |
| Sprint 5 mech-D (B27 Toolbox turn-edge BGA 对齐) | 04-30 | 0 | 822 | 92.1% |
| Sprint 5 mech-B (A4/D83 altCosts + D117 trades) | 04-30 | 0 | 822 | 92.1% |

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
