# Sprint 7e — Prereq Dual-Mode Registration

**Date**: 2026-05-03
**Worktree**: `.worktree/sprint-7e` (branch `sprint-7e`)
**Sprint scope**: 41 张卡 `prerequisite` label-only 缺 `registerPrerequisite` 注册 → silently 视为通过的 bug 集中修。来源：Sprint 7d prereq 双模扫描。

---

## 1. Goals

1. 41 张候选卡 prereq handler 注册（仿 D21 commit `5121f1c3` 模式）
2. 每张配 1 session test 验证 gating（资源不满足 → blocked / 满足 → allowed）
3. 5 张 BGA 也是 label-only 的卡确认免修（A44/B49/D25/D42/E46）

**Non-goal**：
- 不改 prereq-registry 主路径
- 不重构 `meetsCardPrerequisites` generic-parser
- 不改卡牌其他 effect 行为

---

## 2. Architecture

无新基建。复用现有 `registerPrerequisite(label, predicate)` 模式（D21 案例参考）。

```ts
// shared/cards/<deck>/<id>_*.ts 加：
import { registerPrerequisite } from '../prerequisite-registry'
registerPrerequisite('<exact label string>', (player, state) => /* gating logic */)
```

**关键约束**：label string 必须与 BGA `prerequisite` 字段对齐（grep BGA 源 `$this->prerequisite`）+ 必须与 BGA `isBuyable()` / `canBePlayed()` 实际语义对齐（不只是 desc 文本）。

---

## 3. 41 张候选 + 5 张免修

### 3.1 真需注册（41 张）

来源：`docs/card_progress.md` § 2.3 "2026-05-02 Sprint 7d prereq 双模扫描" 段。

| Deck | 张数 | 卡列表 |
| --- | --- | --- |
| **A** | 13 | A13/A20/A22/A27/A30/A33/A36/A3/A40/A46/A52/A57/A68 |
| **B** | 11 | B14/B22/B23/B31/B33/B38/B45/B51/B52/B74 |
| **C** | 2 | C20/C81 |
| **D** | 5 | D1/D22/D47/D48 |
| **E** | 10 | E1/E21/E2/E30/E3/E41/E42/E43/E71 |

每张实施 agent 自己读 BGA `<id>_*.php` `isBuyable()` / `canBePlayed()` 推 prereq predicate。

### 3.2 免修 5 张（BGA 也是 label-only）

A44 PondHut / B49 Scales / D25 WitchesDanceFloor / D42 EducationBonus / E46 WaterlilyPond — agent 验证后在 docs §2.0 changelog 加注。

---

## 4. Implementation: 单 agent / 4 deck-family 并行

41 张 simple repetitive，**单 agent 顺序跑足够**（~1.5-2h）。如要并行可拆 4 family（A 13 / B 11 / C+D 7 / E 10）= 4 worktree 各 ~30-45 min。

### 实施模式 per card

1. 读 BGA `/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/<deck>/<id>_*.php` 找 `prerequisite` 字段 + `isBuyable()` / `canBePlayed()` 实现
2. 读现有 `shared/cards/<deck>/<id>_*.ts` 看现 prereq label
3. 写 failing session test：try buy with prereq unmet → expect block / with met → expect allowed
4. `pnpm exec vitest run server/__tests__/<id>-session.test.ts --project slow` 确认 fail
5. 加 `registerPrerequisite(label, predicate)` 到卡文件
6. 测试 pass
7. commit per card：`fix(7e): register <label> prereq for <CARD_ID>`

### 5 张免修验证

每张读 BGA 源确认无 isBuyable/canBePlayed → 在 `docs/card_progress.md` § 2.0 changelog 加一行 "BGA 也 label-only 免修"。1 commit 全部。

---

## 5. Testing Strategy

### Per-card session test

每张 1 个测试文件 1-2 case：
- prereq unmet → `session.takeAction(...)` 期望 fail / pending != choice
- prereq met → 期望 normal flow

### 跨卡 regression

跑 `pnpm test:slow` 全量验证不破坏其他 listener。

### Lint / Build

fast + slow + lint + build 全绿。

---

## 6. PR Strategy

**单 PR**（41 张 + docs sync），1 个 family agent 跑完后 push。

合并流程：
1. agent 跑完
2. 主线程 fetch + rebase main
3. 跑全套 verify
4. push + 开 PR
5. 等 CI + rebase merge

---

## 7. Risks

1. **某些卡 prereq 实际复杂**：BGA `isBuyable` 可能引用 game state 多处（如 A33 BigCountry "All Farmyard Spaces Used"），predicate 需调多个 helper。如 ≥30 LOC → keep 但记 §2.5。
2. **Label string 跨语言**：BGA label 可能含 i18n marker；我方应用纯英文常量（与现有 D21 一致）。
3. **A22 Telegram extraPlacement** 已在 §2.5 deliberate divergence — 检查是否 prereq 仍要注册。
4. **Predicate 跟 generic-parser 冲突**：现有 `meetsCardPrerequisites` 可能已有一些 generic patterns（如"X Occupations"），别注册重复。

---

## 8. Definition of Done

- [ ] 41 张全部 commit + session test pass
- [ ] 5 张免修 docs commit
- [ ] `pnpm test:fast` + `pnpm test:slow` + `pnpm run lint` + `pnpm run build` 全绿
- [ ] master-plan §8 加 Sprint 7e 行
- [ ] PR 合入 main + CI 通过
