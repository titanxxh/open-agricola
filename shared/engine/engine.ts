import type {
  ActionExecutionResult,
  ActionFlow,
  ActionSpace,
  PlayerState,
  GameState,
  ActionChoiceOption,
  InteractionRequest,
} from '../contract/types'
import type { PromptKey } from '../contract/prompt-keys'
import {
  ActionNode,
  OrNode,
  ParallelNode,
  SequenceNode,
  XorNode,
} from './nodes'
import type { EngineNode, EngineStepResult, NodeCursor } from './types'
import type { PendingEnvelope } from './types'
import { ActionRegistry } from './registry'
import { HookDispatcher } from './dispatcher'
import { EngineTree } from './tree'
import { LogStore } from './log-store'
import { EventStore } from '../events/store'
import { eventsToLogEntries } from '../events/log-mapper'
import type { EngineInternals } from './engine-internals'
import {
  buildOwnedFlowNode,
  buildFlowNode,
  effectiveOwnerPlayerId,
  enforceCompositeContinuationMandatory,
  pendingEnvelopeFromHostNode,
  snapshotCompositeEmit,
} from './engine-utils'
import { engineProceed } from './engine-proceed'
import { engineResolveChoice } from './engine-resolve'

type EngineContext = {
  state: GameState
  player: PlayerState
  space: ActionSpace
}

type MutableNodeState = EngineNode & {
  setState?: (state: 'ready' | 'resolved' | 'blocked') => void
}

const cloneSnapshotValue = <T>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T

const cloneEventLogDerivations = (
  derivations: EngineInternals['eventLogDerivations'],
): EngineInternals['eventLogDerivations'] =>
  derivations.map((entry) => ({
    events: entry.events.map((event) => cloneSnapshotValue(event)),
    result: cloneSnapshotValue(entry.result),
  }))

type InternalChildResultsSnapshot = Array<{
  hostNodeId: string
  results: Record<string, ActionExecutionResult>
}>

const cloneInternalChildResults = (
  results: EngineInternals['internalChildResults'],
): InternalChildResultsSnapshot =>
  [...results.entries()].map(([hostNodeId, hostResults]) => ({
    hostNodeId,
    results: cloneSnapshotValue(hostResults),
  }))

const restoreInternalChildResults = (
  snapshot?: InternalChildResultsSnapshot,
): EngineInternals['internalChildResults'] =>
  new Map((snapshot ?? []).map((entry) => [
    entry.hostNodeId,
    cloneSnapshotValue(entry.results),
  ]))

const setNodeState = (
  node: EngineNode,
  state: 'ready' | 'resolved' | 'blocked',
): void => {
  const mutable = node as MutableNodeState
  if (mutable.setState) {
    mutable.setState(state)
    return
  }
  if (state === 'resolved') node.resolve()
}

const nextCounterValueFromIds = (nodes: EngineNode[]): number =>
  nodes.reduce((next, node) => {
    const match = node.id.match(/-(\d+)$/)
    if (!match) return next
    const parsed = Number(match[1])
    return Number.isSafeInteger(parsed) ? Math.max(next, parsed + 1) : next
  }, 0)

const restoreSharedCursorData = (node: EngineNode, data: Record<string, unknown>): void => {
  if (typeof data.ownerPlayerId === 'string') node.ownerPlayerId = data.ownerPlayerId
  const labeledNode = node as EngineNode & {
    choiceLabelKey?: string
    choiceLabelParams?: Record<string, unknown>
  }
  if (typeof data.choiceLabelKey === 'string') {
    labeledNode.choiceLabelKey = data.choiceLabelKey
  }
  if (data.choiceLabelParams && typeof data.choiceLabelParams === 'object') {
    labeledNode.choiceLabelParams = data.choiceLabelParams as Record<string, unknown>
  }
  if (typeof data.optional === 'boolean') node.optional = data.optional
  if (typeof data.optionalActive === 'boolean') node.optionalActive = data.optionalActive
  if (typeof data.optionalPromptKey === 'string') {
    node.optionalPromptKey = data.optionalPromptKey as PromptKey
  }
  if (typeof data.mandatory === 'boolean') node.mandatory = data.mandatory
  if (data.pending && typeof data.pending === 'object') {
    node.setPending(data.pending as PendingEnvelope)
  }
}

