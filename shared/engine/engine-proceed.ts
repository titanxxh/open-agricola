import type {
  ActionExecutionContext,
  ActionFlow,
  PlayerState,
  ActionChoiceOption,
  ImmediateLogEntry,
  InteractionRequest,
  LogEntry,
} from '../contract/types'
import {
  ActionNode,
  InteractionNode,
  OptionalNode,
  OrNode,
  XorNode,
} from './nodes'
import { ParallelTriggerNode } from './nodes/parallel-trigger-node'
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
import {
  executeCardListener,
  getListenerById,
  shouldSkipImmediateListenerLog,
  type CardListenerContext,
} from '../cards/card-listeners'
import { incCardUsed } from '../cards/helpers/card-state'
import type { ReorganizeTrigger } from '../actions/effects/reorganize'
import type { EngineInternals } from './engine-internals'
import {
  applyFallbackSourceCardToFlow,
  applyInteractionRequest,
  buildActivationActionNodes,
  buildPhaseTrailingNodes,
  buildFollowUpNodes,
  buildListenerEvent,
  buildOwnedFlowNode,
  collectNodeIds,
  findActionNode,
  findInteractionNode,
  findPairedInteractionNode,
  getNodeDescriptionPreview,
  getNodeEffectPreview,
  maybeBuildChoiceCandidates,
  normalizeFollowUpAction,
  pendingEnvelopeFromHostNode,
  resolveSubtree,
} from './engine-utils'
import type { PendingEnvelope } from './types'
import { isActivateCardActionNode, type ActivateCardActionNode } from './activation-action'

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

const pendingEnvelopeChoices = (envelope: PendingEnvelope): ActionChoiceOption[] => {
  if (envelope.choices) return envelope.choices
  if (envelope.request.kind === 'choice') return envelope.request.options
  if (envelope.request.kind === 'farm-select') return envelope.request.options ?? []
  if (envelope.request.kind === 'select-trigger') return envelope.request.options
  return []
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
      ? context.state.players.find((player) => player.id === triggerPlayerId)
      : null) ?? context.player
  const effectPlayer =
    (ownerPlayerId
      ? context.state.players.find((player) => player.id === ownerPlayerId)
      : null) ?? triggerPlayer
  const event: Record<string, unknown> = {
    ...params.event,
    triggerPlayerId,
    ownerPlayerId,
    mandatory: params.mandatory,
  }
  if (params.countCardUse !== undefined) event.countCardUse = params.countCardUse
  const listenerContext: CardListenerContext = {
    state: context.state,
    player: triggerPlayer,
    triggerPlayer,
    ownerPlayer: effectPlayer,
    effectPlayer,
    space: context.space,
    actionId: params.actionId,
    phase: params.phase,
    ...event,
  }
  const result = executeCardListener(listener, listenerContext, {
    ownerPlayerId,
  })
  // Track BGA-style per-card `used` stat: count a use only when the listener
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
  collectImmediateLogs(effectPlayer.name, result, {
    includeLegacyLogKey: result ? !shouldSkipImmediateListenerLog(result) : true,
  }).forEach((entry) => {
    int.log.append(entry)
  })
  if (result?.flow || normalizedFollowUps.length > 0) {
    const insertedNodes: EngineNode[] = []
    if (result?.flow) {
      insertedNodes.push(buildOwnedFlowNode(int,
        applyFallbackSourceCardToFlow(result.flow, result.sourceCard),
        effectPlayer.id,
      ))
    }
    insertedNodes.push(...buildFollowUpNodes(int, normalizedFollowUps, node.id, effectPlayer))
    if (params.phase === 'before') {
      insertedNodes.forEach((insertedNode) =>
        collectNodeIds(insertedNode, int.beforePhaseFlowNodeIds),
      )
    }
    if (insertedNodes.length > 0) {
      int.tree.insertAfter(node.id, insertedNodes)
    }
  }
  node.resolve(result ?? {})
  return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
}

