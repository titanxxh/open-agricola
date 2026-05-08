# Sprint S4c: Engine API Convergence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Engine 公开方法收敛到 6 个，删除 3 个 snapshot mirror 字段，engine.ts 单文件降到 ≤600 行。

**Architecture:** 六步串行 PR：先更新 guard（PR1），再删 mirror 字段（PR2），再扩展 EngineStack + 迁移调用点（PR3），再收敛 Engine 公开 API（PR4），再文件拆分（PR5），最后 closeout（PR6）。engine.ts 瘦身靠把 ~30 个私有方法提取为接受 `EngineInternals` 参数的模块级函数。

**Tech Stack:** TypeScript、Vitest（`pnpm test:fast`）、ESLint（`pnpm run lint`）

**Spec:** `docs/superpowers/specs/2026-05-06-sprint-S4c-design.md`

**Setup:** 在新 worktree 开工（`git worktree add .worktree/sprint-S4c sprint-S4c`，先从 main 创建分支）。

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `shared/engine/engine.ts` | Modify | 字段声明 + 6 公开方法外壳 + constructor/snapshot/restore |
| `shared/engine/engine-internals.ts` | **Create** | `EngineInternals` interface（PR5 引入） |
| `shared/engine/engine-utils.ts` | **Create** | 私有工具函数（从 engine.ts 提取 ~30 个私有方法，PR5） |
| `shared/engine/engine-proceed.ts` | **Create** | `engineProceed()` 函数（PR5） |
| `shared/engine/engine-resolve.ts` | **Create** | `engineResolveChoice()` 函数（PR5） |
| `shared/engine/engine-stack.ts` | Modify | 扩展 4 query + 1 write 方法（PR3） |
| `shared/engine/nodes/__tests__/engine-public-surface.test.ts` | Modify | guard 更新（PR1、PR4、PR6） |
| `shared/session/session-core.ts` | Modify | 5 处调用点迁移（PR3） |
| `shared/session/phases/round.ts` | Modify | 2 处调用点迁移（PR4） |
| `docs/ENGINE_NEW_ARCHITECTURE.md` | Modify | §15 S4c 收口记录（PR6） |

---

## Task 1（PR1）：更新 public surface guard（目标状态，令其 fail）

**Files:**
- Modify: `shared/engine/nodes/__tests__/engine-public-surface.test.ts`

**背景：** 此 test 文件位于 `shared/engine/nodes/__tests__/engine-public-surface.test.ts`（不是 `shared/engine/__tests__/`）。当前 PUBLIC_API 有 14 个方法，PRIVATE_HELPERS 有 25 个，test 锁定合集。PR1 把 PUBLIC_API 改为 6 个目标方法，让第一个 test 立即 fail——后续 PR 实现完成后 pass。

- [ ] **Step 1: 修改 PUBLIC_API 为 6 个目标方法，删除 "flags deferred" 测试**

将 `shared/engine/nodes/__tests__/engine-public-surface.test.ts` 改为：

```typescript
import { describe, expect, it } from 'vitest'
import { Engine } from '../../engine'

/**
 * S4c — Engine surface guard (target: 6 public methods).
 *
 * PR1 sets the target. Tests fail until PR4+PR5 internalize the 8 methods.
 * Update PUBLIC_API here when methods are intentionally added/removed.
 * Update PRIVATE_HELPERS when private implementation methods change.
 */
describe('Engine surface guard', () => {
  const PUBLIC_API = [
    'injectBeforeFlows',
    'injectInteraction',
    'proceed',
    'resolveChoice',
    'restore',
    'snapshot',
  ]

  // Implementation-detail methods that live on the prototype because TS `private`
  // is compile-time only. Listed here so the guard fails loudly on accidental rename
  // or new private addition. Does NOT count toward public-API surface.
  const PRIVATE_HELPERS = [
    'applyFallbackSourceCardToFlow',
    'applyInteractionRequest',
    'buildActivateCardNodes',
    'buildChoiceExecutionContext',
    'buildFlowNode',
    'buildFollowUpNodes',
    'buildListenerEvent',
    'cloneNode',
    'collectNodeIds',
    'collectOrderedActionNodes',
    'findActionNode',
    'findInteractionNode',
    'findPairedInteractionNode',
    'getActionEffectPreview',
    'getNodeEffectPreview',
    'getSequenceEffectPreview',
    'hasPendingChoiceCompositeAncestor',
    'insertFlowAfterPendingChoice',
    'maybeBuildChoiceCandidates',
    'mergeContextIntoFlow',
    'mergePreviewResources',
    'normalizeFollowUpAction',
    'parseFollowUpAction',
    'peekInteraction',
    'peekInteractionHost',
    'peekNextUnresolved',
    'peekPendingChoiceFromComposite',
    'prependFlow',
    'resolveSubtree',
    'resolveTrueAction',
    'sanitizePreviewResources',
    'snapshotCompositeEmit',
  ]

  it('public API matches the S4c target surface (6 methods)', () => {
    const proto = Engine.prototype
    const ownMethods = Object.getOwnPropertyNames(proto)
      .filter((name) => name !== 'constructor')
      .filter((name) => typeof (proto as unknown as Record<string, unknown>)[name] === 'function')
      .sort()

    const expected = [...PUBLIC_API, ...PRIVATE_HELPERS].sort()
    expect(ownMethods).toEqual(expected)
  })

  it('public API count is exactly 6', () => {
    expect(PUBLIC_API.length).toBe(6)
  })
})
```

- [ ] **Step 2: 运行 guard test，确认第一个 test 故意 fail**

```bash
pnpm exec vitest run shared/engine/nodes/__tests__/engine-public-surface.test.ts --reporter=verbose
```

预期：第一个 test `public API matches the S4c target surface` **FAIL**（因为 engine.ts 还有 14 个公开方法 + 更多私有方法），第二个 test pass（PUBLIC_API.length === 6 ✓）。

- [ ] **Step 3: 运行全量 test:fast 确认其他测试不受影响**

```bash
pnpm test:fast 2>&1 | tail -5
```

预期：345 files passed（除了 engine-public-surface.test.ts 里的 1 个 test fail）。

- [ ] **Step 4: Commit**

