# Sprint 7b2 — Audit Cleanup Design

**Date**: 2026-05-02
**Worktree**: `.worktree/sprint-7b2` (branch `sprint-7b2`)
**Sprint scope**: 7b 中 scope 的 audit cleanup 子项（与 7b1 协议层升级解耦）

---

## 1. Goals

1. **完成 16 张 audit ⚠/❌ 漏修真 fix**（Sprint 7 audit 暴露的 61 张中，未在 Sprint 7a 处理的 audit-real-bug；7b2 深度对比后 1 张确认 audit 误报，归 demote）
2. **同步 8 项 docs**（4 张 demote 含 B139 + 1 张复核 D100 + 3 项 master-plan/§2.5 同步）
3. master-plan §0 ⚠/❌ 残留数字归零（除 §2.5 deliberate）

**Non-goal**：
- §2.5 27 张 simplification re-audit（独立 sprint）
- 7b1 协议层升级（独立 sprint）

**已确认对齐（不在 7b2 scope）**：
- A4 Baseboards：4/4 session test pass，altCosts OR-ed payment 实现正确，game-core auto-resolve 是 BGA 等价行为（标准 §2.0 aligned，不需登记 §2.5）

---

## 2. Architecture

无新基建（计划保留）。所有 16 张 fix 落在已有扩展点（onBuy / harvest exchange / computeBonusScore / cardStates / futureMeeples / `'after'` listener / SE choice）。少量 simplification（C94 stable-cost / C27 trade-clone / C52 placeFarmerFlow）登记 §2.5，避免引入新基建。

---

## 3. Cards Scope

### 3.1 真 fix — 不 demote BGA banned（深度对比后 16 张，1 张 demote）

**重要**：我们没有 `banned` 字段实现（owner 决议——A14 / Sprint 7a 已确认）。所有 BGA banned 卡也必须真实现对齐 BGA 行为。

**深度调研结果**：每张卡已逐一读 BGA PHP + 我方 ts + 历史 commit + 现有 session test，下表的偏差描述基于源码事实，不再依赖 audit-report 摘要。表头包含 BGA 行为摘要 / 我方现状 / 真实偏差 / Fix scope，方便 family agent 直接进入实现阶段。

