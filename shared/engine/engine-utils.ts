import type {
  ActionDefinition,
  ChoiceEffectPreview,
  ActionExecutionContext,
  ActionExecutionResult,
  ActionFlow,
  PlayerState,
  ActionChoiceOption,
  InteractionRequest,
  Resource,
} from '../contract/types'
import type { PromptKey } from '../contract/prompt-keys'
import type { FollowUpAction, ActionHookPhase, ActionHookResult } from '../actions/hooks'
import {
  ActionNode,
  ActivateCardNode,
  InteractionNode,
  OptionalNode,
  OrNode,
  ParallelNode,
  PlayerSwitchNode,
  SequenceNode,
  XorNode,
} from './nodes'
import { attachChoiceLabel } from './nodes/interaction-helpers'
import type { EngineNode } from './types'
import type { EngineInternals } from './engine-internals'
import { analyzeFlowInteractivity } from './flow-interactivity'
import { getPlayOrderIndex } from './matched-trigger'
import { ParallelTriggerNode } from './nodes/parallel-trigger-node'
import { executeCardListener, type MatchedCardListener, type CardListenerContext } from '../cards/card-listeners'
import type { GameState } from '../contract/types'

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

export function applyFallbackSourceCardToFlow(
  flow: ActionFlow,
  sourceCard?: string,
): ActionFlow {
  if (!sourceCard) return flow
  if (flow.type === 'leaf') {
    return flow.sourceCard ? flow : { ...flow, sourceCard }
  }
  if (flow.type === 'playerSwitch') return flow
  return {
    ...flow,
    children: flow.children.map((child) => applyFallbackSourceCardToFlow(child, sourceCard)),
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
): EngineNode[] {
  return followUps
    .filter((followUp) => followUp)
    .map((followUp, index) => {
      const { actionId, sourceCard } = parseFollowUpAction(followUp)
      if (sourceCard) {
        int.log.append({
          key: 'log.cardGrantedAction',
          params: {
            player: player.name,
            actionId,
            cardId: sourceCard,
          },
        })
      }
      return new ActionNode(`chain-${baseId}-${index}`, actionId, sourceCard)
    })
}

export function findActionNode(node: EngineNode): ActionNode | null {
  if (node instanceof ActionNode) return node
  if (node instanceof OptionalNode) {
    return findActionNode(node.child)
  }
  if ('children' in node) {
    const composite = node as { children: EngineNode[] }
    for (const child of composite.children) {
      const found = findActionNode(child)
      if (found) return found
    }
  }
  return null
}

export function findPairedInteractionNode(
  int: EngineInternals,
  node: ActionNode,
): InteractionNode | null {
  const parent = int.tree.findParent(node.id)
  if (!(parent instanceof SequenceNode)) return null
  const index = parent.children.findIndex((child) => child.id === node.id)
  if (index === -1) return null
  const candidate = parent.children[index + 1]
  return candidate instanceof InteractionNode ? candidate : null
}

export function buildActivateCardNodes(
  int: EngineInternals,
  matched: { registration: { id: string; cardIds?: string[] }; cardId: string; ownerPlayerId: string }[],
  phase: string,
  actionId: string,
  event: Record<string, unknown> = {},
): EngineNode[] {
  return matched.map((entry, index) => {
    const nodeId = `activate-${phase}-${actionId}-${index}-${int.counterRef.value++}`
    return new ActivateCardNode(
      nodeId,
      entry.registration.id,
      entry.cardId,
      phase as import('../actions/hooks').ActionHookPhase,
      actionId,
      { ...event, ownerPlayerId: entry.ownerPlayerId },
    )
  })
}

export function buildPhaseTrailingNodes(
  int: EngineInternals,
  matchedListeners: MatchedCardListener[],
  phase: ActionHookPhase,
  actionId: string,
  state: GameState,
  baseEvent: Record<string, unknown>,
  buildListenerContext: (ml: MatchedCardListener) => CardListenerContext,
): EngineNode[] {
  if (matchedListeners.length === 0) return []

  type Peeked = {
    ml: MatchedCardListener
    result: ActionHookResult | undefined
    interactivity: 'auto' | 'interactive'
    playOrderIndex: number
  }

  const peeked: Peeked[] = matchedListeners.map((ml) => {
    const listenerCtx = buildListenerContext(ml)
    const result = executeCardListener(ml.registration, listenerCtx, { ownerPlayerId: ml.ownerPlayerId })
    const interactivity = result?.flow ? analyzeFlowInteractivity(result.flow) : 'auto'
    const owner = state.players.find((p) => p.id === ml.ownerPlayerId)
    const playOrderIndex = owner ? getPlayOrderIndex(owner, ml.cardId) : Number.MAX_SAFE_INTEGER
    return { ml, result, interactivity, playOrderIndex }
  })

  const byOwner = new Map<string, Peeked[]>()
  for (const p of peeked) {
    const arr = byOwner.get(p.ml.ownerPlayerId) ?? []
    arr.push(p)
    byOwner.set(p.ml.ownerPlayerId, arr)
  }

  const activeId = state.players[state.currentPlayerIndex]?.id
  const orderedOwners: string[] = []
  if (activeId && byOwner.has(activeId)) orderedOwners.push(activeId)
  for (const p of state.players) {
    if (p.id !== activeId && byOwner.has(p.id)) orderedOwners.push(p.id)
  }

  const out: EngineNode[] = []
  for (const ownerId of orderedOwners) {
    const group = (byOwner.get(ownerId) ?? []).slice().sort((a, b) => a.playOrderIndex - b.playOrderIndex)

    const buildNode = (p: Peeked) => {
      const nodeId = `activate-${phase}-${actionId}-${int.counterRef.value++}`
      return new ActivateCardNode(
        nodeId,
        p.ml.registration.id,
        p.ml.cardId,
        phase,
        actionId,
        { ...baseEvent, ownerPlayerId: p.ml.ownerPlayerId },
        p.result,
      )
    }

    const mandatory = group.filter((p) => p.ml.registration.mandatory)
    const optional = group.filter((p) => !p.ml.registration.mandatory)
    for (const p of mandatory) out.push(buildNode(p))

    const optAuto = optional.filter((p) => p.interactivity === 'auto')
    for (const p of optAuto) out.push(buildNode(p))

    const optInteractive = optional.filter((p) => p.interactivity === 'interactive')
    if (optInteractive.length > 0) {
      const children = optInteractive.map(buildNode)
      const ptn = new ParallelTriggerNode(
        `parallel-trigger-${phase}-${actionId}-${ownerId}-${int.counterRef.value++}`,
        children,
        ownerId,
      )
      out.push(ptn)
    }
  }
  return out
}

export function collectNodeIds(node: EngineNode, ids: Set<string>): void {
  ids.add(node.id)
  const children = (node as { children?: EngineNode[] }).children
  if (children) {
    for (const child of children) collectNodeIds(child, ids)
  }
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
    return clone
  }
  if (node instanceof InteractionNode) {
    const clone = new InteractionNode(
      `${node.id}-clone-${int.counterRef.value++}`,
      [...node.choices],
    )
    if (node.promptKey) {
      clone.setChoice(node.promptKey, [...node.choices])
    }
    return clone
  }
  if (node instanceof SequenceNode) {
    return new SequenceNode(
      `${node.id}-clone-${int.counterRef.value++}`,
      node.children.map((child) => cloneNode(int, child)),
    )
  }
  if (node instanceof ParallelNode) {
    return new ParallelNode(
      `${node.id}-clone-${int.counterRef.value++}`,
      node.children.map((child) => cloneNode(int, child)),
    )
  }
  if (node instanceof OrNode) {
    return new OrNode(
      `${node.id}-clone-${int.counterRef.value++}`,
      node.children.map((child) => cloneNode(int, child)),
      node.promptKey,
    )
  }
  if (node instanceof XorNode) {
    return new XorNode(
      `${node.id}-clone-${int.counterRef.value++}`,
      node.children.map((child) => cloneNode(int, child)),
      node.promptKey,
    )
  }
  if (node instanceof OptionalNode) {
    const clone = new OptionalNode(
      `${node.id}-clone-${int.counterRef.value++}`,
      cloneNode(int, node.child),
      node.promptKey,
    )
    clone.active = node.active
    return clone
  }
  if (node instanceof ActivateCardNode) {
    return new ActivateCardNode(
      `${node.id}-clone-${int.counterRef.value++}`,
      node.listenerId,
      node.cardId,
      node.phase,
      node.actionId,
      node.event,
      node.preComputedResult,
    )
  }
  if (node instanceof PlayerSwitchNode) {
    return new PlayerSwitchNode(
      `${node.id}-clone-${int.counterRef.value++}`,
      node.targetPlayerId,
    )
  }
  return node
}

