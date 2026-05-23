import type {
  ActionExecutionContext,
  ActionExecutionResult,
  ActionFlow,
  InternalActionChild,
  PlayerState,
  ActionChoiceOption,
  InteractionRequest,
  Resource,
} from '../contract/types'
import type { InteractionContextSnapshot } from './types'
import {
  ActionNode,
  OrNode,
  ParallelNode,
  XorNode,
} from './nodes'
import { buildReplaceChoiceFlow } from './nodes/interaction-helpers'
import type { EngineInternals } from './engine-internals'
import {
  isPendingChoiceValueAllowed,
  pendingEnvelopeChoices,
} from './pending-validation'
import { evaluateTriggerSelect, type TriggerSelectEvaluationOptions } from './trigger-select'
import {
  applyFallbackSourceCardToFlow,
  applyInteractionRequest,
  buildPhaseTrailingNodes,
  buildChoiceExecutionContext,
  buildOwnedFlowNode,
  buildFollowUpNodes,
  buildListenerEvent,
  canActionContinueWithoutBeforeTriggers,
  cloneNode,
  enforceCompositeContinuationMandatory,
  enforceSelectedTargetMandatory,
  findActionNode,
  normalizeFollowUpAction,
  pendingEnvelopeFromHostNode,
  resolveSubtree,
} from './engine-utils'
import { withInjectedAnytimeResultFlag } from './action-context-flags'
import { eventsToLogEntries } from '../events/log-mapper'
import type { GameEvent } from '../contract/events'
import { createEventQuery } from '../events/query'
import { createBufferedEventSink, emitCardTriggered } from './card-trigger-events'

type EngineContext = {
  state: ActionExecutionContext['state']
  player: ActionExecutionContext['player']
  space: ActionExecutionContext['space']
  emitPrivateEvent?: ActionExecutionContext['emitPrivateEvent']
}

const hasLegacyLogSurface = (result: ActionExecutionResult): boolean => {
  if (result.type === 'fail') return true
  return false
}

