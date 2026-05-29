import type {
  ActionDefinition,
  ChoiceEffectPreview,
  ActionExecutionContext,
  ActionExecutionResult,
  ActionFlow,
  PlayerState,
  ActionChoiceOption,
  ChoiceDescriptionPreview,
  InteractionRequest,
  Resource,
} from '../contract/types'
import type { EventSink } from '../contract/events'
import type { GameEvent } from '../contract/events'
import type { PromptKey } from '../contract/prompt-keys'
import type { FollowUpAction, ActionHookPhase } from '../actions/hooks'
import {
  ActionNode,
  OrNode,
  ParallelNode,
  SequenceNode,
  XorNode,
} from './nodes'
import { attachChoiceLabel, resolveChoiceSourceCard } from './nodes/interaction-helpers'
import type { EngineNode } from './types'
import type { PendingEnvelope, PendingSyntheticKind } from './types'
import type { EngineInternals } from './engine-internals'
import type { ActionRegistry } from './registry'
import { getPlayOrderIndex } from './matched-trigger'
import type { MatchedCardListener } from '../cards/card-listeners'
import type { TriggerSnapshot } from '../cards/helpers/trigger-snapshot'
import type { GameState } from '../contract/types'
import {
  ACTIVATE_CARD_ACTION_ID,
  type ActivateCardActionNode,
  type ActivateCardActionParams,
} from './activation-action'

/**
 * S4c PR5 — module-private utilities extracted from `Engine`. Each function
 * accepts an `EngineInternals` snapshot (`int`) instead of `this` access, so
 * `Engine.proceed` / `Engine.resolveChoice` (and the public class) can stay
 * lean. Mutable primitive state (`counterRef.value`, `pendingNodeIdRef.value`)
 * is boxed so updates propagate back to the Engine instance.
 *
 * Not exported from the package barrel — see `shared/engine/index.ts`.
 */

export function parseFollowUpAction(
  followUp: FollowUpAction,
): { actionId: string; sourceCard?: string } {
  if (typeof followUp === 'string') {
    return { actionId: followUp }
  }
  return followUp
}

export function applyDefaultSourceCardToFlow(
  flow: ActionFlow,
  sourceCard?: string,
): ActionFlow {
  if (!sourceCard) return flow
  if (flow.type === 'leaf') {
    return flow.sourceCard ? flow : { ...flow, sourceCard }
  }
  return {
    ...flow,
    children: flow.children.map((child) => applyDefaultSourceCardToFlow(child, sourceCard)),
  }
}

export function normalizeFollowUpAction(
  followUp: FollowUpAction,
  sourceCard?: string,
): FollowUpAction {
  if (!sourceCard) return followUp
  if (typeof followUp === 'string') {
    return { actionId: followUp, sourceCard }
  }
  return followUp.sourceCard ? followUp : { ...followUp, sourceCard }
}

export function buildFollowUpNodes(
  int: EngineInternals,
  followUps: FollowUpAction[],
  baseId: string,
  player: PlayerState,
  state?: GameState,
): EngineNode[] {
  return followUps
    .filter((followUp) => followUp)
    .map((followUp, index) => {
      const { actionId, sourceCard } = parseFollowUpAction(followUp)
      if (sourceCard && state) {
        const frame = int.events.beginFrame({
          actorPlayerId: player.id,
          sourceCardId: sourceCard,
        })
        frame.sink.emit<'action.granted'>({
          type: 'action.granted',
          playerId: player.id,
          actionId,
          cardId: sourceCard,
        })
        frame.complete(state)
      }
      const node = new ActionNode(`chain-${baseId}-${index}`, actionId, sourceCard)
      node.ownerPlayerId = player.id
      return node
    })
}

export function getNodeChildren(node: EngineNode): EngineNode[] {
  if (
    node instanceof SequenceNode ||
    node instanceof ParallelNode ||
    node instanceof OrNode ||
    node instanceof XorNode
  ) {
    return node.children
  }
  return []
}

const collectActionNodes = (node: EngineNode): ActionNode[] => {
  if (node instanceof ActionNode) return [node]
  return getNodeChildren(node).flatMap((child) => collectActionNodes(child))
}

export function enforceSelectedTargetMandatory(node: EngineNode): void {
  node.mandatory = true
  collectActionNodes(node).forEach((actionNode) => {
    actionNode.mandatory = true
  })
}

export function enforceCompositeContinuationMandatory(node: EngineNode): void {
  node.mandatory = true
  collectActionNodes(node).forEach((actionNode) => {
    actionNode.mandatory = true
  })
}

export function stampOwner(node: EngineNode, ownerPlayerId: string): EngineNode {
  node.ownerPlayerId ??= ownerPlayerId
  for (const child of getNodeChildren(node)) {
    stampOwner(child, ownerPlayerId)
  }
  return node
}

