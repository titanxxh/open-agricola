# Sprint S4b — 节点充血 + engine.ts 瘦身 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `shared/engine/engine.ts`（2206 行 / 15 public / 58 处 `instanceof` 派发）瘦身到 ≤ 700 行 / 6 public / 0 处 `instanceof`-based dispatch，行为下沉到 `shared/engine/nodes/*.ts` 11 个充血节点 class。

**Architecture:** 三档充血 — **轻**（5 控制流节点 Sequence/Parallel/Or/Xor/Optional 仅搬 step 方法 ~50 行/节点）/ **重**（InteractionNode 自管 emit / cache / sourceCard / replace-aware label 共 ~750 行）/ **中等**（ActionNode/ActivateCardNode/PlayerSwitchNode 自带 step / emit / toCursor / fromCursor，~150 行/节点）。BaseNode 基类薄（≤ 100 行）：树操作 + 序列化骨架。Engine 退化为 step loop + EngineStack 调度 + 顶层 snapshot/restore + resolveChoice 入口。节点 type discriminator 保字符串（cursor round-trip 必需），但内部不再 switch type — 调 method。

**Tech Stack:** TypeScript 5.x（strict mode，无路径别名）；Vitest（fast project：unit + cursor round-trip 测试，slow project：254 卡 session 测试零回归）；ESLint flat config。

**Spec:** `docs/superpowers/specs/2026-05-05-sprint-S4-domain-rich-nodes-design.md` §5 + §6 + §7 + §8.2（DoD D10–D16）。

**Branch:** `sprint-S4b-rich-nodes`（worktree `.worktree/sprint-S4b`，HEAD `4814d8d3` 即 spec commit）。

**总 Task 数：** 24（PR1: 4 / PR2: 6 / PR3: 5 / PR4: 5 / PR5: 4）。

---

## File Map

### 新建（PR1 — 物理拆分 + BaseNode 基类）

| 路径 | 责任 |
|---|---|
| `shared/engine/nodes/index.ts` | re-export 全部节点 class + 类型 |
| `shared/engine/nodes/base.ts` | `BaseNode` abstract 基类（树操作 + 序列化骨架，≤ 100 行） |
| `shared/engine/nodes/action-node.ts` | `ActionNode`（PR4 中等充血） |
| `shared/engine/nodes/interaction-node.ts` | `InteractionNode`（PR3 重充血） |
| `shared/engine/nodes/sequence-node.ts` | `SequenceNode`（PR2 轻充血） |
| `shared/engine/nodes/parallel-node.ts` | `ParallelNode`（PR2 轻充血） |
| `shared/engine/nodes/or-node.ts` | `OrNode`（PR2 轻充血） |
| `shared/engine/nodes/xor-node.ts` | `XorNode`（PR2 轻充血） |
| `shared/engine/nodes/optional-node.ts` | `OptionalNode`（PR2 轻充血） |
| `shared/engine/nodes/activate-card-node.ts` | `ActivateCardNode`（PR4 中等充血） |
| `shared/engine/nodes/player-switch-node.ts` | `PlayerSwitchNode`（PR4 中等充血） |

### 删除（PR1）

| 路径 | 行数 |
|---|---:|
| `shared/engine/nodes.ts` | 269 → 替换为新 nodes/ 目录 |

### 修改（贯穿 PR2–PR5）

| 路径 | 改动 |
|---|---|
| `shared/engine/engine.ts` | 2206 → ≤ 700 行；`instanceof` 派发 0 处；public 接口 6 个 |
| `shared/engine/dispatcher.ts` | 接收从 engine.ts 下沉的 `before`-phase node 注入逻辑 |
| `shared/engine/types.ts` | 加 `EngineContext`、`NodeStepResult`、`NodeCursor` 类型（base.ts 依赖） |

### 新建（PR5 — 测试覆盖）

| 路径 | 责任 |
|---|---|
| `shared/engine/nodes/__tests__/cursor-roundtrip.test.ts` | 每节点 cursor 序列化往返单测（9+ 例） |
| `shared/engine/nodes/__tests__/sequence-node.test.ts` | SequenceNode step 单测 |
| `shared/engine/nodes/__tests__/parallel-node.test.ts` | ParallelNode step 单测 |
| `shared/engine/nodes/__tests__/or-node.test.ts` | OrNode step 单测 |
| `shared/engine/nodes/__tests__/xor-node.test.ts` | XorNode step 单测 |
| `shared/engine/nodes/__tests__/optional-node.test.ts` | OptionalNode step 单测 |
| `shared/engine/nodes/__tests__/interaction-node.test.ts` | InteractionNode emit / resolve / validateSelection 单测 |
| `shared/engine/nodes/__tests__/action-node.test.ts` | ActionNode step / emit 单测 |
| `shared/engine/nodes/__tests__/engine-public-surface.test.ts` | 断言 `Engine.prototype` 仅有 6 个 own enumerable methods |

---

## PR1 — 拆 nodes.ts 到 nodes/*.ts 骨架（Tasks 1–4）

### Task 1: 在 `shared/engine/nodes/base.ts` 抽出 `BaseNode` 抽象基类（含 step/cursor 抽象方法签名）

**Files:**
- Create: `shared/engine/nodes/base.ts`
- Modify: `shared/engine/types.ts` (加 `NodeStepResult` / `NodeCursor` / `EngineContext` 引用)

- [ ] **Step 1: 在 `shared/engine/types.ts` 加新类型**

打开 `shared/engine/types.ts`，加入以下类型（紧跟现有 `NodeState` / `EngineNodeType` 之后）：

```ts
// types.ts (additions)
export type NodeStepResult =
  | { kind: 'continue' }
  | { kind: 'done' }
  | { kind: 'blocked'; reason?: string }
  | { kind: 'choice'; nodeId: string }
  | { kind: 'playerSwitch'; targetPlayerId: string }
  | { kind: 'request'; request: import('../game/types').InteractionRequest }

/** Persisted cursor of a single node — used for engine snapshot/restore. */
export type NodeCursor = {
  type: EngineNodeType
  id: string
  state: NodeState
  data: Record<string, unknown>      // type-specific fields (children list, choices, request, etc.)
}

/** Context passed to BaseNode.step() — proxies to engine state needed by node behavior. */
export type EngineContext = {
  // S4b: engine sub-set passed to nodes; full engine type stays in engine.ts
  resolveSubtree(node: EngineNode): void
  emitChoice(nodeId: string, choices: import('../game/types').ActionChoiceOption[]): void
  // PR3 will extend this further when InteractionNode absorbs emit logic
}
```

- [ ] **Step 2: 创建 `shared/engine/nodes/base.ts`**

```ts
// shared/engine/nodes/base.ts
import type {
  EngineNode,
  EngineNodeType,
  NodeState,
  NodeStepResult,
  NodeCursor,
  EngineContext,
} from '../types'

/**
 * Abstract base for all engine nodes. Provides:
 * - tree operations (children walk, isResolved derived from state)
 * - serialization scaffolding (toCursor / fromCursor abstract)
 * - state machine helpers (resolve / block / setState)
 *
 * S4b deliberately does NOT mirror BGA's AbstractNode (35+ methods). TypeScript
 * doesn't need PHP single-inheritance boilerplate; we keep the base ≤ 100 lines.
 */
export abstract class BaseNode implements EngineNode {
  public id: string
  public type: EngineNodeType
  public choiceLabelKey?: string
  public choiceLabelParams?: Record<string, unknown>
  protected nodeState: NodeState

  protected constructor(id: string, type: EngineNodeType) {
    this.id = id
    this.type = type
    this.nodeState = 'ready'
  }

  // ----- state machine -----

  getState(): NodeState {
    return this.nodeState
  }

  setState(state: NodeState): void {
    this.nodeState = state
  }

  resolve(_result?: unknown): void {
    this.nodeState = 'resolved'
  }

  block(): void {
    this.nodeState = 'blocked'
  }

  isResolved(): boolean {
    return this.nodeState === 'resolved'
  }

  isDoable(): boolean {
    return true
  }

  // ----- behaviour (subclasses override) -----

  /**
   * Drive the node forward by one tick. Subclasses implement node-specific
   * progression. PR2 implements this on control-flow nodes (Sequence/Parallel/
   * Or/Xor/Optional). PR3 implements on InteractionNode. PR4 implements on
   * ActionNode/ActivateCardNode/PlayerSwitchNode.
   *
   * Default impl returns 'done' so the unimplemented subclasses pass through
   * before their PR lands; engine.ts also keeps an instanceof fallback during
   * PR2-4.
   */
  step(_ctx: EngineContext): NodeStepResult {
    return { kind: 'done' }
  }

  // ----- serialization -----

  /**
   * Serialize to a stable cursor format. Subclasses override to include
   * type-specific data (children ids, choices array, request, etc.). The
   * `type` field is the discriminator — it's the closed string union used
   * by `fromCursor` to dispatch construction.
   */
  toCursor(): NodeCursor {
    return {
      type: this.type,
      id: this.id,
      state: this.nodeState,
      data: this.cursorData(),
    }
  }

  /** Subclass hook: type-specific data to embed in cursor.data. */
  protected cursorData(): Record<string, unknown> {
    return {}
  }

  getArgs(): Record<string, unknown> {
    return {}
  }
}
```

- [ ] **Step 3: 验证 TS 编译**

```bash
cd /data00/home/xuxinhao.titan/raw/open-agricola/.worktree/sprint-S4b
pnpm install --frozen-lockfile  # only first time
pnpm exec tsc -b
```

Expected: 0 errors. (Old `BaseNode` in `shared/engine/nodes.ts` still exists; the new file is additive at this point.)

- [ ] **Step 4: 不 commit — Task 2-3 接续叠到 PR1**

