# Sprint S7 Design: 测试回归 + S6 已知遗留清理

**Goal**：解 `docs/skip-tracker.md` 仅余的 2 个 active skip（B104 behavior-regression + E70 private-field-access）；清理 S6b 期间 codemod 留下的 cards-impl `export { X }` re-export 桥（影响 ~85 个 callers + 825 cards-impl 文件）；手工实跑一次 S6c 添加但未跑过的 Playwright workshop smoke。

**驱动目标**：S6 收尾后留下的 3 类清理工作整合成一个 sprint，让 main 上"测试 / 物理边界 / e2e"全部达成稳定终态。S7 完成后，`skip-tracker.md` 应清空，cards-impl 文件应回归"只 _impl + 反向 import display"的 spec §2.2 规范。

---

## §0 范围决策

S7 实际范围（**不是**原 ENGINE_NEW_ARCHITECTURE.md §15 描述的"卡牌效果测试回归 + 走完所有 skip"——绝大部分 skip 已被 S7-shape-codemod 解决；只剩 2 项 active）：

| 类别 | 项 | 工作量 |
|------|----|------|
| **A. 测试回归** | A1 B104 SheepWalker behavior-regression；A2 E70 CropRotationField private-field-access | ~0.5–1 day |
| **B. cards re-export 桥清理** | 重定向 ~85 callers + 删 825 cards-impl 文件的 `export { X }` 桥 | ~0.5 day |
| **D. e2e smoke 实跑** | 启动 dev server + 跑 `e2e-tests/workshop-smoke.spec.ts` | ~1h |

**不在 S7**：
- **C. major ESLint 豁免决策**（S6 已知遗留 #2）—— 单独写 ADR，不走 sprint 流程
- **E. 4 张 deferred 卡的 7b 路线**（C6 / C146 / E123 多选 / C148 reorg-only）—— 各需独立基建，每张单独 brainstorm 排期
- **E149 fence-segment placement**（长尾 deliberate divergence）—— 等 fence 系统重写
- **A14 banned 卡机制 / 5 张 BeforeEndOfGame 卡** —— 已 deliberate divergence

**总估算**：~1.5–2 day。

---

## §1 Batch 切分

S7 单 sprint，4 个 batch 串行 push（每 batch 独立 commit 链 + push + 等 CI 全绿才进下一个）。

```
Batch 1: A1 — B104 SheepWalker 诊断 + 修复（最高风险，先做）
Batch 2: A2 — E70 CropRotationField 测试 rewrite
Batch 3: B  — cards re-export 桥清理 codemod
Batch 4: D  — e2e workshop-smoke 实跑
```

batch 之间无强依赖，但顺序选择"高风险先"——A1 可能挖出引擎深层问题，先做让发现问题时还有时间调整 sprint 范围。

---

## §2 Batch 1: B104 SheepWalker 修复

### §2.1 问题诊断（已知）

S7-shape-codemod 期间 implementer 已做了一轮诊断，记录在 `docs/skip-tracker.md`：

> shape codemod applied; underlying bug: B104 `enforceReorganizeOnLastHarvest` no longer surfaces an animal-reorg request after feed-phase confirm in round 14. Engine's `runEngineSteps` reaches `step.type === 'choice'` but the choice branch (`shared/session/session-core.ts:2278`) does not pivot into `startReorganizeSubFlow`, so the harvest ends in `stateId: 'idle'` instead of `'wait'`. Regression introduced somewhere between original B104 implementation and the S2 pending→interaction migration.

测试位置：`server/__tests__/B104_SheepWalker-session.test.ts`，描述："forces animalReorg in last harvest even when no breeding occurs (single sheep)"。

### §2.2 修复策略（开工后决定，3 选 1）

诊断时确认根因后从中选一：

- **方案 X（修引擎路径）**：`session-core.ts:2278` choice 分支补 pivot 逻辑——当 step 的 emitted choice request kind 是 `animal-reorg` 时，转去 `startReorganizeSubFlow`。**适用条件**：根因确实是 generic engine path 缺失；其他 animal-reorg emit 的卡可能也受影响。**风险**：scope 蔓延，要跑 full slow project 验证连锁修复。
- **方案 Y（修 B104 listener）**：改 B104 emit 当前引擎已处理的 request kind（如 plain `choice` with reorg-encoded options），让 b104 自己 host 一个 `InteractionNode`。**适用条件**：B104 是唯一受影响卡；engine pivot 缺失是 by-design。**风险**：可能跟其他卡的 reorg 触发重复 logic。
- **方案 Z（测试本身已过期）**：检查 BGA 真实行为；如果 BGA 也不再 enforce reorg 就调整测试预期 / demote 到 §2.5 deliberate divergence。**适用条件**：诊断发现规则本身改了。