function unanimousActionOwner(node: EngineNode): string | undefined {
  const owners = new Set<string>()
  let sawUnownedAction = false
  const visit = (entry: EngineNode) => {
    if (entry instanceof ActionNode) {
      if (entry.ownerPlayerId) owners.add(entry.ownerPlayerId)
      else sawUnownedAction = true
      return
    }
    for (const child of getNodeChildren(entry)) visit(child)
  }
  visit(node)
  if (sawUnownedAction || owners.size !== 1) return undefined
  return [...owners][0]
}

export function markOptional<T extends EngineNode>(
  node: T,
  promptKey?: PromptKey,
): T {
  node.optional = true
  node.optionalActive = false
  if (promptKey !== undefined) node.optionalPromptKey = promptKey
  node.ownerPlayerId ??= unanimousActionOwner(node)
  return node
}

function copySharedNodeMetadata(source: EngineNode, target: EngineNode): EngineNode {
  target.ownerPlayerId = source.ownerPlayerId
  target.optional = source.optional
  target.optionalActive = source.optionalActive
  target.optionalPromptKey = source.optionalPromptKey
  target.mandatory = source.mandatory
  const pending = source.getPending()
  if (pending) target.setPending(pending)
  return target
}

export function effectiveOwnerPlayerId(
  int: EngineInternals,
  nodeId: string,
  frameOwnerPlayerId?: string,
): string | undefined {
  let node = int.tree.findNodeById(nodeId)
  while (node) {
    if (node.ownerPlayerId) return node.ownerPlayerId
    node = int.tree.findParent(node.id)
  }
  return frameOwnerPlayerId
}

export function findActionNode(node: EngineNode): ActionNode | null {
  if (node instanceof ActionNode) return node
  if ('children' in node) {
    const composite = node as { children: EngineNode[] }
    for (const child of composite.children) {
      const found = findActionNode(child)
      if (found) return found
    }
  }
  return null
}

export function buildActivationActionNodes(
  int: EngineInternals,
  matched: MatchedCardListener[],
  phase: ActionHookPhase,
  actionId: string,
  event: Record<string, unknown> = {},
  triggerPlayerId?: string,
  transactionEvents?: readonly GameEvent[],
  actionEvents?: readonly GameEvent[],
  triggerSnapshot?: TriggerSnapshot,
): EngineNode[] {
  return matched.map((entry, index) => {
    const nodeId = `activate-${phase}-${actionId}-${index}-${int.counterRef.value++}`
    const params: ActivateCardActionParams = {
      listenerId: entry.registration.id,
      cardId: entry.cardId,
      phase,
      actionId,
        event,
        ownerPlayerId: entry.ownerPlayerId,
        ownerCardZone: entry.ownerCardZone,
        triggerPlayerId,
      mandatory: entry.registration.mandatory === true,
      countCardUse: typeof event.countCardUse === 'boolean' ? event.countCardUse : undefined,
      transactionEvents: transactionEvents ? [...transactionEvents] : undefined,
      actionEvents: actionEvents ? [...actionEvents] : undefined,
      triggerSnapshot,
    }
    const node = new ActionNode(
      nodeId,
      ACTIVATE_CARD_ACTION_ID,
      entry.cardId,
      params,
    )
    if (entry.ownerPlayerId) node.ownerPlayerId = entry.ownerPlayerId
    return node
  })
}