| Card | BGA 行为 | 我方现状 | 真实偏差 | Fix scope | 估算 |
| --- | --- | --- | --- | --- | --- |
| **C135 Constable** ❌ P0 | `onBuy`：剩余完整轮数 1/3/6/9 时立即 1/2/3/4 wood（map 见 PHP L25–41）；`computeSpecialScore` 给"无任何负分项"玩家 +3 VP | 仅有 `computeBonusScore` (TS L20–24)，**`onBuy` wood 完全缺失** | 缺 onBuy gain wood；scoring 部分逻辑等价（已通过 ctx.categories 检测负分） | 加 `onBuy` 用 `state.round` 反推 `14-round`，gain wood map | 0.4d |
| B139 ForestScientist | `onPlayerReturnHome`：当前轮所有 ActionCards 上 wood meeples 总和=0 时 +food (turn≥5→2 else 1) | TS L21–32 `onReturnHome` 同语义（actionSpaces.resources.wood 求和=0 即触发）；round≥5 阈值一致 | **已对齐 — audit 误报**（spec §3.1 注释也已澄清 trigger 是 onReturnHome） | demote 到 §3.2 §2.0 aligned | 0d (docs only) |
| B39 Loom | `HarvestFieldPhase`：`countAnimalsOnBoard()[SHEEP]` 映射 [0,1,1,1,2,2,2,3]→food；`computeBonusScore` floor(sheep/3) | TS L7–12 用 `player.resources.sheep`（含 reserve）；map 等价；computeBonusScore 用 `player.resources.sheep / 3` | sheep 来源差：BGA 仅板上（pasture+stable+animal-holder），我方含 reserve | 改用 `countAnimalsOnBoard` 等价（pasture + stableAnimals + houseAnimal*）；helper 已存在或新建 | 0.4d |
| B50 ButterChurn | `HarvestFieldPhase`：sheep/3 + cattle/2 个 food，源同样是 `countAnimalsOnBoard()` | TS L21–32 用 `player.resources.{sheep,cattle}` | 同 B39 sheep/cattle 来源差 | 同 B39 helper 复用 | 0.3d |
| B89 Groom | `onBuy` +1 wood；`StartOfTurn` & `getRoomType()=='roomStone'` → optional 1 stable，`args.costs={WOOD=>1, max=>1}` | TS L23–50：onBuy 已有；`onBeforeStartOfTurn` 显式 pay-resources(wood:1) 然后 stables(max:1)；多余 `wood<1` 阻断 | flow 用 explicit pay-resources 而非 stables 自带 cost；wood<1 阻断会导致 trigger 不出现，BGA 是 prompt 时再检查 | 改为 stables leaf with cost params；移除 wood<1 阻断 | 0.4d |
| **B117 Informant** | `onBuy` +1 wood；`AfterWorkPhase` (work phase 全部完成、ReturnHome 之前)：`countReserveResource(STONE) > countReserveResource(CLAY)` → +1 wood | TS L21–29：onBuy 已有；`onBeforeReturnHome` 检查 `resources.stone > resources.clay` | 时机相近但**触发点定义不同**：BGA 是所有玩家 work phase 完结的瞬间（整桌共一次），我方 `onBeforeReturnHome` 是每玩家 return home 之前（每玩家各一次）；resources vs reserve 在我方 storage 等价（resources 即 reserve） | 需确认 onBeforeReturnHome 是否仅触发一次或按 owner 触发；如属"per-owner pre-return"则与 BGA "after work phase" 等价（仅 owner 自己结算），可能已对齐；待 family agent 写 session test 验证 | 0.5d (含验证) |
| **B15 CarpentersBench** | `isCollectEvent(WOOD)` → onAfterCollect：从 `event['meeples']` 数 wood meeples 数量 n；返回 fence flow `max=n+1, benchWood=n`；额外 `onPlayerComputeCostsFencing` 把 wood:1 fence 计为 free（结合 `benchWood` 限制 ≤n） | TS L12–39：判 `gainPerRound.wood>0` (而非实际 collect 的 meeples)；fence leaf 无 max 无 benchWood；BonusModifier 给 fencing 一个无条件 wood:1 折扣 | 1) max 计数错（用 space.gainPerRound 而非 actually-collected）；2) benchWood 上限缺失（应仅 n 个 fence 用 wood）；3) `B15` BonusModifier 当前永久折扣 fence 而非"仅本次"；4) 缺 "use the taken wood (and only that)" 约束 | 改 listener 用 result.resourcesGained.wood 计 n；fence leaf 加 max=n+1；用 cost-modifier-with-cap 替换永久 BonusModifier；新增 ctx 标记本 fence 为 bench-wood-only | 0.7d |
| C140 PackagingArtist | `onBuy` +1 grain；`computeReplaceImprovement` 把 minor-improvement action **替换为** bake-bread；`isDoable` 让 minor-improvement 在玩家无 cards 时也 doable；`computeArgsPlaceFarmer` 把 ActionMajorImprovement 加入 minor pool | TS L8–25：`phase:'before', action:'minor-improvement'` → 插入 optional bake-bread leaf（不替换） | 1) 是 **alongside** 而非 replace；2) 缺 isDoable override（无手牌时不可达）；3) 缺 ActionMajorImprovement → minor pool 接入 | 改用 computeReplace hook（已有 phase）；加 isDoable hook；ActionMajorImprovement merger 视基建是否支持 — 不支持则 simplify 登记 §2.5 | 0.7d |
| C27 Blueprint | `computeCardCosts`：把已有 trades 中含 stone 的复制一份，stone-1（玩家可选两种支付方式）；同时支持 minor-improvement action 时建 Joinery/Pottery/Basket | TS L18–27：`computeCosts` 直接 `costs:{stone:-1}` 永久折扣；缺"minor 行动建 major"路径 | 1) cost 折扣机制不同（trade-clone vs straight-discount，影响 trade 替代支付）；2) 缺 minor-improvement action 上建 major 的 routing | 折扣可保留 simplification 登记 §2.5；minor→major routing 需在 minor-improvement action flow 加 hook（trueAction 检测）| 0.7d |
| C52 HuntsmansHat | `onPlayerComputePlaceFarmerFlow`：AnimalMarket → xor (sheep+food / pig+food / pay food→cattle)，PigMarket 加上"+pig 上的全部 pig 当前数 food"；`onPlayerAfterGain`（ANY action space gain pig）+1 food/pig | TS L9–27：仅监听 `space.id == 'pig-market'` 的 collect after，按 `boar` 数 +food | 1) 不覆盖 AnimalMarket flow 改造；2) 不监听其它 action space 的 pig gain（BGA 是 generic）；3) `boar` 与 `pig` resource 名字差（我方 `boar` = BGA pig，OK） | 加通用 `'after' + collect/gain` listener 监听任意 space 的 boar 增量；AnimalMarket flow 暂登记 §2.5（需要 placeFarmerFlow hook） | 0.6d |
| **C63 CraftBrewery** | `HarvestFeedingPhase`：单 grain field 时直接 `eatSingleFieldGrain`+payGain([GRAIN=>1],[FOOD=>4,SCORE=>2])；多 field 时 `actEatFieldGrain` 让玩家选 field | TS L20–37：直接 `fieldDecrementTop(grainField)` (找首个 grain field)，payGain 用 4 个 leaf (pay-resources/gain/2×bonus-vp) 拼凑 | 1) 多 grain field 不让玩家选（自动取首个）；2) imperative `fieldDecrementTop` 破坏 undo 路径，应通过 special-effect 节点；3) flow 拼装与 BGA payGainNode 不一致但 score=2/food=4 数值对 | 改用 special-effect leaf eatFieldGrain（含 zone 选择），payGain 改用 helper `payGainNode` | 0.7d |
| C80 RockyTerrain | `isActionEvent('Plow')`/`'Improvement'`/`'Occupation'`：plow 直接触发；improvement/occupation 在 `card->isField()` 时触发 | TS L18–30：仅 `'plow'` action; improvement/occupation 缺失 | 缺 field-card improvement/occupation 触发；项目中 field cards 极少，但 desc 写"tile or card" | 加两个 listener phase 'after' actions ['improvement','occupation']，过滤 isField；或登记 §2.5 simplification（无 field card 时 noop） | 0.4d |
| C94 StableCleaner | anytime + flag/unflag；stables action with `costs={WOOD=>1, FOOD=>1}` | TS L23–43 + 注释明示"normal 2 wood cost applies"，cost 重定义未实现 | cost (1 wood + 1 food / stable) 没传给 stables.ts（buildStable 硬编码 wood:2） | 扩展 stables.ts 接收 cost params（小型基建）或登记 §2.5 simplification | 0.7d (基建) |
| D127 HardworkingMan | `canBePlayed`：other-players-rooms <= mine 计数 == 1（即仅 owner 满足，等价"所有 other 比我多"）；`activate`: NODE_OR with 3 children — CONSTRUCT, IMPROVEMENT(major), gain food:2 | TS L17–35：`xor` with day-laborer/construct/improvement-any leaf | 1) BGA NODE_OR 允许"组合多个执行"我方 xor 限选一（**关键差**：desc "all three"）；2) gain food:2 我方用 `day-laborer` leaf —需确认 leaf 行为 | 改 xor → or（all-three 语义）；保留 day-laborer leaf 或换 `gain food:2`；canBePlayed 已对齐 | 0.4d |
| E148 Lazybones | `onBuy` 若 reserve 有 stable → SE `moveStables`：玩家选放在 4 个 spaces 子集；opponent place-farmer trigger → `receiveNode` 取 stable 给 owner；`EndHarvest` 不重置 | TS L29–84：onBuy 自动放前 N 个 spaces (无玩家选择)；listener: 'place-farmer'/'opponent' + spaceId 检查；imperatively `stableTiles.push(tile)` | 1) onBuy 不让玩家选放置 spaces（应 SE choose）；2) 收回时 imperative 直接建 stable，缺 "receive node" 流程一致性 | 加 SE moveStables choice (places⊂4)；收回改用 receive/build-stable flow | 1d |
| E73 Scythe | `StartHarvestFieldPhase` (field crops≥2)：玩家选 1 field → `setScytheField`，让 BGA 主流程 harvest 时只动这一块（**全部 stack** 收）；`EndHarvest` 重置 ScytheField | TS L7–67：用 ad-hoc action `card_E73_Scythe_harvest-field` 直接 `field.stacks.pop()`（**仅顶 stack**）；fields ≥1 即触发 | 1) 仅收顶 stack（BGA 收所有 stacks）— 真偏差；2) 触发条件 stacks≥1 vs BGA crops≥2；3) 与主 harvest 流程并存可能"双收"（手动+主流程）；4) 缺 EndHarvest 重置 token 概念 | 替换为 setScytheField token 模型（cardStates）+ 改主 harvest 路径检测 token 跳过；OR 全收所有 stacks + 阻断主 harvest（更卡内闭环） | 1.2d |
| E83 ShepherdsWhistle | `EndHarvestFeedingPhase`：有空 unfenced stable → +1 sheep；否则若有 unfenced stable（占着的）→ optional reorganize + 重新检查 → +1 sheep | TS L13–39：仅检查"空 unfenced stable"路径；reorganize fallback 缺失（注释明示） | 缺 reorganize fallback 流程 | 加 reorganize action leaf + 重新检查 helper；或登记 §2.5 simplification | 0.6d |