```bash
git add shared/engine/nodes/__tests__/engine-public-surface.test.ts
git commit -m "test(engine): update public surface guard to S4c target (6 methods) — intentional fail"
```

---

## Task 2（PR2）：删除 3 个 mirror 字段 + snapshot shape 迁移

**Files:**
- Modify: `shared/engine/engine.ts`（字段声明、injectInteraction、applyInteractionRequest、resolveChoice、snapshot、restore）

**背景：** S4b PR3 已将权威 pending 状态移到 `InteractionNode`（`pendingActionId/ownerNodeId/contextSnapshot`）。engine.ts 保留了 `pendingInteractionActionId`、`pendingInteractionOwnerNodeId`、`pendingInteractionContext` 3 个冗余 mirror 字段，仅为了 snapshot 顶层 shape。`pendingInteractionNodeId` 保留为内部运行时状态（不是 mirror）。

Snapshot 变更：删除 4 个顶层字段，`choiceData` 扩展携带 `pendingActionId/ownerNodeId/contextSnapshot`（从 InteractionNode 读）。`restore()` 从 `choiceData.id` 重建 `pendingInteractionNodeId`，从 `choiceData.pendingActionId` 判断合成帧。

**注意：** `stats-gained-pseudo-session.test.ts` 在 S4b PR5 已改为通过 `peekInteractionHost()` 访问，不依赖 mirror 字段，无需修改。

- [ ] **Step 1: 删除 3 个 mirror 字段声明**

在 `shared/engine/engine.ts` 第 119-124 行，删除 3 个字段声明（保留 `pendingInteractionNodeId`）：

```typescript
// 保留（内部状态）:
private pendingInteractionNodeId: string | null = null

// 删除这 3 个:
// private pendingInteractionActionId: string | null = null
// private pendingInteractionOwnerNodeId: string | null = null
// private pendingInteractionContext: Pick<...> | null = null
```

- [ ] **Step 2: 修改 snapshot() — 删除顶层 mirror 字段，扩展 choiceData**

找到 `snapshot()` 方法（L857），将其修改为：

```typescript
snapshot() {
  const nodes = this.tree.allNodes()
  const nodeStates = nodes.map((node) => ({
    id: node.id,
    state: node.getState(),
    active: node instanceof OptionalNode ? node.active : undefined,
  }))
  const choiceNode =
    this.pendingInteractionNodeId !== null
      ? this.tree.findNodeById(this.pendingInteractionNodeId)
      : null
  const choiceData =
    choiceNode instanceof InteractionNode
      ? {
          id: choiceNode.id,
          promptKey: choiceNode.promptKey,
          choices: choiceNode.choices,
          request: choiceNode.request,
          pendingActionId: choiceNode.pendingActionId,
          ownerNodeId: choiceNode.ownerNodeId,
          contextSnapshot: choiceNode.contextSnapshot,
        }
      : null
  return {
    nodeStates,
    choiceData,
    compositeEmit: this.snapshotCompositeEmit(),
  }
}
```

- [ ] **Step 3: 修改 restore() — 从 choiceData 重建 pendingInteractionNodeId，回填 InteractionNode 权威字段**

找到 `restore(snapshot: {...})` 方法（L933），重写参数类型和实现：

```typescript
restore(snapshot: {
  nodeStates: {
    id: string
    state: 'ready' | 'resolved' | 'blocked'
    active?: boolean
  }[]
  choiceData: {
    id: string
    promptKey?: PromptKey
    choices: ActionChoiceOption[]
    request?: InteractionRequest
    pendingActionId?: string
    ownerNodeId?: string
    contextSnapshot?: Pick<ActionExecutionContext, 'params' | 'costs' | 'sourceCard' | 'actionContext'>
  } | null
  compositeEmit?: {
    nodeId: string
    promptKey?: PromptKey
    promptParams?: Record<string, unknown>
    options: ActionChoiceOption[]
    request?: InteractionRequest
  } | null
  /** @deprecated accepted for forward-compat with pre-S4c snapshots */
  lastEmittedChoice?: {
    nodeId: string
    promptKey?: PromptKey
    promptParams?: Record<string, unknown>
    options: ActionChoiceOption[]
  } | null
}) {
  // Synthetic interaction-only frames: pendingActionId === INTERACTION_ONLY_ACTION_ID
  if (
    snapshot.choiceData?.pendingActionId === INTERACTION_ONLY_ACTION_ID &&
    snapshot.choiceData
  ) {
    const restored = new InteractionNode(
      snapshot.choiceData.id,
      snapshot.choiceData.choices,
      snapshot.choiceData.request,
    )
    restored.promptKey = snapshot.choiceData.promptKey
    restored.pendingActionId = snapshot.choiceData.pendingActionId
    restored.ownerNodeId = snapshot.choiceData.ownerNodeId
    restored.contextSnapshot = snapshot.choiceData.contextSnapshot ?? null
    this.injectInteraction(restored)
    const nodeStateEntry = snapshot.nodeStates.find(
      (entry) => entry.id === snapshot.choiceData!.id,
    )
    if (nodeStateEntry) {
      restored.setState(nodeStateEntry.state)
    }
    return
  }
  const nodeMap = new Map(
    this.tree.allNodes().map((node) => [node.id, node]),
  )
  snapshot.nodeStates.forEach(({ id, state }) => {
    const node = nodeMap.get(id)
    if (!node) return
    if (node instanceof InteractionNode) {
      node.setState(state)
      return
    }
    if (
      node instanceof ActionNode ||
      node instanceof OrNode ||
      node instanceof XorNode ||
      node instanceof OptionalNode
    ) {
      node.setState(state)
    }
    if (node instanceof OptionalNode) {
      node.active = !!snapshot.nodeStates.find((item) => item.id === id)?.active
    }
  })
  if (snapshot.choiceData) {
    const node = nodeMap.get(snapshot.choiceData.id)
    if (node instanceof InteractionNode) {
      node.setChoice(snapshot.choiceData.promptKey, snapshot.choiceData.choices)
      if (snapshot.choiceData.request) node.request = snapshot.choiceData.request
      if (snapshot.choiceData.pendingActionId !== undefined) {
        node.pendingActionId = snapshot.choiceData.pendingActionId
      }
      if (snapshot.choiceData.ownerNodeId !== undefined) {
        node.ownerNodeId = snapshot.choiceData.ownerNodeId
      }
      if (snapshot.choiceData.contextSnapshot !== undefined) {
        node.contextSnapshot = snapshot.choiceData.contextSnapshot
      }
    }
  }
  // Rebuild pendingInteractionNodeId from choiceData.id (replaces the 4 mirror fields)
  this.pendingInteractionNodeId = snapshot.choiceData?.id ?? null

  const compositeEmit = snapshot.compositeEmit
    ?? (snapshot.lastEmittedChoice
      ? { ...snapshot.lastEmittedChoice, request: undefined as InteractionRequest | undefined }
      : null)
  if (compositeEmit) {
    const node = nodeMap.get(compositeEmit.nodeId)
    if (node instanceof OrNode || node instanceof XorNode || node instanceof OptionalNode) {
      node.emittedChoices = compositeEmit.options
      node.emittedPromptKey = compositeEmit.promptKey
      node.emittedPromptParams = compositeEmit.promptParams
      node.emittedRequest = compositeEmit.request
    }
  }
}
```