export function buildPhaseTrailingNodes(
  int: EngineInternals,
  matchedListeners: MatchedCardListener[],
  phase: ActionHookPhase,
  actionId: string,
  state: GameState,
  baseEvent: Record<string, unknown>,
  triggerPlayerId?: string,
  transactionEvents?: readonly GameEvent[],
  actionEvents?: readonly GameEvent[],
  actionEventStartIndex?: number,
  triggerSnapshot?: TriggerSnapshot,
): EngineNode[] {
  if (matchedListeners.length === 0) return []

  type Prepared = {
    ml: MatchedCardListener
    playOrderIndex: number
    matchedIndex: number
  }

  const prepared: Prepared[] = matchedListeners.map((ml, matchedIndex) => {
    const owner = state.players.find((p) => p.id === ml.ownerPlayerId)
    const playOrderIndex = owner ? getPlayOrderIndex(owner, ml.cardId) : Number.MAX_SAFE_INTEGER
    return { ml, playOrderIndex, matchedIndex }
  })

  const byOwner = new Map<string, Prepared[]>()
  for (const p of prepared) {
    const arr = byOwner.get(p.ml.ownerPlayerId) ?? []
    arr.push(p)
    byOwner.set(p.ml.ownerPlayerId, arr)
  }

  const activeId = state.players[state.currentPlayerIndex]?.id
  const effectiveTriggerPlayerId = triggerPlayerId ?? activeId
  const orderedOwners: string[] = []
  // Global listeners (no cardIds → ownerPlayerId='') run first in the active
  // player's context.
  if (byOwner.has('')) orderedOwners.push('')
  if (activeId && byOwner.has(activeId)) orderedOwners.push(activeId)
  for (const p of state.players) {
    if (p.id !== activeId && byOwner.has(p.id)) orderedOwners.push(p.id)
  }

  const out: EngineNode[] = []
  for (const ownerId of orderedOwners) {
    const group = (byOwner.get(ownerId) ?? []).slice().sort((a, b) => {
      const orderDelta = (b.ml.registration.order ?? 0) - (a.ml.registration.order ?? 0)
      if (orderDelta !== 0) return orderDelta
      const playOrderDelta = a.playOrderIndex - b.playOrderIndex
      if (playOrderDelta !== 0) return playOrderDelta
      return a.matchedIndex - b.matchedIndex
    })

    const buildNode = (p: Prepared): ActivateCardActionNode => {
      const nodeId = `activate-${phase}-${actionId}-${int.counterRef.value++}`
      const params: ActivateCardActionParams = {
        listenerId: p.ml.registration.id,
        cardId: p.ml.cardId,
        phase,
        actionId,
        event: baseEvent,
        triggerPlayerId: effectiveTriggerPlayerId,
        ownerPlayerId: p.ml.ownerPlayerId,
        ownerCardZone: p.ml.ownerCardZone,
        mandatory: p.ml.registration.mandatory === true,
        countCardUse:
          typeof baseEvent.countCardUse === 'boolean' ? baseEvent.countCardUse : undefined,
        transactionEvents: transactionEvents ? [...transactionEvents] : undefined,
        actionEvents: actionEvents ? [...actionEvents] : undefined,
        actionEventStartIndex,
        triggerSnapshot,
      }
      const node = new ActionNode(
        nodeId,
        ACTIVATE_CARD_ACTION_ID,
        p.ml.cardId,
        params,
      )
      if (p.ml.ownerPlayerId) node.ownerPlayerId = p.ml.ownerPlayerId
      return node as ActivateCardActionNode
    }

    const ownerGroupNodes: EngineNode[] = []

    const serialOnes = group.filter((p) => (p.ml.registration.dispatchMode ?? 'serial') === 'serial')
    for (const p of serialOnes) ownerGroupNodes.push(buildNode(p))

    const selectOnes = group.filter((p) => p.ml.registration.dispatchMode === 'select')
    if (selectOnes.length > 0) {
      const children = selectOnes.map(buildNode)
      const ptn = new ParallelNode(
        `parallel-trigger-${phase}-${actionId}-${ownerId}-${int.counterRef.value++}`,
        children,
      )
      ptn.mode = 'trigger-select'
      ptn.triggerOwnerPlayerId = ownerId
      ptn.ownerPlayerId = ownerId
      ptn.triggerChildren = children.map((child) => ({
        nodeId: child.id,
        cardId: child.params.cardId,
        listenerId: child.params.listenerId,
        mandatory: child.params.mandatory === true,
      }))
      ownerGroupNodes.push(ptn)
    }

    if (ownerGroupNodes.length === 0) continue
    // Empty ownerId == global listener (no cardIds) runs in the active
    // player's frame. Card-owned listener groups carry owner metadata.
    if (ownerId !== activeId && ownerId !== '') {
      ownerGroupNodes.forEach((node) => stampOwner(node, ownerId))
    } else {
      if (ownerId) ownerGroupNodes.forEach((node) => stampOwner(node, ownerId))
    }
    out.push(...ownerGroupNodes)
  }
  return out
}

export function collectNodeIds(node: EngineNode, ids: Set<string>): void {
  ids.add(node.id)
  for (const child of getNodeChildren(node)) collectNodeIds(child, ids)
}