export function resolveSubtree(node: EngineNode): void {
  if (node instanceof OptionalNode) {
    resolveSubtree(node.child)
    node.resolve()
    return
  }
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
  if (node instanceof ActionNode || node instanceof InteractionNode) {
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
  if (node instanceof InteractionNode) return []
  if (node instanceof OptionalNode) {
    return collectOrderedActionNodes(node.child)
  }
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
  if (node instanceof OptionalNode) {
    return getNodeEffectPreview(node.child)
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

export function buildFlowNode(int: EngineInternals, flow: ActionFlow): EngineNode {
  const nextId = () => `flow-${int.counterRef.value++}`
  if (flow.type === 'playerSwitch') {
    return new PlayerSwitchNode(`ps-flow-${int.counterRef.value++}`, flow.targetPlayerId)
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
        return buildFlowNode(int, inner)
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
      const sequence = new SequenceNode(nextId(), [
        actionNode,
        new InteractionNode(nextId(), []),
      ])
      const node = flow.optional
        ? new OptionalNode(nextId(), sequence, flow.promptKey)
        : sequence
      return attachChoiceLabel(node, flow.choiceLabelKey, flow.choiceLabelParams)
    }
    const node = flow.optional
      ? new OptionalNode(nextId(), actionNode, flow.promptKey)
      : actionNode
    return attachChoiceLabel(node, flow.choiceLabelKey, flow.choiceLabelParams)
  }
  const children = flow.children.map((child) => buildFlowNode(int, child))
  if (flow.type === 'seq') {
    const sequence = new SequenceNode(nextId(), children)
    const node = flow.optional
      ? new OptionalNode(nextId(), sequence, flow.promptKey)
      : sequence
    return attachChoiceLabel(node, flow.choiceLabelKey, flow.choiceLabelParams)
  }
  if (flow.type === 'parallel') {
    const parallel = new ParallelNode(nextId(), children)
    const node = flow.optional
      ? new OptionalNode(nextId(), parallel, flow.promptKey)
      : parallel
    return attachChoiceLabel(node, flow.choiceLabelKey, flow.choiceLabelParams)
  }
  if (flow.type === 'xor') {
    const xor = new XorNode(nextId(), children, flow.promptKey)
    const node = flow.optional ? new OptionalNode(nextId(), xor, flow.promptKey) : xor
    return attachChoiceLabel(node, flow.choiceLabelKey, flow.choiceLabelParams)
  }
  const or = new OrNode(nextId(), children, flow.promptKey)
  const node = flow.optional ? new OptionalNode(nextId(), or, flow.promptKey) : or
  return attachChoiceLabel(node, flow.choiceLabelKey, flow.choiceLabelParams)
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
  if (flow.type === 'playerSwitch') {
    return { ...flow }
  }
  return {
    ...flow,
    children: flow.children.map((c) =>
      mergeContextIntoFlow(c, outerContext, outerSourceCard),
    ),
  }
}

export function findInteractionNode(node: EngineNode): InteractionNode | null {
  if (node instanceof InteractionNode) return node
  if (node instanceof OptionalNode) {
    return findInteractionNode(node.child)
  }
  if ('children' in node) {
    const composite = node as { children: EngineNode[] }
    for (const child of composite.children) {
      const found = findInteractionNode(child)
      if (found) return found
    }
  }
  return null
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
    return { type: 'fail', logKey: action.noChoiceLogKey ?? 'log.action' }
  }
  if (affordable.length === 1 && action.resolveChoice) {
    const value = affordable[0]!.value
    executionContext.params = {
      ...(executionContext.params ?? {}),
      selectedOption: value,
    }
    return action.resolveChoice(executionContext, value, undefined)
  }
  return {
    type: 'request',
    request: { kind: 'choice', options: affordable },
    promptKey: action.choicePromptKey,
  }
}

export function buildChoiceExecutionContext(
  context: { state: ActionExecutionContext['state']; player: ActionExecutionContext['player']; space: ActionExecutionContext['space'] },
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
  }
}

