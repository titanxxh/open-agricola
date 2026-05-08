import type {
  ActionExecutionContext,
  ActionExecutionResult,
  ActionFlow,
  ActionSpace,
  PlayerState,
  GameState,
  ActionChoiceOption,
  ImmediateLogEntry,
  InteractionRequest,
  LogEntry,
} from '../game/types'
import type { PromptKey } from '../game/prompt-keys'
import {
  ActionNode,
  ActivateCardNode,
  InteractionNode,
  OptionalNode,
  OrNode,
  PlayerSwitchNode,
  SequenceNode,
  XorNode,
} from './nodes'
import {
  getOptionsSourceCard,
  resolveChoiceSourceCard,
} from './nodes/interaction-node'
import {
  buildReplaceChoiceFlow,
  getChoiceLabel,
  getNodeSourceCard,
  getReplaceAwareChoiceLabel,
} from './nodes/interaction-helpers'
import type { EngineNode, EngineStepResult } from './types'
import { ActionRegistry } from './registry'
import { HookDispatcher } from './dispatcher'
import { getListenerById, executeCardListener, shouldSkipImmediateListenerLog } from '../cards/card-listeners'
import { incCardUsed } from '../cards/helpers/card-state'
import { EngineTree } from './tree'
import { LogStore } from './log-store'
import { INTERACTION_ONLY_ACTION_ID } from './engine-stack'
import type { ReorganizeTrigger } from '../actions/effects/reorganize'
import type { EngineInternals } from './engine-internals'
import {
  applyFallbackSourceCardToFlow,
  applyInteractionRequest,
  buildActivateCardNodes,
  buildChoiceExecutionContext,
  buildFlowNode,
  buildFollowUpNodes,
  buildListenerEvent,
  cloneNode,
  collectNodeIds,
  findActionNode,
  findInteractionNode,
  findPairedInteractionNode,
  getNodeEffectPreview,
  maybeBuildChoiceCandidates,
  normalizeFollowUpAction,
  resolveSubtree,
  snapshotCompositeEmit,
} from './engine-utils'

type EngineContext = {
  state: GameState
  player: PlayerState
  space: ActionSpace
}

type ImmediateLogCarrier = {
  logKey?: string
  logParams?: Record<string, unknown>
  immediateLogs?: ImmediateLogEntry[]
}