export function cloneNode(int: EngineInternals, node: EngineNode): EngineNode {
  if (node instanceof ActionNode) {
    const clone = new ActionNode(
      `${node.id}-clone-${int.counterRef.value++}`,
      node.actionId,
      node.sourceCard,
      node.params,
      node.choiceLabelKey,
      node.choiceLabelParams,
      node.actionContext,
      node.effectPreview,
    )
    clone.beforePhaseResolved = node.beforePhaseResolved
    return copySharedNodeMetadata(node, clone)
  }
  if (node instanceof SequenceNode) {
    return copySharedNodeMetadata(node, new SequenceNode(
      `${node.id}-clone-${int.counterRef.value++}`,
      node.children.map((child) => cloneNode(int, child)),
    ))
  }
  if (node instanceof ParallelNode) {
    const clone = new ParallelNode(
      `${node.id}-clone-${int.counterRef.value++}`,
      node.children.map((child) => cloneNode(int, child)),
    )
    clone.mode = node.mode
    clone.selectedChildId = node.selectedChildId
    clone.triggerOwnerPlayerId = node.triggerOwnerPlayerId
    clone.triggerChildren = node.triggerChildren.map((entry) => ({ ...entry }))
    clone.emittedChoices = [...node.emittedChoices]
    clone.emittedPromptKey = node.emittedPromptKey
    clone.emittedPromptParams = node.emittedPromptParams
    clone.emittedRequest = node.emittedRequest
    return copySharedNodeMetadata(node, clone)
  }
  if (node instanceof OrNode) {
    return copySharedNodeMetadata(node, new OrNode(
      `${node.id}-clone-${int.counterRef.value++}`,
      node.children.map((child) => cloneNode(int, child)),
      node.promptKey,
    ))
  }
  if (node instanceof XorNode) {
    return copySharedNodeMetadata(node, new XorNode(
      `${node.id}-clone-${int.counterRef.value++}`,
      node.children.map((child) => cloneNode(int, child)),
      node.promptKey,
    ))
  }
  return node
}

export function resolveSubtree(node: EngineNode): void {
  if (
    node instanceof SequenceNode ||
    node instanceof ParallelNode ||
    node instanceof OrNode ||
    node instanceof XorNode
  ) {
    node.children.forEach((child) => resolveSubtree(child))
    node.resolve()
    return
  }
  if (node instanceof ActionNode) {
    node.setState('resolved')
    return
  }
  node.resolve()
}

export function sanitizePreviewResources(
  resources?: Partial<Resource>,
): Partial<Resource> | undefined {
  if (!resources) return undefined
  const sanitized: Partial<Resource> = {}
  Object.entries(resources).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    sanitized[key as keyof Resource] = value
  })
  return Object.keys(sanitized).length > 0 ? sanitized : undefined
}

export function mergePreviewResources(
  base: Partial<Resource>,
  delta?: Partial<Resource>,
): Partial<Resource> {
  const merged: Partial<Resource> = { ...base }
  Object.entries(delta ?? {}).forEach(([key, value]) => {
    if (typeof value !== 'number' || value <= 0) return
    const resourceKey = key as keyof Resource
    merged[resourceKey] = (merged[resourceKey] ?? 0) + value
  })
  return merged
}

export function getActionEffectPreview(node: ActionNode): ChoiceEffectPreview | undefined {
  if (node.effectPreview) return node.effectPreview
  const params = sanitizePreviewResources(node.params)
  if (node.actionId === 'pay') {
    return { kind: 'payment', resourcesPaid: params }
  }
  if (node.actionId === 'gain') {
    return { kind: 'resourceExchange', resourcesGained: params }
  }
  if (node.actionId === 'bonus-vp') {
    return { kind: 'resourceExchange', bonusVp: 1 }
  }
  return undefined
}

export function collectOrderedActionNodes(node: EngineNode): ActionNode[] | null {
  if (node instanceof ActionNode) return [node]
  if (node instanceof SequenceNode) {
    const flattened: ActionNode[] = []
    for (const child of node.children) {
      const childActions = collectOrderedActionNodes(child)
      if (!childActions) return null
      flattened.push(...childActions)
    }
    return flattened
  }
  return null
}

export function getSequenceEffectPreview(node: SequenceNode): ChoiceEffectPreview | undefined {
  const actionNodes = collectOrderedActionNodes(node)
  if (!actionNodes || actionNodes.length === 0) return undefined
  const [firstAction, ...restActions] = actionNodes
  if (
    firstAction?.actionId === 'pay' &&
    restActions.every((actionNode) => actionNode.actionId === 'gain' || actionNode.actionId === 'bonus-vp')
  ) {
    let resourcesGained: Partial<Resource> = {}
    let bonusVp = 0
    restActions.forEach((actionNode) => {
      if (actionNode.actionId === 'gain') {
        resourcesGained = mergePreviewResources(resourcesGained, actionNode.params)
      } else if (actionNode.actionId === 'bonus-vp') {
        bonusVp += 1
      }
    })
    return {
      kind: 'resourceExchange',
      resourcesPaid: sanitizePreviewResources(firstAction.params),
      resourcesGained: sanitizePreviewResources(resourcesGained),
      bonusVp: bonusVp > 0 ? bonusVp : undefined,
    }
  }
  return undefined
}

