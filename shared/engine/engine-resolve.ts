import type {
  ActionExecutionContext,
  ActionExecutionResult,
  ActionFlow,
  PlayerState,
  ActionChoiceOption,
  ImmediateLogEntry,
  InteractionRequest,
  LogEntry,
} from '../contract/types'
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
} from './pending-validation'
import {
  applyFallbackSourceCardToFlow,
  applyInteractionRequest,
  buildPhaseTrailingNodes,
  buildChoiceExecutionContext,
  buildOwnedFlowNode,
  buildFollowUpNodes,
  buildListenerEvent,
  cloneNode,
  findActionNode,
  normalizeFollowUpAction,
  pendingEnvelopeFromHostNode,
  resolveSubtree,
} from './engine-utils'

type EngineContext = {
  state: ActionExecutionContext['state']
  player: ActionExecutionContext['player']
  space: ActionExecutionContext['space']
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
  if (int.pendingNodeIdRef.value) {
    const node = int.tree.findNodeById(int.pendingNodeIdRef.value)
    const explicitPending = node?.getPending()
    if (node && explicitPending) {
      const envelope = pendingEnvelopeFromHostNode(node)
      if (envelope && !isPendingChoiceValueAllowed(envelope, choice)) {
        return { type: 'fail', logKey: 'log.buildRoomFail' }
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
        }
        return { type: 'ok' }
      }
      if (node instanceof ParallelNode && node.mode === 'trigger-select') {
        node.clearPending()
        const offered = node.buildSelectOptions()
        if (!offered.some((opt) => opt.value === choice)) {
          int.pendingNodeIdRef.value = null
          return { type: 'fail', logKey: 'log.buildRoomFail' }
        }
        if (choice === '__pass__') {
          if (!node.passAll()) {
            int.pendingNodeIdRef.value = null
            return { type: 'fail', logKey: 'log.buildRoomFail' }
          }
          int.pendingNodeIdRef.value = null
          return { type: 'ok' }
        }
        const child = node.chooseCard(choice)
        if (!child) {
          int.pendingNodeIdRef.value = null
          return { type: 'fail', logKey: 'log.buildRoomFail' }
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
      // Validate against currently-offered options (e.g. PASS only appears
      // when every unresolved trigger is mandatory: false). Rejecting an
      // unlisted choice keeps mandatory triggers un-skippable.
      const offered = node.buildSelectOptions()
      if (!offered.some((opt) => opt.value === choice)) {
        return { type: 'fail', logKey: 'log.buildRoomFail' }
      }
      if (choice === '__pass__') {
        if (!node.passAll()) {
          int.pendingNodeIdRef.value = null
          return { type: 'fail', logKey: 'log.buildRoomFail' }
        }
        int.pendingNodeIdRef.value = null
        return { type: 'ok' }
      }
      const child = node.chooseCard(choice)
      if (!child) {
        int.pendingNodeIdRef.value = null
        return { type: 'fail', logKey: 'log.buildRoomFail' }
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
        actionContext: child.actionContext,
      }
      const replaceResult = int.hooks.applyComputeReplace({
        ...executionContext,
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
          ),
          context.player.id,
        )
        int.tree.insertAfter(node.id, [flowNode])
        targetNode!.resolve(choice)
        node.resolve(choice)
        int.pendingNodeIdRef.value = null
        return { type: 'ok' }
      }
      const action = int.registry.get(actionId)
      if (!action) {
        int.pendingNodeIdRef.value = null
        return { type: 'fail', logKey: 'log.buildRoomFail' }
      }
      const costResults = int.hooks.computeCosts({
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
      const skipBefore = int.beforePhaseFlowNodeIds.has(child.id)
      const beforePhase = skipBefore ? { matchedListeners: [] } : int.hooks.before({ ...executionContext, actionId })
      const beforeBaseEvent = buildListenerEvent(executionContext, {})
      const beforeActivateNodes = buildPhaseTrailingNodes(
        int,
        beforePhase.matchedListeners,
        'before',
        actionId,
        context.state,
        beforeBaseEvent,
        executionContext.player.id,
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
      const result = action.execute(executionContext)
      int.hooks.during({ ...executionContext, actionId }, result)
      if (result.type === 'request' && (result.request.kind === 'choice' || result.request.kind === 'farm-select')) {
        // S2 Task 6: also accept farm-select kind emitted from an Or/Xor
        // child leaf. The computeArgs merging path only applies to 'choice'
        // kind (extraOptions hook); farm-select carries its own structured
        // payload + optional `options` (confirm/cancel).
        const argResults = result.request.kind === 'choice'
          ? int.hooks.computeArgs({ ...executionContext, actionId }, result)
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
        return extraOptions.length > 0
          ? { ...result, request: updatedRequest }
          : result
      }
      if (result.type === 'ok' || result.type === 'flow') {
        collectImmediateLogs(context.player.name, result).forEach((entry) => {
          int.log.append(entry)
        })
      }
      const immediatePhase = int.hooks.immediatelyAfter(
        { ...executionContext, actionId, choice },
        result,
        choice,
      )
      const afterPhase = int.hooks.after(
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
          int.log.append(entry)
        })

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
      const immediateActivateNodes = buildPhaseTrailingNodes(
        int,
        immediatePhase.matchedListeners,
        'immediatelyAfter',
        actionId,
        context.state,
        baseEvent,
        executionContext.player.id,
      )
      const afterActivateNodes = buildPhaseTrailingNodes(
        int,
        afterPhase.matchedListeners,
        'after',
        actionId,
        context.state,
        baseEvent,
        executionContext.player.id,
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
      child.resolve(result)
      if (node instanceof XorNode) {
        node.resolve(choice)
      }
      int.pendingNodeIdRef.value = null
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
  pendingHost?.clearPending()
  let result: ActionExecutionResult
  if (action.resolveChoice) {
    result = action.resolveChoice(executionContext, choice, payload)
  } else {
    return { type: 'ok' }
  }
  int.hooks.during({ ...executionContext, actionId }, result)
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
    return result
  }
  if (result.type === 'ok' || result.type === 'flow') {
    collectImmediateLogs(context.player.name, result).forEach((entry) => {
      int.log.append(entry)
    })
  }
  const insertionTargetId = pendingEnvelope?.ownerNodeId ?? pendingHost?.id ?? int.pendingNodeIdRef.value
  const immediatePhase = int.hooks.immediatelyAfter({ ...executionContext, actionId, choice }, result, choice)
  const afterPhase = int.hooks.after({ ...executionContext, actionId, choice }, result, choice)

  const allResults = [
    ...immediatePhase.actionHookResults,
    ...afterPhase.actionHookResults,
  ]
  allResults
    .flatMap((entry) => collectImmediateLogs(context.player.name, entry))
    .forEach((entry) => {
      int.log.append(entry)
    })

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
  const immediateActivateNodes = buildPhaseTrailingNodes(
    int,
    immediatePhase.matchedListeners,
    'immediatelyAfter',
    actionId,
    context.state,
    baseEvent2,
    executionContext.player.id,
  )
  const afterActivateNodes = buildPhaseTrailingNodes(
    int,
    afterPhase.matchedListeners,
    'after',
    actionId,
    context.state,
    baseEvent2,
    executionContext.player.id,
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
  return result
}