const restoreTreeFromCursor = (cursors: NodeCursor[]): EngineNode | null => {
  if (cursors.length === 0) return null
  const byId = new Map(cursors.map((cursor) => [cursor.id, cursor]))
  const referenced = new Set<string>()
  for (const cursor of cursors) {
    const childrenIds = cursor.data.childrenIds
    if (Array.isArray(childrenIds)) {
      childrenIds.forEach((id) => {
        if (typeof id === 'string') referenced.add(id)
      })
    }
    if (typeof cursor.data.childId === 'string') referenced.add(cursor.data.childId)
  }
  const rootCursor = cursors.find((cursor) => !referenced.has(cursor.id)) ?? cursors[0]
  if (!rootCursor) return null
  const built = new Map<string, EngineNode>()

  const build = (id: string): EngineNode | null => {
    const cached = built.get(id)
    if (cached) return cached
    const cursor = byId.get(id)
    if (!cursor) return null
    const data = cursor.data
    const buildChildren = (): EngineNode[] => {
      const childrenIds = Array.isArray(data.childrenIds) ? data.childrenIds : []
      return childrenIds
        .map((childId) => (typeof childId === 'string' ? build(childId) : null))
        .filter((child): child is EngineNode => child !== null)
    }

    let node: EngineNode | null = null
    switch (cursor.type as string) {
      case 'action': {
        const action = new ActionNode(
          cursor.id,
          data.actionId as string,
          data.sourceCard as string | undefined,
          data.params as ActionNode['params'],
          data.choiceLabelKey as string | undefined,
          data.choiceLabelParams as Record<string, unknown> | undefined,
          data.actionContext as Record<string, unknown> | undefined,
          data.effectPreview as ActionNode['effectPreview'],
          data.internalHostNodeId as string | undefined,
          data.internalResultKey as string | undefined,
          data.internalPaymentInfoFrom as string | undefined,
        )
        action.beforePhaseResolved = data.beforePhaseResolved === true
        action.emittedRequest = data.emittedRequest as InteractionRequest | undefined
        action.deferredHostResult = data.deferredHostResult as ActionExecutionResult | undefined
        action.deferredAfterHostCommitChildren = data.deferredAfterHostCommitChildren as ActionNode['deferredAfterHostCommitChildren']
        action.deferredAfterHostChildren = data.deferredAfterHostChildren as ActionNode['deferredAfterHostChildren']
        action.deferredHostCommitCompleted = data.deferredHostCommitCompleted as boolean | undefined
        action.deferredHostTransactionEvents = data.deferredHostTransactionEvents as ActionNode['deferredHostTransactionEvents']
        action.deferredHostActionEvents = data.deferredHostActionEvents as ActionNode['deferredHostActionEvents']
        action.deferredHostTriggerSnapshot = data.deferredHostTriggerSnapshot as ActionNode['deferredHostTriggerSnapshot']
        action.deferredHostChoice = data.deferredHostChoice as string | undefined
        action.deferredHostResultTargetNodeId = data.deferredHostResultTargetNodeId as string | undefined
        action.deferredHostResultKey = data.deferredHostResultKey as string | undefined
        node = action
        break
      }
      case 'sequence':
        node = new SequenceNode(cursor.id, buildChildren())
        break
      case 'parallel': {
        const parallel = new ParallelNode(cursor.id, buildChildren())
        if (data.mode === 'trigger-select') parallel.mode = 'trigger-select'
        parallel.resolveAfterSelection = data.resolveAfterSelection === true
        parallel.selectedChildId = typeof data.selectedChildId === 'string'
          ? data.selectedChildId
          : null
        parallel.triggerOwnerPlayerId = typeof data.triggerOwnerPlayerId === 'string'
          ? data.triggerOwnerPlayerId
          : undefined
        parallel.triggerChildren = Array.isArray(data.triggerChildren)
          ? data.triggerChildren as ParallelNode['triggerChildren']
          : []
        parallel.emittedChoices = (data.emittedChoices as ActionChoiceOption[] | undefined) ?? []
        parallel.emittedPromptKey = data.emittedPromptKey as PromptKey | undefined
        parallel.emittedPromptParams = data.emittedPromptParams as Record<string, unknown> | undefined
        parallel.emittedRequest = data.emittedRequest as InteractionRequest | undefined
        node = parallel
        break
      }
      case 'or': {
        const or = new OrNode(cursor.id, buildChildren(), data.promptKey as PromptKey | undefined)
        or.emittedChoices = (data.emittedChoices as ActionChoiceOption[] | undefined) ?? []
        or.emittedPromptKey = data.emittedPromptKey as PromptKey | undefined
        or.emittedPromptParams = data.emittedPromptParams as Record<string, unknown> | undefined
        or.emittedRequest = data.emittedRequest as InteractionRequest | undefined
        or.pendingActionId = data.pendingActionId as string | null | undefined
        or.pendingContextSnapshot = data.pendingContextSnapshot as OrNode['pendingContextSnapshot']
        node = or
        break
      }
      case 'xor': {
        const xor = new XorNode(cursor.id, buildChildren(), data.promptKey as PromptKey | undefined)
        xor.selectedChildId = typeof data.selectedChildId === 'string'
          ? data.selectedChildId
          : null
        xor.emittedChoices = (data.emittedChoices as ActionChoiceOption[] | undefined) ?? []
        xor.emittedPromptKey = data.emittedPromptKey as PromptKey | undefined
        xor.emittedPromptParams = data.emittedPromptParams as Record<string, unknown> | undefined
        xor.emittedRequest = data.emittedRequest as InteractionRequest | undefined
        xor.pendingActionId = data.pendingActionId as string | null | undefined
        xor.pendingContextSnapshot = data.pendingContextSnapshot as XorNode['pendingContextSnapshot']
        node = xor
        break
      }
      default:
        return null
    }

    restoreSharedCursorData(node, data)
    setNodeState(node, cursor.state)
    built.set(id, node)
    return node
  }

  return build(rootCursor.id)
}

