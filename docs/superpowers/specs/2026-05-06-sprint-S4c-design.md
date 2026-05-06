# Sprint S4c Design: Engine API Convergence

**Goal:** Engine 公开方法收敛到 ≤6，删除 mirror 字段，engine.ts 单文件 ≤600 行。

**Context:** S4b 完成了节点充血（`InteractionNode` 吸收权威 pending 状态），但受 snapshot shape backward-compat 约束，engine.ts 仍保留 4 个 `pendingInteractionXxx` mirror 字段（106 处引用）和 14 个公开方法。S5 已完成 RoomManager 拆分，持久化 schema 约束解除，现在可以全面收口。

---

## §1 Engine 公开 API 目标

最终 Engine class 公开方法 **6 个**：

| 方法 | 说明 |
|------|------|
| `proceed(ctx: EngineContext): EngineStepResult` | 驱动引擎前进（不变） |
| `resolveChoice(nodeId, idx, ctx): EngineStepResult` | 解决玩家选择（不变） |
| `snapshot(): EngineSnapshot` | 序列化（shape 变更，见 §3） |
| `restore(snap: EngineSnapshot): void` | 反序列化（不变） |
| `injectBeforeFlows(flows: ActionFlow[], ctx: EngineContext): void` | **新**：合并 `buildFlowNodePublic + injectBeforeNodes + proceed-until-done` |
| `injectInteraction(node: InteractionNode): void` | 保留（session-core 2 处调用，语义独立） |

**删除的 8 个公开方法**：

| 方法 | 去向 |
|------|------|
| `peekInteraction()` | → EngineStack（已有，§2） |
| `peekInteractionHost()` | → EngineStack（§2） |
| `peekPendingChoiceFromComposite()` | → EngineStack（§2） |
| `hasPendingChoiceCompositeAncestor()` | → EngineStack（§2） |
| `peekNextUnresolved()` | → 折入 `injectBeforeFlows` 内部 |
| `buildFlowNodePublic()` | → 折入 `injectBeforeFlows` 内部 |
| `insertFlowAfterPendingChoice()` | → EngineStack（§2，写操作由 Stack 协调） |
| `prependFlow()` | → `injectBeforeFlows(flows, ctx, { prepend: true })` |

---

## §2 EngineStack Query 扩展

`shared/engine/engine-stack.ts` 新增 5 个方法（委托 engine 对应逻辑）：

```typescript
// 已有
peekInteraction(): InteractionNode | null

// 新增 query
peekInteractionHost(): EngineNode | null
peekPendingChoiceFromComposite(): {
  nodeId: string
  promptKey?: PromptKey
  promptParams?: Record<string, unknown>
  options: ActionChoiceOption[]
  request?: InteractionRequest
} | null
hasPendingChoiceCompositeAncestor(): boolean

// 新增写操作（由 Stack 协调，因需要 engine + context）
insertFlowAfterPendingChoice(flow: ActionFlow, ctx: EngineContext): void
```

这些方法委托到 engine 内部实现，engine 对应逻辑改为包私有（`_` 前缀 + ESLint `no-restricted-syntax` 禁止 `shared/engine/` 外访问）。

**调用点迁移**：

```typescript
// session-core.ts — Before
frame?.engine.peekInteractionHost()
frame.engine.peekPendingChoiceFromComposite()
this.engine.insertFlowAfterPendingChoice(cardFlow)

// session-core.ts — After
this.engineStack.peekInteractionHost()
this.engineStack.peekPendingChoiceFromComposite()
this.engineStack.insertFlowAfterPendingChoice(cardFlow, ctx)

// round.ts — Before
eng.peekNextUnresolved()          // 删除，逻辑折入 injectBeforeFlows
frameEngine()!.buildFlowNodePublic(result.flow)
frameEngine()!.injectBeforeNodes(beforeFlowNodes)

// round.ts — After
engine.injectBeforeFlows(flows, ctx)   // 一行替代
```

---

## §3 Mirror 字段清理 + Snapshot 迁移

**删除的 4 个 engine 私有字段**：
```typescript
// 全部删除
private pendingInteractionNodeId: string | null
private pendingInteractionActionId: string | null
private pendingInteractionOwnerNodeId: string | null
private pendingInteractionContext: {...} | null
```

**snapshot shape 变更**（`EngineSnapshot` 类型）：

```typescript
// Before
type EngineSnapshot = {
  nodeStates: [...]
  pendingInteractionNodeId: string | null    // ← 删除
  pendingInteractionActionId: string | null  // ← 删除
  pendingInteractionOwnerNodeId: string | null // ← 删除
  pendingInteractionContext: {...} | null    // ← 删除
  choiceData: { id, promptKey, choices, request } | null
  compositeEmit: {...} | null
}

// After
type EngineSnapshot = {
  nodeStates: [...]
  choiceData: {
    id: string
    promptKey?: PromptKey
    choices: ActionChoiceOption[]
    request?: InteractionRequest
    pendingActionId?: string        // ← 新增，从 InteractionNode 取
    ownerNodeId?: string            // ← 新增
    contextSnapshot?: InteractionContextSnapshot // ← 新增
  } | null
  compositeEmit: {...} | null
}
```

`choiceData` 扩展字段从 `InteractionNode`（S4b PR3 引入的权威字段）取值，`restore()` 从 `choiceData` 回填节点，不再写 engine 私有字段。

