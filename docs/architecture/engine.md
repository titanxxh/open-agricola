# `shared/engine/`: Node-Tree Engine

[English](engine.md) | [中文](engine_zh.md)

The node tree is the only state machine: the engine cursor determines what input is awaited, and there is no `PendingAction` union.

## Files

```text
shared/engine/
├── engine.ts              Engine class
├── engine-stack.ts        EngineStack child-flow frame stack
├── engine-resolve.ts      resolveChoice path
├── engine-proceed.ts      step and progression path
├── dispatcher.ts          Hook and listener dispatch
├── tree.ts                Node-tree construction
├── registry.ts            ActionDefinition registration and lookup
├── log-store.ts           Buffered logs
├── types.ts               EngineContext, EngineFrame, EngineStackCursor
└── nodes/
    ├── base.ts            BaseNode and shared metadata/pending state
    ├── action-node.ts     Atomic action leaf
    ├── sequence-node.ts
    ├── parallel-node.ts
    ├── xor-node.ts
    └── or-node.ts
```

## Node Types

- Domain `ActionFlow` follows the reference node algebra and exposes only `leaf`, `seq`, `parallel`, `xor` and `or`. `optional`, `promptKey`, `sourceCard`, `choiceLabel*` and `targetPlayerId` are metadata, not node types; runtime-only nodes never enter card flows.
- The runtime tree has five concrete nodes: `ActionNode`, `SequenceNode`, `ParallelNode`, `XorNode`, `OrNode`. Cross-player ownership, optional state, trigger selection, listener activation and pending state are node metadata, internal leaves, pending envelopes and frame state, never wrapper nodes.
- `targetPlayerId` compiles to `ownerPlayerId` on the target subtree; explicit child owners win. Every dynamic insertion path carries the current effective owner, and cursors persist owners instead of inferring them from `currentPlayerIndex`. `injectBeforeFlows()` drains only nodes owned by the current player and returns others to the Session driver.
- `XorNode` stores `selectedChildId` and drains only that branch; a leaf selected directly by OR/XOR stores `selectedBranchChoice`. When that leaf completes without a request of its own, its trailing reactions receive it as `choice`; a leaf with its own request completes with the submitted value. When the first leaf of a selected sequence branch runs on selection and returns a flow, that flow is inserted right after the leaf, before the branch's later siblings; its trailing reactions still follow the XOR. `ParallelNode(mode='trigger-select')` implements reaction selection ([Listener purity](hooks.md#listener-purity)); `resolveAfterSelection` makes it one-shot.
- Shared metadata: `ownerPlayerId`; `optional` / `optionalActive` / `optionalPromptKey` (XOR and OR keep a direct `__skip__`); `mandatory`, inherited recursively by `afterHostCommit` children and dynamically returned flows, so a later unexecutable leaf returns mandatory-blocked and Session enters undo-only `engine-blocked`; `selectedChildId`; `pending: PendingEnvelope | null`.
- `space-use-nodes.ts` builds complete Action Space Use scopes from ordinary sequence nodes. Primary-body membership, event receipts and phase gates survive expansion, replacement, cloning and cursor restoration. `space-use-runtime.ts` joins completion reactions with the existing scheduler; nested uses and reaction effects do not enter their enclosing primary-body receipt. See [ADR 0031](../adr/0031-explicit-action-space-use-subscriptions.md) and [hooks](hooks.md).
- Every request a leaf returns opens a pending envelope whose options come from `interactionRequestChoices()`; completion reactions run only after it is submitted. `InteractionRequest` is a protocol shape, not a node.
- `before` reaction leaves may return `beforeHostContributions` keyed by namespace and source; the engine upserts them into the unstarted host's `actionContext` through `continuationParentHostNodeId`. A contribution without a valid before host fails, and repeating a source replaces its entry. They follow the host through pending, recovery and undo, and nested or independently granted actions do not inherit them.

## Engine Public API

`Engine` exposes a small interface to `GameCore`:

- `step(ctx)`: advance to the next unresolved node and stop at pending input.
- `resolveChoice(value, ctx, payload?)`: supply player input and continue.
- `peekPendingEnvelope()`: the current `PendingEnvelope`, or null.
- `peekPendingHost()`: the node hosting that envelope, for `sourceCard`, `actionContext` and owner lookup.
- `injectBeforeFlows(flows, ctx?)`: insert hook flows.
- `snapshot()` / `restore(snapshot)`: serialize and rebuild the tree, including node states, pending envelope, owner, optional and trigger metadata.
- `hasPendingChoiceCompositeAncestor()`: whether execution is inside a branch ancestor, for anytime handling.
- `describe()` / `describeFlow()`: pure descriptions ([ActionChoiceOption and Previews](contract.md#actionchoiceoption-and-previews)).

`GameCore.engineDeps()` and every engine `proceed` share `syncDynamicActionSpaces()`, which registers board spaces whose definitions are missing from the execution directory; cards create spaces through public mechanisms and never touch the Session registry. A missing definition is an internal invariant error that rolls back the authoritative command.

Tests: `shared/engine/__tests__/{engine,engine-flow,tree-selected-branch,restore-regressions,optional-node-context,resolve-choice-continuations}.test.ts`.

## EngineStack

`EngineStack` in `engine-stack.ts` owns `EngineFrame[]`:

```ts
type EngineFrame = {
  engine: Engine
  source: SubFlowReason
  ownerPlayerIndex: number
  spaceId?: string
  stageResume?: StageResume
  reason: SubFlowReason
}
```

- Its API is `push`, `pop`, `current`, `depth`, `peekPendingEnvelope`, `peekPendingHost` and `toCursor`. `push` / `pop` create and leave nested frames (subflows and confirmations); hook and anytime flows enter the current frame through `Engine.injectBeforeFlows()`, and a farm action's `farm-select` request stays a pending envelope on its action node in the current frame. Nothing mutates `pending` directly.
- A feeding frame keeps its payment continuation in `feedingResume`; it survives reaction choices and reorganization, transfers to any subsequent feeding opportunity, and is consumed only when that opportunity closes.
- `EngineStackCursor` is serialized into `PersistedSessionSnapshot.sessionCursor.engineStackCursor`; public and Replay `SerializedGameState.engineStack` stays empty.
- Undo history stores a detached cursor of the complete stack (every frame, its identity, reason, stage continuation, deferred switch and resolve boundary); `undoStep()` / `undoAction()` rebuild it without advancing.
- `SubFlowKind` is one of `choice`, `animal-reorg`, `confirm-next-player`, `confirm-player-switch`, `feed`, `farm-select`, `selection` or `card-draft`. Synthetic windows such as `post-reap-anytime` appear in both `SubFlowReason` and `PendingSyntheticKind`.

Tests: `shared/engine/__tests__/engine-stack.test.ts`.