const appendDerivedLogsForEventOnlyResult = (
  int: EngineInternals,
  context: EngineContext,
  committed: readonly GameEvent[],
  result: ActionExecutionResult,
): void => {
  if (committed.length === 0 || hasLegacyLogSurface(result)) return
  const playerNames = Object.fromEntries(
    context.state.players.map((player) => [player.id, player.name]),
  )
  const actionNames = Object.fromEntries([
    ...context.state.actionSpaces.map((space) => [space.id, space.nameKey] as const),
    ...[...int.registry.values()].map((action) => [action.id, action.nameKey] as const),
  ])
  const entries = eventsToLogEntries(committed, { playerNames, actionNames })
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

const commitIfEngineComplete = (
  int: EngineInternals,
  context: EngineContext,
  result: ActionExecutionResult,
): void => {
  if (int.pendingNodeIdRef.value !== null) return
  if (int.tree.nextUnresolved()) return
  ensureEventState(context.state)
  const committed = int.events.commitTransaction(context.state)
  appendDerivedLogsForEventOnlyResult(int, context, committed, result)
  clearEventLogDerivations(int)
}

const rollbackAndReturn = (
  int: EngineInternals,
  result: ActionExecutionResult & { type: 'fail' },
): ActionExecutionResult => {
  int.events.rollbackTransaction()
  clearEventLogDerivations(int)
  return result
}

const triggerSelectEvaluationOptions = (
  int: EngineInternals,
  context: ActionExecutionContext,
): TriggerSelectEvaluationOptions => ({
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

const copyInternalMetadataToPending = (
  node: ActionNode,
  source?: {
    internalHostNodeId?: string
    internalResultKey?: string
    internalPaymentInfoFrom?: string
  },
): void => {
  const pending = node.getPending()
  if (!pending) return
  pending.internalHostNodeId = source?.internalHostNodeId ?? node.internalHostNodeId
  pending.internalResultKey = source?.internalResultKey ?? node.internalResultKey
  pending.internalPaymentInfoFrom = source?.internalPaymentInfoFrom ?? node.internalPaymentInfoFrom
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
  node.internalHostNodeId = hostNode.id
  node.deferredHostResult = result
  node.deferredAfterHostChildren =
    result.type === 'ok' ? result.internalChildren?.afterHostListeners : undefined
  node.deferredHostTransactionEvents = [...transactionEvents]
  node.deferredHostActionEvents = [...actionEvents]
  return node
}

/**
 * S4c PR5 — extracted from `Engine.resolveChoice`. Resolve a pending choice
 * against the engine tree. Threading the optional `payload` lets
 * `ActionDef.resolveChoice` receive client-supplied submission data
 * (e.g. fence edges, plow tile).
 */
export function engineResolveChoice(
  int: EngineInternals,
  choice: string,
  context: EngineContext,
  payload?: Record<string, unknown>,
): ActionExecutionResult {
  ensureEventState(context.state)
  int.events.ensureTransaction()
  if (int.pendingNodeIdRef.value) {
    const node = int.tree.findNodeById(int.pendingNodeIdRef.value)
    const explicitPending = node?.getPending()
    if (node && explicitPending) {
      const envelope = pendingEnvelopeFromHostNode(node)
      if (envelope && !isPendingChoiceValueAllowed(envelope, choice)) {
        return rollbackAndReturn(int, { type: 'fail', errorKey: 'log.buildRoomFail' })
      }
      if (
        node.optional === true &&
        node.optionalActive === false &&
        !(node instanceof OrNode) &&
        !(node instanceof XorNode)
      ) {
        node.clearPending()
        int.pendingNodeIdRef.value = null
        if (choice === '__skip__') {
          resolveSubtree(node)
        } else {
          node.optionalActive = true
          enforceSelectedTargetMandatory(node)
        }
        return { type: 'ok' }
      }
      if (node instanceof ParallelNode && node.mode === 'trigger-select') {
        node.clearPending()
        const offered = evaluateTriggerSelect(
          node,
          { ...context, ...currentEventReadContext(int) },
          triggerSelectEvaluationOptions(int, context),
        ).options
        if (offered.length === 0) {
          node.resolve()
          int.pendingNodeIdRef.value = null
          return { type: 'ok' }
        }
        const selected = offered.find((opt) => opt.value === choice)
        if (!selected || selected.disabled) {
          int.pendingNodeIdRef.value = null
          return rollbackAndReturn(int, { type: 'fail', errorKey: 'log.buildRoomFail' })
        }
        if (choice === '__pass__') {
          node.resolveRemainingTriggerChildrenForPass()
          int.pendingNodeIdRef.value = null
          return { type: 'ok' }
        }
        const child = node.chooseCard(choice)
        if (!child) {
          int.pendingNodeIdRef.value = null
          return rollbackAndReturn(int, { type: 'fail', errorKey: 'log.buildRoomFail' })
        }
        int.pendingNodeIdRef.value = null
        return { type: 'ok' }
      }
      if (node instanceof OrNode || node instanceof XorNode) {
        node.clearPending()
      } else if (!(node instanceof ActionNode)) {
        node.clearPending()
        int.pendingNodeIdRef.value = null
        return { type: 'ok' }
      }
    }
    if (node instanceof ParallelNode && node.mode === 'trigger-select') {
      const offered = evaluateTriggerSelect(
        node,
        { ...context, ...currentEventReadContext(int) },
        triggerSelectEvaluationOptions(int, context),
      ).options
      if (offered.length === 0) {
        node.resolve()
        int.pendingNodeIdRef.value = null
        return { type: 'ok' }
      }
      const selected = offered.find((opt) => opt.value === choice)
      if (!selected || selected.disabled) {
        return rollbackAndReturn(int, { type: 'fail', errorKey: 'log.buildRoomFail' })
      }
      if (choice === '__pass__') {
        node.resolveRemainingTriggerChildrenForPass()
        int.pendingNodeIdRef.value = null
        return { type: 'ok' }
      }
      const child = node.chooseCard(choice)
      if (!child) {
        int.pendingNodeIdRef.value = null
        return rollbackAndReturn(int, { type: 'fail', errorKey: 'log.buildRoomFail' })
      }
      int.pendingNodeIdRef.value = null
      return { type: 'ok' }
    }
    if (node instanceof OrNode || node instanceof XorNode) {
      if (choice === '__done__' && node instanceof OrNode) {
        node.resolve(choice)
        int.pendingNodeIdRef.value = null
        return { type: 'ok' }
      }
      if (choice === '__skip__') {
        if (node.optional === true && node.optionalActive === false) {
          resolveSubtree(node)
          int.pendingNodeIdRef.value = null
          return { type: 'ok' }
        }
      }
      if (node.optional === true && node.optionalActive === false) {
        node.optionalActive = true
      }
      const targetNode = node.children.find((item) => item.id === choice)
      const child = targetNode ? findActionNode(targetNode) : null
      if (!child) {
        int.pendingNodeIdRef.value = null
        return { type: 'ok' }
      }
      const executionContext: ActionExecutionContext = {
        state: context.state,
        player: context.player,
        space: context.space,
        params: child.params,
        sourceCard: child.sourceCard,
        actionContext: actionContextForNode(child, int),
        emitPrivateEvent: context.emitPrivateEvent,
      }
      const replaceResult = int.hooks.applyComputeReplace({
        ...executionContext,
        ...currentEventReadContext(int),
        actionId: child.actionId,
      })
      const actionId = replaceResult.actionId
      executionContext.sourceCard = replaceResult.sourceCard ?? child.sourceCard
      if (replaceResult.declined && replaceResult.alternativeFlow) {
        const flowNode = buildOwnedFlowNode(int,
          buildReplaceChoiceFlow(
            child,
            applyFallbackSourceCardToFlow(
              replaceResult.alternativeFlow,
              replaceResult.sourceCard,
            ),
            actionId,
            replaceResult.replacementListenerIds,
          ),
          context.player.id,
        )
        enforceCompositeContinuationMandatory(flowNode)
        int.tree.insertAfter(node.id, [flowNode])
        targetNode!.resolve(choice)
        node.resolve(choice)
        int.pendingNodeIdRef.value = null
        return { type: 'ok' }
      }
      enforceSelectedTargetMandatory(targetNode!)
      const action = int.registry.get(actionId)
      if (!action) {
        int.pendingNodeIdRef.value = null
        return rollbackAndReturn(int, { type: 'fail', errorKey: 'log.buildRoomFail' })
      }
      const skipBefore = int.beforePhaseFlowNodeIds.has(child.id)
      const beforeEventReadContext = currentEventReadContext(int)
      const beforePhase = skipBefore
        ? { matchedListeners: [] }
        : int.hooks.before({ ...executionContext, ...beforeEventReadContext, actionId })
      const beforeBaseEvent = buildListenerEvent(executionContext, {})
      const beforeActivateNodes = buildPhaseTrailingNodes(
        int,
        beforePhase.matchedListeners,
        'before',
        actionId,
        context.state,
        beforeBaseEvent,
        executionContext.player.id,
        beforeEventReadContext.transactionEvents,
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
        int.tree.insertBefore(node.id, [...beforeActivateNodes, deferredTarget])
        int.pendingNodeIdRef.value = null
        return { type: 'ok' }
      }
      const doable = int.hooks.applyIsDoable(
        { ...executionContext, ...currentEventReadContext(int), actionId },
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
        int.pendingNodeIdRef.value = null
        return rollbackAndReturn(int, { type: 'fail', errorKey: 'log.buildRoomFail' })
      }
      const costResults = int.hooks.computeCosts({
        ...executionContext,
        ...currentEventReadContext(int),
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
      const eventFrame = int.events.beginFrame({
        actorPlayerId: executionContext.player.id,
        sourceActionId: actionId,
        sourceCardId: executionContext.sourceCard,
      })
      const eventBuffer = createBufferedEventSink()
      let completedEvents: GameEvent[] = []
      const result = action.execute({
        ...executionContext,
        eventSink: eventBuffer.sink,
      })
      if (result.type === 'fail') {
        eventFrame.rollback()
        return rollbackAndReturn(int, result)
      }
      if (result.type !== 'request') {
        emitCardTriggered(int, eventFrame.sink, executionContext, actionId, {
          replacement: Boolean(replaceResult.sourceCard && replaceResult.sourceCard !== child.sourceCard),
        })
      }
      eventBuffer.flushTo(eventFrame.sink)
      ensureEventState(context.state)
      completedEvents = eventFrame.complete(context.state)
      recordEventLogDerivation(int, completedEvents, result)
      if (result.type === 'ok' && result.internalChildren?.beforeHostListeners?.length) {
        const beforeHostNodes = buildInternalActionChildNodes(
          int,
          child.id,
          result.internalChildren.beforeHostListeners,
          executionContext.player.id,
        )
        const deferredHostNode = buildDeferredHostNode(
          int,
          child,
          result,
          actionId,
          executionContext,
          currentEventReadContext(int).transactionEvents,
          completedEvents,
        )
        const insertAnchor = node instanceof XorNode ? node.id : child.id
        child.resolve(result)
        if (node instanceof XorNode) {
          node.resolve(choice)
        }
        recordInternalChildResult(int, child, result)
        int.pendingNodeIdRef.value = null
        int.tree.insertAfter(insertAnchor, [...beforeHostNodes, deferredHostNode])
        return { type: 'ok' }
      }
      int.hooks.during({ ...executionContext, ...currentEventReadContext(int, completedEvents), actionId }, result)
      if (result.type === 'request' && (result.request.kind === 'choice' || result.request.kind === 'farm-select')) {
        // S2 Task 6: also accept farm-select kind emitted from an Or/Xor
        // child leaf. The computeArgs merging path only applies to 'choice'
        // kind (extraOptions hook); farm-select carries its own structured
        // payload + optional `options` (confirm/cancel).
        const argResults = result.request.kind === 'choice'
          ? int.hooks.computeArgs(
              { ...executionContext, ...currentEventReadContext(int), actionId },
              result,
            )
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
        applyInteractionRequest(int, {
          targetNode: child,
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
        copyInternalMetadataToPending(child)
        return extraOptions.length > 0
          ? { ...result, request: updatedRequest }
          : result
      }
      const eventReadContext = currentEventReadContext(int, completedEvents)
      const immediatePhase = int.hooks.immediatelyAfter(
        { ...executionContext, ...eventReadContext, actionId, choice },
        result,
        choice,
      )
      const afterPhase = int.hooks.after(
        { ...executionContext, ...eventReadContext, actionId, choice },
        result,
        choice,
      )

      const allResults = [
        ...immediatePhase.actionHookResults,
        ...afterPhase.actionHookResults,
      ]

      const hookFlows = allResults
        .map((entry) => entry.flow
          ? applyFallbackSourceCardToFlow(entry.flow, entry.sourceCard)
          : null)
        .filter((flow) => flow)
        .map((flow) => buildOwnedFlowNode(int, flow as ActionFlow, context.player.id))
      const followUps = allResults
        .flatMap((entry) =>
          (entry.followUpActions ?? []).map((followUp) =>
            normalizeFollowUpAction(followUp, entry.sourceCard),
          ),
        )
        .filter((action) => action)
      const baseEvent = buildListenerEvent(executionContext, { result, choice })
      const trailingTransactionEvents = result.type === 'flow' ? undefined : eventReadContext.transactionEvents
      const trailingActionEvents = result.type === 'flow' ? undefined : eventReadContext.actionEvents
      const trailingActionEventStartIndex = result.type === 'flow'
        ? eventReadContext.transactionEvents.length - completedEvents.length
        : undefined
      const immediateActivateNodes = buildPhaseTrailingNodes(
        int,
        immediatePhase.matchedListeners,
        'immediatelyAfter',
        actionId,
        context.state,
        baseEvent,
        executionContext.player.id,
        trailingTransactionEvents,
        trailingActionEvents,
        trailingActionEventStartIndex,
      )
      const afterActivateNodes = buildPhaseTrailingNodes(
        int,
        afterPhase.matchedListeners,
        'after',
        actionId,
        context.state,
        baseEvent,
        executionContext.player.id,
        trailingTransactionEvents,
        trailingActionEvents,
        trailingActionEventStartIndex,
      )
      const afterHostNodes = result.type === 'ok'
        ? buildInternalActionChildNodes(
            int,
            child.id,
            result.internalChildren?.afterHostListeners,
            executionContext.player.id,
          )
        : []
      // 7b1: insert flow body BEFORE trailing hook nodes so wrapper-style
      // actions (renovate-house, occupation, improvement-any) emit their
      // `after` listeners on the post-mutate state. See top-level path
      // (resolveActionStep) for the same ordering rationale.
      const insertAnchor = node instanceof XorNode ? node.id : child.id
      const trailingHookNodes = [
        ...buildFollowUpNodes(int, followUps, child.id, context.player, context.state),
        ...immediateActivateNodes,
        ...afterActivateNodes,
        ...afterHostNodes,
      ]
      if (result.type === 'flow') {
        const flowNode = buildOwnedFlowNode(int, result.flow, context.player.id)
        if (trailingHookNodes.length > 0) {
          int.tree.insertAfter(insertAnchor, trailingHookNodes)
        }
        int.tree.insertAfter(insertAnchor, [flowNode])
        if (hookFlows.length > 0) {
          int.tree.insertAfter(insertAnchor, hookFlows)
        }
      } else {
        const allInsertNodes = [...hookFlows, ...trailingHookNodes]
        if (allInsertNodes.length > 0) {
          int.tree.insertAfter(insertAnchor, allInsertNodes)
        }
      }
      recordInternalChildResult(int, child, result)
      child.resolve(result)
      if (node instanceof XorNode) {
        node.resolve(choice)
      }
      int.pendingNodeIdRef.value = null
      commitIfEngineComplete(int, context, result)
      return result
    }
  }
  const pendingHost = int.pendingNodeIdRef.value
    ? int.tree.findNodeById(int.pendingNodeIdRef.value)
    : null
  const pendingEnvelope = pendingEnvelopeFromHostNode(pendingHost)
  const actionId = pendingEnvelope?.pendingActionId
    ?? (pendingHost instanceof ActionNode ? pendingHost.actionId : null)
  if (!actionId) {
    return { type: 'ok' }
  }
  const action = int.registry.get(actionId)
  if (!action) {
    return { type: 'ok' }
  }
  const executionContext = buildChoiceExecutionContext(
    context,
    pendingEnvelope?.contextSnapshot as Parameters<typeof buildChoiceExecutionContext>[1],
  )
  executionContext.params = {
    ...(executionContext.params ?? {}),
    selectedOption: choice,
  }
  const pendingActionNode = pendingHost instanceof ActionNode ? pendingHost : null
  if (pendingActionNode?.beforePhaseResolved === true) {
    executionContext.actionContext = {
      ...(executionContext.actionContext ?? {}),
      skipBeforeTriggers: true,
    }
  }
  const skipBefore = pendingActionNode?.beforePhaseResolved === true
  const beforeEventReadContext = currentEventReadContext(int)
  const beforePhase = skipBefore
    ? { matchedListeners: [] }
    : int.hooks.before({ ...executionContext, ...beforeEventReadContext, actionId })
  const beforeBaseEvent = buildListenerEvent(executionContext, {})
  const beforeActivateNodes = buildPhaseTrailingNodes(
    int,
    beforePhase.matchedListeners,
    'before',
    actionId,
    context.state,
    beforeBaseEvent,
    executionContext.player.id,
    beforeEventReadContext.transactionEvents,
  )
  if (beforeActivateNodes.length > 0 && pendingActionNode && !pendingActionNode.beforePhaseResolved) {
    pendingActionNode.beforePhaseResolved = true
    int.tree.insertBefore(pendingActionNode.id, beforeActivateNodes)
    return { type: 'ok' }
  }
  const doable = int.hooks.applyIsDoable(
    { ...executionContext, ...currentEventReadContext(int), actionId },
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
    return rollbackAndReturn(int, { type: 'fail', errorKey: 'log.buildRoomFail' })
  }
  const costResults = int.hooks.computeCosts({
    ...executionContext,
    ...currentEventReadContext(int),
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
  pendingHost?.clearPending()
  let result: ActionExecutionResult
  let eventFrame: ReturnType<EngineInternals['events']['beginFrame']> | null = null
  let completedEvents: GameEvent[] = []
  if (action.resolveChoice) {
    eventFrame = int.events.beginFrame({
      actorPlayerId: executionContext.player.id,
      sourceActionId: actionId,
      sourceCardId: executionContext.sourceCard,
    })
    const eventBuffer = createBufferedEventSink()
    result = withInjectedAnytimeResultFlag(
      action.resolveChoice({
        ...executionContext,
        eventSink: eventBuffer.sink,
      }, choice, payload),
      executionContext.actionContext,
    )
    if (result.type !== 'fail' && result.type !== 'request') {
      emitCardTriggered(int, eventFrame.sink, executionContext, actionId)
    }
    if (result.type !== 'fail') {
      eventBuffer.flushTo(eventFrame.sink)
    }
  } else {
    return { type: 'ok' }
  }
  if (result.type === 'fail') {
    eventFrame.rollback()
  } else {
    ensureEventState(context.state)
    completedEvents = eventFrame.complete(context.state)
    recordEventLogDerivation(int, completedEvents, result)
  }
  if (
    result.type === 'ok' &&
    result.internalChildren?.beforeHostListeners?.length &&
    pendingHost instanceof ActionNode
  ) {
    const beforeHostNodes = buildInternalActionChildNodes(
      int,
      pendingHost.id,
      result.internalChildren.beforeHostListeners,
      executionContext.player.id,
    )
    const deferredHostNode = buildDeferredHostNode(
      int,
      pendingHost,
      result,
      actionId,
      executionContext,
      currentEventReadContext(int).transactionEvents,
      completedEvents,
    )
    const insertAnchor = pendingEnvelope?.ownerNodeId ?? pendingHost.id
    pendingHost.resolve(result)
    if (pendingEnvelope?.ownerNodeId) {
      const ownerNode = int.tree.findNodeById(pendingEnvelope.ownerNodeId)
      if (ownerNode instanceof XorNode) ownerNode.resolve()
    }
    recordInternalResult(
      int,
      pendingEnvelope?.internalHostNodeId ?? pendingHost.internalHostNodeId,
      pendingEnvelope?.internalResultKey ?? pendingHost.internalResultKey,
      result,
    )
    int.pendingNodeIdRef.value = null
    int.tree.insertAfter(insertAnchor, [...beforeHostNodes, deferredHostNode])
    return result
  }
  int.hooks.during({ ...executionContext, ...currentEventReadContext(int, completedEvents), actionId }, result)
  if (result.type === 'fail' && result.recoverable === true && pendingHost && pendingEnvelope) {
    const contextSnapshot = pendingEnvelope.contextSnapshot as InteractionContextSnapshot | undefined
    applyInteractionRequest(int, {
      targetNode: pendingHost,
      fallbackNodeId: pendingEnvelope.hostNodeId,
      request: pendingEnvelope.request,
      promptKey: pendingEnvelope.promptKey,
      promptParams: pendingEnvelope.promptParams,
      choiceOptions: pendingEnvelopeChoices(pendingEnvelope),
      actionId,
      ownerNodeId: pendingEnvelope.ownerNodeId ?? null,
      preserveOwner: true,
      params: contextSnapshot?.params,
      costs: contextSnapshot?.costs,
      sourceCard: pendingEnvelope.sourceCard ?? contextSnapshot?.sourceCard,
      actionContext: contextSnapshot?.actionContext,
    })
    if (pendingHost instanceof ActionNode) copyInternalMetadataToPending(pendingHost, pendingEnvelope)
    return result
  }
  if (result.type === 'fail') {
    return rollbackAndReturn(int, result)
  }
  if (result.type === 'request' && result.request.kind === 'choice') {
    // Merge ActionDef-declared actionContext patches into the pending context.
    // Used by farm ActionDefs to persist payload (e.g. fence geometry) across
    // payment-combo second prompts.
    const contextWritePatch =
      result.extraData && typeof result.extraData === 'object'
        ? (result.extraData.actionContextWrite as Record<string, unknown> | undefined)
        : undefined
    const requestOptions = result.request.options
    applyInteractionRequest(int, {
      targetNode: pendingHost,
      fallbackNodeId: pendingHost?.id ?? null,
      request: result.request,
      promptKey: result.promptKey,
      promptParams: result.promptParams,
      choiceOptions: requestOptions,
      actionId,
      ownerNodeId: pendingEnvelope?.ownerNodeId ?? null,
      preserveOwner: true,
      params: executionContext.params,
      costs: executionContext.costs,
      sourceCard: executionContext.sourceCard,
      actionContext: executionContext.actionContext,
      contextWritePatch,
    })
    if (pendingHost instanceof ActionNode) copyInternalMetadataToPending(pendingHost, pendingEnvelope ?? undefined)
    return result
  }
  const insertionTargetId = pendingEnvelope?.ownerNodeId ?? pendingHost?.id ?? int.pendingNodeIdRef.value
  const eventReadContext = currentEventReadContext(int, completedEvents)
  const immediatePhase = int.hooks.immediatelyAfter(
    { ...executionContext, ...eventReadContext, actionId, choice },
    result,
    choice,
  )
  const afterPhase = int.hooks.after(
    { ...executionContext, ...eventReadContext, actionId, choice },
    result,
    choice,
  )

  const allResults = [
    ...immediatePhase.actionHookResults,
    ...afterPhase.actionHookResults,
  ]

  const hookFlows = allResults
    .map((entry) => entry.flow
      ? applyFallbackSourceCardToFlow(entry.flow, entry.sourceCard)
      : null)
    .filter((flow) => flow)
    .map((flow) => buildOwnedFlowNode(int, flow as ActionFlow, context.player.id))
  const followUps = allResults
    .flatMap((entry) =>
      (entry.followUpActions ?? []).map((followUp) =>
        normalizeFollowUpAction(followUp, entry.sourceCard),
      ),
    )
    .filter((action) => action)
  const baseEvent2 = buildListenerEvent(executionContext, { result, choice })
  const trailingTransactionEvents = result.type === 'flow' ? undefined : eventReadContext.transactionEvents
  const trailingActionEvents = result.type === 'flow' ? undefined : eventReadContext.actionEvents
  const trailingActionEventStartIndex = result.type === 'flow'
    ? eventReadContext.transactionEvents.length - completedEvents.length
    : undefined
  const immediateActivateNodes = buildPhaseTrailingNodes(
    int,
    immediatePhase.matchedListeners,
    'immediatelyAfter',
    actionId,
    context.state,
    baseEvent2,
    executionContext.player.id,
    trailingTransactionEvents,
    trailingActionEvents,
    trailingActionEventStartIndex,
  )
  const afterActivateNodes = buildPhaseTrailingNodes(
    int,
    afterPhase.matchedListeners,
    'after',
    actionId,
    context.state,
    baseEvent2,
    executionContext.player.id,
    trailingTransactionEvents,
    trailingActionEvents,
    trailingActionEventStartIndex,
  )
  const afterHostNodes =
    result.type === 'ok' && pendingHost instanceof ActionNode
      ? buildInternalActionChildNodes(
          int,
          pendingHost.id,
          result.internalChildren?.afterHostListeners,
          executionContext.player.id,
        )
      : []
  // 7b1: insert flow body BEFORE the trailing hook nodes (followUps,
  // immediatelyAfter / after activate) so wrapper actions returning a
  // flow (renovate-house seq, occupation seq, improvement-any seq) emit
  // their `after` listener events on the post-mutate state. Insertion
  // order via insertAfter prepends each batch to insertionTargetId+1, so
  // the resulting layout is:
  //   [..., insertionTarget, hookFlows..., flowNode, trailingHooks..., ...]
  if (insertionTargetId) {
    const trailingHookNodes = [
      ...buildFollowUpNodes(int, followUps, insertionTargetId, context.player, context.state),
      ...immediateActivateNodes,
      ...afterActivateNodes,
      ...afterHostNodes,
    ]
    if (result.type === 'flow') {
      const flowNode = buildOwnedFlowNode(int, result.flow, context.player.id)
      if (trailingHookNodes.length > 0) {
        int.tree.insertAfter(insertionTargetId, trailingHookNodes)
      }
      int.tree.insertAfter(insertionTargetId, [flowNode])
      if (hookFlows.length > 0) {
        int.tree.insertAfter(insertionTargetId, hookFlows)
      }
    } else {
      const allInsertNodes = [...hookFlows, ...trailingHookNodes]
      if (allInsertNodes.length > 0) {
        int.tree.insertAfter(insertionTargetId, allInsertNodes)
      }
    }
  }
  if (pendingHost instanceof ActionNode) {
    recordInternalResult(
      int,
      pendingEnvelope?.internalHostNodeId ?? pendingHost.internalHostNodeId,
      pendingEnvelope?.internalResultKey ?? pendingHost.internalResultKey,
      result,
    )
    pendingHost.resolve(result)
  }
  const ownerNodeIdToResolve = pendingEnvelope?.ownerNodeId ?? null
  if (ownerNodeIdToResolve) {
    const ownerNode = int.tree.findNodeById(ownerNodeIdToResolve)
    if (ownerNode instanceof XorNode) {
      ownerNode.resolve()
    }
  }
  int.pendingNodeIdRef.value = null
  commitIfEngineComplete(int, context, result)
  return result
}
