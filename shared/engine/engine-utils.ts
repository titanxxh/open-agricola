import { isActionDoableInFlowContext, type FlowDoableContext } from '../actions/flow'
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
import type { FollowUpAction, ActionHookContext, ActionHookPhase } from '../actions/hooks'
import {
  ActionNode,
  OrNode,
  ParallelNode,
  SequenceNode,
  XorNode,
} from './nodes'
import { attachChoiceLabel, buildReplaceChoiceFlow, resolveChoiceSourceCard } from './nodes/interaction-helpers'
import type { ComputeReplaceResult } from './dispatcher'
import type { EngineNode } from './types'
import type { PendingCursor, PendingEnvelope, PendingSyntheticKind, PendingView } from './types'
import type { EngineInternals } from './engine-internals'
import type { ActionRegistry } from './registry'
import { getPlayOrderIndex } from './matched-trigger'
import type { MatchedCardListener } from '../cards/card-listeners'
import type { TriggerSnapshot } from '../cards/helpers/trigger-snapshot'
import type { GameState } from '../contract/types'
import {
  ACTIVATE_CARD_ACTION_ID,
  isActivateCardActionNode,
  type ActivateCardActionNode,
  type ActivateCardActionParams,
} from './activation-action'
import { applyComputeCostResults } from './compute-cost-results'
import { pendingEnvelopeChoices } from './pending-validation'
import { findPlayerById, findPlayerIndexById } from '../domain/player'
import { suppressBeforeListeners } from './action-context-flags'

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
  enforceCompositeContinuationMandatory(node)
}