/**
 * S4c PR5 — extracted from `Engine.proceed`. Drives one step of the engine
 * tree. Mutates `int.tree` / `int.pendingNodeIdRef` / `int.beforePhaseFlowNodeIds`
 * via the boxed refs in `EngineInternals`.
 */
export function engineProceed(
  int: EngineInternals,
  context: EngineContext,
): EngineStepResult {
  const node = int.tree.nextUnresolved()
  if (!node) {
    return { type: 'done' }
  }
  if (node.getPending() !== null) {
    const envelope = pendingEnvelopeFromHostNode(node)
    if (!envelope) return { type: 'blocked', nodeId: node.id }
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
        const executionContext: ActionExecutionContext = {
          state: context.state,
          player: context.player,
          space: context.space,
          params: entry.actionNode.params,
          sourceCard: entry.actionNode.sourceCard,
          actionContext: entry.actionNode.actionContext,
        }
        const action = int.registry.get(entry.actionNode.actionId)
        if (!action) return null
        const doable = int.hooks.applyIsDoable(
          { ...executionContext, actionId: entry.actionNode.actionId },
          action,
          action.canBeExecutedByPlayer(
            executionContext.state,
            executionContext.player,
            { sourceCard: executionContext.sourceCard },
          ),
        )
        if (!doable) return null
        const baseLabel = getChoiceLabel(entry.node, int.registry)
        if (!baseLabel) return null
        const label = getReplaceAwareChoiceLabel(
          entry.actionNode,
          executionContext,
          baseLabel,
          int.hooks,
          (flow, sc) => applyFallbackSourceCardToFlow(flow, sc),
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
    const parent = int.tree.findParent(node.id)
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
    int.pendingNodeIdRef.value = node.id
    const compositeCtxSnapshot = {
      params: undefined,
      costs: undefined,
      sourceCard: resolveChoiceSourceCard(getNodeSourceCard(node), options),
      actionContext: undefined,
    }
    const compositePromptKey = node.promptKey ?? 'ui.interactionFlowSelect'
    // S2 Task 8: write emit metadata to the OrNode/XorNode itself.
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
  if (node instanceof ParallelTriggerNode) {
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
      const options = node.buildSelectOptions()
      const promptKey = 'ui.interactionSelectTrigger' as import('../contract/prompt-keys').PromptKey
      node.emittedChoices = options
      node.emittedPromptKey = promptKey
      node.emittedPromptParams = undefined
      node.emittedRequest = stepResult.request
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
    const action = int.registry.get(actionNode.actionId)
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
    const doable = int.hooks.applyIsDoable(
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
    int.pendingNodeIdRef.value = node.id
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
    const label = getChoiceLabel(node, int.registry) ?? {
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
        descriptionPreview: getNodeDescriptionPreview(node.child, int.registry),
      },
      { value: '__skip__', labelKey: 'ui.interactionOptionalSkip' },
    ]
    // S2 Task 8: write emit metadata to the OptionalNode itself.
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
      int.pendingNodeIdRef.value = node.id
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
  const leafCtx = {
    resolveSubtree: (n: EngineNode) => resolveSubtree(n),
    emitChoice: () => {},
  }
  const leafStep = node.step(leafCtx)
  if (leafStep.kind === 'execute' && node instanceof ActionNode) {
    if (isActivateCardActionNode(node)) {
      return executeActivateCardAction(int, context, node)
    }
    const replaceResult = int.hooks.applyComputeReplace({
      ...context,
      params: node.params,
      sourceCard: node.sourceCard,
      actionContext: node.actionContext,
      actionId: node.actionId,
    })
    const replacedActionId = replaceResult.actionId
    const replaceSourceCard = replaceResult.sourceCard ?? node.sourceCard
    if (replaceResult.declined && replaceResult.alternativeFlow) {
      const flowNode = buildOwnedFlowNode(int,
        buildReplaceChoiceFlow(
          node,
          applyFallbackSourceCardToFlow(
            replaceResult.alternativeFlow,
            replaceResult.sourceCard,
          ),
          replacedActionId,
        ),
        context.player.id,
      )
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
      space: context.space,
      params: node.params,
      sourceCard: replaceSourceCard,
      actionContext: node.actionContext,
    }
    const doable = int.hooks.applyIsDoable(
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
    const costResults = int.hooks.computeCosts({
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
    if (!int.beforePhaseFlowNodeIds.has(node.id)) {
      const beforePhase = int.hooks.before({ ...executionContext, actionId: replacedActionId })
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
        int.tree.insertBefore(node.id, beforeActivateNodes)
        return { type: 'ok', nodeId: node.id, result: { type: 'ok' } }
      }
    }
    const optInChoice = maybeBuildChoiceCandidates(int,
      executionContext,
      action,
      replacedActionId,
    )
    const result = optInChoice ?? action.execute(executionContext)
    const duringPhase = int.hooks.during({ ...executionContext, actionId: replacedActionId }, result)
    const duringActivateNodes = buildActivationActionNodes(int,
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
          const argResults = int.hooks.computeArgs(
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
        result.request.kind === 'card-draft' ||
        result.request.kind === 'select-trigger'
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
      const choiceNode = findPairedInteractionNode(int, node) ?? findInteractionNode(int.tree.root)
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
      // S7 Batch 1: when no InteractionNode is paired with this ActionNode
      // (no resolveChoice on the ActionDef → buildFlowNode emitted a bare
      // ActionNode), `applyInteractionRequest` only sets
      // `pendingNodeIdRef = node.id` and the request payload would otherwise
      // be lost. Mirror the request onto the ActionNode itself so
      // `peekInteractionHost()` callers (e.g. session-core's choice-step
      // animal-reorg pivot) can read the kind regardless of host node type.
      if (!choiceNode && node instanceof ActionNode) {
        node.emittedRequest = updatedRequest
      }
      if (duringActivateNodes.length > 0) {
        int.tree.insertAfter(node.id, [...duringActivateNodes])
      }
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
    findPairedInteractionNode(int, node)?.setState('resolved')
    if (result.type === 'ok' || result.type === 'flow') {
      collectImmediateLogs(context.player.name, result).forEach((entry) => {
        int.log.append(entry)
      })
    }
    const immediatePhase = int.hooks.immediatelyAfter(
      { ...executionContext, actionId: replacedActionId },
      result,
    )
    if (
      (result.type === 'ok' && !result.logKey && (result.immediateLogs?.length ?? 0) === 0)
      || (result.type === 'flow' && (result.immediateLogs?.length ?? 0) === 0)
      || (result.type !== 'ok' && result.type !== 'flow')
    ) {
      int.log.append({
        key: 'log.action',
        params: { actionId: replacedActionId },
      })
    }
    const afterPhase = int.hooks.after(
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
        int.log.append(entry)
      })
    const hookFlows = allActionHookResults
      .map((entry) => entry.flow
        ? applyFallbackSourceCardToFlow(entry.flow, entry.sourceCard)
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
    const immediateActivateNodes = buildPhaseTrailingNodes(
      int,
      immediatePhase.matchedListeners,
      'immediatelyAfter',
      replacedActionId,
      context.state,
      proceedBaseEvent,
      executionContext.player.id,
    )
    const afterActivateNodes = buildPhaseTrailingNodes(
      int,
      afterPhase.matchedListeners,
      'after',
      replacedActionId,
      context.state,
      proceedBaseEvent,
      executionContext.player.id,
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
      const flowNode = buildOwnedFlowNode(int, result.flow, context.player.id)
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
    node.resolve(result)
    return { type: 'ok', nodeId: node.id, actionId: replacedActionId, result }
  }
  return { type: 'blocked', nodeId: node.id }
}