export class Engine {
  private tree: EngineTree
  private registry: ActionRegistry
  private hooks: HookDispatcher
  private log: LogStore
  private events = new EventStore()
  private eventLogDerivations: EngineInternals['eventLogDerivations'] = []
  private internalChildResults: EngineInternals['internalChildResults'] = new Map()
  private _pendingNodeIdRef: { value: string | null } = { value: null }
  private _counterRef: { value: number } = { value: 0 }
  private beforePhaseFlowNodeIds = new Set<string>()

  /**
   * S4c PR5 — return a boxed snapshot of the engine's core mutable fields,
   * for use by module-private functions in `engine-utils.ts` /
   * `engine-proceed.ts` / `engine-resolve.ts` (extracted in subsequent
   * sub-commits). Not part of the public API; listed in the surface guard's
   * `PRIVATE_HELPERS`.
   *
   * @internal Package-internal coordination surface only. Do not call from
   * outside shared/engine/.
   */
  _internals(): EngineInternals {
    return {
      tree: this.tree,
      registry: this.registry,
      hooks: this.hooks,
      log: this.log,
      events: this.events,
      eventLogDerivations: this.eventLogDerivations,
      internalChildResults: this.internalChildResults,
      counterRef: this._counterRef,
      beforePhaseFlowNodeIds: this.beforePhaseFlowNodeIds,
      pendingNodeIdRef: this._pendingNodeIdRef,
    }
  }
  /**
  /**
   * S2 Task 8: returns the pending-choice metadata regardless of whether the
   * pending node is a leaf or one of the composite nodes (`OrNode` /
   * `XorNode`). Composite nodes carry their
   * own `emittedChoices` / `emittedPromptKey` / `emittedPromptParams` /
   * `emittedRequest` fields populated in {@link proceed}.
   *
   * @internal Package-internal coordination surface for EngineStack.
   * Do not call from outside shared/engine/. Listed in
   * `engine-public-surface.test.ts:PRIVATE_HELPERS` so the surface guard
   * stays green.
   */
  peekPendingChoiceFromComposite(): {
    nodeId: string
    promptKey?: PromptKey
    promptParams?: Record<string, unknown>
    options: ActionChoiceOption[]
    request?: InteractionRequest
  } | null {
    if (this._pendingNodeIdRef.value === null) return null
    const node = this.tree.findNodeById(this._pendingNodeIdRef.value)
    if (!node) return null
    if (node instanceof OrNode || node instanceof XorNode) {
      if (node.emittedChoices.length === 0 && node.emittedRequest === undefined) return null
      return {
        nodeId: node.id,
        promptKey: node.emittedPromptKey,
        promptParams: node.emittedPromptParams,
        options: node.emittedChoices,
        request: node.emittedRequest,
      }
    }
    if (node instanceof ParallelNode && node.mode === 'trigger-select') {
      if (node.getState() === 'resolved') return null
      if (node.emittedChoices.length === 0 && node.emittedRequest === undefined) return null
      return {
        nodeId: node.id,
        promptKey: node.emittedPromptKey,
        promptParams: node.emittedPromptParams,
        options: node.emittedChoices,
        request: node.emittedRequest,
      }
    }
    return null
  }