- [ ] **Step 4: 修改 injectInteraction() — 删除对 3 个 mirror 字段的写入**

找到 `injectInteraction(node: InteractionNode)` 方法（L205），删除 3 行写入：

```typescript
injectInteraction(node: InteractionNode): void {
  this.tree.root = node
  this.pendingInteractionNodeId = node.id
  // node.pendingActionId、ownerNodeId、contextSnapshot 已在 S4b PR3 由 InteractionNode.emit() 管理
  node.pendingActionId = INTERACTION_ONLY_ACTION_ID
  node.ownerNodeId = undefined
  node.contextSnapshot = {
    params: undefined,
    costs: undefined,
    sourceCard: undefined,
    actionContext: undefined,
  }
}
```

（删除 `this.pendingInteractionActionId`、`this.pendingInteractionOwnerNodeId`、`this.pendingInteractionContext` 的赋值行。）

- [ ] **Step 5: 修改 applyInteractionRequest() — 删除对 3 个 mirror 字段的写入**

找到 `private applyInteractionRequest(...)` 方法（L242），删除末尾 3 行（L297-305）：

```typescript
// 删除这 4 行:
// this.pendingInteractionActionId = actionId
// if (!args.preserveOwner) {
//   this.pendingInteractionOwnerNodeId = ownerNodeId
// }
// this.pendingInteractionContext = ctxSnapshot
```

（`this.pendingInteractionNodeId` 的赋值保留——那是内部状态。）

- [ ] **Step 6: 修改 resolveChoice() — 删除对 3 个 mirror 字段的清零**

找到 `resolveChoice()` 方法（L1699），全局搜索 `this.pendingInteractionActionId`、`this.pendingInteractionOwnerNodeId`、`this.pendingInteractionContext`，删除所有对这 3 个字段的赋值（约 15 处 `= null`）。保留所有 `this.pendingInteractionNodeId = null` 的清零。

- [ ] **Step 7: 修改 insertFlowAfterPendingChoice() — 从 InteractionNode 读 ownerNodeId**

找到 `insertFlowAfterPendingChoice(flow: ActionFlow)` 方法（L2130），将：

```typescript
const insertionTargetId = this.pendingInteractionOwnerNodeId ?? this.pendingInteractionNodeId
```

改为：

```typescript
const interactionNode = this.peekInteraction()
const insertionTargetId = (interactionNode?.ownerNodeId ?? null) ?? this.pendingInteractionNodeId
```

- [ ] **Step 8: 运行 9-case cursor round-trip test（snapshot 正确性验证）**

```bash
pnpm exec vitest run shared/engine/nodes/__tests__ --reporter=verbose
```

预期：所有 test pass（除 PR1 故意 fail 的 surface guard 外）。

- [ ] **Step 9: 运行全量 test:fast**

```bash
pnpm test:fast 2>&1 | tail -5
```

预期：345 files passed（surface guard 的 1 个 test 仍 fail，其余全 pass）。

- [ ] **Step 10: Commit**

```bash
git add shared/engine/engine.ts
git commit -m "refactor(engine): delete 3 mirror fields; migrate snapshot to choiceData-only shape (PR2)"
```

---

## Task 3（PR3）：EngineStack 扩展 + session-core 调用点迁移

**Files:**
- Modify: `shared/engine/engine-stack.ts`
- Modify: `shared/session/session-core.ts`
- Create/Modify: `shared/engine/__tests__/engine-stack.test.ts`（unit tests）

**背景：** EngineStack 新增 4 个 query 方法和 1 个写操作方法，委托 engine 对应的 public 方法（此时 PR4 还没删它们）。session-core 5 处直接访问 `frame.engine.*` 的调用点迁移到 `this.engineStack.*`。

- [ ] **Step 1: 扩展 engine-stack.ts，新增 5 个方法**

在 `shared/engine/engine-stack.ts` 的 `peekInteraction()` 方法之后添加：

```typescript
import type {
  ActionChoiceOption,
  ActionFlow,
  InteractionRequest,
  PromptKey,
} from '../game/types'
import type { EngineNode } from '../engine/nodes'

peekInteractionHost(): EngineNode | null {
  return this.current()?.engine.peekInteractionHost() ?? null
}

peekPendingChoiceFromComposite(): {
  nodeId: string
  promptKey?: PromptKey
  promptParams?: Record<string, unknown>
  options: ActionChoiceOption[]
  request?: InteractionRequest
} | null {
  return this.current()?.engine.peekPendingChoiceFromComposite() ?? null
}

hasPendingChoiceCompositeAncestor(): boolean {
  return this.current()?.engine.hasPendingChoiceCompositeAncestor() ?? false
}

insertFlowAfterPendingChoice(flow: ActionFlow): void {
  this.current()?.engine.insertFlowAfterPendingChoice(flow)
}
```

（注意：这里 import 的类型可能已经在文件里，检查重复导入。）

- [ ] **Step 2: 写 engine-stack.ts 新方法的 unit tests**

在 `shared/engine/__tests__/engine-stack.test.ts`（如文件不存在则创建）中添加：

