import { evaluateFlowDoable } from '../actions/flow'
import type {
  ActionExecutionContext,
  ActionExecutionResult,
  ActionFlow,
  InternalActionChild,
  PlayerState,
  ActionChoiceOption,
  InteractionRequest,
  Resource,
  ActionSpace,
} from '../contract/types'
import {
  ActionNode,
  OrNode,
  ParallelNode,
  XorNode,
} from './nodes'
import { resolveChoiceSourceCard } from './nodes/interaction-helpers'
import {
  buildReplaceChoiceFlow,
  getChoiceLabel,
  getNodeSourceCard,
  getReplaceAwareChoiceLabel,
} from './nodes/interaction-helpers'
import type { EngineNode, EngineStepResult } from './types'
import {
  executeCardListener,
  getListenerById,
  type CardListenerContext,
} from '../cards/card-listeners'
import { incCardUsed } from '../cards/helpers/card-state'
import type { EngineInternals } from './engine-internals'
import {
  applyDefaultSourceCardToFlow,
  applyInteractionRequest,
  buildActivationActionNodes,
  buildPhaseTrailingNodes,
  buildFollowUpNodes,
  buildListenerEvent,
  buildOwnedFlowNode,
  canActionContinueWithoutBeforeTriggers,
  canStartNode,
  enforceCompositeContinuationMandatory,
  findActionNode,
  getNodeDescriptionPreview,
  getNodeEffectPreview,
  maybeBuildChoiceCandidates,
  normalizeFollowUpAction,
  pendingEnvelopeFromHostNode,
  resolveSubtree,
  stampBeforeHostNode,
  stampContinuationParentHost,
  stampSuppressedBeforeListeners,
} from './engine-utils'
import type { InteractionContextSnapshot, PendingEnvelope } from './types'
import { isActivateCardActionNode, type ActivateCardActionNode } from './activation-action'
import { evaluateTriggerSelect, type TriggerSelectEvaluationOptions } from './trigger-select'
import {
  getSuppressedBeforeListenerIds,
  withInjectedAnytimeResultFlag,
} from './action-context-flags'
import { eventsToLogEntries } from '../events/log-mapper'
import type { GameEvent } from '../contract/events'
import { createEventQuery } from '../events/query'
import { createBufferedEventSink, emitCardTriggered } from './card-trigger-events'
import { createTriggerSnapshot } from '../cards/helpers/trigger-snapshot'
import { applyComputeCostResults } from './compute-cost-results'
import { findActionSpaceById } from '../domain/space'
import { findPlayerById } from '../domain/player'

type EngineContext = {
  state: ActionExecutionContext['state']
  player: ActionExecutionContext['player']
  space: ActionExecutionContext['space']
  continuationOwnerPlayerId?: string
  emitPrivateEvent?: ActionExecutionContext['emitPrivateEvent']
  reportProtectedObservation?: ActionExecutionContext['reportProtectedObservation']
}

const resolveExecutionSpace = (
  state: EngineContext['state'],
  fallback: ActionSpace,
  actionContext?: Record<string, unknown>,
): ActionSpace => {
  const targetSpaceId = actionContext?.targetSpaceId
  if (typeof targetSpaceId !== 'string') return fallback
  return findActionSpaceById(state, targetSpaceId) ?? fallback
}

const triggerSelectContextSnapshot = (context: EngineContext): InteractionContextSnapshot => ({
  params: undefined,
  costs: undefined,
  sourceCard: undefined,
  actionContext: typeof context.space?.id === 'string'
    ? { targetSpaceId: context.space.id }
    : undefined,
})

const hasStateLogSurface = (result: ActionExecutionResult): boolean => {
  if (result.type === 'fail') return true
  return false
}

const playerNamesForLog = (context: EngineContext): Record<string, string> =>
  Object.fromEntries(context.state.players.map((player) => [player.id, player.name]))

const actionNamesForLog = (
  int: EngineInternals,
  context: EngineContext,
): Record<string, string> =>
  Object.fromEntries([
    ...context.state.actionSpaces.map((space) => [space.id, space.nameKey] as const),
    ...[...int.registry.values()].map((action) => [action.id, action.nameKey] as const),
  ])

const appendDerivedLogsForEventOnlyResult = (
  int: EngineInternals,
  context: EngineContext,
  committed: readonly GameEvent[],
  result: ActionExecutionResult,
): void => {
  if (committed.length === 0 || hasStateLogSurface(result)) return
  const entries = eventsToLogEntries(committed, {
    playerNames: playerNamesForLog(context),
    actionNames: actionNamesForLog(int, context),
  })
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    int.log.append(entries[index]!)
  }
}

const recordEventLogDerivation = (
  int: EngineInternals,
  events: GameEvent[],
  result: ActionExecutionResult,
): void => {
  int.eventLogDerivations.push({ events, result })
}

const clearEventLogDerivations = (int: EngineInternals): void => {
  int.eventLogDerivations.splice(0, int.eventLogDerivations.length)
}

const grantedActionIdsFromFlow = (flow: ActionFlow): string[] => {
  if (flow.type === 'leaf') {
    return flow.actionContext?.trueAction === false ? [flow.actionId] : []
  }
  return flow.children.flatMap((child) => grantedActionIdsFromFlow(child))
}

const flowSourceCard = (flow: ActionFlow): string | undefined =>
  flow.type === 'leaf' ? flow.sourceCard : undefined

const recordGrantedActionsFromFlow = (
  int: EngineInternals,
  flow: ActionFlow,
  player: PlayerState,
  state: EngineContext['state'],
  sourceCard?: string,
): void => {
  if (!sourceCard) return
  const actionIds = [...new Set(grantedActionIdsFromFlow(flow))]
  if (actionIds.length === 0) return
  const frame = int.events.beginFrame({
    actorPlayerId: player.id,
    sourceCardId: sourceCard,
  })
  actionIds.forEach((actionId) => {
    frame.sink.emit<'action.granted'>({
      type: 'action.granted',
      playerId: player.id,
      actionId,
      cardId: sourceCard,
    })
  })
  frame.complete(state)
}

const ensureEventState = (state: EngineContext['state']): void => {
  state.events ??= []
  state.nextEventSeq ??= 1
}

const currentEventReadContext = (
  int: EngineInternals,
  actionEvents?: readonly GameEvent[],
) => {
  const transactionEvents = [...int.events.currentTransactionEvents()]
  return {
    transactionEvents,
    actionEvents: actionEvents ? [...actionEvents] : undefined,
    eventQuery: createEventQuery(transactionEvents),
  }
}

