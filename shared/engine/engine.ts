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
  OptionalNode,
  OrNode,
  SequenceNode,
  XorNode,
} from './nodes'
import { ParallelTriggerNode } from './nodes/parallel-trigger-node'
import type { EngineNode, EngineStepResult } from './types'
import { ActionRegistry } from './registry'
import { HookDispatcher } from './dispatcher'
import { EngineTree } from './tree'
import { LogStore } from './log-store'
import { INTERACTION_ONLY_ACTION_ID } from './engine-stack'
import type { EngineInternals } from './engine-internals'
import { buildFlowNode, snapshotCompositeEmit } from './engine-utils'
import { engineProceed } from './engine-proceed'
import { engineResolveChoice } from './engine-resolve'

type EngineContext = {
  state: GameState
  player: PlayerState
  space: ActionSpace
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
   * nodes (`OrNode` / `XorNode` / `OptionalNode`). Composite nodes carry their
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
    if (node instanceof OrNode || node instanceof XorNode || node instanceof OptionalNode) {
      if (node.emittedChoices.length === 0 && node.emittedRequest === undefined) return null
      return {
        nodeId: node.id,
        promptKey: node.emittedPromptKey,
        promptParams: node.emittedPromptParams,
        options: node.emittedChoices,
        request: node.emittedRequest,
      }
    }
    if (node instanceof ParallelTriggerNode) {
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
   * nodes (`OrNode` / `XorNode` / `OptionalNode`). All four host types now
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
      active: node instanceof OptionalNode ? node.active : undefined,
    }))
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
      nodeStates,
      choiceData,
      // S2 Task 8: composite (Or/Xor/Optional) emit metadata is now stored
      // on the node itself instead of an engine-level cache. We still need
      // to persist it so cursor round-trip / undo restoreHistory can rebuild
      // the pending-choice host on rehydrate.
      compositeEmit: snapshotCompositeEmit(this._internals()),
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
    /**
     * S2 Task 8: composite (Or/Xor/Optional) emit metadata. On restore,
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
  }) {
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
    // (InteractionNode host) or compositeEmit.nodeId (Or/Xor/Optional host).
    // Replaces the deleted top-level pendingInteractionNodeId/ActionId/
    // OwnerNodeId/Context mirror fields.
    this._pendingNodeIdRef.value =
      snapshot.choiceData?.id ?? snapshot.compositeEmit?.nodeId ?? null

    // S2 Task 8: rebuild composite emit metadata onto Or/Xor/Optional nodes.
    const compositeEmit = snapshot.compositeEmit ?? null
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