/**
 * Apply an InteractionRequest emitted by an action.execute / resolveChoice
 * call to the engine's pending-interaction state. Centralises the three
 * mirror branches (top-level execute, XorNode follow-up execute,
 * resolveChoice second-pass) so that every interaction request goes
 * through the same setChoice + pending-interaction wiring path.
 *
 * Caller is responsible for:
 *   - locating the right InteractionNode (paired with an ActionNode, child
 *     of the XorNode, or pending node from tree lookup) — pass it as
 *     `targetNode` (null when no node exists; pendingNodeId falls back to
 *     `fallbackNodeId`).
 *   - building the final `choiceOptions` (e.g. animal-reorg confirm/cancel
 *     shim, computeArgs extraOptions merge).
 *   - any prior shallow-merge of actionContextWrite from extraData.
 */
export function applyInteractionRequest(
  int: EngineInternals,
  args: {
    targetNode: InteractionNode | null
    fallbackNodeId: string | null
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
    /** When true, leave the InteractionNode's existing `ownerNodeId` untouched
     *  (used by the resolveChoice second-pass that wants to preserve the
     *  existing owner pointer). Forwarded to `InteractionNode.emit()`. */
    preserveOwner?: boolean
  },
): void {
  const { targetNode, fallbackNodeId, request, promptKey, promptParams, choiceOptions, actionId, ownerNodeId } = args
  if (targetNode) {
    // S4b Task 12 — delegate the heavy lift (setChoice + request + node
    // pending fields + context snapshot) to InteractionNode.emit().
    targetNode.emit({
      request,
      promptKey,
      promptParams,
      choiceOptions,
      actionId,
      ownerNodeId,
      params: args.params,
      costs: args.costs,
      sourceCard: args.sourceCard,
      actionContext: args.actionContext,
      contextWritePatch: args.contextWritePatch,
      preserveOwner: args.preserveOwner,
    })
    int.pendingNodeIdRef.value = targetNode.id
  } else {
    // No-targetNode path: pending context (params/costs/sourceCard/actionContext)
    // will be installed when the eventual InteractionNode emits — engine carries
    // no fallback snapshot post-PR2 (the deleted `pendingInteractionContext` mirror
    // used to live here).
    int.pendingNodeIdRef.value = fallbackNodeId
  }
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