```typescript
import { describe, it, expect, vi } from 'vitest'
import { EngineStack } from '../engine-stack'
import type { Engine } from '../engine'

function mockEngine(overrides: Partial<Engine>): Engine {
  return {
    peekInteraction: vi.fn().mockReturnValue(null),
    peekInteractionHost: vi.fn().mockReturnValue(null),
    peekPendingChoiceFromComposite: vi.fn().mockReturnValue(null),
    hasPendingChoiceCompositeAncestor: vi.fn().mockReturnValue(false),
    insertFlowAfterPendingChoice: vi.fn(),
    proceed: vi.fn(),
    resolveChoice: vi.fn(),
    snapshot: vi.fn().mockReturnValue({ nodeStates: [], choiceData: null }),
    restore: vi.fn(),
    ...overrides,
  } as unknown as Engine
}

describe('EngineStack query delegation', () => {
  it('peekInteractionHost delegates to engine', () => {
    const stack = new EngineStack()
    const fakeHost = { id: 'n1' } as any
    const engine = mockEngine({ peekInteractionHost: vi.fn().mockReturnValue(fakeHost) })
    stack.push({ engine, source: { kind: 'action', actionId: 'x' }, ownerPlayerIndex: 0, spaceId: 'x', stageResume: null, deferredPlayerSwitch: null, reason: 'top-level' })
    expect(stack.peekInteractionHost()).toBe(fakeHost)
  })

  it('peekInteractionHost returns null when stack is empty', () => {
    const stack = new EngineStack()
    expect(stack.peekInteractionHost()).toBeNull()
  })

  it('peekPendingChoiceFromComposite delegates to engine', () => {
    const stack = new EngineStack()
    const result = { nodeId: 'n1', options: [], promptKey: undefined, promptParams: undefined, request: undefined }
    const engine = mockEngine({ peekPendingChoiceFromComposite: vi.fn().mockReturnValue(result) })
    stack.push({ engine, source: { kind: 'action', actionId: 'x' }, ownerPlayerIndex: 0, spaceId: 'x', stageResume: null, deferredPlayerSwitch: null, reason: 'top-level' })
    expect(stack.peekPendingChoiceFromComposite()).toBe(result)
  })

  it('hasPendingChoiceCompositeAncestor delegates to engine', () => {
    const stack = new EngineStack()
    const engine = mockEngine({ hasPendingChoiceCompositeAncestor: vi.fn().mockReturnValue(true) })
    stack.push({ engine, source: { kind: 'action', actionId: 'x' }, ownerPlayerIndex: 0, spaceId: 'x', stageResume: null, deferredPlayerSwitch: null, reason: 'top-level' })
    expect(stack.hasPendingChoiceCompositeAncestor()).toBe(true)
  })

  it('insertFlowAfterPendingChoice delegates to engine', () => {
    const stack = new EngineStack()
    const insertSpy = vi.fn()
    const engine = mockEngine({ insertFlowAfterPendingChoice: insertSpy })
    stack.push({ engine, source: { kind: 'action', actionId: 'x' }, ownerPlayerIndex: 0, spaceId: 'x', stageResume: null, deferredPlayerSwitch: null, reason: 'top-level' })
    const flow = { type: 'leaf' as const, actionId: 'test' }
    stack.insertFlowAfterPendingChoice(flow)
    expect(insertSpy).toHaveBeenCalledWith(flow)
  })
})
```

- [ ] **Step 3: 运行 engine-stack unit tests，确认 pass**

```bash
pnpm exec vitest run shared/engine/__tests__/engine-stack.test.ts --reporter=verbose
```

预期：5 个 test 全 pass。

- [ ] **Step 4: 迁移 session-core.ts 的 5 处调用点**

在 `shared/session/session-core.ts` 中做如下替换：

**替换 1**（L1145，peekHostContextSnapshot 内）：
```typescript
// Before:
const host = this.engineStack.current()?.engine.peekInteractionHost()
// After:
const host = this.engineStack.peekInteractionHost()
```

**替换 2**（L1160，peekHostPendingActionId 内）：
```typescript
// Before:
const host = this.engineStack.current()?.engine.peekInteractionHost()
// After:
const host = this.engineStack.peekInteractionHost()
```

**替换 3**（L1283，emitWaitingState 内）：
```typescript
// Before:
const composite = !node ? frame?.engine.peekPendingChoiceFromComposite() ?? null : null
// After:
const composite = !node ? this.engineStack.peekPendingChoiceFromComposite() : null
```

**替换 4**（L1507，hasPendingChoice 内）：
```typescript
// Before:
return frame.engine.peekPendingChoiceFromComposite() != null
// After:
return this.engineStack.peekPendingChoiceFromComposite() != null
```

**替换 5**（L2596，resolveChoiceCore 内）：
```typescript
// Before:
const composite = frame?.engine.peekPendingChoiceFromComposite() ?? null
// After:
const composite = this.engineStack.peekPendingChoiceFromComposite()
```

**替换 6**（L2654，resolveChoiceCore 内）：
```typescript
// Before:
this.engine.insertFlowAfterPendingChoice(cardFlow)
// After:
this.engineStack.insertFlowAfterPendingChoice(cardFlow)
```

- [ ] **Step 5: 运行全量 test:fast**

```bash
pnpm test:fast 2>&1 | tail -5
```

预期：345 files passed（surface guard 1 个 test 仍 fail）。

- [ ] **Step 6: Commit**

```bash
git add shared/engine/engine-stack.ts shared/engine/__tests__/engine-stack.test.ts shared/session/session-core.ts
git commit -m "refactor(engine): extend EngineStack with 4 query + 1 write; migrate session-core call sites (PR3)"
```

---

## Task 4（PR4）：Engine API 收敛（删 8 个公开方法，添加 injectBeforeFlows）

**Files:**
- Modify: `shared/engine/engine.ts`（删 8 个公开方法，添加 injectBeforeFlows，修改 8 个为 private）
- Modify: `shared/session/phases/round.ts`（2 处调用点迁移）
- Modify: `shared/engine/engine-stack.ts`（peekInteraction 委托改为 cast 访问）
- Modify: `shared/engine/nodes/__tests__/engine-public-surface.test.ts`（更新 PRIVATE_HELPERS）

**背景：** 删除 8 个公开方法（或改为 private），添加 `injectBeforeFlows(flows, ctx?, opts?)` 替代 round.ts 的 build+inject+proceed-loop 模式。`peekInteraction` 等改为 private 后，EngineStack 通过 `as any` cast 访问（engine-stack.ts 与 engine.ts 同目录，视为包内访问约定）。