export function enforceCompositeContinuationMandatory(node: EngineNode): void {
  node.mandatory = true
  getNodeChildren(node).forEach(enforceCompositeContinuationMandatory)
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
  target.beforeAnytimeAvailable = source.beforeAnytimeAvailable
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

export function setEngineBlockedPending(int: EngineInternals, nodeId: string, actionId: string): boolean {
  const node = int.tree.findNodeById(nodeId)
  if (!node) return false
  node.setPending({
    hostNodeId: node.id,
    request: { kind: 'engine-blocked', actionId },
    choices: [],
    promptKey: 'ui.interactionEngineBlocked',
    pendingActionId: actionId,
    ownerNodeId: null,
  })
  int.pendingNodeIdRef.value = node.id
  return true
}

export function canStartNode(int: EngineInternals, context: FlowDoableContext, node: EngineNode): boolean {
  const player = context.state.players.find((entry) => entry.id === node.ownerPlayerId) ?? context.player
  if (node instanceof ActionNode) {
    const actionId = node.resolvedReplacement?.actionId ?? node.actionId
    const action = int.registry.get(actionId)
    if (!action) return false
    const actionContext: Record<string, unknown> = {
      ...node.actionContext,
      ...(node.resolvedReplacement ? { checkedReplaceAction: true } : {}),
      ...(node.beforePhaseResolved || context.actionContext?.skipBeforeTriggers === true ? { skipBeforeTriggers: true } : {}),
    }
    const targetSpaceId = actionContext?.targetSpaceId
    const space = context.state.actionSpaces.find((entry) => entry.id === targetSpaceId) ?? context.space
    return isActionDoableInFlowContext({
      ...context, actionId, action, player, space,
      params: node.params, sourceCard: node.resolvedReplacement?.sourceCard ?? node.sourceCard, actionContext,
      resolveAction: (actionId) => int.registry.get(actionId),
    })
  }
  const children = getNodeChildren(node).filter((child) => child.getState() !== 'resolved')
  if (node instanceof OrNode || node instanceof XorNode) {
    if (node.selectedChildId) {
      const selected = children.find((child) => child.id === node.selectedChildId)
      return !selected || canStartNode(int, { ...context, player }, selected)
    }
    return children.some((child) => canStartNode(int, { ...context, player }, child))
  }
  return children.length === 0 || children[0]!.optional === true || canStartNode(int, { ...context, player }, children[0]!)
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
    ownerOrderIndex: number
    playOrderIndex: number
    matchedIndex: number
  }

  const activeId = state.players[state.currentPlayerIndex]?.id
  const effectiveTriggerPlayerId = triggerPlayerId ?? activeId
  const eventSourceCard =
    typeof baseEvent.sourceCard === 'string' && baseEvent.sourceCard.length > 0
      ? baseEvent.sourceCard
      : undefined
  const prepared: Prepared[] = matchedListeners.map((ml, matchedIndex) => {
    const owner = findPlayerById(state, ml.ownerPlayerId)
    const ownerSeatIndex = owner ? findPlayerIndexById(state, owner.id) : Number.MAX_SAFE_INTEGER
    const ownerOrderIndex = ml.ownerPlayerId === ''
      ? -1
      : ml.ownerPlayerId === effectiveTriggerPlayerId ? 0 : ownerSeatIndex + 1
    const playOrderIndex = owner ? getPlayOrderIndex(owner, ml.cardId) : Number.MAX_SAFE_INTEGER
    return { ml, ownerOrderIndex, playOrderIndex, matchedIndex }
  }).sort((a, b) => {
    const ownerDelta = a.ownerOrderIndex - b.ownerOrderIndex
    if (ownerDelta !== 0) return ownerDelta
    const playOrderDelta = a.playOrderIndex - b.playOrderIndex
    if (playOrderDelta !== 0) return playOrderDelta
    return a.matchedIndex - b.matchedIndex
  })

  const children = prepared.map((p): ActivateCardActionNode => {
    const nodeId = `activate-${phase}-${actionId}-${int.counterRef.value++}`
    const cardId = p.ml.cardId || eventSourceCard || ''
    const params: ActivateCardActionParams = {
      listenerId: p.ml.registration.id,
      cardId,
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
      cardId,
      params,
    )
    if (p.ml.ownerPlayerId) node.ownerPlayerId = p.ml.ownerPlayerId
    return node as ActivateCardActionNode
  })

  const groups: ActivateCardActionNode[][] = []
  for (const child of children) {
    const ownerKey = child.params.ownerPlayerId || effectiveTriggerPlayerId || ''
    const last = groups.at(-1)
    const lastOwnerKey = last?.[0]?.params.ownerPlayerId || effectiveTriggerPlayerId || ''
    if (last && lastOwnerKey === ownerKey) {
      last.push(child)
    } else {
      groups.push([child])
    }
  }

  return groups.map((group) => {
    if (group.length === 1) return group[0]!
    const ownerPlayerId = group[0]?.params.ownerPlayerId || effectiveTriggerPlayerId
    const ptn = new ParallelNode(
      `parallel-trigger-${phase}-${actionId}-${ownerPlayerId ?? 'global'}-${int.counterRef.value++}`,
      group,
    )
    ptn.mode = 'trigger-select'
    ptn.triggerOwnerPlayerId = ownerPlayerId
    ptn.ownerPlayerId = ownerPlayerId
    ptn.triggerChildren = group.map((child) => ({
      nodeId: child.id,
      cardId: child.params.cardId || child.sourceCard || child.params.listenerId,
      listenerId: child.params.listenerId,
      mandatory: child.params.mandatory === true,
    }))
    return ptn
  })
}

export function stampContinuationParentHost(node: EngineNode, hostNodeId: string): void {
  if (node instanceof ActionNode) node.continuationParentHostNodeId = hostNodeId
  for (const child of getNodeChildren(node)) stampContinuationParentHost(child, hostNodeId)
}

export function stampBeforeHostNode(node: EngineNode, hostNodeId: string): void {
  if (isActivateCardActionNode(node)) node.params.beforeHostNodeId = hostNodeId
  for (const child of getNodeChildren(node)) stampBeforeHostNode(child, hostNodeId)
}