合计 ~9.5d（含 1 张 demote 0d）。每张 family agent 自己 read BGA + ts 验证细节，写 session test 后实施。注：B139 已确认 audit 误报，移到 §3.2 demote。

### 3.2 Demote (4 张, docs only)

| Card | 当前 | 目标 §  | 理由 |
| --- | --- | --- | --- |
| B106 MoralCrusader | ⚠ verify-only OK (Sprint 7a) | §2.0 (aligned) | 7a 已确认行为对齐，audit 误报 |
| B152 JuniorArtist | ⚠ Sprint 5 mech-A 已 jumpLeaf | §2.0 (aligned) | 同上 |
| B133 VillagePeasant | ⚠ commit b064d2df 已 fix | §2.0 (aligned) | 04-29 已修，audit 未追上 |
| **B139 ForestScientist** | ⚠ P1（原归 §3.1） | §2.0 (aligned) | 7b2 深度对比确认 onReturnHome 触发与 BGA `onPlayerReturnHome` 等价；wood 检测、food 数量、round≥5 阈值全部对齐，audit 误报 |

### 3.3 复核 (1 张)

| Card | 现状 | 复核内容 |
| --- | --- | --- |
| D100 LordoftheManor | commit 1ecf951e 已迁 computeBonusScore | 跑现有 session test + 对照 BGA 行为，确认是否 §2.0 aligned 还是仍需补 fix |