- [ ] **Step 1: engine.ts — 把 8 个方法的 public 改为 private**

在 `shared/engine/engine.ts` 中，给以下方法加 `private` 关键字（即从无访问修饰符变为 `private`）：

- `peekPendingChoiceFromComposite()`（L136）→ `private peekPendingChoiceFromComposite()`
- `injectBeforeNodes()`（L159）→ `private injectBeforeNodes()`
- `peekNextUnresolved()`（L167）→ `private peekNextUnresolved()`
- `peekInteraction()`（L171）→ `private peekInteraction()`
- `peekInteractionHost()`（L187）→ `private peekInteractionHost()`
- `buildFlowNodePublic()`（L308）→ `private buildFlowNodePublic()`（或直接删除并改调 `this.buildFlowNode()`）
- `prependFlow()`（L312）→ `private prependFlow()`
- `insertFlowAfterPendingChoice()`（L2130）→ `private insertFlowAfterPendingChoice()`
- `hasPendingChoiceCompositeAncestor()`（L921）→ `private hasPendingChoiceCompositeAncestor()`

- [ ] **Step 2: engine.ts — 添加 injectBeforeFlows() 公开方法**

在 `injectInteraction()` 方法之后（约 L225）添加：

```typescript
/**
 * Build flow nodes from the given ActionFlow list, inject them before the
 * next unresolved node (or prepend to root when opts.prepend is true), then
 * drive proceed() until the injected nodes are no longer the next unresolved.
 * When ctx is omitted, only injection happens (no proceed) — equivalent to
 * the old prependFlow() behaviour for anytime-action use.
 */
injectBeforeFlows(
  flows: ActionFlow[],
  ctx?: EngineContext,
  opts?: { prepend?: boolean },
): void {
  if (flows.length === 0) return
  const flowNodes = flows.map((f) => this.buildFlowNode(f))
  if (opts?.prepend) {
    // Prepend all flow nodes before the current root
    const first = this.tree.nextUnresolved()
    if (first) {
      this.tree.insertBefore(first.id, flowNodes)
    } else {
      this.tree.root = new SequenceNode(
        `prepend-root-${this.flowNodeCounter++}`,
        [...flowNodes, this.tree.root],
      )
    }
  } else {
    const first = this.tree.nextUnresolved()
    if (first) {
      this.tree.insertBefore(first.id, flowNodes)
    }
  }
  if (!ctx) return
  const injectedIds = new Set(flowNodes.map((n) => n.id))
  let safety = flowNodes.length * 3
  while (safety-- > 0) {
    const next = this.tree.nextUnresolved()
    if (!next || !injectedIds.has(next.id)) break
    const step = this.proceed(ctx)
    if (step.type !== 'ok') break
  }
}
```

- [ ] **Step 3: engine-stack.ts — 修复 peekInteraction 委托（cast 访问）**

在 `shared/engine/engine-stack.ts` 中，将 `peekInteraction()` 方法改为：

```typescript
peekInteraction(): import('./nodes').InteractionNode | null {
  const engine = this.current()?.engine
  if (!engine) return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (engine as any).peekInteraction() ?? null
}
```

类似地更新 `peekInteractionHost`、`peekPendingChoiceFromComposite`、`hasPendingChoiceCompositeAncestor`、`insertFlowAfterPendingChoice` 5 个方法（它们在 PR3 委托了 engine 的 public 方法，现在这些方法变为 private，通过 cast 访问）：

```typescript
peekInteractionHost(): EngineNode | null {
  const engine = this.current()?.engine
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return engine ? (engine as any).peekInteractionHost() : null
}

peekPendingChoiceFromComposite(): {...} | null {
  const engine = this.current()?.engine
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return engine ? (engine as any).peekPendingChoiceFromComposite() ?? null : null
}

hasPendingChoiceCompositeAncestor(): boolean {
  const engine = this.current()?.engine
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return engine ? (engine as any).hasPendingChoiceCompositeAncestor() : false
}

insertFlowAfterPendingChoice(flow: ActionFlow): void {
  const engine = this.current()?.engine
  if (!engine) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(engine as any).insertFlowAfterPendingChoice(flow)
}
```

- [ ] **Step 4: round.ts — 2 处调用点迁移**

在 `shared/session/phases/round.ts` 中：

**替换 1**（L124-148，before-phase inject loop）：
```typescript
// Before:
const beforeFlowNodes: EngineNode[] = []
const frameEngine = () => core.peekEngineFrame()?.engine ?? null
for (const entry of matched) {
  const result = executeCardListener(entry.registration, beforeListenerContext, {
    ownerPlayerId: entry.ownerPlayerId,
  })
  if (result?.flow) {
    beforeFlowNodes.push(frameEngine()!.buildFlowNodePublic(result.flow))
  }
}
if (beforeFlowNodes.length > 0) {
  const injectedIds = new Set(beforeFlowNodes.map(n => n.id))
  frameEngine()!.injectBeforeNodes(beforeFlowNodes)
  let safety = beforeFlowNodes.length * 3
  while (safety-- > 0) {
    const eng = frameEngine()
    if (!eng) break
    const next = eng.peekNextUnresolved()
    if (!next || !injectedIds.has(next.id)) break
    const step = eng.proceed({ state, player, space })
    core.flushEngineLogPublic()
    if (step.type !== 'ok') break
  }
  player._activeActionBonusSources = []
  core.setActionStartPlayerSnapshot(core.cloneSessionPlayer(player))
}

// After:
const beforeFlows: ActionFlow[] = []
for (const entry of matched) {
  const result = executeCardListener(entry.registration, beforeListenerContext, {
    ownerPlayerId: entry.ownerPlayerId,
  })
  if (result?.flow) beforeFlows.push(result.flow)
}
if (beforeFlows.length > 0) {
  core.peekEngineFrame()?.engine.injectBeforeFlows(beforeFlows, { state, player, space })
  core.flushEngineLogPublic()
  player._activeActionBonusSources = []
  core.setActionStartPlayerSnapshot(core.cloneSessionPlayer(player))
}
```

（同时删除 `EngineNode` 的 import，如果不再被其他地方用到。）

