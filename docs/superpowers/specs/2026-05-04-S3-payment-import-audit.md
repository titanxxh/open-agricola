# S3 Pre-Kickoff: payment 三件套 Import Audit

- **日期：** 2026-05-04
- **范围：** `shared/actions/helpers/payment.ts` (16 export) + `pay-helpers.ts` (17 export) + `room-payment.ts` (8 export) = **41 export**
- **目的：** 识别 dead exports + 高频/低频映射，作为 ADR-0006 迁移和 S3 实施 plan 的输入
- **方法：** 全仓 grep（含测试 + index 重导出），统计每个 export 在三件套**外**的使用文件数

---

## 1. Dead exports 清理（sprint 启动第一天先做）

合计 **7 个** export 在外部使用为 0。细分两类：

### 1.1 真 dead 代码 — 直接删（2 个）

| Symbol | 位置 | 仅声明，无任何使用 |
|---|---|---|
| `PAYMENT_CHOICE_REQUIRED_ERROR` | `pay-helpers.ts:144` | `export const`，无引用 |
| `canAffordFlatCost` | `pay-helpers.ts:138` | `export const`，无引用 |

### 1.2 仅内部使用 — 去掉 `export`（5 个）

| Symbol | 位置 | 内部使用点 |
|---|---|---|
| `sortPaymentSolutions` | `payment.ts:285` | `payment.ts:706`、`pay-helpers.ts:24/602/624` |
| `RoomUnitCost` (type) | `room-payment.ts:22` | `room-payment.ts:183/211/339/375/399` |
| `RoomPaymentSelectionResult` (type) | `room-payment.ts:115` | `room-payment.ts:402` |
| `evaluateConditions` | `payment.ts:409` | `payment.ts:440/466/557/590` |
| `buildTotalRoomCost` | `room-payment.ts:338` | `room-payment.ts:377/403` |

**清理后**：三件套外部 export `41 → 34`，再开始合并到 `shared/actions/payment/`。

---

## 2. 高使用 export 映射（≥ 5 文件外部使用）

| Symbol | 外部文件数 | 映射到 ADR-0006 |
|---|---|---|
| `computeAllBuyableCombinations` | 15 | `PaymentSolver.computeOptions` 主入口 |
| `applyCostOverride` | 8 | 进 `internal/cost-modifiers`；effect 层不再直接调（cost 修饰由 PaymentSolver 内部 hook 流程触发） |
| `isComplexCost` | 7 | 保留为 `PaymentSolver` utility（与 `pickAuto` 同级别）或类型 namespace 暴露 — 实施时再定 |
| `applyTradeSideEffect` | 6 | `PaymentSolver.execute` 内部；effect 层不再调 |
| `returnCardToBoard` | 5 | `PaymentSolver.execute` 内部副作用 |
| `payTypedFlatCost` | 5 | `PaymentSolver.execute` 包装 |
| `executePaymentSolution` | 5 | `PaymentSolver.execute` 主入口 |

---

## 3. 中低使用 export（1-4 文件外部）

合计 **27 个**。处理路径分四类：

| 类别 | 数量 | 示例 | 迁移路径 |
|---|---|---|---|
| 进 `computeOptions` | 多 | `keepOnlyOptimals` / `getCheapestSolution` | 全部转 internal（`pickAuto` 替代外部"自动选" pattern） |
| 进 `canAfford` | 多 | `canPayCost` / `canPayResources` / `canAffordCost` / `canAffordTypedFlatCost` 等 6 个 | 全部转 internal；外部统一调 `PaymentSolver.canAfford` |
| 进 `execute` | 多 | `payResources` / `executeResolvedTypedFlatPayment` / `executeResolvedRoomPayment` 等 | 全部转 internal；外部统一调 `PaymentSolver.execute` |
| **可疑 misclassified** | 待 plan 阶段细化 | `resolveCardCostWithModifiers` / `resolveCardPreviewCostByProvider` | "preview cost" 一族也许属于 cards / UI 域，不是付款执行域 — 留 plan 第一步细审 |

> 中低使用每个细化 → 留给 writing-plans 阶段；本 audit 不全列。

---

## 4. 风险点 / 注意事项

1. **`clearPaymentCache` 4 处使用** — 主要是测试文件 (`__tests__/`)。迁移到 `PaymentSolver` 后保留为 utility（`PaymentSolver.clearCache()` 或类似），以便测试间清理。**这是第 6 个 public**，本 audit 发现。需要更新 ADR-0006 或在契约 §2.5 注脚说明"测试 utility 不算 core public"。
2. **"preview cost" 一族** (`canAffordCardPreviewCostByProvider` / `payCardPreviewCostByProvider` / `resolveCardPreviewCostByProvider` 等) — 这些是 effect "**预览**"语义（用于 UI 显示成本），不是真付款。可能应迁出 payment 域到 cards 或 UI 域；plan 第一步细审。
3. **`canPay*` 6 个变种** (`canPayCost` / `canPayResources` / `canAffordCost` / `canAffordTypedFlatCost` / `canAffordActionPreviewCost` / `canAffordCardPreviewCostByProvider`) — 命名混乱，统一前需明确"哪个是真"。`PaymentSolver.canAfford` 收口后这 6 个全部转 internal 或删。

---

## 5. 推荐实施顺序（plan 输入）

1. **PR 1**：删 2 个真 dead + 5 个转 internal（`export` 关键字去掉）。零行为变化，只改可见性。
2. **PR 2**：写 `shared/actions/payment/types.ts`（PaymentCtx / PaymentExecuteResult / PaymentExecuteError 等）。
3. **PR 3**：写 `shared/actions/payment/solver.ts` 4 函数 + namespace export，**内部仍调旧 helpers**（共存期）。
4. **PR 4**：建 `shared/actions/payment/internal/` 子目录，把三件套的内部 helper 移入；**仍 re-export 给 effect 层**（共存期 import 不破）。
5. **PR 5–N**：effect 文件**逐个**改 import：旧 `helpers/payment` → `PaymentSolver`。每改一个跑全 slow project。
6. **PR N+1**：拆 `improvement.ts` 三文件（≤ 400 + options + pool）。
7. **PR N+2**：删 `shared/actions/helpers/payment.ts` / `pay-helpers.ts` / `room-payment.ts`（外部 import 已清零）。
8. **PR N+3**：lint rule — 禁止 effect 层 import `helpers/payment*`；禁止直接写 `options.length === 1`。
9. **PR N+4**：测试覆盖率拉到 ≥ 80%（improvement 卡牌测试）+ fuzz 守门。

---

## 6. ADR-0006 / 契约更新建议

- **ADR-0006 D5** 需补一条："测试 utility（如 `clearCache`）不算 core public，但允许从 `PaymentSolver` namespace 暴露"
- **契约 §2.2** export 上限需要确认："5 个（3 core + pickAuto + 类型 namespace）" 是否含 `clearCache`？建议**含**，DoD 改为 "≤ 6 个"；或不含（保持 ≤ 5），把 `clearCache` 列为"测试 only utility"

—— 留 plan 阶段或本 audit 之后立即修订 ADR / 契约。