### §2.3 Batch 1 流程

1. unskip B104 测试 + 跑单测——看 actual vs expected 差异
2. 引擎 instrumentation（用 `superpowers:systematic-debugging` skill）：在 `runEngineSteps` choice 分支打 log，确认 emit 的 request kind 与触发栈
3. 决定 X/Y/Z
4. 实施修复
5. **跑 full slow project**（确认没引入连锁回归）
6. 更新 `docs/skip-tracker.md`：B104 entry 从 Active → Resolved，标注修复方案
7. commit + push + 等 CI 全绿

### §2.4 Batch 1 DoD

- ✅ B104 测试 unskip 后通过
- ✅ skip-tracker 更新（Active 1 个还剩 E70）
- ✅ `pnpm test:fast` + `pnpm test:slow` 全绿
- ✅ GitHub Actions 全绿

---

## §3 Batch 2: E70 CropRotationField 测试 rewrite

### §3.1 问题

`server/__tests__/E70_CropRotationField-session.test.ts` 中 1 个 it：`"fromSelectedFields rejects committing a different extra sow field"`。

测试当前 mutate 私有 `session.pending` / `session.activeSpaceId` 字段——Task 10 后这两个字段变成 getter-only，测试无法直接 set。

### §3.2 修复策略

**Public API rewrite**：通过 `session.takeAction` 驱动到 sow 选择 state，调 `session.commitFarmChoice`（或测试目标的实际 method）传入"不同的 sow field"，断言 `resp.ok === false` + 合理 error 信息。

不需要主路径改动；只改测试。

### §3.3 Batch 2 DoD

- ✅ E70 unskip 后通过
- ✅ skip-tracker.md Active 清零（B104 + E70 都 Resolved）
- ✅ test:fast / slow 全绿
- ✅ GitHub Actions 全绿

---

## §4 Batch 3: cards re-export 桥清理

### §4.1 当前状态（S6b 残留）

S6b 的 codemod wet-run 后，825 个 `shared/cards/<deck>/<file>.ts` 文件被 perl -i 改成：

```typescript
// codemod 输出（B30_WoodPalisades.ts 示例）
import { B30_WoodPalisades } from '../../cards-display/B/B30_WoodPalisades'
// （perl -i 加的 re-export 桥）
export { B30_WoodPalisades }

const CARD_ID = B30_WoodPalisades.id

export const B30_WoodPalisades_impl = { ... }
```

加 `export { X }` 桥的两个原因：
1. 解 codemod 残留的 TS6133 unused import
2. 让 ~85 个 legacy callers 仍能从 `shared/cards/<deck>/<file>` 导入 display const

### §4.2 清理两步

**Step 1**: 重定向 callers 到 cards-display

需要 codemod（不是纯 sed），因为同一文件可能同时 import display + impl：

```typescript
// Before（一行同时 import display 和 _impl）
import { A1_Shelter, A1_Shelter_impl } from '../../shared/cards/A/A1_Shelter'

// After（拆成两行，display 重定向）
import { A1_Shelter } from '../../shared/cards-display/A/A1_Shelter'
import { A1_Shelter_impl } from '../../shared/cards/A/A1_Shelter'
```

写 `scripts/codemod-cards-display-redirect.ts`（TS Compiler API，类似 S6b codemod 模式）：
- Walk all `.ts` files under `server/__tests__/`、`shared/cards/__tests__/`、`shared/`、`client/`、`tests/`、`scripts/`
- 找 `from '.../shared/cards/<deck>/<file>'` 的 import 语句
- 检查 imported binding：
  - 仅 display const（无 `_impl` 后缀）→ 整条 import 路径改为 cards-display
  - 仅 `_impl` 后缀 → import 路径不变
  - 混合两种 → 拆成两条 import 语句
- 输出报告 + 写回文件（dry-run / wet-run 模式）

预估 scope：~85 文件 + ~150 import 语句。

**Step 2**: 删除 825 cards-impl 文件的 re-export 桥

