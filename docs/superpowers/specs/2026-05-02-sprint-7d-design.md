# Sprint 7d — §2.3 Promoted Fix Design

**Date**: 2026-05-02
**Worktree**: `.worktree/sprint-7d` (branch `sprint-7d`)
**Sprint scope**: Sprint 7c re-audit promoted §2.5 → §2.3 的 5 张卡 + Sprint 7b2 复核 promoted D100 = **6 张真 fix**

---

## 1. Goals

1. 6 张 §2.3 backlog 卡真 fix（card-by-card TDD）
2. master-plan §0 ⚠/❌ residual 进一步归零
3. `prerequisite` 字段双模 bug 顺手扫描（D21 类问题：label-only 缺 `registerPrerequisite` 注册）

**Non-goal**：
- 7b1 协议层升级
- 7b2 audit cleanup
- 7c §2.5 keep 16 张

---

## 2. Architecture

无新基建。所有 6 张 fix 落在已有扩展点（onBuy / scoring / pending reorg / prereq 注册 / pay-resources）。

**顺手扫描**：grep 全局所有 `prerequisite: '<string>'` 卡，对照是否有 `registerPrerequisite` 注册（非空白名单）。漏注册的列入 §2.3 跟进 backlog（不在 7d scope 内 fix）。

---

## 3. Cards Scope (6 张)

| Card | 来源 | 真实偏差（基于 7c audit-report / 7b2 F4 D100 verdict） | Fix scope | 估算 |
| --- | --- | --- | --- | --- |
| **D21 Recruitment** | 7c promote | `prerequisite: 'No People Left in the House'` 仅 label，没 `registerPrerequisite` 注册 → prereq 失效，玩家任何状态都可打 | 注册 prereq handler（player.workersAvailable === 0 / familySize == placedFarmers） | 0.2d (~5 LOC) |
| **D100 LordoftheManor** | 7b2 F4 复核 | `standardCategories` 7 项缺 'stables'，desc 明示 "The bonus point is also awarded for 4 fenced stables." | 加 'stables' 到白名单 + 验证 fenced stables ≥4 触发 bonus | 0.2d (~5 LOC + 1 test) |
| **A10 WoodenShed** | 7c promote | 见 7c audit-report § A10 详情（agent 实施时读） | 见 audit-report fix 草图 | 0.5d (~30-50 LOC) |
| **B104 SheepWalker** | 7c promote | 见 7c audit-report § B104 详情：reorg pending exchange + last-harvest 强制 | reorg pending listener + harvest forcing | 0.7d |
| **C51 FishingNet** | 7c promote | pay→gain best-effort 不阻止对手 fishing；multi-player 真规则 bypass | 改 pay 路径让对手 transfer 完整覆盖 BGA `transferOrLose` 语义 | 1d |
| **C125 Nightworker** | 7c promote | BGA banned 但我方需做；free gain vs worker placement 行为差大 | 按 BGA `actChooseDay/Night` flow 实现真 worker placement | 1.5d (含 SE choose) |

合计 ~4 day 真 fix + 0.5d prereq 扫描 = **~4.5 day**。

详细 BGA 行为见 `docs/sprint-7c-audit-report.md`（agent 实施时读）。

---

## 4. Implementation: 1 Family Agent

数量小（6 张），不需要拆 family。**1 agent 顺序跑 6 张** + 顺手做 prereq 扫描。

### 实施模式

每张卡：
1. 读 BGA `/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/<deck>/<id>_*.php`
2. 读现有 `shared/cards/<deck>/<id>_*.ts` + `docs/sprint-7c-audit-report.md` 对应 section
3. 写 failing session test (`server/__tests__/<id>-session.test.ts`)
4. `pnpm exec vitest run server/__tests__/<id>-session.test.ts --project slow` 确认 fail
5. 改实现（卡内闭环优先；如需新基建，登记 §2.5）
6. 测试 pass
7. commit per card

### 顺手扫描 prereq 双模

`grep -rn "prerequisite: '" shared/cards/ | grep -v "registerPrerequisite"` 找出 label-only 卡 → 对照 BGA 是否真有 prereq → 如有问题，列入新 §2.3 backlog（不在 7d scope 内 fix）。

---

## 5. Testing Strategy

### Per-card session test
每张 fix 卡 1 个测试文件覆盖关键 case（具体 case 由 agent 按 BGA 行为定）。

### 跨卡 regression
跑 `pnpm test:slow` 全量，确认 fix 不破坏其他 listener。

### Prereq 扫描结果
独立 docs commit 加 §2.3 跟进 backlog 行（如发现）。

---

## 6. PR Strategy

**单 PR**（6 张 + 顺手扫描）。

合并流程：
1. 1 background agent 跑完 6 张 + 扫描
2. 主线程 rebase 到 main
3. 跑全套验证
4. push + 开 PR
5. 等 CI + rebase merge

---

## 7. Risks

1. **C125 BGA banned**：6 张里唯一 BGA banned 的，按 owner rule 仍要做（SE choose Day/Night flow 较复杂）；如发现需新 hook（`computeReplacePlaceFarmer` 等），登记 §2.5
2. **C51 multi-player transfer**：BGA `transferOrLose` 语义涉及对手 force-transfer 食物，需要看现有 player→player resource 转移基建是否够（grep `transferResource` 类）
3. **B104 SheepWalker** harvest forcing：last-harvest 强制 reorg 可能跟现有 harvest pending 冲突
4. **prereq 扫描结果**：可能找出 5-10 个漏注册卡 → 不在 7d 内做（避免 scope creep）

---

## 8. §2.5 Deliberate Divergence (新增登记)

无（暂无）。

---

## 9. Out of Scope

- 7b1 / 7b2 / 7c 已处理的卡
- prereq 扫描发现的新 backlog（独立 sprint 跟进）

---

## 10. Definition of Done

- [ ] 6 张 fix 全部 commit + session test pass
- [ ] prereq 扫描结果 commit（如有 backlog 加到 §2.3）
- [ ] `pnpm test:fast` + `pnpm test:slow` + `pnpm run lint` + `pnpm run build` 全绿
- [ ] master-plan §8 加 Sprint 7d 行
- [ ] master-plan §0 ⚠/❌ residual 数字更新
- [ ] PR 合入 main + CI 通过