我们累积整个 PR1 物理拆分到一起再 commit。

---

### Task 2: 把 9 个 class 从 `nodes.ts` 拆到独立文件 `nodes/{action,interaction,sequence,parallel,or,xor,optional,activate-card,player-switch}-node.ts`

**Files:**
- Create: `shared/engine/nodes/action-node.ts`
- Create: `shared/engine/nodes/interaction-node.ts`
- Create: `shared/engine/nodes/sequence-node.ts`
- Create: `shared/engine/nodes/parallel-node.ts`
- Create: `shared/engine/nodes/or-node.ts`
- Create: `shared/engine/nodes/xor-node.ts`
- Create: `shared/engine/nodes/optional-node.ts`
- Create: `shared/engine/nodes/activate-card-node.ts`
- Create: `shared/engine/nodes/player-switch-node.ts`

- [ ] **Step 1: 创建 `shared/engine/nodes/action-node.ts`**

把 `shared/engine/nodes.ts:51-91` 的 `ActionNode` class 整体复制过来；继承 `BaseNode` 改为 `import { BaseNode } from './base'`：

```ts
// shared/engine/nodes/action-node.ts
import type {
  ActionChoiceOption,
  ChoiceEffectPreview,
  ActionExecutionContext,
  ActionExecutionResult,
  Resource,
} from '../../game/types'
import { BaseNode } from './base'

export class ActionNode extends BaseNode {
  public actionId: string
  public sourceCard?: string
  public params?: Partial<Resource>
  public actionContext?: Record<string, unknown>
  public effectPreview?: ChoiceEffectPreview
  public choiceLabelKey?: string
  public choiceLabelParams?: Record<string, unknown>
  public beforePhaseResolved = false

  constructor(
    id: string,
    actionId: string,
    sourceCard?: string,
    params?: Partial<Resource>,
    choiceLabelKey?: string,
    choiceLabelParams?: Record<string, unknown>,
    actionContext?: Record<string, unknown>,
    effectPreview?: ChoiceEffectPreview,
  ) {
    super(id, 'action')
    this.actionId = actionId
    this.sourceCard = sourceCard
    this.params = params
    this.choiceLabelKey = choiceLabelKey
    this.choiceLabelParams = choiceLabelParams
    this.actionContext = actionContext
    this.effectPreview = effectPreview
  }

  execute(
    context: ActionExecutionContext & { actionId: string },
    executor: (context: ActionExecutionContext) => ActionExecutionResult,
  ) {
    return executor(context)
  }

  isDoable() {
    return true
  }
}
```

- [ ] **Step 2: 创建 `shared/engine/nodes/interaction-node.ts`**

把 `nodes.ts:93-130` 的 `InteractionNode` class 整体复制；继承改为 `BaseNode`：

```ts
// shared/engine/nodes/interaction-node.ts
import type { ActionChoiceOption, InteractionRequest } from '../../game/types'
import type { PromptKey } from '../../game/prompt-keys'
import { BaseNode } from './base'

export class InteractionNode extends BaseNode {
  public choices: ActionChoiceOption[]
  public promptKey?: PromptKey
  public promptParams?: Record<string, unknown>
  public request?: InteractionRequest

  constructor(id: string, choices: ActionChoiceOption[], request?: InteractionRequest) {
    super(id, 'interaction')
    this.choices = choices
    this.request = request
  }

  setChoice(
    promptKey: PromptKey | undefined,
    choices: ActionChoiceOption[],
    promptParams?: Record<string, unknown>,
  ) {
    this.promptKey = promptKey
    this.choices = choices
    this.promptParams = promptParams
    this.setState('ready')
  }

  resolve(choice: string) {
    if (!this.choices.some((item) => item.value === choice)) {
      this.block()
      return
    }
    this.setState('resolved')
  }
}
```

- [ ] **Step 3: 创建剩余 7 个节点文件**

按相同模式从 `nodes.ts:132-269` 复制 `SequenceNode / ParallelNode / OrNode / XorNode / OptionalNode / ActivateCardNode / PlayerSwitchNode` 到对应文件。每个文件结构：

```ts
// shared/engine/nodes/sequence-node.ts
import type { EngineNode } from '../types'
import { BaseNode } from './base'

export class SequenceNode extends BaseNode {
  public children: EngineNode[]

  constructor(id: string, children: EngineNode[]) {
    super(id, 'sequence')
    this.children = children
  }

  getState() {
    if (this.children.every((child) => child.getState() === 'resolved')) {
      return 'resolved'
    }
    return super.getState()
  }
}
```

OrNode/XorNode/OptionalNode 也复制现有的 `emittedChoices` 等字段（不动）。具体内容直接对照 `nodes.ts:132-269`。

`activate-card-node.ts`:
```ts
import type { ActionHookPhase } from '../../actions/hooks'
import { BaseNode } from './base'

export class ActivateCardNode extends BaseNode {
  public listenerId: string
  public cardId: string
  public phase: ActionHookPhase
  public actionId: string
  public event: Record<string, unknown>

  constructor(
    id: string,
    listenerId: string,
    cardId: string,
    phase: ActionHookPhase,
    actionId: string,
    event: Record<string, unknown> = {},
  ) {
    super(id, 'activateCard')
    this.listenerId = listenerId
    this.cardId = cardId
    this.phase = phase
    this.actionId = actionId
    this.event = event
  }
}
```

`player-switch-node.ts`:
```ts
import { BaseNode } from './base'

export class PlayerSwitchNode extends BaseNode {
  public targetPlayerId: string

  constructor(id: string, targetPlayerId: string) {
    super(id, 'playerSwitch')
    this.targetPlayerId = targetPlayerId
  }
}
```

- [ ] **Step 4: 验证 TS 编译**

```bash
pnpm exec tsc -b
```