  /**
   * PendingEnvelope compatibility API. New runtime nodes can host
   * `node.pending` directly; while wrapper/composite nodes still exist,
   * this adapts their existing emitted choice fields into the same shape.
   *
   * @internal Package-internal coordination surface for EngineStack.
   */
  peekPendingEnvelope(): PendingEnvelope | null {
    const pendingNode = this._pendingNodeIdRef.value
      ? this.tree.findNodeById(this._pendingNodeIdRef.value)
      : null
    const pendingEnvelope = pendingEnvelopeFromHostNode(pendingNode)
    if (pendingEnvelope) return pendingEnvelope

    for (const node of this.tree.allNodes()) {
      const explicitPending = node.getPending()
      if (explicitPending) return explicitPending
    }
    return null
  }

  /**
   * @internal Package-internal coordination surface for EngineStack.
   */
  peekPendingHost(): EngineNode | null {
    const pendingNode = this._pendingNodeIdRef.value
      ? this.tree.findNodeById(this._pendingNodeIdRef.value)
      : null
    if (pendingEnvelopeFromHostNode(pendingNode)) return pendingNode

    return this.tree.allNodes().find((node) => node.getPending() !== null) ?? null
  }

  /**
   * @internal Package-internal owner lookup for session execution contexts.
   */
  peekNextUnresolvedNodeId(): string | null {
    return this.tree.nextUnresolved()?.id ?? null
  }