---

## 4. Implementation: 4 Family Agents

仿 Sprint 7a 模式：每 family agent 一个独立分支 + worktree 并行实施。

| Family | Agent | 分支 | 卡列表 | 估算 |
| --- | --- | --- | --- | --- |
| **F1** | P0 + B-deck (6) | sprint-7b2-f1 | C135 / B39 / B50 / B89 / **B117** / **B15** | ~3.1d |
| **F2** | C-deck (6) | sprint-7b2-f2 | C140 / C27 / C52 / C80 / C94 / **C63** | ~3.8d |
| **F3** | D + E-deck (4) | sprint-7b2-f3 | D127 / E148 / E73 / E83 | ~3.2d |
| **F4** | docs + 复核 (5 项) | sprint-7b2-f4 | demote 4 张 (B106/B152/B133/**B139** →§2.0) + D100 复核 | ~1h |

### 实施模式 per Family

每张卡 TDD：
1. 读 BGA 源 `/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/<deck>/<id>_*.php`
2. 读现有 `shared/cards/<deck>/<id>_*.ts` + 历史 commit
3. 写 failing session test (`server/__tests__/<id>-session.test.ts`)
4. `pnpm exec vitest run server/__tests__/<id>-session.test.ts --project slow` 确认 fail
5. 改实现（卡内闭环，不动主路径）
6. 测试 pass
7. commit `fix(7b2): <CARD_ID> <one-line>`

### 设计约束（同 7a）

- 卡逻辑闭环
- 不改主路径（pay.ts / improvement.ts / game-session.ts）
- 测试默认 2 人游戏
- 如某卡发现需要新基建（hook / SE / 协议层），**defer**到 7c 并记录

---

## 5. Testing Strategy

### 5.1 Per-card session test
每张 fix 卡补 1 个 session test 文件覆盖关键 case：
- C135：onBuy 1/2/3/4 wood by remaining rounds + sharedScoring scoring 阶段
- B89/B117/E83 等：harvest / phase 触发 case
- B39/B50：on-board sheep（pasture/stable）vs reserve sheep 双 case
- B15：实际 collect wood 数 → max=n+1，free fence 计数
- C140：minor-improvement 替换为 bake-bread + isDoable 覆盖
- C27：minor-improvement action 上建 Joinery
- C52：non-pig-market space 的 boar gain 触发
- C63：多 grain field 选 zone 的 SE flow
- C80：plow / field-card improvement 双触发（若不 simplify）
- C94：anytime stables cost = 1 wood + 1 food（或登记 §2.5 测试 normal cost）
- D127：or-flow 多分支选取 + canBePlayed 仅 owner rooms 最少时
- E73：multi-stack field 全收 + 主 harvest 不重复收
- E148：onBuy choice + opponent trigger receive node
- E83：reorg fallback case

### 5.2 跨卡 regression
跑 `pnpm test:slow` 全量，确认 fix 不破坏其他 listener。

### 5.3 Lint / Build
fast + slow + lint + build 全绿（A4 baseline 当前已 pass，无 baseline fail）。

---

## 6. PR Strategy

**单 PR**（仿 Sprint 7a）：所有 4 family 分支最终合到 `sprint-7b2`，一个 PR 合入 main。

合并流程（仿 7a）：
1. F1/F2/F3/F4 4 个 background agent 并行跑各自分支
2. 完成后主线程 rebase 到 `sprint-7b2` 主分支
3. 跑全套验证
4. push + 开 PR
5. 等 CI + rebase merge

---

## 7. Risks

1. **D74 已在 7b1 处理**：原 demote 列表含 D74 (banned)，但 7b1 真实迁移到 actions:['pay']。docs sync 时**不要**把 D74 demote。已从 7b2 demote 列表移除。
2. **B117/B15/C63 是 BGA banned 但我方需做**：我们 owner 决策不实现 banned 字段（A14 已登记 §2.5），所有 BGA banned 卡都正常发牌可被玩家抽到，必须按 BGA 真实行为对齐。这 3 张需要 agent 仔细读 BGA 源（不能跳过）。
3. **E148 round token reset**：E148 BGA 行为复杂（pre-placed stables on round 1 action spaces），fix 范围可能比"reset"暗示的更大，agent 调研发现工作量超 1d 时**defer**。
4. **C135 sharedScoring 降级**：若发现需要新基建（per-bonus scoring tier），**defer 7c**。

---

## 8. §2.5 Deliberate Divergence (新增登记，docs sync 时加)

无新增（A4 已确认 §2.0 aligned，B139 已 demote）。

---

## 9. Out of Scope (推 7c / 后续)

- §2.5 27 张 simplification re-audit
- C148 reorganize trigger（已在 7b1 § 7 登记 §2.5）

---

## 10. Definition of Done

- [ ] 16 张 fix 全部 commit + session test pass（含 B117/B15/C63 BGA banned 也真实现）
- [ ] 4 张 demote docs 同步（B106/B152/B133/B139 →§2.0；不 demote BGA banned 类）
- [ ] D100 复核完成（迁 §2.0 或补 fix）
- [ ] §2.5 加 A4 deliberate divergence 行
- [ ] `pnpm test:fast` + `pnpm test:slow` + `pnpm run lint` + `pnpm run build` 全绿
- [ ] master-plan §8 加 Sprint 7b2 行
- [ ] master-plan §0 ⚠/❌ residual 数字更新（50→减）
- [ ] PR 合入 main + CI 通过 + worktree 清理