export function stampSuppressedBeforeListeners(
  node: EngineNode,
  listenerIds: readonly string[],
): void {
  if (node instanceof ActionNode) {
    node.actionContext = suppressBeforeListeners(node.actionContext, listenerIds)
  }
  for (const child of getNodeChildren(node)) stampSuppressedBeforeListeners(child, listenerIds)
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
    clone.resolvedReplacement = node.resolvedReplacement
    clone.beforePhaseResolved = node.beforePhaseResolved
    clone.bodyStarted = node.bodyStarted
    clone.continuationParentHostNodeId = node.continuationParentHostNodeId
    return copySharedNodeMetadata(node, clone)
  }
  if (node instanceof SequenceNode) {
    const clone = new SequenceNode(
      `${node.id}-clone-${int.counterRef.value++}`,
      node.children.map((child) => cloneNode(int, child)),
    )
    clone.anytimeActionId = node.anytimeActionId
    return copySharedNodeMetadata(node, clone)
  }
  if (node instanceof ParallelNode) {
    const clone = new ParallelNode(
      `${node.id}-clone-${int.counterRef.value++}`,
      node.children.map((child) => cloneNode(int, child)),
    )
    clone.mode = node.mode
    clone.selectedChildId = node.selectedChildId
    clone.resolveAfterSelection = node.resolveAfterSelection
    clone.triggerOwnerPlayerId = node.triggerOwnerPlayerId
    clone.triggerChildren = node.triggerChildren.map((entry) => ({ ...entry }))
    clone.emittedChoices = [...node.emittedChoices]
    clone.emittedPromptKey = node.emittedPromptKey
    clone.emittedPromptParams = node.emittedPromptParams
    clone.emittedRequest = node.emittedRequest
    return copySharedNodeMetadata(node, clone)
  }
  if (node instanceof OrNode || node instanceof XorNode) {
    const children = node.children.map((child) => cloneNode(int, child))
    const clone = node instanceof OrNode
      ? new OrNode(`${node.id}-clone-${int.counterRef.value++}`, children, node.promptKey)
      : new XorNode(`${node.id}-clone-${int.counterRef.value++}`, children, node.promptKey)
    if (node.selectedChildId) {
      const selectedIndex = node.children.findIndex((child) => child.id === node.selectedChildId)
      clone.selectedChildId = selectedIndex >= 0 ? children[selectedIndex]?.id ?? null : null
    }
    if (node instanceof XorNode && clone instanceof XorNode && node.replacementOriginalNodeId) {
      const originalIndex = node.children.findIndex((child) => child.id === node.replacementOriginalNodeId)
      clone.replacementOriginalNodeId = children[originalIndex]?.id
      clone.replacementSourceCards = Object.fromEntries(children.map((child, index) => [
        child.id, node.replacementSourceCards?.[node.children[index]!.id],
      ]))
    }
    clone.emittedChoices = [...node.emittedChoices]
    clone.emittedPromptKey = node.emittedPromptKey
    clone.emittedPromptParams = node.emittedPromptParams
    clone.emittedRequest = node.emittedRequest
    clone.pendingActionId = node.pendingActionId
    clone.pendingContextSnapshot = node.pendingContextSnapshot
    return copySharedNodeMetadata(node, clone)
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

type SpecialEffectDescriptionParams = {
  kind?: unknown
  accepted?: unknown
}

const specialEffectDescriptionLabelKey = (node: ActionNode): string | null | undefined => {
  if (node.actionId !== 'special-effect') return undefined
  const params = node.params as SpecialEffectDescriptionParams | undefined
  if (!params || typeof params.kind !== 'string') return 'actions.special-effect.apply.name'
  if (params.kind === 'emit-card-triggered' && params.accepted === false) {
    return 'actions.special-effect.emit-card-triggered.declined.name'
  }
  switch (params.kind) {
    case 'set-infobox':
      return null
    case 'increment-extra-data':
    case 'set-extra-data':
    case 'increment-counter':
    case 'set-counter':
    case 'set-flag':
      return `actions.special-effect.${params.kind}.name`
    case 'pop-card-stack-top':
    case 'swap-improvement-with-board':
    case 'return-card-to-board':
    case 'clear-pending-fence-bonus':
    case 'consume-pending-extra-turns':
    case 'remove-future-meeples':
    case 'promote-first-newborn':
    case 'remove-field-crop':
    case 'remove-field-crops':
    case 'consume-fence':
    case 'add-resource-to-space':
    case 'build-stable-on-first-empty-tile':
    case 'move-resource-between-spaces':
    case 'plant-additional-good':
    case 'emit-card-triggered':
      return `actions.special-effect.${params.kind}.name`
    default:
      return 'actions.special-effect.apply.name'
  }
}

const descriptionSeparatorForNode = (node: EngineNode): string => {
  if (node instanceof SequenceNode) return ', '
  if (node instanceof XorNode) return ' / '
  if (node instanceof OrNode) return ' + '
  if (node instanceof ParallelNode) return ' | '
  return ''
}

const cardChoiceLabelKeyPattern = /^cards\.[^.]+\.choice$/

export function getNodeDescriptionPreview(
  node: EngineNode,
  registry: ActionRegistry,
): ChoiceDescriptionPreview | undefined {
  if (node instanceof ActionNode) {
    const action = registry.get(node.actionId)
    if (!action) return undefined
    const specialEffectLabelKey = specialEffectDescriptionLabelKey(node)
    const isCardChoiceLabel =
      !!node.choiceLabelKey && cardChoiceLabelKeyPattern.test(node.choiceLabelKey)
    const useChoiceLabelAsDescription =
      !!node.choiceLabelKey && !isCardChoiceLabel
    if (specialEffectLabelKey === null && !useChoiceLabelAsDescription) return undefined
    return {
      kind: 'action',
      labelKey: useChoiceLabelAsDescription
        ? node.choiceLabelKey!
        : specialEffectLabelKey ?? (isCardChoiceLabel ? action.descriptionKey : action.nameKey),
      labelParams: useChoiceLabelAsDescription ? node.choiceLabelParams : undefined,
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
  inheritedOptionId?: string,
  idStyle: 'flow' | 'session' = 'flow',
): EngineNode {
  const optionId = flow.optionId ?? inheritedOptionId
  const nextId = () => `flow-${int.counterRef.value++}`
  const nextActionId = (actionId: string) =>
    idStyle === 'session'
      ? `action-${actionId}-${int.counterRef.value++}`
      : nextId()
  const nextSequenceId = (actionId?: string) =>
    idStyle === 'session'
      ? actionId
        ? `seq-${actionId}-${int.counterRef.value++}`
        : `seq-${int.counterRef.value++}`
      : nextId()
  const nextCompositeId = (prefix: 'par' | 'or' | 'xor') =>
    idStyle === 'session'
      ? `${prefix}-${int.counterRef.value++}`
      : nextId()
  const attachCompositeChoiceLabel = (node: EngineNode, source: ActionFlow): EngineNode =>
    idStyle === 'session' && !source.optionId
      ? node
      : attachChoiceLabel(node, source.choiceLabelKey, source.choiceLabelParams)
  if (flow.targetPlayerId) {
    const { targetPlayerId, ...innerFlow } = flow
    const scopedNode = buildFlowNode(int, innerFlow as ActionFlow, ownerPlayerId, optionId, idStyle)
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
        return buildFlowNode(int, inner, ownerPlayerId, optionId, idStyle)
      }
      // Fallback: action has no inner flow (plain leaf action like
      // grain-seeds / day-laborer / traveling-players). Drop into the
      // standard ActionNode path below.
    }
    const actionNode = new ActionNode(
      nextActionId(flow.actionId),
      flow.actionId,
      flow.sourceCard,
      flow.params,
      flow.choiceLabelKey,
      flow.choiceLabelParams,
      optionId ? { ...(flow.actionContext ?? {}), optionId } : flow.actionContext,
      flow.effectPreview,
    )
    const definition = int.registry.get(flow.actionId)
    if (definition?.resolveChoice && !definition.skipChoiceWrap) {
      const sequence = new SequenceNode(nextSequenceId(flow.actionId), [actionNode])
      const node = flow.optional ? markOptional(sequence, flow.promptKey) : sequence
      return attachChoiceLabel(node, flow.choiceLabelKey, flow.choiceLabelParams)
    }
    const node = flow.optional ? markOptional(actionNode, flow.promptKey) : actionNode
    return attachChoiceLabel(node, flow.choiceLabelKey, flow.choiceLabelParams)
  }
  const children = flow.children.map((child) => buildFlowNode(int, child, ownerPlayerId, optionId, idStyle))
  if (flow.type === 'seq') {
    const sequence = new SequenceNode(nextSequenceId(), children)
    sequence.anytimeActionId = flow.anytimeActionId
    const node = flow.optional ? markOptional(sequence, flow.promptKey) : sequence
    return attachCompositeChoiceLabel(node, flow)
  }
  if (flow.type === 'parallel') {
    const parallel = new ParallelNode(nextCompositeId('par'), children)
    if (flow.mode === 'trigger-select') {
      parallel.mode = 'trigger-select'
      parallel.resolveAfterSelection = flow.triggerSelectOnce === true
      parallel.triggerOwnerPlayerId = ownerPlayerId
      parallel.triggerChildren = children.map((child, index) => ({
        nodeId: child.id,
        cardId: flow.children[index]?.sourceCard ?? `child-${index}`,
        listenerId: '',
        mandatory: flow.children[index]?.optional !== true,
      }))
    }
    const node = flow.optional ? markOptional(parallel, flow.promptKey) : parallel
    return attachCompositeChoiceLabel(node, flow)
  }
  if (flow.type === 'xor') {
    const xor = new XorNode(nextCompositeId('xor'), children, flow.promptKey)
    const node = flow.optional ? markOptional(xor, flow.promptKey) : xor
    return attachCompositeChoiceLabel(node, flow)
  }
  const or = new OrNode(nextCompositeId('or'), children, flow.promptKey)
  const node = flow.optional ? markOptional(or, flow.promptKey) : or
  return attachCompositeChoiceLabel(node, flow)
}

export function buildOwnedFlowNode(
  int: EngineInternals,
  flow: ActionFlow,
  ownerPlayerId: string,
): EngineNode {
  return stampOwner(buildFlowNode(int, flow, ownerPlayerId), ownerPlayerId)
}

export function buildReplacementChoiceNode(
  int: EngineInternals,
  context: FlowDoableContext,
  actionNode: ActionNode,
  replacement: ComputeReplaceResult,
  optionalHost?: EngineNode,
): XorNode | undefined {
  if (replacement.alternatives.length === 0) return undefined
  const flow = buildReplaceChoiceFlow(
    { ...actionNode, optional: optionalHost?.optional, optionalPromptKey: optionalHost?.optionalPromptKey },
    replacement.alternatives.map((alternative) => ({
      ...alternative,
      flow: applyDefaultSourceCardToFlow(alternative.flow, alternative.sourceCard),
    })),
    replacement.actionId,
  )
  const node = buildOwnedFlowNode(int, flow, context.player.id) as XorNode
  node.replacementSourceCards = Object.fromEntries(node.children.slice(0, -1).map((child, index) => [
    child.id, replacement.alternatives[index]!.sourceCard,
  ]))
  const original = node.children.at(-1)!
  const alternatives = node.children.slice(0, -1).filter((child) => canStartNode(int, context, child))
  if (alternatives.length === 0) return undefined
  node.children = [...alternatives, original]
  node.replacementOriginalNodeId = original.id
  node.promptKey = 'ui.interactionSelectReplacement'
  enforceCompositeContinuationMandatory(node)
  return node
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
  executionContext: Pick<ActionExecutionContext, 'sourceCard' | 'actionContext' | 'params'>,
  extraEvent: Record<string, unknown> = {},
) {
  const actionContext = executionContext.actionContext
    ? { ...executionContext.actionContext }
    : undefined
  return {
    ...extraEvent,
    sourceCard: executionContext.sourceCard,
    ...(executionContext.actionContext ?? {}),
    ...(actionContext ? { actionContext } : {}),
    ...(executionContext.params ? { params: { ...executionContext.params } } : {}),
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
    const selectedCostResults = int.hooks.computeCosts({
      ...executionContext,
      actionId,
    })
    applyComputeCostResults(executionContext, selectedCostResults)
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
    reportProtectedObservation?: ActionExecutionContext['reportProtectedObservation']
  },
  base?: Pick<ActionExecutionContext, 'params' | 'costs' | 'costTrades' | 'costBonuses' | 'paymentResourceProviders' | 'costAttribution' | 'sourceCard' | 'actionContext'> | null,
): ActionExecutionContext {
  return {
    state: context.state,
    player: context.player,
    space: context.space,
    params: base?.params,
    costs: base?.costs,
    costTrades: base?.costTrades,
    costBonuses: base?.costBonuses,
    paymentResourceProviders: base?.paymentResourceProviders,
    costAttribution: base?.costAttribution,
    sourceCard: base?.sourceCard,
    actionContext: base?.actionContext,
    emitPrivateEvent: context.emitPrivateEvent,
    reportProtectedObservation: context.reportProtectedObservation,
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
    const sourceCard = flow.sourceCard ?? context.sourceCard
    const actionContext = {
      ...(context.actionContext ?? {}),
      ...(flow.actionContext ?? {}),
      skipBeforeTriggers: true,
      checkedReplaceAction: true,
    }
    const doable = action.canBeExecutedByPlayer(
      context.state,
      context.player,
      {
        params: flow.params,
        space: context.space,
        sourceCard,
        actionContext,
      },
    )
    return int.hooks.applyIsDoable(
      { ...context, params: flow.params, actionId: flow.actionId, sourceCard, actionContext },
      action,
      doable,
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

export function getBeforeContinuationContext(
  int: EngineInternals,
  context: ActionExecutionContext,
  node: ParallelNode,
  actionId: string,
): ActionExecutionContext & { actionId: string } {
  const activation = node.children.find((child) =>
    isActivateCardActionNode(child) && child.params.phase === 'before' && child.params.actionId === actionId)
  const hostId = activation && isActivateCardActionNode(activation) ? activation.params.beforeHostNodeId : undefined
  const host = hostId ? int.tree.findNodeById(hostId) : undefined
  if (!(host instanceof ActionNode)) return { ...context, actionId }
  return {
    ...context,
    actionId: host.resolvedReplacement?.actionId ?? host.actionId,
    player: context.state.players.find((player) => player.id === host.ownerPlayerId) ?? context.player,
    space: context.state.actionSpaces.find((space) => space.id === host.actionContext?.targetSpaceId) ?? context.space,
    params: host.params,
    sourceCard: host.resolvedReplacement?.sourceCard ?? host.sourceCard,
    actionContext: { ...host.actionContext, ...(host.resolvedReplacement ? { checkedReplaceAction: true } : {}) },
  }
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
      params: scopedContext.params,
      space: scopedContext.space,
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
  return replaceResult.alternatives.some((alternative) =>
    canStartFlowWithoutBeforeTriggers(
      int,
      scopedContext,
      applyDefaultSourceCardToFlow(alternative.flow, alternative.sourceCard),
    ))
}

export const isActionStrictlyDoableWithoutBeforeTriggers = (
  int: EngineInternals,
  context: ActionExecutionContext & Partial<Pick<ActionHookContext, 'transactionEvents' | 'eventQuery'>>,
  actionId: string,
): boolean => {
  const actionContext = {
    ...(context.actionContext ?? {}),
    skipBeforeTriggers: true,
  }
  const strictContext = { ...context, actionContext, actionId }
  const replaceResult = int.hooks.applyComputeReplace(strictContext)
  const action = int.registry.get(replaceResult.actionId)
  if (!action) return false
  const replacedContext = {
    ...strictContext,
    actionId: replaceResult.actionId,
    sourceCard: replaceResult.sourceCard ?? context.sourceCard,
  }
  const direct = int.hooks.applyIsDoable(
    replacedContext,
    action,
    action.canBeExecutedByPlayer(context.state, context.player, {
      params: replacedContext.params,
      space: replacedContext.space,
      sourceCard: replacedContext.sourceCard,
      actionContext,
    }),
  )
  if (direct) return true
  return replaceResult.alternatives.some((alternative) =>
    canStartFlowWithoutBeforeTriggers(
      int,
      context,
      applyDefaultSourceCardToFlow(alternative.flow, alternative.sourceCard),
    ))
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
    costTrades?: ActionExecutionContext['costTrades']
    costBonuses?: ActionExecutionContext['costBonuses']
    paymentResourceProviders?: ActionExecutionContext['paymentResourceProviders']
    costAttribution?: ActionExecutionContext['costAttribution']
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
      costTrades: args.costTrades,
      costBonuses: args.costBonuses,
      paymentResourceProviders: args.paymentResourceProviders,
      costAttribution: args.costAttribution,
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
  if (request.kind === 'heating') return 'heating'
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

function costOverrideFromContextSnapshot(
  snapshot: unknown,
): ActionExecutionContext['costs'] | undefined {
  if (!snapshot || typeof snapshot !== 'object') return undefined
  const costs = (snapshot as { costs?: unknown }).costs
  return costs && typeof costs === 'object'
    ? costs as ActionExecutionContext['costs']
    : undefined
}

export function pendingViewFromEnvelope(envelope: PendingEnvelope | null): PendingView | null {
  if (!envelope) return null
  const choices = pendingEnvelopeChoices(envelope)
  const sourceCard = resolveChoiceSourceCard(
    envelope.sourceCard ?? sourceCardFromContextSnapshot(envelope.contextSnapshot),
    choices,
  )
  const costOverride = costOverrideFromContextSnapshot(envelope.contextSnapshot)
  return {
    request: envelope.request,
    ...(choices.length > 0 ? { choices } : {}),
    ...(envelope.promptKey !== undefined ? { promptKey: envelope.promptKey } : {}),
    ...(envelope.promptParams !== undefined ? { promptParams: envelope.promptParams } : {}),
    ...(sourceCard !== undefined ? { sourceCard } : {}),
    ...(envelope.effectiveOwnerPlayerId !== undefined
      ? { effectiveOwnerPlayerId: envelope.effectiveOwnerPlayerId }
      : {}),
    ...(envelope.syntheticKind !== undefined ? { syntheticKind: envelope.syntheticKind } : {}),
    ...(costOverride !== undefined ? { costOverride } : {}),
  }
}

export function pendingCursorFromEnvelope(envelope: PendingEnvelope | null): PendingCursor | null {
  if (!envelope) return null
  return {
    hostNodeId: envelope.hostNodeId,
    pendingActionId: envelope.pendingActionId,
    ownerNodeId: envelope.ownerNodeId,
    contextSnapshot: envelope.contextSnapshot,
    internalHostNodeId: envelope.internalHostNodeId,
    internalResultKey: envelope.internalResultKey,
    internalPaymentInfoFrom: envelope.internalPaymentInfoFrom,
  }
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
