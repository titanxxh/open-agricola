# Sprint 7b2 — Audit Cleanup Design

**Date**: 2026-05-02
**Worktree**: `.worktree/sprint-7b2` (branch `sprint-7b2`)
**Sprint scope**: 7b 中 scope 的 audit cleanup 子项（与 7b1 协议层升级解耦）

---

## 1. Goals

1. **完成 14 张 audit ⚠/❌ 漏修真 fix**（Sprint 7 audit 暴露的 61 张中，未在 Sprint 7a 处理的 audit-real-bug）
2. **同步 7 项 docs**（6 张 demote + 1 张复核）
3. master-plan §0 ⚠/❌ 残留数字归零（除 §2.5 deliberate）

**Non-goal**：
- A4 game-core auto-resolve UX divergence（现状 4/4 测试 pass，与 BGA "always confirm" 仅 UX 差异，登记 §2.5 不修，不在 7b2 scope）
- §2.5 27 张 simplification re-audit（独立 sprint）
- 7b1 协议层升级（独立 sprint）

---

## 2. Architecture

无新基建。所有 14 张 fix 落在已有扩展点（onBuy / harvest exchange / computeBonusScore / cardStates / futureMeeples / `'after'` listener）。

---

## 3. Cards Scope

### 3.1 真 fix (14 张)

| Card | Audit Tag | 偏差摘要（来自 sprint-7-audit-report） | 估算 |
| --- | --- | --- | --- |
| **C135 Constable** | ❌ P0 | 缺 onBuy +1 wood；sharedScoring 降级 | 0.5d |
| B139 ForestScientist | ⚠ P1 | onBuy 类似 B106 (onBuy 截断) | 0.5d |
| B39 Loom | ⚠ P1 | harvest sheep→wood/food 数值差 | 0.5d |
| B50 ButterChurn | ⚠ P1 | exchange parity | 0.5d |
| B89 Groom | ⚠ P1 | 4 sheep 触发 timing | 1d |
| C140 PackagingArtist | ⚠ P1 | 漏 reward / log | 0.5d |
| C27 Blueprint | ⚠ P1 | 选 minor flow | 0.5d |
| C52 HuntsmansHat | ⚠ P1 | 触发 timing | 0.5d |
| C80 RockyTerrain | ⚠ P1 | farm topology | 0.5d |
| C94 StableCleaner | ⚠ P1 | flag-card flow | 0.5d |
| D127 HardworkingMan | ⚠ P1 | onBuy 1 occupation 数值 | 0.5d |
| E148 Lazybones | ⚠ P1 | round token 重置 | 1d |
| E73 Scythe | ⚠ P1 | harvest grain bonus | 1d |
| E83 ShepherdsWhistle | ⚠ P1 | sheep keeper trigger | 0.5d |

合计 ~7.5 day。每张实施 agent 自己 BGA + 现有 ts 调研（仿 Sprint 7a family agent 模式）。

### 3.2 Demote (6 张, docs only)

| Card | 当前 | 目标 §  | 理由 |
| --- | --- | --- | --- |
| B117 Informant | ⚠ stub 35 行 | §2.5 (banned) | BGA `banned=true`，行为偏差不会触发 |
| B15 CarpentersBench | ⚠ stub | §2.5 (banned) | 同上 |
| C63 CraftBrewery | ⚠ verify-only OK (Sprint 7a) | §2.5 (banned) | 同上 |
| B106 MoralCrusader | ⚠ verify-only OK (Sprint 7a) | §2.0 (aligned) | 7a 已确认行为对齐，audit 误报 |
| B152 JuniorArtist | ⚠ Sprint 5 mech-A 已 jumpLeaf | §2.0 (aligned) | 同上 |
| B133 VillagePeasant | ⚠ commit b064d2df 已 fix | §2.0 (aligned) | 04-29 已修，audit 未追上 |

### 3.3 复核 (1 张)

| Card | 现状 | 复核内容 |
| --- | --- | --- |
| D100 LordoftheManor | commit 1ecf951e 已迁 computeBonusScore | 跑现有 session test + 对照 BGA 行为，确认是否 §2.0 aligned 还是仍需补 fix |

---

## 4. Implementation: 4 Family Agents

仿 Sprint 7a 模式：每 family agent 一个独立分支 + worktree 并行实施。

| Family | Agent | 分支 | 卡列表 | 估算 |
| --- | --- | --- | --- | --- |
| **F1** | P0 + B-deck (5) | sprint-7b2-f1 | C135 / B139 / B39 / B50 / B89 | ~3d |
| **F2** | C-deck (5) | sprint-7b2-f2 | C140 / C27 / C52 / C80 / C94 | ~3d |
| **F3** | D + E-deck (4) | sprint-7b2-f3 | D127 / E148 / E73 / E83 | ~2d |
| **F4** | docs + 复核 (7 项) | sprint-7b2-f4 | demote 6 张 + D100 复核 | ~1-2h |

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
- C135：onBuy +1 wood / sharedScoring scoring 阶段
- B139/B89/E83 等 harvest 卡：harvest 触发 case
- C27 Blueprint：选 minor flow case
- C80 RockyTerrain：farm topology case
- E148 Lazybones：round token reset case

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
2. **E148 round token reset**：E148 BGA 行为复杂（pre-placed stables on round 1 action spaces），fix 范围可能比"reset"暗示的更大，agent 调研发现工作量超 1d 时**defer**。
3. **C135 sharedScoring 降级**：若发现需要新基建（per-bonus scoring tier），**defer 7c**。

---

## 8. §2.5 Deliberate Divergence (新增登记，docs sync 时加)

| 项目 | BGA | 我们 | 理由 |
| --- | --- | --- | --- |
| **A4 Baseboards auto-resolve UX** | options=1 时 BGA 仍弹 confirm prompt | game-core auto-resolve（options=1 跳过 prompt；options=0 short-circuit 到 confirmNextPlayer） | UX 优化，玩家最优策略下行为等价（cancel single option ≈ noop = 不放 worker） |

---

## 9. Out of Scope (推 7c / 后续)

- A4 game-core auto-resolve UX 严格对齐 BGA （登记 §2.5 不修）
- §2.5 27 张 simplification re-audit
- C148 reorganize trigger（已在 7b1 § 7 登记 §2.5）

---

## 10. Definition of Done

- [ ] 14 张 fix 全部 commit + session test pass
- [ ] 6 张 demote docs 同步（B117/B15/C63 →§2.5；B106/B152/B133 →§2.0）
- [ ] D100 复核完成（迁 §2.0 或补 fix）
- [ ] §2.5 加 A4 deliberate divergence 行
- [ ] `pnpm test:fast` + `pnpm test:slow` + `pnpm run lint` + `pnpm run build` 全绿
- [ ] master-plan §8 加 Sprint 7b2 行
- [ ] master-plan §0 ⚠/❌ residual 数字更新（50→减）
- [ ] PR 合入 main + CI 通过 + worktree 清理