在 Step 1 完成 + 全量测试通过后：
- grep 确认没有任何 caller 还依赖 cards-impl 导出 display const（即 step 1 codemod 全部 caller 都已重定向）
- perl -i 删除每个 cards-impl 文件的 `export { <DisplayName> }` 行
- 跑 tsc：可能复活 TS6133（codemod 留的 `import { X }` 没用过）—— 需对应处理：
  - 如果 `_impl` 引用了 X.id 即 CARD_ID，不会 unused；
  - 如果 X 真没用，删除 import 行。

### §4.3 Batch 3 DoD

- ✅ `scripts/codemod-cards-display-redirect.ts` 创建并通过 unit tests（fixture-based）
- ✅ 所有 callers (server/__tests__、shared/cards/__tests__、其他) 重定向到 cards-display；grep `from '.../shared/cards/[A-E]/'` 仅余 `_impl` import
- ✅ 825 cards-impl 文件无 `export { X }` 桥
- ✅ tsc app + server / lint / test:fast / test:slow / build / check:bundle-size 全绿
- ✅ GitHub Actions 全绿

---

## §5 Batch 4: e2e workshop-smoke 实跑

### §5.1 步骤

1. 启动 dev server：`./restart-intranet.sh` 或分别 `pnpm run server` (5175) + `pnpm run dev` (5173)
2. 等服务起来：`curl http://localhost:5175/api/health` 应返回 200，`http://localhost:5173/` 应返回 HTML
3. 跑 `pnpm exec playwright test e2e-tests/workshop-smoke.spec.ts`
4. 验证：测试通过 / sandbox lazy chunk 实际 download / workshop UI 实际 render

### §5.2 是否纳入 CI

**决策：不纳入 CI**——理由：
- 单 e2e smoke 不值得新建 `.github/workflows/e2e.yml` workflow（需要 ubuntu container 启 dev server + Playwright browsers cache）
- CI 时间 + 复杂度增加换来 1 个 smoke 测试覆盖率，性价比低
- 真正需要 e2e CI 时另起 sprint 做完整的 e2e workflow

只手工跑一次；记录"通过"在 S7 closeout 文档。

### §5.3 Batch 4 DoD

- ✅ Workshop smoke 在本地通过
- ✅ S6 已知遗留 #3 标记为 resolved（在 ENGINE_NEW_ARCHITECTURE.md §15 中）

---

## §6 整体 DoD

- ✅ `docs/skip-tracker.md` Active skip 数 2 → 0（B104 + E70 全部 Resolved）
- ✅ `shared/cards/<deck>/<file>.ts` 825 文件无 `export { X }` re-export 桥
- ✅ 所有 callers 直接 import cards-display 取 display const
- ✅ e2e workshop-smoke 手工跑过通过
- ✅ `pnpm test:fast` + `pnpm test:slow` + `tsc app+server` + `pnpm run lint` + `pnpm run build` + `pnpm run check:bundle-size` 全绿
- ✅ 所有 4 batch 推到 main 后 GitHub Actions（CI / Deploy Backend / Deploy Frontend）全绿
- ✅ `docs/ENGINE_NEW_ARCHITECTURE.md` §15 加 S7 收口段；"已知遗留（S7 之前需要决定）" 子段标记 #1 + #3 已闭环（#2 单独写 ADR）

---

## §7 风险与缓解

1. **B104 修复 scope 蔓延**：方案 X（修引擎）可能影响多张 reorg 卡。**缓解**：实施前后跑 full `pnpm test:slow`；如果 fail 数 > 2 则评估 sprint 范围扩张 vs 退到方案 Y。

2. **cards-impl unused import 复活**：删 `export { X }` 桥后 codemod 留的 `import { X } from '../../cards-display/...'` 可能 unused。**缓解**：codemod 完成后跑 tsc，对每个 unused import 逐个处理（删除 OR 确认确实被 `_impl` 内部使用）。

3. **e2e dev server 启动失败**：本地环境差异（端口占用 / Node 版本）。**缓解**：按 CLAUDE.md 用 Node 22 + `./restart-intranet.sh`；如端口占用 kill 后重试。

---

## §8 文档同步

S7 完成后更新：
- `docs/ENGINE_NEW_ARCHITECTURE.md` §15：加 Sprint S7 收口段；进度行 L18 加 `S7 ✅（2026-05-XX）`
- `docs/ENGINE_NEW_ARCHITECTURE.md` §15 已知遗留段：标记 #1 + #3 闭环；保留 #2 等 ADR
- `docs/master-plan.md` §8：加 S7 行
- `docs/skip-tracker.md`：B104 + E70 移到 Resolved；Active 表清空