**替换 2**（L369，takeAnytimeAction 内）：
```typescript
// Before:
engine.prependFlow(entry.flow)

// After:
engine.injectBeforeFlows([entry.flow])
```

（不传 ctx，即不 proceed，调用者随后 `core.driveEngineSteps()` 驱动。）

- [ ] **Step 5: 更新 engine-public-surface.test.ts 的 PRIVATE_HELPERS**

在 `shared/engine/nodes/__tests__/engine-public-surface.test.ts` 中，把 8 个方法从 PUBLIC_API 移入 PRIVATE_HELPERS（PR1 时已从 PUBLIC_API 删除）。确认 PRIVATE_HELPERS 包含：

```
'buildFlowNodePublic',
'hasPendingChoiceCompositeAncestor',
'injectBeforeNodes',
'insertFlowAfterPendingChoice',
'peekInteraction',
'peekInteractionHost',
'peekNextUnresolved',
'peekPendingChoiceFromComposite',
'prependFlow',
```

（这些方法变为 private 后仍出现在 `Object.getOwnPropertyNames(Engine.prototype)` 上，所以必须在 PRIVATE_HELPERS 里声明。）

- [ ] **Step 6: 运行 engine-public-surface.test.ts 确认第一个 test 现在 pass**

```bash
pnpm exec vitest run shared/engine/nodes/__tests__/engine-public-surface.test.ts --reporter=verbose
```

预期：2 个 test 全 pass。

- [ ] **Step 7: 运行全量 test:fast**

```bash
pnpm test:fast 2>&1 | tail -5
```

预期：345 files passed，surface guard 全 pass。

- [ ] **Step 8: Commit**

```bash
git add shared/engine/engine.ts shared/engine/engine-stack.ts shared/session/phases/round.ts shared/engine/nodes/__tests__/engine-public-surface.test.ts
git commit -m "refactor(engine): converge public API to 6 methods; add injectBeforeFlows; internalize 8 methods (PR4)"
```

---

## Task 5（PR5）：engine.ts 文件拆分（2136 → ≤600 行）

**Files:**
- Create: `shared/engine/engine-internals.ts`
- Create: `shared/engine/engine-utils.ts`
- Create: `shared/engine/engine-proceed.ts`
- Create: `shared/engine/engine-resolve.ts`
- Modify: `shared/engine/engine.ts`（保留外壳，删除 ~1550 行实现）
- Modify: `shared/engine/nodes/__tests__/engine-public-surface.test.ts`（PRIVATE_HELPERS 更新）

**背景：** 把 engine.ts 的 ~30 个私有方法（L325-856，~530 行）提取为 `engine-utils.ts` 的模块级函数，`proceed()` 提取到 `engine-proceed.ts`，`resolveChoice()` 提取到 `engine-resolve.ts`。这些函数接受 `EngineInternals` 参数（包含 tree/registry/hooks/log/counterRef/beforePhaseFlowNodeIds 和 pendingNodeIdRef）代替 `this`。

engine.ts 的方法改为调用外壳：
```typescript
proceed(context: EngineContext): EngineStepResult {
  return engineProceed(this._internals(), context)
}
```

**重要：** 这是本 sprint 工作量最大的 PR。所有 `this.tree` → `int.tree`，`this.registry` → `int.registry`，`this.flowNodeCounter++` → `int.counterRef.value++`，`this.pendingInteractionNodeId` → `int.pendingNodeIdRef.value`（ref 模式，跨函数边界 mutate）。

- [ ] **Step 1: 创建 engine-internals.ts**

创建 `shared/engine/engine-internals.ts`：

```typescript
import type { EngineTree } from './tree'
import type { ActionRegistry } from './registry'
import type { HookDispatcher } from './dispatcher'
import type { LogStore } from './log-store'

/**
 * Mutable snapshot of Engine's core fields, passed to module-private functions
 * so they can operate without `this` access. counterRef and pendingNodeIdRef are
 * boxed so mutations propagate back to the Engine instance.
 */
export interface EngineInternals {
  tree: EngineTree
  registry: ActionRegistry
  hooks: HookDispatcher
  log: LogStore
  counterRef: { value: number }      // wraps Engine.flowNodeCounter (number → ref for mutability)
  beforePhaseFlowNodeIds: Set<string>
  pendingNodeIdRef: { value: string | null }  // wraps Engine.pendingInteractionNodeId
}
```

- [ ] **Step 2: engine.ts — 把两个字段改为 ref 对象，新增 _internals()**

在 `shared/engine/engine.ts` 中：

```typescript
// 原字段改为：
private _counterRef = { value: 0 }                    // was: private flowNodeCounter = 0
private _pendingNodeIdRef: { value: string | null } = { value: null }  // was: private pendingInteractionNodeId

// 新增 private _internals() 方法：
private _internals(): EngineInternals {
  return {
    tree: this.tree,
    registry: this.registry,
    hooks: this.hooks,
    log: this.log,
    counterRef: this._counterRef,
    beforePhaseFlowNodeIds: this.beforePhaseFlowNodeIds,
    pendingNodeIdRef: this._pendingNodeIdRef,
  }
}
```

同时全局替换 engine.ts 内的：
- `this.flowNodeCounter` → `this._counterRef.value`（出现约 5 次）
- `this.pendingInteractionNodeId` → `this._pendingNodeIdRef.value`（出现约 20 次）

- [ ] **Step 3: 运行 test:fast 确认重命名后测试通过**

```bash
pnpm test:fast 2>&1 | tail -5
```

预期：全 pass。

- [ ] **Step 4: 创建 engine-utils.ts — 提取 ~30 个私有工具函数**

创建 `shared/engine/engine-utils.ts`，将以下方法从 engine.ts 提取为接受 `EngineInternals` 参数的模块级函数：

