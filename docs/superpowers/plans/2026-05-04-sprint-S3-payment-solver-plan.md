# Sprint S3 — PaymentSolver 收口 + Improvement 瘦身实施 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `shared/actions/helpers/{payment,pay-helpers,room-payment}.ts`（合计 1974 行 / 41 export）合并为 `shared/actions/payment/` 单深 module，对外仅 `PaymentSolver.{computeOptions,canAfford,execute,pickAuto}` 4 public（+ 类型 namespace + 测试 utility 共 ≤ 6 export）；`improvement.ts` 985 行瘦身到 ≤ 400 并拆出 `improvement-options.ts` + `improvement-pool.ts`；行为零变化。

**Architecture:** 11-task PR 链，纯重构。前 4 task 建立新结构（dead cleanup → types → solver wrapper → internal 子目录），保持旧 helpers 共存（外部 import 不破）；中段 4 task 把所有调用方切到 `PaymentSolver` namespace（improvement → 8 effect → cards/tests）；末端 3 task 拆 improvement、删旧 helpers、上 lint rule。每个 PR 独立可合，零行为漂移。两个 audit 发现（`clearPaymentCache` 5th public、preview cost 一族归属）作为 Task 3 / Task 6 启动前 grill 项内嵌。

**Tech Stack:** TypeScript 5.x、vitest（fast + slow project）、ESLint、pnpm@10。无新依赖。

---

## File structure

| File | Role |
| ---- | ---- |
| `shared/actions/helpers/payment.ts` | DELETE at Task 10（PR 10）。Task 1 仅去 `evaluateConditions` / `sortPaymentSolutions` 的 `export` 关键字。 |
| `shared/actions/helpers/pay-helpers.ts` | DELETE at Task 10。Task 1 删 `PAYMENT_CHOICE_REQUIRED_ERROR` + `canAffordFlatCost` 两个真 dead。 |
| `shared/actions/helpers/room-payment.ts` | DELETE at Task 10。Task 1 去 `RoomUnitCost` / `RoomPaymentSelectionResult` / `buildTotalRoomCost` 三个 export 关键字。 |
| `shared/actions/payment/index.ts` | NEW Task 3 — barrel：仅 re-export public（`PaymentSolver` + 类型 namespace）。 |
| `shared/actions/payment/types.ts` | NEW Task 2 — `Cost` / `Option` / `PaymentChoice` / `PaymentCtx` / `PaymentExecuteResult` / `PaymentExecuteError`。 |
| `shared/actions/payment/solver.ts` | NEW Task 3 — `PaymentSolver` namespace（4 函数）；共存期内部仍调旧 helpers。 |
| `shared/actions/payment/internal/` | NEW Task 4 — 拆出旧 helper 内部 helper；旧 `helpers/{payment,pay-helpers,room-payment}.ts` 仅保留薄 re-export 壳。 |
| `shared/actions/payment/__tests__/solver.test.ts` | NEW Task 3 — 4 public 单元测试（覆盖 D1-D6 决议）。 |
| `shared/actions/effects/improvement.ts` | MODIFY Task 6（切换到 `PaymentSolver`）+ Task 9（拆三文件，主体保留 ≤ 400）。 |
| `shared/actions/effects/improvement-options.ts` | NEW Task 9 — `parseImprovementChoice` / `buildImprovementOptions` 等候选构造。 |
| `shared/actions/effects/improvement-pool.ts` | NEW Task 9 — `listAvailableMajors` / `removeMajorFromPool` / `listMinorHand` / `removeMinorFromHand` / `canPlayMajor` / `canPlayMinor`。 |
| `shared/actions/effects/{construct,exchange,fencing,occupation,pay,plow,renovation,stables}.ts` | MODIFY Task 7 — 8 文件 import 切换，行为零变化。 |
| `shared/cards/{B/B75,C/C60,D/D27,D/D60,E/E156}_*.ts` | MODIFY Task 8 — 5 cards import 切换。 |
| `shared/actions/effects/__tests__/pay.test.ts` | MODIFY Task 8 — import 切换。 |
| `shared/actions/effects/__tests__/pay-stats-integration.test.ts` | MODIFY Task 8 — import 切换。 |
| `shared/cards/__stubs__/__tests__/bonus-choices-matrix.test.ts` | MODIFY Task 8 — import 切换。 |
| `shared/cards/__tests__/A123_FrameBuilder.test.ts` | MODIFY Task 8 — import 切换。 |
| `eslint.config.*` | MODIFY Task 11 — 新 rule：禁止 `effects/**` import `helpers/payment*`；禁止 effect 文件出现 `\.length === 1` 配 payment options。 |
| `docs/adr/0006-payment-solver-deep-module.md` | MODIFY Task 3（如 grill 决定 clearCache 进 namespace）+ Task 6（如 grill 决定 preview cost 归属）。 |
| `docs/superpowers/specs/2026-05-03-engine-redesign-S2-S4-contracts.md` | MODIFY Task 3 / Task 6 同上 |
| `docs/superpowers/specs/2026-05-03-sprint-S3-design.md` | MODIFY Task 11 — DoD 表 + §8 grilled 标记最终化 |
| `docs/ENGINE_NEW_ARCHITECTURE.md` | MODIFY Task 11 — §8 / §15 S3 状态 → 完成 |

---

## Pre-flight

- [ ] **Step 0.1: Confirm worktree baseline**

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/sprint-S3-payment-solver
git rev-parse --abbrev-ref HEAD          # → sprint-S3-payment-solver
git status                                # → clean
git fetch origin
git log --oneline origin/main..HEAD       # 列 docs commits（dca1456f / f7130cfa / 3e837076 / 653d5574 等）
```

Expected: 当前分支 `sprint-S3-payment-solver`、worktree 干净、与 origin/main 有 docs commits 差异。

- [ ] **Step 0.2: Record baseline metrics**

```bash
wc -l shared/actions/helpers/payment.ts shared/actions/helpers/pay-helpers.ts shared/actions/helpers/room-payment.ts shared/actions/effects/improvement.ts
# Expected:
#   900 shared/actions/helpers/payment.ts
#   647 shared/actions/helpers/pay-helpers.ts
#   427 shared/actions/helpers/room-payment.ts
#   985 shared/actions/effects/improvement.ts
#  2959 total

grep -c "^export" shared/actions/helpers/payment.ts shared/actions/helpers/pay-helpers.ts shared/actions/helpers/room-payment.ts
# Expected:
#   shared/actions/helpers/payment.ts:16
#   shared/actions/helpers/pay-helpers.ts:17
#   shared/actions/helpers/room-payment.ts:8
```

把上面输出复制到 `output/tmp/s3-baseline.md`（gitignored）作为 sprint 末对照。

- [ ] **Step 0.3: Verify "强制 green" subset is currently green**

```bash
pnpm test:fast
```

Expected: PASS, exit 0. **若失败立即停止，先修 main，再启 S3。**

- [ ] **Step 0.4: Verify slow project baseline**

```bash
pnpm test:slow 2>&1 | tail -20
```

Expected: 254 个 session 测试全绿（或至少与 origin/main 同状态）。把 PASS/FAIL 数量记到 baseline。

- [ ] **Step 0.5: Verify lint baseline**

```bash
pnpm run lint 2>&1 | tail -5
```

Expected: exit 0；warning 数量与 main 一致（~1170 个 pre-existing）。

---

## Task 1: Dead exports cleanup

**Goal:** 三件套外部 export `41 → 34`：删 2 真 dead，5 个去 `export` 关键字（仍内部使用）。零行为变化。

**Files:**
- Modify: `shared/actions/helpers/pay-helpers.ts`（删 `PAYMENT_CHOICE_REQUIRED_ERROR:144` + `canAffordFlatCost:138`）
- Modify: `shared/actions/helpers/payment.ts`（去 `evaluateConditions:409` + `sortPaymentSolutions:285` 的 `export`）
- Modify: `shared/actions/helpers/room-payment.ts`（去 `RoomUnitCost:22` + `RoomPaymentSelectionResult:115` + `buildTotalRoomCost:338` 的 `export`）

- [ ] **Step 1.1: Verify the 7 are truly internal-only**

```bash
for sym in PAYMENT_CHOICE_REQUIRED_ERROR canAffordFlatCost sortPaymentSolutions evaluateConditions buildTotalRoomCost RoomUnitCost RoomPaymentSelectionResult; do
  echo "=== $sym ==="
  grep -rn --include='*.ts' "[^A-Za-z0-9_]${sym}[^A-Za-z0-9_]" shared server src 2>/dev/null | grep -v "shared/actions/helpers/" || echo "(only internal)"
  echo
