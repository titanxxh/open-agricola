# ADR-0006: PaymentSolver 收口为单深 module

- **状态：** Accepted
- **日期：** 2026-05-04
- **决策者：** S3 sprint pre-kickoff brainstorm（grill-with-docs session）
- **关联文档：**
  - `docs/ENGINE_NEW_ARCHITECTURE.md` §1.2 P3 / §9 / §15 Sprint S3 / §17
  - `docs/superpowers/specs/2026-05-03-engine-redesign-S2-S4-contracts.md` §2
  - `docs/superpowers/specs/2026-05-03-sprint-S3-design.md`

---

## Context

`shared/actions/helpers/` 下三件套：

| 文件 | 行数 | export |
|---|---|---|
| `payment.ts` | 900 | 16 |
| `pay-helpers.ts` | 647 | 17 |
| `room-payment.ts` | 427 | 8 |
| **合计** | **1974** | **41** |

41 个 export 散在 effect 层（`improvement.ts` / `occupation.ts` / `pay.ts` / `construct.ts` / `exchange.ts` / `fencing.ts` / `renovation.ts` / `stables.ts` 等）被广泛 import。问题：

- 接口爆炸：调用方需要知道"应该用 `payResources` 还是 `executePaymentSolution`"、"应该 import `pay-helpers` 还是 `payment`"
- 边界模糊：`pay-helpers.ts` 既做 hook context 构造，也做 payment choice result 构造，也做 solution selection；职责堆叠
- 重复模板：effect 层重复写 `solutions.length === 1 ? auto : prompt`、`isComplexCost ? complexPath : simplePath`
- 不变量分裂：`payment.ts:498/504` throw（程序员错误），`pay-helpers.ts:626` return failure（运行时无效输入），edge case 处理不一致
- 测试难度：cost-modifier / solution-cache / fast-path 三套关注点纠缠在一起

Engine new architecture（`docs/ENGINE_NEW_ARCHITECTURE.md` §9）已经规定 S3 把三件套合并为 `shared/actions/payment/` 单深 module，对外仅 3 个 public：`computeOptions / canAfford / execute`。本 ADR 把这个目标具体化，并固化 grill 出的 6 个子决议。

## Decision

把 `shared/actions/helpers/payment.ts` + `pay-helpers.ts` + `room-payment.ts` 合并为 `shared/actions/payment/` 模块，对外 **5 个 export**（4 函数 + 1 类型 namespace），其余全部成为模块内部细节。

### 模块结构

```
shared/actions/payment/
├── index.ts          // barrel：仅 re-export public
├── solver.ts         // PaymentSolver namespace + 4 函数
├── types.ts          // Cost / Option / PaymentChoice / PaymentCtx /
│                     //  PaymentExecuteResult / PaymentExecuteError
└── internal/         // 内部细节（enumerate / cache / cost-modifiers /
                      //  trade / room-payment / hook-trigger 等）
```

### 公开 API

```ts
// shared/actions/payment/index.ts
export { PaymentSolver } from './solver'
export type {
  Cost, Option, PaymentChoice,
  PaymentCtx, PaymentExecuteResult, PaymentExecuteError,
} from './types'

// shared/actions/payment/solver.ts
const computeOptions = (
  state: GameState, idx: number, cost: Cost, ctx: PaymentCtx,
): Option[] => { ... }

const canAfford = (
  state: GameState, idx: number, cost: Cost, ctx: PaymentCtx,
): boolean => { ... }

const execute = (
  state: GameState, idx: number, cost: Cost, choice: PaymentChoice, ctx: PaymentCtx,
): PaymentExecuteResult => { ... }

const pickAuto = (options: Option[]): Option | undefined => { ... }

export const PaymentSolver = { computeOptions, canAfford, execute, pickAuto } as const
```

### 6 个子决议（grill 2026-05-04）

#### D1. `PaymentCtx` 5 字段，hook 内部触发

```ts
type PaymentCtx = {
  actionId: string                  // hook 触发必需
  costType: CostModifierType        // applyCostModifiers 必需；无 modifier 传 'none' sentinel
  sourceCard?: string               // 付款 source card（improvement / occupation cardId）
  spaceId?: string                  // action space（trade side effect 用）
  playedCards?: string[]            // buildable combinations 卡牌依赖
}
```

- `actionId` 与 `costType` 必填；其余可选
- `computeCosts` hook 在 PaymentSolver **内部**触发；外部不传 hook 结果
- `solutionCache` 仍是 module-level，cache key 含 ctx

#### D2. 自动 vs 手动 — `pickAuto` 第 4 public