- `applyInteractionRequest(int, args)` → `applyInteractionRequest(int: EngineInternals, args: {...}): void`
- `parseFollowUpAction(int, followUp)` → `parseFollowUpAction(int, followUp): {...}`
- `applyFallbackSourceCardToFlow(int, flow, sourceCard?)` → `applyFallbackSourceCardToFlow(int, flow, sourceCard?): ActionFlow`
- `normalizeFollowUpAction(int, ...)` → `normalizeFollowUpAction(int, ...)`
- `buildFollowUpNodes(int, ...)` → `buildFollowUpNodes(int, ...)`
- `findActionNode(int, node)` → `findActionNode(int, node): ActionNode | null`
- `findPairedInteractionNode(int, node)` → `findPairedInteractionNode(int, node): InteractionNode | null`
- `buildActivateCardNodes(int, ...)` → `buildActivateCardNodes(int, ...)`
- `collectNodeIds(int, node, ids)` → `collectNodeIds(int, node, ids): void`
- `cloneNode(int, node)` → `cloneNode(int, node): EngineNode`
- `resolveSubtree(int, node)` → `resolveSubtree(int, node): void`
- `sanitizePreviewResources(int, ...)` → `sanitizePreviewResources(int, ...)`
- `mergePreviewResources(int, ...)` → `mergePreviewResources(int, ...)`
- `getActionEffectPreview(int, node)` → `getActionEffectPreview(int, node): ChoiceEffectPreview | undefined`
- `collectOrderedActionNodes(int, node)` → `collectOrderedActionNodes(int, node): ActionNode[] | null`
- `getSequenceEffectPreview(int, node)` → `getSequenceEffectPreview(int, node): ChoiceEffectPreview | undefined`
- `getNodeEffectPreview(int, node)` → `getNodeEffectPreview(int, node): ChoiceEffectPreview | undefined`
- `buildFlowNode(int, flow)` → `buildFlowNode(int: EngineInternals, flow: ActionFlow): EngineNode`
- `mergeContextIntoFlow(int, ...)` → `mergeContextIntoFlow(int, ...)`
- `findInteractionNode(int, node)` → `findInteractionNode(int, node): InteractionNode | null`
- `resolveTrueAction(int, actionContext?)` → `resolveTrueAction(int, actionContext?)`
- `buildListenerEvent(int, ...)` → `buildListenerEvent(int, ...)`
- `maybeBuildChoiceCandidates(int, ...)` → `maybeBuildChoiceCandidates(int, ...)`
- `buildChoiceExecutionContext(int, ...)` → `buildChoiceExecutionContext(int, ...)`
- `snapshotCompositeEmit(int)` → `snapshotCompositeEmit(int): {...} | null`

每个函数体里把所有 `this.tree` → `int.tree`，`this.registry` → `int.registry`，`this.hooks` → `int.hooks`，`this.log` → `int.log`，`this._counterRef.value++` → `int.counterRef.value++`，`this._pendingNodeIdRef.value` → `int.pendingNodeIdRef.value`。

对其他私有方法的调用：`this.buildFlowNode(f)` → `buildFlowNode(int, f)`（调用同一文件里的模块级函数）。

- [ ] **Step 5: engine.ts — 替换私有方法为委托调用**

engine.ts 里保留 private 方法 stub（委托到 engine-utils 函数）：

```typescript
private applyInteractionRequest(args: {...}): void {
  applyInteractionRequest(this._internals(), args)
}
private buildFlowNode(flow: ActionFlow): EngineNode {
  return buildFlowNode(this._internals(), flow)
}
// ... 其余同理
```

或者，直接删除 private 方法，在 engine.ts 内的 proceed/resolveChoice 里直接调用 engine-utils 的函数（传 `this._internals()`）。后者更彻底，但需要同时修改 proceed/resolveChoice（在 Step 6 做）。**推荐后者**：直接删除 engine.ts 里的私有方法，proceed 和 resolveChoice 里的 `this.xxx()` 在 Step 6 提取时一并改为 `xxxFn(int, ...)`。

- [ ] **Step 6: 创建 engine-proceed.ts — 提取 proceed()**

创建 `shared/engine/engine-proceed.ts`：

```typescript
import type { EngineInternals } from './engine-internals'
import type { EngineContext, EngineStepResult } from './types'
import { /* 从 engine-utils 导入所有需要的工具函数 */ } from './engine-utils'
import { /* 从 nodes/index 导入所有节点类 */ } from './nodes'

export function engineProceed(
  int: EngineInternals,
  context: EngineContext,
): EngineStepResult {
  const node = int.tree.nextUnresolved()
  if (!node) return { type: 'done' }
  // ... 原 proceed() 的全部实现，this.xxx 替换为 int.xxx 或工具函数调用
}
```

在 engine.ts 里，`proceed()` 改为：

```typescript
proceed(context: EngineContext): EngineStepResult {
  return engineProceed(this._internals(), context)
}
```

- [ ] **Step 7: 创建 engine-resolve.ts — 提取 resolveChoice()**

创建 `shared/engine/engine-resolve.ts`：

```typescript
import type { EngineInternals } from './engine-internals'
import type { EngineContext, ActionExecutionResult } from './types'
import { /* 工具函数 */ } from './engine-utils'

export function engineResolveChoice(
  int: EngineInternals,
  choice: string,
  context: EngineContext,
  payload?: Record<string, unknown>,
): ActionExecutionResult {
  // ... 原 resolveChoice() 的全部实现
}
```

在 engine.ts 里，`resolveChoice()` 改为：

```typescript
resolveChoice(
  choice: string,
  context: EngineContext,
  payload?: Record<string, unknown>,
): ActionExecutionResult {
  return engineResolveChoice(this._internals(), choice, context, payload)
}
```

- [ ] **Step 8: 验证 engine.ts 行数 ≤600**

```bash
wc -l shared/engine/engine.ts
```

预期：≤600 行。

- [ ] **Step 9: 更新 engine-public-surface.test.ts 的 PRIVATE_HELPERS**

提取到 engine-utils.ts 的私有方法不再出现在 `Engine.prototype` 上，从 PRIVATE_HELPERS 列表中删除它们。`_internals` 方法（新增的 private 方法）加入 PRIVATE_HELPERS。

运行 guard test 先看实际输出来确定 PRIVATE_HELPERS 的准确内容：

```bash
pnpm exec vitest run shared/engine/nodes/__tests__/engine-public-surface.test.ts --reporter=verbose 2>&1 | grep "Expected\|Received" | head -30
```

根据输出调整 PRIVATE_HELPERS 列表，确保 test pass。

- [ ] **Step 10: 运行全量 test:fast**

```bash
pnpm test:fast 2>&1 | tail -5
```

预期：345 files passed，全 pass。