export function getNodeEffectPreview(node: EngineNode): ChoiceEffectPreview | undefined {
  if (node instanceof ActionNode) {
    return getActionEffectPreview(node)
  }
  if (node instanceof SequenceNode) {
    const aggregated = getSequenceEffectPreview(node)
    if (aggregated) return aggregated
    for (const child of node.children) {
      const preview = getNodeEffectPreview(child)
      if (preview) return preview
    }
    return undefined
  }
  if (
    node instanceof ParallelNode ||
    node instanceof OrNode ||
    node instanceof XorNode
  ) {
    for (const child of node.children) {
      const preview = getNodeEffectPreview(child)
      if (preview) return preview
    }
  }
  return undefined
}

const isHiddenDescriptionAction = (node: ActionNode): boolean =>
  node.actionId === 'special-effect' &&
  (node.params as { kind?: unknown } | undefined)?.kind === 'set-infobox'

const descriptionSeparatorForNode = (node: EngineNode): string => {
  if (node instanceof SequenceNode) return ', '
  if (node instanceof XorNode) return ' / '
  if (node instanceof OrNode) return ' + '
  if (node instanceof ParallelNode) return ' | '
  return ''
}

export function getNodeDescriptionPreview(
  node: EngineNode,
  registry: ActionRegistry,
): ChoiceDescriptionPreview | undefined {
  if (node instanceof ActionNode) {
    if (isHiddenDescriptionAction(node)) return undefined
    const action = registry.get(node.actionId)
    if (!action) return undefined
    return {
      kind: 'action',
      labelKey: node.choiceLabelKey ?? action.nameKey,
      labelParams: node.choiceLabelParams,
      effectPreview: getActionEffectPreview(node),
    }
  }
  if (
    node instanceof SequenceNode ||
    node instanceof XorNode ||
    node instanceof OrNode ||
    node instanceof ParallelNode
  ) {
    const parts = node.children
      .map((child) => getNodeDescriptionPreview(child, registry))
      .filter((part): part is ChoiceDescriptionPreview => part !== undefined)
    if (parts.length === 0) return undefined
    if (parts.length === 1) return parts[0]
    return {
      kind: 'group',
      separator: descriptionSeparatorForNode(node),
      parts,
    }
  }
  return undefined
}

export function buildFlowNode(
  int: EngineInternals,
  flow: ActionFlow,
  ownerPlayerId?: string,
): EngineNode {
  const nextId = () => `flow-${int.counterRef.value++}`
  if (flow.targetPlayerId) {
    const { targetPlayerId, ...innerFlow } = flow
    const scopedNode = buildFlowNode(int, innerFlow as ActionFlow, ownerPlayerId)
    return stampOwner(scopedNode, targetPlayerId)
  }
  if (flow.type === 'leaf') {
    if (flow.expandFlow) {
      const definition = int.registry.get(flow.actionId)
      if (definition?.flow) {
        const inner = mergeContextIntoFlow(
          definition.flow,
          flow.actionContext,
          flow.sourceCard,
        )
        return buildFlowNode(int, inner, ownerPlayerId)
      }
      // Fallback: action has no inner flow (plain leaf action like
      // grain-seeds / day-laborer / traveling-players). Drop into the
      // standard ActionNode path below.
    }
    const actionNode = new ActionNode(
      nextId(),
      flow.actionId,
      flow.sourceCard,
      flow.params,
      flow.choiceLabelKey,
      flow.choiceLabelParams,
      flow.actionContext,
      flow.effectPreview,
    )
    const definition = int.registry.get(flow.actionId)
    if (definition?.resolveChoice && !definition.skipChoiceWrap) {
      const sequence = new SequenceNode(nextId(), [actionNode])
      const node = flow.optional ? markOptional(sequence, flow.promptKey) : sequence
      return attachChoiceLabel(node, flow.choiceLabelKey, flow.choiceLabelParams)
    }
    const node = flow.optional ? markOptional(actionNode, flow.promptKey) : actionNode
    return attachChoiceLabel(node, flow.choiceLabelKey, flow.choiceLabelParams)
  }
  const children = flow.children.map((child) => buildFlowNode(int, child, ownerPlayerId))
  if (flow.type === 'seq') {
    const sequence = new SequenceNode(nextId(), children)
    const node = flow.optional ? markOptional(sequence, flow.promptKey) : sequence
    return attachChoiceLabel(node, flow.choiceLabelKey, flow.choiceLabelParams)
  }
  if (flow.type === 'parallel') {
    const parallel = new ParallelNode(nextId(), children)
    if (flow.mode === 'trigger-select') {
      parallel.mode = 'trigger-select'
      parallel.triggerChildren = children.map((child, index) => ({
        nodeId: child.id,
        cardId: flow.children[index]?.sourceCard ?? `child-${index}`,
        listenerId: '',
        mandatory: flow.children[index]?.optional !== true,
      }))
    }
    const node = flow.optional ? markOptional(parallel, flow.promptKey) : parallel
    return attachChoiceLabel(node, flow.choiceLabelKey, flow.choiceLabelParams)
  }
  if (flow.type === 'xor') {
    const xor = new XorNode(nextId(), children, flow.promptKey)
    const node = flow.optional ? markOptional(xor, flow.promptKey) : xor
    return attachChoiceLabel(node, flow.choiceLabelKey, flow.choiceLabelParams)
  }
  const or = new OrNode(nextId(), children, flow.promptKey)
  const node = flow.optional ? markOptional(or, flow.promptKey) : or
  return attachChoiceLabel(node, flow.choiceLabelKey, flow.choiceLabelParams)
}