const deferredHostEventReadContext = (
  int: EngineInternals,
  node: ActionNode,
) => {
  const transactionEvents = [...int.events.currentTransactionEvents()]
  const capturedTransactionEvents = node.deferredHostTransactionEvents ?? []
  const actionEvents = [
    ...(node.deferredHostActionEvents ?? []),
    ...transactionEvents.slice(capturedTransactionEvents.length),
  ]
  return {
    transactionEvents,
    actionEvents,
    eventQuery: createEventQuery(transactionEvents),
  }
}

const eventReadContextForActivation = (
  int: EngineInternals,
  params: ActivateCardActionNode['params'],
) => {
  const transactionEvents = params.transactionEvents
  if (!transactionEvents) {
    const live = currentEventReadContext(int)
    if (typeof params.actionEventStartIndex === 'number') {
      return {
        ...live,
        actionEvents: live.transactionEvents.slice(params.actionEventStartIndex),
      }
    }
    return live
  }
  const events = [...transactionEvents]
  return {
    transactionEvents: events,
    actionEvents: params.actionEvents ? [...params.actionEvents] : undefined,
    eventQuery: createEventQuery(events),
  }
}

const commitIfEngineComplete = (
  int: EngineInternals,
  context: EngineContext,
  result: ActionExecutionResult,
): void => {
  if (int.pendingNodeIdRef.value !== null) return
  if (int.tree.nextUnresolved()) return
  commitOpenEventTransaction(int, context, result)
}

const commitOpenEventTransaction = (
  int: EngineInternals,
  context: EngineContext,
  result: ActionExecutionResult,
): void => {
  ensureEventState(context.state)
  const committed = int.events.commitTransaction(context.state)
  appendDerivedLogsForEventOnlyResult(int, context, committed, result)
  clearEventLogDerivations(int)
}

const triggerSelectEvaluationOptions = (
  int: EngineInternals,
  context: ActionExecutionContext,
): TriggerSelectEvaluationOptions => ({
  canStartFlow: (flow, flowContext) => evaluateFlowDoable(flow, flowContext, (actionId) => int.registry.get(actionId)),
  canContinueWithoutTriggers: (actionId, resources) =>
    canActionContinueWithoutBeforeTriggers(
      int,
      { ...context, ...currentEventReadContext(int) },
      actionId,
      resources,
    ),
  canReachContinuationThroughTriggers: (actionId, resources) => {
    const action = int.registry.get(actionId)
    if (!action) return false
    const scopedContext = withResourcePreview(context, resources)
    const directDoable = action.canBeExecutedByPlayer(
      scopedContext.state,
      scopedContext.player,
      {
        params: scopedContext.params,
        space: scopedContext.space,
        sourceCard: scopedContext.sourceCard,
        actionContext: scopedContext.actionContext,
      },
    )
    return int.hooks.applyIsDoable(
      { ...scopedContext, ...currentEventReadContext(int), actionId },
      action,
      directDoable,
    )
  },
})

