import type {
  ActionExecutionContext,
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
  InteractionNode,
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
import { INTERACTION_ONLY_ACTION_ID } from './engine-stack'
import type { EngineInternals } from './engine-internals'
import {
  buildFlowNode,
  effectiveOwnerPlayerId,
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

const restoreSharedCursorData = (node: EngineNode, data: Record<string, unknown>): void => {
  if (typeof data.ownerPlayerId === 'string') node.ownerPlayerId = data.ownerPlayerId
  if (typeof data.optional === 'boolean') node.optional = data.optional
  if (typeof data.optionalActive === 'boolean') node.optionalActive = data.optionalActive
  if (typeof data.optionalPromptKey === 'string') {
    node.optionalPromptKey = data.optionalPromptKey as PromptKey
  }
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
        )
        action.beforePhaseResolved = data.beforePhaseResolved === true
        action.emittedRequest = data.emittedRequest as InteractionRequest | undefined
        node = action
        break
      }
      case 'interaction': {
        const interaction = new InteractionNode(
          cursor.id,
          (data.choices as ActionChoiceOption[] | undefined) ?? [],
          data.request as InteractionRequest | undefined,
        )
        interaction.promptKey = data.promptKey as PromptKey | undefined
        interaction.promptParams = data.promptParams as Record<string, unknown> | undefined
        interaction.pendingActionId = data.pendingActionId as string | undefined
        interaction.ownerNodeId = data.ownerNodeId as string | undefined
        interaction.contextSnapshot = data.contextSnapshot as InteractionNode['contextSnapshot']
        node = interaction
        break
      }
      case 'sequence':
        node = new SequenceNode(cursor.id, buildChildren())
        break
      case 'parallel': {
        const parallel = new ParallelNode(cursor.id, buildChildren())
        if (data.mode === 'trigger-select') parallel.mode = 'trigger-select'
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
  // S4c PR2 — the engine's own runtime pointer to the currently presented
  // InteractionNode (or composite host: Or/Xor/Optional). NOT a mirror — the
  // 3 mirror fields (pendingInteractionActionId / OwnerNodeId / Context) were
  // deleted in S4c PR2 once snapshot consumers migrated to read pending data
  // off the InteractionNode in `choiceData` (and composite emit metadata).
  //
  // S4c PR5 — boxed as `{ value }` ref objects so module-private functions
  // in engine-utils / engine-proceed / engine-resolve (extracted in
  // subsequent steps) can mutate them via the `EngineInternals` snapshot.
  // Module functions cannot mutate primitives on `this` by reference.
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
      counterRef: this._counterRef,
      beforePhaseFlowNodeIds: this.beforePhaseFlowNodeIds,
      pendingNodeIdRef: this._pendingNodeIdRef,
    }
  }
  /**
  /**
   * S2 Task 8: returns the pending-choice metadata regardless of whether the
   * pending node is an `InteractionNode` (leaf-paired) or one of the composite
   * nodes (`OrNode` / `XorNode`). Composite nodes carry their
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
   * @internal Package-internal coordination surface for EngineStack.
   * Do not call from outside shared/engine/. Listed in
   * `engine-public-surface.test.ts:PRIVATE_HELPERS` so the surface guard
   * stays green.
   */
  peekInteraction(): InteractionNode | null {
    if (this._pendingNodeIdRef.value === null) return null
    const node = this.tree.findNodeById(this._pendingNodeIdRef.value)
    return node instanceof InteractionNode ? node : null
  }

  /**
   * S4b PR5 — return the current pending-interaction host, regardless of
   * whether it is a leaf-paired `InteractionNode` or one of the composite
   * nodes (`OrNode` / `XorNode`). All composite host types now
   * carry a uniform `{ pendingActionId, pendingContextSnapshot, choices,
   * promptKey, request }` shape (composite nodes mirror onto the equivalent
   * `emittedXxx` fields), so consumers can read pending metadata off this
   * single accessor instead of going through the engine-level
   * `pendingInteractionXxx` mirrors.
   *
   * @internal Package-internal coordination surface for EngineStack.
   * Do not call from outside shared/engine/. Listed in
   * `engine-public-surface.test.ts:PRIVATE_HELPERS` so the surface guard
   * stays green.
   */
  peekInteractionHost(): EngineNode | null {
    if (this._pendingNodeIdRef.value === null) return null
    return this.tree.findNodeById(this._pendingNodeIdRef.value) ?? null
  }

  /**
   * PendingEnvelope compatibility API. New runtime nodes can host
   * `node.pending` directly; while legacy wrapper/composite nodes still exist,
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
   * Replace this engine's tree with a single synthetic InteractionNode and pin
   * the pending-interaction pointers at it. Used by GameCore.startConfirm*/
  /* startFeedSubFlow when promoting GameCore-driven prompts (confirmNextPlayer,
   * confirmPlayerSwitch, harvest-feed) into the InteractionNode pipeline. The
   * parent context (current player, space) is owned by the EngineStack frame
   * GameCore pushes — the engine itself just hosts the InteractionNode so
   * `peekInteraction()` / `snapshot()` round-trip the pending request.
   *
   * We swap the entire tree root rather than `insertBefore` because the
   * synthetic frames pushed for confirm/feed have no real action body; the
   * InteractionNode IS the only thing the engine should surface.
   */
  injectInteraction(node: InteractionNode): void {
    this.tree.root = node
    this._pendingNodeIdRef.value = node.id
    // Synthetic action id — never resolves through the registry. Engine paths
    // that look up `node.pendingActionId` (e.g. flushLeafActionDetail) tolerate
    // unknown ids gracefully. Authoritative owner is the InteractionNode
    // itself (S4b Task 11; S4c PR2 deleted the engine-level mirrors).
    node.pendingActionId = INTERACTION_ONLY_ACTION_ID
    node.ownerNodeId = undefined
    node.contextSnapshot = {
      params: undefined,
      costs: undefined,
      sourceCard: undefined,
      actionContext: undefined,
    }
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
    const choiceNode =
      this._pendingNodeIdRef.value !== null
        ? this.tree.findNodeById(this._pendingNodeIdRef.value)
        : null
    // S4c PR2 — the engine no longer keeps top-level pendingInteractionXxx
    // mirror fields. choiceData carries the InteractionNode-authoritative
    // pending state (pendingActionId / ownerNodeId / contextSnapshot) so
    // restore() can rebuild without consulting deleted engine fields.
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
      treeCursor: nodes.map((node) => (node as EngineNode & { toCursor: () => NodeCursor }).toCursor()),
      nodeStates,
      choiceData,
      pendingData,
      // S2 Task 8: composite (Or/Xor) emit metadata is now stored
      // on the node itself instead of an engine-level cache. We still need
      // to persist it so cursor round-trip / undo restoreHistory can rebuild
      // the pending-choice host on rehydrate.
      compositeEmit: snapshotCompositeEmit(this._internals()),
      beforePhaseFlowNodeIds: [...this.beforePhaseFlowNodeIds],
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

  restore(snapshot: {
    treeCursor?: NodeCursor[]
    nodeStates: {
      id: string
      state: 'ready' | 'resolved' | 'blocked'
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
  }) {
    this.beforePhaseFlowNodeIds = new Set(snapshot.beforePhaseFlowNodeIds ?? [])
    // Synthetic interaction-only frames (pushed by GameCore.startConfirm*/
    // startFeedSubFlow) have a single InteractionNode at root. The cursor
    // serializes them with `pendingActionId === '__interaction_only__'`
    // on the InteractionNode itself (S4c PR2 — the previous engine-level
    // mirror was deleted; choiceData now carries the marker). Re-inject
    // before the normal nodeStates pass so subsequent `nextUnresolved()`
    // finds the same InteractionNode the original session held.
    if (snapshot.choiceData?.pendingActionId === INTERACTION_ONLY_ACTION_ID) {
      const data = snapshot.choiceData
      const restored = new InteractionNode(data.id, data.choices, data.request)
      restored.promptKey = data.promptKey
      restored.pendingActionId = data.pendingActionId
      restored.ownerNodeId = data.ownerNodeId
      restored.contextSnapshot = data.contextSnapshot ?? undefined
      this.injectInteraction(restored)
      // Replay the node state in case the interaction was already
      // partially resolved before serialization.
      const nodeStateEntry = snapshot.nodeStates.find((entry) => entry.id === data.id)
      if (nodeStateEntry) {
        restored.setState(nodeStateEntry.state)
      }
      const pendingEntry = snapshot.pendingData?.find((entry) => entry.nodeId === restored.id)
      if (pendingEntry) {
        restored.setPending(pendingEntry.pending)
        this._pendingNodeIdRef.value = restored.id
      }
      return
    }
    const restoredRoot = snapshot.treeCursor ? restoreTreeFromCursor(snapshot.treeCursor) : null
    if (restoredRoot) {
      this.tree.root = restoredRoot
    }
    const nodeMap = new Map(
      this.tree.allNodes().map((node) => [node.id, node]),
    )
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
      if (node instanceof InteractionNode) {
        node.setState(state)
        return
      }
      if (
        node instanceof ActionNode ||
        node instanceof OrNode ||
        node instanceof XorNode
      ) {
        node.setState(state)
      }
    })
    if (snapshot.choiceData) {
      const node = nodeMap.get(snapshot.choiceData.id)
      if (node instanceof InteractionNode) {
        node.setChoice(snapshot.choiceData.promptKey, snapshot.choiceData.choices)
        if (snapshot.choiceData.request) {
          node.request = snapshot.choiceData.request
        }
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
    // S4c PR2 — rebuild the engine's runtime pointer from choiceData.id
    // (InteractionNode host) or compositeEmit.nodeId (Or/Xor host).
    // Replaces the deleted top-level pendingInteractionNodeId/ActionId/
    // OwnerNodeId/Context mirror fields.
    this._pendingNodeIdRef.value =
      explicitPendingNodeId ?? snapshot.choiceData?.id ?? snapshot.compositeEmit?.nodeId ?? null

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
   * (pendingInteractionNodeId is set). No-op otherwise. Mirrors the
   * `{ type: 'flow' }` branch of resolveChoice.
   *
   * @internal Package-internal coordination surface for EngineStack.
   * Do not call from outside shared/engine/. Listed in
   * `engine-public-surface.test.ts:PRIVATE_HELPERS` so the surface guard
   * stays green.
   */
  insertFlowAfterPendingChoice(flow: ActionFlow, ownerPlayerId?: string): void {
    // S4c PR2 — read owner from the InteractionNode (was: pendingInteractionOwnerNodeId mirror).
    const interactionNode = this.peekInteraction()
    const insertionTargetId = interactionNode?.ownerNodeId ?? this._pendingNodeIdRef.value
    if (!insertionTargetId) return
    const flowNode = buildFlowNode(this._internals(), flow, ownerPlayerId)
    this.tree.insertAfter(insertionTargetId, [flowNode])
  }
}