**消费者迁移**（2 处，均在 session-core.ts）：
- `session-core.ts:2258`：`engineSnapshot.pendingInteractionNodeId` → `engineSnapshot.choiceData?.id`
- `session-core.ts:2599`：同上

`engine-stack.ts:48` 的 `ReturnType<Engine['snapshot']>` 类型自动跟随。

**测试迁移**：`stats-gained-pseudo-session.test.ts` 中直接 mutate engine 私有字段的 hack 改为通过 `engine.injectInteraction(node)` 设置。

---

## §4 engine.ts 行数瘦身（2136 → ≤600）

**策略**：把两个大方法（`proceed` ~630 行、`resolveChoice` ~430 行）的内部逻辑提取为模块私有函数，接受 `EngineInternals` 参数，engine.ts 方法只剩外壳调用。

**文件结构**：

```
shared/engine/
  engine.ts              ≤600 行  — 字段声明 + 6 公开方法外壳 + constructor/snapshot/restore
  engine-proceed.ts      ~700 行  — proceed() 内部逻辑 + 相关私有工具函数
  engine-resolve.ts      ~450 行  — resolveChoice() 内部逻辑 + 相关私有工具函数
  engine-internals.ts    ~50  行  — EngineInternals interface
  engine-stack.ts        ~200 行  — 扩展后的 EngineStack（§2）
```

**EngineInternals interface**（`engine-internals.ts`）：

```typescript
export interface EngineInternals {
  tree: EngineTree
  registry: ActionRegistry
  hooks: HookDispatcher
  log: LogStore
  counterRef: { value: number }           // flowNodeCounter 包装为 ref（primitive 无法跨函数 mutate）
  beforePhaseFlowNodeIds: Set<string>
}
```

**engine.ts 外壳示例**：

```typescript
proceed(context: EngineContext): EngineStepResult {
  return engineProceed(this._internals(), context)
}

resolveChoice(nodeId: string, choiceIndex: number, ctx: EngineContext): EngineStepResult {
  return engineResolveChoice(this._internals(), nodeId, choiceIndex, ctx)
}

private _internals(): EngineInternals {
  return {
    tree: this.tree,
    registry: this.registry,
    hooks: this.hooks,
    log: this.log,
    counterRef: this._counterRef,
    beforePhaseFlowNodeIds: this.beforePhaseFlowNodeIds,
  }
}
```

私有工具方法（`applyFallbackSourceCard / buildFollowUpNodes / findActionNode` 等 ~30 个）按调用关系分配到 `engine-proceed.ts` 或 `engine-resolve.ts`，不新建额外文件。

---

## §5 测试策略

**PR1 gate（最先做）**：更新 `engine-public-surface.test.ts`，把锁定的公开方法列表改为 6 个目标方法——PR1 合入后 guard test 故意 fail，后续 PR 实现后 pass。

```typescript
// engine-public-surface.test.ts
const EXPECTED_PUBLIC = [
  'proceed', 'resolveChoice', 'snapshot', 'restore',
  'injectBeforeFlows', 'injectInteraction',
]
```

**Snapshot round-trip**：S4b PR5 新增的 9-case cursor round-trip test 继续有效，覆盖 snapshot/restore 正确性。删 mirror 字段后 `EngineSnapshot` 类型自动收紧，编译期保证不含多余字段。

**EngineStack query 单元测试**：新增方法各一个 unit test，mock engine frame，断言委托正确。

**回归 gate**：每个 PR 必须通过 `pnpm test:fast`（345 文件 / 2247 case）。

---

## §6 PR 拆分

| PR | 内容 | 预计行数变化 |
|----|------|------------|
| PR1 | public surface guard 改到 6 个目标（故意 fail） | +5 行 |
| PR2 | mirror 字段删除 + snapshot shape 迁移 + 消费者迁移 | -120 行 |
| PR3 | EngineStack 扩展（5 新方法）+ session-core/round.ts 调用点迁移 | +80 行 |
| PR4 | Engine 公开 API 收敛（删 8 个方法，加 `injectBeforeFlows`） | -150 行 |
| PR5 | engine.ts 文件拆分（`engine-proceed.ts` / `engine-resolve.ts` / `engine-internals.ts`） | engine.ts -1500 行 |
| PR6 | closeout：public surface guard pass + ENGINE_NEW_ARCHITECTURE.md 回流 | +10 行 |

---

## §7 DoD（Definition of Done）

- [ ] D1: `Engine` class 公开方法恰好 6 个，`engine-public-surface.test.ts` guard pass
- [ ] D2: `pendingInteractionNodeId/ActionId/OwnerNodeId/Context` 4 个私有字段从 engine.ts 删除
- [ ] D3: `EngineSnapshot` 顶层不含 `pendingInteractionXxx` 字段，类型层面保证
- [ ] D4: `EngineStack` 新增 4 个 query + 1 个写操作方法，各有 unit test
- [ ] D5: `session-core.ts` 不再直接调用已删除的 8 个 Engine 公开方法
- [ ] D6: `round.ts` 的 before-phase inject 逻辑改为单行 `engine.injectBeforeFlows()`
- [ ] D7: `engine.ts` 单文件 ≤600 行
- [ ] D8: `pnpm test:fast` 全绿（≥2247 case pass）
- [ ] D9: `ENGINE_NEW_ARCHITECTURE.md` §15 S4c 收口记录回流