const withResourcePreview = (
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

const actionContextForNode = (
  node: ActionNode,
  int?: EngineInternals,
): ActionExecutionContext['actionContext'] =>
  withInternalPaymentInfo(
    node.beforePhaseResolved
      ? { ...(node.actionContext ?? {}), skipBeforeTriggers: true }
      : node.actionContext,
    node,
    int,
  )

const paymentInfoFromResult = (result: ActionExecutionResult): unknown => {
  if (result.type !== 'ok') return result
  const extraData = result.extraData ?? {}
  const resourcesPaid = result.resourcesPaid ?? extraData.resourcesPaid
  const paymentInfo: Record<string, unknown> = {}
  if (resourcesPaid !== undefined) paymentInfo.resourcesPaid = resourcesPaid
  if (extraData.feeIndex !== undefined) paymentInfo.feeIndex = extraData.feeIndex
  if (extraData.originalFeeIndex !== undefined) paymentInfo.originalFeeIndex = extraData.originalFeeIndex
  if (extraData.returnedCardId !== undefined) paymentInfo.returnedCardId = extraData.returnedCardId
  return Object.keys(paymentInfo).length > 0 ? paymentInfo : result
}

const withInternalPaymentInfo = (
  actionContext: ActionExecutionContext['actionContext'],
  node: ActionNode,
  int?: EngineInternals,
): ActionExecutionContext['actionContext'] => {
  if (!int || !node.internalHostNodeId || !node.internalPaymentInfoFrom) return actionContext
  const result = int.internalChildResults.get(node.internalHostNodeId)?.[node.internalPaymentInfoFrom]
  if (!result) return actionContext
  return {
    ...(actionContext ?? {}),
    paymentInfo: paymentInfoFromResult(result),
  }
}

const recordInternalResult = (
  int: EngineInternals,
  hostNodeId: string | undefined,
  resultKey: string | undefined,
  result: ActionExecutionResult,
): void => {
  if (!hostNodeId || !resultKey) return
  const hostResults = int.internalChildResults.get(hostNodeId) ?? {}
  hostResults[resultKey] = result
  int.internalChildResults.set(hostNodeId, hostResults)
}

const recordInternalChildResult = (
  int: EngineInternals,
  node: ActionNode,
  result: ActionExecutionResult,
): void => {
  recordInternalResult(int, node.internalHostNodeId, node.internalResultKey, result)
}

const recordDeferredHostResult = (
  int: EngineInternals,
  node: ActionNode,
  result: ActionExecutionResult,
): void => {
  recordInternalResult(
    int,
    node.deferredHostResultTargetNodeId,
    node.deferredHostResultKey,
    result,
  )
}

const blockingBeforeHostChildResult = (
  int: EngineInternals,
  node: ActionNode,
): Extract<ActionExecutionResult, { type: 'fail' }> | null => {
  const result = node.deferredHostResult
  if (result?.type !== 'ok') return null
  const requiredChildren =
    result.internalChildren?.beforeHostListeners?.filter((child) => child.resultKey) ?? []
  if (requiredChildren.length === 0) return null
  const hostResults = int.internalChildResults.get(node.internalHostNodeId ?? node.id) ?? {}
  for (const child of requiredChildren) {
    const childResult = hostResults[child.resultKey!]
    if (!childResult) return { type: 'fail', errorKey: 'log.payFail' }
    if (childResult.type === 'fail') return childResult
    if (childResult.type !== 'ok') return { type: 'fail', errorKey: 'log.payFail' }
  }
  return null
}

const copyInternalMetadataToPending = (node: ActionNode): void => {
  const pending = node.getPending()
  if (!pending) return
  pending.internalHostNodeId = node.internalHostNodeId
  pending.internalResultKey = node.internalResultKey
  pending.internalPaymentInfoFrom = node.internalPaymentInfoFrom
}

const buildInternalActionChildNodes = (
  int: EngineInternals,
  hostNodeId: string,
  children: InternalActionChild[] | undefined,
  ownerPlayerId?: string,
): ActionNode[] =>
  (children ?? []).map((child) => {
    const node = new ActionNode(
      `internal-${hostNodeId}-${child.actionId}-${int.counterRef.value++}`,
      child.actionId,
      child.sourceCard,
      child.params,
      undefined,
      undefined,
      child.actionContext,
      undefined,
      hostNodeId,
      child.resultKey,
      child.paymentInfoFrom,
    )
    if (ownerPlayerId) node.ownerPlayerId = ownerPlayerId
    return node
  })

const buildDeferredHostNode = (
  int: EngineInternals,
  hostNode: ActionNode,
  result: ActionExecutionResult,
  actionId: string,
  executionContext: ActionExecutionContext,
  transactionEvents: readonly GameEvent[],
  actionEvents: readonly GameEvent[],
  choice?: string,
): ActionNode => {
  const node = new ActionNode(
    `internal-host-${hostNode.id}-${int.counterRef.value++}`,
    actionId,
    executionContext.sourceCard,
    executionContext.params,
    hostNode.choiceLabelKey,
    hostNode.choiceLabelParams,
    executionContext.actionContext,
  )
  node.ownerPlayerId = hostNode.ownerPlayerId
  node.mandatory = hostNode.mandatory
  node.internalHostNodeId = hostNode.id
  node.deferredHostResult = result
  node.deferredAfterHostCommitChildren =
    result.type === 'ok' ? result.internalChildren?.afterHostCommitListeners : undefined
  node.deferredAfterHostChildren =
    result.type === 'ok' ? result.internalChildren?.afterHostListeners : undefined
  node.deferredHostTransactionEvents = [...transactionEvents]
  node.deferredHostActionEvents = [...actionEvents]
  node.deferredHostChoice = choice
  node.deferredHostResultTargetNodeId = hostNode.internalHostNodeId
  node.deferredHostResultKey = hostNode.internalResultKey
  return node
}

const buildDeferredHostContinuationNode = (
  int: EngineInternals,
  sourceNode: ActionNode,
  result: ActionExecutionResult,
): ActionNode => {
  const node = new ActionNode(
    `internal-host-continuation-${sourceNode.id}-${int.counterRef.value++}`,
    sourceNode.actionId,
    sourceNode.sourceCard,
    sourceNode.params,
    sourceNode.choiceLabelKey,
    sourceNode.choiceLabelParams,
    sourceNode.actionContext,
  )
  node.ownerPlayerId = sourceNode.ownerPlayerId
  node.internalHostNodeId = sourceNode.internalHostNodeId
  node.deferredHostResult = result
  node.deferredAfterHostChildren = sourceNode.deferredAfterHostChildren
  node.deferredHostCommitCompleted = true
  node.deferredHostTransactionEvents = sourceNode.deferredHostTransactionEvents
  node.deferredHostActionEvents = sourceNode.deferredHostActionEvents
  node.deferredHostTriggerSnapshot = sourceNode.deferredHostTriggerSnapshot
  node.deferredHostChoice = sourceNode.deferredHostChoice
  node.deferredHostResultTargetNodeId = sourceNode.deferredHostResultTargetNodeId
  node.deferredHostResultKey = sourceNode.deferredHostResultKey
  return node
}

const pendingEnvelopeChoices = (envelope: PendingEnvelope): ActionChoiceOption[] => {
  if (envelope.choices) return envelope.choices
  if (envelope.request.kind === 'choice') return envelope.request.options
  if (envelope.request.kind === 'farm-select') return envelope.request.options ?? []
  if (envelope.request.kind === 'select-trigger') return envelope.request.options
  return []
}

const isInactiveOptionalHost = (node: EngineNode): boolean =>
  node.optional === true && node.optionalActive === false

const buildOptionalPrompt = (
  int: EngineInternals,
  context: EngineContext,
  node: EngineNode,
): EngineStepResult => {
  const actionNode = findActionNode(node)
  if (!actionNode) {
    resolveSubtree(node)
    return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
  }
  const action = int.registry.get(actionNode.actionId)
  if (!action) {
    resolveSubtree(node)
    return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
  }
  const actionContext = actionContextForNode(actionNode, int)
  const executionContext: ActionExecutionContext = {
    state: context.state,
    player: context.player,
    space: resolveExecutionSpace(context.state, context.space, actionContext),
    params: actionNode.params,
    sourceCard: actionNode.sourceCard,
    actionContext,
    emitPrivateEvent: context.emitPrivateEvent,
    reportProtectedObservation: context.reportProtectedObservation,
  }
  const doable = canStartNode(int, { ...executionContext, ...currentEventReadContext(int) }, node)
  if (!doable) {
    resolveSubtree(node)
    return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
  }
  const label = getChoiceLabel(node, int.registry) ?? {
    labelKey: actionNode.choiceLabelKey ?? action.nameKey,
    labelParams: actionNode.choiceLabelParams,
  }
  const optionalOptions: ActionChoiceOption[] = [
    {
      value: actionNode.id,
      labelKey: label.labelKey,
      labelParams: label.labelParams,
      sourceCard: actionNode.sourceCard,
      effectPreview: getNodeEffectPreview(node),
      descriptionPreview: getNodeDescriptionPreview(node, int.registry),
    },
    { value: '__skip__', labelKey: 'ui.interactionOptionalSkip' },
  ]
  const optionalPromptKey = node.optionalPromptKey ?? 'ui.interactionOptionalAction'
  const request: InteractionRequest = { kind: 'choice', options: optionalOptions }
  node.setPending({
    hostNodeId: node.id,
    request,
    choices: optionalOptions,
    promptKey: optionalPromptKey,
    promptParams: undefined,
    sourceCard: actionNode.sourceCard,
    ownerNodeId: null,
    contextSnapshot: {
      params: actionNode.params,
      costs: undefined,
      sourceCard: actionNode.sourceCard,
      actionContext: actionContextForNode(actionNode, int),
    },
    effectiveOwnerPlayerId: node.ownerPlayerId,
  })
  int.pendingNodeIdRef.value = node.id
  return {
    type: 'choice',
    nodeId: node.id,
    choice: {
      promptKey: optionalPromptKey,
      options: optionalOptions,
    },
  }
}

const executeActivateCardAction = (
  int: EngineInternals,
  context: EngineContext,
  node: ActivateCardActionNode,
): EngineStepResult => {
  const params = node.params
  const ownerPlayerId = params.ownerPlayerId ?? node.ownerPlayerId
  const triggerPlayerId = params.triggerPlayerId
  const listener = getListenerById(params.listenerId)
  if (!listener) {
    node.resolve({})
    return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
  }
  const triggerPlayer =
    (triggerPlayerId
      ? findPlayerById(context.state, triggerPlayerId)
      : null) ?? context.player
  const effectPlayer =
    (ownerPlayerId
      ? findPlayerById(context.state, ownerPlayerId)
      : null) ?? triggerPlayer
  const eventActionContext = params.event.actionContext && typeof params.event.actionContext === 'object'
    ? params.event.actionContext as Record<string, unknown>
    : undefined
  const actionContext = actionContextForNode(node, int) ?? eventActionContext
  const event: Record<string, unknown> = {
    ...params.event,
    triggerPlayerId,
    ownerPlayerId,
    ownerCardId: params.cardId,
    ownerCardZone: params.ownerCardZone,
    mandatory: params.mandatory,
  }
  if (params.countCardUse !== undefined) event.countCardUse = params.countCardUse
  const eventReadContext = eventReadContextForActivation(int, params)
  const listenerContext: CardListenerContext = {
    state: context.state,
    player: triggerPlayer,
    triggerPlayer,
    ownerPlayer: effectPlayer,
    effectPlayer,
    space: resolveExecutionSpace(context.state, context.space, actionContext),
    actionId: params.actionId,
    phase: params.phase,
    actionContext,
    ...eventReadContext,
    ...event,
    triggerSnapshot: params.triggerSnapshot,
  }
  const result = executeCardListener(listener, listenerContext, {
    ownerPlayerId,
    ownerCardId: params.cardId,
    ownerCardZone: params.ownerCardZone,
  })
  // Track per-card `used` stat: count a use only when the listener
  // actually returned an effect. Pure no-op fires and universal listeners
  // without a cardId are skipped.
  if (
    params.cardId &&
    result &&
    params.countCardUse !== false &&
    result.countCardUse !== false
  ) {
    incCardUsed(effectPlayer, params.cardId)
  }
  const normalizedFollowUps = (result?.followUpActions ?? []).map((followUp) =>
    normalizeFollowUpAction(followUp, result?.sourceCard),
  )
  if (result?.flow || normalizedFollowUps.length > 0) {
    const insertedNodes: EngineNode[] = []
    if (result?.flow) {
      const flow = applyDefaultSourceCardToFlow(result.flow, result.sourceCard)
      recordGrantedActionsFromFlow(int, flow, effectPlayer, context.state, flowSourceCard(flow) ?? result.sourceCard)
      insertedNodes.push(buildOwnedFlowNode(int, flow, effectPlayer.id))
    }
    insertedNodes.push(...buildFollowUpNodes(int, normalizedFollowUps, node.id, effectPlayer, context.state))
    const continuationParentHostNodeId = params.phase === 'before'
      ? params.beforeHostNodeId
      : node.continuationParentHostNodeId
    if (params.phase === 'before') {
      const host = params.beforeHostNodeId
        ? int.tree.findNodeById(params.beforeHostNodeId)
        : undefined
      const inherited = host instanceof ActionNode
        ? getSuppressedBeforeListenerIds(host.actionContext)
        : []
      insertedNodes.forEach((insertedNode) =>
        stampSuppressedBeforeListeners(insertedNode, [...inherited, params.listenerId]))
    }
    if (continuationParentHostNodeId) {
      insertedNodes.forEach((insertedNode) =>
        stampContinuationParentHost(insertedNode, continuationParentHostNodeId))
    }
    if (node.mandatory === true) {
      insertedNodes.forEach(enforceCompositeContinuationMandatory)
    }
    if (insertedNodes.length > 0) {
      int.tree.insertAfter(node.id, insertedNodes)
    }
  }
  node.resolve(result ?? {})
  return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
}

const executeDeferredHostAction = (
  int: EngineInternals,
  context: EngineContext,
  node: ActionNode,
): EngineStepResult => {
  let result = node.deferredHostResult
  if (!result) return { type: 'blocked', nodeId: node.id, actionId: node.actionId }
  const blockedResult = blockingBeforeHostChildResult(int, node)
  if (blockedResult) {
    if (node.mandatory) return { type: 'blocked', nodeId: node.id, actionId: node.actionId, mandatory: true }
    recordDeferredHostResult(int, node, blockedResult)
    node.resolve(blockedResult)
    commitIfEngineComplete(int, context, blockedResult)
    return { type: 'ok', nodeId: node.id, actionId: node.actionId, sourceCard: node.sourceCard, result: blockedResult }
  }
  const actionContext = actionContextForNode(node, int)
  const executionContext: ActionExecutionContext = {
    state: context.state,
    player: context.player,
    space: resolveExecutionSpace(context.state, context.space, actionContext),
    params: node.params,
    sourceCard: node.sourceCard,
    actionContext,
    emitPrivateEvent: context.emitPrivateEvent,
    reportProtectedObservation: context.reportProtectedObservation,
  }
  const action = int.registry.get(node.actionId)
  let completedEvents: GameEvent[] | undefined
  if (result.type === 'ok' && action?.completeInternalChildren && !node.deferredHostCommitCompleted) {
    const eventFrame = int.events.beginFrame({
      actorPlayerId: executionContext.player.id,
      sourceActionId: node.actionId,
      sourceCardId: executionContext.sourceCard,
    })
    const eventBuffer = createBufferedEventSink()
    result = action.completeInternalChildren(
      {
        ...executionContext,
        eventSink: eventBuffer.sink,
      },
      result,
      int.internalChildResults.get(node.internalHostNodeId ?? node.id) ?? {},
    )
    eventBuffer.flushTo(eventFrame.sink)
    ensureEventState(context.state)
    completedEvents = eventFrame.complete(context.state)
    recordEventLogDerivation(int, completedEvents, result)
    node.deferredHostTriggerSnapshot = createTriggerSnapshot(context.state)
  }
  if (result.type === 'ok' && !node.deferredHostCommitCompleted) {
    const afterHostCommitNodes = buildInternalActionChildNodes(
      int,
      node.internalHostNodeId ?? node.id,
      node.deferredAfterHostCommitChildren,
      executionContext.player.id,
    )
    if (afterHostCommitNodes.length > 0) {
      afterHostCommitNodes.forEach(enforceCompositeContinuationMandatory)
      const continuationNode = buildDeferredHostContinuationNode(int, node, result)
      node.resolve(result)
      int.tree.insertAfter(node.id, [...afterHostCommitNodes, continuationNode])
      return { type: 'ok', nodeId: node.id, actionId: node.actionId, sourceCard: executionContext.sourceCard, result }
    }
  }
  const eventReadContext = node.deferredHostTransactionEvents
    ? deferredHostEventReadContext(int, node)
    : completedEvents
      ? currentEventReadContext(int, completedEvents)
      : currentEventReadContext(int, node.deferredHostActionEvents)
  const triggerSnapshot =
    node.deferredHostTriggerSnapshot ?? createTriggerSnapshot(context.state)
  node.deferredHostTriggerSnapshot = triggerSnapshot
  const duringPhase = int.hooks.during(
    { ...executionContext, ...eventReadContext, actionId: node.actionId },
    result,
  )
  const immediatePhase = int.hooks.immediatelyAfter(
    { ...executionContext, ...eventReadContext, actionId: node.actionId },
    result,
    node.deferredHostChoice,
  )
  const afterPhase = int.hooks.after(
    { ...executionContext, ...eventReadContext, actionId: node.actionId },
    result,
    node.deferredHostChoice,
  )
  const allActionHookResults = [
    ...immediatePhase.actionHookResults,
    ...afterPhase.actionHookResults,
  ]
  const hookFlows = allActionHookResults
    .map((entry) => entry.flow
      ? applyDefaultSourceCardToFlow(entry.flow, entry.sourceCard)
      : null)
    .filter((flow) => flow)
    .map((flow) => buildOwnedFlowNode(int, flow as ActionFlow, context.player.id))
  const followUps = allActionHookResults
    .flatMap((entry) =>
      (entry.followUpActions ?? []).map((followUp) =>
        normalizeFollowUpAction(followUp, entry.sourceCard),
      ),
    )
    .filter((action) => action)
  const proceedBaseEvent = buildListenerEvent(executionContext, {
    result,
    choice: node.deferredHostChoice,
  })
  const trailingTransactionEvents = result.type === 'flow' ? undefined : eventReadContext.transactionEvents
  const trailingActionEvents = result.type === 'flow' ? undefined : eventReadContext.actionEvents
  const duringActivateNodes = buildActivationActionNodes(
    int,
    duringPhase.matchedListeners, 'during', node.actionId,
    {},
    executionContext.player.id,
    eventReadContext.transactionEvents,
    eventReadContext.actionEvents,
    triggerSnapshot,
  )
  const immediateActivateNodes = buildPhaseTrailingNodes(
    int,
    immediatePhase.matchedListeners,
    'immediatelyAfter',
    node.actionId,
    context.state,
    proceedBaseEvent,
    executionContext.player.id,
    trailingTransactionEvents,
    trailingActionEvents,
    undefined,
    triggerSnapshot,
  )
  const afterActivateNodes = buildPhaseTrailingNodes(
    int,
    afterPhase.matchedListeners,
    'after',
    node.actionId,
    context.state,
    proceedBaseEvent,
    executionContext.player.id,
    trailingTransactionEvents,
    trailingActionEvents,
    undefined,
    triggerSnapshot,
  )
  const afterHostNodes = buildInternalActionChildNodes(
    int,
    node.internalHostNodeId ?? node.id,
    node.deferredAfterHostChildren,
    executionContext.player.id,
  )
  const trailingHookNodes = [
    ...buildFollowUpNodes(int, followUps, node.id, context.player, context.state),
    ...immediateActivateNodes,
    ...afterActivateNodes,
    ...afterHostNodes,
  ]
  const leadingNodes = [
    ...duringActivateNodes,
    ...hookFlows,
  ]
  if (node.continuationParentHostNodeId) {
    [...leadingNodes, ...trailingHookNodes].forEach((insertedNode) =>
      stampContinuationParentHost(insertedNode, node.continuationParentHostNodeId!))
  }
  if (result.type === 'flow') {
    const flowNode = buildOwnedFlowNode(int, result.flow, context.player.id)
    if (node.continuationParentHostNodeId) {
      stampContinuationParentHost(flowNode, node.continuationParentHostNodeId)
    }
    if (trailingHookNodes.length > 0) {
      int.tree.insertAfter(node.id, trailingHookNodes)
    }
    int.tree.insertAfter(node.id, [flowNode])
    if (leadingNodes.length > 0) {
      int.tree.insertAfter(node.id, leadingNodes)
    }
  } else {
    const allInsertNodes = [...leadingNodes, ...trailingHookNodes]
    if (allInsertNodes.length > 0) {
      int.tree.insertAfter(node.id, allInsertNodes)
    }
  }
  recordDeferredHostResult(int, node, result)
  node.resolve(result)
  commitIfEngineComplete(int, context, result)
  return { type: 'ok', nodeId: node.id, actionId: node.actionId, sourceCard: executionContext.sourceCard, result }
}

/**
 * S4c PR5 — extracted from `Engine.proceed`. Drives one step of the engine
 * tree. Mutates `int.tree` / `int.pendingNodeIdRef`
 * via the boxed refs in `EngineInternals`.
 */
export function engineProceed(
  int: EngineInternals,
  context: EngineContext,
): EngineStepResult {
  ensureEventState(context.state)
  int.events.ensureTransaction()
  const node = int.tree.nextUnresolved()
  if (!node) {
    commitOpenEventTransaction(int, context, { type: 'ok' })
    return { type: 'done' }
  }
  if (node.getPending() !== null) {
    const envelope = pendingEnvelopeFromHostNode(node)
    if (!envelope) return { type: 'blocked', nodeId: node.id }
    commitOpenEventTransaction(int, context, { type: 'ok' })
    int.pendingNodeIdRef.value = node.id
    return {
      type: 'choice',
      nodeId: node.id,
      choice: {
        promptKey: envelope.promptKey,
        promptParams: envelope.promptParams,
        options: pendingEnvelopeChoices(envelope),
      },
    }
  }
  if (isInactiveOptionalHost(node) && !(node instanceof OrNode) && !(node instanceof XorNode)) {
    return buildOptionalPrompt(int, context, node)
  }
  if (node instanceof OrNode || node instanceof XorNode) {
    const availableActions = node.children
      .filter((child) => child.getState() !== 'resolved')
      .map((child) => ({
        nodeId: child.id,
        node: int.tree.findNodeById(child.id) ?? child,
        actionNode: findActionNode(child),
      }))
      .filter((entry) => entry.actionNode !== null) as {
      nodeId: string
      node: EngineNode
      actionNode: ActionNode
    }[]
    const options = availableActions
      .map((entry) => {
        const actionContext = actionContextForNode(entry.actionNode, int)
        const executionContext: ActionExecutionContext = {
          state: context.state,
          player: context.player,
          space: resolveExecutionSpace(context.state, context.space, actionContext),
          params: entry.actionNode.params,
          sourceCard: entry.actionNode.sourceCard,
          actionContext,
          emitPrivateEvent: context.emitPrivateEvent,
          reportProtectedObservation: context.reportProtectedObservation,
        }
        const action = int.registry.get(entry.actionNode.actionId)
        if (!action) return null
        const doable = canStartNode(int, { ...executionContext, ...currentEventReadContext(int) }, entry.node)
        if (!doable) return null
        const baseLabel = getChoiceLabel(entry.node, int.registry)
        if (!baseLabel) return null
        const label = getReplaceAwareChoiceLabel(
          entry.actionNode,
          { ...executionContext, ...currentEventReadContext(int) },
          baseLabel,
          action.nameKey,
          int.hooks,
          (flow, sc) => applyDefaultSourceCardToFlow(flow, sc),
        )
        return {
          value: entry.nodeId,
          labelKey: label.labelKey,
          labelParams: label.labelParams,
          sourceCard: label.sourceCard ?? getNodeSourceCard(entry.node),
          effectPreview: getNodeEffectPreview(entry.node),
          descriptionPreview: getNodeDescriptionPreview(entry.node, int.registry),
        }
      })
      .filter((option) => option !== null) as ActionChoiceOption[]
    if (
      node instanceof OrNode &&
      node.children.some((child) => child.getState() === 'resolved')
    ) {
      options.push({ value: '__done__', labelKey: 'ui.interactionFlowDone' })
    }
    const optionalHost = isInactiveOptionalHost(node)
    if (optionalHost && options.length > 0) {
      options.push({ value: '__skip__', labelKey: 'ui.interactionOptionalSkip' })
    }
    if (options.length === 0) {
      if (optionalHost) {
        resolveSubtree(node)
        return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
      }
      return { type: 'blocked', nodeId: node.id, mandatory: node.mandatory === true }
    }
    int.pendingNodeIdRef.value = node.id
    const compositeCtxSnapshot = {
      params: undefined,
      costs: undefined,
      sourceCard: resolveChoiceSourceCard(getNodeSourceCard(node), options),
      actionContext: undefined,
    }
    const compositePromptKey = optionalHost
      ? (node.optionalPromptKey ?? node.promptKey ?? 'ui.interactionFlowSelect')
      : (node.promptKey ?? 'ui.interactionFlowSelect')
    node.setPending({
      hostNodeId: node.id,
      request: { kind: 'choice', options },
      choices: options,
      promptKey: compositePromptKey,
      promptParams: undefined,
      sourceCard: compositeCtxSnapshot.sourceCard,
      pendingActionId: undefined,
      ownerNodeId: null,
      contextSnapshot: compositeCtxSnapshot,
      effectiveOwnerPlayerId: node.ownerPlayerId,
    })
    // Transitional cursor fields retained for older tests/snapshots; the
    // production pending surface is the envelope above.
    node.emittedChoices = options
    node.emittedPromptKey = compositePromptKey
    node.emittedPromptParams = undefined
    node.emittedRequest = undefined
    // Composite host owns pending context snapshot through its envelope.
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
  if (node instanceof ParallelNode && node.mode === 'trigger-select') {
    const ctx = {
      resolveSubtree: (n: EngineNode) => resolveSubtree(n),
      emitChoice: () => {},
    }
    const stepResult = node.step(ctx)
    if (stepResult.kind === 'done') {
      if (node.getState() !== 'resolved') node.resolve()
      return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
    }
    if (stepResult.kind === 'continue') {
      return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
    }
    if (stepResult.kind === 'request') {
      const evaluation = evaluateTriggerSelect(
        node,
        { ...context, ...currentEventReadContext(int) },
        triggerSelectEvaluationOptions(int, context),
      )
      const options = evaluation.options
      if (options.length === 0) {
        node.resolveRemainingTriggerChildrenForPass()
        return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
      }
      const promptKey = 'ui.interactionSelectTrigger' as import('../contract/prompt-keys').PromptKey
      const request: InteractionRequest = stepResult.request.kind === 'select-trigger'
        ? { ...stepResult.request, options }
        : stepResult.request
      const contextSnapshot = triggerSelectContextSnapshot(context)
      node.setPending({
        hostNodeId: node.id,
        request,
        choices: options,
        promptKey,
        promptParams: undefined,
        ownerNodeId: null,
        contextSnapshot,
        effectiveOwnerPlayerId: request.kind === 'select-trigger'
          ? request.ownerPlayerId || node.ownerPlayerId
          : node.ownerPlayerId,
      })
      node.emittedChoices = options
      node.emittedPromptKey = promptKey
      node.emittedPromptParams = undefined
      node.emittedRequest = request
      int.pendingNodeIdRef.value = node.id
      return {
        type: 'choice',
        nodeId: node.id,
        choice: {
          promptKey,
          options,
        },
      }
    }
    return { type: 'blocked', nodeId: node.id }
  }
  const leafCtx = {
    resolveSubtree: (n: EngineNode) => resolveSubtree(n),
    emitChoice: () => {},
  }
  const leafStep = node.step(leafCtx)
  if (leafStep.kind === 'execute' && node instanceof ActionNode) {
    if (isActivateCardActionNode(node)) {
      return executeActivateCardAction(int, context, node)
    }
    if (node.deferredHostResult) {
      return executeDeferredHostAction(int, context, node)
    }
    const actionContext = actionContextForNode(node, int)
    const replaceResult = int.hooks.applyComputeReplace({
      ...context,
      ...currentEventReadContext(int),
      space: resolveExecutionSpace(context.state, context.space, actionContext),
      params: node.params,
      sourceCard: node.sourceCard,
      actionContext,
      actionId: node.actionId,
    })
    const replacedActionId = replaceResult.actionId
    const replaceSourceCard = replaceResult.sourceCard ?? node.sourceCard
    if (replaceResult.alternatives.length > 0) {
      const flowNode = buildOwnedFlowNode(int,
        buildReplaceChoiceFlow(
          node,
          replaceResult.alternatives.map((alternative) => ({
            ...alternative,
            flow: applyDefaultSourceCardToFlow(alternative.flow, alternative.sourceCard),
          })),
          replacedActionId,
        ),
        context.player.id,
      )
      enforceCompositeContinuationMandatory(flowNode)
      int.tree.insertAfter(node.id, [flowNode])
      node.resolve({ type: 'ok' })
      return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
    }
    const action = int.registry.get(replacedActionId)
    if (!action) {
      return { type: 'blocked', nodeId: node.id }
    }
    const executionContext: ActionExecutionContext = {
      state: context.state,
      player: context.player,
      space: resolveExecutionSpace(context.state, context.space, actionContext),
      params: node.params,
      sourceCard: replaceSourceCard,
      actionContext,
      emitPrivateEvent: context.emitPrivateEvent,
      reportProtectedObservation: context.reportProtectedObservation,
    }
    const beforePhase = int.hooks.before({
      ...executionContext,
      ...currentEventReadContext(int),
      actionId: replacedActionId,
    })
    const beforeBaseEvent = buildListenerEvent(executionContext, {})
    const beforeActivateNodes = buildPhaseTrailingNodes(
      int,
      beforePhase.matchedListeners,
      'before',
      replacedActionId,
      context.state,
      beforeBaseEvent,
      executionContext.player.id,
    )
    if (beforeActivateNodes.length > 0 && !node.beforePhaseResolved) {
      node.beforePhaseResolved = true
      node.beforeAnytimeAvailable = true
      beforeActivateNodes.forEach((beforeNode) => stampBeforeHostNode(beforeNode, node.id))
      enforceCompositeContinuationMandatory(node)
      int.tree.insertBefore(node.id, beforeActivateNodes)
      return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
    }
    const doabilityEventReadContext = currentEventReadContext(int)
    const doable = int.hooks.applyIsDoable(
      { ...executionContext, ...doabilityEventReadContext, actionId: replacedActionId },
      action,
      action.canBeExecutedByPlayer(
        executionContext.state,
        executionContext.player,
        {
          params: executionContext.params,
          space: executionContext.space,
          sourceCard: executionContext.sourceCard,
          actionContext: executionContext.actionContext,
        },
      ),
    )
    if (!doable) {
      if (node.mandatory === true && action.isAlreadySatisfied?.({
        ...executionContext,
        transactionEvents: doabilityEventReadContext.transactionEvents,
      })) {
        const result = { type: 'ok' as const }
        recordInternalChildResult(int, node, result)
        node.resolve(result)
        commitIfEngineComplete(int, context, result)
        return {
          type: 'ok',
          nodeId: node.id,
          actionId: replacedActionId,
          sourceCard: executionContext.sourceCard,
          result,
        }
      }
      return node.mandatory === true
        ? {
            type: 'blocked',
            nodeId: node.id,
            actionId: replacedActionId,
            mandatory: true,
          }
        : { type: 'blocked', nodeId: node.id, actionId: replacedActionId }
    }
    const costResults = int.hooks.computeCosts({
      ...executionContext,
      ...currentEventReadContext(int),
      actionId: replacedActionId,
    })
    applyComputeCostResults(executionContext, costResults)
    const eventFrame = int.events.beginFrame({
      actorPlayerId: executionContext.player.id,
      sourceActionId: replacedActionId,
      sourceCardId: executionContext.sourceCard,
    })
    const eventBuffer = createBufferedEventSink()
    const optInChoice = maybeBuildChoiceCandidates(int,
      { ...executionContext, ...currentEventReadContext(int) },
      action,
      replacedActionId,
      eventBuffer.sink,
    )
    node.bodyStarted = true
    node.beforeAnytimeAvailable = false
    const rawResult = optInChoice ?? action.execute({
      ...executionContext,
      eventSink: eventBuffer.sink,
    })
    const result = withInjectedAnytimeResultFlag(rawResult, executionContext.actionContext)
    let completedEvents: GameEvent[] = []
    if (result.type === 'fail') {
      eventFrame.rollback()
    } else {
      if (result.type !== 'request') {
        emitCardTriggered(int, eventFrame.sink, executionContext, replacedActionId, {
          replacement: Boolean(replaceResult.sourceCard && replaceResult.sourceCard !== node.sourceCard),
        })
      }
      eventBuffer.flushTo(eventFrame.sink)
      ensureEventState(context.state)
      completedEvents = eventFrame.complete(context.state)
      recordEventLogDerivation(int, completedEvents, result)
    }
    if (result.type === 'fail') {
      if (node.mandatory) return { type: 'blocked', nodeId: node.id, actionId: replacedActionId, mandatory: true }
      int.events.rollbackTransaction()
      clearEventLogDerivations(int)
      recordInternalChildResult(int, node, result)
      node.resolve(result)
      return { type: 'ok', nodeId: node.id, actionId: replacedActionId, sourceCard: executionContext.sourceCard, result }
    }
    if (result.type === 'ok' && (
      result.internalChildren?.beforeHostListeners?.length ||
      result.internalChildren?.afterHostCommitListeners?.length
    )) {
      const beforeHostNodes = buildInternalActionChildNodes(
        int,
        node.id,
        result.internalChildren.beforeHostListeners,
        executionContext.player.id,
      )
      const deferredHostNode = buildDeferredHostNode(
        int,
        node,
        result,
        replacedActionId,
        executionContext,
        currentEventReadContext(int).transactionEvents,
        completedEvents,
      )
      node.resolve(result)
      int.tree.insertAfter(node.id, [...beforeHostNodes, deferredHostNode])
      return { type: 'ok', nodeId: node.id, actionId: replacedActionId, sourceCard: executionContext.sourceCard, result }
    }
    const eventReadContext = currentEventReadContext(int, completedEvents)
    const triggerSnapshot = result.type === 'ok'
      ? createTriggerSnapshot(context.state)
      : undefined
    const duringPhase = int.hooks.during(
      { ...executionContext, ...eventReadContext, actionId: replacedActionId },
      result,
    )
    if (result.type === 'request') {
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
          const argResults = int.hooks.computeArgs(
            { ...executionContext, ...currentEventReadContext(int), actionId: replacedActionId },
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
        // (shared/session/session-core.ts ~L2249). Reorg confirm therefore
        // must surface as a concrete option on the pending surface, while
        // cancel remains absent and is rejected before action resolution.
        //
        // Removing this shim requires teaching resolvePendingChoice to
        // bypass the options.find check for `request.kind === 'animal-reorg'`
        // (or to read the allowed values off the request directly). Task 7 deliberately did not modify
        // resolvePendingChoice (out of scope per task constraints), so
        // the shim stays. Task 9 or Task 10 (when buildInteraction is
        // rewritten and pending.options is removed) is the natural
        // place to delete it.
        //
        const confirm: ActionChoiceOption = {
          value: 'confirm',
          labelKey: 'ui.interactionAnimalReorgConfirm',
        }
        choiceOptions = [confirm]
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
        result.request.kind === 'heating' ||
        result.request.kind === 'selection' ||
        result.request.kind === 'card-draft' ||
        result.request.kind === 'select-trigger' ||
        result.request.kind === 'engine-blocked' ||
        result.request.kind === 'resource-quantity-select' ||
        result.request.kind === 'resource-batch-exchange-select'
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
      applyInteractionRequest(int, {
        targetNode: node,
        hostNodeId: node.id,
        request: updatedRequest,
        promptKey: result.promptKey,
        promptParams: result.promptParams,
        choiceOptions,
        actionId: replacedActionId,
        ownerNodeId: null,
        params: executionContext.params,
        costs: executionContext.costs,
        costTrades: executionContext.costTrades,
        costBonuses: executionContext.costBonuses,
        paymentResourceProviders: executionContext.paymentResourceProviders,
        costAttribution: executionContext.costAttribution,
        sourceCard: executionContext.sourceCard ?? result.sourceCard,
        actionContext: executionContext.actionContext,
        contextWritePatch,
      })
      copyInternalMetadataToPending(node)
      node.emittedRequest = updatedRequest
      return {
        type: 'choice',
        nodeId: int.pendingNodeIdRef.value ?? node.id,
        choice: {
          promptKey: result.promptKey,
          promptParams: result.promptParams,
          options: choiceOptions,
        },
      }
    }
    const duringActivateNodes = buildActivationActionNodes(int,
      duringPhase.matchedListeners, 'during', replacedActionId,
      {},
      executionContext.player.id,
      eventReadContext.transactionEvents,
      eventReadContext.actionEvents,
      triggerSnapshot,
    )
    const immediatePhase = int.hooks.immediatelyAfter(
      { ...executionContext, ...eventReadContext, actionId: replacedActionId },
      result,
    )
    const afterPhase = int.hooks.after(
      { ...executionContext, ...eventReadContext, actionId: replacedActionId },
      result,
      undefined,
    )
    const allActionHookResults = [
      ...immediatePhase.actionHookResults,
      ...afterPhase.actionHookResults,
    ]
    const hookFlows = allActionHookResults
      .map((entry) => entry.flow
        ? applyDefaultSourceCardToFlow(entry.flow, entry.sourceCard)
        : null)
      .filter((flow) => flow)
      .map((flow) => buildOwnedFlowNode(int, flow as ActionFlow, context.player.id))
    const followUps = allActionHookResults
      .flatMap((entry) =>
        (entry.followUpActions ?? []).map((followUp) =>
          normalizeFollowUpAction(followUp, entry.sourceCard),
        ),
      )
      .filter((action) => action)
    const proceedBaseEvent = buildListenerEvent(executionContext, { result })
    const trailingTransactionEvents = result.type === 'flow' ? undefined : eventReadContext.transactionEvents
    const trailingActionEvents = result.type === 'flow' ? undefined : eventReadContext.actionEvents
    const trailingActionEventStartIndex = result.type === 'flow'
      ? eventReadContext.transactionEvents.length - completedEvents.length
      : undefined
    const immediateActivateNodes = buildPhaseTrailingNodes(
      int,
      immediatePhase.matchedListeners,
      'immediatelyAfter',
      replacedActionId,
      context.state,
      proceedBaseEvent,
      executionContext.player.id,
      trailingTransactionEvents,
      trailingActionEvents,
      trailingActionEventStartIndex,
      triggerSnapshot,
    )
    const afterActivateNodes = buildPhaseTrailingNodes(
      int,
      afterPhase.matchedListeners,
      'after',
      replacedActionId,
      context.state,
      proceedBaseEvent,
      executionContext.player.id,
      trailingTransactionEvents,
      trailingActionEvents,
      trailingActionEventStartIndex,
      triggerSnapshot,
    )
    const afterHostNodes = result.type === 'ok'
      ? buildInternalActionChildNodes(
          int,
          node.id,
          result.internalChildren?.afterHostListeners,
          executionContext.player.id,
        )
      : []
    // 7b1: when the action returns a `flow`, the wrapper action's `after`
    // / `immediatelyAfter` listeners (and follow-ups) must observe the
    // post-flow state. We therefore insert flow body FIRST (last call wins via
    // insertAfter), and trailing hooks AFTER the flow.
    const trailingHookNodes = [
      ...buildFollowUpNodes(int, followUps, node.id, context.player, context.state),
      ...immediateActivateNodes,
      ...afterActivateNodes,
      ...afterHostNodes,
    ]
    const leadingNodes = [
      ...duringActivateNodes,
      ...hookFlows,
    ]
    if (node.continuationParentHostNodeId) {
      [...leadingNodes, ...trailingHookNodes].forEach((insertedNode) =>
        stampContinuationParentHost(insertedNode, node.continuationParentHostNodeId!))
    }
    if (result.type === 'flow') {
      const committedFlow = node.actionContext?.commitOnTriggerSelection === true
        ? { ...result.flow, optional: undefined }
        : result.flow
      const flowNode = buildOwnedFlowNode(int, committedFlow, context.player.id)
      if (node.mandatory === true) {
        enforceCompositeContinuationMandatory(flowNode)
      }
      if (node.continuationParentHostNodeId) {
        stampContinuationParentHost(flowNode, node.continuationParentHostNodeId)
      }
      // Insertion order: trailing hooks first (deepest behind), then flow
      // body, then leading nodes. insertAfter prepends each batch to
      // node.id+1, so the resulting child layout is:
      //   [..., node, leadingNodes..., flowNode, trailingHookNodes..., ...]
      if (trailingHookNodes.length > 0) {
        int.tree.insertAfter(node.id, trailingHookNodes)
      }
      int.tree.insertAfter(node.id, [flowNode])
      if (leadingNodes.length > 0) {
        int.tree.insertAfter(node.id, leadingNodes)
      }
    } else {
      const allInsertNodes = [...leadingNodes, ...trailingHookNodes]
      if (allInsertNodes.length > 0) {
        int.tree.insertAfter(node.id, allInsertNodes)
      }
    }
    recordInternalChildResult(int, node, result)
    node.resolve(result)
    commitIfEngineComplete(int, context, result)
    return { type: 'ok', nodeId: node.id, actionId: replacedActionId, sourceCard: executionContext.sourceCard, result }
  }
  return { type: 'blocked', nodeId: node.id }
}