export function buildOwnedFlowNode(
  int: EngineInternals,
  flow: ActionFlow,
  ownerPlayerId: string,
): EngineNode {
  return stampOwner(buildFlowNode(int, flow, ownerPlayerId), ownerPlayerId)
}

/**
 * Walk a flow subtree and stamp outer `actionContext` / `sourceCard` onto
 * every leaf — used by the leaf `expandFlow` path so the inner flow's
 * leaves carry jump metadata (viaCardJump / jumpChain / sourceCard) into
 * downstream listeners. Outer context fields are merged with **inner
 * priority**: any field already set on the inner leaf wins. Always returns
 * a deep copy — never mutates the input flow (action.flow is a
 * module-level constant).
 */
export function mergeContextIntoFlow(
  flow: ActionFlow,
  outerContext: Record<string, unknown> | undefined,
  outerSourceCard: string | undefined,
): ActionFlow {
  if (flow.type === 'leaf') {
    const merged = outerContext
      ? { ...outerContext, ...(flow.actionContext ?? {}) }
      : flow.actionContext
        ? { ...flow.actionContext }
        : undefined
    return {
      ...flow,
      sourceCard: flow.sourceCard ?? outerSourceCard,
      actionContext: merged,
    }
  }
  return {
    ...flow,
    children: flow.children.map((c) =>
      mergeContextIntoFlow(c, outerContext, outerSourceCard),
    ),
  }
}

export function resolveTrueAction(actionContext?: Record<string, unknown>) {
  return actionContext?.trueAction !== false
}

export function buildListenerEvent(
  executionContext: Pick<ActionExecutionContext, 'sourceCard' | 'actionContext'>,
  extraEvent: Record<string, unknown> = {},
) {
  return {
    ...extraEvent,
    sourceCard: executionContext.sourceCard,
    ...(executionContext.actionContext ?? {}),
    trueAction: resolveTrueAction(executionContext.actionContext),
  }
}

/**
 * Opt-in choice flow for actions that declare `getBaseChoiceOptions`.
 * Returns:
 *   - `null` when the action does not opt in (caller should run `execute()`).
 *   - a `fail` result when no candidate option is affordable.
 *   - the result of `action.resolveChoice` when exactly one option is affordable
 *     (auto short-circuit, no UI choice presented).
 *   - a `choice` result with the merged & affordability-filtered options when
 *     two or more options remain (caller hands it to the regular choice flow).
 * Mutates `executionContext.params.selectedOption` for the auto-resolve case so
 * downstream `during/after` hooks can read which option was picked.
 */
export function maybeBuildChoiceCandidates(
  int: EngineInternals,
  executionContext: ActionExecutionContext,
  action: ActionDefinition,
  actionId: string,
  eventSink: EventSink,
): ActionExecutionResult | null {
  if (!action.getBaseChoiceOptions) return null
  const baseOpts = action.getBaseChoiceOptions(executionContext) ?? []
  const candidateResults = int.hooks.computeChoiceCandidates({
    ...executionContext,
    actionId,
  })
  const extraOpts = candidateResults
    .flatMap((entry) => entry.extraOptions ?? [])
    .filter((opt): opt is ActionChoiceOption => Boolean(opt))
  const seen = new Set<string>()
  const merged: ActionChoiceOption[] = []
  for (const opt of [...baseOpts, ...extraOpts]) {
    if (seen.has(opt.value)) continue
    seen.add(opt.value)
    merged.push(opt)
  }
  const affordable = merged.filter((opt) => {
    const probeCtx = {
      ...executionContext,
      params: { ...(executionContext.params ?? {}), selectedOption: opt.value },
      actionId,
    }
    return int.hooks.isOptionAffordable(probeCtx, action)
  })
  if (affordable.length === 0) {
    return { type: 'fail', errorKey: action.noChoiceLogKey ?? 'log.action' }
  }
  if (affordable.length === 1 && action.resolveChoice) {
    const value = affordable[0]!.value
    executionContext.params = {
      ...(executionContext.params ?? {}),
      selectedOption: value,
    }
    return action.resolveChoice({ ...executionContext, eventSink }, value, undefined)
  }
  return {
    type: 'request',
    request: { kind: 'choice', options: affordable },
    promptKey: action.choicePromptKey,
  }
}

