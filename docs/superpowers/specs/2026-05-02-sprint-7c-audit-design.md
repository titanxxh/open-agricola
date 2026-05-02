# Sprint 7c — §2.5 Simplification Re-audit Design

**Date**: 2026-05-02
**Worktree**: `.worktree/sprint-7c-audit` (branch `sprint-7c-audit`)
**Sprint scope**: 复审 Sprint 7 audit 标记的 27 张 §2.5 "刻意简化" 卡，确认是否真值得简化（vs 升级到 §2.3 真 fix / 或确认 §2.0 aligned）。**audit-only sprint**，无代码改动。

---

## 1. Goals

1. 27 张 §2.5 simplification 每张深度 BGA + 我方 ts 对比
2. 输出每张 verdict：**§2.0 aligned** / **§2.5 deliberate divergence (keep)** / **§2.3 真 fix backlog**
3. 把 verdict 同步到 `docs/card_progress.md` § 2.0 / 2.3 / 2.5
4. 若有大量真 fix 候选（≥5 张），spawn Sprint 7d/7e 跟进

**Non-goal**：
- 不改实现代码（audit-only）
- BGA banned 卡的"我方需做"决策已在 7b 决议（不论 banned 都做）

---

## 2. Background

Sprint 7 audit 把 130 张"simplification" deep-audit 后分为：
- 29 ✅ → §2.0
- 27 🟡 → §2.5 (本 sprint 复审目标)
- 50 ⚠ + 11 ❌ → Sprint 7a backlog (大部分已修)
- 14 stale-list 清理

但 audit-report wide-scan 列**已被发现至少 1 处错误**（B139 标 onBuy 实际是 onReturnHome）。这意味着 §2.5 27 张 simplification 的"理由"列也可能有 wide-scan 错误，需要 deep verify。

---

## 3. 27 张 §2.5 Simplification 列表

来源：`docs/card_progress.md` §2.5 "Sprint 7 audit-classified simplifications" 子节（从 §2.5 标题"42 张" - 13 历史 - 2 c1c16 = 27 张）。

| Card | 当前 simplification reason |
| --- | --- |
| B27_Toolbox | 对手回合触发路径未建模 |
| B33_Mantlepiece | renovation-block 简化 |
| B38_FutureBuildingSite | borderline — agent 标 "actually aligned" |
| C117_Legworker | computeArgs UI hint 未实现 |
| C120_AgriculturalLabourer | exchange-grain conversion + grain-multiplier 简化 |
| C125_Nightworker | BGA banned (但我方需做) |
| C154_TwinResearcher | copse-add + 'hollow' 排除 |
| C22_BasketChair | 同回合 replay guard + JobContract 假人简化 |
| C24_BedintheGrainField | BGA decline bonus FG，我方 auto-fire |
| C25_SteamMachine | adoptive worker forceSkip 省略 |
| C3_CarriageTrip | BGA banned (但我方需做) |
| C42_RavenousHunger | place-farmer 不限定 accumulation spaces |
| C51_FishingNet | 对手 "must have food" 前置 / transfer best-effort |
| C67_MineralFeeder | reorganize-then-grain prompt 省略 |
| C69_LandConsolidation | TinsmithMaster / CowPatty overlap guard 省略 |
| C72_FestivalPlanning | PRIVATE_FIELD_PHASE 未传 / reap optional |
| C8_PlantFertilizer | WOOD/STONE crop fields 未建模 |
| C93_InnerDistrictsDirector | stone 来自无限通用 supply |
| D101_SugarBaker | "1 food bonus 留下"省略 |
| D115_FodderPlanter | silent-kill 取决于 harvestBreedSummary |
| D21_Underground | BGA banned (但我方需做) |
| D36_BreedRegistry | Hut/StableShed cards-sheep 简化 |
| E112_GrainThief | mid-reap mutation 平衡 |
| E78_SleightofHand | multi-pick 拆 4 次 1:1 |
| (3 张待确认) | 完整 27 张以 §2.5 子节为准 |

---

## 4. Implementation: 1 Audit Agent

**单 agent 跑全部 27 张 deep-dive**（仿 7b2 17 卡 agent 模式）：

每张卡：
1. 读 BGA `/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/<deck>/<id>_*.php`
2. 读现有 `shared/cards/<deck>/<id>_*.ts`
3. 验证 simplification reason 是否真存在（identify wide-scan 错误）
4. 决定 verdict：
   - **§2.0 aligned**：实际已对齐 BGA 或行为等价（玩家最优策略数学等同）
   - **§2.5 keep**：simplification 真存在 + 真值得简化（ROI 太低 / 罕见 corner case / 等价）
   - **§2.3 真 fix**：真存在 + 应该升级到真 fix backlog（影响游戏体验 / 频繁路径）
5. 给每张 verdict 1-2 行理由

**输出**：

1. `docs/sprint-7c-audit-report.md` — 27 卡完整 verdict 表格
2. 同步 `docs/card_progress.md`：
   - §2.5 表格保留（移除 demote 到 §2.0 / 升级 §2.3 的卡）
   - §2.0 加 demote 卡
   - §2.3 加升级到 backlog 的卡（spawn Sprint 7d/7e）

---

## 5. Definition of Done

- [ ] 27 张全部 verdict 输出
- [ ] `sprint-7c-audit-report.md` 提交
- [ ] `docs/card_progress.md` §2.0 / §2.3 / §2.5 同步
- [ ] master-plan §8 加 Sprint 7c 行
- [ ] 若 ≥5 张升级到 §2.3 真 fix → spawn Sprint 7d spec stub

---

## 6. Risks

1. **Wide-scan 错误**：simplification reason 可能写错（B139 类问题）。Audit agent 必须 source-verify，不能信原文。
2. **Banned 卡的 verdict**：C125/C3/D21 (BGA banned 但我方需做) 应该跟普通卡一样 deep-dive，不因 banned 自动 keep。
3. **数学等价 vs 真 simplification**：玩家最优策略数学等同的（如 E78 multi-pick→4×1:1）应 §2.0；真有玩家选择空间被剥夺的应 §2.3。