- [ ] **Step 11: Commit**

```bash
git add shared/engine/engine-internals.ts shared/engine/engine-utils.ts shared/engine/engine-proceed.ts shared/engine/engine-resolve.ts shared/engine/engine.ts shared/engine/nodes/__tests__/engine-public-surface.test.ts
git commit -m "refactor(engine): split engine.ts → engine-utils/proceed/resolve/internals; engine.ts ≤600 lines (PR5)"
```

---

## Task 6（PR6）：Closeout — DoD 验证 + 文档回流

**Files:**
- Modify: `docs/ENGINE_NEW_ARCHITECTURE.md`

- [ ] **Step 1: 验证 DoD D1 — Engine 公开方法恰好 6 个**

```bash
pnpm exec vitest run shared/engine/nodes/__tests__/engine-public-surface.test.ts --reporter=verbose
```

预期：2 个 test 全 pass。

- [ ] **Step 2: 验证 DoD D2/D3 — mirror 字段已删，EngineSnapshot 不含顶层 pendingInteractionXxx**

```bash
grep -n "pendingInteractionActionId\|pendingInteractionOwnerNodeId\|pendingInteractionContext" shared/engine/engine.ts
```

预期：无输出（字段和相关赋值已全部删除）。

```bash
grep -n "pendingInteractionNodeId\|pendingInteractionActionId\|pendingInteractionOwnerNodeId" shared/engine/engine.ts | grep -v "pendingNodeIdRef\|// "
```

预期：只剩内部 `pendingNodeIdRef`，无 `pendingInteractionActionId/OwnerNodeId`。

- [ ] **Step 3: 验证 DoD D7 — engine.ts ≤600 行**

```bash
wc -l shared/engine/engine.ts
```

预期：≤600 行。

- [ ] **Step 4: 验证 DoD D5/D6 — session-core/round.ts 不再直接调用已删方法**

```bash
grep -n "engine\.peekInteractionHost\|engine\.peekPendingChoice\|engine\.injectBeforeNodes\|engine\.buildFlowNodePublic\|engine\.prependFlow\|engine\.insertFlowAfterPendingChoice\|engine\.hasPendingChoice\|engine\.peekNextUnresolved" shared/session/session-core.ts shared/session/phases/round.ts
```

预期：无输出。

- [ ] **Step 5: 运行完整本地 CI**

```bash
pnpm run lint 2>&1 | tail -3
pnpm run lint:i18n 2>&1 | tail -3
pnpm run check:prompt-sync 2>&1 | tail -3
pnpm run check:reaches 2>&1 | tail -3
pnpm run check:no-dsl 2>&1 | tail -3
pnpm run check:catalog-types 2>&1 | tail -3
pnpm run check:community-deck 2>&1 | tail -3
pnpm test:fast 2>&1 | tail -5
pnpm run build 2>&1 | tail -5
pnpm run check:bundle-size 2>&1 | tail -3
```

预期：全部 0 errors，test:fast 345 files passed，build ✓，bundle OK。

- [ ] **Step 6: 更新 ENGINE_NEW_ARCHITECTURE.md — §15 添加 S4c 收口记录**

在 `docs/ENGINE_NEW_ARCHITECTURE.md` 的 §15 Sprint S4b 完成段落（约 L1086）之后，插入 S4c 收口节：

```markdown
### Sprint S4c：Engine API 收敛 ✅ 完成（2026-05-XX）

> **完成总结**：
> - ✅ Engine 公开方法 14 → **6**（`proceed / resolveChoice / snapshot / restore / injectBeforeFlows / injectInteraction`）；`engine-public-surface.test.ts` guard pass
> - ✅ mirror 字段（`pendingInteractionActionId / OwnerNodeId / Context`）从 engine.ts 删除；`EngineSnapshot` 顶层不含 `pendingInteractionXxx` 字段
> - ✅ `EngineStack` 新增 4 个 query + 1 个写操作方法；session-core / round.ts 调用点全部迁移
> - ✅ engine.ts **≤600 行**；`proceed` / `resolveChoice` 提取到 `engine-proceed.ts` / `engine-resolve.ts`；私有工具函数集中在 `engine-utils.ts`

#### Sprint S4c 整体 DoD

- ✅ D1: Engine 公开方法恰好 6 个，guard pass
- ✅ D2: 3 个 mirror 私有字段删除
- ✅ D3: EngineSnapshot 顶层不含 pendingInteractionXxx 字段
- ✅ D4: EngineStack 新增 4 query + 1 write，各有 unit test
- ✅ D5: session-core.ts 不直接调用已删除的 8 个 Engine 公开方法
- ✅ D6: round.ts before-phase inject 改为 injectBeforeFlows()
- ✅ D7: engine.ts ≤600 行
- ✅ D8: pnpm test:fast 全绿
- ✅ D9: ENGINE_NEW_ARCHITECTURE.md §15 S4c 收口记录回流
```

同时更新文档顶部进度行（L18）：把 `S6–S7 待启动` 前加入 `S4c ✅（2026-05-XX，Engine API 收敛）`。

- [ ] **Step 7: Commit + Push**

```bash
git add docs/ENGINE_NEW_ARCHITECTURE.md
git commit -m "docs(sprint-S4c): closeout — DoD verification + ENGINE_NEW_ARCHITECTURE update (PR6)"
git push origin sprint-S4c
```

然后 rebase 到 main 并 fast-forward：

```bash
git fetch origin main
git rebase origin/main
# 解决冲突（如有）
pnpm test:fast 2>&1 | tail -5   # 验证 rebase 后仍绿
git checkout main
git merge --ff-only sprint-S4c
git push origin main
```

等待 GitHub Actions CI 全绿后本 sprint 收口。

---

## 执行说明

- 每个 Task 对应一个独立 PR commit，推送前完整通过 `pnpm test:fast`
- Task 2 完成后，`stats-gained-pseudo-session.test.ts` 应仍 pass（已在 S4b 改为从 InteractionNode 读）
- Task 5 是最大工作量，分两步：先提取工具函数（Step 4），再提取 proceed/resolveChoice（Step 6/7），中间运行测试确认（Step 3/8）
- Task 4 的 engine-stack.ts cast 访问是有意为之的"包内约定"，`// eslint-disable-next-line` 注释是必要的