export function buildChoiceExecutionContext(
  context: {
    state: ActionExecutionContext['state']
    player: ActionExecutionContext['player']
    space: ActionExecutionContext['space']
    emitPrivateEvent?: ActionExecutionContext['emitPrivateEvent']
  },
  base?: Pick<ActionExecutionContext, 'params' | 'costs' | 'sourceCard' | 'actionContext'> | null,
): ActionExecutionContext {
  return {
    state: context.state,
    player: context.player,
    space: context.space,
    params: base?.params,
    costs: base?.costs,
    sourceCard: base?.sourceCard,
    actionContext: base?.actionContext,
    emitPrivateEvent: context.emitPrivateEvent,
  }
}

const withResourcePreviewForContinuation = (
  context: ActionExecutionContext,
  resources?: Resource,
): ActionExecutionContext => {
  if (!resources) return context
  const player = {
    ...context.player,
    resources: { ...resources },
  }
  return {
    ...context,
    player,
    state: {
      ...context.state,
      players: (context.state.players ?? []).map((entry) =>
        entry.id === player.id ? player : entry),
    },
  }
}

const canStartFlowWithoutBeforeTriggers = (
  int: EngineInternals,
  context: ActionExecutionContext,
  flow: ActionFlow,
): boolean => {
  if (flow.optional === true) return true

  if (flow.type === 'leaf') {
    const action = int.registry.get(flow.actionId)
    if (!action) return false
    const actionContext = {
      ...(context.actionContext ?? {}),
      ...(flow.actionContext ?? {}),
      skipBeforeTriggers: true,
      checkedReplaceAction: true,
    }
    return action.canBeExecutedByPlayer(
      context.state,
      context.player,
      {
        sourceCard: flow.sourceCard ?? context.sourceCard,
        actionContext,
      },
    )
  }

  if (flow.children.length === 0) return true
  if (flow.type === 'seq') {
    return canStartFlowWithoutBeforeTriggers(int, context, flow.children[0]!)
  }
  return flow.children.some((child) =>
    canStartFlowWithoutBeforeTriggers(int, context, child),
  )
}

export const canActionContinueWithoutBeforeTriggers = (
  int: EngineInternals,
  context: ActionExecutionContext,
  actionId: string,
  resources?: Resource,
): boolean => {
  const action = int.registry.get(actionId)
  if (!action) return false
  const scopedContext = withResourcePreviewForContinuation(context, resources)
  const actionContext = {
    ...(scopedContext.actionContext ?? {}),
    skipBeforeTriggers: true,
  }
  const direct = action.canBeExecutedByPlayer(
    scopedContext.state,
    scopedContext.player,
    {
      sourceCard: scopedContext.sourceCard,
      actionContext,
    },
  )
  if (direct) return true

  const replaceResult = int.hooks.applyComputeReplace({
    ...scopedContext,
    actionId,
    actionContext,
  })
  if (!replaceResult.declined || !replaceResult.alternativeFlow) return false
  return canStartFlowWithoutBeforeTriggers(
    int,
    scopedContext,
    applyDefaultSourceCardToFlow(replaceResult.alternativeFlow, replaceResult.sourceCard),
  )
}

/**
 * Apply an InteractionRequest emitted by action execution to the node that
 * now owns the waiting state. The host remains unresolved; `pending` is the
 * marker that makes subsequent `proceed()` calls re-emit the prompt instead
 * of executing the action again.
 */
export function applyInteractionRequest(
  int: EngineInternals,
  args: {
    targetNode: EngineNode | null
    hostNodeId: string | null
    request: InteractionRequest
    promptKey?: PromptKey
    promptParams?: Record<string, unknown>
    choiceOptions: ActionChoiceOption[]
    actionId: string
    ownerNodeId: string | null
    params: ActionExecutionContext['params']
    costs: ActionExecutionContext['costs']
    sourceCard: string | undefined
    actionContext: Record<string, unknown> | undefined
    /** Optional ActionDef-declared actionContext patch (typically extracted
     *  from `result.extraData.actionContextWrite`). When provided the helper
     *  performs the shallow merge so all three call sites can stop repeating
     *  the same boilerplate inline. */
    contextWritePatch?: Record<string, unknown>
    /** When true, keep the existing envelope owner pointer during multi-step
     *  resolveChoice prompts. */
    preserveOwner?: boolean
  },
): void {
  const { targetNode, hostNodeId, request, promptKey, promptParams, choiceOptions, actionId, ownerNodeId } = args
  const host = targetNode ?? (hostNodeId ? int.tree.findNodeById(hostNodeId) : null)
  if (!host) {
    int.pendingNodeIdRef.value = hostNodeId
    return
  }
  const existingOwnerNodeId = host.getPending()?.ownerNodeId
  const mergedActionContext = args.contextWritePatch
    ? { ...(args.actionContext ?? {}), ...args.contextWritePatch }
    : args.actionContext
  host.setPending({
    hostNodeId: host.id,
    request,
    choices: choiceOptions,
    promptKey,
    promptParams,
    sourceCard: resolveChoiceSourceCard(args.sourceCard, choiceOptions),
    pendingActionId: actionId,
    ownerNodeId: args.preserveOwner ? (existingOwnerNodeId ?? ownerNodeId) : ownerNodeId,
    contextSnapshot: {
      params: args.params,
      costs: args.costs,
      sourceCard: resolveChoiceSourceCard(args.sourceCard, choiceOptions),
      actionContext: mergedActionContext,
    },
    effectiveOwnerPlayerId: ownerFromRequest(request) ?? host.ownerPlayerId,
    syntheticKind: requestSyntheticKind(request, actionId),
  })
  int.pendingNodeIdRef.value = host.id
}