const stableSerializeLogValue = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeLogValue(item)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    )
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerializeLogValue(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

const serializeImmediateLog = (entry: ImmediateLogEntry): string =>
  `${entry.key}:${stableSerializeLogValue(entry.params ?? {})}`

const collectImmediateLogs = (
  playerName: string,
  result: ImmediateLogCarrier | null | undefined,
  options: { includeLegacyLogKey?: boolean } = {},
): LogEntry[] => {
  if (!result) return []
  const entries = [...(result.immediateLogs ?? [])]
  const seenEntries = new Set(entries.map((entry) => serializeImmediateLog(entry)))
  if ((options.includeLegacyLogKey ?? true) && result.logKey) {
    const legacyEntry = {
      key: result.logKey,
      params: result.logParams,
    }
    if (!seenEntries.has(serializeImmediateLog(legacyEntry))) {
      entries.unshift(legacyEntry)
    }
  }
  return entries.map((entry) => ({
    key: entry.key,
    params: {
      player: playerName,
      ...(entry.params ?? {}),
    },
  }))
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
   * nodes (`OrNode` / `XorNode` / `OptionalNode`). Replaces the engine-level
   * `lastEmittedChoice` cache — composite nodes now carry their own
   * `emittedChoices` / `emittedPromptKey` / `emittedPromptParams` /
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
  injectBeforeFlows(flows: ActionFlow[], ctx?: EngineContext): void {
    if (flows.length === 0) return
    const internals = this._internals()
    const flowNodes = flows.map((flow) => buildFlowNode(internals, flow))
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
     * `emittedPromptParams` / `emittedRequest` fields. Older snapshots that
     * still serialize `lastEmittedChoice` flow through the same restore
     * path (alias accepted below).
     */
    compositeEmit?: {
      nodeId: string
      promptKey?: PromptKey
      promptParams?: Record<string, unknown>
      options: ActionChoiceOption[]
      request?: InteractionRequest
    } | null
    /** @deprecated S2 Task 8 — accepted on restore for forward-compat with
     * snapshots produced by pre-Task-8 builds. New snapshots write
     * `compositeEmit` instead. */
    lastEmittedChoice?: {
      nodeId: string
      promptKey?: PromptKey
      promptParams?: Record<string, unknown>
      options: ActionChoiceOption[]
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
    // Accept the legacy `lastEmittedChoice` alias for snapshots produced by
    // pre-Task-8 builds.
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
    const int = this._internals()
    const node = this.tree.nextUnresolved()
    if (!node) {
      return { type: 'done' }
    }
    if (node instanceof OrNode || node instanceof XorNode) {
      const availableActions = node.children
        .filter((child) => child.getState() !== 'resolved')
        .map((child) => ({
          nodeId: child.id,
          node: this.tree.findNodeById(child.id) ?? child,
          actionNode: findActionNode(child),
        }))
        .filter((entry) => entry.actionNode !== null) as {
        nodeId: string
        node: EngineNode
        actionNode: ActionNode
      }[]
      const options = availableActions
        .map((entry) => {
          const executionContext: ActionExecutionContext = {
            state: context.state,
            player: context.player,
            space: context.space,
            params: entry.actionNode.params,
            sourceCard: entry.actionNode.sourceCard,
            actionContext: entry.actionNode.actionContext,
          }
          const action = this.registry.get(entry.actionNode.actionId)
          if (!action) return null
          const doable = this.hooks.applyIsDoable(
            { ...executionContext, actionId: entry.actionNode.actionId },
            action,
            action.canBeExecutedByPlayer(
              executionContext.state,
              executionContext.player,
              { sourceCard: executionContext.sourceCard },
            ),
          )
          if (!doable) return null
          const baseLabel = getChoiceLabel(entry.node, this.registry)
          if (!baseLabel) return null
          const label = getReplaceAwareChoiceLabel(
            entry.actionNode,
            executionContext,
            baseLabel,
            this.hooks,
            (flow, sc) => applyFallbackSourceCardToFlow(flow, sc),
          )
          return {
            value: entry.nodeId,
            labelKey: label.labelKey,
            labelParams: label.labelParams,
            sourceCard: label.sourceCard ?? getNodeSourceCard(entry.node),
            effectPreview: getNodeEffectPreview(entry.node),
          }
        })
        .filter((option) => option !== null) as {
        value: string
        labelKey: string
        labelParams?: Record<string, unknown>
        sourceCard?: string
      }[]
      if (
        node instanceof OrNode &&
        node.children.some((child) => child.getState() === 'resolved')
      ) {
        options.push({ value: '__done__', labelKey: 'ui.interactionFlowDone' })
      }
      const parent = this.tree.findParent(node.id)
      const optionalParent = parent instanceof OptionalNode ? parent : null
      if (optionalParent && options.length > 0) {
        options.push({ value: '__skip__', labelKey: 'ui.interactionOptionalSkip' })
      }
      if (options.length === 0) {
        if (optionalParent) {
          optionalParent.resolve()
          return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
        }
        return { type: 'blocked', nodeId: node.id }
      }
      this._pendingNodeIdRef.value = node.id
      const compositeCtxSnapshot = {
        params: undefined,
        costs: undefined,
        sourceCard: resolveChoiceSourceCard(getNodeSourceCard(node), options),
        actionContext: undefined,
      }
      const compositePromptKey = node.promptKey ?? 'ui.interactionFlowSelect'
      // S2 Task 8: write emit metadata to the OrNode/XorNode itself instead
      // of the engine-level lastEmittedChoice cache.
      node.emittedChoices = options
      node.emittedPromptKey = compositePromptKey
      node.emittedPromptParams = undefined
      node.emittedRequest = undefined
      // S4b PR5 / S4c PR2 — composite host owns pending-interaction context
      // snapshot. peekInteractionHost() reads it off the node directly.
      node.pendingActionId = null
      node.pendingContextSnapshot = compositeCtxSnapshot
      return {
        type: 'choice',
        nodeId: node.id,
        choice: {
          promptKey: compositePromptKey,
          options,
        },
      }
    }
    if (node instanceof OptionalNode) {
      if (node.active) {
        // 当 active 为 true 时，子节点会被 nextUnresolved 返回
        // 返回 ok 让引擎继续处理子节点
        return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
      }
      // 当 child 是 OrNode/XorNode 时，跳过 "do/skip" 这一步——
      // 让 OrNode/XorNode 直接呈现 "N 个分支 + skip" 一层选择
      if (node.child instanceof OrNode || node.child instanceof XorNode) {
        node.active = true
        return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
      }
      const actionNode = findActionNode(node.child)
      if (!actionNode) {
        node.resolve()
        return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
      }
      const action = this.registry.get(actionNode.actionId)
      if (!action) {
        node.resolve()
        return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
      }
      const executionContext: ActionExecutionContext = {
        state: context.state,
        player: context.player,
        space: context.space,
        params: actionNode.params,
        sourceCard: actionNode.sourceCard,
        actionContext: actionNode.actionContext,
      }
      const doable = this.hooks.applyIsDoable(
        { ...executionContext, actionId: actionNode.actionId },
        action,
        action.canBeExecutedByPlayer(
          executionContext.state,
          executionContext.player,
          {
            sourceCard: executionContext.sourceCard,
            actionContext: executionContext.actionContext,
          },
        ),
      )
      if (!doable) {
        node.resolve()
        return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
      }
      this._pendingNodeIdRef.value = node.id
      const optionalCtxSnapshot = {
        params: actionNode.params,
        costs: undefined,
        sourceCard: actionNode.sourceCard,
        actionContext: actionNode.actionContext,
      }
      // S4b PR5 / S4c PR2 — OptionalNode owns pending-interaction context.
      // peekInteractionHost() reads it off the node directly.
      node.pendingActionId = null
      node.pendingContextSnapshot = optionalCtxSnapshot
      const label = getChoiceLabel(node, this.registry) ?? {
        labelKey: actionNode.choiceLabelKey ?? action.nameKey,
        labelParams: actionNode.choiceLabelParams,
      }
      const optionalPromptKey = node.promptKey ?? 'ui.interactionOptionalAction'
      const optionalOptions: ActionChoiceOption[] = [
        {
          value: actionNode.id,
          labelKey: label.labelKey,
          labelParams: label.labelParams,
          sourceCard: actionNode.sourceCard,
          effectPreview: getNodeEffectPreview(node.child),
        },
        { value: '__skip__', labelKey: 'ui.interactionOptionalSkip' },
      ]
      // S2 Task 8: write emit metadata to the OptionalNode itself instead
      // of the engine-level lastEmittedChoice cache.
      node.emittedChoices = optionalOptions
      node.emittedPromptKey = optionalPromptKey
      node.emittedPromptParams = undefined
      node.emittedRequest = undefined
      return {
        type: 'choice',
        nodeId: node.id,
        choice: {
          promptKey: optionalPromptKey,
          options: optionalOptions,
        },
      }
    }
    if (node instanceof InteractionNode) {
      // S4b Task 14 — InteractionNode owns its lifecycle dispatch via
      // `node.step(ctx)`. The engine main loop only needs to translate the
      // node-level NodeStepResult ('choice' / 'blocked' / 'done') into the
      // top-level EngineStepResult shape and handle the engine-level
      // pending-context backfill (when no prior emit installed one).
      const ctx = {
        resolveSubtree: (n: EngineNode) => resolveSubtree(n),
        emitChoice: () => {},
      }
      const stepResult = node.step(ctx)
      if (stepResult.kind === 'choice') {
        // S4c PR2 — backfill the InteractionNode's authoritative
        // contextSnapshot when no prior emit installed one (e.g. an
        // InteractionNode that was injected without going through
        // applyInteractionRequest). Pre-PR2 this wrote to the engine-level
        // pendingInteractionContext mirror; the InteractionNode is now the
        // canonical owner.
        if (!node.contextSnapshot) {
          node.contextSnapshot = {
            params: undefined,
            costs: undefined,
            sourceCard: getOptionsSourceCard(node.choices),
            actionContext: undefined,
          }
        }
        return {
          type: 'choice',
          nodeId: node.id,
          choice: { promptKey: node.promptKey, options: node.choices },
        }
      }
      // 'blocked' (no choices) or 'done' (already resolved) — both surface
      // as a blocked step at this level; the resolved case is unreachable
      // here because nextUnresolved() filters resolved nodes.
      return { type: 'blocked', nodeId: node.id }
    }
    // S4b PR5 sub-commit 4 — leaf-node dispatch routes through `node.step(ctx)`
    // returning a NodeStepResult discriminator. The engine main loop uses the
    // `kind` discriminant instead of `instanceof` for behavior dispatch on the
    // three leaf types (PlayerSwitch / ActivateCard / Action). The
    // implementation body of each leaf still lives in the engine because it
    // depends on the engine-private hooks/tree/log machinery.
    const leafCtx = {
      resolveSubtree: (n: EngineNode) => resolveSubtree(n),
      emitChoice: () => {},
    }
    const leafStep = node.step(leafCtx)
    if (leafStep.kind === 'playerSwitch') {
      // PlayerSwitchNode signals dispatch — engine resolves the node and
      // surfaces the top-level EngineStepResult.playerSwitch.
      node.resolve({})
      return { type: 'playerSwitch', nodeId: node.id, targetPlayerId: leafStep.targetPlayerId }
    }
    if (leafStep.kind === 'activateListener' && node instanceof ActivateCardNode) {
      const listener = getListenerById(node.listenerId)
      if (!listener) {
        node.resolve({})
        return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
      }
      const listenerContext = {
        state: context.state,
        player: context.player,
        space: context.space,
        actionId: node.actionId,
        phase: node.phase,
        ...node.event,
      }
      const ownerPlayerId = node.event.ownerPlayerId as string | undefined
      const result = executeCardListener(listener, listenerContext as import('../cards/card-listeners').CardListenerContext, {
        ownerPlayerId,
      })
      const effectPlayer =
        (ownerPlayerId
          ? context.state.players.find((player) => player.id === ownerPlayerId)
          : null) ?? context.player
      // Track BGA-style per-card `used` stat: count a use only when the
      // listener actually returned an effect (flow / followUp / decision /
      // log etc.). Pure no-op fires (handler returned undefined / void) and
      // universal listeners without a cardId are skipped.
      if (node.cardId && result) {
        incCardUsed(effectPlayer, node.cardId)
      }
      const normalizedFollowUps = (result?.followUpActions ?? []).map((followUp) =>
        normalizeFollowUpAction(followUp, result?.sourceCard),
      )
      collectImmediateLogs(effectPlayer.name, result, {
        includeLegacyLogKey: result ? !shouldSkipImmediateListenerLog(result) : true,
      }).forEach((entry) => {
        this.log.append(entry)
      })
      if (result?.flow || normalizedFollowUps.length > 0) {
        const needsSwitch = ownerPlayerId && ownerPlayerId !== context.player.id
        const insertedNodes: EngineNode[] = []
        if (result?.flow) {
          const flowNode = buildFlowNode(int, 
            applyFallbackSourceCardToFlow(result.flow, result.sourceCard),
          )
          if (node.phase === 'before') {
            collectNodeIds(flowNode, this.beforePhaseFlowNodeIds)
          }
          insertedNodes.push(flowNode)
        }
        insertedNodes.push(...buildFollowUpNodes(int, normalizedFollowUps, node.id, effectPlayer))
        if (insertedNodes.length === 0) {
          node.resolve(result ?? {})
          return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
        }
        if (needsSwitch) {
          const switchTo = new PlayerSwitchNode(`ps-to-${node.id}`, ownerPlayerId)
          const switchBack = new PlayerSwitchNode(`ps-back-${node.id}`, context.player.id)
          this.tree.insertAfter(node.id, [switchTo, ...insertedNodes, switchBack])
        } else {
          this.tree.insertAfter(node.id, insertedNodes)
        }
      }
      node.resolve(result ?? {})
      return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
    }
    if (leafStep.kind === 'execute' && node instanceof ActionNode) {
      const replaceResult = this.hooks.applyComputeReplace({
        ...context,
        params: node.params,
        sourceCard: node.sourceCard,
        actionContext: node.actionContext,
        actionId: node.actionId,
      })
      const replacedActionId = replaceResult.actionId
      const replaceSourceCard = replaceResult.sourceCard ?? node.sourceCard
      if (replaceResult.declined && replaceResult.alternativeFlow) {
        const flowNode = buildFlowNode(int, 
          buildReplaceChoiceFlow(
            node,
            applyFallbackSourceCardToFlow(
              replaceResult.alternativeFlow,
              replaceResult.sourceCard,
            ),
            replacedActionId,
          ),
        )
        this.tree.insertAfter(node.id, [flowNode])
        node.resolve({ type: 'ok' })
        return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
      }
      const action = this.registry.get(replacedActionId)
      if (!action) {
        return { type: 'blocked', nodeId: node.id }
      }
      const executionContext: ActionExecutionContext = {
        state: context.state,
        player: context.player,
        space: context.space,
        params: node.params,
        sourceCard: replaceSourceCard,
        actionContext: node.actionContext,
      }
      const doable = this.hooks.applyIsDoable(
        { ...executionContext, actionId: replacedActionId },
        action,
        action.canBeExecutedByPlayer(
          executionContext.state,
          executionContext.player,
          {
            sourceCard: executionContext.sourceCard,
            actionContext: executionContext.actionContext,
          },
        ),
      )
      if (!doable) {
        return { type: 'blocked', nodeId: node.id }
      }
      const costResults = this.hooks.computeCosts({
        ...executionContext,
        actionId: replacedActionId,
      })
      const costOverride = costResults.reduce<Partial<PlayerState['resources']>>(
        (acc, entry) => {
          if (!entry.costs) return acc
          Object.entries(entry.costs).forEach(([key, value]) => {
            if (typeof value !== 'number') return
            const resourceKey = key as keyof PlayerState['resources']
            acc[resourceKey] = (acc[resourceKey] ?? 0) + value
          })
          return acc
        },
        {},
      )
      executionContext.costs =
        Object.keys(costOverride).length > 0 ? costOverride : undefined
      if (!this.beforePhaseFlowNodeIds.has(node.id)) {
        const beforePhase = this.hooks.before({ ...executionContext, actionId: replacedActionId })
        const beforeActivateNodes = buildActivateCardNodes(int, 
          beforePhase.matchedListeners, 'before', replacedActionId,
        )
        if (beforeActivateNodes.length > 0 && !node.beforePhaseResolved) {
          node.beforePhaseResolved = true
          this.tree.insertBefore(node.id, beforeActivateNodes)
          return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
        }
      }
      const optInChoice = maybeBuildChoiceCandidates(int, 
        executionContext,
        action,
        replacedActionId,
      )
      const result = optInChoice ?? action.execute(executionContext)
      const duringPhase = this.hooks.during({ ...executionContext, actionId: replacedActionId }, result)
      const duringActivateNodes = buildActivateCardNodes(int, 
        duringPhase.matchedListeners, 'during', replacedActionId,
      )
      if (result.type === 'request') {
        node.resolve(result)
        // Mirror the resolveChoice second-pass: ActionDef-declared
        // actionContext patches in result.extraData.actionContextWrite are
        // shallow-merged into the pending-interaction context so subsequent
        // prompts see the patched context. The merge itself is delegated to
        // `applyInteractionRequest` via `contextWritePatch` for parity with
        // the XorNode follow-up branch and the resolveChoice second-pass.
        const contextWritePatch =
          result.extraData && typeof result.extraData === 'object'
            ? (result.extraData.actionContextWrite as Record<string, unknown> | undefined)
            : undefined
        let choiceOptions: ActionChoiceOption[]
        let updatedRequest: InteractionRequest = result.request
        if (result.request.kind === 'choice') {
          // computeArgs hook can inject extra options (e.g. D50 ForeignAid
          // filter, A94 LazySowman extras). Skip when the action provides its
          // own getBaseChoiceOptions builder (already authoritative).
          let mergedOptions = result.request.options
          if (!action.getBaseChoiceOptions) {
            const argResults = this.hooks.computeArgs(
              { ...executionContext, actionId: replacedActionId },
              result,
            )
            const existingValues = new Set(result.request.options.map((o) => o.value))
            const extraOptions = argResults
              .flatMap((entry) => entry.extraOptions ?? [])
              .filter((option) => option && !existingValues.has(option.value))
            if (extraOptions.length > 0) {
              mergedOptions = [...result.request.options, ...extraOptions]
              // Build a fresh request instead of mutating the action's
              // returned object — input-mutation breaks immutability and
              // surprises emitters that reuse a constant request literal.
              updatedRequest = { ...result.request, options: mergedOptions }
            }
          }
          choiceOptions = mergedOptions
        } else if (result.request.kind === 'animal-reorg') {
          // Compatibility shim — RETAINED through Task 7 (re-evaluated).
          //
          // GameCore.resolvePendingChoice still validates the player's
          // submitted value via `pending.options.find((o) => o.value === value)`
          // (shared/session/session-core.ts ~L2249). Reorg confirm/cancel
          // therefore must surface as concrete options on the pending
          // surface or the validator rejects the resolution.
          //
          // Removing this shim requires teaching resolvePendingChoice to
          // bypass the options.find check for `request.kind === 'animal-reorg'`
          // (or to read the allowed values off InteractionNode.choices /
          // request directly). Task 7 deliberately did not modify
          // resolvePendingChoice (out of scope per task constraints), so
          // the shim stays. Task 9 or Task 10 (when buildInteraction is
          // rewritten and pending.options is removed) is the natural
          // place to delete it.
          //
          // The cancel option is omitted for non-anytime triggers,
          // mirroring the pre-migration `buildOptions(trigger)` helper.
          const trigger =
            (executionContext.actionContext?.trigger as ReorganizeTrigger | undefined) ?? 'anytime'
          const confirm: ActionChoiceOption = {
            value: 'confirm',
            labelKey: 'ui.interactionAnimalReorgConfirm',
          }
          choiceOptions =
            trigger === 'anytime'
              ? [confirm, { value: 'cancel', labelKey: 'ui.interactionAnimalReorgCancel' }]
              : [confirm]
        } else if (result.request.kind === 'farm-select') {
          // Task 5/6: farm-select leaves emit InteractionFarmSelection plus an
          // optional `options` list (confirm/cancel) so resolvePendingChoice's
          // pending.options.find() validator still has a value to match.
          choiceOptions = result.request.options ?? [
            { value: 'confirm', labelKey: 'ui.interactionFarmSelectConfirm' },
            { value: 'cancel', labelKey: 'ui.interactionFarmSelectCancel' },
          ]
        } else if (
          result.request.kind === 'confirm-next-player' ||
          result.request.kind === 'confirm-player-switch' ||
          result.request.kind === 'feed' ||
          result.request.kind === 'selection' ||
          result.request.kind === 'card-draft'
        ) {
          // Task 9 will add explicit emitters for these kinds. Until then no
          // current effect emits them, so they fall through to empty choices
          // here. The exhaustive check below ensures any future kind added to
          // InteractionRequest forces this branch to be revisited.
          // selection / card-draft were added in S2 Task 2; their emitters
          // land in Tasks 7/12 — until then they share this same not-yet-wired
          // path so typecheck stays green without granting them a real options
          // surface.
          choiceOptions = []
        } else {
          // Exhaustive check: every InteractionRequest kind must be handled
          // above. If a new kind is added to InteractionRequest without
          // updating this branch, the assignment below produces a typecheck
          // failure here, signalling that Task 6/7 should have removed this
          // shim OR the new kind needs an explicit branch.
          const _exhaustive: never = result.request
          void _exhaustive
          choiceOptions = []
        }
        const choiceNode = findPairedInteractionNode(int, node) ?? findInteractionNode(this.tree.root)
        applyInteractionRequest(int, {
          targetNode: choiceNode ?? null,
          fallbackNodeId: node.id,
          request: updatedRequest,
          promptKey: result.promptKey,
          promptParams: result.promptParams,
          choiceOptions,
          actionId: replacedActionId,
          ownerNodeId: null,
          params: executionContext.params,
          costs: executionContext.costs,
          sourceCard: executionContext.sourceCard ?? result.sourceCard,
          actionContext: executionContext.actionContext,
          contextWritePatch,
        })
        if (duringActivateNodes.length > 0) {
          this.tree.insertAfter(node.id, [...duringActivateNodes])
        }
        return {
          type: 'choice',
          nodeId: this._pendingNodeIdRef.value ?? node.id,
          choice: {
            promptKey: result.promptKey,
            promptParams: result.promptParams,
            options: choiceOptions,
          },
        }
      }
      findPairedInteractionNode(int, node)?.setState('resolved')
      if (result.type === 'ok' || result.type === 'flow') {
        collectImmediateLogs(context.player.name, result).forEach((entry) => {
          this.log.append(entry)
        })
      }
      const immediatePhase = this.hooks.immediatelyAfter(
        { ...executionContext, actionId: replacedActionId },
        result,
      )
      if (
        (result.type === 'ok' && !result.logKey && (result.immediateLogs?.length ?? 0) === 0)
        || (result.type === 'flow' && (result.immediateLogs?.length ?? 0) === 0)
        || (result.type !== 'ok' && result.type !== 'flow')
      ) {
        this.log.append({
          key: 'log.action',
          params: { actionId: replacedActionId },
        })
      }
      const afterPhase = this.hooks.after(
        { ...executionContext, actionId: replacedActionId },
        result,
        undefined,
      )
      const allActionHookResults = [
        ...immediatePhase.actionHookResults,
        ...afterPhase.actionHookResults,
      ]
      allActionHookResults
        .flatMap((entry) => collectImmediateLogs(context.player.name, entry))
        .forEach((entry) => {
          this.log.append(entry)
        })
      const hookFlows = allActionHookResults
        .map((entry) => entry.flow
          ? applyFallbackSourceCardToFlow(entry.flow, entry.sourceCard)
          : null)
        .filter((flow) => flow)
        .map((flow) => buildFlowNode(int, flow as ActionFlow))
      const followUps = allActionHookResults
        .flatMap((entry) =>
          (entry.followUpActions ?? []).map((followUp) =>
            normalizeFollowUpAction(followUp, entry.sourceCard),
          ),
        )
        .filter((action) => action)
      const immediateActivateNodes = buildActivateCardNodes(int, 
        immediatePhase.matchedListeners, 'immediatelyAfter', replacedActionId,
        buildListenerEvent(executionContext, { result }),
      )
      const afterActivateNodes = buildActivateCardNodes(int, 
        afterPhase.matchedListeners, 'after', replacedActionId,
        buildListenerEvent(executionContext, { result }),
      )
      // 7b1: when the action returns a `flow`, the wrapper action's `after`
      // / `immediatelyAfter` listeners (and follow-ups) must observe the
      // post-flow state — for renovate-house → seq:[pay, apply-renovation],
      // listeners that read `player.houseType` would otherwise see the
      // pre-mutate snapshot. We therefore insert flow body FIRST (last call
      // wins via insertAfter), and trailing hooks AFTER the flow.
      const trailingHookNodes = [
        ...buildFollowUpNodes(int, followUps, node.id, context.player),
        ...immediateActivateNodes,
        ...afterActivateNodes,
      ]
      const leadingNodes = [
        ...duringActivateNodes,
        ...hookFlows,
      ]
      if (result.type === 'flow') {
        const flowNode = buildFlowNode(int, result.flow)
        // Insertion order: trailing hooks first (deepest behind), then flow
        // body, then leading nodes. insertAfter prepends each batch to
        // node.id+1, so the resulting child layout is:
        //   [..., node, leadingNodes..., flowNode, trailingHookNodes..., ...]
        if (trailingHookNodes.length > 0) {
          this.tree.insertAfter(node.id, trailingHookNodes)
        }
        this.tree.insertAfter(node.id, [flowNode])
        if (leadingNodes.length > 0) {
          this.tree.insertAfter(node.id, leadingNodes)
        }
      } else {
        const allInsertNodes = [...leadingNodes, ...trailingHookNodes]
        if (allInsertNodes.length > 0) {
          this.tree.insertAfter(node.id, allInsertNodes)
        }
      }
      node.resolve(result)
      return { type: 'ok', nodeId: node.id, actionId: replacedActionId, result }
    }
    return { type: 'blocked', nodeId: node.id }
  }

  /**
   * Resolve a pending choice. Threading the optional `payload` lets ActionDef.resolveChoice
   * receive client-supplied submission data (e.g. fence edges, plow tile).
   */
  resolveChoice(
    choice: string,
    context: EngineContext,
    payload?: Record<string, unknown>,
  ): ActionExecutionResult {
    const int = this._internals()
    if (this._pendingNodeIdRef.value) {
      const node = this.tree.findNodeById(this._pendingNodeIdRef.value)
      if (node instanceof OptionalNode) {
        if (choice === '__skip__') {
          node.resolve()
          this._pendingNodeIdRef.value = null
          return { type: 'ok' }
        }
        node.active = true
        this._pendingNodeIdRef.value = null
        return { type: 'ok' }
      }
      if (node instanceof OrNode || node instanceof XorNode) {
        if (choice === '__done__' && node instanceof OrNode) {
          node.resolve(choice)
          this._pendingNodeIdRef.value = null
          return { type: 'ok' }
        }
        if (choice === '__skip__') {
          const parent = this.tree.findParent(node.id)
          if (parent instanceof OptionalNode) {
            resolveSubtree(node)
            parent.resolve()
            this._pendingNodeIdRef.value = null
            return { type: 'ok' }
          }
        }
        const targetNode = node.children.find((item) => item.id === choice)
        const child = targetNode ? findActionNode(targetNode) : null
        if (!child) {
          this._pendingNodeIdRef.value = null
          return { type: 'ok' }
        }
        const executionContext: ActionExecutionContext = {
          state: context.state,
          player: context.player,
          space: context.space,
          params: child.params,
          sourceCard: child.sourceCard,
          actionContext: child.actionContext,
        }
        const replaceResult = this.hooks.applyComputeReplace({
          ...executionContext,
          actionId: child.actionId,
        })
        const actionId = replaceResult.actionId
        executionContext.sourceCard = replaceResult.sourceCard ?? child.sourceCard
        if (replaceResult.declined && replaceResult.alternativeFlow) {
          const flowNode = buildFlowNode(int, 
            buildReplaceChoiceFlow(
              child,
              applyFallbackSourceCardToFlow(
                replaceResult.alternativeFlow,
                replaceResult.sourceCard,
              ),
              actionId,
            ),
          )
          this.tree.insertAfter(node.id, [flowNode])
          targetNode!.resolve(choice)
          node.resolve(choice)
          this._pendingNodeIdRef.value = null
          return { type: 'ok' }
        }
        const action = this.registry.get(actionId)
        if (!action) {
          this._pendingNodeIdRef.value = null
          return { type: 'fail', logKey: 'log.buildRoomFail' }
        }
        const costResults = this.hooks.computeCosts({
          ...executionContext,
          actionId,
        })
        const costOverride = costResults.reduce<Partial<PlayerState['resources']>>(
          (acc, entry) => {
            if (!entry.costs) return acc
            Object.entries(entry.costs).forEach(([key, value]) => {
              if (typeof value !== 'number') return
              const resourceKey = key as keyof PlayerState['resources']
              acc[resourceKey] = (acc[resourceKey] ?? 0) + value
            })
            return acc
          },
          {},
        )
        executionContext.costs =
          Object.keys(costOverride).length > 0 ? costOverride : undefined
        const skipBefore = this.beforePhaseFlowNodeIds.has(child.id)
        const beforePhase = skipBefore ? { matchedListeners: [] } : this.hooks.before({ ...executionContext, actionId })
        const beforeActivateNodes = buildActivateCardNodes(int, 
          beforePhase.matchedListeners, 'before', actionId,
        )
        if (beforeActivateNodes.length > 0 && !child.beforePhaseResolved) {
          child.beforePhaseResolved = true
          const deferredTarget = cloneNode(int, targetNode!)
          const deferredAction = findActionNode(deferredTarget)
          if (deferredAction) {
            deferredAction.beforePhaseResolved = true
          }
          resolveSubtree(targetNode!)
          if (node instanceof XorNode) {
            node.resolve(choice)
          }
          this.tree.insertBefore(node.id, [...beforeActivateNodes, deferredTarget])
          this._pendingNodeIdRef.value = null
          return { type: 'ok' }
        }
        const result = action.execute(executionContext)
        this.hooks.during({ ...executionContext, actionId }, result)
        if (result.type === 'request' && (result.request.kind === 'choice' || result.request.kind === 'farm-select')) {
          child.resolve(result)
          // S2 Task 6: also accept farm-select kind emitted from an Or/Xor
          // child leaf. The computeArgs merging path only applies to 'choice'
          // kind (extraOptions hook); farm-select carries its own structured
          // payload + optional `options` (confirm/cancel) — we synthesise
          // a default options surface when absent for the InteractionNode
          // setChoice call.
          const argResults = result.request.kind === 'choice'
            ? this.hooks.computeArgs({ ...executionContext, actionId }, result)
            : []
          const baseOptions: ActionChoiceOption[] = result.request.kind === 'choice'
            ? result.request.options
            : (result.request.options ?? [
                { value: 'confirm', labelKey: 'ui.interactionFarmSelectConfirm' },
                { value: 'cancel', labelKey: 'ui.interactionFarmSelectCancel' },
              ])
          const existingValues = new Set(baseOptions.map((o) => o.value))
          const extraOptions = argResults
            .flatMap((entry) => entry.extraOptions ?? [])
            .filter((option) => option && !existingValues.has(option.value))
          const mergedOptions = extraOptions.length > 0
            ? [...baseOptions, ...extraOptions]
            : baseOptions
          const updatedRequest: InteractionRequest =
            result.request.kind === 'choice' && extraOptions.length > 0
              ? { ...result.request, options: mergedOptions }
              : result.request
          // Carry-over (Task 7 reviewer S1): the XorNode follow-up branch
          // previously skipped the actionContextWrite shallow-merge that the
          // L1410 (main 'request') and L1899 (resolveChoice second-pass)
          // branches already perform. Pass the patch via the
          // applyInteractionRequest helper so all three sites share one
          // implementation.
          const contextWritePatch =
            result.extraData && typeof result.extraData === 'object'
              ? (result.extraData.actionContextWrite as Record<string, unknown> | undefined)
              : undefined
          const choiceNode = targetNode ? findInteractionNode(targetNode) : null
          applyInteractionRequest(int, {
            targetNode: choiceNode ?? null,
            fallbackNodeId: child.id,
            request: updatedRequest,
            promptKey: result.promptKey,
            promptParams: result.promptParams,
            choiceOptions: mergedOptions,
            actionId,
            ownerNodeId: node instanceof XorNode ? node.id : null,
            params: executionContext.params,
            costs: executionContext.costs,
            sourceCard: executionContext.sourceCard,
            actionContext: executionContext.actionContext,
            contextWritePatch,
          })
          return extraOptions.length > 0
            ? { ...result, request: updatedRequest }
            : result
        }
        if (result.type === 'ok' || result.type === 'flow') {
          collectImmediateLogs(context.player.name, result).forEach((entry) => {
            this.log.append(entry)
          })
        }
        const immediatePhase = this.hooks.immediatelyAfter(
          { ...executionContext, actionId, choice },
          result,
          choice,
        )
        const afterPhase = this.hooks.after(
          { ...executionContext, actionId, choice },
          result,
          choice,
        )

        const allResults = [
          ...immediatePhase.actionHookResults,
          ...afterPhase.actionHookResults,
        ]
        allResults
          .flatMap((entry) => collectImmediateLogs(context.player.name, entry))
          .forEach((entry) => {
            this.log.append(entry)
          })

        const hookFlows = allResults
          .map((entry) => entry.flow
            ? applyFallbackSourceCardToFlow(entry.flow, entry.sourceCard)
            : null)
          .filter((flow) => flow)
          .map((flow) => buildFlowNode(int, flow as ActionFlow))
        const followUps = allResults
          .flatMap((entry) =>
            (entry.followUpActions ?? []).map((followUp) =>
              normalizeFollowUpAction(followUp, entry.sourceCard),
            ),
          )
          .filter((action) => action)
        const immediateActivateNodes = buildActivateCardNodes(int, 
          immediatePhase.matchedListeners, 'immediatelyAfter', actionId,
          buildListenerEvent(executionContext, { result, choice }),
        )
        const afterActivateNodes = buildActivateCardNodes(int, 
          afterPhase.matchedListeners, 'after', actionId,
          buildListenerEvent(executionContext, { result, choice }),
        )
        // 7b1: insert flow body BEFORE trailing hook nodes so wrapper-style
        // actions (renovate-house, occupation, improvement-any) emit their
        // `after` listeners on the post-mutate state. See top-level path
        // (resolveActionStep) for the same ordering rationale.
        const insertAnchor = node instanceof XorNode ? node.id : child.id
        const trailingHookNodes = [
          ...buildFollowUpNodes(int, followUps, child.id, context.player),
          ...immediateActivateNodes,
          ...afterActivateNodes,
        ]
        if (result.type === 'flow') {
          const flowNode = buildFlowNode(int, result.flow)
          if (trailingHookNodes.length > 0) {
            this.tree.insertAfter(insertAnchor, trailingHookNodes)
          }
          this.tree.insertAfter(insertAnchor, [flowNode])
          if (hookFlows.length > 0) {
            this.tree.insertAfter(insertAnchor, hookFlows)
          }
        } else {
          const allInsertNodes = [...hookFlows, ...trailingHookNodes]
          if (allInsertNodes.length > 0) {
            this.tree.insertAfter(insertAnchor, allInsertNodes)
          }
        }
        child.resolve(result)
        if (node instanceof XorNode) {
          node.resolve(choice)
        }
        this._pendingNodeIdRef.value = null
        return result
      }
    }
    // S4c PR2 — second-pass dispatch (after Or/Xor/Optional handling above).
    // The pending host MUST be an InteractionNode here (composite hosts are
    // already drained by the early-return branches above). Read actionId,
    // ownerNodeId and contextSnapshot off the InteractionNode itself —
    // the engine no longer keeps those as top-level mirrors.
    const interactionHost = this.peekInteraction()
    const actionId = interactionHost?.pendingActionId ?? null
    if (!actionId) {
      return { type: 'ok' }
    }
    const action = this.registry.get(actionId)
    if (!action) {
      return { type: 'ok' }
    }
    const executionContext = buildChoiceExecutionContext(
      context,
      interactionHost?.contextSnapshot ?? null,
    )
    executionContext.params = {
      ...(executionContext.params ?? {}),
      selectedOption: choice,
    }
    let result: ActionExecutionResult
    if (action.resolveChoice) {
      result = action.resolveChoice(executionContext, choice, payload)
    } else {
      return { type: 'ok' }
    }
    this.hooks.during({ ...executionContext, actionId }, result)
    if (result.type === 'request' && result.request.kind === 'choice') {
      // Merge ActionDef-declared actionContext patches into the InteractionNode's
      // `contextSnapshot.actionContext`. Used by farm ActionDefs to persist payload
      // (e.g. fence geometry) across payment-combo second prompts. The shallow merge
      // itself happens inside `applyInteractionRequest` so all three sites share one
      // implementation.
      const contextWritePatch =
        result.extraData && typeof result.extraData === 'object'
          ? (result.extraData.actionContextWrite as Record<string, unknown> | undefined)
          : undefined
      const requestOptions = result.request.options
      const existingNode = this._pendingNodeIdRef.value
        ? this.tree.findNodeById(this._pendingNodeIdRef.value)
        : null
      const interactionTarget = existingNode instanceof InteractionNode ? existingNode : null
      applyInteractionRequest(int, {
        targetNode: interactionTarget,
        fallbackNodeId: null,
        request: result.request,
        promptKey: result.promptKey,
        promptParams: result.promptParams,
        choiceOptions: requestOptions,
        actionId,
        // resolveChoice second-pass keeps the existing owner pointer (e.g.
        // XorNode owner when the second prompt is still nested under the
        // same parent). `preserveOwner: true` makes InteractionNode.emit()
        // ignore this value, so passing a stale read is safe.
        ownerNodeId: interactionHost?.ownerNodeId ?? null,
        preserveOwner: true,
        params: executionContext.params,
        costs: executionContext.costs,
        sourceCard: executionContext.sourceCard,
        actionContext: executionContext.actionContext,
        contextWritePatch,
      })
      // Don't clear the InteractionNode's pendingActionId — the action still needs
      // to resolve its choice (the next prompt is queued on the same node).
      return result
    }
    if (result.type === 'ok' || result.type === 'flow') {
      collectImmediateLogs(context.player.name, result).forEach((entry) => {
        this.log.append(entry)
      })
    }
    // S4c PR2 — read owner from the InteractionNode (was: pendingInteractionOwnerNodeId mirror).
    const insertionTargetId = interactionHost?.ownerNodeId ?? this._pendingNodeIdRef.value
    const immediatePhase = this.hooks.immediatelyAfter({ ...executionContext, actionId, choice }, result, choice)
    const afterPhase = this.hooks.after({ ...executionContext, actionId, choice }, result, choice)

    const allResults = [
      ...immediatePhase.actionHookResults,
      ...afterPhase.actionHookResults,
    ]
    allResults
      .flatMap((entry) => collectImmediateLogs(context.player.name, entry))
      .forEach((entry) => {
        this.log.append(entry)
      })

    const hookFlows = allResults
      .map((entry) => entry.flow
        ? applyFallbackSourceCardToFlow(entry.flow, entry.sourceCard)
        : null)
      .filter((flow) => flow)
      .map((flow) => buildFlowNode(int, flow as ActionFlow))
    const followUps = allResults
      .flatMap((entry) =>
        (entry.followUpActions ?? []).map((followUp) =>
          normalizeFollowUpAction(followUp, entry.sourceCard),
        ),
      )
      .filter((action) => action)
    const immediateActivateNodes = buildActivateCardNodes(int, 
      immediatePhase.matchedListeners, 'immediatelyAfter', actionId,
      buildListenerEvent(executionContext, { result, choice }),
    )
    const afterActivateNodes = buildActivateCardNodes(int, 
      afterPhase.matchedListeners, 'after', actionId,
      buildListenerEvent(executionContext, { result, choice }),
    )
    // 7b1: insert flow body BEFORE the trailing hook nodes (followUps,
    // immediatelyAfter / after activate) so wrapper actions returning a
    // flow (renovate-house seq, occupation seq, improvement-any seq) emit
    // their `after` listener events on the post-mutate state. Insertion
    // order via insertAfter prepends each batch to insertionTargetId+1, so
    // the resulting layout is:
    //   [..., insertionTarget, hookFlows..., flowNode, trailingHooks..., ...]
    if (insertionTargetId) {
      const trailingHookNodes = [
        ...buildFollowUpNodes(int, followUps, insertionTargetId, context.player),
        ...immediateActivateNodes,
        ...afterActivateNodes,
      ]
      if (result.type === 'flow') {
        const flowNode = buildFlowNode(int, result.flow)
        if (trailingHookNodes.length > 0) {
          this.tree.insertAfter(insertionTargetId, trailingHookNodes)
        }
        this.tree.insertAfter(insertionTargetId, [flowNode])
        if (hookFlows.length > 0) {
          this.tree.insertAfter(insertionTargetId, hookFlows)
        }
      } else {
        const allInsertNodes = [...hookFlows, ...trailingHookNodes]
        if (allInsertNodes.length > 0) {
          this.tree.insertAfter(insertionTargetId, allInsertNodes)
        }
      }
    }
    if (this._pendingNodeIdRef.value) {
      const node = this.tree.findNodeById(this._pendingNodeIdRef.value)
      if (node instanceof InteractionNode) {
        if (
          node.promptKey === 'ui.interactionBakeBreadChoice' &&
          choice.startsWith('bulk:')
        ) {
          node.setState('resolved')
        } else {
          node.resolve(choice)
        }
      }
    }
    // S4c PR2 — read owner from the InteractionNode (was: pendingInteractionOwnerNodeId mirror).
    const ownerNodeIdToResolve = interactionHost?.ownerNodeId ?? null
    if (ownerNodeIdToResolve) {
      const ownerNode = this.tree.findNodeById(ownerNodeIdToResolve)
      if (ownerNode instanceof XorNode) {
        ownerNode.resolve()
      }
    }
    this._pendingNodeIdRef.value = null
    return result
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
  insertFlowAfterPendingChoice(flow: ActionFlow): void {
    // S4c PR2 — read owner from the InteractionNode (was: pendingInteractionOwnerNodeId mirror).
    const interactionNode = this.peekInteraction()
    const insertionTargetId = interactionNode?.ownerNodeId ?? this._pendingNodeIdRef.value
    if (!insertionTargetId) return
    const flowNode = buildFlowNode(this._internals(), flow)
    this.tree.insertAfter(insertionTargetId, [flowNode])
  }
}