- `Option` 类型**不带** `requiresChoice` 字段（误导 — "是否需要选" 是数组级属性）
- `computeOptions` 仍返回 `Option[]`（不返回 `{ auto; choices }` 复合形态）
- 新增 `PaymentSolver.pickAuto(options): Option | undefined`，返回唯一解（`length === 1`）或 undefined
- effect 层禁止直接写 `options.length === 1`；必须经 `pickAuto`

#### D3. `canAfford` 复用 `computeOptions`

```
canAfford(simple cost)        → canPayResources fast-path (O(1))
canAfford(ComplexCost)        → computeOptions(...).length > 0
                                依赖 solutionCache 让"先 canAfford 后 computeOptions"链路第 2 次 O(1)
```

不写专门的 first-hit 枚举路径。性能瓶颈出现后再说。

#### D4. `improvement-pool.ts` 边界

`improvement.ts` 985 行拆为：

- `improvement.ts`（≤ 400）— effect 入口、play mode 路由、pending 编排
- `improvement-options.ts` — 候选构造
- `improvement-pool.ts` — pool query + mutation（`listAvailableMajors` / `removeMajorFromPool` / `listMinorHand` / `removeMinorFromHand` 等）

**约束**：

- `PaymentSolver` 禁止 import `improvement-pool`（pool 属于 improvement domain，不属于 payment）
- `improvement.ts` 同时 import `PaymentSolver` + `improvement-options` + `improvement-pool`
- S4 引入 `shared/domain/` 时再考虑 pool 是否进 domain 聚合（`MarketState` 类聚合放公共池；`PlayerBoard.cards` 放手牌）— S3 期间不预设

#### D5. Export 风格 — namespace object

```ts
export const PaymentSolver = { computeOptions, canAfford, execute, pickAuto } as const
```

不是 class（无 instance state，cache 是 module-level 共享）。
不是 plain functions with prefix（`computePaymentOptions` 等会破坏契约 §2.2 的 `PaymentSolver.xxx` 命名一致性）。

调用方统一 `PaymentSolver.xxx(...)`，与契约文档命名 1:1。

**Test utility note (audit-discovered 2026-05-04):** `clearCache` is exposed as a 5th member of the `PaymentSolver` namespace, used primarily by tests to reset `solutionCache` between cases. It does not count as a "core public" in the §2.2 红线 sense (行动层付款入口仍是 4 个：computeOptions / canAfford / execute / pickAuto), but is part of the namespace surface. Total `PaymentSolver` namespace members: 5.

#### D6. 错误处理 — discriminated union + reason enum

```ts
type PaymentExecuteResult =
  | { ok: true; state: GameState }
  | { ok: false; reason: PaymentExecuteError }

type PaymentExecuteError =
  | 'invalid-choice'   // PaymentChoice 在 Option[] 里找不到
  | 'cannot-afford'    // execute 时再 check cost 失败
  | 'unknown-option'   // 内部 enumeration 与 choice 不一致
```

- `execute` 返回 Result 风格；`reason` 是 enum 不是 string
- `computeOptions` 不可负担 → 返回**空数组**（非错误）
- `canAfford` → boolean（无错误）
- `pickAuto` undefined → "无法自动"（非错误）
- **不变量违反**（Bonus 配置错、internal invariant broken）→ throw（fail-fast，沿用当前 `payment.ts:498/504` 风格）
- enum 出现新 case 必须更新契约 §2.3 + 本 ADR

## Consequences

### 积极

- **接口收敛**：41 → 5 export，调用方零认知成本（`PaymentSolver.xxx`）
- **边界明确**：payment vs pool vs effect 三个域清楚；S4 再做 domain 聚合时迁移成本低
- **重复模板消除**：`pickAuto` 收口"length === 1 → 自动" pattern；effect 层瘦身
- **不变量分裂收口**：throw vs Result 按"程序员错误 vs 业务错误"二分，规则明确
- **可测**：4 个 public 单独可测；solutionCache 可清；模块内部 helper 不暴露 → 测试只对 public 断言
- **未来扩展空间**：`pickAuto` 是单点（未来"何谓自动"扩展不波及其他）；`PaymentExecuteError` 是 enum（外层错误处理 switch 类型安全）

### 负面 / 妥协

- **`pickAuto` 破坏"3 public"原话**：契约 §2.2 原本写"对外仅三个 public"——现在是 4 个。妥协理由：消化 effect 层重复模板的收益大于"3 vs 4" 的 strict 数字。
- **`canAfford` 性能不变**：第一次完整枚举仍是 O(combinations)。妥协理由：`solutionCache` 让重复调用 O(1)；专门 first-hit 路径会引入双枚举漂移风险。
- **`PaymentCtx.actionId` 必填**：所有调用方必须传 `actionId`——当前部分 helpers 没传（如 `canPayCost(player, cost, costType?)`，3 参）。迁移时所有调用点要补 `actionId`。
- **enum case 受限于 3 个**：未来若发现 4 类错误，需要更新本 ADR + 契约。可控。
- **`solutionCache` 仍是 module global**：多 GameSession 共享 cache。cache key 含 player resources 理论无冲突，但要确保测试间清 cache（沿用 `clearPaymentCache`）。