export function snapshotCompositeEmit(int: EngineInternals): {
  nodeId: string
  promptKey?: PromptKey
  promptParams?: Record<string, unknown>
  options: ActionChoiceOption[]
  request?: InteractionRequest
} | null {
  if (int.pendingNodeIdRef.value === null) return null
  const node = int.tree.findNodeById(int.pendingNodeIdRef.value)
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

function requestSyntheticKind(
  request: InteractionRequest,
  pendingActionId?: string | null,
): PendingSyntheticKind | undefined {
  if (pendingActionId === '__interaction_only__') return 'interaction-only'
  if (request.kind === 'feed') return 'feed'
  if (request.kind === 'confirm-next-player') return 'confirm-next-player'
  if (request.kind === 'confirm-player-switch') return 'confirm-player-switch'
  if (request.kind === 'farm-select') return 'farm-select'
  return undefined
}

function sourceCardFromContextSnapshot(snapshot: unknown): string | undefined {
  if (!snapshot || typeof snapshot !== 'object') return undefined
  const sourceCard = (snapshot as { sourceCard?: unknown }).sourceCard
  return typeof sourceCard === 'string' ? sourceCard : undefined
}

function ownerFromRequest(request: InteractionRequest): string | undefined {
  return request.kind === 'select-trigger' ? request.ownerPlayerId : undefined
}

function choiceRequest(options: ActionChoiceOption[]): InteractionRequest {
  return { kind: 'choice', options }
}

export function pendingEnvelopeFromHostNode(node: EngineNode | null): PendingEnvelope | null {
  if (!node) return null
  const pending = node.getPending()
  if (pending) return pending

  if (node instanceof OrNode || node instanceof XorNode) {
    if (node.emittedChoices.length === 0 && !node.emittedRequest) return null
    const request = node.emittedRequest ?? choiceRequest(node.emittedChoices)
    const sourceCard = sourceCardFromContextSnapshot(node.pendingContextSnapshot)
    return {
      hostNodeId: node.id,
      request,
      choices: node.emittedChoices,
      promptKey: node.emittedPromptKey,
      promptParams: node.emittedPromptParams,
      sourceCard,
      pendingActionId: node.pendingActionId ?? undefined,
      ownerNodeId: null,
      contextSnapshot: node.pendingContextSnapshot,
      effectiveOwnerPlayerId: ownerFromRequest(request) ?? node.ownerPlayerId,
      syntheticKind: requestSyntheticKind(request, node.pendingActionId),
    }
  }

  if (node instanceof ParallelNode && node.mode === 'trigger-select') {
    if (node.emittedChoices.length === 0 && !node.emittedRequest) return null
    const request = node.emittedRequest ?? choiceRequest(node.emittedChoices)
    return {
      hostNodeId: node.id,
      request,
      choices: node.emittedChoices,
      promptKey: node.emittedPromptKey,
      promptParams: node.emittedPromptParams,
      ownerNodeId: null,
      effectiveOwnerPlayerId: ownerFromRequest(request) ?? node.ownerPlayerId,
      syntheticKind: requestSyntheticKind(request),
    }
  }

  if (node instanceof ActionNode && node.emittedRequest) {
    const request = node.emittedRequest
    return {
      hostNodeId: node.id,
      request,
      choices: request.kind === 'choice' ? request.options : undefined,
      sourceCard: node.sourceCard,
      pendingActionId: node.actionId,
      ownerNodeId: null,
      effectiveOwnerPlayerId: ownerFromRequest(request) ?? node.ownerPlayerId,
      syntheticKind: requestSyntheticKind(request, node.actionId),
    }
  }

  return null
}