  flushEventTransaction(context: EngineContext): void {
    const snapshot = this.events.snapshot()
    if (!snapshot.inTransaction || snapshot.transactionEvents.length === 0) return
    context.state.events ??= []
    context.state.nextEventSeq ??= 1
    const committed = this.events.commitTransaction(context.state)
    const pendingHost = this.peekPendingHost()
    if (pendingHost instanceof ActionNode && committed.length > 0) {
      const preserved = committed.map((event) => cloneSnapshotValue(event))
      pendingHost.deferredHostTransactionEvents = [
        ...(pendingHost.deferredHostTransactionEvents ?? []),
        ...preserved,
      ]
      pendingHost.deferredHostActionEvents = [
        ...(pendingHost.deferredHostActionEvents ?? []),
        ...preserved,
      ]
    }
    this.eventLogDerivations = []
    const playerNames = Object.fromEntries(
      context.state.players.map((player) => [player.id, player.name]),
    )
    const actionNames = Object.fromEntries([
      ...context.state.actionSpaces.map((space) => [space.id, space.nameKey] as const),
      ...[...this.registry.values()].map((action) => [action.id, action.nameKey] as const),
    ])
    const entries = eventsToLogEntries(committed, { playerNames, actionNames })
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      this.log.append(entries[index]!)
    }
  }

  /**
   * @internal Package-internal owner lookup for session execution contexts.
   */
  getEffectiveOwnerPlayerId(
    nodeId: string,
    frameOwnerPlayerId?: string,
  ): string | undefined {
    return effectiveOwnerPlayerId(this._internals(), nodeId, frameOwnerPlayerId)
  }

  /**
   * Build flow nodes from the given ActionFlow list, inject them before the
   * next unresolved node (or prepend before root when nothing is pending), then
   * — when ctx is supplied — drive proceed() until the injected nodes are no
   * longer the next unresolved.
   *
   * Without ctx (`injectBeforeFlows([flow])`), only injection happens. This is
   * the anytime-action plumbing path where the caller drives the engine
   * separately afterwards.
   *
   * With ctx (`injectBeforeFlows(flows, ctx)`), this is the before-phase inject
   * pattern: build → inject → proceed-loop.
   */
  injectBeforeFlows(
    flows: ActionFlow[],
    ctx?: EngineContext,
    ownerPlayerId = ctx?.player.id,
  ): void {
    if (flows.length === 0) return
    const internals = this._internals()
    const flowNodes = flows.map((flow) => buildFlowNode(internals, flow, ownerPlayerId))
    const nextUnresolved = this.tree.nextUnresolved()
    if (ctx && nextUnresolved) {
      enforceCompositeContinuationMandatory(nextUnresolved)
    }
    if (nextUnresolved) {
      this.tree.insertBefore(nextUnresolved.id, flowNodes)
    } else {
      // No pending unresolved node — wrap root in a SequenceNode so the
      // injected flows execute first.
      this.tree.root = new SequenceNode(
        `prepend-root-${this._counterRef.value++}`,
        [...flowNodes, this.tree.root],
      )
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


  snapshot() {
    const nodes = this.tree.allNodes()
    const nodeStates = nodes.map((node) => ({
      id: node.id,
      state: node.getState(),
    }))
    const pendingData = nodes
      .map((node) => {
        const pending = node.getPending()
        return pending ? { nodeId: node.id, pending } : null
      })
      .filter((item): item is { nodeId: string; pending: PendingEnvelope } => item !== null)
    return {
      treeCursor: nodes.map((node) => (node as EngineNode & { toCursor: () => NodeCursor }).toCursor()),
      nodeStates,
      pendingData,
      // S2 Task 8: composite (Or/Xor) emit metadata is now stored
      // on the node itself instead of an engine-level cache. We still need
      // to persist it so cursor round-trip / undo restoreHistory can rebuild
      // the pending-choice host on rehydrate.
      compositeEmit: snapshotCompositeEmit(this._internals()),
      beforePhaseFlowNodeIds: [...this.beforePhaseFlowNodeIds],
      internalChildResults: cloneInternalChildResults(this.internalChildResults),
      eventTransaction: this.events.snapshot(),
      eventLogDerivations: cloneEventLogDerivations(this.eventLogDerivations),
    }
  }

  /**
   * @internal Package-internal coordination surface for EngineStack.
   * Do not call from outside shared/engine/. Listed in
   * `engine-public-surface.test.ts:PRIVATE_HELPERS` so the surface guard
   * stays green.
   */
  hasPendingChoiceCompositeAncestor() {
    if (!this._pendingNodeIdRef.value) return false
    let parent = this.tree.findParent(this._pendingNodeIdRef.value)
    while (parent) {
      if (parent instanceof OrNode || parent instanceof XorNode) {
        return true
      }
      parent = this.tree.findParent(parent.id)
    }
    return false
  }

  setEngineBlockedPending(nodeId: string, actionId: string): boolean {
    const node = this.tree.findNodeById(nodeId)
    if (!node) return false
    node.setPending({
      hostNodeId: node.id,
      request: { kind: 'engine-blocked', actionId },
      choices: [],
      promptKey: 'ui.interactionEngineBlocked',
      pendingActionId: actionId,
      ownerNodeId: null,
    })
    this._pendingNodeIdRef.value = node.id
    return true
  }

  restore(snapshot: {
    treeCursor?: NodeCursor[]
    nodeStates: {
      id: string
      state: 'ready' | 'resolved' | 'blocked'
    }[]
    pendingData?: {
      nodeId: string
      pending: PendingEnvelope
    }[]
    /**
     * S2 Task 8: composite (Or/Xor) emit metadata. On restore,
     * apply to the named node's `emittedChoices` / `emittedPromptKey` /
     * `emittedPromptParams` / `emittedRequest` fields.
     */
    compositeEmit?: {
      nodeId: string
      promptKey?: PromptKey
      promptParams?: Record<string, unknown>
      options: ActionChoiceOption[]
      request?: InteractionRequest
    } | null
    beforePhaseFlowNodeIds?: string[]
    internalChildResults?: InternalChildResultsSnapshot
    eventTransaction?: ReturnType<Engine['events']['snapshot']>
    eventLogDerivations?: EngineInternals['eventLogDerivations']
  }) {
    this.beforePhaseFlowNodeIds = new Set(snapshot.beforePhaseFlowNodeIds ?? [])
    this.internalChildResults = restoreInternalChildResults(snapshot.internalChildResults)
    this.events.restore(snapshot.eventTransaction)
    this.eventLogDerivations = cloneEventLogDerivations(snapshot.eventLogDerivations ?? [])
    const restoredRoot = snapshot.treeCursor ? restoreTreeFromCursor(snapshot.treeCursor) : null
    if (restoredRoot) {
      this.tree.root = restoredRoot
    }
    const nodes = this.tree.allNodes()
    this._counterRef.value = Math.max(this._counterRef.value, nextCounterValueFromIds(nodes))
    const nodeMap = new Map(nodes.map((node) => [node.id, node]))
    let explicitPendingNodeId: string | null = null
    for (const entry of snapshot.pendingData ?? []) {
      const node = nodeMap.get(entry.nodeId)
      if (!node) continue
      node.setPending(entry.pending)
      explicitPendingNodeId ??= node.id
    }
    snapshot.nodeStates.forEach(({ id, state }) => {
      const node = nodeMap.get(id)
      if (!node) return
      if (
        node instanceof ActionNode ||
        node instanceof OrNode ||
        node instanceof XorNode
      ) {
        node.setState(state)
      }
    })
    const restoredPendingNodeId =
      explicitPendingNodeId ??
      this.tree.allNodes().find((node) => node.getPending() !== null)?.id ??
      null
    this._pendingNodeIdRef.value =
      restoredPendingNodeId ?? snapshot.compositeEmit?.nodeId ?? null

    // S2 Task 8 / Wave3: rebuild composite emit metadata onto Or/Xor
    // and trigger-select Parallel nodes.
    const compositeEmit = snapshot.compositeEmit ?? null
    if (compositeEmit) {
      const node = nodeMap.get(compositeEmit.nodeId)
      if (node instanceof OrNode || node instanceof XorNode) {
        node.emittedChoices = compositeEmit.options
        node.emittedPromptKey = compositeEmit.promptKey
        node.emittedPromptParams = compositeEmit.promptParams
        node.emittedRequest = compositeEmit.request
      }
      if (node instanceof ParallelNode && node.mode === 'trigger-select') {
        node.emittedChoices = compositeEmit.options
        node.emittedPromptKey = compositeEmit.promptKey
        node.emittedPromptParams = compositeEmit.promptParams
        node.emittedRequest = compositeEmit.request
      }
    }
  }

  constructor(params: {
    tree: EngineTree
    registry: ActionRegistry
    hooks: HookDispatcher
    log: LogStore
  }) {
    this.tree = params.tree
    this.registry = params.registry
    this.hooks = params.hooks
    this.log = params.log
  }

  proceed(context: EngineContext): EngineStepResult {
    return engineProceed(this._internals(), context)
  }

  /**
   * Resolve a pending choice. Threading the optional `payload` lets
   * ActionDef.resolveChoice receive client-supplied submission data
   * (e.g. fence edges, plow tile).
   */
  resolveChoice(
    choice: string,
    context: EngineContext,
    payload?: Record<string, unknown>,
  ): ActionExecutionResult {
    return engineResolveChoice(this._internals(), choice, context, payload)
  }

  /**
   * Insert an ActionFlow to run after the pending choice is resolved.
   * Precondition: a pending choice is currently active
   * (a pending node id is set). No-op otherwise. Mirrors the
   * `{ type: 'flow' }` branch of resolveChoice.
   *
   * @internal Package-internal coordination surface for EngineStack.
   * Do not call from outside shared/engine/. Listed in
   * `engine-public-surface.test.ts:PRIVATE_HELPERS` so the surface guard
   * stays green.
   */
  insertFlowAfterPendingChoice(flow: ActionFlow, ownerPlayerId?: string): void {
    const envelope = this.peekPendingEnvelope()
    const insertionTargetId = envelope?.ownerNodeId ?? this._pendingNodeIdRef.value
    if (!insertionTargetId) return
    const flowNode = ownerPlayerId
      ? buildOwnedFlowNode(this._internals(), flow, ownerPlayerId)
      : buildFlowNode(this._internals(), flow)
    this.tree.insertAfter(insertionTargetId, [flowNode])
  }
}