done
```

Expected: 每个 sym 只在 `shared/actions/helpers/` 里出现（与 audit doc §1 一致）。

- [ ] **Step 1.2: Delete the 2 truly dead exports**

In `shared/actions/helpers/pay-helpers.ts`:

```diff
-export const PAYMENT_CHOICE_REQUIRED_ERROR = 'payment choice required'
```

(Line 144 — delete the whole line, including any leading blank line if isolated.)

```diff
-export const canAffordFlatCost = (
-  player: PlayerState,
-  cost: Partial<Resource>,
-): boolean => {
-  return canPayResources(player, cost)
-}
```

(Line 138 onwards — delete the whole function definition.)

- [ ] **Step 1.3: Drop `export` keyword on the 5 internal-only**

In `shared/actions/helpers/payment.ts`:

```diff
-export const sortPaymentSolutions = (
+const sortPaymentSolutions = (
```

(Line 285)

```diff
-export const evaluateConditions = (
+const evaluateConditions = (
```

(Line 409)

In `shared/actions/helpers/room-payment.ts`:

```diff
-export type RoomUnitCost = Partial<Resource> | ComplexCost
+type RoomUnitCost = Partial<Resource> | ComplexCost
```

(Line 22)

```diff
-export type RoomPaymentSelectionResult = ActionExecutionResult | SelectedRoomPayment
+type RoomPaymentSelectionResult = ActionExecutionResult | SelectedRoomPayment
```

(Line 115)

```diff
-export const buildTotalRoomCost = (
+const buildTotalRoomCost = (
```

(Line 338)

- [ ] **Step 1.4: Run typecheck**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.server.json --noEmit
```

Expected: 0 errors. 若有错（理论不该有），定位是哪里在外部用了——audit 漏掉的——回 Step 1.1 重审。

- [ ] **Step 1.5: Run fast tests**

```bash
pnpm test:fast
```

Expected: PASS, exit 0. 0 新增 skip。

- [ ] **Step 1.6: Run slow tests**

```bash
pnpm test:slow 2>&1 | tail -5
```

Expected: 与 baseline 一致。

- [ ] **Step 1.7: Verify export count drop**

```bash
grep -c "^export" shared/actions/helpers/payment.ts shared/actions/helpers/pay-helpers.ts shared/actions/helpers/room-payment.ts
# Expected:
#   shared/actions/helpers/payment.ts:14    (was 16, -2)
#   shared/actions/helpers/pay-helpers.ts:15 (was 17, -2)
#   shared/actions/helpers/room-payment.ts:5 (was 8, -3)
# Total: 34 (was 41)
```

- [ ] **Step 1.8: Commit**

```bash
git add shared/actions/helpers/payment.ts shared/actions/helpers/pay-helpers.ts shared/actions/helpers/room-payment.ts
git commit -m "refactor(payment): drop 7 dead exports (2 deletes + 5 visibility)

Per docs/superpowers/specs/2026-05-04-S3-payment-import-audit.md §1.

Truly dead (deleted):
- PAYMENT_CHOICE_REQUIRED_ERROR (pay-helpers.ts:144)
- canAffordFlatCost (pay-helpers.ts:138)

Internal-only (export keyword removed):
- sortPaymentSolutions (payment.ts:285)
- evaluateConditions (payment.ts:409)
- RoomUnitCost / RoomPaymentSelectionResult / buildTotalRoomCost (room-payment.ts)

External export count: 41 → 34. Behavior unchanged."
```

**Task 1 DoD:**
- [ ] `pnpm test:fast` exit 0
- [ ] `pnpm test:slow` 与 baseline 一致
- [ ] `grep -c "^export" shared/actions/helpers/{payment,pay-helpers,room-payment}.ts` 合计 34

---

## Task 2: PaymentSolver types module

**Goal:** 新建 `shared/actions/payment/types.ts`，落地 ADR-0006 D1 + D6 决议（PaymentCtx 5 字段、PaymentExecuteResult discriminated union）。仅类型定义，无运行代码。

**Files:**
- Create: `shared/actions/payment/types.ts`
- Modify: `shared/actions/payment/index.ts`（barrel，re-export type）

**Reference:** ADR-0006 §"6 个子决议" D1 / D6；契约 §2.3。

- [ ] **Step 2.1: Create directory + barrel skeleton**

```bash
mkdir -p shared/actions/payment
```

Create `shared/actions/payment/index.ts`:

```ts
export type {
  Cost,
  Option,
  PaymentChoice,
  PaymentCtx,
  PaymentExecuteResult,
  PaymentExecuteError,
} from './types'
```

(`PaymentSolver` value export will be added at Task 3.)

- [ ] **Step 2.2: Create types.ts with full type set**

Create `shared/actions/payment/types.ts`:

```ts
import type { ComplexCost, GameState, Resource } from '../../game/types'
import type { CostModifierType } from '../../cards/card-modifiers'
import type { PaymentSolution } from '../helpers/payment'

/**
 * Cost spec for a payment. Accepts simple resource map or full ComplexCost
 * (with trades / bonuses / fees). hook `computeCosts` modifiers applied
 * inside PaymentSolver, not at call site.
 */
export type Cost = Partial<Resource> | ComplexCost

/**
 * One payment decomposition. Concrete shape kept compatible with current
 * `PaymentSolution` (re-exported); future field changes ride here.
 */
export type Option = PaymentSolution

/**
 * Player's selection among Option[]. Carries option index + any
 * disambiguation needed (currently just index; bonus-choice carries via
 * Option payload itself).
 */
export type PaymentChoice = {
  optionIndex: number
}

/**
 * Call-site context. Required for hook firing + cost-modifier matching.
 * actionId + costType are required; the rest are call-site optional.
 */
export type PaymentCtx = {
  /** Action identifier (used for hook context). Pass action id of the
   *  invoking effect, e.g. 'improvement-major', 'occupation', 'fence'. */
  actionId: string
  /** CostModifier matching tag. Pass 'none' when no modifier applies. */
  costType: CostModifierType | 'none'
  /** Source card id (for major/minor improvement / occupation purchases). */
  sourceCard?: string
  /** Action space id (for trade side effect lookups). */
  spaceId?: string
  /** Played cards influencing buildable combinations. */
  playedCards?: string[]
}

/**
 * Result of `PaymentSolver.execute`. Discriminated union — invariant
 * violations still throw (programmer error); business errors return
 * Result.
 */
export type PaymentExecuteResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: PaymentExecuteError }

export type PaymentExecuteError =
  | 'invalid-choice'
  | 'cannot-afford'
  | 'unknown-option'
```

- [ ] **Step 2.3: Run typecheck**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
```

Expected: 0 errors. (Note: `PaymentSolution` still imported from old helpers —共存期；Task 4 会迁移。)

- [ ] **Step 2.4: Run fast tests**

```bash
pnpm test:fast
```

Expected: PASS, exit 0.

- [ ] **Step 2.5: Commit**

```bash
git add shared/actions/payment/index.ts shared/actions/payment/types.ts
git commit -m "refactor(payment): add types module per ADR-0006 D1/D6

Lay down PaymentCtx (5 fields, actionId/costType required), Cost / Option
/ PaymentChoice, and PaymentExecuteResult discriminated union with 3-case
reason enum (invalid-choice / cannot-afford / unknown-option).

barrel index.ts only re-exports types for now; PaymentSolver value export
arrives in Task 3.

Per docs/adr/0006-payment-solver-deep-module.md §6 D1/D6 +
docs/superpowers/specs/2026-05-03-engine-redesign-S2-S4-contracts.md §2.3."
```

**Task 2 DoD:**
- [ ] `shared/actions/payment/types.ts` 含 6 个 type export
- [ ] `shared/actions/payment/index.ts` 只 re-export type
- [ ] `pnpm test:fast` exit 0

---

## Task 3: PaymentSolver namespace skeleton (4 publics, 共存期)

**Goal:** 落地 `PaymentSolver` 4 函数（`computeOptions / canAfford / execute / pickAuto`），共存期**内部仍调旧 helpers**。新增 4 public 单元测试覆盖 D1-D6 决议。**Pre-task grill**：决定 `clearPaymentCache` 是否进 namespace（audit doc 发现 1）。

**Files:**
- Create: `shared/actions/payment/solver.ts`
- Modify: `shared/actions/payment/index.ts`（加 `PaymentSolver` value export）
- Create: `shared/actions/payment/__tests__/solver.test.ts`
- Modify (conditional): `docs/adr/0006-payment-solver-deep-module.md` D5 注脚 + 契约 §2.2

### Pre-task grill: clearCache as 5th public?

**Question (from audit doc §6):** `clearPaymentCache` is used in 4 places (mostly tests) to clear `solutionCache`. ADR-0006 lists 4 publics; clearCache is a 5th. Two paths:

- **A. PaymentSolver.clearCache** is 5th public (test utility). DoD raises export count 5 → 6. ADR-0006 D5 needs amendment.
- **B. Keep `__clearPaymentSolverCache` as separate test-only export** (with `__` prefix). ADR-0006 unchanged. DoD stays at 5.

**Recommendation:** A. clearCache is conceptually part of PaymentSolver lifecycle (its cache, its API). namespace exposure for tests is clean. ADR amendment is small.

- [ ] **Step 3.0a: Resolve grill — pick A or B**

If A: proceed with `PaymentSolver.clearCache` in solver.ts; queue ADR-0006 amendment in Step 3.6.
If B: emit `__clearPaymentSolverCache` instead; skip ADR-0006 amendment.

**Plan body assumes A.** If B is chosen, replace `clearCache` with `__clearPaymentSolverCache` in steps below.

- [ ] **Step 3.1: Write the failing test (TDD)**

Create `shared/actions/payment/__tests__/solver.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { PaymentSolver } from '../index'
import type { PaymentCtx } from '../index'
import type { GameState, PlayerState } from '../../../game/types'

const makePlayerWithResources = (res: Partial<Record<string, number>>): PlayerState => {
  // Minimal mock; fields beyond resources irrelevant to these tests.
  return {
    id: 'p1',
    resources: res,
    minorHand: [],
    cardStates: {},
    activeModifiers: [],
    // ... fill with project-standard defaults; use existing test fixture if present
  } as unknown as PlayerState
}

const makeState = (player: PlayerState): GameState => ({
  players: [player],
  // ... defaults
} as unknown as GameState)

const ctx: PaymentCtx = { actionId: 'test-action', costType: 'none' }

describe('PaymentSolver', () => {
  beforeEach(() => {
    PaymentSolver.clearCache()
  })

  describe('computeOptions', () => {
    it('returns empty array when player cannot afford simple cost', () => {
      const state = makeState(makePlayerWithResources({ wood: 0 }))
      const options = PaymentSolver.computeOptions(state, 0, { wood: 3 }, ctx)
      expect(options).toEqual([])
    })

    it('returns one option for affordable simple cost', () => {
      const state = makeState(makePlayerWithResources({ wood: 5 }))
      const options = PaymentSolver.computeOptions(state, 0, { wood: 3 }, ctx)
      expect(options.length).toBe(1)
    })
  })

  describe('canAfford', () => {
    it('returns false when player cannot afford', () => {
      const state = makeState(makePlayerWithResources({ wood: 0 }))
      expect(PaymentSolver.canAfford(state, 0, { wood: 3 }, ctx)).toBe(false)
    })

    it('returns true when player can afford', () => {
      const state = makeState(makePlayerWithResources({ wood: 5 }))
      expect(PaymentSolver.canAfford(state, 0, { wood: 3 }, ctx)).toBe(true)
    })
  })

  describe('execute', () => {
    it('returns ok:true with deducted state on valid choice', () => {
      const state = makeState(makePlayerWithResources({ wood: 5 }))
      const options = PaymentSolver.computeOptions(state, 0, { wood: 3 }, ctx)
      const result = PaymentSolver.execute(state, 0, { wood: 3 }, { optionIndex: 0 }, ctx)
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.state.players[0].resources.wood).toBe(2)
      }
    })

    it('returns ok:false reason:invalid-choice for out-of-range index', () => {
      const state = makeState(makePlayerWithResources({ wood: 5 }))
      const result = PaymentSolver.execute(state, 0, { wood: 3 }, { optionIndex: 99 }, ctx)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('invalid-choice')
      }
    })

    it('returns ok:false reason:cannot-afford when state can no longer pay', () => {
      const state = makeState(makePlayerWithResources({ wood: 0 }))
      const result = PaymentSolver.execute(state, 0, { wood: 3 }, { optionIndex: 0 }, ctx)
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('cannot-afford')
      }
    })
  })

  describe('pickAuto', () => {
    it('returns the single option when length === 1', () => {
      const state = makeState(makePlayerWithResources({ wood: 5 }))
      const options = PaymentSolver.computeOptions(state, 0, { wood: 3 }, ctx)
      const auto = PaymentSolver.pickAuto(options)
      expect(auto).toBe(options[0])
    })

    it('returns undefined when length === 0', () => {
      expect(PaymentSolver.pickAuto([])).toBeUndefined()
    })

    // Note: length > 1 case requires ComplexCost setup — covered in
    // integration suite once PaymentSolver internals replace old helpers.
  })

  describe('clearCache', () => {
    it('exists and is callable', () => {
      expect(() => PaymentSolver.clearCache()).not.toThrow()
    })
  })
})
```

- [ ] **Step 3.2: Run test to verify it fails**

```bash
pnpm exec vitest run shared/actions/payment/__tests__/solver.test.ts
```

Expected: FAIL — `PaymentSolver` not exported from `../index`.

- [ ] **Step 3.3: Implement solver.ts (共存期 wrapper)**

Create `shared/actions/payment/solver.ts`:

```ts
import type { GameState } from '../../game/types'
import type {
  Cost,
  Option,
  PaymentChoice,
  PaymentCtx,
  PaymentExecuteResult,
} from './types'
import {
  computeAllBuyableCombinations,
  canPayCost,
  isComplexCost,
  canPayResources,
  executePaymentSolution,
  clearPaymentCache,
} from '../helpers/payment'
import { resolvePaymentSolutionSelection } from '../helpers/pay-helpers'

const computeOptions = (
  state: GameState,
  idx: number,
  cost: Cost,
  ctx: PaymentCtx,
): Option[] => {
  const player = state.players[idx]
  if (!player) return []
  const costTypeArg = ctx.costType === 'none' ? undefined : ctx.costType
  if (!isComplexCost(cost)) {
    return canPayResources(player, cost as Partial<Record<string, number>>)
      ? [{ resourcesPaid: cost, /* minimal stub matching PaymentSolution shape */ } as Option]
      : []
  }
  return computeAllBuyableCombinations(
    player,
    cost,
    ctx.playedCards,
    costTypeArg,
  )
}

const canAfford = (
  state: GameState,
  idx: number,
  cost: Cost,
  ctx: PaymentCtx,
): boolean => {
  const player = state.players[idx]
  if (!player) return false
  if (!isComplexCost(cost)) {
    return canPayResources(player, cost as Partial<Record<string, number>>)
  }
  // ComplexCost path — relies on solutionCache hit when computeOptions called next.
  const costTypeArg = ctx.costType === 'none' ? undefined : ctx.costType
  return canPayCost(player, cost, costTypeArg)
}

const execute = (
  state: GameState,
  idx: number,
  cost: Cost,
  choice: PaymentChoice,
  ctx: PaymentCtx,
): PaymentExecuteResult => {
  const options = computeOptions(state, idx, cost, ctx)
  if (options.length === 0) {
    return { ok: false, reason: 'cannot-afford' }
  }
  if (choice.optionIndex < 0 || choice.optionIndex >= options.length) {
    return { ok: false, reason: 'invalid-choice' }
  }
  const selected = options[choice.optionIndex]
  if (!selected) {
    return { ok: false, reason: 'unknown-option' }
  }
  // Apply the selected solution. Mutating clone vs in-place is wrapped by
  // the legacy helper; preserve that behaviour for now.
  const player = state.players[idx]
  if (!player) {
    return { ok: false, reason: 'cannot-afford' }
  }
  executePaymentSolution(player, selected)
  return { ok: true, state }
}

const pickAuto = (options: Option[]): Option | undefined => {
  return options.length === 1 ? options[0] : undefined
}

const clearCache = (): void => {
  clearPaymentCache()
}

export const PaymentSolver = {
  computeOptions,
  canAfford,
  execute,
  pickAuto,
  clearCache,
} as const
```

> **Note:** This is the **共存期** wrapper — internals still call `helpers/{payment,pay-helpers}` directly. Task 4 moves implementations into `payment/internal/`. Task 5 onwards switches callers.

- [ ] **Step 3.4: Update barrel to export PaymentSolver value**

In `shared/actions/payment/index.ts`:

```diff
+export { PaymentSolver } from './solver'
 export type {
   Cost,
   Option,
   PaymentChoice,
   PaymentCtx,
   PaymentExecuteResult,
   PaymentExecuteError,
 } from './types'
```

- [ ] **Step 3.5: Run test to verify it passes**

```bash
pnpm exec vitest run shared/actions/payment/__tests__/solver.test.ts
```

Expected: PASS, all assertions green.

- [ ] **Step 3.6 (conditional, only if grill chose A): Update ADR-0006 + 契约**

In `docs/adr/0006-payment-solver-deep-module.md` D5 section, append:

```markdown
**Test utility note (audit-discovered 2026-05-04):** `clearCache` is exposed as a 5th member of the `PaymentSolver` namespace, used primarily by tests to reset `solutionCache` between cases. It does not count as a "core public" in the §2.2 红线 sense (行动层付款入口仍是 4 个：computeOptions / canAfford / execute / pickAuto), but is part of the namespace surface. Total `PaymentSolver` namespace members: 5.
```

In `docs/superpowers/specs/2026-05-03-engine-redesign-S2-S4-contracts.md` §2.2, after "// 一个 utility（2026-05-04 grilled）" block add:

```markdown
// 一个测试 utility（2026-05-04 audit）
PaymentSolver.clearCache(): void
//   清空 solutionCache，主要用于测试间 reset；非"行动层付款入口"。
```

In `docs/superpowers/specs/2026-05-03-sprint-S3-design.md` §4 DoD table row "对外 export ≤ 5 个" change to:

```markdown
| `shared/actions/payment/` 模块对外 export ≤ 6 个（4 core + clearCache + 类型 namespace） | grep `^export` |
```

- [ ] **Step 3.7: Run fast tests + full slow project**

```bash
pnpm test:fast
pnpm test:slow 2>&1 | tail -5
```

Expected: PASS for fast; slow matches baseline.

- [ ] **Step 3.8: Commit**

```bash
git add shared/actions/payment/solver.ts shared/actions/payment/index.ts shared/actions/payment/__tests__/solver.test.ts
# If 3.6 ran, also:
git add docs/adr/0006-payment-solver-deep-module.md docs/superpowers/specs/2026-05-03-engine-redesign-S2-S4-contracts.md docs/superpowers/specs/2026-05-03-sprint-S3-design.md
git commit -m "refactor(payment): add PaymentSolver namespace (4 publics + clearCache)

ADR-0006 D2/D5/D6 landed: namespace object export style; pickAuto as 4th
public; PaymentExecuteResult discriminated union with 3-case reason enum.

Coexistence period: PaymentSolver internals still delegate to legacy
helpers/{payment,pay-helpers}.ts. Task 4 moves implementations into
payment/internal/; Tasks 5-8 switch all callers.

Audit finding 1 resolved: clearCache exposed as 5th namespace member
(test utility). ADR-0006 D5 + contracts §2.2 amended; S3 spec DoD
export ceiling raised 5 → 6.

Tests: 4 publics + clearCache covered by
shared/actions/payment/__tests__/solver.test.ts."
```

**Task 3 DoD:**
- [ ] `pnpm exec vitest run shared/actions/payment/__tests__/solver.test.ts` PASS
- [ ] `pnpm test:fast` exit 0
- [ ] `pnpm test:slow` matches baseline
- [ ] `PaymentSolver.{computeOptions,canAfford,execute,pickAuto,clearCache}` all callable

---

## Task 4: Move internals into payment/internal/

**Goal:** 把旧 `helpers/{payment,pay-helpers,room-payment}.ts` 的内部 helper 物理迁入 `shared/actions/payment/internal/`；旧 helper 文件保留为薄 re-export 壳（外部 callers 仍能 import 不破）。`PaymentSolver` 内部从 `internal/` import，不再经过旧 helper。

**Files:**
- Create: `shared/actions/payment/internal/enumerate.ts` (主体来自 `payment.ts:508-712` 的 `computeAllBuyableCombinations` + `keepOnlyOptimals` + `sortPaymentSolutions`)
- Create: `shared/actions/payment/internal/affordability.ts` (主体来自 `payment.ts:140-175` 的 `payResources` + `canPayResources` + `canPayCost`)
- Create: `shared/actions/payment/internal/cost-modifiers.ts` (主体来自 `payment.ts:153-160 + 285-450` 的 `applyCostOverride` + `applyCostModifiers` + `evaluateConditions` + `getModifiersForCostType`)
- Create: `shared/actions/payment/internal/execute.ts` (主体来自 `payment.ts:775-895` 的 `applyTradeSideEffect` + `executePaymentSolution` + `returnCardToBoard` + `getCheapestSolution`)
- Create: `shared/actions/payment/internal/cache.ts` (主体来自 `payment.ts` 的 `solutionCache` + `clearPaymentCache` + `makeCacheKey`)
- Create: `shared/actions/payment/internal/types.ts` (主体来自 `payment.ts` 的 `PaymentSolution` 等内部 type)
- Create: `shared/actions/payment/internal/hook-context.ts` (主体来自 `pay-helpers.ts` 的 `buildCardCostListenerContext` 等 hook 触发胶水)
- Create: `shared/actions/payment/internal/preview-cost.ts` (主体来自 `pay-helpers.ts` 的 `resolveCardCostWithModifiers` + `canAffordCardPreviewCostByProvider` 等 preview 一族)
- Create: `shared/actions/payment/internal/typed-flat.ts` (主体来自 `pay-helpers.ts` 的 `payTypedFlatCost` + `executeResolvedTypedFlatPayment` 等)
- Create: `shared/actions/payment/internal/payment-choice-result.ts` (主体来自 `pay-helpers.ts` 的 `buildPaymentChoiceResult` + `resolvePaymentSolutionSelection`)
- Create: `shared/actions/payment/internal/room-payment.ts` (主体来自 `room-payment.ts` 全文)
- Modify: `shared/actions/helpers/payment.ts` → 薄 re-export 壳
- Modify: `shared/actions/helpers/pay-helpers.ts` → 薄 re-export 壳
- Modify: `shared/actions/helpers/room-payment.ts` → 薄 re-export 壳
- Modify: `shared/actions/payment/solver.ts` → import 路径改到 `internal/`

> **Note:** 这一 task 单 PR 文件触及面大但**纯搬迁**，git history 用 `git mv` 等价的逻辑（实际是 cp + delete，因为分文件拆分）。

- [ ] **Step 4.1: Build internal directory mapping**

```bash
mkdir -p shared/actions/payment/internal
```

Create initial `shared/actions/payment/internal/index.ts` (barrel for internal use):

```ts
// Internal-only barrel. NOT re-exported from package index.
export * from './enumerate'
export * from './affordability'
export * from './cost-modifiers'
export * from './execute'
export * from './cache'
export * from './hook-context'
export * from './preview-cost'
export * from './typed-flat'
export * from './payment-choice-result'
export * from './room-payment'
export * from './types'
```

- [ ] **Step 4.2: Create internal/types.ts**

Move from `shared/actions/helpers/payment.ts` the type definitions for `PaymentSolution`, `InternalSolution`, `Bonus` (whichever are defined locally and used across the helpers). Use:

```bash
grep -n "^export type\|^type " shared/actions/helpers/payment.ts
```

Identify each type → cut/paste into `shared/actions/payment/internal/types.ts`. Add header:

```ts
// Internal types for payment solver. Not part of public API
// (Cost / Option / PaymentChoice / PaymentCtx live in ../types.ts).

import type { Resource } from '../../../game/types'

// ... pasted types
```

- [ ] **Step 4.3: Create internal/cache.ts**

```bash
grep -n "solutionCache\|makeCacheKey\|clearPaymentCache" shared/actions/helpers/payment.ts
```

Move these into `shared/actions/payment/internal/cache.ts`:

```ts
// Module-level solution cache. Per ADR-0006 D5: shared across sessions
// (cache key includes player resources, no cross-session leak).

import type { PaymentSolution } from './types'
import type { CostModifierType } from '../../../cards/card-modifiers'
import type { ComplexCost, PlayerState, Resource } from '../../../game/types'

export const solutionCache = new Map<string, PaymentSolution[]>()

export const makeCacheKey = (
  player: PlayerState,
  cost: ComplexCost,
  costType?: CostModifierType,
  playedCards?: string[],
): string => {
  // ... pasted implementation
}

export const clearPaymentCache = (): void => {
  solutionCache.clear()
}
```

- [ ] **Step 4.4: Create internal/affordability.ts**

Move `payResources`, `canPayResources`, `applyCostOverride`, `isComplexCost`, `canPayCost` from `shared/actions/helpers/payment.ts`.

```ts
// Affordability primitives. Used by PaymentSolver.canAfford fast-path
// and by internal enumeration.

import type { Resource, PlayerState, ComplexCost } from '../../../game/types'
import type { CostModifierType } from '../../../cards/card-modifiers'

export const isComplexCost = (cost: unknown): cost is ComplexCost => {
  // ... pasted
}

export const canPayResources = (
  player: PlayerState,
  cost: Partial<Resource>,
): boolean => {
  // ... pasted
}

export const payResources = (
  player: PlayerState,
  cost: Partial<Resource>,
): void => {
  // ... pasted
}

export const applyCostOverride = (
  cost: ComplexCost,
  override: Partial<Resource>,
): ComplexCost => {
  // ... pasted
}

export const canPayCost = (
  player: PlayerState,
  cost: ComplexCost | Partial<Resource>,
  costType?: CostModifierType,
): boolean => {
  // ... pasted (calls computeAllBuyableCombinations from enumerate)
}
```

- [ ] **Step 4.5: Create internal/cost-modifiers.ts**

Move `applyCostModifiers`, `evaluateConditions`, `getModifiersForCostType`, `validateBonus` from `payment.ts`. Same pattern.

- [ ] **Step 4.6: Create internal/enumerate.ts**

Move `computeAllBuyableCombinations`, `keepOnlyOptimals`, `sortPaymentSolutions`, `generateTradeCombinations` (the heavy enumeration core).

- [ ] **Step 4.7: Create internal/execute.ts**

Move `executePaymentSolution`, `applyTradeSideEffect`, `returnCardToBoard`, `getCheapestSolution`, `buildBonusReductions`.

- [ ] **Step 4.8: Create internal/hook-context.ts + internal/preview-cost.ts + internal/typed-flat.ts + internal/payment-choice-result.ts**

Cut `pay-helpers.ts` content into 4 files by responsibility:

- `hook-context.ts` ← `buildCardCostListenerContext` + 周边 hook firing helpers
- `preview-cost.ts` ← `resolveCardCostWithModifiers`, `canAffordCardPreviewCostByProvider`, `payCardPreviewCostByProvider`, `resolveCardPreviewCostByProvider`, `canAffordActionPreviewCost`, `resolveActionPreviewCost`
- `typed-flat.ts` ← `payTypedFlatCost`, `payTypedFlatCostDetailed`, `canAffordTypedFlatCost`, `executeResolvedTypedFlatPayment`, `resolveTypedFlatPaymentSelection`, `canAffordCost`, `canAffordFlatCost`-equivalent (already deleted)
- `payment-choice-result.ts` ← `buildPaymentChoiceResult`, `resolvePaymentSolutionSelection`, `resolveCostPaymentSelection`

- [ ] **Step 4.9: Create internal/room-payment.ts**

Move whole `shared/actions/helpers/room-payment.ts` content (8 export + internal helpers) here. Imports update to `../../game/types` etc.

- [ ] **Step 4.10: Convert old helpers to thin re-export shims**

Replace `shared/actions/helpers/payment.ts` content with:

```ts
/**
 * @deprecated Will be deleted at Task 10.
 * Re-export shim during S3 coexistence period.
 * New callers should import from '../../actions/payment' instead.
 */
export {
  payResources,
  canPayResources,
  applyCostOverride,
  isComplexCost,
  canPayCost,
  applyCostModifiers,
  getModifiersForCostType,
  computeAllBuyableCombinations,
  keepOnlyOptimals,
  applyTradeSideEffect,
  executePaymentSolution,
  returnCardToBoard,
  getCheapestSolution,
  clearPaymentCache,
} from '../payment/internal'
export type { PaymentSolution } from '../payment/internal'
```

(Adjust list to match exactly the public surface that **external callers** still use — see audit doc §2 + §3.)

Replace `shared/actions/helpers/pay-helpers.ts`:

```ts
/**
 * @deprecated Will be deleted at Task 10.
 */
export {
  buildPaymentChoiceResult,
  resolvePaymentSolutionSelection,
  resolveCostPaymentSelection,
  payTypedFlatCost,
  payTypedFlatCostDetailed,
  canAffordTypedFlatCost,
  executeResolvedTypedFlatPayment,
  resolveTypedFlatPaymentSelection,
  resolveCardCostWithModifiers,
  canAffordCardPreviewCostByProvider,
  payCardPreviewCostByProvider,
  resolveCardPreviewCostByProvider,
  canAffordActionPreviewCost,
  resolveActionPreviewCost,
  canAffordCost,
} from '../payment/internal'
```

Replace `shared/actions/helpers/room-payment.ts`:

```ts
/**
 * @deprecated Will be deleted at Task 10.
 */
export {
  buildRoomCostPerUnit,
  getBuildRoomCost,
  getMaxBuildableRooms,
  executeResolvedRoomPayment,
  resolveRoomPaymentSelection,
} from '../payment/internal'
```

- [ ] **Step 4.11: Update solver.ts to import from internal/**

In `shared/actions/payment/solver.ts`:

```diff
-import {
-  computeAllBuyableCombinations,
-  canPayCost,
-  isComplexCost,
-  canPayResources,
-  executePaymentSolution,
-  clearPaymentCache,
-} from '../helpers/payment'
-import { resolvePaymentSolutionSelection } from '../helpers/pay-helpers'
+import {
+  computeAllBuyableCombinations,
+  canPayCost,
+  isComplexCost,
+  canPayResources,
+  executePaymentSolution,
+  clearPaymentCache,
+  resolvePaymentSolutionSelection,
+} from './internal'
```

- [ ] **Step 4.12: Run typecheck**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.server.json --noEmit
```

Expected: 0 errors. Any error means a missing re-export in the shim or a missed move — fix until clean.

- [ ] **Step 4.13: Run fast + slow tests**

```bash
pnpm test:fast
pnpm test:slow 2>&1 | tail -5
```

Expected: matches baseline. **Behavior unchanged** is the bar.

- [ ] **Step 4.14: Run lint**

```bash
pnpm run lint 2>&1 | tail -5
```

Expected: exit 0. Warning count should match baseline within ± 2 (re-export adjustments may add a tiny number).

- [ ] **Step 4.15: Commit**

```bash
git add shared/actions/payment/internal/ shared/actions/payment/solver.ts shared/actions/helpers/payment.ts shared/actions/helpers/pay-helpers.ts shared/actions/helpers/room-payment.ts
git commit -m "refactor(payment): move internals into payment/internal/

Cut helpers/{payment,pay-helpers,room-payment}.ts into 11 internal
modules under shared/actions/payment/internal/, organised by
responsibility:

- types, cache (solutionCache + clearPaymentCache + makeCacheKey)
- affordability (canPay*, payResources, isComplexCost)
- cost-modifiers (applyCostModifiers, evaluateConditions, ...)
- enumerate (computeAllBuyableCombinations, keepOnlyOptimals, ...)
- execute (executePaymentSolution, applyTradeSideEffect, ...)
- hook-context (buildCardCostListenerContext, ...)
- preview-cost (resolveCardCostWithModifiers + 'preview' family)
- typed-flat (payTypedFlatCost + variants)
- payment-choice-result (buildPaymentChoiceResult, ...)
- room-payment (full room-payment.ts content)

Old helpers/*.ts now thin @deprecated re-export shims so external
callers (effects, cards, tests) keep working through Tasks 5-8.

PaymentSolver now imports from ./internal directly. Behavior unchanged."
```

**Task 4 DoD:**
- [ ] `shared/actions/payment/internal/` 含 ≥ 10 子文件
- [ ] `shared/actions/helpers/{payment,pay-helpers,room-payment}.ts` 全部 ≤ 50 行（仅 re-export + @deprecated 注释）
- [ ] `pnpm exec tsc` 0 errors
- [ ] `pnpm test:fast` exit 0
- [ ] `pnpm test:slow` 与 baseline 一致

---

## Task 5: Improvement test coverage uplift to ≥ 80%

**Goal:** S3 spec §5 风险表第 4 行的前置——拆 `improvement.ts` 前先把测试覆盖率拉满。这个 task 不动产代码，只补 session 测试。

**Files:**
- Modify or Create: `server/__tests__/improvement-major.session.test.ts`
- Modify or Create: `server/__tests__/improvement-minor.session.test.ts`
- Other test files in `server/__tests__/` covering improvement scenarios

- [ ] **Step 5.1: Generate coverage baseline**

```bash
pnpm exec vitest run --coverage shared/actions/effects/improvement.ts 2>&1 | tail -30
```

Record current statement / branch coverage. Target: statement ≥ 80%, branch ≥ 70%.

- [ ] **Step 5.2: Identify uncovered branches**

```bash
pnpm exec vitest run --coverage --reporter=verbose shared/actions/effects/improvement.ts 2>&1 | grep -E "improvement.ts.*[0-9]+%"
```

If coverage is already ≥ 80% statement: skip remaining steps in Task 5; commit empty marker (`docs: confirm S3 Task 5 coverage baseline already ≥80%`) and proceed to Task 6.

If below 80%: enumerate the uncovered scenarios. Common gaps:
- Major improvement when pool empty (`state.availableMajorImprovements` already filtered)
- Minor improvement when card has `mustBePlayedViaMajorImprovementAction`
- Multi-option payment requiring choice
- Cost modifier interaction (with/without `getCardModifiers`)
- Returned-card paths (`returnCardToBoard`)

- [ ] **Step 5.3: Write missing session tests**

For each uncovered scenario, write a session-level test (per CLAUDE.md test tier 2 guidance). Example structure:

```ts
import { describe, expect, it } from 'vitest'
import { GameSession } from '../../server/game-session'
// ... test helper imports

describe('improvement — pool exhaustion', () => {
  it('refuses major improvement when not in availableMajorImprovements', () => {
    const session = new GameSession(/* 2-player setup */)
    // Mutate state.availableMajorImprovements to exclude target id
    session.state.availableMajorImprovements = []
    const resp = session.takeAction(/* major improvement action */, /* args */)
    expect(resp.ok).toBe(false)
    expect(resp.error).toMatch(/not available/i)
  })
  // ... more cases
})
```

(Concrete test code: derive from existing `server/__tests__/` patterns; tests should assert on `resp.state` / `resp.pending` / `resp.log` per CLAUDE.md.)

- [ ] **Step 5.4: Re-run coverage to confirm uplift**

```bash
pnpm exec vitest run --coverage shared/actions/effects/improvement.ts 2>&1 | tail -10
```

Expected: statement ≥ 80%, branch ≥ 70%.

- [ ] **Step 5.5: Run full slow project**

```bash
pnpm test:slow 2>&1 | tail -5
```

Expected: matches baseline + new tests all PASS.

- [ ] **Step 5.6: Commit**

```bash
git add server/__tests__/improvement-*.session.test.ts
git commit -m "test(improvement): uplift coverage to ≥80% before Task 9 split

Pre-condition for Task 9 (improvement.ts → 3 files split). New session
tests cover the gaps identified by vitest coverage report:
- <list specific scenarios added>

No production code changes. Coverage: <X% → Y%>."
```

**Task 5 DoD:**
- [ ] `pnpm exec vitest run --coverage shared/actions/effects/improvement.ts` statement ≥ 80%
- [ ] `pnpm test:slow` 不增 skip
- [ ] 新加测试全部 PASS

---

## Task 6: Switch improvement.ts to PaymentSolver

**Goal:** `shared/actions/effects/improvement.ts` 全部 import `helpers/payment` / `helpers/pay-helpers` 切到 `PaymentSolver` namespace。**Pre-task grill**：决定 preview cost 一族归属（audit doc 发现 2）。

**Files:**
- Modify: `shared/actions/effects/improvement.ts`

### Pre-task grill: preview cost family

**Question (from audit doc §6):** `resolveCardCostWithModifiers` (4 ext refs), `resolveCardPreviewCostByProvider` (3 ext refs), `canAffordCardPreviewCostByProvider` (2 ext refs), `payCardPreviewCostByProvider` (1 ref) — these have "preview" semantics (UI display) and may not belong in payment-execution domain. Three options:

- **A. Keep in payment domain** (under `internal/preview-cost.ts`, expose as `PaymentSolver.computePreviewCost(...)` style wrappers). Same import pattern, namespace grows.
- **B. Move to cards/UI domain** (`shared/cards/helpers/preview-cost.ts` or `src/services/`). Decouples display from execution. But cross-bundle import risk for client.
- **C. Defer** — keep as `internal/preview-cost.ts` with no public wrapper; effect callers continue to import via deprecated `helpers/pay-helpers.ts` shim through Task 7. Decide in S4 along with `shared/domain/`.

**Recommendation:** C. Preview is read-only state derivation — natural fit for the `shared/domain/` aggregates introduced in S4. Forcing a decision now is premature.

- [ ] **Step 6.0: Resolve grill — pick A, B, or C**

If C (recommended): callers in Tasks 7-8 still import from `pay-helpers` shim for preview-cost helpers; only the **non-preview** payment APIs migrate to `PaymentSolver` in this sprint. This means the shim survives until S4 completes preview-cost migration.

If A or B: implement in this Task before continuing. A involves adding `PaymentSolver.computePreviewCost(...)` methods; B involves moving files and updating imports across cards/tests files. Both expand Task 6/7/8 scope.

**Plan body assumes C.** ADR-0006 doesn't need amendment for C; just record the decision in `docs/superpowers/specs/2026-05-04-S3-payment-import-audit.md` §4.

- [ ] **Step 6.1: Identify imports to migrate in improvement.ts**

```bash
grep -n "from.*helpers/payment\|from.*helpers/pay-helpers" shared/actions/effects/improvement.ts
```

Expected output:
```
shared/actions/effects/improvement.ts:4:import { payResources, computeAllBuyableCombinations, executePaymentSolution, returnCardToBoard, isComplexCost } from '../helpers/payment'
shared/actions/effects/improvement.ts:11:import { canAffordCost, resolveCardPreviewCostByProvider, resolvePaymentSolutionSelection, } from '../helpers/pay-helpers'
```

- [ ] **Step 6.2: Plan migration**

| Old import | New import |
|---|---|
| `payResources` | `PaymentSolver.execute` (with construction) — call sites need rework |
| `computeAllBuyableCombinations` | `PaymentSolver.computeOptions` |
| `executePaymentSolution` | `PaymentSolver.execute` |
| `returnCardToBoard` | Internal — but improvement.ts uses it directly. Keep via shim OR add internal wrapper. **Decision: leave via shim for this sprint** (not a payment-domain concern post-execute; arguably cards-domain). |
| `isComplexCost` | Stays via shim (utility, used outside `PaymentSolver`-only call sites). Or expose as `PaymentSolver.isComplexCost`. **Decision: expose as `PaymentSolver.isComplexCost`** (it's payment-domain logic). |
| `canAffordCost` | `PaymentSolver.canAfford` |
| `resolveCardPreviewCostByProvider` | **Keep via shim** (preview cost — Decision C above) |
| `resolvePaymentSolutionSelection` | Replaced by inline `PaymentSolver.execute` + `pickAuto` pattern. Detailed below. |

- [ ] **Step 6.3: Add isComplexCost to PaymentSolver namespace**

In `shared/actions/payment/solver.ts`:

```diff
 import {
   ...
+  isComplexCost,
 } from './internal'
 ...
+const isComplexCostFn = (cost: unknown): cost is ComplexCost => isComplexCost(cost)
+
 export const PaymentSolver = {
   computeOptions,
   canAfford,
   execute,
   pickAuto,
   clearCache,
+  isComplexCost: isComplexCostFn,
 } as const
```

(Or simply re-export the existing `isComplexCost` directly if no name clash.)

- [ ] **Step 6.4: Migrate improvement.ts imports — round 1 (top-level imports)**

In `shared/actions/effects/improvement.ts`, change:

```diff
-import { payResources, computeAllBuyableCombinations, executePaymentSolution, returnCardToBoard, isComplexCost } from '../helpers/payment'
+import { PaymentSolver } from '../payment'
+import type { PaymentCtx } from '../payment'
+// returnCardToBoard kept via legacy shim for this sprint
+import { returnCardToBoard } from '../helpers/payment'
```

```diff
 import {
-  canAffordCost,
+  // canAffordCost migrated to PaymentSolver.canAfford
   resolveCardPreviewCostByProvider,
-  resolvePaymentSolutionSelection,
+  // resolvePaymentSolutionSelection replaced by PaymentSolver.execute + pickAuto pattern
 } from '../helpers/pay-helpers'
```

- [ ] **Step 6.5: Migrate call sites — `computeAllBuyableCombinations` → `PaymentSolver.computeOptions`**

For each `computeAllBuyableCombinations(player, cost, playedCards, costType)` call site:

```diff
-const solutions = computeAllBuyableCombinations(player, cost, playedCards, costType)
+const ctx: PaymentCtx = {
+  actionId: '<derived from action>',  // e.g. 'improvement-major' or 'improvement-minor'
+  costType: costType ?? 'none',
+  sourceCard: improvementId,
+  playedCards,
+}
+const solutions = PaymentSolver.computeOptions(state, playerIndex, cost, ctx)
```

Three call sites in current improvement.ts (`improvement.ts:252`, `:289`, `:535`). Migrate each — be sure to derive correct `actionId` per context (major vs minor vs preview).

- [ ] **Step 6.6: Migrate `executePaymentSolution` → `PaymentSolver.execute`**

```diff
-const returnedCardId = executePaymentSolution(player, resolved.solution)
+const result = PaymentSolver.execute(state, playerIndex, cost, { optionIndex: resolved.solutionIndex }, ctx)
+if (!result.ok) {
+  return { type: 'failure', reason: `payment failed: ${result.reason}` } as ActionExecutionResult
+}
+// returnedCardId now derivable from selected option's metadata; access via solver internal
```

(Adjust `solutionIndex` derivation — if old code had a `PaymentSolution` directly, look up its index in the options array.)

- [ ] **Step 6.7: Migrate `canAffordCost` → `PaymentSolver.canAfford`**

```diff
-if (!canAffordCost(player, cost, costType)) {
+const ctx: PaymentCtx = { actionId, costType: costType ?? 'none', sourceCard: improvementId }
+if (!PaymentSolver.canAfford(state, playerIndex, cost, ctx)) {
   return failureResult
 }
```

- [ ] **Step 6.8: Replace `resolvePaymentSolutionSelection` with `pickAuto + execute` pattern**

Old (`improvement.ts:535-547` area):

```ts
const solutions = computeAllBuyableCombinations(player, cost, playedCards)
const resolved = resolvePaymentSolutionSelection(solutions, paymentChoice, prefix, includeReturnedCard, failure)
if (resolved.type !== 'selected') return resolved
const returnedCardId = executePaymentSolution(player, resolved.solution)
```

New:

```ts
const options = PaymentSolver.computeOptions(state, playerIndex, cost, ctx)
if (options.length === 0) return failure
const auto = PaymentSolver.pickAuto(options)
const choiceIndex = auto != null
  ? options.indexOf(auto)
  : (paymentChoice != null ? parsePaymentChoice(paymentChoice, prefix) : null)
if (choiceIndex == null) {
  // build choice prompt — see helpers/pay-helpers shim for buildPaymentChoiceResult
  return buildPaymentChoiceResult(options, prefix, includeReturnedCard)
}
const result = PaymentSolver.execute(state, playerIndex, cost, { optionIndex: choiceIndex }, ctx)
if (!result.ok) return failure
```

(`parsePaymentChoice` is a small local helper deriving `optionIndex` from the `${prefix}:${idx}` choice string format used by current code. If it doesn't exist, write a 4-line helper at top of `improvement.ts`.)

- [ ] **Step 6.9: Run typecheck + tests**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm test:fast
pnpm test:slow 2>&1 | tail -5
```

Expected: 0 type errors; all tests pass. **If improvement-related tests fail, do not skip — fix the migration.**

- [ ] **Step 6.10: Verify no regressions on improvement-touching cards**

```bash
pnpm exec vitest run --reporter=verbose 'shared/cards/__tests__/' 'server/__tests__/improvement' 2>&1 | tail -20
```

Expected: all PASS. New skip count: **0**.

- [ ] **Step 6.11: Commit**

```bash
git add shared/actions/effects/improvement.ts shared/actions/payment/solver.ts
git commit -m "refactor(improvement): switch to PaymentSolver namespace

improvement.ts payment-related imports migrated:
- computeAllBuyableCombinations → PaymentSolver.computeOptions
- executePaymentSolution        → PaymentSolver.execute
- canAffordCost                 → PaymentSolver.canAfford
- isComplexCost                 → PaymentSolver.isComplexCost
- resolvePaymentSolutionSelection → pickAuto + execute pattern

Also exposes isComplexCost as PaymentSolver namespace member.

Preview-cost family (resolveCardPreviewCostByProvider) kept via legacy
helpers/pay-helpers shim per audit grill decision C — defer to S4
domain aggregation. returnCardToBoard kept via shim for now (cards-
domain concern).

Behavior unchanged. All slow project tests still PASS, 0 new skips."
```

**Task 6 DoD:**
- [ ] `shared/actions/effects/improvement.ts` 不再 import `computeAllBuyableCombinations` / `executePaymentSolution` / `canAffordCost` / `resolvePaymentSolutionSelection` from `helpers/`
- [ ] `pnpm test:fast` exit 0
- [ ] `pnpm test:slow` matches baseline (0 new skips)
- [ ] All `improvement-*` tests PASS

---

## Task 7: Switch 8 effect files to PaymentSolver

**Goal:** Migrate 8 effect files: `construct.ts` / `exchange.ts` / `fencing.ts` / `occupation.ts` / `pay.ts` / `plow.ts` / `renovation.ts` / `stables.ts`. Same migration pattern as Task 6 — each file's `helpers/payment*` imports replaced with `PaymentSolver` namespace, with the same call-site rewrites.

**Files:**
- Modify: `shared/actions/effects/construct.ts`
- Modify: `shared/actions/effects/exchange.ts`
- Modify: `shared/actions/effects/fencing.ts`
- Modify: `shared/actions/effects/occupation.ts`
- Modify: `shared/actions/effects/pay.ts`
- Modify: `shared/actions/effects/plow.ts`
- Modify: `shared/actions/effects/renovation.ts`
- Modify: `shared/actions/effects/stables.ts`

> **PR strategy note:** This is a large change set. Recommended split into 2 sub-PRs:
>
> - **Task 7a (PR 7a):** small files first — `construct.ts` (166), `plow.ts` (188), `stables.ts` (186) — quick to verify; build confidence on migration mechanics
> - **Task 7b (PR 7b):** larger files — `exchange.ts` (505), `occupation.ts` (369), `pay.ts` (347), `fencing.ts` (263), `renovation.ts` (220)
>
> **Rebase main daily** during Task 7 (S1 / S2 may be merging concurrently).

### Per-file migration template

For each of the 8 files:

- [ ] **Step 7.X.1: Identify imports**

```bash
grep -n "from.*helpers/payment\|from.*helpers/pay-helpers\|from.*helpers/room-payment" shared/actions/effects/<FILE>.ts
```

- [ ] **Step 7.X.2: Migrate per Task 6 mapping table**

Apply the same mapping table from Task 6 Step 6.2:

| Old import | Target |
|---|---|
| `computeAllBuyableCombinations` | `PaymentSolver.computeOptions` |
| `canPayCost` / `canAffordCost` / `canPayResources` | `PaymentSolver.canAfford` |
| `executePaymentSolution` | `PaymentSolver.execute` |
| `payResources` | `PaymentSolver.execute` (or via internal helper if pre-execute) |
| `payTypedFlatCost` / `executeResolvedTypedFlatPayment` / `canAffordTypedFlatCost` | `PaymentSolver.execute` / `canAfford` (typed-flat is one variant of execute path) |
| `resolveCostPaymentSelection` / `resolvePaymentSolutionSelection` / `resolveTypedFlatPaymentSelection` / `resolveRoomPaymentSelection` | `pickAuto + execute` pattern |
| `applyTradeSideEffect` | Internal — keep via shim (not a public payment API) **OR** expose as wrapper if multiple effects use it. Decision: **keep via shim for sprint** (only used internally). |
| `applyCostOverride` | `PaymentSolver` doesn't expose; this is an internal cost-modifier helper. **Keep via shim**. |
| `getModifiersForCostType` | Internal helper. **Keep via shim**. |
| `buildPaymentChoiceResult` | Replace with `PaymentSolver.execute` flow producing the choice request from options. **For this sprint: keep via shim** (changing requires Task 9-style restructure). |
| `getBuildRoomCost` / `buildRoomCostPerUnit` / `getMaxBuildableRooms` | room-domain helpers. **Keep via shim** (room domain — possibly migrate in S4). |
| `executeResolvedRoomPayment` / `resolveRoomPaymentSelection` | Same — room domain. **Keep via shim**. |
| `payCardPreviewCostByProvider` / `canAffordCardPreviewCostByProvider` / `resolveCardPreviewCostByProvider` / `resolveCardCostWithModifiers` / `canAffordActionPreviewCost` / `resolveActionPreviewCost` | Preview cost — **keep via shim** per Task 6 grill decision C. |

> **Note:** Many effect files migrate only 2-3 imports to `PaymentSolver`; the rest stay on shim. **This is intentional** — the goal is to get core payment APIs (computeOptions / canAfford / execute / pickAuto) onto the new namespace. Preview-cost / room-cost / cost-modifier internals stay on shim until S4.

- [ ] **Step 7.X.3: Run targeted tests for the file's effect**

For each effect, locate the relevant test file:

```bash
grep -rln "<EffectId>\|effect.*<file-stem>" server/__tests__ shared/actions/effects/__tests__ shared/cards/__tests__
```

Run only those tests:

```bash
pnpm exec vitest run <test-files>
```

Expected: PASS.

- [ ] **Step 7.X.4: Run fast tests**

```bash
pnpm test:fast
```

Expected: exit 0.

- [ ] **Step 7.X.5: Commit per file (small commits)**

```bash
git add shared/actions/effects/<FILE>.ts
git commit -m "refactor(<effect>): switch to PaymentSolver namespace

Migrate payment imports: computeAllBuyableCombinations → computeOptions,
executePaymentSolution → execute, canAfford* → canAfford. Other helpers
(typed-flat / room-payment / preview-cost / cost-modifier internals)
remain on legacy shim — out of scope for S3 core public migration.

Behavior unchanged. Tests pass."
```

(One commit per file is fine; bisect-friendly.)

### Sub-task: Run full slow project at end of Task 7a and Task 7b

- [ ] **Step 7.A: After 7a completes (3 small files)**

```bash
pnpm test:slow 2>&1 | tail -5
```

Expected: matches baseline. **0 new skips.**

- [ ] **Step 7.B: After 7b completes (5 larger files)**

```bash
pnpm test:slow 2>&1 | tail -5
pnpm run lint 2>&1 | tail -5
```

Expected: matches baseline.

- [ ] **Step 7.C: Rebase against main**

```bash
git fetch origin
git rebase origin/main
```

If conflicts: resolve carefully. S1 / S2 may have changed engine / session / interaction code; payment files unlikely to conflict, but `effects/<file>.ts` files might.

**Task 7 DoD:**
- [ ] All 8 files have NO `import { computeAllBuyableCombinations | executePaymentSolution | canAffordCost | canPayCost | canPayResources | resolveCostPaymentSelection | resolvePaymentSolutionSelection } from 'helpers/...'`
- [ ] `pnpm test:fast` exit 0
- [ ] `pnpm test:slow` matches baseline (0 new skips)
- [ ] `pnpm run lint` exit 0

---

## Task 8: Switch cards layer + tests to PaymentSolver

**Goal:** Migrate the 5 cards files + 4 test files that import three-piece helpers.

**Files:**
- Modify: `shared/cards/B/B75_WoodWorkshop.ts`
- Modify: `shared/cards/C/C60_SmallPottersOven.ts`
- Modify: `shared/cards/D/D27_Retraining.ts`
- Modify: `shared/cards/D/D60_LargePottery.ts`
- Modify: `shared/cards/E/E156_ClaypitOwner.ts`
- Modify: `shared/actions/effects/__tests__/pay.test.ts`
- Modify: `shared/actions/effects/__tests__/pay-stats-integration.test.ts`
- Modify: `shared/cards/__stubs__/__tests__/bonus-choices-matrix.test.ts`
- Modify: `shared/cards/__tests__/A123_FrameBuilder.test.ts`

- [ ] **Step 8.1: Identify imports per file**

```bash
for f in shared/cards/B/B75_WoodWorkshop.ts shared/cards/C/C60_SmallPottersOven.ts shared/cards/D/D27_Retraining.ts shared/cards/D/D60_LargePottery.ts shared/cards/E/E156_ClaypitOwner.ts shared/actions/effects/__tests__/pay.test.ts shared/actions/effects/__tests__/pay-stats-integration.test.ts shared/cards/__stubs__/__tests__/bonus-choices-matrix.test.ts shared/cards/__tests__/A123_FrameBuilder.test.ts; do
  echo "=== $f ==="
  grep -n "from.*helpers/payment\|from.*helpers/pay-helpers\|from.*helpers/room-payment" "$f"
done
```

- [ ] **Step 8.2: Per file, apply Task 7 mapping table**

Cards typically only need 1-2 imports migrated (most call `PaymentSolver.canAfford` / `PaymentSolver.execute` only). Tests may import more for assertion purposes — for tests, `clearPaymentCache` becomes `PaymentSolver.clearCache()`.

For each test file, additionally:

```diff
-import { clearPaymentCache } from '../../helpers/payment'
+import { PaymentSolver } from '../../payment'
 // ...
-clearPaymentCache()
+PaymentSolver.clearCache()
```

- [ ] **Step 8.3: Run targeted tests**

```bash
pnpm exec vitest run shared/cards/__tests__/ shared/actions/effects/__tests__/ shared/cards/__stubs__/__tests__/
```

Expected: all PASS.

- [ ] **Step 8.4: Run fast + slow + lint**

```bash
pnpm test:fast
pnpm test:slow 2>&1 | tail -5
pnpm run lint 2>&1 | tail -5
```

Expected: matches baseline.

- [ ] **Step 8.5: Commit (bundle commits, one per area is fine)**

```bash
git add shared/cards/
git commit -m "refactor(cards): switch payment imports to PaymentSolver namespace

5 cards (B75 / C60 / D27 / D60 / E156) migrate computeAllBuyableCombinations
/ canPayCost / executePaymentSolution to PaymentSolver.{computeOptions,
canAfford, execute}. Behavior unchanged."

git add shared/actions/effects/__tests__/ shared/cards/__stubs__/__tests__/ shared/cards/__tests__/
git commit -m "test: switch payment imports to PaymentSolver namespace

4 test files migrate clearPaymentCache → PaymentSolver.clearCache and
related calls. No behavior change. All tests still PASS."
```

**Task 8 DoD:**
- [ ] No file under `shared/cards/` imports from `helpers/payment*` (excluding the deprecated shim files themselves)
- [ ] All 4 test files use `PaymentSolver` namespace
- [ ] `pnpm test:fast` exit 0
- [ ] `pnpm test:slow` matches baseline

---

## Task 9: Split improvement.ts into three files

**Goal:** Split `shared/actions/effects/improvement.ts` (currently 985 lines, post-migration ~ 950) into:

- `improvement.ts` ≤ 400 — effect entry, play-mode routing, pending choice orchestration
- `improvement-options.ts` — candidate construction (`parseImprovementChoice`, `buildImprovementOptions`, `getMinorImprovementBaseCost`, `getMinorImprovementEffectiveCost`)
- `improvement-pool.ts` — pool query + mutation (`listAvailableMajors`, `removeMajorFromPool`, `listMinorHand`, `removeMinorFromHand`, `canPlayMajor`, `canPlayMinor`, `isBlockedByMajorImprovementActionGate`)

Per ADR-0006 D4: pool stays in improvement domain; PaymentSolver MUST NOT import improvement-pool.

**Files:**
- Modify: `shared/actions/effects/improvement.ts` (delete moved content)
- Create: `shared/actions/effects/improvement-options.ts`
- Create: `shared/actions/effects/improvement-pool.ts`

- [ ] **Step 9.1: Identify candidate functions for each file**

```bash
grep -n "^const \|^function \|^export const " shared/actions/effects/improvement.ts | head -40
```

Categorize each top-level binding into: stays in `improvement.ts`, moves to `improvement-options.ts`, or moves to `improvement-pool.ts`.

| Function | Destination |
|---|---|
| `parseImprovementChoice` | `improvement-options.ts` |
| `resolveImprovementActionCardId` | `improvement.ts` (entry-level concern) |
| `isBlockedByMajorImprovementActionGate` | `improvement-pool.ts` |
| `getMinorImprovementBaseCost` | `improvement-options.ts` |
| `getMinorImprovementEffectiveCost` | `improvement-options.ts` |
| `buildImprovementLogParams` | `improvement-options.ts` |
| `buildImprovementImmediateLogs` | `improvement-options.ts` |
| `attachImprovementPayment` | `improvement.ts` (orchestration) |
| `getMajorImprovementPreviewCost` | `improvement-options.ts` |
| `getMinorImprovementPreviewCost` | `improvement-options.ts` |
| Major improvement filter on `state.availableMajorImprovements` | `improvement-pool.ts` (`removeMajorFromPool`, `canPlayMajor`) |
| Minor hand operations (`player.minorHand` filter / lookup) | `improvement-pool.ts` (`removeMinorFromHand`, `canPlayMinor`, `listMinorHand`) |
| Main effect `flow` definitions | `improvement.ts` |

- [ ] **Step 9.2: Create improvement-pool.ts**

```ts
// shared/actions/effects/improvement-pool.ts
//
// Improvement pool query + mutation helpers. NOT imported by
// shared/actions/payment/* (per ADR-0006 D4).

import type { GameState, PlayerState } from '../../game/types'
import type { ResolvedMinorImprovement } from '../../game/minor-improvements'

export const listAvailableMajors = (state: GameState): string[] =>
  [...state.availableMajorImprovements]

export const canPlayMajor = (state: GameState, id: string): boolean =>
  state.availableMajorImprovements.includes(id)

export const removeMajorFromPool = (state: GameState, id: string): void => {
  state.availableMajorImprovements = state.availableMajorImprovements.filter(
    (x) => x !== id,
  )
}

export const listMinorHand = (player: PlayerState): string[] =>
  [...player.minorHand]

export const canPlayMinor = (player: PlayerState, id: string): boolean =>
  player.minorHand.includes(id)

export const removeMinorFromHand = (player: PlayerState, id: string): void => {
  player.minorHand = player.minorHand.filter((x) => x !== id)
}

export const isBlockedByMajorImprovementActionGate = (
  improvement: ResolvedMinorImprovement,
): boolean => !!improvement.mustBePlayedViaMajorImprovementAction
```

- [ ] **Step 9.3: Create improvement-options.ts**

```ts
// shared/actions/effects/improvement-options.ts
//
// Improvement candidate construction + cost preview / log helpers.

import type { ComplexCost, PlayerState, Resource, GameState } from '../../game/types'
import type { ResolvedMinorImprovement } from '../../game/minor-improvements'
import { getMinorImprovement } from '../../game/minor-improvements'
import { majorCardDefinitions, getMajorCard } from '../../cards/major'

export type ImprovementPlayMode = 'major' | 'minor' | 'any'

export const parseImprovementChoice = (
  choice: string,
): { kind: 'major' | 'minor' | null; id: string } => {
  // ... pasted implementation from improvement.ts
}

export const getMinorImprovementBaseCost = (
  improvementId: string,
): Partial<Resource> | undefined => {
  // ... pasted
}

export const getMinorImprovementEffectiveCost = (
  player: PlayerState,
  improvement: ResolvedMinorImprovement,
): Partial<Resource> | ComplexCost => {
  // ... pasted
}

export const buildImprovementLogParams = (...): Record<string, unknown> => {
  // ... pasted
}

export const buildImprovementImmediateLogs = (...): unknown[] => {
  // ... pasted
}

export const getMajorImprovementPreviewCost = (...): Partial<Resource> | ComplexCost => {
  // ... pasted
}

export const getMinorImprovementPreviewCost = (...): Partial<Resource> | ComplexCost => {
  // ... pasted
}
```

- [ ] **Step 9.4: Update improvement.ts**

Delete the moved content. Add imports:

```ts
import {
  listAvailableMajors,
  canPlayMajor,
  removeMajorFromPool,
  listMinorHand,
  canPlayMinor,
  removeMinorFromHand,
  isBlockedByMajorImprovementActionGate,
} from './improvement-pool'
import {
  parseImprovementChoice,
  getMinorImprovementBaseCost,
  getMinorImprovementEffectiveCost,
  buildImprovementLogParams,
  buildImprovementImmediateLogs,
  getMajorImprovementPreviewCost,
  getMinorImprovementPreviewCost,
  type ImprovementPlayMode,
} from './improvement-options'
```

Replace inline call sites with imported function calls. Remove now-unused inner helpers.

- [ ] **Step 9.5: Verify size targets**

```bash
wc -l shared/actions/effects/improvement.ts shared/actions/effects/improvement-options.ts shared/actions/effects/improvement-pool.ts
```

Expected:
- `improvement.ts` ≤ 400
- `improvement-options.ts` ~ 250-350
- `improvement-pool.ts` ~ 80-150

If `improvement.ts` > 400: identify additional moveable helpers and recategorize.

- [ ] **Step 9.6: Verify ADR-0006 D4 invariant**

```bash
grep -rn "from.*improvement-pool" shared/actions/payment/
```

Expected: zero matches. **PaymentSolver MUST NOT import improvement-pool.** If any match, fix immediately.

- [ ] **Step 9.7: Run tests**

```bash
pnpm test:fast
pnpm test:slow 2>&1 | tail -5
```

Expected: matches baseline.

- [ ] **Step 9.8: Run lint**

```bash
pnpm run lint 2>&1 | tail -5
```

Expected: exit 0.

- [ ] **Step 9.9: Commit**

```bash
git add shared/actions/effects/improvement.ts shared/actions/effects/improvement-options.ts shared/actions/effects/improvement-pool.ts
git commit -m "refactor(improvement): split into 3 files per ADR-0006 D4

improvement.ts  985 → ≤400 lines (effect entry / play-mode routing /
                pending choice orchestration)
improvement-options.ts  candidate construction, cost preview, log helpers
improvement-pool.ts     pool query + mutation (canPlayMajor / removeMajor*
                        / canPlayMinor / removeMinor* / pool gate checks)

Invariant: shared/actions/payment/ does NOT import improvement-pool
(verified via grep). Pool is improvement-domain, not payment-domain."
```

**Task 9 DoD:**
- [ ] `wc -l shared/actions/effects/improvement.ts` ≤ 400
- [ ] `improvement-options.ts` + `improvement-pool.ts` exist
- [ ] `grep -rn "from.*improvement-pool" shared/actions/payment/` returns 0 matches
- [ ] `pnpm test:slow` matches baseline (0 new skips)

---

## Task 10: Delete legacy helpers

**Goal:** Delete `shared/actions/helpers/{payment,pay-helpers,room-payment}.ts` shim files. Verify zero external imports remain.

**Files:**
- Delete: `shared/actions/helpers/payment.ts`
- Delete: `shared/actions/helpers/pay-helpers.ts`
- Delete: `shared/actions/helpers/room-payment.ts`

- [ ] **Step 10.1: Verify zero external imports**

```bash
grep -rn "from.*helpers/payment'" shared server src 2>/dev/null
grep -rn "from.*helpers/pay-helpers'" shared server src 2>/dev/null
grep -rn "from.*helpers/room-payment'" shared server src 2>/dev/null
```

Expected: zero matches outside `shared/actions/helpers/` itself. **If any match, return to Task 6/7/8 and migrate the missed callers.**

- [ ] **Step 10.2: Delete the three files**

```bash
git rm shared/actions/helpers/payment.ts shared/actions/helpers/pay-helpers.ts shared/actions/helpers/room-payment.ts
```

- [ ] **Step 10.3: Run typecheck**

```bash
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.server.json --noEmit
```

Expected: 0 errors.

- [ ] **Step 10.4: Run full test + lint + build**

```bash
pnpm test:fast
pnpm test:slow 2>&1 | tail -5
pnpm run lint 2>&1 | tail -5
pnpm run build 2>&1 | tail -10
```

Expected: all PASS / exit 0.

- [ ] **Step 10.5: Verify ADR-0006 D4 + DoD metrics**

```bash
# Final export count
grep -rh "^export" shared/actions/payment/index.ts shared/actions/payment/solver.ts shared/actions/payment/types.ts | wc -l

# Should be ≤ 6 (4 PaymentSolver core + clearCache + types via barrel)

# improvement.ts size
wc -l shared/actions/effects/improvement.ts shared/actions/effects/improvement-options.ts shared/actions/effects/improvement-pool.ts

# Total combined ≤ 985 (original) ideally smaller (helpers moved to PaymentSolver mean less code in effects)
```

- [ ] **Step 10.6: Commit**

```bash
git commit -m "refactor(payment): delete legacy helpers (shim removal)

Delete shared/actions/helpers/{payment,pay-helpers,room-payment}.ts
(1974 → 0 lines). All callers now use PaymentSolver namespace
or shared/actions/payment/internal/* directly.

Final layout:
  shared/actions/payment/
  ├── index.ts        (barrel — PaymentSolver + types)
  ├── solver.ts       (~150 lines, 4 publics + clearCache + isComplexCost)
  ├── types.ts        (~50 lines, 6 type exports)
  └── internal/       (~1500 lines across 11 files, none exported)

ADR-0006 D5 + 契约 §2.5 invariant achieved: payment internals not
exposed; effect callers import only from /actions/payment barrel."
```

**Task 10 DoD:**
- [ ] `shared/actions/helpers/{payment,pay-helpers,room-payment}.ts` no longer exist
- [ ] `pnpm test:fast` / `pnpm test:slow` / `pnpm run lint` / `pnpm run build` all exit 0
- [ ] Total `shared/actions/payment/` external export count ≤ 6

---

## Task 11: Lint rule + final docs sync

**Goal:** Add ESLint rules enforcing the architectural invariants (effect layer cannot import legacy helpers; cannot use `options.length === 1` pattern with payment options). Sync sprint completion to all relevant docs.

**Files:**
- Modify: `eslint.config.js` (or `.eslintrc.cjs` / `.eslintrc.json` — check actual config)
- Modify: `docs/superpowers/specs/2026-05-03-sprint-S3-design.md` (DoD final marks + §8 grilled status)
- Modify: `docs/ENGINE_NEW_ARCHITECTURE.md` §15 S3 (status → 完成)
- Modify: `docs/master-plan.md` §8 progress row

- [ ] **Step 11.1: Locate ESLint config**

```bash
ls -la eslint.config.* .eslintrc* 2>/dev/null | head
```

- [ ] **Step 11.2: Add no-restricted-imports rule for helpers**

In ESLint config, under `rules` for `shared/actions/effects/**`:

```js
'no-restricted-imports': ['error', {
  patterns: [
    {
      group: ['*helpers/payment', '*helpers/pay-helpers', '*helpers/room-payment'],
      message: 'Use PaymentSolver namespace from shared/actions/payment instead. See ADR-0006.',
    },
  ],
}],
```

(These files no longer exist after Task 10 — but the rule prevents accidental re-introduction.)

- [ ] **Step 11.3: Add custom rule banning `options.length === 1` near `PaymentSolver` (optional, weaker)**

This is harder to express in lint (semantic check). Either:

- **A. Skip** — relies on code review to catch
- **B. Custom rule** — add ESLint custom rule in `.eslint/rules/no-payment-length-check.js`. Heavy.

**Recommended: skip (A).** The `pickAuto` utility convention is documented in ADR-0006 and contracts; code review enforces.

- [ ] **Step 11.4: Run lint**

```bash
pnpm run lint 2>&1 | tail -10
```

Expected: exit 0. Newly-added rule should not trigger any errors (since no offending imports remain).

- [ ] **Step 11.5: Update S3 spec final DoD marks**

In `docs/superpowers/specs/2026-05-03-sprint-S3-design.md` §4 DoD table, mark each row as completed (or add a "Result" column with the verified value):

```markdown
| `PaymentSolver` 是行动层付款唯一入口 | ✅ Verified at Task 10 Step 10.5 |
| `improvement.ts` 不再 import payment 三件套 | ✅ Task 6 / Task 9 |
| `improvement.ts` ≤ 400 行 | ✅ Verified at Task 9 Step 9.5 |
| `shared/actions/helpers/{payment,pay-helpers,room-payment}.ts` 不存在 | ✅ Task 10 |
| `shared/actions/payment/` 模块对外 export ≤ 6 个 (4 core + clearCache + 类型 namespace) | ✅ Task 10 Step 10.5 |
| 「强制 green 子集」全绿 | ✅ All tasks ran `pnpm test:fast` |
| 卡牌效果 session 测试零回归 | ✅ All tasks ran `pnpm test:slow` matching baseline |
```

§8 — all 6 questions already marked `[✓ grilled 2026-05-04]` from prior work; no change needed.

- [ ] **Step 11.6: Update ENGINE_NEW_ARCHITECTURE §15 S3 status**

In `docs/ENGINE_NEW_ARCHITECTURE.md` near §15 Sprint S3:

```diff
-### Sprint S3：Payment 收口 + Improvement 瘦身（**可与 S1 / S2 并行**）
+### Sprint S3：Payment 收口 + Improvement 瘦身 ✅ 完成（YYYY-MM-DD）
```

Add at end of S3 section:

```markdown
- 完成日期：YYYY-MM-DD
- Branch：`sprint-S3-payment-solver`
- 落地度量：
  - Payment helpers 1974 行 / 41 export → `shared/actions/payment/` 6 export（4 core + clearCache + types barrel）
  - `improvement.ts` 985 行 → ≤ 400 + `improvement-options.ts` + `improvement-pool.ts`
  - 0 卡牌测试新增 skip
```

- [ ] **Step 11.7: Update master-plan §8 progress row (if applicable)**

Note: `master-plan.md` uses an older sprint numbering (A1/A2/...). S3 (engine redesign) doesn't have a row there. Skip unless explicit follow-up to add.

- [ ] **Step 11.8: Run full verification suite**

```bash
pnpm test:fast
pnpm test:slow 2>&1 | tail -5
pnpm run lint 2>&1 | tail -5
pnpm run build 2>&1 | tail -10
```

Expected: all PASS / exit 0.

- [ ] **Step 11.9: Final commit**

```bash
git add eslint.config.* docs/superpowers/specs/2026-05-03-sprint-S3-design.md docs/ENGINE_NEW_ARCHITECTURE.md
git commit -m "feat(payment): finalize S3 — lint guard + docs sync

- ESLint no-restricted-imports for shared/actions/effects/** banning
  helpers/payment* (which no longer exist; rule prevents regression)
- S3 spec §4 DoD marked ✅ with verification refs
- ENGINE_NEW_ARCHITECTURE §15 S3 status → 完成 with metrics

Sprint S3 complete: PaymentSolver deep-module landed, improvement.ts
slimmed, 0 test regressions. ADR-0006 fully realized."
```

- [ ] **Step 11.10: Push + check CI**

```bash
git push origin sprint-S3-payment-solver
```

Then per CLAUDE.md "开发与提交":

```bash
gh run list --branch sprint-S3-payment-solver --limit 5
```

Watch until all runs pass. **Sprint not complete until CI green.**

- [ ] **Step 11.11: Open PR (or merge to main)**

```bash
gh pr create --title "Sprint S3: PaymentSolver deep module + improvement split" --body "$(cat <<'EOF'
## Summary
- Merge `helpers/{payment,pay-helpers,room-payment}.ts` (1974 lines / 41 exports) into `shared/actions/payment/` deep module with 4-public namespace (`PaymentSolver.{computeOptions,canAfford,execute,pickAuto}`) + `clearCache` test utility + types barrel
- Split `improvement.ts` (985 lines) into `improvement.ts` (≤400) + `improvement-options.ts` + `improvement-pool.ts`
- All callers (9 effect files + 5 cards + 4 tests) migrated to `PaymentSolver` namespace
- Behavior unchanged: 0 cards-test skip increase, all session tests match baseline

## Architecture
- Per [ADR-0006](docs/adr/0006-payment-solver-deep-module.md) — namespace object export, 6 sub-decisions (D1 PaymentCtx 5 fields, D2 pickAuto utility, D3 canAfford reuse, D4 pool boundary, D5 namespace style, D6 PaymentExecuteResult union)
- See also [contracts §2](docs/superpowers/specs/2026-05-03-engine-redesign-S2-S4-contracts.md) and [S3 spec](docs/superpowers/specs/2026-05-03-sprint-S3-design.md)

## Test plan
- [x] `pnpm test:fast` — passes
- [x] `pnpm test:slow` — matches baseline (0 new skips on 254 cards)
- [x] `pnpm run lint` — passes (new no-restricted-imports rule enforced)
- [x] `pnpm run build` — passes
- [x] CI runs all green
EOF
)"
```

**Task 11 DoD:**
- [ ] ESLint config has `no-restricted-imports` for effects → helpers/payment*
- [ ] `docs/superpowers/specs/2026-05-03-sprint-S3-design.md` §4 DoD all rows ✅
- [ ] `docs/ENGINE_NEW_ARCHITECTURE.md` §15 S3 marked 完成 with metrics
- [ ] All CI runs green on `sprint-S3-payment-solver` branch
- [ ] PR opened or merged to main

---

## Sprint-level metrics (for §8 timeline backfill)

After Task 11 push + CI green, record:

| Metric | Baseline (pre-S3) | After S3 | Δ |
|---|---|---|---|
| `shared/actions/helpers/payment.ts` lines | 900 | 0 (deleted) | -900 |
| `shared/actions/helpers/pay-helpers.ts` lines | 647 | 0 (deleted) | -647 |
| `shared/actions/helpers/room-payment.ts` lines | 427 | 0 (deleted) | -427 |
| `shared/actions/effects/improvement.ts` lines | 985 | ≤ 400 | -585+ |
| Three-piece external export count | 41 | 0 | -41 |
| New `shared/actions/payment/` external export count | 0 | ≤ 6 | +≤6 |
| Total payment-domain LOC | 1974 (helpers) | ≤ 2000 (`payment/internal/` + `solver.ts` + types) | ~ flat (logic preserved, organization improved) |
| Cards/effects skip count | (baseline N) | (baseline N + 0) | 0 |

---

## Risks & checkpoints (S3 spec §5 propagated)

| Risk (S3 spec §5) | Mitigation in this plan |
|---|---|
| 41 export 中存在隐性"非付款"工具被外部 import | Task 1 Step 1.1 grep audit; further Task 6/7 mapping table flags non-PaymentSolver helpers (preview, room, typed-flat) and keeps via shim through Task 10 |
| `room-payment.ts` 跨 effect 调用 | Task 7 keeps room helpers via shim; not promoted to PaymentSolver public |
| `computeOptions` / `canAfford` 内部计算不能完全共享 | Task 3 Step 3.3 implementation: `canAfford` for ComplexCost calls `computeOptions(...).length > 0` directly; same code path |
| `improvement.ts` 拆分时卡牌行为意外漂移 | Task 5 (coverage uplift) precondition; Task 9 commits per file split with full slow-project run |
| hook `computeCosts` phase 顺序变化 | Hook firing stays in `internal/hook-context.ts`, called from same internal call sites; no order change |
| 重构期间外部代码 import 旧 export 失败 | Tasks 4-10 keep deprecated re-export shims through Task 10. Task 10 Step 10.1 verifies zero external imports before deleting. |

**Daily checkpoint actions:**
- After every commit: `pnpm test:fast` (≤ 1 min)
- After every Task: `pnpm test:slow` + `pnpm run lint`
- Daily during Tasks 7-8: `git fetch origin && git rebase origin/main`
- Before final push: `pnpm run build`

---

## Out of scope (per S3 spec §2.2)

- `shared/cards/helpers/payment-stats.ts` (cards-domain stats helper, not payment-execution)
- Hook registration mechanism (computeCosts phase usage unchanged)
- Card hook authoring (cards untouched)
- `shared/domain/` introduction (S4)
- `shared/logic/farm/*` migration (S4)
- Physical directory restructure (S6)
- Payment rule correctness re-audit (this is pure refactor)
- BGA pass-around card draft (S2 cardDraft kind, separate sprint)
- Custom cards / workshop unrelated changes