Expected: 0 errors. (Old `nodes.ts` still exists — duplicate class defs are fine because we haven't deleted nodes.ts yet.)

---

### Task 3: 创建 `shared/engine/nodes/index.ts` + 删 `shared/engine/nodes.ts`，所有 import 改路径

**Files:**
- Create: `shared/engine/nodes/index.ts`
- Delete: `shared/engine/nodes.ts`
- Modify: 所有 import 自 `'./nodes'` 或 `'../engine/nodes'` 的文件

- [ ] **Step 1: 创建 `shared/engine/nodes/index.ts`**

```ts
// shared/engine/nodes/index.ts
// Single re-export entry. Engine and external callers import from './nodes' (index).
export { BaseNode } from './base'
export { ActionNode } from './action-node'
export { InteractionNode } from './interaction-node'
export { SequenceNode } from './sequence-node'
export { ParallelNode } from './parallel-node'
export { OrNode } from './or-node'
export { XorNode } from './xor-node'
export { OptionalNode } from './optional-node'
export { ActivateCardNode } from './activate-card-node'
export { PlayerSwitchNode } from './player-switch-node'
```

- [ ] **Step 2: 删除 `shared/engine/nodes.ts`**

```bash
git rm shared/engine/nodes.ts
```

- [ ] **Step 3: 让所有 import 自动 resolve 到 `nodes/index.ts`**

旧 `import { ... } from './nodes'`（来自 engine.ts 等）会自动 resolve 到 `nodes/index.ts` —— 不需要改任何 import 路径。

但是现在 `BaseNode` 旧定义在被删的 `nodes.ts` 里，新定义在 `nodes/base.ts`。检查 engine.ts 是否有 `import { BaseNode }`:

```bash
grep -n "BaseNode" shared/engine/engine.ts shared/engine/dispatcher.ts shared/engine/tree.ts shared/engine/engine-stack.ts
```

如果有命中，确认它们 import 路径仍工作（应该自动 resolve 到新 nodes/index.ts）。

- [ ] **Step 4: 验证 TS + 跑测试**

```bash
pnpm exec tsc -b
pnpm exec vitest run shared/engine/__tests__/ --project fast
```

Expected: 0 TS errors, 0 test failures (PR1 是 pure 物理拆分，行为零变化)。

- [ ] **Step 5: 跑 engine 主测试套件 (engine-flow / engine-pipeline / engine-chain / resolveChoice-payload)**

```bash
pnpm exec vitest run shared/engine/__tests__/engine.test.ts shared/engine/__tests__/engine-flow.test.ts shared/engine/__tests__/engine-pipeline.test.ts shared/engine/__tests__/engine-chain.test.ts shared/engine/__tests__/resolveChoice-payload.test.ts --project fast
```

Expected: 0 fails.

---

### Task 4: PR1 本地 CI 矩阵 + commit + push

- [ ] **Step 1: 跑完整本地 CI 矩阵**

```bash
pnpm run lint
pnpm run lint:i18n
pnpm run check:prompt-sync -- --strict
pnpm run check:reaches -- --strict
pnpm run check:no-dsl -- --strict
pnpm run check:catalog-types
pnpm run check:community-deck
pnpm run test:fast
pnpm run build
pnpm run check:bundle-size
```

All must pass. (Flaky `improvement-pay-fail-idempotent.test.ts` retry as needed.)

- [ ] **Step 2: 跑 slow project 验证零回归**

```bash
pnpm run test:slow
```

Expected: 0 fails. PR1 是 pure refactor，行为零变化，slow 必须全过。

- [ ] **Step 3: Commit + push PR1**

```bash
git add shared/engine/nodes/ shared/engine/types.ts
git rm shared/engine/nodes.ts   # already done in Task 3
git commit -m "$(cat <<'EOF'
refactor(engine): split nodes.ts into nodes/ directory (PR1/5)

Pure physical split: shared/engine/nodes.ts (269 lines, 9 classes) is
replaced by shared/engine/nodes/ — one file per class plus an index.ts
re-export and a BaseNode abstract base in nodes/base.ts. Behavior
unchanged; every class body is a verbatim copy from the old nodes.ts.

BaseNode is exported (was a private class before) and adds:
- step(ctx) abstract scaffold (default returns {kind:'done'}; subclasses
  override in PR2-4)
- toCursor() / cursorData() serialization scaffold (subclasses override
  in PR5)
- isResolved() helper

Adds NodeStepResult / NodeCursor / EngineContext to shared/engine/types.ts
for the new step/cursor surface. EngineContext is intentionally narrow
(resolveSubtree + emitChoice for now); PR3 widens it when InteractionNode
absorbs emit logic.

PR1/5 of S4b. Subsequent PRs:
- PR2: control-flow nodes light richness (Sequence/Parallel/Or/Xor/Optional)
- PR3: InteractionNode heavy richness (eats ~750 lines from engine.ts)
- PR4: Action/ActivateCard/PlayerSwitch medium richness
- PR5: closeout — Engine public surface 15 → 6, cursor round-trip tests

Local CI: lint/i18n/prompt-sync/reaches/no-dsl/catalog-types/community-deck/
test:fast/build/bundle-size all green; test:slow (254 single-card
session tests) zero regression.
EOF
)"

git push -u origin sprint-S4b-rich-nodes
```

Wait for GitHub Actions CI on PR1 to pass before starting PR2.

---

## PR2 — 控制流节点轻充血（Tasks 5–10）

每个控制流节点（Sequence/Parallel/Or/Xor/Optional）把 engine.ts 里 `instanceof <Node>` 派发的"推进/解析"代码搬入节点 `step()` 方法。然后 engine.ts 删除对应 `instanceof` 分支，用 `node.step(ctx)` 调用。

### Task 5: SequenceNode 轻充血 — `step()` 方法 + engine.ts 删 SequenceNode 派发

**Files:**
- Modify: `shared/engine/nodes/sequence-node.ts`
- Modify: `shared/engine/engine.ts`
- Create: `shared/engine/nodes/__tests__/sequence-node.test.ts`

- [ ] **Step 1: 写 SequenceNode step 单测**

```ts
// shared/engine/nodes/__tests__/sequence-node.test.ts
import { describe, it, expect } from 'vitest'
import { SequenceNode } from '../sequence-node'
import { ActionNode } from '../action-node'
import type { EngineContext } from '../../types'

const stubCtx: EngineContext = {
  resolveSubtree: () => {},
  emitChoice: () => {},
}

describe('SequenceNode.step', () => {
  it('returns continue when first child unresolved', () => {
    const child1 = new ActionNode('a1', 'gain-wood')
    const child2 = new ActionNode('a2', 'gain-clay')
    const seq = new SequenceNode('s', [child1, child2])
    const result = seq.step(stubCtx)
    expect(result.kind).toBe('continue')
  })

  it('returns done when all children resolved', () => {
    const child1 = new ActionNode('a1', 'gain-wood')
    const child2 = new ActionNode('a2', 'gain-clay')
    child1.setState('resolved')
    child2.setState('resolved')
    const seq = new SequenceNode('s', [child1, child2])
    const result = seq.step(stubCtx)
    expect(result.kind).toBe('done')
  })

  it('isResolved() reflects all children resolved', () => {
    const child1 = new ActionNode('a1', 'gain-wood')
    const seq = new SequenceNode('s', [child1])
    expect(seq.isResolved()).toBe(false)
    child1.setState('resolved')
    expect(seq.isResolved()).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试看失败**

```bash
pnpm exec vitest run shared/engine/nodes/__tests__/sequence-node.test.ts --project fast
```

Expected: FAIL（`step()` 当前是 BaseNode 默认实现 `return {kind:'done'}`，第一个测试期望 'continue' 但拿到 'done'）。

- [ ] **Step 3: 在 SequenceNode 实现 step()**

修改 `shared/engine/nodes/sequence-node.ts`，加 `step()` method：

```ts
// shared/engine/nodes/sequence-node.ts
import type { EngineNode, EngineContext, NodeStepResult } from '../types'
import { BaseNode } from './base'

export class SequenceNode extends BaseNode {
  public children: EngineNode[]

  constructor(id: string, children: EngineNode[]) {
    super(id, 'sequence')
    this.children = children
  }

  getState() {
    if (this.children.every((child) => child.getState() === 'resolved')) {
      return 'resolved'
    }
    return super.getState()
  }

  step(ctx: EngineContext): NodeStepResult {
    if (this.children.every((c) => c.getState() === 'resolved')) {
      return { kind: 'done' }
    }
    // The first unresolved child is what to drive next; engine handles the
    // recursion. Sequence itself just reports "still in progress".
    return { kind: 'continue' }
  }

  protected cursorData() {
    return {
      childrenIds: this.children.map((c) => c.id),
    }
  }
}
```

- [ ] **Step 4: 跑测试看通过**

```bash
pnpm exec vitest run shared/engine/nodes/__tests__/sequence-node.test.ts --project fast
```

Expected: PASS, 3/3 tests pass.

- [ ] **Step 5: 在 engine.ts 用 `node.step(ctx)` 替代 `instanceof SequenceNode` 分支**

打开 `shared/engine/engine.ts`，找到 `node instanceof SequenceNode` 分支（line 413, 628, 674 附近，参考前面 grep 结果）。每处替换：

```ts
// BEFORE
if (node instanceof SequenceNode) {
  // ... existing logic
}

// AFTER (in the proceed/step loop, line ~1178+)
const stepResult = node.step(this.makeNodeContext())
if (stepResult.kind === 'done') {
  this.resolveSubtree(node)
}
// non-Sequence cases still use instanceof for now (deleted in next tasks)
```

注意：`instanceof SequenceNode` 在多个 helper 方法里出现（findActionNode 等）。这些是 **structural query**（"这是哪种 node"），不是行为派发。结构查询保持 instanceof（不算 dispatch，是 type guard）。

只搬"行为派发"那 1-2 处（`proceed()` 内的 step loop 主分支）。

- [ ] **Step 6: 跑测试 + commit**

```bash
pnpm exec vitest run shared/engine/__tests__/engine.test.ts shared/engine/__tests__/engine-flow.test.ts shared/engine/__tests__/engine-pipeline.test.ts --project fast
```

Expected: 0 fails.

```bash
git add shared/engine/nodes/sequence-node.ts shared/engine/nodes/__tests__/sequence-node.test.ts shared/engine/engine.ts
git commit -m "refactor(engine): SequenceNode.step + engine dispatch via node.step (PR2/5)"
```

---

### Task 6: ParallelNode 轻充血

**Files:**
- Modify: `shared/engine/nodes/parallel-node.ts`
- Modify: `shared/engine/engine.ts`
- Create: `shared/engine/nodes/__tests__/parallel-node.test.ts`

- [ ] **Step 1: 写 ParallelNode step 测试**

```ts
// shared/engine/nodes/__tests__/parallel-node.test.ts
import { describe, it, expect } from 'vitest'
import { ParallelNode } from '../parallel-node'
import { ActionNode } from '../action-node'
import type { EngineContext } from '../../types'

const stubCtx: EngineContext = { resolveSubtree: () => {}, emitChoice: () => {} }

describe('ParallelNode.step', () => {
  it('continues when any child unresolved (default policy=all)', () => {
    const c1 = new ActionNode('a', 'gain-wood'); const c2 = new ActionNode('b', 'gain-clay')
    const p = new ParallelNode('p', [c1, c2])
    expect(p.step(stubCtx).kind).toBe('continue')
    c1.setState('resolved')
    expect(p.step(stubCtx).kind).toBe('continue')
    c2.setState('resolved')
    expect(p.step(stubCtx).kind).toBe('done')
  })
})
```

- [ ] **Step 2: 跑测试 (FAIL — base step returns 'done')**

```bash
pnpm exec vitest run shared/engine/nodes/__tests__/parallel-node.test.ts --project fast
```

- [ ] **Step 3: 实现 ParallelNode.step()**

```ts
// shared/engine/nodes/parallel-node.ts (additions to existing file)
step(ctx: EngineContext): NodeStepResult {
  if (this.children.every((c) => c.getState() === 'resolved')) {
    return { kind: 'done' }
  }
  return { kind: 'continue' }
}

protected cursorData() {
  return { childrenIds: this.children.map((c) => c.id) }
}
```

- [ ] **Step 4: 跑测试 (PASS)**

```bash
pnpm exec vitest run shared/engine/nodes/__tests__/parallel-node.test.ts --project fast
```

- [ ] **Step 5: engine.ts 用 `node.step(ctx)` 替代 `instanceof ParallelNode` 行为派发**

跟 Task 5 同模式：在 `proceed()` 主循环里 `node.step(ctx)`；保留 helper 方法里的 instanceof 结构查询。

- [ ] **Step 6: 测试 + commit**

```bash
pnpm exec vitest run shared/engine/__tests__/engine.test.ts shared/engine/__tests__/engine-flow.test.ts --project fast
git add shared/engine/nodes/parallel-node.ts shared/engine/nodes/__tests__/parallel-node.test.ts shared/engine/engine.ts
git commit -m "refactor(engine): ParallelNode.step (PR2/5)"
```

---

### Task 7: OrNode 轻充血

**Files:**
- Modify: `shared/engine/nodes/or-node.ts`
- Modify: `shared/engine/engine.ts`
- Create: `shared/engine/nodes/__tests__/or-node.test.ts`

- [ ] **Step 1: 写测试**

```ts
// shared/engine/nodes/__tests__/or-node.test.ts
import { describe, it, expect } from 'vitest'
import { OrNode } from '../or-node'
import { ActionNode } from '../action-node'
import type { EngineContext } from '../../types'

const stubCtx: EngineContext = { resolveSubtree: () => {}, emitChoice: () => {} }

describe('OrNode.step', () => {
  it('continues when all children unresolved', () => {
    const c1 = new ActionNode('a', 'gain-wood'); const c2 = new ActionNode('b', 'gain-clay')
    const or = new OrNode('o', [c1, c2])
    expect(or.step(stubCtx).kind).toBe('continue')
  })
  it('done when any child resolved', () => {
    const c1 = new ActionNode('a', 'gain-wood'); const c2 = new ActionNode('b', 'gain-clay')
    c1.setState('resolved')
    const or = new OrNode('o', [c1, c2])
    expect(or.step(stubCtx).kind).toBe('done')
  })
})
```

- [ ] **Step 2: 跑测试看失败**

```bash
pnpm exec vitest run shared/engine/nodes/__tests__/or-node.test.ts --project fast
```

- [ ] **Step 3: 实现 OrNode.step() + cursorData**

```ts
// shared/engine/nodes/or-node.ts (in class body)
step(ctx: EngineContext): NodeStepResult {
  if (this.children.some((c) => c.getState() === 'resolved')) {
    return { kind: 'done' }
  }
  return { kind: 'continue' }
}

protected cursorData() {
  return {
    childrenIds: this.children.map((c) => c.id),
    promptKey: this.promptKey,
    emittedChoices: this.emittedChoices,
    emittedPromptKey: this.emittedPromptKey,
    emittedPromptParams: this.emittedPromptParams,
    emittedRequest: this.emittedRequest,
  }
}
```

- [ ] **Step 4: 跑测试看通过**

```bash
pnpm exec vitest run shared/engine/nodes/__tests__/or-node.test.ts --project fast
```

- [ ] **Step 5: engine.ts 用 `node.step(ctx)` 替代 `instanceof OrNode` 行为派发**

- [ ] **Step 6: 测试 + commit**

```bash
git add shared/engine/nodes/or-node.ts shared/engine/nodes/__tests__/or-node.test.ts shared/engine/engine.ts
git commit -m "refactor(engine): OrNode.step (PR2/5)"
```

---

### Task 8: XorNode 轻充血

**Files:**
- Modify: `shared/engine/nodes/xor-node.ts`
- Modify: `shared/engine/engine.ts`
- Create: `shared/engine/nodes/__tests__/xor-node.test.ts`

- [ ] **Step 1: 写测试**

```ts
// shared/engine/nodes/__tests__/xor-node.test.ts
import { describe, it, expect } from 'vitest'
import { XorNode } from '../xor-node'
import { ActionNode } from '../action-node'
import type { EngineContext } from '../../types'

const stubCtx: EngineContext = { resolveSubtree: () => {}, emitChoice: () => {} }

describe('XorNode.step', () => {
  it('done when exactly one child resolved', () => {
    const c1 = new ActionNode('a', 'gain-wood'); const c2 = new ActionNode('b', 'gain-clay')
    c1.setState('resolved')
    const xor = new XorNode('x', [c1, c2])
    expect(xor.step(stubCtx).kind).toBe('done')
  })
  it('continue when all unresolved', () => {
    const c1 = new ActionNode('a', 'gain-wood'); const c2 = new ActionNode('b', 'gain-clay')
    const xor = new XorNode('x', [c1, c2])
    expect(xor.step(stubCtx).kind).toBe('continue')
  })
})
```

- [ ] **Step 2-6: 同 OrNode 模式**

实现：
```ts
step(ctx: EngineContext): NodeStepResult {
  const resolved = this.children.filter((c) => c.getState() === 'resolved').length
  if (resolved >= 1) return { kind: 'done' }
  return { kind: 'continue' }
}
protected cursorData() {
  return {
    childrenIds: this.children.map((c) => c.id),
    promptKey: this.promptKey,
    emittedChoices: this.emittedChoices,
    emittedPromptKey: this.emittedPromptKey,
    emittedPromptParams: this.emittedPromptParams,
    emittedRequest: this.emittedRequest,
  }
}
```

替换 engine.ts 里 `instanceof XorNode` 行为分支。Commit:
```bash
git add shared/engine/nodes/xor-node.ts shared/engine/nodes/__tests__/xor-node.test.ts shared/engine/engine.ts
git commit -m "refactor(engine): XorNode.step (PR2/5)"
```

---

### Task 9: OptionalNode 轻充血

**Files:**
- Modify: `shared/engine/nodes/optional-node.ts`
- Modify: `shared/engine/engine.ts`
- Create: `shared/engine/nodes/__tests__/optional-node.test.ts`

- [ ] **Step 1: 写测试**

```ts
// shared/engine/nodes/__tests__/optional-node.test.ts
import { describe, it, expect } from 'vitest'
import { OptionalNode } from '../optional-node'
import { ActionNode } from '../action-node'
import type { EngineContext } from '../../types'

const stubCtx: EngineContext = { resolveSubtree: () => {}, emitChoice: () => {} }

describe('OptionalNode.step', () => {
  it('done if not active (skipped)', () => {
    const child = new ActionNode('a', 'gain-wood')
    const opt = new OptionalNode('o', child)
    opt.setState('resolved')   // skipped — engine resolves directly
    expect(opt.step(stubCtx).kind).toBe('done')
  })
  it('continue if active and child unresolved', () => {
    const child = new ActionNode('a', 'gain-wood')
    const opt = new OptionalNode('o', child)
    opt.active = true
    expect(opt.step(stubCtx).kind).toBe('continue')
  })
  it('done if active and child resolved', () => {
    const child = new ActionNode('a', 'gain-wood')
    child.setState('resolved')
    const opt = new OptionalNode('o', child)
    opt.active = true
    expect(opt.step(stubCtx).kind).toBe('done')
  })
})
```

- [ ] **Step 2-6: 实现 + 替换 engine 派发 + commit**

```ts
// optional-node.ts step impl
step(ctx: EngineContext): NodeStepResult {
  if (this.getState() === 'resolved') return { kind: 'done' }
  if (this.active && this.child.getState() === 'resolved') return { kind: 'done' }
  return { kind: 'continue' }
}

protected cursorData() {
  return {
    childId: this.child.id,
    active: this.active,
    promptKey: this.promptKey,
    emittedChoices: this.emittedChoices,
    emittedPromptKey: this.emittedPromptKey,
    emittedPromptParams: this.emittedPromptParams,
    emittedRequest: this.emittedRequest,
  }
}
```

替换 engine.ts 里 OptionalNode 行为派发。Commit。

---

### Task 10: PR2 收口 — engine.ts 验证 + push

- [ ] **Step 1: 验证 engine.ts 中针对 5 个控制流节点的 `instanceof` 行为派发已删除**

```bash
# 数还剩多少 instanceof 用法
grep -c "node instanceof" shared/engine/engine.ts
```

预期：从 PR1 的 58 处降到 ~30-40 处（剩下的是 InteractionNode/ActionNode/ActivateCardNode/PlayerSwitchNode 的派发 + structural type guards，PR3-4 处理）。

- [ ] **Step 2: 跑完整本地 CI 矩阵**

```bash
pnpm run lint
pnpm run lint:i18n
pnpm run check:prompt-sync -- --strict
pnpm run check:reaches -- --strict
pnpm run check:no-dsl -- --strict
pnpm run check:catalog-types
pnpm run check:community-deck
pnpm run test:fast
pnpm run build
pnpm run check:bundle-size
pnpm run test:slow
```

All must pass (slow project zero regression is hard requirement).

- [ ] **Step 3: Push PR2**

```bash
git push origin sprint-S4b-rich-nodes
```

Wait for GitHub Actions CI to pass.

---

## PR3 — InteractionNode 重充血（Tasks 11–15）

最重的 PR：把 engine.ts 里 ~750 行 emit / cache / sourceCard / replace-aware label / applyInteractionRequest 搬到 `InteractionNode`。分 5 task 拆。

### Task 11: InteractionNode 接收 emit / cache 状态字段（搬数据，不搬行为）

**Files:**
- Modify: `shared/engine/nodes/interaction-node.ts`

- [ ] **Step 1: 加状态字段（先搬数据，行为留下次 commit）**

把 engine.ts 中以下私有字段搬到 InteractionNode（参考 engine.ts:100-106）：
- `pendingInteractionNodeId`（已是 InteractionNode 的 id，不需要单独存）
- `pendingInteractionActionId` → InteractionNode.pendingActionId
- `pendingInteractionOwnerNodeId` → InteractionNode.ownerNodeId
- `pendingInteractionContext` → InteractionNode.contextSnapshot

```ts
// shared/engine/nodes/interaction-node.ts
export class InteractionNode extends BaseNode {
  public choices: ActionChoiceOption[]
  public promptKey?: PromptKey
  public promptParams?: Record<string, unknown>
  public request?: InteractionRequest

  // S4b PR3: emit/cache state moved from engine.ts
  public pendingActionId?: string
  public ownerNodeId?: string
  public contextSnapshot?: Record<string, unknown>
  public lastEmittedChoices?: ActionChoiceOption[]   // replaces engine.lastEmittedChoice cache

  constructor(id: string, choices: ActionChoiceOption[], request?: InteractionRequest) {
    super(id, 'interaction')
    this.choices = choices
    this.request = request
  }

  // existing setChoice / resolve methods unchanged for this commit
  // ...
}
```

- [ ] **Step 2: engine.ts 改用节点字段**

替换 `this.pendingInteractionActionId = ...` → 通过 InteractionNode 实例 `node.pendingActionId = ...`；同理其他 3 个字段。

- [ ] **Step 3: 验证 TS + 测试**

```bash
pnpm exec tsc -b
pnpm exec vitest run shared/engine/__tests__/ --project fast
```

Expected: 0 errors / 0 fails (state moved, behavior preserved).

- [ ] **Step 4: Commit**

```bash
git add shared/engine/nodes/interaction-node.ts shared/engine/engine.ts
git commit -m "refactor(interaction-node): absorb pending state fields from engine (PR3/5 step 1)"
```

---

### Task 12: InteractionNode 接收 `emit()` 方法（applyInteractionRequest 搬入）

**Files:**
- Modify: `shared/engine/nodes/interaction-node.ts`
- Modify: `shared/engine/engine.ts`

- [ ] **Step 1: 把 engine.ts:222-285 的 `applyInteractionRequest` 搬到 InteractionNode.emit()**

engine.ts 中的 `applyInteractionRequest` private method 是 InteractionNode 派发 farm-select / selection / feed / animal-reorg / confirm-* kinds 时的核心入口。整体搬到 InteractionNode：

```ts
// interaction-node.ts (additions)
import type {
  InteractionRequest,
  ActionChoiceOption,
  // ... whatever applyInteractionRequest needs
} from '../../game/types'

export class InteractionNode extends BaseNode {
  // ... existing fields

  /**
   * S4b PR3: emit() builds and stores the choices/promptKey/request based on
   * the node's current request kind. Called by Engine.proceed when it needs
   * to surface this node as a 'choice' step. Replaces the engine-level
   * applyInteractionRequest method.
   */
  emit(args: {
    actionId?: string
    sourceCard?: string
    fallbackChoices?: ActionChoiceOption[]
  }): { choices: ActionChoiceOption[]; promptKey?: PromptKey; request?: InteractionRequest } {
    // (~200 lines copied from engine.ts:222-285 applyInteractionRequest body)
    // Each branch (farm-select / selection / feed / etc.) builds choices + promptKey
    // and writes them onto `this` plus returns them for the engine.
    // Detailed body is mechanical copy from engine.ts; subagent reads engine.ts:222-285
    // and pastes / adjusts `this.` references.
    if (this.request) {
      const kind = this.request.kind
      // ... 8 kind branches
    }
    return { choices: this.choices, promptKey: this.promptKey, request: this.request }
  }
}
```

注意：`emit()` 不调 engine 主循环，但需要访问 farm-related domain queries（farm-select kind 计算 selectableTiles）。**这是 S4a/S4b 协调点**：S4b 期间临时在 emit() 内部 `import { ... } from '../../logic/farm/*'` 加注释 `// TODO(S4a-merge): switch to playerBoard().farmyard.selectableTiles()`。

- [ ] **Step 2: engine.ts 改用 `node.emit(...)`**

`engine.ts:222` 的 `applyInteractionRequest` 私有方法，把所有 caller 改为：
```ts
const result = (node as InteractionNode).emit({ actionId, sourceCard, fallbackChoices })
```

然后删除 `engine.applyInteractionRequest` 本身。

- [ ] **Step 3: 验证 TS + 测试**

```bash
pnpm exec tsc -b
pnpm exec vitest run shared/engine/__tests__/ shared/actions/effects/__tests__/ server/__tests__/harvest-feed-session.test.ts server/__tests__/reorganize-engine-session.test.ts --project fast
```

Expected: 0 fails.

- [ ] **Step 4: Commit**

```bash
git add shared/engine/nodes/interaction-node.ts shared/engine/engine.ts
git commit -m "refactor(interaction-node): absorb emit() / applyInteractionRequest from engine (PR3/5 step 2)"
```

---

### Task 13: InteractionNode 接收 sourceCard / replace-aware label 私有方法

**Files:**
- Modify: `shared/engine/nodes/interaction-node.ts`
- Modify: `shared/engine/engine.ts`

- [ ] **Step 1: 把以下 engine.ts 私有方法整体搬到 InteractionNode**

参考前面 grep:
- `engine.ts:490` `attachChoiceLabel`
- `engine.ts:505` `getChoiceLabel`
- `engine.ts:539` `getNodeSourceCard`
- `engine.ts:563` `getOptionsSourceCard`
- `engine.ts:575` `resolveChoiceSourceCard`
- `engine.ts:736` `getReplaceAwareChoiceLabel`
- `engine.ts:714` `buildReplaceChoiceFlow`

每个方法搬入 InteractionNode 作为私有 method（`private getChoiceLabel(...)` 等）。

注意大部分这些方法接收 `node: InteractionNode` 作为参数；搬入 class 后改成 `this`。

- [ ] **Step 2: engine.ts 替换 caller**

每个 `this.getChoiceLabel(node, ...)` 调用改为 `node.getChoiceLabelInternal(...)`（暴露一个 wrapper public method 给 engine），或直接放 InteractionNode 内做 attach（更纯净）。

- [ ] **Step 3: 验证 TS + 测试**

```bash
pnpm exec tsc -b
pnpm exec vitest run shared/engine/__tests__/ --project fast
```

Expected: 0 fails.

- [ ] **Step 4: Commit**

```bash
git add shared/engine/nodes/interaction-node.ts shared/engine/engine.ts
git commit -m "refactor(interaction-node): absorb sourceCard + label methods (PR3/5 step 3)"
```

---

### Task 14: InteractionNode 接收 `step()` + `validateSelection()`，engine.ts 删 `applyInteractionRequest` 余下逻辑

**Files:**
- Modify: `shared/engine/nodes/interaction-node.ts`
- Modify: `shared/engine/engine.ts`
- Create: `shared/engine/nodes/__tests__/interaction-node.test.ts`

- [ ] **Step 1: 写 InteractionNode emit / resolve 单测**

```ts
// shared/engine/nodes/__tests__/interaction-node.test.ts
import { describe, it, expect } from 'vitest'
import { InteractionNode } from '../interaction-node'

describe('InteractionNode', () => {
  it('emit returns existing choices when no request kind', () => {
    const node = new InteractionNode('i', [{ value: 'confirm' }, { value: 'cancel' }])
    const result = node.emit({})
    expect(result.choices).toHaveLength(2)
  })

  it('resolve accepts known choice value', () => {
    const node = new InteractionNode('i', [{ value: 'confirm' }, { value: 'cancel' }])
    node.resolve('confirm')
    expect(node.getState()).toBe('resolved')
  })

  it('resolve blocks on unknown choice value', () => {
    const node = new InteractionNode('i', [{ value: 'confirm' }])
    node.resolve('invalid')
    expect(node.getState()).toBe('blocked')
  })

  it('emit for confirm-next-player kind builds confirm/cancel choices', () => {
    const node = new InteractionNode('i', [], { kind: 'confirm-next-player', nextPlayerIndex: 1 })
    const result = node.emit({})
    expect(result.choices.length).toBeGreaterThan(0)
    expect(result.choices.some((c) => c.value === 'confirm')).toBe(true)
  })
})
```

- [ ] **Step 2: 跑测试看哪个 fail (针对 emit kind 测试)**

```bash
pnpm exec vitest run shared/engine/nodes/__tests__/interaction-node.test.ts --project fast
```

emit 应已可用（Task 12 搬好），可能仅 'emit for confirm-next-player' 测试需要补：检查 emit 是否正确分发该 kind。

- [ ] **Step 3: 实现 step() + validateSelection() + cursorData()**

```ts
// interaction-node.ts (additions)
step(_ctx: EngineContext): NodeStepResult {
  // InteractionNode is a leaf waiting for player input. Engine routes to
  // emit() before reaching step (which surfaces 'choice' step result).
  // Once resolved, this returns 'done'; otherwise 'choice' to signal "wait".
  if (this.getState() === 'resolved') return { kind: 'done' }
  if (this.getState() === 'blocked') return { kind: 'blocked', reason: 'invalid choice' }
  return { kind: 'choice', nodeId: this.id }
}

/**
 * Validate a client-submitted choice value against the node's current
 * choices. Used by Engine.resolveChoice. Returns true if the value is
 * one of the emitted choice values (or a magic '__skip__' / '__cancel__'
 * sentinel where applicable).
 */
validateSelection(value: string): boolean {
  return this.choices.some((c) => c.value === value)
}

protected cursorData() {
  return {
    choices: this.choices,
    promptKey: this.promptKey,
    promptParams: this.promptParams,
    request: this.request,
    pendingActionId: this.pendingActionId,
    ownerNodeId: this.ownerNodeId,
    contextSnapshot: this.contextSnapshot,
    lastEmittedChoices: this.lastEmittedChoices,
  }
}
```

- [ ] **Step 4: engine.ts `proceed()` 主循环改用 `node.step(ctx)`**

替换 `instanceof InteractionNode` 行为派发为 `node.step(ctx)` + 处理返回的 `'choice'` kind。

- [ ] **Step 5: 跑测试**

```bash
pnpm exec vitest run shared/engine/nodes/__tests__/interaction-node.test.ts shared/engine/__tests__/ --project fast
```

Expected: 0 fails.

- [ ] **Step 6: Commit**

```bash
git add shared/engine/nodes/interaction-node.ts shared/engine/nodes/__tests__/interaction-node.test.ts shared/engine/engine.ts
git commit -m "refactor(interaction-node): step + validateSelection + cursorData (PR3/5 step 4)"
```

---

### Task 15: PR3 验证 engine.ts 已大幅瘦身 + push

- [ ] **Step 1: 量化 engine.ts 当前大小**

```bash
wc -l shared/engine/engine.ts
```

期望：从 PR1 的 2206 行降到 ≤ 1500 行（PR3 搬走 ~750 行）。

- [ ] **Step 2: 量化 instanceof 用法**

```bash
grep -c "node instanceof" shared/engine/engine.ts
```

期望：从 PR2 后的 ~30-40 处降到 ~15-25 处（InteractionNode 派发已删，剩 ActionNode/ActivateCardNode/PlayerSwitchNode 等留 PR4）。

- [ ] **Step 3: 跑完整本地 CI 矩阵 + slow project**

```bash
pnpm run lint
pnpm run lint:i18n
pnpm run check:prompt-sync -- --strict
pnpm run check:reaches -- --strict
pnpm run check:no-dsl -- --strict
pnpm run check:catalog-types
pnpm run check:community-deck
pnpm run test:fast
pnpm run build
pnpm run check:bundle-size
pnpm run test:slow
```

All must pass.

- [ ] **Step 4: Push PR3**

```bash
git push origin sprint-S4b-rich-nodes
```

Wait for GitHub Actions CI to pass.

---

## PR4 — ActionNode / ActivateCardNode / PlayerSwitchNode 中等充血（Tasks 16–20）

### Task 16: ActionNode `step()` + `emit()` + cursor

**Files:**
- Modify: `shared/engine/nodes/action-node.ts`
- Modify: `shared/engine/engine.ts`
- Create: `shared/engine/nodes/__tests__/action-node.test.ts`

- [ ] **Step 1: 写测试**

```ts
// shared/engine/nodes/__tests__/action-node.test.ts
import { describe, it, expect } from 'vitest'
import { ActionNode } from '../action-node'
import type { EngineContext } from '../../types'

const stubCtx: EngineContext = { resolveSubtree: () => {}, emitChoice: () => {} }

describe('ActionNode', () => {
  it('step returns continue if not yet executed', () => {
    const node = new ActionNode('a', 'gain-wood')
    expect(node.step(stubCtx).kind).toBe('continue')
  })

  it('step returns done after resolve', () => {
    const node = new ActionNode('a', 'gain-wood')
    node.setState('resolved')
    expect(node.step(stubCtx).kind).toBe('done')
  })

  it('cursorData includes actionId + params + sourceCard', () => {
    const node = new ActionNode('a', 'gain-wood', 'A123', { wood: 2 })
    const cursor = node.toCursor()
    expect(cursor.data.actionId).toBe('gain-wood')
    expect(cursor.data.sourceCard).toBe('A123')
    expect(cursor.data.params).toEqual({ wood: 2 })
  })
})
```

- [ ] **Step 2: 跑测试看失败**

- [ ] **Step 3: 实现 step + cursorData**

```ts
// action-node.ts (additions)
step(_ctx: EngineContext): NodeStepResult {
  if (this.getState() === 'resolved') return { kind: 'done' }
  return { kind: 'continue' }
}

protected cursorData() {
  return {
    actionId: this.actionId,
    sourceCard: this.sourceCard,
    params: this.params,
    actionContext: this.actionContext,
    effectPreview: this.effectPreview,
    choiceLabelKey: this.choiceLabelKey,
    choiceLabelParams: this.choiceLabelParams,
    beforePhaseResolved: this.beforePhaseResolved,
  }
}
```

`emit()` 在 ActionNode 上不需要（叶子动作不 emit choice），所以不实现（base 默认 `step` 即可）。

- [ ] **Step 4: 跑测试看通过**

- [ ] **Step 5: engine.ts 替换 ActionNode 行为派发为 `node.step(ctx)`**

注意：engine.ts 里 ActionNode 路径还有 `getActionEffectPreview / sanitizePreviewResources / mergePreviewResources / collectOrderedActionNodes / getSequenceEffectPreview / getNodeEffectPreview` 等 preview 系列 helper（参考前面 grep）。这些可在 PR5 收口时再下沉到节点（避免 PR4 太大）。

- [ ] **Step 6: Commit**

```bash
git add shared/engine/nodes/action-node.ts shared/engine/nodes/__tests__/action-node.test.ts shared/engine/engine.ts
git commit -m "refactor(action-node): step + cursorData (PR4/5 step 1)"
```

---

### Task 17: ActivateCardNode `step()` + cursor

**Files:**
- Modify: `shared/engine/nodes/activate-card-node.ts`
- Modify: `shared/engine/engine.ts`

- [ ] **Step 1: 实现 step + cursorData**

```ts
// activate-card-node.ts (additions)
step(_ctx: EngineContext): NodeStepResult {
  if (this.getState() === 'resolved') return { kind: 'done' }
  return { kind: 'continue' }
}

protected cursorData() {
  return {
    listenerId: this.listenerId,
    cardId: this.cardId,
    phase: this.phase,
    actionId: this.actionId,
    event: this.event,
  }
}
```

- [ ] **Step 2: engine.ts 替换 ActivateCardNode 行为派发**

- [ ] **Step 3: 跑测试**

```bash
pnpm exec vitest run shared/engine/__tests__/ --project fast
```

- [ ] **Step 4: Commit**

```bash
git add shared/engine/nodes/activate-card-node.ts shared/engine/engine.ts
git commit -m "refactor(activate-card-node): step + cursorData (PR4/5 step 2)"
```

---

### Task 18: PlayerSwitchNode `step()` + cursor

**Files:**
- Modify: `shared/engine/nodes/player-switch-node.ts`
- Modify: `shared/engine/engine.ts`

- [ ] **Step 1: 实现 step + cursorData**

```ts
// player-switch-node.ts (additions)
step(_ctx: EngineContext): NodeStepResult {
  if (this.getState() === 'resolved') return { kind: 'done' }
  // PlayerSwitch yields engine to emit playerSwitch step then resolves.
  return { kind: 'playerSwitch', targetPlayerId: this.targetPlayerId }
}

protected cursorData() {
  return { targetPlayerId: this.targetPlayerId }
}
```

- [ ] **Step 2: engine.ts 改用 `node.step(ctx)` 处理 PlayerSwitchNode 派发**

- [ ] **Step 3: 跑测试 + commit**

```bash
pnpm exec vitest run shared/engine/__tests__/ server/__tests__/*PlayerSwitch*.test.ts --project fast
git add shared/engine/nodes/player-switch-node.ts shared/engine/engine.ts
git commit -m "refactor(player-switch-node): step + cursorData (PR4/5 step 3)"
```

---

### Task 19: engine.ts `proceed()` 主循环不再 `instanceof`

**Files:**
- Modify: `shared/engine/engine.ts`

- [ ] **Step 1: 重构 `proceed()` 主循环 (engine.ts:1178+)**

替换 `proceed()` 内的 `if (node instanceof X)` 多分支为单一 `node.step(this.makeContext())`：

```ts
// engine.ts proceed (after PR4)
proceed(context: EngineContext): EngineStepResult {
  while (true) {
    const node = this.findNextUnresolved()
    if (!node) return { kind: 'done' }

    const stepCtx = this.makeNodeContext()
    const stepResult = node.step(stepCtx)

    switch (stepResult.kind) {
      case 'done':
        this.resolveSubtree(node)
        continue
      case 'continue':
        continue
      case 'blocked':
        return { kind: 'blocked', reason: stepResult.reason }
      case 'choice': {
        // ... handle choice (delegates to InteractionNode emit)
        return { kind: 'choice', nodeId: stepResult.nodeId }
      }
      case 'playerSwitch':
        return { kind: 'playerSwitch', targetPlayerId: stepResult.targetPlayerId }
      case 'request':
        // ... wrap into 'choice' step via InteractionNode
        return { kind: 'choice', nodeId: node.id }
    }
  }
}
```

- [ ] **Step 2: 验证 grep `node instanceof` 在 proceed 主循环不再出现**

```bash
sed -n '/^  proceed/,/^  [a-zA-Z]\+(/p' shared/engine/engine.ts | grep -c "instanceof"
```

期望：0（structural type guards 仍在 helper methods，不在 proceed 主循环）。

- [ ] **Step 3: 跑全套 engine 测试**

```bash
pnpm exec vitest run shared/engine/__tests__/ --project fast
```

- [ ] **Step 4: Commit**

```bash
git add shared/engine/engine.ts
git commit -m "refactor(engine): proceed() dispatches via node.step (PR4/5 step 4)"
```

---

### Task 20: PR4 验证 + push

- [ ] **Step 1: 量化 engine.ts**

```bash
wc -l shared/engine/engine.ts
grep -c "node instanceof" shared/engine/engine.ts
```

期望：≤ 900 行 / instanceof 仅剩 structural type guards (~10-15 处)。

- [ ] **Step 2: 跑完整本地 CI + slow project**

```bash
pnpm run lint
pnpm run lint:i18n
pnpm run check:prompt-sync -- --strict
pnpm run check:reaches -- --strict
pnpm run check:no-dsl -- --strict
pnpm run check:catalog-types
pnpm run check:community-deck
pnpm run test:fast
pnpm run build
pnpm run check:bundle-size
pnpm run test:slow
```

All must pass.

- [ ] **Step 3: Push PR4**

```bash
git push origin sprint-S4b-rich-nodes
```

Wait for GitHub Actions CI to pass.

---

## PR5 — Engine public 收敛 + cursor round-trip + 收口（Tasks 21–24）

### Task 21: 删 Engine public 9 个内部化方法

**Files:**
- Modify: `shared/engine/engine.ts`

- [ ] **Step 1: 把 9 个 public 方法改为 private 或删除**

对照 spec §5.4 表格 + 前面 grep：
- `peekPendingChoiceFromComposite` (line 118) → 内部化（InteractionNode）
- `getLastComputedCosts` (line 141) → 内部化（ActionNode 私有 + 删 wrapper）
- `getPendingInteractionContext` (line 151) → 内部化（InteractionNode 已 absorb）
- `injectBeforeNodes` (line 158) → 内部化（dispatcher.ts 私有）
- `injectInteraction` (line 189) → 删（用 InteractionNode 静态工厂）
- `buildFlowNodePublic` (line 268) → 删（节点 class 静态工厂）
- `prependFlow` (line 272) → 内部化（EngineStack）
- `hasPendingChoiceCompositeAncestor` (line 1032) → 删
- `insertFlowAfterPendingChoice` (line 2200) → 内部化（InteractionNode）

每个方法的调用方迁移：
- 找出每方法的 caller（grep 仓库 `Engine.prototype.<name>` 或 `engine\.<name>(`）
- 改用 the 6 保留 public 方法 + 节点 class 静态工厂
- 删除 engine 上的公开方法

- [ ] **Step 2: 改 `proceed` 改名 `step`**

替换 `proceed()` → `step()`（全仓库 grep `engine.proceed` codemod）：

```bash
grep -rln "\.proceed(" shared/ server/ client/ tests/ | xargs sed -i 's/\.proceed(/\.step(/g'
```

- [ ] **Step 3: 跑测试**

```bash
pnpm exec tsc -b
pnpm exec vitest run --project fast
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(engine): collapse public surface 15 → 6 (PR5/5 step 1)"
```

---

### Task 22: cursor round-trip 单测覆盖每节点

**Files:**
- Create: `shared/engine/nodes/__tests__/cursor-roundtrip.test.ts`

- [ ] **Step 1: 写每节点 round-trip 测试**

```ts
// shared/engine/nodes/__tests__/cursor-roundtrip.test.ts
import { describe, it, expect } from 'vitest'
import {
  ActionNode, InteractionNode, SequenceNode, ParallelNode, OrNode, XorNode,
  OptionalNode, ActivateCardNode, PlayerSwitchNode,
} from '../index'

/** Reconstruct a node from its cursor — uses a small registry-like dispatcher
 * keyed on cursor.type. Tests verify every node round-trips equal-shape data. */
function fromCursor(cursor: any): any {
  switch (cursor.type) {
    case 'action':
      return new ActionNode(
        cursor.id, cursor.data.actionId, cursor.data.sourceCard, cursor.data.params,
        cursor.data.choiceLabelKey, cursor.data.choiceLabelParams, cursor.data.actionContext,
        cursor.data.effectPreview,
      )
    case 'interaction': {
      const n = new InteractionNode(cursor.id, cursor.data.choices, cursor.data.request)
      n.promptKey = cursor.data.promptKey
      n.promptParams = cursor.data.promptParams
      n.pendingActionId = cursor.data.pendingActionId
      n.ownerNodeId = cursor.data.ownerNodeId
      n.contextSnapshot = cursor.data.contextSnapshot
      n.lastEmittedChoices = cursor.data.lastEmittedChoices
      return n
    }
    case 'sequence':
      return new SequenceNode(cursor.id, [])  // children rebuilt by parent traversal
    case 'parallel':
      return new ParallelNode(cursor.id, [])
    case 'or': {
      const n = new OrNode(cursor.id, [], cursor.data.promptKey)
      n.emittedChoices = cursor.data.emittedChoices
      n.emittedRequest = cursor.data.emittedRequest
      return n
    }
    case 'xor': {
      const n = new XorNode(cursor.id, [], cursor.data.promptKey)
      n.emittedChoices = cursor.data.emittedChoices
      n.emittedRequest = cursor.data.emittedRequest
      return n
    }
    case 'optional': {
      const dummy = new ActionNode('dummy', 'noop')
      const n = new OptionalNode(cursor.id, dummy, cursor.data.promptKey)
      n.active = cursor.data.active
      return n
    }
    case 'activateCard':
      return new ActivateCardNode(
        cursor.id, cursor.data.listenerId, cursor.data.cardId,
        cursor.data.phase, cursor.data.actionId, cursor.data.event,
      )
    case 'playerSwitch':
      return new PlayerSwitchNode(cursor.id, cursor.data.targetPlayerId)
    default:
      throw new Error(`unknown cursor type: ${cursor.type}`)
  }
}

describe('cursor round-trip per node type', () => {
  it('ActionNode round-trips actionId / sourceCard / params', () => {
    const node = new ActionNode('a', 'gain-wood', 'A123', { wood: 2 })
    const cursor = node.toCursor()
    const restored = fromCursor(cursor)
    expect(restored.actionId).toBe('gain-wood')
    expect(restored.sourceCard).toBe('A123')
    expect(restored.params).toEqual({ wood: 2 })
  })

  it('InteractionNode round-trips choices + promptKey + request', () => {
    const node = new InteractionNode('i', [{ value: 'confirm' }], { kind: 'choice', options: [] })
    node.promptKey = 'ui.confirmNextPlayer'
    const cursor = node.toCursor()
    const restored = fromCursor(cursor)
    expect(restored.choices).toEqual([{ value: 'confirm' }])
    expect(restored.promptKey).toBe('ui.confirmNextPlayer')
    expect(restored.request?.kind).toBe('choice')
  })

  it('SequenceNode round-trips type + state', () => {
    const node = new SequenceNode('s', [])
    node.setState('resolved')
    const cursor = node.toCursor()
    expect(cursor.type).toBe('sequence')
    expect(cursor.state).toBe('resolved')
  })

  it('ParallelNode round-trips type', () => {
    const node = new ParallelNode('p', [])
    expect(node.toCursor().type).toBe('parallel')
  })

  it('OrNode round-trips emittedChoices', () => {
    const node = new OrNode('o', [], 'ui.chooseOne')
    node.emittedChoices = [{ value: 'A' }, { value: 'B' }]
    const restored = fromCursor(node.toCursor())
    expect(restored.emittedChoices).toEqual([{ value: 'A' }, { value: 'B' }])
  })

  it('XorNode round-trips emittedChoices', () => {
    const node = new XorNode('x', [], 'ui.chooseOne')
    node.emittedChoices = [{ value: 'A' }]
    const restored = fromCursor(node.toCursor())
    expect(restored.emittedChoices).toEqual([{ value: 'A' }])
  })

  it('OptionalNode round-trips active flag', () => {
    const dummy = new ActionNode('a', 'gain-wood')
    const node = new OptionalNode('o', dummy, 'ui.optional')
    node.active = true
    const restored = fromCursor(node.toCursor())
    expect(restored.active).toBe(true)
  })

  it('ActivateCardNode round-trips cardId + phase', () => {
    const node = new ActivateCardNode('ac', 'L1', 'A123', 'before', 'gain-wood', { foo: 1 })
    const restored = fromCursor(node.toCursor())
    expect(restored.cardId).toBe('A123')
    expect(restored.phase).toBe('before')
  })

  it('PlayerSwitchNode round-trips targetPlayerId', () => {
    const node = new PlayerSwitchNode('ps', 'p2')
    const restored = fromCursor(node.toCursor())
    expect(restored.targetPlayerId).toBe('p2')
  })
})
```

- [ ] **Step 2: 跑测试**

```bash
pnpm exec vitest run shared/engine/nodes/__tests__/cursor-roundtrip.test.ts --project fast
```

Expected: 9 tests pass (1 per node).

- [ ] **Step 3: Commit**

```bash
git add shared/engine/nodes/__tests__/cursor-roundtrip.test.ts
git commit -m "test(engine): cursor round-trip per node type (PR5/5 step 2)"
```

---

### Task 23: Engine public surface 测试 + flowNodeCounter 整理

**Files:**
- Create: `shared/engine/nodes/__tests__/engine-public-surface.test.ts`
- Modify: `shared/engine/engine.ts` (clean up flowNodeCounter scope)

- [ ] **Step 1: 写 public surface 测试**

```ts
// shared/engine/nodes/__tests__/engine-public-surface.test.ts
import { describe, it, expect } from 'vitest'
import { Engine } from '../../engine'

describe('Engine public surface', () => {
  it('exposes exactly 6 own enumerable methods', () => {
    const ALLOWED = new Set([
      'step',
      'resolveChoice',
      'peekNextUnresolved',
      'peekInteraction',
      'snapshot',
      'restore',
    ])

    const protoMethods = Object.getOwnPropertyNames(Engine.prototype)
      .filter((name) => name !== 'constructor')
      .filter((name) => typeof (Engine.prototype as any)[name] === 'function')
      .filter((name) => !name.startsWith('_'))   // allow underscore convention for "soft private"

    // Filter out methods that are arguably structural (TypeScript doesn't have
    // strict private at runtime). Anything not in ALLOWED that's still public
    // is a S4b regression.
    const unexpected = protoMethods.filter((name) => !ALLOWED.has(name))

    if (unexpected.length > 0) {
      // Provide a useful failure message
      throw new Error(`Engine has unexpected public methods: ${unexpected.join(', ')}. ` +
        `S4b DoD requires public surface to be exactly: ${[...ALLOWED].join(', ')}.`)
    }

    expect(protoMethods.length).toBeLessThanOrEqual(6)
    expect(unexpected).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 跑测试看是否通过**

```bash
pnpm exec vitest run shared/engine/nodes/__tests__/engine-public-surface.test.ts --project fast
```

如果 fail，回到 Task 21 把残留 public method 改 private 或删。

- [ ] **Step 3: 整理 `flowNodeCounter` 状态**

`flowNodeCounter` (engine.ts:106) 是节点 id 生成器。S4b 收口要把它的访问收敛 — 不让外部碰到。如果有任何地方外部 import 了，改成 private 字段 + getter only。

- [ ] **Step 4: 量化最终 engine.ts**

```bash
wc -l shared/engine/engine.ts
grep -c "node instanceof" shared/engine/engine.ts
```

期望：
- engine.ts ≤ 700 行（DoD D10）
- `node instanceof` 仅剩 structural type guards (~5-10 处)；engine.ts 中 `switch (node.type)` 0 次 (DoD D14)

- [ ] **Step 5: Commit**

```bash
git add shared/engine/nodes/__tests__/engine-public-surface.test.ts shared/engine/engine.ts
git commit -m "refactor(engine): public surface guard test + flowNodeCounter scope (PR5/5 step 3)"
```

---

### Task 24: PR5 收口 — 完整 DoD D10–D16 + S4b progress doc + push

**Files:**
- Create: `docs/sprint-S4b-progress.md`
- Modify: `docs/ENGINE_NEW_ARCHITECTURE.md` §15 S4

- [ ] **Step 1: 跑完整本地 CI + slow project 验证零回归**

```bash
pnpm run lint
pnpm run lint:i18n
pnpm run check:prompt-sync -- --strict
pnpm run check:reaches -- --strict
pnpm run check:no-dsl -- --strict
pnpm run check:catalog-types
pnpm run check:community-deck
pnpm run test:fast
pnpm run build
pnpm run check:bundle-size
pnpm run test:slow
```

所有都必须过。

- [ ] **Step 2: 验证 DoD D10–D16**

```bash
# D10: engine.ts ≤ 700
echo "D10: $(wc -l < shared/engine/engine.ts) lines (target ≤ 700)"

# D11: nodes/*.ts 11 文件 + nodes.ts 不存在
ls shared/engine/nodes/*.ts | wc -l    # expect ≥ 11 (10 node classes + base + index)
test ! -f shared/engine/nodes.ts && echo "D11 ✅ old nodes.ts deleted"

# D12: Engine public 接口 ≤ 6 (verified by Task 23 test)
pnpm exec vitest run shared/engine/nodes/__tests__/engine-public-surface.test.ts --project fast

# D13: 节点 type discriminator 保字符串 (cursor round-trip 测试 Task 22)
pnpm exec vitest run shared/engine/nodes/__tests__/cursor-roundtrip.test.ts --project fast

# D14: engine.ts 中 switch (node.type) 0 次
grep -c "switch.*node\.type" shared/engine/engine.ts    # expect 0

# D15: cursor round-trip 9+ 例 (Task 22 has 9 tests, one per node)
# (already verified in D13 above)

# D16: 强制 green 子集 + integration zero regression (verified in Step 1)
```

- [ ] **Step 3: 创建 `docs/sprint-S4b-progress.md`**

```markdown
# Sprint S4b — Progress

## Status — completed YYYY-MM-DD

S4b (rich-node engine) refactor — all 24 tasks landed across 5 PRs.

### DoD verification (D10-D16)

- D10 ✅ shared/engine/engine.ts: 2206 → <final> lines (target ≤ 700)
- D11 ✅ shared/engine/nodes/*.ts: 11 files (10 node classes + index)
       shared/engine/nodes.ts: deleted
- D12 ✅ Engine public surface: 6 methods (step / resolveChoice /
       peekNextUnresolved / peekInteraction / snapshot / restore)
- D13 ✅ Node type discriminator preserved as string (cursor round-trip
       tests pass per node)
- D14 ✅ engine.ts contains 0 `switch (node.type)` occurrences
- D15 ✅ cursor round-trip unit tests cover all 9 node types
- D16 ✅ test:fast + test:slow zero regression (254 single-card tests)

### engine.ts metric reduction

- Lines: 2206 (PR1 start) → <final> (PR5 end)
- `instanceof` dispatch sites: 58 (PR1 start) → ~5-10 (PR5 end, all
  structural type guards in helper queries)
- Public methods: 15 (PR1 start) → 6 (PR5 end)

### Lines absorbed by each node

- Light (Sequence/Parallel/Or/Xor/Optional): ~50 LOC each (5 × 50 = ~250)
- Medium (Action/ActivateCard/PlayerSwitch): ~150 LOC each (3 × 150 = ~450)
- Heavy (Interaction): ~750 LOC (emit/cache/sourceCard/label/applyInteraction)

Total absorbed by nodes: ~1450 LOC. engine.ts retains step loop +
EngineStack + snapshot/restore + resolveChoice routing + flowNodeCounter
+ structural helpers (~700 LOC).

### S4 cross-sprint coordination

- S4a (domain layer) ran in parallel in `.worktree/sprint-S4`
- During S4b InteractionNode.emit() temporarily imported from
  `../../logic/farm/*` for farm-select kind tile computation; this is
  the only S4a/S4b crossing point per spec §6.1
- S4 closeout commit (after both S4a and S4b merge to main) does the
  ~3-file codemod to switch InteractionNode to `playerBoard().farmyard.selectableTiles()`
```

填入实际数据从 Step 2 输出。

- [ ] **Step 4: 更新 `ENGINE_NEW_ARCHITECTURE.md` §15 S4**

如果 S4a 已合 main 标了 ✅，就把 §15 S4 标题改为 ✅ S4a + S4b 完成。否则留待 S4 总收口时一并标。

加总结块（紧跟 S4b 标题之后）：

```markdown
> **S4b 完成总结**（详见 `docs/sprint-S4b-progress.md`）
>
> - ✅ engine.ts 2206 → <final> 行（≤ 700 目标达成）
> - ✅ Engine public 接口 15 → 6（step / resolveChoice / peekNextUnresolved / peekInteraction / snapshot / restore）
> - ✅ nodes/*.ts 11 文件（每节点一文件 + BaseNode 基类）
> - ✅ 节点 type discriminator 保字符串供序列化（cursor round-trip 9 节点全覆盖）
> - ✅ engine.ts 中 switch (node.type) 0 次
> - ✅ test:fast + test:slow 零回归
```

- [ ] **Step 5: Commit + push**

```bash
git add docs/sprint-S4b-progress.md docs/ENGINE_NEW_ARCHITECTURE.md
git commit -m "$(cat <<'EOF'
docs(sprint-s4b): closeout — DoD D10-D16 all green

S4b (rich-node engine) complete:
- engine.ts: 2206 → <final> lines (≤ 700 target met)
- Engine public surface: 15 → 6 methods
- 11 node files in shared/engine/nodes/ (one per class + base + index)
- Node type discriminator preserved as serialization key (round-trip
  tests per node type)
- 0 `switch (node.type)` occurrences in engine.ts
- test:fast + test:slow zero regression

Heavy InteractionNode absorbs ~750 lines of emit/cache/sourceCard/
label logic; control-flow nodes go light (~50 lines each); Action/
ActivateCard/PlayerSwitch go medium (~150 lines each). Engine retains
step loop, EngineStack, snapshot/restore, resolveChoice routing,
flowNodeCounter, and structural type-guard helpers.

S4a (domain layer) runs in the sibling sprint-S4-domain-rich-nodes
worktree. S4 cross-sprint codemod (~3 files in InteractionNode.emit())
runs as the S4 closeout commit on main after both S4a and S4b merge.
EOF
)"

git push origin sprint-S4b-rich-nodes
```

- [ ] **Step 6: 开 PR `sprint-S4b-rich-nodes` → main**

```bash
gh pr create --title "S4b: rich-node engine — engine.ts shrinks 2206 → ~700 (PR1-5 squashed)" --body "$(cat <<'EOF'
## Summary
- Split nodes.ts into nodes/*.ts (11 files, one class each)
- Three-tier richness: light control-flow (Sequence/Parallel/Or/Xor/Optional),
  medium leaf-execution (Action/ActivateCard/PlayerSwitch), heavy interaction
  (InteractionNode absorbs emit/cache/sourceCard/replace-aware label)
- Engine public surface 15 → 6 methods
- engine.ts 2206 → <final> lines, 0 `switch (node.type)` dispatch

## DoD verification
- D10 ✅ engine.ts ≤ 700
- D11 ✅ nodes/*.ts 11 files
- D12 ✅ public methods = 6
- D13 ✅ type discriminator preserved (cursor round-trip)
- D14 ✅ 0 `switch (node.type)`
- D15 ✅ 9-node cursor round-trip tests
- D16 ✅ test:fast + test:slow zero regression

## Test plan
- [x] All 5 PRs separately CI-green
- [x] Slow project (254 single-card tests) zero regression
- [x] cursor round-trip per node type
- [x] Engine public surface guard test
EOF
)"
```

Wait for GitHub Actions CI to pass on the PR before requesting review.

---

## Self-Review Checklist (run after writing the plan, fix inline)

**1. Spec coverage:**
- §5.1 三档充血 ✅ Tasks 5-9 (light), Tasks 11-14 (heavy), Tasks 16-18 (medium)
- §5.2 文件骨架 11 文件 ✅ Tasks 1-3
- §5.3 engine.ts 瘦身去向 ✅ Tasks 11-19 (each section absorbed by named node)
- §5.4 Engine public 15 → 6 ✅ Task 21 + Task 23 测试
- §5.5 节点 type discriminator 保字符串 ✅ Task 22 cursor round-trip
- §5.6 PR 拆分 ✅ PR1 = T1-4 / PR2 = T5-10 / PR3 = T11-15 / PR4 = T16-20 / PR5 = T21-24
- §6 S4a/S4b 协调 ✅ Task 12 InteractionNode.emit() 注释 + S4 收口 codemod
- §7.2 测试新增 ✅ 8 unit tests + 1 cursor round-trip + 1 public surface guard
- §8.2 DoD D10-D16 ✅ Task 24 verification

**2. Placeholder scan:** progress doc 模板的 `<final>` 是运行时填入的实际数字，符合"runtime substitution placeholder"——非违规。每个 task 步骤都有 actual code blocks 或 commands。

**3. Type consistency:**
- `BaseNode.step()` 抽象签名（Task 1）→ 子类 `step(ctx)` 实现（Tasks 5-9, 14, 16-18）签名一致
- `InteractionNode.emit()` 在 Task 12 引入 → Task 14 `step()` 内调用
- `cursorData()` 抽象（Task 1）→ 各子类实现（每 task）
- `EngineContext` 类型在 Task 1 引入 → 所有节点 `step(ctx)` 用同一个

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-05-sprint-S4b-rich-nodes-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