### 中性

- 与 ADR-0001（消除 PendingAction）、ADR-0002（cursor 进 SerializedState）正交
- 与 S2（InteractionRequest）独立 — PaymentSolver 不感知 InteractionRequest 集合
- 与 S4（`shared/domain/`）独立 — domain 聚合不 import payment；payment 不 import domain

## Alternatives Considered

### A1. PaymentSolver 是 `class`，cache 进 instance

- 优点：与 `Engine` 风格一致；多 GameSession 隔离 cache
- 缺点：4 个 public 都是无状态计算，class 仪式无收益；instantiation 需要每个 GameSession 一份
- **拒绝理由**：项目"无 instance state 用 plain / namespace" 惯例；class 引入不必要 ceremony

### A2. `computeOptions` 返回 `{ auto: Option | null; choices: Option[] }`

- 优点：PaymentSolver 内部完成自动判定，effect 层调用最简
- 缺点：返回类型变复合；callers 要分别处理 auto / choices 路径；破坏 `Option[]` 形状契约
- **拒绝理由**：`pickAuto` 提供同等收益，且不破坏 `Option[]` 形状

### A3. `Option.requiresChoice: boolean` 字段

- 优点：每 option 自描述
- 缺点：误导——"是否需要选" 是数组级属性，加在单 option 上冗余且歧义
- **拒绝理由**：语义错位

### A4. plain functions with prefix（`computePaymentOptions` / `executePayment` / ...）

- 优点：与 hooks.ts / draft-manager.ts 一致
- 缺点：破坏 `PaymentSolver.xxx` 命名契约；前缀化让函数名变长
- **拒绝理由**：契约文档已用 namespace 命名，与 plain functions 不兼容

### A5. `execute` 抛错而非返回 Result

- 优点：调用方代码更紧凑（不需要 `if (!result.ok) ...`）
- 缺点：与 `SessionResponse.ok / error` 模型不一致；invalid choice 是业务错误不是程序员错误
- **拒绝理由**：业务错误用 throw 是反模式；与外层错误模型不一致

### A6. `PaymentExecuteError` 用 `string` 而非 enum

- 优点：消息可自描述（`reason: '玩家选了不存在的 option XYZ'`）
- 缺点：失去类型安全；外层 switch 无法穷尽
- **拒绝理由**：i18n 时按 enum 找 key 更稳；自描述 string 可作 `reason` 之外的 `details?: string` 字段

### A7. `improvement-pool` 进 PaymentSolver

- 优点：付款 + 卡牌池一站
- 缺点：PaymentSolver 域膨胀；卡牌池与付款是不同域
- **拒绝理由**：域错位；S4 引入 domain 聚合时返工成本高

## Migration Plan（指引性，详见 S3 plan）

1. **import audit**（sprint 启动第一天）：grep 41 export 在 effect 层的所有使用点；分类"真 payment"vs"误归类"
2. **types 抽取**：`shared/actions/payment/types.ts` 落地 `Cost / Option / PaymentChoice / PaymentCtx / PaymentExecuteResult / PaymentExecuteError`
3. **PaymentSolver 落地（共存期）**：`shared/actions/payment/solver.ts` 4 函数；旧 helpers 暂保留，PaymentSolver 内部调旧 helpers 实现 4 函数
4. **调用方迁移**：effect 文件逐个改 import 到 `PaymentSolver`；每个 PR 跑全 slow project
5. **`improvement.ts` 拆三文件**：`improvement.ts`（≤ 400）+ `improvement-options.ts` + `improvement-pool.ts`
6. **删除旧 helpers**：调用方零 import 后删 `payment.ts` / `pay-helpers.ts` / `room-payment.ts`
7. **lint rule**：禁止 effect 层 import `helpers/payment*`；禁止 `options.length === 1` 模板（必须经 `pickAuto`）
8. **文档同步**：S3 spec / 契约 §2 / `docs/ENGINE_NEW_ARCHITECTURE.md` §15 S3

## References

- 当前代码：`shared/actions/helpers/payment.ts`、`pay-helpers.ts`、`room-payment.ts`
- 契约：`docs/superpowers/specs/2026-05-03-engine-redesign-S2-S4-contracts.md` §2
- Sprint spec：`docs/superpowers/specs/2026-05-03-sprint-S3-design.md`
- BGA 对照：BGA 把 payment 收在 `Pay.php` + `PayHelper.php` 约 800 行，单 class 无 41 export 工具袋问题（我们更激进——deep module 而非两 class）
